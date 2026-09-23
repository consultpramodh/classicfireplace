#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const cp = require('child_process');

const manifestPath = process.argv[2];
if (!manifestPath) throw new Error('Usage: node tools/task-mapping-autopatch.js <release-manifest.json>');

const repoRoot = process.cwd();
const manifest = JSON.parse(fs.readFileSync(path.resolve(repoRoot, manifestPath), 'utf8'));
const scriptId = String(manifest.scriptId || '').trim();
const sourceDir = path.resolve(repoRoot, manifest.sourceDirectory || '');
const claspVersion = String(manifest.claspVersion || '3.3.0');
const candidateFilePrefix = String(manifest.candidateFilePrefix || 'TM2_');
const candidateFunctionPrefix = String(manifest.candidateFunctionPrefix || 'tm2_');
const runtimeTestFunction = String(manifest.runtimeTestFunction || '').trim();
const shadowOnly = manifest.mode === 'SHADOW_READ_ONLY';

if (!scriptId) throw new Error('release manifest missing scriptId');
if (!fs.existsSync(sourceDir)) throw new Error(`candidate source directory missing: ${sourceDir}`);
if (!candidateFilePrefix) throw new Error('release manifest missing candidateFilePrefix');
if (!candidateFunctionPrefix) throw new Error('release manifest missing candidateFunctionPrefix');
if (!shadowOnly) throw new Error('guarded CI autopatch currently permits SHADOW_READ_ONLY releases only');

function run(command, args, cwd, env) {
  const r = cp.spawnSync(command, args, {
    cwd,
    env: { ...process.env, ...(env || {}) },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  });
  process.stdout.write(r.stdout || '');
  process.stderr.write(r.stderr || '');
  if (r.status !== 0) throw new Error(`${command} ${args.join(' ')} failed with exit ${r.status}`);
  return (r.stdout || '') + (r.stderr || '');
}

function clasp(args, cwd) {
  return run('npx', ['-y', `@google/clasp@${claspVersion}`, ...args], cwd);
}

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function listFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter(e => e.isFile())
    .map(e => e.name)
    .sort();
}

function hashMap(dir, names) {
  const out = {};
  for (const name of names) out[name] = sha256(path.join(dir, name));
  return out;
}

function assertHashes(expected, actual, names, label) {
  const issues = [];
  for (const name of names) {
    if (!(name in expected)) issues.push(`missing expected ${name}`);
    else if (!(name in actual)) issues.push(`missing actual ${name}`);
    else if (expected[name] !== actual[name]) issues.push(`hash mismatch ${name}`);
  }
  if (issues.length) throw new Error(`${label}:\n${issues.join('\n')}`);
}

function assertSameNames(expected, actual, label) {
  if (JSON.stringify([...expected].sort()) !== JSON.stringify([...actual].sort())) {
    throw new Error(`${label}: file set differs`);
  }
}

function extractFunctions(text) {
  const out = [];
  const rx = /^\s*function\s+([A-Za-z_$][\w$]*)\s*\(/gm;
  let m;
  while ((m = rx.exec(text))) out.push(m[1]);
  return out;
}

function copyDir(src, dest) {
  fs.cpSync(src, dest, { recursive: true });
}

function isCandidate(name) {
  return name.startsWith(candidateFilePrefix) && /\.js$/i.test(name);
}

const sourceNames = listFiles(sourceDir);
const candidateNames = sourceNames.filter(isCandidate);
if (!candidateNames.length) throw new Error(`no ${candidateFilePrefix}*.js candidates found`);
if (candidateNames.length !== sourceNames.length) {
  throw new Error(`candidate directory may contain only ${candidateFilePrefix}*.js files`);
}

const candidateFunctionOwners = new Map();
let candidateText = '';
for (const name of candidateNames) {
  const file = path.join(sourceDir, name);
  run(process.execPath, ['--check', file], repoRoot);
  const fileText = fs.readFileSync(file, 'utf8');
  candidateText += `\n${fileText}`;
  for (const fn of extractFunctions(fileText)) {
    if (!fn.startsWith(candidateFunctionPrefix)) {
      throw new Error(`${name}: function ${fn} must start with ${candidateFunctionPrefix}`);
    }
    if (candidateFunctionOwners.has(fn)) {
      throw new Error(`duplicate candidate function ${fn} in ${name} and ${candidateFunctionOwners.get(fn)}`);
    }
    candidateFunctionOwners.set(fn, name);
  }
}

if (!/SHADOW_READ_ONLY/.test(candidateText)) throw new Error('SHADOW_READ_ONLY marker missing');
if (/ScriptApp\.newTrigger\s*\(/.test(candidateText)) throw new Error('trigger creation is prohibited in shadow candidate');
if (/\.setDescription\s*\(/.test(candidateText)) throw new Error('Calendar description mutation is prohibited in shadow candidate');
if (/UrlFetchApp\.fetch\s*\(/.test(candidateText)) throw new Error('direct network calls are prohibited in initial shadow candidate');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'task-mapping-autopatch-'));
const preRoot = path.join(tmp, 'PRE');
const freshRoot = path.join(tmp, 'FRESH');
const workRoot = path.join(tmp, 'WORK');
const postRoot = path.join(tmp, 'POST');
for (const d of [preRoot, freshRoot, workRoot, postRoot]) fs.mkdirSync(d, { recursive: true });

const evidenceDir = path.resolve(repoRoot, 'autopatch-output');
fs.mkdirSync(evidenceDir, { recursive: true });
const evidencePath = path.join(evidenceDir, 'evidence.json');
const preArchiveDir = path.join(evidenceDir, 'PRE_SOURCE');

const evidence = {
  schemaVersion: 2,
  release: manifest.release || 'UNNAMED',
  mode: manifest.mode,
  scriptId,
  sourceDirectory: manifest.sourceDirectory,
  candidateFilePrefix,
  candidateFunctionPrefix,
  runtimeTestFunction: runtimeTestFunction || null,
  targetSpreadsheetId: manifest.targetSpreadsheetId || null,
  startedAt: new Date().toISOString(),
  claspVersion,
  candidateFiles: candidateNames,
  status: 'STARTED'
};

let pushed = false;
try {
  console.log('=== AUTOPATCH 1/10 authorize ===');
  clasp(['show-authorized-user', '--json'], repoRoot);

  console.log('=== AUTOPATCH 2/10 fresh PRE clone ===');
  clasp(['clone', scriptId, '--rootDir', 'src'], preRoot);
  const preSrc = path.join(preRoot, 'src');
  const preNames = listFiles(preSrc);
  const preHashes = hashMap(preSrc, preNames);
  const preservedNames = preNames.filter(n => !isCandidate(n));
  const preservedHashes = hashMap(preSrc, preservedNames);

  for (const [fn] of candidateFunctionOwners) {
    for (const preservedName of preservedNames) {
      const preservedText = fs.readFileSync(path.join(preSrc, preservedName), 'utf8');
      if (extractFunctions(preservedText).includes(fn)) {
        throw new Error(`global collision: candidate ${fn} already exists in preserved file ${preservedName}`);
      }
    }
  }

  console.log('=== AUTOPATCH 3/10 preserve PRE evidence ===');
  copyDir(preRoot, preArchiveDir);

  console.log('=== AUTOPATCH 4/10 build WORK from PRE ===');
  copyDir(preRoot, workRoot);
  const workSrc = path.join(workRoot, 'src');
  for (const name of listFiles(workSrc).filter(isCandidate)) {
    fs.unlinkSync(path.join(workSrc, name));
  }
  for (const name of candidateNames) {
    fs.copyFileSync(path.join(sourceDir, name), path.join(workSrc, name));
  }
  assertHashes(preservedHashes, hashMap(workSrc, preservedNames), preservedNames, 'pre-push preserved source');

  console.log('=== AUTOPATCH 5/10 freshness clone immediately before push ===');
  clasp(['clone', scriptId, '--rootDir', 'src'], freshRoot);
  const freshSrc = path.join(freshRoot, 'src');
  const freshNames = listFiles(freshSrc);
  assertSameNames(preNames, freshNames, 'freshness guard');
  assertHashes(preHashes, hashMap(freshSrc, freshNames), preNames, 'freshness guard');

  console.log('=== AUTOPATCH 6/10 push guarded candidate ===');
  clasp(['push', '--force'], workRoot);
  pushed = true;

  console.log('=== AUTOPATCH 7/10 POST clone ===');
  clasp(['clone', scriptId, '--rootDir', 'src'], postRoot);
  const postSrc = path.join(postRoot, 'src');
  const postNames = listFiles(postSrc);
  const candidateHashes = hashMap(sourceDir, candidateNames);
  assertHashes(preservedHashes, hashMap(postSrc, preservedNames), preservedNames, 'POST preserved source');
  assertHashes(candidateHashes, hashMap(postSrc, candidateNames), candidateNames, 'POST candidate verification');

  console.log('=== AUTOPATCH 8/10 verify exact POST file set ===');
  const expectedPostNames = [...preservedNames, ...candidateNames].sort();
  assertSameNames(expectedPostNames, postNames, 'POST verification');

  let runtimeOutput = '';
  if (runtimeTestFunction) {
    console.log(`=== AUTOPATCH 9/10 runtime test ${runtimeTestFunction} ===`);
    runtimeOutput = clasp(['run', runtimeTestFunction], repoRoot);
    if (/Exception:|ScriptError|Execution failed|(^|[^A-Za-z])Error:/i.test(runtimeOutput)) {
      throw new Error(`runtime test reported an error: ${runtimeOutput.slice(0, 3000)}`);
    }
    evidence.runtimeTest = {
      functionName: runtimeTestFunction,
      status: 'PASS',
      outputPreview: runtimeOutput.slice(0, 4000)
    };
  } else {
    console.log('=== AUTOPATCH 9/10 runtime test skipped ===');
    evidence.runtimeTest = { status: 'NOT_CONFIGURED' };
  }

  evidence.status = 'DEPLOYED_SHADOW_SOURCE_AND_RUNTIME_VERIFIED';
  evidence.completedAt = new Date().toISOString();
  evidence.preFileCount = preNames.length;
  evidence.postFileCount = postNames.length;
  evidence.preservedFileCount = preservedNames.length;
  evidence.candidateFileCount = candidateNames.length;
  fs.writeFileSync(evidencePath, JSON.stringify(evidence, null, 2));
  console.log('=== AUTOPATCH 10/10 complete ===');
  console.log('DEPLOYED_SHADOW_SOURCE_AND_RUNTIME_VERIFIED');
} catch (err) {
  evidence.status = 'FAILED';
  evidence.failedAt = new Date().toISOString();
  evidence.error = String(err && err.stack || err);
  if (pushed) {
    console.error('Verification failed after push; attempting automatic rollback to PRE source...');
    try {
      clasp(['push', '--force'], preRoot);
      evidence.rollback = 'ROLLBACK_PUSH_COMPLETED';
    } catch (rollbackErr) {
      evidence.rollback = 'ROLLBACK_FAILED';
      evidence.rollbackError = String(rollbackErr && rollbackErr.stack || rollbackErr);
    }
  } else {
    evidence.rollback = 'NOT_NEEDED_NO_PUSH_COMPLETED';
  }
  fs.writeFileSync(evidencePath, JSON.stringify(evidence, null, 2));
  throw err;
}

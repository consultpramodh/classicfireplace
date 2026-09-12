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
const expectedLegacyNonTm2Count = Number(manifest.expectedLegacyNonTm2Count || 0);
const claspVersion = String(manifest.claspVersion || '3.3.0');
const shadowOnly = manifest.mode === 'SHADOW_READ_ONLY';

if (!scriptId) throw new Error('release manifest missing scriptId');
if (!fs.existsSync(sourceDir)) throw new Error(`candidate source directory missing: ${sourceDir}`);
if (!expectedLegacyNonTm2Count) throw new Error('release manifest missing expectedLegacyNonTm2Count');
if (!shadowOnly) throw new Error('initial CI autopatch only permits SHADOW_READ_ONLY releases');

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
  return r.stdout || '';
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

function extractFunctions(text) {
  const out = [];
  const rx = /\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/g;
  let m;
  while ((m = rx.exec(text))) out.push(m[1]);
  return out;
}

function copyDir(src, dest) {
  fs.cpSync(src, dest, { recursive: true });
}

const candidateNames = listFiles(sourceDir).filter(n => /^TM2_.*\.js$/i.test(n));
if (!candidateNames.length) throw new Error('no TM2_*.js candidates found');
if (candidateNames.length !== listFiles(sourceDir).length) {
  throw new Error('candidate directory may contain only TM2_*.js files');
}

const candidateFunctionOwners = new Map();
let candidateText = '';
for (const name of candidateNames) {
  const file = path.join(sourceDir, name);
  run(process.execPath, ['--check', file], repoRoot);
  const text = fs.readFileSync(file, 'utf8');
  candidateText += `\n${text}`;
  for (const fn of extractFunctions(text)) {
    if (!fn.startsWith('tm2_')) throw new Error(`${name}: function ${fn} must start with tm2_`);
    if (candidateFunctionOwners.has(fn)) throw new Error(`duplicate TM2 function ${fn} in ${name} and ${candidateFunctionOwners.get(fn)}`);
    candidateFunctionOwners.set(fn, name);
  }
}

if (!/SHADOW_READ_ONLY/.test(candidateText)) throw new Error('SHADOW_READ_ONLY marker missing');
if (/ScriptApp\.newTrigger\s*\(/.test(candidateText)) throw new Error('trigger creation is prohibited in initial shadow candidate');
if (/\.setDescription\s*\(/.test(candidateText)) throw new Error('Calendar description mutation is prohibited in initial shadow candidate');
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
  schemaVersion: 1,
  release: manifest.release || 'UNNAMED',
  mode: manifest.mode,
  scriptId,
  startedAt: new Date().toISOString(),
  claspVersion,
  candidateFiles: candidateNames,
  expectedLegacyNonTm2Count,
  status: 'STARTED'
};

let pushed = false;
try {
  console.log('=== AUTOPATCH 1/9 authorize ===');
  clasp(['show-authorized-user', '--json'], repoRoot);

  console.log('=== AUTOPATCH 2/9 fresh PRE clone ===');
  clasp(['clone', scriptId, '--rootDir', 'src'], preRoot);
  const preSrc = path.join(preRoot, 'src');
  const preNames = listFiles(preSrc);
  const legacyNames = preNames.filter(n => !/^TM2_/i.test(n));
  if (legacyNames.length !== expectedLegacyNonTm2Count) {
    throw new Error(`expected ${expectedLegacyNonTm2Count} non-TM2 legacy files, found ${legacyNames.length}`);
  }
  const preLegacyHashes = hashMap(preSrc, legacyNames);

  for (const [fn] of candidateFunctionOwners) {
    for (const legacyName of legacyNames) {
      const legacyText = fs.readFileSync(path.join(preSrc, legacyName), 'utf8');
      if (extractFunctions(legacyText).includes(fn)) {
        throw new Error(`global collision: candidate ${fn} already exists in legacy file ${legacyName}`);
      }
    }
  }

  console.log('=== AUTOPATCH 3/9 preserve PRE evidence ===');
  copyDir(preRoot, preArchiveDir);

  console.log('=== AUTOPATCH 4/9 build WORK from PRE ===');
  copyDir(preRoot, workRoot);
  const workSrc = path.join(workRoot, 'src');
  for (const name of candidateNames) {
    fs.copyFileSync(path.join(sourceDir, name), path.join(workSrc, name));
  }
  assertHashes(preLegacyHashes, hashMap(workSrc, legacyNames), legacyNames, 'pre-push legacy preservation');

  console.log('=== AUTOPATCH 5/9 freshness clone immediately before push ===');
  clasp(['clone', scriptId, '--rootDir', 'src'], freshRoot);
  const freshSrc = path.join(freshRoot, 'src');
  const freshNames = listFiles(freshSrc);
  const freshLegacyNames = freshNames.filter(n => !/^TM2_/i.test(n));
  if (freshLegacyNames.length !== legacyNames.length) throw new Error('freshness guard: legacy file count changed');
  assertHashes(preLegacyHashes, hashMap(freshSrc, legacyNames), legacyNames, 'freshness guard');

  console.log('=== AUTOPATCH 6/9 push guarded candidate ===');
  clasp(['push', '--force'], workRoot);
  pushed = true;

  console.log('=== AUTOPATCH 7/9 POST clone ===');
  clasp(['clone', scriptId, '--rootDir', 'src'], postRoot);
  const postSrc = path.join(postRoot, 'src');
  const postNames = listFiles(postSrc);
  const postHashes = hashMap(postSrc, postNames);
  assertHashes(preLegacyHashes, postHashes, legacyNames, 'POST legacy preservation');
  const candidateHashes = hashMap(sourceDir, candidateNames);
  assertHashes(candidateHashes, postHashes, candidateNames, 'POST candidate verification');

  console.log('=== AUTOPATCH 8/9 verify no unexpected legacy changes ===');
  const postLegacyNames = postNames.filter(n => !/^TM2_/i.test(n));
  if (JSON.stringify(postLegacyNames) !== JSON.stringify(legacyNames)) {
    throw new Error('POST legacy file set differs from PRE');
  }

  evidence.status = 'DEPLOYED_SHADOW_SOURCE_VERIFIED';
  evidence.completedAt = new Date().toISOString();
  evidence.preFileCount = preNames.length;
  evidence.postFileCount = postNames.length;
  evidence.legacyFileCount = legacyNames.length;
  evidence.tm2CandidateFileCount = candidateNames.length;
  evidence.remoteRuntimeTests = 'NOT_CONFIGURED';
  fs.writeFileSync(evidencePath, JSON.stringify(evidence, null, 2));
  console.log('=== AUTOPATCH 9/9 complete ===');
  console.log('DEPLOYED_SHADOW_SOURCE_VERIFIED');
} catch (err) {
  evidence.status = 'FAILED';
  evidence.failedAt = new Date().toISOString();
  evidence.error = String(err && err.stack || err);
  if (pushed) {
    console.error('POST verification failed after push; attempting automatic rollback to PRE source...');
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

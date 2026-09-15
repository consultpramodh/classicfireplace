#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const cp = require('child_process');

const manifestPath = process.argv[2];
if (!manifestPath) throw new Error('Usage: node tools/deploy-selected-row-e2e-r3.js <release-manifest.json>');

const repoRoot = process.cwd();
const manifest = JSON.parse(fs.readFileSync(path.resolve(repoRoot, manifestPath), 'utf8'));
const scriptId = String(manifest.scriptId || '').trim();
const claspVersion = String(manifest.claspVersion || '3.3.0');
const sourceFile = path.resolve(repoRoot, manifest.sourceFile || '');
const targetFileName = String(manifest.targetFile || '96_Selected_Row_End_To_End_R3.js');
const menuFileName = String(manifest.menuFile || '02_Menu.js');
const expectedPreFileCount = Number(manifest.expectedPreFileCount || 0);
const oldPublicFunction = String(manifest.oldPublicFunction || 'runSelectedTaskMappingRowEndToEndR2');
const newPublicFunction = String(manifest.newPublicFunction || 'runSelectedTaskMappingRowEndToEndR3');
const expectedMenuReferenceCount = Number(manifest.expectedMenuReferenceCount || 8);

if (!scriptId) throw new Error('release manifest missing scriptId');
if (!fs.existsSync(sourceFile)) throw new Error(`sourceFile missing: ${sourceFile}`);
if (!expectedPreFileCount) throw new Error('release manifest missing expectedPreFileCount');
if (targetFileName !== '96_Selected_Row_End_To_End_R3.js') throw new Error('unexpected targetFile');

function run(command, args, cwd) {
  const r = cp.spawnSync(command, args, {
    cwd,
    env: process.env,
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

function copyDir(src, dest) {
  fs.cpSync(src, dest, { recursive: true });
}

function assertExactHashes(expected, actual, names, label) {
  const issues = [];
  for (const name of names) {
    if (!(name in expected)) issues.push(`missing expected ${name}`);
    else if (!(name in actual)) issues.push(`missing actual ${name}`);
    else if (expected[name] !== actual[name]) issues.push(`hash mismatch ${name}`);
  }
  if (issues.length) throw new Error(`${label}:\n${issues.join('\n')}`);
}

function countLiteral(text, value) {
  return text.split(value).length - 1;
}

run(process.execPath, ['--check', sourceFile], repoRoot);
const sourceText = fs.readFileSync(sourceFile, 'utf8');
if (!new RegExp(`function\\s+${newPublicFunction}\\s*\\(`).test(sourceText)) {
  throw new Error(`candidate source missing ${newPublicFunction}`);
}
if (!/LOCAL_12_HOUR_WITH_AM_PM_SEQUENTIAL_FIELDS/.test(sourceText)) {
  throw new Error('candidate source missing local meridiem sequential datetime transport');
}
if (!/DueDateTime/.test(sourceText) || !/StartDateTime/.test(sourceText)) {
  throw new Error('candidate source missing datetime field handling');
}
if (/ScriptApp\.newTrigger\s*\(/.test(sourceText)) throw new Error('candidate may not create triggers');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'selected-row-e2e-r3-'));
const preRoot = path.join(tmp, 'PRE');
const freshRoot = path.join(tmp, 'FRESH');
const workRoot = path.join(tmp, 'WORK');
const postRoot = path.join(tmp, 'POST');
for (const d of [preRoot, freshRoot, workRoot, postRoot]) fs.mkdirSync(d, { recursive: true });

const outputDir = path.resolve(repoRoot, 'selected-row-e2e-r3-output');
fs.mkdirSync(outputDir, { recursive: true });
const evidencePath = path.join(outputDir, 'evidence.json');
const preArchiveDir = path.join(outputDir, 'PRE_SOURCE');

const evidence = {
  schemaVersion: 1,
  release: manifest.release || 'SELECTED_ROW_E2E_R3',
  scriptId,
  startedAt: new Date().toISOString(),
  claspVersion,
  targetFile: targetFileName,
  modifiedExistingFiles: [menuFileName],
  status: 'STARTED'
};

let pushed = false;
try {
  console.log('=== SELECTED ROW E2E R3 1/9 authorize ===');
  clasp(['show-authorized-user', '--json'], repoRoot);

  console.log('=== SELECTED ROW E2E R3 2/9 fresh PRE clone ===');
  clasp(['clone', scriptId, '--rootDir', 'src'], preRoot);
  const preSrc = path.join(preRoot, 'src');
  const preNames = listFiles(preSrc);
  if (preNames.length !== expectedPreFileCount) {
    throw new Error(`expected ${expectedPreFileCount} PRE files, found ${preNames.length}`);
  }
  if (!preNames.includes(menuFileName)) throw new Error(`PRE missing ${menuFileName}`);
  if (!preNames.includes('94_Selected_Row_End_To_End_R2.js')) throw new Error('PRE missing R2 selected-row file');
  if (preNames.includes(targetFileName)) throw new Error(`${targetFileName} already exists in PRE; explicit update required`);
  const preHashes = hashMap(preSrc, preNames);

  const menuPre = fs.readFileSync(path.join(preSrc, menuFileName), 'utf8');
  const oldCount = countLiteral(menuPre, oldPublicFunction);
  if (oldCount !== expectedMenuReferenceCount) {
    throw new Error(`expected ${expectedMenuReferenceCount} menu/dependency references to ${oldPublicFunction}, found ${oldCount}`);
  }
  if (menuPre.includes(newPublicFunction)) throw new Error(`menu already contains ${newPublicFunction}`);

  console.log('=== SELECTED ROW E2E R3 3/9 preserve PRE evidence ===');
  copyDir(preRoot, preArchiveDir);

  console.log('=== SELECTED ROW E2E R3 4/9 build WORK from PRE ===');
  copyDir(preRoot, workRoot);
  const workSrc = path.join(workRoot, 'src');
  fs.copyFileSync(sourceFile, path.join(workSrc, targetFileName));

  const patchedMenu = menuPre.split(oldPublicFunction).join(newPublicFunction);
  if (countLiteral(patchedMenu, newPublicFunction) !== expectedMenuReferenceCount) {
    throw new Error('patched menu did not contain expected R3 reference count');
  }
  if (countLiteral(patchedMenu, oldPublicFunction) !== 0) {
    throw new Error('patched menu still contains R2 public function reference');
  }
  fs.writeFileSync(path.join(workSrc, menuFileName), patchedMenu);

  run(process.execPath, ['--check', path.join(workSrc, targetFileName)], repoRoot);
  run(process.execPath, ['--check', path.join(workSrc, menuFileName)], repoRoot);

  const untouchedNames = preNames.filter(n => n !== menuFileName);
  assertExactHashes(preHashes, hashMap(workSrc, untouchedNames), untouchedNames, 'WORK untouched-file preservation');

  console.log('=== SELECTED ROW E2E R3 5/9 freshness clone immediately before push ===');
  clasp(['clone', scriptId, '--rootDir', 'src'], freshRoot);
  const freshSrc = path.join(freshRoot, 'src');
  const freshNames = listFiles(freshSrc);
  if (JSON.stringify(freshNames) !== JSON.stringify(preNames)) throw new Error('freshness guard: file set changed');
  assertExactHashes(preHashes, hashMap(freshSrc, preNames), preNames, 'freshness guard');

  console.log('=== SELECTED ROW E2E R3 6/9 push guarded patch ===');
  clasp(['push', '--force'], workRoot);
  pushed = true;

  console.log('=== SELECTED ROW E2E R3 7/9 POST clone ===');
  clasp(['clone', scriptId, '--rootDir', 'src'], postRoot);
  const postSrc = path.join(postRoot, 'src');
  const postNames = listFiles(postSrc);
  const expectedPostNames = [...preNames, targetFileName].sort();
  if (JSON.stringify(postNames) !== JSON.stringify(expectedPostNames)) {
    throw new Error('POST file set differs from PRE + expected R3 file');
  }

  const postHashes = hashMap(postSrc, postNames);
  assertExactHashes(preHashes, postHashes, untouchedNames, 'POST untouched-file preservation');
  if (postHashes[targetFileName] !== sha256(sourceFile)) throw new Error('POST R3 file hash mismatch');

  const postMenu = fs.readFileSync(path.join(postSrc, menuFileName), 'utf8');
  if (countLiteral(postMenu, newPublicFunction) !== expectedMenuReferenceCount) {
    throw new Error('POST menu R3 reference count mismatch');
  }
  if (countLiteral(postMenu, oldPublicFunction) !== 0) {
    throw new Error('POST menu still references R2 public function');
  }
  run(process.execPath, ['--check', path.join(postSrc, targetFileName)], repoRoot);
  run(process.execPath, ['--check', path.join(postSrc, menuFileName)], repoRoot);

  console.log('=== SELECTED ROW E2E R3 8/9 verify allowed change set only ===');
  evidence.status = 'DEPLOYED_SOURCE_VERIFIED';
  evidence.completedAt = new Date().toISOString();
  evidence.preFileCount = preNames.length;
  evidence.postFileCount = postNames.length;
  evidence.newFileSha256 = postHashes[targetFileName];
  evidence.menuSha256 = postHashes[menuFileName];
  evidence.remoteRuntimeTest = 'MANUAL_SELECTED_ROW_REQUIRED';
  fs.writeFileSync(evidencePath, JSON.stringify(evidence, null, 2));

  console.log('=== SELECTED ROW E2E R3 9/9 complete ===');
  console.log('DEPLOYED_SOURCE_VERIFIED');
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

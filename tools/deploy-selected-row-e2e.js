#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const cp = require('child_process');

const manifestPath = process.argv[2];
if (!manifestPath) throw new Error('Usage: node tools/deploy-selected-row-e2e.js <release-manifest.json>');

const repoRoot = process.cwd();
const manifest = JSON.parse(fs.readFileSync(path.resolve(repoRoot, manifestPath), 'utf8'));
const scriptId = String(manifest.scriptId || '').trim();
const claspVersion = String(manifest.claspVersion || '3.3.0');
const sourceFile = path.resolve(repoRoot, manifest.sourceFile || '');
const expectedPreFileCount = Number(manifest.expectedPreFileCount || 0);
const menuFileName = String(manifest.menuFile || '02_Menu.js');
const targetFileName = String(manifest.targetFile || '93_Selected_Row_End_To_End.js');

if (!scriptId) throw new Error('release manifest missing scriptId');
if (!fs.existsSync(sourceFile)) throw new Error(`sourceFile missing: ${sourceFile}`);
if (!expectedPreFileCount) throw new Error('release manifest missing expectedPreFileCount');
if (!/^93_Selected_Row_End_To_End\.js$/.test(targetFileName)) throw new Error('unexpected targetFile');

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

function replaceOnce(text, oldText, newText, label) {
  const first = text.indexOf(oldText);
  if (first < 0) throw new Error(`menu patch target not found: ${label}`);
  if (text.indexOf(oldText, first + oldText.length) >= 0) {
    throw new Error(`menu patch target is not unique: ${label}`);
  }
  return text.slice(0, first) + newText + text.slice(first + oldText.length);
}

function patchMenu(text) {
  if (/runSelectedTaskMappingRowEndToEnd/.test(text)) {
    throw new Error('menu already contains runSelectedTaskMappingRowEndToEnd; refusing ambiguous repeat patch');
  }

  text = replaceOnce(
    text,
    "      ui.createMenu('Manual Push')\n        .addItem('Push Dates for Selected Install Row', 'pushTaskStartForActiveMappingRow')",
    "      ui.createMenu('Manual Push')\n        .addItem('🚀 Run Selected Row End-to-End', 'runSelectedTaskMappingRowEndToEnd')\n        .addSeparator()\n        .addItem('Push Dates for Selected Install Row', 'pushTaskStartForActiveMappingRow')",
    'Install Manual Push'
  );

  text = replaceOnce(
    text,
    "      ui.createMenu('Manual Push')\n        .addItem('Push Delivery Dates for Selected Rows', 'pushDeliveryTaskDatesForSelectedRows')",
    "      ui.createMenu('Manual Push')\n        .addItem('🚀 Run Selected Row End-to-End', 'runSelectedTaskMappingRowEndToEnd')\n        .addSeparator()\n        .addItem('Push Delivery Dates for Selected Rows', 'pushDeliveryTaskDatesForSelectedRows')",
    'Delivery Manual Push'
  );

  text = replaceOnce(
    text,
    "      ui.createMenu('Manual Push')\n        .addItem('Push Selected Service Row to Striven', 'pushSelectedServiceMappingRowToStriven')",
    "      ui.createMenu('Manual Push')\n        .addItem('🚀 Run Selected Row End-to-End', 'runSelectedTaskMappingRowEndToEnd')\n        .addSeparator()\n        .addItem('Push Selected Service Row to Striven', 'pushSelectedServiceMappingRowToStriven')",
    'Service Manual Push'
  );

  text = replaceOnce(
    text,
    "    .addItem('🚀 Run Selected Row End-to-End', 'runSelectedPreInspectEndToEnd')",
    "    .addItem('🚀 Run Selected Row End-to-End', 'runSelectedTaskMappingRowEndToEnd')",
    'PreInspect top-level E2E'
  );

  text = replaceOnce(
    text,
    "  INSTALL: [\n    'showInstallSyncMenuGuide',",
    "  INSTALL: [\n    'runSelectedTaskMappingRowEndToEnd',\n    'showInstallSyncMenuGuide',",
    'Install dependency'
  );

  text = replaceOnce(
    text,
    "  DELIVERY: [\n    'showDeliverySyncMenuGuide',",
    "  DELIVERY: [\n    'runSelectedTaskMappingRowEndToEnd',\n    'showDeliverySyncMenuGuide',",
    'Delivery dependency'
  );

  text = replaceOnce(
    text,
    "  SERVICE: [\n    'showServiceSyncMenuGuide',",
    "  SERVICE: [\n    'runSelectedTaskMappingRowEndToEnd',\n    'showServiceSyncMenuGuide',",
    'Service dependency'
  );

  text = replaceOnce(
    text,
    "  PREINSPECT: [\n    'runSelectedPreInspectEndToEnd',",
    "  PREINSPECT: [\n    'runSelectedTaskMappingRowEndToEnd',\n    'runSelectedPreInspectEndToEnd',",
    'PreInspect dependency'
  );

  return text;
}

function assertMenuPatched(text) {
  const menuMatches = text.match(/\.addItem\('🚀 Run Selected Row End-to-End', 'runSelectedTaskMappingRowEndToEnd'\)/g) || [];
  if (menuMatches.length !== 4) throw new Error(`expected 4 selected-row E2E menu items, found ${menuMatches.length}`);
  const dependencyMatches = text.match(/'runSelectedTaskMappingRowEndToEnd'/g) || [];
  if (dependencyMatches.length < 8) {
    throw new Error(`expected menu + dependency references, found ${dependencyMatches.length}`);
  }
}

run(process.execPath, ['--check', sourceFile], repoRoot);
const sourceText = fs.readFileSync(sourceFile, 'utf8');
if (!/function\s+runSelectedTaskMappingRowEndToEnd\s*\(/.test(sourceText)) {
  throw new Error('candidate source missing runSelectedTaskMappingRowEndToEnd');
}
if (!/RECENT_COMPLETION_HOURS:\s*24/.test(sourceText)) {
  throw new Error('candidate source missing 24-hour recent-completion guard');
}
if (/ScriptApp\.newTrigger\s*\(/.test(sourceText)) {
  throw new Error('candidate may not create triggers');
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'selected-row-e2e-'));
const preRoot = path.join(tmp, 'PRE');
const freshRoot = path.join(tmp, 'FRESH');
const workRoot = path.join(tmp, 'WORK');
const postRoot = path.join(tmp, 'POST');
for (const d of [preRoot, freshRoot, workRoot, postRoot]) fs.mkdirSync(d, { recursive: true });

const outputDir = path.resolve(repoRoot, 'selected-row-e2e-output');
fs.mkdirSync(outputDir, { recursive: true });
const evidencePath = path.join(outputDir, 'evidence.json');
const preArchiveDir = path.join(outputDir, 'PRE_SOURCE');

const evidence = {
  schemaVersion: 1,
  release: manifest.release || 'SELECTED_ROW_E2E',
  scriptId,
  startedAt: new Date().toISOString(),
  claspVersion,
  targetFile: targetFileName,
  modifiedExistingFiles: [menuFileName],
  status: 'STARTED'
};

let pushed = false;
try {
  console.log('=== SELECTED ROW E2E 1/9 authorize ===');
  clasp(['show-authorized-user', '--json'], repoRoot);

  console.log('=== SELECTED ROW E2E 2/9 fresh PRE clone ===');
  clasp(['clone', scriptId, '--rootDir', 'src'], preRoot);
  const preSrc = path.join(preRoot, 'src');
  const preNames = listFiles(preSrc);
  if (preNames.length !== expectedPreFileCount) {
    throw new Error(`expected ${expectedPreFileCount} PRE files, found ${preNames.length}`);
  }
  if (!preNames.includes(menuFileName)) throw new Error(`PRE missing ${menuFileName}`);
  if (preNames.includes(targetFileName)) throw new Error(`${targetFileName} already exists in PRE; use a new release or explicit update procedure`);
  const preHashes = hashMap(preSrc, preNames);
  const menuPre = fs.readFileSync(path.join(preSrc, menuFileName), 'utf8');
  if (/function\s+runSelectedTaskMappingRowEndToEnd\s*\(/.test(menuPre)) {
    throw new Error('selected-row public function unexpectedly exists in menu source');
  }

  console.log('=== SELECTED ROW E2E 3/9 preserve PRE evidence ===');
  copyDir(preRoot, preArchiveDir);

  console.log('=== SELECTED ROW E2E 4/9 build WORK from PRE ===');
  copyDir(preRoot, workRoot);
  const workSrc = path.join(workRoot, 'src');
  fs.copyFileSync(sourceFile, path.join(workSrc, targetFileName));
  const patchedMenu = patchMenu(menuPre);
  assertMenuPatched(patchedMenu);
  fs.writeFileSync(path.join(workSrc, menuFileName), patchedMenu);
  run(process.execPath, ['--check', path.join(workSrc, targetFileName)], repoRoot);
  run(process.execPath, ['--check', path.join(workSrc, menuFileName)], repoRoot);

  const untouchedNames = preNames.filter(n => n !== menuFileName);
  assertExactHashes(preHashes, hashMap(workSrc, untouchedNames), untouchedNames, 'WORK untouched-file preservation');

  console.log('=== SELECTED ROW E2E 5/9 freshness clone immediately before push ===');
  clasp(['clone', scriptId, '--rootDir', 'src'], freshRoot);
  const freshSrc = path.join(freshRoot, 'src');
  const freshNames = listFiles(freshSrc);
  if (JSON.stringify(freshNames) !== JSON.stringify(preNames)) throw new Error('freshness guard: file set changed');
  assertExactHashes(preHashes, hashMap(freshSrc, preNames), preNames, 'freshness guard');

  console.log('=== SELECTED ROW E2E 6/9 push guarded patch ===');
  clasp(['push', '--force'], workRoot);
  pushed = true;

  console.log('=== SELECTED ROW E2E 7/9 POST clone ===');
  clasp(['clone', scriptId, '--rootDir', 'src'], postRoot);
  const postSrc = path.join(postRoot, 'src');
  const postNames = listFiles(postSrc);
  if (postNames.length !== preNames.length + 1) throw new Error(`POST file count expected ${preNames.length + 1}, found ${postNames.length}`);
  if (!postNames.includes(targetFileName)) throw new Error(`POST missing ${targetFileName}`);

  const postHashes = hashMap(postSrc, postNames);
  assertExactHashes(preHashes, postHashes, untouchedNames, 'POST untouched-file preservation');
  if (postHashes[targetFileName] !== sha256(sourceFile)) throw new Error('POST new selected-row E2E file hash mismatch');
  const postMenu = fs.readFileSync(path.join(postSrc, menuFileName), 'utf8');
  assertMenuPatched(postMenu);
  run(process.execPath, ['--check', path.join(postSrc, targetFileName)], repoRoot);
  run(process.execPath, ['--check', path.join(postSrc, menuFileName)], repoRoot);

  console.log('=== SELECTED ROW E2E 8/9 verify allowed change set only ===');
  const expectedPostNames = [...preNames, targetFileName].sort();
  if (JSON.stringify(postNames) !== JSON.stringify(expectedPostNames)) {
    throw new Error('POST file set differs from PRE + expected new file');
  }

  evidence.status = 'DEPLOYED_SOURCE_VERIFIED';
  evidence.completedAt = new Date().toISOString();
  evidence.preFileCount = preNames.length;
  evidence.postFileCount = postNames.length;
  evidence.newFileSha256 = postHashes[targetFileName];
  evidence.menuSha256 = postHashes[menuFileName];
  evidence.remoteRuntimeTest = 'MANUAL_SELECTED_ROW_REQUIRED';
  fs.writeFileSync(evidencePath, JSON.stringify(evidence, null, 2));

  console.log('=== SELECTED ROW E2E 9/9 complete ===');
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

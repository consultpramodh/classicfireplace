#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const cp = require('child_process');

const manifestPath = process.argv[2];
if (!manifestPath) throw new Error('Usage: node tools/deploy-task-mapping-fix-pack-r4.js <release-manifest.json>');

const repoRoot = process.cwd();
const manifest = JSON.parse(fs.readFileSync(path.resolve(repoRoot, manifestPath), 'utf8'));
const scriptId = String(manifest.scriptId || '').trim();
const claspVersion = String(manifest.claspVersion || '3.3.0');
const sourceFile = path.resolve(repoRoot, manifest.sourceFile || '');
const targetFileName = String(manifest.targetFile || '97_Task_Mapping_Fix_Pack_R4.js');
const expectedPreFileCount = Number(manifest.expectedPreFileCount || 0);
const oldPublicFunction = String(manifest.oldPublicFunction || 'runSelectedTaskMappingRowEndToEndR3');
const newPublicFunction = String(manifest.newPublicFunction || 'runSelectedTaskMappingRowEndToEndR4');
const expectedMenuReferenceCount = Number(manifest.expectedMenuReferenceCount || 8);

const MENU = '02_Menu.js';
const SHARED = '01_Shared_Utilities.js';
const REPORT = '40_Report_Refresh_Workflow.js';
const RECOVERY = '92_Striven_Task_Patch_Helper.js';
const LINKS = '95_Delivery_Calendar_Link_Test.js';
const R3 = '96_Selected_Row_End_To_End_R3.js';
const changedExisting = [MENU, SHARED, REPORT, RECOVERY, LINKS];
const requiredPre = [MENU, SHARED, REPORT, RECOVERY, LINKS, R3, '93_Selected_Row_End_To_End.js', '94_Selected_Row_End_To_End_R2.js', 'TM2_90_Diagnostics.js'];

if (!scriptId) throw new Error('release manifest missing scriptId');
if (!fs.existsSync(sourceFile)) throw new Error(`sourceFile missing: ${sourceFile}`);
if (!expectedPreFileCount) throw new Error('release manifest missing expectedPreFileCount');
if (targetFileName !== '97_Task_Mapping_Fix_Pack_R4.js') throw new Error('unexpected targetFile');

function run(command, args, cwd) {
  const r = cp.spawnSync(command, args, { cwd, env: process.env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  process.stdout.write(r.stdout || '');
  process.stderr.write(r.stderr || '');
  if (r.status !== 0) throw new Error(`${command} ${args.join(' ')} failed with exit ${r.status}`);
  return r.stdout || '';
}
function clasp(args, cwd) { return run('npx', ['-y', `@google/clasp@${claspVersion}`, ...args], cwd); }
function sha256(file) { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }
function listFiles(dir) { return fs.readdirSync(dir, {withFileTypes:true}).filter(e=>e.isFile()).map(e=>e.name).sort(); }
function hashMap(dir, names) { const out={}; names.forEach(n=>out[n]=sha256(path.join(dir,n))); return out; }
function copyDir(src,dst) { fs.cpSync(src,dst,{recursive:true}); }
function countLiteral(text,value) { return text.split(value).length - 1; }
function assertExactHashes(expected, actual, names, label) {
  const issues=[];
  names.forEach(name=>{
    if (!(name in expected)) issues.push(`missing expected ${name}`);
    else if (!(name in actual)) issues.push(`missing actual ${name}`);
    else if (expected[name] !== actual[name]) issues.push(`hash mismatch ${name}`);
  });
  if (issues.length) throw new Error(`${label}:\n${issues.join('\n')}`);
}

function replaceNamedFunction(source, functionName, replacement) {
  const escapedName = functionName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const sig = new RegExp(`function\\s+${escapedName}\\s*\\(`);
  const match = sig.exec(source);
  if (!match) throw new Error(`Could not find function ${functionName}`);
  const start = match.index;
  const braceStart = source.indexOf('{', match.index + match[0].length);
  if (braceStart < 0) throw new Error(`Could not find opening brace for ${functionName}`);

  let depth=0, quote=null, escaped=false, lineComment=false, blockComment=false;
  for (let i=braceStart;i<source.length;i++) {
    const ch=source[i], next=source[i+1];
    if (lineComment) { if (ch==='\n') lineComment=false; continue; }
    if (blockComment) { if (ch==='*' && next==='/') { blockComment=false; i++; } continue; }
    if (quote) {
      if (escaped) { escaped=false; continue; }
      if (ch==='\\') { escaped=true; continue; }
      if (ch===quote) quote=null;
      continue;
    }
    if (ch==='/' && next==='/') { lineComment=true; i++; continue; }
    if (ch==='/' && next==='*') { blockComment=true; i++; continue; }
    if (ch==='\'' || ch==='"' || ch==='`') { quote=ch; continue; }
    if (ch==='{') depth++;
    else if (ch==='}') {
      depth--;
      if (depth===0) return source.slice(0,start) + replacement.trim() + source.slice(i+1);
    }
  }
  throw new Error(`Could not find closing brace for ${functionName}`);
}

function patchMenu(text) {
  const oldCount = countLiteral(text, oldPublicFunction);
  if (oldCount !== expectedMenuReferenceCount) throw new Error(`expected ${expectedMenuReferenceCount} menu references to ${oldPublicFunction}, found ${oldCount}`);
  if (text.includes(newPublicFunction)) throw new Error(`menu already contains ${newPublicFunction}`);
  let out = text.split(oldPublicFunction).join(newPublicFunction);

  const menuAnchor = "    .addItem('Test CrossDivision SO Recovery For Selected Row', 'testCrossDivisionSoRecoveryForSelectedRow')";
  if (!out.includes('showTaskMappingControlTowerR4')) {
    if (!out.includes(menuAnchor)) throw new Error('Master menu anchor for Control Tower not found');
    out = out.replace(menuAnchor,
      "    .addItem('🧭 Task Mapping Control Tower', 'showTaskMappingControlTowerR4')\n    .addItem('🧪 Run R4 Read-Only Regression', 'runTaskMappingFixPackR4Regression')\n\n" + menuAnchor
    );

    const depAnchor = "    'runMasterBigDataAndAllDivisions',";
    if (!out.includes(depAnchor)) throw new Error('MASTER dependency anchor not found');
    out = out.replace(depAnchor, depAnchor + "\n    'showTaskMappingControlTowerR4',\n    'runTaskMappingFixPackR4Regression',");
  }

  if (countLiteral(out,newPublicFunction)!==expectedMenuReferenceCount) throw new Error('patched menu R4 reference count mismatch');
  if (countLiteral(out,oldPublicFunction)!==0) throw new Error('patched menu still references R3 selected-row function');
  if (countLiteral(out,'showTaskMappingControlTowerR4') < 2) throw new Error('Control Tower menu/dependency not patched');
  if (countLiteral(out,'runTaskMappingFixPackR4Regression') < 2) throw new Error('R4 regression menu/dependency not patched');
  return out;
}

function patchExisting(workSrc) {
  const menuPath=path.join(workSrc,MENU);
  fs.writeFileSync(menuPath, patchMenu(fs.readFileSync(menuPath,'utf8')));

  let shared=fs.readFileSync(path.join(workSrc,SHARED),'utf8');
  shared=replaceNamedFunction(shared,'tm_fetchAllReportRows_', `function tm_fetchAllReportRows_(config) {\n  return tmR4_fetchAllReportRowsValidated_(config);\n}`);
  fs.writeFileSync(path.join(workSrc,SHARED),shared);

  let report=fs.readFileSync(path.join(workSrc,REPORT),'utf8');
  report=replaceNamedFunction(report,'serviceFetchStrivenReportRowsLegacy_', `function serviceFetchStrivenReportRowsLegacy_(url) {\n  return tmR4_fetchSingleReportRowsValidated_(url, 'Service report');\n}`);
  fs.writeFileSync(path.join(workSrc,REPORT),report);

  let recovery=fs.readFileSync(path.join(workSrc,RECOVERY),'utf8');
  recovery=replaceNamedFunction(recovery,'taskRecoveryAutoCompletedTaskSourceGuard_', `function taskRecoveryAutoCompletedTaskSourceGuard_(taskId) {\n  return tmR4_taskRecoveryAutoCompletedTaskSourceGuard_(taskId);\n}`);
  fs.writeFileSync(path.join(workSrc,RECOVERY),recovery);

  let links=fs.readFileSync(path.join(workSrc,LINKS),'utf8');
  links=replaceNamedFunction(links,'pushCalendarLinksForAllReadyMappingRows', `function pushCalendarLinksForAllReadyMappingRows() {\n  return tmR4_pushCalendarLinksForAllReadyMappingRows();\n}`);
  links=replaceNamedFunction(links,'dryRunCalendarLinksForAllReadyMappingRows', `function dryRunCalendarLinksForAllReadyMappingRows() {\n  return tmR4_dryRunCalendarLinksForAllReadyMappingRows();\n}`);
  links=replaceNamedFunction(links,'pushServiceCalendarLinksForReadyRows', `function pushServiceCalendarLinksForReadyRows() {\n  return tmR4_pushServiceCalendarLinksForReadyRows();\n}`);
  links=replaceNamedFunction(links,'dryRunServiceCalendarLinksForReadyRows', `function dryRunServiceCalendarLinksForReadyRows() {\n  return tmR4_dryRunServiceCalendarLinksForReadyRows();\n}`);
  fs.writeFileSync(path.join(workSrc,LINKS),links);
}

run(process.execPath,['--check',sourceFile],repoRoot);
const sourceText=fs.readFileSync(sourceFile,'utf8');
['runSelectedTaskMappingRowEndToEndR4','tmR4_taskRecoveryAutoCompletedTaskSourceGuard_','tmR4_pushCalendarLinksForAllReadyMappingRows','tmR4_fetchAllReportRowsValidated_','showTaskMappingControlTowerR4','runTaskMappingFixPackR4Regression'].forEach(fn=>{
  if (!new RegExp(`function\\s+${fn}\\s*\\(`).test(sourceText)) throw new Error(`candidate source missing ${fn}`);
});
if (/ScriptApp\.newTrigger\s*\(/.test(sourceText)) throw new Error('R4 candidate may not create triggers');
if (/TM2_CUTOVER\s*=/.test(sourceText)) throw new Error('R4 candidate may not redefine TM2_CUTOVER');

const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'task-mapping-r4-'));
const preRoot=path.join(tmp,'PRE'), freshRoot=path.join(tmp,'FRESH'), workRoot=path.join(tmp,'WORK'), postRoot=path.join(tmp,'POST');
[preRoot,freshRoot,workRoot,postRoot].forEach(d=>fs.mkdirSync(d,{recursive:true}));
const outputDir=path.resolve(repoRoot,'task-mapping-r4-output');
fs.mkdirSync(outputDir,{recursive:true});
const evidencePath=path.join(outputDir,'evidence.json');
const preArchiveDir=path.join(outputDir,'PRE_SOURCE');
const evidence={schemaVersion:1,release:manifest.release||'TASK_MAPPING_FIX_PACK_R4',scriptId,startedAt:new Date().toISOString(),claspVersion,targetFile:targetFileName,modifiedExistingFiles:changedExisting,status:'STARTED'};
let pushed=false;

try {
  console.log('=== R4 1/10 authorize ===');
  clasp(['show-authorized-user','--json'],repoRoot);

  console.log('=== R4 2/10 fresh PRE clone ===');
  clasp(['clone',scriptId,'--rootDir','src'],preRoot);
  const preSrc=path.join(preRoot,'src');
  const preNames=listFiles(preSrc);
  if (preNames.length!==expectedPreFileCount) throw new Error(`expected ${expectedPreFileCount} PRE files, found ${preNames.length}`);
  requiredPre.forEach(n=>{if(!preNames.includes(n)) throw new Error(`PRE missing critical file ${n}`);});
  if (preNames.includes(targetFileName)) throw new Error(`${targetFileName} already exists in PRE; explicit update required`);
  const preHashes=hashMap(preSrc,preNames);

  console.log('=== R4 3/10 preserve PRE evidence ===');
  copyDir(preRoot,preArchiveDir);

  console.log('=== R4 4/10 build guarded WORK ===');
  copyDir(preRoot,workRoot);
  const workSrc=path.join(workRoot,'src');
  fs.copyFileSync(sourceFile,path.join(workSrc,targetFileName));
  patchExisting(workSrc);
  [targetFileName,...changedExisting].forEach(n=>run(process.execPath,['--check',path.join(workSrc,n)],repoRoot));

  const untouched=preNames.filter(n=>!changedExisting.includes(n));
  assertExactHashes(preHashes,hashMap(workSrc,untouched),untouched,'WORK untouched-file preservation');
  if (sha256(path.join(workSrc,targetFileName))!==sha256(sourceFile)) throw new Error('WORK R4 file hash mismatch');

  console.log('=== R4 5/10 static contract checks ===');
  const workMenu=fs.readFileSync(path.join(workSrc,MENU),'utf8');
  if (countLiteral(workMenu,newPublicFunction)!==expectedMenuReferenceCount) throw new Error('WORK menu selected-row R4 count mismatch');
  if (!fs.readFileSync(path.join(workSrc,RECOVERY),'utf8').includes('return tmR4_taskRecoveryAutoCompletedTaskSourceGuard_(taskId);')) throw new Error('WORK recovery delegation missing');
  if (!fs.readFileSync(path.join(workSrc,SHARED),'utf8').includes('return tmR4_fetchAllReportRowsValidated_(config);')) throw new Error('WORK report pagination delegation missing');
  if (!fs.readFileSync(path.join(workSrc,REPORT),'utf8').includes("return tmR4_fetchSingleReportRowsValidated_(url, 'Service report');")) throw new Error('WORK service report validation delegation missing');
  const workLinks=fs.readFileSync(path.join(workSrc,LINKS),'utf8');
  if (!workLinks.includes('return tmR4_pushCalendarLinksForAllReadyMappingRows();')) throw new Error('WORK all-link delegation missing');
  if (!workLinks.includes('return tmR4_pushServiceCalendarLinksForReadyRows();')) throw new Error('WORK service-link delegation missing');

  console.log('=== R4 6/10 freshness clone immediately before push ===');
  clasp(['clone',scriptId,'--rootDir','src'],freshRoot);
  const freshSrc=path.join(freshRoot,'src');
  const freshNames=listFiles(freshSrc);
  if (JSON.stringify(freshNames)!==JSON.stringify(preNames)) throw new Error('freshness guard: file set changed');
  assertExactHashes(preHashes,hashMap(freshSrc,preNames),preNames,'freshness guard');

  console.log('=== R4 7/10 push guarded fix pack ===');
  clasp(['push','--force'],workRoot);
  pushed=true;

  console.log('=== R4 8/10 POST clone ===');
  clasp(['clone',scriptId,'--rootDir','src'],postRoot);
  const postSrc=path.join(postRoot,'src');
  const postNames=listFiles(postSrc);
  const expectedPost=[...preNames,targetFileName].sort();
  if (JSON.stringify(postNames)!==JSON.stringify(expectedPost)) throw new Error('POST file set differs from PRE + expected R4 file');
  const postHashes=hashMap(postSrc,postNames);
  assertExactHashes(preHashes,postHashes,untouched,'POST untouched-file preservation');
  if (postHashes[targetFileName]!==sha256(sourceFile)) throw new Error('POST R4 file hash mismatch');
  [targetFileName,...changedExisting].forEach(n=>run(process.execPath,['--check',path.join(postSrc,n)],repoRoot));

  console.log('=== R4 9/10 verify allowed change set / contracts ===');
  const postMenu=fs.readFileSync(path.join(postSrc,MENU),'utf8');
  if (countLiteral(postMenu,newPublicFunction)!==expectedMenuReferenceCount || countLiteral(postMenu,oldPublicFunction)!==0) throw new Error('POST menu selected-row function routing mismatch');
  if (!postMenu.includes('showTaskMappingControlTowerR4') || !postMenu.includes('runTaskMappingFixPackR4Regression')) throw new Error('POST Master menu R4 controls missing');
  if (!fs.readFileSync(path.join(postSrc,RECOVERY),'utf8').includes('return tmR4_taskRecoveryAutoCompletedTaskSourceGuard_(taskId);')) throw new Error('POST recovery delegation missing');
  if (!fs.readFileSync(path.join(postSrc,SHARED),'utf8').includes('return tmR4_fetchAllReportRowsValidated_(config);')) throw new Error('POST validated paging delegation missing');
  if (!fs.readFileSync(path.join(postSrc,REPORT),'utf8').includes("return tmR4_fetchSingleReportRowsValidated_(url, 'Service report');")) throw new Error('POST service report delegation missing');
  const postLinks=fs.readFileSync(path.join(postSrc,LINKS),'utf8');
  ['tmR4_pushCalendarLinksForAllReadyMappingRows','tmR4_dryRunCalendarLinksForAllReadyMappingRows','tmR4_pushServiceCalendarLinksForReadyRows','tmR4_dryRunServiceCalendarLinksForReadyRows'].forEach(fn=>{if(!postLinks.includes(fn)) throw new Error(`POST link delegation missing ${fn}`);});

  evidence.status='DEPLOYED_SOURCE_VERIFIED';
  evidence.completedAt=new Date().toISOString();
  evidence.preFileCount=preNames.length;
  evidence.postFileCount=postNames.length;
  evidence.newFileSha256=postHashes[targetFileName];
  evidence.changedFileSha256={};
  changedExisting.forEach(n=>evidence.changedFileSha256[n]=postHashes[n]);
  evidence.rollbackSource='PRE_SOURCE';
  evidence.runtimeRegression='MANUAL_ONE_CLICK_REQUIRED';
  evidence.productionCutover='UNCHANGED';
  fs.writeFileSync(evidencePath,JSON.stringify(evidence,null,2));

  console.log('=== R4 10/10 complete ===');
  console.log('DEPLOYED_SOURCE_VERIFIED');
} catch(err) {
  evidence.status='FAILED'; evidence.failedAt=new Date().toISOString(); evidence.error=String(err&&err.stack||err);
  if (pushed) {
    console.error('POST verification failed after push; attempting automatic rollback to PRE source...');
    try { clasp(['push','--force'],preRoot); evidence.rollback='ROLLBACK_PUSH_COMPLETED'; }
    catch(rollbackErr) { evidence.rollback='ROLLBACK_FAILED'; evidence.rollbackError=String(rollbackErr&&rollbackErr.stack||rollbackErr); }
  } else evidence.rollback='NOT_NEEDED_NO_PUSH_COMPLETED';
  fs.writeFileSync(evidencePath,JSON.stringify(evidence,null,2));
  throw err;
}

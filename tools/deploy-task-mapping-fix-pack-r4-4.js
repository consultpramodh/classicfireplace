#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const cp = require('child_process');

const manifestPath = process.argv[2];
if (!manifestPath) throw new Error('Usage: node tools/deploy-task-mapping-fix-pack-r4-4.js <release-manifest.json>');
const repoRoot = process.cwd();
const manifest = JSON.parse(fs.readFileSync(path.resolve(repoRoot, manifestPath), 'utf8'));
const scriptId = String(manifest.scriptId || '').trim();
const claspVersion = String(manifest.claspVersion || '3.3.0');
const expectedPreFileCount = Number(manifest.expectedPreFileCount || 59);
if (!scriptId) throw new Error('release manifest missing scriptId');

const targetR3 = '96_Selected_Row_End_To_End_R3.js';
const targetR4 = '97_Task_Mapping_Fix_Pack_R4.js';

function run(command, args, cwd) {
  const r = cp.spawnSync(command, args, { cwd, env: process.env, encoding: 'utf8', stdio: ['ignore','pipe','pipe'] });
  process.stdout.write(r.stdout || '');
  process.stderr.write(r.stderr || '');
  if (r.status !== 0) throw new Error(`${command} ${args.join(' ')} failed with exit ${r.status}`);
  return r.stdout || '';
}
function clasp(args, cwd) { return run('npx', ['-y', `@google/clasp@${claspVersion}`, ...args], cwd); }
function sha256(file) { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }
function listFiles(dir) { return fs.readdirSync(dir,{withFileTypes:true}).filter(e=>e.isFile()).map(e=>e.name).sort(); }
function hashMap(dir,names){const out={}; names.forEach(n=>out[n]=sha256(path.join(dir,n))); return out;}
function copyDir(src,dst){fs.cpSync(src,dst,{recursive:true});}
function assertExactHashes(expected,actual,names,label){const issues=[]; names.forEach(n=>{if(expected[n]!==actual[n]) issues.push(n);}); if(issues.length) throw new Error(`${label}: hash mismatch ${issues.join(', ')}`);}
function replaceOnce(text, oldText, newText, label) {
  const first = text.indexOf(oldText);
  if (first < 0) throw new Error('Missing expected source for '+label);
  if (text.indexOf(oldText, first + oldText.length) >= 0) throw new Error('Expected one occurrence for '+label);
  return text.slice(0, first) + newText + text.slice(first + oldText.length);
}

const helperText = `

function tmSelectedRowE2ER3RestoreAndVerifySelection_(ctx) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss && ss.getSheetByName(ctx.sheetName);
  if (!sheet) throw new Error('Missing PreInspect Task Mapping sheet during lock retry.');
  ss.setActiveSheet(sheet);
  sheet.setActiveRange(sheet.getRange(ctx.rowNumber, 1, 1, 1));
  SpreadsheetApp.flush();
  const row = preinspectMappingRowObject_(sheet, ctx.rowNumber);
  const eventId = String(row['Event ID'] || '').trim();
  const taskId = Number(String(row['Task ID'] || '').trim()) || 0;
  if (eventId !== String(ctx.eventId || '').trim() || taskId !== Number(ctx.taskId || 0)) {
    throw new Error('BLOCKED: Selected PreInspection mapping changed during lock wait. No retry attempted.');
  }
}

function tmSelectedRowE2ER3RunLockAwareManualStep_(ctx, label, fn) {
  const delays = TM_SELECTED_ROW_E2E_R3.LOCK_RETRY_DELAYS_MS || [1500, 3000, 6000];
  const safeLockMessage = 'Could not obtain script lock. No Striven write attempted.';
  let lastError = null;
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    try {
      tmSelectedRowE2ER3RestoreAndVerifySelection_(ctx);
      return fn();
    } catch (err) {
      lastError = err;
      const message = String(err && err.message ? err.message : err);
      const safeToRetry = message.indexOf(safeLockMessage) >= 0;
      if (!safeToRetry || attempt >= delays.length) throw err;
      const delay = Number(delays[attempt] || 0);
      Logger.log(JSON.stringify({
        mode: 'SELECTED_ROW_END_TO_END_R3_LOCK_RETRY',
        action: label,
        attempt: attempt + 1,
        nextAttempt: attempt + 2,
        delayMs: delay,
        reason: safeLockMessage,
        safety: 'RETRY_ALLOWED_ONLY_BECAUSE_FAILED_HELPER_CONFIRMED_NO_STRIVEN_WRITE'
      }, null, 2));
      if (delay > 0) Utilities.sleep(delay);
    }
  }
  throw lastError || new Error('Unexpected lock retry failure.');
}

function tmSelectedRowE2ER3RunDateTimeWithScriptLock_(ctx, fn) {
  const lock = LockService.getScriptLock();
  const delays = TM_SELECTED_ROW_E2E_R3.LOCK_RETRY_DELAYS_MS || [1500, 3000, 6000];
  let acquired = false;
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    if (lock.tryLock(10000)) {
      acquired = true;
      break;
    }
    if (attempt >= delays.length) {
      throw new Error('Could not obtain script lock for PreInspection datetime reconciliation. No Striven write attempted.');
    }
    const delay = Number(delays[attempt] || 0);
    Logger.log(JSON.stringify({
      mode: 'SELECTED_ROW_END_TO_END_R3_LOCK_RETRY',
      action: 'DATE_TIME',
      attempt: attempt + 1,
      nextAttempt: attempt + 2,
      delayMs: delay,
      reason: 'Script lock busy before datetime mutation.',
      safety: 'NO_STRIVEN_WRITE_OCCURRED_BEFORE_LOCK_ACQUISITION'
    }, null, 2));
    if (delay > 0) Utilities.sleep(delay);
    tmSelectedRowE2ER3RestoreAndVerifySelection_(ctx);
  }
  try {
    tmSelectedRowE2ER3RestoreAndVerifySelection_(ctx);
    return fn();
  } finally {
    if (acquired) lock.releaseLock();
  }
}
`;

const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'task-mapping-r4-4-'));
const preRoot=path.join(tmp,'PRE'),freshRoot=path.join(tmp,'FRESH'),workRoot=path.join(tmp,'WORK'),postRoot=path.join(tmp,'POST');
[preRoot,freshRoot,workRoot,postRoot].forEach(d=>fs.mkdirSync(d,{recursive:true}));
const outputDir=path.resolve(repoRoot,'task-mapping-r4-4-output'); fs.mkdirSync(outputDir,{recursive:true});
const evidencePath=path.join(outputDir,'evidence.json'), preArchiveDir=path.join(outputDir,'PRE_SOURCE');
const evidence={schemaVersion:1,release:manifest.release||'TASK_MAPPING_FIX_PACK_R4_4',scriptId,startedAt:new Date().toISOString(),status:'STARTED'};
let pushed=false;
try{
  console.log('=== R4.4 1/8 authorize ==='); clasp(['show-authorized-user','--json'],repoRoot);
  console.log('=== R4.4 2/8 PRE clone ==='); clasp(['clone',scriptId,'--rootDir','src'],preRoot);
  const preSrc=path.join(preRoot,'src'), preNames=listFiles(preSrc);
  if(preNames.length!==expectedPreFileCount)throw new Error(`expected ${expectedPreFileCount} PRE files, found ${preNames.length}`);
  [targetR3,targetR4].forEach(n=>{if(!preNames.includes(n))throw new Error('PRE missing '+n);});
  const preHashes=hashMap(preSrc,preNames); copyDir(preRoot,preArchiveDir);

  console.log('=== R4.4 3/8 build patch ===');
  copyDir(preRoot,workRoot); const workSrc=path.join(workRoot,'src');
  const r3Path=path.join(workSrc,targetR3), r4Path=path.join(workSrc,targetR4);
  let r3=fs.readFileSync(r3Path,'utf8');
  let r4=fs.readFileSync(r4Path,'utf8');
  if(!r3.includes('TM_SELECTED_ROW_E2E_R3_1_20260915'))throw new Error('Unexpected live R3.1 version marker');
  if(!r4.includes('TM_FIX_PACK_R4_3_20260915'))throw new Error('Unexpected live R4.3 version marker');
  if(!r3.includes("yyyy-MM-dd'T'HH:mm:ss"))throw new Error('R4.3 24-hour datetime transport marker missing');

  r3=r3.replace('TM_SELECTED_ROW_E2E_R3_1_20260915','TM_SELECTED_ROW_E2E_R3_2_20260915');
  r3=replaceOnce(r3,
    'READBACK_DELAYS_MS: [500, 1200, 2500]\n});',
    'READBACK_DELAYS_MS: [500, 1200, 2500],\n  LOCK_RETRY_DELAYS_MS: [1500, 3000, 6000]\n});',
    'R3 lock retry config');

  r3=replaceOnce(r3,"record('CUSTOMER', pushSelectedPreInspectCustomer());","record('CUSTOMER', tmSelectedRowE2ER3RunLockAwareManualStep_(ctx, 'CUSTOMER', pushSelectedPreInspectCustomer));",'customer lock retry');
  r3=replaceOnce(r3,"record('LOCATION', pushSelectedPreInspectLocation());","record('LOCATION', tmSelectedRowE2ER3RunLockAwareManualStep_(ctx, 'LOCATION', pushSelectedPreInspectLocation));",'location lock retry');
  r3=replaceOnce(r3,"record('REQUESTED_BY', pushSelectedPreInspectRequestedBy());","record('REQUESTED_BY', tmSelectedRowE2ER3RunLockAwareManualStep_(ctx, 'REQUESTED_BY', pushSelectedPreInspectRequestedBy));",'requested by lock retry');
  r3=replaceOnce(r3,"record('ASSIGNEES', pushSelectedPreInspectAssignees());","record('ASSIGNEES', tmSelectedRowE2ER3RunLockAwareManualStep_(ctx, 'ASSIGNEES', pushSelectedPreInspectAssignees));",'assignees lock retry');
  r3=replaceOnce(r3,"record('INSTALL_NOTES_854', pushSelectedPreInspectInstallNotes());","record('INSTALL_NOTES_854', tmSelectedRowE2ER3RunLockAwareManualStep_(ctx, 'INSTALL_NOTES_854', pushSelectedPreInspectInstallNotes));",'install notes lock retry');

  const oldDateBlock = `record(\n      'DATE_TIME_LOCAL_MERIDIEM_SEQUENTIAL_RECONCILE',\n      tmSelectedRowE2ER3ReconcilePreInspectionDateTime_(\n        sheet,\n        ctx.rowNumber,\n        ctx.eventId,\n        reviewedTaskId\n      )\n    );`;
  const newDateBlock = `record(\n      'DATE_TIME_LOCAL_24H_ISO_SEQUENTIAL_RECONCILE',\n      tmSelectedRowE2ER3RunDateTimeWithScriptLock_(ctx, function() {\n        return tmSelectedRowE2ER3ReconcilePreInspectionDateTime_(\n          sheet,\n          ctx.rowNumber,\n          ctx.eventId,\n          reviewedTaskId\n        );\n      })\n    );`;
  r3=replaceOnce(r3,oldDateBlock,newDateBlock,'datetime script lock');
  if(!r3.includes('function tmSelectedRowE2ER3RunLockAwareManualStep_(')) r3 += helperText;
  r4=r4.replace('TM_FIX_PACK_R4_3_20260915','TM_FIX_PACK_R4_4_20260915');

  fs.writeFileSync(r3Path,r3); fs.writeFileSync(r4Path,r4);
  run(process.execPath,['--check',r3Path],repoRoot); run(process.execPath,['--check',r4Path],repoRoot);
  const changed=[targetR3,targetR4];
  const untouched=preNames.filter(n=>changed.indexOf(n)===-1);
  assertExactHashes(preHashes,hashMap(workSrc,untouched),untouched,'WORK preservation');

  console.log('=== R4.4 4/8 freshness clone ===');
  clasp(['clone',scriptId,'--rootDir','src'],freshRoot); const freshSrc=path.join(freshRoot,'src'); const freshNames=listFiles(freshSrc);
  if(JSON.stringify(freshNames)!==JSON.stringify(preNames))throw new Error('Freshness file set changed');
  assertExactHashes(preHashes,hashMap(freshSrc,preNames),preNames,'freshness guard');

  console.log('=== R4.4 5/8 push ==='); clasp(['push','--force'],workRoot); pushed=true;
  console.log('=== R4.4 6/8 POST clone ==='); clasp(['clone',scriptId,'--rootDir','src'],postRoot);
  const postSrc=path.join(postRoot,'src'); const postNames=listFiles(postSrc);
  if(JSON.stringify(postNames)!==JSON.stringify(preNames))throw new Error('POST file set changed');
  const postHashes=hashMap(postSrc,postNames);
  assertExactHashes(preHashes,postHashes,untouched,'POST untouched preservation');
  const postR3=fs.readFileSync(path.join(postSrc,targetR3),'utf8');
  const postR4=fs.readFileSync(path.join(postSrc,targetR4),'utf8');
  run(process.execPath,['--check',path.join(postSrc,targetR3)],repoRoot); run(process.execPath,['--check',path.join(postSrc,targetR4)],repoRoot);

  console.log('=== R4.4 7/8 verify contracts ===');
  ['TM_SELECTED_ROW_E2E_R3_2_20260915','LOCK_RETRY_DELAYS_MS','tmSelectedRowE2ER3RunLockAwareManualStep_','tmSelectedRowE2ER3RunDateTimeWithScriptLock_',"yyyy-MM-dd'T'HH:mm:ss"].forEach(marker=>{if(!postR3.includes(marker))throw new Error('POST R3 missing R4.4 marker '+marker);});
  if(postR3.includes("record('REQUESTED_BY', pushSelectedPreInspectRequestedBy());"))throw new Error('POST R3 still has unguarded Requested By call');
  if(!postR4.includes('TM_FIX_PACK_R4_4_20260915'))throw new Error('POST R4 missing R4.4 version marker');

  evidence.status='DEPLOYED_SOURCE_VERIFIED'; evidence.completedAt=new Date().toISOString(); evidence.preFileCount=preNames.length; evidence.postFileCount=postNames.length; evidence.modifiedExistingFiles=changed; evidence.preSha256={}; evidence.postSha256={}; changed.forEach(n=>{evidence.preSha256[n]=preHashes[n]; evidence.postSha256[n]=postHashes[n];}); evidence.runtimeTest='RETEST_PREINSPECTION_TASK_18476_SELECTED_ROW_AFTER_LOCK_CONTENTION';
  fs.writeFileSync(evidencePath,JSON.stringify(evidence,null,2));
  console.log('=== R4.4 8/8 complete ==='); console.log('DEPLOYED_SOURCE_VERIFIED');
}catch(err){
  evidence.status='FAILED'; evidence.error=String(err&&err.stack?err.stack:err); evidence.failedAt=new Date().toISOString(); fs.writeFileSync(evidencePath,JSON.stringify(evidence,null,2));
  if(pushed){
    try{console.error('Attempting automatic rollback to PRE source...'); clasp(['push','--force'],preRoot); evidence.rollback='PRE_PUSH_ATTEMPTED'; fs.writeFileSync(evidencePath,JSON.stringify(evidence,null,2));}
    catch(rb){console.error('ROLLBACK FAILED',rb); evidence.rollback='FAILED: '+String(rb&&rb.stack?rb.stack:rb); fs.writeFileSync(evidencePath,JSON.stringify(evidence,null,2));}
  }
  throw err;
}

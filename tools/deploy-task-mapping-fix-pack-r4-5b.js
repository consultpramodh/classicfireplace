#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const cp = require('child_process');

const manifestPath = process.argv[2];
if (!manifestPath) throw new Error('Usage: node tools/deploy-task-mapping-fix-pack-r4-5b.js <release-manifest.json>');
const repoRoot = process.cwd();
const manifest = JSON.parse(fs.readFileSync(path.resolve(repoRoot, manifestPath), 'utf8'));
const scriptId = String(manifest.scriptId || '').trim();
const claspVersion = String(manifest.claspVersion || '3.3.0');
const expectedPreFileCount = Number(manifest.expectedPreFileCount || 59);
if (!scriptId) throw new Error('release manifest missing scriptId');

const targetMenu = '02_Menu.js';
const targetPI = '35_PreInspect_Task_Review.js';
const targetR3 = '96_Selected_Row_End_To_End_R3.js';
const targetR4 = '97_Task_Mapping_Fix_Pack_R4.js';
const helperSourcePath = path.resolve(repoRoot, 'patches/task-mapping/R45_PreInspect_PM_Quarantine.js');

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
function assertExactHashes(expected,actual,names,label){const bad=[];names.forEach(n=>{if(expected[n]!==actual[n])bad.push(n);});if(bad.length)throw new Error(`${label}: hash mismatch ${bad.join(', ')}`);}
function replaceOnce(text, oldText, newText, label) {
  const first = text.indexOf(oldText);
  if (first < 0) throw new Error('Missing expected source for ' + label);
  if (text.indexOf(oldText, first + oldText.length) >= 0) throw new Error('Expected one occurrence for ' + label);
  return text.slice(0, first) + newText + text.slice(first + oldText.length);
}

const oldPiPatch = `function preinspectR30PatchTask_(taskId, payload, label) {
  if (payload.SalesOrder || payload.SalesOrderId || payload.SalesOrderID || payload.SOId) {
    throw new Error('BLOCKED: PreInspect manual field pushes must never send a Sales Order relationship.');
  }

  const auth = preinspectR30ApiAuth_();
  const url = auth.apiBaseUrl + '/v2/tasks/' + encodeURIComponent(taskId);
  return preinspectR30Request_('patch', url, payload, 'PATCH_' + label);
}`;
const newPiPatch = `function preinspectR30PatchTask_(taskId, payload, label) {
  if (payload.SalesOrder || payload.SalesOrderId || payload.SalesOrderID || payload.SOId) {
    throw new Error('BLOCKED: PreInspect manual field pushes must never send a Sales Order relationship.');
  }

  if (typeof tmR45AssertPreInspectDateTimePatchSafe_ === 'function') {
    tmR45AssertPreInspectDateTimePatchSafe_(taskId, payload);
  }

  const auth = preinspectR30ApiAuth_();
  const url = auth.apiBaseUrl + '/v2/tasks/' + encodeURIComponent(taskId);
  return preinspectR30Request_('patch', url, payload, 'PATCH_' + label);
}`;

const oldR4PiBlock = `  if (ctx.division === 'PreInspection') {
    // R3 owns the corrected local-meridiem sequential PreInspection datetime transport.
    return tmSelectedRowE2ER3RunExistingOpenPreInspection_(ctx);
  }`;
const newR4PiBlock = `  if (ctx.division === 'PreInspection') {
    try {
      return tmSelectedRowE2ER3RunExistingOpenPreInspection_(ctx);
    } catch (err) {
      const message = String(err && err.message ? err.message : err);
      if (message.indexOf('BLOCKED_STRIVEN_PI_PM_PATCH_DEFECT') >= 0) {
        return tmSelectedRowE2EStop_(
          ctx,
          'BLOCKED_STRIVEN_PI_PM_PATCH_DEFECT',
          message,
          { nextDiagnostic: 'inspectSelectedPreInspectDateTimeTransportR45' }
        );
      }
      throw err;
    }
  }`;

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'task-mapping-r4-5b-'));
const preRoot = path.join(tmp,'PRE');
const freshRoot = path.join(tmp,'FRESH');
const workRoot = path.join(tmp,'WORK');
const postRoot = path.join(tmp,'POST');
[preRoot,freshRoot,workRoot,postRoot].forEach(d=>fs.mkdirSync(d,{recursive:true}));
const outputDir = path.resolve(repoRoot,'task-mapping-r4-5-output');
fs.mkdirSync(outputDir,{recursive:true});
const evidencePath = path.join(outputDir,'evidence.json');
const preArchiveDir = path.join(outputDir,'PRE_SOURCE');
const evidence = {schemaVersion:1, release:manifest.release || 'TASK_MAPPING_FIX_PACK_R4_5', scriptId, startedAt:new Date().toISOString(), status:'STARTED'};
let pushed = false;

try {
  if (!fs.existsSync(helperSourcePath)) throw new Error('Missing R4.5 helper source: ' + helperSourcePath);
  const helperSource = fs.readFileSync(helperSourcePath, 'utf8').trim();
  run(process.execPath, ['--check', helperSourcePath], repoRoot);

  console.log('=== R4.5 1/8 authorize ===');
  clasp(['show-authorized-user','--json'],repoRoot);

  console.log('=== R4.5 2/8 PRE clone ===');
  clasp(['clone',scriptId,'--rootDir','src'],preRoot);
  const preSrc = path.join(preRoot,'src');
  const preNames = listFiles(preSrc);
  if (preNames.length !== expectedPreFileCount) throw new Error(`expected ${expectedPreFileCount} PRE files, found ${preNames.length}`);
  [targetMenu,targetPI,targetR3,targetR4].forEach(n=>{if(!preNames.includes(n))throw new Error('PRE missing ' + n);});
  const preHashes = hashMap(preSrc,preNames);
  copyDir(preRoot,preArchiveDir);

  console.log('=== R4.5 3/8 build patch ===');
  copyDir(preRoot,workRoot);
  const workSrc = path.join(workRoot,'src');
  const menuPath = path.join(workSrc,targetMenu);
  const piPath = path.join(workSrc,targetPI);
  const r3Path = path.join(workSrc,targetR3);
  const r4Path = path.join(workSrc,targetR4);
  let menu = fs.readFileSync(menuPath,'utf8');
  let pi = fs.readFileSync(piPath,'utf8');
  let r3 = fs.readFileSync(r3Path,'utf8');
  let r4 = fs.readFileSync(r4Path,'utf8');

  if (!r3.includes('TM_SELECTED_ROW_E2E_R3_2_20260915')) throw new Error('Unexpected live R3.2 version marker');
  if (!r4.includes('TM_FIX_PACK_R4_4_20260915')) throw new Error('Unexpected live R4.4 version marker');

  r3 = r3.replace('TM_SELECTED_ROW_E2E_R3_2_20260915','TM_SELECTED_ROW_E2E_R3_3_20260915');
  r4 = r4.replace('TM_FIX_PACK_R4_4_20260915','TM_FIX_PACK_R4_5_20260915');

  r4 = replaceOnce(r4, oldR4PiBlock, newR4PiBlock, 'R4 PreInspection known-defect stop');
  if (!r4.includes('function tmR45AssertPreInspectDateTimePatchSafe_(')) {
    r4 += '\n\n' + helperSource + '\n';
  }

  r3 = replaceOnce(
    r3,
    '  const before = getStrivenTaskSnapshotById_(taskId, {});',
    `  tmR45AssertPreInspectDateTimePatchSafe_(taskId, {
    Id: Number(taskId),
    StartDateTime: desiredStart,
    DueDateTime: desiredDue
  });

  const before = getStrivenTaskSnapshotById_(taskId, {});`,
    'R3 all-datetime PM preflight'
  );
  r3 = replaceOnce(
    r3,
    '    const startPatch = patchStrivenTaskById_(taskId, {',
    `    tmR45AssertPreInspectDateTimePatchSafe_(taskId, {
      Id: Number(taskId),
      StartDateTime: startTransport
    });
    const startPatch = patchStrivenTaskById_(taskId, {`,
    'R3 start PM guard'
  );
  r3 = replaceOnce(
    r3,
    '    const duePatch = patchStrivenTaskById_(taskId, {',
    `    tmR45AssertPreInspectDateTimePatchSafe_(taskId, {
      Id: Number(taskId),
      DueDateTime: dueTransport
    });
    const duePatch = patchStrivenTaskById_(taskId, {`,
    'R3 due PM guard'
  );

  pi = replaceOnce(pi, oldPiPatch, newPiPatch, 'legacy PI patch PM guard');
  pi = replaceOnce(
    pi,
    '  const patchResult = patchStrivenTaskById_(taskId, payload);',
    `  tmR45AssertPreInspectDateTimePatchSafe_(taskId, payload);
  const patchResult = patchStrivenTaskById_(taskId, payload);`,
    'R3418b exact PI patch PM guard'
  );

  menu = replaceOnce(
    menu,
    "        .addItem('⚙️ Check PreInspect Config', 'testPreInspectReviewConfig')\n        .addItem('🔎 Preview Selected Create / Recovery', 'previewSelectedTaskRecovery')",
    "        .addItem('⚙️ Check PreInspect Config', 'testPreInspectReviewConfig')\n        .addItem('🕒 Diagnose Selected PI Date/Time', 'inspectSelectedPreInspectDateTimeTransportR45')\n        .addItem('🔎 Preview Selected Create / Recovery', 'previewSelectedTaskRecovery')",
    'PreInspection diagnostic menu item'
  );
  menu = replaceOnce(
    menu,
    "    'testPreInspectReviewConfig',\n    'previewSelectedTaskRecovery',",
    "    'testPreInspectReviewConfig',\n    'inspectSelectedPreInspectDateTimeTransportR45',\n    'previewSelectedTaskRecovery',",
    'PreInspection diagnostic connectivity entry'
  );

  fs.writeFileSync(menuPath,menu);
  fs.writeFileSync(piPath,pi);
  fs.writeFileSync(r3Path,r3);
  fs.writeFileSync(r4Path,r4);
  [menuPath,piPath,r3Path,r4Path].forEach(f=>run(process.execPath,['--check',f],repoRoot));

  const changed = [targetMenu,targetPI,targetR3,targetR4];
  const untouched = preNames.filter(n=>!changed.includes(n));
  assertExactHashes(preHashes,hashMap(workSrc,untouched),untouched,'WORK preservation');

  console.log('=== R4.5 4/8 freshness clone ===');
  clasp(['clone',scriptId,'--rootDir','src'],freshRoot);
  const freshSrc = path.join(freshRoot,'src');
  const freshNames = listFiles(freshSrc);
  if (JSON.stringify(freshNames) !== JSON.stringify(preNames)) throw new Error('Freshness file set changed');
  assertExactHashes(preHashes,hashMap(freshSrc,preNames),preNames,'freshness guard');

  console.log('=== R4.5 5/8 push ===');
  clasp(['push','--force'],workRoot);
  pushed = true;

  console.log('=== R4.5 6/8 POST clone ===');
  clasp(['clone',scriptId,'--rootDir','src'],postRoot);
  const postSrc = path.join(postRoot,'src');
  const postNames = listFiles(postSrc);
  if (JSON.stringify(postNames) !== JSON.stringify(preNames)) throw new Error('POST file set changed');
  const postHashes = hashMap(postSrc,postNames);
  assertExactHashes(preHashes,postHashes,untouched,'POST untouched preservation');
  changed.forEach(n=>run(process.execPath,['--check',path.join(postSrc,n)],repoRoot));

  console.log('=== R4.5 7/8 verify contracts ===');
  const postMenu = fs.readFileSync(path.join(postSrc,targetMenu),'utf8');
  const postPI = fs.readFileSync(path.join(postSrc,targetPI),'utf8');
  const postR3 = fs.readFileSync(path.join(postSrc,targetR3),'utf8');
  const postR4 = fs.readFileSync(path.join(postSrc,targetR4),'utf8');
  ['TM_SELECTED_ROW_E2E_R3_3_20260915','tmR45AssertPreInspectDateTimePatchSafe_'].forEach(m=>{if(!postR3.includes(m))throw new Error('POST R3 missing '+m);});
  ['TM_FIX_PACK_R4_5_20260915','BLOCKED_STRIVEN_PI_PM_PATCH_DEFECT','inspectSelectedPreInspectDateTimeTransportR45','knownCorrectPmReferenceTaskId'].forEach(m=>{if(!postR4.includes(m))throw new Error('POST R4 missing '+m);});
  if (!postPI.includes('tmR45AssertPreInspectDateTimePatchSafe_')) throw new Error('POST PI missing PM guard');
  if (!postMenu.includes("'inspectSelectedPreInspectDateTimeTransportR45'")) throw new Error('POST menu missing diagnostic');

  evidence.status='DEPLOYED_SOURCE_VERIFIED';
  evidence.completedAt=new Date().toISOString();
  evidence.preFileCount=preNames.length;
  evidence.postFileCount=postNames.length;
  evidence.modifiedExistingFiles=changed;
  evidence.preSha256={};
  evidence.postSha256={};
  changed.forEach(n=>{evidence.preSha256[n]=preHashes[n];evidence.postSha256[n]=postHashes[n];});
  evidence.runtimeTest='RUN_READ_ONLY_SELECTED_PI_DATETIME_DIAGNOSTIC_R45_NO_MORE_PM_PATCH_RETRIES';
  fs.writeFileSync(evidencePath,JSON.stringify(evidence,null,2));
  console.log('=== R4.5 8/8 complete ===');
  console.log('DEPLOYED_SOURCE_VERIFIED');
} catch (err) {
  evidence.status='FAILED';
  evidence.error=String(err&&err.stack?err.stack:err);
  evidence.failedAt=new Date().toISOString();
  fs.writeFileSync(evidencePath,JSON.stringify(evidence,null,2));
  if (pushed) {
    try {
      console.error('Attempting automatic rollback to PRE source...');
      clasp(['push','--force'],preRoot);
      evidence.rollback='PRE_PUSH_ATTEMPTED';
      fs.writeFileSync(evidencePath,JSON.stringify(evidence,null,2));
    } catch (rb) {
      evidence.rollback='FAILED: '+String(rb&&rb.stack?rb.stack:rb);
      fs.writeFileSync(evidencePath,JSON.stringify(evidence,null,2));
    }
  }
  throw err;
}

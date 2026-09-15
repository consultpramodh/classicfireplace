#!/usr/bin/env node
'use strict';
const fs=require('fs'), os=require('os'), path=require('path'), crypto=require('crypto'), cp=require('child_process');
const manifestPath=process.argv[2]; if(!manifestPath) throw new Error('Usage: node deploy-r4-5.js <manifest.json>');
const repoRoot=process.cwd(); const manifest=JSON.parse(fs.readFileSync(path.resolve(repoRoot,manifestPath),'utf8'));
const scriptId=String(manifest.scriptId||'').trim(); const claspVersion=String(manifest.claspVersion||'3.3.0'); const expectedPreFileCount=Number(manifest.expectedPreFileCount||59);
if(!scriptId) throw new Error('release manifest missing scriptId');
const targetR3='96_Selected_Row_End_To_End_R3.js', targetR4='97_Task_Mapping_Fix_Pack_R4.js', targetPI='35_PreInspect_Task_Review.js', targetMenu='02_Menu.js';
function run(c,a,cwd){const r=cp.spawnSync(c,a,{cwd,env:process.env,encoding:'utf8',stdio:['ignore','pipe','pipe']});process.stdout.write(r.stdout||'');process.stderr.write(r.stderr||'');if(r.status!==0)throw new Error(`${c} ${a.join(' ')} failed with exit ${r.status}`);return r.stdout||'';}
function clasp(a,cwd){return run('npx',['-y',`@google/clasp@${claspVersion}`,...a],cwd);} function sha256(f){return crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');}
function listFiles(d){return fs.readdirSync(d,{withFileTypes:true}).filter(e=>e.isFile()).map(e=>e.name).sort();} function hashMap(d,n){const o={};n.forEach(x=>o[x]=sha256(path.join(d,x)));return o;} function copyDir(s,d){fs.cpSync(s,d,{recursive:true});}
function assertExactHashes(e,a,n,l){const bad=[];n.forEach(x=>{if(e[x]!==a[x])bad.push(x)});if(bad.length)throw new Error(`${l}: hash mismatch ${bad.join(', ')}`);}
function replaceOnce(t,o,n,l){const i=t.indexOf(o);if(i<0)throw new Error('Missing expected source for '+l);if(t.indexOf(o,i+o.length)>=0)throw new Error('Expected one occurrence for '+l);return t.slice(0,i)+n+t.slice(i+o.length);}
function replaceNamedFunction(source,name,replacement){const esc=name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');const sig=new RegExp(`function\\s+${esc}\\s*\\(`);const m=sig.exec(source);if(!m)throw new Error('Could not find function '+name);const start=m.index, braceStart=source.indexOf('{',m.index+m[0].length);if(braceStart<0)throw new Error('Could not find opening brace for '+name);let depth=0,quote=null,escaped=false,lineComment=false,blockComment=false;for(let i=braceStart;i<source.length;i++){const ch=source[i],next=source[i+1];if(lineComment){if(ch==='\n')lineComment=false;continue;}if(blockComment){if(ch==='*'&&next==='/'){blockComment=false;i++;}continue;}if(quote){if(escaped){escaped=false;continue;}if(ch==='\\'){escaped=true;continue;}if(ch===quote)quote=null;continue;}if(ch==='/'&&next==='/'){lineComment=true;i++;continue;}if(ch==='/'&&next==='*'){blockComment=true;i++;continue;}if(ch==='\''||ch==='"'||ch==='`'){quote=ch;continue;}if(ch==='{')depth++;else if(ch==='}'){depth--;if(depth===0)return source.slice(0,start)+replacement.trim()+source.slice(i+1);}}throw new Error('Could not find closing brace for '+name);}

const r30PatchReplacement=`function preinspectR30PatchTask_(taskId, payload, label) {
  if (payload.SalesOrder || payload.SalesOrderId || payload.SalesOrderID || payload.SOId) {
    throw new Error('BLOCKED: PreInspect manual field pushes must never send a Sales Order relationship.');
  }

  // R4.5: Task Type 105 PM PATCH quarantine. Multiple production read-backs
  // proved that /v2/tasks/{id} collapses hours 13-23 by 12 hours for
  // PreInspection schedule writes. Fail before another bad mutation.
  if (typeof tmR45AssertPreInspectDateTimePatchSafe_ === 'function') {
    tmR45AssertPreInspectDateTimePatchSafe_(taskId, payload);
  }

  const auth = preinspectR30ApiAuth_();
  const url = auth.apiBaseUrl + '/v2/tasks/' + encodeURIComponent(taskId);
  return preinspectR30Request_('patch', url, payload, 'PATCH_' + label);
}`;

const r4CatchOld=`  if (ctx.division === 'PreInspection') {
    // R3 owns the corrected local-meridiem sequential PreInspection datetime transport.
    return tmSelectedRowE2ER3RunExistingOpenPreInspection_(ctx);
  }`;
const r4CatchNew=`  if (ctx.division === 'PreInspection') {
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

const helperText=`

/************************************************************
 * R4.5 — PREINSPECTION PM PATCH QUARANTINE + DIAGNOSTIC
 ************************************************************/
function tmR45PreInspectLocalHour_(value) {
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return null;
  let tz = 'America/Toronto';
  if (typeof preinspectR3418bTimezone_ === 'function') tz = preinspectR3418bTimezone_() || tz;
  else if (typeof tm_getTimezone_ === 'function') tz = tm_getTimezone_() || tz;
  const h = Number(Utilities.formatDate(d, tz, 'H'));
  return isFinite(h) ? h : null;
}

function tmR45AssertPreInspectDateTimePatchSafe_(taskId, payload) {
  const fields = ['StartDateTime', 'DueDateTime'];
  const unsafe = [];
  fields.forEach(function(field) {
    if (!payload || payload[field] === null || payload[field] === undefined || String(payload[field]).trim() === '') return;
    const hour = tmR45PreInspectLocalHour_(payload[field]);
    if (hour !== null && hour >= 13) unsafe.push({ field: field, hour24: hour, value: String(payload[field]) });
  });
  if (!unsafe.length) return { status: 'SAFE_FOR_KNOWN_PATCH_DEFECT', taskId: Number(taskId), fieldsChecked: fields };
  throw new Error(
    'BLOCKED_STRIVEN_PI_PM_PATCH_DEFECT: PreInspection Task Type 105 PM schedule PATCH is quarantined. ' +
    'Repeated authoritative read-backs showed Striven /v2/tasks/{id} storing hours 13-23 twelve hours early. ' +
    'Task=' + taskId + '; Unsafe=' + JSON.stringify(unsafe) + '. No Striven write attempted. ' +
    'Run Pre Inspect > Diagnostics / Preview > Diagnose Selected PI Date/Time for read-only v1/v2 evidence.'
  );
}

function tmR45PickDateField_(obj, names) {
  obj = obj && typeof obj === 'object' ? obj : {};
  for (let i = 0; i < names.length; i++) {
    if (obj[names[i]] !== undefined && obj[names[i]] !== null) return obj[names[i]];
  }
  return null;
}

function tmR45ReadTaskDateModels_(taskId) {
  const auth = preinspectR30ApiAuth_();
  const base = String(auth.apiBaseUrl || 'https://api.striven.com').replace(/\/+$/, '');
  const result = { taskId: Number(taskId), v2: null, v1: null, errors: [] };
  try {
    const v2res = preinspectR30Request_('get', base + '/v2/tasks/' + encodeURIComponent(taskId), null, 'R45_V2_TASK_READ');
    const v2 = v2res && v2res.json && typeof v2res.json === 'object' ? v2res.json : {};
    result.v2 = {
      statusCode: v2res.statusCode,
      startDateTime: tmR45PickDateField_(v2, ['startDateTime','StartDateTime','startDate','StartDate']),
      dueDateTime: tmR45PickDateField_(v2, ['dueDateTime','DueDateTime','dueDate','DueDate']),
      dateModified: tmR45PickDateField_(v2, ['dateModified','DateModified','modifiedDate','ModifiedDate']),
      taskType: tmR45PickDateField_(v2, ['taskType','TaskType','type','Type']),
      status: tmR45PickDateField_(v2, ['status','Status'])
    };
  } catch (err) {
    result.errors.push({ source: 'v2', message: String(err && err.message ? err.message : err) });
  }
  try {
    const v1res = preinspectR30Request_('get', base + '/v1/tasks/' + encodeURIComponent(taskId), null, 'R45_V1_TASK_READ');
    const v1 = v1res && v1res.json && typeof v1res.json === 'object' ? v1res.json : {};
    result.v1 = {
      statusCode: v1res.statusCode,
      desiredStartDate: tmR45PickDateField_(v1, ['desiredStartDate','DesiredStartDate','startDate','StartDate']),
      desiredEndDate: tmR45PickDateField_(v1, ['desiredEndDate','DesiredEndDate','dueDate','DueDate']),
      dateRequested: tmR45PickDateField_(v1, ['dateRequested','DateRequested']),
      dateModified: tmR45PickDateField_(v1, ['dateModified','DateModified']),
      taskTypeId: tmR45PickDateField_(v1, ['taskTypeId','TaskTypeId','taskTypeID','TaskTypeID']),
      status: tmR45PickDateField_(v1, ['status','Status']),
      statusId: tmR45PickDateField_(v1, ['statusId','StatusId','statusID','StatusID'])
    };
  } catch (err) {
    result.errors.push({ source: 'v1', message: String(err && err.message ? err.message : err) });
  }
  return result;
}

function inspectSelectedPreInspectDateTimeTransportR45() {
  const ctx = tmSelectedRowE2EReadContext_();
  if (!ctx || ctx.division !== 'PreInspection') throw new Error('Select a PreInspect Task Mapping data row first.');
  if (!ctx.taskId) throw new Error('Selected PreInspection row has no Task ID.');

  const freshCalendar = tmR4_assertSelectedCalendarFresh_(ctx);
  const mapping = tmR4_readSelectedMapping_(ctx);
  const row = mapping.row || {};
  let preview = null;
  try { preview = JSON.parse(String(row['Patch Preview'] || '').trim() || '{}'); } catch (err) { preview = { parseError: String(err && err.message ? err.message : err) }; }

  const selected = tmR45ReadTaskDateModels_(ctx.taskId);
  const controlTaskId = 18309;
  const control = Number(ctx.taskId) === controlTaskId ? null : tmR45ReadTaskDateModels_(controlTaskId);

  const result = {
    mode: 'PREINSPECT_R45_DATETIME_TRANSPORT_DIAGNOSTIC',
    status: 'READ_ONLY_COMPLETE',
    writesPerformed: false,
    strivenWritesPerformed: false,
    calendarWritesPerformed: false,
    mappingRow: ctx.rowNumber,
    eventId: ctx.eventId,
    taskId: Number(ctx.taskId),
    mapping: {
      calendarStart: String(row['Calendar Start'] || ''),
      calendarEnd: String(row['Calendar End'] || ''),
      taskStart: String(row['Task Start'] || ''),
      taskDue: String(row['Task Due'] || ''),
      taskAction: String(row['Task Action'] || ''),
      patchPreview: preview
    },
    freshCalendar: freshCalendar,
    selectedTaskModels: selected,
    knownCorrectPmReferenceTaskId: controlTaskId,
    knownCorrectPmReferenceModels: control,
    safety: 'READ_ONLY_NO_STRIVEN_OR_CALENDAR_WRITE',
    purpose: 'Compare v2 StartDateTime/DueDateTime with legacy v1 DesiredStartDate/DesiredEndDate before selecting an alternate supported update path.'
  };
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}
`;

const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'task-mapping-r4-5-'));
const preRoot=path.join(tmp,'PRE'),freshRoot=path.join(tmp,'FRESH'),workRoot=path.join(tmp,'WORK'),postRoot=path.join(tmp,'POST'); [preRoot,freshRoot,workRoot,postRoot].forEach(d=>fs.mkdirSync(d,{recursive:true}));
const outputDir=path.resolve(repoRoot,'task-mapping-r4-5-output');fs.mkdirSync(outputDir,{recursive:true});const evidencePath=path.join(outputDir,'evidence.json'),preArchiveDir=path.join(outputDir,'PRE_SOURCE');
const evidence={schemaVersion:1,release:manifest.release||'TASK_MAPPING_FIX_PACK_R4_5',scriptId,startedAt:new Date().toISOString(),status:'STARTED'};let pushed=false;
try{
 console.log('=== R4.5 1/8 authorize ===');clasp(['show-authorized-user','--json'],repoRoot);
 console.log('=== R4.5 2/8 PRE clone ===');clasp(['clone',scriptId,'--rootDir','src'],preRoot);const preSrc=path.join(preRoot,'src'),preNames=listFiles(preSrc);if(preNames.length!==expectedPreFileCount)throw new Error(`expected ${expectedPreFileCount} PRE files, found ${preNames.length}`);[targetR3,targetR4,targetPI,targetMenu].forEach(n=>{if(!preNames.includes(n))throw new Error('PRE missing '+n)});const preHashes=hashMap(preSrc,preNames);copyDir(preRoot,preArchiveDir);
 console.log('=== R4.5 3/8 build patch ===');copyDir(preRoot,workRoot);const workSrc=path.join(workRoot,'src');const p3=path.join(workSrc,targetR3),p4=path.join(workSrc,targetR4),ppi=path.join(workSrc,targetPI),pmenu=path.join(workSrc,targetMenu);let r3=fs.readFileSync(p3,'utf8'),r4=fs.readFileSync(p4,'utf8'),pi=fs.readFileSync(ppi,'utf8'),menu=fs.readFileSync(pmenu,'utf8');
 if(!r3.includes('TM_SELECTED_ROW_E2E_R3_2_20260915'))throw new Error('Unexpected live R3.2 marker');if(!r4.includes('TM_FIX_PACK_R4_4_20260915'))throw new Error('Unexpected live R4.4 marker');
 r3=r3.replace('TM_SELECTED_ROW_E2E_R3_2_20260915','TM_SELECTED_ROW_E2E_R3_3_20260915');
 r4=r4.replace('TM_FIX_PACK_R4_4_20260915','TM_FIX_PACK_R4_5_20260915');
 r4=replaceOnce(r4,r4CatchOld,r4CatchNew,'R4 PI external API block handling');
 if(!r4.includes('function tmR45AssertPreInspectDateTimePatchSafe_(')) r4+=helperText;
 r3=replaceOnce(r3,"    const startPatch = patchStrivenTaskById_(taskId, {","    tmR45AssertPreInspectDateTimePatchSafe_(taskId, { Id: Number(taskId), StartDateTime: startTransport });\n    const startPatch = patchStrivenTaskById_(taskId, {",'R3 start PM guard');
 r3=replaceOnce(r3,"    const duePatch = patchStrivenTaskById_(taskId, {","    tmR45AssertPreInspectDateTimePatchSafe_(taskId, { Id: Number(taskId), DueDateTime: dueTransport });\n    const duePatch = patchStrivenTaskById_(taskId, {",'R3 due PM guard');
 pi=replaceNamedFunction(pi,'preinspectR30PatchTask_',r30PatchReplacement);
 pi=replaceOnce(pi,'  const patchResult = patchStrivenTaskById_(taskId, payload);','  tmR45AssertPreInspectDateTimePatchSafe_(taskId, payload);\n  const patchResult = patchStrivenTaskById_(taskId, payload);','R3418b PM guard');
 menu=replaceOnce(menu,"        .addItem('⚙️ Check PreInspect Config', 'testPreInspectReviewConfig')\n        .addItem('🔎 Preview Selected Create / Recovery', 'previewSelectedTaskRecovery')","        .addItem('⚙️ Check PreInspect Config', 'testPreInspectReviewConfig')\n        .addItem('🕒 Diagnose Selected PI Date/Time', 'inspectSelectedPreInspectDateTimeTransportR45')\n        .addItem('🔎 Preview Selected Create / Recovery', 'previewSelectedTaskRecovery')",'PI diagnostic menu');
 menu=replaceOnce(menu,"    'testPreInspectReviewConfig',\n    'previewSelectedTaskRecovery',","    'testPreInspectReviewConfig',\n    'inspectSelectedPreInspectDateTimeTransportR45',\n    'previewSelectedTaskRecovery',",'PI audit function list');
 fs.writeFileSync(p3,r3);fs.writeFileSync(p4,r4);fs.writeFileSync(ppi,pi);fs.writeFileSync(pmenu,menu);[p3,p4,ppi,pmenu].forEach(f=>run(process.execPath,['--check',f],repoRoot));
 const changed=[targetMenu,targetPI,targetR3,targetR4],untouched=preNames.filter(n=>!changed.includes(n));assertExactHashes(preHashes,hashMap(workSrc,untouched),untouched,'WORK preservation');
 console.log('=== R4.5 4/8 freshness clone ===');clasp(['clone',scriptId,'--rootDir','src'],freshRoot);const freshSrc=path.join(freshRoot,'src'),freshNames=listFiles(freshSrc);if(JSON.stringify(freshNames)!==JSON.stringify(preNames))throw new Error('Freshness file set changed');assertExactHashes(preHashes,hashMap(freshSrc,preNames),preNames,'freshness guard');
 console.log('=== R4.5 5/8 push ===');clasp(['push','--force'],workRoot);pushed=true;
 console.log('=== R4.5 6/8 POST clone ===');clasp(['clone',scriptId,'--rootDir','src'],postRoot);const postSrc=path.join(postRoot,'src'),postNames=listFiles(postSrc);if(JSON.stringify(postNames)!==JSON.stringify(preNames))throw new Error('POST file set changed');const postHashes=hashMap(postSrc,postNames);assertExactHashes(preHashes,postHashes,untouched,'POST untouched preservation');changed.forEach(n=>run(process.execPath,['--check',path.join(postSrc,n)],repoRoot));
 console.log('=== R4.5 7/8 verify contracts ===');const postR3=fs.readFileSync(path.join(postSrc,targetR3),'utf8'),postR4=fs.readFileSync(path.join(postSrc,targetR4),'utf8'),postPI=fs.readFileSync(path.join(postSrc,targetPI),'utf8'),postMenu=fs.readFileSync(path.join(postSrc,targetMenu),'utf8');['TM_SELECTED_ROW_E2E_R3_3_20260915','tmR45AssertPreInspectDateTimePatchSafe_'].forEach(m=>{if(!postR3.includes(m))throw new Error('POST R3 missing '+m)});['TM_FIX_PACK_R4_5_20260915','BLOCKED_STRIVEN_PI_PM_PATCH_DEFECT','inspectSelectedPreInspectDateTimeTransportR45','knownCorrectPmReferenceTaskId'].forEach(m=>{if(!postR4.includes(m))throw new Error('POST R4 missing '+m)});if(!postPI.includes('tmR45AssertPreInspectDateTimePatchSafe_'))throw new Error('POST PI missing PM guard');if(!postMenu.includes("'inspectSelectedPreInspectDateTimeTransportR45'"))throw new Error('POST menu missing diagnostic');
 evidence.status='DEPLOYED_SOURCE_VERIFIED';evidence.completedAt=new Date().toISOString();evidence.preFileCount=preNames.length;evidence.postFileCount=postNames.length;evidence.modifiedExistingFiles=changed;evidence.preSha256={};evidence.postSha256={};changed.forEach(n=>{evidence.preSha256[n]=preHashes[n];evidence.postSha256[n]=postHashes[n]});evidence.runtimeTest='RUN_READ_ONLY_SELECTED_PI_DATETIME_DIAGNOSTIC_R45_NO_MORE_PM_PATCH_RETRIES';fs.writeFileSync(evidencePath,JSON.stringify(evidence,null,2));console.log('=== R4.5 8/8 complete ===');console.log('DEPLOYED_SOURCE_VERIFIED');
}catch(err){evidence.status='FAILED';evidence.error=String(err&&err.stack?err.stack:err);evidence.failedAt=new Date().toISOString();fs.writeFileSync(evidencePath,JSON.stringify(evidence,null,2));if(pushed){try{console.error('Attempting automatic rollback to PRE source...');clasp(['push','--force'],preRoot);evidence.rollback='PRE_PUSH_ATTEMPTED';fs.writeFileSync(evidencePath,JSON.stringify(evidence,null,2));}catch(rb){evidence.rollback='FAILED: '+String(rb&&rb.stack?rb.stack:rb);fs.writeFileSync(evidencePath,JSON.stringify(evidence,null,2));}}throw err;}

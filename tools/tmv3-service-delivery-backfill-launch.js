// JavaScript / Node.js: short-lived, token-authenticated launch of the fixed native backlog.
'use strict';
const fs=require('node:fs'),crypto=require('node:crypto'),vm=require('node:vm');
const {canonical}=require('./tmv3-relationship-function-patch');
const scriptId='1shaSL1CeNhR2-fr8H4x0fP2KUIjpOizLFyrNRAnGGXkCvERX4hZyJ5Gt';
const expected='2d0bdfa3a6612fb931c81e6e1bbf6e38e78ec78cea81bc7b369d83008572fe45';
const dir='autopatch-output-sd-backfill-launch';
function deepFind(o,keys){if(!o||typeof o!=='object')return '';for(const [k,v]of Object.entries(o))if(keys.includes(k)&&typeof v==='string'&&v)return v;for(const v of Object.values(o)){const found=deepFind(v,keys);if(found)return found;}return '';}
function runner(digest,expires){
 if(!/^[a-f0-9]{64}$/.test(digest)||!Number.isSafeInteger(expires))throw Error('INVALID_AUTH_CONFIGURATION');
 return `// Google Apps Script: fixed queue only, expiring bearer authentication; no caller-selected IDs or actions.
function doPost(e) {
  var response;
  try {
    var body=JSON.parse(e && e.postData && e.postData.contents || '{}');
    var digest=Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,String(body.token || ''))
      .map(function(b){return ('0'+((b+256)%256).toString(16)).slice(-2);}).join('');
    if (Date.now()>${expires} || digest!=='${digest}' || body.action!=='FIXED_SD_ORDER_BACKFILL') throw new Error('UNAUTHORIZED');
    response={ok:true,result:tmv3_serviceDeliveryOrderBackfill()};
  } catch(err) {response={ok:false,error:String(err && err.message || err).slice(0,500)};}
  return ContentService.createTextOutput(JSON.stringify(response)).setMimeType(ContentService.MimeType.JSON);
}
`;
}
function cacheRunner(digest,expires){return runner(digest,expires).replaceAll('FIXED_SD_ORDER_BACKFILL','FIXED_SD_CACHE_REPAIR').replace('tmv3_serviceDeliveryOrderBackfill()','tmv3_fixedBackfillCacheRepair_()')+'\n'+"// Google Apps Script: reconcile report cache from fresh existing Task GETs; no Striven mutations.\nfunction tmv3_fixedBackfillCacheRepair_() {\n  const lock=LockService.getScriptLock();\n  if(!lock.tryLock(20000))throw new Error('CACHE_REPAIR_LOCK_BUSY');\n  try {\n    const sh=tmv3_sheet_(TMV3.SHEETS.TASKS);\n    const headers=['Task ID','Task Number','Task Type ID','Task Type','Status','Name','Customer ID','Location ID','Contact ID','Order ID','Start','Due','Assignees','Pools','URL','Fingerprint'];\n    const current=sh.getRange(1,1,1,16).getValues()[0].map(tmv3_clean_);\n    if(JSON.stringify(current)!==JSON.stringify(headers))throw new Error('CACHE_SCHEMA_DRIFT');\n    const ids=[16025,18979,19098,19126,19221,19262,19281];\n    const models={},result=[];\n    ids.forEach(function(id){\n      const task=tmv3_normalizeV2TaskModel_(tmv3_rawTaskById_(id));\n      if(String(task['Task ID'])!==String(id) || !tmv3_clean_(task.Name) ||\n        !/service|deliver/.test(tmv3_norm_(task['Task Type']))) {\n        result.push({taskId:id,status:'FRESH_IDENTITY_NOT_USABLE',actualId:task['Task ID'],type:task['Task Type'],taskStatus:task.Status});return;\n      }\n      models[id]=task;\n    });\n    function rows(){return sh.getRange(2,1,sh.getLastRow()-1,16).getValues();}\n    function find(id){return rows().map(function(row,i){return {row:row,index:i+2};}).filter(function(x){return String(x.row[0])===String(id);});}\n    const backup={at:new Date().toISOString(),rows:rows().map(function(row,i){return {row:i+2,values:row};}).filter(function(x){return ids.indexOf(Number(x.values[0]))>=0;})};\n    const serialized=JSON.stringify(backup);\n    if(serialized.length>8000)throw new Error('CACHE_BACKUP_TOO_LARGE_NO_WRITE');\n    PropertiesService.getScriptProperties().setProperty('TMV3_SD_CACHE_REPAIR_PRE_20261020',serialized);\n    // The captured pre-backfill snapshot proves row2501 held16025. Restore only the exact observed duplicate state.\n    if(!find(16025).length && models[16025]) {\n      const duplicate=find(19281);\n      if(duplicate.length!==2 || duplicate[0].index!==2501 || String(sh.getRange(2501,1).getValue())!=='19281')throw new Error('CACHE_RESTORE_PRECONDITION_DRIFT');\n      const task=models[16025],schedule=tmv3_getCanonicalV1TaskSchedule_(16025);\n      task.Start=schedule.startDateTime || '';task.Due=schedule.dueDateTime || '';\n      const row=headers.map(function(h){return task[h]===undefined?'':task[h];});\n      row[15]=tmv3_hash_(row.slice(0,14).map(String).join('|'));\n      sh.getRange(2501,1,1,16).setValues([row]);\n      if(String(sh.getRange(2501,1).getValue())!=='16025')throw new Error('RESTORED_TASK_CACHE_READBACK_FAILED');\n      result.push({taskId:16025,status:'RESTORED_CACHE_FROM_FRESH_API',orderId:task['Order ID'],taskStatus:task.Status});\n    }\n    ids.filter(function(id){return id!==16025 && models[id];}).forEach(function(id){\n      const task=models[id],matches=find(id);\n      if(matches.length>1)throw new Error('CACHE_TASK_DUPLICATE_'+id);\n      let target=matches.length?matches[0].index:sh.getLastRow()+1;\n      if(matches.length && String(sh.getRange(target,1).getValue())!==String(id))throw new Error('CACHE_ROW_MOVED_'+id);\n      const row=matches.length?matches[0].row.slice():headers.map(function(h){return task[h]===undefined?'':task[h];});\n      for(let c=0;c<10;c++)row[c]=task[headers[c]]===undefined?'':task[headers[c]];\n      row[15]=tmv3_hash_(row.slice(0,14).map(String).join('|'));\n      sh.getRange(target,1,1,16).setValues([row]);\n      const after=find(id);\n      if(after.length!==1 || tmv3_clean_(after[0].row[9])!==tmv3_clean_(task['Order ID']))throw new Error('CACHE_TASK_READBACK_FAILED_'+id);\n      result.push({taskId:id,status:'CACHE_RECONCILED',orderId:task['Order ID'],taskStatus:task.Status,hasCustomer:Boolean(task['Customer ID'])});\n    });\n    tmv3_audit_('SYSTEM','','','SD_ORDER_CACHE_RECONCILE','PASS',JSON.stringify({strivenWrites:0,result:result}));\n    return {status:'CACHE_RECONCILED',strivenWrites:0,result:result,apiBudget:tmv3_strivenApiBudgetStatus_()};\n  } finally {lock.releaseLock();}\n}\n";}
function requestedByRunner(digest,expires) {
 const ids=JSON.parse(fs.readFileSync('release-candidates/tmv3-service-delivery-order-backfill-20261020.json','utf8')).taskIds;
 if(ids.length!==81 || new Set(ids).size!==81)throw Error('FIXED_TARGET_DRIFT');
 return runner(digest,expires).replaceAll('FIXED_SD_ORDER_BACKFILL','FIXED_SD_REQUESTED_BY').replace('tmv3_serviceDeliveryOrderBackfill()','tmv3_sdRequestedByBackfill_()')+'\nconst TMV3_SD_REQUESTED_BY_IDS='+JSON.stringify(ids)+';\n'+fs.readFileSync('tools/tmv3-sd-requested-by-native.js','utf8');
}
function openRefreshRunner(digest,expires) {
 const results=JSON.parse(fs.readFileSync('ops/tmv3-service-delivery-requested-by-results-20261021.json','utf8')).results;
 const ids=results.filter(r=>['VERIFIED','PRESENT'].includes(r.state)).map(r=>r.taskId).concat([18920,19182]);
 if(ids.length!==73 || new Set(ids).size!==73)throw Error('HYDRATION_TARGET_DRIFT');
 return runner(digest,expires).replaceAll('FIXED_SD_ORDER_BACKFILL','FIXED_OPEN_TASK_REFRESH').replace('tmv3_serviceDeliveryOrderBackfill()','tmv3_openTasksRefresh_()')+'\nconst TMV3_OPEN_REFRESH_HYDRATE_IDS='+JSON.stringify(ids)+';\n'+fs.readFileSync('tools/tmv3-open-tasks-refresh-native.js','utf8');
}
async function main(mode){
 fs.mkdirSync(dir,{recursive:true,mode:0o700});
 const config=JSON.parse(process.env.CLASPRC_JSON||'{}');
 const form=new URLSearchParams({grant_type:'refresh_token',client_id:deepFind(config,['clientId','client_id']),client_secret:deepFind(config,['clientSecret','client_secret']),refresh_token:deepFind(config,['refresh_token','refreshToken'])});
 if([...form.values()].some(v=>!v))throw Error('OAUTH_CONFIGURATION_MISSING');
 const refresh=await fetch('https://oauth2.googleapis.com/token',{method:'POST',body:form,redirect:'error'});
 if(!refresh.ok)throw Error('OAUTH_REFRESH_FAILED');const auth=await refresh.json();if(!auth.access_token)throw Error('NO_ACCESS_TOKEN');
 const api=async(path,method='GET',body)=>{
  const res=await fetch('https://script.googleapis.com/v1/projects/'+scriptId+path,{method,headers:{Authorization:'Bearer '+auth.access_token,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),redirect:'error'});
  if(!res.ok){const error=await res.json().catch(()=>({}));throw Error('APPS_SCRIPT_MANAGEMENT_'+method+'_'+path+'_HTTP_'+res.status+':'+String(error.error && error.error.message || '').slice(0,250));}
  return res.status===204?{}:res.json();
 };
 if(mode==='restore'){
  const before=JSON.parse(fs.readFileSync(dir+'/before.json'));
  const temporary=JSON.parse(fs.readFileSync(dir+'/temporary-source-backup.json'));
  if(canonical(before)!==expected||canonical(temporary)!=='32132659bf84e6c58f332be50d08b7cff41bba05bb38132285ae6c223707ff03')throw Error('RESTORE_ARTIFACT_IDENTITY_MISMATCH_NO_WRITE');
  const live=canonical(await api('/content'));
  if(live!==expected&&live!==canonical(temporary))throw Error('CONCURRENT_SOURCE_DRIFT_NO_RESTORE');
  if(live!==expected)await api('/content','PUT',{files:before.files});
  const finalHash=canonical(await api('/content'));
  if(finalHash!==expected)throw Error('RESTORE_READBACK_FAILED');
  console.log(JSON.stringify({status:'EXACT_PRE_SOURCE_RESTORED',finalHash,taskWrites:0}));return;
 }
 if(mode==='inspect'){
  const live=await api('/content');
  if(live.files.some(f=>/Bearer\s+[A-Za-z0-9_.-]{24,}|(?:api[_-]?key|client[_-]?secret|access[_-]?token|refresh[_-]?token)\s*[:=]\s*['"][A-Za-z0-9_./+-]{20,}['"]/i.test(f.source||'')))throw Error('POSSIBLE_SOURCE_SECRET_NO_EXPORT');
  const metadata={status:'LIVE_SOURCE_INSPECTED_NO_WRITE',actualHash:canonical(live),expectedHash:expected,files:live.files.map(f=>({name:f.name,type:f.type,sha256:crypto.createHash('sha256').update(f.source||'').digest('hex')}))};
  fs.writeFileSync(dir+'/inspected-source.json',JSON.stringify(live),{mode:0o600});
  fs.writeFileSync(dir+'/inspection.json',JSON.stringify(metadata,null,2),{mode:0o600});
  console.log(JSON.stringify(metadata));return;
 }
 if(mode==='prepare'){
  const before=await api('/content');if(canonical(before)!==expected)throw Error('LIVE_PROJECT_DRIFT_NO_WRITE');
  if(before.files.some(f=>/function\s+doPost\s*\(/.test(f.source||'')))throw Error('EXISTING_POST_HANDLER_NO_WRITE');
  fs.writeFileSync(dir+'/before.json',JSON.stringify(before),{mode:0o600});
  fs.writeFileSync(dir+'/prepared.json',JSON.stringify({beforeHash:expected,scope:process.env.TMV3_BACKFILL_LAUNCH_KIND==='OPEN_REFRESH'?'ALL_OPEN_TASK_CACHE_AND_SAMUELS_18983':process.env.TMV3_BACKFILL_LAUNCH_KIND==='REQUESTED_BY'?'FIXED_81_REQUESTED_BY':'FIXED_81_ORDER_LINK_BACKFILL',runtimeWritesAuthorized:true}),{mode:0o600});
  console.log('LAUNCH_PREPARED_DURABLE_BACKUP_REQUIRED');return;
 }
 if(mode!=='run')throw Error('UNKNOWN_MODE');
 const before=JSON.parse(fs.readFileSync(dir+'/before.json'));
 if(canonical(before)!==expected || canonical(await api('/content'))!==expected)throw Error('LIVE_PROJECT_DRIFT_NO_WRITE');
 const token=crypto.randomBytes(32).toString('hex'),digest=crypto.createHash('sha256').update(token).digest('hex');
 const cacheOnly=process.env.TMV3_BACKFILL_LAUNCH_KIND==='CACHE_REPAIR';
 const requestedBy=process.env.TMV3_BACKFILL_LAUNCH_KIND==='REQUESTED_BY';
 const openRefresh=process.env.TMV3_BACKFILL_LAUNCH_KIND==='OPEN_REFRESH';
 const source=(openRefresh?openRefreshRunner:requestedBy?requestedByRunner:cacheOnly?cacheRunner:runner)(digest,Date.now()+5*60000);new vm.Script(source);
 const temporary={files:before.files.map(f=>{
  if(f.name!=='appsscript')return f;
  const manifest=JSON.parse(f.source);manifest.webapp={access:'ANYONE_ANONYMOUS',executeAs:'USER_DEPLOYING'};
  return {...f,source:JSON.stringify(manifest,null,2)};
 }).concat([{name:'zz_sd_order_backfill_launch',type:'SERVER_JS',source}])};
 const inventory=await api('/deployments');
 const head=(inventory.deployments||[]).filter(d=>!(d.deploymentConfig && d.deploymentConfig.versionNumber) && (d.entryPoints||[]).some(e=>e.webApp));
 if(head.length!==1 || !head[0].deploymentId)throw Error('EXACTLY_ONE_EXISTING_HEAD_WEB_APP_REQUIRED');
 const tempHash=canonical(temporary);let sourceAttempted=false,headRestored=false;
 const result={status:'NOT_STARTED',beforeHash:expected,scope:process.env.TMV3_BACKFILL_LAUNCH_KIND==='OPEN_REFRESH'?'ALL_OPEN_TASK_CACHE_AND_SAMUELS_18983':process.env.TMV3_BACKFILL_LAUNCH_KIND==='REQUESTED_BY'?'FIXED_81_REQUESTED_BY':'FIXED_81_ORDER_LINK_BACKFILL',existingDeploymentsChanged:false,oauthScopesChanged:false,usingExistingHead:true,versionsCreated:0};
 try {
  sourceAttempted=true;await api('/content','PUT',temporary);
  if(canonical(await api('/content'))!==tempHash)throw Error('TEMPORARY_SOURCE_READBACK_MISMATCH');
  fs.writeFileSync(dir+'/temporary-source-backup.json',JSON.stringify(temporary),{mode:0o600});
  // Existing authorized HEAD deployment avoids the full 200-version inventory.
  const url='https://script.google.com/macros/s/'+encodeURIComponent(head[0].deploymentId)+'/dev';
  // Exactly one launch request; a timeout is an uncertain outcome, never an HTTP retry.
  const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+auth.access_token},body:JSON.stringify({token,action:openRefresh?'FIXED_OPEN_TASK_REFRESH':requestedBy?'FIXED_SD_REQUESTED_BY':cacheOnly?'FIXED_SD_CACHE_REPAIR':'FIXED_SD_ORDER_BACKFILL'}),redirect:'follow',signal:AbortSignal.timeout(150000)});
  if(!response.ok)throw Error('LAUNCH_HTTP_'+response.status);
  const body=await response.json();
  if(!body.ok)throw Error('NATIVE_LAUNCH_REJECTED_'+String(body.error||'UNKNOWN'));
  result.native=body.result;result.status='NATIVE_BACKFILL_LAUNCHED';
 }catch(err){result.status='LAUNCH_STOPPED_RECONCILE_BEFORE_RETRY';result.error=String(err.message||err).slice(0,500);}
 finally {
  if(sourceAttempted&&!headRestored){
   try{const fresh=await api('/content');const h=canonical(fresh);if(h===tempHash){await api('/content','PUT',{files:before.files});result.headRestoredVerified=canonical(await api('/content'))===expected;}else if(h===expected)result.headRestoredVerified=true;else result.concurrentHeadDrift=true;}catch(err){result.restoreError=String(err.message||err);}
  }
  try{result.finalHeadHash=canonical(await api('/content'));result.sourceParityVerified=result.finalHeadHash===expected;}catch(err){result.finalReadError=String(err.message||err);}
  fs.writeFileSync(dir+'/result.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 }
 if(result.status!=='NATIVE_BACKFILL_LAUNCHED'||!result.sourceParityVerified||!result.headRestoredVerified){
  if(canResumeAfterTransport(result,process.env.TMV3_BACKFILL_LAUNCH_KIND)){process.exitCode=2;return;}
  throw Error('LAUNCH_OR_CLEANUP_NOT_VERIFIED');
 }
}
// Native queues reconcile durable INTENT by GET before they may attempt another write.
// This exit code permits another authenticated native reconciliation, not a PATCH retry.
function canResumeAfterTransport(result,kind){
 return ['OPEN_REFRESH','REQUESTED_BY'].includes(kind) && result.sourceParityVerified===true &&
 result.headRestoredVerified===true && result.status==='LAUNCH_STOPPED_RECONCILE_BEFORE_RETRY' &&
 !/^NATIVE_LAUNCH_REJECTED/.test(String(result.error||'')) &&
 /LAUNCH_HTTP_(500|502|503|504)\b|Unexpected token '<'|not valid JSON|operation was aborted due to timeout/i.test(String(result.error||''));
}
module.exports={runner,cacheRunner,requestedByRunner,openRefreshRunner,canResumeAfterTransport};
if(require.main===module)main(process.argv[2]).catch(err=>{console.error(err.message);process.exitCode=1;});


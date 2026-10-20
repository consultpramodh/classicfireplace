// JavaScript / Node.js: short-lived, token-authenticated launch of the fixed native backlog.
'use strict';
const fs=require('node:fs'),crypto=require('node:crypto'),vm=require('node:vm');
const {canonical}=require('./tmv3-relationship-function-patch');
const scriptId='1shaSL1CeNhR2-fr8H4x0fP2KUIjpOizLFyrNRAnGGXkCvERX4hZyJ5Gt';
const expected='12efdb7b097d9975e0028049e5968d8dc8e5293ac5cf9e345fb2a43a3ee3f860';
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
 if(mode==='prepare'){
  const before=await api('/content');if(canonical(before)!==expected)throw Error('LIVE_PROJECT_DRIFT_NO_WRITE');
  if(before.files.some(f=>/function\s+doPost\s*\(/.test(f.source||'')))throw Error('EXISTING_POST_HANDLER_NO_WRITE');
  fs.writeFileSync(dir+'/before.json',JSON.stringify(before),{mode:0o600});
  fs.writeFileSync(dir+'/prepared.json',JSON.stringify({beforeHash:expected,scope:'FIXED_81_ORDER_LINK_BACKFILL',runtimeWritesAuthorized:true}),{mode:0o600});
  console.log('LAUNCH_PREPARED_DURABLE_BACKUP_REQUIRED');return;
 }
 if(mode!=='run')throw Error('UNKNOWN_MODE');
 const before=JSON.parse(fs.readFileSync(dir+'/before.json'));
 if(canonical(before)!==expected || canonical(await api('/content'))!==expected)throw Error('LIVE_PROJECT_DRIFT_NO_WRITE');
 const token=crypto.randomBytes(32).toString('hex'),digest=crypto.createHash('sha256').update(token).digest('hex');
 const source=runner(digest,Date.now()+5*60000);new vm.Script(source);
 const temporary={files:before.files.map(f=>{
  if(f.name!=='appsscript')return f;
  const manifest=JSON.parse(f.source);manifest.webapp={access:'ANYONE_ANONYMOUS',executeAs:'USER_DEPLOYING'};
  return {...f,source:JSON.stringify(manifest,null,2)};
 }).concat([{name:'zz_sd_order_backfill_launch',type:'SERVER_JS',source}])};
 const inventory=await api('/deployments');
 const head=(inventory.deployments||[]).filter(d=>!(d.deploymentConfig && d.deploymentConfig.versionNumber) && (d.entryPoints||[]).some(e=>e.webApp));
 if(head.length!==1 || !head[0].deploymentId)throw Error('EXACTLY_ONE_EXISTING_HEAD_WEB_APP_REQUIRED');
 const tempHash=canonical(temporary);let sourceAttempted=false,headRestored=false;
 const result={status:'NOT_STARTED',beforeHash:expected,scope:'FIXED_81_ORDER_LINK_BACKFILL',existingDeploymentsChanged:false,oauthScopesChanged:false,usingExistingHead:true,versionsCreated:0};
 try {
  sourceAttempted=true;await api('/content','PUT',temporary);
  if(canonical(await api('/content'))!==tempHash)throw Error('TEMPORARY_SOURCE_READBACK_MISMATCH');
  fs.writeFileSync(dir+'/temporary-source-backup.json',JSON.stringify(temporary),{mode:0o600});
  // Existing authorized HEAD deployment avoids the full 200-version inventory.
  const url='https://script.google.com/macros/s/'+encodeURIComponent(head[0].deploymentId)+'/dev';
  // Exactly one launch request; a timeout is an uncertain outcome, never an HTTP retry.
  const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+auth.access_token},body:JSON.stringify({token,action:'FIXED_SD_ORDER_BACKFILL'}),redirect:'follow',signal:AbortSignal.timeout(150000)});
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
 if(result.status!=='NATIVE_BACKFILL_LAUNCHED'||!result.sourceParityVerified||!result.headRestoredVerified)throw Error('LAUNCH_OR_CLEANUP_NOT_VERIFIED');
}
module.exports={runner};
if(require.main===module)main(process.argv[2]).catch(err=>{console.error(err.message);process.exitCode=1;});


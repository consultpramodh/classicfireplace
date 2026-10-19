#!/usr/bin/env node
'use strict';
// Safe single-event live V3 execution via an existing HEAD web app. Temporary
// nonce-guarded doPost and webapp manifest are removed after the call.
// No new Apps Script versions/deployments; no permanent web endpoint changes.
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const ID='1shaSL1CeNhR2-fr8H4x0fP2KUIjpOizLFyrNRAnGGXkCvERX4hZyJ5Gt';
const SRC='apps-script/tmv3-clean',OUT='tmv3-preinspection-head-evidence';
const report={status:'INIT',phase:'PREFLIGHT',sourceVerified:false,sourceRestored:false,
  headDeploymentFound:false,health:null,canary:null,error:null};
fs.mkdirSync(OUT,{recursive:true});
const write=()=>fs.writeFileSync(path.join(OUT,'result.json'),JSON.stringify(report,null,2));
const fail=s=>{throw new Error(s)};
const find=(o,ks,seen=new Set())=>{
 if(!o||typeof o!=='object'||seen.has(o))return '';seen.add(o);
 for(const [k,v]of Object.entries(o))if(ks.includes(k)&&typeof v==='string'&&v)return v;
 for(const v of Object.values(o)){const x=find(v,ks,seen);if(x)return x}return '';
};
const raw=JSON.parse(process.env.CLASPRC_JSON||'null');
if(!raw)fail('NO_GOOGLE_CREDENTIAL_SECRET');
const cr={client_id:find(raw,['clientId','client_id']),client_secret:find(raw,['clientSecret','client_secret']),
  refresh_token:find(raw,['refreshToken','refresh_token']),grant_type:'refresh_token'};
if(Object.values(cr).some(x=>!x))fail('GOOGLE_CREDENTIALS_INCOMPLETE');
let token='';
async function api(url,method='GET',body){
 const res=await fetch('https://script.googleapis.com/v1'+url,{method,
  headers:{authorization:'Bearer '+token,...(body?{'content-type':'application/json'}:{})},
  ...(body?{body:JSON.stringify(body)}:{})});
 const txt=await res.text();let obj={};
 try{obj=JSON.parse(txt)}catch{obj={message:txt.slice(0,250)}}
 if(!res.ok)fail('GOOGLE_SCRIPT_API_'+res.status+':'+String(obj.error?.status||obj.error?.message||'UNKNOWN').slice(0,160));
 return obj;
}
function mapOf(x){
 if(!x||!Array.isArray(x.files))fail('SOURCE_NO_FILES');
 const m=new Map();
 for(const f of x.files){
  const name=f.name==='appsscript'?'appsscript.json':f.name+'.js';
  if(m.has(name))fail('SOURCE_DUPLICATE:'+name);
  m.set(name,String(f.source||''));
 }
 return m;
}
function same(actual,expected,code){
 const m=mapOf(actual);
 if(m.size!==expected.size)fail(code+':COUNT');
 for(const [n,v]of expected)if(m.get(n)!==v)fail(code+':'+n);
}
function expected(){
 const names=fs.readdirSync(SRC).filter(n=>n.endsWith('.js')||n==='appsscript.json');
 if(names.length!==22)fail('NOT_EXACTLY_22_FILES');
 const m=new Map(names.map(n=>[n,fs.readFileSync(path.join(SRC,n),'utf8')]));
 if(!m.get('00_Config.js').includes('3.11.92-preinspection-location-readback-r2')||
    !m.get('90_Admin.js').includes('tmv3_preInspectionTodayEligibleQueue_'))
   fail('WRONG_PRODUCTION_RELEASE');
 return m;
}
function response(data){
 return JSON.stringify(data);
}
const nonce=crypto.randomBytes(32).toString('hex');
function temporarySource(live){
 const previous=JSON.parse(live.files.find(f=>f.name==='appsscript')?.source||'null');
 if(!previous)fail('MANIFEST_MISSING');
 if(previous.webapp||previous.executionApi)fail('UNEXPECTED_MANIFEST_EXECUTION_CONFIGURATION');
 const manifest=Object.assign({},previous,{webapp:{access:'ANYONE_ANONYMOUS',executeAs:'USER_DEPLOYING'}});
 const original=live.files.filter(f=>f.name!=='appsscript').map(f=>Object.assign({},f));
 let oldDoPostCount=0;
 for(const f of original){
  if(f.type==='SERVER_JS'){
    f.source=String(f.source||'').replace(/function\s+doPost\s*\(/g,()=>{
      oldDoPostCount++;
      return 'function TMP_PI_previousDoPost(';
    });
  }
 }
 if(oldDoPostCount>1)fail('MULTIPLE_EXISTING_DOPOST_HANDLERS');
 const handler=[
   'var TMP_PI_NONCE='+JSON.stringify(nonce)+';',
   'function TMP_PI_json_(x) { return ContentService.createTextOutput(JSON.stringify(x)).setMimeType(ContentService.MimeType.JSON); }',
   'function doPost(e) {',
   " try { var b=JSON.parse(e&&e.postData&&e.postData.contents||'{}');",
   '   if(String(b.token||"")!==TMP_PI_NONCE) return TMP_PI_json_({status:"UNAUTHORIZED"});',
   '   if(b.action==="health") {var h=tmv3_healthCheck();return TMP_PI_json_({status:h.ready?"HEALTH_READY":"HEALTH_NOT_READY",version:h.version,ready:h.ready});}',
   '   if(b.action==="once") {var r=tmv3_preInspectionTodayRunNext();',
   '     return TMP_PI_json_({status:r.status||"UNKNOWN",eventId:r.eventId||null,taskId:r.taskId||null,',
   '       executionStatus:r.executionStatus||null,processingStatus:r.processingStatus||null,',
   '       before:r.before||null,afterCalls:r.afterCalls||null,error:r.error||""});}',
   '   return TMP_PI_json_({status:"UNKNOWN_ACTION"});',
   ' }catch(ex){return TMP_PI_json_({status:"EXECUTION_ERROR",error:String(ex&&ex.message||ex).slice(0,240)});}',
   '}'
 ].join('\n');
 original.push({name:'TMP_PI_Canary20261019',type:'SERVER_JS',source:handler});
 original.push({name:'appsscript',type:'JSON',source:JSON.stringify(manifest,null,2)});
 return {files:original};
}
async function post(url,action){
 const r=await fetch(url,{method:'POST',redirect:'follow',
  headers:{'content-type':'application/json',authorization:'Bearer '+token},
  body:JSON.stringify({token:nonce,action})});
 const txt=await r.text();let obj;
 try{obj=JSON.parse(txt)}catch{fail('HEAD_ENDPOINT_NOT_JSON:'+r.status+':'+(r.headers.get('content-type')||''))}
 if(!r.ok)fail('HEAD_ENDPOINT_HTTP_'+r.status);
 if(obj.status==='UNAUTHORIZED'||obj.status==='EXECUTION_ERROR')fail('HEAD_RUNTIME_'+obj.status+':'+String(obj.error||''));
 return obj;
}
async function main(){
 write();
 const tr=await fetch('https://oauth2.googleapis.com/token',{method:'POST',
  headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams(cr)});
 const tj=await tr.json();if(!tr.ok||!tj.access_token)fail('OAUTH_FAILED');
 token=tj.access_token;
 const base=expected();
 const live=await api('/projects/'+encodeURIComponent(ID)+'/content');
 same(live,base,'LIVE_BASELINE_DRIFT');report.sourceVerified=true;report.phase='HEAD_INVENTORY';write();
 const deployments=await api('/projects/'+encodeURIComponent(ID)+'/deployments');
 const entries=Array.isArray(deployments.deployments)?deployments.deployments:[];
 const head=entries.find(d=>(d.entryPoints||[]).some(e=>e&&e.webApp)&&
   (d.deploymentConfig?.versionNumber===null||d.deploymentConfig?.versionNumber===undefined));
 if(!head||!head.deploymentId)fail('NO_EXISTING_HEAD_WEBAPP_NO_NEW_VERSION_ALLOWED');
 report.headDeploymentFound=true;report.phase='TEMP_SOURCE_PREPARE';write();
 const temp=temporarySource(live);
 const tmpMap=mapOf(temp);
 const justBefore=await api('/projects/'+encodeURIComponent(ID)+'/content');
 same(justBefore,base,'SOURCE_CHANGED_BEFORE_TEMP_WRITE');
 let tempAcknowledged=false;
 try{
   await api('/projects/'+encodeURIComponent(ID)+'/content','PUT',{files:temp.files});
   tempAcknowledged=true;
   same(await api('/projects/'+encodeURIComponent(ID)+'/content'),tmpMap,'TEMP_SOURCE_READBACK_FAILED');
   report.phase='HEAD_HEALTH';write();
   await new Promise(resolve=>setTimeout(resolve,2500));
   const url='https://script.google.com/macros/s/'+head.deploymentId+'/dev';
   const health=await post(url,'health');
   report.health={status:health.status,ready:health.ready,version:health.version};
   if(health.status!=='HEALTH_READY'||health.ready!==true||
      !String(health.version).startsWith('3.11.92'))fail('HEAD_HEALTH_NOT_READY');
   report.phase='ONE_ELIGIBLE_EVENT';write();
   const one=await post(url,'once');
   report.canary=one;
   report.status=one.status==='EVENT_RECONCILED_AND_VERIFIED'?'ONE_EVENT_VERIFIED':'ONE_EVENT_NOT_VERIFIED';
 }finally{
   report.phase='RESTORE_FULL_SOURCE';write();
   const current=await api('/projects/'+encodeURIComponent(ID)+'/content');
   let isTemp=false;
   try{same(current,tempAcknowledged?tmpMap:base,'SOURCE_MISMATCH_AFTER_CANARY');}
   catch(err){ // uncertain API response may have written temporary source
      same(current,tmpMap,'SOURCE_CHANGED_DURING_CANARY_NO_BLIND_RESTORE');
      isTemp=true;
   }
   if(!isTemp&&mapOf(current).size===tmpMap.size)isTemp=true;
   if(isTemp){
     await api('/projects/'+encodeURIComponent(ID)+'/content','PUT',{files:live.files});
     same(await api('/projects/'+encodeURIComponent(ID)+'/content'),base,'SOURCE_RESTORE_FAILED');
   }
   report.sourceRestored=true;
 }
 report.phase='COMPLETE';write();
}
main().catch(e=>{
 report.error=String(e.message||e).slice(0,400);
 if(report.status==='INIT')report.status='HEAD_CANARY_FAILED';
 report.phase='FAILED';write();process.exitCode=1;
}).finally(()=>{
 console.log(JSON.stringify({status:report.status,sourceVerified:report.sourceVerified,
  sourceRestored:report.sourceRestored,headDeploymentFound:report.headDeploymentFound,
  health:report.health,canary:report.canary,error:report.error}));
});

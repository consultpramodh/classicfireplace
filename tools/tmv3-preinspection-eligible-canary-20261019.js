#!/usr/bin/env node
'use strict';
// One-event PreInspection live canary via a temporary self-only Apps Script
// execution manifest. Mandatory exact source rollback and readback.
// No deployments, versions, public web endpoint, or source file deletions.
const fs=require('fs');
const path=require('path');
const {execFileSync}=require('child_process');
const ID='1shaSL1CeNhR2-fr8H4x0fP2KUIjpOizLFyrNRAnGGXkCvERX4hZyJ5Gt';
const SOURCE='apps-script/tmv3-clean';
const OUT='tmv3-preinspection-canary-evidence';
fs.mkdirSync(OUT,{recursive:true});
const result={status:'STARTED',phase:'SOURCE_PREFLIGHT',sourceVerified:false,sourceRestored:false,
  readOnlyHealth:null,canary:null,error:null};
function save(){fs.writeFileSync(path.join(OUT,'result.json'),JSON.stringify(result,null,2))}
function fail(s){throw new Error(s)}
function find(o,keys,seen=new Set()){
  if(!o||typeof o!=='object'||seen.has(o))return '';seen.add(o);
  for(const [k,v]of Object.entries(o))if(keys.includes(k)&&typeof v==='string'&&v)return v;
  for(const v of Object.values(o)){const x=find(v,keys,seen);if(x)return x}
  return '';
}
const raw=JSON.parse(process.env.CLASPRC_JSON||'null');
if(!raw)fail('CLASP_CREDENTIAL_SECRET_ABSENT');
const credentials={client_id:find(raw,['clientId','client_id']),
  client_secret:find(raw,['clientSecret','client_secret']),
  refresh_token:find(raw,['refreshToken','refresh_token']),grant_type:'refresh_token'};
if(Object.values(credentials).some(v=>!v))fail('CLASP_CREDENTIAL_FIELDS_ABSENT');
let token='';
async function api(url,method='GET',body){
  const r=await fetch('https://script.googleapis.com/v1'+url,{
    method,headers:{authorization:'Bearer '+token,...(body?{'content-type':'application/json'}:{})},
    ...(body?{body:JSON.stringify(body)}:{})
  });
  const txt=await r.text();let obj={};
  try{obj=JSON.parse(txt)}catch{obj={message:txt.slice(0,120)}}
  if(!r.ok)fail('SCRIPT_API_HTTP_'+r.status+':'+String(obj.error?.status||obj.error?.message||'UNKNOWN').slice(0,180));
  return obj;
}
function byName(json){
  if(!Array.isArray(json.files))fail('NO_SOURCE_FILES');
  const map=new Map();
  for(const f of json.files){
    const n=f.name==='appsscript'?'appsscript.json':f.name+'.js';
    if(map.has(n))fail('DUPLICATE_FILE:'+n);
    map.set(n,String(f.source||''));
  }
  return map;
}
function assertExpected(actual,expected,reason){
  const a=byName(actual);
  if(a.size!==expected.size)fail(reason+':FILE_COUNT');
  for(const [n,s]of expected)if(a.get(n)!==s)fail(reason+':'+n);
}
function expectedFromRepo(){
  const files=fs.readdirSync(SOURCE).filter(n=>n.endsWith('.js')||n==='appsscript.json');
  if(files.length!==22)fail('EXPECTED_22_SOURCE_FILES');
  const m=new Map();
  for(const n of files)m.set(n,fs.readFileSync(path.join(SOURCE,n),'utf8'));
  if(!m.get('00_Config.js').includes('3.11.92-preinspection-location-readback-r2'))
    fail('WRONG_CONFIG_VERSION');
  if(!m.get('90_Admin.js').includes('tmv3_preInspectionTodayEligibleQueue_'))
    fail('HOTFIX_NOT_PRESENT');
  return m;
}
async function run(fn){
  const response=await api('/scripts/'+encodeURIComponent(ID)+':run','POST',{function:fn,parameters:[],devMode:true});
  if(response.error)fail('CANARY_RUNTIME_ERROR:'+JSON.stringify(response.error).slice(0,280));
  return response.response?.result||null;
}
async function main(){
  save();
  const tr=await fetch('https://oauth2.googleapis.com/token',{method:'POST',
    headers:{'content-type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams(credentials)});
  const tj=await tr.json();if(!tr.ok||!tj.access_token)fail('OAUTH_REFRESH_FAILED');
  token=tj.access_token;
  const expected=expectedFromRepo();
  const live=await api('/projects/'+encodeURIComponent(ID)+'/content');
  assertExpected(live,expected,'LIVE_SOURCE_DRIFT');
  result.sourceVerified=true;result.phase='TEMPORARY_EXECUTION_MANIFEST';save();
  const manifest=JSON.parse(expected.get('appsscript.json'));
  if(manifest.executionApi)fail('UNEXPECTED_EXISTING_EXECUTION_API_CONFIG');
  manifest.executionApi={access:'MYSELF'};
  const temporary=JSON.parse(JSON.stringify(live));
  const index=temporary.files.findIndex(f=>f.name==='appsscript'&&f.type==='JSON');
  if(index<0)fail('MANIFEST_NOT_FOUND');
  temporary.files[index].source=JSON.stringify(manifest,null,2);
  const desired=new Map(expected);
  desired.set('appsscript.json',temporary.files[index].source);
  const fresh=await api('/projects/'+encodeURIComponent(ID)+'/content');
  assertExpected(fresh,expected,'SOURCE_CHANGED_BEFORE_TEMP_MANIFEST');
  let temporaryApplied=false;
  try{
    await api('/projects/'+encodeURIComponent(ID)+'/content','PUT',{files:temporary.files});
    temporaryApplied=true;
    const check=await api('/projects/'+encodeURIComponent(ID)+'/content');
    assertExpected(check,desired,'TEMP_MANIFEST_READBACK_FAILED');
    result.phase='HEALTHCHECK';save();
    await new Promise(resolve=>setTimeout(resolve,2500));
    const health=await run('tmv3_healthCheck');
    result.readOnlyHealth={ready:health?.ready,version:health?.version,
      missingSheets:health?.missingSheets?.length,missingCaps:health?.missingPropertyCapabilities?.length};
    if(!health||health.ready!==true||!String(health.version).startsWith('3.11.92'))
      fail('HEALTHCHECK_NOT_READY');
    result.phase='ONE_ELIGIBLE_EVENT';save();
    const one=await run('tmv3_preInspectionTodayRunNext');
    result.canary={status:one?.status,eventId:one?.eventId||null,taskId:one?.taskId||null,
      processingStatus:one?.processingStatus||null,executionStatus:one?.executionStatus||null,
      before:one?.before||null,afterCalls:one?.afterCalls||null};
    result.status=one?.status==='EVENT_RECONCILED_AND_VERIFIED'?'ONE_EVENT_VERIFIED':
      'ONE_EVENT_NOT_VERIFIED';
  }finally{
    result.phase='SOURCE_RESTORE';save();
    const latest=await api('/projects/'+encodeURIComponent(ID)+'/content');
    let isTemporary=false;
    try{assertExpected(latest,desired,'NOT_TEMPORARY')}catch(e){
      assertExpected(latest,expected,'SOURCE_CHANGED_DURING_CANARY_NO_BLIND_RESTORE');
    }
    if(byName(latest).get('appsscript.json')===desired.get('appsscript.json')){
      isTemporary=true;
    }
    if(isTemporary){
      await api('/projects/'+encodeURIComponent(ID)+'/content','PUT',{files:live.files});
      const restored=await api('/projects/'+encodeURIComponent(ID)+'/content');
      assertExpected(restored,expected,'SOURCE_RESTORE_READBACK_FAILED');
    }
    result.sourceRestored=true;
  }
  result.phase='COMPLETE';save();
}
main().catch(e=>{
  result.error=String(e.message||e).slice(0,500);
  if(result.status==='STARTED')result.status='CANARY_FAILED';
  result.phase='FAILED';save();process.exitCode=1;
}).finally(()=>{
  console.log(JSON.stringify({status:result.status,sourceVerified:result.sourceVerified,
    sourceRestored:result.sourceRestored,health:result.readOnlyHealth,
    canary:result.canary,error:result.error}));
});

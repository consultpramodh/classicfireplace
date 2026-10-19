#!/usr/bin/env node
'use strict';
// One-file guarded V3 PreInspection repair. No source deletion/version creation.
// Stage 1: exact full-source GitHub baseline parity against live Script API.
// Stage 2: replace ONLY 90_Admin SERVER_JS; readback every file.
// Stage 3: try read-only runtime health check and, only if verified, one canary.
// Any ambiguous source state stops rather than overwriting operator work.
const fs=require('fs');
const path=require('path');
const crypto=require('crypto');
const {execFileSync}=require('child_process');
const SCRIPT_ID='1shaSL1CeNhR2-fr8H4x0fP2KUIjpOizLFyrNRAnGGXkCvERX4hZyJ5Gt';
const BASE='95c312296fb605678ce4989864a70cd9de439ca8';
const DIR='apps-script/tmv3-clean';
const OUT=path.resolve('tmv3-preinspection-hotfix-evidence');
const TARGET='90_Admin';
const RESULT={status:'STARTED',scriptId:SCRIPT_ID,baselineCommit:BASE,version:'3.11.92',changedFiles:[TARGET],stage:'INITIALIZE',canary:null,details:[]};
fs.mkdirSync(OUT,{recursive:true});
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const die=(code)=>{throw new Error(code)};
const record=(k,v)=>{RESULT[k]=v;fs.writeFileSync(path.join(OUT,'result.json'),JSON.stringify(RESULT,null,2));};
const find=(obj,keys,seen=new Set())=>{
  if(!obj||typeof obj!=='object'||seen.has(obj))return '';
  seen.add(obj);for(const [k,v] of Object.entries(obj))
    if(keys.includes(k)&&typeof v==='string'&&v)return v;
  for(const v of Object.values(obj)){const z=find(v,keys,seen);if(z)return z}
  return '';
};
const raw=JSON.parse(process.env.CLASPRC_JSON||'null');
if(!raw)die('MISSING_CLASPRC_JSON');
const cred={
  refresh_token:find(raw,['refresh_token','refreshToken']),
  client_id:find(raw,['client_id','clientId']),
  client_secret:find(raw,['client_secret','clientSecret'])
};
if(Object.values(cred).some(v=>!v))die('MISSING_REFRESH_CREDENTIALS');
let bearer='';
async function google(uri,method='GET',body){
  const res=await fetch('https://script.googleapis.com/v1'+uri,{method,headers:{
    authorization:'Bearer '+bearer,...(body?{'content-type':'application/json'}:{})
  },...(body?{body:JSON.stringify(body)}:{})});
  const txt=await res.text();let obj={};
  try{obj=JSON.parse(txt)}catch{obj={message:txt.slice(0,500)}}
  if(!res.ok)die('GOOGLE_SCRIPT_API_'+res.status+':'+String(obj.error&&obj.error.status||obj.message||'unknown').slice(0,150));
  return obj;
}
function sourceMap(input){
  if(!input||!Array.isArray(input.files))die('BAD_SOURCE_RESPONSE');
  const m=new Map();
  for(const f of input.files){const name=(f.name==='appsscript'?'appsscript.json':f.name+'.js');
    if(m.has(name))die('DUPLICATE_SCRIPT_FILE:'+name);
    m.set(name,{source:String(f.source||''),type:f.type,name:f.name});
  }
  return m;
}
function expectedMap(){
  const names=fs.readdirSync(DIR).filter(x=>x.endsWith('.js')||x==='appsscript.json').sort();
  if(names.length!==22)die('UNEXPECTED_REPO_SOURCE_FILE_COUNT:'+names.length);
  const result=new Map();
  for(const n of names){
    const current=fs.readFileSync(path.join(DIR,n),'utf8');
    const prior=execFileSync('git',['show',BASE+':'+DIR+'/'+n],{encoding:'utf8'});
    result.set(n,{current,prior});
  }
  return result;
}
async function execute(fn){
  const run=await google('/scripts/'+encodeURIComponent(SCRIPT_ID)+':run','POST',{
    function:fn,parameters:[],devMode:true
  });
  if(run.error)die('SCRIPT_EXECUTION_ERROR:'+JSON.stringify(run.error).slice(0,300));
  return run.response&&run.response.result;
}
async function main(){
  const tokenRes=await fetch('https://oauth2.googleapis.com/token',{method:'POST',
    headers:{'content-type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({...cred,grant_type:'refresh_token'})});
  const token=await tokenRes.json();
  if(!tokenRes.ok||!token.access_token)die('CLASP_OAUTH_REFRESH_FAILED:'+tokenRes.status);
  bearer=token.access_token;
  const exp=expectedMap();
  for(const [name,v] of exp){
    if(name!==TARGET+'.js'&&v.prior!==v.current)die('UNRELATED_REPO_FILE_CHANGED:'+name);
  }
  if(exp.get(TARGET+'.js').prior===exp.get(TARGET+'.js').current)die('NO_ADMIN_HOTFIX_DIFFERENCE');
  record('stage','LIVE_PRE_READ');
  const pre=await google('/projects/'+encodeURIComponent(SCRIPT_ID)+'/content');
  const live=sourceMap(pre);
  if(live.size!==exp.size)die('LIVE_FILE_COUNT_DRIFT:'+live.size);
  let alreadyPatched=false;
  const priorHotfix=execFileSync('git',
    ['show','07f413534b7e9a4bb71a39380a94935461117e92:'+DIR+'/'+TARGET+'.js'],
    {encoding:'utf8'});
  for(const [name,v] of exp){
    const f=live.get(name);
    if(!f)die('LIVE_FILE_MISSING:'+name);
    if(name===TARGET+'.js'){
      if(f.source===v.current){alreadyPatched=true;continue}
      if(f.source===v.prior||f.source===priorHotfix)continue;
    }else if(f.source===v.prior)continue;
    die('LIVE_SOURCE_DRIFT:'+name);
  }
  record('preSourceVerified',true);
  record('alreadyPatched',alreadyPatched);
  record('preSourceSha256',sha(JSON.stringify([...live].map(([k,v])=>[k,sha(v.source)]).sort())));
  const modified=JSON.parse(JSON.stringify(pre));
  const file=modified.files.find(x=>x.name===TARGET&&x.type==='SERVER_JS');
  if(!file)die('TARGET_FILE_NOT_FOUND');
  file.source=exp.get(TARGET+'.js').current;
  // Fresh compare just before the write, protecting against intervening editors.
  const justBefore=sourceMap(await google('/projects/'+encodeURIComponent(SCRIPT_ID)+'/content'));
  for(const [name,v] of exp){
    const wanted=live.get(name)?.source;
    if(justBefore.get(name)?.source!==wanted)die('SOURCE_CHANGED_BEFORE_WRITE:'+name);
  }
  record('stage',alreadyPatched?'ALREADY_DEPLOYED_READBACK':'ONE_FILE_WRITE');
  let pushed=false;
  try{
    if(!alreadyPatched){
      await google('/projects/'+encodeURIComponent(SCRIPT_ID)+'/content','PUT',{files:modified.files});
      pushed=true;
    }
    record('stage','POST_WRITE_READBACK');
    const after=sourceMap(await google('/projects/'+encodeURIComponent(SCRIPT_ID)+'/content'));
    if(after.size!==exp.size)die('POST_WRITE_INVENTORY_DRIFT');
    for(const [name,v] of exp){
      if(after.get(name)?.source!==v.current)die('POST_WRITE_HASH_MISMATCH:'+name);
    }
    record('postSourceVerified',true);
    record('postAdminSha256',sha(after.get(TARGET+'.js').source));
    record('status','SOURCE_DEPLOYED_VERIFIED');
  }catch(e){
    // Restore only if nobody has changed any file since our intended write.
    if(pushed){
      const current=sourceMap(await google('/projects/'+encodeURIComponent(SCRIPT_ID)+'/content'));
      const allOurs=[...exp].every(([n,v])=>current.get(n)?.source===v.current);
      if(allOurs){
        await google('/projects/'+encodeURIComponent(SCRIPT_ID)+'/content','PUT',{files:pre.files});
        const restored=sourceMap(await google('/projects/'+encodeURIComponent(SCRIPT_ID)+'/content'));
        if([...exp].some(([n,v])=>restored.get(n)?.source!==v.prior))die('ROLLBACK_READBACK_FAILED');
        record('status','ROLLED_BACK_VERIFIED');
      }else record('status','POST_WRITE_UNCERTAIN_REQUIRES_MANUAL_RECONCILIATION');
    }
    throw e;
  }
  // API executable access is not guaranteed. A missing API executable
  // must never be confused with a production event being processed.
  try{
    record('stage','RUNTIME_HEALTHCHECK');
    const health=await execute('tmv3_healthCheck');
    record('health',health);
    if(!health||health.ready!==true||
       !String(health.version||'').startsWith('3.11.92')||
       health.scriptId!==SCRIPT_ID)die('RUNTIME_HEALTHCHECK_NOT_READY');
    record('stage','ONE_ELIGIBLE_CANARY');
    const canary=await execute('tmv3_preInspectionTodayRunNext');
    record('canary',canary);
    if(!canary||canary.status!=='EVENT_RECONCILED_AND_VERIFIED'){
      record('status','DEPLOYED_CANARY_NOT_CONVERGED');return;
    }
    record('status','FIRST_ELIGIBLE_EVENT_VERIFIED');
  }catch(e){
    record('runtimeExecutionLimitation',String(e.message||e).slice(0,350));
    record('status','SOURCE_DEPLOYED_EXECUTION_UNAVAILABLE');
  }
}
main().catch(e=>{
  RESULT.error=String(e.message||e).slice(0,500);
  RESULT.status=RESULT.status==='ROLLED_BACK_VERIFIED'?'ROLLED_BACK_VERIFIED':
    RESULT.status==='POST_WRITE_UNCERTAIN_REQUIRES_MANUAL_RECONCILIATION'?RESULT.status:'FAILED';
  fs.writeFileSync(path.join(OUT,'result.json'),JSON.stringify(RESULT,null,2));
  console.error('HOTFIX_FAILED:',RESULT.error);
  process.exitCode=1;
}).finally(()=>{
  console.log(JSON.stringify({status:RESULT.status,stage:RESULT.stage,preSourceVerified:RESULT.preSourceVerified||false,
    postSourceVerified:RESULT.postSourceVerified||false,canaryStatus:RESULT.canary&&RESULT.canary.status||null,
    runtimeExecutionLimitation:RESULT.runtimeExecutionLimitation||null,error:RESULT.error||null}));
});

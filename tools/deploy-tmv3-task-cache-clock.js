// JavaScript / Node.js: surgical same-project cache-only rule deployment.
'use strict';
const fs=require('node:fs'),crypto=require('node:crypto');
const dir='task-cache-clock-evidence';
const scriptId='1shaSL1CeNhR2-fr8H4x0fP2KUIjpOizLFyrNRAnGGXkCvERX4hZyJ5Gt';
function hash(o){return crypto.createHash('sha256').update(JSON.stringify(o.files.map(f=>({name:f.name,type:f.type,source:f.source||''})).sort((a,b)=>a.name.localeCompare(b.name)))).digest('hex');}
function find(o,keys){if(!o||typeof o!=='object')return '';for(const[k,v]of Object.entries(o))if(keys.includes(k)&&typeof v==='string'&&v)return v;for(const v of Object.values(o)){const s=find(v,keys);if(s)return s;}return '';}
function upsert(s){const start=s.indexOf('function tmv3_upsertTaskCacheRow_(task) {');if(start<0||s.indexOf('function tmv3_upsertTaskCacheRow_(task) {',start+1)>=0)throw Error('UPSERT_NOT_UNIQUE');const end=s.indexOf('\nfunction ',start+1);if(end<0)throw Error('UPSERT_END_MISSING');return s.slice(start,end);}
async function main(mode){
 fs.mkdirSync(dir,{recursive:true,mode:0o700});
 const conf=JSON.parse(process.env.CLASPRC_JSON||'{}');
 const form=new URLSearchParams({grant_type:'refresh_token',client_id:find(conf,['clientId','client_id']),client_secret:find(conf,['clientSecret','client_secret']),refresh_token:find(conf,['refresh_token','refreshToken'])});
 if([...form.values()].some(v=>!v))throw Error('AUTH_CONFIGURATION_MISSING');
 const authResponse=await fetch('https://oauth2.googleapis.com/token',{method:'POST',body:form,redirect:'error'});
 if(!authResponse.ok)throw Error('AUTH_REFRESH_FAILED');const auth=await authResponse.json();if(!auth.access_token)throw Error('ACCESS_TOKEN_MISSING');
 const api=async(method,body)=>{const r=await fetch('https://script.googleapis.com/v1/projects/'+scriptId+'/content',{method,headers:{Authorization:'Bearer '+auth.access_token,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),redirect:'error'});if(!r.ok)throw Error('CONTENT_'+method+'_HTTP_'+r.status);return r.json();};
 if(mode==='prepare'){
  const before=await api('GET');
  fs.writeFileSync(dir+'/before.json',JSON.stringify(before),{mode:0o600});
  const ops=before.files.find(f=>f.name==='58_Operations');
  const local=fs.readFileSync('apps-script/tmv3-clean/58_Operations.js','utf8');
  const helper=fs.readFileSync('tools/tmv3-task-cache-canonical-clock.js','utf8').trim();
  if(!ops||upsert(ops.source)!==upsert(local)||!ops.source.includes(helper))throw Error('INSTALLED_CANONICAL_CACHE_RULE_DRIFT_NO_WRITE');
  const vm=require('node:vm');new vm.Script(ops.source);
  fs.writeFileSync(dir+'/plan.json',JSON.stringify({status:'ALREADY_INSTALLED',beforeHash:hash(before),strivenWrites:0,calendarWrites:0,sourceWrites:0}));
  console.log('EXISTING_LIVE_CANONICAL_CACHE_RULE_MATCHES_REPOSITORY');return;
 }
 if(mode!=='deploy')throw Error('UNKNOWN_MODE');
 const plan=JSON.parse(fs.readFileSync(dir+'/plan.json'));
 if(plan.status!=='ALREADY_INSTALLED'||hash(await api('GET'))!==plan.beforeHash)throw Error('FINAL_SOURCE_DRIFT_NO_WRITE');
 const result={...plan,status:'EXISTING_LIVE_RULE_SOURCE_VERIFIED'};
 fs.writeFileSync(dir+'/result.json',JSON.stringify(result,null,2));
 console.log(JSON.stringify(result));
}
main(process.argv[2]).catch(e=>{console.error(e.message);process.exitCode=1;});

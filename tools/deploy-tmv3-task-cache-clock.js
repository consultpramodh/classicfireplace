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
  const local=fs.readFileSync('apps-script/tmv3-clean/58_Operations.js','utf8');
  const desired=upsert(local);
  const insertion="\n  // Canonical schedule only at the cache boundary; raw V2 models stay untouched.\n  // A failed read stops this cache write and preserves the existing row.\n  task = tmv3_taskCacheCanonicalClock_(task);\n";
  if(desired.split(insertion).length!==2)throw Error('LOCAL_INSERTION_DRIFT');
  const expected=desired.replace(insertion,'');
  const work={files:before.files.map(f=>({...f}))};
  const ops=work.files.find(f=>f.name==='58_Operations'),striven=work.files.find(f=>f.name==='20_Striven');
  if(!ops||!striven||upsert(ops.source)!==expected)throw Error('LIVE_UPSERT_DRIFT_NO_WRITE');
  if(before.files.some(f=>(f.source||'').includes('function tmv3_taskCacheCanonicalClock_(')))throw Error('HELPER_ALREADY_PRESENT_NO_WRITE');
  const helper=fs.readFileSync('tools/tmv3-task-cache-canonical-clock.js','utf8');
  ops.source=ops.source.replace(expected,desired);striven.source=striven.source.trimEnd()+'\n\n'+helper;
  const vm=require('node:vm');for(const f of work.files)if(f.type==='SERVER_JS')new vm.Script(f.source,{filename:f.name});
  fs.writeFileSync(dir+'/before.json',JSON.stringify(before),{mode:0o600});fs.writeFileSync(dir+'/work.json',JSON.stringify(work),{mode:0o600});
  fs.writeFileSync(dir+'/plan.json',JSON.stringify({beforeHash:hash(before),workHash:hash(work),scope:['20_Striven','58_Operations'],strivenWrites:0,calendarWrites:0}));
  console.log('PREPARED_EXACT_LIVE_BACKUP_AND_SURGICAL_PATCH');return;
 }
 if(mode!=='deploy')throw Error('UNKNOWN_MODE');
 const before=JSON.parse(fs.readFileSync(dir+'/before.json')),work=JSON.parse(fs.readFileSync(dir+'/work.json'));
 const plan=JSON.parse(fs.readFileSync(dir+'/plan.json'));
 if(hash(before)!==plan.beforeHash||hash(work)!==plan.workHash||hash(await api('GET'))!==plan.beforeHash)throw Error('PRE_DEPLOY_SOURCE_DRIFT_NO_WRITE');
 let attempted=false;const result={status:'NOT_DEPLOYED',...plan};
 try{
  attempted=true;await api('PUT',{files:work.files});
  if(hash(await api('GET'))!==plan.workHash)throw Error('REMOTE_SOURCE_READBACK_MISMATCH');
  result.status='DEPLOYED_SOURCE_VERIFIED';console.log(JSON.stringify(result));
 }catch(err){
  result.error=String(err.message);if(attempted){const freshHash=hash(await api('GET'));if(freshHash===plan.workHash){await api('PUT',{files:before.files});result.rollbackVerified=hash(await api('GET'))===plan.beforeHash;}else result.rollbackSkippedForDrift=true;}
  throw err;
 }finally{fs.writeFileSync(dir+'/result.json',JSON.stringify(result,null,2));}
}
main(process.argv[2]).catch(e=>{console.error(e.message);process.exitCode=1;});

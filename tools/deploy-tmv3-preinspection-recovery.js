// JavaScript / Node.js: guarded in-place update; no execution permissions or deployments changed.
'use strict';
const fs=require('node:fs'),crypto=require('node:crypto'),vm=require('node:vm');
const {patch}=require('./patch-tmv3-preinspection-recovery');
const dir='preinspection-recovery-evidence';
const scriptId='1shaSL1CeNhR2-fr8H4x0fP2KUIjpOizLFyrNRAnGGXkCvERX4hZyJ5Gt';
const expected='2d0bdfa3a6612fb931c81e6e1bbf6e38e78ec78cea81bc7b369d83008572fe45';
const desired='b03d1205bcaae2e2f3ca5dc8ce0a2ac3bb22c75acbec3cc807ee0d749bf807d1';
function hash(o){return crypto.createHash('sha256').update(JSON.stringify(o.files.map(f=>({name:f.name,type:f.type,source:f.source||''})).sort((a,b)=>a.name.localeCompare(b.name)))).digest('hex');}
function find(o,keys){if(!o||typeof o!=='object')return '';for(const[k,v]of Object.entries(o))if(keys.includes(k)&&typeof v==='string'&&v)return v;for(const v of Object.values(o)){const s=find(v,keys);if(s)return s;}return '';}
async function main(mode){
 fs.mkdirSync(dir,{recursive:true,mode:0o700});
 const conf=JSON.parse(process.env.CLASPRC_JSON||'{}');
 const form=new URLSearchParams({grant_type:'refresh_token',client_id:find(conf,['clientId','client_id']),client_secret:find(conf,['clientSecret','client_secret']),refresh_token:find(conf,['refresh_token','refreshToken'])});
 if([...form.values()].some(v=>!v))throw Error('AUTH_CONFIGURATION_MISSING');
 const ar=await fetch('https://oauth2.googleapis.com/token',{method:'POST',body:form,redirect:'error'});
 if(!ar.ok)throw Error('AUTH_REFRESH_FAILED');const auth=await ar.json();if(!auth.access_token)throw Error('ACCESS_TOKEN_MISSING');
 const api=async(method,body)=>{const r=await fetch('https://script.googleapis.com/v1/projects/'+scriptId+'/content',{method,headers:{Authorization:'Bearer '+auth.access_token,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),redirect:'error'});if(!r.ok)throw Error('CONTENT_'+method+'_HTTP_'+r.status);return r.json();};
 if(mode==='prepare'){
  const before=await api('GET');fs.writeFileSync(dir+'/before.json',JSON.stringify(before),{mode:0o600});
  if(hash(before)!==expected)throw Error('LIVE_SOURCE_DRIFT_NO_WRITE');
  const work=patch(before,fs.readFileSync('tools/tmv3-preinspection-final-links-verifier.js','utf8'));
  if(hash(work)!==desired)throw Error('PATCH_HASH_MISMATCH_NO_WRITE');
  for(const f of work.files)if(f.type==='SERVER_JS')new vm.Script(f.source,{filename:f.name});
  fs.writeFileSync(dir+'/work.json',JSON.stringify(work),{mode:0o600});
  console.log('EXACT_LIVE_BACKUP_AND_FIVE_FILE_RECOVERY_PATCH_PREPARED');return;
 }
 if(mode!=='deploy')throw Error('UNKNOWN_MODE');
 const before=JSON.parse(fs.readFileSync(dir+'/before.json')),work=JSON.parse(fs.readFileSync(dir+'/work.json'));
 if(hash(before)!==expected||hash(work)!==desired||hash(await api('GET'))!==expected)throw Error('PRE_DEPLOY_DRIFT_NO_WRITE');
 const result={status:'NOT_DEPLOYED',version:'3.11.97-preinspection-automatic-recovery-r1',expectedHash:expected,desiredHash:desired,apiBudget:{v3DailyLimit:1200,preInspectionReservedCalls:200,otherWorkflowsReserve:3800},executionPermissionsChanged:false,triggerInstallationRequired:false,taskWrites:0,calendarWrites:0};
 let attempted=false;
 try{
  attempted=true;await api('PUT',{files:work.files});
  if(hash(await api('GET'))!==desired)throw Error('REMOTE_HASH_READBACK_MISMATCH');
  result.status='DEPLOYED_ALL_SOURCE_HASHES_VERIFIED';
 }catch(e){result.error=String(e.message);if(attempted){const h=hash(await api('GET'));if(h===desired){await api('PUT',{files:before.files});result.rollbackVerified=hash(await api('GET'))===expected;}else result.rollbackSkippedForConcurrentDrift=true;}throw e;}
 finally{fs.writeFileSync(dir+'/result.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));}
}
main(process.argv[2]).catch(e=>{console.error(e.message);process.exitCode=1;});

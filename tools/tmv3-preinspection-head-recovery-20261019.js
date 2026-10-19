#!/usr/bin/env node
'use strict';
// Idempotent V3 source recovery after a temporary one-event HEAD canary.
// Never changes business data, Tasks, calendar, deployments or versions.
// Only exact known temporary nonce runner can be removed.
const fs=require('fs'),path=require('path');
const ID='1shaSL1CeNhR2-fr8H4x0fP2KUIjpOizLFyrNRAnGGXkCvERX4hZyJ5Gt';
const SRC='apps-script/tmv3-clean',OUT='tmv3-preinspection-head-recovery-evidence';
fs.mkdirSync(OUT,{recursive:true});
const result={status:'START',sourceVerified:false,sourceRestored:false,error:null};
const write=()=>fs.writeFileSync(path.join(OUT,'result.json'),JSON.stringify(result,null,2));
const fail=x=>{throw new Error(x)};
function lookup(o,ks,seen=new Set()){
 if(!o||typeof o!=='object'||seen.has(o))return '';seen.add(o);
 for(const [k,v]of Object.entries(o))if(ks.includes(k)&&typeof v==='string'&&v)return v;
 for(const v of Object.values(o)){const f=lookup(v,ks,seen);if(f)return f}
 return '';
}
const auth=JSON.parse(process.env.CLASPRC_JSON||'null');
if(!auth)fail('NO_CLASP_CREDENTIALS');
const oauth={client_id:lookup(auth,['client_id','clientId']),
 client_secret:lookup(auth,['client_secret','clientSecret']),
 refresh_token:lookup(auth,['refresh_token','refreshToken']),grant_type:'refresh_token'};
if(Object.values(oauth).some(v=>!v))fail('INCOMPLETE_GOOGLE_CREDENTIALS');
let token='';
async function api(url,method='GET',body){
 const r=await fetch('https://script.googleapis.com/v1'+url,{method,
  headers:{authorization:'Bearer '+token,...(body?{'content-type':'application/json'}:{})},
  ...(body?{body:JSON.stringify(body)}:{})});
 const t=await r.text();let j={};
 try{j=JSON.parse(t)}catch{j={}}
 if(!r.ok)fail('SCRIPT_API_'+r.status+':'+String(j.error?.status||'UNKNOWN'));
 return j;
}
function mapOf(x){
 const m=new Map();for(const f of x.files||[]){
  const n=f.name==='appsscript'?'appsscript.json':f.name+'.js';
  if(m.has(n))fail('DUPLICATE_SOURCE_FILE');m.set(n,String(f.source||''));
 }return m;
}
function sourceEquals(cur,expected){
 if(cur.size!==expected.size)return false;
 return [...expected].every(([n,t])=>cur.get(n)===t);
}
function expectedFromRepo(){
 const files=fs.readdirSync(SRC).filter(n=>n.endsWith('.js')||n==='appsscript.json');
 if(files.length!==22)fail('WRONG_EXPECTED_INVENTORY');
 const m=new Map(files.map(n=>[n,fs.readFileSync(path.join(SRC,n),'utf8')]));
 if(!m.get('00_Config.js').includes('3.11.92-preinspection-location-readback-r2')||
    !m.get('90_Admin.js').includes('tmv3_preInspectionTodayEligibleQueue_'))
   fail('WRONG_RELEASE');
 return m;
}
function isKnownTemp(m,expected){
 if(m.size!==expected.size+1)return false;
 const extra=m.get('TMP_PI_Canary20261019.js')||'';
 if(!/^var TMP_PI_NONCE="[0-9a-f]{64}";/.test(extra)||
    !extra.includes('function doPost(e)'))return false;
 let configured;
 try{configured=JSON.parse(m.get('appsscript.json')||'null')}catch{return false}
 const orig=JSON.parse(expected.get('appsscript.json'));
 if(!configured||configured.webapp?.access!=='ANYONE_ANONYMOUS'||
    configured.webapp?.executeAs!=='USER_DEPLOYING')return false;
 delete configured.webapp;
 if(JSON.stringify(configured)!==JSON.stringify(orig))return false;
 for(const [n,src]of expected){
  if(n==='appsscript.json')continue;
  const allowed=src.replace(/function\s+doPost\s*\(/g,'function TMP_PI_previousDoPost(');
  if(m.get(n)!==allowed)return false;
 }
 return true;
}
async function main(){
 write();
 const tr=await fetch('https://oauth2.googleapis.com/token',{method:'POST',
  headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams(oauth)});
 const j=await tr.json();if(!tr.ok||!j.access_token)fail('OAUTH_FAILED');
 token=j.access_token;
 const expected=expectedFromRepo();
 const pre=await api('/projects/'+encodeURIComponent(ID)+'/content');
 const m=mapOf(pre);
 if(sourceEquals(m,expected)){
   result.status='SOURCE_ALREADY_CLEAN';result.sourceVerified=true;result.sourceRestored=true;write();return;
 }
 if(!isKnownTemp(m,expected))fail('UNKNOWN_SOURCE_DRIFT_NO_WRITE');
 result.sourceVerified=true;
 const fresh=await api('/projects/'+encodeURIComponent(ID)+'/content');
 if(!sourceEquals(mapOf(fresh),m))fail('SOURCE_CHANGED_BEFORE_RECOVERY_NO_WRITE');
 const restoredFiles=fresh.files.filter(f=>f.name!=='TMP_PI_Canary20261019').map(f=>{
  const n=f.name==='appsscript'?'appsscript.json':f.name+'.js';
  return Object.assign({},f,{source:expected.get(n)});
 });
 if(restoredFiles.length!==22||restoredFiles.some(f=>f.source===undefined))fail('BAD_RECOVERY_PAYLOAD');
 await api('/projects/'+encodeURIComponent(ID)+'/content','PUT',{files:restoredFiles});
 const readback=mapOf(await api('/projects/'+encodeURIComponent(ID)+'/content'));
 if(!sourceEquals(readback,expected))fail('SOURCE_RESTORE_READBACK_FAILED');
 result.status='TEMPORARY_CANARY_SOURCE_RESTORED';
 result.sourceRestored=true;write();
}
main().catch(e=>{
 result.status='RECOVERY_ATTENTION';result.error=String(e.message||e).slice(0,400);write();process.exitCode=1;
}).finally(()=>console.log(JSON.stringify(result)));

// Node.js / GitHub Actions: stage-only V3 structural migration.
// Uses the Apps Script Content API: updates HEAD source, not a numbered deployment.
// Safeguards: exact pre-image hashes; exact staged file hashes; 682 function
// source equivalence; rollback on recognized mismatches; readback verification.
'use strict';
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const vm=require('node:vm');
const ROOT=process.cwd();
const DIR=path.join(ROOT,'apps-script','tmv3-vertical-split-staging');
const SCRIPT_ID='1shaSL1CeNhR2-fr8H4x0fP2KUIjpOizLFyrNRAnGGXkCvERX4hZyJ5Gt';
const SCRIPT_FILES=['00_Configuration.gs','10_Shared_Core.gs','20_Master_Triggers.gs','30_PreInspection.gs','40_Installation.gs','50_Delivery.gs','60_Service.gs','90_Regression_Tests.gs'];
const PRE_SHA256={
  '00_Config':'50f173d09a48ca6f52b07b8e8f67955cac36bc628ed32db8018f99c107ec9ada',
  '10_Core':'f075e28916b4f0cbc2d1a85ce9a36604e91110abedf42f6f383c8b3590fcc05c',
  '15_Identity':'074d3a6ae9da9514b2bfd1acf79b3ecc2fffe232a4d17214249fadc79e9948fb',
  '20_Striven':'884c91dcddadc7b9b499ea830692f171aa8c8325147445e785cf749a2bdc1104',
  '30_Calendar':'917537f5ccfbdbf9749c6faf8a10250884ae7b266085a6740c871bd38fb13e08',
  '32_Step1_Calendar_View':'81b44456f640303cf843e35124e8a4202440c44e18cbe2f9ebd06743571cd63f',
  '34_Step2_Eligibility':'ba2ffff784975d08acdf6913c1d3f17a1da1749d90c7116c0a6419e956df35ab',
  '35_CalendarLinks':'6424890aa07e3e19e35865a69dbc8a3f14d6a1d0d939d917d73959bd48b6a45c',
  '36_Step3_Business_Anchor':'342edaf3957e5380819d4cf7591012ed5bab6af534f6b0d6759574a55e7c5868',
  '38_Step4_Identity':'af1559b3a9a801ce6f3303575e987f97870cb46e50422959fd23cd90a0439989',
  '40_Engine':'ddde8cb42e56c2a9dbea05ca877d15592cfd31fa88a9d3975d7b2be647b67bb0',
  '42_Step5_Task_Resolution':'54d6205cea8bf1d50b467a5ae427a5129971ddfeb384cd4619f0941f4e074ef3',
  '44_Step6_Task_Decision':'1fdf732a4cbdc3bcf8f4af81a535b608c32e504bff80221dfcfe1b7e51ab4959',
  '46_Step7_Reconciliation':'ee08cccf81a292cfc5dbd7a0df67634fc795d6cfb659c31205b7f7c8c83da41f',
  '50_Verticals':'3f64cb99dbf20af0377116b7f82ff3d068de3d5af03d092ebbbdd5524409108a',
  '55_Writes':'bc2e7232c41eddb6df93ae9990696a072f4836a4e240a3d0ed19866949255170',
  '58_Operations':'c44966054a20b2db8f0abacd9c463d898bf3fb7207c1d2213527772bae4d2eae',
  '60_Automation':'f89453ad275dc2a14956d6b266ee82cb27bc1cf57442d8c92cdc86c7473f1547',
  '70_Regression':'080da55cc8fadc73547a45fa80252a4be072b0dd62973596179bb149761c5f67',
  '80_MorningOps':'b9e72bdeccb85f630ae1509ca5779e9cdb62af84359f3053e3dd695e04b33d06',
  '90_Admin':'6479f767f9113f3205e7dd72b5418b4cdf92fa1f37c6347e8a12ac300f85e69a',
  'appsscript':'7e189dc49b9ac58af337fab5a4a96ee8532a2a5c8c190eb571dd6373cd154543'
};
const sha256=s=>crypto.createHash('sha256').update(s).digest('hex');
function deepFind(o, keys){if(!o||typeof o!=='object')return '';for(const [k,v] of Object.entries(o))if(keys.includes(k)&&typeof v==='string'&&v)return v;for(const v of Object.values(o)){const s=deepFind(v,keys);if(s)return s;}return '';}
function fileMap(files){const m=new Map();for(const f of files){if(m.has(f.name))throw Error('DUPLICATE_FILE_'+f.name);m.set(f.name,f);}return m;}
function verifyPre(files){const m=fileMap(files);if(m.size!==22)throw Error('LIVE_FILE_COUNT_DRIFT_'+m.size);for(const [name,hash] of Object.entries(PRE_SHA256)){const f=m.get(name);if(!f||sha256(f.source||'')!==hash)throw Error('LIVE_SOURCE_DRIFT_'+name);if(name==='appsscript'&&f.type!=='JSON')throw Error('LIVE_MANIFEST_TYPE_DRIFT');}return true;}
function loadV8(files){const ctx=vm.createContext({console:{log(){},warn(){},error(){}}});for(const f of files){if(f.type==='SERVER_JS')new vm.Script(f.source,{filename:f.name}).runInContext(ctx,{timeout:3000});}return ctx;}
function verifyFunctionParity(before,after){const a=loadV8(before);const b=loadV8(after);const fns=(x)=>Object.keys(x).filter(k=>typeof x[k]==='function').sort();const x=fns(a),y=fns(b);if(x.length!==682||JSON.stringify(x)!==JSON.stringify(y))throw Error('FUNCTION_SET_PARITY_FAILED_'+x.length+'_'+y.length);for(const k of x)if(a[k].toString()!==b[k].toString())throw Error('FUNCTION_SOURCE_CHANGED_'+k);
for(const name of ['TMV3_VERSION','TMV3_EXECUTION_STAGE','TMV3_MODE','TMV3_TIMEZONE'])if(JSON.stringify(vm.runInContext(name,a))!==JSON.stringify(vm.runInContext(name,b)))throw Error('CONFIG_VARIABLE_CHANGED_'+name);
return {functionCount:x.length,unchanged:true};}
function target(){const mf=JSON.parse(fs.readFileSync(path.join(DIR,'migration-manifest.json'),'utf8'));const all=SCRIPT_FILES.map(name=>{const source=fs.readFileSync(path.join(DIR,name),'utf8');if(sha256(source)!==mf.files[name].sha256)throw Error('STAGED_FILE_HASH_MISMATCH_'+name);return {name:name.replace(/\.gs$/,''),type:'SERVER_JS',source};});const manifest=fs.readFileSync(path.join(DIR,'appsscript.json'),'utf8');if(sha256(manifest)!==mf.files['appsscript.json'].sha256)throw Error('STAGED_MANIFEST_HASH_MISMATCH');all.push({name:'appsscript',type:'JSON',source:manifest});return all;}
function compareTarget(actual,desired){const m=fileMap(actual),t=fileMap(desired);if(m.size!==t.size)return false;for(const [name,f] of t){const got=m.get(name);if(!got||got.type!==f.type||sha256(got.source||'')!==sha256(f.source))return false;}return true;}
async function getToken(){const config=JSON.parse(process.env.CLASPRC_JSON||'{}');const data=new URLSearchParams({grant_type:'refresh_token',client_id:deepFind(config,['clientId','client_id']),client_secret:deepFind(config,['clientSecret','client_secret']),refresh_token:deepFind(config,['refresh_token','refreshToken'])});if([...data.values()].some(v=>!v))throw Error('OAUTH_CONFIG_INCOMPLETE');const r=await fetch('https://oauth2.googleapis.com/token',{method:'POST',body:data,redirect:'error',signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error('OAUTH_REFRESH_HTTP_'+r.status);const b=await r.json();if(!b.access_token)throw Error('OAUTH_ACCESS_TOKEN_MISSING');return b.access_token;}
async function api(accessToken,method,body){const r=await fetch('https://script.googleapis.com/v1/projects/'+SCRIPT_ID+'/content',{method,headers:{Authorization:'Bearer '+accessToken,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),redirect:'error',signal:AbortSignal.timeout(110000)});if(!r.ok){const e=await r.json().catch(()=>({}));throw Error('SCRIPT_API_'+method+'_HTTP_'+r.status+'_'+String(e.error?.status||'API_ERROR').slice(0,60));}return await r.json();}
async function main(){const mode=process.argv[2]||'dry-run';if(!['dry-run','deploy'].includes(mode))throw Error('INVALID_MODE');const after=target();const token=await getToken();const first=await api(token,'GET');verifyPre(first.files||[]);const parity=verifyFunctionParity(first.files,after);console.log('PRE_DEPLOY_READONLY_CHECK='+JSON.stringify({sourceVersion:'3.12.21-shared-preinspection-calendar-r1',beforeFiles:first.files.length,afterFiles:after.length,...parity,mode}));if(mode==='dry-run')return;
const second=await api(token,'GET');verifyPre(second.files||[]);const backup=second.files;let attempted=false;try{attempted=true;await api(token,'PUT',{files:after});const verify=await api(token,'GET');if(!compareTarget(verify.files||[],after))throw Error('POST_DEPLOY_READBACK_MISMATCH');verifyFunctionParity(backup,verify.files);console.log('DEPLOY_VERIFIED='+JSON.stringify({status:'HEAD_SOURCE_UPDATED_READBACK_VERIFIED',scriptId:SCRIPT_ID,oldFiles:backup.length,newFiles:after.length,functions:682,sourceMutationOnly:true,triggerChanges:0,numberedVersionsCreated:0}));return;
}catch(err){console.error('DEPLOY_FAILURE_RECONCILING='+String(err.message||err).slice(0,120));if(!attempted)throw err;let current;try{current=await api(token,'GET');}catch(e){throw Error('DEPLOY_UNCERTAIN_OUTCOME_CANNOT_READBACK_'+String(e.message||e));}if(compareTarget(current.files||[],backup)){throw Error('SOURCE_UNCHANGED_AFTER_FAILED_UPDATE_'+String(err.message||err));}if(compareTarget(current.files||[],after)){try{await api(token,'PUT',{files:backup});const restored=await api(token,'GET');if(!compareTarget(restored.files||[],backup))throw Error('ROLLBACK_READBACK_FAILED');console.error('ROLLBACK_VERIFIED');}catch(restore){throw Error('ROLLBACK_FAILED_'+String(restore.message||restore));}throw Error('RELEASE_ABORTED_ROLLBACK_VERIFIED_'+String(err.message||err));}throw Error('UNRECOGNIZED_CONCURRENT_SOURCE_CHANGE_NO_AUTOMATIC_RESTORE_'+String(err.message||err));}}
main().catch(err=>{console.error('DEPLOY_GATE_FAILED='+String(err.message||err).slice(0,200));process.exitCode=1;});
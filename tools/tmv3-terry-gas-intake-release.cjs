// Node.js: guarded Apps Script HEAD append-only Terry Calendar intake release.
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),vm=require('node:vm');
const cp=require('node:child_process');
const dir='apps-script/tmv3-vertical-split-staging';
const scriptId='1shaSL1CeNhR2-fr8H4x0fP2KUIjpOizLFyrNRAnGGXkCvERX4hZyJ5Gt';
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
const fileAt=(commit,file)=>cp.execFileSync('git',['show',commit+':'+dir+'/'+file+'.gs'],{encoding:'utf8'});
const baseline=fileAt('e18488fa760f1aa66de22147fea8d1d67132cf50','30_PreInspection');
const staged=fs.readFileSync(path.join(dir,'30_PreInspection.gs'),'utf8');
const manifest=JSON.parse(fs.readFileSync(path.join(dir,'migration-manifest.json'),'utf8'));
const fileNames=['00_Configuration','10_Shared_Core','20_Master_Triggers','30_PreInspection','40_Installation','50_Delivery','60_Service','90_Regression_Tests'];
const previousChanges=['tmv3_preInspectionPromoteCandidate_','tmv3_preInspectionSendMissingDetails_',
 'tmv3_ensurePreInspectionMirror_','tmv3_reconcilePreInspectionCalendarParity_',
 'tmv3_restorePreInspectionLegacyTitle_','tmv3_reconcilePreInspectionSharedGuest_AUTO_',
 'tmv3_preInspectionAutomationCycle_'];
const added=['tmv3_terryQuietCalendarIntake_','tmv3_previewTerryQuietCalendarIntake','tmv3_importTerryQuietCalendarIntake'];
function extract(source,name){
 const token='function '+name+'(';
 const first=source.indexOf(token);
 if(first<0||source.indexOf(token,first+token.length)>=0)throw Error('FUNCTION_MISSING_OR_DUPLICATE_'+name);
 const m=/^function [^]*?^}/m.exec(source.slice(first));
 if(!m||m.index!==0)throw Error('FUNCTION_EXTRACT_FAILURE_'+name);
 return m[0];
}
let expected=baseline.replace(extract(baseline,'tmv3_verifyPreInspectionAutomation'),
 extract(staged,'tmv3_verifyPreInspectionAutomation'));
for(const name of previousChanges)expected=expected.replace(extract(expected,name),extract(staged,name));
expected+='\n\n'+extract(staged,'tmv3_preInspectionApprovalHold_')+'\n';
const expectedPIHash=sha(expected);
const deployed='d19e9291a9ec25abd7b70839c6b2436292f6e2ca';
const expectedConfigHash=sha(fileAt(deployed,'00_Configuration'));
const expectedCoreHash=sha(fileAt(deployed,'10_Shared_Core'));
function map(files){const m=new Map();for(const f of files){if(m.has(f.name))throw Error('DUPLICATE_LIVE_FILE');m.set(f.name,f);}return m;}
function checkLive(files){
 const m=map(files);
 if(m.size!==9)throw Error('LIVE_FILE_COUNT_DRIFT_'+m.size);
 for(const name of fileNames){
  const f=m.get(name);
  if(!f||f.type!=='SERVER_JS')throw Error('LIVE_SOURCE_MISSING_'+name);
  const hash=name==='30_PreInspection'?expectedPIHash:name==='00_Configuration'?expectedConfigHash:
    name==='10_Shared_Core'?expectedCoreHash:manifest.files[name+'.gs'].sha256;
  if(sha(f.source)!==hash)throw Error('LIVE_SOURCE_HASH_DRIFT_'+name);
 }
 if(!m.get('appsscript')||sha(m.get('appsscript').source)!==manifest.files['appsscript.json'].sha256)
   throw Error('LIVE_MANIFEST_HASH_DRIFT');
}
function same(a,b){const m=map(a),n=map(b);return m.size===n.size&&[...m].every(([key,x])=>n.has(key)&&x.type===n.get(key).type&&sha(x.source)===sha(n.get(key).source));}
function functions(files){
 const ctx=vm.createContext({console:{log(){}}});
 for(const f of files.filter(f=>f.type==='SERVER_JS'))new vm.Script(f.source,{filename:f.name}).runInContext(ctx,{timeout:3500});
 return Object.fromEntries(Object.keys(ctx).filter(k=>typeof ctx[k]==='function').map(k=>[k,String(ctx[k])]));
}
function verify(before,after){
 const oldFns=functions(before),newFns=functions(after);
 if(Object.keys(oldFns).length!==690||Object.keys(newFns).length!==693)throw Error('FUNCTION_COUNT_DRIFT');
 const changed=Object.keys(oldFns).filter(k=>oldFns[k]!==newFns[k]);
 const introduced=Object.keys(newFns).filter(k=>!oldFns[k]);
 if(changed.length||introduced.slice().sort().join('|')!==added.slice().sort().join('|'))
   throw Error('SOURCE_SCOPE_DRIFT_'+changed.join(',')+'+'+introduced.join(','));
 for(const name of added){
  const body=newFns[name];
  if(!body||body.includes('MailApp')||body.includes('.addGuest(')||body.includes('tmv3_executeFreshStep7Selection_('))
   throw Error('DISALLOWED_BUSINESS_WRITER_'+name);
 }
 return{prior:690,unchanged:690,added:introduced,after:693};
}
function finalFiles(files){
 const prior=map(files).get('30_PreInspection').source;
 for(const name of added)if(prior.includes('function '+name+'('))throw Error('FUNCTION_ALREADY_PRESENT_'+name);
 const additions=added.map(name=>extract(staged,name)).join('\n\n');
 return files.map(f=>f.name==='30_PreInspection'?{...f,source:prior+'\n\n'+additions+'\n'}:f);
}
function scope(o,keys){if(!o||typeof o!=='object')return '';for(const [k,v] of Object.entries(o))if(keys.includes(k)&&typeof v==='string'&&v)return v;for(const v of Object.values(o)){const value=scope(v,keys);if(value)return value;}return '';}
async function token(){
 const config=JSON.parse(process.env.CLASPRC_JSON||'{}');
 const p=new URLSearchParams({grant_type:'refresh_token',
  client_id:scope(config,['clientId','client_id']),
  client_secret:scope(config,['clientSecret','client_secret']),
  refresh_token:scope(config,['refresh_token','refreshToken'])});
 if([...p.values()].some(x=>!x))throw Error('OAUTH_FIELDS_MISSING');
 const r=await fetch('https://oauth2.googleapis.com/token',{method:'POST',body:p,signal:AbortSignal.timeout(20000)});
 if(!r.ok)throw Error('OAUTH_HTTP_'+r.status);
 const obj=await r.json();if(!obj.access_token)throw Error('ACCESS_TOKEN_MISSING');return obj.access_token;
}
async function api(auth,method,body){
 const r=await fetch('https://script.googleapis.com/v1/projects/'+scriptId+'/content',
  {method,headers:{Authorization:'Bearer '+auth,...(body?{'Content-Type':'application/json'}:{})},
   ...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(90000)});
 if(!r.ok)throw Error('APPS_SCRIPT_HTTP_'+method+'_'+r.status);
 return r.json();
}
async function run(){
 const mode=process.argv[2]||'dry-run';
 if(!['dry-run','deploy'].includes(mode))throw Error('BAD_RELEASE_MODE');
 const auth=await token(),before=(await api(auth,'GET')).files||[];
 checkLive(before);
 const desired=finalFiles(before),checks=verify(before,desired);
 console.log('TERRY_GAS_PREFLIGHT='+JSON.stringify({mode,...checks,calendarWrites:0,strivenWrites:0,taskWrites:0,emails:0,numberedVersions:0}));
 if(mode==='dry-run')return;
 const next=(await api(auth,'GET')).files||[];
 checkLive(next);if(!same(before,next))throw Error('CONCURRENT_LIVE_SOURCE_DRIFT');
 try{
  await api(auth,'PUT',{files:desired});
  const after=(await api(auth,'GET')).files||[];
  if(!same(after,desired))throw Error('SOURCE_READBACK_MISMATCH');
  verify(next,after);
  console.log('TERRY_GAS_DEPLOYED='+JSON.stringify({status:'SOURCE_READBACK_VERIFIED',functions:693,newFunctions:3,existingFunctionsUnchanged:690,calendarWrites:0,strivenWrites:0,emails:0,numberedVersions:0}));
 }catch(e){
  let current;try{current=(await api(auth,'GET')).files||[];}catch(x){throw Error('UNKNOWN_APPS_SCRIPT_SOURCE_OUTCOME');}
  if(same(current,next))throw Error('DEPLOY_FAILED_WITH_NO_SOURCE_CHANGE_'+e.message);
  if(same(current,desired)){
    await api(auth,'PUT',{files:next});
    const restored=(await api(auth,'GET')).files||[];
    if(!same(restored,next))throw Error('ROLLBACK_READBACK_FAILED');
    throw Error('DEPLOY_FAILED_ROLLBACK_VERIFIED_'+e.message);
  }
  throw Error('SOURCE_DRIFT_OR_UNKNOWN_WRITE_OUTCOME_NO_FURTHER_ACTION');
 }
}
run().catch(e=>{console.error('TERRY_GAS_RELEASE_STOP='+String(e.message||e).slice(0,200));process.exitCode=1;});

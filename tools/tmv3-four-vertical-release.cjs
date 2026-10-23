// JavaScript / Node.js: exact two-file native-source release; durable PRE, guarded apply, metadata-only canary and rollback.
'use strict';
const fs=require('node:fs'),crypto=require('node:crypto'),vm=require('node:vm');
const {profiles}=require('./tmv3-execution-access-diagnostic.js');
const DIR='four-vertical-release-evidence',MANIFEST='release-candidates/tmv3-four-vertical-20261023.json';
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
const canonical=o=>hash(JSON.stringify(o.files.map(f=>({name:f.name,type:f.type,source:f.source||''})).sort((a,b)=>a.name.localeCompare(b.name))));
async function main(mode){
 const m=JSON.parse(fs.readFileSync(MANIFEST));if(m.scriptId!=='1shaSL1CeNhR2-fr8H4x0fP2KUIjpOizLFyrNRAnGGXkCvERX4hZyJ5Gt'||m.files.map(f=>f.name).sort().join(',')!=='00_Config,36_Step3_Business_Anchor,46_Step7_Reconciliation,58_Operations,60_Automation,70_Regression')throw Error('SCOPE_MISMATCH');
 fs.mkdirSync(DIR,{recursive:true,mode:0o700});
 const ps=profiles(JSON.parse(process.env.CLASPRC_JSON||'{}'));if(ps.length!==1)throw Error('EXPECTED_ONE_PROFILE');const p=ps[0];
 const r=await fetch('https://oauth2.googleapis.com/token',{method:'POST',body:new URLSearchParams({grant_type:'refresh_token',client_id:p.client,client_secret:p.secret,refresh_token:p.refresh}),redirect:'error'});if(!r.ok)throw Error('AUTH_FAILED');const auth=await r.json();
 async function api(path,method='GET',body){const r=await fetch('https://script.googleapis.com/v1/'+path,{method,headers:{Authorization:'Bearer '+auth.access_token,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),redirect:'error',signal:AbortSignal.timeout(650000)});if(!r.ok)throw Error('GOOGLE_HTTP_'+r.status);return r.json();}
 const path='projects/'+m.scriptId+'/content';
 if(mode==='prepare'){
  const before=await api(path);if(canonical(before)!==m.beforeHash)throw Error('LIVE_SOURCE_DRIFT_NO_WRITE');
  const work={files:before.files.map(f=>{const spec=m.files.find(s=>s.name===f.name);if(!spec)return f;if(hash(f.source)!==spec.before)throw Error('FILE_DRIFT');const desired=fs.readFileSync(spec.path,'utf8');if(hash(desired)!==spec.after)throw Error('DESIRED_HASH_MISMATCH');return {...f,source:desired};})};
  if(canonical(work)!==m.afterHash)throw Error('WORK_HASH_MISMATCH');
  for(const f of work.files)if(f.type==='SERVER_JS')new vm.Script(f.source,{filename:f.name});
  if(before.files.some(f=>/(?:api[_-]?key|client[_-]?secret|access[_-]?token|refresh[_-]?token)\s*[:=]\s*['"][A-Za-z0-9_./+-]{20,}['"]/i.test(f.source||'')))throw Error('POSSIBLE_LITERAL_SECRET_NO_EXPORT');
  fs.writeFileSync(DIR+'/before.json',JSON.stringify(before),{mode:0o600});fs.writeFileSync(DIR+'/work.json',JSON.stringify(work),{mode:0o600});
  fs.mkdirSync(DIR+'/work',{recursive:true});for(const f of work.files)if(f.type==='SERVER_JS')fs.writeFileSync(DIR+'/work/'+f.name+'.js',f.source,{mode:0o600});
  console.log(JSON.stringify({status:'PREPARED',beforeHash:m.beforeHash,afterHash:m.afterHash,changed:m.files.map(f=>f.name),sourceWrites:0}));return;
 }
 if(mode!=='apply')throw Error('UNKNOWN_MODE');
 const before=JSON.parse(fs.readFileSync(DIR+'/before.json')),work=JSON.parse(fs.readFileSync(DIR+'/work.json'));
 if(canonical(before)!==m.beforeHash||canonical(work)!==m.afterHash||canonical(await api(path))!==m.beforeHash)throw Error('PRE_WRITE_DRIFT');
 const report={status:'NOT_STARTED',version:m.version,beforeHash:m.beforeHash,afterHash:m.afterHash,changedFiles:m.files.map(f=>f.name),businessWrites:0,permissionsChanged:false,versionsCreated:0,existingDeploymentsChanged:false};
 let attempted=false;
 try{
  attempted=true;await api(path,'PUT',{files:work.files});if(canonical(await api(path))!==m.afterHash)throw Error('SOURCE_READBACK_MISMATCH');
  report.sourceVerified=true;
  const inv=await api('projects/'+m.scriptId+'/deployments'),ds=(inv.deployments||[]).filter(d=>(d.entryPoints||[]).some(e=>e.entryPointType==='EXECUTION_API'||e.executionApi));if(ds.length!==1)throw Error('EXPECTED_ONE_EXECUTABLE');
  async function native(fn){
   for(let attempt=1;attempt<=5;attempt++){
    const response=await api('scripts/'+encodeURIComponent(ds[0].deploymentId)+':run','POST',{function:fn,devMode:true});
    if(response.error||response.done!==true)throw Error('RUNTIME_UNCERTAIN_NO_MUTATION_RETRY:'+JSON.stringify(response.error||{}));
    const result=response.response.result;
    if(result.status!=='LOCK_BUSY')return result;
    if(attempt<5)await new Promise(resolve=>setTimeout(resolve,15000));
   }throw Error('LOCK_BUSY_EXHAUSTED');
  }
  report.triggerInstall=await native('tmv3_installVerticalProductionTrigger');
  report.initialStatus=await native('tmv3_fourVerticalAutomationStatus');
  if(Object.values(report.initialStatus.verticals).some(v=>v.enabled!==true)||report.initialStatus.generalAutomationWritesEnabled!==false||report.initialStatus.manualWritesEnabled!==false)throw Error('ACTIVATION_FLAGS_MISMATCH');
  report.canaries={};
  for(const v of ['Service','Delivery','Install'])report.canaries[v]=await native('tmv3_run'+v+'Automation');
  report.finalStatus=await native('tmv3_fourVerticalAutomationStatus');
  if(Object.values(report.finalStatus.verticals).some(v=>v.enabled!==true))throw Error('FINAL_ACTIVATION_MISMATCH');
  report.finalHash=canonical(await api(path));if(report.finalHash!==m.afterHash)throw Error('FINAL_SOURCE_DRIFT');
  report.status='FOUR_VERTICALS_ACTIVE_NATIVE_VERIFIED';report.runtimeVerified=true;
 }catch(e){
  report.status='STOPPED_RECONCILE';report.error=String(e.message);process.exitCode=1;
  if(attempted){const current=canonical(await api(path));if(current===m.afterHash){await api(path,'PUT',{files:before.files});report.rollbackVerified=canonical(await api(path))===m.beforeHash;}else report.rollbackVerified=current===m.beforeHash;}
 }finally{fs.writeFileSync(DIR+'/result.json',JSON.stringify(report,null,2),{mode:0o600});console.log(JSON.stringify(report));}
}
main(process.argv[2]).catch(e=>{console.error(e.message);process.exitCode=1;});



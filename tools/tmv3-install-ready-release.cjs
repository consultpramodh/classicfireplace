'use strict';
const fs=require('node:fs'),crypto=require('node:crypto'),vm=require('node:vm');
const {profiles}=require('./tmv3-execution-access-diagnostic.js');
const SID='1shaSL1CeNhR2-fr8H4x0fP2KUIjpOizLFyrNRAnGGXkCvERX4hZyJ5Gt',DIR='install-ready-evidence';
const digest=x=>crypto.createHash('sha256').update(JSON.stringify(x.files.map(f=>({name:f.name,type:f.type,source:f.source||''})).sort((a,b)=>a.name.localeCompare(b.name)))).digest('hex');
(async()=>{
 const ps=profiles(JSON.parse(process.env.CLASPRC_JSON||'{}'));if(ps.length!==1)throw Error('ONE_PROFILE_REQUIRED');const p=ps[0];
 const ar=await fetch('https://oauth2.googleapis.com/token',{method:'POST',body:new URLSearchParams({grant_type:'refresh_token',client_id:p.client,client_secret:p.secret,refresh_token:p.refresh})});if(!ar.ok)throw Error('AUTH_FAILED');const auth=await ar.json();
 async function api(path,method='GET',body){const r=await fetch('https://script.googleapis.com/v1/'+path,{method,headers:{Authorization:'Bearer '+auth.access_token,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(650000)});if(!r.ok)throw Error('GOOGLE_HTTP_'+r.status);return r.json();}
 if(process.argv[2]==='prepare'){
  fs.mkdirSync(DIR,{recursive:true});const before=await api('projects/'+SID+'/content');
  const files=before.files.map(f=>{
   if(!['00_Config','60_Automation','20_Striven'].includes(f.name))return f;
   const expected=fs.readFileSync('release-candidates/install-ready-before-'+f.name+'.js','utf8');
   if(f.source.trimEnd()!==expected.trimEnd())throw Error('LIVE_FILE_DRIFT:'+f.name);
   return {...f,source:fs.readFileSync('apps-script/tmv3-clean/'+f.name+'.js','utf8')};
  });
  for(const f of files)if(f.type==='SERVER_JS')new vm.Script(f.source);
  fs.writeFileSync(DIR+'/before.json',JSON.stringify(before));fs.writeFileSync(DIR+'/candidate.json',JSON.stringify({files}));fs.mkdirSync(DIR+'/work',{recursive:true});for(const f of files)if(f.type==='SERVER_JS')fs.writeFileSync(DIR+'/work/'+f.name+'.js',f.source);
  console.log(JSON.stringify({status:'PREPARED',beforeHash:digest(before),afterHash:digest({files})}));return;
 }
 const before=JSON.parse(fs.readFileSync(DIR+'/before.json')),candidate=JSON.parse(fs.readFileSync(DIR+'/candidate.json'));
 if(digest(await api('projects/'+SID+'/content'))!==digest(before))throw Error('PRE_PUSH_SOURCE_DRIFT');
 try {
 await api('projects/'+SID+'/content','PUT',candidate);
 if(digest(await api('projects/'+SID+'/content'))!==digest(candidate))throw Error('SOURCE_READBACK_FAILED');
 const inv=await api('projects/'+SID+'/deployments'),ds=inv.deployments.filter(d=>(d.entryPoints||[]).some(e=>e.entryPointType==='EXECUTION_API'||e.executionApi));if(ds.length!==1)throw Error('EXECUTABLE_AMBIGUOUS');
 async function run(fn,parameters=[]){const r=await api('scripts/'+encodeURIComponent(ds[0].deploymentId)+':run','POST',{function:fn,parameters,devMode:true});if(r.error||!r.done)throw Error('NATIVE_EXECUTION_FAILED:'+JSON.stringify(r.error));return r.response.result;}
 const health=await run('tmv3_healthCheck');if(!health.ready||health.version!=='3.12.14-install-flow-readiness-r1')throw Error('HEALTH_FAILED');
 const install={status:'STANDARD_DAILY_SCHEDULE_PRESERVED'};
 const triggers=await run('tmv3_listTriggers');for(const v of ['preInspection','install','delivery','service'])for(const h of ['0800','1300','1700'])if(triggers.filter(t=>t.handler==='tmv3_'+v+'Check'+h).length!==1)throw Error('STANDARD_SCHEDULE_MISMATCH');
 const report={status:'LIVE_FULL_SWEEP_SOURCE_VERIFIED',health,install,triggers,sourceHash:digest(candidate),businessWorkersInvoked:0};fs.writeFileSync(DIR+'/result.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 const readiness=await run('tmv3_installReadiness');
 fs.writeFileSync(DIR+'/readiness.json',JSON.stringify(readiness,null,2));console.log(JSON.stringify({readiness}));
 if(!readiness.readyForTriggerInstallation || readiness.installedInstallTriggers.length!==3)throw Error('INSTALL_READINESS_FAILED');
 if(digest(await api('projects/'+SID+'/content'))!==digest(candidate))throw Error('POST_READINESS_SOURCE_DRIFT');
 console.log(JSON.stringify({status:'INSTALL_FLOW_DEPLOYED_AND_PREFLIGHT_VERIFIED',version:health.version,sourceHash:digest(candidate),triggerMutations:0,businessWorkersInvoked:0}));

 }catch(error){
   const current=await api('projects/'+SID+'/content');
   if(digest(current)===digest(candidate)){
     await api('projects/'+SID+'/content','PUT',before);
     if(digest(await api('projects/'+SID+'/content'))!==digest(before))throw Error('ROLLBACK_READBACK_FAILED');
     console.error('SOURCE_ROLLBACK_VERIFIED');
   }else if(digest(current)!==digest(before))console.error('SOURCE_DRIFT_NO_OVERWRITE');
   throw error;
 }

})().catch(e=>{console.error(e.message);process.exitCode=1;});

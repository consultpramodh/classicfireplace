'use strict';
const fs=require('fs'),vm=require('vm'),crypto=require('crypto'),zlib=require('zlib'),cp=require('child_process');
const {profiles}=require('./tools/tmv3-execution-access-diagnostic.js');
const SID='1shaSL1CeNhR2-fr8H4x0fP2KUIjpOizLFyrNRAnGGXkCvERX4hZyJ5Gt';
const VERSION='3.12.16-preinspection-sweep-recovery-r1';
const canonical=o=>crypto.createHash('sha256').update(JSON.stringify(o.files.map(f=>({name:f.name,type:f.type,source:f.source||''})).sort((a,b)=>a.name.localeCompare(b.name)))).digest('hex');
(async()=>{
 const p=profiles(JSON.parse(process.env.CLASPRC_JSON||'{}'));if(p.length!==1)throw Error('PROFILE_COUNT');
 const ar=await fetch('https://oauth2.googleapis.com/token',{method:'POST',body:new URLSearchParams({grant_type:'refresh_token',client_id:p[0].client,client_secret:p[0].secret,refresh_token:p[0].refresh}),redirect:'error'});if(!ar.ok)throw Error('AUTH_FAILED');const token=(await ar.json()).access_token;
 async function api(path,method='GET',body){const r=await fetch('https://script.googleapis.com/v1/'+path,{method,headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),redirect:'error',signal:AbortSignal.timeout(120000)});if(!r.ok)throw Error('GOOGLE_HTTP_'+r.status+'_'+method);return r.json();}
 const before=await api('projects/'+SID+'/content');
 const backup=JSON.parse(zlib.gunzipSync(Buffer.from(fs.readFileSync('backups/task-mapping-v3/2026-10-14-versions/head-current.json.gz.b64','utf8').trim(),'base64')).toString());
 if(canonical(before)!==canonical(backup))throw Error('LIVE_SOURCE_DIFFERS_FROM_VERIFIED_BACKUP');
 const names=['00_Config','60_Automation'];
 const candidate={files:before.files.map(f=>names.includes(f.name)?{...f,source:fs.readFileSync('apps-script/tmv3-clean/'+f.name+'.js','utf8')}:f)};
 if(!candidate.files.find(f=>f.name==='00_Config').source.includes("const TMV3_VERSION = '"+VERSION+"';"))throw Error('WRONG_CANDIDATE_VERSION');
 for(const f of candidate.files)if(f.type==='SERVER_JS')new vm.Script(f.source,{filename:f.name});
 fs.mkdirSync('pi-release-work',{recursive:true});for(const f of candidate.files)if(f.type==='SERVER_JS')fs.writeFileSync('pi-release-work/'+f.name+'.js',f.source);
 for(const script of ['test-tmv3-full-vertical-sweep.cjs','test-tmv3-standard-schedule.cjs','test-tmv3-core-hardening.cjs','test-tmv3-pi-history-completion.js','test-tmv3-pi-order-classification.cjs']){
  const t=cp.spawnSync(process.execPath,['tools/'+script],{stdio:'inherit',env:{...process.env,TMV3_TEST_SOURCE_DIR:'pi-release-work'}});if(t.status!==0)throw Error('REGRESSION_FAILED_'+script);
 }
 let t=cp.spawnSync(process.execPath,['tests/preinspection/sweep-start-recovery.test.cjs'],{stdio:'inherit'});if(t.status!==0)throw Error('RECOVERY_TEST_FAILED');
 const inv=await api('projects/'+SID+'/deployments');const ds=(inv.deployments||[]).filter(d=>(d.entryPoints||[]).some(e=>e.entryPointType==='EXECUTION_API'||e.executionApi));if(ds.length!==1)throw Error('EXECUTION_DEPLOYMENT_AMBIGUOUS');const dep=ds[0];
 async function run(fn){const r=await api('scripts/'+encodeURIComponent(dep.deploymentId)+':run','POST',{function:fn,parameters:[],devMode:true});if(r.error||!r.done)throw Error('READBACK_EXECUTION_FAILED');return r.response.result;}
 const sig=rows=>JSON.stringify(rows.map(t=>[t.handler,t.source,t.eventType,t.sourceId]).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))));
 const triggersBefore=await run('tmv3_listTriggers');let wrote=false,changedDeployment=false;
 try {
  if(canonical(await api('projects/'+SID+'/content'))!==canonical(before))throw Error('PRE_WRITE_SOURCE_DRIFT');
  await api('projects/'+SID+'/content','PUT',candidate);wrote=true;
  if(canonical(await api('projects/'+SID+'/content'))!==canonical(candidate))throw Error('SOURCE_READBACK_FAILED');
  const health=await run('tmv3_healthCheck');if(!health.ready||health.version!==VERSION)throw Error('HEALTH_FAILED');
  if(sig(await run('tmv3_listTriggers'))!==sig(triggersBefore))throw Error('TRIGGER_DRIFT');
  const v=await api('projects/'+SID+'/versions','POST',{description:VERSION});
  await api('projects/'+SID+'/deployments/'+encodeURIComponent(dep.deploymentId),'PUT',{deploymentConfig:{...dep.deploymentConfig,versionNumber:v.versionNumber,description:VERSION}});changedDeployment=true;
  const check=await api('projects/'+SID+'/deployments/'+encodeURIComponent(dep.deploymentId));if(check.deploymentConfig.versionNumber!==v.versionNumber)throw Error('DEPLOYMENT_READBACK_FAILED');
  if(canonical(await api('projects/'+SID+'/content'))!==canonical(candidate))throw Error('FINAL_SOURCE_DRIFT');
  console.log(JSON.stringify({status:'DEPLOYED_VERIFIED',version:VERSION,versionNumber:v.versionNumber,sourceHash:canonical(candidate),triggersPreserved:true,businessRuns:0}));
 } catch(e){
  if(changedDeployment)await api('projects/'+SID+'/deployments/'+encodeURIComponent(dep.deploymentId),'PUT',{deploymentConfig:dep.deploymentConfig});
  if(wrote){const now=await api('projects/'+SID+'/content');if(canonical(now)!==canonical(candidate))throw Error('ROLLBACK_BLOCKED_SOURCE_CHANGED');await api('projects/'+SID+'/content','PUT',{files:before.files});if(canonical(await api('projects/'+SID+'/content'))!==canonical(before))throw Error('ROLLBACK_VERIFY_FAILED');console.log('ROLLBACK_VERIFIED');}
  throw e;
 }
})().catch(e=>{console.error('RELEASE_FAILED:'+e.message);process.exitCode=1});

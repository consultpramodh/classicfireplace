'use strict';
const fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
const {profiles}=require('./tmv3-execution-access-diagnostic.js');
const SID='1shaSL1CeNhR2-fr8H4x0fP2KUIjpOizLFyrNRAnGGXkCvERX4hZyJ5Gt';
const VERSION='3.12.15-internal-api-budget-disabled-r1';
const DIR='internal-budget-release-evidence';
function patch(name,source){
 if(name==='00_Config'){
  if(!source.includes("const TMV3_VERSION = '3.12.14-install-flow-readiness-r1';"))throw Error('UNEXPECTED_LIVE_VERSION');
  source=source.replace("const TMV3_VERSION = '3.12.14-install-flow-readiness-r1';","const TMV3_VERSION = '"+VERSION+"';");
  if(!source.includes('API_BUDGET: Object.freeze({'))throw Error('BUDGET_CONFIG_MISSING');
  return source.replace('API_BUDGET: Object.freeze({','API_BUDGET: Object.freeze({\n    // Usage telemetry only. Striven-reported exhaustion still stops requests.\n    enabled: false,');
 }
 if(name==='20_Striven'){
  const changes=[
   ["const softLimit = Number(cfg.v3DailySoftLimit || 1200);","const internalLimitEnabled = cfg.enabled !== false;\n  const softLimit = internalLimitEnabled ? Number(cfg.v3DailySoftLimit || 1200) : null;"],
   ['    softLimit: softLimit,\n    remaining: Math.max(0, tmv3_strivenApiEffectiveSoftLimit_({softLimit:softLimit},cfg) - count),','    enabled: internalLimitEnabled,\n    limitMode: internalLimitEnabled ? \'ENFORCED\' : \'TRACKING_ONLY\',\n    softLimit: softLimit,\n    remaining: exhausted ? 0 : Math.max(0, tmv3_strivenApiEffectiveSoftLimit_({softLimit:softLimit},cfg) - count),'],
   ['    preInspectionReservedCalls: Number(cfg.preInspectionReservedCalls || 0),','    preInspectionReservedCalls: internalLimitEnabled ? Number(cfg.preInspectionReservedCalls || 0) : 0,'],
   ['    reserveForOtherWorkflows: Number(cfg.reserveForOtherWorkflows || 0),','    reserveForOtherWorkflows: internalLimitEnabled ? Number(cfg.reserveForOtherWorkflows || 0) : 0,'],
   ['  cfg = cfg || tmv3_strivenApiBudgetConfig_();\n  context = context || {};','  cfg = cfg || tmv3_strivenApiBudgetConfig_();\n  // Finite sentinel preserves existing numeric queue checks and JSON serialization.\n  if (cfg.enabled === false) return Number.MAX_SAFE_INTEGER;\n  context = context || {};'],
   ['  if (status.exhausted || status.count >= effectiveSoftLimit) {','  if (status.exhausted || (cfg.enabled !== false && status.count >= effectiveSoftLimit)) {'],
   ['    softLimit: effectiveSoftLimit,\n    baseSoftLimit: status.softLimit','    enabled: cfg.enabled !== false,\n    softLimit: cfg.enabled === false ? null : effectiveSoftLimit,\n    baseSoftLimit: status.softLimit']
  ];
  for(const [old,replacement] of changes){if(source.split(old).length!==2)throw Error('STRIVEN_SOURCE_DRIFT');source=source.replace(old,replacement);}return source;
 }
 if(name==='60_Automation'){
  const old="if (budget.count-initialBudget.count>=32 || Date.now()-started>=120000) {paused='SLICE_BUDGET';break;}";
  if(source.split(old).length!==2)throw Error('SLICE_SOURCE_DRIFT');
  return source.replace(old,"if ((budget.enabled !== false && budget.count-initialBudget.count>=32) || Date.now()-started>=120000) {paused='SLICE_BUDGET';break;}");
 }
 return source;
}
function test(source){
 const assert=require('node:assert/strict'),values={TMV3_STRIVEN_API_BUDGET_DATE:'2026-10-26',TMV3_STRIVEN_API_BUDGET_COUNT:'99999'};
 const context={TMV3:{API_BUDGET:{enabled:false,v3DailySoftLimit:1200,preInspectionReservedCalls:200,planDailyLimit:5000,propertyPrefix:'TMV3_STRIVEN_API_BUDGET'},MODE:'PRODUCTION_WRITE'},TMV3_TIMEZONE:'America/Toronto',Utilities:{formatDate:()=> '2026-10-26'},PropertiesService:{getScriptProperties:()=>({getProperty:k=>values[k]||'',setProperties:o=>Object.assign(values,o)})}};
 vm.createContext(context);vm.runInContext(source,context);
 let status=context.tmv3_strivenApiBudgetStatus_();assert.equal(status.enabled,false);assert.equal(status.softLimit,null);assert.equal(status.count,99999);assert.ok(status.remaining>1000000);assert.equal(status.preInspectionReservedCalls,0);assert.equal(status.reserveForOtherWorkflows,0);
 context.tmv3_reserveStrivenApiCall_('TEST');assert.equal(values.TMV3_STRIVEN_API_BUDGET_COUNT,'100000');assert.equal(context.TMV3_RUNTIME_METRICS.strivenApiBudgetBlocks,0);
 assert.equal(JSON.parse(JSON.stringify(status)).remaining,status.remaining);
 context.tmv3_markStrivenDailyLimitExhausted_('vendor daily api usage limit');assert.equal(context.tmv3_strivenApiBudgetStatus_().remaining,0);assert.throws(()=>context.tmv3_reserveStrivenApiCall_('TEST'),/TMV3_STRIVEN_API_DAILY_GUARD/);
 values.TMV3_STRIVEN_API_BUDGET_EXHAUSTED_DATE='2026-10-25';assert.equal(context.tmv3_strivenApiBudgetStatus_().exhausted,false);context.tmv3_reserveStrivenApiCall_('TEST');
 context.TMV3.API_BUDGET.enabled=true;assert.throws(()=>context.tmv3_reserveStrivenApiCall_('TEST'),/TMV3_STRIVEN_API_DAILY_GUARD/);
 assert.equal(context.tmv3_isStrivenDailyLimitResponse_(429,'daily api usage limit'),true);
 console.log('PASS: no internal quota, telemetry preserved, numeric consumers compatible, vendor exhaustion still blocks, next day releases vendor marker');
}
module.exports={patch,test};
async function main(){
 const ps=profiles(JSON.parse(process.env.CLASPRC_JSON||'{}'));if(ps.length!==1)throw Error('ONE_PROFILE_REQUIRED');const p=ps[0];
 const ar=await fetch('https://oauth2.googleapis.com/token',{method:'POST',body:new URLSearchParams({grant_type:'refresh_token',client_id:p.client,client_secret:p.secret,refresh_token:p.refresh})});if(!ar.ok)throw Error('GOOGLE_AUTH_FAILED');const auth=await ar.json();
 async function api(path,method='GET',body){const r=await fetch('https://script.googleapis.com/v1/'+path,{method,headers:{Authorization:'Bearer '+auth.access_token,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(120000)});if(!r.ok){let error={};try{error=await r.json();}catch{}throw Error('GOOGLE_HTTP_'+r.status+' '+method+' '+path+': '+String(error.error&&error.error.message||'').slice(0,500));}return r.json();}
 const hash=x=>crypto.createHash('sha256').update(JSON.stringify(x.files.map(f=>({name:f.name,type:f.type,source:f.source||''})).sort((a,b)=>a.name.localeCompare(b.name)))).digest('hex');
 fs.mkdirSync(DIR,{recursive:true});const before=await api('projects/'+SID+'/content');fs.writeFileSync(DIR+'/before.json',JSON.stringify(before));
 const candidate={files:before.files.map(f=>({...f,source:patch(f.name,f.source||'')}))};
 for(const f of candidate.files)if(f.type==='SERVER_JS')new vm.Script(f.source);
 test(candidate.files.find(f=>f.name==='20_Striven').source);
 fs.mkdirSync(DIR+'/work',{recursive:true});for(const f of candidate.files)if(f.type==='SERVER_JS')fs.writeFileSync(DIR+'/work/'+f.name+'.js',f.source);
 for(const name of ['00_Config','20_Striven','60_Automation'])fs.writeFileSync('apps-script/tmv3-clean/'+name+'.js',candidate.files.find(f=>f.name===name).source);
 for(const script of ['test-tmv3-full-vertical-sweep.cjs','test-tmv3-standard-schedule.cjs','test-tmv3-install-flow-ready.cjs','test-tmv3-core-hardening.cjs']){
  const result=require('node:child_process').spawnSync(process.execPath,['tools/'+script],{stdio:'inherit',env:{...process.env,TMV3_TEST_SOURCE_DIR:DIR+'/work'}});if(result.status!==0)throw Error('REGRESSION_FAILED:'+script);
 }
 const inv=await api('projects/'+SID+'/deployments'),ds=inv.deployments.filter(d=>(d.entryPoints||[]).some(e=>e.entryPointType==='EXECUTION_API'||e.executionApi));if(ds.length!==1)throw Error('EXECUTABLE_AMBIGUOUS');const dep=ds[0];
 async function run(fn){const r=await api('scripts/'+encodeURIComponent(dep.deploymentId)+':run','POST',{function:fn,devMode:true});if(r.error||!r.done)throw Error('NATIVE_EXECUTION_FAILED');return r.response.result;}
 const triggerSignature=rows=>JSON.stringify(rows.map(t=>[t.handler,t.source,t.eventType,t.sourceId]).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))));
 const triggersBefore=await run('tmv3_listTriggers');let pushed=false,updatedDeployment=false;
 try{
  if(hash(await api('projects/'+SID+'/content'))!==hash(before))throw Error('PRE_PUSH_SOURCE_DRIFT');
  await api('projects/'+SID+'/content','PUT',candidate);pushed=true;
  if(hash(await api('projects/'+SID+'/content'))!==hash(candidate))throw Error('SOURCE_READBACK_FAILED');
  const status=await run('tmv3_strivenApiBudgetStatus');if(status.enabled!==false||status.softLimit!==null||status.exhausted||status.remaining<1000000)throw Error('LIVE_BUDGET_CHECK_FAILED');
  const health=await run('tmv3_healthCheck');if(!health.ready||health.version!==VERSION)throw Error('LIVE_HEALTH_FAILED');
  if(triggerSignature(await run('tmv3_listTriggers'))!==triggerSignature(triggersBefore))throw Error('TRIGGER_DRIFT');
  let deploymentVersion=null,versionSnapshotStatus='CREATED';
  try {
   const version=await api('projects/'+SID+'/versions','POST',{description:VERSION});
   await api('projects/'+SID+'/deployments/'+encodeURIComponent(dep.deploymentId),'PUT',{deploymentConfig:{...dep.deploymentConfig,versionNumber:version.versionNumber,description:VERSION}});updatedDeployment=true;
   const verify=await api('projects/'+SID+'/deployments/'+encodeURIComponent(dep.deploymentId));if(verify.deploymentConfig.versionNumber!==version.versionNumber)throw Error('DEPLOYMENT_READBACK_FAILED');
   deploymentVersion=version.versionNumber;
  } catch(e) {
   if(!String(e.message).includes('Cannot create more versions: Script has reached the limit of 200 versions.'))throw e;
   // Scheduled triggers and the existing devMode API route execute verified HEAD.
   // Preserve all immutable history and existing pinned deployments.
   versionSnapshotStatus='BLOCKED_200_VERSION_HISTORY_LIMIT';
  }
  for(const name of ['00_Config','20_Striven','60_Automation'])fs.writeFileSync('apps-script/tmv3-clean/'+name+'.js',candidate.files.find(f=>f.name===name).source);
  if(hash(await api('projects/'+SID+'/content'))!==hash(candidate))throw Error('FINAL_SOURCE_READBACK_FAILED');
  console.log(JSON.stringify({status:'LIVE_INTERNAL_API_BUDGET_DISABLED',version:VERSION,deploymentVersion:deploymentVersion,versionSnapshotStatus:versionSnapshotStatus,activeExecution:'SCHEDULED_TRIGGERS_AND_EXISTING_DEVMODE_API',sourceHash:hash(candidate),budget:status,triggersPreserved:true,businessWrites:0}));
 }catch(e){
  if(updatedDeployment)await api('projects/'+SID+'/deployments/'+encodeURIComponent(dep.deploymentId),'PUT',{deploymentConfig:dep.deploymentConfig});
  if(pushed){const current=await api('projects/'+SID+'/content');if(hash(current)!==hash(candidate))throw Error('SOURCE_DRIFT_ROLLBACK_BLOCKED');await api('projects/'+SID+'/content','PUT',{files:before.files});if(hash(await api('projects/'+SID+'/content'))!==hash(before))throw Error('ROLLBACK_FAILED');console.log('SOURCE_ROLLBACK_VERIFIED');}throw e;
 }
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});

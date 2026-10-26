// JavaScript / Node.js: guarded completion after verified Calendar intake; canonical Task worker only.
'use strict';
const fs=require('node:fs');
const {profiles}=require('./tmv3-execution-access-diagnostic.js');
(async()=>{
 const ps=profiles(JSON.parse(process.env.CLASPRC_JSON||'{}'));if(ps.length!==1)throw Error('EXPECTED_ONE_PROFILE');const p=ps[0];
 const r=await fetch('https://oauth2.googleapis.com/token',{method:'POST',body:new URLSearchParams({grant_type:'refresh_token',client_id:p.client,client_secret:p.secret,refresh_token:p.refresh}),redirect:'error'});if(!r.ok)throw Error('AUTH_FAILED');const a=await r.json();
 async function api(url,body){const r=await fetch(url,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+a.access_token,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),redirect:'error',signal:AbortSignal.timeout(650000)});if(!r.ok)throw Error('GOOGLE_HTTP_'+r.status);return r.json();}
 const base='https://script.googleapis.com/v1/',sid=process.argv[2]==='legacy'?'1E86mhD2dZcOFpqWnCvoIpwEkwZ0MA63MgM8DifV6WyB2FvVQkRWKIZ_m':'1shaSL1CeNhR2-fr8H4x0fP2KUIjpOizLFyrNRAnGGXkCvERX4hZyJ5Gt';
 const inv=await api(base+'projects/'+sid+'/deployments'),ds=inv.deployments.filter(d=>(d.entryPoints||[]).some(e=>e.entryPointType==='EXECUTION_API'||e.executionApi));if(ds.length!==1)throw Error('EXECUTABLE_AMBIGUOUS');
 async function run(fn,parameters=[]){const r=await api(base+'scripts/'+encodeURIComponent(ds[0].deploymentId)+':run',{function:fn,parameters,devMode:true});if(r.error||r.done!==true)throw Error('NATIVE_FAILED:'+JSON.stringify(r.error||{}));return r.response.result;}
 if(process.argv[2]==='legacy'){console.log(JSON.stringify({status:'LEGACY_TRIGGER_READ_ONLY',triggers:await run('listTaskMappingTriggers')}));return;}



 const crypto=require('node:crypto');
 const hash=o=>crypto.createHash('sha256').update(JSON.stringify(o.files.map(f=>({name:f.name,type:f.type,source:f.source||''})).sort((a,b)=>a.name.localeCompare(b.name)))).digest('hex');
 const expected='98663ec336d03567bdbbc35b06f54120a36b42cacf81e484be8f1975b716baec';
 const out={at:new Date().toISOString(),status:'VERIFYING_INTAKE',events:[]};
 fs.mkdirSync('pi-audit-evidence',{recursive:true});const checkpoint=()=>fs.writeFileSync('pi-audit-evidence/result.json',JSON.stringify(out,null,2));
 out.sourceHash=hash(await api(base+'projects/'+sid+'/content'));if(out.sourceHash!==expected)throw Error('LIVE_SOURCE_DRIFT');
 out.health=await run('tmv3_healthCheck');if(!out.health.ready||out.health.version!=='3.12.5-likely-preinspection-intake-sequence-r1')throw Error('HEALTH_FAILED');
 out.budgetBefore=await run('tmv3_strivenApiBudgetStatus');checkpoint();
 for(const id of ['45i1sm9ogfbuck1eu760tetin4','7k61omkf38ffetovqsglehhbg4']) {
  const eventId=id+'@google.com',one={eventId};out.events.push(one);
  one.before=await run('tmv3_verifyPreInspectionAutomation',[eventId]);checkpoint();
  const primary=one.before.records.find(r=>r.source==='PRIMARY_SHARED');
  if(!primary||primary.plans.length!==1||primary.plans[0].blocker)throw Error('INTAKE_OR_PLAN_NOT_READY');
  console.log(JSON.stringify({eventId,before:primary.plans.map(p=>({taskId:p.taskId,plan:p.plan,blocker:p.blocker,actions:p.actions}))}));
  if(primary.plans[0].actions.some(a=>a!=='VERIFY_CALENDAR_LINKS')){
   one.execution=await run('tmv3_reconcilePreInspectionEvent',[eventId]);checkpoint();
   console.log(JSON.stringify({eventId,execution:one.execution}));
   if(one.execution.status!=='COMPLETE'||one.execution.processed!==1||one.execution.results.some(r=>r.error))throw Error('RECONCILIATION_UNCERTAIN_NO_RETRY');
  }
  one.after=await run('tmv3_verifyPreInspectionAutomation',[eventId]);checkpoint();
  const after=one.after.records.find(r=>r.source==='PRIMARY_SHARED');
  console.log(JSON.stringify({eventId,after:after&&after.plans}));
  if(!after||after.plans.length!==1||after.plans[0].blocker||!after.plans[0].taskId||after.plans[0].actions.some(a=>a!=='VERIFY_CALENDAR_LINKS'))throw Error('FINAL_PLAN_NOT_CONVERGED');
 }
 out.discovery=await run('tmv3_refreshPreInspectionDiscovery');checkpoint();
 out.sheetRefresh=await run('tmv3_refreshAutomationSheets');checkpoint();
 if(!out.sheetRefresh.projectionVerified||!out.sheetRefresh.timestampReadbackVerified)throw Error('SHEET_REFRESH_NOT_VERIFIED');
 out.budgetAfter=await run('tmv3_strivenApiBudgetStatus');out.finalSourceHash=hash(await api(base+'projects/'+sid+'/content'));if(out.finalSourceHash!==expected)throw Error('FINAL_SOURCE_DRIFT');
 out.status='BOTH_PREINSPECTIONS_VERIFIED';checkpoint();console.log(JSON.stringify({status:out.status,sourceHash:out.finalSourceHash,version:out.health.version,discovery:out.discovery,sheetRefresh:out.sheetRefresh,budget:out.budgetAfter}));
})().catch(e=>{console.error(e.message);process.exitCode=1;});

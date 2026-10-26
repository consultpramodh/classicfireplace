// JavaScript / Node.js: exact-source release, durable PRE, guarded repairs, no uncertain retry.
'use strict';
const fs=require('node:fs'),crypto=require('node:crypto'),vm=require('node:vm');
const {profiles}=require('./tmv3-execution-access-diagnostic.js');
const DIR='pi-release-evidence',MANIFEST='release-candidates/tmv3-pi-20261026.json';
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
const canonical=o=>hash(JSON.stringify(o.files.map(f=>({name:f.name,type:f.type,source:f.source||''})).sort((a,b)=>a.name.localeCompare(b.name))));
(async()=>{
 const m=JSON.parse(fs.readFileSync(MANIFEST));fs.mkdirSync(DIR,{recursive:true,mode:0o700});
 const ps=profiles(JSON.parse(process.env.CLASPRC_JSON||'{}'));if(ps.length!==1)throw Error('EXPECTED_ONE_PROFILE');const p=ps[0];
 const ar=await fetch('https://oauth2.googleapis.com/token',{method:'POST',body:new URLSearchParams({grant_type:'refresh_token',client_id:p.client,client_secret:p.secret,refresh_token:p.refresh}),redirect:'error'});if(!ar.ok)throw Error('AUTH_FAILED');const auth=await ar.json();
 async function api(path,method='GET',body,retry=0){const r=await fetch('https://script.googleapis.com/v1/'+path,{method,headers:{Authorization:'Bearer '+auth.access_token,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),redirect:'error',signal:AbortSignal.timeout(650000)});if(r.status===503 && method==='GET' && retry<2){await new Promise(resolve=>setTimeout(resolve,3000));return api(path,method,body,retry+1);}if(!r.ok)throw Error('GOOGLE_HTTP_'+r.status);return r.json();}
 const mode=process.argv[2];
 if(mode==='prepare'){
  const prepared={projects:[]};
  for(const spec of m.auditProjects || [])if(canonical(await api('projects/'+spec.scriptId+'/content'))!==spec.hash)throw Error('AUDIT_SOURCE_DRIFT:'+spec.key);
  for(const spec of m.projects){
   const before=await api('projects/'+spec.scriptId+'/content');if(canonical(before)!==spec.beforeHash)throw Error('LIVE_SOURCE_DRIFT:'+spec.key);
   if(before.files.some(f=>/(?:api[_-]?key|client[_-]?secret|access[_-]?token|refresh[_-]?token)\s*[:=]\s*['"][A-Za-z0-9_./+-]{20,}['"]/i.test(f.source||'')))throw Error('POSSIBLE_LITERAL_SECRET_NO_EXPORT');
   const work=spec.key==='legacy'?{files:require('./tmv3-pi-retirement.cjs').patch(before).files}:{files:before.files.map(f=>{const change=spec.files.find(x=>x.name===f.name);if(!change)return f;if(hash(f.source)!==change.before)throw Error('FILE_DRIFT');const source=fs.readFileSync(change.path,'utf8');if(hash(source)!==change.after)throw Error('CANDIDATE_HASH_MISMATCH');return {...f,source};})};
   if(canonical(work)!==spec.afterHash)throw Error('WORK_HASH_MISMATCH:'+spec.key);
   for(const f of work.files)if(f.type==='SERVER_JS')new vm.Script(f.source,{filename:f.name});
   const actual=work.files.filter(f=>f.source!==before.files.find(b=>b.name===f.name).source).map(f=>f.name).sort();
   if(JSON.stringify(actual)!==JSON.stringify(spec.files.map(f=>f.name).sort()))throw Error('FILE_SCOPE_MISMATCH');
   fs.writeFileSync(DIR+'/'+spec.key+'-before.json',JSON.stringify(before),{mode:0o600});fs.writeFileSync(DIR+'/'+spec.key+'-work.json',JSON.stringify(work),{mode:0o600});
   if(spec.key==='v3'){fs.mkdirSync(DIR+'/work',{recursive:true});for(const f of work.files)if(f.type==='SERVER_JS')fs.writeFileSync(DIR+'/work/'+f.name+'.js',f.source);}
   prepared.projects.push({key:spec.key,beforeHash:spec.beforeHash,afterHash:spec.afterHash,changed:actual});
  }
  fs.writeFileSync(DIR+'/prepared.json',JSON.stringify(prepared,null,2));console.log(JSON.stringify({status:'PREPARED',...prepared}));return;
 }
 if(mode!=='apply')throw Error('UNKNOWN_MODE');
 const report={status:'NOT_STARTED',version:m.version,projects:[],repairs:[],verification:[]};
 const checkpoint=()=>fs.writeFileSync(DIR+'/result.json',JSON.stringify(report,null,2));
 const touched=[];let businessAttempted=false;
 try{
  for(const spec of m.projects)if(canonical(await api('projects/'+spec.scriptId+'/content'))!==spec.beforeHash)throw Error('PRE_WRITE_DRIFT:'+spec.key);
  for(const spec of m.projects){const work=JSON.parse(fs.readFileSync(DIR+'/'+spec.key+'-work.json'));if(canonical(work)!==spec.afterHash)throw Error('LOCAL_WORK_DRIFT');touched.push(spec);await api('projects/'+spec.scriptId+'/content','PUT',{files:work.files});if(canonical(await api('projects/'+spec.scriptId+'/content'))!==spec.afterHash)throw Error('SOURCE_READBACK_FAILED:'+spec.key);report.projects.push({key:spec.key,hash:spec.afterHash,verified:true});checkpoint();}
  const sid=m.projects.find(p=>p.key==='v3').scriptId,inv=await api('projects/'+sid+'/deployments'),ds=inv.deployments.filter(d=>(d.entryPoints||[]).some(e=>e.entryPointType==='EXECUTION_API'||e.executionApi));if(ds.length!==1)throw Error('EXECUTABLE_AMBIGUOUS');
  async function run(fn,parameters=[]){for(let i=0;i<5;i++){const r=await api('scripts/'+encodeURIComponent(ds[0].deploymentId)+':run','POST',{function:fn,parameters,devMode:true});if(r.error||r.done!==true)throw Error('NATIVE_UNCERTAIN_NO_RETRY:'+JSON.stringify(r.error||{}));const result=r.response.result;if(result.status!=='LOCK_BUSY')return result;if(i<4)await new Promise(resolve=>setTimeout(resolve,15000));}throw Error('LOCK_BUSY_EXHAUSTED');}
  report.health=await run('tmv3_healthCheck');if(!report.health.ready||report.health.version!==m.version)throw Error('HEALTH_FAILED');
  report.triggers=await run('tmv3_listTriggers');for(const handler of ['tmv3_preInspectionCheck0800','tmv3_preInspectionCheck1300','tmv3_preInspectionCheck1700'])if(report.triggers.filter(t=>t.handler===handler).length!==1)throw Error('TRIGGER_MISMATCH');if(report.triggers.some(t=>t.handler==='tmv3_preInspectionScheduledCycle'))throw Error('RETIRED_TRIGGER_INSTALLED');
  report.discovery=await run('tmv3_refreshPreInspectionDiscovery');checkpoint();
  if(!m.eventIds.length){report.sheetRefresh=await run('tmv3_refreshAutomationSheets');checkpoint();if(!report.sheetRefresh.projectionVerified||!report.sheetRefresh.timestampReadbackVerified||report.sheetRefresh.strivenWrites!==0||report.sheetRefresh.calendarWrites!==0)throw Error('SHEET_REFRESH_NOT_VERIFIED');}
  for(const eventId of m.eventIds){
   businessAttempted=true;const result=await run('tmv3_reconcilePreInspectionEvent',[eventId]);report.repairs.push({eventId,result});checkpoint();
   console.log(JSON.stringify({eventId,status:result.status,processed:result.processed,writes:result.writes,results:result.results.map(r=>({taskId:r.taskId,status:r.status,plan:r.plan,error:r.error,executionStatus:r.execution&&r.execution.status}))}));
   if(result.processed!==1||result.results.length!==1||result.results[0].error||result.status!=='COMPLETE')throw Error('EVENT_RECONCILIATION_INCOMPLETE_NO_BLIND_RETRY');
  }
  for(const eventId of (m.verifyEventIds || m.eventIds)){const result=await run('tmv3_verifyPreInspectionAutomation',[eventId]);report.verification.push({eventId,result});checkpoint();const r=result.records.find(x=>x.source==='PRIMARY_SHARED');if(!r||r.plans.length!==1||r.plans[0].blocker||r.plans[0].actions.some(a=>a!=='VERIFY_CALENDAR_LINKS'))throw Error('INDEPENDENT_PLAN_NOT_CONVERGED');}
  report.budget=await run('tmv3_strivenApiBudgetStatus');
  for(const spec of m.projects)if(canonical(await api('projects/'+spec.scriptId+'/content'))!==spec.afterHash)throw Error('FINAL_SOURCE_DRIFT:'+spec.key);
  report.sourceAudits=[];for(const spec of m.auditProjects || []){const actual=canonical(await api('projects/'+spec.scriptId+'/content'));if(actual!==spec.hash)throw Error('FINAL_AUDIT_SOURCE_DRIFT:'+spec.key);report.sourceAudits.push({key:spec.key,hash:actual,verified:true});}
  report.status='SOURCE_TRIGGER_DISCOVERY_AND_EVENTS_VERIFIED';checkpoint();console.log(JSON.stringify({status:report.status,version:m.version,projects:report.projects,discoveryTotal:report.discovery.total,discoveryReview:report.discovery.review,verifiedEvents:report.verification.length,apiCount:report.budget.count}));
 }catch(error){report.status='STOPPED_RECONCILE';report.error=error.message;
  if(!businessAttempted){report.rollback=[];for(const spec of touched.reverse()){const current=canonical(await api('projects/'+spec.scriptId+'/content'));if(current===spec.afterHash){const before=JSON.parse(fs.readFileSync(DIR+'/'+spec.key+'-before.json'));await api('projects/'+spec.scriptId+'/content','PUT',{files:before.files});}report.rollback.push({key:spec.key,verified:canonical(await api('projects/'+spec.scriptId+'/content'))===spec.beforeHash});}}
  checkpoint();console.error(JSON.stringify({status:report.status,error:report.error,businessAttempted,rollback:report.rollback}));process.exitCode=1;
 }
})().catch(e=>{console.error(e.message);process.exitCode=1;});

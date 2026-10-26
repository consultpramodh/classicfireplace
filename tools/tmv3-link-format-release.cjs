// JavaScript / Node.js: verified one-file scoped worker extension and canonical weekly repairs.
'use strict';
const fs=require('fs'),crypto=require('crypto'),vm=require('vm');
const {profiles}=require('./tmv3-execution-access-diagnostic.js');
const {patch}=require('./tmv3-link-format-patch.cjs');
const SID='1shaSL1CeNhR2-fr8H4x0fP2KUIjpOizLFyrNRAnGGXkCvERX4hZyJ5Gt',DIR='link-format-evidence';
const hash=o=>crypto.createHash('sha256').update(JSON.stringify(o.files.map(f=>({name:f.name,type:f.type,source:f.source||''})).sort((a,b)=>a.name.localeCompare(b.name)))).digest('hex');
(async()=>{
const ps=profiles(JSON.parse(process.env.CLASPRC_JSON||'{}'));if(ps.length!==1)throw Error('ONE_PROFILE');const p=ps[0];
const ar=await fetch('https://oauth2.googleapis.com/token',{method:'POST',body:new URLSearchParams({grant_type:'refresh_token',client_id:p.client,client_secret:p.secret,refresh_token:p.refresh})});if(!ar.ok)throw Error('AUTH');const a=await ar.json();
async function api(path,method='GET',body){const r=await fetch('https://script.googleapis.com/v1/'+path,{method,headers:{Authorization:'Bearer '+a.access_token,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(650000)});if(!r.ok)throw Error('GOOGLE_HTTP_'+r.status);return r.json();}
if(process.argv[2]==='prepare'){
fs.mkdirSync(DIR+'/work',{recursive:true});const before=await api('projects/'+SID+'/content');
const candidate={files:patch(before.files)};
for(const f of candidate.files)if(f.type==='SERVER_JS'){new vm.Script(f.source);fs.writeFileSync(DIR+'/work/'+f.name+'.js',f.source);}
fs.writeFileSync(DIR+'/before.json',JSON.stringify(before));fs.writeFileSync(DIR+'/candidate.json',JSON.stringify(candidate));
console.log(JSON.stringify({status:'PREPARED',beforeHash:hash(before),candidateHash:hash(candidate),changedFiles:['35_CalendarLinks','58_Operations','60_Automation'],numberedVersionsCreated:0}));return;
}
const before=JSON.parse(fs.readFileSync(DIR+'/before.json')),candidate=JSON.parse(fs.readFileSync(DIR+'/candidate.json'));
if(hash(await api('projects/'+SID+'/content'))!==hash(before))throw Error('PRE_PUSH_SOURCE_DRIFT');
let pushed=false,businessAttempted=false;
try{
await api('projects/'+SID+'/content','PUT',{files:candidate.files});pushed=true;
if(hash(await api('projects/'+SID+'/content'))!==hash(candidate))throw Error('SOURCE_READBACK_FAILED');
const inv=await api('projects/'+SID+'/deployments'),ds=inv.deployments.filter(d=>(d.entryPoints||[]).some(e=>e.entryPointType==='EXECUTION_API'||e.executionApi));if(ds.length!==1)throw Error('DEPLOYMENT');
async function run(fn,parameters=[]){const r=await api('scripts/'+encodeURIComponent(ds[0].deploymentId)+':run','POST',{function:fn,parameters,devMode:true});if(r.error||!r.done)throw Error('NATIVE_FAILED_NO_BLIND_RETRY:'+JSON.stringify(r.error));return r.response.result;}
const health=await run('tmv3_healthCheck');if(!health.ready)throw Error('HEALTH_FAILED');
const triggersBefore=await run('tmv3_listTriggers');
console.log(JSON.stringify({status:'WEEK_SCOPE_SOURCE_VERIFIED',sourceHash:hash(candidate),health,numberedVersionsCreated:0}));
const targets=await run('tmv3_linkFormatRepairTargets');console.log(JSON.stringify({targets}));const report={targets,verticals:{}};
for(const v of ['Install','Delivery','Service']){
report.verticals[v]=[];if(!targets[v].length)continue;
for(;;){businessAttempted=true;const r=await run('tmv3_runLinkFormatRepair',[v,targets[v]]);report.verticals[v].push(r);fs.writeFileSync(DIR+'/result.json',JSON.stringify(report,null,2));console.log(JSON.stringify({vertical:v,result:r}));
if(r.status==='LOCK_BUSY'){console.log('LOCK_BUSY_NO_WORK_RETRY');await new Promise(resolve=>setTimeout(resolve,15000));continue;}
if(r.status==='API_BUDGET_WAIT'||r.status==='VERTICAL_DISABLED')throw Error('REPAIR_STOPPED:'+r.status);
if(r.sweep&&r.sweep.complete)break;
if(!(r.pending>0))throw Error('REPAIR_STATE_UNEXPECTED');
}
}
report.sourceHash=hash(await api('projects/'+SID+'/content'));if(report.sourceHash!==hash(candidate))throw Error('POST_REPAIR_SOURCE_DRIFT');
report.triggersAfter=await run('tmv3_listTriggers');report.triggersBefore=triggersBefore;
report.sheetRefresh=await run('tmv3_step6TaskDecisionRunCached',['LINK_FORMAT_REPAIR_PUBLISH']);
fs.writeFileSync(DIR+'/result.json',JSON.stringify(report,null,2));console.log(JSON.stringify({status:'TOUCHED_EVENT_LINK_FORMATS_REPROCESSED',report}));
}catch(error){
if(pushed&&!businessAttempted){const current=await api('projects/'+SID+'/content');if(hash(current)===hash(candidate)){await api('projects/'+SID+'/content','PUT',{files:before.files});if(hash(await api('projects/'+SID+'/content'))!==hash(before))throw Error('ROLLBACK_FAILED');console.error('SOURCE_ROLLBACK_VERIFIED');}}
throw error;
}
})().catch(e=>{console.error(e.message);process.exitCode=1;});

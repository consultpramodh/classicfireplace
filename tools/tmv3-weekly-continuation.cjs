// JavaScript / Node.js: verified one-file scoped worker extension and canonical weekly repairs.
'use strict';
const fs=require('fs'),crypto=require('crypto'),vm=require('vm');
const {profiles}=require('./tmv3-execution-access-diagnostic.js');
const {patch}=require('./tmv3-week-readonly-fastpath.cjs');
const SID='1shaSL1CeNhR2-fr8H4x0fP2KUIjpOizLFyrNRAnGGXkCvERX4hZyJ5Gt',DIR='weekly-continuation-evidence';
const hash=o=>crypto.createHash('sha256').update(JSON.stringify(o.files.map(f=>({name:f.name,type:f.type,source:f.source||''})).sort((a,b)=>a.name.localeCompare(b.name)))).digest('hex');
(async()=>{
const ps=profiles(JSON.parse(process.env.CLASPRC_JSON||'{}'));if(ps.length!==1)throw Error('ONE_PROFILE');const p=ps[0];
const ar=await fetch('https://oauth2.googleapis.com/token',{method:'POST',body:new URLSearchParams({grant_type:'refresh_token',client_id:p.client,client_secret:p.secret,refresh_token:p.refresh})});if(!ar.ok)throw Error('AUTH');let a=await ar.json();
async function refreshAuth(){const r=await fetch('https://oauth2.googleapis.com/token',{method:'POST',body:new URLSearchParams({grant_type:'refresh_token',client_id:p.client,client_secret:p.secret,refresh_token:p.refresh})});if(!r.ok)throw Error('AUTH_REFRESH_FAILED');a=await r.json();}
async function api(path,method='GET',body,retried401=false){const r=await fetch('https://script.googleapis.com/v1/'+path,{method,headers:{Authorization:'Bearer '+a.access_token,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(650000)});if(r.status===401&&!retried401){await refreshAuth();return api(path,method,body,true);}if(!r.ok)throw Error('GOOGLE_HTTP_'+r.status);return r.json();}
const EXPECTED='b689f4d8eacd3fe86e1ca6dfbd513edfc1b48bed9644a1a5de1122a8066e695d';
const candidate=await api('projects/'+SID+'/content');if(hash(candidate)!==EXPECTED)throw Error('LINK_FORMAT_SOURCE_DRIFT_NO_RESUME');
fs.mkdirSync(DIR,{recursive:true});
let pushed=false,businessAttempted=false;
try{
// No source pushes or numbered versions in this continuation.
if(hash(await api('projects/'+SID+'/content'))!==hash(candidate))throw Error('SOURCE_READBACK_FAILED');
const inv=await api('projects/'+SID+'/deployments'),ds=inv.deployments.filter(d=>(d.entryPoints||[]).some(e=>e.entryPointType==='EXECUTION_API'||e.executionApi));if(ds.length!==1)throw Error('DEPLOYMENT');
async function run(fn,parameters=[]){const r=await api('scripts/'+encodeURIComponent(ds[0].deploymentId)+':run','POST',{function:fn,parameters,devMode:true});if(r.error||!r.done)throw Error('NATIVE_FAILED_NO_BLIND_RETRY:'+JSON.stringify(r.error));return r.response.result;}
const health=await run('tmv3_healthCheck');if(!health.ready)throw Error('HEALTH_FAILED');
const targets=await run('tmv3_linkFormatRepairTargets');
const calendars={Install:'classicfireplace.ca_vpg05s56lp9f7kaegsiqask34o@group.calendar.google.com',Delivery:'classicfireplace.ca_2h90kflud3re121hga9bvsi33o@group.calendar.google.com'};
for(const v of Object.keys(targets))for(const id of targets[v]){
 if(!calendars[v])throw Error('FORMAT_CALENDAR_REQUIRES_EXPLICIT_CHECK');
 const url='https://www.googleapis.com/calendar/v3/calendars/'+encodeURIComponent(calendars[v])+'/events/'+encodeURIComponent(id.replace(/@google\.com$/,''));
 const rr=await fetch(url,{headers:{Authorization:'Bearer '+a.access_token},signal:AbortSignal.timeout(30000)});if(!rr.ok)throw Error('FORMAT_RECHECK_HTTP_'+rr.status);const event=await rr.json(),d=String(event.description||'');
 const heading=v==='Install'?'------- Install Striven Task Link -------':'------- Delivery Striven Links -------';
 if(!d.includes(heading)||/\[Task #.*?\]\(https?:/s.test(d)||!/<a\b[^>]*href=["'][^"']*TaskID=\d+[^"']*["'][^>]*>[^<]*Task #\d+[^<]* - [^<]+<\/a>/i.test(d))throw Error('FORMAT_RECHECK_FAILED_NO_RESUME:'+id);
}
console.log(JSON.stringify({status:'RESTORATION_INDEPENDENTLY_VERIFIED',counts:Object.fromEntries(Object.entries(targets).map(([v,ids])=>[v,ids.length]))}));
const triggersBefore=await run('tmv3_listTriggers');
console.log(JSON.stringify({status:'WEEK_SCOPE_SOURCE_VERIFIED',sourceHash:hash(candidate),health,numberedVersionsCreated:0}));
const report={fromDay:'2026-10-26',toDayExclusive:'2026-11-02',timezone:'America/Toronto',verticals:{}};
for(const v of ['Install','Delivery','Service']){
report.verticals[v]=[];
const prior=await run('tmv3_weeklyVerticalRepairStatus',[v,report.fromDay,report.toDayExclusive]);if(prior&&prior.complete){report.verticals[v].push({status:'PREVIOUS_WEEK_SWEEP_COMPLETED',sweep:prior});console.log(JSON.stringify({vertical:v,previousComplete:prior}));continue;}
for(;;){businessAttempted=true;const r=await run('tmv3_runWeeklyVerticalRepair',[v,report.fromDay,report.toDayExclusive]);report.verticals[v].push(r);fs.writeFileSync(DIR+'/result.json',JSON.stringify(report,null,2));console.log(JSON.stringify({vertical:v,result:r}));
if(r.status==='LOCK_BUSY'){console.log('LOCK_BUSY_NO_WORK_RETRY');await new Promise(resolve=>setTimeout(resolve,15000));continue;}
if(r.status==='API_BUDGET_WAIT'||r.status==='VERTICAL_DISABLED')throw Error('REPAIR_STOPPED:'+r.status);
if(r.sweep&&r.sweep.complete)break;
if(!(r.pending>0))throw Error('REPAIR_STATE_UNEXPECTED');
}
}
report.sourceHash=hash(await api('projects/'+SID+'/content'));if(report.sourceHash!==hash(candidate))throw Error('POST_REPAIR_SOURCE_DRIFT');
report.triggersAfter=await run('tmv3_listTriggers');report.triggersBefore=triggersBefore;
report.sheetRefresh=await run('tmv3_step6TaskDecisionRunCached',['WEEKLY_REPAIR_FINAL_PUBLISH']);
fs.writeFileSync(DIR+'/result.json',JSON.stringify(report,null,2));console.log(JSON.stringify({status:'ALL_WEEKLY_QUEUES_PROCESSED',report}));
}catch(error){

throw error;
}
})().catch(e=>{console.error(e.message);process.exitCode=1;});

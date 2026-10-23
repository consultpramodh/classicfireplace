// JavaScript / Node.js: install existing authorized native V3 schedules; preserve source and write scopes.
'use strict';
const fs=require('node:fs'),crypto=require('node:crypto');
const {profiles}=require('./tmv3-execution-access-diagnostic.js');
const DIR='trigger-install-evidence',SID='1shaSL1CeNhR2-fr8H4x0fP2KUIjpOizLFyrNRAnGGXkCvERX4hZyJ5Gt';
const EXPECTED='64a37d2cf96b9e9b51ad95e362f4a05b58424c061bc6c6daedf1028fbd089ac1';
const hash=o=>crypto.createHash('sha256').update(JSON.stringify(o.files.map(f=>({name:f.name,type:f.type,source:f.source||''})).sort((a,b)=>a.name.localeCompare(b.name)))).digest('hex');
function verify(triggers){
 const counts={};for(const t of triggers)counts[t.handler]=(counts[t.handler]||0)+1;
 const expected={tmv3_dailySourceRefresh:1,tmv3_scheduledOperations:5,tmv3_installReminderCheck:1,tmv3_calendarReconciliationFallback:1,tmv3_preInspectionCheck0800:1,tmv3_preInspectionCheck1300:1,tmv3_preInspectionCheck1700:1,tmv3_calendarEventUpdated:7};
 for(const [h,n]of Object.entries(expected))if(counts[h]!==n)throw Error('TRIGGER_COUNT_MISMATCH_'+h);
 const calendars=triggers.filter(t=>t.handler==='tmv3_calendarEventUpdated').map(t=>t.sourceId);
 if(new Set(calendars).size!==7)throw Error('DUPLICATE_CALENDAR_TRIGGER');
 if(triggers.length>19)throw Error('CONTINUATION_HEADROOM_MISSING');
 return counts;
}
async function main(mode){
 fs.mkdirSync(DIR,{recursive:true,mode:0o700});
 const ps=profiles(JSON.parse(process.env.CLASPRC_JSON||'{}'));if(ps.length!==1)throw Error('EXPECTED_ONE_PROFILE');
 const p=ps[0],r=await fetch('https://oauth2.googleapis.com/token',{method:'POST',body:new URLSearchParams({grant_type:'refresh_token',client_id:p.client,client_secret:p.secret,refresh_token:p.refresh}),redirect:'error'});
 if(!r.ok)throw Error('AUTH_HTTP_'+r.status);const a=await r.json();
 async function api(path,method='GET',body){const r=await fetch('https://script.googleapis.com/v1/'+path,{method,headers:{Authorization:'Bearer '+a.access_token,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),redirect:'error',signal:AbortSignal.timeout(650000)});if(!r.ok)throw Error('GOOGLE_HTTP_'+r.status);return r.json();}
 const source=await api('projects/'+SID+'/content');if(hash(source)!==EXPECTED)throw Error('LIVE_SOURCE_DRIFT_NO_TRIGGER_CHANGE');
 const automation=source.files.find(f=>f.name==='60_Automation').source;
 for(const name of ['tmv3_installTriggers','tmv3_installPreInspectionAutomationTrigger','tmv3_listTriggers'])if(!automation.includes('function '+name+'('))throw Error('INSTALLER_MISSING');
 const manifest=JSON.parse(source.files.find(f=>f.name==='appsscript').source);if(manifest.timeZone!=='America/Toronto')throw Error('TIMEZONE_MISMATCH');
 const inv=await api('projects/'+SID+'/deployments'),ds=(inv.deployments||[]).filter(d=>(d.entryPoints||[]).some(e=>e.entryPointType==='EXECUTION_API'||e.executionApi));if(ds.length!==1)throw Error('EXPECTED_ONE_EXECUTABLE');
 async function run(fn){if(!['tmv3_listTriggers','tmv3_installTriggers','tmv3_installPreInspectionAutomationTrigger'].includes(fn))throw Error('FUNCTION_OUTSIDE_SCOPE');const o=await api('scripts/'+encodeURIComponent(ds[0].deploymentId)+':run','POST',{function:fn,devMode:true});if(o.error||o.done!==true)throw Error('EXECUTION_UNCERTAIN_NO_AUTOMATIC_RETRY:'+JSON.stringify(o.error||{}));return o.response.result;}
 if(mode==='prepare'){
  const before=await run('tmv3_listTriggers');verify(before);
  fs.writeFileSync(DIR+'/before-source.json',JSON.stringify(source),{mode:0o600});
  fs.writeFileSync(DIR+'/before-triggers.json',JSON.stringify(before,null,2),{mode:0o600});
  console.log(JSON.stringify({status:'PREPARED',sourceHash:EXPECTED,triggerCounts:verify(before),timezone:manifest.timeZone,taskWrites:0}));return;
 }
 if(mode!=='install')throw Error('UNKNOWN_MODE');
 if(hash(JSON.parse(fs.readFileSync(DIR+'/before-source.json')))!==EXPECTED)throw Error('DURABLE_PRE_MISSING');
 const report={at:new Date().toISOString(),scope:'EXISTING_NATIVE_V3_SCHEDULES',sourceWrites:0,taskWrites:0,generalWriteFlagsChanged:false,versionsCreated:0,existingDeploymentsChanged:false,results:[]};
 try{
  report.results.push({handler:'tmv3_installTriggers',result:await run('tmv3_installTriggers')});
  report.results.push({handler:'tmv3_installPreInspectionAutomationTrigger',result:await run('tmv3_installPreInspectionAutomationTrigger')});
  report.after=await run('tmv3_listTriggers');report.counts=verify(report.after);
  const before=JSON.parse(fs.readFileSync(DIR+'/before-triggers.json'));const previous=before.filter(t=>t.handler==='tmv3_calendarEventUpdated').map(t=>t.sourceId).sort();const after=report.after.filter(t=>t.handler==='tmv3_calendarEventUpdated').map(t=>t.sourceId).sort();if(JSON.stringify(previous)!==JSON.stringify(after))throw Error('WATCHED_CALENDARS_CHANGED');
  report.sourceHashAfter=hash(await api('projects/'+SID+'/content'));if(report.sourceHashAfter!==EXPECTED)throw Error('SOURCE_CHANGED_DURING_INSTALL');
  report.status='NATIVE_TRIGGER_INSTALL_READBACK_VERIFIED';
 }catch(e){report.status='INSTALL_INCOMPLETE_RECONCILE';report.error=String(e.message);try{report.after=await run('tmv3_listTriggers');}catch(x){report.inventoryError=String(x.message);}process.exitCode=1;}
 fs.writeFileSync(DIR+'/result.json',JSON.stringify(report,null,2),{mode:0o600});console.log(JSON.stringify(report));
}
module.exports={verify};if(require.main===module)main(process.argv[2]).catch(e=>{console.error(e.message);process.exitCode=1;});

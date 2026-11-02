'use strict';
// Node.js: read-only live baseline. Never log event text, customer information,
// credentials or full Apps Script responses in the public repository.
const fs=require('node:fs'),crypto=require('node:crypto');
const {profiles}=require('./tmv3-execution-access-diagnostic.js');
const {execFileSync}=require('node:child_process');
const SID='1shaSL1CeNhR2-fr8H4x0fP2KUIjpOizLFyrNRAnGGXkCvERX4hZyJ5Gt';
const CAL='c_3088a3989f3eb809957ed5c40137a7111a0ac97f68c29b40c144028cb14320dc@group.calendar.google.com';
const tokenise=s=>typeof s==='string' && /^[A-Z0-9_ -]{1,100}$/.test(s)?s:'';
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
(async()=>{
 const ps=profiles(JSON.parse(process.env.CLASPRC_JSON||'{}'));if(ps.length!==1)throw Error('ONE_PROFILE_REQUIRED');const p=ps[0];
 const a=await fetch('https://oauth2.googleapis.com/token',{method:'POST',body:new URLSearchParams({grant_type:'refresh_token',client_id:p.client,client_secret:p.secret,refresh_token:p.refresh})});if(!a.ok)throw Error('AUTH_FAILED');const token=(await a.json()).access_token;
 async function get(url,opts={}){const r=await fetch(url,{...opts,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'}});if(!r.ok)throw Error('HTTP_'+r.status);return r.json();}
 const ds=await get('https://script.googleapis.com/v1/projects/'+SID+'/deployments');const dep=(ds.deployments||[]).filter(d=>(d.entryPoints||[]).some(e=>e.entryPointType==='EXECUTION_API'||e.executionApi));if(dep.length!==1)throw Error('EXECUTION_API_AMBIGUOUS');
 const start=new Date();start.setHours(0,0,0,0);const end=new Date(start);end.setDate(end.getDate()+1);
 let page='',events=[];do{const u=new URL('https://www.googleapis.com/calendar/v3/calendars/'+encodeURIComponent(CAL)+'/events');u.searchParams.set('timeMin',start.toISOString());u.searchParams.set('timeMax',end.toISOString());u.searchParams.set('singleEvents','true');u.searchParams.set('maxResults','250');if(page)u.searchParams.set('pageToken',page);const j=await get(u.toString());events.push(...(j.items||[]));page=j.nextPageToken||'';}while(page);
 const selected=events.filter(e=>e.status!=='cancelled'&&!/Task\s*#\s*\d+/i.test(e.description||''));
 if(selected.length>25)throw Error('TOO_MANY_EVENTS_STOP');const results=[];
 for(const e of selected){const eventId=e.iCalUID||e.id+'@google.com';const j=await get('https://script.googleapis.com/v1/scripts/'+encodeURIComponent(dep[0].deploymentId)+':run',{method:'POST',body:JSON.stringify({function:'tmv3_verifyPreInspectionAutomation',parameters:[eventId],devMode:true})});if(!j.done||j.error){results.push({eventHash:hash(eventId),status:'EXECUTION_FAILED'});continue;}const x=j.response&&j.response.result;const records=x&&x.records||[];results.push({eventHash:hash(eventId),status:tokenise(x&&x.status),version:String(x&&x.version||''),plans:records.flatMap(r=>(r.plans||[]).map(p=>({plan:tokenise(p.plan),hasBlocker:!!p.blocker,taskId:Number(p.taskId||0),actions:(p.actions||[]).map(tokenise).filter(Boolean),assignmentStatus:tokenise(p.assignmentCheck&&p.assignmentCheck.status)})))});}
 const output={status:'LIVE_BASELINE_READ_ONLY',date:new Intl.DateTimeFormat('en-CA',{timeZone:'America/Toronto'}).format(start),totalEvents:events.length,selected:results.length,results,notificationsSent:0,businessWrites:0};fs.mkdirSync('executions',{recursive:true});fs.writeFileSync('executions/preinspection-readonly-today.json',JSON.stringify(output,null,2)+'\n');
 execFileSync('git',['config','user.name','Classic Fireplace Automation']);execFileSync('git',['config','user.email','41898282+github-actions[bot]@users.noreply.github.com']);execFileSync('git',['add','executions/preinspection-readonly-today.json']);try{execFileSync('git',['diff','--cached','--quiet']);}catch{execFileSync('git',['commit','-m','Record sanitized preinspection read-only baseline']);execFileSync('git',['push','origin','HEAD:task-mapping-preinspection']);}console.log(JSON.stringify({status:output.status,selected:output.selected,failed:results.filter(x=>x.status==='EXECUTION_FAILED').length}));
})().catch(e=>{console.error(String(e.message));process.exitCode=1});

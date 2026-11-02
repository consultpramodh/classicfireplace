'use strict';
// Node.js. One explicitly authorized event; fresh plan before and after.
// No blind retry after any uncertain execution. Output is deliberately sanitized.
const fs=require('node:fs'),crypto=require('node:crypto'),cp=require('node:child_process');
const {profiles}=require('./tmv3-execution-access-diagnostic.js');
const SID='1shaSL1CeNhR2-fr8H4x0fP2KUIjpOizLFyrNRAnGGXkCvERX4hZyJ5Gt';
const CAL='c_3088a3989f3eb809957ed5c40137a7111a0ac97f68c29b40c144028cb14320dc@group.calendar.google.com';
const TARGET='dd1b30cef05e618ffc83e33df4d7ecbad70f8c52087058cc5e5aeaf361dea209';
const tokenise=x=>typeof x==='string'&&/^[A-Z0-9_ -]{1,100}$/.test(x)?x:'';
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
const result={status:'NOT_STARTED',eventHash:TARGET,writeAttempted:false};
async function main(){
 const ps=profiles(JSON.parse(process.env.CLASPRC_JSON||'{}'));if(ps.length!==1)throw Error('ONE_PROFILE_REQUIRED');const p=ps[0];
 const a=await fetch('https://oauth2.googleapis.com/token',{method:'POST',body:new URLSearchParams({grant_type:'refresh_token',client_id:p.client,client_secret:p.secret,refresh_token:p.refresh})});if(!a.ok)throw Error('AUTH_FAILED');const token=(await a.json()).access_token;
 async function api(url,options={}){const r=await fetch(url,{...options,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'}});if(!r.ok)throw Error('HTTP_'+r.status);return r.json();}
 const inv=await api('https://script.googleapis.com/v1/projects/'+SID+'/deployments');const ds=(inv.deployments||[]).filter(d=>(d.entryPoints||[]).some(e=>e.entryPointType==='EXECUTION_API'||e.executionApi));if(ds.length!==1)throw Error('EXECUTION_API_AMBIGUOUS');
 async function run(fn,parameters){const j=await api('https://script.googleapis.com/v1/scripts/'+encodeURIComponent(ds[0].deploymentId)+':run',{method:'POST',body:JSON.stringify({function:fn,parameters,devMode:true})});if(!j.done||j.error)throw Error('EXECUTION_UNCERTAIN_NO_RETRY');return j.response&&j.response.result;}
 const start=new Date();start.setHours(0,0,0,0);const end=new Date(start);end.setDate(end.getDate()+1);
 let page='',events=[];do{const u=new URL('https://www.googleapis.com/calendar/v3/calendars/'+encodeURIComponent(CAL)+'/events');u.searchParams.set('timeMin',start.toISOString());u.searchParams.set('timeMax',end.toISOString());u.searchParams.set('singleEvents','true');u.searchParams.set('maxResults','250');if(page)u.searchParams.set('pageToken',page);const j=await api(u.toString());events.push(...(j.items||[]));page=j.nextPageToken||'';}while(page);
 const matches=events.filter(e=>hash(e.iCalUID||e.id+'@google.com')===TARGET&&e.status==='confirmed');if(matches.length!==1)throw Error('TARGET_NOT_UNIQUE');const id=matches[0].iCalUID||matches[0].id+'@google.com';
 const before=await run('tmv3_verifyPreInspectionAutomation',[id]);const rows=before&&before.records||[];const plans=rows.flatMap(r=>r.plans||[]);result.liveVersion=before&&before.version||'';result.beforePlan=plans.map(p=>({plan:tokenise(p.plan),hasBlocker:!!p.blocker,taskId:Number(p.taskId||0)}));
 if(plans.length!==1||plans[0].blocker||!/^CREATE_TASK__/.test(plans[0].plan||'')||Number(plans[0].taskId||0))throw Error('FRESH_PLAN_NOT_CREATE_NO_WRITE');
 let out;for(let attempt=0;attempt<5;attempt++){
  if(attempt){const fresh=await run('tmv3_verifyPreInspectionAutomation',[id]);const p=(fresh.records||[]).flatMap(r=>r.plans||[]);if(p.length!==1||p[0].blocker||!/^CREATE_TASK__/.test(p[0].plan||'')||Number(p[0].taskId||0))throw Error('FRESH_PLAN_CHANGED_NO_RETRY');}
  result.writeAttempted=true;out=await run('tmv3_reconcilePreInspectionEvent',[id]);
  if(out&&out.status==='LOCK_BUSY'&&Number(out.processed||0)===0&&Number(out.writes||0)===0&&attempt<4){await new Promise(resolve=>setTimeout(resolve,15000));continue;}break;
 }
 result.executionStatus=tokenise(out&&out.status);result.processed=Number(out&&out.processed||0);result.writes=Number(out&&out.writes||0);result.notifications=Number(out&&out.notifications||0);result.rows=(out&&out.results||[]).map(r=>({status:tokenise(r.status),taskId:Number(r.taskId||(r.execution&&r.execution.taskId)||0),executionStatus:tokenise(r.execution&&r.execution.status),hasError:!!r.error}));
 if(result.executionStatus!=='COMPLETE'||result.processed!==1||result.rows.length!==1||result.rows[0].hasError)throw Error('INCOMPLETE_STOP_NO_RETRY');
 const after=await run('tmv3_verifyPreInspectionAutomation',[id]);const afterPlans=(after.records||[]).flatMap(r=>r.plans||[]);result.afterPlans=afterPlans.map(p=>({plan:tokenise(p.plan),hasBlocker:!!p.blocker,taskId:Number(p.taskId||0),actions:(p.actions||[]).map(tokenise).filter(Boolean)}));result.status=afterPlans.length===1&&!afterPlans[0].blocker&&Number(afterPlans[0].taskId||0)>0&&!afterPlans[0].actions.some(a=>a!=='VERIFY_CALENDAR_LINKS')?'RECONCILED_VERIFIED':'WRITE_ATTEMPTED_REVIEW';
}
(async()=>{try{await main();}catch(e){result.status=result.writeAttempted?'UNCERTAIN_OR_INCOMPLETE_NO_RETRY':'BLOCKED_NO_WRITE';result.reason=tokenise(e.message)||'EXECUTION_ERROR';}finally{fs.mkdirSync('executions',{recursive:true});fs.writeFileSync('executions/preinspection-jerry-retry-result.json',JSON.stringify(result,null,2)+'\n');cp.execFileSync('git',['config','user.name','Classic Fireplace Automation']);cp.execFileSync('git',['config','user.email','41898282+github-actions[bot]@users.noreply.github.com']);cp.execFileSync('git',['add','executions/preinspection-jerry-retry-result.json']);try{cp.execFileSync('git',['diff','--cached','--quiet']);}catch{cp.execFileSync('git',['commit','-m','Record sanitized one-event reconciliation']);cp.execFileSync('git',['push','origin','HEAD:task-mapping-preinspection']);}console.log(JSON.stringify(result));}if(result.status!=='RECONCILED_VERIFIED')process.exitCode=1;})().catch(e=>{console.error('RESULT_PUBLICATION_FAILED');process.exitCode=1});

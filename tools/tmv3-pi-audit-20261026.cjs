// JavaScript / Node.js: targeted read-only diagnostics; no business mutations.
'use strict';
const fs=require('node:fs');
const {profiles}=require('./tmv3-execution-access-diagnostic.js');
(async()=>{
 const ps=profiles(JSON.parse(process.env.CLASPRC_JSON||'{}'));if(ps.length!==1)throw Error('EXPECTED_ONE_PROFILE');const p=ps[0];
 const r=await fetch('https://oauth2.googleapis.com/token',{method:'POST',body:new URLSearchParams({grant_type:'refresh_token',client_id:p.client,client_secret:p.secret,refresh_token:p.refresh}),redirect:'error'});if(!r.ok)throw Error('AUTH_FAILED');const a=await r.json();
 async function api(url,body){const r=await fetch(url,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+a.access_token,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),redirect:'error',signal:AbortSignal.timeout(650000)});if(!r.ok)throw Error('GOOGLE_HTTP_'+r.status);return r.json();}
 const base='https://script.googleapis.com/v1/',sid='1shaSL1CeNhR2-fr8H4x0fP2KUIjpOizLFyrNRAnGGXkCvERX4hZyJ5Gt';
 const inv=await api(base+'projects/'+sid+'/deployments'),ds=inv.deployments.filter(d=>(d.entryPoints||[]).some(e=>e.entryPointType==='EXECUTION_API'||e.executionApi));if(ds.length!==1)throw Error('EXECUTABLE_AMBIGUOUS');
 async function run(fn,parameters=[]){const r=await api(base+'scripts/'+encodeURIComponent(ds[0].deploymentId)+':run',{function:fn,parameters,devMode:true});if(r.error||r.done!==true)throw Error('NATIVE_FAILED:'+JSON.stringify(r.error||{}));return r.response.result;}
 const out={at:new Date().toISOString(),budgetBefore:await run('tmv3_strivenApiBudgetStatus'),events:[],candidates:[]};
 for(const id of ['72ve6bam2kgpvq4tiiuc3mitht','50cdk50ursqtdg5me1dleu4u1j'])out.events.push({id,result:await run('tmv3_verifyPreInspectionAutomation',[id+'@google.com'])});
 const calendar='classicfireplace.ca_c20qcqfhvjbv784asn9pvuiaf4@group.calendar.google.com';
 for(const id of ['45i1sm9ogfbuck1eu760tetin4','201gln49sa08g2787s92gmns96','7k61omkf38ffetovqsglehhbg4','7qk3plc8f20p1f1gprdnp4jngv'])out.candidates.push(await api('https://www.googleapis.com/calendar/v3/calendars/'+encodeURIComponent(calendar)+'/events/'+id));
 out.budgetAfter=await run('tmv3_strivenApiBudgetStatus');fs.mkdirSync('pi-audit-evidence',{recursive:true});fs.writeFileSync('pi-audit-evidence/result.json',JSON.stringify(out,null,2));
 console.log(JSON.stringify({status:'TARGETED_READ_ONLY_AUDIT_COMPLETE',events:out.events.map(e=>({id:e.id,records:e.result.records.map(r=>({source:r.source,plans:r.plans.map(p=>({plan:p.plan,blocker:p.blocker,taskId:p.taskId,actions:p.actions})),diagnostics:r.diagnostics}))})),candidates:out.candidates.map(e=>({id:e.id,creator:e.creator})),budgetBefore:out.budgetBefore.count,budgetAfter:out.budgetAfter.count}));
})().catch(e=>{console.error(e.message);process.exitCode=1;});

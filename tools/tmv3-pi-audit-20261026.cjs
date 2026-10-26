// JavaScript / Node.js: read-only Striven/Calendar verification and operator-sheet refresh; no Task writes.
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
 const source=await api(base+'projects/'+sid+'/content');
 const sourceHash=crypto.createHash('sha256').update(JSON.stringify(source.files.map(f=>({name:f.name,type:f.type,source:f.source||''})).sort((a,b)=>a.name.localeCompare(b.name)))).digest('hex');
 const out={at:new Date().toISOString(),sourceHash,health:await run('tmv3_healthCheck'),discovery:await run('tmv3_refreshPreInspectionDiscovery'),sheetRefresh:await run('tmv3_refreshAutomationSheets'),events:[],taskWrites:0,calendarWrites:0};
 for(const [id,taskId] of [['45i1sm9ogfbuck1eu760tetin4','19410'],['7k61omkf38ffetovqsglehhbg4','19411']])out.events.push({eventId:id+'@google.com',expectedTaskId:taskId,verification:await run('tmv3_verifyPreInspectionAutomation',[id+'@google.com'])});
 out.status=out.events.every(e=>{const r=e.verification.records.find(r=>r.source==='PRIMARY_SHARED');return r&&r.plans.length===1&&!r.plans[0].blocker&&String(r.plans[0].taskId)===e.expectedTaskId&&r.plans[0].actions.every(a=>a==='VERIFY_CALENDAR_LINKS');})?'BOTH_PREINSPECTIONS_VERIFIED':'ATTENTION';
 out.budget=await run('tmv3_strivenApiBudgetStatus');
 fs.mkdirSync('pi-audit-evidence',{recursive:true});fs.writeFileSync('pi-audit-evidence/result.json',JSON.stringify(out,null,2));console.log(JSON.stringify(out));
 if(out.status!=='BOTH_PREINSPECTIONS_VERIFIED'||!out.sheetRefresh.projectionVerified||!out.sheetRefresh.timestampReadbackVerified)throw Error('AUDIT_NOT_CONVERGED');
})().catch(e=>{console.error(e.message);process.exitCode=1;});

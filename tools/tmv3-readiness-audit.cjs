// JavaScript / Node.js: read-only production readiness evidence; never invokes business workers.
'use strict';
const fs=require('node:fs'),crypto=require('node:crypto'),vm=require('node:vm');
const {profiles}=require('./tmv3-execution-access-diagnostic.js');
const SID='1shaSL1CeNhR2-fr8H4x0fP2KUIjpOizLFyrNRAnGGXkCvERX4hZyJ5Gt';
async function main(){
 const ps=profiles(JSON.parse(process.env.CLASPRC_JSON||'{}'));if(ps.length!==1)throw Error('EXPECTED_ONE_PROFILE');const p=ps[0];
 const r=await fetch('https://oauth2.googleapis.com/token',{method:'POST',body:new URLSearchParams({grant_type:'refresh_token',client_id:p.client,client_secret:p.secret,refresh_token:p.refresh}),redirect:'error'});if(!r.ok)throw Error('AUTH_HTTP_'+r.status);const auth=await r.json();
 async function api(path,method='GET',body){const r=await fetch('https://script.googleapis.com/v1/'+path,{method,headers:{Authorization:'Bearer '+auth.access_token,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),redirect:'error',signal:AbortSignal.timeout(120000)});if(!r.ok)throw Error('GOOGLE_HTTP_'+r.status);return r.json();}
 const source=await api('projects/'+SID+'/content');const hash=o=>crypto.createHash('sha256').update(JSON.stringify(o.files.map(f=>({name:f.name,type:f.type,source:f.source||''})).sort((a,b)=>a.name.localeCompare(b.name)))).digest('hex');
 const cfg=source.files.find(f=>f.name==='00_Config');if(!cfg)throw Error('NO_CONFIG');
 const config=JSON.parse(vm.runInNewContext(cfg.source+';JSON.stringify({version:TMV3.VERSION,mode:TMV3.MODE,stage:TMV3_EXECUTION_STAGE,timezone:TMV3_TIMEZONE,operations:TMV3.OPERATIONS,apiBudget:TMV3.API_BUDGET});',{}, {timeout:1000}));
 const inv=await api('projects/'+SID+'/deployments');const ds=(inv.deployments||[]).filter(d=>(d.entryPoints||[]).some(e=>e.entryPointType==='EXECUTION_API'||e.executionApi));if(ds.length!==1)throw Error('EXPECTED_ONE_EXECUTABLE');
 const report={at:new Date().toISOString(),sourceHash:hash(source),config,sourceWrites:0,businessWrites:0,checks:{}};
 for(const fn of ['tmv3_listTriggers','tmv3_healthCheck','tmv3_strivenApiBudgetStatus']){
  const res=await api('scripts/'+encodeURIComponent(ds[0].deploymentId)+':run','POST',{function:fn,devMode:true});
  report.checks[fn]=res.error?{error:res.error}:res.response&&res.response.result;
 }
 report.sourceUnchanged=hash(await api('projects/'+SID+'/content'))===report.sourceHash;
 const names=new Set(source.files.flatMap(f=>[...(f.source||'').matchAll(/function\s+(\w+)\s*\(/g)].map(m=>m[1])));
 report.missingTriggerHandlers=(report.checks.tmv3_listTriggers||[]).filter(t=>!names.has(t.handler)).map(t=>t.handler);
 fs.mkdirSync('readiness-evidence',{recursive:true});fs.writeFileSync('readiness-evidence/result.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 if(!report.sourceUnchanged||report.missingTriggerHandlers.length||Object.values(report.checks).some(x=>x&&x.error))process.exitCode=1;
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});

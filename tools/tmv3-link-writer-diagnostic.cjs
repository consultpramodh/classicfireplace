// JavaScript / Node.js: read-only production readiness evidence; never invokes business workers.
'use strict';
const fs=require('node:fs'),crypto=require('node:crypto'),vm=require('node:vm');
const {profiles}=require('./tmv3-execution-access-diagnostic.js');
const SID='1shaSL1CeNhR2-fr8H4x0fP2KUIjpOizLFyrNRAnGGXkCvERX4hZyJ5Gt';
async function main(){
 const ps=profiles(JSON.parse(process.env.CLASPRC_JSON||'{}'));if(ps.length!==1)throw Error('EXPECTED_ONE_PROFILE');const p=ps[0];
 const r=await fetch('https://oauth2.googleapis.com/token',{method:'POST',body:new URLSearchParams({grant_type:'refresh_token',client_id:p.client,client_secret:p.secret,refresh_token:p.refresh}),redirect:'error'});if(!r.ok)throw Error('AUTH_HTTP_'+r.status);const auth=await r.json();
 async function api(path,method='GET',body){const r=await fetch('https://script.googleapis.com/v1/'+path,{method,headers:{Authorization:'Bearer '+auth.access_token,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),redirect:'error',signal:AbortSignal.timeout(120000)});if(!r.ok)throw Error('GOOGLE_HTTP_'+r.status);return r.json();}

 const ids={v3:SID,main:'1QZp4NAFeA8LmWBN31ylJYdK4XFepBX1h2lP_APaR-d1lTAC-d8LA9x3g',pre:'1E86mhD2dZcOFpqWnCvoIpwEkwZ0MA63MgM8DifV6WyB2FvVQkRWKIZ_m'};
 const hash=o=>crypto.createHash('sha256').update(JSON.stringify(o.files.map(f=>({name:f.name,type:f.type,source:f.source||''})).sort((a,b)=>a.name.localeCompare(b.name)))).digest('hex');
 const report={at:new Date().toISOString(),projects:{}};
 fs.mkdirSync('link-diagnostic-evidence',{recursive:true});
 for(const [kind,id] of Object.entries(ids)){
  const source=await api('projects/'+id+'/content');
  fs.writeFileSync('link-diagnostic-evidence/'+kind+'-source.json',JSON.stringify(source),{mode:0o600});
  const matches=[];
  for(const f of source.files){
   const s=f.source||'';let pos=s.indexOf('Pre-Inspection Task Link');
   if(pos>=0){let a=s.lastIndexOf('\nfunction ',pos);if(a<0)a=Math.max(0,pos-700);let b=s.indexOf('\nfunction ',pos);if(b<0)b=pos+4000;matches.push({name:f.name,snippet:s.slice(a,Math.min(b,a+9500)),matchingFunctions:[...s.matchAll(/function\s+(\w+)\s*\(/g)].map(m=>m[1]).filter(n=>/trigger|calendar.*link|task.*link/i.test(n)).slice(0,60)});}
  }
  report.projects[kind]={scriptId:id,sourceHash:hash(source),fileCount:source.files.length,matches};
  if(kind==='v3')report.projects[kind].linkSource=source.files.find(f=>f.name==='35_CalendarLinks').source;
 }
 const inv=await api('projects/'+SID+'/deployments'),ds=inv.deployments.filter(d=>(d.entryPoints||[]).some(e=>e.entryPointType==='EXECUTION_API'||e.executionApi));
 const response=await api('scripts/'+encodeURIComponent(ds[0].deploymentId)+':run','POST',{function:'tmv3_verifyPreInspectionAutomation',parameters:['62odlrnni7nid3ckesp8eua4co@google.com'],devMode:true});
 report.eventVerification=response.error?{error:response.error}:response.response.result;
 fs.writeFileSync('link-diagnostic-evidence/result.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});

// JavaScript / Node.js: read-only live/legacy schedule inventory.
'use strict';
const fs=require('node:fs'),crypto=require('node:crypto');
const {profiles}=require('./tmv3-execution-access-diagnostic.js');
const DIR='trigger-parity-evidence';
const ids={v3:'1shaSL1CeNhR2-fr8H4x0fP2KUIjpOizLFyrNRAnGGXkCvERX4hZyJ5Gt',legacyMain:'1QZp4NAFeA8LmWBN31ylJYdK4XFepBX1h2lP_APaR-d1lTAC-d8LA9x3g',legacyPreInspection:'1E86mhD2dZcOFpqWnCvoIpwEkwZ0MA63MgM8DifV6WyB2FvVQkRWKIZ_m'};
async function main(){
 fs.mkdirSync(DIR,{recursive:true,mode:0o700});
 const ps=profiles(JSON.parse(process.env.CLASPRC_JSON||'{}'));if(ps.length!==1)throw Error('EXPECTED_ONE_PROFILE');
 const p=ps[0],r=await fetch('https://oauth2.googleapis.com/token',{method:'POST',body:new URLSearchParams({grant_type:'refresh_token',client_id:p.client,client_secret:p.secret,refresh_token:p.refresh}),redirect:'error'});
 if(!r.ok)throw Error('AUTH_HTTP_'+r.status);const a=await r.json();if(!a.access_token)throw Error('NO_ACCESS_TOKEN');
 async function api(path,method='GET',body){const r=await fetch('https://script.googleapis.com/v1/'+path,{method,headers:{Authorization:'Bearer '+a.access_token,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),redirect:'error',signal:AbortSignal.timeout(650000)});if(!r.ok)throw Error('GOOGLE_HTTP_'+r.status+'_'+path);return r.json();}
 const summary={at:new Date().toISOString(),sourceWrites:0,taskWrites:0,projects:{}};
 for(const [label,id]of Object.entries(ids)){
  try {
   const source=await api('projects/'+id+'/content');
   const hash=crypto.createHash('sha256').update(JSON.stringify(source.files.map(f=>({name:f.name,type:f.type,source:f.source||''})).sort((a,b)=>a.name.localeCompare(b.name)))).digest('hex');
   // Never export a source file with an apparent literal credential.
   const safe=source.files.filter(f=>!/(?:api[_-]?key|client[_-]?secret|access[_-]?token|refresh[_-]?token)\s*[:=]\s*['"][A-Za-z0-9_./+-]{20,}['"]/i.test(f.source||''));
   fs.writeFileSync(DIR+'/'+label+'-source.json',JSON.stringify({files:safe}),{mode:0o600});
   const manifest=source.files.find(f=>f.name==='appsscript');
   const entries=source.files.flatMap(f=>{const lines=(f.source||'').split('\n');return lines.flatMap((s,i)=>/function\s+.*(?:[Tt]rigger|[Ss]chedul|[Aa]utomat|[Dd]aily|[Hh]ourly)|ScriptApp.newTrigger|\.atHour\(|\.nearMinute\(|\.everyHours\(|\.everyMinutes\(|CALENDAR_STAGE_GATED/.test(s)?[{file:f.name,line:i+1,text:lines.slice(Math.max(0,i-2),Math.min(lines.length,i+9)).join('\n')}]:[]);});
   summary.projects[label]={hash,files:source.files.map(f=>f.name),redactedFiles:source.files.length-safe.length,timezone:manifest?JSON.parse(manifest.source).timeZone:null,scheduleEvidence:entries};
   if(label==='v3'){
    const inv=await api('projects/'+id+'/deployments');const ds=(inv.deployments||[]).filter(d=>(d.entryPoints||[]).some(e=>e.entryPointType==='EXECUTION_API'||e.executionApi));if(ds.length!==1)throw Error('EXPECTED_ONE_EXECUTABLE');
    const out=await api('scripts/'+encodeURIComponent(ds[0].deploymentId)+':run','POST',{function:'tmv3_listTriggers',devMode:true});
    if(out.error||out.done!==true)throw Error('TRIGGER_INVENTORY_EXECUTION_FAILED:'+JSON.stringify(out.error||{}));
    summary.projects[label].installedTriggers=out.response.result;
   }
  }catch(e){summary.projects[label]={...summary.projects[label],error:String(e.message)};}
 }
 fs.writeFileSync(DIR+'/summary.json',JSON.stringify(summary,null,2),{mode:0o600});
 console.log(JSON.stringify(summary));
 if(summary.projects.v3.error)process.exitCode=1;
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});

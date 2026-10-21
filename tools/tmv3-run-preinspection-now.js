// JavaScript / Node.js: invoke the existing authorized automation, with no source or permission changes.
'use strict';
const fs=require('node:fs');
const dir='preinspection-run-now-evidence';
const scriptId='1shaSL1CeNhR2-fr8H4x0fP2KUIjpOizLFyrNRAnGGXkCvERX4hZyJ5Gt';
function find(o,keys){if(!o||typeof o!=='object')return '';for(const[k,v]of Object.entries(o))if(keys.includes(k)&&typeof v==='string'&&v)return v;for(const v of Object.values(o)){const s=find(v,keys);if(s)return s;}return '';}
async function main(){
 fs.mkdirSync(dir,{recursive:true,mode:0o700});
 const result={status:'NOT_STARTED',sourceWrites:0,permissionChanges:0,apiGuardUnchanged:true};
 try{
  const conf=JSON.parse(process.env.CLASPRC_JSON||'{}');
  const form=new URLSearchParams({grant_type:'refresh_token',client_id:find(conf,['clientId','client_id']),client_secret:find(conf,['clientSecret','client_secret']),refresh_token:find(conf,['refresh_token','refreshToken'])});
  if([...form.values()].some(v=>!v))throw Error('AUTH_CONFIGURATION_MISSING');
  const ar=await fetch('https://oauth2.googleapis.com/token',{method:'POST',body:form,redirect:'error'});
  if(!ar.ok)throw Error('AUTH_REFRESH_FAILED');const auth=await ar.json();if(!auth.access_token)throw Error('ACCESS_TOKEN_MISSING');
  const headers={Authorization:'Bearer '+auth.access_token};
  const inventory=await fetch('https://script.googleapis.com/v1/projects/'+scriptId+'/deployments',{headers,redirect:'error'});
  if(!inventory.ok)throw Error('DEPLOYMENT_INVENTORY_HTTP_'+inventory.status);
  const body=await inventory.json();
  const candidates=(body.deployments||[]).filter(d=>(d.entryPoints||[]).some(e=>e.entryPointType==='EXECUTION_API'||e.executionApi));
  result.deploymentCount=(body.deployments||[]).length;result.apiExecutableCount=candidates.length;
  result.entryPointTypes=Array.from(new Set((body.deployments||[]).flatMap(d=>(d.entryPoints||[]).map(e=>e.entryPointType))));
  if(candidates.length!==1){result.status=candidates.length?'AMBIGUOUS_API_EXECUTABLE_NO_RUN':'NO_EXISTING_API_EXECUTABLE_NO_RUN';return;}
  const deploymentId=candidates[0].deploymentId;if(!deploymentId)throw Error('DEPLOYMENT_ID_MISSING');
  async function run(fn){
   // Exactly one request per function. Never retry an uncertain execution.
   const response=await fetch('https://script.googleapis.com/v1/scripts/'+encodeURIComponent(deploymentId)+':run',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({function:fn,devMode:true}),redirect:'error',signal:AbortSignal.timeout(650000)});
   const data=await response.json();
   if(!response.ok)throw Error('EXECUTION_HTTP_'+response.status+':'+String(data.error&&data.error.message||'').slice(0,300));
   if(data.error)throw Error('EXECUTION_ERROR:'+String(data.error.message||JSON.stringify(data.error.details||[])).slice(0,500));
   if(data.done!==true)throw Error('EXECUTION_OUTCOME_UNCERTAIN_NO_RETRY');
   return data.response&&data.response.result;
  }
  result.triggers=await run('tmv3_listTriggers');
  result.native=await run('tmv3_preInspectionCheck0800');
  result.status='AUTOMATION_RETURNED';
 }catch(e){result.status='STOPPED_RECONCILE_BEFORE_RETRY';result.error=String(e.message||e).slice(0,600);}
 finally{
  fs.writeFileSync(dir+'/result.json',JSON.stringify(result,null,2),{mode:0o600});
  if(result.status!=='AUTOMATION_RETURNED')process.exitCode=1;
  console.log(JSON.stringify({status:result.status,error:result.error||'',deploymentCount:result.deploymentCount,apiExecutableCount:result.apiExecutableCount,entryPointTypes:result.entryPointTypes,sourceWrites:0,permissionChanges:0,nativeStatus:result.native&&result.native.status,sweep:result.native&&result.native.sweep,continuation:result.native&&result.native.continuation}));
 }
 if(result.status!=='AUTOMATION_RETURNED')process.exitCode=1;
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});

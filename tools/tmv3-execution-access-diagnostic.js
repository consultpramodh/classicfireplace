// JavaScript / Node.js: read-only execution-access diagnosis; never prints credentials.
'use strict';
const fs=require('node:fs'),crypto=require('node:crypto');
const scriptId='1shaSL1CeNhR2-fr8H4x0fP2KUIjpOizLFyrNRAnGGXkCvERX4hZyJ5Gt';
const dir='execution-access-diagnostic';
function direct(o,keys){for(const k of keys)if(typeof o[k]==='string'&&o[k])return o[k];return '';}
function profiles(root){const all=[];function walk(o){if(!o||typeof o!=='object')return;const client=direct(o,['client_id','clientId']),secret=direct(o,['client_secret','clientSecret']),refresh=direct(o,['refresh_token','refreshToken']);if(client&&secret&&refresh)all.push({client,secret,refresh});for(const v of Object.values(o))walk(v);}walk(root);const seen=new Set();return all.filter(p=>{const key=p.client+'|'+p.refresh;if(seen.has(key))return false;seen.add(key);return true;});}
async function main(){
 fs.mkdirSync(dir,{recursive:true,mode:0o700});
 const config=JSON.parse(process.env.CLASPRC_JSON||'{}'),candidates=profiles(config);
 const report={status:'READ_ONLY_DIAGNOSIS',credentialProfileCount:candidates.length,sourceWrites:0,permissionChanges:0,taskWrites:0,tests:[]};
 if(!candidates.length)throw Error('NO_COMPLETE_OAUTH_PROFILE');
 for(let index=0;index<candidates.length;index++){
  const p=candidates[index],test={profile:index+1,oauthClientFingerprint:crypto.createHash('sha256').update(p.client).digest('hex').slice(0,16),oauthProjectNumberPrefix:/^\d+-/.test(p.client)?p.client.split('-')[0]:'UNKNOWN'};
  report.tests.push(test);
  const authResponse=await fetch('https://oauth2.googleapis.com/token',{method:'POST',body:new URLSearchParams({grant_type:'refresh_token',client_id:p.client,client_secret:p.secret,refresh_token:p.refresh}),redirect:'error'});
  if(!authResponse.ok){test.refreshHttpStatus=authResponse.status;continue;}
  const auth=await authResponse.json();if(!auth.access_token){test.error='NO_ACCESS_TOKEN';continue;}
  const headers={Authorization:'Bearer '+auth.access_token};
  const contentResponse=await fetch('https://script.googleapis.com/v1/projects/'+scriptId+'/content',{headers,redirect:'error'});
  test.sourceReadHttpStatus=contentResponse.status;if(!contentResponse.ok)continue;
  const content=await contentResponse.json();const manifest=content.files.find(f=>f.name==='appsscript');
  const required=JSON.parse(manifest.source).oauthScopes||[];
  let granted=String(auth.scope||'').split(/\s+/).filter(Boolean);
  if(!granted.length){const infoResponse=await fetch('https://oauth2.googleapis.com/tokeninfo?access_token='+encodeURIComponent(auth.access_token),{redirect:'error'});if(infoResponse.ok){const info=await infoResponse.json();granted=String(info.scope||'').split(/\s+/).filter(Boolean);}}
  test.requiredScopes=required;test.grantedScopes=granted;test.missingScopes=required.filter(s=>!granted.includes(s));
  const depResponse=await fetch('https://script.googleapis.com/v1/projects/'+scriptId+'/deployments',{headers,redirect:'error'});
  test.deploymentReadHttpStatus=depResponse.status;if(!depResponse.ok)continue;
  const inventory=await depResponse.json();
  const apis=(inventory.deployments||[]).filter(d=>(d.entryPoints||[]).some(e=>e.entryPointType==='EXECUTION_API'||e.executionApi));
  test.apiExecutableCount=apis.length;test.deployments=apis.map(d=>({versionNumber:d.deploymentConfig&&d.deploymentConfig.versionNumber||null,executionAccess:(d.entryPoints||[]).filter(e=>e.executionApi).map(e=>e.executionApi.access)}));
  if(apis.length!==1)continue;
  test.probes=[];
  // Both probes are the same public, zero-Striven-call budget diagnostic.
  for(const devMode of [true,false]){
   const response=await fetch('https://script.googleapis.com/v1/scripts/'+encodeURIComponent(apis[0].deploymentId)+':run',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({function:'tmv3_strivenApiBudgetStatus',devMode}),redirect:'error',signal:AbortSignal.timeout(60000)});
   const data=await response.json();const probe={devMode,httpStatus:response.status};test.probes.push(probe);
   if(data.error){probe.errorCode=data.error.code;probe.errorMessage=String(data.error.message||'').slice(0,400);probe.errorDetails=(data.error.details||[]).map(d=>({type:d['@type'],reason:d.reason,domain:d.domain}));}
   if(response.ok&&data.done===true&&data.response){probe.budget=data.response.result;probe.executionAccessVerified=true;report.status='EXECUTION_ACCESS_VERIFIED';}
  }
 }
 fs.writeFileSync(dir+'/result.json',JSON.stringify(report,null,2),{mode:0o600});console.log(JSON.stringify(report));
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={profiles};

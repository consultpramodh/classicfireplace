// JavaScript / Node.js: backup, temporary single-use wrapper, verified restore; no uncertain retry.
'use strict';
const fs=require('node:fs'),crypto=require('node:crypto'),vm=require('node:vm'),https=require('node:https');
const target=require('./tmv3-next-week-targets.json').find(t=>t.key===process.env.TMV3_TARGET_KEY);if(!target)throw Error('TARGET_NOT_AUTHORIZED');
const DIR='next-week-e2e-evidence/'+target.key,SID='1shaSL1CeNhR2-fr8H4x0fP2KUIjpOizLFyrNRAnGGXkCvERX4hZyJ5Gt';
const {profiles}=require('./tmv3-execution-access-diagnostic.js');
const hash=o=>crypto.createHash('sha256').update(JSON.stringify(o.files.map(f=>({name:f.name,type:f.type,source:f.source||''})).sort((a,b)=>a.name.localeCompare(b.name)))).digest('hex');
async function main(){
 fs.mkdirSync(DIR,{recursive:true,mode:0o700});
 const ps=profiles(JSON.parse(process.env.CLASPRC_JSON||'{}'));if(ps.length!==1)throw Error('EXPECTED_ONE_PROFILE');const p=ps[0];
 const ar=await fetch('https://oauth2.googleapis.com/token',{method:'POST',body:new URLSearchParams({grant_type:'refresh_token',client_id:p.client,client_secret:p.secret,refresh_token:p.refresh}),redirect:'error'});if(!ar.ok)throw Error('AUTH_FAILED');const a=await ar.json();
 async function api(path,method='GET',body){return new Promise((resolve,reject)=>{const payload=body?JSON.stringify(body):null;const request=https.request('https://script.googleapis.com/v1/'+path,{method,headers:{Authorization:'Bearer '+a.access_token,...(payload?{'Content-Type':'application/json','Content-Length':Buffer.byteLength(payload)}:{})}},response=>{let text='';response.setEncoding('utf8');response.on('data',chunk=>text+=chunk);response.on('error',reject);response.on('end',()=>{if(response.statusCode<200||response.statusCode>=300)return reject(Error('GOOGLE_HTTP_'+response.statusCode));try{resolve(JSON.parse(text));}catch(e){reject(Error('GOOGLE_RESPONSE_INVALID'));}});});const timeout=setTimeout(()=>request.destroy(Error('EXECUTION_TIMEOUT_UNCERTAIN_NO_RETRY')),650000);request.on('close',()=>clearTimeout(timeout));request.on('error',reject);if(payload)request.write(payload);request.end();});}
 await require('./tmv3-next-week-intake.cjs').prepare(a.access_token,target);
 const path='projects/'+SID+'/content',before=await api(path),beforeHash=hash(before);
 if(beforeHash!=='b03d1205bcaae2e2f3ca5dc8ce0a2ac3bb22c75acbec3cc807ee0d749bf807d1')throw Error('LIVE_SOURCE_DRIFT_NO_WRITE');
 fs.writeFileSync(DIR+'/before.json',JSON.stringify(before),{mode:0o600});
 const work=JSON.parse(JSON.stringify(before)),file=work.files.find(f=>f.name==='20_Striven');if(!file)throw Error('MODULE_MISSING');file.source+='\n'+fs.readFileSync('tools/tmv3-next-week-e2e.gs','utf8');
 for(const f of work.files)if(f.type==='SERVER_JS')new vm.Script(f.source,{filename:f.name});
 const workHash=hash(work),report={status:'NOT_EXECUTED',beforeHash,temporaryHash:workHash,providerQuotaReset:false};
 let attempted=false;
 try{
  if(hash(await api(path))!==beforeHash)throw Error('PRE_WRITE_DRIFT');
  attempted=true;await api(path,'PUT',{files:work.files});if(hash(await api(path))!==workHash)throw Error('PATCH_READBACK_FAILED');
  const inv=await api('projects/'+SID+'/deployments');const ds=inv.deployments.filter(d=>(d.entryPoints||[]).some(e=>e.entryPointType==='EXECUTION_API'||e.executionApi));if(ds.length!==1)throw Error('EXPECTED_ONE_EXECUTABLE');
  const result=await api('scripts/'+encodeURIComponent(ds[0].deploymentId)+':run','POST',{function:'tmv3_nextWeekConfirmedRun',parameters:[target],devMode:true});
  if(result.error||result.done!==true)throw Error('EXECUTION_FAILED_OR_UNCERTAIN_NO_RETRY:'+JSON.stringify(result.error||{}));
  report.result=result.response&&result.response.result;report.status='NEXT_WEEK_EVENT_RETURNED';if(report.result.status!=='VERIFIED')process.exitCode=1;
 }catch(e){report.status='RECONCILE_NO_RETRY';report.error=String(e.message);process.exitCode=1;}
 finally{
  if(attempted){const current=hash(await api(path));if(current===workHash){await api(path,'PUT',{files:before.files});report.originalSourceRestored=hash(await api(path))===beforeHash;}else report.originalSourceRestored=current===beforeHash;}
  fs.writeFileSync(DIR+'/result.json',JSON.stringify(report,null,2),{mode:0o600});console.log(JSON.stringify(report));if(!report.originalSourceRestored)process.exitCode=1;
 }
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});

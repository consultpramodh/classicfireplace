// JavaScript / Node.js: read-only production readiness evidence; never invokes business workers.
'use strict';
const fs=require('node:fs'),crypto=require('node:crypto'),vm=require('node:vm');
const {profiles}=require('./tmv3-execution-access-diagnostic.js');
const SID='1shaSL1CeNhR2-fr8H4x0fP2KUIjpOizLFyrNRAnGGXkCvERX4hZyJ5Gt';
async function main(mode){
 const ps=profiles(JSON.parse(process.env.CLASPRC_JSON||'{}'));if(ps.length!==1)throw Error('EXPECTED_ONE_PROFILE');const p=ps[0];
 const r=await fetch('https://oauth2.googleapis.com/token',{method:'POST',body:new URLSearchParams({grant_type:'refresh_token',client_id:p.client,client_secret:p.secret,refresh_token:p.refresh}),redirect:'error'});if(!r.ok)throw Error('AUTH_HTTP_'+r.status);const auth=await r.json();
 async function api(path,method='GET',body){const r=await fetch('https://script.googleapis.com/v1/'+path,{method,headers:{Authorization:'Bearer '+auth.access_token,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),redirect:'error',signal:AbortSignal.timeout(650000)});if(!r.ok)throw Error('GOOGLE_HTTP_'+r.status);return r.json();}

 const LEGACY='1E86mhD2dZcOFpqWnCvoIpwEkwZ0MA63MgM8DifV6WyB2FvVQkRWKIZ_m',DIR='canonical-owner-evidence';
 const expected='488fb7d52dd9e78fa25e0d6824ccf7fc6d8f35c40ae4c08a7c147d48df9935d1',expectedV3='b24458af54c9282f2332163eb5fdcffab552899726cf12778fa9448f01b18b0e';
 const hash=o=>crypto.createHash('sha256').update(JSON.stringify(o.files.map(f=>({name:f.name,type:f.type,source:f.source||''})).sort((a,b)=>a.name.localeCompare(b.name)))).digest('hex');
 const digest=s=>crypto.createHash('sha256').update(s).digest('hex');
 const prePath='projects/'+LEGACY+'/content',v3Path='projects/'+SID+'/content';
 fs.mkdirSync(DIR,{recursive:true,mode:0o700});
 if(mode==='prepare'){
  const source=await api(prePath),v3=await api(v3Path);
  if(hash(source)!==expected||hash(v3)!==expectedV3)throw Error('LIVE_SOURCE_DRIFT_NO_WRITE');
  const {patch}=require('./patch-preinspect-v3-link-owner.cjs');
  const built=patch(source,fs.readFileSync('tools/preinspect-v3-link-owner.gs','utf8'));
  if(built.changed.slice().sort().join(',')!=='35_PreInspect_Task_Review,36_PreInspect_Task_Create,98_12_PreInspect_Dual_Calendar_Task_Link_R1,98_7_Systemic_Repair_R1')throw Error('CHANGED_SCOPE_MISMATCH');
  if(source.files.some(f=>/(?:api[_-]?key|client[_-]?secret|access[_-]?token|refresh[_-]?token)\s*[:=]\s*['"][A-Za-z0-9_./+-]{20,}['"]/i.test(f.source||'')))throw Error('POSSIBLE_LITERAL_SECRET_NO_EXPORT');
  fs.writeFileSync(DIR+'/before.json',JSON.stringify(source),{mode:0o600});fs.writeFileSync(DIR+'/work.json',JSON.stringify(built.work),{mode:0o600});
  const manifest={version:'2026-10-23-canonical-link-owner-r1',scriptId:LEGACY,beforeHash:expected,afterHash:hash(built.work),v3Hash:expectedV3,files:built.changed.map(name=>({name,before:digest(source.files.find(f=>f.name===name).source),after:digest(built.work.files.find(f=>f.name===name).source)}))};
  fs.writeFileSync(DIR+'/manifest.json',JSON.stringify(manifest,null,2));
  for(const [name,obj] of [['work',built.work],['v3work',v3]]){fs.mkdirSync(DIR+'/'+name,{recursive:true});for(const f of obj.files)if(f.type==='SERVER_JS')fs.writeFileSync(DIR+'/'+name+'/'+f.name+'.js',f.source);}
  console.log(JSON.stringify({status:'PREPARED',manifest,sourceWrites:0,businessWrites:0}));return;
 }
 if(mode!=='apply')throw Error('UNKNOWN_MODE');
 const before=JSON.parse(fs.readFileSync(DIR+'/before.json')),work=JSON.parse(fs.readFileSync(DIR+'/work.json')),m=JSON.parse(fs.readFileSync(DIR+'/manifest.json'));
 if(hash(before)!==expected||hash(work)!==m.afterHash||hash(await api(prePath))!==expected||hash(await api(v3Path))!==expectedV3)throw Error('PRE_WRITE_DRIFT');
 const report={status:'NOT_STARTED',version:m.version,scriptId:LEGACY,beforeHash:expected,afterHash:m.afterHash,files:m.files,v3Hash:expectedV3,calendarWrites:0,strivenWrites:0,permissionsChanged:false,immutableVersionsCreated:0};
 let attempted=false;
 try{
  attempted=true;await api(prePath,'PUT',{files:work.files});if(hash(await api(prePath))!==m.afterHash)throw Error('LEGACY_SOURCE_READBACK_FAILED');
  report.sourceVerified=true;
  const inv=await api('projects/'+LEGACY+'/deployments'),ds=(inv.deployments||[]).filter(d=>(d.entryPoints||[]).some(e=>e.entryPointType==='EXECUTION_API'||e.executionApi));
  report.nativeExecutionAvailable=ds.length===1;
  if(ds.length===1){
   const r=await api('scripts/'+encodeURIComponent(ds[0].deploymentId)+':run','POST',{function:'verifyPreinspectV3CanonicalLinkOwnership',parameters:['62odlrnni7nid3ckesp8eua4co@google.com',19320],devMode:true});
   if(r.error||!r.response)throw Error('NATIVE_OWNER_GUARD_FAILED:'+JSON.stringify(r.error||{}));
   report.nativeGuard=r.response.result;
   if(report.nativeGuard.calendarWritesPerformed!==false||!['V3_CANONICAL_LINK_PRESERVED','DEFERRED_TO_V3_CANONICAL_LINK_REVIEW'].includes(report.nativeGuard.status))throw Error('GUARD_ACCEPTANCE_FAILED');
  }
  report.finalHash=hash(await api(prePath));report.v3Unchanged=hash(await api(v3Path))===expectedV3;
  if(report.finalHash!==m.afterHash||!report.v3Unchanged)throw Error('FINAL_SOURCE_DRIFT');
  report.status='LEGACY_CANONICAL_OWNER_GUARDS_DEPLOYED';
 }catch(e){
  report.status='STOPPED_RECONCILE';report.error=String(e.message);process.exitCode=1;
  if(attempted && hash(await api(prePath))===m.afterHash){await api(prePath,'PUT',{files:before.files});report.rollbackVerified=hash(await api(prePath))===expected;}
 }finally{fs.writeFileSync(DIR+'/result.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));}
}
main(process.argv[2]).catch(e=>{console.error(e.message);process.exitCode=1;});


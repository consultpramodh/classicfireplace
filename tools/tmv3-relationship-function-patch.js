// JavaScript / Node.js: capture first, then replace exactly one verified function.
'use strict';
const fs=require('node:fs'),crypto=require('node:crypto'),vm=require('node:vm');
const dir='autopatch-output-relationship-function';
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
const canonical=x=>hash(JSON.stringify(x.files.map(f=>({name:f.name,type:f.type,source:f.source||''})).sort((a,b)=>a.name.localeCompare(b.name))));
function region(source,spec={}) {
  const begin='function '+(spec.functionName || 'tmv3_repairExistingTaskRelationships')+'(';
  const end=spec.nextFunctionName===null ? null : '\nfunction '+(spec.nextFunctionName || 'tmv3_taskFirstFreshOrderOwnershipById_')+'(';
  const start=source.indexOf(begin),stop=end===null ? source.length : source.indexOf(end,start);
  if(start<0||stop<start||source.indexOf(begin,start+begin.length)!==-1||(end!==null && source.indexOf(end,stop+end.length)!==-1))throw Error('FUNCTION_BOUNDARY_NOT_UNIQUE');
  return {start,stop,text:source.slice(start,stop)};
}
function patch(content,desired,manifest) {
  if(manifest.taskWritesRequested!==false)throw Error('TASK_EXECUTION_FORBIDDEN');
  const files=content.files.filter(f=>f.name===manifest.sourceFile);
  if(files.length!==1||files[0].type!=='SERVER_JS')throw Error('SOURCE_FILE_NOT_UNIQUE');
  const before=region(files[0].source,manifest);
  if(hash(desired)!==manifest.expectedAfterFunctionSha256)throw Error('DESIRED_FUNCTION_HASH_MISMATCH');
  new vm.Script(desired);
  if(hash(before.text)===manifest.expectedAfterFunctionSha256)return {content,alreadyPatched:true};
  if(hash(before.text)!==manifest.expectedBeforeFunctionSha256)throw Error('LIVE_FUNCTION_DRIFT_NO_WRITE');
  const source=files[0].source.slice(0,before.start)+desired+files[0].source.slice(before.stop);
  new vm.Script(source);
  return {content:{files:content.files.map(f=>f===files[0]?{...f,source}:f)},alreadyPatched:false};
}
function deepFind(o,keys) {
  if(!o||typeof o!=='object')return '';
  for(const [k,v]of Object.entries(o))if(keys.includes(k)&&typeof v==='string'&&v)return v;
  for(const v of Object.values(o)){const found=deepFind(v,keys);if(found)return found;}
  return '';
}
async function main(mode) {
  fs.mkdirSync(dir,{recursive:true,mode:0o700});
  const manifest=JSON.parse(fs.readFileSync(process.env.TMV3_FUNCTION_PATCH_MANIFEST || 'release-candidates/tmv3-relationship-function-patch.json','utf8'));
  if(manifest.scriptId!=='1shaSL1CeNhR2-fr8H4x0fP2KUIjpOizLFyrNRAnGGXkCvERX4hZyJ5Gt')throw Error('WRONG_SCRIPT');
  const raw=JSON.parse(process.env.CLASPRC_JSON||'{}');
  const form=new URLSearchParams({grant_type:'refresh_token',client_id:deepFind(raw,['clientId','client_id']),client_secret:deepFind(raw,['clientSecret','client_secret']),refresh_token:deepFind(raw,['refresh_token','refreshToken'])});
  if([...form.values()].some(v=>!v))throw Error('MISSING_OAUTH_CONFIGURATION');
  const refresh=await fetch('https://oauth2.googleapis.com/token',{method:'POST',body:form,redirect:'error'});
  if(!refresh.ok)throw Error('OAUTH_REFRESH_FAILED');
  const auth=await refresh.json();if(!auth.access_token)throw Error('NO_ACCESS_TOKEN');
  const api=async(body)=>{
    const r=await fetch('https://script.googleapis.com/v1/projects/'+manifest.scriptId+'/content',{
      method:body?'PUT':'GET',headers:{Authorization:'Bearer '+auth.access_token,...(body?{'Content-Type':'application/json'}:{})},
      ...(body?{body:JSON.stringify(body)}:{}),redirect:'error'});
    if(!r.ok)throw Error('SCRIPT_CONTENT_HTTP_'+r.status);
    return r.json();
  };
  const specs=manifest.patches || [manifest];
  if(!specs.length)throw Error('EMPTY_PATCH');
  const preparePlan=before=>{
    let content=before,alreadyPatched=true;
    for(const spec of specs){
      const desired=fs.readFileSync(spec.payloadPath || 'tools/tmv3-relationship-repair-function.js','utf8');
      const next=patch(content,desired,spec);content=next.content;alreadyPatched=alreadyPatched && next.alreadyPatched;
    }
    return {content,alreadyPatched};
  };
  if(mode==='prepare') {
    const before=await api();
    // No credentials or Script Properties are exported. Refuse hard-coded secrets.
    if(before.files.some(f=>/Bearer\s+[A-Za-z0-9_.-]{24,}|(?:api[_-]?key|client[_-]?secret|access[_-]?token|refresh[_-]?token)\s*[:=]\s*['"][A-Za-z0-9_./+-]{20,}['"]/i.test(f.source||'')))throw Error('POSSIBLE_SOURCE_SECRET_NO_EXPORT');
    const plan=preparePlan(before);
    fs.writeFileSync(dir+'/before.json',JSON.stringify(before),{mode:0o600});
    fs.writeFileSync(dir+'/prepared.json',JSON.stringify({beforeHash:canonical(before),afterHash:canonical(plan.content),alreadyPatched:plan.alreadyPatched}),{mode:0o600});
    console.log('PREPARED_BACKUP_REQUIRED_BEFORE_APPLY');return;
  }
  if(mode!=='apply')throw Error('UNKNOWN_MODE');
  const before=JSON.parse(fs.readFileSync(dir+'/before.json','utf8'));
  const prepared=JSON.parse(fs.readFileSync(dir+'/prepared.json','utf8'));
  if(canonical(before)!==prepared.beforeHash)throw Error('BACKUP_HASH_MISMATCH');
  const plan=preparePlan(before);
  if(canonical(plan.content)!==prepared.afterHash)throw Error('PLAN_HASH_MISMATCH');
  const fresh=await api();
  if(canonical(fresh)!==prepared.beforeHash)throw Error('LIVE_PROJECT_CHANGED_NO_WRITE');
  let attempted=false;
  try {
    if(!plan.alreadyPatched){attempted=true;await api(plan.content);}
    const after=await api();
    if(canonical(after)!==prepared.afterHash)throw Error('POST_WRITE_PARITY_MISMATCH_RECONCILE_BEFORE_RETRY');
    const result={status:plan.alreadyPatched?'ALREADY_PATCHED_VERIFIED':'FUNCTION_PATCH_SOURCE_VERIFIED',...prepared,
      functions:specs.map(s=>({sourceFile:s.sourceFile,functionName:s.functionName || 'tmv3_repairExistingTaskRelationships'})),
      sourceWritePerformed:attempted,taskWritesPerformed:false,runtimeVerification:'PENDING_NATIVE_RUN',permissionsChanged:false};
    fs.writeFileSync(dir+'/result.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
  }catch(err){
    fs.writeFileSync(dir+'/result.json',JSON.stringify({status:'STOPPED_RECONCILE_BEFORE_RETRY',error:err.message,sourceWriteAttempted:attempted,taskWritesPerformed:false}));
    throw err;
  }
}
module.exports={patch,region,hash,canonical};
if(require.main===module)main(process.argv[2]).catch(err=>{console.error(err.message);process.exitCode=1;});

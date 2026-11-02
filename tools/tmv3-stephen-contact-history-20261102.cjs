'use strict';
const fs=require('fs'),crypto=require('crypto');
const {profiles}=require('./tmv3-execution-access-diagnostic.js');
const dir='stephen-pi-verify';const sid='1shaSL1CeNhR2-fr8H4x0fP2KUIjpOizLFyrNRAnGGXkCvERX4hZyJ5Gt';
const hash=x=>crypto.createHash('sha256').update(JSON.stringify(x.files.map(f=>({name:f.name,type:f.type,source:f.source||''})).sort((a,b)=>a.name.localeCompare(b.name)))).digest('hex');
const target='3ba4956504f9f4339161faedf05950c0ee7478bb8be56980312f911d3c169fa5';
const extra=`function tmv3_verifyTwoStephenContactsAndHistory20261102() {
  {
    var ids=[63048,63114], out=[];
    ids.forEach(function(id) {
      var row=tmv3_rows_(TMV3.SHEETS.CUSTOMERS).filter(function(c){return String(c['Customer ID'])===String(id);});
      if(row.length!==1){out.push({customerId:id,error:'CUSTOMER_CACHE_AMBIGUOUS'});return;}
      try {
        var contacts=tmv3_getCustomerContacts_(id,{forceFresh:true,requireComplete:true});
        var tasks=tmv3_searchPreInspectionTasks_(row[0]);
        var eventId=id===63048?'6u1a4solo8a5a94ulc8cuqgamc@google.com':'0danub3va8sqssv8h2u49sp3r9@google.com';
        var event=tmv3_preInspectionRecoveryRecord_(eventId);
        var plans=tmv3_step7FreshPlansForEvent_('PreInspection',eventId);
        var orderResult;
        try {if(plans.length!==1) throw Error('PLAN_COUNT');orderResult=tmv3_preInspectionOrderBeforeCreate_(event,plans[0]);} catch(e) {orderResult={error:String(e)};}
        var nums=id===63048?['586368']:['586541','586542','586543','586545'];
        var orders=nums.map(function(n){try{var raw=tmv3_fetchJson_(TMV3.API_BASE+'/v1/sales-orders/search',{method:'post',contentType:'application/json',payload:JSON.stringify({PageIndex:0,PageSize:2,Number:n,CustomerId:id})});var data=tmv3_first_(raw,['Data']),count=Number(tmv3_first_(raw,['TotalCount']));if(!Array.isArray(data)||count!==1||data.length!==1||String(tmv3_first_(data[0],['Number']))!==n)throw Error('NOT_UNIQUE');var oid=Number(tmv3_first_(data[0],['Id']));var full=tmv3_fetchJson_(TMV3.API_BASE+'/v1/sales-orders/'+oid,{method:'get'});var cust=tmv3_first_(full,['Customer']),st=tmv3_first_(full,['Status']);if(Number(tmv3_first_(cust,['Id']))!==id||Number(tmv3_first_(full,['Id']))!==oid||String(tmv3_first_(full,['OrderNumber','Number']))!==n)throw Error('OWNERSHIP_MISMATCH');return {number:n,id:oid,status:tmv3_first_(st,['Name']),statusId:tmv3_first_(st,['Id'])};}catch(e){return {number:n,error:String(e)};}});
        out.push({customerId:id,contacts:contacts,tasks:tasks,orderCheck:orderResult,orders:orders});
      } catch(e){out.push({customerId:id,error:String(e)});}
    });
    return {status:'READ_ONLY',items:out};
  }
}`;
async function main(){
 const p=profiles(JSON.parse(process.env.CLASPRC_JSON||'{}'));if(p.length!==1)throw Error('PROFILE_INVALID');
 const res=await fetch('https://oauth2.googleapis.com/token',{method:'POST',body:new URLSearchParams({grant_type:'refresh_token',client_id:p[0].client,client_secret:p[0].secret,refresh_token:p[0].refresh})});if(!res.ok)throw Error('AUTH_FAILED');const token=(await res.json()).access_token;
 async function api(path,method='GET',body){const r=await fetch('https://script.googleapis.com/v1/'+path,{method,headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});if(!r.ok)throw Error(method+'_HTTP_'+r.status);return r.json();}
 fs.mkdirSync(dir,{recursive:true,mode:0o700});
 if(process.argv[2]==='prepare'){
  const live=await api('projects/'+sid+'/content');if(hash(live)!==target)throw Error('LIVE_SOURCE_DRIFT');
  fs.writeFileSync(dir+'/before.json',JSON.stringify(live),{mode:0o600});console.log('Source captured; no mutation');return;
 }
 const before=JSON.parse(fs.readFileSync(dir+'/before.json'));if(hash(before)!==target||hash(await api('projects/'+sid+'/content'))!==target)throw Error('LIVE_SOURCE_DRIFT');
 const candidate=JSON.parse(JSON.stringify(before));candidate.files.push({name:'zz_StephenReadOnlyProbe_20261102',type:'SERVER_JS',source:extra});
 const candidateHash=hash(candidate);let changed=false,report={status:'NOT_RUN'};
 try {
  changed=true;await api('projects/'+sid+'/content','PUT',{files:candidate.files});
  if(hash(await api('projects/'+sid+'/content'))!==candidateHash)throw Error('PATCH_READBACK_FAILED');
  const deps=await api('projects/'+sid+'/deployments');const ds=deps.deployments.filter(d=>(d.entryPoints||[]).some(e=>e.entryPointType==='EXECUTION_API'||e.executionApi));if(ds.length!==1)throw Error('DEPLOYMENT_COUNT');
  const result=await api('scripts/'+encodeURIComponent(ds[0].deploymentId)+':run','POST',{function:'tmv3_verifyTwoStephenContactsAndHistory20261102',devMode:true});
  if(result.error || result.done!==true) throw Error('PROBE_NOT_COMPLETED:'+String(result.error && result.error.message || 'UNKNOWN')); report={status:'RETURNED',result:result};
 } catch(e){report={status:'FAILED_NO_RETRY',error:String(e)};process.exitCode=1}
 finally {
  if(changed){const live=await api('projects/'+sid+'/content');const h=hash(live);if(h===candidateHash){await api('projects/'+sid+'/content','PUT',{files:before.files});report.restored=hash(await api('projects/'+sid+'/content'))===target;}else report.restored=h===target;}
  fs.writeFileSync(dir+'/result.json',JSON.stringify(report),{mode:0o600});
  console.log(JSON.stringify({status:report.status,restored:report.restored}));if(!report.restored)process.exitCode=1;
 }
}
main().catch(e=>{console.error(e.message);process.exitCode=1});

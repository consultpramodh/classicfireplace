// JavaScript / Node.js: targeted read-only diagnostics; no business mutations.
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

 const sidContent=await api(base+'projects/'+sid+'/content');
 fs.mkdirSync('pi-audit-evidence',{recursive:true});
 fs.writeFileSync('pi-audit-evidence/source-before.json',JSON.stringify(sidContent));
 const helper=`
function tmv3_candidateOrderAudit20261026() {
 const cfg=TMV3.VERTICALS.PreInspection, records=[];
 const start=new Date();start.setHours(0,0,0,0);const end=new Date(start);end.setDate(end.getDate()+365);
 const orders=tmv3_rows_(TMV3.SHEETS.ORDERS);
 const cal=CalendarApp.getCalendarById(cfg.secondaryCalendarIds[0]);
 cal.getEvents(start,end).forEach(function(event){
  const r=tmv3_calendarEvent_('PreInspection',cfg,{calendarId:cfg.secondaryCalendarIds[0],calendarName:'Stephen',role:'SECONDARY_STEPHEN'},event,{applyEligibility:false});
  const decision=tmv3_preInspectionDiscoveryDecision_(r,cfg);
  if(decision.status!=='REVIEW_VISIT_TYPE')return;
  const matches=orders.filter(function(o){return r.orderNumber&&String(o['Order Number'])===String(r.orderNumber)&&o['Type']==='SALES_ORDER';});
  let live=null;
  if(r.orderNumber){
   const found=tmv3_fetchJson_(TMV3.API_BASE+'/v1/sales-orders/search',{method:'post',contentType:'application/json',payload:JSON.stringify({PageIndex:0,PageSize:2,Number:String(r.orderNumber)})});
   const data=found&&(found.Data||found.data);
   if(data&&data.length===1&&String(data[0].Number)===String(r.orderNumber)){
    const o=tmv3_fetchJson_(TMV3.API_BASE+'/v1/sales-orders/'+data[0].Id,{method:'get'});
    live={id:o.Id,number:o.OrderNumber,status:o.Status,customer:o.Customer,location:o.ShipToLocation,name:o.OrderName};
   }else live={status:'ORDER_NOT_UNIQUE',search:found};
  }
  records.push({record:r,decision:decision,cachedOrders:matches,liveOrder:live});
 });
 return {at:new Date().toISOString(),candidates:records,budget:tmv3_strivenApiBudgetStatus_()};
}
`;
 const work={files:sidContent.files.map(f=>f.name==='90_Admin'?{...f,source:f.source+'\n'+helper}:f)};
 const crypto=require('node:crypto'); const hash=o=>crypto.createHash('sha256').update(JSON.stringify(o.files.map(f=>({name:f.name,type:f.type,source:f.source})).sort((a,b)=>a.name.localeCompare(b.name)))).digest('hex');
 async function put(content){const r=await fetch(base+'projects/'+sid+'/content',{method:'PUT',headers:{Authorization:'Bearer '+a.access_token,'Content-Type':'application/json'},body:JSON.stringify({files:content.files}),redirect:'error'});if(!r.ok)throw Error('SOURCE_PUT_'+r.status);return r.json();}
 let attempted=false;
 try {
  if(hash(await api(base+'projects/'+sid+'/content'))!==hash(sidContent))throw Error('PRE_SOURCE_DRIFT');
  attempted=true;await put(work);
  if(hash(await api(base+'projects/'+sid+'/content'))!==hash(work))throw Error('HELPER_READBACK_FAILED');
  const out=await run('tmv3_candidateOrderAudit20261026');
  fs.writeFileSync('pi-audit-evidence/result.json',JSON.stringify(out,null,2));
  console.log(JSON.stringify(out));
 }finally{
  if(attempted){const current=await api(base+'projects/'+sid+'/content');
   if(hash(current)===hash(work))await put(sidContent);
   if(hash(await api(base+'projects/'+sid+'/content'))!==hash(sidContent))throw Error('SOURCE_RESTORE_NOT_VERIFIED');
   console.log('ORIGINAL_SOURCE_RESTORED_VERIFIED');
  }
 }
})().catch(e=>{console.error(e.message);process.exitCode=1;});

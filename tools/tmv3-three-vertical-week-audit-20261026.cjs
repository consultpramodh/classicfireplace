// JavaScript / Node.js: bounded read-only weekly audit; no business mutations or source changes.
'use strict';
const {profiles}=require('./tmv3-execution-access-diagnostic.js');
(async()=>{
const ps=profiles(JSON.parse(process.env.CLASPRC_JSON||'{}'));if(ps.length!==1)throw Error('ONE_PROFILE');const p=ps[0];
const ar=await fetch('https://oauth2.googleapis.com/token',{method:'POST',body:new URLSearchParams({grant_type:'refresh_token',client_id:p.client,client_secret:p.secret,refresh_token:p.refresh})});if(!ar.ok)throw Error('AUTH');const a=await ar.json();
async function api(url,body){const r=await fetch(url,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+a.access_token,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(650000)});if(!r.ok)throw Error('HTTP_'+r.status);return r.json();}
const base='https://script.googleapis.com/v1/',sid='1shaSL1CeNhR2-fr8H4x0fP2KUIjpOizLFyrNRAnGGXkCvERX4hZyJ5Gt';
const inv=await api(base+'projects/'+sid+'/deployments'),ds=inv.deployments.filter(d=>(d.entryPoints||[]).some(e=>e.entryPointType==='EXECUTION_API'||e.executionApi));if(ds.length!==1)throw Error('DEPLOYMENT');
async function run(fn,parameters=[]){const r=await api(base+'scripts/'+encodeURIComponent(ds[0].deploymentId)+':run',{function:fn,parameters,devMode:true});if(r.error||!r.done)throw Error(JSON.stringify(r.error));return r.response.result;}
console.log(JSON.stringify({health:await run('tmv3_healthCheck'),sweeps:await run('tmv3_fullVerticalSweepStatus')}));
console.log(JSON.stringify({refresh:await run('tmv3_refreshAutomationSheets')}));
for(const v of ['Install','Delivery','Service']){
const r=await api('https://sheets.googleapis.com/v4/spreadsheets/1Rxo2t3QjlC7TFWNc3kQ8A2foBAxM0l0VcEtRh4fkU2E/values/'+v+'!A1:AZ');
const [headers,...rows]=r.values||[];console.log(JSON.stringify({vertical:v,headers,total:rows.length}));
const selected=rows.map(row=>Object.fromEntries(headers.map((h,i)=>[h,row[i]||'']))).filter(row=>{const s=row['Calendar Start'];return s>='2026-10-26'&&s<'2026-11-02';});
console.log(JSON.stringify({vertical:v,weekly: selected.map(row=>Object.fromEntries(Object.entries(row).filter(([h])=>!/name|phone|address|description|notes|title|email|customer|requested by/i.test(h))))}));
for(let i=0;i<selected.length;i+=4){const ids=selected.slice(i,i+4).map(row=>row['Event ID']);console.log(JSON.stringify({vertical:v,diagnostics:await run('tmv3_verticalPatchDiagnostics',[v,ids])}));}
}
})().catch(e=>{console.error(e.message);process.exitCode=1;});

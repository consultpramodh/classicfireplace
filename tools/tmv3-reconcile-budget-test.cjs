// JavaScript / Node.js: read-only reconciliation after uncertain execution.
'use strict';
const {profiles}=require('./tmv3-execution-access-diagnostic.js');
(async()=>{
const p=profiles(JSON.parse(process.env.CLASPRC_JSON))[0];
const ar=await fetch('https://oauth2.googleapis.com/token',{method:'POST',body:new URLSearchParams({grant_type:'refresh_token',client_id:p.client,client_secret:p.secret,refresh_token:p.refresh})});if(!ar.ok)throw Error('AUTH_FAILED');const a=await ar.json();
const get=async url=>{const r=await fetch(url,{headers:{Authorization:'Bearer '+a.access_token},redirect:'error'});if(!r.ok)throw Error('READ_HTTP_'+r.status);return r.json();};
const sid='1Rxo2t3QjlC7TFWNc3kQ8A2foBAxM0l0VcEtRh4fkU2E',base='https://sheets.googleapis.com/v4/spreadsheets/'+sid;
const meta=await get(base+'?fields=sheets(properties)');const audit=meta.sheets.find(s=>s.properties.title==='TM Audit');if(!audit)throw Error('AUDIT_TAB_MISSING');
console.log(JSON.stringify({auditMetadata:audit.properties}));
const rows=await get(base+'/values/'+encodeURIComponent("'TM Audit'!A1:L"+Math.min(4000,audit.properties.gridProperties.rowCount)));
console.log(JSON.stringify({auditHeader:(rows.values||[])[0],recentAudit:(rows.values||[]).slice(-30)}));
const cal='c_3088a3989f3eb809957ed5c40137a7111a0ac97f68c29b40c144028cb14320dc@group.calendar.google.com';
const event=await get('https://www.googleapis.com/calendar/v3/calendars/'+encodeURIComponent(cal)+'/events/456nv1pujrb3eo7ielg2enj0ll');
console.log(JSON.stringify({fridayEvent:{id:event.id,summary:event.summary,start:event.start,end:event.end,description:event.description,updated:event.updated}}));
})().catch(e=>{console.error(e.message);process.exitCode=1;});

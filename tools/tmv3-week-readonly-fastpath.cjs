// JavaScript / Node.js: avoid replaying mutation machinery for already-aligned weekly records.
'use strict';
function patch(source){
const anchor="        const enriched=tmv3_verticalEnrichEvidence_(vertical,record,plans);";
if(source.split(anchor).length!==2||source.includes('function tmv3_weeklyAlreadyAligned_('))throw Error('FASTPATH_SOURCE_DRIFT');
source=source.replace(anchor,`        const held=JSON.parse(props.getProperty(key)||'null');
        if(weekScope && !(held && ['INTENT','UNCERTAIN'].indexOf(held.state)>=0) && tmv3_weeklyAlreadyAligned_(record,plans)) {
          result.results.push({eventId:id,status:'ALREADY_ALIGNED_READ_ONLY',taskIds:plans.map(function(p){return p.taskId;}),freshTaskReads:true,clickableLinksVerified:true,businessWrites:0});continue;
        }
`+anchor);
const countAnchor="if(outcome.status==='VERIFIED_CONVERGENCE'||outcome.status==='FULFILLED_NO_RECREATE')state.verified++;";
if(source.split(countAnchor).length!==2)throw Error('COUNT_ANCHOR_DRIFT');
source=source.replace(countAnchor,"if(outcome.status==='VERIFIED_CONVERGENCE'||outcome.status==='FULFILLED_NO_RECREATE'||outcome.status==='ALREADY_ALIGNED_READ_ONLY')state.verified++;");
source+=`
// Google Apps Script: zero business writes; preserve correct clickable Calendar blocks.
function tmv3_weeklyAlreadyAligned_(record,plans) {
  if(!record||['Install','Delivery','Service'].indexOf(record.vertical)<0||!plans||!plans.length)return false;
  if(!plans.every(function(p){return p.taskId && p.readStatus==='FRESH_TASK_GET' && p.plan==='NO_CHANGE' && !p.blocker && p.inputFingerprint===record.fingerprint && p.customerCheck==='MATCH' && p.orderCheck==='MATCH' && p.locationCheck==='MATCH' && (p.actions||[]).every(function(a){return a==='VERIFY_CALENDAR_LINKS';});}))return false;
  const cfg=TMV3.VERTICALS[record.vertical],taskIds=plans.map(function(p){return String(p.taskId);}).sort();
  if(taskIds.some(function(id,i){return i>0&&id===taskIds[i-1];}))return false;
  const required=taskIds.map(function(id){return TMV3.TASK_URL_BASE+id;});
  if(cfg.calendarOrderLinkRequired){const orderIds=plans.map(function(p){return String(p.expectedOrderId||'');});if(!orderIds[0]||!orderIds.every(function(id){return id===orderIds[0];}))return false;required.push(TMV3.ORDER_URL_BASE+orderIds[0]);}
  const ids=tmv3_requiredCalendarCopiesForEvent_(record);if(!ids.length)return false;
  return ids.every(function(calendarId){
    const found=tmv3_findEventCopyRobust_(calendarId,record.eventId);if(!found||!found.event)return false;
    const description=String(found.event.getDescription()||''),hrefs=[];let m;const rx=/<a\\b[^>]*\\bhref\\s*=\\s*["']([^"']+)["'][^>]*>/gi;
    while((m=rx.exec(description))!==null)hrefs.push(m[1].replace(/&amp;/g,'&'));
    if(!required.every(function(url){return hrefs.filter(function(h){return h===url;}).length===1;}))return false;
    const actualTasks=hrefs.filter(function(h){return h.indexOf(TMV3.TASK_URL_BASE)===0;}).map(function(h){return h.slice(TMV3.TASK_URL_BASE.length);}).sort();
    return JSON.stringify(actualTasks)===JSON.stringify(taskIds);
  });
}
function tmv3_weeklyVerticalRepairStatus(vertical,fromDay,toDay) {
  const s=tmv3_verticalRepairScope_(vertical,{fromDay:fromDay,toDay:toDay});
  return JSON.parse(PropertiesService.getScriptProperties().getProperty('TMV3_VERTICAL_SWEEP_'+vertical+'_RANGE_'+s.fromDay+'_'+s.toDay)||'null');
}
`;
return source;
}
module.exports={patch};

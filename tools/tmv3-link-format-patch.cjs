// JavaScript / Node.js: preserve vertical link layouts and use clickable links with real Task names.
'use strict';
function patch(files){
files=JSON.parse(JSON.stringify(files));
function once(name,from,to){const f=files.find(f=>f.name===name);if(!f||f.source.split(from).length!==2)throw Error('LINK_SOURCE_DRIFT:'+name);f.source=f.source.replace(from,to);}
once('35_CalendarLinks',"function tmv3_managedCalendarDescription_(existingDescription, plan) {", "function tmv3_managedCalendarDescription_(existingDescription, plan) {\n  if(plan && ['Install','Delivery','Service'].indexOf(plan.vertical)>=0)return tmv3_verticalClickableDescription_(existingDescription,plan);");
once('58_Operations',"task:contract.taskId ? String(contract.taskId) : '',", "task:contract.taskId ? (tmv3_clean_(contract.desiredTaskName || contract.actualTaskName) || String(contract.taskId)) : '',\n    order:tmv3_clean_(eventRecord.orderNumber),");
once('60_Automation',"  const weekScope=tmv3_verticalRepairScope_(vertical,options);", "  const weekScope=tmv3_verticalRepairScope_(vertical,options);\n  const targetIds=options.eventIds||null;\n  if(targetIds && (!Array.isArray(targetIds)||!targetIds.length||targetIds.some(function(id){return typeof id!=='string'||!id;})))throw Error('TARGET_IDS_REQUIRED');");
once('60_Automation',"const stateKey='TMV3_VERTICAL_SWEEP_'+vertical+(weekScope ? '_RANGE_'+weekScope.fromDay+'_'+weekScope.toDay : '');", "const stateKey='TMV3_VERTICAL_SWEEP_'+vertical+(weekScope ? '_RANGE_'+weekScope.fromDay+'_'+weekScope.toDay : '')+(targetIds?'_TARGET_'+tmv3_hash_(targetIds.slice().sort().join('|')):'');");
once('60_Automation',"if(!id||seen[id]||!day||day<(weekScope ? weekScope.fromDay : today)","if(!id||seen[id]||targetIds && targetIds.indexOf(id)<0||!day||day<(weekScope ? weekScope.fromDay : today)");
once('60_Automation',"if(weekScope && !(held", "if(weekScope && !options.forceLinkFormat && !(held");
once('60_Automation',"        const taskIds=[];", "        if(options.forceLinkFormat && plans.some(function(p){return !p.taskId||(p.actions||[]).some(function(a){return a!=='VERIFY_CALENDAR_LINKS';});})){result.results.push({eventId:id,status:'REVIEW',error:'LINK_FORMAT_ONLY_OTHER_CHANGES_REQUIRE_SEPARATE_REPAIR'});continue;}\n        const taskIds=[];");
files.find(f=>f.name==='60_Automation').source+=`
// Google Apps Script: restore presentation only on records touched by this repair session.
function tmv3_linkFormatRepairTargets() {
  const rows=tmv3_sheet_(TMV3.SHEETS.AUDIT).getDataRange().getValues(),out={Install:[],Delivery:[],Service:[]};
  rows.slice(1).forEach(function(row){const at=new Date(row[0]).getTime(),v=String(row[1]||''),id=String(row[2]||'');if(at>=Date.parse('2026-10-26T20:26:00Z')&&at<Date.parse('2026-10-26T20:50:00Z')&&out[v]&&row[4]==='STEP7_ALL'&&row[5]==='PASS'&&id&&out[v].indexOf(id)<0)out[v].push(id);});
  return out;
}
function tmv3_runLinkFormatRepair(vertical,eventIds) {
  if(['Install','Delivery','Service'].indexOf(vertical)<0||!Array.isArray(eventIds)||!eventIds.length)throw Error('FORMAT_REPAIR_SCOPE_REQUIRED');
  return tmv3_verticalProductionCycle_(vertical,{fromDay:'2026-10-26',toDay:'2026-11-02',eventIds:eventIds,forceLinkFormat:true});
}
`;
const links=files.find(f=>f.name==='35_CalendarLinks');
links.source+='\n'+require('fs').readFileSync(__dirname+'/tmv3-link-format-helper.gs','utf8');
return files;
}
module.exports={patch};

// JavaScript / Node.js: patch only real top-level legacy link writers, never inert replacement strings.
'use strict';
const fs=require('node:fs'),vm=require('node:vm');
const specs=[
 ['35_PreInspect_Task_Review','preinspectR3412RefreshExistingManagedCalendarLink_', 'eventId','taskId'],
 ['35_PreInspect_Task_Review','preinspectR3418fSyncHandledTaskLinkToCalendar_',null,null],
 ['35_PreInspect_Task_Review','preinspectR3420SyncCalendarLink_','rec && rec.event && rec.event.getId()','taskId'],
 ['36_PreInspect_Task_Create','preinspectAppendTaskLinkToCalendarEvent_','eventId','taskId'],
 ['98_12_PreInspect_Dual_Calendar_Task_Link_R1','tmPreInspectEnsureCalendarTaskLinkOne_','eventId','taskId'],
 ['98_7_Systemic_Repair_R1','tmSystemicWritePreInspectCalendarTaskLink_','eventId','taskId']
];
function patch(source,helper){
 const work=JSON.parse(JSON.stringify(source)),changed=[];
 for(const [file,name,eid,tid] of specs){
  const f=work.files.find(f=>f.name===file);if(!f)throw Error('MISSING_FILE:'+file);
  const rx=new RegExp('^function '+name+'\\([^)]*\\)\\s*\\{','gm');const matches=[...f.source.matchAll(rx)];
  if(matches.length!==1)throw Error('EXPECTED_ONE_REAL_FUNCTION:'+name+':'+matches.length);
  if(f.source.includes('const v3CanonicalOwner_'+name))throw Error('ALREADY_PATCHED');
  let at=matches[0].index+matches[0][0].length;
  if(!eid){
   const anchor="  const eventId = String(row['Event ID'] || '').trim();";
   const end=f.source.indexOf('\nfunction ',at);const ix=f.source.indexOf(anchor,at);
   if(ix<0 || (end>=0 && ix>end))throw Error('CONTEXT_GUARD_ANCHOR_MISSING');at=ix+anchor.length;
  }
  const varname='v3CanonicalOwner_'+name;
  const guard='\n  const '+varname+'=preinspectV3CanonicalLinkOwner_('+(eid||'eventId')+','+(tid||'resolved.taskId')+');\n  if('+varname+')return '+varname+';\n';
  f.source=f.source.slice(0,at)+guard+f.source.slice(at);
  if(!changed.includes(file))changed.push(file);
 }
 const target=work.files.find(f=>f.name==='98_12_PreInspect_Dual_Calendar_Task_Link_R1');
 target.source+='\n'+helper+'\n';
 for(const f of work.files)if(f.type==='SERVER_JS')new vm.Script(f.source,{filename:f.name});
 return {work,changed,specs};
}
module.exports={patch,specs};

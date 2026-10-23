// JavaScript / Node.js: real legacy function entrypoints must yield without Calendar/Striven writes.
'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const {specs}=require('./patch-preinspect-v3-link-owner.cjs');
const dir=process.env.PREINSPECT_TEST_SOURCE_DIR;let cases=0;const eq=(a,b)=>{assert.deepEqual(a,b);cases++;};
const helper=fs.readFileSync(path.join(__dirname,'preinspect-v3-link-owner.gs'),'utf8');
const direct='https://classicfireplace.striven.com/Tasks/TaskInfo.aspx?TaskID=123';
const canonical='Human notes<br>-----Striven Links-----<br><a href="https://classicfireplace.striven.com/next/crm#/sales-orders?accountId=1">View Sales Orders</a><br><a href="'+direct+'">Task #123</a>';
let descriptions=[canonical,canonical],mutations=0;
const c={Date,JSON,Object,String,Number,Math,Error,decodeURIComponent,Logger:{log(){}},
 TM_PREINSPECT_DUAL_CALENDAR_R1:{GROUP_CALENDAR_ID:'group',STEPHEN_CALENDAR_ID:'stephen'},
 tmPreInspectFindCalendarEventById_:(calendarId)=>({event:{getDescription:()=>descriptions[calendarId==='group'?0:1],setDescription:()=>mutations++}})};
vm.createContext(c);vm.runInContext(helper,c);
eq(c.preinspectV3CanonicalLinkOwner_('event',123).status,'V3_CANONICAL_LINK_PRESERVED');eq(c.preinspectV3CanonicalLinkOwner_('event',123).readBackVerified,true);eq(mutations,0);
const wrapped=canonical.replace(direct,'https://www.google.com/url?q='+encodeURIComponent(direct)+'&amp;sa=D');
for(const text of [canonical,wrapped,canonical.replace('TaskID=','TaskID%3D'),canonical.replace(direct,'https://www.google.com/url?url='+encodeURIComponent(encodeURIComponent(direct)))]){descriptions=[text,text];eq(c.preinspectV3CanonicalLinkOwner_('event',123).readBackVerified,true);}
for(const text of [canonical.replace('TaskID=123','TaskID=1234'),canonical.replace('classicfireplace.striven.com/Tasks','evil.invalid/Tasks'),canonical.replace(direct,'https://www.google.com/url?q='+encodeURIComponent('https://evil.invalid/?TaskID=123')),canonical+'<br>------- Pre-Inspection Task Link -------',canonical+'<br><a href="'+direct+'">Duplicate</a>']){descriptions=[text,text];eq(c.preinspectV3CanonicalLinkOwner_('event',123).status,'DEFERRED_TO_V3_CANONICAL_LINK_REVIEW');eq(c.preinspectV3CanonicalLinkOwner_('event',123).calendarWritesPerformed,false);}
descriptions=['Human notes','Human notes'];eq(c.preinspectV3CanonicalLinkOwner_('event',123),null);eq(c.preinspectV3CanonicalLinkOwner_('',123),null);eq(c.preinspectV3CanonicalLinkOwner_('event',0),null);
descriptions=[canonical,'Human notes'];eq(c.preinspectV3CanonicalLinkOwner_('event',123).readBackVerified,false);
descriptions=[canonical,canonical];eq(c.verifyPreinspectV3CanonicalLinkOwnership('event',123).writesPerformed,false);
if(dir){
 for(const [file,name] of specs){
  const s=fs.readFileSync(path.join(dir,file+'.js'),'utf8');const rx=new RegExp('^function '+name+'\\([^)]*\\)\\s*\\{','m');const m=rx.exec(s);assert(m);cases++;
  const tail=s.slice(m.index);const close=/^\}/m.exec(tail);assert(close);const fn=tail.slice(0,close.index+1);
  const sandbox={preinspectV3CanonicalLinkOwner_:()=>({status:'OWNER_GUARD',calendarWritesPerformed:false}),preinspectR3418fResolveHandledTaskContext_:()=>({row:{'Event ID':'event'},taskId:123}),String,Number,Object,Error};
  vm.createContext(sandbox);vm.runInContext(fn,sandbox);
  const r=name==='preinspectR3418fSyncHandledTaskLinkToCalendar_'?sandbox[name]({}):name==='preinspectR3420SyncCalendarLink_'?sandbox[name]({event:{getId:()=>'event'}},123):name==='tmPreInspectEnsureCalendarTaskLinkOne_'?sandbox[name]('group','event',123,'Title','GROUP'):sandbox[name]('event',123,'Title');
  eq(r.status,'OWNER_GUARD');eq(r.calendarWritesPerformed,false);
 }
}
console.log('PASS: '+cases+' legacy canonical-owner compatibility and actual writer-entry cases');

// JavaScript (Node.js): isolated sweep-orchestration regression; no live Apps Script writes.
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const automation = fs.readFileSync(path.join(__dirname, '../apps-script/tmv3-clean/60_Automation.js'), 'utf8');
function extract(start, end) {
  const a = automation.indexOf(start), b = automation.indexOf(end, a + start.length);
  assert(a >= 0 && b > a, 'Missing source block: ' + start);
  return automation.slice(a, b);
}
const source = extract('function tmv3_preInspectionSweepKey_(', '\nfunction tmv3_runPreInspectionAutomation()') +
 '\n' + extract('function tmv3_preInspectionCheck0800()', '\nfunction tmv3_installPreInspectionAutomationTrigger()');
const records = Array.from({length:8}, (_, i) => ({
  eventId:'test-event-'+(i+1), start:new Date(Date.UTC(2026,9,21,12+i)),
  fingerprint:'fp-'+i, calendarRole:'PRIMARY_SHARED'
}));
const properties = {}, triggers = [], logs = [];
let totalNotifications = 0, alerts = 0, locksBusy = false, blocked = false;
const mock = {
 TMV3_STEP7_ACTION:{CREATE_TASK:'CREATE_TASK',RECREATE_TASK:'RECREATE_TASK',VERIFY_CALENDAR_LINKS:'VERIFY_CALENDAR_LINKS'},
 TMV3:{OPERATIONS:{preInspectionAutomationMaxEventsPerRun:3,preInspectionAutomationScheduleHours:[8,13,17],preInspectionAutomationCanaryEventId:''}},
 LockService:{getScriptLock:()=>({tryLock:()=>!locksBusy,releaseLock:()=>{}})},
 PropertiesService:{getScriptProperties:()=>({getProperty:k=>properties[k]||null,setProperty:(k,v)=>properties[k]=v})},
 ScriptApp:{
  getProjectTriggers:()=>triggers.map(t=>({...t,getHandlerFunction:()=>t.handler})),
  deleteTrigger:t=>{const i=triggers.findIndex(v=>v.handler===t.handler);if(i>=0)triggers.splice(i,1);},
  newTrigger:handler=>{const t={handler};const b={
   timeBased:()=>b,after:n=>(t.delay=n,b),create:()=>{triggers.push(t);return t;}
  };return b;}
 },
 Logger:{log:s=>logs.push(s)},
 tmv3_operationWritesEnabled_:()=>true,
 tmv3_refreshOperationalSourcesIfNeeded_:()=>({status:'FRESH'}),
 tmv3_preInspectionIntakeRecords_:()=>records,
 tmv3_clean_:x=>String(x||''),
 tmv3_preInspectionSendMissingDetails_:()=>{totalNotifications++;return {status:'NO_MISSING_DETAILS',sent:0};},
 tmv3_restorePreInspectionLegacyTitle_:()=>({writes:0}),
 tmv3_hash_:x=>x,
 tmv3_preInspectionPromoteCandidate_:r=>({status:'PRIMARY',record:r}),
 tmv3_step7FreshPlansForEvent_:()=>[blocked?
   {plan:'NEEDS_REVIEW',blocker:'AMBIGUOUS_LOCATION',taskId:'',actions:[]}:
   {plan:'NO_CHANGE',blocker:'',taskId:'123',actions:[]}],
 tmv3_findFreshEventRecord_:(_,id)=>records.find(r=>r.eventId===id),
 tmv3_preInspectionCompletionVerified_:()=>!blocked,
 tmv3_audit_:()=>{},
 tmv3_preInspectionFailureAlert_:()=>{alerts++;}
};
const api = new Function('ctx','with(ctx){'+source+
 '\nreturn {daily:tmv3_runPreInspectionDailySlot_,worker:tmv3_preInspectionContinueEligibleSweep};}')(mock);
const a=api.daily('08:00');
assert.equal(a.processed,3);assert.equal(a.sweep.remaining,5);
assert.equal(triggers.length,1);assert.equal(triggers[0].delay,120000);
const b=api.worker();
assert.equal(b.processed,3);assert.equal(b.sweep.remaining,2);
assert.equal(triggers.length,1,'exactly one continuation');
const c=api.worker();
assert.equal(c.processed,2);assert.equal(c.sweep.remaining,0);
assert.equal(c.sweep.status,'COMPLETE');assert.equal(triggers.length,0,'no orphan trigger');
assert.equal(c.sweep.attempted,8);
assert.equal(totalNotifications,16,'8 initial scans plus 8 per-event safety checks; no repeated full scan');
assert.ok(logs.every(s=>s.length<2000),'compact logging');
properties.TMV3_PI_SWEEP_STATE=JSON.stringify({
 status:'IN_PROGRESS',startedAt:new Date().toISOString(),lastKey:'',processed:0
});
locksBusy=true;
const retry=api.daily('13:00');
assert.equal(retry.status,'LOCK_BUSY');assert.equal(triggers.length,1,'lock contention is retried');
locksBusy=false;
const resume=api.worker();
assert.equal(resume.status,'COMPLETE');
assert.equal(resume.sweep.status,'IN_PROGRESS');
mock.TMV3.OPERATIONS.preInspectionAutomationCanaryEventId='test-event-1';
const canary=api.daily('17:00');
assert.equal(canary.status,'SWEEP_BLOCKED_BY_CANARY_SCOPE');
mock.TMV3.OPERATIONS.preInspectionAutomationCanaryEventId='';
// Every event now requires a distinct task write. One write per cycle must
// force an eight-batch sweep; later records must not be skipped.
Object.keys(properties).filter(k=>k.startsWith('TMV3_PI_DONE_') ||
  k==='TMV3_PI_SWEEP_STATE' || k==='TMV3_PI_PENDING_EVENTS').forEach(k=>delete properties[k]);
let dirty=new Set(records.map(r=>r.eventId)),transactions=0,batches=0;
mock.tmv3_step7FreshPlansForEvent_=(_,id)=>[dirty.has(id)?
 {vertical:'PreInspection',eventId:id,plan:'PATCH_EXISTING',blocker:'',taskId:'123',actions:['PATCH_DATES']}:
 {vertical:'PreInspection',eventId:id,plan:'NO_CHANGE',blocker:'',taskId:'123',actions:[]}];
mock.tmv3_executeFreshStep7Selection_=(selection)=>{
 const id=selection.contract.eventId;
 assert.ok(dirty.has(id),'write must be for an unresolved event');
 dirty.delete(id);transactions++;
 return {status:'VERIFIED_CONVERGENCE'};
};
let final;
do{
 final=(batches===0?api.daily('08:00'):api.worker());
 batches++;
 assert.ok(batches<=12,'sweep did not converge within one batch per event');
 assert.ok(final.writes<=1,'write cap breached');
 if(final.sweep.remaining)assert.equal(triggers.length,1,'continuation must exist');
}while(final.sweep.remaining);
assert.equal(batches,8,'one write per batch for eight actionable events');
assert.equal(transactions,8,'all actionable events have been updated');
assert.equal(dirty.size,0,'no skipped records');
assert.equal(final.sweep.status,'COMPLETE');
assert.equal(final.sweep.remaining,0);
assert.equal(triggers.length,0,'all continuations removed');
console.log('PASS: complete 8-event scan in 3 batches; 8 actionable events in 8 one-write batches; no skips, no orphan triggers, canary/lock safety');

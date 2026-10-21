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
assert.equal(totalNotifications,8,'no full notification rescan in continuation');
assert.ok(logs.every(s=>s.length<2000),'compact logging');
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
console.log('PASS: 8 eligible in 3 batches, one continuation, complete cursor, 8 one-time notification checks, compact logs, lock retry, canary gate');

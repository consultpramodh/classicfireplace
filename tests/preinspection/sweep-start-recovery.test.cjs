// Node.js: tests Preinspection scheduled-sweep recovery with isolated services.
'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('apps-script/tmv3-clean/60_Automation.js','utf8');
let state={},calls=[],result='LOCK_BUSY',scheduled=0;
const props={getProperty:k=>state[k]||null,setProperty:(k,v)=>state[k]=v,deleteProperty:k=>delete state[k]};
const c={PropertiesService:{getScriptProperties:()=>props},tmv3_preInspectionClearContinuationTrigger_:()=>{},tmv3_preInspectionAutomationCycle_:o=>{calls.push(o);return {status:result}},tmv3_preInspectionMaybeContinueSweep_:r=>{if(r.status==='LOCK_BUSY')scheduled++},tmv3_preInspectionLogSweep_:()=>{},tmv3_refreshAutomationSheetsAfter_:()=>({})};
vm.createContext(c);vm.runInContext(source,c);
c.tmv3_preInspectionAutomationCycle_=o=>{calls.push(o);return {status:result}};c.tmv3_preInspectionMaybeContinueSweep_=r=>{if(r.status==='LOCK_BUSY')scheduled++};c.tmv3_preInspectionLogSweep_=()=>{};c.tmv3_refreshAutomationSheetsAfter_=()=>({});
c.tmv3_runPreInspectionDailySlot_('08:00');assert.equal(state.TMV3_PI_RETRY_SWEEP_START,'1');assert.equal(scheduled,1);
assert.equal(c.tmv3_preInspectionContinueEligibleSweep().status,'RETIRED_OUTSIDE_STANDARD_SLOTS');assert.equal(calls.length,1);
result='COMPLETE';c.tmv3_runPreInspectionDailySlot_('13:00');assert.equal(calls[1].sweepStart,true);
console.log('PASS: lock busy waits for the next slot; legacy continuation cannot run out of hours');

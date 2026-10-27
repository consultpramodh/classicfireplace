// Node.js: tests Preinspection scheduled-sweep recovery with isolated services.
'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('apps-script/tmv3-clean/60_Automation.js','utf8');
const match=source.match(/function tmv3_preInspectionContinueEligibleSweep\(\) \{[\s\S]*?\n\}\nfunction tmv3_runPreInspectionDailySlot_\(slot\) \{[\s\S]*?\n\}/);
assert.ok(match,'recovery functions not found');
let state={},calls=[],result='LOCK_BUSY',scheduled=0;
const props={getProperty:k=>state[k]||null,setProperty:(k,v)=>state[k]=v,deleteProperty:k=>delete state[k]};
const c={PropertiesService:{getScriptProperties:()=>props},tmv3_preInspectionClearContinuationTrigger_:()=>{},tmv3_preInspectionAutomationCycle_:o=>{calls.push(o);return {status:result}},tmv3_preInspectionMaybeContinueSweep_:r=>{if(r.status==='LOCK_BUSY')scheduled++},tmv3_preInspectionLogSweep_:()=>{},tmv3_refreshAutomationSheetsAfter_:()=>({})};
vm.createContext(c);vm.runInContext(match[0],c);
c.tmv3_runPreInspectionDailySlot_('08:00');assert.equal(state.TMV3_PI_RETRY_SWEEP_START,'1');assert.equal(scheduled,1);
c.tmv3_preInspectionContinueEligibleSweep();assert.equal(calls[1].sweepStart,true);assert.equal(state.TMV3_PI_RETRY_SWEEP_START,'1');assert.equal(scheduled,2);
result='COMPLETE';c.tmv3_preInspectionContinueEligibleSweep();assert.equal(calls[2].sweepStart,true);assert.equal(state.TMV3_PI_RETRY_SWEEP_START,undefined);
c.tmv3_preInspectionContinueEligibleSweep();assert.equal(calls[3].sweepContinue,true);
state={};c.tmv3_runPreInspectionDailySlot_('13:00');assert.equal(state.TMV3_PI_RETRY_SWEEP_START,undefined);
console.log('PASS: busy start, repeated busy, successful restart, ordinary continuation, successful slot');

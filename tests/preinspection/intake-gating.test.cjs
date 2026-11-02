'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const src = fs.readFileSync(path.join(__dirname,'../../apps-script/tmv3-clean/60_Automation.js'),'utf8');
const start = src.indexOf('function tmv3_preInspectionAutomationCycle_(options)');
const end = src.indexOf('\nfunction tmv3_runPreInspectionAutomation()',start);
assert(start >= 0 && end > start);
let scans=0, targets=0, released=0, budget={exhausted:true,remaining:0,date:'test',count:100,softLimit:100};
let last=String(Date.now());
const props={getProperty:k=>k==='TMV3_PI_LAST_CYCLE'?last:null,setProperty:()=>{},deleteProperty:()=>{}};
const ctx={Date,JSON,Math,Number,String,TMV3:{OPERATIONS:{preInspectionAutomationIntervalMinutes:5}},
  TMV3_PREINSPECTION_API_CONTEXT_ACTIVE:false,
  tmv3_operationWritesEnabled_:()=>true,tmv3_clean_:x=>x||'',
  LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock:()=>released++})},
  PropertiesService:{getScriptProperties:()=>props},
  tmv3_strivenApiBudgetStatus_:()=>budget,tmv3_audit_:()=>{},tmv3_listTriggers:()=>[],
  tmv3_preInspectionFailureAlert_:()=>{},tmv3_preInspectionDiscoveryStatus:()=>({}),
  tmv3_preInspectionIntakeRecords_:()=>{scans++;return []},
  tmv3_preInspectionTargetedIntake_:()=>{targets++;return []},
  tmv3_refreshOperationalSourcesIfNeeded_:()=>{}};
vm.createContext(ctx);vm.runInContext(src.slice(start,end),ctx);
assert.equal(ctx.tmv3_preInspectionAutomationCycle_({force:true}).status,'API_BUDGET_WAIT');
assert.equal(ctx.tmv3_preInspectionAutomationCycle_({force:true,eventId:'x@google.com'}).status,'API_BUDGET_WAIT');
budget={exhausted:false,remaining:100};
assert.equal(ctx.tmv3_preInspectionAutomationCycle_({}).status,'THROTTLED');
assert.equal(scans,0);assert.equal(targets,0);assert.equal(released,3);
last='0';
assert.equal(ctx.tmv3_preInspectionAutomationCycle_({force:true}).status,'COMPLETE');
assert.equal(scans,1);
assert.equal(ctx.tmv3_preInspectionAutomationCycle_({force:true,eventId:'x@google.com'}).status,'COMPLETE');
assert.equal(targets,1);
console.log('PASS: budget and throttle avoid intake; permitted full and targeted runs retain intake');

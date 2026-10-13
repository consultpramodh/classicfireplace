// JavaScript: test the exact temporary permission transform, with no external calls.
const fs=require('node:fs'), vm=require('node:vm'), assert=require('node:assert/strict');
const path=require('node:path');
const runner=fs.readFileSync(path.join(__dirname,'tmv3-shadow-run.js'),'utf8');
const config=fs.readFileSync(path.join(__dirname,'../apps-script/tmv3-clean/00_Config.js'),'utf8');
const start=runner.indexOf("        if (f.name === '00_Config' && RUN_MODE === 'CANARY_TASK_FIRST_19083')");
const end=runner.indexOf('        const shadowModeAnchor',start);
assert.ok(start>=0 && end>start);
function transform(opts={}) {
 const ctx={source:opts.source||config,f:{name:opts.file||'00_Config'},
  RUN_MODE:opts.mode||'CANARY_TASK_FIRST_19083',
  RELEASE_MANIFEST:{taskId:opts.id||19083,vertical:opts.vertical||'Service'},
  fail:m=>{throw Error(m);}};
 vm.runInNewContext(runner.slice(start,end),ctx);
 return ctx.source;
}
const patched=transform();
assert.match(patched,/taskFirstCanaryEnabled: true,/);
for(const flag of ['manualWritesEnabled','automationWritesEnabled','taskFirstProductionEnabled'])
 assert.match(patched,new RegExp(flag+': false,'));
assert.match(patched,/const TMV3_MODE = 'SHADOW_READ_ONLY';/);
assert.equal(transform({mode:'TASK_FIRST_NO_CHANGE'}),config);
assert.equal(transform({file:'58_Operations'}),config);
assert.throws(()=>transform({id:19081}),/exact Task/);
assert.throws(()=>transform({vertical:'Delivery'}),/exact Task/);
for(const [oldValue,newValue] of [
 ['taskFirstCanaryExpectedOrderId: 27648,','taskFirstCanaryExpectedOrderId: 1,'],
 ['taskFirstCanaryExpectedCustomerId: 62860,','taskFirstCanaryExpectedCustomerId: 1,'],
 ['taskFirstCanaryExpectedContactId: 56760,','taskFirstCanaryExpectedContactId: 1,'],
 ['manualWritesEnabled: false,','manualWritesEnabled: true,'],
 ['automationWritesEnabled: false,','automationWritesEnabled: true,'],
 ['taskFirstProductionEnabled: false,','taskFirstProductionEnabled: true,'],
 ['taskFirstCanaryEnabled: false,','taskFirstCanaryEnabled: false, taskFirstCanaryEnabled: false,']]) {
 assert.throws(()=>transform({source:config.replace(oldValue,newValue)}),/anchors changed/);
}
assert.equal(config.includes('taskFirstCanaryEnabled: true,'),false);
console.log('Task-first temporary gate PASS: exact tuple, no broad permissions, drift fails closed.');

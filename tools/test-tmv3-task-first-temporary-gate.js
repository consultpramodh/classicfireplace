// JavaScript: test the exact temporary permission transform, with no external calls.
const fs=require('node:fs'), vm=require('node:vm'), assert=require('node:assert/strict');
const path=require('node:path');
const runner=fs.readFileSync(path.join(__dirname,'tmv3-shadow-run.js'),'utf8');
const config=fs.readFileSync(path.join(__dirname,'../apps-script/tmv3-clean/00_Config.js'),'utf8');
const start=runner.indexOf("        if (f.name === '00_Config' && (RUN_MODE === 'CANARY_TASK_FIRST_19083'");
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
const operations=fs.readFileSync(path.join(__dirname,'../apps-script/tmv3-clean/58_Operations.js'),'utf8');
const delivery=transform({mode:'CANARY_TASK_FIRST_18661',id:18661,vertical:'Delivery'});
for(const pair of [['TaskId',18661],['ExpectedCustomerId',62550],['ExpectedOrderId',26969],['ExpectedContactId',56449]])
 assert.match(delivery,new RegExp('taskFirstCanary'+pair[0]+': '+pair[1]+','));
for(const flag of ['manualWritesEnabled','automationWritesEnabled','taskFirstProductionEnabled']) assert.match(delivery,new RegExp(flag+': false,'));
const deliveryOps=transform({source:operations,file:'58_Operations',mode:'CANARY_TASK_FIRST_18661',id:18661,vertical:'Delivery'});
assert.ok(deliveryOps.includes('Number(policy.taskFirstCanaryTaskId) === 18661'));
assert.throws(()=>transform({mode:'CANARY_TASK_FIRST_18661',id:19083,vertical:'Delivery'}),/exact Task/);
assert.throws(()=>transform({mode:'CANARY_TASK_FIRST_18661',id:18661,vertical:'Service'}),/exact Task/);
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

// Exercise the actual canary endpoint branch and preservation guard.
const wrapperStart=runner.indexOf("    if (body.action === 'taskFirstSingleCanary') {");
const wrapperEnd=runner.indexOf("    if (body.action === 'taskFirstContactProbe')",wrapperStart);
function endpoint(id, drift=false) {
 let reads=0, calls=0;
 const raw={assignments:[{id:18,type:'employee'}],location:{id:58188},
  status:{name:'Open'},description:'preserve',startDateTime:null,dueDateTime:null};
 const ctx={body:{action:'taskFirstSingleCanary',taskId:id},
  tmv3_rawTaskById_:()=>{reads++;return reads===2 && drift?{...raw,description:'changed'}:raw;},
  tmv3_repairExistingTaskRelationships:(task,vertical,expected,scope)=>{
   calls++;assert.equal(task,id);assert.equal(scope,'TASK_FIRST_CANARY');
   assert.equal(vertical,id===18661?'Delivery':'Service');
   assert.equal(expected.orderId,id===18661?'26969':'27648');
   return {status:'PATCHED_AND_VERIFIED',writes:1};
  },tmv3_runtimeMetrics_:()=>({}),TMPV3_shadowResponse_:r=>r};
 const response=vm.runInNewContext('(function(){'+runner.slice(wrapperStart,wrapperEnd)+'})()',ctx);
 return {response,reads,calls};
}
assert.equal(endpoint(18661).response.result.unrelatedFieldsPreserved,true);
assert.equal(endpoint(19083).calls,1);
assert.throws(()=>endpoint(1),/EXACT_TASK/);
assert.throws(()=>endpoint(18661,true),/UNRELATED_FIELDS_CHANGED_NO_RETRY/);
console.log('Delivery canary endpoint PASS: exact task, unrelated fields guarded.');

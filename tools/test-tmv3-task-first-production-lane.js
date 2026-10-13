// V3 P0 task-first production scope: isolated deterministic regression.
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const operations=fs.readFileSync(path.join(__dirname,'../apps-script/tmv3-clean/58_Operations.js'),'utf8');
const automation=fs.readFileSync(path.join(__dirname,'../apps-script/tmv3-clean/60_Automation.js'),'utf8');
const start=operations.indexOf('function tmv3_operationPolicy_()');
const stop=operations.indexOf('function tmv3_selectedContext_()',start);
const begin=automation.indexOf('function tmv3_taskFirstProductionCycle_()');
const end=automation.indexOf('function tmv3_scheduledOperations()',begin);
assert.ok(start>=0&&stop>start&&begin>=0&&end>begin);
const isolated=operations.slice(start,stop)+'\n'+automation.slice(begin,end);
function run(opts={}) {
  const storage={};
  let getCalls=0,patched=0,audits=[];
  const config={
    taskFirstProductionEnabled:opts.enabled!==false,
    manualWritesEnabled:false,automationWritesEnabled:false,
    taskFirstProductionIntervalMinutes:60,
    taskFirstProductionMaxWritesPerRun:1
  };
  const candidate={
    'Task ID':19083,'Task Type':'Service: Clean and Service',
    'Status':opts.cacheDone?'Done':'Open',
    'Order ID':'',
    'Name':'Level 2 - SO#585914 - Don Dwyer'
  };
  const raw={customerId:opts.wrongCustomer?999:62860,orderId:opts.liveOrder||'',
    locationId:58475,requestedById:'',status:'Open'};
  const ctx={
    TMV3:{MODE:opts.mode||'PRODUCTION_WRITE',OPERATIONS:config,
      SHEETS:{TASKS:'TASKS',ORDERS:'ORDERS'},API_BASE:'https://example.invalid'},
    Date,Number,Boolean,String,JSON,Math,Object,encodeURIComponent,
    tmv3_norm_:s=>String(s||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim(),
    tmv3_clean_:s=>String(s===null||s===undefined?'':s).trim(),
    LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock:()=>{}})},
    PropertiesService:{getScriptProperties:()=>({
      getProperty:k=>storage[k]||null,setProperty:(k,v)=>{storage[k]=String(v);}
    })},
    tmv3_rows_:name=>name==='TASKS'?[candidate]:[{'Order Number':'585914','Order ID':'27648'}],
    tmv3_rawTaskById_:()=>{getCalls++;return {...raw};},
    tmv3_normalizeV2TaskModel_:r=>({
      'Status':r.status,'Customer ID':r.customerId,'Order ID':r.orderId,
      'Location ID':r.locationId
    }),
    tmv3_taskIsOpen_:s=>s==='Open',
    tmv3_step7RequestedByFromRaw_:r=>({id:r.requestedById||'',type:''}),
    tmv3_fetchJson_:()=>{getCalls++;return {
      id:27648,customer:{id:opts.orderWrongOwner?7:62860},
      orderNumber:'585914',contact:opts.noContact?null:{id:56760}
    };},
    tmv3_first_:(o,keys)=>{for(const k of keys){if(o&&o[k]!==undefined)return o[k];}return '';},
    tmv3_repairExistingTaskRelationships:(_id,_kind,expected,permission)=>{
      assert.equal(permission,'TASK_FIRST_PRODUCTION');
      assert.equal(_id,19083);
      assert.equal(expected.customerId,'62860');
      assert.equal(expected.orderId,'27648');
      assert.equal(expected.contactId,'56760');
      assert.equal(expected.locationId,'');
      patched++;
      return {status:'PATCHED_AND_VERIFIED',writes:1,taskId:19083};
    },
    tmv3_audit_:(...args)=>audits.push(args)
  };
  vm.createContext(ctx);
  vm.runInContext(isolated,ctx,{timeout:2000});
  return {run:()=>ctx.tmv3_taskFirstProductionCycle_(),getCalls:()=>getCalls,
    writes:()=>patched,audits:()=>audits,
    gate:()=>ctx.tmv3_operationWritesEnabled_('taskfirstproduction'),
    general:()=>ctx.tmv3_operationWritesEnabled_('AUTO')};
}
let t=run();
assert.equal(t.gate(),true);
assert.equal(t.general(),false);
assert.equal(t.run().status,'PATCHED_AND_VERIFIED');
assert.equal(t.writes(),1);
assert.equal(t.run().status,'THROTTLED');
assert.equal(t.writes(),1);
t=run({enabled:false});assert.equal(t.run().status,'TASK_FIRST_PRODUCTION_GATED');assert.equal(t.getCalls(),0);
t=run({mode:'SHADOW_READ_ONLY'});assert.equal(t.run().status,'TASK_FIRST_PRODUCTION_GATED');
t=run({orderWrongOwner:true});assert.equal(t.run().status,'REVIEW_ORDER_OWNERSHIP');assert.equal(t.writes(),0);
t=run({noContact:true});assert.equal(t.run().status,'REVIEW_NO_VERIFIED_WORK_ORDER_CONTACT');assert.equal(t.writes(),0);
t=run({cacheDone:true});assert.equal(t.run().status,'NO_CACHED_CANDIDATES');assert.equal(t.getCalls(),0);
t=run({liveOrder:'12345'});assert.equal(t.run().status,'REVIEW_EXISTING_ORDER_CONFLICT');assert.equal(t.writes(),0);
console.log('V3 task-first production lane PASS: 8 safety and idempotency scenarios.');

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
const anchors=fs.readFileSync(path.join(__dirname,'../apps-script/tmv3-clean/36_Step3_Business_Anchor.js'),'utf8');
const anchorFns=anchors.slice(anchors.indexOf('function tmv3_step3AllowedOrderTypes_('),anchors.indexOf('function tmv3_step3BusinessAnchorRecords_('));
const isolated=anchorFns+'\n'+operations.slice(start,stop)+'\n'+automation.slice(begin,end);
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
    'Task ID':opts.badCacheId?'bad':19083,'Task Type':opts.delivery?'Fireplace Delivery':'Service: Clean and Service',
    'Status':opts.cacheDone?'Done':'Open',
    'Order ID':opts.cacheOrder||'','Contact ID':opts.cacheContact||'',
    'Name':opts.canceledMarker?'Level 2 - SO#586061 - Paul Romanuk':'Level 2 - SO#585914 - Don Dwyer'
  };
  const raw={customerId:opts.wrongCustomer?999:62860,orderId:opts.liveOrder||'',
    locationId:58475,requestedById:opts.alreadyCorrect?'56760':'',status:'Open'};
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
    tmv3_rows_:name=>name==='TASKS'?[candidate]:[{'Order Number':'585914','Order ID':'27648','Order Type':opts.wrongOrderType?'SALES_ORDER':opts.delivery?'SALES_ORDER|DELIVERY_APPROVED':'WORK_ORDER'}],
    tmv3_rawTaskById_:()=>{getCalls++;return {...raw};},
    tmv3_normalizeV2TaskModel_:r=>({
      'Task ID':opts.wrongTaskId?9:19083,'Task Type':opts.wrongTaskType?'Install':opts.delivery?'Fireplace Delivery':'Service: Clean and Service',
      'Status':r.status,'Customer ID':r.customerId,'Order ID':r.orderId,
      'Location ID':r.locationId,'Contact ID':r.requestedById
    }),
    tmv3_upsertTaskCacheRow_:r=>{candidate['Order ID']=String(r['Order ID']||'');candidate['Contact ID']=String(r['Contact ID']||'');},
    tmv3_unique_:v=>Array.from(new Set(v)),
    tmv3_taskIsOpen_:s=>s==='Open',
    tmv3_step7RequestedByFromRaw_:r=>({id:r.requestedById||'',type:''}),
    tmv3_fetchJson_:()=>{getCalls++;if(opts.orderReadError)throw Error('read failed');return {
      id:27648,customer:{id:opts.orderWrongOwner?7:62860},
      orderNumber:'585914',contact:opts.noContact?null:{id:56760}
    };},
    tmv3_taskFirstFreshOrderOwnershipById_:(id,customer,title)=>{
      getCalls++;
      if(opts.orderReadError)throw Error('read failed');
      if(opts.orderWrongOwner)throw Error('Order ownership');
      if(opts.inactiveOrder)throw Error('ORDER_NOT_VERIFIED_ACTIVE');
      return {verified:true,contactId:opts.noContact?'':'56760'};
    },
    tmv3_first_:(o,keys)=>{for(const k of keys){if(o&&o[k]!==undefined)return o[k];}return '';},
    tmv3_repairExistingTaskRelationships:(_id,_kind,expected,permission)=>{
      assert.equal(permission,'TASK_FIRST_PRODUCTION');
      assert.equal(_id,19083);
      assert.equal(expected.customerId,'62860');
      assert.equal(expected.orderId,'27648');
      assert.equal(expected.contactId,opts.noContact?'':'56760');
      assert.equal(expected.locationId,'');
      assert.equal(_kind,opts.delivery?'Delivery':'Service');
      if(opts.alreadyCorrect)return {status:'NO_CHANGE_VERIFIED',writes:0,taskId:19083};
      patched++;
      if(opts.uncertainWrite)throw Error('PATCH/readback uncertain');
      return {status:opts.noContact?'PARTIAL_PATCH_VERIFIED':'PATCHED_AND_VERIFIED',writes:1,taskId:19083};
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
t=run({orderWrongOwner:true});assert.equal(t.run().status,'REVIEW_ORDER_NOT_VERIFIED_ACTIVE');assert.equal(t.writes(),0);
t=run({noContact:true});assert.equal(t.run().status,'PARTIAL_PATCH_VERIFIED');assert.equal(t.writes(),1);
t=run({cacheDone:true});assert.equal(t.run().status,'NO_CACHED_CANDIDATES');assert.equal(t.getCalls(),0);
t=run({liveOrder:'12345'});assert.equal(t.run().status,'REVIEW_EXISTING_ORDER_CONFLICT');assert.equal(t.writes(),0);
t=run({cacheOrder:'27648',liveOrder:'27648'});assert.equal(t.run().status,'PATCHED_AND_VERIFIED');assert.equal(t.writes(),1);
t=run({cacheOrder:'27648',cacheContact:'56760'});assert.equal(t.run().status,'NO_CACHED_CANDIDATES');assert.equal(t.getCalls(),0);
t=run({wrongOrderType:true});assert.equal(t.run().status,'REVIEW');assert.equal(t.getCalls(),0);
t=run({badCacheId:true});assert.equal(t.run().status,'NO_CACHED_CANDIDATES');assert.equal(t.getCalls(),0);
for(const opts of [{wrongTaskId:true},{wrongTaskType:true}]) {t=run(opts);assert.equal(t.run().status,'REVIEW_TASK_STATUS_OR_CUSTOMER');assert.equal(t.writes(),0);}
t=run({uncertainWrite:true});let uncertain=t.run();assert.equal(uncertain.writes,null);assert.equal(uncertain.requiresReadback,true);assert.equal(uncertain.writeOutcome,'UNKNOWN_RECONCILE_BEFORE_RETRY');
t=run({orderReadError:true});let notAttempted=t.run();assert.equal(notAttempted.writes,0);assert.equal(notAttempted.requiresReadback,false);
t=run({noContact:true});t.run();assert.equal(t.audits().at(-1)[4],'REVIEW');
t=run({alreadyCorrect:true,liveOrder:'27648'});assert.equal(t.run().status,'NO_CHANGE_VERIFIED');assert.equal(t.audits().at(-1)[4],'PASS');assert.equal(t.writes(),0);
t=run({delivery:true});assert.equal(t.run().status,'PATCHED_AND_VERIFIED');
t=run({delivery:true,wrongOrderType:true});assert.equal(t.run().status,'REVIEW');assert.equal(t.getCalls(),0);
t=run({inactiveOrder:true});assert.equal(t.run().status,'REVIEW_ORDER_NOT_VERIFIED_ACTIVE');assert.equal(t.writes(),0);
t=run({canceledMarker:true});assert.equal(t.run().status,'NO_CACHED_CANDIDATES');assert.equal(t.getCalls(),0);
console.log('V3 task-first production lane PASS: 20 scenarios including Contact-only repair, both verticals, audit labels and uncertain writes.');

// Execute the real hourly fallback; do not merely inspect its text.
const fallbackStart=automation.indexOf('function tmv3_calendarReconciliationFallback()');
const fallbackEnd=automation.indexOf('function tmv3_dailySourceRefresh()',fallbackStart);
function hourly(hour,stage) {
  let cycles=0;
  const ctx={Date,Object,Number,TMV3_TIMEZONE:'America/Toronto',
    Utilities:{formatDate:()=>String(hour)},
    tmv3_reconcilePreInspectionSharedGuest_AUTO_:()=>{},
    tmv3_preInspectionAutomationCycle_:()=>({status:'PREINSPECTION_GATED',writes:0}),
    tmv3_taskFirstProductionCycle_:()=>{cycles++;return {status:'THROTTLED'};},
    tmv3_executionStage_:()=>stage,
    tmv3_calendarStageRefresh_:()=>({status:'MAPPED'}),
    tmv3_stage7AutomaticCanaryCycle_:()=>({status:'GATED'}),
    tmv3_runProductionAutomationCycle_:()=>({status:'GATED'})};
  vm.runInNewContext(automation.slice(fallbackStart,fallbackEnd),ctx);
  return {result:ctx.tmv3_calendarReconciliationFallback(),cycles};
}
for(const stage of [6,7,8]) {
  for(const hour of [8,14,18]) {
    const h=hourly(hour,stage);assert.equal(h.cycles,1);
    assert.equal(h.result.taskFirst.status,'THROTTLED');
  }
  for(const hour of [7,19]) assert.equal(hourly(hour,stage).cycles,0);
}
console.log('Hourly fallback PASS: 15 stage/hour combinations; existing trigger reaches bounded lane once.');

const runner=fs.readFileSync(path.join(__dirname,'tmv3-shadow-run.js'),'utf8');
const actionStart=runner.indexOf("    if (body.action === 'taskFirstProductionCycle') {");
const actionEnd=runner.indexOf("    if (body.action === 'triggerInventory')",actionStart);
function probe(opts={}) {
  let calls=0;
  const ctx={body:{action:'taskFirstProductionCycle',requestTag:opts.badTag?'bad':'CF_TASKS_V3_BOUNDED_RELATIONSHIP_ACTIVATION_20261013'},
    TMV3:{VERSION:opts.badVersion?'old':'3.11.81-task-first-authoritative-audit-r1',MODE:opts.mode||'PRODUCTION_WRITE'},
    tmv3_operationWritesEnabled_:scope=>scope==='taskfirstproduction'?!opts.disabled:!!opts.broad,
    tmv3_writesEnabled_:()=>!!opts.broad,
    tmv3_taskFirstProductionCycle_:()=>({status:++calls===1?(opts.first||'PATCHED_AND_VERIFIED'):(opts.second||'THROTTLED')}),
    tmv3_listTriggers:()=>[],tmv3_runtimeMetrics_:()=>({}),TMPV3_shadowResponse_:v=>v};
  const result=vm.runInNewContext('(function(){'+runner.slice(actionStart,actionEnd)+'})()',ctx);
  return {result,calls};
}
assert.equal(probe().result.ok,true);
for(const opts of [{badTag:true},{badVersion:true},{mode:'SHADOW_READ_ONLY'},{disabled:true},{broad:true}])
  assert.throws(()=>probe(opts),/SCOPE_MISMATCH/);
assert.equal(probe({first:'ATTENTION'}).result.ok,false);
assert.equal(probe({second:'PATCHED_AND_VERIFIED'}).result.ok,false);
console.log('Authenticated activation probe PASS: exact release/scope and repeat throttle enforced.');


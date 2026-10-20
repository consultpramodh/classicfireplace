// JavaScript / Node.js: run the real fixed-ID backfill and worker in a mocked native runtime.
'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const auto=fs.readFileSync('apps-script/tmv3-clean/60_Automation.js','utf8');
const ops=fs.readFileSync('apps-script/tmv3-clean/58_Operations.js','utf8');
const worker=auto.slice(auto.indexOf('function tmv3_taskFirstProductionCycle_('),auto.indexOf('\nfunction tmv3_scheduledOperations('));
const parser=ops.slice(ops.indexOf('function tmv3_taskFirstTitleOrderNumber_('));
const ids=JSON.parse(worker.match(/const ids = (\[[^;]+\]);/)[1]);
assert.equal(ids.length,81);assert.equal(new Set(ids).size,81);
function fixture(opts={}){
 const store={},audit=[],triggers=[],calls=[];let writes=0,reads=0,count=0,locked=false,clock=Date.now();
 const spend=n=>{count+=n;clock+=n*Number(opts.perCallMs||0);};
 const rows=ids.map((id,n)=>({'Task ID':id,'Task Type':n%2?'BBQ Delivery':'Service: Clean and Service',Status:'Open',Name:'SO#'+(500000+n)+' - Customer','Customer ID':String(1000+n),'Order ID':''}));
 const orders=rows.map((r,n)=>({'Order ID':String(2000+n),'Order Number':String(500000+n),'Order Type':n%2?'DELIVERY_APPROVED':'WORK_ORDER'}));
 const live=Object.fromEntries(rows.map(r=>[r['Task ID'],{...r}]));
 const clean=x=>String(x==null?'':x).trim();
 const norm=x=>clean(x).toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
 const props={getProperty:k=>store[k]||null,setProperty:(k,v)=>{store[k]=String(v);}};
 const ctx={Number,String,Object,Array,JSON,Math,Date:class extends Date{static now(){return clock;}},
  TMV3:{API_BASE:'https://example.invalid',SHEETS:{TASKS:'TASKS',ORDERS:'ORDERS'}},
  tmv3_operationPolicy_:()=>({taskFirstProductionIntervalMinutes:60}),
  tmv3_operationWritesEnabled_:()=>!opts.gated,
  LockService:{getScriptLock:()=>({tryLock:()=>{if(locked)return false;locked=true;return true;},releaseLock:()=>{locked=false;}})},
  PropertiesService:{getScriptProperties:()=>props},
  ScriptApp:{getProjectTriggers:()=>triggers.slice(),deleteTrigger:t=>triggers.splice(triggers.indexOf(t),1),
   newTrigger:handler=>({timeBased(){return this;},after(delay){this.delay=delay;return this;},create(){triggers.push({getHandlerFunction:()=>handler,delay:this.delay});}})},
  tmv3_rows_:sheet=>sheet==='TASKS'?rows:orders,tmv3_clean_:clean,tmv3_norm_:norm,
  tmv3_taskIsOpen_:s=>s==='Open',tmv3_step3OrderMatchesVertical_:(o,v)=>v==='Service'?o['Order Type']==='WORK_ORDER':o['Order Type']==='DELIVERY_APPROVED',
  tmv3_strivenApiBudgetStatus_:()=>({count,remaining:opts.noBudget?0:1200-count,exhausted:false}),
  tmv3_rawTaskById_:id=>{reads++;spend(1);if(opts.readFail===id)throw Error('GET failure');return {...live[id]};},
  tmv3_normalizeV2TaskModel_:r=>r,tmv3_upsertTaskCacheRow_:r=>Object.assign(rows.find(x=>x['Task ID']===r['Task ID']),r),
  tmv3_fetchJson_:(url,options)=>{spend(1);assert.equal(url,'https://example.invalid/v1/sales-orders/search');assert.equal(options.method,'post');const query=JSON.parse(options.payload);assert.equal(query.PageIndex,0);assert.equal(query.PageSize,100);const data=opts.searchRows || [];return {Data:data,TotalCount:opts.searchTotal===undefined?data.length:opts.searchTotal};},
  tmv3_taskFirstFreshOrderOwnershipById_:(id,cid,title)=>{spend(1);if(opts.inactive===String(id))throw Error('ORDER_NOT_VERIFIED_ACTIVE');assert.ok(title.includes('SO#'));assert.equal(cid,String(1000+Number(id)-2000));return {verified:true};},
  tmv3_repairExistingTaskRelationships:(id,v,expected,permission)=>{
   assert.equal(locked,true);assert.equal(permission,'TASK_FIRST_PRODUCTION');assert.equal(expected.contactId,'');assert.equal(expected.locationId,'');
   calls.push(id);spend(5);
   if(opts.uncertain===id){if(opts.applied)live[id]['Order ID']=expected.orderId;throw Error('PATCH outcome uncertain');}
   writes++;live[id]['Order ID']=expected.orderId;
   if(opts.badReadback===id)live[id]['Order ID']='99999';
   return {writes:1,readbackVerified:true};
  },tmv3_audit_:(...a)=>audit.push(a)};
 vm.createContext(ctx);vm.runInContext(parser+'\n'+worker,ctx);
 return {run:()=>ctx.tmv3_taskFirstProductionCycle_(),ctx,rows,orders,live,store,triggers,audit,calls,writes:()=>writes,reads:()=>reads,count:()=>count,
  state:id=>JSON.parse(store['TMV3_SD_ORDER_BACKFILL_20261020_'+id]||'null')};
}
let cases=0;
let f=fixture();let runs=0,result;
do{const beforeCount=f.count();result=f.run();runs++;assert.ok(f.count()-beforeCount<=40);assert.ok(result.processed<=8);assert.ok(f.triggers.length<=1);}while(result.tally.PENDING&&runs<40);
assert.equal(runs,21);assert.equal(result.tally.VERIFIED,81);assert.equal(result.tally.BLOCKED,0);assert.equal(f.writes(),81);assert.equal(f.triggers.length,0);cases++;
// Completed fixed-ID tasks never patch a second time, even if a report drops its Order IDs.
for(const row of f.rows)row['Order ID']='';
const before=f.writes();assert.equal(f.ctx.tmv3_serviceDeliveryOrderBackfill_({getProperty:k=>f.store[k]||null,setProperty:(k,v)=>{f.store[k]=v;}}),null);assert.equal(f.writes(),before);cases++;
f=fixture({gated:true});assert.equal(f.run().status,'TASK_FIRST_PRODUCTION_GATED');assert.equal(f.reads(),0);assert.equal(f.triggers.length,0);cases++;
f=fixture({noBudget:true});result=f.run();assert.equal(result.processed,0);assert.equal(f.writes(),0);assert.equal(f.triggers[0].delay,3600000);cases++;
for(const reason of ['missingOrder','ambiguous','wrongOrderType','noTitle','multiTitle','closedTask','wrongCustomer','wrongVertical','existingConflict','duplicateTask']){
 f=fixture();const id=ids[0];
 if(reason==='missingOrder')f.orders.splice(0,1);
 if(reason==='ambiguous')f.orders.push({...f.orders[0],'Order ID':'9000'});
 if(reason==='wrongOrderType')f.orders[0]['Order Type']='SALES_ORDER';
 if(reason==='noTitle')f.live[id].Name='Custom Service';
 if(reason==='multiTitle')f.live[id].Name='SO#500000 and SO#500001';
 if(reason==='closedTask')f.live[id].Status='Done';
 if(reason==='wrongCustomer')f.live[id]['Customer ID']='';
 if(reason==='wrongVertical')f.live[id]['Task Type']='Install';
 if(reason==='existingConflict')f.live[id]['Order ID']='9999';
 if(reason==='duplicateTask')f.rows.push({...f.rows[0]});
 f.run();assert.equal(f.state(id).state,'BLOCKED',reason);assert.ok(!f.calls.includes(id),reason);assert.ok(f.writes()>0,'later records must proceed');cases++;
}
f=fixture({inactive:'2000'});f.run();assert.equal(f.state(ids[0]).state,'BLOCKED');assert.ok(!f.calls.includes(ids[0]));cases++;
f=fixture();f.orders.push({...f.orders[0]});f.run();assert.equal(f.state(ids[0]).state,'VERIFIED');cases++;
f=fixture();f.live[ids[0]]['Order ID']='2000';f.run();assert.equal(f.state(ids[0]).reason,'ALREADY_LINKED_FRESH_VERIFIED');assert.ok(!f.calls.includes(ids[0]));cases++;
for(const applied of [false,true]){
 f=fixture({uncertain:ids[0],applied});f.run();assert.equal(f.state(ids[0]).state,'INTENT');f.run();
 assert.equal(f.state(ids[0]).state,applied?'VERIFIED':'UNCERTAIN');assert.equal(f.calls.filter(x=>x===ids[0]).length,1);cases++;
}
f=fixture({badReadback:ids[0]});f.run();assert.equal(f.state(ids[0]).state,'INTENT');f.run();assert.equal(f.calls.filter(x=>x===ids[0]).length,1);cases++;
f=fixture({readFail:ids[0]});f.run();assert.equal(f.state(ids[0]).state,'RETRY');assert.ok(f.writes()>0);f.run();f.run();assert.equal(f.state(ids[0]).state,'BLOCKED');assert.equal(f.calls.filter(x=>x===ids[0]).length,0);cases++;
// Existing unrelated schedules survive continuation scheduling.
f=fixture();f.triggers.push({getHandlerFunction:()=> 'tmv3_scheduledOperations'});f.run();assert.equal(f.triggers.length,2);cases++;
// Delivery Order linkage is independent of the Calendar delivery-approved report.
f=fixture();f.orders[1]['Order Type']='SALES_ORDER';f.run();assert.equal(f.state(ids[1]).state,'VERIFIED');cases++;
f=fixture();const heldOrder=f.orders.shift();f.run();assert.equal(f.state(ids[0]).state,'BLOCKED');f.orders.push(heldOrder);f.run();assert.equal(f.state(ids[0]).state,'VERIFIED');cases++;
f=fixture();f.orders[1]['Order Type']='WORK_ORDER';f.run();assert.equal(f.state(ids[1]).state,'BLOCKED');assert.ok(!f.calls.includes(ids[1]));cases++;
// Exact official query schema; partial search results never prove uniqueness.
for(const lower of [false,true]){
 const row=lower?{id:2000,number:'500000',customer:{id:1000}}:{Id:2000,Number:'500000',Customer:{Id:1000}};
 f=fixture({searchRows:[row]});f.orders.shift();f.run();assert.equal(f.state(ids[0]).state,'VERIFIED');cases++;
}
for(const opts of [
 {searchRows:[{Id:2000,Number:'500001',Customer:{Id:1000}}]},
 {searchRows:[{Id:2000,Number:'500000',Customer:{Id:9999}}]},
 {searchRows:[{Id:2000,Number:'500000',Customer:{Id:1000}},{Id:9999,Number:'500000',Customer:{Id:1000}}]},
 {searchRows:[{Id:2000,Number:'500000',Customer:{Id:1000}}],searchTotal:101}
]) {f=fixture(opts);f.orders.shift();f.run();assert.equal(f.state(ids[0]).state,'BLOCKED');assert.ok(!f.calls.includes(ids[0]));cases++;}
f=fixture({searchRows:[{Id:2000,Number:'500000',Customer:{Id:1000}}],inactive:'2000'});f.orders.shift();f.run();assert.equal(f.state(ids[0]).state,'BLOCKED');assert.ok(!f.calls.includes(ids[0]));cases++;
// A native Calendar lock collision cannot consume the only continuation.
f=fixture();f.ctx.LockService.getScriptLock=()=>({tryLock:()=>false});
assert.equal(f.ctx.tmv3_serviceDeliveryOrderBackfill().status,'LOCK_BUSY');assert.equal(f.triggers.length,1);assert.equal(f.triggers[0].delay,60000);assert.equal(f.writes(),0);cases++;
f.ctx.tmv3_serviceDeliveryOrderBackfill();assert.equal(f.triggers.length,1);cases++;
// Fast slices wait for their one-minute boundary; slow slices add no idle minute.
f=fixture();f.run();assert.equal(f.triggers[0].delay,60000);cases++;
f=fixture({perCallMs:2000});f.run();assert.equal(f.triggers[0].delay,1000);cases++;
console.log('PASS: '+cases+' real backfill cases, including all 81 IDs across 21 rapid mocked slices, both verticals, retries, rate budget and scope.');

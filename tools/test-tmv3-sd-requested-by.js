'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const source=fs.readFileSync('tools/tmv3-sd-requested-by-native.js','utf8');
function run(options={}) {
 const state={},writes=[];let reads=0;
 const task={'Task ID':1,'Task Type':'Service',Status:'Open','Customer ID':'10','Order ID':'20',Name:'Service SO#123456','Location ID':'30'};
 Object.assign(task,options.task||{});
 const ctx={Date,JSON,Number,String,Boolean,Object,Error,TMV3_SD_REQUESTED_BY_IDS:[1],
 LockService:{getScriptLock:()=>({tryLock:()=>!options.lockBusy,releaseLock:()=>{}})},
 PropertiesService:{getScriptProperties:()=>({getProperty:k=>state[k],setProperty:(k,v)=>state[k]=v})},
 tmv3_assertOperationWrite_:()=>{if(options.disabled)throw Error('DISABLED');},
 tmv3_strivenApiBudgetStatus_:()=>({count:0,remaining:100,exhausted:false}),
 tmv3_clean_:v=>String(v||'').trim(),tmv3_norm_:v=>String(v||'').toLowerCase(),
 tmv3_rawTaskById_:()=>{reads++;return {task:{...task},by:writes.length?{id:options.mismatch?'99':'40',type:'contact'}:(options.by||{})};},
 tmv3_normalizeV2TaskModel_:r=>r.task,tmv3_step7RequestedByFromRaw_:r=>r.by,
 tmv3_taskIsOpen_:s=>s==='Open',tmv3_taskFirstFreshOrderOwnershipById_:()=>{if(options.inactive)throw Error('ORDER_NOT_VERIFIED_ACTIVE');return {contactId:options.noContact?'':'40'};},
 tmv3_getContactById_:()=>({__ownershipVerified:!options.wrongOwner}),
 tmv3_repairExistingTaskRelationships:(id,vertical,expected,scope)=>{writes.push({id,vertical,expected,scope});if(options.fail)throw Error('timeout');return {writes:1,patchedFields:['REQUESTED_BY']};},
 tmv3_operationPatchTask_:()=>{},tmv3_audit_:()=>{}};
 vm.createContext(ctx);vm.runInContext(source,ctx);
 return {result:ctx.tmv3_sdRequestedByBackfill_(),writes,state};
}
let cases=0;
let r=run();assert.equal(r.result.tally.VERIFIED,1);assert.equal(r.writes[0].expected.orderId,'20');assert.equal(r.writes[0].expected.contactId,'40');assert.equal(r.writes[0].expected.locationId,'');cases++;
for(const options of [{inactive:true},{noContact:true},{wrongOwner:true},{task:{Status:'Canceled'}},{task:{'Task Type':'Install'}},{task:{'Customer ID':''}},{task:{'Order ID':''}}]){r=run(options);assert.equal(r.writes.length,0);assert.equal(r.result.tally.BLOCKED,1);cases++;}
r=run({by:{id:'55',type:'employee'}});assert.equal(r.writes.length,0);assert.equal(r.result.tally.PRESENT,1);cases++;
for(const options of [{fail:true},{mismatch:true}]){r=run(options);assert.equal(r.result.tally.PENDING,1);assert.equal(JSON.parse(Object.values(r.state)[0]).state,'INTENT');cases++;}
assert.equal(run({lockBusy:true}).result.status,'LOCK_BUSY');cases++;
assert.throws(()=>run({disabled:true}),/DISABLED/);cases++;
const {requestedByRunner}=require('./tmv3-service-delivery-backfill-launch');
const generated=requestedByRunner('a'.repeat(64),Date.now()+60000);new vm.Script(generated);assert.ok(generated.includes("body.action!=='FIXED_SD_REQUESTED_BY'"));cases++;
console.log('PASS: '+cases+' Contact-only, ownership, lifecycle, preservation, uncertain-write and authentication cases.');

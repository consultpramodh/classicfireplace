// JavaScript / Node.js: transport retries require verified cleanup and a durable native queue.
'use strict';
const assert=require('node:assert/strict');
const {canResumeAfterTransport}=require('./tmv3-service-delivery-backfill-launch');
const base={sourceParityVerified:true,headRestoredVerified:true,status:'LAUNCH_STOPPED_RECONCILE_BEFORE_RETRY',error:'LAUNCH_HTTP_500'};
let cases=0;
for(const kind of ['OPEN_REFRESH','REQUESTED_BY']){assert.equal(canResumeAfterTransport(base,kind),true);cases++;}
for(const error of ["Unexpected token '<', \"<!DOCTYPE \"... is not valid JSON",'LAUNCH_HTTP_502','LAUNCH_HTTP_503','The operation was aborted due to timeout']){assert.equal(canResumeAfterTransport({...base,error},'OPEN_REFRESH'),true);cases++;}
for(const change of [{sourceParityVerified:false},{headRestoredVerified:false},{status:'NATIVE_BACKFILL_LAUNCHED'},{error:'NATIVE_LAUNCH_REJECTED_UNAUTHORIZED'},{error:'LIVE_PROJECT_DRIFT_NO_WRITE'},{error:'LAUNCH_HTTP_403'},{error:'CONTACT_READBACK_MISMATCH'}]){assert.equal(canResumeAfterTransport({...base,...change},'OPEN_REFRESH'),false);cases++;}
for(const kind of ['CACHE_REPAIR','ORDER_BACKFILL',undefined]){assert.equal(canResumeAfterTransport(base,kind),false);cases++;}
console.log('PASS: '+cases+' cleanup, fixed-scope, authentication and no-blind-write transport recovery cases.');
// Execute the exact Open refresh after a prior mutation intent, with independent current GETs.
const fs=require('fs'),vm=require('vm');
for(const requested of [{id:'41127',type:'contact'},{id:'',type:''},{id:'41127',type:'employee'}]){
 const prefix='TMV3_OPEN_REFRESH_20261021_',state={};
 state[prefix+'IMPORTED']='{}';state[prefix+'TASK_18983']='{}';state[prefix+'VIEWS']='true';state[prefix+'RICH_VIEWS']='true';state[prefix+'SAMUELS_INTENT']=JSON.stringify({contactId:'41127'});
 const headers=['Task ID','Task Number','Task Type ID','Task Type','Status','Name','Customer ID','Location ID','Contact ID','Order ID','Start','Due','Assignees','Pools','URL','Fingerprint'];
 const cells=[headers,[18983,18983,86,'Service','Open','SO#585765',46902,41517,'',27499,'','','','','','']];let patches=0;
 const task={'Task ID':18983,'Task Type':'Service',Status:'Open',Name:'SO#585765','Customer ID':'46902','Order ID':'27499','Location ID':'41517','Contact ID':requested.id};
 const sheet={getLastRow:()=>2,getMaxRows:()=>5000,getRange:(r,c,n=1,w=1)=>({getValues:()=>cells.slice(r-1,r-1+n).map(row=>row.slice(c-1,c-1+w)),getValue:()=>cells[r-1][c-1],setValues:rows=>rows.forEach((row,i)=>row.forEach((v,j)=>cells[r-1+i][c-1+j]=v))})};
 const ctx={Date,JSON,String,Number,Boolean,Object,Array,Error,TMV3_OPEN_REFRESH_HYDRATE_IDS:[18983],TMV3:{SHEETS:{TASKS:'Source Tasks'}},
 LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock:()=>{}})},PropertiesService:{getScriptProperties:()=>({getProperty:k=>state[k],setProperty:(k,v)=>state[k]=v})},
 tmv3_sheet_:()=>sheet,tmv3_clean_:v=>String(v??'').trim(),tmv3_norm_:v=>String(v??'').toLowerCase(),tmv3_hash_:()=> 'hash',
 tmv3_strivenApiBudgetStatus_:()=>({remaining:100}),tmv3_taskIsOpen_:()=>true,tmv3_rawTaskById_:()=>({task,requested}),tmv3_normalizeV2TaskModel_:r=>r.task,tmv3_step7RequestedByFromRaw_:r=>r.requested,
 tmv3_taskFirstFreshOrderOwnershipById_:()=>({contactId:'41127'}),tmv3_repairExistingTaskRelationships:()=>{patches++;throw Error('Must not repeat writer');},tmv3_audit_:()=>{}};
 vm.createContext(ctx);vm.runInContext(fs.readFileSync('tools/tmv3-open-tasks-refresh-native.js','utf8'),ctx);const result=ctx.tmv3_openTasksRefresh_();
 assert.equal(patches,0);assert.equal(result.samuels.state,requested.id==='41127'&&requested.type==='contact'?'VERIFIED':'UNCERTAIN');
}
console.log('PASS: 3 native INTENT reconciliations perform fresh reads and never repeat the Task writer.');

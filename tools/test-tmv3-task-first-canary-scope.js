// Production-safety regression for V3-001 exact-task scope normalization.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const operations = fs.readFileSync(path.join(__dirname,'../apps-script/tmv3-clean/58_Operations.js'),'utf8');
const writes = fs.readFileSync(path.join(__dirname,'../apps-script/tmv3-clean/55_Writes.js'),'utf8');
const start = operations.indexOf('function tmv3_operationPolicy_()');
const end = operations.indexOf('function tmv3_selectedContext_()',start);
assert.ok(start >= 0 && end > start);
const gateSource = operations.slice(start,end);
const writeSource = writes.slice(writes.indexOf('function tmv3_writesEnabled_()'),
                                    writes.indexOf('function tmv3_assertLegacyMutationHelperDisabled_'));
const config = {
  manualWritesEnabled:false,
  automationWritesEnabled:false,
  taskFirstCanaryEnabled:true,
  taskFirstCanaryTaskId:19083,
  taskFirstCanaryExpectedCustomerId:62860,
  taskFirstCanaryExpectedOrderId:27648,
  taskFirstCanaryExpectedContactId:56760
};
const ctx = {
  TMV3:{MODE:'CANARY_WRITE',OPERATIONS:config},
  tmv3_norm_:v=>String(v||'').trim().toLowerCase()
    .replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim(),
  tmv3_assertHardRules_:()=>true,
};
vm.createContext(ctx);
vm.runInContext(gateSource+'\n'+writeSource,ctx,{timeout:2000});
assert.equal(ctx.tmv3_operationWritesEnabled_('taskfirstcanary19083'),true,
  'exact task-first canary must pass normalization without punctuation');
assert.equal(ctx.tmv3_operationWritesEnabled_('taskfirstcanary:19083'),false,
  'unrecognized punctuation-bearing scope must not silently become authorized');
assert.equal(ctx.tmv3_operationWritesEnabled_('taskfirstcanary19084'),false);
assert.equal(ctx.tmv3_operationWritesEnabled_('manual'),false);
assert.equal(ctx.tmv3_operationWritesEnabled_('auto'),false);
assert.equal(ctx.tmv3_writesEnabled_(),false,
  'generic business write helpers must remain disabled');
ctx.TMV3.MODE='SHADOW_READ_ONLY';
assert.equal(ctx.tmv3_operationWritesEnabled_('taskfirstcanary19083'),false);
ctx.TMV3.MODE='CANARY_WRITE';
ctx.TMV3.OPERATIONS.taskFirstCanaryEnabled=false;
assert.equal(ctx.tmv3_operationWritesEnabled_('taskfirstcanary19083'),false);
ctx.TMV3.OPERATIONS.taskFirstCanaryEnabled=true;
ctx.TMV3.OPERATIONS.taskFirstCanaryTaskId=99999;
assert.equal(ctx.tmv3_operationWritesEnabled_('taskfirstcanary19083'),false);
console.log('V3-001 permission scope safety PASS: 9 assertions.');
// The actual scope assertion must deny every non-relationship writer.
ctx.TMV3.OPERATIONS.taskFirstCanaryTaskId=19083;
for(const action of [undefined,'CREATE_TASK','CREATE_LOCATION','ASSIGNMENT','CALENDAR_LINKS','DATES'])
 assert.throws(()=>ctx.tmv3_assertOperationWrite_('taskfirstcanary19083',action),/RELATIONSHIP_ONLY_SCOPE/);
ctx.tmv3_assertOperationWrite_('taskfirstcanary19083','TASK_RELATIONSHIP_REPAIR');
ctx.tmv3_assertOperationWrite_('taskfirstcanary19083','TASK_RELATIONSHIP_PATCH');
const patchStart=operations.indexOf('function tmv3_operationPatchTask_(');
const patchEnd=operations.indexOf('function tmv3_reconcileTaskAssignments_(',patchStart);
let requests=0;
Object.assign(ctx,{Number,Object,JSON,
 tmv3_safeTaskPatchPayload_:p=>p,
 tmv3_fetchJson_:()=>{requests++;return {};},
 tmv3_getTaskById_:id=>({'Task ID':id}),tmv3_upsertTaskCacheRow_:()=>{}});
vm.runInContext(operations.slice(patchStart,patchEnd),ctx);
const scope='taskfirstcanary19083';
for(const key of ['StartDateTime','DueDateTime','Description','Assignments','InfoCustomFields','Title'])
 assert.throws(()=>ctx.tmv3_operationPatchTask_(19083,{Id:19083,[key]:'bad'},scope),/RELATIONSHIP_ONLY_SCOPE/);
assert.throws(()=>ctx.tmv3_operationPatchTask_(1,{Id:1,SalesOrder:{Id:27648}},scope),/RELATIONSHIP_ONLY_SCOPE/);
assert.throws(()=>ctx.tmv3_operationPatchTask_(19083,{Id:19083,SalesOrder:{Id:1}},scope),/approved tuple/);
assert.throws(()=>ctx.tmv3_operationPatchTask_(19083,{Id:19083,RequestedBy:{Id:56760,Type:'employee'}},scope),/approved tuple/);
assert.throws(()=>ctx.tmv3_operationAssignmentRequest_(19083,{id:18,type:'employee'},'post',scope),/RELATIONSHIP_ONLY_SCOPE/);
assert.equal(requests,0);
ctx.tmv3_operationPatchTask_(19083,{Id:19083,SalesOrder:{Id:27648}},scope);
assert.equal(requests,1);
ctx.TMV3.MODE='PRODUCTION_WRITE';
Object.assign(ctx.TMV3.OPERATIONS,{taskFirstProductionEnabled:true,taskFirstProductionMaxWritesPerRun:1});
assert.throws(()=>ctx.tmv3_assertOperationWrite_('taskfirstproduction'),/RELATIONSHIP_ONLY_SCOPE/);
assert.throws(()=>ctx.tmv3_operationAssignmentRequest_(19083,{id:18},'post','taskfirstproduction'),/RELATIONSHIP_ONLY_SCOPE/);
assert.throws(()=>ctx.tmv3_operationPatchTask_(19083,{Id:19083,StartDateTime:'bad'},'taskfirstproduction'),/RELATIONSHIP_ONLY_SCOPE/);
assert.equal(ctx.tmv3_writesEnabled_(),false);
console.log('Task-first action isolation PASS: date/assignment/create/calendar permissions denied; exact canary tuple enforced.');

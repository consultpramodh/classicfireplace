// V3-001 regression: no Striven access, no Calendar access, no Apps Script deploy.
// Run: node tools/test-tmv3-task-first-relationships.js
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const file = path.join(__dirname, '..', 'apps-script', 'tmv3-clean', '58_Operations.js');
const source = fs.readFileSync(file,'utf8');
const start = source.indexOf('function tmv3_repairExistingTaskRelationships(');
assert.ok(start > -1,'V3 task-first repair function missing');
const isolated = source.slice(start);

function runCase(opts={}) {
  let state=Object.assign({customer:'62851',order:'',location:'',contact:'',type:''}, opts.state||{});
  let writes=0, taskReads=0, audit=[];
  const ctx = {
    Number, Boolean, String, JSON,
    TMV3:{SHEETS:{TASKS:'Source Tasks'}},
    tmv3_clean_:x=>String(x==null?'':x).trim(),
    tmv3_norm_:x=>String(x==null?'':x).toLowerCase(),
    tmv3_assertOperationWrite_:()=>{if(opts.shadow)throw Error('SHADOW gate');},
    tmv3_rows_:()=>[{'Task ID':'19081','Task Type':'Service: Clean and Service'}],
    tmv3_taskIsOpen_:status=>status==='Open',
    tmv3_rawTaskById_:()=>{taskReads++;return {...state};},
    tmv3_normalizeV2TaskModel_:raw=>({
      'Status':'Open','Customer ID':raw.customer,'Order ID':raw.order,
      'Location ID':raw.location
    }),
    tmv3_step7RequestedByFromRaw_:raw=>({id:raw.contact,type:raw.type}),
    tmv3_step7FreshOrderOwnership_:()=>{if(opts.orderUnverified)throw Error('Order identity');},
    tmv3_step7FreshLocationOwnership_:()=>{if(opts.locationUnverified)throw Error('Location identity');},
    tmv3_getContactById_:()=>({__ownershipVerified:!opts.contactUnverified}),
    tmv3_operationPatchTask_:(id,payload)=>{
      writes++;
      if(payload.SalesOrder)state.order=String(payload.SalesOrder.Id);
      if(payload.Location)state.location=String(payload.Location.Id);
      if(payload.RequestedBy) {
        state.contact=String(payload.RequestedBy.Id);
        state.type=payload.RequestedBy.Type;
      }
      if(opts.badReadback)state.order='';
      return {status:'PATCHED_AND_READ_BACK'};
    },
    tmv3_audit_:(...args)=>audit.push(args)
  };
  vm.createContext(ctx);
  vm.runInContext(isolated,ctx,{timeout:3000});
  let answer, error;
  try {
    answer=ctx.tmv3_repairExistingTaskRelationships(19081,'Service',
      {customerId:'62851',orderId:'27635',locationId:'58463',contactId:'12345'});
  } catch(e) {error=e.message;}
  return {answer,error,writes,taskReads,state,audit};
}

let r=runCase();
assert.equal(r.answer.status,'PATCHED_AND_VERIFIED');
assert.equal(r.writes,1);
assert.equal(r.state.order,'27635');
assert.equal(r.state.location,'58463');
assert.equal(r.state.contact,'12345');

r=runCase({state:{order:'27635',location:'58463',contact:'12345',type:'contact'}});
assert.equal(r.answer.status,'NO_CHANGE_VERIFIED');
assert.equal(r.writes,0);

r=runCase({state:{order:'999'}});
assert.equal(r.answer.status,'PARTIAL_PATCH_VERIFIED');
assert.equal(r.state.order,'999');
assert.ok(r.answer.review.includes('ORDER_CONFLICT'));

r=runCase({contactUnverified:true});
assert.equal(r.answer.status,'PARTIAL_PATCH_VERIFIED');
assert.equal(r.state.contact,'');
assert.ok(r.answer.review.includes('REQUESTED_BY_OWNERSHIP_NOT_VERIFIED'));

r=runCase({state:{customer:'999'}});
assert.equal(r.writes,0);
assert.match(r.error,/Customer/);

r=runCase({shadow:true});
assert.equal(r.writes,0);
assert.match(r.error,/SHADOW/);

r=runCase({badReadback:true});
assert.equal(r.writes,1);
assert.match(r.error,/read-back failed/);

console.log('V3-001 regression PASS: 7 cases.');

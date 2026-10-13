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
const helperStart = source.indexOf('function tmv3_taskFirstFreshOrderOwnershipById_(', start);
const isolated = source.slice(start, helperStart > start ? helperStart : undefined);

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
      'Task ID':opts.wrongTaskId?'9':'19081','Task Type':opts.wrongTaskType?'Install':'Service: Clean and Service',
      'Status':'Open','Customer ID':raw.customer,'Order ID':raw.order,
      'Location ID':raw.location
    }),
    tmv3_step7RequestedByFromRaw_:raw=>({id:raw.contact,type:raw.type}),
    tmv3_taskFirstFreshOrderOwnershipById_:()=>{if(opts.orderUnverified)throw Error('Order identity');},
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
      opts.expected||{customerId:'62851',orderId:'27635',locationId:'58463',contactId:'12345'});
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

for(const opts of [{wrongTaskId:true},{wrongTaskType:true}]) {r=runCase(opts);assert.equal(r.writes,0);assert.match(r.error,/Task/);}
r=runCase({expected:{customerId:'62851',orderId:'27635',locationId:'',contactId:''}});
assert.equal(r.answer.status,'PARTIAL_PATCH_VERIFIED');assert.equal(r.writes,1);
assert.ok(r.answer.review.includes('LOCATION_UNRESOLVED'));assert.ok(r.answer.review.includes('REQUESTED_BY_UNRESOLVED'));
console.log('V3-001 regression PASS: 10 cases including fresh Task identity and independent safe-field repair.');

// Audit the actual reconciliation function with the actual authoritative
// ownership helper. Cache/report omissions must never manufacture a conflict.
const reconciliation=fs.readFileSync(path.join(__dirname,'../apps-script/tmv3-clean/46_Step7_Reconciliation.js'),'utf8');
const auditSource=reconciliation.slice(reconciliation.indexOf('function tmv3_taskFirstRelationshipAudit('));
const ownershipSource=source.slice(source.indexOf('function tmv3_taskFirstFreshOrderOwnershipById_('));
function auditCase(opts={}) {
 let reads=0;
 const candidate={'Task ID':'19098','Task Type':'Service'};
 const order={'Order ID':'27661','Order Number':'585927','Customer ID':opts.cacheCustomer||''};
 const ctx={Number,Boolean,String,JSON,encodeURIComponent,
  TMV3:{SHEETS:{TASKS:'TASKS',ORDERS:'ORDERS'},API_BASE:'https://example.invalid'},
  tmv3_clean_:x=>String(x==null?'':x).trim(),tmv3_norm_:x=>String(x||'').toLowerCase(),
  tmv3_rows_:n=>n==='TASKS'?[candidate]:opts.duplicate?[order,order]:[order],
  tmv3_step7FreshTask_:()=>({ok:true,task:{'Name':'SO#585927','Status':'Open','Task ID':'19098',
   'Customer ID':opts.badCustomer?'bad':'56491','Order ID':opts.conflict?'999':'27661','Location ID':'52482'},
   requestedBy:{id:'50483',type:'contact'}}),
  tmv3_first_:(o,keys)=>{for(const k of keys)if(o&&o[k]!==undefined)return o[k];return '';},
  tmv3_fetchJson_:()=>{reads++;return {id:opts.badId?9:27661,orderNumber:opts.badNumber?'bad':'585927',customer:{id:opts.badOwner?9:56491}};},
  tmv3_operationPatchTask_:()=>{throw Error('READ_ONLY_AUDIT_MUST_NOT_WRITE');}};
 vm.runInNewContext(ownershipSource+'\n'+auditSource,ctx);
 return {answer:ctx.tmv3_taskFirstRelationshipAudit(19098,'Service'),reads};
}
for(const opts of [{},{cacheCustomer:'999'}]) {
 const a=auditCase(opts);assert.equal(a.answer.orderCandidate.customerOwnershipVerified,true);
 assert.equal(a.answer.orderCandidate.ownershipEvidence,'FRESH_STRIVEN_ORDER_GET');
 assert.equal(a.reads,1);assert.equal(a.answer.writes,0);
}
for(const opts of [{badId:true},{badNumber:true},{badOwner:true}]) {
 const a=auditCase(opts);assert.equal(a.answer.orderCandidate.customerOwnershipVerified,false);
 assert.ok(a.answer.orderCandidate.ownershipError);assert.equal(a.reads,1);
}
for(const opts of [{duplicate:true},{conflict:true},{badCustomer:true}]) {
 const a=auditCase(opts);assert.equal(a.answer.orderCandidate.customerOwnershipVerified,false);assert.equal(a.reads,0);
}
console.log('Task-first audit PASS: 8 omission/conflict/ownership cases; at most one targeted Order GET, no writes.');

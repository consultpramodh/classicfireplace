// JavaScript / Node.js: execute the native worker and scoped write guards offline.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const ops=fs.readFileSync('apps-script/tmv3-clean/58_Operations.js','utf8');
const auto=fs.readFileSync('apps-script/tmv3-clean/60_Automation.js','utf8');
const fn=(text,name,next)=>text.slice(text.indexOf('function '+name+'('),next?text.indexOf('\nfunction '+next+'(',text.indexOf('function '+name+'(')):undefined);
const policy=fn(ops,'tmv3_operationPolicy_','tmv3_selectedContext_');
const patch=fn(ops,'tmv3_operationPatchTask_','tmv3_assertResolvedOwnership_');
const worker=fn(auto,'tmv3_taskFirstProductionCycle_','tmv3_scheduledOperations');
const parser=fn(ops,'tmv3_taskFirstTitleOrderNumber_');
function run(opts={}) {
 const vertical=opts.vertical||'Service';
 const storage={},audit=[];let patches=0,assignmentWrites=0,proofs=0;
 const start='2026-10-21T14:00:00Z',due='2026-10-21T15:00:00Z';
 let state={id:19083,customer:'100',order:'200',location:'',contact:'',type:'',
  start:'',due:'',name:'SO#586058 - Customer',description:'Preserve technician notes',status:'Open',
  assignments:[{type:'employee',id:99},{type:'pool',id:4}]};
 const expected={taskId:19083,vertical,eventId:'event-1',plan:'PATCH_EXISTING',blocker:opts.blocker||'',
  expectedCustomerId:'100',expectedOrderId:'200',expectedLocationId:'300',expectedRequestedById:'400',
  expectedRequestedByType:'contact',expectedStart:start,expectedDue:due,
  desiredAssignmentEmployeeIds:[18],desiredAssignmentPoolIds:[],
  actions:['PATCH_LOCATION','PATCH_REQUESTED_BY','PATCH_DATES','PATCH_ASSIGNMENTS','VERIFY_CALENDAR_LINKS']};
 if(opts.create)expected.actions.push('CREATE_TASK');
 if(opts.locationConflict)state.location='999';
 const record={vertical,eventId:'event-1',fingerprint:'fingerprint',orderNumber:'586058',start:new Date(start),end:new Date(due)};
 const clean=x=>String(x==null?'':x).trim();
 const norm=x=>clean(x).toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
 const normalized=s=>({'Task ID':s.id,'Task Type':vertical==='Service'?'Service: Clean and Service':'BBQ Delivery',
  Status:s.status,Name:s.name,'Customer ID':s.customer,'Order ID':s.order,'Location ID':s.location,
  'Contact ID':s.contact,Start:s.start,Due:s.due});
 const ctx={Number,String,Boolean,Object,Array,JSON,Math,Date,encodeURIComponent,
  TMV3:{MODE:opts.shadow?'SHADOW_READ_ONLY':'PRODUCTION_WRITE',API_BASE:'https://example.invalid',
   OPERATIONS:{manualWritesEnabled:false,automationWritesEnabled:false,taskFirstProductionEnabled:true,taskFirstProductionMaxWritesPerRun:1},
   VERTICALS:{Service:{sheet:'Service'},Delivery:{sheet:'Delivery'}},SHEETS:{TASKS:'TASKS',ORDERS:'ORDERS'}},
  tmv3_clean_:clean,tmv3_norm_:norm,tmv3_assertHardRules_:()=>{},
  LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock:()=>{}})},
  PropertiesService:{getScriptProperties:()=>({getProperty:k=>storage[k]||null,setProperty:(k,v)=>{storage[k]=String(v);}})},
  tmv3_rows_:sheet=>sheet===vertical?[{'Event ID':'event-1'}]:sheet==='TASKS'?[{...normalized(state),'Order ID':'200','Contact ID':'400'},...(opts.unresolvedLink?[{'Task ID':999,'Task Type':vertical==='Service'?'Service':'BBQ Delivery',Status:'Open',Name:'SO#999999 - No cached Order','Order ID':'','Contact ID':''}]:[])]:[],
  tmv3_findFreshEventRecord_:()=>({...record,fingerprint:opts.changedCalendar?'changed':'fingerprint'}),
  tmv3_step7FreshPlansForEvent_:()=>[{...expected}],tmv3_step7ValidateExecutionContract_:p=>p,
  tmv3_step7FreshExecutionContract_:()=>({...expected,actions:opts.failedReadback?['PATCH_DATES']:[]}),
  tmv3_taskFirstFreshOrderOwnershipById_:()=>{proofs++;if(opts.inactive)throw Error('ORDER_NOT_VERIFIED_ACTIVE');return {verified:true,contactId:'400'};},
  tmv3_step7FreshLocationOwnership_:()=>{if(opts.badLocationOwner)throw Error('Wrong location owner');return {status:'VERIFIED'};},
  tmv3_getContactById_:()=>({__ownershipVerified:!opts.badContactOwner}),
  tmv3_rawTaskById_:()=>JSON.parse(JSON.stringify(state)),
  tmv3_normalizeV2TaskModel_:normalized,tmv3_step7RequestedByFromRaw_:r=>({id:r.contact,type:r.type}),
  tmv3_taskIsOpen_:s=>s==='Open',tmv3_hash_:x=>String(x),
  tmv3_sameMinute_:(a,b)=>new Date(a).getTime()===new Date(b).getTime(),
  tmv3_step7RelationshipPayload_:()=>({Id:19083,Location:{Id:300},RequestedBy:{Id:400,Type:'contact'}}),
  tmv3_step7DatePayload_:()=>({Id:19083,StartDateTime:start,DueDateTime:due}),
  tmv3_step7DesiredAssignmentFromContract_:()=>({employeeIds:[18],poolIds:[]}),
  tmv3_safeTaskPatchPayload_:x=>x,tmv3_getTaskById_:()=>normalized(state),tmv3_upsertTaskCacheRow_:()=>{},
  tmv3_taskAssignmentsFromRaw_:r=>r.assignments,tmv3_employeeNameById_:()=>'',
  tmv3_fetchJson_:(url,options)=>{
   const body=JSON.parse(options.payload);if(opts.failWrite)throw Error('Network outcome unknown');
   if(options.method==='patch'){
    patches++;if(body.Location)state.location=String(body.Location.Id);
    if(body.RequestedBy){state.contact=String(body.RequestedBy.Id);state.type=body.RequestedBy.Type;}
    if(body.StartDateTime)state.start=body.StartDateTime;if(body.DueDateTime)state.due=body.DueDateTime;
    if(opts.mutateNotes)state.description='Unexpected';
   }else {
    assignmentWrites++;
    if(options.method==='post'&&!opts.assignmentNotPersisted)state.assignments.push({id:body.Id,type:body.Type});
    if(options.method==='delete')state.assignments=state.assignments.filter(a=>!(a.id===body.Id&&a.type===body.Type));
   }
   return {};
  },tmv3_audit_:(...args)=>audit.push(args),tmv3_step3OrderMatchesVertical_:()=>true};
 vm.createContext(ctx);vm.runInContext(policy+'\n'+patch+'\n'+parser+'\n'+worker,ctx);
 const gateBefore=ctx.tmv3_operationWritesEnabled_('SERVICEDELIVERYDETAILS');
 const result=ctx.tmv3_taskFirstProductionCycle_();
 return {result,state,patches,assignmentWrites,proofs,audit,storage,ctx,gateBefore};
}
let count=0;
for(const vertical of ['Service','Delivery']) {
 let unresolved=run({vertical,unresolvedLink:true});assert.equal(unresolved.result.status,'TASK_DETAILS_PATCHED_AND_VERIFIED');count++;
 let r=run({vertical});assert.equal(r.result.status,'TASK_DETAILS_PATCHED_AND_VERIFIED');
 assert.equal(r.patches,1);assert.equal(r.state.location,'300');assert.equal(r.state.contact,'400');
 assert.equal(r.state.start,'2026-10-21T14:00:00Z');assert.ok(r.state.assignments.some(a=>a.id===99));
 assert.ok(!r.state.assignments.some(a=>a.type==='pool'&&a.id===4));assert.equal(r.gateBefore,false);
 assert.equal(r.ctx.tmv3_operationWritesEnabled_('SERVICEDELIVERYDETAILS'),false);
 assert.equal(r.ctx.tmv3_taskFirstProductionCycle_().status,'THROTTLED');count++;
 for(const opt of ['inactive','badLocationOwner','badContactOwner','locationConflict']){
  r=run({vertical,[opt]:true});assert.equal(r.patches,0);assert.equal(r.assignmentWrites,0);count++;
 }
 for(const opt of ['failedReadback','mutateNotes','failWrite','assignmentNotPersisted']){
  r=run({vertical,[opt]:true});assert.equal(r.result.status,'TASK_DETAILS_ATTENTION');
  assert.ok(Object.values(r.storage).some(x=>x.includes('"state":"INTENT"')));
  assert.equal(r.ctx.tmv3_operationWritesEnabled_('SERVICEDELIVERYDETAILS'),false);
  if(opt==='assignmentNotPersisted')assert.ok(r.state.assignments.some(a=>a.type==='pool'&&a.id===4));count++;
 }
 for(const opts of [{create:true},{blocker:'AMBIGUOUS_CUSTOMER'},{shadow:true}]){
  r=run({vertical,...opts});assert.equal(r.patches,0);assert.equal(r.assignmentWrites,0);count++;
 }
}
// Pure title parsing: aliases, repeated same number, siblings, links and ambiguity.
const c={};vm.runInNewContext(parser,c);
for(const title of ['Level 2 - SO#586058 - Name - FP#2','SO #586058 - Name','SO#586058 SO#586058']){
 assert.equal(c.tmv3_taskFirstTitleOrderNumber_(title).number,'586058');count++;
}
for(const title of ['SO#586058 SO#586059','SO#586058/586059','SO#586058 and 586059']){
 assert.equal(c.tmv3_taskFirstTitleOrderNumber_(title).status,'AMBIGUOUS');count++;
}
for(const title of ['Call 416 555-0101 FP#2','https://example.invalid/SO#586058','SO#1234567890']){
 assert.equal(c.tmv3_taskFirstTitleOrderNumber_(title).status,'MISSING');count++;
}
// A dedicated context still cannot authorize creation, notes, names or Calendar writes.
let r=run();r.ctx.tmv3_taskFirstProductionCycle_.detailContext={vertical:'Service',taskId:19083,payload:{Id:19083},desiredAssignment:{employeeIds:[18],poolIds:[]}};
for(const action of [undefined,'CREATE_TASK','CREATE_LOCATION','PATCH_CALENDAR_TITLE','PATCH_TASK_NAME','PATCH_NOTES']){
 assert.throws(()=>r.ctx.tmv3_assertOperationWrite_('SERVICEDELIVERYDETAILS',action),/TASK_DETAILS_ONLY_SCOPE/);count++;
}
assert.throws(()=>r.ctx.tmv3_operationPatchTask_(19083,{Id:19083,Description:'forbidden'},'SERVICEDELIVERYDETAILS'),/OUTSIDE_FRESH_CONTRACT/);count++;
assert.throws(()=>r.ctx.tmv3_operationAssignmentRequest_(19083,{id:99,type:'employee'},'delete','SERVICEDELIVERYDETAILS'),/OUTSIDE_FRESH_CONTRACT/);count++;
console.log('PASS: '+count+' autonomous Service/Delivery details, scope, title, ownership, uncertainty and read-back cases.');

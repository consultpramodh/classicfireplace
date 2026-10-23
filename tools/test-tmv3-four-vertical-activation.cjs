// JavaScript / Node.js: exact status gates, scoped execution, bounded scheduling and uncertain-write reconciliation.
'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const dir=process.env.TMV3_TEST_SOURCE_DIR || 'apps-script/tmv3-clean';
class FixedDate extends Date{constructor(...a){super(...(a.length?a:['2026-10-23T19:00:00Z']));}static now(){return Date.parse('2026-10-23T19:00:00Z');}}
const values={},mail=[],audit=[];let release=0,fetchCount=0,order;
const props={getProperty:k=>values[k]||null,setProperty:(k,v)=>{values[k]=String(v);return props;},deleteProperty:k=>delete values[k]};
const c={Date:FixedDate,console,Logger:{log(){}},PropertiesService:{getScriptProperties:()=>props},LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock:()=>release++})},MailApp:{getRemainingDailyQuota:()=>100,sendEmail:x=>mail.push(x)},Utilities:{DigestAlgorithm:{SHA_256:'sha256'},Charset:{UTF_8:'utf8'},computeDigest:(_,s)=>Array.from(crypto.createHash('sha256').update(s).digest()),formatDate:(d,tz,p)=>p==='H'?'15':new Intl.DateTimeFormat('en-CA',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(d))}};
vm.createContext(c);for(const f of fs.readdirSync(dir).filter(f=>f.endsWith('.js')).sort())vm.runInContext(fs.readFileSync(dir+'/'+f,'utf8'),c,{filename:f});
let cases=0;const check=(a,b)=>{assert.equal(a,b);cases++;};const throws=(fn)=>{assert.throws(fn);cases++;};
c.tmv3_fetchJson_=()=>{fetchCount++;return order;};c.tmv3_audit_=(...a)=>audit.push(a);
for(const vertical of ['Service','Delivery','Install'])for(const [id,name]of [[18,'Incomplete'],[19,'Quoted'],[20,'Pending Approval'],[21,'Declined'],[22,'Approved'],[23,'Canceled'],[24,'Lost'],[25,'In Progress'],[27,'Completed']]){
  order={Id:123,OrderNumber:'585000',Customer:{Id:456},Status:{Id:id,Name:name},Contact:{Id:789},ShipToLocation:{Id:888}};
  const allowed=vertical==='Service'?id===25:id===22;
  if(allowed){const r=c.tmv3_taskFirstFreshOrderOwnershipById_(123,456,'SO#585000',vertical);check(r.verified,true);check(r.contactId,'789');check(r.locationId,'888');}
  else throws(()=>c.tmv3_taskFirstFreshOrderOwnershipById_(123,456,'SO#585000',vertical));
}
order={Id:123,OrderNumber:'585000',Customer:{Id:456},Status:{Id:22,Name:'In Progress'}};throws(()=>c.tmv3_taskFirstFreshOrderOwnershipById_(123,456,'SO#585000','Install'));
order.Status={Id:999,Name:'Approved'};throws(()=>c.tmv3_taskFirstFreshOrderOwnershipById_(123,456,'SO#585000','Delivery'));
order.Status={Name:'Approved'};check(c.tmv3_taskFirstFreshOrderOwnershipById_(123,456,'SO#585000','Delivery').verified,true);
throws(()=>c.tmv3_taskFirstFreshOrderOwnershipById_(123,999,'SO#585000','Delivery'));throws(()=>c.tmv3_taskFirstFreshOrderOwnershipById_(123,456,'SO#585001','Delivery'));
const beforeUnknown=fetchCount;throws(()=>c.tmv3_taskFirstFreshOrderOwnershipById_(123,456,'SO#585000'));check(fetchCount,beforeUnknown);
check(c.tmv3_operationWritesEnabled_('AUTO'),false);check(c.tmv3_operationWritesEnabled_('MANUAL'),false);check(c.tmv3_operationWritesEnabled_('PREINSPECTIONAUTO'),true);check(c.tmv3_operationWritesEnabled_('VERTICALAUTO'),false);
for(const vertical of ['Service','Delivery','Install']){c.tmv3_verticalProductionCycle_.context={vertical};check(c.tmv3_operationWritesEnabled_('VERTICALAUTO'),true);}
c.tmv3_verticalProductionCycle_.context={vertical:'PreInspection'};check(c.tmv3_operationWritesEnabled_('VERTICALAUTO'),false);delete c.tmv3_verticalProductionCycle_.context;
const executor=c.tmv3_executeFreshStep7Selection_;
throws(()=>executor({contract:{vertical:'Install',eventId:'x'}},'VERTICALAUTO','ALL'));
c.tmv3_verticalProductionCycle_.context={vertical:'Service',eventId:'x',contractJson:JSON.stringify({vertical:'Service',eventId:'x',actions:['CREATE_TASK']})};
throws(()=>executor({contract:{vertical:'Service',eventId:'x',actions:['CREATE_TASK']}},'VERTICALAUTO','ALL'));delete c.tmv3_verticalProductionCycle_.context;
// Run the real worker orchestration with canonical boundary stubs. No external calls.
const record={vertical:'Service',eventId:'event',fingerprint:'fingerprint',start:'2026-10-26T10:00:00-04:00',orderNumber:'585000'};
let plan={vertical:'Service',eventId:'event',taskId:123,plan:'PATCH_DATES',disposition:'MATCH_EXISTING',actions:['PATCH_DATES'],blocker:''};
let calls=0,taskMutations=0,shouldFail=false,budget=200,rows=[{'Event ID':'event','Calendar Start':'2026-10-26T10:00:00-04:00'}];
c.tmv3_strivenApiBudgetStatus_=()=>({remaining:budget,exhausted:false});c.tmv3_rows_=()=>rows;c.tmv3_findFreshEventRecord_=()=>record;c.tmv3_step7FreshPlansForEvent_=()=>[plan];c.tmv3_verticalEnrichEvidence_=()=>({status:'EVIDENCE_REFRESHED'});
c.tmv3_executeFreshStep7Selection_=(selection,scope)=>{calls++;check(scope,'VERTICALAUTO');check(c.tmv3_operationWritesEnabled_(scope),true);if(shouldFail)throw Error('transport uncertainty');if(selection.contract.actions.some(a=>a!=='VERIFY_CALENDAR_LINKS'))taskMutations++;return {status:'VERIFIED_CONVERGENCE',taskId:123};};
let result=c.tmv3_verticalProductionCycle_('Service');check(result.status,'VERIFIED_CONVERGENCE');check(taskMutations,1);check(result.transactionsVerified,1);check(c.tmv3_operationWritesEnabled_('VERTICALAUTO'),false);check(release,1);
result=c.tmv3_verticalProductionCycle_('Service');check(result.status,'THROTTLED');check(calls,1);
values.TMV3_VERTICAL_LAST_Service='0';budget=0;result=c.tmv3_verticalProductionCycle_('Service');check(result.status,'API_BUDGET_WAIT');check(calls,1);budget=200;
values.TMV3_VERTICAL_LAST_Service='0';plan={...plan,blocker:'Identity unresolved'};result=c.tmv3_verticalProductionCycle_('Service');check(result.results[0].status,'REVIEW');check(calls,1);
values.TMV3_VERTICAL_LAST_Service='0';plan={...plan,blocker:'',actions:['CREATE_TASK']};result=c.tmv3_verticalProductionCycle_('Service');check(calls,1);check(result.results[0].status,'REVIEW');
values.TMV3_VERTICAL_LAST_Service='0';plan={...plan,actions:['PATCH_DATES']};shouldFail=true;result=c.tmv3_verticalProductionCycle_('Service');check(result.results[0].status,'UNCERTAIN_RECONCILIATION_REQUIRED');check(mail.length,1);check(c.tmv3_operationWritesEnabled_('VERTICALAUTO'),false);
values.TMV3_VERTICAL_LAST_Service='0';const previousCalls=calls;shouldFail=false;result=c.tmv3_verticalProductionCycle_('Service');check(calls,previousCalls);check(result.results[0].status,'UNCERTAIN_RECONCILIATION_REQUIRED');
values.TMV3_VERTICAL_LAST_Service='0';plan={...plan,plan:'NO_CHANGE',actions:['VERIFY_CALENDAR_LINKS']};result=c.tmv3_verticalProductionCycle_('Service');check(result.status,'VERIFIED_CONVERGENCE');check(taskMutations,1);check(result.writes,0);
values.TMV3_VERTICAL_LAST_Service='0';plan={...plan,actualRequestedById:'999',actualRequestedByType:'employee',expectedRequestedById:'789',expectedRequestedByType:'contact'};result=c.tmv3_verticalProductionCycle_('Service');check(result.results[0].status,'REVIEW_EXISTING_REQUESTED_BY_CONFLICT');
// Installer adds exactly one timer, preserves unrelated triggers, and deduplicates only itself.
let triggers=[{handler:'tmv3_preInspectionCheck0800'}],created=0;
c.ScriptApp={getProjectTriggers:()=>triggers.map(t=>({...t,getHandlerFunction:()=>t.handler})),deleteTrigger:t=>{const i=triggers.findIndex(x=>x===t||x.handler===t.handler);triggers.splice(i,1);},newTrigger:handler=>{const b={timeBased:()=>b,everyHours:n=>{check(n,1);return b;},create:()=>{triggers.push({handler});created++;}};return b;}};c.tmv3_listTriggers=()=>triggers;
check(c.tmv3_installVerticalProductionTrigger().status,'VERTICAL_TRIGGER_VERIFIED');c.tmv3_installVerticalProductionTrigger();check(created,1);check(triggers.some(t=>t.handler==='tmv3_preInspectionCheck0800'),true);
// The reminder has an independent production feature gate instead of the Stage7 mutation gate.
c.tmv3_sendInstallMissingSoReminders_=scope=>({status:'REMINDER_CALLED',scope});check(c.tmv3_installReminderCheck().status,'REMINDER_CALLED');
check(vm.runInContext("TMV3_HARD_RULES.Service.requiredSalesOrderStatus",c),'In Progress');check(vm.runInContext("TMV3_HARD_RULES.Install.requiredSalesOrderStatus",c),'Approved');check(vm.runInContext("TMV3_HARD_RULES.Delivery.requiredSalesOrderStatus",c),'Approved');
console.log('PASS: '+cases+' four-vertical status/scope/worker/trigger safety cases');

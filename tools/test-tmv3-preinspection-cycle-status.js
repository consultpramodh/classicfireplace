const fs=require('fs'),vm=require('vm'),assert=require('assert');
const source=fs.readFileSync(__dirname+'/../apps-script/tmv3-clean/60_Automation.js','utf8');
const start=source.indexOf('function tmv3_preInspectionAutomationCycle_(');
const end=source.indexOf('\nfunction ',start+10);
function run(blocked,pending){
 const props={TMV3_PI_PENDING_EVENTS:JSON.stringify(pending?['event']:[])};
 const record={eventId:'event',vertical:'PreInspection',calendarRole:'PRIMARY_SHARED',fingerprint:'same'};
 const plan=blocked?{plan:'NO_RECONCILIATION_STEP6_NOT_RUN',blocker:'Ambiguous location',actions:[]}:{plan:'NO_CHANGE',blocker:'',taskId:'123',actions:[]};
 const ctx={TMV3:{OPERATIONS:{}},LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock:()=>{}})},PropertiesService:{getScriptProperties:()=>({getProperty:k=>props[k],setProperty:(k,v)=>props[k]=v})},
 tmv3_operationWritesEnabled_:()=>true,tmv3_refreshOperationalSourcesIfNeeded_:()=>{},tmv3_preInspectionIntakeRecords_:()=>[record],tmv3_clean_:v=>String(v||''),tmv3_preInspectionSendMissingDetails_:()=>({sent:0}),tmv3_restorePreInspectionLegacyTitle_:()=>({writes:0}),tmv3_hash_:x=>x,tmv3_preInspectionPromoteCandidate_:r=>({status:'PRIMARY',record:r}),tmv3_step7FreshPlansForEvent_:()=>[plan],tmv3_preInspectionOptionalOrderLocationEvidence_:()=>({status:'ORDER_NOT_UNIQUE'}),tmv3_findFreshEventRecord_:()=>record,tmv3_preInspectionCompletionVerified_:()=>!blocked,tmv3_audit_:()=>{},tmv3_preInspectionFailureAlert_:()=>{}};
 vm.createContext(ctx);vm.runInContext(source.slice(start,end),ctx);return {result:ctx.tmv3_preInspectionAutomationCycle_({force:true,eventId:'event'}),props};
}
for(const pending of [false,true]){const {result,props}=run(true,pending);assert.equal(result.status,'ATTENTION');assert.equal(result.results[0].status,'ATTENTION');assert.deepEqual(JSON.parse(props.TMV3_PI_PENDING_EVENTS),['event']);assert.equal(result.writes,0);}
const {result,props}=run(false,true);assert.equal(result.status,'COMPLETE');assert.deepEqual(JSON.parse(props.TMV3_PI_PENDING_EVENTS),[]);
console.log('3 native cycle status scenarios passed');

// JavaScript / Node.js: Install permission isolation, failure paths and readback.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const dir=path.join(__dirname,'../apps-script/tmv3-clean');
const text=f=>fs.readFileSync(path.join(dir,f),'utf8');
const operations=text('58_Operations.js'),automation=text('60_Automation.js');
function fn(source,name){const a=source.indexOf('function '+name+'(');assert(a>=0,name);const b=source.indexOf('\nfunction ',a+10);return source.slice(a,b<0?undefined:b);}
let count=0;
function check(value,message){assert(value,message);count++;}
const base={vertical:'Install',eventId:'exact',taskId:123,taskStatus:'Open',expectedCustomerId:7,expectedOrderId:8,
 expectedLocationId:9,expectedRequestedById:10,expectedRequestedByType:'contact',blocker:'',actions:['PATCH_DATES'],plan:'PATCH_REQUIRED'};
function env(options={}){
 const values={},calls={execute:0,refresh:0,plan:0,audit:0,release:0};
 const policy={installAutomationEnabled:true,installAutomationCanaryEventId:'exact',installAutomationIntervalMinutes:60,
 manualWritesEnabled:false,automationWritesEnabled:false,...options.policy};
 const plan={...base,...options.plan};
 const after={...plan,plan:'NO_CHANGE',actions:['VERIFY_CALENDAR_LINKS'],...options.after};
 const execution={status:'VERIFIED_CONVERGENCE',calendarLinks:{status:'CALENDAR_LINKS_VERIFIED'},...options.execution};
 const ctx={TMV3:{MODE:options.mode||'PRODUCTION_WRITE',OPERATIONS:policy},TMV3_TIMEZONE:'America/Toronto',Date,
 tmv3_executionStage_:()=>options.stage??7,
 tmv3_clean_:v=>String(v??'').trim(),tmv3_norm_:v=>String(v??'').trim().toLowerCase(),
 tmv3_taskIsOpen_:s=>String(s).toLowerCase()==='open',tmv3_assertHardRules_:()=>{},tmv3_hash_:v=>v,
 Utilities:{formatDate:(_,tz,p)=>p==='H'?String(options.hour??10):String(options.weekday??1)},
 LockService:{getScriptLock:()=>({tryLock:()=>options.lock!==false,releaseLock:()=>calls.release++})},
 PropertiesService:{getScriptProperties:()=>({getProperty:k=>values[k]||null,setProperty:(k,v)=>values[k]=v})},
 tmv3_strivenApiBudgetStatus_:()=>options.budget||{remaining:100,exhausted:false},
 tmv3_operationalSourceMinAgeMinutes_:()=>120,
 tmv3_masterSourceMinAgeMinutes_:()=>360,
 tmv3_operationalSourceRefreshState_:()=>({ageMinutes:options.operationalAge===undefined?5:options.operationalAge}),
 tmv3_masterSourceRefreshState_:()=>({ageMinutes:options.masterAge===undefined?5:options.masterAge}),
 tmv3_refreshOperationalSourcesIfNeeded_:()=>{calls.refresh++;if(options.refreshError)throw Error('refresh failed');},
 tmv3_findFreshEventRecord_:()=>({vertical:'Install',eventId:'exact',start:new Date(Date.now()+86400000),
 end:new Date(Date.now()+90000000),...options.record}),
 tmv3_step2ClassifyCalendarRecord_:()=>({disposition:options.eligibility||'ELIGIBLE'}),
 tmv3_step7FreshPlansForEvent_:()=>{calls.plan++;return calls.plan===1?(options.plans||[plan]):[after];},
 tmv3_executeFreshStep7Selection_:()=>{calls.execute++;if(options.executeError)throw Error('uncertain patch');return execution;},
 tmv3_audit_:()=>calls.audit++,Logger:{log:()=>{}}};
 vm.createContext(ctx);
 vm.runInContext(operations.slice(operations.indexOf('function tmv3_operationPolicy_()'),operations.indexOf('function tmv3_selectedContext_()')),ctx);
 for(const name of ['tmv3_installCanaryCycle_','tmv3_installCompletionVerified_'])vm.runInContext(fn(automation,name),ctx);
 return {ctx,calls,values,run:()=>ctx.tmv3_installCanaryCycle_()};
}
let e=env();check(e.run().status==='INSTALL_EXISTING_TASK_VERIFIED','verified exact event');check(e.calls.execute===1,'one transaction');
check(e.run().status==='THROTTLED'&&e.calls.execute===1,'scheduled repeat consumes no extra transaction');
for(const options of [{mode:'SHADOW_READ_ONLY'},{mode:'CANARY_WRITE'},{stage:6},{stage:8},{policy:{installAutomationEnabled:false}},
 {policy:{installAutomationCanaryEventId:''}},{policy:{manualWritesEnabled:true}},{policy:{automationWritesEnabled:true}}]){
 e=env(options);check(e.run().status==='INSTALL_GATED'&&e.calls.refresh===0&&e.calls.execute===0,'gate before reads');
}
for(const options of [{hour:6},{hour:19},{weekday:6},{weekday:7}]){e=env(options);check(e.run().status==='OUTSIDE_INSTALL_BUSINESS_HOURS'&&e.calls.refresh===0,'hours/weekends');}
e=env({lock:false});check(e.run().status==='LOCK_BUSY'&&e.calls.refresh===0,'lock');
for(const budget of [{exhausted:true,remaining:100},{remaining:29},{remaining:NaN}]){e=env({budget});check(e.run().status==='API_HEADROOM_REQUIRED'&&e.calls.execute===0,'budget');}
for(const options of [{operationalAge:120},{operationalAge:null},{operationalAge:-1},{masterAge:360},{masterAge:NaN},
 {record:{start:'invalid'}},{record:{start:'2020-01-01'}},
 {record:{end:'2020-01-01'}},{record:{status:'cancelled'}},{eligibility:'SKIP'},{plans:[]},{plans:[base,base]}]){
 e=env(options);check(e.run().status==='ATTENTION'&&e.calls.execute===0&&e.calls.release===1,'preflight fails closed');
}
for(const patch of [{vertical:'Service'},{eventId:'other'},{taskId:0},{taskStatus:'Done'},
 {expectedCustomerId:0},{expectedOrderId:0},{expectedLocationId:0},{expectedRequestedById:0},
 {expectedRequestedByType:'employee'},{blocker:'conflict'},...['CREATE_TASK','RECREATE_TASK','CREATE_LOCATION','PATCH_TASK_NAME','PATCH_CALENDAR_TITLE','UNKNOWN'].map(a=>({actions:[a]}))]){
 e=env({plan:patch});check(e.run().status==='ATTENTION'&&e.calls.execute===0,'contract scope rejects '+JSON.stringify(patch));
}
for(const options of [{executeError:true},{execution:{status:'PLAN_CHANGED_NO_WRITE'}},
 {execution:{calendarLinks:null}},{after:{taskId:999}},{after:{eventId:'other'}},{after:{vertical:'Delivery'}},
 {after:{blocker:'conflict'}},{after:{actions:['PATCH_DATES']}},{after:{taskStatus:'Done'}},{after:{plan:'PATCH_REQUIRED'}},
 {after:{expectedCustomerId:''}},{after:{expectedOrderId:''}},{after:{expectedLocationId:''}},
 {after:{expectedRequestedById:''}},{after:{expectedRequestedByType:'employee'}}]){
 e=env(options);check(e.run().status==='ATTENTION','no false convergence');
}
// Actual dispatcher must enforce scope before even considering a changed plan.
e=env();e.ctx.tmv3_step7PlanChangedResult_=()=>{throw Error('must not reach plan');};
vm.runInContext(fn(operations,'tmv3_executeFreshStep7Selection_'),e.ctx);
assert.throws(()=>e.ctx.tmv3_executeFreshStep7Selection_({contract:{...base,vertical:'Service'}},'INSTALLAUTO','ALL'),/INSTALL_EXACT_EVENT_REQUIRED/);count++;
check(/installAutomationEnabled: false/.test(text('00_Config.js')),'release disabled');
check(fn(automation,'tmv3_scheduledOperations').includes('tmv3_installCanaryCycle_()'),'existing scheduler integration');
check(!fn(automation,'tmv3_installCanaryCycle_').includes('MailApp'),'no notification side effects');
for(const scenario of ['normal','cap','budget','blocked','multiple','lifecycle','error']) {
 e=env({policy:{installAutomationEnabled:false}});
 e.ctx.TMV3.VERTICALS={Install:{calendarIds:['install-calendar']}};
 e.ctx.tmv3_iso_=d=>new Date(d).toISOString();
 e.ctx.CalendarApp={getCalendarById:id=>{assert.equal(id,'install-calendar');return {
  getEvents:()=>Array.from({length:scenario==='cap'?26:1},(_,i)=>({eventId:'e'+i,vertical:'Install'}))};}};
 e.ctx.tmv3_calendarEvent_=(vertical,cfg,cal,event)=>{assert.equal(vertical,'Install');return event;};
 if(scenario==='budget')e.ctx.tmv3_strivenApiBudgetStatus_=()=>({remaining:29});
 e.ctx.tmv3_step7FreshPlansForEvent_=()=>{
  if(scenario==='error')throw Error('read unavailable');
  if(scenario==='multiple')return [base,base];
  return [{...base,plan:'NO_CHANGE',actions:scenario==='lifecycle'?['CREATE_TASK']:[],blocker:scenario==='blocked'?'ownership conflict':''}];
 };
 vm.runInContext(fn(text('90_Admin.js'),'tmv3_installReadinessAudit'),e.ctx);
 const audit=e.ctx.tmv3_installReadinessAudit();
 check(audit.liveAcceptanceComplete===false&&audit.cacheRefreshPerformed===false,'audit never certifies runtime');
 check(e.calls.execute===0&&e.calls.refresh===0,'audit no writes/refresh');
 if(scenario==='cap')check(audit.status==='PARTIAL_EVENT_CAP'&&audit.eventsExamined===25,'bounded cap cannot claim full coverage');
 if(scenario==='budget')check(audit.status==='PARTIAL_API_HEADROOM_REQUIRED'&&audit.eventsExamined===0,'audit budget');
 if(['blocked','multiple','error'].includes(scenario))check(audit.blocked===1,'explicit blockers');
 if(scenario==='lifecycle')check(audit.results[0].status==='LIFECYCLE_ACCEPTANCE_REQUIRED','lifecycle stays visible');
}
console.log('PASS: '+count+' Install readiness/scope/transaction/readback cases');

// JavaScript / Node.js: visit-type boundaries, source exclusions and canonical execution.
'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const dir=process.env.TMV3_TEST_SOURCE_DIR||path.join(__dirname,'../apps-script/tmv3-clean');
const props={};let calls=0,stored=0;
const ctx={console,PropertiesService:{getScriptProperties:()=>({getProperty:k=>props[k]||null,setProperty:(k,v)=>{props[k]=v;stored++;}})}};
vm.createContext(ctx);for(const f of fs.readdirSync(dir).filter(f=>f.endsWith('.js')).sort())vm.runInContext(fs.readFileSync(path.join(dir,f),'utf8'),ctx,{filename:f});
const actualCycle=ctx.tmv3_preInspectionAutomationCycle_;
ctx.tmv3_audit_=()=>{};ctx.tmv3_iso_=v=>new Date(v).toISOString();
const base={vertical:'PreInspection',calendarRole:'SECONDARY_STEPHEN',eventId:'fixture@google.com',calendarId:'secondary',title:'Customer 416-555-0100',phone:'416-555-0100',location:'1 Test St, Toronto',start:'2026-11-02T18:00:00Z',creator:'sales@classicfireplace.ca',descriptionClean:''};
const cfg=vm.runInContext('TMV3.VERTICALS.PreInspection',ctx);
function decide(change){calls++;return ctx.tmv3_preInspectionDiscoveryDecision_({...base,...change},cfg);}
assert.equal(decide({}).status,'REVIEW_VISIT_TYPE');
assert.equal(decide({descriptionClean:'Stuv 21'}).status,'REVIEW_VISIT_TYPE');
assert.equal(decide({descriptionClean:'Return to measure filler strips. Install booked later.'}).reason,'RETURN_OR_MEASURING_VISIT_UNCONFIRMED');
assert.equal(decide({descriptionClean:'Go back to measure mantle.'}).status,'REVIEW_VISIT_TYPE');
for(const email of ['stephen','jay','trevor','pramodh','thang'])assert.equal(decide({creator:email+'@classicfireplace.ca',title:'Preinspect customer'}).reason,'EXCLUDED_CREATOR');
assert.equal(decide({creator:'steve@classicfireplace.ca'}).status,'REVIEW_VISIT_TYPE');
assert.equal(decide({descriptionClean:'Previous preinspection was completed last year.'}).status,'REVIEW_VISIT_TYPE');
assert.equal(decide({title:'Preinspection not required'}).status,'IGNORE');
assert.equal(decide({creator:'sales@example.invalid'}).reason,'CREATOR_UNVERIFIED');
assert.equal(decide({creator:''}).reason,'CREATOR_UNVERIFIED');
assert.equal(decide({creator:'sales@classicfireplace.ca,other@classicfireplace.ca'}).reason,'CREATOR_UNVERIFIED');
assert.equal(decide({isAllDay:true}).status,'IGNORE');
assert.equal(decide({status:'cancelled'}).status,'IGNORE');
assert.equal(decide({phone:''}).status,'IGNORE');
assert.equal(decide({location:''}).status,'IGNORE');
assert.equal(decide({title:'Pre-inspection customer'}).status,'EXPLICIT_PREINSPECTION');
assert.equal(decide({descriptionClean:'Preinspect the fireplace before install'}).status,'EXPLICIT_PREINSPECTION');
for(const descriptionClean of ['Not a preinspection','No pre-inspect','not pre inspection'])assert.equal(decide({descriptionClean}).reason,'EXPLICIT_NOT_PREINSPECTION');
const list=Array.from({length:80},(_,i)=>({...base,eventId:i+'@google.com',status:'REVIEW_VISIT_TYPE',reason:'CUSTOMER_VISIT_TYPE_UNCONFIRMED',title:'界'.repeat(100)}));
const state=ctx.tmv3_preInspectionStoreDiscovery_(list);assert.equal(state.total,80);assert(state.truncated);assert(Buffer.byteLength(props.TMV3_PI_DISCOVERY)<9000);assert(state.records.length<80);calls++;
ctx.tmv3_preInspectionStoreDiscovery_([]);assert.equal(ctx.tmv3_preInspectionDiscoveryStatus().total,0);calls++;
let options,refresh=0;ctx.tmv3_preInspectionAutomationCycle_=o=>{options=o;return {status:'TEST'};};ctx.tmv3_refreshAutomationSheetsAfter_=()=>{refresh++;return {status:'TEST'};};
assert.throws(()=>ctx.tmv3_reconcilePreInspectionEvent('invalid'));assert.equal(refresh,0);calls++;
ctx.tmv3_reconcilePreInspectionEvent('fixture@google.com');assert.equal(options.eventId,'fixture@google.com');assert.equal(options.force,true);assert.equal(refresh,1);calls++;
const src=fs.readFileSync(path.join(dir,'60_Automation.js'),'utf8');
for(const slot of ['0800','1300','1700'])assert(src.includes('function tmv3_preInspectionCheck'+slot+'() { return tmv3_runPreInspectionDailySlot_('));
assert(src.includes('tmv3_preInspectionIntakeRecords_({recordDiscovery:true,resolveLikely:true})'));assert(src.includes("return {status:'RETIRED_FIVE_MINUTE_SCHEDULE',writes:0}"));calls+=5;
// Intake integration: primary copies prevent duplicate discovery; unknown candidates never enter execution.
ctx.tmv3_calendarEvent_=(_v,_cfg,source,event)=>({...event,calendarRole:source.role,calendarId:source.calendarId});
ctx.tmv3_verticalCalendars_=()=>[{calendarId:'primary',role:'PRIMARY_SHARED'}];
ctx.CalendarApp={getCalendarById:id=>({getEvents:()=>id==='primary'?[{...base,eventId:'primary@google.com'}]:[{...base,eventId:'primary@google.com'},{...base,eventId:'unknown@google.com'},{...base,eventId:'explicit@google.com',title:'Preinspect Customer'}]})};
const intake=ctx.tmv3_preInspectionIntakeRecords_({recordDiscovery:true,resolveLikely:true});
assert.deepEqual(Array.from(intake,x=>x.eventId).sort(),['explicit@google.com','primary@google.com']);
const queue=ctx.tmv3_preInspectionDiscoveryStatus();assert.equal(queue.total,2);assert.equal(queue.review,1);assert.equal(queue.explicit,1);assert(!queue.records.some(x=>x.eventId==='primary@google.com'));calls+=5;
// Recover a single surviving old copy title before parity overwrites it.
ctx.tmv3_assertOperationWrite_=()=>{};ctx.tmv3_titleMigrationStateForEvent_=()=>({preservedTitle:''});
const primaryId=cfg.primaryCalendarId,secondaryId=cfg.secondaryCalendarIds[0];
const event=(title)=>({title,description:'Human notes',getTitle(){return this.title;},getDescription(){return this.description;},setDescription(v){this.description=v;}});
const primary=event('123 - Fixture - (416) 555-0100'),secondary=event('#123-Fixture:(416) 555-0100');
ctx.tmv3_requiredCalendarCopiesForEvent_=()=>[primaryId,secondaryId];
ctx.tmv3_findEventCopyRobust_=id=>({event:id===primaryId?primary:secondary});
let migration;ctx.tmv3_recordTitleMigrationState_=(...args)=>{migration=args;};
const restored=ctx.tmv3_restorePreInspectionLegacyTitle_(base);
assert.equal(restored.writes,2);assert.equal(migration[3],secondary.title);assert(primary.description.startsWith(secondary.title));assert.equal(primary.description,secondary.description);calls+=4;
// A changed source cannot be invited based on stale scan evidence.
let freshSource,guestWrites=0;
ctx.CalendarApp={getCalendarById:()=>({getEvents:()=>[]})};
ctx.tmv3_findCalendarEventById_=(id)=>id===primaryId?null:{event:{getGuestList(){guestWrites++;return [];}}};
ctx.tmv3_calendarEvent_=()=>freshSource;
const explicit={...base,title:'Preinspect Fixture',fingerprint:'same'};
for(const change of [{creator:'jay@classicfireplace.ca'},{title:'Not preinspect Fixture'},{fingerprint:'changed'}]){
 freshSource={...explicit,...change};assert.throws(()=>ctx.tmv3_preInspectionPromoteCandidate_(explicit),/SOURCE_(?:INTENT_OR_CREATOR_NOT_AUTHORIZED|CHANGED)_NO_INTAKE_WRITE/);calls++;
}
assert.equal(guestWrites,0);calls++;
// Pending recovery must reapply the same intent/creator gate as new discovery.
ctx.LockService={getScriptLock:()=>({tryLock:()=>true,releaseLock:()=>{}})};
ctx.tmv3_operationWritesEnabled_=()=>true;ctx.tmv3_refreshOperationalSourcesIfNeeded_=()=>{};
ctx.tmv3_strivenApiBudgetStatus_=()=>({exhausted:false,remaining:1000,count:0});
ctx.tmv3_preInspectionIntakeRecords_=()=>[];
for(const recovered of [{...explicit,creator:'jay@classicfireplace.ca'},{...explicit,title:'Not preinspect Fixture'}]){
 props.TMV3_PI_PENDING_EVENTS=JSON.stringify([recovered.eventId]);ctx.tmv3_preInspectionRecoveryRecord_=()=>recovered;
 const result=actualCycle({force:true,eventId:recovered.eventId});assert.equal(result.processed,0);assert.equal(result.status,'COMPLETE');assert.equal(props.TMV3_PI_PENDING_EVENTS,'[]');calls++;
}
const morning=fs.readFileSync(path.join(dir,'80_MorningOps.js'),'utf8');
assert(morning.includes("['DISCOVERY',discovery.total || 0,'VISIT TYPE REVIEW',discovery.review || 0"));
assert(!/totalAttention\+\+/.test(morning.slice(morning.indexOf('const discovery='),morning.indexOf('const values = []'))));calls+=2;
console.log(JSON.stringify({status:'PASS',cases:calls,metadataWrites:stored,businessWrites:0}));

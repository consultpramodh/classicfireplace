// JavaScript / Node.js: execute real candidate classifier with controlled API responses.
'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const dir=process.env.TMV3_TEST_SOURCE_DIR||path.join(__dirname,'../apps-script/tmv3-clean');
const ctx={console};vm.createContext(ctx);for(const f of fs.readdirSync(dir).filter(f=>f.endsWith('.js')).sort())vm.runInContext(fs.readFileSync(path.join(dir,f),'utf8'),ctx);
const cfg=vm.runInContext('TMV3.VERTICALS.PreInspection',ctx);
const base={vertical:'PreInspection',eventId:'fixture@google.com',fingerprint:'fp',title:'Customer 416-555-0100',phone:'4165550100',location:'1 Test St, Toronto',creator:'sales@classicfireplace.ca',orderNumber:'586242',descriptionClean:''};
let customerId=63005,site=58625,statusId=19,statusName='Quoted',searchTotal=1,searchCount=1,fail=false,calls=0;
ctx.tmv3_step4IdentityIndex_=()=>({});ctx.tmv3_step4ResolveCustomerFromCalendarEvidence_=()=>({customer:{'Customer ID':customerId}});
ctx.tmv3_preInspectionCustomerLocationsFresh_=()=>[{'Customer ID':63005,'Location ID':58625}];
ctx.tmv3_addressStrongMatch_=()=>true;ctx.tmv3_locationFullAddress_=()=>base.location;
ctx.tmv3_fetchJson_=(url,opts)=>{calls++;if(fail)throw Error('HTTP 503');if(url.endsWith('/search'))return {data:Array.from({length:searchCount},()=>({id:27976,number:'586242'})),totalCount:searchTotal};return {id:27976,orderNumber:'586242',customer:{id:63005},shipToLocation:{id:site},status:{id:statusId,name:statusName}};};
let cases=0;function check(expected,change={}){const r=ctx.tmv3_preInspectionClassifyLikely_({...base,...change},cfg,true);assert.equal(r.status,expected,JSON.stringify(r));cases++;return r;}
check('EXPLICIT_PREINSPECTION');
for(const title of ['Service Customer 416-555-0100','Delivery Customer 416-555-0100','Install Customer 416-555-0100'])check('REVIEW_VISIT_TYPE',{title});
check('REVIEW_VISIT_TYPE',{descriptionClean:'Maintenance visit'});
statusId=22;statusName='Approved';check('INSTALLATION');statusId=25;statusName='In Progress';assert.equal(check('REVIEW_VISIT_TYPE').reason,'IN_PROGRESS_ORDER_TYPE_UNVERIFIED');
statusId=19;statusName='Quoted';check('EXPLICIT_PREINSPECTION',{orderNumber:''});
check('REVIEW_VISIT_TYPE',{descriptionClean:'Return to measure filler. Install booked Nov 16.'});
statusId=22;statusName='Quoted';check('REVIEW_VISIT_TYPE');statusName='Approved';site=999;check('REVIEW_VISIT_TYPE');site=58625;
customerId=999;check('REVIEW_VISIT_TYPE');customerId=63005;
searchTotal=2;check('REVIEW_VISIT_TYPE');searchTotal=1;fail=true;check('REVIEW_VISIT_TYPE');fail=false;
check('REVIEW_VISIT_TYPE',{descriptionClean:'SO#586242 / SO#586243'});
const before=calls;check('IGNORE',{creator:'jay@classicfireplace.ca'});check('IGNORE',{title:'Not preinspect customer'});assert.equal(check('REVIEW_VISIT_TYPE',{creator:''}).reason,'CREATOR_UNVERIFIED');assert.equal(check('REVIEW_VISIT_TYPE',{phone:''}).reason,'INSUFFICIENT_CUSTOMER_VISIT_EVIDENCE');assert.equal(calls,before);
statusId=19;statusName='Quoted';check('EXPLICIT_PREINSPECTION');statusId=22;statusName='Approved';check('INSTALLATION');
// Same fingerprint must still re-read status at the final pre-invite check.
assert(calls>before);

// A quote approved between intake and Task creation must be reclassified, including
// visits whose SO was inferred rather than authored in Calendar.
{
 const metadata={};ctx.tmv3_hash_=v=>String(v);ctx.PropertiesService={getScriptProperties:()=>({getProperty:k=>metadata[k]||null})};
 const plan={expectedCustomerId:'63005',expectedLocationId:'58625'};
 statusId=19;statusName='Quoted';assert.equal(ctx.tmv3_preInspectionOrderBeforeCreate_(base,plan).status,'FRESH_PREAPPROVAL_ORDER_VERIFIED');cases++;
 statusId=22;statusName='Approved';assert.throws(()=>ctx.tmv3_preInspectionOrderBeforeCreate_(base,plan),/REQUIRES_INSTALLATION/);cases++;
 statusId=25;statusName='In Progress';assert.throws(()=>ctx.tmv3_preInspectionOrderBeforeCreate_(base,plan),/IN_PROGRESS_ORDER_TYPE_UNVERIFIED/);cases++;
 assert.equal(ctx.tmv3_preInspectionOrderBeforeCreate_({...base,orderNumber:''},plan).status,'OPTIONAL_ORDER_NOT_ATTACHED');cases++;
 metadata['TMV3_PI_INFERRED_'+base.eventId]=JSON.stringify({orderId:27976,orderNumber:'586242',customerId:63005,locationId:58625});
 statusId=19;statusName='Quoted';assert.equal(ctx.tmv3_preInspectionOrderBeforeCreate_({...base,orderNumber:''},plan).status,'FRESH_PREAPPROVAL_ORDER_VERIFIED');cases++;
 statusId=22;statusName='Approved';assert.throws(()=>ctx.tmv3_preInspectionOrderBeforeCreate_({...base,orderNumber:''},plan),/REQUIRES_INSTALLATION/);cases++;
 assert.throws(()=>ctx.tmv3_preInspectionOrderBeforeCreate_({...base,orderNumber:''},{...plan,expectedCustomerId:'999'}),/EVIDENCE_CONFLICT/);cases++;
}

// Execute the actual canonical cycle: a missing primary copy must be promoted
// before any operation requiring both calendar copies. Asynchronous propagation
// must leave the event pending without running preservation or task resolution.
const props={};ctx.PropertiesService={getScriptProperties:()=>({getProperty:k=>props[k]||null,setProperty:(k,v)=>{props[k]=v;},deleteProperty:k=>{delete props[k];}})};
ctx.LockService={getScriptLock:()=>({tryLock:()=>true,releaseLock:()=>{}})};
ctx.tmv3_operationWritesEnabled_=()=>true;ctx.tmv3_refreshOperationalSourcesIfNeeded_=()=>{};
ctx.tmv3_strivenApiBudgetStatus_=()=>({remaining:1000,count:0,exhausted:false});
ctx.tmv3_preInspectionIntakeRecords_=()=>[{...base,calendarRole:'SECONDARY_STEPHEN'}];ctx.tmv3_preInspectionDiscoveryStatus=()=>({total:1});
ctx.tmv3_hash_=v=>String(v);
const sequence=[];let wait=false;
ctx.tmv3_preInspectionPromoteCandidate_=r=>{sequence.push('promote');return {status:wait?'WAITING_FOR_CF_COPY':'PRIMARY',record:{...r,calendarRole:wait?'SECONDARY_STEPHEN':'PRIMARY_SHARED'}};};
ctx.tmv3_restorePreInspectionLegacyTitle_=r=>{assert.equal(r.calendarRole,'PRIMARY_SHARED');sequence.push('preserve');return {writes:0};};
ctx.tmv3_step7FreshPlansForEvent_=()=>[{plan:'NO_CHANGE',actions:[],blocker:'',taskId:'19410'}];
ctx.tmv3_findFreshEventRecord_=()=>base;ctx.tmv3_preInspectionSendMissingDetails_=()=>({sent:0});
ctx.tmv3_preInspectionCompletionVerified_=()=>true;ctx.tmv3_preInspectionHistoricalCoverageVerified_=()=>false;
ctx.tmv3_preInspectionFailureAlert_=()=>{};ctx.tmv3_audit_=()=>{};
let cycle=ctx.tmv3_preInspectionAutomationCycle_({force:true,eventId:base.eventId});assert.equal(cycle.status,'COMPLETE',JSON.stringify(cycle));assert.deepEqual(sequence,['promote','preserve']);cases++;
sequence.length=0;wait=true;cycle=ctx.tmv3_preInspectionAutomationCycle_({force:true,eventId:base.eventId});assert.equal(cycle.status,'COMPLETE',JSON.stringify(cycle));assert.deepEqual(sequence,['promote']);assert(JSON.parse(props.TMV3_PI_PENDING_EVENTS).includes(base.eventId));cases++;
console.log(JSON.stringify({status:'PASS',cases,apiMockCalls:calls}));

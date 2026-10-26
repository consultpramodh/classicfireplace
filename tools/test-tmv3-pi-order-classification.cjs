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
check('EXPLICIT_PREINSPECTION');statusId=22;statusName='Approved';check('INSTALLATION');statusId=25;statusName='In Progress';check('INSTALLATION');
statusId=19;statusName='Quoted';check('EXPLICIT_PREINSPECTION',{orderNumber:''});
check('REVIEW_VISIT_TYPE',{descriptionClean:'Return to measure filler. Install booked Nov 16.'});
statusId=22;statusName='Quoted';check('REVIEW_VISIT_TYPE');statusName='Approved';site=999;check('REVIEW_VISIT_TYPE');site=58625;
customerId=999;check('REVIEW_VISIT_TYPE');customerId=63005;
searchTotal=2;check('REVIEW_VISIT_TYPE');searchTotal=1;fail=true;check('REVIEW_VISIT_TYPE');fail=false;
check('REVIEW_VISIT_TYPE',{descriptionClean:'SO#586242 / SO#586243'});
const before=calls;check('IGNORE',{creator:'jay@classicfireplace.ca'});check('IGNORE',{title:'Not preinspect customer'});assert.equal(calls,before);
statusId=19;statusName='Quoted';check('EXPLICIT_PREINSPECTION');statusId=22;statusName='Approved';check('INSTALLATION');
// Same fingerprint must still re-read status at the final pre-invite check.
assert(calls>before);console.log(JSON.stringify({status:'PASS',cases,apiMockCalls:calls}));

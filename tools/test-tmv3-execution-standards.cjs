'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const dir='apps-script/tmv3-vertical-split-staging/';
const scripts=['00_Configuration.gs','10_Shared_Core.gs','30_PreInspection.gs','40_Installation.gs','50_Delivery.gs','60_Service.gs'];
const source=Object.fromEntries(scripts.map(file=>[file,fs.readFileSync(dir+file,'utf8')]));
const ctx=vm.createContext({console:{log(){}},Date,Math,JSON,Object,String,Array,Number,RegExp,Error});
scripts.forEach(file=>new vm.Script(source[file],{filename:file}).runInContext(ctx));
const rules=vm.runInContext('TMV3_HARD_RULES',ctx);
assert.equal(ctx.tmv3_assertHardRules_().status,'PASS');
assert.equal(rules.GLOBAL.authority,'TMV3_HARD_RULES_IN_00_CONFIGURATION');
assert.equal(rules.PreInspection.presentation.linkHeading,'-----Striven Links-----');
ctx.tmv3_verifiedTitleContext_=()=>({verified:true,customerNumber:'63199',customerName:'Tomlin Family',phone:'(647) 500-0897',orderNumber:'586744',address:'325 Flagstone Terrace, Scarborough'});
const piCalendar=vm.runInContext('TMV3.VERTICALS.PreInspection.primaryCalendarId',ctx);
assert.equal(ctx.tmv3_desiredCalendarTitle_({vertical:'PreInspection',calendarRole:'PRIMARY_SHARED',calendarId:piCalendar}).value,'63199 - Tomlin Family - (647) 500-0897');
assert.equal(ctx.tmv3_desiredTaskName_({vertical:'PreInspection',calendarRole:'PRIMARY_SHARED',calendarId:piCalendar}).value,'Tomlin Family - 325 Flagstone Terrace, Scarborough - (647) 500-0897');
assert.equal(ctx.tmv3_desiredCalendarTitle_({vertical:'Install'}).value,'SO#586744 - Tomlin Family - (647) 500-0897');
for(const vertical of ['Delivery','Service'])assert.equal(ctx.tmv3_desiredCalendarTitle_({vertical}).status,'NOT_AUTHORIZED');
for(const vertical of ['Install','Delivery','Service']){
  const html=ctx.tmv3_verticalClickableDescription_('Original notes',{vertical,links:[
    {key:'ORDER',url:'https://example.invalid/order',label:'Sales Order – 586744'},
    {key:'TASK_19745',url:'https://example.invalid/task',label:'Task #19745 – Verified Task'}
  ]});
  assert.ok(html.includes(rules[vertical].presentation.linkHeading),'Header missing: '+vertical);
  assert.ok(html.includes('Original notes'),'Authored notes lost');
  assert.ok(html.includes('href='),'Links must be clickable');
}
assert.ok(fs.readFileSync('AGENTS.md','utf8').includes('TMV3_HARD_RULES'));
console.log(JSON.stringify({status:'PASS',rulesVersion:rules.version,verticals:['PreInspection','Install','Delivery','Service'],mode:'READ_ONLY_SYNTHETIC_REGRESSION'}));

// JavaScript / Node.js: fresh-state and clickable-link acceptance, with no business-write helpers.
'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const c={TMV3:{VERTICALS:{Install:{},Delivery:{calendarOrderLinkRequired:true},Service:{calendarOrderLinkRequired:true}},TASK_URL_BASE:'https://example.test/task?id=',ORDER_URL_BASE:'https://example.test/order/'}};vm.createContext(c);vm.runInContext(fs.readFileSync((process.env.TMV3_TEST_SOURCE_DIR||'week-repair-local')+'/60_Automation.js','utf8'),c);
const record={vertical:'Service',eventId:'event',fingerprint:'same'};
const plan={taskId:'123',expectedOrderId:'456',readStatus:'FRESH_TASK_GET',plan:'NO_CHANGE',blocker:'',inputFingerprint:'same',customerCheck:'MATCH',orderCheck:'MATCH',locationCheck:'MATCH',actions:['VERIFY_CALENDAR_LINKS']};
let text='<a href="https://example.test/task?id=123">Actual Task</a><a href="https://example.test/order/456">Order</a>',found=true;
c.tmv3_requiredCalendarCopiesForEvent_=()=>['calendar'];c.tmv3_findEventCopyRobust_=()=>found?{event:{getDescription:()=>text}}:null;
assert.equal(c.tmv3_weeklyAlreadyAligned_(record,[plan]),true);
for(const change of [{readStatus:'CACHE'},{plan:'PATCH_DATES'},{blocker:'REVIEW'},{inputFingerprint:'changed'},{customerCheck:'CONFLICT'},{orderCheck:'CONFLICT'},{locationCheck:'CONFLICT'},{actions:['PATCH_TASK_NAME']},{taskId:''}])assert.equal(c.tmv3_weeklyAlreadyAligned_(record,[{...plan,...change}]),false);
for(const bad of ['[Task](https://example.test/task?id=123)','https://example.test/task?id=123','<a href="https://example.test/task?id=999">Wrong Task</a>',text+'<a href="https://example.test/task?id=124">Other</a>',text+'<a href="https://example.test/task?id=123">Duplicate</a>']){text=bad;assert.equal(c.tmv3_weeklyAlreadyAligned_(record,[plan]),false);}
text='<a href="https://example.test/task?id=123">Task</a><a href="https://example.test/order/456">Order</a>';found=false;assert.equal(c.tmv3_weeklyAlreadyAligned_(record,[plan]),false);found=true;
assert.equal(c.tmv3_weeklyAlreadyAligned_({...record,vertical:'PreInspection'},[plan]),false);assert.equal(c.tmv3_weeklyAlreadyAligned_(record,[plan,plan]),false);
text+='<a href="https://example.test/task?id=124">Sibling</a>';assert.equal(c.tmv3_weeklyAlreadyAligned_(record,[plan,{...plan,taskId:'124'}]),true);
assert.equal(c.tmv3_weeklyAlreadyAligned_(record,[plan,{...plan,taskId:'124',expectedOrderId:'wrong'}]),false);
console.log('PASS: 20 read-only fast-path guards; no write helper is available in this test runtime');

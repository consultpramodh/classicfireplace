// JavaScript: actual link builder contract; synthetic identity, no external calls.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../apps-script/tmv3-clean/35_CalendarLinks.js'),'utf8');
const ctx={TMV3:{VERTICALS:{PreInspection:{calendarTaskLinkRequired:true}},
 CUSTOMER_ORDERS_PAGE_BASE:'https://example.invalid/orders?customer=',TASK_URL_BASE:'https://example.invalid/task/'},
 tmv3_unique_:v=>Array.from(new Set(v)),tmv3_clean_:v=>String(v??'').trim(),tmv3_titlePhoneDisplay_:v=>v};
vm.createContext(ctx);vm.runInContext(source,ctx);
const event={vertical:'PreInspection',calendarCustomerName:'Fixture Customer',customerNumber:'123',phone:'4165550100'};
function plan(task){return ctx.tmv3_buildCalendarLinkPlan_({...event},[{customerId:'123',taskId:'456',task}]);}
const name='Fixture Customer - 1 Test Street, Toronto - (416) 555-0100';
assert.equal(plan(name).links[1].label,'Task #456 – '+name);
for(const task of ['', '456', 'Task #456'])assert.throws(()=>plan(task),/actual verified Striven Task Name/);
console.log('Calendar Task name guard PASS: actual names preserved; absent/numeric-only labels rejected.');

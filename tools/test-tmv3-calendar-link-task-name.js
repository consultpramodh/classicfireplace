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

const descPlan={links};
const authored='<b>Original title</b><br>First sentence. Have sent quote.<br><i>Keep italic notes.</i>';
const cases=[
 {before:authored+'<br><br>-----Striven Links-----<br>raw old footer',prefix:authored},
 {before:'Original title\nFirst sentence. Have sent quote.\n-----Striven Links-----\nold',prefix:'Original title<br>First sentence. Have sent quote.'},
 {before:'<p>Title</p><ul><li>Keep list</li></ul><p>-----Striven Links-----<br>old</p>',prefix:'<p>Title</p><ul><li>Keep list</li></ul>'}
];
for(const fixture of cases){
 const out=ctx.tmv3_preInspectionClickableManagedDescription_(fixture.before,descPlan);
 assert.equal(out.description,fixture.prefix+'<br>-----Striven Links-----<br>'+links.map(ctx.tmv3_preInspectionHtmlLink_).join('<br>'));
 for(const link of links)assert(ctx.tmv3_preInspectionClickableLinkPresent_(out.description,link));
 assert.equal(ctx.tmv3_preInspectionClickableManagedDescription_(out.description,descPlan).changed,false);
}
const duplicate=authored+'<br>-----Striven Links-----<br>'+links.map(ctx.tmv3_preInspectionHtmlLink_).join('<br>')+'<br>------- Pre-Inspection Task Link -------<br>duplicate';
const repaired=ctx.tmv3_preInspectionClickableManagedDescription_(duplicate,descPlan);
assert(!repaired.description.includes('duplicate'));
assert.equal((repaired.description.match(/-----Striven Links-----/g)||[]).length,1);
console.log('PASS: original HTML/plain layout, inline styling/lists, clickable links, duplicate removal, idempotence; no inserted paragraph gaps.');


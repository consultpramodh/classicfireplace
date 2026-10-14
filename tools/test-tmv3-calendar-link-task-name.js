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

const links=[{label:'Orders',url:'https://example.invalid/orders'},{label:'Task #1 – Fixture',url:'https://example.invalid/task/1'}];
const descPlan={links};
const authored='<b>Original title</b><br>First sentence. Have sent quote.<br><i>Keep italic notes.</i>';
const cases=[
 {before:authored+'<br><br>-----Striven Links-----<br>raw old footer',prefix:authored},
 {before:'Original title\nFirst sentence. Have sent quote.\n-----Striven Links-----\nold',prefix:'Original title<br>First sentence. Have sent quote.'},
 {before:'<p>Title</p><ul><li>Keep list</li></ul><p>-----Striven Links-----<br>old</p>',prefix:'Title<br><ul><li>Keep list</li></ul>'}
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


{
const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const ctx={tmv3_clean_:v=>String(v??'').trim()};vm.createContext(ctx);vm.runInContext(fs.readFileSync('apps-script/tmv3-clean/46_Step7_Reconciliation.js','utf8'),ctx);
const task={'Task ID':19067,'Task Type ID':105,'Customer ID':62838,'Order ID':''};
const record={vertical:'PreInspection',existingTaskId:'19067',step4:{disposition:'VERIFIED',customer:{'Customer ID':62838}}};
function refs(){return {tasks:[],taskById:{},tasksByCustomer:{},tasksByOrder:{}};}
let reads=0,cacheWrites=0;ctx.tmv3_step7FreshTask_=()=>{reads++;return {ok:true,task};};ctx.tmv3_upsertTaskCacheRow_=()=>cacheWrites++;
let index=refs();ctx.tmv3_step7HydrateLinkedPreInspectionTasks_([record,record],index,{taskById:{}});
assert.equal(reads,1);assert.equal(cacheWrites,1);assert.equal(index.taskById['19067'],task);
for(const fresh of [{ok:false},{ok:true,task:{...task,'Customer ID':999}},{ok:true,task:{...task,'Task Type ID':77}},{ok:true,task:{...task,'Task ID':19068}}]){
 ctx.tmv3_step7FreshTask_=()=>fresh;assert.throws(()=>ctx.tmv3_step7HydrateLinkedPreInspectionTasks_([record],refs(),{}),/UNVERIFIED_NO_CREATE/);
}
reads=0;ctx.tmv3_step7FreshTask_=()=>{reads++;throw Error('should not read');};
for(const ignored of [{...record,vertical:'Install'},{...record,existingTaskId:''},{...record,step4:{disposition:'REVIEW'}}])ctx.tmv3_step7HydrateLinkedPreInspectionTasks_([ignored],refs(),{});
assert.equal(reads,0);
assert.throws(()=>ctx.tmv3_step7HydrateLinkedPreInspectionTasks_([{...record,existingTaskId:'bad'}],refs(),{}),/ID_INVALID_NO_CREATE/);
console.log('PASS: bounded linked-task hydration, same-ID dedupe, cache reuse, customer/type/ID/read failure blocks, noneligible zero-read cases.');


}

{
 const ctx2={};vm.createContext(ctx2);
 const root=path.join(__dirname,'../apps-script/tmv3-clean');
 for(const file of fs.readdirSync(root).filter(f=>f.endsWith('.js')).sort())vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),ctx2);
 ctx2.tmv3_hash_=()=> 'fixture';
 const raw={id:19074,title:'Nancy &amp; Steve Donahue',type:{id:105,name:'Pre Inspection'},status:{name:'Open'},customer:{id:62845},location:{id:58459},startDateTime:'2026-10-13T14:00:00',dueDateTime:'2026-10-13T15:00:00',assignments:[]};
 const before=JSON.stringify(raw),actual=ctx2.tmv3_normalizeV2TaskModel_(raw);
 assert.equal(actual.Name,'Nancy & Steve Donahue');
 assert.equal(actual['Customer ID'],62845);assert.equal(actual['Location ID'],58459);
 assert.equal(actual.Start,raw.startDateTime);assert.equal(actual.Due,raw.dueDateTime);
 assert.equal(JSON.stringify(raw),before);
 assert.equal(ctx2.tmv3_normalizeV2TaskModel_({...raw,title:'Plain task name'}).Name,'Plain task name');
 console.log('PASS: Striven encoded name display comparison; IDs, schedule and raw payload preserved.');
}

{
 const plan2={links:[{label:'Task',url:'https://example.invalid/task'}]};
 const title='Nancy &amp; Steve Donahue';
 const out=ctx.tmv3_preInspectionClickableManagedDescription_('<h1>'+title+'</h1>\\n<p>They have a\\ncurrent unit. Have\\nsent quote.</p><p>-----Striven Links-----old</p>'.replace(/\\\\n/g,'\\n'),plan2).description;
 assert(!/<h[1-6]|<p>|[\\r\\n]/i.test(out));
 assert(out.includes('They have a current unit. Have sent quote.'));
 assert(out.includes(title));
 console.log('PASS: screenshot regression — heading size and forced sentence wraps removed.');
}

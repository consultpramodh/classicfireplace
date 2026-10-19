// JavaScript / Node.js: reproduce current bulk-cache defects without network or live writes.
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const path=require('path');
const source=fs.readFileSync(path.join(__dirname,'../apps-script/tmv3-clean/20_Striven.js'),'utf8');
const extract=name=>{const a=source.indexOf('function '+name+'('),b=source.indexOf('\nfunction ',a+10);assert(a>=0);return source.slice(a,b<0?source.length:b);};
let prior=[],targets=[],canonicalCalls=0;
const task=id=>({'Task ID':String(id),'Task Number':String(id),'Task Type ID':105,'Customer ID':String(id),Start:'2026-10-21T03:00:00-04:00',Due:'2026-10-21T04:00:00-04:00'});
const c={TMV3:{SHEETS:{TASKS:'tasks'},OPERATIONS:{preInspectionTaskHydrationMaxTasks:60,preInspectionTaskCacheMinMinutes:360}},tmv3_rows_:()=>prior,PropertiesService:{getScriptProperties:()=>({getProperty:()=>String(Date.now()),setProperty:()=>{}})},tmv3_preInspectionTaskRefreshTargets_:()=>targets,tmv3_searchPreInspectionTaskIdsForCustomer_:customer=>[customer['Customer ID']],tmv3_getTaskById_:id=>task(id),tmv3_getCanonicalV1TaskSchedule_:()=>{canonicalCalls++;return {startDateTime:'2026-10-21T15:00:00-04:00',dueDateTime:'2026-10-21T16:00:00-04:00'};},tmv3_clean_:x=>String(x??'').trim(),tmv3_unique_:xs=>[...new Set(xs)]};vm.createContext(c);
for(const n of ['tmv3_preInspectionTaskRowArray_','tmv3_preInspectionTaskSourceRows_'])vm.runInContext(extract(n),c);
targets=[{customer:{'Customer ID':'77'},existingTaskId:'77'}];
let result=c.tmv3_preInspectionTaskSourceRows_({force:true});
assert.equal(result.rows[0][10],'2026-10-21T03:00:00-04:00');assert.equal(canonicalCalls,0);
console.log('REPRODUCED: forced bulk refresh carries raw V2 AM dates without canonical V1 verification');
prior=[task(77)];result=c.tmv3_preInspectionTaskSourceRows_({force:false});assert.equal(result.reused,true);assert.equal(result.rows[0][10],'2026-10-21T03:00:00-04:00');
console.log('REPRODUCED: TTL reuse preserves the bad cached schedule');
prior=[task(77),task(88)];targets=[{customer:{'Customer ID':'88'},existingTaskId:'88'}];result=c.tmv3_preInspectionTaskSourceRows_({force:true});assert.equal(result.rows.length,1);assert.equal(String(result.rows[0][0]),'88');
console.log('REPRODUCED: full refresh drops prior task 77 when its customer is absent from verified targets');

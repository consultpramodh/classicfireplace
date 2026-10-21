// JavaScript / Node.js: tests against the exact helper extracted from production.
'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const helper=fs.readFileSync('tools/tmv3-task-cache-canonical-clock.js','utf8');
const ops=fs.readFileSync('apps-script/tmv3-clean/58_Operations.js','utf8');
assert(ops.includes(helper.trim()),'repository must contain the tested installed helper');
assert(ops.includes("if(Number(task['Task Type ID'])===105) task=tmv3_preInspectionCanonicalCacheTask_(task,tmv3_getCanonicalV1TaskSchedule_(task['Task ID']));"));
const c={tmv3_hash_:s=>s};vm.createContext(c);vm.runInContext(helper,c);
const task={'Task ID':19128,'Task Type ID':105,Start:'2026-10-21T03:00:00-04:00',Due:'2026-10-21T04:00:00-04:00','Customer ID':62869,'Location ID':58485};
const prior=JSON.stringify(task),good={taskId:19128,startDateTime:'2026-10-21T15:00:00-04:00',dueDateTime:'2026-10-21T16:00:00-04:00'};
const out=c.tmv3_preInspectionCanonicalCacheTask_(task,good);
assert.equal(out.Start,good.startDateTime);assert.equal(out.Due,good.dueDateTime);assert.equal(JSON.stringify(task),prior);
assert.equal(out['Customer ID'],62869);assert.equal(out['Location ID'],58485);
for(const bad of [null,{...good,taskId:999},{...good,startDateTime:'bad'},{...good,dueDateTime:null},{...good,startDateTime:good.dueDateTime,dueDateTime:good.startDateTime}])assert.throws(()=>c.tmv3_preInspectionCanonicalCacheTask_(task,bad),/UNVERIFIED/);
const am={...good,startDateTime:'2026-10-21T09:00:00-04:00',dueDateTime:'2026-10-21T10:00:00-04:00'};
assert.equal(c.tmv3_preInspectionCanonicalCacheTask_(task,am).Start,am.startDateTime);
const other={...task,'Task Type ID':77};assert.equal(c.tmv3_preInspectionCanonicalCacheTask_(other,null),other);
console.log('PASS: installed canonical-cache helper, PM/AM, immutable input, ownership, wrong ID/missing/invalid/reversed dates, non-PreInspection scope.');

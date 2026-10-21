// JavaScript / Node.js: canonical cache clock, no live API calls.
'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto');
let reads=0;
const c={tmv3_clean_:v=>String(v??'').trim(),tmv3_parseDateTime_:v=>v?new Date(v):null,
 tmv3_iso_:v=>v.toISOString(),tmv3_hash_:v=>crypto.createHash('sha256').update(v).digest('hex'),
 tmv3_getCanonicalV1TaskSchedule_:id=>{reads++;return {taskId:id,startDateTime:'2026-10-21T15:00:00-04:00',dueDateTime:'2026-10-21T16:00:00-04:00'};}};
vm.createContext(c);vm.runInContext(fs.readFileSync('tools/tmv3-task-cache-canonical-clock.js','utf8'),c);
const task={'Task ID':19128,'Task Type ID':105,Start:'2026-10-21T03:00:00-04:00',Due:'2026-10-21T04:00:00-04:00','Customer ID':62869,'Location ID':58485};
const before=JSON.stringify(task),out=c.tmv3_taskCacheCanonicalClock_(task);
assert.equal(out.Start,'2026-10-21T19:00:00.000Z');assert.equal(out.Due,'2026-10-21T20:00:00.000Z');
assert.equal(JSON.stringify(task),before);assert.equal(out['Customer ID'],62869);assert.equal(out['Location ID'],58485);assert.equal(reads,1);
for(const type of [77,0]){c.tmv3_taskCacheCanonicalClock_({...task,'Task Type ID':type});}assert.equal(reads,1);
for(const schedule of [{taskId:999,startDateTime:task.Start,dueDateTime:task.Due},{taskId:19128,startDateTime:null,dueDateTime:null},{taskId:19128,startDateTime:'bad',dueDateTime:task.Due},{taskId:19128,startDateTime:task.Due,dueDateTime:task.Start}]){
 c.tmv3_getCanonicalV1TaskSchedule_=()=>schedule;assert.throws(()=>c.tmv3_taskCacheCanonicalClock_(task),/INVALID/);
}
c.tmv3_getCanonicalV1TaskSchedule_=()=>{throw Error('API_UNAVAILABLE')};assert.throws(()=>c.tmv3_taskCacheCanonicalClock_(task),/API_UNAVAILABLE/);
assert.throws(()=>c.tmv3_taskCacheCanonicalClock_({...task,'Task ID':'bad'}),/ID_INVALID/);
c.tmv3_getCanonicalV1TaskSchedule_=id=>({taskId:id,startDateTime:'2026-10-21T09:00:00-04:00',dueDateTime:'2026-10-21T10:00:00-04:00'});
assert.equal(c.tmv3_taskCacheCanonicalClock_(task).Start,'2026-10-21T13:00:00.000Z','never blindly add 12 hours');
console.log('PASS: canonical PM and AM, no blind offset, immutable input, ownership retained, type scope, ID/date/order/API failure guards.');

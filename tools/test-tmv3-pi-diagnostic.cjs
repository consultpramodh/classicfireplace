'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const src=fs.readFileSync('apps-script/tmv3-vertical-split-staging/30_PreInspection.gs','utf8');
const logs=[],properties={};
let rows=Array.from({length:7},(_,i)=>({
  Vertical:'PreInspection','Calendar Role':'PRIMARY_SHARED',
  'Calendar Start':'2026-11-'+String(11+i)+'T10:00:00-05:00',
  'Event ID':'test'+i+'@google.com','Customer # (Calendar)':'631'+i,
  'Mapping Status':i===3?'STEP 6 — CREATE_TASK':i===6?'STEP 6 — REVIEW':'STEP 6 — MATCH_EXISTING',
  'Data Checklist':'Customer ✅\nAssignee ⏳',
  'Task':i===3?'No OPEN Task':'Task #197'+i,
  'Existing Task Link':i===3?'':'https://classicfireplace.striven.com/Tasks/TaskInfo.aspx?TaskID=197'+i,
  'Issue / Next Action':'Check live history','Fingerprint':'hash'+i
}));
const context=vm.createContext({
  TMV3:{VERSION:'test',VERTICALS:{PreInspection:{sheet:'PreInspection'}},OPERATIONS:{preInspectionAutomationEnabled:true,preInspectionMissingDetailEmailsEnabled:false}},
  TMV3_TIMEZONE:'America/Toronto',Date,JSON,Math,Object,Array,String,Number,RegExp,Error,
  tmv3_rows_:name=>{assert.equal(name,'PreInspection');return rows;},
  tmv3_hash_:str=>'fixture-'+str.length+'-'+str.slice(0,25),
  Utilities:{formatDate:()=> '2026-11-09'},
  Logger:{log:value=>logs.push(value)},
  PropertiesService:{getScriptProperties:()=>({
    getProperty:key=>properties[key]||null,
    setProperty:(key,value)=>{assert.equal(key,'TMV3_PI_VERIFY_CURSOR');properties[key]=value;},
    deleteProperty:key=>{assert.equal(key,'TMV3_PI_VERIFY_CURSOR');delete properties[key];}
  })},
  LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock(){}})}
});
new vm.Script(src,{filename:'PreInspection.gs'}).runInContext(context);
const run=id=>context.tmv3_verifyPreInspectionAutomation(id);
const a=run(),b=run(),c=run(),again=run();
assert.equal(a.processed,3);
assert.equal(a.total,7);
assert.equal(a.startIndex,0);
assert.equal(b.startIndex,3);
assert.equal(b.records[0].disposition,'FRESH_TASK_HISTORY_REQUIRED_NO_CREATE');
assert.equal(c.startIndex,6);
assert.equal(c.processed,1);
assert.equal(c.hasMore,false);
assert.equal(again.startIndex,0);
assert.equal(a.records[0].disposition,'CACHED_MATCH_LIVE_NOT_VERIFIED');
assert.equal(a.strivenCalls,0);
assert.equal(a.calendarReads,0);
assert.equal(a.taskWrites,0);
const target=run('test5@google.com');
assert.equal(target.processed,1);
assert.equal(target.records[0].eventId,'test5@google.com');
assert.ok(logs.some(x=>x.includes('PI_VERIFICATION_BATCH=')));
rows=rows.concat(rows[0]);assert.throws(()=>run(),/DUPLICATE/);
rows=rows.map(x=>({...x,'Calendar Start':'2026-11-01T10:00:00-05:00'}));
assert.equal(run().status,'NO_CURRENT_OPERATOR_EVENTS_REVIEW_REFRESH');
const body=/^function tmv3_verifyPreInspectionAutomation\(eventId\) \{[\s\S]*?^\}/m.exec(src);
assert.ok(body);
assert.doesNotMatch(body[0],/UrlFetchApp|CalendarApp|MailApp|tmv3_step7FreshPlansForEvent_|tmv3_upsertTaskCacheRow_|tmv3_audit_/);
console.log('PI_DIAGNOSTIC_TESTS_PASS: batch 3; cursor; rollover; target; cache-only; duplicates; stale; logging');

'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert');
const src=fs.readFileSync('apps-script/tmv3-vertical-split-staging/30_PreInspection.gs','utf8');
let override=null;
const ctx={
  Date,JSON,Number,String,Math,Array,Object,RegExp,Error,
  TMV3:{VERTICALS:{PreInspection:{secondaryCalendarIds:['classicfireplace.ca_c20qcqfhvjbv784asn9pvuiaf4@group.calendar.google.com']}}},
  tmv3_clean_:x=>String(x||'').trim(),tmv3_hash_:x=>'e',
  PropertiesService:{getScriptProperties:()=>({getProperty:key=>override})},
  console:{log(){}}
};
vm.createContext(ctx);
new vm.Script(src).runInContext(ctx);
const base={eventId:'abcdef123@google.com',customerNumber:'63196'};
const assign=(organizerCalendarId)=>Array.from(ctx.tmv3_preInspectionAssignmentOverride_({...base,organizerCalendarId}));
assert.deepStrictEqual(assign('classicfireplace.ca_c20qcqfhvjbv784asn9pvuiaf4@group.calendar.google.com'),[15]);
assert.deepStrictEqual(assign('jay@classicfireplace.ca'),[1]);
assert.deepStrictEqual(assign('unverified@group.calendar.google.com'),[]);
assert.throws(()=>assign('karen@classicfireplace.ca'),/KAREN_STRIVEN_EMPLOYEE_ID_NOT_VERIFIED_NO_WRITE/);
override=JSON.stringify({...base,organizerCalendarId:'jay@classicfireplace.ca',employeeId:15});
assert.deepStrictEqual(assign('jay@classicfireplace.ca'),[15]); // Explicit matching override wins.
assert.throws(()=>assign('stephen@classicfireplace.ca'),/ASSIGNMENT_OVERRIDE_EVIDENCE_MISMATCH/);
console.log(JSON.stringify({status:'PASS',tests:6,automatic:[15,1],explicitOverridesPreserved:true,karenBlocked:true}));

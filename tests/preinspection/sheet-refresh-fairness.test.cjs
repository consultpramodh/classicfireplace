'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'../../apps-script/tmv3-clean/60_Automation.js'),'utf8');
const start=src.indexOf('function tmv3_refreshAutomationSheets()');
const end=src.indexOf('\nfunction tmv3_installAutomationSheetRefreshTrigger()',start);
assert(start>=0 && end>start);
let available=false,releases=0,refreshes=0,queuedChecks=0;
const values={},cells={};
const ctx={Date,JSON,Number,String,
  PropertiesService:{getScriptProperties:()=>({setProperty:(k,v)=>values[k]=v,deleteProperty:k=>delete values[k]})},
  LockService:{getScriptLock:()=>({tryLock:()=>available,releaseLock:()=>releases++})},
  tmv3_verticalBusinessQueuePending_:()=>{queuedChecks++;return true},
  tmv3_step6TaskDecisionRunCached:()=>{refreshes++;return {verification:{pass:true},write:{Install:0}}},
  TMV3:{VERTICALS:{Install:{sheet:'Install'}},SHEETS:{OVERVIEW:'Overview'},VERSION:'test',MODE:'test'},
  tmv3_rows_:()=>[],tmv3_clean_:x=>x||'',tmv3_refreshMorningOps:()=>({}),
  Utilities:{formatDate:()=>'date'},TMV3_TIMEZONE:'America/Toronto',
  tmv3_sheet_:()=>({getRange:k=>({setValue:v=>cells[k]=v,getValue:()=>cells[k]})}),
  SpreadsheetApp:{flush:()=>{}},tmv3_audit_:()=>{},Logger:{log:()=>{}}};
vm.createContext(ctx);vm.runInContext(src.slice(start,end),ctx);
assert.equal(ctx.tmv3_refreshAutomationSheets().status,'LOCK_BUSY');
assert.equal(values.TMV3_SHEET_REFRESH_PENDING,'true');
assert.equal(refreshes,0);
available=true;
const out=ctx.tmv3_refreshAutomationSheets();
assert.equal(out.status,'AUTOMATION_SHEETS_REFRESHED');
assert.equal(out.projectionVerified,true);
assert.equal(out.strivenWrites,0);
assert.equal(out.calendarWrites,0);
assert.equal(values.TMV3_SHEET_REFRESH_PENDING,undefined);
assert.equal(queuedChecks,0);
assert.equal(releases,1);
console.log('PASS: refresh waits for lock and can run while a sweep is queued');

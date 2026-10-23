// JavaScript / Node.js: isolated publication behavior; no external services.
'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const dir=process.env.TMV3_TEST_SOURCE_DIR||path.join(__dirname,'../apps-script/tmv3-clean');
let cases=0;function eq(a,b){assert.deepEqual(a,b);cases++;}
let props={},cells={},release=0,lockOK=true,pass=true,countMismatch=false,flushBad=false,projectionCalls=0,clockHour=10;
const names=['Install','Delivery','Service','PreInspection'];
const c={Date,JSON,Object,Number,String,Math,Error,Logger:{log(){}},TMV3_TIMEZONE:'America/Toronto',
 TMV3:{VERSION:'test',MODE:'PRODUCTION_WRITE',SHEETS:{OVERVIEW:'Overview'},VERTICALS:Object.fromEntries(names.map(v=>[v,{sheet:v}]))},
 PropertiesService:{getScriptProperties:()=>({getProperty:k=>props[k]||null,setProperty:(k,v)=>props[k]=v,deleteProperty:k=>delete props[k]})},
 LockService:{getScriptLock:()=>({tryLock:()=>lockOK,releaseLock:()=>release++})},
 Utilities:{formatDate:(_,__,format)=>format==='H'?String(clockHour):'2026-10-23 4:00 PM'},
 SpreadsheetApp:{flush(){}},
 tmv3_clean_:v=>String(v||'').trim(),tmv3_audit_:()=>{},
 tmv3_sheet_:()=>({getRange:cell=>({setValue:value=>cells[cell]=value,getValue:()=>flushBad?'wrong':cells[cell]})}),
 tmv3_rows_:()=>[{'Event ID':'event'}],tmv3_refreshMorningOps:()=>({status:'REFRESHED'}),
 tmv3_step6TaskDecisionRunCached:()=>{projectionCalls++;return {verification:{pass},write:Object.fromEntries(names.map(v=>[v,countMismatch?2:1]))};}
};
vm.createContext(c);vm.runInContext(fs.readFileSync(path.join(dir,'60_Automation.js'),'utf8'),c);
c.tmv3_listTriggers=()=>[];
let r=c.tmv3_refreshAutomationSheets();eq(r.status,'AUTOMATION_SHEETS_REFRESHED');eq(r.projectionVerified,true);eq(r.timestampReadbackVerified,true);eq(Object.values(r.rows).join(','),'1,1,1,1');eq(r.strivenWrites,0);eq(r.calendarWrites,0);eq(props.TMV3_SHEET_REFRESH_PENDING,undefined);eq(release,1);eq(cells.B2.includes('Toronto'),true);eq(c.tmv3_automationSheetRefreshStatus().lastSuccess.status,r.status);
const last=props.TMV3_SHEET_REFRESH_LAST_SUCCESS;
lockOK=false;r=c.tmv3_refreshAutomationSheets();eq(r.status,'LOCK_BUSY');eq(props.TMV3_SHEET_REFRESH_PENDING,'true');eq(props.TMV3_SHEET_REFRESH_LAST_SUCCESS,last);eq(release,1);lockOK=true;
pass=false;assert.throws(()=>c.tmv3_refreshAutomationSheets(),/VERIFICATION_FAILED/);cases++;eq(props.TMV3_SHEET_REFRESH_LAST_SUCCESS,last);eq(release,2);eq(!!props.TMV3_SHEET_REFRESH_LAST_ERROR,true);pass=true;
countMismatch=true;assert.throws(()=>c.tmv3_refreshAutomationSheets(),/ROW_READBACK_MISMATCH/);cases++;countMismatch=false;
flushBad=true;assert.throws(()=>c.tmv3_refreshAutomationSheets(),/TIMESTAMP_READBACK_MISMATCH/);cases++;flushBad=false;
const before=projectionCalls;r=c.tmv3_refreshAutomationSheetsAfter_(Date.now()-241000);eq(r.status,'DEFERRED_TO_HOURLY_SHEET_REFRESH');eq(projectionCalls,before);
pass=false;r=c.tmv3_refreshAutomationSheetsAfter_(Date.now());eq(r.status,'SHEET_REFRESH_ATTENTION');pass=true;
clockHour=7;r=c.tmv3_scheduledSheetRefresh();eq(r.status,'OUTSIDE_BUSINESS_HOURS');clockHour=18;eq(c.tmv3_scheduledSheetRefresh().status,'AUTOMATION_SHEETS_REFRESHED');clockHour=19;eq(c.tmv3_scheduledSheetRefresh().status,'OUTSIDE_BUSINESS_HOURS');
let triggers=['tmv3_preInspectionCheck0800','tmv3_allVerticalAutomationTick'].map(handler=>({handler})),created=0;
c.ScriptApp={getProjectTriggers:()=>triggers.map(t=>({...t,getHandlerFunction:()=>t.handler})),deleteTrigger:t=>triggers.splice(triggers.findIndex(x=>x.handler===t.handler),1),newTrigger:handler=>{const b={timeBased:()=>b,everyHours:n=>{eq(n,1);return b;},create:()=>{created++;triggers.push({handler});}};return b;}};c.tmv3_listTriggers=()=>triggers;
eq(c.tmv3_installAutomationSheetRefreshTrigger().status,'SHEET_REFRESH_TRIGGER_VERIFIED');c.tmv3_installAutomationSheetRefreshTrigger();eq(created,1);eq(triggers.length,3);eq(triggers[0].handler,'tmv3_preInspectionCheck0800');
triggers=Array.from({length:20},(_,i)=>({handler:'unrelated'+i}));assert.throws(()=>c.tmv3_installAutomationSheetRefreshTrigger(),/TRIGGER_CAPACITY/);cases++;
console.log('PASS: '+cases+' automatic Sheet refresh verification/lock/failure/trigger cases');

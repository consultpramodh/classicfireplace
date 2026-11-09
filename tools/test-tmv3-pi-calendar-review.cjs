'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const code=fs.readFileSync('ops/tmv3-pi-calendar-review-source.gs.txt','utf8');
const now=new Date(), next=new Date(now.getTime()+86400000), one=new Date(next);one.setHours(13,0,0,0);const two=new Date(one.getTime()+3600000);
const make=(id,title,loc,desc,creator)=>({
getId:()=>id+'@google.com', getStartTime:()=>one,getEndTime:()=>two,getTitle:()=>title,
getLocation:()=>loc,getDescription:()=>desc,getCreators:()=>[creator],isAllDayEvent:()=>false
});
const sharedId='c_shared';const stephenId='classicfireplace.ca_c20qcqfhvjbv784asn9pvuiaf4@group.calendar.google.com';
const share=make('a1','63199 - Test Customer','123 Test St','Scope Task #12345 - https://classicfireplace.striven.com/Tasks/TaskInfo.aspx?TaskID=12345',stephenId);
const calendars={
[sharedId]:[share],
[stephenId]:[share,make('b2','63170 - Visit Candidate','125 Test Road','Remove old gas fireplace and replace insert',stephenId)],
'jay@classicfireplace.ca':[make('c3','SO#123456 - Installation','333 Third Rd','Install unit', 'classicfireplace.ca_vpg05s56lp9f7kaegsiqask34o@group.calendar.google.com')],
'karen@classicfireplace.ca':[make('d4','Test Family - On-Site - Karen','444 Test Lane','Gas insert','karen@classicfireplace.ca')]
};
let data=[],writes=0,flush=0;
const sheet={
getLastRow:()=>data.length,
getMaxRows:()=>300,
insertRowsAfter:()=>{},
getRange:(row,col,h,w)=>({
 getValues:()=>Array.from({length:h},(_,i)=>data[row-1+i]||Array(w).fill('')),
 getDisplayValues:()=>Array.from({length:h},(_,i)=>Array.from({length:w},(_,j)=>String((data[row-1+i]||[])[col-1+j]||''))),
 getDisplayValue:()=>String((data[row-1]||[])[col-1]||''),
 setValue:(val)=>{if(!data[row-1])data[row-1]=Array(20).fill('');data[row-1][col-1]=val;writes++},
 setValues:(value)=>{for(let i=0;i<value.length;i++)data[row-1+i]=value[i];writes++},
 clearContent:()=>{for(let i=row-1;i<row-1+h;i++)data[i]=Array(w).fill('');writes++}
})};
const ctx={
Date,Math,Array,Object,String,RegExp,Number,Error,JSON,
TMV3_SPREADSHEET_ID:'TEST', TMV3:{VERTICALS:{PreInspection:{primaryCalendarId:sharedId}}},
LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock:()=>{}})},
SpreadsheetApp:{openById:()=>({getSheetByName:()=>sheet}),flush:()=>flush++},
CalendarApp:{getCalendarById:id=>calendars[id]?({getEvents:()=>calendars[id]}):null},
Utilities:{formatDate:(d,tz,pattern)=>pattern==='yyyy-MM-dd'?'2026-11-09':'2026-11-10T13:00:00-05:00',base64EncodeWebSafe:x=>Buffer.from(x).toString('base64url')}
};
vm.createContext(ctx);vm.runInContext(code,ctx);
let r=ctx.tmv3_piCalendarReviewRefresh_();assert.strictEqual(r.logicalEvents,4);assert.strictEqual(r.statuses.SHARED_LINKED,1);assert.strictEqual(r.statuses.REVIEW_POSSIBLE_PI,2);assert.strictEqual(r.statuses.EXCLUDED_OTHER_WORKFLOW,1);assert.strictEqual(writes,4);
r=ctx.tmv3_piCalendarReviewRefresh_();assert.strictEqual(r.status,'PI_REVIEW_UNCHANGED');assert.strictEqual(writes,4);
// Operator decision survives a refresh. Force a changed title to trigger publication.
let operatorRow=data.find(x=>x[8]==='b2');operatorRow[18]='NEEDS_INFO';operatorRow[19]='Sales team should confirm site visit';
const pre=data.length;calendars[stephenId][1]=make('b2','63170 - Visit Candidate Updated','125 Test Road','Remove old gas fireplace and replace insert',stephenId);
r=ctx.tmv3_piCalendarReviewRefresh_();const after=data.find(x=>x[8]==='b2');assert.strictEqual(after[18],'NEEDS_INFO');assert.strictEqual(after[19],'Sales team should confirm site visit');
// One source gone: abort without clearing previous rows.
delete calendars['karen@classicfireplace.ca'];const oldData=JSON.stringify(data);assert.throws(()=>ctx.tmv3_piCalendarReviewRefresh_(),/PI_CALENDAR_ACCESS_REQUIRED_NO_WRITE:Karen/);assert.strictEqual(JSON.stringify(data),oldData);
console.log(JSON.stringify({status:'PASS',tests:5,logicalEvents:4,firstWriteCount:1,operatorDecisionPreserved:true,missingSourceFailClosed:true}));

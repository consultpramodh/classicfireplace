// JavaScript / Node.js: date-scoped controls preserve authoritative calendar filtering.
const fs=require('fs'),vm=require('vm'),assert=require('assert'),path=require('path');
const source=fs.readFileSync(path.join(__dirname,'../apps-script/tmv3-clean/90_Admin.js'),'utf8');
const start=source.indexOf('function tmv3_preInspectionTodayRecords_(');
const end=source.indexOf('\nfunction ',start+10);
const records=[
 {calendarRole:'PRIMARY_SHARED',start:'2026-10-21T09:00:00-04:00'},
 {calendarRole:'PRIMARY_SHARED',start:'2026-10-19T09:00:00-04:00'},
 {calendarRole:'SECONDARY',start:'2026-10-21T09:00:00-04:00'}
];
const context={TMV3_TIMEZONE:'America/Toronto',
 Utilities:{formatDate:(date,zone)=>new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).format(date)},
 tmv3_preInspectionIntakeRecords_:()=>records};
vm.createContext(context);vm.runInContext(source.slice(start,end),context);
assert.equal(context.tmv3_preInspectionTodayRecords_('2026-10-21').length,1);
assert.equal(context.tmv3_preInspectionTodayRecords_('2026-10-19').length,1);
assert.throws(()=>context.tmv3_preInspectionTodayRecords_('invalid'),/INVALID_PI_TARGET_DATE/);
console.log('3 target-date scope checks passed');

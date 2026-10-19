// JavaScript / Node.js: guarded current-day PreInspection selection.
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const src=fs.readFileSync(__dirname+'/../apps-script/tmv3-clean/90_Admin.js','utf8');
const a=src.indexOf('function tmv3_preInspectionTodayEligibleQueue_('),b=src.indexOf('\nfunction ',a+10);
const c={tmv3_clean_:v=>String(v||'').trim()};vm.createContext(c);vm.runInContext(src.slice(a,b),c);
function row(status,location){const r=Array(10).fill('');r[0]='Customer: #77'+(location?' Location ID: 12':'');r[4]='STEP 6 — '+status;r[9]='event';return r;}
const records=[{eventId:'event',start:'2026-10-19T16:00:00-04:00'}];
assert.equal(c.tmv3_preInspectionTodayEligibleQueue_(records,[row('CREATE_TASK',false)]).eligible.length,1);
assert.equal(c.tmv3_preInspectionTodayEligibleQueue_(records,[row('RECREATE_TASK',false)]).eligible.length,1);
assert.equal(c.tmv3_preInspectionTodayEligibleQueue_(records,[row('MATCH_EXISTING',false)]).eligible.length,0);
assert.equal(c.tmv3_preInspectionTodayEligibleQueue_(records,[row('MATCH_EXISTING',true)]).eligible.length,1);
assert.equal(c.tmv3_preInspectionTodayEligibleQueue_(records,[row('CREATE_TASK',true),row('CREATE_TASK',true)]).eligible.length,0);
console.log('5 current-day selection scenarios passed');

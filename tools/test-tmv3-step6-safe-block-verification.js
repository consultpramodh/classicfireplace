// JavaScript: verify real Stage-6 decisions; no Apps Script/Striven execution.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../apps-script/tmv3-clean/44_Step6_Task_Decision.js'),'utf8');
let records=[];
const ctx={TMV3:{VERTICALS:{Install:{sheet:'Install'},Delivery:{sheet:'Delivery'},Service:{sheet:'Service'},PreInspection:{sheet:'PreInspection'}}},TMV3_TIMEZONE:'America/Toronto',
 tmv3_norm_:v=>String(v||'').toLowerCase(),tmv3_clean_:v=>String(v||'').trim(),
 tmv3_sameLocalDay_:(a,b)=>Boolean(a&&b)&&a===b,
 Utilities:{formatDate:d=>d.toISOString().slice(0,10)},
 tmv3_sheet_:name=>({getLastRow:()=>1+records.filter(r=>r.vertical===name).length})};
vm.createContext(ctx);vm.runInContext(source,ctx);
function record(vertical,disposition) {
 return {logicalKey:vertical,start:'2026-10-13T10:00:00Z',vertical,
  step5:{disposition:'NO_TASK',historyTasks:[{'Status':'Done','Start':'2026-10-13T10:00:00Z'}]},
  step6:{disposition}};
}
const service=record('Service','');
service.step6=ctx.tmv3_step6NoOpenTaskDecision_(service);
assert.equal(service.step6.disposition,'BLOCKED');
records=[service];
assert.equal(ctx.tmv3_step6Verify_(records,records).pass,true,
 'Striven-owned Service task creation must safely BLOCK without false verification failure');
let cases=1;
for(const vertical of Object.keys(ctx.TMV3.VERTICALS)) {
 for(const disposition of ['FULFILLED_NO_RECREATE','REVIEW','BLOCKED','CREATE_TASK','RECREATE_TASK']) {
  records=[record(vertical,disposition)];
  const result=ctx.tmv3_step6Verify_(records,records);
  assert.equal(result.pass,!['CREATE_TASK','RECREATE_TASK'].includes(disposition),vertical+' '+disposition);
  cases++;
 }
}
records=[record('Service','NOT_RUN')];assert.equal(ctx.tmv3_step6Verify_(records,records).pass,false);
records=[record('Delivery','CREATE_TASK')];records[0].step5.historyTasks[0].Start='2026-10-12T10:00:00Z';
assert.equal(ctx.tmv3_step6Verify_(records,records).sameDayCompletedRecreateError,0);
console.log('Stage-6 verification PASS: '+cases+' safe-hold and forbidden-create cases, plus invalid/older-history boundaries.');

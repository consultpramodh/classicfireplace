// JavaScript / Node.js: daily-budget boundaries with mocked Script Properties.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../apps-script/tmv3-clean/20_Striven.js'),'utf8');
let passed=0;
function runtime(count, overrides={}) {
  const data={P_DATE:'2026-10-16',P_COUNT:String(count),...overrides};let writes=0;
  const c=vm.createContext({TMV3:{MODE:'PRODUCTION_WRITE',API_BUDGET:{propertyPrefix:'P',v3DailySoftLimit:1200,planDailyLimit:5000,reserveForOtherWorkflows:3800}},
    PropertiesService:{getScriptProperties:()=>({getProperty:k=>data[k],setProperties:v=>{writes++;Object.assign(data,v);}})}});
  vm.runInContext(source,c);c.tmv3_strivenApiBudgetDate_=()=>'2026-10-16';
  return {c,data,writes:()=>writes};
}
for(const count of ['bad',-1,1.5,'Infinity',Number.MAX_SAFE_INTEGER+1]) {
  const r=runtime(count);assert.throws(()=>r.c.tmv3_reserveStrivenApiCall_('test'),/BUDGET_INVALID/);assert.equal(r.writes(),0);
  assert.equal(r.c.TMV3_RUNTIME_METRICS.strivenApiBudgetBlocks,1);passed++;
}
let r=runtime(1199);assert.equal(r.c.tmv3_reserveStrivenApiCall_('last allowed').count,1200);
assert.throws(()=>r.c.tmv3_reserveStrivenApiCall_('over budget'),/DAILY_GUARD/);assert.equal(r.writes(),1);passed++;
r=runtime(9999,{P_DATE:'2026-10-15'});assert.equal(r.c.tmv3_reserveStrivenApiCall_('new day').count,1);passed++;
r=runtime(1,{P_EXHAUSTED_DATE:'2026-10-16',P_EXHAUSTED_REASON:'vendor limit'});
assert.throws(()=>r.c.tmv3_reserveStrivenApiCall_('exhausted'),/DAILY_GUARD/);assert.equal(r.writes(),0);passed++;
r=runtime(1);r.c.TMV3.API_BUDGET.v3DailySoftLimit='invalid';
assert.throws(()=>r.c.tmv3_reserveStrivenApiCall_('invalid limit'),/BUDGET_INVALID/);assert.equal(r.writes(),0);passed++;
r=runtime(0);assert.equal(r.c.tmv3_reserveStrivenApiCall_('first').count,1);passed++;
console.log(passed+' API-budget integrity scenarios passed');

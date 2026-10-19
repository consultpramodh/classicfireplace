// JavaScript / Node.js: production completion guard regression cases.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const text=fs.readFileSync(__dirname+'/../apps-script/tmv3-clean/60_Automation.js','utf8');
const source=text.slice(text.indexOf('function tmv3_preInspectionCompletionVerified_('));
const c=vm.createContext({TMV3_STEP7_ACTION:{VERIFY_CALENDAR_LINKS:'VERIFY_CALENDAR_LINKS'}});
vm.runInContext(source,c);
const check=c.tmv3_preInspectionCompletionVerified_;
const plan={plan:'NO_CHANGE',blocker:'',actions:['VERIFY_CALENDAR_LINKS']};
const verified={status:'VERIFIED_CONVERGENCE',calendarLinks:{status:'CALENDAR_LINKS_VERIFIED'}};
const cases=[
 ['existing converged',[plan],verified,true],
 ['created converged',[plan],{...verified,status:'CREATED_VERIFIED_AND_CONVERGED'},true],
 ['no execution',[plan],undefined,false],
 ['partial execution',[plan],{...verified,status:'VERIFIED_PARTIAL'},false],
 ['links missing',[plan],{status:'VERIFIED_CONVERGENCE'},false],
 ['links unverified',[plan],{...verified,calendarLinks:{status:'ATTENTION'}},false],
 ['blocked',[{...plan,blocker:'OWNERSHIP_CONFLICT'}],verified,false],
 ['mutation remains',[{...plan,actions:['PATCH_DATES','VERIFY_CALENDAR_LINKS']}],verified,false],
 ['plan not converged',[{...plan,plan:'PATCH_DATES'}],verified,false],
 ['ambiguous plans',[plan,plan],verified,false],
 ['missing action evidence',[{plan:'NO_CHANGE'}],verified,false],
 ['no pending actions',[{...plan,actions:[]}],undefined,true],
 ['missing plan',[null],verified,false],
 ['no plans',[],verified,false]
];
for(const [name,plans,result,expected] of cases)assert.equal(check(plans,result),expected,name);
console.log(cases.length+' completion scenarios passed');

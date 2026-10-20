// JavaScript / Node.js: Install default contact requirements at the real Stage 7 resolver.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const s=fs.readFileSync(__dirname+'/../apps-script/tmv3-clean/46_Step7_Reconciliation.js','utf8');
const a=s.indexOf('function tmv3_step7Expected_('),b=s.indexOf('\nfunction ',a+10);
const calls=[];let owner={status:'VERIFIED'};
const ctx={TMV3:{VERTICALS:{Install:{orderRequired:true},Delivery:{orderRequired:true},PreInspection:{orderRequired:false}}},
 tmv3_clean_:v=>String(v??'').trim(),tmv3_norm_:v=>String(v??'').trim().toLowerCase(),
 tmv3_step7ContactOwnership_:(contact,customer)=>{calls.push([contact,customer]);return owner;},
 tmv3_resolveOrganizerEmployee_:()=>({status:'MATCHED',employee:{id:34}})};
vm.createContext(ctx);vm.runInContext(s.slice(a,b),ctx);
const record={vertical:'Install',step3:{anchor:{orderId:26922}},step4:{customer:{'Customer ID':62533},location:{'Location ID':58171},contact:{'Contact ID':57146}}};
const runtime=()=>({organizerByEmail:{}});let n=0;
function check(v){assert(v);n++;}
let r=ctx.tmv3_step7Expected_(record,runtime(),true);
check(r.requestedById==='57146'&&r.requestedByType==='contact'&&r.contactOwnership==='VERIFIED'&&!r.requestedByError);
check(calls.length===1&&calls[0][0]==='57146'&&calls[0][1]==='62533');
r=ctx.tmv3_step7Expected_({...record,step4:{...record.step4,contact:null}},runtime(),true);
check(r.requestedByError.includes('REVIEW')&&!r.requestedById);
r=ctx.tmv3_step7Expected_({...record,step4:{...record.step4,contact:{'Contact ID':' '}}},runtime(),true);
check(!!r.requestedByError&&calls.length===1);
owner={status:'CONFLICT',error:'Contact belongs to another Customer'};
r=ctx.tmv3_step7Expected_(record,runtime(),true);check(r.requestedByError==='Contact belongs to another Customer');
r=ctx.tmv3_step7Expected_({...record,vertical:'Delivery',step4:{...record.step4,contact:null}},runtime(),true);
check(!r.requestedByError&&!r.requestedById);
r=ctx.tmv3_step7Expected_({...record,vertical:'PreInspection',organizer:'staff@classicfireplace.ca'},runtime(),true);
check(r.requestedByType==='employee'&&r.requestedById==='34'&&r.orderId==='');
check(r.contactOwnership==='NOT_APPLICABLE_PREINSPECTION');
console.log('PASS: '+n+' Install default field/ownership/isolation checks');

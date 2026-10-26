'use strict';const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');const c={};vm.createContext(c);vm.runInContext(fs.readFileSync('apps-script/tmv3-clean/50_Verticals.js','utf8'),c);c.tmv3_clean_=x=>String(x||'').trim();c.tmv3_verifiedTitleContext_=()=>({verified:true,customerName:'Hedy So',address:'23 Hallbank Terrace, Toronto',phone:'(416) 258-6258',orderNumber:'585698'});
let r=c.tmv3_desiredTaskName_({vertical:'Service'},{sourceTaskTitle:'Level 1 - SO#585698 - Hedy So - (416) 258-6258'});assert.equal(r.value,'Level 1 - SO#585698 - Hedy So - (416) 258-6258');
r=c.tmv3_desiredTaskName_({vertical:'Delivery'},{sourceTaskTitle:'Custom Doors'});assert.equal(r.value,'SO#585698 - Custom Doors');
r=c.tmv3_desiredTaskName_({vertical:'Install'});assert.equal(r.value,'SO#585698 - Hedy So - (416) 258-6258');
r=c.tmv3_desiredTaskName_({vertical:'PreInspection'});assert.equal(r.value,'Hedy So - 23 Hallbank Terrace, Toronto - (416) 258-6258');
r=c.tmv3_desiredTaskName_({vertical:'Service'},{sourceTaskTitle:'Level 2 - SO#123456 - FP#2'});assert.equal(r.value,'Level 2 - SO#585698 - FP#2');
r=c.tmv3_desiredTaskName_({vertical:'Delivery'},{sourceTaskTitle:'SO#123456 / SO#654321'});assert.equal(r.status,'BLOCKED');
console.log('PASS: PreInspection-only address format; preserve Service levels/FP and Delivery job text; verified SO prefix; multi-order names held');

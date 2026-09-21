#!/usr/bin/env node
'use strict';
const fs=require('fs'),vm=require('vm'),path=require('path');
const file=path.resolve(process.cwd(),'patches/task-mapping/98_1_Contact_Resolution_R1.js');
const src=fs.readFileSync(file,'utf8');
const c={console};vm.createContext(c);
vm.runInContext(src+'\nthis.build=tmContactR1BuildIndexFromValues_;this.resolve=tmContactR1ResolveFromIndex_;',c);
const values=[
 ['CustomerCustomerId','CustomerNumber','FullName','PrimaryEmail','PrimaryPhone','CustomerPrimaryPhone','ContactId'],
 ['10','100','Single Customer','one@example.com','4161112222','','501'],
 ['20','200','Multi Customer','alpha@example.com','4162223333','','601'],
 ['20','200','Multi Customer','beta@example.com','4163334444','','602'],
 ['30','300','No Contact','','','','']
];
const idx=c.build(values);
const cases=[
 ['single-contact',{customerNumber:'100'},'CONTACT_RESOLVED',501,'UNIQUE_CUSTOMER_CONTACT'],
 ['multi-email',{customerNumber:'200',evidenceText:'beta@example.com'},'CONTACT_RESOLVED',602,'EMAIL_EXACT'],
 ['multi-phone',{customerId:20,evidenceText:'Call (416) 222-3333'},'CONTACT_RESOLVED',601,'PHONE_EXACT'],
 ['multi-ambiguous',{customerNumber:'200'},'CONTACT_REVIEW_MULTIPLE',0,''],
 ['missing-contact',{customerNumber:'300'},'CONTACT_MISSING',0,''],
 ['missing-customer',{customerNumber:'999'},'CONTACT_MISSING_CUSTOMER',0,'']
];
for(const [name,input,wantStatus,wantId,wantType] of cases){
 const got=c.resolve(idx,input);
 if(got.status!==wantStatus||Number(got.contactId||0)!==Number(wantId||0)||(wantType&&got.matchType!==wantType)){
   throw new Error(name+' failed: '+JSON.stringify(got));
 }
 console.log('PASS '+name+' -> '+got.status+(got.matchType?' / '+got.matchType:''));
}
console.log('CONTACT_RESOLUTION_R1_SELF_TEST_PASS');

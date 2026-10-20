// JavaScript / Node.js: execute the exact temporary Google Apps Script handler with independent authentication cases.
'use strict';
const vm=require('node:vm'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {runner}=require('./tmv3-service-delivery-backfill-launch');
const token='offline-test-bearer',digest=crypto.createHash('sha256').update(token).digest('hex');
let cases=0;
function run(body,expired=false){let calls=0;const ctx={Date,JSON,String,Error,
 Utilities:{DigestAlgorithm:{SHA_256:'sha256'},computeDigest:(_alg,value)=>Array.from(crypto.createHash('sha256').update(value).digest())},
 ContentService:{MimeType:{JSON:'json'},createTextOutput:text=>({setMimeType:()=>JSON.parse(text)})},
 tmv3_serviceDeliveryOrderBackfill:()=>{calls++;return {status:'ORDER_BACKFILL_CONTINUING',total:81};}};
 vm.createContext(ctx);vm.runInContext(runner(digest,Date.now()+(expired?-60000:60000)),ctx);
 return {response:ctx.doPost(body===null?null:{postData:{contents:typeof body==='string'?body:JSON.stringify(body)}}),calls};}
let r=run({token,action:'FIXED_SD_ORDER_BACKFILL'});assert.equal(r.response.ok,true);assert.equal(r.calls,1);cases++;
for(const body of [null,'invalid JSON',{}, {token:'wrong',action:'FIXED_SD_ORDER_BACKFILL'},{token,action:'RUN_ANYTHING'},{token}]){r=run(body);assert.equal(r.response.ok,false);assert.equal(r.calls,0);cases++;}
r=run({token,action:'FIXED_SD_ORDER_BACKFILL'},true);assert.equal(r.response.ok,false);assert.equal(r.calls,0);cases++;
assert.throws(()=>runner('bad',Date.now()),/INVALID_AUTH/);cases++;
const fs=require('fs'),script=fs.readFileSync('tools/tmv3-service-delivery-backfill-launch.js','utf8');
assert.ok(script.includes("api('/deployments')"));assert.ok(!script.includes("api('/versions','POST'"));assert.ok(!script.includes("api('/deployments','POST'"));cases++;
assert.ok(!runner(digest,Date.now()).includes(token));cases++;
console.log('PASS: '+cases+' expiring authentication, fixed-action isolation, source restoration and no-plaintext-token checks.');

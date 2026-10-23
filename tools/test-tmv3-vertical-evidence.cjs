// JavaScript / Node.js: target-only Order evidence cache refresh; ownership and omission boundaries.
'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const dir=process.env.TMV3_TEST_SOURCE_DIR || 'apps-script/tmv3-clean';const c={Date,console,Logger:{log(){}},Utilities:{DigestAlgorithm:{SHA_256:'sha256'},Charset:{UTF_8:'utf8'},computeDigest:(_,s)=>Array.from(crypto.createHash('sha256').update(s).digest())}};
vm.createContext(c);for(const f of fs.readdirSync(dir).filter(f=>f.endsWith('.js')).sort())vm.runInContext(fs.readFileSync(dir+'/'+f,'utf8'),c);
let cases=0;const check=(a,b)=>{assert.equal(a,b);cases++;};const throws=fn=>{assert.throws(fn);cases++;};
const headers=['Order ID','Order Number','Customer ID','Location ID','Contact ID','Status','Name','Order Type','URL','Fingerprint'];
const row=[123,'585000','456','888','','Approved','Original name','SALES_ORDER','original-url','old'];
let data,writes,locationWrites,owned,contactOwner,status;
function reset(){data=[headers,row.slice()];writes=0;locationWrites=0;owned=[{'Location ID':'888','Customer ID':'456',Address:'50 Example Street, Toronto'}];contactOwner=true;status='approved';}
const sheet={getDataRange:()=>({getValues:()=>data.map(r=>r.slice())}),getRange:(r,col,n,w)=>({setValues:rows=>{writes++;data[r-1]=rows[0].slice();},getValues:()=>[data[r-1].slice()]})};
c.tmv3_sheet_=()=>sheet;c.tmv3_taskFirstFreshOrderOwnershipById_=(id,cid,name,vertical)=>{assert.equal(String(id),'123');assert.equal(String(cid),'456');assert.equal(name,'SO#585000');if(status!==(vertical==='Service'?'in progress':'approved'))throw Error('ORDER_NOT_VERIFIED_ACTIVE');return {verified:true,orderId:'123',customerId:'456',status,contactId:'789',locationId:'888'};};
c.tmv3_getContactById_=(id,cid)=>({__ownershipVerified:contactOwner});c.tmv3_preInspectionCustomerLocationsFresh_=()=>owned;c.tmv3_upsertLocationCacheObject_=()=>locationWrites++;c.tmv3_taskFirstFindOrderByTitle_=()=>123;
c.tmv3_addressParts_=v=>String(v).toLowerCase();c.tmv3_locationFullAddress_=l=>l.Address;c.tmv3_addressStrongMatch_=(a,b)=>a===b;
const record={orderNumber:'585000',location:'50 Example Street, Toronto'};const plans=[{expectedOrderId:'123',expectedCustomerId:'456'}];
reset();let result=c.tmv3_verticalEnrichEvidence_('Install',record,plans);check(result.status,'EVIDENCE_REFRESHED');check(data[1][4],'789');check(data[1][6],'Original name');check(data[1][8],'original-url');check(writes,1);check(locationWrites,1);
reset();data.push(row.slice());throws(()=>c.tmv3_verticalEnrichEvidence_('Delivery',record,plans));check(writes,0);
reset();data[1][2]='999';throws(()=>c.tmv3_verticalEnrichEvidence_('Install',record,plans));check(writes,0);
reset();data[0]=['Wrong schema'];throws(()=>c.tmv3_verticalEnrichEvidence_('Install',record,plans));check(writes,0);
reset();contactOwner=false;throws(()=>c.tmv3_verticalEnrichEvidence_('Install',record,plans));check(writes,0);
reset();status='in progress';throws(()=>c.tmv3_verticalEnrichEvidence_('Delivery',record,plans));check(writes,0);
reset();status='in progress';result=c.tmv3_verticalEnrichEvidence_('Service',record,plans);check(result.status,'WORK_ORDER_SOURCE_REQUIRED');check(writes,0);
reset();status='in progress';data[1][7]='WORK_ORDER|SALES_ORDER';result=c.tmv3_verticalEnrichEvidence_('Service',record,plans);check(result.status,'EVIDENCE_REFRESHED');check(data[1][7],'WORK_ORDER|SALES_ORDER');
reset();owned.push({...owned[0],'Location ID':'889'});result=c.tmv3_verticalEnrichEvidence_('Install',record,plans);check(result.locationMatches,2);check(locationWrites,0);
reset();result=c.tmv3_verticalEnrichEvidence_('Install',record,[{expectedCustomerId:''}]);check(result.status,'IDENTITY_OR_ORDER_REVIEW');check(writes,0);
throws(()=>c.tmv3_verticalEnrichEvidence_('PreInspection',record,plans));
const contract=c.tmv3_step7Expected_({vertical:'Install',step3:{anchor:{orderId:'123',orderContactIdEvidence:'789'}},step4:{customer:{'Customer ID':'456'},location:{'Location ID':'888'},locationStatus:'MATCHED'}},{},false);check(contract.requestedById,'789');check(contract.requestedByType,'contact');
console.log('PASS: '+cases+' targeted evidence/schema/ownership cases');

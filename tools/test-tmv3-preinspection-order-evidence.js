// JavaScript / Node.js: optional SO evidence never weakens Customer/Location ownership.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(__dirname+'/../apps-script/tmv3-clean/58_Operations.js','utf8').split('function tmv3_preInspectionOptionalOrderLocationEvidence_(')[1];
function env(change={}){
 let calls=0,writes=0;
 const candidate={Id:501,Number:'585820',Customer:{Id:77}},order={Id:501,OrderNumber:'585820',Customer:{Id:77},ShipToLocation:{Id:12},Contact:{Id:4},Status:{Name:'Quoted'},OrderName:'example'};
 const responses=[change.search??{TotalCount:1,Data:[candidate]},change.order??order];
 const rows=[['Order ID','Order Number','Customer ID','Location ID','Contact ID','Status','Name','Order Type','URL','Fingerprint'],...(change.cache||[])];
 const c=vm.createContext({tmv3_first_:(o,aliases)=>{const key=Object.keys(o||{}).find(k=>k.toLowerCase()===aliases[0].toLowerCase());return key===undefined?'':o[key];},TMV3:{API_BASE:'https://api.striven.com',SHEETS:{ORDERS:'Source Orders'}},
 tmv3_rows_:()=>change.locationCache||[],tmv3_upsertLocationCacheObject_:x=>{assert.equal(x['Location ID'],12);assert.equal(x['Customer ID'],77);},tmv3_step2CalendarRecords_:x=>x,tmv3_step3BusinessAnchorRecords_:x=>x,tmv3_step3AnchorIndex_:()=>({}),tmv3_step4IdentityIndex_:()=>({}),
 tmv3_step4IdentityRecords_:()=>[{step4:{code:change.code||'AMBIGUOUS_STRONG_LOCATION',customer:{'Customer ID':77}}}],
 tmv3_fetchJson_:()=>{calls++;return responses.shift();},
 tmv3_preInspectionCustomerLocationsFresh_:()=>change.locations||[{'Location ID':12,'Customer ID':77,'Address 1':'12 Main St'}],
 tmv3_addressStrongMatch_:()=>change.addressMatches!==false,tmv3_addressParts_:x=>x,tmv3_locationFullAddress_:x=>x['Address 1'],
 tmv3_normalizeOrder_:r=>[r.Id,r.OrderNumber,r.CustomerId,r.LocationId,r.ContactId,r.Status,r.Name,'SALES_ORDER','url','hash'],
 tmv3_sheet_:()=>({getDataRange:()=>({getValues:()=>rows}),getRange:(row,col,height,width)=>({setValues:data=>{writes++;assert.equal(data[0][3],12);assert.equal(data[0][2],77);}})}),tmv3_audit_:()=>{}});
 vm.runInContext('function tmv3_preInspectionOptionalOrderLocationEvidence_('+source,c);
 return {run:r=>c.tmv3_preInspectionOptionalOrderLocationEvidence_(r||{vertical:'PreInspection',orderNumber:'585820',location:'12 Main St',eventId:'event'}),calls:()=>calls,writes:()=>writes};
}
let e=env();assert.equal(e.run().status,'CACHE_REPAIRED');assert.equal(e.calls(),2);assert.equal(e.writes(),1);
for(const change of [
 {search:{TotalCount:0,Data:[]}}, {search:{TotalCount:2,Data:[{Id:501,Number:'585820',Customer:{Id:77}}]}},
 {search:{TotalCount:1,Data:[{Id:501,Number:'585821',Customer:{Id:77}}]}},
 {search:{TotalCount:1,Data:[{Id:501,Number:'585820',Customer:{Id:78}}]}},
 {order:{Id:502,OrderNumber:'585820',Customer:{Id:77},ShipToLocation:{Id:12}}},
 {order:{Id:501,OrderNumber:'585820',Customer:{Id:78},ShipToLocation:{Id:12}}},
 {order:{Id:501,OrderNumber:'585820',Customer:{Id:77},ShipToLocation:{Id:99}}},
 {locations:[]}, {addressMatches:false},
 {cache:[[999,'585820',77,12,0,'Quoted','wrong','SALES_ORDER']]},
 {cache:[[501,'585820',78,12,0,'Quoted','wrong','SALES_ORDER']]}
]){e=env(change);assert.notEqual(e.run().status,'CACHE_REPAIRED');assert.equal(e.writes(),0);}
e=env({code:'MATCHED'});assert.equal(e.run().status,'NOT_REQUIRED');assert.equal(e.calls(),0);
e=env();assert.equal(e.run({vertical:'Service',orderNumber:'585820'}).status,'NOT_REQUIRED');assert.equal(e.calls(),0);
e=env();assert.equal(e.run({vertical:'PreInspection',orderNumber:'bad'}).status,'NOT_REQUIRED');assert.equal(e.calls(),0);
e=env({search:{totalCount:1,data:[{id:501,number:'585820',customer:{id:77}}]},order:{id:501,orderNumber:'585820',customer:{id:77},shipToLocation:{id:12}}});assert.equal(e.run().status,'CACHE_REPAIRED');assert.equal(e.writes(),1);
for(const cache of [[{'Location ID':12,'Customer ID':78}],[{'Location ID':12,'Customer ID':77},{'Location ID':12,'Customer ID':77}]]){e=env({locationCache:cache});assert.equal(e.run().status,'LOCATION_CACHE_CONFLICT');assert.equal(e.writes(),0);}
console.log('18 optional-order Location evidence scenarios passed');

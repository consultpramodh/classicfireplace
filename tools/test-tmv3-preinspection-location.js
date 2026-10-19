// JavaScript / Node.js: documented Location contract, ownership, completeness and retry guards.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const s=fs.readFileSync(__dirname+'/../apps-script/tmv3-clean/58_Operations.js','utf8');
const extract=(name)=>{let start=s.indexOf('function '+name+'(');let next=s.indexOf('\nfunction ',start+10);return s.slice(start,next<0?s.length:next);};
let response, calls=0;
const c=vm.createContext({TMV3:{API_BASE:'https://api.striven.com'},tmv3_clean_:x=>String(x??'').trim(),
 tmv3_fetchJson_:(url,opts)=>{calls++;assert.equal(url,'https://api.striven.com/v1/customers/77/locations');assert.equal(opts.method,'get');return response;},
 tmv3_normalizeLocation_:r=>[r.Id,r.CustomerId,r.Address1,r.Address2,r.City,r.State,r.PostalCode],
 tmv3_normalizedLocationObject_:r=>({'Location ID':r[0],'Customer ID':r[1],'Address 1':r[2]})});
for(const name of ['tmv3_parseCanadianCustomerLocation_','tmv3_preInspectionCustomerLocationsFresh_','tmv3_preInspectionRejectedAddressGuard_'])vm.runInContext(extract(name),c);
const p=c.tmv3_parseCanadianCustomerLocation_('12 Main St, Toronto, ON M1N 1N1, Canada',77);
assert.equal(p.Id,0);assert.equal(p.IsPrimary,false);assert.equal(p.Address.Address1,'12 Main St');assert.equal(p.Address.City,'Toronto');assert.equal(p.Address.State,'ON');assert.equal(p.Address.PostalCode,'M1N 1N1');assert.equal(p.Address1,undefined);assert.equal(p.Address.Country,'CA');
const row={Id:12,Customer:{Id:77},Address:{Address1:'12 Main St',City:'Toronto'}};
response={TotalCount:1,Data:[row]};assert.equal(c.tmv3_preInspectionCustomerLocationsFresh_(77)[0]['Customer ID'],77);assert.equal(calls,1);
for(const bad of [null,{}, {TotalCount:2,Data:[row]}, {TotalCount:1,Data:[{...row,Customer:{Id:78}}]}, {TotalCount:2,Data:[row,row]}, {TotalCount:1,Data:[{...row,Address:null}]}]){response=bad;assert.throws(()=>c.tmv3_preInspectionCustomerLocationsFresh_(77),/NO_CREATE/);}
response={TotalCount:0,Data:[]};assert.equal(c.tmv3_preInspectionCustomerLocationsFresh_(77).length,0);
assert.throws(()=>c.tmv3_preInspectionCustomerLocationsFresh_('bad'),/INVALID/);
const guard={state:'UNCERTAIN',error:'Striven request failed HTTP 400: {"message":"Address object is required"}'};
const fresh={owned:[],matches:[]},ok=c.tmv3_preInspectionRejectedAddressGuard_;
assert.equal(ok(guard,fresh),true);
for(const g of [{...guard,locationId:12},{...guard,addressSchema:'nested-address-v1'},{...guard,error:'HTTP 500'},{...guard,error:'HTTP 400: permission denied'},{...guard,state:'ATTEMPT_STARTED'}])assert.equal(ok(g,fresh),false);
assert.equal(ok(guard,{owned:[row],matches:[row]}),false);
response={totalCount:1,data:[{id:12,customer:{id:77},address:{address1:'12 Main St',city:'Toronto'}}]};assert.equal(c.tmv3_preInspectionCustomerLocationsFresh_(77)[0]['Location ID'],12);
for(const empty of [{totalCount:0,data:null},{TotalCount:0,Data:null}]){response=empty;assert.equal(c.tmv3_preInspectionCustomerLocationsFresh_(77).length,0);}
for(const bad of [{totalCount:1,data:null},{totalCount:0},{data:null},{totalCount:'0',data:null}]){response=bad;assert.throws(()=>c.tmv3_preInspectionCustomerLocationsFresh_(77),/NO_CREATE/);}
console.log('Location payload, targeted read, six unsafe response cases, and seven recovery guards passed');

const rejectedCountry={state:'UNCERTAIN',addressSchema:'nested-address-v1',error:'HTTP 400: {"message":"The country code Canada could not be read.","modelState":{"country_Invalid":["The country code Canada could not be read."]}}'};
assert.equal(ok(rejectedCountry,fresh),true);
assert.equal(ok({...rejectedCountry,addressSchema:'nested-address-country-code-v2'},fresh),false);
assert.equal(ok({...rejectedCountry,locationId:12},fresh),false);
assert.equal(ok({...rejectedCountry,error:rejectedCountry.error.replace('400','500')},fresh),false);
assert.equal(ok(rejectedCountry,{owned:[row],matches:[row]}),false);
console.log('CA country payload and 5 exact validation recovery scenarios passed');

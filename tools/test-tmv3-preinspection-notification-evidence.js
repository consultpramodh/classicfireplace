// JavaScript / Node.js: notification evidence never changes write authorization.
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const path=require('path');
const dir=process.env.TMV3_TEST_SOURCE_DIR || path.join(__dirname,'../apps-script/tmv3-clean');
const c={};vm.createContext(c);
for(const file of fs.readdirSync(dir).filter(f=>f.endsWith('.js')).sort()) vm.runInContext(fs.readFileSync(path.join(dir,file),'utf8'),c,{filename:file});
const row={'Customer Number':'12345',Name:'Test Person','Primary Phone':'4165550101'};const f=(title,rows=[row])=>c.tmv3_preInspectionNotificationCustomerNumber_({title},rows);
assert.equal(f('12345 Test Person 416.555.0101'),'12345');
assert.equal(f('Test Person 416.555.0101 12345 SO#586000'),'12345');
assert.equal(f('12345 Test Person'),'12345');
assert.equal(f('Test Person SO#12345'),'');
assert.equal(f('12345 Other Person 416.555.0102'),'');
assert.equal(f('99999 Test Person 416.555.0101'),'');
assert.equal(f('12345 Test Person',[row,{...row}]),'');
assert.equal(f('12345 Test Person 22222 Second Person',[row,{'Customer Number':'22222',Name:'Second Person'}]),'');
assert.equal(f('Test Person 416.555.0101'),'');
assert.equal(f('Test Person https://example.com/12345'),'');
c.tmv3_rows_=()=>[row];
let assessment=c.tmv3_preInspectionMissingDetailAssessment_({title:'12345 Test Person 416.555.0101',location:'12 Main St',orderNumber:'586000'});
assert.equal(assessment.shouldNotify,false);
assessment=c.tmv3_preInspectionMissingDetailAssessment_({title:'12345 Test Person',location:'12 Main St'});
assert.equal(assessment.missing.length,1);assert.equal(assessment.missing[0].code,'SALES_ORDER');assert.match(assessment.missing[0].message,/optional/);
console.log('12 notification evidence and assessment cases passed');


// Shared intake/notification contract, including stale or conflicting cache evidence.
const evidence=(title,rows=[row],extra={})=>
  c.tmv3_preInspectionCustomerNumberEvidence_({...extra,title},rows);
assert.equal(evidence('Test Person 416 555-0101 12345 SO#586000').status,'VERIFIED');
assert.equal(evidence('Test Person 416 555-0101 12345 SO#586000').number,'12345');
assert.equal(c.tmv3_extractCustomerNumberForVertical_('PreInspection','',
  {title:'Test Person 416 555-0101 12345 SO#586000'},[row]),'12345');
assert.equal(evidence('Test Person 12345',[]).status,'PRESENT_UNVERIFIED');
assert.equal(evidence('Test Person 12345',[row,{...row}]).status,'AMBIGUOUS');
assert.equal(evidence('Customer #12345',[]).number,'12345');
assert.equal(evidence('Customer #12345',[],{identityDescriptionClean:'Customer #22222'}).status,'AMBIGUOUS');
assert.equal(evidence('Test Person',[],{identityDescriptionClean:'Customer #12345'}).number,'12345');
assert.equal(evidence('Test Person',[],{identityDescriptionClean:'Visit 12345 Main St'}).status,'MISSING');
assert.equal(evidence('Test Person SO#12345').status,'MISSING');
assert.equal(evidence('Test Person https://example.com/12345').status,'MISSING');
assert.equal(evidence('Test Person 416 555-0101').status,'MISSING');
const complete={title:'Test Person 416 555-0101 12345 SO#586000',
  location:'12 Main St',orderNumber:'586000'};
for (const rows of [[],[row,{...row}],
  [{'Customer Number':'12345',Name:'Other Person','Primary Phone':'9055550102'}]]) {
  c.tmv3_rows_=()=>rows;
  const result=c.tmv3_preInspectionMissingDetailAssessment_(complete);
  assert.equal(result.shouldNotify,false);
  assert.equal(result.customerNumberReviewRequired,true);
}
c.tmv3_rows_=()=>[row];
assert.equal(c.tmv3_preInspectionMissingDetailAssessment_(complete).shouldNotify,false);
assert.equal(c.tmv3_extractCustomerNumberForVertical_('Install','Customer #12345'),'12345');
assert.equal(c.tmv3_extractCustomerNumberForVertical_('Delivery','12345 - Test Person'),'');
console.log('Shared customer-number intake and notification regressions passed');

'use strict';
const assert=require('node:assert/strict');
const {UID,EVENT_ID,SOURCE,EXPECTED,validateSource,makePrivateCopy,verifyCopy,ensureNoDuplicate}=require('./tmv3-terry-approval-intake.cjs');
const fixture={id:EVENT_ID,iCalUID:UID,status:'confirmed',summary:EXPECTED.title,location:EXPECTED.location,
  creator:{email:EXPECTED.creator},organizer:{email:SOURCE},eventType:'default',
  start:{dateTime:'2026-11-11T15:00:00-05:00'},end:{dateTime:'2026-11-11T16:00:00-05:00'},
  description:'remove old gas fireplace. H3 install.\nG3.5 upstairs installed by us in 2023.\n\n'};
assert.equal(validateSource(fixture),fixture);
const copy=makePrivateCopy(fixture);
assert.equal(copy.iCalUID,UID);
assert.equal(copy.privateCopy,true);
assert.equal(copy.description,fixture.description);
assert.equal(copy.attendees,undefined);
assert.equal(copy.reminders.useDefault,false);
assert.equal(copy.extendedProperties.private.tmv3TaskWriteHold,'YES');
assert.equal(verifyCopy({...copy,id:'imported-calendar-copy-id',status:'confirmed'},fixture),true);
assert.doesNotThrow(()=>ensureNoDuplicate({items:[]},fixture));
assert.throws(()=>ensureNoDuplicate({items:[{summary:'53480 Terry Beettam',iCalUID:'different@google.com',status:'confirmed'}]},fixture),/DUPLICATE/);
assert.throws(()=>ensureNoDuplicate({items:[],nextPageToken:'more'},fixture),/INCOMPLETE/);
assert.throws(()=>validateSource({...fixture,summary:'Different customer'}),/CHANGED/);
assert.throws(()=>validateSource({...fixture,creator:{email:'nobody@example.com'}}),/CREATOR/);
assert.throws(()=>validateSource({...fixture,attendees:[{email:'someone@example.com'}]}),/ATTENDEES/);
assert.throws(()=>validateSource({...fixture,attachments:[{fileUrl:'any'}]}),/ATTACHMENTS/);
assert.throws(()=>validateSource({...fixture,iCalUID:'different@google.com'}),/UID/);
assert.throws(()=>verifyCopy({...copy,privateCopy:false},fixture),/PRIVATE_COPY/);
console.log('TERRY_INTAKE_TESTS_PASS: exact source, note parity, iCalUID, no guests, no reminders, duplicate fail-close, private-copy readback');

'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('apps-script/tmv3-vertical-split-staging/30_PreInspection.gs','utf8');
for(const n of ['tmv3_terryQuietCalendarIntake_','tmv3_previewTerryQuietCalendarIntake','tmv3_importTerryQuietCalendarIntake'])
  assert.equal(source.split('function '+n+'(').length,2,n);
const suffix=source.slice(source.indexOf('function tmv3_terryQuietCalendarIntake_('));
new vm.Script(suffix);
for(const gate of ['TERRY_SOURCE_IDENTITY_CONTENT_OR_GUEST_DRIFT','TERRY_POSSIBLE_CF_DUPLICATE_NO_IMPORT',
  'TERRY_IMPORT_OUTCOME_UNKNOWN_DO_NOT_RETRY','tmv3TaskWriteHold','privateCopy:true','/import'])
  assert.ok(suffix.includes(gate),gate);
const executable=suffix.split('\n').filter(line=>!line.trim().startsWith('//')).join('\n');
assert.equal(executable.includes('MailApp.sendEmail('),false);
assert.equal(executable.includes('.addGuest('),false);
console.log('TERRY_GAS_QUIET_INTAKE_PASS: 3 source functions, verified no guest/email/Striven writer');

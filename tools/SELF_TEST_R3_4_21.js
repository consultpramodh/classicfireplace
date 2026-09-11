#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'preinspect-r3421-selftest-'));
const src = path.join(root, 'src');
fs.mkdirSync(src);

const f35 = path.join(src, '35_PreInspect_Task_Review.js');
const f36 = path.join(src, '36_PreInspect_Task_Create.js');

fs.writeFileSync(f35, `
function preinspectR32PushRequestedByPlan_(taskId, contactId) {
  const payload = { RequestedBy: { Id: Number(contactId), Type: 'contact' } };
  return payload;
}
function unrelated35_() { return true; }
`, 'utf8');

fs.writeFileSync(f36, `
function preinspectCreateBuildPlan_(state) {
  return {
    title: 'x',
    requestedBy: { Id: Number(state.contactId || 0), Type: 'contact' },
    useSubContractor: false
  };
}
function unrelated36_() { return true; }
`, 'utf8');

const patcher = path.join(__dirname, 'patch_preinspect_requestedby_organizer.js');
const resultText = cp.execFileSync(process.execPath, [patcher, src], { encoding: 'utf8' });
const result = JSON.parse(resultText);

const a = fs.readFileSync(f35, 'utf8');
const b = fs.readFileSync(f36, 'utf8');

const checks = {
  exactTwoFilePatch:
    Array.isArray(result.changedFiles) &&
    result.changedFiles.length === 2 &&
    result.changedFiles.some(x => x.startsWith('35_PreInspect_Task_Review.')) &&
    result.changedFiles.some(x => x.startsWith('36_PreInspect_Task_Create.')),
  helperMarkerPresent: a.includes('PREINSPECT_R3421_REQUESTED_BY_ORGANIZER_EMPLOYEE'),
  existingTaskDelegatesToOrganizerEmployee:
    a.includes('preinspectR3421PushRequestedByOrganizerPlan_.apply(this, arguments)'),
  employeePayloadPresent:
    a.includes("RequestedBy: { Id: Number(employee.id), Type: 'employee' }"),
  createUsesOrganizerEmployee:
    b.includes("requestedBy: preinspectR3421BuildRequestedByForEvent_(String(state.row['Event ID'] || '').trim())"),
  noCustomerContactFallback:
    result.behavior && result.behavior.customerContactFallback === false
};

let secondRunBlocked = false;
try {
  cp.execFileSync(process.execPath, [patcher, src], { encoding: 'utf8', stdio: ['ignore','pipe','pipe'] });
} catch (e) {
  secondRunBlocked = true;
}
checks.patchIdempotentByGuard = secondRunBlocked;

const pass = Object.values(checks).every(Boolean);
const out = { pass, release: result.release, checks };
console.log(JSON.stringify(out, null, 2));
process.exit(pass ? 0 : 1);

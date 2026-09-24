#!/usr/bin/env node
'use strict';

const fs = require('fs');
const file = process.argv[2];
const nonce = process.argv[3];
if (!file || !nonce) throw new Error('Usage: node tools/preinspect-kristin-18683-targeted-patch.js <gateway.js> <nonce>');

let s = fs.readFileSync(file, 'utf8');
const anchor = 'function doGet() {';
if (!s.includes(anchor)) throw new Error('doGet anchor missing.');

const fn = String.raw`
function tmTemporaryResolveKristin18683_() {
  const expected = {
    eventId: '6pl5biq9hudbook4vd6etgcbfh@google.com',
    taskId: 18683,
    customerId: 62540,
    locationId: 58177,
    contactId: 56437,
    taskTypeId: 105,
    poolId: 8
  };

  const ss = SpreadsheetApp.openById(PREINSPECT_REVIEW_CONFIG.CALENDAR_SYNC.SPREADSHEET_ID);
  const sheet = ss.getSheetByName(PREINSPECT_REVIEW_CONFIG.SHEETS.MAPPING);
  if (!sheet) throw new Error('BLOCKED: missing PreInspect Task Mapping.');

  const values = sheet.getDataRange().getDisplayValues();
  const headers = values[0].map(function(v) { return String(v || '').trim(); });
  const eventCol = headers.indexOf('Event ID');
  const taskCol = headers.indexOf('Task ID');
  const customerCol = headers.indexOf('Customer ID');
  const locationCol = headers.indexOf('Location ID');
  const contactCol = headers.indexOf('Contact ID');
  if ([eventCol, taskCol, customerCol, locationCol, contactCol].some(function(i){ return i < 0; })) {
    throw new Error('BLOCKED: required PreInspect mapping headers are missing.');
  }

  let rowNumber = 0;
  for (let r = 1; r < values.length; r++) {
    if (String(values[r][eventCol] || '').trim() === expected.eventId) {
      rowNumber = r + 1;
      break;
    }
  }
  if (!rowNumber) throw new Error('BLOCKED: Kristin event row not found.');

  const row = values[rowNumber - 1];
  const actualMap = {
    taskId: Number(row[taskCol] || 0),
    customerId: Number(row[customerCol] || 0),
    locationId: Number(row[locationCol] || 0),
    contactId: Number(row[contactCol] || 0)
  };
  if (
    actualMap.taskId !== expected.taskId ||
    actualMap.customerId !== expected.customerId ||
    actualMap.locationId !== expected.locationId ||
    actualMap.contactId !== expected.contactId
  ) {
    throw new Error('BLOCKED: Kristin mapping identity changed: ' + JSON.stringify(actualMap));
  }

  const before = getReplacementTaskSourceSnapshot_(expected.taskId);
  if (!before) throw new Error('BLOCKED: Task 18683 could not be read.');
  if (!before.type || Number(before.type.id || 0) !== expected.taskTypeId) {
    throw new Error('BLOCKED: Task 18683 is not Task Type 105.');
  }
  const statusName = before.status && (before.status.name || before.status.Name) ? String(before.status.name || before.status.Name).toUpperCase() : '';
  if (statusName !== 'OPEN') throw new Error('BLOCKED: Task 18683 is not OPEN.');
  if (!before.customer || Number(before.customer.id || 0) !== expected.customerId) {
    throw new Error('BLOCKED: Task 18683 customer changed.');
  }
  if (!before.location || Number(before.location.id || 0) !== expected.locationId) {
    throw new Error('BLOCKED: Task 18683 location changed.');
  }
  if (before.salesOrder && Number(before.salesOrder.id || 0) > 0) {
    throw new Error('BLOCKED: unexpected Sales Order is attached to Task 18683.');
  }

  const assignment = preinspectR342NormalizeNewTaskAssignments_(expected.taskId);

  const patch = patchStrivenTaskById_(expected.taskId, {
    Id: expected.taskId,
    RequestedBy: { Id: expected.contactId, Type: 'contact' }
  });

  const after = getReplacementTaskSourceSnapshot_(expected.taskId);
  const requestedId = after && after.requestedBy ? Number(after.requestedBy.id || 0) : 0;
  const employeeIds = Array.isArray(after && after.employeeAssignmentIds) ? after.employeeAssignmentIds.map(Number).filter(Boolean).sort(function(a,b){return a-b;}) : [];
  const poolIds = Array.isArray(after && after.poolAssignmentIds) ? after.poolAssignmentIds.map(Number).filter(Boolean).sort(function(a,b){return a-b;}) : [];

  if (requestedId !== expected.contactId) {
    throw new Error('Requested By read-back mismatch: expected 56437, got ' + requestedId + '.');
  }
  if (employeeIds.length) {
    throw new Error('Assignment read-back still has employee IDs: ' + employeeIds.join(',') + '.');
  }
  if (poolIds.indexOf(expected.poolId) < 0) {
    throw new Error('Assignment read-back is missing Pool 8: ' + poolIds.join(',') + '.');
  }

  ss.setActiveSheet(sheet);
  sheet.setActiveRange(sheet.getRange(rowNumber, 1, 1, 1));
  SpreadsheetApp.flush();
  const review = reviewSelectedPreInspectMappingRow();
  SpreadsheetApp.flush();

  const finalValues = sheet.getRange(rowNumber, 1, 1, sheet.getLastColumn()).getDisplayValues()[0];
  const finalHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0].map(function(v){return String(v || '').trim();});
  function pick(name) {
    const i = finalHeaders.indexOf(name);
    return i >= 0 ? String(finalValues[i] || '').trim() : '';
  }

  const finalTaskId = Number(pick('Task ID') || 0);
  const finalTaskContactId = Number(pick('Task Contact ID') || 0);
  if (finalTaskId !== expected.taskId) throw new Error('Final mapping lost Task 18683.');
  if (finalTaskContactId !== expected.contactId) {
    throw new Error('Final mapping Task Contact ID mismatch: expected 56437, got ' + finalTaskContactId + '.');
  }

  return {
    mode: 'PREINSPECT_KRISTIN_18683_TARGETED_RECONCILE',
    status: 'COMPLETE_AND_VERIFIED',
    writesPerformed: true,
    mappingRow: rowNumber,
    eventId: expected.eventId,
    taskId: expected.taskId,
    requestedByContactId: requestedId,
    employeeAssignmentIds: employeeIds,
    poolAssignmentIds: poolIds,
    assignment: assignment,
    patchStatusCode: patch && patch.statusCode ? patch.statusCode : null,
    review: review,
    finalMapping: {
      status: pick('Status'),
      taskAction: pick('Task Action'),
      taskStatus: pick('Task Status'),
      taskContactId: finalTaskContactId,
      issue: pick('Issue')
    }
  };
}

`;

const injected =
  fn +
  'function doGet(e) {\n' +
  '  if (e && e.parameter && e.parameter.__preinspect_kristin === ' + JSON.stringify(nonce) + ') {\n' +
  '    return tmWebJson_(tmTemporaryResolveKristin18683_());\n' +
  '  }\n' +
  '  if (e && e.parameter && e.parameter.__preinspect_today === ' + JSON.stringify(nonce) + ') {\n' +
  '    return tmWebJson_(runNextPreInspectActionFromAppsScript());\n' +
  '  }';

s = s.replace(anchor, injected);
fs.writeFileSync(file, s);
console.log('PREINSPECT_KRISTIN_18683_TARGETED_GATEWAY_PATCHED');

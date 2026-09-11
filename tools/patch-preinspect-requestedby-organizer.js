#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const sourceRoot = process.argv[2];
if (!sourceRoot) {
  console.error('Usage: node patch-preinspect-requestedby-organizer.js <apps-script-src-folder>');
  process.exit(2);
}

const RELEASE = 'R3.4.21_REQUESTED_BY_ORGANIZER_EMPLOYEE';
const HELPER_MARKER = 'PREINSPECT_R3421_REQUESTED_BY_ORGANIZER_EMPLOYEE';

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

function findSingle(prefix) {
  const matches = walk(sourceRoot).filter(f => path.basename(f).startsWith(prefix + '.'));
  if (matches.length !== 1) {
    throw new Error(`Expected exactly one ${prefix} source file; found ${matches.length}: ${matches.join(', ')}`);
  }
  return matches[0];
}

function sha256(text) {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

// Deliberately uses declaration regions rather than a brace parser because
// Apps Script source may contain regex literals with braces.
function getFunctionRegion(text, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`function\\s+${escaped}\\s*\\(([^)]*)\\)\\s*\\{`, 'm');
  const match = re.exec(text);
  if (!match) throw new Error(`Function not found: ${name}`);

  const start = match.index;
  const nextRe = /\nfunction\s+[A-Za-z_$][\w$]*\s*\(/g;
  nextRe.lastIndex = start + match[0].length;
  const next = nextRe.exec(text);
  const boundary = next ? next.index : text.length;
  const segment = text.slice(start, boundary);
  const closeRel = segment.lastIndexOf('}');
  if (closeRel < 0) throw new Error(`Could not locate closing region for ${name}`);

  return {
    start,
    end: start + closeRel + 1,
    params: match[1],
    text: text.slice(start, start + closeRel + 1)
  };
}

function replaceFunction(text, name, body) {
  const region = getFunctionRegion(text, name);
  const replacement = `function ${name}(${region.params}) {\n${body.trimEnd()}\n}`;
  return text.slice(0, region.start) + replacement + text.slice(region.end);
}

function patchCreateRequestedBy(text) {
  const region = getFunctionRegion(text, 'preinspectCreateBuildPlan_');
  let block = region.text;
  const pattern = /requestedBy:\s*[\s\S]*?,\s*useSubContractor:/g;
  const matches = [...block.matchAll(pattern)];

  if (matches.length !== 1) {
    throw new Error(`Expected exactly one requestedBy create block in preinspectCreateBuildPlan_; found ${matches.length}`);
  }
  if (!/Type\s*:\s*['"]contact['"]|type\s*:\s*['"]contact['"]/.test(matches[0][0])) {
    throw new Error('Create requestedBy block no longer contains contact semantics; refusing blind patch.');
  }

  block = block.replace(
    pattern,
    "requestedBy: preinspectR3421BuildRequestedByForEvent_(String(state.row['Event ID'] || '').trim()),\n    useSubContractor:"
  );
  return text.slice(0, region.start) + block + text.slice(region.end);
}

const helpers = `

/************************************************************
 * PREINSPECT_R3421_REQUESTED_BY_ORGANIZER_EMPLOYEE
 * PreInspection ONLY.
 * Requested By = Calendar organizer -> exact Striven Employee.
 ************************************************************/
function preinspectR3421PushRequestedByOrganizerPlan_() {
  const context = preinspectR3421ResolveTaskContext_(Array.prototype.slice.call(arguments));
  const employee = preinspectR3421ResolveOrganizerEmployee_(context.eventId);

  if (typeof getReplacementTaskSourceSnapshot_ !== 'function') {
    throw new Error('BLOCKED: getReplacementTaskSourceSnapshot_ is unavailable.');
  }

  const before = getReplacementTaskSourceSnapshot_(context.taskId);
  if (!before || !before.type || Number(before.type.id) !== 105) {
    throw new Error('BLOCKED: organizer Requested By may write only to PreInspection Task Type 105.');
  }

  const previous = before.requestedBy || null;
  const previousId = previous && previous.id ? Number(previous.id) : 0;
  const previousType = previous && previous.type ? String(previous.type).toLowerCase() : '';

  if (previousId === Number(employee.id) && (!previousType || previousType === 'employee')) {
    return {
      status: 'NOT_NEEDED',
      writesPerformed: false,
      field: 'RequestedBy',
      employeeId: Number(employee.id),
      employeeName: employee.name || '',
      organizerEmail: employee.email,
      resolutionMethod: 'CALENDAR_ORGANIZER_EMAIL_EXACT_EMPLOYEE',
      reason: 'Task Requested By already matches the Calendar organizer employee.'
    };
  }

  const payload = { RequestedBy: { Id: Number(employee.id), Type: 'employee' } };
  if (typeof patchStrivenTaskById_ === 'function') {
    patchStrivenTaskById_(context.taskId, payload);
  } else if (typeof updateStrivenTaskById_ === 'function') {
    updateStrivenTaskById_(context.taskId, payload);
  } else {
    throw new Error('BLOCKED: no approved Striven Task PATCH helper is available.');
  }

  const after = getReplacementTaskSourceSnapshot_(context.taskId);
  const actual = after && after.requestedBy ? after.requestedBy : null;
  const actualId = actual && actual.id ? Number(actual.id) : 0;
  if (actualId !== Number(employee.id)) {
    throw new Error(
      'Requested By PATCH read-back mismatch for Task ' + context.taskId +
      '. Expected Employee ID ' + employee.id + '; got ' + (actualId || 'blank') + '.'
    );
  }

  return {
    status: 'PUSHED_AND_VERIFIED',
    writesPerformed: true,
    field: 'RequestedBy',
    previousRequestedById: previousId || null,
    employeeId: Number(employee.id),
    employeeName: employee.name || '',
    organizerEmail: employee.email,
    resolutionMethod: 'CALENDAR_ORGANIZER_EMAIL_EXACT_EMPLOYEE'
  };
}

function preinspectR3421BuildRequestedByForEvent_(eventId) {
  const employee = preinspectR3421ResolveOrganizerEmployee_(eventId);
  return { id: Number(employee.id), name: employee.name || '', type: 'employee' };
}

function preinspectR3421ResolveTaskContext_(args) {
  const taskId = Number(preinspectR3421FindNamedValue_(args, ['taskId', 'Task ID', 'TaskId'], 0) || 0);
  const eventId = String(preinspectR3421FindNamedValue_(args, ['eventId', 'Event ID', 'EventId'], 0) || '').trim();
  let rowNumber = Number(preinspectR3421FindNamedValue_(args, ['mappingRow', 'rowNumber', 'Calendar Row'], 0) || 0);

  const ss = SpreadsheetApp.openById(PREINSPECT_REVIEW_CONFIG.CALENDAR_SYNC.SPREADSHEET_ID);
  const sh = ss.getSheetByName('PreInspect Task Mapping');
  if (!sh) throw new Error('BLOCKED: missing PreInspect Task Mapping sheet.');

  let resolvedTaskId = taskId;
  let resolvedEventId = eventId;
  if ((!resolvedTaskId || !resolvedEventId) && rowNumber > 1) {
    const row = preinspectR3421ReadRowObject_(sh, rowNumber);
    resolvedTaskId = resolvedTaskId || Number(row['Task ID'] || 0);
    resolvedEventId = resolvedEventId || String(row['Event ID'] || '').trim();
  }

  if (!resolvedTaskId || !resolvedEventId) {
    try {
      const active = SpreadsheetApp.getActiveSheet();
      if (active && active.getName() === sh.getName() && active.getActiveRange()) {
        rowNumber = active.getActiveRange().getRow();
        if (rowNumber > 1) {
          const row = preinspectR3421ReadRowObject_(sh, rowNumber);
          resolvedTaskId = resolvedTaskId || Number(row['Task ID'] || 0);
          resolvedEventId = resolvedEventId || String(row['Event ID'] || '').trim();
        }
      }
    } catch (ignored) {}
  }

  if (!resolvedTaskId) throw new Error('BLOCKED: PreInspect Task ID could not be resolved.');
  if (!resolvedEventId) throw new Error('BLOCKED: PreInspect Calendar Event ID could not be resolved.');
  return { taskId: resolvedTaskId, eventId: resolvedEventId, mappingRow: rowNumber || null };
}

function preinspectR3421ReadRowObject_(sheet, rowNumber) {
  const lastColumn = sheet.getLastColumn();
  const headers = sheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0];
  const values = sheet.getRange(rowNumber, 1, 1, lastColumn).getDisplayValues()[0];
  const out = {};
  headers.forEach(function(header, i) { out[String(header || '').trim()] = values[i]; });
  return out;
}

function preinspectR3421FindNamedValue_(value, keys, depth) {
  if (depth > 5 || value === null || value === undefined) return '';
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const found = preinspectR3421FindNamedValue_(value[i], keys, depth + 1);
      if (found !== '' && found !== null && found !== undefined) return found;
    }
    return '';
  }
  if (typeof value !== 'object') return '';
  for (let k = 0; k < keys.length; k++) {
    if (Object.prototype.hasOwnProperty.call(value, keys[k])) {
      const v = value[keys[k]];
      if (v !== '' && v !== null && v !== undefined) return v;
    }
  }
  const names = Object.keys(value);
  for (let i = 0; i < names.length; i++) {
    const found = preinspectR3421FindNamedValue_(value[names[i]], keys, depth + 1);
    if (found !== '' && found !== null && found !== undefined) return found;
  }
  return '';
}

function preinspectR3421ResolveOrganizerEmployee_(eventId) {
  const organizerEmail = preinspectR3421OrganizerEmailForEvent_(eventId);
  const matches = preinspectR3421EmployeeDirectory_().filter(function(employee) {
    return preinspectR3421NormalizeEmail_(employee.email) === organizerEmail;
  });
  if (matches.length !== 1) {
    throw new Error(
      'REVIEW: Calendar organizer ' + organizerEmail + ' resolved to ' + matches.length +
      ' Striven Employees. Requested By was not changed.'
    );
  }
  return matches[0];
}

function preinspectR3421OrganizerEmailForEvent_(eventId) {
  const ss = SpreadsheetApp.openById(PREINSPECT_REVIEW_CONFIG.CALENDAR_SYNC.SPREADSHEET_ID);
  const sh = ss.getSheetByName('PreInspect Calendar');
  if (!sh) throw new Error('REVIEW: missing PreInspect Calendar sheet.');

  const values = sh.getDataRange().getDisplayValues();
  if (!values.length) throw new Error('REVIEW: PreInspect Calendar is empty.');
  const headers = values[0];
  const eventCol = headers.indexOf('Event ID');
  const organizerCol = headers.indexOf('Organizers');
  if (eventCol < 0 || organizerCol < 0) {
    throw new Error('REVIEW: PreInspect Calendar requires Event ID and Organizers columns.');
  }

  let organizerText = '';
  for (let r = 1; r < values.length; r++) {
    if (String(values[r][eventCol] || '').trim() === String(eventId || '').trim()) {
      organizerText = String(values[r][organizerCol] || '').trim();
      break;
    }
  }

  const emails = preinspectR3421ExtractEmails_(organizerText);
  if (emails.length !== 1) {
    throw new Error(
      'REVIEW: expected exactly one Calendar organizer email for Event ' + eventId +
      '; found ' + emails.length + '. Requested By was not changed.'
    );
  }
  return emails[0];
}

function preinspectR3421EmployeeDirectory_() {
  const cache = CacheService.getScriptCache();
  const cacheKey = 'PREINSPECT_R3421_EMPLOYEE_DIRECTORY';
  const cached = cache.get(cacheKey);
  if (cached) {
    try { return JSON.parse(cached); } catch (ignored) {}
  }

  if (typeof getStrivenAuth_ !== 'function') throw new Error('BLOCKED: getStrivenAuth_ is unavailable.');
  const auth = getStrivenAuth_();
  const response = UrlFetchApp.fetch(
    String(auth.baseUrl || '').replace(/\/+$/, '') + '/v1/employees',
    {
      method: 'get',
      headers: { Authorization: 'Bearer ' + auth.token, Accept: 'application/json' },
      muteHttpExceptions: true
    }
  );

  const code = response.getResponseCode();
  const text = response.getContentText() || '';
  if (code < 200 || code >= 300) {
    throw new Error('Striven Employees lookup failed HTTP ' + code + ': ' + text.slice(0, 500));
  }

  let json;
  try { json = text ? JSON.parse(text) : []; }
  catch (err) { throw new Error('Striven Employees response was not valid JSON.'); }

  const employees = preinspectR3421ExtractEmployeeRows_(json).map(function(row) {
    return {
      id: Number(row.Id || row.id || row.EmployeeId || row.employeeId || 0),
      name: String(row.Name || row.name || row.EmployeeName || row.employeeName || '').trim(),
      email: preinspectR3421NormalizeEmail_(
        row.Email || row.email || row.EmailAddress || row.emailAddress || row.UserEmail || row.userEmail || ''
      )
    };
  }).filter(function(employee) { return employee.id > 0 && employee.email; });

  try { cache.put(cacheKey, JSON.stringify(employees), 21600); } catch (ignored) {}
  return employees;
}

function preinspectR3421ExtractEmployeeRows_(json) {
  if (Array.isArray(json)) return json;
  if (!json || typeof json !== 'object') return [];
  const keys = ['Employees', 'employees', 'Data', 'data', 'Items', 'items', 'Results', 'results'];
  for (let i = 0; i < keys.length; i++) {
    if (Array.isArray(json[keys[i]])) return json[keys[i]];
  }
  return [];
}

function preinspectR3421ExtractEmails_(value) {
  const matches = String(value || '').match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
  const seen = {};
  return matches.map(preinspectR3421NormalizeEmail_).filter(function(email) {
    if (!email || seen[email]) return false;
    seen[email] = true;
    return true;
  });
}

function preinspectR3421NormalizeEmail_(value) {
  return String(value || '').trim().toLowerCase();
}
`;

const file35 = findSingle('35_PreInspect_Task_Review');
const file36 = findSingle('36_PreInspect_Task_Create');
let src35 = fs.readFileSync(file35, 'utf8');
let src36 = fs.readFileSync(file36, 'utf8');
const before35 = sha256(src35);
const before36 = sha256(src36);

if (src35.includes(HELPER_MARKER)) throw new Error(`${HELPER_MARKER} already exists; refusing to apply twice.`);
const requestedByRegion = getFunctionRegion(src35, 'preinspectR32PushRequestedByPlan_');
if (!/RequestedBy|CUSTOMER_CONTACT|contact/i.test(requestedByRegion.text)) {
  throw new Error('Requested By function region no longer resembles the known PreInspect path; refusing blind patch.');
}

src35 = replaceFunction(
  src35,
  'preinspectR32PushRequestedByPlan_',
  '  return preinspectR3421PushRequestedByOrganizerPlan_.apply(this, arguments);'
);
src35 += helpers;
src36 = patchCreateRequestedBy(src36);

fs.writeFileSync(file35, src35, 'utf8');
fs.writeFileSync(file36, src36, 'utf8');

console.log(JSON.stringify({
  status: 'PATCHED',
  release: RELEASE,
  changedFiles: [path.basename(file35), path.basename(file36)],
  before: { file35: before35, file36: before36 },
  after: { file35: sha256(src35), file36: sha256(src36) },
  behavior: {
    scope: 'PREINSPECTION_ONLY',
    requestedBySource: 'GOOGLE_CALENDAR_ORGANIZER_EMAIL',
    strivenEntity: 'EMPLOYEE',
    payloadType: 'employee',
    unresolvedOrganizer: 'REVIEW_NO_WRITE',
    customerContactFallback: false,
    employeeDirectoryCacheSeconds: 21600
  }
}, null, 2));

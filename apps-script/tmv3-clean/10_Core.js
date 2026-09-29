function tmv3_ss_() {
  return SpreadsheetApp.openById(TMV3_SPREADSHEET_ID);
}

function tmv3_sheet_(name) {
  const sh = tmv3_ss_().getSheetByName(name);
  if (!sh) throw new Error('Missing required V3 sheet: ' + name);
  return sh;
}

function tmv3_clean_(value) {
  return String(value === null || value === undefined ? '' : value).trim();
}

function tmv3_norm_(value) {
  return tmv3_clean_(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function tmv3_digits_(value) {
  return tmv3_clean_(value).replace(/\D+/g, '');
}

function tmv3_phone10_(value) {
  const d = tmv3_digits_(value);
  return d.length >= 10 ? d.slice(-10) : '';
}

function tmv3_now_() {
  return Utilities.formatDate(new Date(), 'America/Toronto', "yyyy-MM-dd'T'HH:mm:ssXXX");
}

function tmv3_date_(date) {
  return Utilities.formatDate(date, 'America/Toronto', 'yyyy-MM-dd');
}

function tmv3_time_(date) {
  return Utilities.formatDate(date, 'America/Toronto', 'HH:mm');
}

function tmv3_iso_(date) {
  return Utilities.formatDate(date, 'America/Toronto', "yyyy-MM-dd'T'HH:mm:ssXXX");
}

// External Striven Task date write contract.
// Striven's Task PATCH/POST parser requires an explicit 12-hour clock marker;
// V3 keeps ISO internally and converts only at the API boundary.
function tmv3_strivenTaskDateTime_(value) {
  const date = tmv3_parseDateTime_(value);
  if (!date) {
    throw new Error('Invalid Striven Task date/time value: ' + tmv3_clean_(value));
  }
  return Utilities.formatDate(date, TMV3_TIMEZONE, 'MM/dd/yyyy hh:mm:ss a');
}

function tmv3_parseDateTime_(value) {
  if (!value) return null;
  if (value instanceof Date) {
    return isNaN(value.getTime()) ? null : value;
  }

  const text = tmv3_clean_(value);
  if (!text) return null;

  // Explicit zone/offset: preserve the actual instant.
  if (/Z$/i.test(text) || /[+-]\d{2}:?\d{2}$/.test(text)) {
    const zoned = new Date(text);
    return isNaN(zoned.getTime()) ? null : zoned;
  }

  const patterns = [
    "yyyy-MM-dd'T'HH:mm:ss",
    "yyyy-MM-dd'T'HH:mm",
    'MM/dd/yyyy hh:mm a',
    'M/d/yyyy h:mm a',
    'MM/dd/yyyy HH:mm',
    'M/d/yyyy H:mm'
  ];

  for (let i = 0; i < patterns.length; i++) {
    try {
      const parsed = Utilities.parseDate(text, TMV3_TIMEZONE, patterns[i]);
      if (parsed && !isNaN(parsed.getTime())) return parsed;
    } catch (ignored) {}
  }

  const fallback = new Date(text);
  return isNaN(fallback.getTime()) ? null : fallback;
}


function tmv3_sameCalendarDate_(a, b) {
  const left = tmv3_parseDateTime_(a);
  const right = tmv3_parseDateTime_(b);
  if (!left || !right) return false;

  return (
    Utilities.formatDate(left, TMV3_TIMEZONE, 'yyyy-MM-dd') ===
    Utilities.formatDate(right, TMV3_TIMEZONE, 'yyyy-MM-dd')
  );
}

function tmv3_taskDueDateOnly_(vertical, task) {
  return (
    tmv3_clean_(vertical) === 'Install' &&
    Number(task && task['Task Type ID'] || 0) === 92
  );
}

function tmv3_hash_(value) {
  const bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    tmv3_clean_(value),
    Utilities.Charset.UTF_8
  );
  return bytes.map(function(b) {
    return ('0' + ((b + 256) % 256).toString(16)).slice(-2);
  }).join('');
}

function tmv3_first_(obj, aliases) {
  if (!obj) return '';
  const keyMap = {};
  Object.keys(obj).forEach(function(k) { keyMap[tmv3_norm_(k)] = k; });

  for (let i = 0; i < aliases.length; i++) {
    const actual = keyMap[tmv3_norm_(aliases[i])];
    if (actual !== undefined) {
      const value = obj[actual];
      if (value !== null && value !== undefined && tmv3_clean_(value) !== '') return value;
    }
  }
  return '';
}

function tmv3_unique_(values) {
  const seen = {};
  const out = [];
  (values || []).forEach(function(v) {
    const s = tmv3_clean_(v);
    if (s && !seen[s]) {
      seen[s] = true;
      out.push(s);
    }
  });
  return out;
}

function tmv3_property_(aliases, required) {
  const props = PropertiesService.getScriptProperties();
  for (let i = 0; i < aliases.length; i++) {
    const value = tmv3_clean_(props.getProperty(aliases[i]));
    if (value) return value;
  }
  if (required) {
    throw new Error('Missing required Script Property capability: ' + aliases.join(' | '));
  }
  return '';
}

function tmv3_configCapabilities_() {
  const out = {};
  Object.keys(TMV3.PROPERTIES).forEach(function(k) {
    const aliases = TMV3.PROPERTIES[k];
    out[k] = { present: !!tmv3_property_(aliases, false), aliases: aliases.slice() };
  });
  return out;
}

function tmv3_rows_(sheetName) {
  const sh = tmv3_sheet_(sheetName);
  if (sh.getLastRow() < 2) return [];

  const values = sh.getRange(1, 1, sh.getLastRow(), sh.getLastColumn()).getValues();
  const headers = values[0].map(tmv3_clean_);

  return values.slice(1)
    .filter(function(row) {
      return row.some(function(v) { return tmv3_clean_(v) !== ''; });
    })
    .map(function(row) {
      const obj = {};
      headers.forEach(function(h, i) { obj[h] = row[i]; });
      return obj;
    });
}

function tmv3_replaceRows_(sheetName, headers, rows) {
  const sh = tmv3_sheet_(sheetName);
  const width = headers.length;
  const needed = Math.max(2, rows.length + 1);

  if (sh.getMaxRows() < needed) {
    sh.insertRowsAfter(sh.getMaxRows(), needed - sh.getMaxRows());
  }

  if (sh.getMaxColumns() < width) {
    sh.insertColumnsAfter(sh.getMaxColumns(), width - sh.getMaxColumns());
  }

  sh.clearContents();
  sh.getRange(1, 1, 1, width).setValues([headers]);

  if (rows.length) {
    sh.getRange(2, 1, rows.length, width).setValues(rows);
  }

  sh.setFrozenRows(1);
  return rows.length;
}

function tmv3_audit_(vertical, eventId, taskId, action, result, detail) {
  const sh = tmv3_sheet_(TMV3.SHEETS.AUDIT);
  sh.appendRow([
    tmv3_now_(),
    vertical || '',
    eventId || '',
    taskId || '',
    action || '',
    result || '',
    detail || '',
    TMV3.VERSION,
    TMV3.MODE
  ]);
}

function tmv3_stateKey_(vertical, eventId, taskId) {
  return [
    tmv3_clean_(vertical),
    tmv3_clean_(eventId),
    tmv3_clean_(taskId)
  ].join('|');
}

function tmv3_eventStateIndex_() {
  const rows = tmv3_rows_(TMV3.SHEETS.STATE);
  const byKey = {};

  rows.forEach(function(r) {
    const vertical = tmv3_clean_(r['Vertical']);
    const eventId = tmv3_clean_(r['Event ID']);
    const taskId = tmv3_clean_(r['Task ID']);
    const exactKey = tmv3_stateKey_(vertical, eventId, taskId);
    const eventKey = vertical + '|' + eventId;

    byKey[exactKey] = r;

    // Event-level alias is retained for classification overrides and
    // acknowledgement even when Service expands to multiple fireplace Tasks.
    if (!byKey[eventKey]) byKey[eventKey] = r;
  });

  return byKey;
}


function tmv3_titleMigrationStateIndex_() {
  if (tmv3_titleMigrationStateIndex_._cache) {
    return tmv3_titleMigrationStateIndex_._cache;
  }

  const out = {};
  tmv3_rows_(TMV3.SHEETS.STATE).forEach(function(row) {
    const vertical = tmv3_clean_(row['Vertical']);
    const eventId = tmv3_clean_(row['Event ID']);
    if (!vertical || !eventId) return;

    const key = vertical + '|' + eventId;
    if (!out[key]) out[key] = row;
  });

  tmv3_titleMigrationStateIndex_._cache = out;
  return out;
}

function tmv3_titleMigrationStateForEvent_(vertical, eventId, calendarId) {
  const row =
    tmv3_titleMigrationStateIndex_()[
      tmv3_clean_(vertical) + '|' + tmv3_clean_(eventId)
    ] || {};

  let map = {};
  const rawMap = tmv3_clean_(row['Title Migration Map']);

  if (rawMap) {
    try {
      const parsed = JSON.parse(rawMap);
      if (parsed && typeof parsed === 'object') map = parsed;
    } catch (ignored) {}
  }

  const id = tmv3_clean_(calendarId);

  return {
    preservedTitle:
      id && map[id]
        ? tmv3_clean_(map[id])
        : '',
    canonicalTitle:tmv3_clean_(row['Canonical Calendar Title']),
    normalizedAt:tmv3_clean_(row['Title Normalized At']),
    migrationMap:map
  };
}

function tmv3_recordTitleMigrationState_(
  vertical,
  eventId,
  calendarId,
  preservedTitle,
  canonicalTitle
) {
  const cleanVertical = tmv3_clean_(vertical);
  const cleanEventId = tmv3_clean_(eventId);
  const cleanCalendarId = tmv3_clean_(calendarId);
  const oldTitle = tmv3_clean_(preservedTitle);
  const newTitle = tmv3_clean_(canonicalTitle);

  if (
    !cleanVertical ||
    !cleanEventId ||
    !cleanCalendarId ||
    !oldTitle ||
    !newTitle
  ) {
    throw new Error(
      'Title migration state requires vertical, Event ID, Calendar ID, old title and canonical title.'
    );
  }

  const sh = tmv3_sheet_(TMV3.SHEETS.STATE);

  if (sh.getLastRow() < 1) {
    sh.getRange(1,1,1,6).setValues([[
      'Vertical',
      'Event ID',
      'Title Migration Map',
      'Canonical Calendar Title',
      'Title Normalized At',
      'Engine Version'
    ]]);
  }

  let headers = sh
    .getRange(1,1,1,Math.max(1,sh.getLastColumn()))
    .getValues()[0]
    .map(tmv3_clean_);

  [
    'Title Migration Map',
    'Canonical Calendar Title',
    'Title Normalized At'
  ].forEach(function(header) {
    if (headers.indexOf(header) !== -1) return;
    const col = headers.length + 1;
    if (sh.getMaxColumns() < col) {
      sh.insertColumnsAfter(sh.getMaxColumns(), col - sh.getMaxColumns());
    }
    sh.getRange(1,col).setValue(header);
    headers.push(header);
  });

  const verticalIx = headers.indexOf('Vertical');
  const eventIx = headers.indexOf('Event ID');
  const mapIx = headers.indexOf('Title Migration Map');
  const canonicalIx = headers.indexOf('Canonical Calendar Title');
  const normalizedAtIx = headers.indexOf('Title Normalized At');

  if (verticalIx < 0 || eventIx < 0) {
    throw new Error(
      'TM State is missing Vertical/Event ID columns required for title migration state.'
    );
  }

  const lastRow = sh.getLastRow();
  const values =
    lastRow >= 2
      ? sh.getRange(2,1,lastRow-1,headers.length).getValues()
      : [];

  const targets = [];

  values.forEach(function(row, index) {
    if (
      tmv3_clean_(row[verticalIx]) === cleanVertical &&
      tmv3_clean_(row[eventIx]) === cleanEventId
    ) {
      targets.push(index + 2);
    }
  });

  if (!targets.length) {
    const row = headers.map(function() { return ''; });
    row[verticalIx] = cleanVertical;
    row[eventIx] = cleanEventId;
    targets.push(sh.getLastRow() + 1);
    sh.getRange(targets[0],1,1,headers.length).setValues([row]);
  }

  targets.forEach(function(rowNumber) {
    const currentRaw = tmv3_clean_(
      sh.getRange(rowNumber,mapIx+1).getValue()
    );

    let map = {};
    if (currentRaw) {
      try {
        const parsed = JSON.parse(currentRaw);
        if (parsed && typeof parsed === 'object') map = parsed;
      } catch (ignored) {}
    }

    map[cleanCalendarId] = oldTitle;

    sh.getRange(rowNumber,mapIx+1).setValue(JSON.stringify(map));
    sh.getRange(rowNumber,canonicalIx+1).setValue(newTitle);
    sh.getRange(rowNumber,normalizedAtIx+1).setValue(tmv3_now_());
  });

  tmv3_titleMigrationStateIndex_._cache = null;

  return {
    status:'TITLE_MIGRATION_STATE_RECORDED',
    vertical:cleanVertical,
    eventId:cleanEventId,
    calendarId:cleanCalendarId,
    preservedTitle:oldTitle,
    canonicalTitle:newTitle,
    rowsUpdated:targets.length
  };
}

function tmv3_upsertState_(records) {
  const headers = [
    'Vertical','Event ID','Calendar ID','Customer ID','Location ID','Contact ID',
    'Order ID','Task ID','Source Fingerprint','Calendar Updated At','Last Verified At',
    'Engine Version','Classification Override','State','Next Action','Error Code',
    'First Seen At','Last Seen At','Last State Change At','Resolved At',
    'First Detected At','Last Attempt At','Attempt Count',
    'Acknowledged By','Acknowledged At','Acknowledgement Note','Last Error Class',
    'Title Migration Map','Canonical Calendar Title','Title Normalized At'
  ];

  const existingIndex = tmv3_eventStateIndex_();
  const rowsByExactKey = {};

  // Preserve every existing physical row, including multiple Tasks for one Event.
  tmv3_rows_(TMV3.SHEETS.STATE).forEach(function(r) {
    rowsByExactKey[
      tmv3_stateKey_(r['Vertical'], r['Event ID'], r['Task ID'])
    ] = r;
  });

  (records || []).forEach(function(r) {
    const exactKey = tmv3_stateKey_(r.vertical, r.eventId, r.taskId);
    const eventKey = r.vertical + '|' + r.eventId;
    const prior =
      rowsByExactKey[exactKey] ||
      existingIndex[exactKey] ||
      existingIndex[eventKey] ||
      {};

    const status = r.status || prior['State'] || '';
    const unresolved =
      ['MATCHED','IGNORED'].indexOf(tmv3_clean_(status).toUpperCase()) === -1;

    const now = tmv3_now_();
    const firstDetected =
      unresolved
        ? (prior['First Detected At'] || now)
        : '';

    const attemptCount =
      unresolved
        ? Number(prior['Attempt Count'] || 0) + 1
        : 0;

    const priorState = tmv3_clean_(prior['State']);
    const stateChanged = priorState !== tmv3_clean_(status);
    const resolvedAt =
      !unresolved && priorState && ['MATCHED','IGNORED'].indexOf(priorState.toUpperCase()) === -1
        ? now
        : (!unresolved ? (prior['Resolved At'] || '') : '');

    rowsByExactKey[exactKey] = {
      'Vertical': r.vertical,
      'Event ID': r.eventId,
      'Calendar ID': r.calendarId || prior['Calendar ID'] || '',
      'Customer ID': r.customerId || prior['Customer ID'] || '',
      'Location ID': r.locationId || prior['Location ID'] || '',
      'Contact ID': r.contactId || prior['Contact ID'] || '',
      'Order ID': r.orderId || prior['Order ID'] || '',
      'Task ID': r.taskId || prior['Task ID'] || '',
      'Source Fingerprint': r.fingerprint || prior['Source Fingerprint'] || '',
      'Calendar Updated At': r.calendarUpdatedAt || prior['Calendar Updated At'] || '',
      'Last Verified At': r.lastVerified || prior['Last Verified At'] || '',
      'Engine Version': TMV3.VERSION,
      'Classification Override': prior['Classification Override'] || '',
      'State': status,
      'Next Action': r.nextAction || prior['Next Action'] || '',
      'Error Code': r.errorCode || '',
      'First Seen At': prior['First Seen At'] || now,
      'Last Seen At': now,
      'Last State Change At': stateChanged ? now : (prior['Last State Change At'] || now),
      'Resolved At': resolvedAt,
      'First Detected At': firstDetected,
      'Last Attempt At': now,
      'Attempt Count': attemptCount,
      'Acknowledged By': unresolved ? (prior['Acknowledged By'] || '') : '',
      'Acknowledged At': unresolved ? (prior['Acknowledged At'] || '') : '',
      'Acknowledgement Note': unresolved ? (prior['Acknowledgement Note'] || '') : '',
      'Last Error Class': unresolved ? (r.errorCode || prior['Last Error Class'] || '') : '',
      'Title Migration Map': r.titleMigrationMap || prior['Title Migration Map'] || '',
      'Canonical Calendar Title': r.canonicalCalendarTitle || prior['Canonical Calendar Title'] || '',
      'Title Normalized At': r.titleNormalizedAt || prior['Title Normalized At'] || ''
    };
  });

  const rows = Object.keys(rowsByExactKey).sort().map(function(k) {
    const r = rowsByExactKey[k];
    return headers.map(function(h) {
      return r[h] === undefined ? '' : r[h];
    });
  });

  tmv3_replaceRows_(TMV3.SHEETS.STATE, headers, rows);
}

function tmv3_assertHardRules_() {
  const errors = [];
  const pre = TMV3.VERTICALS.PreInspection;
  const rules = TMV3_HARD_RULES.PreInspection;

  function requireRule(ok, message) {
    if (!ok) errors.push(message);
  }

  requireRule(pre.orderRequired === false, 'PreInspection must not require a Sales Order.');
  requireRule(pre.attachOrderToTask === false, 'PreInspection must not attach a Sales Order to the Task.');
  requireRule(Number(pre.taskTypeId || 0) === 105, 'PreInspection Task Type must remain 105.');
  requireRule(pre.descriptionMustBeBlankAtCreate === true, 'PreInspection Task Description must be blank at CREATE.');
  requireRule(pre.calendarNotesPolicy === 'CALENDAR_ONLY', 'PreInspection Calendar notes must remain Calendar-only.');
  requireRule(pre.field854Policy === 'DO_NOT_MANAGE', 'PreInspection Field 854 must not be managed by V3.');
  requireRule(pre.infoCustomFieldsAtCreate === 'NONE', 'PreInspection CREATE must not prefill InfoCustomFields.');
  requireRule(pre.technicianFieldsPrefill === false, 'PreInspection technician-completed fields must not be prefilled.');
  requireRule(Number(pre.defaultPoolId || 0) === 8, 'PreInspection must use Pool 8.');
  requireRule(pre.requestedByFromOrganizer === true, 'PreInspection Requested By must resolve from Calendar organizer/creator.');

  requireRule(rules.orderRequired === false, 'Hard-rule mirror says PreInspection orderRequired must be false.');
  requireRule(rules.attachOrderToTask === false, 'Hard-rule mirror says PreInspection SO attachment is forbidden.');
  requireRule(Number(rules.taskTypeId || 0) === 105, 'Hard-rule mirror says PreInspection Task Type must be 105.');
  requireRule(rules.descriptionPolicy === 'BLANK_AT_CREATE', 'Hard-rule mirror says Description must be blank.');
  requireRule(rules.calendarNotesPolicy === 'CALENDAR_ONLY', 'Hard-rule mirror says Calendar notes stay on Calendar.');
  requireRule(rules.field854Policy === 'DO_NOT_MANAGE', 'Hard-rule mirror says Field 854 is removed from automation.');
  requireRule(rules.infoCustomFieldsAtCreate === 'NONE', 'Hard-rule mirror says no PreInspection custom-field prefill.');
  requireRule(rules.technicianFieldsPolicy === 'DO_NOT_PREFILL', 'Hard-rule mirror says technician fields are not prefilled.');
  requireRule(Number(rules.defaultPoolId || 0) === 8, 'Hard-rule mirror says Pool 8 is required.');
  requireRule(rules.organizerIsAssignee === false, 'PreInspection organizer must not become Assigned To.');

  if (
    typeof TMV3_STEP7_ACTION !== 'undefined' &&
    TMV3_STEP7_ACTION.PATCH_FIELD854
  ) {
    errors.push('PATCH_FIELD854 must not exist in the Step 7 action vocabulary.');
  }

  if (errors.length) {
    throw new Error(
      'TMV3 HARD RULE VIOLATION [' +
      TMV3_HARD_RULES.version +
      ']: ' +
      errors.join(' | ')
    );
  }

  return {
    status:'PASS',
    rulesVersion:TMV3_HARD_RULES.version,
    engineVersion:TMV3.VERSION
  };
}

function tmv3_assertShadow_() {
  tmv3_assertHardRules_();
  const allowedReadPipelineModes = [
    'SHADOW_READ_ONLY',
    'CANARY_WRITE',
    'PRODUCTION_WRITE'
  ];

  if (allowedReadPipelineModes.indexOf(TMV3.MODE) === -1) {
    throw new Error(
      'V3 read/planning pipeline blocked: unsupported mode "' +
      String(TMV3.MODE || '') +
      '".'
    );
  }

  return true;
}

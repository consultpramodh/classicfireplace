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

function tmv3_upsertState_(records) {
  const headers = [
    'Vertical','Event ID','Calendar ID','Customer ID','Location ID','Contact ID',
    'Order ID','Task ID','Source Fingerprint','Calendar Updated At','Last Verified At',
    'Engine Version','Classification Override','State','Next Action','Error Code',
    'First Seen At','Last Seen At','Last State Change At','Resolved At',
    'First Detected At','Last Attempt At','Attempt Count',
    'Acknowledged By','Acknowledged At','Acknowledgement Note','Last Error Class'
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
      'Last Error Class': unresolved ? (r.errorCode || prior['Last Error Class'] || '') : ''
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

function tmv3_assertShadow_() {
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

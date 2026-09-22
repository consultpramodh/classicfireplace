/*
 * FILE: 99_Task_Mapping_Standardization_R1.js
 * RELEASE: TASK_MAPPING_STANDARDIZATION_R1_1_20260922
 *
 * Shared presentation + Calendar-link contract for:
 * Install, Delivery, Service, PreInspection.
 *
 * No Striven API calls are made here.
 * Calendar writes are performed only by explicit link-pipeline entrypoints.
 */

const TM_STD_R1_VERSION = 'TASK_MAPPING_STANDARDIZATION_R1_1_20260922';

function tmStdNormalizeDivision_(division) {
  const v = String(division || '').trim().toUpperCase();
  if (v === 'INSTALL') return 'Install';
  if (v === 'DELIVERY') return 'Delivery';
  if (v === 'SERVICE') return 'Service';
  if (v === 'PREINSPECTION' || v === 'PREINSPECT') return 'PreInspection';
  return String(division || '').trim();
}

function tmStdMappingSheetName_(division) {
  const d = tmStdNormalizeDivision_(division);
  if (d === 'Install') return 'Install Task Mapping';
  if (d === 'Delivery') return 'Delivery Task Mapping';
  if (d === 'Service') return 'Service Task Mapping';
  if (d === 'PreInspection') return 'PreInspect Task Mapping';
  return '';
}

function tmStdCalendarSheetName_(division) {
  const d = tmStdNormalizeDivision_(division);
  if (d === 'Install') return 'Install Calendar';
  if (d === 'Delivery') return 'Deliveries Calendar';
  if (d === 'Service') return 'Service Tech Calendar';
  if (d === 'PreInspection') return 'PreInspect Calendar';
  return '';
}

function tmStdClean_(value) {
  return String(value === null || value === undefined ? '' : value).trim();
}

function tmStdUpper_(value) {
  return tmStdClean_(value).toUpperCase();
}

function tmStdPositiveNumber_(value) {
  const n = Number(String(value || '').replace(/[^0-9.-]/g, ''));
  return isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

function tmStdTruthy_(value) {
  const v = tmStdUpper_(value);
  return v === 'TRUE' || v === 'YES' || v === 'Y' || v === '1';
}

function tmStdEscapeHtml_(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function tmStdEscapeRegex_(value) {
  return String(value || '').replace(/[.*+?^\${}()|[\]\\]/g, '\\$&');
}

function tmStdTaskUrl_(taskId) {
  const id = tmStdPositiveNumber_(taskId);
  return id ? 'https://classicfireplace.striven.com/Tasks/TaskInfo.aspx?TaskID=' + encodeURIComponent(id) : '';
}

const TM_STD_R11_PREINSPECT = {
  STEPHEN_CALENDAR_ID: 'classicfireplace.ca_c20qcqfhvjbv784asn9pvuiaf4@group.calendar.google.com',
  CF_PREINSPECT_CALENDAR_ID: 'c_3088a3989f3eb809957ed5c40137a7111a0ac97f68c29b40c144028cb14320dc@group.calendar.google.com',
  SALES_ORDERS_LIST_BASE_URL: 'https://classicfireplace.striven.com/next/crm#/sales-orders?accountId='
};

function tmStdSalesOrdersListUrl_(accountId) {
  const id = tmStdPositiveNumber_(accountId);
  return id ? TM_STD_R11_PREINSPECT.SALES_ORDERS_LIST_BASE_URL + encodeURIComponent(id) : '';
}

function tmStdSalesOrdersListUrlFromText_(text) {
  const m = String(text || '').match(/https:\/\/classicfireplace\.striven\.com\/next\/crm#\/sales-orders\?accountId=(\d+)/i);
  return m ? m[0] : '';
}

function tmStdPreInspectEventIdCandidates_(eventId) {
  const raw = tmStdClean_(eventId);
  if (!raw) return [];
  const base = raw.replace(/@google\.com$/i, '');
  return raw === base ? [raw, raw + '@google.com'] : [raw, base];
}

function tmStdFindEventOnCalendar_(calendarId, eventId) {
  const calendar = CalendarApp.getCalendarById(calendarId);
  if (!calendar) return null;
  const candidates = tmStdPreInspectEventIdCandidates_(eventId);
  for (let i = 0; i < candidates.length; i++) {
    try {
      const event = calendar.getEventById(candidates[i]);
      if (event) return { event: event, calendarId: calendarId };
    } catch (err) {}
  }
  return null;
}

function tmStdReadPreInspectAuthoritativeEvent_(eventId) {
  return tmStdFindEventOnCalendar_(TM_STD_R11_PREINSPECT.STEPHEN_CALENDAR_ID, eventId) ||
    tmStdFindEventOnCalendar_(TM_STD_R11_PREINSPECT.CF_PREINSPECT_CALENDAR_ID, eventId);
}

function tmStdEnsurePreInspectStephenPresence_(eventId, dryRun) {
  const onStephen = tmStdFindEventOnCalendar_(TM_STD_R11_PREINSPECT.STEPHEN_CALENDAR_ID, eventId);
  if (onStephen && onStephen.event) {
    return { status: 'ALREADY_ON_STEPHEN', eventId: tmStdClean_(eventId), writeCount: 0 };
  }

  const onPreInspect = tmStdFindEventOnCalendar_(TM_STD_R11_PREINSPECT.CF_PREINSPECT_CALENDAR_ID, eventId);
  if (!onPreInspect || !onPreInspect.event) {
    return { status: 'REVIEW', eventId: tmStdClean_(eventId), writeCount: 0, reason: 'PreInspection event was not found on CF Preinspects or Stephen calendar.' };
  }

  if (dryRun) {
    return { status: 'WOULD_ADD_STEPHEN_CALENDAR', eventId: tmStdClean_(eventId), writeCount: 0 };
  }

  const guestEmails = (onPreInspect.event.getGuestList() || []).map(function(g) {
    return g && typeof g.getEmail === 'function' ? tmStdClean_(g.getEmail()).toLowerCase() : '';
  }).filter(Boolean);

  if (guestEmails.indexOf(TM_STD_R11_PREINSPECT.STEPHEN_CALENDAR_ID.toLowerCase()) < 0) {
    onPreInspect.event.addGuest(TM_STD_R11_PREINSPECT.STEPHEN_CALENDAR_ID);
  }

  return { status: 'STEPHEN_CALENDAR_ADDED', eventId: tmStdClean_(eventId), writeCount: 1 };
}

function tmStdPreInspectAccountIdForEvent_(eventId, taskId) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss && ss.getSheetByName('PreInspect Task Mapping');
  if (!sheet || sheet.getLastRow() < 2) return 0;

  const headerRow = tmStdFindMappingHeaderRow_(sheet);
  if (!headerRow) return 0;
  const headers = sheet.getRange(headerRow, 1, 1, sheet.getLastColumn()).getDisplayValues()[0];
  const eventIdx = tmStdFindHeaderIndex_(headers, ['Event ID']);
  const taskIdx = tmStdFindHeaderIndex_(headers, ['Task ID']);
  const accountIdx = tmStdFindHeaderIndex_(headers, ['Customer ID', 'Customer #']);
  if (eventIdx < 0 || accountIdx < 0) return 0;

  const values = sheet.getRange(headerRow + 1, 1, sheet.getLastRow() - headerRow, sheet.getLastColumn()).getDisplayValues();
  const wantedEvent = tmStdClean_(eventId).replace(/@google\.com$/i, '');
  const wantedTask = tmStdPositiveNumber_(taskId);

  for (let r = 0; r < values.length; r++) {
    const rowEvent = tmStdClean_(values[r][eventIdx]).replace(/@google\.com$/i, '');
    const rowTask = taskIdx >= 0 ? tmStdPositiveNumber_(values[r][taskIdx]) : 0;
    if (rowEvent === wantedEvent && (!wantedTask || !rowTask || rowTask === wantedTask)) {
      return tmStdPositiveNumber_(values[r][accountIdx]);
    }
  }
  return 0;
}

function tmStdTaskIdFromUrl_(url) {
  const m = String(url || '').match(/TaskInfo\.aspx\?TaskID=(\d+)/i);
  return m ? tmStdPositiveNumber_(m[1]) : 0;
}

function tmStdTaskIdsFromText_(text) {
  const out = [];
  const seen = {};
  const re = /TaskInfo\.aspx\?TaskID=(\d+)/gi;
  let m;
  while ((m = re.exec(String(text || ''))) !== null) {
    const id = tmStdPositiveNumber_(m[1]);
    if (id && !seen[id]) {
      seen[id] = true;
      out.push(id);
    }
  }
  return out;
}

function tmStdSalesOrderUrlFromText_(text) {
  const m = String(text || '').match(/https:\/\/classicfireplace\.striven\.com\/next\/crm#\/sales-orders\/(\d+)/i);
  return m ? m[0] : '';
}

function tmStdLinkFromFormula_(formula) {
  const m = String(formula || '').match(/HYPERLINK\(\s*"([^"]+)"/i);
  return m ? m[1] : '';
}

function tmStdBuildAnchor_(url, label) {
  return '<a href="' + tmStdEscapeHtml_(url) + '">' + tmStdEscapeHtml_(label) + '</a>';
}

function tmStdBuildCanonicalCalendarLinksBlock_(data) {
  data = data || {};
  const start = typeof STL_MANAGED_BLOCK_START !== 'undefined'
    ? STL_MANAGED_BLOCK_START
    : '<!-- TASKMAP_STRIVEN_LINKS_START -->';
  const end = typeof STL_MANAGED_BLOCK_END !== 'undefined'
    ? STL_MANAGED_BLOCK_END
    : '<!-- TASKMAP_STRIVEN_LINKS_END -->';

  const tasks = (data.tasks || []).map(function(task) {
    const id = tmStdPositiveNumber_(task && task.id) || tmStdTaskIdFromUrl_(task && task.url);
    const url = tmStdClean_(task && task.url) || tmStdTaskUrl_(id);
    return id && url ? { id: id, url: url } : null;
  }).filter(Boolean);

  const seen = {};
  const uniqueTasks = tasks.filter(function(task) {
    if (seen[task.id]) return false;
    seen[task.id] = true;
    return true;
  });

  const lines = [
    start,
    '------- Striven Links -------',
    ''
  ];

  uniqueTasks.forEach(function(task) {
    lines.push(tmStdBuildAnchor_(task.url, 'Task #' + task.id));
  });

  const so = data.salesOrder || null;
  if (so && tmStdClean_(so.url)) {
    const soNumber = tmStdClean_(so.number);
    lines.push(tmStdBuildAnchor_(
      tmStdClean_(so.url),
      soNumber ? 'Sales Order #' + soNumber : 'Sales Order'
    ));
  }

  const salesOrdersList = data.salesOrdersList || null;
  if (salesOrdersList && tmStdClean_(salesOrdersList.url)) {
    lines.push(tmStdBuildAnchor_(tmStdClean_(salesOrdersList.url), 'Sales Orders'));
  }

  lines.push('');
  lines.push('------------------------------------');
  lines.push(end);
  return lines.join('<br>');
}

function tmStdRemoveManagedCalendarLinks_(description) {
  let text = String(description || '');
  const commonStart = typeof STL_MANAGED_BLOCK_START !== 'undefined'
    ? STL_MANAGED_BLOCK_START
    : '<!-- TASKMAP_STRIVEN_LINKS_START -->';
  const commonEnd = typeof STL_MANAGED_BLOCK_END !== 'undefined'
    ? STL_MANAGED_BLOCK_END
    : '<!-- TASKMAP_STRIVEN_LINKS_END -->';

  const blocks = [
    [commonStart, commonEnd],
    ['<!-- PREINSPECT_STRIVEN_TASK_LINK_START -->', '<!-- PREINSPECT_STRIVEN_TASK_LINK_END -->']
  ];

  blocks.forEach(function(pair) {
    const re = new RegExp(
      '(?:<br\\s*\\/?>|\\r?\\n|\\s)*' +
      tmStdEscapeRegex_(pair[0]) +
      '[\\s\\S]*?' +
      tmStdEscapeRegex_(pair[1]) +
      '(?:<br\\s*\\/?>|\\r?\\n|\\s)*',
      'gi'
    );
    text = text.replace(re, '');
  });

  const legacy = /(?:<br\s*\/?>|\r?\n|\s)*(?:<p[^>]*>\s*)?-{5,}\s*(?:(?:Install|Delivery|Service|Pre[- ]?Inspection)\s+)?(?:Striven\s+)?(?:Task\s+)?Links?\s*-{5,}[\s\S]*?(?:-{10,}|<hr\b[^>]*>)(?:\s*<\/p>)?/gi;
  text = text.replace(legacy, '');

  return text
    .replace(/(?:<br\s*\/?>\s*){3,}/gi, '<br><br>')
    .replace(/(?:\r?\n\s*){3,}/g, '\n\n')
    .replace(/^(?:<br\s*\/?>|\s)+/gi, '')
    .replace(/(?:<br\s*\/?>|\s)+$/gi, '')
    .trim();
}

function tmStdAppendBlock_(description, block) {
  const clean = String(description || '').replace(/(?:<br\s*\/?>|\s)+$/gi, '').trim();
  return clean ? clean + '<br><br>' + block : block;
}

function tmStdCount_(text, needle) {
  if (!needle) return 0;
  return String(text || '').split(String(needle)).length - 1;
}

function tmStdWriteCanonicalCalendarLinks_(division, eventId, tasks, salesOrder, dryRun, salesOrdersList) {
  const d = tmStdNormalizeDivision_(division);
  const id = tmStdClean_(eventId);
  if (!id) return { status: 'REVIEW', division: d, reason: 'Event ID is blank.', writeCount: 0 };

  const normalizedTasks = (tasks || []).map(function(task) {
    const taskId = tmStdPositiveNumber_(task && task.id) || tmStdTaskIdFromUrl_(task && task.url);
    return taskId ? { id: taskId, url: tmStdClean_(task && task.url) || tmStdTaskUrl_(taskId) } : null;
  }).filter(Boolean);

  if (!normalizedTasks.length) {
    return { status: 'REVIEW', division: d, eventId: id, reason: 'No valid Task ID was supplied.', writeCount: 0 };
  }

  const fresh = d === 'PreInspection'
    ? tmStdReadPreInspectAuthoritativeEvent_(id)
    : tmR4_readFreshCalendarEvent_({ division: d, eventId: id });
  if (!fresh || !fresh.event) {
    return { status: 'REVIEW', division: d, eventId: id, reason: 'Authoritative Calendar event was not found.', writeCount: 0 };
  }

  const current = String(fresh.event.getDescription() || '');
  const cleaned = tmStdRemoveManagedCalendarLinks_(current);
  const block = tmStdBuildCanonicalCalendarLinksBlock_({
    division: d,
    tasks: normalizedTasks,
    salesOrder: salesOrder || null,
    salesOrdersList: salesOrdersList || null
  });
  const next = tmStdAppendBlock_(cleaned, block);
  const same = current.trim() === next.trim();

  const base = {
    version: TM_STD_R1_VERSION,
    division: d,
    eventId: id,
    calendarId: fresh.calendarId || null,
    taskIds: normalizedTasks.map(function(x) { return x.id; }),
    salesOrderNumber: salesOrder && salesOrder.number ? String(salesOrder.number) : '',
    salesOrdersAccountId: salesOrdersList && salesOrdersList.accountId ? String(salesOrdersList.accountId) : '',
    writeCount: 0
  };

  if (dryRun) {
    base.status = same ? 'NO_CHANGE' : 'WOULD_WRITE';
    return base;
  }

  if (!same) {
    fresh.event.setDescription(next);
    base.writeCount = 1;
  }

  const readBack = d === 'PreInspection'
    ? tmStdReadPreInspectAuthoritativeEvent_(id)
    : tmR4_readFreshCalendarEvent_({ division: d, eventId: id });
  if (!readBack || !readBack.event) {
    throw new Error(d + ' Calendar event disappeared during Calendar-link read-back.');
  }

  const actual = String(readBack.event.getDescription() || '');
  const startMarker = typeof STL_MANAGED_BLOCK_START !== 'undefined'
    ? STL_MANAGED_BLOCK_START
    : '<!-- TASKMAP_STRIVEN_LINKS_START -->';
  const endMarker = typeof STL_MANAGED_BLOCK_END !== 'undefined'
    ? STL_MANAGED_BLOCK_END
    : '<!-- TASKMAP_STRIVEN_LINKS_END -->';

  if (tmStdCount_(actual, startMarker) !== 1 || tmStdCount_(actual, endMarker) !== 1) {
    throw new Error(d + ' Calendar read-back did not contain exactly one canonical managed Striven block.');
  }

  normalizedTasks.forEach(function(task) {
    if (tmStdCount_(actual, task.url) !== 1) {
      throw new Error(d + ' Calendar read-back expected Task #' + task.id + ' URL exactly once.');
    }
  });

  if (salesOrder && tmStdClean_(salesOrder.url)) {
    if (tmStdCount_(actual, tmStdClean_(salesOrder.url)) !== 1) {
      throw new Error(d + ' Calendar read-back expected the Sales Order URL exactly once.');
    }
  }

  if (salesOrdersList && tmStdClean_(salesOrdersList.url)) {
    if (tmStdCount_(actual, tmStdClean_(salesOrdersList.url)) !== 1) {
      throw new Error(d + ' Calendar read-back expected the Sales Orders list URL exactly once.');
    }
  }

  base.status = same ? 'NO_CHANGE_VERIFIED' : 'WRITTEN_VERIFIED';
  base.readBackVerified = true;
  return base;
}

function tmStdFindHeaderIndex_(headers, aliases) {
  for (let a = 0; a < aliases.length; a++) {
    const wanted = String(aliases[a] || '').trim().toUpperCase();
    for (let i = 0; i < headers.length; i++) {
      if (String(headers[i] || '').trim().toUpperCase() === wanted) return i;
    }
  }
  return -1;
}

function tmStdMirrorEvidenceMap_(division) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetName = tmStdCalendarSheetName_(division);
  const sheet = ss && ss.getSheetByName(sheetName);
  const out = {};
  if (!sheet || sheet.getLastRow() < 2) return out;

  const lastCol = sheet.getLastColumn();
  const headers = sheet.getRange(1, 1, 1, lastCol).getDisplayValues()[0];
  const eventIdx = tmStdFindHeaderIndex_(headers, ['Event ID', 'EventId']);
  if (eventIdx < 0) return out;

  const descIndexes = [];
  ['Description HTML Source', 'Description', 'Calendar Description'].forEach(function(name) {
    const idx = tmStdFindHeaderIndex_(headers, [name]);
    if (idx >= 0 && descIndexes.indexOf(idx) === -1) descIndexes.push(idx);
  });
  const taskLinkIdx = tmStdFindHeaderIndex_(headers, ['Striven Task Link']);
  const soLinkIdx = tmStdFindHeaderIndex_(headers, ['Sales Order Link']);

  const count = sheet.getLastRow() - 1;
  const display = sheet.getRange(2, 1, count, lastCol).getDisplayValues();
  const formulas = sheet.getRange(2, 1, count, lastCol).getFormulas();

  display.forEach(function(row, r) {
    const eventId = tmStdClean_(row[eventIdx]);
    if (!eventId) return;
    const chunks = [];
    descIndexes.forEach(function(idx) { if (row[idx]) chunks.push(row[idx]); });
    if (taskLinkIdx >= 0) {
      chunks.push(row[taskLinkIdx] || '');
      chunks.push(formulas[r][taskLinkIdx] || '');
    }
    if (soLinkIdx >= 0) {
      chunks.push(row[soLinkIdx] || '');
      chunks.push(formulas[r][soLinkIdx] || '');
    }
    const text = chunks.join('\n');
    let soUrl = '';
    if (soLinkIdx >= 0) {
      soUrl = tmStdLinkFromFormula_(formulas[r][soLinkIdx]) || tmStdSalesOrderUrlFromText_(text);
    } else {
      soUrl = tmStdSalesOrderUrlFromText_(text);
    }
    out[eventId] = {
      rowNumber: r + 2,
      text: text,
      taskIds: tmStdTaskIdsFromText_(text),
      salesOrderUrl: soUrl,
      salesOrdersListUrl: tmStdSalesOrdersListUrlFromText_(text)
    };
  });
  return out;
}

function tmStdResolveSalesOrderUrlFromCalendarMirror_(division, eventId, salesOrderNumber) {
  const evidence = tmStdMirrorEvidenceMap_(division);
  const row = evidence[tmStdClean_(eventId)] || null;
  const url = row ? tmStdClean_(row.salesOrderUrl) : '';
  if (!url) return '';
  if (!/https:\/\/classicfireplace\.striven\.com\/next\/crm#\/sales-orders\/\d+/i.test(url)) return '';
  return url;
}

function tmStdNormalizeCalendarMirrorTaskLinks_(division) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetName = tmStdCalendarSheetName_(division);
  const sheet = ss && ss.getSheetByName(sheetName);
  if (!sheet || sheet.getLastRow() < 2) return { division: tmStdNormalizeDivision_(division), status: 'NO_ROWS', updated: 0 };

  const lastCol = sheet.getLastColumn();
  const headers = sheet.getRange(1, 1, 1, lastCol).getDisplayValues()[0];
  const taskLinkIdx = tmStdFindHeaderIndex_(headers, ['Striven Task Link']);
  if (taskLinkIdx < 0) return { division: tmStdNormalizeDivision_(division), status: 'NO_TASK_LINK_COLUMN', updated: 0 };

  const descIndexes = [];
  ['Description HTML Source', 'Description', 'Calendar Description'].forEach(function(name) {
    const idx = tmStdFindHeaderIndex_(headers, [name]);
    if (idx >= 0 && descIndexes.indexOf(idx) === -1) descIndexes.push(idx);
  });

  const count = sheet.getLastRow() - 1;
  const display = sheet.getRange(2, 1, count, lastCol).getDisplayValues();
  const formulas = sheet.getRange(2, 1, count, lastCol).getFormulas();
  let updated = 0;

  for (let r = 0; r < display.length; r++) {
    const chunks = [];
    descIndexes.forEach(function(idx) { if (display[r][idx]) chunks.push(display[r][idx]); });
    chunks.push(display[r][taskLinkIdx] || '');
    chunks.push(formulas[r][taskLinkIdx] || '');
    const ids = tmStdTaskIdsFromText_(chunks.join('\n'));
    if (!ids.length) continue;

    const textValue = ids.map(function(id) { return 'Task #' + id; }).join('\n');
    const builder = SpreadsheetApp.newRichTextValue().setText(textValue);
    let cursor = 0;
    ids.forEach(function(id, i) {
      const label = 'Task #' + id;
      builder.setLinkUrl(cursor, cursor + label.length, tmStdTaskUrl_(id));
      cursor += label.length + (i < ids.length - 1 ? 1 : 0);
    });
    sheet.getRange(r + 2, taskLinkIdx + 1).setRichTextValue(builder.build());
    updated++;
  }

  return { division: tmStdNormalizeDivision_(division), status: 'COMPLETE', updated: updated };
}

function tmStdFindMappingHeaderRow_(sheet) {
  if (!sheet || sheet.getLastRow() < 1) return 0;
  const rowCount = Math.min(6, sheet.getLastRow());
  const values = sheet.getRange(1, 1, rowCount, sheet.getLastColumn()).getDisplayValues();
  for (let r = 0; r < values.length; r++) {
    const normalized = values[r].map(function(v) { return tmStdUpper_(v); });
    if (normalized.indexOf('STATUS') >= 0 && normalized.indexOf('TASK ID') >= 0) return r + 1;
  }
  return 0;
}

function tmStdRowObject_(headers, values) {
  const obj = {};
  headers.forEach(function(header, i) {
    const key = tmStdClean_(header);
    if (key) obj[key] = values[i];
  });
  return obj;
}

function tmStdLine_(symbol, label) {
  return symbol + ' ' + label;
}

function tmStdReviewSymbol_(row) {
  const status = tmStdUpper_(row.Status);
  return status === 'REVIEW' || status === 'BLOCKED' ? '🔎' : '⏳';
}

function tmStdCompareIdSymbol_(currentId, desiredId, fallbackSymbol) {
  const current = tmStdPositiveNumber_(currentId);
  const desired = tmStdPositiveNumber_(desiredId);
  if (desired && current && desired === current) return '✅';
  if (desired && current && desired !== current) return '❌';
  if (current && !desired) return '✅';
  if (desired && !current) return '❌';
  return fallbackSymbol || '⏳';
}

function tmStdDatesMatch_(a, b) {
  const da = new Date(a);
  const db = new Date(b);
  if (isNaN(da.getTime()) || isNaN(db.getTime())) return false;
  return Math.abs(da.getTime() - db.getTime()) < 60000;
}

function tmStdChecklistForRow_(division, row, mirror) {
  const d = tmStdNormalizeDivision_(division);
  const review = tmStdReviewSymbol_(row);
  const taskId = tmStdPositiveNumber_(row['Task ID']);
  const taskStatus = tmStdUpper_(row['Task Status']);
  const eventId = tmStdClean_(row['Event ID']);
  const soNumber = tmStdClean_(row['SO #'] || row['Sales Order #']);
  const customer = tmStdClean_(row.Customer || row['Customer #']);
  const lines = [];

  let timeSymbol = '⏳';
  if (Object.prototype.hasOwnProperty.call(row, 'Hidden Needs Date Push')) {
    timeSymbol = tmStdTruthy_(row['Hidden Needs Date Push']) ? '❌' : (taskId ? '✅' : '⏳');
  } else if (d === 'Install') {
    const action = tmStdUpper_(row['Date Action']);
    if (/PUSH|PATCH|UPDATE/.test(action)) timeSymbol = '❌';
    else if (/NOT NEEDED|NO ACTION|MATCH/.test(action)) timeSymbol = '✅';
    else if (taskId && tmStdClean_(row.Date) && tmStdClean_(row.Time)) timeSymbol = '✅';
  } else if (d === 'PreInspection') {
    const cs = row['Calendar Start'], ce = row['Calendar End'], ts = row['Task Start'], td = row['Task Due'];
    if (taskId && cs && ce && ts && td) {
      timeSymbol = tmStdDatesMatch_(cs, ts) && tmStdDatesMatch_(ce, td) ? '✅' : '❌';
    } else if (taskId) timeSymbol = '⏳';
  }
  lines.push(tmStdLine_(timeSymbol, 'Time'));
  lines.push(tmStdLine_(customer ? '✅' : review, 'Customer'));
  lines.push(tmStdLine_(d === 'PreInspection' ? '—' : (soNumber ? '✅' : review), 'SO'));
  lines.push(tmStdLine_(d === 'Service'
    ? (tmStdPositiveNumber_(row['Hidden Work Order ID']) ? '✅' : review)
    : '—', 'WO'));

  let locationSymbol = review;
  if (d === 'Install') {
    locationSymbol = tmStdCompareIdSymbol_(row['Hidden Current LocationId'], row['Hidden Desired LocationId'], review);
  } else if (d === 'Delivery') {
    locationSymbol = tmStdPositiveNumber_(row['Hidden LocationId']) ? '✅' : review;
  } else if (d === 'Service') {
    locationSymbol = tmStdPositiveNumber_(row['Hidden Location ID']) ? '✅' : review;
  } else if (d === 'PreInspection') {
    const loc = tmStdPositiveNumber_(row['Location ID']);
    const taskLoc = tmStdPositiveNumber_(row['Task Location ID']);
    if (taskId && loc && taskLoc) locationSymbol = loc === taskLoc ? '✅' : '❌';
    else if (loc && !taskId) locationSymbol = '⏳';
  }
  lines.push(tmStdLine_(locationSymbol, 'Location'));

  let contactSymbol = review;
  if (d === 'Install') {
    contactSymbol = tmStdCompareIdSymbol_(row['Hidden Current ContactId'], row['Hidden Desired ContactId'], review);
  } else if (d === 'Delivery') {
    contactSymbol = tmStdPositiveNumber_(row['Hidden ContactId']) ? '✅' : review;
  } else if (d === 'Service') {
    contactSymbol = tmStdPositiveNumber_(row['Hidden Contact ID']) ? '✅' : review;
  } else if (d === 'PreInspection') {
    contactSymbol = '⏳';
  }
  lines.push(tmStdLine_(contactSymbol, 'Contact / Requested By'));

  let assigneeSymbol = review;
  if (Object.prototype.hasOwnProperty.call(row, 'Hidden Needs Assignee Push')) {
    if (tmStdTruthy_(row['Hidden Needs Assignee Push'])) assigneeSymbol = '❌';
    else if (taskId) assigneeSymbol = '✅';
  } else if (tmStdClean_(row['Assigned To'])) {
    assigneeSymbol = '✅';
  } else if (d === 'PreInspection') {
    assigneeSymbol = '⏳';
  }
  lines.push(tmStdLine_(assigneeSymbol, 'Assignee'));

  let openSymbol = '⏳';
  if (taskId) {
    if (taskStatus === 'OPEN' || /\bOPEN\b/.test(taskStatus)) openSymbol = '✅';
    else if (taskStatus) openSymbol = '❌';
  }
  lines.push(tmStdLine_(openSymbol, 'Open Task'));

  const evidence = eventId && mirror ? mirror[eventId] : null;
  const taskUrl = taskId ? tmStdTaskUrl_(taskId) : '';
  let taskLinkSymbol = '⏳';
  if (taskId && evidence) taskLinkSymbol = String(evidence.text || '').indexOf(taskUrl) >= 0 ? '✅' : '❌';
  lines.push(tmStdLine_(taskLinkSymbol, 'Calendar Task Link'));

  if (d === 'Delivery' || d === 'Service') {
    let soLinkSymbol = '⏳';
    if (soNumber && evidence) soLinkSymbol = tmStdClean_(evidence.salesOrderUrl) ? '✅' : '❌';
    lines.push(tmStdLine_(soLinkSymbol, 'Calendar SO Link'));
  } else if (d === 'PreInspection') {
    const accountId = tmStdPositiveNumber_(row['Customer ID'] || row['Customer #']);
    const expectedListUrl = tmStdSalesOrdersListUrl_(accountId);
    let listLinkSymbol = '⏳';
    if (accountId && evidence) listLinkSymbol = String(evidence.text || '').indexOf(expectedListUrl) >= 0 ? '✅' : '❌';
    lines.push(tmStdLine_(listLinkSymbol, 'Calendar SO Link'));
  } else {
    lines.push(tmStdLine_('—', 'Calendar SO Link'));
  }

  return lines.join('\n');
}

function tmStdPopulateMappingChecklist_(division) {
  const d = tmStdNormalizeDivision_(division);
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss && ss.getSheetByName(tmStdMappingSheetName_(d));
  if (!sheet) return { division: d, status: 'MISSING_MAPPING_SHEET', updated: 0 };

  const headerRow = tmStdFindMappingHeaderRow_(sheet);
  if (!headerRow) return { division: d, status: 'HEADER_NOT_FOUND', updated: 0 };

  const lastCol = sheet.getLastColumn();
  const headers = sheet.getRange(headerRow, 1, 1, lastCol).getDisplayValues()[0];
  const dataIdx = tmStdFindHeaderIndex_(headers, ['Data']);
  if (dataIdx < 0) return { division: d, status: 'DATA_COLUMN_NOT_FOUND', updated: 0 };
  if (sheet.getLastRow() <= headerRow) return { division: d, status: 'NO_ROWS', updated: 0 };

  const mirror = tmStdMirrorEvidenceMap_(d);
  const values = sheet.getRange(headerRow + 1, 1, sheet.getLastRow() - headerRow, lastCol).getDisplayValues();
  const output = values.map(function(valuesRow) {
    const row = tmStdRowObject_(headers, valuesRow);
    const hasIdentity = tmStdClean_(row['Event ID']) || tmStdClean_(row['Calendar Title']) || tmStdClean_(row['Task ID']);
    return [hasIdentity ? tmStdChecklistForRow_(d, row, mirror) : ''];
  });

  const range = sheet.getRange(headerRow + 1, dataIdx + 1, output.length, 1);
  range.setValues(output).setWrap(true).setVerticalAlignment('top');
  sheet.setColumnWidth(dataIdx + 1, 195);
  return { division: d, status: 'COMPLETE', updated: output.length, dataColumn: dataIdx + 1 };
}

function tmStdRefreshAllPresentation_() {
  const divisions = ['Install', 'Delivery', 'Service', 'PreInspection'];
  const result = { version: TM_STD_R1_VERSION, status: 'COMPLETE', divisions: {} };
  divisions.forEach(function(d) {
    result.divisions[d] = {
      calendarMirror: tmStdNormalizeCalendarMirrorTaskLinks_(d),
      checklist: tmStdPopulateMappingChecklist_(d)
    };
  });
  return result;
}

function tmStdRunPreInspectCalendarLinkPipeline_(dryRun) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss && ss.getSheetByName('PreInspect Task Mapping');
  if (!sheet) throw new Error('Missing PreInspect Task Mapping sheet.');

  const headerRow = tmStdFindMappingHeaderRow_(sheet);
  if (!headerRow || sheet.getLastRow() <= headerRow) {
    return { mode: dryRun ? 'DRY_RUN' : 'PUSH', status: 'NO_ROWS', eventCount: 0, events: [] };
  }

  const headers = sheet.getRange(headerRow, 1, 1, sheet.getLastColumn()).getDisplayValues()[0];
  const values = sheet.getRange(headerRow + 1, 1, sheet.getLastRow() - headerRow, sheet.getLastColumn()).getDisplayValues();
  const results = [];
  const seen = {};

  values.forEach(function(valuesRow) {
    const row = tmStdRowObject_(headers, valuesRow);
    const eventId = tmStdClean_(row['Event ID']);
    const taskId = tmStdPositiveNumber_(row['Task ID']);
    const status = tmStdUpper_(row.Status);
    const taskStatus = tmStdUpper_(row['Task Status']);
    const accountId = tmStdPositiveNumber_(row['Customer ID'] || row['Customer #']);
    if (!eventId || !taskId || seen[eventId]) return;
    seen[eventId] = true;

    if (status !== 'MATCHED' && status !== 'CONFIRMED') {
      results.push({ eventId: eventId, taskId: taskId, status: 'SKIPPED_STATUS', mappingStatus: status });
      return;
    }
    if (!(taskStatus === 'OPEN' || /\bOPEN\b/.test(taskStatus))) {
      results.push({ eventId: eventId, taskId: taskId, status: 'SKIPPED_TASK_NOT_OPEN', taskStatus: taskStatus });
      return;
    }

    if (!accountId) {
      results.push({ eventId: eventId, taskId: taskId, status: 'REVIEW', reason: 'Customer/Account ID is required for the PreInspection Sales Orders list link.' });
      return;
    }

    try {
      const stephen = tmStdEnsurePreInspectStephenPresence_(eventId, !!dryRun);
      const linkResult = tmStdWriteCanonicalCalendarLinks_(
        'PreInspection',
        eventId,
        [{ id: taskId }],
        null,
        !!dryRun,
        { accountId: accountId, url: tmStdSalesOrdersListUrl_(accountId) }
      );
      linkResult.stephenCalendar = stephen;
      results.push(linkResult);
    } catch (err) {
      results.push({
        eventId: eventId,
        taskId: taskId,
        status: 'REVIEW',
        reason: err && err.message ? err.message : String(err)
      });
    }
  });

  return {
    mode: dryRun ? 'DRY_RUN' : 'PUSH',
    status: 'COMPLETE',
    eventCount: results.length,
    reviewCount: results.filter(function(x) { return x && x.status === 'REVIEW'; }).length,
    events: results
  };
}

function runTaskMappingStandardizationR1() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (ss && typeof ss.setSpreadsheetTimeZone === 'function') {
    ss.setSpreadsheetTimeZone('America/Toronto');
  }
  const links = tmR4_runAllCalendarLinkPipelines_(false);
  const presentation = tmStdRefreshAllPresentation_();
  const out = {
    version: TM_STD_R1_VERSION,
    status: 'COMPLETE',
    calendarLinks: links,
    presentation: presentation,
    timezone: ss ? ss.getSpreadsheetTimeZone() : ''
  };
  Logger.log(JSON.stringify(out, null, 2));
  return out;
}

function dryRunTaskMappingStandardizationR1() {
  const out = {
    version: TM_STD_R1_VERSION,
    status: 'DRY_RUN_COMPLETE',
    calendarLinks: tmR4_runAllCalendarLinkPipelines_(true),
    presentationWritesPerformed: false
  };
  Logger.log(JSON.stringify(out, null, 2));
  return out;
}

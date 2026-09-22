/*
 * FILE: 99_Task_Mapping_Standardization_R1.js
 * RELEASE: TASK_MAPPING_STANDARDIZATION_R1_5_1_PREINSPECT_CALENDAR_REORGANIZATION_20260922
 *
 * Shared presentation + Calendar-link contract for:
 * Install, Delivery, Service, PreInspection.
 *
 * No Striven API calls are made here.
 * Calendar writes are performed only by explicit link-pipeline entrypoints.
 */

const TM_STD_R1_VERSION = 'TASK_MAPPING_STANDARDIZATION_R1_5_1_PREINSPECT_CALENDAR_REORGANIZATION_20260922';

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

const TM_STD_R12_PREINSPECT = {
  STEPHEN_CALENDAR_ID: 'classicfireplace.ca_c20qcqfhvjbv784asn9pvuiaf4@group.calendar.google.com',
  CF_PREINSPECT_CALENDAR_ID: 'c_3088a3989f3eb809957ed5c40137a7111a0ac97f68c29b40c144028cb14320dc@group.calendar.google.com',
  STEPHEN_PERSONAL_EMAIL: 'stephen@classicfireplace.ca',
  SALES_ORDERS_LIST_BASE_URL: 'https://classicfireplace.striven.com/next/crm#/sales-orders?accountId='
};

function tmStdSalesOrdersListUrl_(accountId) {
  const id = tmStdPositiveNumber_(accountId);
  return id ? TM_STD_R12_PREINSPECT.SALES_ORDERS_LIST_BASE_URL + encodeURIComponent(id) : '';
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
  return tmStdFindEventOnCalendar_(TM_STD_R12_PREINSPECT.STEPHEN_CALENDAR_ID, eventId) ||
    tmStdFindEventOnCalendar_(TM_STD_R12_PREINSPECT.CF_PREINSPECT_CALENDAR_ID, eventId);
}

function tmStdPreInspectGuestEmails_(event) {
  return (event && typeof event.getGuestList === 'function' ? (event.getGuestList() || []) : []).map(function(g) {
    return g && typeof g.getEmail === 'function' ? tmStdClean_(g.getEmail()).toLowerCase() : '';
  }).filter(Boolean);
}

function tmStdEnsurePreInspectStephenPresence_(eventId, dryRun) {
  const id = tmStdClean_(eventId);
  const onStephen = tmStdFindEventOnCalendar_(TM_STD_R12_PREINSPECT.STEPHEN_CALENDAR_ID, id);
  const onPreInspect = tmStdFindEventOnCalendar_(TM_STD_R12_PREINSPECT.CF_PREINSPECT_CALENDAR_ID, id);

  if (!onStephen && !onPreInspect) {
    return { status: 'REVIEW', eventId: id, writeCount: 0, reason: 'PreInspection event was not found on CF Preinspects or Stephen calendar.' };
  }

  let writeCount = 0;
  const actions = [];

  if (!onStephen && onPreInspect && onPreInspect.event) {
    const preGuests = tmStdPreInspectGuestEmails_(onPreInspect.event);
    if (preGuests.indexOf(TM_STD_R12_PREINSPECT.STEPHEN_CALENDAR_ID.toLowerCase()) < 0) {
      if (dryRun) {
        actions.push('WOULD_ADD_STEPHEN_SHARED_CALENDAR');
      } else {
        onPreInspect.event.addGuest(TM_STD_R12_PREINSPECT.STEPHEN_CALENDAR_ID);
        writeCount++;
        actions.push('ADDED_STEPHEN_SHARED_CALENDAR');
      }
    }
  }

  const attendeeEvent = onStephen && onStephen.event ? onStephen.event : (onPreInspect && onPreInspect.event ? onPreInspect.event : null);
  if (!attendeeEvent) {
    return { status: 'REVIEW', eventId: id, writeCount: writeCount, actions: actions, reason: 'No writable PreInspection event copy was available.' };
  }

  const guests = tmStdPreInspectGuestEmails_(attendeeEvent);
  const personal = TM_STD_R12_PREINSPECT.STEPHEN_PERSONAL_EMAIL.toLowerCase();
  if (guests.indexOf(personal) < 0) {
    if (dryRun) {
      actions.push('WOULD_ADD_STEPHEN_PERSONAL_ATTENDEE');
    } else {
      attendeeEvent.addGuest(TM_STD_R12_PREINSPECT.STEPHEN_PERSONAL_EMAIL);
      writeCount++;
      actions.push('ADDED_STEPHEN_PERSONAL_ATTENDEE');
    }
  }

  return {
    status: dryRun
      ? (actions.length ? 'WOULD_UPDATE_STEPHEN_PRESENCE' : 'ALREADY_COMPLIANT')
      : (writeCount ? 'STEPHEN_PRESENCE_UPDATED' : 'ALREADY_COMPLIANT'),
    eventId: id,
    writeCount: writeCount,
    onStephenSharedCalendar: !!onStephen,
    personalStephenRequired: true,
    actions: actions
  };
}

function tmStdPreInspectContextForEvent_(eventId, taskId) {
  const out = { accountId: 0, customerName: '', taskName: '' };
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) return out;

  const wantedEvent = tmStdClean_(eventId).replace(/@google\.com$/i, '');
  const wantedTask = tmStdPositiveNumber_(taskId);

  const map = ss.getSheetByName('PreInspect Task Mapping');
  if (map && map.getLastRow() >= 2) {
    const headerRow = tmStdFindMappingHeaderRow_(map);
    if (headerRow) {
      const headers = map.getRange(headerRow, 1, 1, map.getLastColumn()).getDisplayValues()[0];
      const eventIdx = tmStdFindHeaderIndex_(headers, ['Event ID']);
      const taskIdx = tmStdFindHeaderIndex_(headers, ['Task ID']);
      const accountIdx = tmStdFindHeaderIndex_(headers, ['Customer ID', 'Customer #']);
      const customerIdx = tmStdFindHeaderIndex_(headers, ['Customer']);
      if (eventIdx >= 0) {
        const values = map.getRange(headerRow + 1, 1, map.getLastRow() - headerRow, map.getLastColumn()).getDisplayValues();
        for (let r = 0; r < values.length; r++) {
          const rowEvent = tmStdClean_(values[r][eventIdx]).replace(/@google\.com$/i, '');
          const rowTask = taskIdx >= 0 ? tmStdPositiveNumber_(values[r][taskIdx]) : 0;
          if (rowEvent === wantedEvent && (!wantedTask || !rowTask || rowTask === wantedTask)) {
            if (accountIdx >= 0) out.accountId = tmStdPositiveNumber_(values[r][accountIdx]);
            if (customerIdx >= 0) out.customerName = tmStdClean_(values[r][customerIdx]);
            break;
          }
        }
      }
    }
  }

  const cal = ss.getSheetByName('PreInspect Calendar');
  if (cal && cal.getLastRow() >= 2) {
    const headers = cal.getRange(1, 1, 1, cal.getLastColumn()).getDisplayValues()[0];
    const eventIdx = tmStdFindHeaderIndex_(headers, ['Event ID']);
    const taskDisplayIdx = tmStdFindHeaderIndex_(headers, ['Task', 'Striven Task Link']);
    if (eventIdx >= 0 && taskDisplayIdx >= 0) {
      const values = cal.getRange(2, 1, cal.getLastRow() - 1, cal.getLastColumn()).getDisplayValues();
      for (let r = 0; r < values.length; r++) {
        const rowEvent = tmStdClean_(values[r][eventIdx]).replace(/@google\.com$/i, '');
        if (rowEvent !== wantedEvent) continue;
        let display = tmStdClean_(values[r][taskDisplayIdx]);
        if (wantedTask && display) {
          display = display.replace(new RegExp('^' + wantedTask + '\\s*[-–—:]\\s*', 'i'), '').trim();
        }
        out.taskName = display;
        break;
      }
    }
  }

  return out;
}

function tmStdPreInspectAccountIdForEvent_(eventId, taskId) {
  return tmStdPreInspectContextForEvent_(eventId, taskId).accountId;
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
  const division = tmStdNormalizeDivision_(data.division);
  const start = typeof STL_MANAGED_BLOCK_START !== 'undefined'
    ? STL_MANAGED_BLOCK_START
    : '<!-- TASKMAP_STRIVEN_LINKS_START -->';
  const end = typeof STL_MANAGED_BLOCK_END !== 'undefined'
    ? STL_MANAGED_BLOCK_END
    : '<!-- TASKMAP_STRIVEN_LINKS_END -->';

  const tasks = (data.tasks || []).map(function(task) {
    const id = tmStdPositiveNumber_(task && task.id) || tmStdTaskIdFromUrl_(task && task.url);
    const url = tmStdClean_(task && task.url) || tmStdTaskUrl_(id);
    const name = tmStdClean_(task && (task.name || task.title || task.label));
    return id && url ? { id: id, url: url, name: name } : null;
  }).filter(Boolean);

  const seen = {};
  const uniqueTasks = tasks.filter(function(task) {
    if (seen[task.id]) return false;
    seen[task.id] = true;
    return true;
  });

  const lines = [start, '------- Striven Links -------'];

  if (division === 'PreInspection') {
    const salesOrdersList = data.salesOrdersList || null;
    if (salesOrdersList && tmStdClean_(salesOrdersList.url)) {
      lines.push(tmStdBuildAnchor_(
        tmStdClean_(salesOrdersList.url),
        tmStdClean_(salesOrdersList.label) || 'Sales Orders Dashboard'
      ));
    }

    if (uniqueTasks.length && salesOrdersList && tmStdClean_(salesOrdersList.url)) {
      lines.push('');
    }

    uniqueTasks.forEach(function(task) {
      const label = 'Task #' + task.id + (task.name ? ' - ' + task.name : '');
      lines.push(tmStdBuildAnchor_(task.url, label));
    });

    lines.push('------------------------------------');
    lines.push(end);
    return lines.join('<br>');
  }

  lines.push('');
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
    lines.push(tmStdBuildAnchor_(
      tmStdClean_(salesOrdersList.url),
      tmStdClean_(salesOrdersList.label) || 'Sales Orders'
    ));
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
    return taskId ? {
      id: taskId,
      url: tmStdClean_(task && task.url) || tmStdTaskUrl_(taskId),
      name: tmStdClean_(task && (task.name || task.title || task.label))
    } : null;
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
    const context = tmStdPreInspectContextForEvent_(eventId, taskId);
    const accountId = context.accountId || tmStdPositiveNumber_(row['Customer ID'] || row['Customer #']);
    const customerName = tmStdClean_(row.Customer) || context.customerName || ('Customer ' + accountId);
    const taskName = context.taskName;
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
        [{ id: taskId, name: taskName }],
        null,
        !!dryRun,
        {
          accountId: accountId,
          url: tmStdSalesOrdersListUrl_(accountId),
          label: customerName + "'s Sales Orders Dashboard"
        }
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


const TM_STD_PREINSPECT_AUDIT = {
  SHEET_NAME: 'PreInspect Calendar Audit',
  COLUMN_COUNT: 24,
  EMPLOYEE_DOMAIN: '@classicfireplace.ca',
  HEADERS: [
    'Date','Time','Audit Status','Checklist','Current Title','Expected Standard Title',
    'Customer #','Customer Name','Phone','Description / Purpose','Sales Order',
    'CF Preinspects Guest?','Stephen Guest?','Striven Links?','Task ID','Task Name',
    'Created By','Guests','Location','Event ID','Event Link','Source Calendar',
    'Title Standard?','Purpose Present?'
  ]
};

function tmStdPreInspectAuditNormalizeEventId_(value) {
  return tmStdClean_(value).replace(/@google\.com$/i, '');
}

function tmStdPreInspectAuditSheetMap_(sheetName) {
  const out = {};
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss && ss.getSheetByName(sheetName);
  if (!sheet || sheet.getLastRow() < 2) return out;
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0];
  const eventIdx = tmStdFindHeaderIndex_(headers, ['Event ID']);
  if (eventIdx < 0) return out;
  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getDisplayValues();
  values.forEach(function(row) {
    const id = tmStdPreInspectAuditNormalizeEventId_(row[eventIdx]);
    if (!id) return;
    const obj = {};
    headers.forEach(function(h, i) {
      h = tmStdClean_(h);
      if (h) obj[h] = row[i];
    });
    out[id] = obj;
  });
  return out;
}

function tmStdPreInspectAuditPhone_(value) {
  const m = String(value || '').match(/(?:\+?1[\s.\-]?)?\(?(\d{3})\)?[\s.\-]?(\d{3})[\s.\-]?(\d{4})/);
  return m ? '(' + m[1] + ') ' + m[2] + '-' + m[3] : '';
}

function tmStdPreInspectAuditSalesOrders_(value) {
  const out = [];
  const seen = {};
  const re = /\b(?:SO\s*#?|sales\s+order\s*#?)\s*(\d{6})\b/gi;
  let m;
  while ((m = re.exec(String(value || ''))) !== null) {
    if (!seen[m[1]]) {
      seen[m[1]] = true;
      out.push(m[1]);
    }
  }
  return out;
}

function tmStdPreInspectAuditPurpose_(description) {
  let text = tmStdRemoveManagedCalendarLinks_(String(description || ''));
  text = text
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&#x27;|&#39;/gi, "'")
    .replace(/\r/g, '')
    .replace(/^\s*Calendar title context \(preserved\):[\s\S]*?(?:\n\s*\n|$)/i, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return text;
}

function tmStdPreInspectAuditIsBlock_(title) {
  const text = tmStdClean_(title);
  if (typeof PREINSPECT_REVIEW_CONFIG !== 'undefined' &&
      PREINSPECT_REVIEW_CONFIG &&
      Array.isArray(PREINSPECT_REVIEW_CONFIG.NON_CUSTOMER_TITLE_PATTERNS)) {
    for (let i = 0; i < PREINSPECT_REVIEW_CONFIG.NON_CUSTOMER_TITLE_PATTERNS.length; i++) {
      const re = PREINSPECT_REVIEW_CONFIG.NON_CUSTOMER_TITLE_PATTERNS[i];
      if (re && typeof re.test === 'function') {
        re.lastIndex = 0;
        if (re.test(text)) return true;
      }
    }
  }
  return /\bout of office\b/i.test(text);
}

function tmStdPreInspectAuditTitleStandard_(title) {
  return /^\s*\d{4,5}\s*-\s*.+?\s*-\s*(?:\+?1[\s.\-]?)?\(?\d{3}\)?[\s.\-]?\d{3}[\s.\-]?\d{4}\s*$/.test(String(title || ''));
}

function tmStdPreInspectAuditTaskParts_(label) {
  const m = tmStdClean_(label).match(/^(\d+)\s*[-–—:]\s*(.+)$/);
  return m ? { id: m[1], name: m[2] } : { id: '', name: '' };
}

function tmStdPreInspectAuditCreators_(event) {
  try {
    const creators = typeof event.getCreators === 'function' ? (event.getCreators() || []) : [];
    return creators.map(function(x) { return tmStdClean_(x).toLowerCase(); }).filter(Boolean);
  } catch (err) {
    return [];
  }
}

function tmStdPreInspectAuditEventLink_(event) {
  if (typeof preinspectBuildNativeCalendarEventLink_ === 'function') {
    try {
      return preinspectBuildNativeCalendarEventLink_(event, TM_STD_R12_PREINSPECT.STEPHEN_CALENDAR_ID);
    } catch (err) {}
  }
  return '';
}


const TM_STD_PREINSPECT_REORG = {
  LOG_SHEET_NAME: 'PreInspect Calendar Reorganization Log',
  CONTEXT_PREFIX: 'Calendar title context (preserved): ',
  SAFE_STATUSES: ['CONFIRMED', 'MATCHED'],
  LOG_HEADERS: [
    'Timestamp','Event ID','Organizer / Creator','Original Title','New Standard Title',
    'Context Preserved?','Preserved Context','Description Changed?','Verification','Version'
  ]
};

function tmStdPreInspectReorgTokenize_(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function tmStdPreInspectReorgHasExtraContext_(originalTitle, standardTitle) {
  const original = tmStdPreInspectReorgTokenize_(originalTitle);
  const standard = tmStdPreInspectReorgTokenize_(standardTitle);
  const counts = {};
  standard.forEach(function(token) { counts[token] = (counts[token] || 0) + 1; });
  for (let i = 0; i < original.length; i++) {
    const token = original[i];
    if (counts[token]) counts[token]--;
    else return true;
  }
  return false;
}

function tmStdPreInspectReorgContextLine_(originalTitle) {
  return TM_STD_PREINSPECT_REORG.CONTEXT_PREFIX + tmStdClean_(originalTitle);
}

function tmStdPreInspectReorgNormalizeReadBack_(value) {
  return String(value || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&#x27;|&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function tmStdPreInspectReorgContextPresent_(description, contextLine) {
  const haystack = tmStdPreInspectReorgNormalizeReadBack_(description);
  const needle = tmStdPreInspectReorgNormalizeReadBack_(contextLine);
  return !!needle && haystack.indexOf(needle) >= 0;
}

function tmStdPreInspectReorgDescriptionWithContext_(description, originalTitle) {
  const current = String(description || '');
  const line = tmStdPreInspectReorgContextLine_(originalTitle);
  if (tmStdPreInspectReorgContextPresent_(current, line)) {
    return { description: current, changed: false, line: line };
  }
  return {
    description: current ? line + '\n\n' + current : line,
    changed: true,
    line: line
  };
}

function tmStdPreInspectReorgMappingRows_() {
  const out = [];
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss && ss.getSheetByName('PreInspect Task Mapping');
  if (!sheet || sheet.getLastRow() < 2) return out;
  const headerRow = tmStdFindMappingHeaderRow_(sheet);
  if (!headerRow || sheet.getLastRow() <= headerRow) return out;
  const headers = sheet.getRange(headerRow, 1, 1, sheet.getLastColumn()).getDisplayValues()[0];
  const values = sheet.getRange(headerRow + 1, 1, sheet.getLastRow() - headerRow, sheet.getLastColumn()).getDisplayValues();
  values.forEach(function(valuesRow) {
    const row = tmStdRowObject_(headers, valuesRow);
    const status = tmStdUpper_(row.Status);
    if (TM_STD_PREINSPECT_REORG.SAFE_STATUSES.indexOf(status) < 0) return;
    const eventId = tmStdClean_(row['Event ID']);
    const customerNumber = tmStdClean_(row['Customer #']);
    const customerName = tmStdClean_(row.Customer);
    const phone = tmStdPreInspectAuditPhone_(row['Calendar Title'] || '');
    if (!eventId || !customerNumber || !customerName || !phone) return;
    out.push({
      eventId: eventId,
      status: status,
      customerNumber: customerNumber,
      customerName: customerName,
      phone: phone,
      standardTitle: customerNumber + ' - ' + customerName + ' - ' + phone
    });
  });
  return out;
}

function tmStdPreInspectReorgEnsureLogSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(TM_STD_PREINSPECT_REORG.LOG_SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(TM_STD_PREINSPECT_REORG.LOG_SHEET_NAME);
  if (sheet.getMaxColumns() < TM_STD_PREINSPECT_REORG.LOG_HEADERS.length) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), TM_STD_PREINSPECT_REORG.LOG_HEADERS.length - sheet.getMaxColumns());
  }
  const currentHeaders = sheet.getRange(1, 1, 1, TM_STD_PREINSPECT_REORG.LOG_HEADERS.length).getDisplayValues()[0];
  if (currentHeaders.join('\u001f') !== TM_STD_PREINSPECT_REORG.LOG_HEADERS.join('\u001f')) {
    sheet.getRange(1, 1, 1, TM_STD_PREINSPECT_REORG.LOG_HEADERS.length)
      .setValues([TM_STD_PREINSPECT_REORG.LOG_HEADERS])
      .setFontWeight('bold')
      .setBackground('#9f2d2d')
      .setFontColor('#ffffff')
      .setWrap(true);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function tmStdPreInspectReorgLog_(entry) {
  const sheet = tmStdPreInspectReorgEnsureLogSheet_();
  sheet.appendRow([
    new Date(),
    entry.eventId || '',
    entry.creator || '',
    entry.originalTitle || '',
    entry.newTitle || '',
    entry.contextPreserved ? 'YES' : 'NO',
    entry.contextLine || '',
    entry.descriptionChanged ? 'YES' : 'NO',
    entry.verification || '',
    TM_STD_R1_VERSION
  ]);
}

function tmStdReorganizePreInspectCalendarTitles_(dryRun) {
  const candidates = tmStdPreInspectReorgMappingRows_();
  const results = [];
  let writeCount = 0;

  candidates.forEach(function(candidate) {
    const eventRef = tmStdFindEventOnCalendar_(TM_STD_R12_PREINSPECT.STEPHEN_CALENDAR_ID, candidate.eventId);
    if (!eventRef || !eventRef.event) {
      results.push({
        eventId: candidate.eventId,
        status: 'SKIPPED_NOT_ON_STEPHEN',
        customerNumber: candidate.customerNumber,
        writeCount: 0
      });
      return;
    }

    const event = eventRef.event;
    const originalTitle = tmStdClean_(event.getTitle());
    const standardTitle = candidate.standardTitle;

    if (!originalTitle || originalTitle === standardTitle) {
      results.push({
        eventId: candidate.eventId,
        status: originalTitle === standardTitle ? 'ALREADY_STANDARD' : 'SKIPPED_BLANK_TITLE',
        originalTitle: originalTitle,
        standardTitle: standardTitle,
        writeCount: 0
      });
      return;
    }

    const currentDescription = String(event.getDescription() || '');
    const preserveContext = tmStdPreInspectReorgHasExtraContext_(originalTitle, standardTitle);
    const descriptionPlan = preserveContext
      ? tmStdPreInspectReorgDescriptionWithContext_(currentDescription, originalTitle)
      : { description: currentDescription, changed: false, line: '' };

    if (dryRun) {
      results.push({
        eventId: candidate.eventId,
        status: 'WOULD_REORGANIZE',
        originalTitle: originalTitle,
        standardTitle: standardTitle,
        contextPreserved: preserveContext,
        contextLine: descriptionPlan.line,
        descriptionWouldChange: descriptionPlan.changed,
        writeCount: 0
      });
      return;
    }

    // Zero-information-loss guard: preserve title-only context before changing the title.
    if (descriptionPlan.changed) {
      event.setDescription(descriptionPlan.description);
      const descriptionReadBack = String(event.getDescription() || '');
      if (!tmStdPreInspectReorgContextPresent_(descriptionReadBack, descriptionPlan.line)) {
        throw new Error('PreInspection title reorganization aborted because context preservation did not read back for event ' + candidate.eventId);
      }
      writeCount++;
    }

    event.setTitle(standardTitle);
    writeCount++;

    const titleReadBack = tmStdClean_(event.getTitle());
    const descriptionReadBack = String(event.getDescription() || '');
    const titleOk = titleReadBack === standardTitle;
    const contextOk = !preserveContext || tmStdPreInspectReorgContextPresent_(descriptionReadBack, descriptionPlan.line);

    if (!titleOk || !contextOk) {
      throw new Error('PreInspection title reorganization read-back failed for event ' + candidate.eventId);
    }

    const creators = tmStdPreInspectAuditCreators_(event);
    tmStdPreInspectReorgLog_({
      eventId: tmStdPreInspectAuditNormalizeEventId_(candidate.eventId),
      creator: creators.join(', '),
      originalTitle: originalTitle,
      newTitle: standardTitle,
      contextPreserved: preserveContext,
      contextLine: descriptionPlan.line,
      descriptionChanged: descriptionPlan.changed,
      verification: 'TITLE_AND_DESCRIPTION_READBACK_VERIFIED'
    });

    results.push({
      eventId: candidate.eventId,
      status: 'REORGANIZED_VERIFIED',
      originalTitle: originalTitle,
      standardTitle: standardTitle,
      contextPreserved: preserveContext,
      contextLine: descriptionPlan.line,
      descriptionChanged: descriptionPlan.changed,
      writeCount: (descriptionPlan.changed ? 1 : 0) + 1,
      emailRequiredForTitle: false
    });
  });

  return {
    mode: dryRun ? 'DRY_RUN' : 'WRITE',
    version: TM_STD_R1_VERSION,
    status: 'COMPLETE',
    candidates: candidates.length,
    reorganized: results.filter(function(x) { return x.status === 'REORGANIZED_VERIFIED'; }).length,
    wouldReorganize: results.filter(function(x) { return x.status === 'WOULD_REORGANIZE'; }).length,
    writeCount: writeCount,
    emailSendsPerformed: 0,
    calendarWritesPerformed: writeCount > 0,
    strivenWritesPerformed: false,
    events: results
  };
}

function runPreInspectCalendarReorganization() {
  const result = tmStdReorganizePreInspectCalendarTitles_(false);
  refreshPreInspectCalendarAudit();
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

function dryRunPreInspectCalendarReorganization() {
  const result = tmStdReorganizePreInspectCalendarTitles_(true);
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}


function tmStdPreInspectAuditBuildRow_(event, mappingByEvent, mirrorByEvent) {
  const eventId = tmStdPreInspectAuditNormalizeEventId_(event.getId());
  const mapping = mappingByEvent[eventId] || {};
  const mirror = mirrorByEvent[eventId] || {};
  const title = tmStdClean_(event.getTitle());
  const rawDescription = String(event.getDescription() || '');
  const purpose = tmStdPreInspectAuditPurpose_(rawDescription);
  const customerNumber = tmStdClean_(mapping['Customer #'] || mirror['Customer #']);
  const customerName = tmStdClean_(mapping.Customer || '');
  const phone = tmStdPreInspectAuditPhone_(title || mirror.Phone || '');
  const expectedTitle = customerNumber && customerName && phone
    ? customerNumber + ' - ' + customerName + ' - ' + phone
    : '';

  const salesOrders = tmStdPreInspectAuditSalesOrders_(title + ' ' + purpose);
  const mirrorSo = tmStdClean_(mirror['Sales Order']);
  if (mirrorSo && salesOrders.indexOf(mirrorSo) < 0) salesOrders.push(mirrorSo);

  const guests = tmStdPreInspectGuestEmails_(event);
  const hasCfPreInspect = guests.indexOf(TM_STD_R12_PREINSPECT.CF_PREINSPECT_CALENDAR_ID.toLowerCase()) >= 0;
  const hasStephen = guests.indexOf(TM_STD_R12_PREINSPECT.STEPHEN_PERSONAL_EMAIL.toLowerCase()) >= 0;

  const mirrorHtml = String(mirror['Description HTML Source'] || '');
  const evidenceText = rawDescription + '\n' + mirrorHtml;
  const hasDashboard = /classicfireplace\.striven\.com\/next\/crm#\/sales-orders\?accountId=/i.test(evidenceText);
  const hasTaskLink = /classicfireplace\.striven\.com\/Tasks\/TaskInfo\.aspx\?TaskID=/i.test(evidenceText);
  const strivenLinks = hasDashboard && hasTaskLink ? 'YES' : ((hasDashboard || hasTaskLink) ? 'PARTIAL' : 'NO');

  const task = tmStdPreInspectAuditTaskParts_(mirror.Task || mirror['Striven Task Link']);
  const titleStandard = tmStdPreInspectAuditTitleStandard_(title);
  const purposePresent = !!purpose;
  const isBlock = tmStdPreInspectAuditIsBlock_(title);

  const checklist = isBlock
    ? '— Non-customer calendar block'
    : [
        (titleStandard ? '✅' : '❌') + ' Title: Customer # - Customer Name - Phone',
        (purposePresent ? '✅' : '❌') + ' Purpose / Description',
        (salesOrders.length ? '✅' : '❌') + ' Sales Order' + (salesOrders.length ? ': ' + salesOrders.join(', ') : ''),
        (hasCfPreInspect ? '✅' : '❌') + ' CF Preinspects Guest',
        (hasStephen ? '✅' : '❌') + ' Stephen Guest',
        (strivenLinks === 'YES' ? '✅' : (strivenLinks === 'PARTIAL' ? '🔎' : '❌')) +
          ' Striven Links' + (strivenLinks === 'PARTIAL' ? ' (partial)' : '')
      ].join('\n');

  const auditStatus = isBlock
    ? 'IGNORE'
    : (titleStandard && purposePresent && salesOrders.length && hasCfPreInspect && hasStephen && strivenLinks === 'YES'
        ? 'PASS'
        : 'ACTION REQUIRED');

  const tz = 'America/Toronto';
  const start = event.getStartTime();
  const date = Utilities.formatDate(start, tz, 'yyyy-MM-dd');
  const time = event.isAllDayEvent() ? 'All day' : Utilities.formatDate(start, tz, 'HH:mm');

  return [
    date,
    time,
    auditStatus,
    checklist,
    title,
    expectedTitle,
    customerNumber,
    customerName,
    phone,
    purpose,
    salesOrders.join(', '),
    hasCfPreInspect ? 'YES' : 'NO',
    hasStephen ? 'YES' : 'NO',
    strivenLinks,
    task.id,
    task.name,
    tmStdPreInspectAuditCreators_(event).join(', '),
    guests.join(', '),
    tmStdClean_(event.getLocation()),
    eventId,
    tmStdPreInspectAuditEventLink_(event),
    'Stephen -',
    titleStandard ? 'YES' : 'NO',
    purposePresent ? 'YES' : 'NO'
  ];
}

function tmStdRefreshPreInspectCalendarAudit_(start, end, reason) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('Active spreadsheet is unavailable.');

  const calendar = CalendarApp.getCalendarById(TM_STD_R12_PREINSPECT.STEPHEN_CALENDAR_ID);
  if (!calendar) throw new Error('Stephen calendar is unavailable.');

  const windowStart = start instanceof Date ? start : new Date();
  const windowEnd = end instanceof Date ? end : new Date(windowStart.getTime() + 45 * 24 * 60 * 60 * 1000);

  // Safe auto-reorganization runs before the audit so organizers are not notified
  // for title issues the automation can resolve with verified customer identity.
  const reorganization = tmStdReorganizePreInspectCalendarTitles_(false);

  const mappingByEvent = tmStdPreInspectAuditSheetMap_('PreInspect Task Mapping');
  const mirrorByEvent = tmStdPreInspectAuditSheetMap_('PreInspect Calendar');
  const allEvents = calendar.getEvents(windowStart, windowEnd) || [];
  const rows = [];

  allEvents.forEach(function(event) {
    const creators = tmStdPreInspectAuditCreators_(event);
    const otherEmployees = creators.filter(function(email) {
      return email.slice(-TM_STD_PREINSPECT_AUDIT.EMPLOYEE_DOMAIN.length) === TM_STD_PREINSPECT_AUDIT.EMPLOYEE_DOMAIN &&
        email !== TM_STD_R12_PREINSPECT.STEPHEN_PERSONAL_EMAIL.toLowerCase();
    });
    if (!otherEmployees.length) return;
    rows.push(tmStdPreInspectAuditBuildRow_(event, mappingByEvent, mirrorByEvent));
  });

  rows.sort(function(a, b) {
    const ka = String(a[0] || '') + ' ' + String(a[1] || '');
    const kb = String(b[0] || '') + ' ' + String(b[1] || '');
    return ka.localeCompare(kb);
  });

  let sheet = ss.getSheetByName(TM_STD_PREINSPECT_AUDIT.SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(TM_STD_PREINSPECT_AUDIT.SHEET_NAME);
  if (sheet.isSheetHidden && sheet.isSheetHidden()) sheet.showSheet();
  if (sheet.getMaxColumns() < TM_STD_PREINSPECT_AUDIT.COLUMN_COUNT) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), TM_STD_PREINSPECT_AUDIT.COLUMN_COUNT - sheet.getMaxColumns());
  }
  if (sheet.getMaxRows() < rows.length + 1) {
    sheet.insertRowsAfter(sheet.getMaxRows(), rows.length + 1 - sheet.getMaxRows());
  }

  sheet.clearContents();
  sheet.getRange(1, 1, 1, TM_STD_PREINSPECT_AUDIT.COLUMN_COUNT)
    .setValues([TM_STD_PREINSPECT_AUDIT.HEADERS])
    .setFontWeight('bold')
    .setFontColor('#ffffff')
    .setBackground('#1f4e78')
    .setWrap(true)
    .setVerticalAlignment('middle');

  if (rows.length) {
    sheet.getRange(2, 1, rows.length, TM_STD_PREINSPECT_AUDIT.COLUMN_COUNT)
      .setValues(rows)
      .setVerticalAlignment('top');
    sheet.getRange(2, 4, rows.length, 1).setWrap(true);
    sheet.getRange(2, 5, rows.length, 2).setWrap(true);
    sheet.getRange(2, 10, rows.length, 1).setWrap(true);
    sheet.getRange(2, 18, rows.length, 2).setWrap(true);
  }

  sheet.setFrozenRows(1);
  const widths = [90,80,130,230,300,300,100,180,140,340,120,130,120,115,90,300,190,280,260,240,240,110,110,120];
  widths.forEach(function(width, i) { sheet.setColumnWidth(i + 1, width); });

  const existingFilter = sheet.getFilter();
  if (existingFilter) existingFilter.remove();
  if (rows.length) sheet.getRange(1, 1, rows.length + 1, TM_STD_PREINSPECT_AUDIT.COLUMN_COUNT).createFilter();

  const counts = { PASS: 0, ACTION_REQUIRED: 0, IGNORE: 0 };
  rows.forEach(function(row) {
    if (row[2] === 'PASS') counts.PASS++;
    else if (row[2] === 'ACTION REQUIRED') counts.ACTION_REQUIRED++;
    else if (row[2] === 'IGNORE') counts.IGNORE++;
  });

  const result = {
    mode: 'PREINSPECT_CALENDAR_AUDIT',
    version: TM_STD_R1_VERSION,
    status: 'COMPLETE',
    reason: reason || '',
    sourceCalendar: 'Stephen -',
    sourceCalendarId: TM_STD_R12_PREINSPECT.STEPHEN_CALENDAR_ID,
    filter: 'CREATED_BY_OTHER_CLASSIC_FIREPLACE_EMPLOYEE',
    windowStart: Utilities.formatDate(windowStart, 'America/Toronto', "yyyy-MM-dd'T'HH:mm:ss"),
    windowEnd: Utilities.formatDate(windowEnd, 'America/Toronto', "yyyy-MM-dd'T'HH:mm:ss"),
    eventsRead: allEvents.length,
    auditRows: rows.length,
    counts: counts,
    calendarWritesPerformed: !!(reorganization && reorganization.calendarWritesPerformed),
    calendarWriteCount: reorganization ? Number(reorganization.writeCount || 0) : 0,
    reorganization: reorganization || null,
    emailSendsPerformed: 0,
    strivenWritesPerformed: false,
    sheetWritesPerformed: true,
    sheetName: TM_STD_PREINSPECT_AUDIT.SHEET_NAME
  };
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

function refreshPreInspectCalendarAudit() {
  let window = null;
  if (typeof preinspectCalendarMirrorWindow_ === 'function') {
    window = preinspectCalendarMirrorWindow_();
  }
  const now = new Date();
  return tmStdRefreshPreInspectCalendarAudit_(
    window && window.start ? window.start : now,
    window && window.end ? window.end : new Date(now.getTime() + 45 * 24 * 60 * 60 * 1000),
    'MANUAL_AUDIT_REFRESH'
  );
}



function tmStdPreInspectAuditRowObjectAt_(sheet, rowNumber) {
  if (!sheet || rowNumber < 2 || rowNumber > sheet.getLastRow()) return null;
  const headers = sheet.getRange(1, 1, 1, TM_STD_PREINSPECT_AUDIT.COLUMN_COUNT).getDisplayValues()[0];
  const values = sheet.getRange(rowNumber, 1, 1, TM_STD_PREINSPECT_AUDIT.COLUMN_COUNT).getDisplayValues()[0];
  const out = {};
  headers.forEach(function(h, i) {
    h = tmStdClean_(h);
    if (h) out[h] = values[i];
  });
  return out;
}

function tmStdPreInspectAuditFindRowByEventId_(eventId) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss && ss.getSheetByName(TM_STD_PREINSPECT_AUDIT.SHEET_NAME);
  if (!sheet || sheet.getLastRow() < 2) return null;
  const headers = sheet.getRange(1, 1, 1, TM_STD_PREINSPECT_AUDIT.COLUMN_COUNT).getDisplayValues()[0];
  const eventIdx = tmStdFindHeaderIndex_(headers, ['Event ID']);
  if (eventIdx < 0) return null;
  const wanted = tmStdPreInspectAuditNormalizeEventId_(eventId);
  const values = sheet.getRange(2, eventIdx + 1, sheet.getLastRow() - 1, 1).getDisplayValues();
  for (let i = 0; i < values.length; i++) {
    if (tmStdPreInspectAuditNormalizeEventId_(values[i][0]) === wanted) {
      return { sheet: sheet, rowNumber: i + 2, row: tmStdPreInspectAuditRowObjectAt_(sheet, i + 2) };
    }
  }
  return null;
}

function tmStdPreInspectPreviewResolveSelectedAuditRow_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const activeSheet = ss && ss.getActiveSheet();
  const activeRange = ss && ss.getActiveRange();
  if (!activeSheet || !activeRange) throw new Error('Select a Pre-Inspection row first.');

  const selectedRow = activeRange.getRow();
  if (activeSheet.getName() === TM_STD_PREINSPECT_AUDIT.SHEET_NAME) {
    if (selectedRow < 2) throw new Error('Select an audit data row, not the header.');
    const row = tmStdPreInspectAuditRowObjectAt_(activeSheet, selectedRow);
    if (!row || !tmStdClean_(row['Event ID'])) throw new Error('The selected audit row does not contain an Event ID.');
    return { sheet: activeSheet, rowNumber: selectedRow, row: row };
  }

  const supported = ['PreInspect Calendar', 'PreInspect Task Mapping'];
  if (supported.indexOf(activeSheet.getName()) < 0) {
    throw new Error('Select a row on PreInspect Calendar Audit, PreInspect Calendar, or PreInspect Task Mapping.');
  }

  const headerRow = activeSheet.getName() === 'PreInspect Task Mapping'
    ? (tmStdFindMappingHeaderRow_(activeSheet) || 1)
    : 1;
  if (selectedRow <= headerRow) throw new Error('Select a data row, not the header.');

  const headers = activeSheet.getRange(headerRow, 1, 1, activeSheet.getLastColumn()).getDisplayValues()[0];
  const eventIdx = tmStdFindHeaderIndex_(headers, ['Event ID']);
  if (eventIdx < 0) throw new Error('Event ID column was not found on the selected sheet.');
  const eventId = tmStdClean_(activeSheet.getRange(selectedRow, eventIdx + 1).getDisplayValue());
  if (!eventId) throw new Error('The selected row does not contain an Event ID.');

  let match = tmStdPreInspectAuditFindRowByEventId_(eventId);
  if (!match) {
    refreshPreInspectCalendarAudit();
    match = tmStdPreInspectAuditFindRowByEventId_(eventId);
  }
  if (!match) throw new Error('This event is not in the PreInspect Calendar Audit. It may not have been created by another Classic Fireplace employee.');
  return match;
}

function tmStdPreInspectPreviewFirstName_(email) {
  const local = tmStdClean_(email).split('@')[0] || '';
  const first = local.split(/[._-]+/)[0] || 'there';
  return first.charAt(0).toUpperCase() + first.slice(1);
}

function tmStdPreInspectPreviewMissingItems_(row) {
  const items = [];
  const currentTitle = tmStdClean_(row['Current Title']);
  const customerNumber = tmStdClean_(row['Customer #']);
  const numberAtStart = customerNumber
    ? new RegExp('^#?' + tmStdEscapeRegex_(customerNumber) + '\\b').test(currentTitle)
    : false;
  const missingCustomerNumber = !customerNumber || !numberAtStart;

  if (missingCustomerNumber) {
    items.push({
      key: 'CUSTOMER_NUMBER',
      label: 'Customer number',
      detail: customerNumber
        ? 'Customer #' + customerNumber + ' is known, but it is not at the beginning of the calendar title.'
        : 'The customer number is missing from the calendar title.'
    });
  }
  if (tmStdUpper_(row['Purpose Present?']) !== 'YES') {
    items.push({
      key: 'PURPOSE',
      label: 'Description',
      detail: 'The description does not explain what the Pre-Inspection is for.'
    });
  }
  if (!tmStdClean_(row['Sales Order'])) {
    items.push({
      key: 'SALES_ORDER',
      label: 'Sales Order',
      detail: 'No Sales Order could be identified from the appointment.'
    });
  }
  if (tmStdUpper_(row['CF Preinspects Guest?']) !== 'YES') {
    items.push({
      key: 'CF_PREINSPECTS',
      label: 'CF Preinspects',
      detail: 'The CF Preinspects shared calendar has not been added as a guest.'
    });
  }
  if (tmStdUpper_(row['Stephen Guest?']) !== 'YES') {
    items.push({
      key: 'STEPHEN',
      label: 'Stephen',
      detail: 'stephen@classicfireplace.ca has not been added as a guest.'
    });
  }

  return {
    items: items,
    missingCustomerNumber: missingCustomerNumber
  };
}

function tmStdPreInspectPreviewMissingItemsHtml_(items) {
  return (items || []).map(function(item) {
    return '<div style="font-size:14px;line-height:22px;margin:7px 0;color:#3d2526;">' +
      '<span style="color:#b42b2f;font-weight:700;">&#10006;</span>&nbsp; ' +
      '<strong>' + tmStdEscapeHtml_(item.label) + ':</strong> ' +
      tmStdEscapeHtml_(item.detail) +
      '</div>';
  }).join('');
}

function tmStdBuildPreInspectNotificationPreview_(row) {
  const recipient = tmStdClean_(row['Created By']).split(',')[0].trim();
  const currentTitle = tmStdClean_(row['Current Title']);
  const expectedTitle = tmStdClean_(row['Expected Standard Title']) ||
    '[Customer #] - [Customer Name] - [Phone Number]';
  const date = tmStdClean_(row.Date);
  const time = tmStdClean_(row.Time);
  const missing = tmStdPreInspectPreviewMissingItems_(row);
  const subject = 'Action needed: Pre-Inspection calendar appointment';
  const firstName = tmStdPreInspectPreviewFirstName_(recipient);
  const missingHtml = tmStdPreInspectPreviewMissingItemsHtml_(missing.items);

  const whyCustomerNumber = missing.missingCustomerNumber
    ? '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-top:18px;background:#fffaf0;border:1px solid #eadfc7;">' +
        '<tr><td style="padding:20px 22px;">' +
          '<div style="font-size:14px;line-height:20px;font-weight:700;color:#6c5120;margin-bottom:8px;">Why the customer number is important</div>' +
          '<div style="font-size:14px;line-height:22px;color:#554a37;">We recently had an example where Kevin created a new customer because the existing customer could not be confidently identified from the information in the calendar appointment at the store.</div>' +
          '<div style="font-size:14px;line-height:22px;color:#554a37;margin-top:9px;">Including the <strong>Striven customer number</strong> lets the workflow identify the correct customer immediately and helps prevent duplicate customer records.</div>' +
        '</td></tr></table>'
    : '';

  const body = [
    '<!doctype html><html><body style="margin:0;padding:0;background:#f4f3f1;font-family:Arial,Helvetica,sans-serif;color:#242424;">',
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f4f3f1;"><tr><td align="center" style="padding:24px 12px;">',
    '<table role="presentation" width="640" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:640px;background:#ffffff;border-collapse:collapse;">',
    '<tr><td style="background:#202020;padding:25px 32px 22px;border-top:5px solid #b42b2f;">',
      '<div style="font-size:11px;line-height:16px;letter-spacing:1.6px;text-transform:uppercase;color:#d9d9d9;margin-bottom:8px;">Classic Fireplace &amp; BBQ Store</div>',
      '<div style="font-size:24px;line-height:30px;font-weight:700;color:#ffffff;">Pre-Inspection Calendar Notice</div>',
      '<div style="font-size:14px;line-height:21px;color:#cccccc;margin-top:7px;">A calendar appointment needs a quick update before it can move cleanly through the Pre-Inspection workflow.</div>',
    '</td></tr>',
    '<tr><td style="padding:28px 32px 12px;">',
      '<p style="margin:0;font-size:16px;line-height:25px;">Hi <strong>', tmStdEscapeHtml_(firstName), '</strong>,</p>',
      '<p style="margin:13px 0 0;font-size:15px;line-height:24px;color:#444444;">We reviewed a Pre-Inspection appointment you created and found some information that needs to be completed or corrected.</p>',
    '</td></tr>',
    '<tr><td style="padding:12px 32px 8px;">',
      '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f7f6f4;border:1px solid #e2e0dc;"><tr><td style="padding:18px 20px;">',
        '<div style="font-size:11px;line-height:16px;letter-spacing:1px;text-transform:uppercase;color:#777;font-weight:700;margin-bottom:10px;">Appointment being reviewed</div>',
        '<div style="font-size:18px;line-height:25px;font-weight:700;color:#222;margin-bottom:9px;">', tmStdEscapeHtml_(currentTitle), '</div>',
        '<div style="font-size:13px;line-height:20px;color:#555;"><strong>Date:</strong> ', tmStdEscapeHtml_(date), '&nbsp;&nbsp; <strong>Time:</strong> ', tmStdEscapeHtml_(time), '</div>',
      '</td></tr></table>',
    '</td></tr>',
    '<tr><td style="padding:17px 32px 8px;">',
      '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#fff5f5;border-left:4px solid #b42b2f;"><tr><td style="padding:19px 21px;">',
        '<div style="font-size:14px;line-height:20px;font-weight:700;color:#8f2024;margin-bottom:10px;">What needs attention</div>',
        missingHtml || '<div style="font-size:14px;line-height:22px;color:#456b48;">No organizer-owned items are currently missing.</div>',
      '</td></tr></table>',
    '</td></tr>',
    '<tr><td style="padding:18px 32px 8px;">',
      '<div style="font-size:17px;line-height:24px;font-weight:700;color:#222;margin-bottom:10px;">Please use our standard calendar title</div>',
      '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#202020;"><tr><td align="center" style="padding:17px 15px;">',
        '<div style="font-size:11px;line-height:16px;text-transform:uppercase;letter-spacing:1px;color:#bdbdbd;margin-bottom:7px;">Required format</div>',
        '<div style="font-size:17px;line-height:25px;color:#fff;font-weight:700;">Customer # - Customer Name - Phone Number</div>',
      '</td></tr></table>',
      '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-top:10px;"><tr><td style="font-size:11px;text-transform:uppercase;color:#888;padding:0 0 5px;">Current title</td></tr>',
      '<tr><td style="background:#fff5f5;border:1px solid #edd4d5;padding:12px 15px;font-size:14px;line-height:21px;color:#6d2528;">', tmStdEscapeHtml_(currentTitle), '</td></tr>',
      '<tr><td style="font-size:11px;text-transform:uppercase;color:#888;padding:14px 0 5px;">Expected title</td></tr>',
      '<tr><td style="background:#f2f7f2;border:1px solid #d6e4d6;padding:12px 15px;font-size:14px;line-height:21px;color:#254f2a;font-weight:700;">', tmStdEscapeHtml_(expectedTitle), '</td></tr></table>',
      whyCustomerNumber,
    '</td></tr>',
    '<tr><td style="padding:20px 32px 8px;">',
      '<div style="font-size:17px;line-height:24px;font-weight:700;color:#222;margin-bottom:10px;">A complete Pre-Inspection appointment should include</div>',
      '<div style="font-size:14px;line-height:23px;color:#444;">&#10003;&nbsp; <strong>Customer # - Customer Name - Phone Number</strong> in the title<br>',
      '&#10003;&nbsp; A short description explaining <strong>what the Pre-Inspection is for</strong><br>',
      '&#10003;&nbsp; The applicable <strong>Sales Order</strong>, when one exists<br>',
      '&#10003;&nbsp; <strong>CF Preinspects</strong> added to the appointment<br>',
      '&#10003;&nbsp; <strong>stephen@classicfireplace.ca</strong> added as a guest</div>',
    '</td></tr>',
    '<tr><td style="padding:18px 32px 28px;">',
      '<div style="border-top:1px solid #e5e2de;padding-top:18px;font-size:13px;line-height:21px;color:#686868;">Once the appointment is corrected, the Pre-Inspection workflow can continue processing it. You do <strong>not</strong> need to add Striven task links manually; those are handled by the automation.</div>',
    '</td></tr>',
    '<tr><td style="background:#202020;padding:20px 32px;text-align:center;">',
      '<div style="color:#fff;font-size:13px;line-height:19px;font-weight:700;">Classic Fireplace &amp; BBQ Store</div>',
      '<div style="color:#aaa;font-size:11px;line-height:18px;margin-top:4px;">Proudly Canadian. Family-owned.<br>Serving Homes Across the GTA Since 1989.</div>',
    '</td></tr>',
    '</table></td></tr></table></body></html>'
  ].join('');

  return {
    recipient: recipient,
    subject: subject,
    htmlBody: body,
    missingItems: missing.items.map(function(x) { return x.key; }),
    eventId: tmStdClean_(row['Event ID']),
    currentTitle: currentTitle,
    expectedTitle: expectedTitle
  };
}

function tmStdPreInspectPreviewChrome_(preview) {
  const recipient = tmStdEscapeHtml_(preview.recipient || '(no organizer email found)');
  const subject = tmStdEscapeHtml_(preview.subject || '');
  return [
    '<!doctype html><html><body style="margin:0;background:#e9e8e6;font-family:Arial,Helvetica,sans-serif;">',
    '<div style="position:sticky;top:0;z-index:10;background:#8f2024;color:#fff;padding:10px 16px;font-size:12px;font-weight:700;letter-spacing:.5px;text-align:center;">PREVIEW ONLY — NO EMAIL WILL BE SENT</div>',
    '<div style="max-width:760px;margin:16px auto;padding:0 12px 24px;">',
      '<div style="background:#fff;border:1px solid #d8d6d2;padding:12px 16px;margin-bottom:12px;font-size:12px;line-height:19px;color:#444;">',
        '<div><strong>To:</strong> ', recipient, '</div>',
        '<div><strong>Subject:</strong> ', subject, '</div>',
      '</div>',
      preview.htmlBody,
    '</div></body></html>'
  ].join('');
}

function previewPreInspectNotificationEmailForSelectedRow() {
  const selected = tmStdPreInspectPreviewResolveSelectedAuditRow_();
  const row = selected.row || {};
  if (tmStdUpper_(row['Audit Status']) === 'IGNORE') {
    SpreadsheetApp.getUi().alert('Preview not applicable', 'The selected row is a non-customer calendar block marked IGNORE.', SpreadsheetApp.getUi().ButtonSet.OK);
    return { status: 'IGNORED_ROW', emailSent: false };
  }

  const preview = tmStdBuildPreInspectNotificationPreview_(row);
  const html = HtmlService.createHtmlOutput(tmStdPreInspectPreviewChrome_(preview))
    .setWidth(820)
    .setHeight(720);

  SpreadsheetApp.getUi().showModalDialog(html, 'Pre-Inspection Notification Email Preview');

  return {
    status: 'PREVIEW_SHOWN',
    version: TM_STD_R1_VERSION,
    recipient: preview.recipient,
    subject: preview.subject,
    eventId: preview.eventId,
    missingItems: preview.missingItems,
    emailSent: false,
    mailServiceCalled: false
  };
}

function tmStdAddPreInspectAuditMenu_() {
  SpreadsheetApp.getUi()
    .createMenu('Pre-Inspection Audit')
    .addItem('Preview notification email for selected row', 'previewPreInspectNotificationEmailForSelectedRow')
    .addSeparator()
    .addItem('Reorganize safe calendar titles now', 'runPreInspectCalendarReorganization')
    .addItem('Refresh calendar audit', 'refreshPreInspectCalendarAudit')
    .addToUi();
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

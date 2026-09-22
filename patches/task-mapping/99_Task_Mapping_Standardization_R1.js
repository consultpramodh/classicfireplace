/*
 * FILE: 99_Task_Mapping_Standardization_R1.js
 * RELEASE: TASK_MAPPING_STANDARDIZATION_R1_3_PREINSPECT_AUDIT_20260922
 *
 * Shared presentation + Calendar-link contract for:
 * Install, Delivery, Service, PreInspection.
 *
 * No Striven API calls are made here.
 * Calendar writes are performed only by explicit link-pipeline entrypoints.
 */

const TM_STD_R1_VERSION = 'TASK_MAPPING_STANDARDIZATION_R1_3_PREINSPECT_AUDIT_20260922';

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
    calendarWritesPerformed: false,
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

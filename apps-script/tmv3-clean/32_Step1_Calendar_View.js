const TMV3_STEP1_VISIBLE_COLUMN_COUNT = 11;

const TMV3_STEP1_HEADERS = Object.freeze([
  'Calendar Event',
  'Calendar Customer',
  'Description',
  'Created / Guests',
  'Data Checklist',
  'Task Customer / IDs',
  'Task Details',
  'Task Schedule',
  'Task Status',
  'Mapping Status',
  'Issue / Next Action',
  'Vertical',
  'Source Calendar',
  'Calendar Role',
  'Event ID',
  'Calendar Start',
  'Calendar End',
  'Calendar Location',
  'Creator',
  'Guests',
  'Customer # (Calendar)',
  'Customer Name (Calendar)',
  'Phone (Calendar)',
  'Order / Work Order (Calendar)',
  'Existing Task Link',
  'Existing Order Link',
  'Calendar Event Link',
  'Raw Description',
  'Calendar Updated',
  'Fingerprint',
  'Source Count'
]);

function tmv3_executionStage_() {
  return Number(
    typeof TMV3_EXECUTION_STAGE !== 'undefined'
      ? TMV3_EXECUTION_STAGE
      : 1
  );
}

function tmv3_step1CalendarRun(reason) {
  tmv3_assertShadow_();

  const access = tmv3_step1CalendarDiagnostics_();
  const records = tmv3_step1CalendarRecords_();
  const write = tmv3_step1WriteOperatorViews_(records);
  const verify = tmv3_step1VerifyOperatorViews_(records);

  const pass = access.blocked === 0 && verify.pass === true;

  const result = {
    version: TMV3.VERSION,
    executionStage: tmv3_executionStage_(),
    stage: 1,
    status: pass ? 'PASS' : 'REVIEW',
    mode: 'ONE_WAY_GOOGLE_CALENDAR_TO_V3_SHEETS',
    reason: tmv3_clean_(reason || 'MANUAL'),
    calendarWritesPerformed: false,
    strivenReadsPerformed: false,
    strivenWritesPerformed: false,
    calendars: access,
    logicalEvents: records.length,
    counts: tmv3_step1Counts_(records),
    write: write,
    readBack: verify
  };

  tmv3_audit_(
    'SYSTEM','','','STEP1_CALENDAR_INTAKE',
    pass ? 'PASS' : 'REVIEW',
    JSON.stringify(result)
  );

  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

function tmv3_step1CalendarDiagnostics_() {
  const rows = [];
  let blocked = 0;

  Object.keys(TMV3.VERTICALS).forEach(function(vertical) {
    const cfg = TMV3.VERTICALS[vertical];

    tmv3_verticalCalendars_(vertical, cfg).forEach(function(calCfg) {
      const cal = CalendarApp.getCalendarById(calCfg.calendarId);
      const accessible = !!cal;
      if (!accessible) blocked++;

      rows.push({
        vertical: vertical,
        calendarId: calCfg.calendarId,
        role: calCfg.role || '',
        technician: calCfg.technician || '',
        accessible: accessible,
        name: accessible
          ? tmv3_safeCalendar_(function() { return cal.getName(); }, '')
          : ''
      });
    });
  });

  return {
    expected: rows.length,
    accessible: rows.length - blocked,
    blocked: blocked,
    calendars: rows
  };
}

function tmv3_step1WriteOperatorViews_(records) {
  const written = {};

  Object.keys(TMV3.VERTICALS).forEach(function(vertical) {
    const verticalRecords = (records || [])
      .filter(function(record) { return record.vertical === vertical; })
      .sort(function(a, b) {
        const aTime = a.start instanceof Date ? a.start.getTime() : 0;
        const bTime = b.start instanceof Date ? b.start.getTime() : 0;
        if (aTime !== bTime) return aTime - bTime;

        if (vertical === 'Service') {
          const techCompare = tmv3_clean_(a.technician)
            .localeCompare(tmv3_clean_(b.technician));
          if (techCompare !== 0) return techCompare;
        }

        return tmv3_clean_(a.title).localeCompare(tmv3_clean_(b.title));
      });

    const rows = verticalRecords.map(tmv3_step1OperatorRow_);
    const sheetName = TMV3.VERTICALS[vertical].sheet;
    const priorLastRow = tmv3_sheet_(sheetName).getLastRow();

    tmv3_replaceRows_(sheetName, TMV3_STEP1_HEADERS.slice(), rows);
    tmv3_step1FormatOperatorView_(
      sheetName,
      vertical,
      verticalRecords,
      priorLastRow
    );
    written[vertical] = rows.length;
  });

  return written;
}

function tmv3_step1OperatorRow_(record) {
  return [
    tmv3_step1EventDetails_(record),
    tmv3_step1CalendarCustomerDetails_(record),
    record.descriptionClean || '',
    tmv3_step1People_(record),
    tmv3_step1CalendarChecklist_(record),
    'NOT RUN — STEP 1',
    'NOT RUN — STEP 1',
    'NOT RUN — STEP 1',
    'NOT RUN — STEP 1',
    'STEP 1 — CALENDAR INTAKE',
    'Calendar captured. Customer / task / Striven resolution intentionally not run.',
    record.vertical || '',
    tmv3_step1SourceLabel_(record),
    (record.sourceCalendarRoles || [record.calendarRole]).filter(Boolean).join(' + '),
    record.eventId || '',
    record.start ? tmv3_iso_(record.start) : '',
    record.end ? tmv3_iso_(record.end) : '',
    record.location || '',
    record.creator || '',
    record.guests || '',
    record.customerNumber || '',
    record.calendarCustomerName || '',
    record.phone || '',
    record.orderNumber || '',
    record.existingTaskUrl || '',
    record.existingOrderUrl || '',
    record.eventUrl || '',
    record.rawDescription || '',
    record.calendarUpdatedAt || '',
    record.fingerprint || '',
    Number(record.duplicateSourceCount || 1)
  ];
}

function tmv3_step1EventDetails_(record) {
  const lines = [];
  lines.push(record.title || '(Untitled Calendar event)');

  if (record.start) {
    const date = tmv3_date_(record.start);
    const start = record.isAllDay ? 'All day' : tmv3_time_(record.start);
    const end = record.isAllDay || !record.end ? '' : tmv3_time_(record.end);

    lines.push(
      date +
      (start ? ' · ' + start : '') +
      (end ? '–' + end : '')
    );
  }

  if (record.location) lines.push('Location: ' + record.location);
  lines.push('Source: ' + tmv3_step1SourceLabel_(record));
  lines.push('Event ID: ' + (record.eventId || '—'));

  return lines.join('\n');
}

function tmv3_step1CalendarCustomerDetails_(record) {
  return [
    'Customer #: ' + (record.customerNumber || '—'),
    'Name: ' + (record.calendarCustomerName || '—'),
    'Phone: ' + tmv3_step1FormatPhone_(record.phone),
    (record.vertical === 'Service' ? 'Work Order / SO #: ' : 'SO #: ') +
      (record.orderNumber || '—')
  ].join('\n');
}

function tmv3_step1People_(record) {
  const creators = (record.sourceCreators || []).filter(Boolean).join(', ') ||
    record.creator || '—';
  const guests = (record.sourceGuests || []).filter(Boolean).join(', ') ||
    record.guests || '—';

  return [
    'Created by: ' + creators,
    'Guests: ' + guests
  ].join('\n');
}

function tmv3_step1CalendarChecklist_(record) {
  const lines = [];

  lines.push(record.eventId ? '✅ Event ID' : '❌ Event ID');
  lines.push(record.title ? '✅ Title' : '❌ Title');
  lines.push(record.start ? '✅ Date / Time' : '❌ Date / Time');
  lines.push(record.location ? '✅ Location' : '⚪ Location');
  lines.push(record.descriptionClean ? '✅ Description' : '⚪ Description');
  lines.push(record.creator ? '✅ Creator' : '⚪ Creator');
  lines.push(record.guests ? '✅ Guests' : '⚪ Guests');

  if (record.vertical === 'PreInspection') {
    lines.push(record.customerNumber ? '✅ Customer #' : '⚪ Customer #');
    lines.push(record.phone ? '✅ Phone' : '⚪ Phone');
    lines.push(record.orderNumber ? '✅ SO #' : '⚪ SO #');
  } else if (record.vertical === 'Service') {
    lines.push(record.orderNumber ? '✅ Work Order / SO #' : '⚪ Work Order / SO #');
  } else {
    lines.push(record.orderNumber ? '✅ SO #' : '⚪ SO #');
  }

  if (record.existingTaskUrl) lines.push('✅ Existing Task Link');
  if (record.existingOrderUrl) lines.push('✅ Existing Order Link');

  return lines.join('\n');
}

function tmv3_step1SourceLabel_(record) {
  const names = tmv3_unique_((record.sourceCalendarNames || []).filter(Boolean));

  if (record.vertical === 'Service' && record.technician) {
    return record.technician + (names.length ? ' · ' + names.join(' + ') : '');
  }

  return names.length
    ? names.join(' + ')
    : (record.calendarName || record.calendarId || '');
}

function tmv3_step1FormatPhone_(value) {
  const digits = String(value || '').replace(/\D/g, '');
  const phone = digits.length === 11 && digits.charAt(0) === '1'
    ? digits.slice(1)
    : digits;

  return phone.length === 10
    ? '(' + phone.slice(0,3) + ') ' + phone.slice(3,6) + '-' + phone.slice(6)
    : (tmv3_clean_(value) || '—');
}

function tmv3_step1FormatOperatorView_(sheetName, vertical, records, priorLastRow) {
  const sh = tmv3_sheet_(sheetName);
  const visible = TMV3_STEP1_VISIBLE_COLUMN_COUNT;
  const maxColumns = sh.getMaxColumns();
  const lastRow = sh.getLastRow();
  const clearThroughRow = Math.max(
    Number(lastRow || 0),
    Number(priorLastRow || 0)
  );

  sh.showColumns(1, Math.min(visible, maxColumns));

  if (maxColumns > visible) {
    sh.hideColumns(visible + 1, maxColumns - visible);
  }

  const widths = [330,220,330,260,190,190,240,180,120,170,320];

  widths.forEach(function(width, index) {
    if (index + 1 <= maxColumns) sh.setColumnWidth(index + 1, width);
  });

  sh.setFrozenRows(1);
  sh.setFrozenColumns(1);

  // Visual grouping kept intentionally light:
  // Calendar A:E, Task F:I, decision J:K.
  if (maxColumns >= 5) {
    sh.getRange(1, 1, 1, 5)
      .setBackground('#EAF3FF')
      .setFontColor('#1F2937')
      .setFontWeight('bold');
  }

  if (maxColumns >= 9) {
    sh.getRange(1, 6, 1, 4)
      .setBackground('#EDF7EE')
      .setFontColor('#1F2937')
      .setFontWeight('bold');
  }

  if (maxColumns >= 11) {
    sh.getRange(1, 10, 1, 2)
      .setBackground('#F3F4F6')
      .setFontColor('#1F2937')
      .setFontWeight('bold');
  }

  if (clearThroughRow >= 2) {
    sh.getRange(2, 1, clearThroughRow - 1, visible)
      .setBackground('#FFFFFF');
  }

  if (lastRow >= 2) {
    if (vertical === 'Service' && records && records.length) {
      const techColors = {
        chris: '#EEF7FF',
        travis: '#F0FAF3',
        matt: '#FFF7ED',
        matthew: '#FFF7ED'
      };

      const backgrounds = records.map(function(record) {
        const tech = String(record.technician || '').trim().toLowerCase();
        const color = techColors[tech] || '#FFFFFF';
        return new Array(visible).fill(color);
      });

      sh.getRange(2, 1, backgrounds.length, visible)
        .setBackgrounds(backgrounds);
    }
  }

  if (lastRow >= 1) {
    sh.getRange(1, 1, lastRow, Math.min(visible, maxColumns))
      .setWrap(true)
      .setVerticalAlignment('top');
  }
}

function tmv3_step1VerifyOperatorViews_(records) {
  const expected = tmv3_step1Counts_(records);
  const actual = {};
  let pass = true;

  Object.keys(TMV3.VERTICALS).forEach(function(vertical) {
    const sh = tmv3_sheet_(TMV3.VERTICALS[vertical].sheet);
    const rows = Math.max(0, sh.getLastRow() - 1);
    actual[vertical] = rows;
    if (rows !== Number(expected[vertical] || 0)) pass = false;
  });

  return {
    pass: pass,
    expectedRows: expected,
    actualRows: actual
  };
}

function tmv3_step1Counts_(records) {
  const counts = { Install:0, Delivery:0, Service:0, PreInspection:0 };

  (records || []).forEach(function(record) {
    if (counts[record.vertical] !== undefined) counts[record.vertical]++;
  });

  return counts;
}

function tmv3_step1CalendarIds_() {
  const ids = [];

  Object.keys(TMV3.VERTICALS).forEach(function(vertical) {
    tmv3_verticalCalendars_(vertical, TMV3.VERTICALS[vertical])
      .forEach(function(calCfg) {
        if (calCfg.calendarId) ids.push(calCfg.calendarId);
      });
  });

  return tmv3_unique_(ids);
}

function tmv3_installStep1CalendarLiveSync() {
  const handler = 'tmv3_calendarEventUpdated';
  const expected = tmv3_step1CalendarIds_();

  // Stage-1 trigger upgrade rule:
  // remove all V3 managed triggers first so an older version-pinned trigger
  // cannot repopulate the four operator sheets with stale logic.
  const managed = typeof tmv3_managedTriggerHandlers_ === 'function'
    ? tmv3_managedTriggerHandlers_()
    : [handler];

  const removed = [];
  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    if (managed.indexOf(trigger.getHandlerFunction()) === -1) return;

    removed.push({
      handler: trigger.getHandlerFunction(),
      source: String(trigger.getTriggerSource()),
      sourceId: tmv3_safeCalendar_(function() {
        return trigger.getTriggerSourceId();
      }, '')
    });

    ScriptApp.deleteTrigger(trigger);
  });

  const created = [];

  expected.forEach(function(calendarId) {
    ScriptApp.newTrigger(handler)
      .forUserCalendar(calendarId)
      .onEventUpdated()
      .create();

    created.push(calendarId);
  });

  const fallbackTrigger = ScriptApp.newTrigger('tmv3_calendarReconciliationFallback')
    .timeBased()
    .everyHours(2)
    .create();

  const initial =
    typeof tmv3_calendarStageRefresh_ === 'function'
      ? tmv3_calendarStageRefresh_('LIVE_SYNC_INSTALL_REFRESHED')
      : tmv3_step1CalendarRun('LIVE_SYNC_INSTALL_REFRESHED');

  const result = {
    status: initial.status === 'PASS' ? 'INSTALLED' : 'INSTALLED_WITH_REVIEW',
    mode: 'ONE_WAY_CALENDAR_TO_V3_SHEETS',
    executionStage: tmv3_executionStage_(),
    handler: handler,
    calendarsExpected: expected.length,
    removedManagedTriggers: removed,
    createdCalendarTriggers: created,
    reconciliationFallbackCreated: !!fallbackTrigger,
    calendarWritesPerformed: false,
    initialSync: initial,
    triggerStatus: tmv3_step1CalendarLiveSyncStatus()
  };

  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

function tmv3_step1CalendarLiveSyncStatus() {
  const handler = 'tmv3_calendarEventUpdated';
  const expected = tmv3_step1CalendarIds_();

  const active = ScriptApp.getProjectTriggers()
    .filter(function(trigger) {
      return trigger.getHandlerFunction() === handler &&
        String(trigger.getTriggerSource()) === String(ScriptApp.TriggerSource.CALENDAR);
    })
    .map(function(trigger) {
      return tmv3_safeCalendar_(function() {
        return trigger.getTriggerSourceId();
      }, '');
    })
    .filter(Boolean);

  const missing = expected.filter(function(id) {
    return active.indexOf(id) === -1;
  });

  const fallbackCount = ScriptApp.getProjectTriggers().filter(function(trigger) {
    return trigger.getHandlerFunction() === 'tmv3_calendarReconciliationFallback';
  }).length;

  return {
    handler: handler,
    expectedCalendarIds: expected,
    activeCalendarIds: tmv3_unique_(active),
    missingCalendarIds: missing,
    reconciliationFallbackCount: fallbackCount,
    complete: missing.length === 0 && fallbackCount === 1
  };
}

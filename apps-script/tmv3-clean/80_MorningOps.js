/************************************************************
 * TM V3 — MORNING OPERATIONS CONSOLE
 *
 * Purpose:
 * Answer, in one place:
 *   1) Is the system working?
 *   2) What needs attention?
 *   3) What should the operator do next?
 *
 * This module writes only to the V3 workbook. It never mutates
 * Striven or Google Calendar.
 ************************************************************/

function tmv3_refreshMorningOps() {
  const sh = tmv3_sheet_(TMV3.SHEETS.MORNING);
  const verticals = ['Install','Delivery','Service','PreInspection'];
  const today = new Date();
  const todayKey = Utilities.formatDate(today, TMV3_TIMEZONE, 'yyyy-MM-dd');
  const scheduleByTime = {};
  const attentionRows = [];
  const summaries = [];
  let totalAppointments = 0;
  let totalMapped = 0;
  let totalAttention = 0;
  let totalNoTask = 0;

  function customerName_(row) {
    const calendarCustomer = tmv3_clean_(row['Calendar Customer']);
    const nameMatch = calendarCustomer.match(/(?:^|\n)Name:\s*([^\n]+)/i);
    return (
      (nameMatch && tmv3_clean_(nameMatch[1])) ||
      tmv3_clean_(row['Calendar Event']).split('\n')[0] ||
      '(unnamed event)'
    );
  }

  function taskLabel_(row) {
    const taskText = tmv3_clean_(row['Task']);
    const taskMatch = taskText.match(/Task\s*#?\s*(\d+)/i);
    if (taskMatch) return '#' + taskMatch[1];
    if (!taskText || /^NOT RUN/i.test(taskText)) return 'NO TASK';
    return taskText.split('\n')[0];
  }

  function rowNeedsAttention_(row) {
    const mapping = tmv3_clean_(row['Mapping Status']).toUpperCase();
    const evidence = tmv3_clean_(row['Task Customer / IDs (Evidence)']);
    return /NOT_RUN|REVIEW|BLOCKED/.test(mapping) || /CREATE REQUIRED/i.test(evidence);
  }

  verticals.forEach(function(vertical) {
    const rows = tmv3_rows_(TMV3.VERTICALS[vertical].sheet).filter(function(row) {
      const d = tmv3_parseDateTime_(row['Calendar Start']);
      return d && Utilities.formatDate(d, TMV3_TIMEZONE, 'yyyy-MM-dd') === todayKey;
    });

    const unique = {};
    let mapped = 0;
    let attention = 0;

    rows.forEach(function(row) {
      const eventId = tmv3_clean_(row['Event ID']);
      if (eventId && unique[eventId]) return;
      if (eventId) unique[eventId] = true;

      const start = tmv3_parseDateTime_(row['Calendar Start']);
      const timeKey = start ? Utilities.formatDate(start, TMV3_TIMEZONE, 'HH:mm') : '99:99';
      const timeLabel = start ? Utilities.formatDate(start, TMV3_TIMEZONE, 'h:mm a') : 'Unscheduled';
      const customer = customerName_(row);
      const task = taskLabel_(row);
      const needsAttention = rowNeedsAttention_(row);
      const hasTask = task !== 'NO TASK';

      if (!scheduleByTime[timeKey]) {
        scheduleByTime[timeKey] = {
          label: timeLabel,
          Install: [],
          Delivery: [],
          Service: [],
          PreInspection: [],
          flags: []
        };
      }

      const taskUrl = tmv3_clean_(row['Existing Task Link']);
      const calendarUrl = tmv3_clean_(row['Calendar Event Link']);
      const linkUrl = taskUrl || calendarUrl;
      const evidence = tmv3_clean_(row['Task Customer / IDs (Evidence)']);
      const issue = tmv3_clean_(row['Issue / Next Action']);
      const locationReview = /CREATE REQUIRED/i.test(evidence);
      const reviewNote = needsAttention
        ? [
            'REVIEW NEEDED',
            '',
            taskUrl ? ('Task: ' + task) : 'No Striven Task exists yet.',
            'Issue: ' + (
              locationReview
                ? 'Customer-owned Location is unresolved.'
                : (issue || 'Appointment requires review.')
            ),
            '',
            'Next action: ' + (
              locationReview
                ? 'Verify the correct customer-owned Location before any relationship write.'
                : (issue || 'Review and correct the source appointment, then rerun V3.')
            )
          ].join('\n')
        : '';

      scheduleByTime[timeKey][vertical].push({
        display: customer + (task ? '\n' + task : ''),
        url: linkUrl,
        note: reviewNote
      });

      if (needsAttention) {
        scheduleByTime[timeKey].flags.push('ATTENTION');
        attention++;

        attentionRows.push({
          values: [
            locationReview ? 'CHECK' : 'ATTENTION',
            timeLabel,
            vertical,
            customer,
            locationReview
              ? 'Customer-owned Location unresolved'
              : (issue || 'Appointment requires attention'),
            locationReview
              ? 'Verify Location before any relationship write'
              : (issue || 'Review appointment')
          ],
          url: linkUrl,
          note: reviewNote,
          taskUrl: taskUrl,
          calendarUrl: calendarUrl,
          eventId: eventId
        });
      }

      if (hasTask) mapped++;
      else totalNoTask++;
    });

    const appointments = Object.keys(unique).length;
    totalAppointments += appointments;
    totalMapped += mapped;
    totalAttention += attention;

    summaries.push({
      vertical: vertical,
      appointments: appointments,
      mapped: mapped,
      attention: attention
    });
  });

  const values = [];
  values.push(['MORNING OPS — TODAY','','','','','']);
  values.push([
    Utilities.formatDate(today, TMV3_TIMEZONE, 'EEEE, MMMM d, yyyy'),
    '','','','',TMV3.MODE
  ]);
  values.push([]);
  values.push(['TODAY',totalAppointments,'MAPPED',totalMapped,'ATTENTION',totalAttention]);
  values.push(['NO TASK',totalNoTask,'INSTALL',(summaries[0] || {}).appointments || 0,'DELIVERY',(summaries[1] || {}).appointments || 0]);
  values.push(['SERVICE',(summaries[2] || {}).appointments || 0,'PREINSPECTION',(summaries[3] || {}).appointments || 0,'','']);
  values.push([]);
  values.push(["TODAY'S SCHEDULE",'','','','','']);
  values.push(['Time','Install','Delivery','Service','PreInspection','Flag']);

  Object.keys(scheduleByTime).sort().forEach(function(timeKey) {
    const slot = scheduleByTime[timeKey];
    values.push([
      slot.label,
      slot.Install.map(function(x){ return x.display; }).join('\n\n'),
      slot.Delivery.map(function(x){ return x.display; }).join('\n\n'),
      slot.Service.map(function(x){ return x.display; }).join('\n\n'),
      slot.PreInspection.map(function(x){ return x.display; }).join('\n\n'),
      slot.flags.length ? 'ATTENTION' : ''
    ]);
  });

  values.push([]);
  values.push(['NEEDS ATTENTION','','','','','']);
  values.push(['Priority','Time','Vertical','Customer / Event','Issue','Next Action']);

  if (!attentionRows.length) {
    values.push(['OK','','','','No attention items for today.','']);
  } else {
    attentionRows.forEach(function(item) {
      values.push(item.values.slice(0,6));
    });
  }

  // Full-grid reset: Morning Ops must never retain stale rows/columns from an older layout.
  sh.getRange(1,1,sh.getMaxRows(),sh.getMaxColumns())
    .breakApart()
    .clearContent()
    .clearFormat();

  if (sh.getMaxColumns() < 7) {
    sh.insertColumnsAfter(sh.getMaxColumns(), 7 - sh.getMaxColumns());
  }
  if (sh.getMaxRows() < values.length) {
    sh.insertRowsAfter(sh.getMaxRows(), values.length - sh.getMaxRows());
  }

  sh.getRange(1,1,values.length,6).setValues(values);

  // Visual snapshot layout.
  sh.setHiddenGridlines(true);
  sh.setFrozenRows(2);
  sh.showColumns(1,6);
  if (sh.getMaxColumns() > 6) {
    sh.hideColumns(7,sh.getMaxColumns() - 6);
  }

  sh.getRange(1,1,1,6).merge()
    .setBackground('#1f1f1f')
    .setFontColor('#ffffff')
    .setFontWeight('bold')
    .setFontSize(16)
    .setHorizontalAlignment('left')
    .setVerticalAlignment('middle');

  sh.getRange(2,1,1,5).merge()
    .setBackground('#1f1f1f')
    .setFontColor('#e6e6e6')
    .setFontWeight('bold');
  sh.getRange(2,6)
    .setBackground('#1f1f1f')
    .setFontColor('#e6e6e6')
    .setFontWeight('bold')
    .setHorizontalAlignment('right');

  const sectionRows = [8, values.findIndex(function(r){ return r[0] === 'NEEDS ATTENTION'; }) + 1]
    .filter(function(r){ return r > 0; });
  sectionRows.forEach(function(rowNum) {
    sh.getRange(rowNum,1,1,6).merge()
      .setBackground('#e9edf2')
      .setFontWeight('bold')
      .setFontSize(11);
  });

  // KPI blocks.
  sh.getRange(4,1,1,2).setBackground('#dceeff');
  sh.getRange(4,3,1,2).setBackground('#def3e4');
  sh.getRange(4,5,1,2).setBackground('#ffe5bd');
  sh.getRange(5,1,1,2).setBackground(totalNoTask ? '#ffd9d9' : '#def3e4');
  sh.getRange(5,3,2,4).setBackground('#f3f4f6');
  sh.getRange(4,1,3,6)
    .setFontWeight('bold')
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle')
    .setWrap(true);

  const scheduleHeaderRow = 9;
  sh.getRange(scheduleHeaderRow,1,1,6)
    .setBackground('#2f3742')
    .setFontColor('#ffffff')
    .setFontWeight('bold')
    .setHorizontalAlignment('center');

  const scheduleStart = 10;
  const scheduleEnd = scheduleStart + Object.keys(scheduleByTime).length - 1;
  if (scheduleEnd >= scheduleStart) {
    sh.getRange(scheduleStart,2,scheduleEnd-scheduleStart+1,1).setBackground('#e8f1ff');
    sh.getRange(scheduleStart,3,scheduleEnd-scheduleStart+1,1).setBackground('#eaf7ec');
    sh.getRange(scheduleStart,4,scheduleEnd-scheduleStart+1,1).setBackground('#f4ecff');
    sh.getRange(scheduleStart,5,scheduleEnd-scheduleStart+1,1).setBackground('#fff5dc');
    sh.getRange(scheduleStart,1,scheduleEnd-scheduleStart+1,6)
      .setVerticalAlignment('middle')
      .setWrap(true);

    for (let r = scheduleStart; r <= scheduleEnd; r++) {
      const flag = tmv3_clean_(sh.getRange(r,6).getValue());
      if (flag === 'ATTENTION') {
        sh.getRange(r,1,1,6).setFontWeight('bold');
        sh.getRange(r,6).setBackground('#ffd59a');
      }
    }
  }

  // Make the snapshot actionable: task cells link to Striven; no-task items link to Calendar.
  const verticalColumn = { Install: 2, Delivery: 3, Service: 4, PreInspection: 5 };
  Object.keys(scheduleByTime).sort().forEach(function(timeKey, slotIndex) {
    const slot = scheduleByTime[timeKey];
    const rowNum = scheduleStart + slotIndex;

    ['Install','Delivery','Service','PreInspection'].forEach(function(vertical) {
      const entries = slot[vertical] || [];
      if (!entries.length) return;

      const cell = sh.getRange(rowNum, verticalColumn[vertical]);
      const text = entries.map(function(x){ return x.display; }).join('\n\n');
      const builder = SpreadsheetApp.newRichTextValue().setText(text);
      let offset = 0;

      entries.forEach(function(entry, idx) {
        if (entry.url) {
          builder.setLinkUrl(offset, offset + entry.display.length, entry.url);
        }
        offset += entry.display.length + (idx < entries.length - 1 ? 2 : 0);
      });

      cell.setRichTextValue(builder.build());

      const notes = entries
        .map(function(x){ return x.note; })
        .filter(Boolean);
      if (notes.length) {
        cell.setNote(notes.join('\n\n--------------------\n\n'));
      } else {
        cell.setNote('');
      }
    });
  });

  const attentionTitleRow = sectionRows[1];
  const attentionHeaderRow = attentionTitleRow + 1;
  const attentionDataStart = attentionHeaderRow + 1;
  sh.getRange(attentionHeaderRow,1,1,6)
    .setBackground('#2f3742')
    .setFontColor('#ffffff')
    .setFontWeight('bold');

  for (let i = 0; i < Math.max(1, attentionRows.length); i++) {
    const rowNum = attentionDataStart + i;
    const priority = tmv3_clean_(sh.getRange(rowNum,1).getValue());
    sh.getRange(rowNum,1,1,6)
      .setBackground(priority === 'ATTENTION' ? '#ffe0c2' : '#fff2bf')
      .setWrap(true)
      .setVerticalAlignment('middle');
  }

  attentionRows.forEach(function(item, index) {
    const rowNum = attentionDataStart + index;
    const customerCell = sh.getRange(rowNum, 4);
    if (item.url) {
      customerCell.setRichTextValue(
        SpreadsheetApp.newRichTextValue()
          .setText(item.values[3])
          .setLinkUrl(item.url)
          .build()
      );
    }
    customerCell.setNote(item.note || '');
    sh.getRange(rowNum, 5).setNote(item.note || '');
  });

  [90,180,180,180,180,300].forEach(function(px,index) {
    sh.setColumnWidth(index + 1, px);
  });

  sh.setRowHeight(1, 30);
  sh.setRowHeight(2, 24);
  sh.autoResizeRows(3, Math.max(1, values.length - 2));

  return {
    status: 'TODAY_SNAPSHOT',
    date: todayKey,
    mode: TMV3.MODE,
    appointments: totalAppointments,
    mapped: totalMapped,
    attention: totalAttention,
    noTask: totalNoTask,
    verticals: summaries
  };
}

function tmv3_morningStateByEvent_(rows) {
  const out = {};

  (rows || []).forEach(function(row) {
    const key =
      tmv3_clean_(row['Vertical']) +
      '|' +
      tmv3_clean_(row['Event ID']);

    if (!out[key]) {
      out[key] = row;
      return;
    }

    const current = out[key];
    const currentDetected = tmv3_parseDate_(current['First Detected At']);
    const nextDetected = tmv3_parseDate_(row['First Detected At']);

    if (
      nextDetected &&
      (!currentDetected || nextDetected < currentDetected)
    ) {
      out[key] = row;
    }
  });

  return out;
}

function tmv3_morningExceptionRecord_(vertical, row, state) {
  const status = tmv3_clean_(row['Status']).toUpperCase();
  const verification = tmv3_clean_(row['Verification']);
  const issue = tmv3_clean_(row['Issue']);
  const errorCode = tmv3_clean_(state['Last Error Class'] || state['Error Code']);
  const eventId = tmv3_clean_(row['Event ID']);

  const needsAttention =
    ['MATCHED','IGNORED'].indexOf(status) === -1;

  let priority = 'INFO';
  let rank = 9;

  if (
    /failed|error|uncertain|readback|technical|exception/i.test(issue + ' ' + errorCode)
  ) {
    priority = 'RED';
    rank = 0;
  } else if (status === 'BLOCKED' || status === 'NOT MATCHED') {
    priority = 'ORANGE';
    rank = 1;
  } else if (status === 'REVIEW') {
    priority = 'ORANGE';
    rank = 2;
  } else if (status.indexOf('READY') === 0) {
    priority = 'YELLOW';
    rank = 3;
  } else if (status === 'CONFIRMED') {
    priority = 'YELLOW';
    rank = 4;
  }

  const ageMinutes = tmv3_minutesSince_(state['First Detected At']);
  const acknowledgedBy = tmv3_clean_(state['Acknowledged By']);
  const acknowledgedAt = tmv3_clean_(state['Acknowledged At']);

  return {
    needsAttention: needsAttention,
    priority: priority,
    rank: rank,
    vertical: vertical,
    date: tmv3_morningDateValue_(row['Date']),
    time: tmv3_morningTimeValue_(row['Time']),
    appointment: tmv3_clean_(row['Calendar Title']),
    customer: tmv3_clean_(row['Customer']),
    task: tmv3_clean_(row['Task']),
    data: tmv3_clean_(row['Data']),
    status: status,
    issue: issue || verification || 'Needs review.',
    ageMinutes: ageMinutes,
    attempts: Number(state['Attempt Count'] || 0),
    nextAction: tmv3_clean_(row['Action'] || row['Next Action']) || 'REVIEW',
    acknowledged:
      acknowledgedBy
        ? (
            acknowledgedBy +
            (acknowledgedAt ? ' · ' + tmv3_compactDateTime_(acknowledgedAt) : '')
          )
        : 'Not acknowledged',
    eventId: eventId,
    source: vertical,
    operatorRow: Number(row.__operatorRow || 0)
  };
}

function tmv3_morningDateValue_(value) {
  if (value instanceof Date && !isNaN(value.getTime())) {
    return tmv3_date_(value);
  }
  return tmv3_clean_(value);
}

function tmv3_morningTimeValue_(value) {
  if (value instanceof Date && !isNaN(value.getTime())) {
    return tmv3_time_(value);
  }
  return tmv3_clean_(value);
}

function tmv3_morningExceptionSort_(a, b) {
  // Technical failures always come first.
  if (a.rank === 0 || b.rank === 0) {
    if (a.rank !== b.rank) return a.rank - b.rank;
  }

  // Then prioritize the appointment that is operationally closest.
  const au = tmv3_morningUrgencyRank_(a.date);
  const bu = tmv3_morningUrgencyRank_(b.date);
  if (au !== bu) return au - bu;

  // Within the same urgency window, blocked/review outrank planned actions.
  if (a.rank !== b.rank) return a.rank - b.rank;

  const aa = a.ageMinutes === null ? -1 : a.ageMinutes;
  const bb = b.ageMinutes === null ? -1 : b.ageMinutes;
  if (aa !== bb) return bb - aa;

  return (
    (a.date + ' ' + a.time)
      .localeCompare(b.date + ' ' + b.time)
  );
}

function tmv3_morningUrgencyRank_(dateValue) {
  const text = tmv3_clean_(dateValue);
  const d = new Date(text + 'T00:00:00');
  if (isNaN(d.getTime())) return 9;

  const today = new Date();
  today.setHours(0,0,0,0);
  d.setHours(0,0,0,0);

  const days = Math.floor((d.getTime() - today.getTime()) / 86400000);

  if (days <= 0) return 0;
  if (days === 1) return 1;
  if (days <= 3) return 2;
  if (days <= 7) return 3;
  return 4;
}

function tmv3_lastSuccessfulRun_(auditRows) {
  let latest = null;

  (auditRows || []).forEach(function(row) {
    if (
      tmv3_clean_(row['Action']) !== 'SHADOW_RUN' ||
      tmv3_clean_(row['Result']).toUpperCase() !== 'PASS'
    ) {
      return;
    }

    const dt = tmv3_parseDate_(row['Timestamp']);
    if (dt && (!latest || dt > latest)) latest = dt;
  });

  return latest;
}

function tmv3_recentTechnicalFailures_(auditRows, hours) {
  const cutoff = new Date(Date.now() - Number(hours || 24) * 3600000);

  return (auditRows || []).filter(function(row) {
    const dt = tmv3_parseDate_(row['Timestamp']);
    if (!dt || dt < cutoff) return false;

    const result = tmv3_clean_(row['Result']).toUpperCase();
    const detail = tmv3_clean_(row['Detail']);

    return (
      ['FAIL','FAILED','ERROR','CREATE UNCERTAIN'].indexOf(result) !== -1 ||
      /readback failed|exception|technical failure|rollback failed/i.test(detail)
    );
  });
}

function tmv3_regressionHealth_() {
  const rows = tmv3_rows_('Regression');
  const counts = {
    agree: 0,
    intentional: 0,
    investigate: 0,
    notRun: 0,
    newEvents: 0,
    total: rows.length
  };

  rows.forEach(function(row) {
    const value = tmv3_clean_(row['Comparison']).toUpperCase();

    if (value === 'AGREE') counts.agree++;
    else if (value === 'INTENTIONAL IMPROVEMENT') counts.intentional++;
    else if (value === 'INVESTIGATE') counts.investigate++;
    else if (value === 'NEW V3 EVENT') counts.newEvents++;
    else counts.notRun++;
  });

  return counts;
}

function tmv3_triggerHealth_() {
  const installed = tmv3_listTriggers();
  const calendarTriggerCount =
    typeof tmv3_step1CalendarIds_ === 'function'
      ? tmv3_step1CalendarIds_().length
      : 0;

  const expectedCounts = {
    tmv3_dailySourceRefresh: 1,
    tmv3_scheduledOperations: 5,
    tmv3_refreshLinksSlot_0800: 1,
    tmv3_refreshLinksSlot_1000: 1,
    tmv3_refreshLinksSlot_1200: 1,
    tmv3_refreshLinksSlot_1400: 1,
    tmv3_refreshLinksSlot_1600: 1,
    tmv3_refreshLinksSlot_1800: 1,
    tmv3_installReminderCheck: 1,
    tmv3_calendarEventUpdated: calendarTriggerCount,
    tmv3_calendarReconciliationFallback: 1
  };

  const actualCounts = {};
  installed.forEach(function(t) {
    const handler = tmv3_clean_(t.handler);
    actualCounts[handler] = (actualCounts[handler] || 0) + 1;
  });

  const missing = [];
  const extra = [];

  Object.keys(expectedCounts).forEach(function(handler) {
    const expected = expectedCounts[handler];
    const actual = actualCounts[handler] || 0;
    if (actual < expected) {
      missing.push(handler + ' ' + actual + '/' + expected);
    } else if (actual > expected) {
      extra.push(handler + ' ' + actual + '/' + expected);
    }
  });

  return {
    installed: installed.length,
    missing: missing,
    duplicates: extra,
    enabled: Object.keys(actualCounts).some(function(handler) {
      return expectedCounts[handler] !== undefined;
    }),
    expectedCount: Object.keys(expectedCounts).reduce(function(total, handler) {
      return total + Number(expectedCounts[handler] || 0);
    }, 0),
    manualWritesEnabled: tmv3_operationWritesEnabled_('MANUAL'),
    automationWritesEnabled: tmv3_operationWritesEnabled_('AUTO')
  };
}

function tmv3_morningReadiness_(input) {
  const checks = [];

  checks.push({
    name: 'System heartbeat',
    status: input.lastRun ? 'PASS' : 'PENDING',
    meaning: input.lastRun
      ? 'Last successful V3 run ' + tmv3_ageLabel_(tmv3_minutesSince_(input.lastRun)) + ' ago.'
      : 'No independent V3 run has completed yet.'
  });

  checks.push({
    name: 'Calendar sources fresh',
    status: input.lastRun ? 'PASS' : 'PENDING',
    meaning: input.lastRun
      ? 'Calendar intake completed in the last successful V3 run.'
      : 'Waiting for first successful V3 Calendar intake.'
  });

  checks.push({
    name: 'Striven sources fresh',
    status:
      input.missingConfig.length
        ? 'ATTENTION'
        : (input.lastRun ? 'PASS' : 'PENDING'),
    meaning:
      input.missingConfig.length
        ? 'Missing configuration: ' + input.missingConfig.join(', ')
        : (
            input.lastRun
              ? 'Striven source refresh completed in the last successful V3 run.'
              : 'Configuration is present; waiting for first successful V3 run.'
          )
  });

  const triggerProblem =
    input.triggers.duplicates.length > 0 ||
    (
      input.triggers.enabled &&
      input.triggers.missing.length > 0
    );

  checks.push({
    name: 'Managed triggers healthy',
    status:
      TMV3.MODE === 'SHADOW_READ_ONLY' && !input.triggers.enabled
        ? 'PENDING'
        : (triggerProblem ? 'ATTENTION' : 'PASS'),
    meaning:
      TMV3.MODE === 'SHADOW_READ_ONLY' && !input.triggers.enabled
        ? 'Scheduled production automation is intentionally not enabled.'
        : (
            triggerProblem
              ? 'Missing/duplicate trigger(s): ' +
                input.triggers.missing.concat(input.triggers.duplicates).join(', ')
              : 'Expected managed triggers are installed once each.'
          )
  });

  checks.push({
    name: 'No failed writes',
    status:
      input.failures.length
        ? 'ATTENTION'
        : 'PASS',
    meaning:
      input.failures.length
        ? input.failures.length + ' technical failure(s) in the last 24 hours.'
        : (
            tmv3_writesEnabled_()
              ? 'No failed V3 mutations in the last 24 hours.'
              : 'External V3 writes remain disabled.'
          )
  });

  let overdue = 0;
  input.summaries.forEach(function(summary) {
    if (
      summary.oldestMinutes !== null &&
      summary.oldestMinutes > 10
    ) {
      overdue++;
    }
  });

  checks.push({
    name: 'No overdue exceptions',
    status:
      input.lastRun
        ? (overdue ? 'ATTENTION' : 'PASS')
        : 'UNKNOWN',
    meaning:
      input.lastRun
        ? (
            overdue
              ? overdue + ' vertical(s) have unresolved items older than the 10-minute operating SLO.'
              : 'No unresolved V3 exception is older than 10 minutes.'
          )
        : 'Age tracking begins with the first independent V3 run.'
  });

  checks.push({
    name: 'Regression safety gate',
    status:
      input.regression.investigate
        ? 'ATTENTION'
        : (
            input.regression.notRun
              ? 'PENDING'
              : 'PASS'
          ),
    meaning:
      input.regression.investigate
        ? input.regression.investigate + ' old-vs-V3 difference(s) need investigation.'
        : (
            input.regression.notRun
              ? input.regression.notRun + ' baseline row(s) have not been compared yet.'
              : 'No unexplained old-vs-V3 differences remain.'
          )
  });

  const attention = checks.filter(function(c) {
    return c.status === 'ATTENTION';
  }).length;

  const pending = checks.filter(function(c) {
    return c.status === 'PENDING' || c.status === 'UNKNOWN';
  }).length;

  let overallStatus = 'READY FOR OPERATIONS';
  if (attention) overallStatus = 'ATTENTION REQUIRED — ' + attention + ' CHECK(S)';
  else if (pending) overallStatus = 'NOT YET VERIFIED — ' + pending + ' CHECK(S) PENDING';

  return {
    overallStatus: overallStatus,
    checks: checks,
    passed: checks.filter(function(c) { return c.status === 'PASS'; }).length,
    total: checks.length
  };
}

function tmv3_writeMorningHeader_(sh, readiness, lastRun) {
  sh.getRange('A1').setValue('TASK MAPPING — MORNING OPERATIONS');
  sh.getRange('A3').setValue(readiness.overallStatus);
  sh.getRange('A4').setValue(
    TMV3.MODE +
    ' · ' +
    (
      lastRun
        ? 'Last verified ' + tmv3_compactDateTime_(lastRun)
        : 'No successful V3 run yet'
    )
  );
}

function tmv3_writeMorningWorkflowHealth_(sh, summaries) {
  const headers = [
    'Vertical','Appointments','Task rows','V3 verified',
    'Needs attention','Blocked','Morning status'
  ];

  sh.getRange(8, 1, 1, headers.length).setValues([headers]);

  const values = summaries.map(function(s) {
    return [
      s.vertical,
      s.appointments,
      s.taskRows,
      s.verified,
      s.needsAttention,
      s.blocked,
      s.status
    ];
  });

  sh.getRange(9, 1, 4, headers.length).clearContent();
  sh.getRange(9, 1, values.length, headers.length).setValues(values);
}

function tmv3_writeMorningExceptions_(sh, exceptions) {
  const headers = [
    'Status','Data','Date','Time','Customer','Task','Issue','Action',
    'Vertical','Event ID','Priority','Age','Attempts',
    'Acknowledged / Owner'
  ];

  const headerRow = 16;
  const firstRow = 17;
  const maxRows = 15;
  const visible = 8;

  sh.getRange(headerRow, 1, 1, headers.length).setValues([headers]);
  sh.getRange(firstRow, 1, maxRows, headers.length).clearContent();

  if (!exceptions.length) {
    sh.getRange(firstRow, 1, 1, visible).setValues([[
      'MATCHED',
      '✅ No operator action required',
      '',
      '',
      '',
      '',
      '',
      'NONE'
    ]]);
  } else {
    const values = exceptions.map(function(x) {
      return [
        x.status,
        x.data,
        x.date,
        x.time,
        x.customer,
        x.task,
        x.issue,
        x.nextAction,
        x.vertical,
        x.eventId,
        x.priority,
        x.ageMinutes === null ? 'Baseline' : tmv3_ageLabel_(x.ageMinutes),
        x.attempts || '',
        x.acknowledged
      ];
    });

    sh.getRange(firstRow, 1, values.length, headers.length).setValues(values);
  }

  const maxColumns = sh.getMaxColumns();
  sh.showColumns(1, Math.min(visible, maxColumns));
  if (maxColumns > visible) {
    sh.hideColumns(visible + 1, maxColumns - visible);
  }

  const widths = [110, 185, 95, 85, 180, 220, 320, 145];
  widths.forEach(function(width, index) {
    if (index + 1 <= maxColumns) sh.setColumnWidth(index + 1, width);
  });

  const visibleRows = Math.max(1, exceptions.length);
  sh.getRange(headerRow, 1, visibleRows + 1, visible)
    .setWrap(true)
    .setVerticalAlignment('middle');
  sh.getRange(headerRow, 1, 1, visible).setFontWeight('bold');
  sh.autoResizeRows(firstRow, visibleRows);

  if (sh.getMaxRows() >= 35) {
    sh.hideRows(35, sh.getMaxRows() - 34);
  }
}

function tmv3_writeMorningAutomation_(sh, input) {
  const regressionText =
    input.regression.investigate
      ? input.regression.investigate + ' INVESTIGATE'
      : (
          input.regression.notRun
            ? input.regression.notRun + ' NOT RUN'
            : (
                input.regression.agree +
                ' agree · ' +
                input.regression.intentional +
                ' intentional improvements'
              )
        );

  const triggerText =
    TMV3.MODE === 'SHADOW_READ_ONLY' && !input.triggers.enabled
      ? 'Not enabled in shadow'
      : (
          input.triggers.missing.length || input.triggers.duplicates.length
            ? 'Missing/duplicate managed triggers'
            : input.triggers.installed + ' installed'
        );

  const rows = [
    ['Check','Current state','What good looks like','Action'],
    ['V3 mode',TMV3.MODE,'Explicit safe mode','OK'],
    ['System heartbeat',
      input.lastRun ? tmv3_compactDateTime_(input.lastRun) : 'No successful run',
      'Recent successful end-to-end run',
      input.lastRun ? 'OK' : 'ATTENTION'
    ],
    ['Striven configuration',
      input.missingConfig.length ? 'Missing: ' + input.missingConfig.join(', ') : 'Complete',
      'All required capabilities present',
      input.missingConfig.length ? 'ATTENTION' : 'OK'
    ],
    ['Managed triggers',triggerText,'Expected = installed = recently ran',
      (
        TMV3.MODE === 'SHADOW_READ_ONLY' && !input.triggers.enabled
          ? 'PENDING'
          : (
              input.triggers.missing.length || input.triggers.duplicates.length
                ? 'ATTENTION'
                : 'OK'
            )
      )
    ],
    ['Regression',regressionText,'No unexplained differences',
      input.regression.investigate ? 'ATTENTION' : (input.regression.notRun ? 'PENDING' : 'OK')
    ],
    ['Technical failures',
      input.failures.length + ' in last 24h',
      '0',
      input.failures.length ? 'ATTENTION' : 'OK'
    ],
    ['Calendar link writeback',
      tmv3_writesEnabled_() ? 'Enabled with readback' : 'Writer ready · writes disabled',
      'Write + readback verified',
      tmv3_writesEnabled_() ? 'OK' : 'PENDING'
    ],
    ['Business writes',
      tmv3_writesEnabled_() ? 'Enabled' : 'Disabled',
      TMV3.MODE === 'SHADOW_READ_ONLY' ? 'Disabled' : 'Guarded',
      TMV3.MODE === 'SHADOW_READ_ONLY' ? 'OK' : 'CHECK'
    ]
  ];

  sh.getRange(35, 1, 9, 4).clearContent();
  sh.getRange(35, 1, rows.length, 4).setValues(rows);
}

function tmv3_writeMorningReadiness_(sh, readiness) {
  const rows = [['Check','Status','Meaning']].concat(
    readiness.checks.map(function(c) {
      return [c.name, c.status, c.meaning];
    })
  );

  sh.getRange(46, 1, 8, 3).clearContent();
  sh.getRange(46, 1, rows.length, 3).setValues(rows);
  sh.getRange('A45').setValue(
    'MORNING READINESS — ' + readiness.passed + '/' + readiness.total + ' PASSED'
  );
}

function tmv3_writeMorningSinceRun_(sh, stateRows, lastRun, summaries, failures) {
  let newAppointments = 0;
  let resolved = 0;
  let review = 0;
  let blocked = 0;
  let oldest = null;

  (stateRows || []).forEach(function(row) {
    const firstSeen = tmv3_parseDate_(row['First Seen At']);
    const resolvedAt = tmv3_parseDate_(row['Resolved At']);
    const status = tmv3_clean_(row['State']).toUpperCase();

    if (lastRun && firstSeen && firstSeen > lastRun) newAppointments++;
    if (lastRun && resolvedAt && resolvedAt > lastRun) resolved++;
    if (status === 'REVIEW') review++;
    if (status === 'BLOCKED' || status === 'NOT MATCHED') blocked++;

    const age = tmv3_minutesSince_(row['First Detected At']);
    if (age !== null) oldest = oldest === null ? age : Math.max(oldest, age);
  });

  const rows = [
    ['Metric','Value'],
    ['Last successful V3 run',lastRun ? tmv3_compactDateTime_(lastRun) : 'Not yet completed'],
    ['New appointments',lastRun ? newAppointments : 'Pending'],
    ['Automatically resolved',lastRun ? resolved : 'Pending'],
    ['Operator reviews',review],
    ['Blocked',blocked],
    ['Technical failures',failures.length],
    ['Oldest unresolved',oldest === null ? 'None / pending' : tmv3_ageLabel_(oldest)]
  ];

  sh.getRange(57, 1, 8, 2).clearContent();
  sh.getRange(57, 1, rows.length, 2).setValues(rows);
}

function tmv3_acknowledgeSelectedMorningOps() {
  const ss = tmv3_ss_();
  const sh = ss.getActiveSheet();

  if (sh.getName() !== TMV3.SHEETS.MORNING) {
    throw new Error('Select an exception row on Morning Ops first.');
  }

  const row = sh.getActiveRange().getRow();
  const vertical = tmv3_clean_(sh.getRange(row, 3).getValue());
  const customer = tmv3_clean_(sh.getRange(row, 4).getValue());

  if (!vertical || !customer) {
    throw new Error('Select a row in NEEDS ATTENTION.');
  }

  const sourceRows = tmv3_rows_(TMV3.VERTICALS[vertical].sheet);
  const todayKey = Utilities.formatDate(new Date(), TMV3_TIMEZONE, 'yyyy-MM-dd');
  const matches = sourceRows.filter(function(sourceRow) {
    const d = tmv3_parseDateTime_(sourceRow['Calendar Start']);
    const sameDay = d && Utilities.formatDate(d, TMV3_TIMEZONE, 'yyyy-MM-dd') === todayKey;
    const calendarCustomer = tmv3_clean_(sourceRow['Calendar Customer']);
    const nameMatch = calendarCustomer.match(/(?:^|\n)Name:\s*([^\n]+)/i);
    const sourceCustomer =
      (nameMatch && tmv3_clean_(nameMatch[1])) ||
      tmv3_clean_(sourceRow['Calendar Event']).split('\n')[0];
    return sameDay && sourceCustomer === customer;
  });

  if (matches.length !== 1) {
    throw new Error('Could not resolve this attention row to exactly one today event.');
  }

  const eventId = tmv3_clean_(matches[0]['Event ID']);

  if (!vertical || !eventId) {
    throw new Error('Selected row has no V3 Event identity.');
  }

  const ui = SpreadsheetApp.getUi();
  const prompt = ui.prompt(
    'Acknowledge exception',
    'Optional note for this appointment:',
    ui.ButtonSet.OK_CANCEL
  );

  if (prompt.getSelectedButton() !== ui.Button.OK) {
    return { status: 'CANCELLED' };
  }

  const activeEmail = tmv3_clean_(Session.getActiveUser().getEmail());
  const owner = activeEmail || 'Operator';
  const note = tmv3_clean_(prompt.getResponseText());
  const now = tmv3_now_();

  const stateSheet = tmv3_sheet_(TMV3.SHEETS.STATE);
  const values = stateSheet.getDataRange().getValues();
  const headers = values[0].map(tmv3_clean_);
  const ix = {};
  headers.forEach(function(h, i) { ix[h] = i; });

  let changed = 0;

  for (let i = 1; i < values.length; i++) {
    if (
      tmv3_clean_(values[i][ix['Vertical']]) === vertical &&
      tmv3_clean_(values[i][ix['Event ID']]) === eventId
    ) {
      values[i][ix['Acknowledged By']] = owner;
      values[i][ix['Acknowledged At']] = now;
      values[i][ix['Acknowledgement Note']] = note;
      changed++;
    }
  }

  if (!changed) {
    throw new Error('No durable V3 state row was found for the selected Event.');
  }

  stateSheet
    .getRange(1, 1, values.length, values[0].length)
    .setValues(values);

  tmv3_audit_(
    vertical,
    eventId,
    '',
    'ACKNOWLEDGE_EXCEPTION',
    'PASS',
    owner + (note ? ': ' + note : '')
  );

  tmv3_refreshMorningOps();

  return {
    status: 'ACKNOWLEDGED',
    vertical: vertical,
    eventId: eventId,
    owner: owner
  };
}

function tmv3_clearAcknowledgementSelectedMorningOps() {
  const ss = tmv3_ss_();
  const sh = ss.getActiveSheet();

  if (sh.getName() !== TMV3.SHEETS.MORNING) {
    throw new Error('Select an exception row on Morning Ops first.');
  }

  const row = sh.getActiveRange().getRow();
  const vertical = tmv3_clean_(sh.getRange(row, 3).getValue());
  const customer = tmv3_clean_(sh.getRange(row, 4).getValue());

  if (!vertical || !customer) {
    throw new Error('Select a row in NEEDS ATTENTION.');
  }

  const sourceRows = tmv3_rows_(TMV3.VERTICALS[vertical].sheet);
  const todayKey = Utilities.formatDate(new Date(), TMV3_TIMEZONE, 'yyyy-MM-dd');
  const matches = sourceRows.filter(function(sourceRow) {
    const d = tmv3_parseDateTime_(sourceRow['Calendar Start']);
    const sameDay = d && Utilities.formatDate(d, TMV3_TIMEZONE, 'yyyy-MM-dd') === todayKey;
    const calendarCustomer = tmv3_clean_(sourceRow['Calendar Customer']);
    const nameMatch = calendarCustomer.match(/(?:^|\n)Name:\s*([^\n]+)/i);
    const sourceCustomer =
      (nameMatch && tmv3_clean_(nameMatch[1])) ||
      tmv3_clean_(sourceRow['Calendar Event']).split('\n')[0];
    return sameDay && sourceCustomer === customer;
  });

  if (matches.length !== 1) {
    throw new Error('Could not resolve this attention row to exactly one today event.');
  }

  const eventId = tmv3_clean_(matches[0]['Event ID']);

  const stateSheet = tmv3_sheet_(TMV3.SHEETS.STATE);
  const values = stateSheet.getDataRange().getValues();
  const headers = values[0].map(tmv3_clean_);
  const ix = {};
  headers.forEach(function(h, i) { ix[h] = i; });

  let changed = 0;

  for (let i = 1; i < values.length; i++) {
    if (
      tmv3_clean_(values[i][ix['Vertical']]) === vertical &&
      tmv3_clean_(values[i][ix['Event ID']]) === eventId
    ) {
      values[i][ix['Acknowledged By']] = '';
      values[i][ix['Acknowledged At']] = '';
      values[i][ix['Acknowledgement Note']] = '';
      changed++;
    }
  }

  if (changed) {
    stateSheet
      .getRange(1, 1, values.length, values[0].length)
      .setValues(values);
  }

  tmv3_refreshMorningOps();

  return {
    status: changed ? 'CLEARED' : 'NOT_FOUND',
    vertical: vertical,
    eventId: eventId
  };
}

function tmv3_parseDate_(value) {
  if (!value) return null;
  if (value instanceof Date && !isNaN(value.getTime())) return value;

  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

function tmv3_minutesSince_(value) {
  const d = tmv3_parseDate_(value);
  if (!d) return null;

  return Math.max(
    0,
    Math.floor((Date.now() - d.getTime()) / 60000)
  );
}

function tmv3_ageLabel_(minutes) {
  if (minutes === null || minutes === undefined || isNaN(minutes)) return 'Unknown';

  const m = Math.max(0, Math.floor(Number(minutes)));
  if (m < 60) return m + 'm';

  const h = Math.floor(m / 60);
  const rem = m % 60;

  if (h < 24) return h + 'h ' + rem + 'm';

  const d = Math.floor(h / 24);
  const hr = h % 24;
  return d + 'd ' + hr + 'h';
}

function tmv3_compactDateTime_(value) {
  const d = tmv3_parseDate_(value);
  if (!d) return tmv3_clean_(value);

  return Utilities.formatDate(
    d,
    'America/Toronto',
    'MMM d, h:mm a'
  );
}


function tmv3_writeMorningPipeline_(sh, auditRows, lastRun) {
  const refresh = tmv3_latestAuditAction_(auditRows, 'REFRESH_SOURCES');
  const regression = tmv3_latestAuditAction_(auditRows, 'REGRESSION_COMPARE');

  const rows = [
    ['Stage','Last success','Freshness','Status'],
    [
      'Calendar read',
      lastRun ? tmv3_compactDateTime_(lastRun) : 'Not run',
      lastRun ? tmv3_ageLabel_(tmv3_minutesSince_(lastRun)) : 'Pending',
      lastRun ? 'PASS' : 'PENDING'
    ],
    [
      'Striven source refresh',
      refresh ? tmv3_compactDateTime_(refresh.date) : 'Not run',
      refresh ? tmv3_ageLabel_(tmv3_minutesSince_(refresh.date)) : 'Pending',
      refresh ? 'PASS' : 'PENDING'
    ],
    [
      'Mapping + identity resolution',
      lastRun ? tmv3_compactDateTime_(lastRun) : 'Not run',
      lastRun ? tmv3_ageLabel_(tmv3_minutesSince_(lastRun)) : 'Pending',
      lastRun ? 'PASS' : 'PENDING'
    ],
    [
      'Regression comparison',
      regression ? tmv3_compactDateTime_(regression.date) : 'Not run',
      regression ? tmv3_ageLabel_(tmv3_minutesSince_(regression.date)) : 'Pending',
      regression
        ? (tmv3_clean_(regression.row['Result']).toUpperCase() === 'PASS' ? 'PASS' : 'ATTENTION')
        : 'PENDING'
    ],
    [
      'Calendar link writeback',
      tmv3_writesEnabled_() ? 'Production/canary runs' : 'Disabled in shadow',
      tmv3_writesEnabled_() ? 'Guarded' : 'N/A',
      tmv3_writesEnabled_() ? 'CHECK' : 'SAFE'
    ]
  ];

  sh.getRange('A66').setValue('PIPELINE FRESHNESS');
  sh.getRange(67, 1, 6, 4).clearContent();
  sh.getRange(67, 1, rows.length, 4).setValues(rows);
}

function tmv3_latestAuditAction_(auditRows, action) {
  let latest = null;

  (auditRows || []).forEach(function(row) {
    if (tmv3_clean_(row['Action']) !== action) return;

    const d = tmv3_parseDate_(row['Timestamp']);
    if (!d) return;

    if (!latest || d > latest.date) {
      latest = {
        date: d,
        row: row
      };
    }
  });

  return latest;
}


function tmv3_operatorLinkFormula_(exceptionRecord) {
  const vertical = tmv3_clean_(exceptionRecord && exceptionRecord.vertical);
  const row = Number(exceptionRecord && exceptionRecord.operatorRow || 0);
  const label = tmv3_clean_(exceptionRecord && exceptionRecord.appointment) || 'Open record';

  if (!vertical || !row || !TMV3.VERTICALS[vertical]) {
    return label;
  }

  const sheet = tmv3_sheet_(TMV3.VERTICALS[vertical].sheet);
  const gid = sheet.getSheetId();
  const safeLabel = label.replace(/"/g, '""');

  return '=HYPERLINK("#gid=' + gid + '&range=A' + row + '","' + safeLabel + '")';
}

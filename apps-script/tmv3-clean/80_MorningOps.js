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
  const stateRows = tmv3_rows_(TMV3.SHEETS.STATE);
  const stateByEvent = tmv3_morningStateByEvent_(stateRows);
  const auditRows = tmv3_rows_(TMV3.SHEETS.AUDIT);
  const lastRun = tmv3_lastSuccessfulRun_(auditRows);
  const config = tmv3_configCapabilities_();
  const missingConfig = Object.keys(config).filter(function(key) {
    return !config[key].present;
  });

  const all = [];
  const summaries = [];

  verticals.forEach(function(vertical) {
    const rows = tmv3_rows_(TMV3.VERTICALS[vertical].sheet);
    const eventIds = {};
    let verified = 0;
    let needsAttention = 0;
    let blocked = 0;
    let oldestMinutes = null;

    rows.forEach(function(row) {
      const eventId = tmv3_clean_(row['Event ID']);
      if (eventId) eventIds[eventId] = true;

      const verification = tmv3_clean_(row['Verification']);
      const status = tmv3_clean_(row['Status']).toUpperCase();
      const isVerified =
        verification.indexOf('CALENDAR ↔ STRIVEN PASS') === 0 &&
        status === 'MATCHED';

      if (isVerified) verified++;

      const needs =
        ['MATCHED','IGNORED'].indexOf(status) === -1;

      if (needs) {
        needsAttention++;
        if (status === 'BLOCKED' || status === 'NOT MATCHED') blocked++;

        const state = stateByEvent[vertical + '|' + eventId] || {};
        const ageMinutes = tmv3_minutesSince_(state['First Detected At']);
        if (ageMinutes !== null) {
          oldestMinutes =
            oldestMinutes === null
              ? ageMinutes
              : Math.max(oldestMinutes, ageMinutes);
        }
      }

      const state = stateByEvent[vertical + '|' + eventId] || {};
      all.push(tmv3_morningExceptionRecord_(vertical, row, state));
    });

    const appointmentCount = Object.keys(eventIds).length || rows.length;

    summaries.push({
      vertical: vertical,
      appointments: appointmentCount,
      taskRows: rows.length,
      verified: verified,
      needsAttention: needsAttention,
      blocked: blocked,
      oldestMinutes: oldestMinutes,
      status:
        verified === appointmentCount &&
        needsAttention === 0 &&
        appointmentCount > 0
          ? 'HEALTHY'
          : (
              lastRun
                ? (blocked ? 'ATTENTION' : (needsAttention ? 'REVIEW' : 'CHECK'))
                : 'BASELINE'
            )
    });
  });

  const exceptions = all
    .filter(function(item) {
      return item.needsAttention;
    })
    .sort(tmv3_morningExceptionSort_)
    .slice(0, 15);

  const regression = tmv3_regressionHealth_();
  const failures = tmv3_recentTechnicalFailures_(auditRows, 24);
  const triggers = tmv3_triggerHealth_();
  const readiness = tmv3_morningReadiness_({
    lastRun: lastRun,
    missingConfig: missingConfig,
    regression: regression,
    failures: failures,
    triggers: triggers,
    summaries: summaries
  });

  tmv3_writeMorningHeader_(sh, readiness, lastRun);
  tmv3_writeMorningWorkflowHealth_(sh, summaries);
  tmv3_writeMorningExceptions_(sh, exceptions);
  tmv3_writeMorningAutomation_(sh, {
    lastRun: lastRun,
    missingConfig: missingConfig,
    regression: regression,
    failures: failures,
    triggers: triggers
  });
  tmv3_writeMorningReadiness_(sh, readiness);
  tmv3_writeMorningSinceRun_(sh, stateRows, lastRun, summaries, failures);

  return {
    status: readiness.overallStatus,
    mode: TMV3.MODE,
    lastSuccessfulRun: lastRun ? tmv3_iso_(lastRun) : null,
    missingConfig: missingConfig,
    regression: regression,
    failures24h: failures.length,
    exceptionsShown: exceptions.length,
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
    date: tmv3_clean_(row['Date']),
    time: tmv3_clean_(row['Time']),
    appointment: tmv3_clean_(row['Calendar Title']),
    customer: tmv3_clean_(row['Customer']),
    status: status,
    issue: issue || verification || 'Needs review.',
    ageMinutes: ageMinutes,
    attempts: Number(state['Attempt Count'] || 0),
    nextAction: tmv3_clean_(row['Next Action']) || 'REVIEW',
    acknowledged:
      acknowledgedBy
        ? (
            acknowledgedBy +
            (acknowledgedAt ? ' · ' + tmv3_compactDateTime_(acknowledgedAt) : '')
          )
        : 'Not acknowledged',
    eventId: eventId,
    source: vertical
  };
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
  const expected = [
    'tmv3_scheduledShadow',
    'tmv3_installReminderCheck'
  ];

  const handlers = installed.map(function(t) {
    return tmv3_clean_(t.handler);
  });

  const missing = expected.filter(function(handler) {
    return handlers.indexOf(handler) === -1;
  });

  const duplicates = expected.filter(function(handler) {
    return handlers.filter(function(x) { return x === handler; }).length > 1;
  });

  return {
    installed: installed.length,
    missing: missing,
    duplicates: duplicates,
    enabled:
      TMV3.MODE !== 'SHADOW_READ_ONLY' ||
      expected.some(function(x) { return handlers.indexOf(x) !== -1; })
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
  sh.getRange('I3').setValue(TMV3.MODE);
  sh.getRange('L3').setValue(
    lastRun
      ? 'Last verified ' + tmv3_compactDateTime_(lastRun)
      : 'No successful V3 run yet'
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
    'Priority','Vertical','Date','Time','Appointment','Customer',
    'Status','Problem','Age','Attempts','Next Action',
    'Acknowledged / Owner','Event ID','Source'
  ];

  sh.getRange(16, 1, 1, headers.length).setValues([headers]);
  sh.getRange(17, 1, 15, headers.length).clearContent();

  if (!exceptions.length) {
    sh.getRange(17, 1, 1, 12).setValues([[
      '','','','','No operator intervention required.','','','','','','',''
    ]]);
    return;
  }

  const values = exceptions.map(function(x) {
    return [
      x.priority,
      x.vertical,
      x.date,
      x.time,
      x.appointment,
      x.customer,
      x.status,
      x.issue,
      x.ageMinutes === null ? 'Baseline' : tmv3_ageLabel_(x.ageMinutes),
      x.attempts || '',
      x.nextAction,
      x.acknowledged,
      x.eventId,
      x.source
    ];
  });

  sh.getRange(17, 1, values.length, headers.length).setValues(values);
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
  if (row < 17 || row > 31) {
    throw new Error('Select one of the visible exception rows.');
  }

  const vertical = tmv3_clean_(sh.getRange(row, 2).getValue());
  const eventId = tmv3_clean_(sh.getRange(row, 13).getValue());

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
  if (row < 17 || row > 31) {
    throw new Error('Select one of the visible exception rows.');
  }

  const vertical = tmv3_clean_(sh.getRange(row, 2).getValue());
  const eventId = tmv3_clean_(sh.getRange(row, 13).getValue());

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

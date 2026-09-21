/************************************************************
 * 98_7_Systemic_Repair_R1.js
 *
 * PUBLIC FUNCTION:
 *   REPAIR_ALL_VERTICALS_SYSTEMIC_R1
 *
 * Systemic order:
 *   1. Refresh authoritative Calendar/report mirrors.
 *   2. Rebuild all four mappings and deterministic identity fields.
 *   3. Execute only safe READY relationship/date/assignment writes.
 *   4. Reconcile Service SO/Location/Contact relationships with fresh read-back.
 *   5. Run guarded task recovery for deterministic CREATE/RECREATE rows.
 *   6. Reconcile existing MATCHED PreInspection rows through guarded R2 E2E.
 *   7. Write/read-back Calendar links for all four verticals.
 *   8. Run the full rate-safe all-row verification.
 *
 * Never:
 * - guess an ID,
 * - overwrite a non-OPEN task through a write path,
 * - retry an uncertain Field 854 write blindly,
 * - force a PreInspection PM date/time write when the canonical contract
 *   does not prove it.
 ************************************************************/

const TM_SYSTEMIC_REPAIR_R1 = Object.freeze({
  VERSION: 'TM_SYSTEMIC_REPAIR_R1_20260921',
  STRIVEN_RATE_WINDOW_MS: 65000,
  STRIVEN_SOFT_CALL_BUDGET: 72,
  PREINSPECT_MAX_MATCHED_E2E: 25
});

function REPAIR_ALL_VERTICALS_SYSTEMIC_R1() {
  const started = new Date();
  const userLock = LockService.getUserLock();

  if (!userLock.tryLock(10000)) {
    throw new Error('Systemic repair is already running for this user.');
  }

  const report = {
    mode: 'SYSTEMIC_ALL_VERTICAL_REPAIR',
    version: TM_SYSTEMIC_REPAIR_R1.VERSION,
    status: 'RUNNING',
    startedAt: started.toISOString(),
    phases: [],
    finalVerification: null,
    finishedAt: '',
    runtimeSeconds: 0
  };

  try {
    tmSystemicPhase_(report, '1. REFRESH + REBUILD CANONICAL MAPPINGS', function() {
      return tmSystemicRefreshAndRebuildAll_();
    });

    tmSystemicPhase_(report, '2. INSTALL SAFE READY WRITES', function() {
      if (typeof pushSafeChangedInstallRows !== 'function') {
        return { status: 'SKIPPED_FUNCTION_MISSING' };
      }
      return pushSafeChangedInstallRows();
    });

    tmSystemicPhase_(report, '3. DELIVERY SAFE READY WRITES', function() {
      if (typeof fillDeliveryMappingIdsFromDeliveryApprovedOrdersFinal === 'function') {
        fillDeliveryMappingIdsFromDeliveryApprovedOrdersFinal();
      }
      if (typeof pushSafeChangedDeliveryRows !== 'function') {
        return { status: 'SKIPPED_FUNCTION_MISSING' };
      }
      return pushSafeChangedDeliveryRows();
    });

    // Reset the Striven minute window before the Service relationship pass.
    tmSystemicPauseRateWindow_('before Service relationship verification');

    tmSystemicPhase_(report, '4. SERVICE RELATIONSHIP RECONCILIATION', function() {
      return tmSystemicReconcileServiceRelationships_();
    });

    tmSystemicPhase_(report, '5. SERVICE DATE + ASSIGNMENT WRITES', function() {
      if (typeof pushSafeChangedServiceRows !== 'function') {
        return { status: 'SKIPPED_FUNCTION_MISSING' };
      }
      return pushSafeChangedServiceRows();
    });

    tmSystemicPhase_(report, '6. SAFE TASK RECOVERY', function() {
      const out = {};
      if (typeof taskRecoveryRunDivisionWorkflowSilent_ !== 'function') {
        return { status: 'SKIPPED_FUNCTION_MISSING' };
      }

      ['Install', 'Delivery', 'Service', 'PreInspect'].forEach(function(division) {
        try {
          out[division] = taskRecoveryRunDivisionWorkflowSilent_(division);
        } catch (err) {
          out[division] = {
            status: 'ERROR_CONTINUED',
            error: String(err && err.message ? err.message : err)
          };
        }
      });
      return out;
    });

    // PreInspection R2 uses several direct Striven reads/writes.
    tmSystemicPauseRateWindow_('before PreInspection matched-row reconciliation');

    tmSystemicPhase_(report, '7. PREINSPECTION MATCHED ROW RECONCILIATION', function() {
      return tmSystemicReconcileMatchedPreInspectRows_();
    });

    tmSystemicPhase_(report, '8. CALENDAR LINK WRITE-BACK — ALL FOUR VERTICALS', function() {
      const out = {};

      if (typeof tmR4_runAllCalendarLinkPipelines_ === 'function') {
        out.shared = tmR4_runAllCalendarLinkPipelines_(false);
      } else {
        out.shared = { status: 'SKIPPED_FUNCTION_MISSING' };
      }

      // Keep this explicit even though the shared R4 bulk is also patched
      // to include PreInspection. The helper is idempotent/read-back verified,
      // so a second invocation becomes SKIPPED_NO_CHANGE.
      out.preInspection = tmSystemicPushAllPreInspectCalendarLinks_();
      return out;
    });

    // The final verifier performs fresh Striven reads. Start it in a clean
    // rate window; its own reader also pauses between conservative waves.
    tmSystemicPauseRateWindow_('before final all-row verification');

    tmSystemicPhase_(report, '9. FULL 4-VERTICAL / ALL-ROW VERIFICATION', function() {
      if (typeof VERIFY_ALL_ROWS_ALL_VERTICALS !== 'function') {
        return { status: 'SKIPPED_FUNCTION_MISSING' };
      }
      const verified = VERIFY_ALL_ROWS_ALL_VERTICALS();
      report.finalVerification = verified;
      return {
        status: verified && verified.summary ? 'COMPLETE' : 'REVIEW',
        taskRead: verified ? verified.taskRead : null,
        summary: verified ? verified.summary : null,
        reportSheet: verified ? verified.reportSheet : ''
      };
    });

    report.status = report.phases.some(function(p) {
      return p.status === 'FAIL';
    }) ? 'COMPLETE_WITH_FAILURES' : 'COMPLETE';

    report.finishedAt = new Date().toISOString();
    report.runtimeSeconds = Math.round(
      (new Date().getTime() - started.getTime()) / 1000
    );

    Logger.log('============================================================');
    Logger.log('SYSTEMIC ALL-VERTICAL REPAIR: ' + report.status);
    Logger.log('============================================================');
    Logger.log(JSON.stringify({
      version: report.version,
      status: report.status,
      phases: report.phases.map(function(p) {
        return {
          name: p.name,
          status: p.status,
          runtimeSeconds: p.runtimeSeconds,
          error: p.error || ''
        };
      }),
      finalSummary:
        report.finalVerification && report.finalVerification.summary
          ? report.finalVerification.summary
          : null,
      runtimeSeconds: report.runtimeSeconds
    }, null, 2));

    return report;
  } finally {
    userLock.releaseLock();
  }
}

function tmSystemicPhase_(report, name, fn) {
  const started = new Date();
  const phase = {
    name: name,
    status: 'RUNNING',
    startedAt: started.toISOString(),
    result: null,
    error: ''
  };
  report.phases.push(phase);

  Logger.log('SYSTEMIC START: ' + name);

  try {
    phase.result = fn();
    phase.status = 'PASS';
    Logger.log('SYSTEMIC PASS: ' + name);
  } catch (err) {
    phase.status = 'FAIL';
    phase.error = String(err && err.message ? err.message : err);
    Logger.log('SYSTEMIC FAIL: ' + name + ' — ' + phase.error);
  }

  phase.finishedAt = new Date().toISOString();
  phase.runtimeSeconds = Math.round(
    (new Date().getTime() - started.getTime()) / 1000
  );

  return phase;
}

function tmSystemicRefreshAndRebuildAll_() {
  const out = {
    refresh: {},
    rebuild: {},
    preinspectLookupBatches: []
  };

  function callIf(name, fnName) {
    if (typeof globalThis[fnName] !== 'function') {
      out.refresh[name] = { status: 'FUNCTION_MISSING', functionName: fnName };
      return null;
    }
    const result = globalThis[fnName]();
    out.refresh[name] = result;
    return result;
  }

  callIf('installCalendar', 'syncInstallCalendarToSheet');
  callIf('approvedSalesOrders', 'syncApprovedSalesOrdersToSheet');
  callIf('installTasks', 'syncStrivenTasksToSheet');

  callIf('deliveryCalendar', 'syncDeliveriesCalendarToSheet');
  callIf('deliveryApprovedOrders', 'syncDeliveryApprovedOrdersToSheet');
  callIf('deliveryTasks', 'syncDeliveryTasksToSheet');

  callIf('serviceCalendar', 'syncServiceTechCalendarsToSheet');
  callIf('serviceWorkOrders', 'syncStrivenServiceWorkOrdersToSheet');
  callIf('serviceTasks', 'syncStrivenServiceTasksToSheet');

  callIf('preinspectCalendar', 'syncPreInspectCalendarNow');

  if (typeof buildInstallTaskMappingFromSheets === 'function') {
    out.rebuild.install = buildInstallTaskMappingFromSheets();
  }
  if (typeof buildDeliveryTaskMappingFromSheets === 'function') {
    out.rebuild.delivery = buildDeliveryTaskMappingFromSheets();
    if (typeof fillDeliveryMappingIdsFromDeliveryApprovedOrdersFinal === 'function') {
      out.rebuild.deliveryIdFill =
        fillDeliveryMappingIdsFromDeliveryApprovedOrdersFinal();
    }
  }
  if (typeof buildServiceTaskMappingFromSheets === 'function') {
    out.rebuild.service = buildServiceTaskMappingFromSheets();
  }
  if (typeof buildPreInspectTaskMapping === 'function') {
    out.rebuild.preInspection = buildPreInspectTaskMapping();

    if (typeof reviewNextPreInspectMappingBatch === 'function') {
      for (let i = 0; i < 20; i++) {
        const batch = reviewNextPreInspectMappingBatch();
        out.preinspectLookupBatches.push(batch);
        if (!batch || !Number(batch.processed || 0)) break;
        if (Number(batch.remainingPending || batch.remaining || 0) <= 0) break;
      }
    }
  }

  SpreadsheetApp.flush();
  return out;
}

function tmSystemicReconcileServiceRelationships_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss && ss.getSheetByName('Service Task Mapping');
  if (!sheet) throw new Error('Missing Service Task Mapping sheet.');

  const values = sheet.getDataRange().getValues();
  if (values.length < 2) {
    return {
      status: 'NO_ROWS',
      checked: 0,
      verified: 0,
      pushed: 0,
      reviewed: 0,
      skipped: 0,
      rows: []
    };
  }

  const headers = values[0].map(function(v) {
    return String(v || '').trim();
  });
  const idx = {};
  headers.forEach(function(name, i) { idx[name] = i; });

  const required = [
    'Status',
    'Task ID',
    'Task Status',
    'Hidden Work Order ID',
    'Hidden Location ID',
    'Hidden Contact ID'
  ];
  required.forEach(function(name) {
    if (idx[name] === undefined) {
      throw new Error('Service mapping is missing ' + name + '.');
    }
  });

  const result = {
    status: 'COMPLETE',
    checked: 0,
    verified: 0,
    pushed: 0,
    reviewed: 0,
    skipped: 0,
    rateWindowPauses: 0,
    estimatedStrivenCalls: 0,
    rows: []
  };

  let callsInWindow = 0;

  function budget(needed) {
    if (callsInWindow + needed <= TM_SYSTEMIC_REPAIR_R1.STRIVEN_SOFT_CALL_BUDGET) {
      return;
    }
    tmSystemicPauseRateWindow_('Service relationship call-budget reset');
    callsInWindow = 0;
    result.rateWindowPauses++;
  }

  for (let r = 1; r < values.length; r++) {
    const row = values[r];
    const rowNumber = r + 1;
    const status = String(row[idx['Status']] || '').trim().toUpperCase();
    const taskId = tmSystemicPositive_(row[idx['Task ID']]);
    const taskStatus = String(row[idx['Task Status']] || '').trim().toUpperCase();

    if (
      !taskId ||
      (status !== 'MATCHED' && status !== 'READY') ||
      taskStatus !== 'OPEN'
    ) {
      result.skipped++;
      continue;
    }

    const expected = {
      soId: tmSystemicPositive_(row[idx['Hidden Work Order ID']]),
      locId: tmSystemicPositive_(row[idx['Hidden Location ID']]),
      conId: tmSystemicPositive_(row[idx['Hidden Contact ID']])
    };

    if (!expected.soId && !expected.locId && !expected.conId) {
      result.skipped++;
      continue;
    }

    result.checked++;
    budget(1);

    let before;
    try {
      before = getStrivenTaskSnapshotById_(taskId);
      callsInWindow += 1;
      result.estimatedStrivenCalls += 1;
    } catch (err) {
      result.reviewed++;
      result.rows.push({
        rowNumber: rowNumber,
        taskId: taskId,
        status: 'REVIEW_READ_FAILED',
        error: String(err && err.message ? err.message : err)
      });
      continue;
    }

    const payload = { Id: Number(taskId) };
    const changes = [];

    if (expected.soId && Number(before.soId || 0) !== Number(expected.soId)) {
      payload.SalesOrder = { Id: Number(expected.soId) };
      changes.push('SalesOrderId');
    }

    if (expected.locId && Number(before.locId || 0) !== Number(expected.locId)) {
      payload.Location = { Id: Number(expected.locId) };
      changes.push('LocationId');
    }

    if (expected.conId && Number(before.conId || 0) !== Number(expected.conId)) {
      payload.RequestedBy = {
        Id: Number(expected.conId),
        Type: 'contact'
      };
      changes.push('ContactId');
    }

    if (!changes.length) {
      result.verified++;
      result.rows.push({
        rowNumber: rowNumber,
        taskId: taskId,
        status: 'ALREADY_ALIGNED',
        expected: expected,
        actual: {
          soId: before.soId || null,
          locId: before.locId || null,
          conId: before.conId || null
        }
      });
      continue;
    }

    // A fresh read + exact mapping evidence has proven every target. Use one
    // task relationship PATCH, then one fresh read-back. No retries.
    budget(2);

    try {
      let response;
      if (typeof updateStrivenTaskById_ === 'function') {
        response = updateStrivenTaskById_(taskId, payload);
      } else if (typeof patchStrivenTaskById_ === 'function') {
        response = patchStrivenTaskById_(taskId, payload);
      } else {
        throw new Error('No Striven task update helper is available.');
      }

      callsInWindow += 1;
      result.estimatedStrivenCalls += 1;

      Utilities.sleep(700);

      const after = getStrivenTaskSnapshotById_(taskId);
      callsInWindow += 1;
      result.estimatedStrivenCalls += 1;

      const mismatches = [];
      if (expected.soId && Number(after.soId || 0) !== Number(expected.soId)) {
        mismatches.push('SalesOrderId expected ' + expected.soId + ', got ' + (after.soId || 'blank'));
      }
      if (expected.locId && Number(after.locId || 0) !== Number(expected.locId)) {
        mismatches.push('LocationId expected ' + expected.locId + ', got ' + (after.locId || 'blank'));
      }
      if (expected.conId && Number(after.conId || 0) !== Number(expected.conId)) {
        mismatches.push('ContactId expected ' + expected.conId + ', got ' + (after.conId || 'blank'));
      }

      if (mismatches.length) {
        result.reviewed++;
        result.rows.push({
          rowNumber: rowNumber,
          taskId: taskId,
          status: 'WRITE_READBACK_MISMATCH',
          changes: changes,
          mismatches: mismatches,
          response: response || null
        });
        continue;
      }

      result.pushed++;
      result.rows.push({
        rowNumber: rowNumber,
        taskId: taskId,
        status: 'PUSHED_AND_VERIFIED',
        changes: changes,
        expected: expected,
        after: {
          soId: after.soId || null,
          locId: after.locId || null,
          conId: after.conId || null
        }
      });
    } catch (err) {
      result.reviewed++;
      result.rows.push({
        rowNumber: rowNumber,
        taskId: taskId,
        status: 'WRITE_ERROR_NO_RETRY',
        changes: changes,
        error: String(err && err.message ? err.message : err)
      });
    }
  }

  return result;
}

function tmSystemicReconcileMatchedPreInspectRows_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss && ss.getSheetByName('PreInspect Task Mapping');

  if (!sheet) throw new Error('Missing PreInspect Task Mapping sheet.');
  if (typeof runSelectedTaskMappingRowEndToEndR2 !== 'function') {
    return { status: 'SKIPPED_R2_FUNCTION_MISSING', checked: 0, rows: [] };
  }

  const values = sheet.getDataRange().getDisplayValues();
  if (values.length < 2) {
    return { status: 'NO_ROWS', checked: 0, rows: [] };
  }

  const headers = values[0].map(function(v) {
    return String(v || '').trim();
  });
  const idx = {};
  headers.forEach(function(name, i) { idx[name] = i; });

  const result = {
    status: 'COMPLETE',
    checked: 0,
    complete: 0,
    reviewed: 0,
    skipped: 0,
    rows: []
  };

  for (let r = 1; r < values.length; r++) {
    if (result.checked >= TM_SYSTEMIC_REPAIR_R1.PREINSPECT_MAX_MATCHED_E2E) break;

    const row = values[r];
    const status = String(row[idx['Status']] || '').trim().toUpperCase();
    const taskId = tmSystemicPositive_(row[idx['Task ID']]);

    if (status !== 'MATCHED' || !taskId) {
      result.skipped++;
      continue;
    }

    result.checked++;

    try {
      sheet.activate();
      sheet.getRange(r + 1, 1).activate();
      SpreadsheetApp.flush();

      const e2e = runSelectedTaskMappingRowEndToEndR2();
      const e2eStatus = String(e2e && e2e.status || '').toUpperCase();

      if (e2eStatus === 'COMPLETE' || e2eStatus === 'SUCCESS') {
        result.complete++;
      } else {
        result.reviewed++;
      }

      result.rows.push({
        rowNumber: r + 1,
        taskId: taskId,
        status: e2eStatus || 'UNKNOWN',
        result: e2e || null
      });
    } catch (err) {
      result.reviewed++;
      result.rows.push({
        rowNumber: r + 1,
        taskId: taskId,
        status: 'ERROR_CONTINUED',
        error: String(err && err.message ? err.message : err)
      });
    }
  }

  return result;
}

function tmSystemicPushAllPreInspectCalendarLinks_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss && ss.getSheetByName('PreInspect Task Mapping');

  if (!sheet) throw new Error('Missing PreInspect Task Mapping sheet.');
  if (typeof tmSystemicWritePreInspectCalendarTaskLink_ !== 'function') {
    return { status: 'SKIPPED_FUNCTION_MISSING', checked: 0, rows: [] };
  }

  const values = sheet.getDataRange().getDisplayValues();
  if (values.length < 2) {
    return { status: 'NO_ROWS', checked: 0, rows: [] };
  }

  const headers = values[0].map(function(v) {
    return String(v || '').trim();
  });
  const idx = {};
  headers.forEach(function(name, i) { idx[name] = i; });

  const result = {
    status: 'COMPLETE',
    checked: 0,
    written: 0,
    noChange: 0,
    reviewed: 0,
    rows: []
  };

  for (let r = 1; r < values.length; r++) {
    const row = values[r];
    const mappingStatus = String(row[idx['Status']] || '').trim().toUpperCase();
    const eventId = String(row[idx['Event ID']] || '').trim();
    const taskId = tmSystemicPositive_(row[idx['Task ID']]);

    if (
      !eventId ||
      !taskId ||
      mappingStatus === 'SKIP' ||
      mappingStatus === 'NOT MATCHED'
    ) {
      continue;
    }

    result.checked++;

    const taskTitle =
      String(row[idx['Task Name']] || '').trim() ||
      ('Pre-Inspection Task #' + taskId);

    try {
      const pushed = tmSystemicWritePreInspectCalendarTaskLink_(
        eventId,
        taskId,
        taskTitle
      );

      const status = String(pushed && pushed.status || '').toUpperCase();
      if (status === 'WRITTEN' || status === 'UPDATED') {
        result.written++;
      } else if (
        status === 'SKIPPED_NO_CHANGE' ||
        status === 'NO_CHANGE' ||
        status === 'ALREADY_CORRECT'
      ) {
        result.noChange++;
      } else {
        result.reviewed++;
      }

      result.rows.push({
        rowNumber: r + 1,
        eventId: eventId,
        taskId: taskId,
        result: pushed
      });
    } catch (err) {
      result.reviewed++;
      result.rows.push({
        rowNumber: r + 1,
        eventId: eventId,
        taskId: taskId,
        status: 'ERROR_CONTINUED',
        error: String(err && err.message ? err.message : err)
      });
    }
  }

  return result;
}


function tmSystemicPushSelectedPreInspectTaskLink_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss && ss.getActiveSheet();

  if (!sheet || sheet.getName() !== 'PreInspect Task Mapping') {
    throw new Error('Select a row on "PreInspect Task Mapping" first.');
  }

  const rowNumber = sheet.getActiveRange().getRow();
  if (rowNumber <= 1) throw new Error('Select a PreInspect mapping data row.');

  const values = sheet.getDataRange().getDisplayValues();
  const headers = values[0].map(function(v) { return String(v || '').trim(); });
  const row = values[rowNumber - 1] || [];
  const idx = {};
  headers.forEach(function(name, col) { idx[name] = col; });

  const eventId = String(row[idx['Event ID']] || '').trim();
  const taskId = tmSystemicPositive_(row[idx['Task ID']]);
  const taskTitle =
    String(row[idx['Task Name']] || '').trim() ||
    ('Pre-Inspection Task #' + taskId);

  return tmSystemicWritePreInspectCalendarTaskLink_(
    eventId,
    taskId,
    taskTitle
  );
}

function tmSystemicWritePreInspectCalendarTaskLink_(eventId, taskId, taskTitle) {
  const cleanEventId = String(eventId || '').trim();
  const cleanTaskId = tmSystemicPositive_(taskId);

  if (!cleanEventId) throw new Error('PreInspection Calendar Task-link write requires Event ID.');
  if (!cleanTaskId) throw new Error('PreInspection Calendar Task-link write requires Task ID.');

  const calendarId =
    typeof PREINSPECT_REVIEW_CONFIG !== 'undefined' &&
    PREINSPECT_REVIEW_CONFIG.CALENDAR_SYNC
      ? String(PREINSPECT_REVIEW_CONFIG.CALENDAR_SYNC.CALENDAR_ID || '').trim()
      : '';

  if (!calendarId) throw new Error('PreInspection Calendar ID is not configured.');

  const calendar = CalendarApp.getCalendarById(calendarId);
  const event = calendar && calendar.getEventById(cleanEventId);
  if (!event) {
    throw new Error('PreInspection Calendar event could not be fresh-read: ' + cleanEventId);
  }

  const startMarker = '<!-- PREINSPECT_STRIVEN_TASK_LINK_START -->';
  const endMarker = '<!-- PREINSPECT_STRIVEN_TASK_LINK_END -->';
  const taskBaseUrl =
    'https://classicfireplace.striven.com/Tasks/TaskInfo.aspx?TaskID=';
  const taskUrl = taskBaseUrl + encodeURIComponent(cleanTaskId);

  const original = String(event.getDescription() || '');
  let cleaned = original;

  if (typeof preinspectRemoveManagedTaskLinkBlock_ === 'function') {
    cleaned = preinspectRemoveManagedTaskLinkBlock_(original);
  } else {
    const managedRegex = new RegExp(
      '(?:<br\\s*\\/?>|\\r?\\n|\\s)*' +
      tmSystemicEscapeRegex_(startMarker) +
      '[\\s\\S]*?' +
      tmSystemicEscapeRegex_(endMarker) +
      '(?:<br\\s*\\/?>|\\r?\\n|\\s)*',
      'gi'
    );
    cleaned = original.replace(managedRegex, '').trim();
  }

  const safeTitle = tmSystemicEscapeHtml_(
    taskTitle || ('Pre-Inspection Task #' + cleanTaskId)
  );
  const safeUrl = tmSystemicEscapeHtml_(taskUrl);
  const block = [
    startMarker,
    '------- Pre-Inspection Task Link -------',
    '',
    safeTitle,
    '<a href="' + safeUrl + '">' + safeUrl + '</a>',
    '',
    '------------------------------------',
    endMarker
  ].join('<br>');

  const next = cleaned
    ? String(cleaned).replace(/(?:<br\s*\/?>|\s)+$/gi, '').trim() + '<br><br>' + block
    : block;

  if (original === next && original.indexOf(taskUrl) !== -1) {
    return {
      mode: 'PREINSPECT_CALENDAR_TASK_LINK_SYSTEMIC',
      status: 'SKIPPED_NO_CHANGE',
      writesPerformed: false,
      calendarWritesPerformed: false,
      eventId: cleanEventId,
      taskId: cleanTaskId,
      taskUrl: taskUrl,
      readBackVerified: true
    };
  }

  event.setDescription(next);

  const fresh = calendar.getEventById(cleanEventId);
  if (!fresh) {
    throw new Error('PreInspection Calendar event disappeared after Task-link write.');
  }

  const actual = String(fresh.getDescription() || '');
  if (
    actual.indexOf(taskUrl) === -1 ||
    actual.indexOf(startMarker) === -1 ||
    actual.indexOf(endMarker) === -1
  ) {
    throw new Error('PreInspection Calendar Task-link read-back verification failed.');
  }

  return {
    mode: 'PREINSPECT_CALENDAR_TASK_LINK_SYSTEMIC',
    status: 'WRITTEN',
    writesPerformed: true,
    calendarWritesPerformed: true,
    eventId: cleanEventId,
    taskId: cleanTaskId,
    taskUrl: taskUrl,
    readBackVerified: true
  };
}

function tmSystemicEscapeHtml_(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function tmSystemicEscapeRegex_(value) {
  const special = '\\\\^$.*+?()[]{}|';
  return String(value || '')
    .split('')
    .map(function(ch) {
      return special.indexOf(ch) !== -1 ? '\\\\' + ch : ch;
    })
    .join('');
}
function tmSystemicPauseRateWindow_(reason) {
  Logger.log(
    'SYSTEMIC RATE WINDOW PAUSE: ' +
    String(reason || '') +
    ' (' + TM_SYSTEMIC_REPAIR_R1.STRIVEN_RATE_WINDOW_MS + ' ms)'
  );
  Utilities.sleep(TM_SYSTEMIC_REPAIR_R1.STRIVEN_RATE_WINDOW_MS);
}

function tmSystemicPositive_(value) {
  const n = Number(
    String(value === null || value === undefined ? '' : value)
      .replace(/[^0-9.-]/g, '')
  );
  return isFinite(n) && n > 0 ? Math.floor(n) : null;
}

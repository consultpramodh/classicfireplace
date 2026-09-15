/************************************************************
 * 96_Selected_Row_End_To_End_R3.gs
 *
 * Purpose:
 * - Keep one selected-row End-to-End command.
 * - Preserve R1 routing for Install / Delivery / Service.
 * - Preserve R1 create/recovery/recent-completion handling for
 *   non-OPEN PreInspection tasks.
 * - Fix the PreInspection existing-OPEN date/time transport by:
 *     1) reading authoritative Striven state first,
 *     2) PATCHing Start and Due separately only when needed,
 *     3) using local 12-hour time with AM/PM for the Striven
 *        PreInspection transport,
 *     4) re-reading after each field PATCH,
 *     5) requiring final Start + Due read-back parity before
 *        any later assignment/notes/Calendar-link step.
 *
 * This is intentionally scoped to the manual selected-row
 * PreInspection path until runtime verification passes.
 * No triggers are created here.
 ************************************************************/

const TM_SELECTED_ROW_E2E_R3 = Object.freeze({
  VERSION: 'TM_SELECTED_ROW_E2E_R3_20260915',
  LOCK_WAIT_MS: 10000,
  READBACK_DELAYS_MS: [500, 1200, 2500]
});

function runSelectedTaskMappingRowEndToEndR3() {
  const ctx = tmSelectedRowE2EReadContext_();

  if (ctx.division !== 'PreInspection') {
    return runSelectedTaskMappingRowEndToEnd();
  }

  if (!ctx.taskId) {
    return tmSelectedRowE2ERunPreInspection_(ctx);
  }

  const fresh = tmSelectedRowE2EReadFreshTaskState_(ctx.taskId, ctx.taskStatus);
  const freshStatus = fresh.status || tmSelectedRowE2ENormalize_(ctx.taskStatus);

  if (freshStatus !== 'OPEN') {
    return tmSelectedRowE2ERunPreInspection_(ctx);
  }

  return tmSelectedRowE2ER3RunExistingOpenPreInspection_(ctx);
}

function tmSelectedRowE2ER3RunExistingOpenPreInspection_(ctx) {
  const lock = LockService.getUserLock();
  if (!lock.tryLock(TM_SELECTED_ROW_E2E_R3.LOCK_WAIT_MS)) {
    throw new Error('Selected-row End-to-End R3 is already running for this user.');
  }

  const steps = [];

  function record(name, value) {
    steps.push({ action: name, result: value });
    return value;
  }

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss && ss.getSheetByName(ctx.sheetName);
    if (!sheet) throw new Error('Missing PreInspect Task Mapping sheet.');

    ss.setActiveSheet(sheet);
    sheet.setActiveRange(sheet.getRange(ctx.rowNumber, 1, 1, 1));
    SpreadsheetApp.flush();

    record('REVIEW_MATCH_DUPLICATE_CHECK', reviewSelectedPreInspectMappingRow());
    SpreadsheetApp.flush();

    const state = preinspectR34ReadSelectedMappingState_();
    const status = String(state.row['Status'] || '').trim().toUpperCase();
    const taskAction = String(state.row['Task Action'] || '').trim().toUpperCase();
    const reviewedTaskId = preinspectR34PositiveNumber_(state.row['Task ID']);

    if (status === 'REVIEW' || status === 'SKIP') {
      const stopped = {
        mode: 'SELECTED_ROW_END_TO_END_R3',
        version: TM_SELECTED_ROW_E2E_R3.VERSION,
        status: status === 'SKIP' ? 'STOPPED_SKIP' : 'STOPPED_REVIEW',
        division: 'PreInspection',
        mappingRow: ctx.rowNumber,
        eventId: ctx.eventId,
        taskId: reviewedTaskId || ctx.taskId,
        taskAction: taskAction,
        issue: String(state.row['Issue'] || '').trim(),
        steps: steps
      };
      Logger.log(JSON.stringify(stopped, null, 2));
      return stopped;
    }

    if (!reviewedTaskId || Number(reviewedTaskId) !== Number(ctx.taskId)) {
      throw new Error(
        'BLOCKED: Selected PreInspection row changed Task ID during fresh review. ' +
        'Before=' + ctx.taskId + '; After=' + (reviewedTaskId || 'blank') + '. No further write attempted.'
      );
    }

    const refreshed = tmSelectedRowE2EReadFreshTaskState_(reviewedTaskId, state.row['Task Status']);
    const refreshedStatus = refreshed.status || tmSelectedRowE2ENormalize_(state.row['Task Status']);
    if (refreshedStatus !== 'OPEN') {
      return tmSelectedRowE2EStop_(ctx, 'TASK_STATUS_CHANGED_DURING_REVIEW',
        'Task is no longer OPEN after the fresh review. No further Striven mutation or Calendar write was attempted.',
        { freshTaskStatus: refreshedStatus, steps: steps });
    }

    record('CUSTOMER', pushSelectedPreInspectCustomer());
    record('LOCATION', pushSelectedPreInspectLocation());
    record('REQUESTED_BY', pushSelectedPreInspectRequestedBy());

    record(
      'DATE_TIME_LOCAL_MERIDIEM_SEQUENTIAL_RECONCILE',
      tmSelectedRowE2ER3ReconcilePreInspectionDateTime_(
        sheet,
        ctx.rowNumber,
        ctx.eventId,
        reviewedTaskId
      )
    );

    record('ASSIGNEES', pushSelectedPreInspectAssignees());
    record('INSTALL_NOTES_854', pushSelectedPreInspectInstallNotes());

    record('CALENDAR_TASK_LINK', pushSelectedPreInspectTaskLinkToCalendarEvent());
    record('REFRESH_PREINSPECT_CALENDAR_MIRROR', syncPreInspectCalendarNow());

    ss.setActiveSheet(sheet);
    sheet.setActiveRange(sheet.getRange(ctx.rowNumber, 1, 1, 1));
    SpreadsheetApp.flush();

    record('FINAL_MAPPING_REVIEW', reviewSelectedPreInspectMappingRow());
    SpreadsheetApp.flush();

    const finalState = preinspectR34ReadSelectedMappingState_();
    const finalTaskId = preinspectR34PositiveNumber_(finalState.row['Task ID']);
    if (!finalTaskId || Number(finalTaskId) !== Number(reviewedTaskId)) {
      throw new Error(
        'Final mapping verification did not retain the verified PreInspection Task ID ' +
        reviewedTaskId + '.'
      );
    }

    const result = {
      mode: 'SELECTED_ROW_END_TO_END_R3',
      version: TM_SELECTED_ROW_E2E_R3.VERSION,
      status: 'COMPLETE_AND_VERIFIED',
      division: 'PreInspection',
      mappingRow: ctx.rowNumber,
      eventId: ctx.eventId,
      taskId: reviewedTaskId,
      datetimeTransport: 'LOCAL_MERIDIEM_SEQUENTIAL_PATCH',
      salesOrderPolicy: 'SKIPPED_DISABLED_BY_POLICY',
      steps: steps,
      finalMapping: {
        status: String(finalState.row['Status'] || '').trim(),
        taskAction: String(finalState.row['Task Action'] || '').trim(),
        taskStatus: String(finalState.row['Task Status'] || '').trim(),
        issue: String(finalState.row['Issue'] || '').trim()
      }
    };

    Logger.log(JSON.stringify(result, null, 2));
    return result;
  } catch (err) {
    const failure = {
      mode: 'SELECTED_ROW_END_TO_END_R3',
      version: TM_SELECTED_ROW_E2E_R3.VERSION,
      status: 'FAILED',
      division: 'PreInspection',
      mappingRow: ctx ? ctx.rowNumber : null,
      eventId: ctx ? ctx.eventId : null,
      taskId: ctx ? ctx.taskId : null,
      completedSteps: steps,
      error: String(err && err.message ? err.message : err)
    };
    Logger.log(JSON.stringify(failure, null, 2));
    throw err;
  } finally {
    lock.releaseLock();
  }
}

function tmSelectedRowE2ER3ReconcilePreInspectionDateTime_(sheet, rowNumber, eventId, taskId) {
  const row = preinspectMappingRowObject_(sheet, rowNumber);
  const mappedEventId = String(row['Event ID'] || '').trim();
  const mappedTaskId = Number(String(row['Task ID'] || '').trim()) || 0;

  if (!mappedEventId || mappedEventId !== String(eventId || '').trim()) {
    throw new Error('BLOCKED: Mapping Event ID changed before PreInspection datetime reconciliation.');
  }
  if (!mappedTaskId || mappedTaskId !== Number(taskId)) {
    throw new Error('BLOCKED: Mapping Task ID changed before PreInspection datetime reconciliation.');
  }

  let preview = null;
  try {
    preview = JSON.parse(String(row['Patch Preview'] || '').trim() || '{}');
  } catch (err) {
    throw new Error('Mapping Patch Preview is not valid JSON for Task ' + taskId + '.');
  }

  const desiredStart = String(preview.StartDateTime || preview.startDateTime || '').trim();
  const desiredDue = String(preview.DueDateTime || preview.dueDateTime || '').trim();
  const previewTaskId = Number(String(preview.Id || preview.id || '').trim()) || 0;

  if (previewTaskId && previewTaskId !== Number(taskId)) {
    throw new Error('Mapping Patch Preview Task ID no longer matches Task ' + taskId + '.');
  }
  if (!desiredStart || !desiredDue) {
    throw new Error('Mapping Patch Preview is missing StartDateTime/DueDateTime for Task ' + taskId + '.');
  }

  const offsetPattern = /(?:Z|[+-]\d{2}:?\d{2})$/i;
  if (!offsetPattern.test(desiredStart) || !offsetPattern.test(desiredDue)) {
    throw new Error('BLOCKED: PreInspection desired datetime is not timezone-explicit for Task ' + taskId + '.');
  }

  if (
    !preinspectSameMinuteValue_(desiredStart, row['Calendar Start']) ||
    !preinspectSameMinuteValue_(desiredDue, row['Calendar End'])
  ) {
    throw new Error('BLOCKED: Patch Preview no longer matches Calendar Start/End for Task ' + taskId + '.');
  }

  const before = getStrivenTaskSnapshotById_(taskId, {});
  let currentStart = before && before.start ? before.start : null;
  let currentDue = before && before.due ? before.due : null;
  const patches = [];

  if (!preinspectSameMinuteValue_(currentStart, desiredStart)) {
    const startTransport = tmSelectedRowE2ER3LocalMeridiemDateTime_(desiredStart);
    const startPatch = patchStrivenTaskById_(taskId, {
      Id: Number(taskId),
      StartDateTime: startTransport
    });

    const afterStart = tmSelectedRowE2ER3ReadBackUntil_(taskId, function(snapshot) {
      return snapshot && preinspectSameMinuteValue_(snapshot.start, desiredStart);
    });

    if (!afterStart || !preinspectSameMinuteValue_(afterStart.start, desiredStart)) {
      throw new Error(
        'StartDateTime PATCH read-back differs for Task ' + taskId + '. ' +
        'Desired=' + desiredStart + '; Transport=' + startTransport + '; ReadBack=' +
        (afterStart && afterStart.start ? afterStart.start.toISOString() : '') + '.'
      );
    }

    patches.push({
      field: 'StartDateTime',
      transport: startTransport,
      statusCode: startPatch && startPatch.statusCode ? startPatch.statusCode : null,
      verified: afterStart.start ? afterStart.start.toISOString() : null
    });

    currentStart = afterStart.start;
    currentDue = afterStart.due;
  }

  if (!preinspectSameMinuteValue_(currentDue, desiredDue)) {
    const dueTransport = tmSelectedRowE2ER3LocalMeridiemDateTime_(desiredDue);
    const duePatch = patchStrivenTaskById_(taskId, {
      Id: Number(taskId),
      DueDateTime: dueTransport
    });

    const afterDue = tmSelectedRowE2ER3ReadBackUntil_(taskId, function(snapshot) {
      return snapshot && preinspectSameMinuteValue_(snapshot.due, desiredDue);
    });

    if (!afterDue || !preinspectSameMinuteValue_(afterDue.due, desiredDue)) {
      throw new Error(
        'DueDateTime PATCH read-back differs for Task ' + taskId + '. ' +
        'Desired=' + desiredDue + '; Transport=' + dueTransport + '; ReadBack=' +
        (afterDue && afterDue.due ? afterDue.due.toISOString() : '') + '.'
      );
    }

    patches.push({
      field: 'DueDateTime',
      transport: dueTransport,
      statusCode: duePatch && duePatch.statusCode ? duePatch.statusCode : null,
      verified: afterDue.due ? afterDue.due.toISOString() : null
    });
  }

  const finalSnapshot = getStrivenTaskSnapshotById_(taskId, {});
  const finalStart = finalSnapshot && finalSnapshot.start ? finalSnapshot.start : null;
  const finalDue = finalSnapshot && finalSnapshot.due ? finalSnapshot.due : null;

  if (
    !preinspectSameMinuteValue_(finalStart, desiredStart) ||
    !preinspectSameMinuteValue_(finalDue, desiredDue)
  ) {
    throw new Error(
      'Final PreInspection datetime verification failed for Task ' + taskId + '. Desired=' +
      desiredStart + ' -> ' + desiredDue + '; ReadBack=' +
      (finalStart ? finalStart.toISOString() : '') + ' -> ' +
      (finalDue ? finalDue.toISOString() : '') + '.'
    );
  }

  return {
    mode: 'PREINSPECT_SELECTED_ROW_DATETIME_R3',
    status: patches.length ? 'PUSHED_AND_VERIFIED' : 'NOT_NEEDED',
    writesPerformed: patches.length > 0,
    strivenWritesPerformed: patches.length > 0,
    calendarWritesPerformed: false,
    taskId: Number(taskId),
    mappingRow: Number(rowNumber),
    transport: 'LOCAL_12_HOUR_WITH_AM_PM_SEQUENTIAL_FIELDS',
    desired: {
      startDateTime: desiredStart,
      dueDateTime: desiredDue
    },
    before: {
      startDateTime: before && before.start ? before.start.toISOString() : null,
      dueDateTime: before && before.due ? before.due.toISOString() : null
    },
    patches: patches,
    verified: {
      startDateTime: finalStart ? finalStart.toISOString() : null,
      dueDateTime: finalDue ? finalDue.toISOString() : null
    }
  };
}

function tmSelectedRowE2ER3LocalMeridiemDateTime_(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (isNaN(date.getTime())) {
    throw new Error('Invalid PreInspection datetime transport value: ' + value);
  }

  let tz = 'America/Toronto';
  if (typeof preinspectR3418bTimezone_ === 'function') {
    tz = preinspectR3418bTimezone_() || tz;
  } else if (typeof tm_getTimezone_ === 'function') {
    tz = tm_getTimezone_() || tz;
  }

  return Utilities.formatDate(date, tz, 'yyyy-MM-dd hh:mm:ss a');
}

function tmSelectedRowE2ER3ReadBackUntil_(taskId, predicate) {
  let last = null;
  const delays = TM_SELECTED_ROW_E2E_R3.READBACK_DELAYS_MS || [500, 1200, 2500];

  for (let i = 0; i < delays.length; i++) {
    const delay = Number(delays[i] || 0);
    if (delay > 0) Utilities.sleep(delay);

    last = getStrivenTaskSnapshotById_(taskId, {});
    if (predicate(last)) return last;
  }

  return last;
}

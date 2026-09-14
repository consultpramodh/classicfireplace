/************************************************************
 * 94_Selected_Row_End_To_End_R2.gs
 *
 * Purpose:
 * - Keep the single selected-row End-to-End command.
 * - Preserve the existing R1 routing for Install / Delivery / Service.
 * - For an EXISTING OPEN PreInspection task, use the newer exact
 *   timezone-explicit date/time reconciliation path instead of the
 *   older split Dates + Times transport.
 * - Avoid blind retry after an uncertain previous PATCH: the exact
 *   datetime helper GETs current Striven state first, writes only when
 *   needed, and performs authoritative read-back verification.
 *
 * No triggers are created here.
 ************************************************************/

const TM_SELECTED_ROW_E2E_R2 = Object.freeze({
  VERSION: 'TM_SELECTED_ROW_E2E_R2_20260914',
  LOCK_WAIT_MS: 10000
});

function runSelectedTaskMappingRowEndToEndR2() {
  const ctx = tmSelectedRowE2EReadContext_();

  // Install / Delivery / Service continue through the already-deployed
  // guarded R1 command. R2 changes only the PreInspection existing-OPEN path.
  if (ctx.division !== 'PreInspection') {
    return runSelectedTaskMappingRowEndToEnd();
  }

  // CREATE / RECREATE / recently-completed handling remains owned by the
  // existing R1 PreInspection wrapper, including the 24-hour protection.
  if (!ctx.taskId) {
    return tmSelectedRowE2ERunPreInspection_(ctx);
  }

  const fresh = tmSelectedRowE2EReadFreshTaskState_(ctx.taskId, ctx.taskStatus);
  const freshStatus = fresh.status || tmSelectedRowE2ENormalize_(ctx.taskStatus);

  if (freshStatus !== 'OPEN') {
    return tmSelectedRowE2ERunPreInspection_(ctx);
  }

  return tmSelectedRowE2ER2RunExistingOpenPreInspection_(ctx);
}

function tmSelectedRowE2ER2RunExistingOpenPreInspection_(ctx) {
  const lock = LockService.getUserLock();
  if (!lock.tryLock(TM_SELECTED_ROW_E2E_R2.LOCK_WAIT_MS)) {
    throw new Error('Selected-row End-to-End R2 is already running for this user.');
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

    // Re-review immediately before any write so the selected mapping decision
    // and Calendar fingerprint are current.
    record('REVIEW_MATCH_DUPLICATE_CHECK', reviewSelectedPreInspectMappingRow());
    SpreadsheetApp.flush();

    const state = preinspectR34ReadSelectedMappingState_();
    const status = String(state.row['Status'] || '').trim().toUpperCase();
    const taskAction = String(state.row['Task Action'] || '').trim().toUpperCase();
    const reviewedTaskId = preinspectR34PositiveNumber_(state.row['Task ID']);

    if (status === 'REVIEW' || status === 'SKIP') {
      const stopped = {
        mode: 'SELECTED_ROW_END_TO_END_R2',
        version: TM_SELECTED_ROW_E2E_R2.VERSION,
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

    // Fresh status gate again after the review.
    const refreshed = tmSelectedRowE2EReadFreshTaskState_(reviewedTaskId, state.row['Task Status']);
    const refreshedStatus = refreshed.status || tmSelectedRowE2ENormalize_(state.row['Task Status']);
    if (refreshedStatus !== 'OPEN') {
      return tmSelectedRowE2EStop_(ctx, 'TASK_STATUS_CHANGED_DURING_REVIEW',
        'Task is no longer OPEN after the fresh review. No further Striven mutation or Calendar write was attempted.',
        { freshTaskStatus: refreshedStatus, steps: steps });
    }

    // Push all configured existing-task details EXCEPT the old split
    // Dates/Times helpers. Date/time is reconciled once through the newer
    // timezone-explicit shared patch path below.
    record('CUSTOMER', pushSelectedPreInspectCustomer());
    record('LOCATION', pushSelectedPreInspectLocation());
    record('REQUESTED_BY', pushSelectedPreInspectRequestedBy());

    record(
      'DATE_TIME_EXACT_RECONCILE',
      preinspectR3420aReconcileDateTimeFromReview_(
        sheet,
        ctx.rowNumber,
        ctx.eventId,
        reviewedTaskId
      )
    );

    record('ASSIGNEES', pushSelectedPreInspectAssignees());
    record('INSTALL_NOTES_854', pushSelectedPreInspectInstallNotes());

    // Only after every applicable Striven-side step completes/validates do we
    // append/repair the managed task link on the Calendar event.
    record('CALENDAR_TASK_LINK', pushSelectedPreInspectTaskLinkToCalendarEvent());
    record('REFRESH_PREINSPECT_CALENDAR_MIRROR', syncPreInspectCalendarNow());

    // Re-establish selected row before final review in case the mirror refresh
    // changed the active sheet/range.
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
      mode: 'SELECTED_ROW_END_TO_END_R2',
      version: TM_SELECTED_ROW_E2E_R2.VERSION,
      status: 'COMPLETE_AND_VERIFIED',
      division: 'PreInspection',
      mappingRow: ctx.rowNumber,
      eventId: ctx.eventId,
      taskId: reviewedTaskId,
      datetimeTransport: 'PREINSPECT_R3420A_EXACT_SHARED_PATCH',
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
      mode: 'SELECTED_ROW_END_TO_END_R2',
      version: TM_SELECTED_ROW_E2E_R2.VERSION,
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

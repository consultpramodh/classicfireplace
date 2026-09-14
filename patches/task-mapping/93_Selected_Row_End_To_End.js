/************************************************************
 * 93_Selected_Row_End_To_End.gs
 *
 * Purpose:
 * - One public selected-row command for Install, Delivery,
 *   Service, and PreInspection mapping sheets.
 * - Reuses the existing proven workflow-specific push logic.
 * - Writes the managed Striven task/calendar link after the
 *   Striven-side row reconciliation succeeds or is already
 *   correct.
 *
 * Important:
 * - Manual selected-row only. No triggers are installed here.
 * - Install / Delivery / Service do NOT CREATE / RECREATE from
 *   this command. If no safe OPEN task is mapped, the command
 *   stops and leaves recovery to the existing guarded recovery
 *   workflow.
 * - PreInspection keeps its existing end-to-end authority,
 *   including create/recovery, but this wrapper adds a strict
 *   recent-completion guard before allowing a completed task to
 *   enter recreation logic.
 ************************************************************/

const TM_SELECTED_ROW_E2E = Object.freeze({
  VERSION: 'TM_SELECTED_ROW_E2E_R1_20260914',
  RECENT_COMPLETION_HOURS: 24,
  LOCK_WAIT_MS: 10000
});

function runSelectedTaskMappingRowEndToEnd() {
  const lock = LockService.getUserLock();
  if (!lock.tryLock(TM_SELECTED_ROW_E2E.LOCK_WAIT_MS)) {
    throw new Error('Selected-row End-to-End is already running for this user.');
  }

  let ctx = null;

  try {
    ctx = tmSelectedRowE2EReadContext_();

    if (ctx.division === 'PreInspection') {
      return tmSelectedRowE2ERunPreInspection_(ctx);
    }

    return tmSelectedRowE2ERunExistingTaskWorkflow_(ctx);
  } catch (err) {
    const failure = {
      mode: 'SELECTED_ROW_END_TO_END',
      version: TM_SELECTED_ROW_E2E.VERSION,
      status: 'FAILED',
      division: ctx ? ctx.division : null,
      sheetName: ctx ? ctx.sheetName : null,
      rowNumber: ctx ? ctx.rowNumber : null,
      eventId: ctx ? ctx.eventId : null,
      taskId: ctx ? ctx.taskId : null,
      error: String(err && err.message ? err.message : err)
    };
    Logger.log(JSON.stringify(failure, null, 2));
    throw err;
  } finally {
    lock.releaseLock();
  }
}

function tmSelectedRowE2ERunExistingTaskWorkflow_(ctx) {
  if (!ctx.taskId) {
    return tmSelectedRowE2EStop_(ctx, 'NO_SAFE_TASK_FOUND',
      'Selected row has no mapped Task ID. Rebuild/review the mapping or use Task Recovery; no external write was attempted.');
  }

  const fresh = tmSelectedRowE2EReadFreshTaskState_(ctx.taskId, ctx.taskStatus);
  const freshStatus = fresh.status || tmSelectedRowE2ENormalize_(ctx.taskStatus);

  if (freshStatus !== 'OPEN') {
    const completion = tmSelectedRowE2ECompletionWindow_(fresh.rawTask, freshStatus);

    return tmSelectedRowE2EStop_(ctx,
      completion.recent ? 'RECENTLY_COMPLETED_NO_RECREATE' : 'NON_OPEN_TASK_NOT_MUTATED',
      completion.recent
        ? ('Task was completed/changed to completed within the last ' +
            TM_SELECTED_ROW_E2E.RECENT_COMPLETION_HOURS +
            ' hours. No recreation or Striven mutation was attempted.')
        : ('Task is not OPEN (' + (freshStatus || 'UNKNOWN') +
            '). This one-click command does not create/recreate Install, Delivery, or Service tasks. Use the guarded Task Recovery workflow if recovery is actually required.'),
      {
        freshTaskStatus: freshStatus,
        completion: completion
      });
  }

  const result = {
    mode: 'SELECTED_ROW_END_TO_END',
    version: TM_SELECTED_ROW_E2E.VERSION,
    status: 'RUNNING',
    division: ctx.division,
    sheetName: ctx.sheetName,
    rowNumber: ctx.rowNumber,
    eventId: ctx.eventId,
    taskId: ctx.taskId,
    freshTaskStatus: freshStatus,
    striven: null,
    calendar: null
  };

  if (ctx.mappingStatus === 'MATCHED') {
    result.striven = {
      status: 'NO_CHANGE',
      reason: 'Mapping row is already MATCHED; no Striven field mutation was required.'
    };
  } else {
    result.striven = tmSelectedRowE2ERunDivisionPush_(ctx.division);
  }

  result.calendar = tmSelectedRowE2ERunCalendarLink_(ctx.division);
  result.status = 'COMPLETE';

  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

function tmSelectedRowE2ERunPreInspection_(ctx) {
  /**********************************************************
   * If a mapped PreInspection task is already completed,
   * enforce the user's 24-hour protection rule before the
   * existing E2E function is allowed to enter recreation.
   **********************************************************/
  if (ctx.taskId) {
    const fresh = tmSelectedRowE2EReadFreshTaskState_(ctx.taskId, ctx.taskStatus);
    const freshStatus = fresh.status || tmSelectedRowE2ENormalize_(ctx.taskStatus);

    if (tmSelectedRowE2EIsCompletedStatus_(freshStatus)) {
      const completion = tmSelectedRowE2ECompletionWindow_(fresh.rawTask, freshStatus);

      if (completion.recent) {
        let calendarResult = null;
        try {
          calendarResult = pushSelectedPreInspectTaskLinkToCalendarEvent();
        } catch (calendarErr) {
          calendarResult = {
            status: 'LINK_NOT_UPDATED',
            error: String(calendarErr && calendarErr.message ? calendarErr.message : calendarErr)
          };
        }

        const recentResult = {
          mode: 'SELECTED_ROW_END_TO_END',
          version: TM_SELECTED_ROW_E2E.VERSION,
          status: 'RECENTLY_COMPLETED_NO_RECREATE',
          division: ctx.division,
          sheetName: ctx.sheetName,
          rowNumber: ctx.rowNumber,
          eventId: ctx.eventId,
          taskId: ctx.taskId,
          freshTaskStatus: freshStatus,
          completion: completion,
          striven: {
            status: 'NO_WRITE',
            reason: 'Recent completion protection window is active.'
          },
          calendar: calendarResult
        };

        Logger.log(JSON.stringify(recentResult, null, 2));
        return recentResult;
      }

      if (!completion.proven) {
        return tmSelectedRowE2EStop_(ctx, 'REVIEW_COMPLETION_TIME_UNKNOWN',
          'Completed PreInspection task has no provable completion/status-change timestamp. Recreation was blocked for safety.',
          { freshTaskStatus: freshStatus, completion: completion });
      }
    } else if (freshStatus && freshStatus !== 'OPEN') {
      return tmSelectedRowE2EStop_(ctx, 'NON_OPEN_PREINSPECT_REVIEW',
        'Mapped PreInspection task is ' + freshStatus + ', not OPEN/DONE. No automatic recreation was attempted.',
        { freshTaskStatus: freshStatus });
    }
  }

  const result = runSelectedPreInspectEndToEnd();

  return {
    mode: 'SELECTED_ROW_END_TO_END',
    version: TM_SELECTED_ROW_E2E.VERSION,
    status: result && result.status ? result.status : 'COMPLETE',
    division: 'PreInspection',
    sheetName: ctx.sheetName,
    rowNumber: ctx.rowNumber,
    eventId: ctx.eventId,
    taskId: result && (result.taskId || result.newTaskId) ? (result.taskId || result.newTaskId) : ctx.taskId,
    preInspectionEndToEnd: result
  };
}

function tmSelectedRowE2ERunDivisionPush_(division) {
  try {
    if (division === 'Install') {
      return pushSelectedInstallMappingRowByMode_('BOTH');
    }

    if (division === 'Delivery') {
      return pushSelectedDeliveryMappingRowByMode_('ANY');
    }

    if (division === 'Service') {
      return pushSelectedServiceMappingRowToStriven();
    }

    throw new Error('Unsupported selected-row push division: ' + division);
  } catch (err) {
    const message = String(err && err.message ? err.message : err);

    if (tmSelectedRowE2EIsNoChangeError_(message)) {
      return {
        status: 'NO_CHANGE',
        reason: message
      };
    }

    throw err;
  }
}

function tmSelectedRowE2ERunCalendarLink_(division) {
  if (division === 'Install') {
    return pushStrivenTaskLinkToSelectedInstallCalendarEvent();
  }

  if (division === 'Delivery') {
    return pushStrivenTaskLinkToSelectedDeliveryCalendarEvent();
  }

  if (division === 'Service') {
    return pushStrivenTaskLinkToSelectedServiceCalendarEvent();
  }

  throw new Error('Unsupported Calendar-link division: ' + division);
}

function tmSelectedRowE2EIsNoChangeError_(message) {
  const text = String(message || '');
  return /No (?:any |date\/time |ID |ids |assignment )?change needed/i.test(text) ||
    /No date\/time or ID changes to push/i.test(text) ||
    /No SalesOrderId \/ LocationId \/ ContactId change to push/i.test(text) ||
    /No date\/time change to push/i.test(text);
}

function tmSelectedRowE2EReadContext_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss && ss.getActiveSheet();
  const range = sheet && sheet.getActiveRange();

  if (!sheet || !range) {
    throw new Error('Select one mapping row first.');
  }

  const profile = tmSelectedRowE2EProfileForSheet_(sheet.getName());
  if (!profile) {
    throw new Error(
      'Run this only from Install Task Mapping, Delivery Task Mapping, Service Task Mapping, or PreInspect Task Mapping.'
    );
  }

  const header = tmSelectedRowE2EHeaderContext_(sheet);
  const rowNumber = range.getRow();

  if (rowNumber <= header.headerRow) {
    throw new Error('Select a mapping data row, not the header/control row.');
  }

  const display = sheet.getRange(rowNumber, 1, 1, sheet.getLastColumn()).getDisplayValues()[0];
  const eventId = tmSelectedRowE2EValue_(display, header.indexMap,
    ['Event ID', 'Calendar Event ID', 'EventId']);
  const taskId = tmSelectedRowE2EValue_(display, header.indexMap,
    ['Task ID', 'Task Id', 'TaskId', 'Service Task ID']);
  const taskStatus = tmSelectedRowE2EValue_(display, header.indexMap,
    ['Task Status', 'TaskStatus']);
  const mappingStatus = tmSelectedRowE2EValue_(display, header.indexMap,
    ['Status', 'Mapping Status']);

  if (!eventId) {
    throw new Error('Selected mapping row has no Event ID. Calendar write cannot be safely resolved.');
  }

  return {
    division: profile.division,
    sheetName: sheet.getName(),
    rowNumber: rowNumber,
    eventId: eventId,
    taskId: tmSelectedRowE2EPositiveNumber_(taskId),
    taskStatus: taskStatus,
    mappingStatus: tmSelectedRowE2ENormalize_(mappingStatus)
  };
}

function tmSelectedRowE2EProfileForSheet_(sheetName) {
  const name = String(sheetName || '').trim();
  const profiles = [
    {
      division: 'Install',
      sheetName: (typeof INSTALL_CONFIG !== 'undefined' && INSTALL_CONFIG.SHEETS)
        ? INSTALL_CONFIG.SHEETS.MAPPING : 'Install Task Mapping'
    },
    {
      division: 'Delivery',
      sheetName: (typeof DELIVERY_CONFIG !== 'undefined' && DELIVERY_CONFIG.SHEETS)
        ? DELIVERY_CONFIG.SHEETS.MAPPING : 'Delivery Task Mapping'
    },
    {
      division: 'Service',
      sheetName: (typeof SERVICE_CONFIG !== 'undefined' && SERVICE_CONFIG.SHEETS)
        ? SERVICE_CONFIG.SHEETS.MAPPING : 'Service Task Mapping'
    },
    {
      division: 'PreInspection',
      sheetName: (typeof PREINSPECT_REVIEW_CONFIG !== 'undefined' && PREINSPECT_REVIEW_CONFIG.SHEETS)
        ? PREINSPECT_REVIEW_CONFIG.SHEETS.MAPPING : 'PreInspect Task Mapping'
    }
  ];

  for (let i = 0; i < profiles.length; i++) {
    if (name === profiles[i].sheetName) return profiles[i];
  }

  return null;
}

function tmSelectedRowE2EHeaderContext_(sheet) {
  const scanRows = Math.min(Math.max(sheet.getLastRow(), 1), 10);
  const width = sheet.getLastColumn();
  const values = sheet.getRange(1, 1, scanRows, width).getDisplayValues();
  const signatures = ['Event ID', 'Task ID', 'Task Status', 'Status'];

  let bestIndex = -1;
  let bestScore = 0;

  for (let r = 0; r < values.length; r++) {
    const row = values[r].map(function(v) { return String(v || '').trim(); });
    let score = 0;

    signatures.forEach(function(sig) {
      if (row.indexOf(sig) !== -1) score++;
    });

    if (score > bestScore) {
      bestScore = score;
      bestIndex = r;
    }
  }

  if (bestIndex < 0 || bestScore < 2) {
    throw new Error('Could not detect the selected mapping sheet header row.');
  }

  const headers = values[bestIndex];
  const indexMap = {};
  headers.forEach(function(value, index) {
    const key = String(value || '').trim();
    if (key && indexMap[key] === undefined) indexMap[key] = index;
  });

  return {
    headerRow: bestIndex + 1,
    headers: headers,
    indexMap: indexMap
  };
}

function tmSelectedRowE2EValue_(row, indexMap, aliases) {
  for (let i = 0; i < aliases.length; i++) {
    const index = indexMap[aliases[i]];
    if (index !== undefined) return String(row[index] || '').trim();
  }
  return '';
}

function tmSelectedRowE2EPositiveNumber_(value) {
  const n = Number(String(value === null || value === undefined ? '' : value).trim());
  return Number.isFinite(n) && n > 0 ? n : null;
}

function tmSelectedRowE2ENormalize_(value) {
  return String(value || '').trim().toUpperCase();
}

function tmSelectedRowE2EReadFreshTaskState_(taskId, fallbackStatus) {
  const id = tmSelectedRowE2EPositiveNumber_(taskId);
  if (!id) {
    return { taskId: null, status: tmSelectedRowE2ENormalize_(fallbackStatus), rawTask: null };
  }

  let rawTask = null;

  if (typeof getStrivenTaskById_ === 'function') {
    rawTask = getStrivenTaskById_(id);
  }

  if (!rawTask && typeof getReplacementTaskSourceSnapshot_ === 'function') {
    rawTask = getReplacementTaskSourceSnapshot_(id);
  }

  const rawStatus = rawTask && (
    rawTask.status || rawTask.Status || rawTask.taskStatus || rawTask.TaskStatus
  );

  let status = '';
  if (rawStatus && typeof rawStatus === 'object') {
    status = rawStatus.name || rawStatus.Name || rawStatus.status || rawStatus.Status || '';
  } else {
    status = rawStatus || '';
  }

  return {
    taskId: id,
    status: tmSelectedRowE2ENormalize_(status || fallbackStatus),
    rawTask: rawTask || null
  };
}

function tmSelectedRowE2EIsCompletedStatus_(status) {
  const s = tmSelectedRowE2ENormalize_(status);
  return ['DONE', 'COMPLETED', 'CLOSED'].indexOf(s) !== -1;
}

function tmSelectedRowE2ECompletionWindow_(rawTask, status) {
  const output = {
    completedStatus: tmSelectedRowE2EIsCompletedStatus_(status),
    proven: false,
    recent: false,
    hoursAgo: null,
    completionDateTime: null,
    completionField: null,
    completionEvidence: null
  };

  if (!output.completedStatus || !rawTask) return output;

  let evidence = null;

  if (typeof taskRecoveryAutoExtractCompletionEvidence_ === 'function') {
    evidence = taskRecoveryAutoExtractCompletionEvidence_(rawTask);
  }

  if (!evidence || !evidence.date || isNaN(evidence.date.getTime())) {
    return output;
  }

  const ageMs = Date.now() - evidence.date.getTime();
  const hours = ageMs / (60 * 60 * 1000);

  output.proven = ageMs >= 0;
  output.recent = ageMs >= 0 && hours < TM_SELECTED_ROW_E2E.RECENT_COMPLETION_HOURS;
  output.hoursAgo = ageMs >= 0 ? Math.round(hours * 100) / 100 : null;
  output.completionDateTime = evidence.date.toISOString();
  output.completionField = evidence.field || null;
  output.completionEvidence = evidence.evidence || null;

  return output;
}

function tmSelectedRowE2EStop_(ctx, status, reason, extra) {
  const result = {
    mode: 'SELECTED_ROW_END_TO_END',
    version: TM_SELECTED_ROW_E2E.VERSION,
    status: status,
    division: ctx.division,
    sheetName: ctx.sheetName,
    rowNumber: ctx.rowNumber,
    eventId: ctx.eventId,
    taskId: ctx.taskId,
    writesPerformed: false,
    reason: reason
  };

  if (extra && typeof extra === 'object') {
    Object.keys(extra).forEach(function(key) {
      result[key] = extra[key];
    });
  }

  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

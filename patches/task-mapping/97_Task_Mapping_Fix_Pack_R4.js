/************************************************************
 * 97_Task_Mapping_Fix_Pack_R4.gs
 *
 * Consolidated Task Mapping fix pack.
 *
 * Scope:
 * - One selected-row entry point for Install / Delivery / Service / PreInspection.
 * - Fresh Calendar preflight before consequential selected-row work.
 * - Fresh Striven task read before mutation; recent-completion 24h protection.
 * - Diff-aware selected-row pushes to reduce blind retries.
 * - Material Striven read-back verification before Calendar link write.
 * - Service multi-fireplace Calendar link aggregation by Event ID.
 * - Validated report response shape + pagination-cap detection.
 * - Read-only control-tower view separating legacy status from TM2 endpoint.
 * - Read-only regression suite for the consolidated pack.
 *
 * Guardrails:
 * - No triggers are created here.
 * - No TM2 cutover flags are changed here.
 * - Install / Delivery / Service CREATE/RECREATE authority remains in the
 *   existing guarded Task Recovery workflow; this selected-row entry point
 *   never invents a replacement task.
 ************************************************************/

const TM_FIX_PACK_R4 = Object.freeze({
  VERSION: 'TM_FIX_PACK_R4_20260915',
  RECENT_COMPLETION_HOURS: 24,
  READBACK_DELAYS_MS: [500, 1200, 2500],
  SERVICE_LINK_LIMIT_EVENTS: 25
});

/************************************************************
 * PUBLIC — SELECTED ROW END TO END R4
 ************************************************************/
function runSelectedTaskMappingRowEndToEndR4() {
  const ctx = tmSelectedRowE2EReadContext_();
  const calendarPreflight = tmR4_assertSelectedCalendarFresh_(ctx);

  const fresh = tmSelectedRowE2EReadFreshTaskState_(ctx.taskId, ctx.taskStatus);
  const freshStatus = fresh.status || tmSelectedRowE2ENormalize_(ctx.taskStatus);

  if (!ctx.taskId) {
    if (ctx.division === 'PreInspection') {
      return tmSelectedRowE2ERunPreInspection_(ctx);
    }

    return tmSelectedRowE2EStop_(
      ctx,
      'NO_SAFE_TASK_FOUND',
      'No mapped Task ID is available. No external write was attempted. Use the guarded Task Recovery workflow after the mapping is reviewed.',
      { calendarPreflight: calendarPreflight }
    );
  }

  if (freshStatus !== 'OPEN') {
    const completion = tmSelectedRowE2ECompletionWindow_(fresh.rawTask, freshStatus);

    if (completion.recent) {
      return tmSelectedRowE2EStop_(
        ctx,
        'RECENTLY_COMPLETED_NO_RECREATE',
        'Task was completed/changed to completed within the last ' +
          TM_FIX_PACK_R4.RECENT_COMPLETION_HOURS +
          ' hours. No recreation or Striven mutation was attempted.',
        {
          freshTaskStatus: freshStatus,
          completion: completion,
          calendarPreflight: calendarPreflight
        }
      );
    }

    if (tmSelectedRowE2EIsCompletedStatus_(freshStatus) && !completion.proven) {
      return tmSelectedRowE2EStop_(
        ctx,
        'REVIEW_COMPLETION_TIME_UNKNOWN',
        'Task is completed, but the completion/status-change timestamp cannot be proven. No recreation was attempted.',
        {
          freshTaskStatus: freshStatus,
          completion: completion,
          calendarPreflight: calendarPreflight
        }
      );
    }

    if (ctx.division === 'PreInspection') {
      return tmSelectedRowE2ERunPreInspection_(ctx);
    }

    return tmSelectedRowE2EStop_(
      ctx,
      'NON_OPEN_TASK_NOT_MUTATED',
      'Task is not OPEN (' + (freshStatus || 'UNKNOWN') + '). No automatic Install/Delivery/Service recreation was attempted from this selected-row command.',
      {
        freshTaskStatus: freshStatus,
        completion: completion,
        calendarPreflight: calendarPreflight
      }
    );
  }

  if (ctx.division === 'PreInspection') {
    // R3 owns the corrected local-meridiem sequential PreInspection datetime transport.
    return tmSelectedRowE2ER3RunExistingOpenPreInspection_(ctx);
  }

  const mapping = tmR4_readSelectedMapping_(ctx);
  const before = getStrivenTaskSnapshotById_(ctx.taskId, {});
  const diff = tmR4_computeSelectedTaskDiff_(ctx, mapping, before);
  const strivenResult = tmR4_applySelectedTaskDiff_(ctx, mapping, diff);
  const verification = tmR4_verifySelectedTaskReadBack_(ctx, mapping);

  let calendarResult;
  if (ctx.division === 'Service') {
    calendarResult = tmR4_pushSelectedServiceCalendarEventTaskSet_(false);
  } else {
    calendarResult = tmSelectedRowE2ERunCalendarLink_(ctx.division);
  }

  const calendarVerification = tmR4_verifySelectedCalendarLink_(ctx);

  const result = {
    mode: 'SELECTED_ROW_END_TO_END_R4',
    version: TM_FIX_PACK_R4.VERSION,
    status: 'COMPLETE_AND_VERIFIED',
    division: ctx.division,
    mappingRow: ctx.rowNumber,
    eventId: ctx.eventId,
    taskId: ctx.taskId,
    calendarPreflight: calendarPreflight,
    freshTaskStatus: freshStatus,
    freshDiff: diff,
    striven: strivenResult,
    verification: verification,
    calendar: calendarResult,
    calendarVerification: calendarVerification
  };

  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

/************************************************************
 * SELECTED ROW — MAPPING READER
 ************************************************************/
function tmR4_readSelectedMapping_(ctx) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss && ss.getSheetByName(ctx.sheetName);
  if (!sheet) throw new Error('Missing mapping sheet: ' + ctx.sheetName);

  const header = tmSelectedRowE2EHeaderContext_(sheet);
  const width = sheet.getLastColumn();
  const values = sheet.getRange(ctx.rowNumber, 1, 1, width).getValues()[0];
  const display = sheet.getRange(ctx.rowNumber, 1, 1, width).getDisplayValues()[0];
  const row = {};

  header.headers.forEach(function(name, index) {
    const key = String(name || '').trim();
    if (!key) return;
    row[key] = display[index] !== undefined ? display[index] : values[index];
  });

  return {
    sheet: sheet,
    header: header,
    values: values,
    display: display,
    row: row
  };
}

function tmR4_pickRowValue_(row, aliases) {
  for (let i = 0; i < aliases.length; i++) {
    const key = aliases[i];
    if (Object.prototype.hasOwnProperty.call(row || {}, key)) {
      const value = row[key];
      if (value !== null && value !== undefined && String(value).trim() !== '') {
        return value;
      }
    }
  }
  return '';
}

function tmR4_positiveNumber_(value) {
  const n = Number(String(value === null || value === undefined ? '' : value).replace(/[^0-9.\-]/g, ''));
  return isFinite(n) && n > 0 ? n : 0;
}

function tmR4_normalizeName_(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').toUpperCase();
}

/************************************************************
 * CALENDAR — AUTHORITATIVE PRE-WRITE FRESHNESS
 ************************************************************/
function tmR4_assertSelectedCalendarFresh_(ctx) {
  if (!ctx || !ctx.eventId) {
    throw new Error('BLOCKED: Selected mapping row has no Event ID.');
  }

  const expected = tmR4_selectedCalendarExpected_(ctx);
  const fresh = tmR4_readFreshCalendarEvent_(ctx);

  if (!fresh || !fresh.event) {
    throw new Error('BLOCKED: Authoritative Calendar event could not be found for Event ID ' + ctx.eventId + '.');
  }

  if (expected.start && !preinspectSameMinuteValue_(fresh.start, expected.start)) {
    throw new Error(
      'BLOCKED: Calendar Start changed after mapping. Mapping=' + expected.start + '; Fresh=' +
      (fresh.start ? fresh.start.toISOString() : '') + '.'
    );
  }

  if (expected.end && !preinspectSameMinuteValue_(fresh.end, expected.end)) {
    throw new Error(
      'BLOCKED: Calendar End changed after mapping. Mapping=' + expected.end + '; Fresh=' +
      (fresh.end ? fresh.end.toISOString() : '') + '.'
    );
  }

  return {
    status: 'FRESH_VERIFIED',
    division: ctx.division,
    eventId: ctx.eventId,
    calendarId: fresh.calendarId || null,
    start: fresh.start ? fresh.start.toISOString() : null,
    end: fresh.end ? fresh.end.toISOString() : null,
    title: fresh.event.getTitle ? String(fresh.event.getTitle() || '') : ''
  };
}

function tmR4_selectedCalendarExpected_(ctx) {
  const mapping = tmR4_readSelectedMapping_(ctx);
  const row = mapping.row;

  let start = tmR4_pickRowValue_(row, [
    'Calendar Start', 'Hidden Calendar Start', 'Calendar StartDateTime', 'StartDateTime'
  ]);
  let end = tmR4_pickRowValue_(row, [
    'Calendar End', 'Hidden Calendar End', 'Calendar EndDateTime', 'DueDateTime'
  ]);

  if (!start && row['Hidden Calendar Start Date'] && row['Hidden Calendar Start Time']) {
    start = String(row['Hidden Calendar Start Date']).trim() + ' ' + String(row['Hidden Calendar Start Time']).trim();
  }
  if (!end && row['Hidden Calendar End Date'] && row['Hidden Calendar End Time']) {
    end = String(row['Hidden Calendar End Date']).trim() + ' ' + String(row['Hidden Calendar End Time']).trim();
  }

  if ((!start || !end) && row.Date && row.Time) {
    const parsed = tmR4_parseDateAndRange_(row.Date, row.Time);
    start = start || parsed.start;
    end = end || parsed.end;
  }

  return { start: start || null, end: end || null };
}

function tmR4_parseDateAndRange_(dateValue, timeRange) {
  const date = String(dateValue || '').trim();
  const time = String(timeRange || '').trim();
  const pieces = time.split(/[–—-]/).map(function(v) { return String(v || '').trim(); }).filter(Boolean);
  if (!date || pieces.length < 2) return { start: null, end: null };
  return { start: date + ' ' + pieces[0], end: date + ' ' + pieces[1] };
}

function tmR4_readFreshCalendarEvent_(ctx) {
  const eventId = String(ctx.eventId || '').trim();
  let candidates = [];

  if (ctx.division === 'Install' && TASKMAP_PROJECT && TASKMAP_PROJECT.INSTALL_CALENDAR_ID) {
    candidates = [TASKMAP_PROJECT.INSTALL_CALENDAR_ID];
  } else if (ctx.division === 'Delivery' && TASKMAP_PROJECT && TASKMAP_PROJECT.DELIVERY_CALENDAR_ID) {
    candidates = [TASKMAP_PROJECT.DELIVERY_CALENDAR_ID];
  } else if (ctx.division === 'PreInspection') {
    if (typeof preinspectR3418bFindFreshCalendarEvent_ === 'function') {
      const found = preinspectR3418bFindFreshCalendarEvent_(eventId);
      if (found && found.event) {
        return {
          event: found.event,
          calendarId: found.calendarId || null,
          start: found.event.getStartTime(),
          end: found.event.getEndTime()
        };
      }
    }

    if (typeof PREINSPECT_R34 !== 'undefined' && PREINSPECT_R34.CALENDAR_ID) {
      candidates = [PREINSPECT_R34.CALENDAR_ID];
    }
  } else if (ctx.division === 'Service') {
    const keys = Object.keys((typeof TASKMAP_PROJECT !== 'undefined' && TASKMAP_PROJECT.SERVICE_CALENDARS) || {});
    candidates = keys.map(function(key) { return TASKMAP_PROJECT.SERVICE_CALENDARS[key]; }).filter(Boolean);

    if (!candidates.length && typeof SERVICE_CALENDAR_CONFIG !== 'undefined') {
      const cfg = SERVICE_CALENDAR_CONFIG || {};
      Object.keys(cfg).forEach(function(key) {
        const item = cfg[key];
        if (item && item.calendarId) candidates.push(item.calendarId);
      });
    }
  }

  const seen = {};
  for (let i = 0; i < candidates.length; i++) {
    const calendarId = String(candidates[i] || '').trim();
    if (!calendarId || seen[calendarId]) continue;
    seen[calendarId] = true;
    const cal = CalendarApp.getCalendarById(calendarId);
    if (!cal) continue;
    const event = cal.getEventById(eventId);
    if (event) {
      return {
        event: event,
        calendarId: calendarId,
        start: event.getStartTime(),
        end: event.getEndTime()
      };
    }
  }

  return null;
}

/************************************************************
 * STRIVEN — DIFF-AWARE SELECTED TASK PUSH + READBACK
 ************************************************************/
function tmR4_computeSelectedTaskDiff_(ctx, mapping, snapshot) {
  const row = mapping.row;
  const desired = tmR4_desiredTaskState_(ctx, row);
  const current = {
    start: snapshot && snapshot.start ? snapshot.start : null,
    due: snapshot && snapshot.due ? snapshot.due : null,
    soId: snapshot && snapshot.soId ? Number(snapshot.soId) : 0,
    locId: snapshot && snapshot.locId ? Number(snapshot.locId) : 0,
    conId: snapshot && snapshot.conId ? Number(snapshot.conId) : 0,
    assigneeNames: snapshot && snapshot.assigneeNames ? snapshot.assigneeNames : []
  };

  return {
    dates: !!(
      desired.start && desired.due &&
      (!preinspectSameMinuteValue_(current.start, desired.start) || !preinspectSameMinuteValue_(current.due, desired.due))
    ),
    salesOrder: !!(desired.soId && Number(current.soId || 0) !== Number(desired.soId)),
    location: !!(desired.locId && Number(current.locId || 0) !== Number(desired.locId)),
    contact: !!(desired.conId && Number(current.conId || 0) !== Number(desired.conId)),
    assignment: tmR4_assignmentNeedsChange_(ctx, desired, current),
    desired: desired,
    current: current
  };
}

function tmR4_desiredTaskState_(ctx, row) {
  const desired = {
    start: tmR4_pickRowValue_(row, ['Calendar Start', 'Hidden Calendar Start']),
    due: tmR4_pickRowValue_(row, ['Calendar End', 'Hidden Calendar End']),
    soId: tmR4_positiveNumber_(tmR4_pickRowValue_(row, ['Hidden Desired SalesOrderId', 'Sales Order ID', 'SO ID', 'SalesOrderId'])),
    locId: tmR4_positiveNumber_(tmR4_pickRowValue_(row, ['Hidden Desired LocationId', 'Location ID', 'LocationId'])),
    conId: tmR4_positiveNumber_(tmR4_pickRowValue_(row, ['Hidden Desired ContactId', 'Contact ID', 'ContactId'])),
    assignmentName: String(tmR4_pickRowValue_(row, ['Desired Assignee', 'Assigned To', 'AssignedTo', 'Technician']) || '').trim()
  };

  if ((!desired.start || !desired.due) && row['Hidden Calendar Start Date'] && row['Hidden Calendar Start Time']) {
    desired.start = String(row['Hidden Calendar Start Date']).trim() + ' ' + String(row['Hidden Calendar Start Time']).trim();
    desired.due = String(row['Hidden Calendar End Date']).trim() + ' ' + String(row['Hidden Calendar End Time']).trim();
  }

  if ((!desired.start || !desired.due) && row.Date && row.Time) {
    const parsed = tmR4_parseDateAndRange_(row.Date, row.Time);
    desired.start = desired.start || parsed.start;
    desired.due = desired.due || parsed.end;
  }

  return desired;
}

function tmR4_assignmentNeedsChange_(ctx, desired, current) {
  if (ctx.division === 'Install') return false;
  const name = tmR4_normalizeName_(desired.assignmentName);
  if (!name) return false;

  const currentNames = (current.assigneeNames || []).map(tmR4_normalizeName_);
  if (name === 'TBA') {
    return currentNames.indexOf('TBA') === -1;
  }

  return currentNames.indexOf(name) === -1;
}

function tmR4_applySelectedTaskDiff_(ctx, mapping, diff) {
  if (!diff.dates && !diff.salesOrder && !diff.location && !diff.contact && !diff.assignment) {
    return {
      status: 'NO_CHANGE_VERIFIED',
      writesPerformed: false,
      taskId: Number(ctx.taskId)
    };
  }

  const row = mapping.row;
  if (ctx.division === 'Install') {
    let mode = 'BOTH';
    const idDiff = diff.salesOrder || diff.location || diff.contact;
    if (diff.dates && !idDiff) mode = 'DATES';
    else if (!diff.dates && idDiff) mode = 'IDS';
    return pushInstallMappingRowToStriven_(mapping.sheet, ctx.rowNumber, mode);
  }

  if (ctx.division === 'Delivery') {
    const out = { status: 'PUSHED', writesPerformed: false, parts: [] };
    if (diff.dates) {
      out.parts.push(pushDeliveryTaskDatesForSelectedRows());
      out.writesPerformed = true;
    }
    if (diff.salesOrder || diff.location || diff.contact) {
      out.parts.push(pushDeliveryTaskIdsForSelectedRows());
      out.writesPerformed = true;
    }
    if (diff.assignment) {
      out.parts.push(pushDeliveryTaskAssigneesForSelectedRows_Menu());
      out.writesPerformed = true;
    }
    if (!out.writesPerformed) out.status = 'NO_CHANGE_VERIFIED';
    return out;
  }

  if (ctx.division === 'Service') {
    const out = { status: 'PUSHED', writesPerformed: false, parts: [] };
    if (diff.dates) {
      const payload = {
        Id: Number(ctx.taskId),
        StartDateTime: tm_formatStrivenDateTime_(new Date(diff.desired.start)),
        DueDateTime: tm_formatStrivenDateTime_(new Date(diff.desired.due))
      };
      out.parts.push({ field: 'DATE_TIME', result: patchStrivenTaskById_(ctx.taskId, payload) });
      out.writesPerformed = true;
    }
    if (diff.assignment) {
      out.parts.push({ field: 'ASSIGNMENT', result: pushServiceTaskAssignmentForMappingRow_(mapping.sheet, ctx.rowNumber, false) });
      out.writesPerformed = true;
    }
    if (diff.salesOrder || diff.location || diff.contact) {
      throw new Error('BLOCKED: Service selected-row mapping requires ID relationship changes, but the current Service workflow does not expose a proven ID mutation path.');
    }
    if (!out.writesPerformed) out.status = 'NO_CHANGE_VERIFIED';
    return out;
  }

  throw new Error('Unsupported division in R4 selected-row push: ' + ctx.division);
}

function tmR4_verifySelectedTaskReadBack_(ctx, mapping) {
  const desired = tmR4_desiredTaskState_(ctx, mapping.row);
  let last = null;

  for (let i = 0; i < TM_FIX_PACK_R4.READBACK_DELAYS_MS.length; i++) {
    const delay = Number(TM_FIX_PACK_R4.READBACK_DELAYS_MS[i] || 0);
    if (delay > 0) Utilities.sleep(delay);
    last = getStrivenTaskSnapshotById_(ctx.taskId, {});
    if (tmR4_taskSnapshotMatchesDesired_(ctx, desired, last)) {
      return {
        status: 'VERIFIED_COMPLETE',
        taskId: Number(ctx.taskId),
        start: last.start ? last.start.toISOString() : null,
        due: last.due ? last.due.toISOString() : null,
        soId: last.soId || null,
        locId: last.locId || null,
        conId: last.conId || null
      };
    }
  }

  throw new Error(
    'Task read-back verification failed for Task ' + ctx.taskId + '. No Calendar link write was attempted after the failed verification.'
  );
}

function tmR4_taskSnapshotMatchesDesired_(ctx, desired, snapshot) {
  if (!snapshot) return false;
  if (desired.start && !preinspectSameMinuteValue_(snapshot.start, desired.start)) return false;
  if (desired.due && !preinspectSameMinuteValue_(snapshot.due, desired.due)) return false;
  if (desired.soId && Number(snapshot.soId || 0) !== Number(desired.soId)) return false;
  if (desired.locId && Number(snapshot.locId || 0) !== Number(desired.locId)) return false;
  if (desired.conId && Number(snapshot.conId || 0) !== Number(desired.conId)) return false;

  if (ctx.division !== 'Install' && desired.assignmentName) {
    const wanted = tmR4_normalizeName_(desired.assignmentName);
    const have = (snapshot.assigneeNames || []).map(tmR4_normalizeName_);
    if (wanted && wanted !== 'TBA' && have.indexOf(wanted) === -1) return false;
  }
  return true;
}

/************************************************************
 * CALENDAR LINK — FINAL READBACK
 ************************************************************/
function tmR4_verifySelectedCalendarLink_(ctx) {
  const fresh = tmR4_readFreshCalendarEvent_(ctx);
  if (!fresh || !fresh.event) {
    throw new Error('Calendar link read-back failed: event no longer exists.');
  }

  const description = String(fresh.event.getDescription() || '');
  const taskUrl = STL_TASK_BASE_URL + encodeURIComponent(ctx.taskId);

  if (description.indexOf(taskUrl) === -1) {
    throw new Error('Calendar link read-back failed: Task ' + ctx.taskId + ' link is not present after write.');
  }

  return {
    status: 'VERIFIED_COMPLETE',
    eventId: ctx.eventId,
    taskId: Number(ctx.taskId)
  };
}

/************************************************************
 * AUTO RECOVERY — SHARED 24-HOUR COMPLETION GUARD
 * Existing taskRecoveryAutoCompletedTaskSourceGuard_ delegates here.
 ************************************************************/
function tmR4_taskRecoveryAutoCompletedTaskSourceGuard_(taskId) {
  const cleanTaskId = taskRecoveryPositiveNumber_(taskId);

  if (!cleanTaskId) {
    return {
      ok: false,
      status: 'SKIPPED_COMPLETION_DATE_UNKNOWN',
      reason: 'Automatic recovery has no valid completed source Task ID.'
    };
  }

  if (typeof getStrivenTaskById_ !== 'function') {
    return {
      ok: false,
      status: 'SKIPPED_COMPLETION_DATE_UNKNOWN',
      taskId: cleanTaskId,
      reason: 'Automatic recovery cannot fresh-read the Striven source task.'
    };
  }

  const task = getStrivenTaskById_(cleanTaskId);
  if (!task || !Object.keys(task).length) {
    return {
      ok: false,
      status: 'SKIPPED_COMPLETION_DATE_UNKNOWN',
      taskId: cleanTaskId,
      reason: 'Fresh Striven source task returned no data.'
    };
  }

  const rawStatus = task.status || task.Status || task.taskStatus || task.TaskStatus || '';
  const statusName = taskRecoveryNormalizeStatus_(
    rawStatus && typeof rawStatus === 'object'
      ? (rawStatus.name || rawStatus.Name || rawStatus.status || rawStatus.Status || '')
      : rawStatus
  );

  if (!taskRecoveryIsCompletedStatus_(statusName)) {
    return {
      ok: false,
      status: 'SKIPPED_SOURCE_NOT_COMPLETED',
      taskId: cleanTaskId,
      sourceStatus: statusName,
      reason: 'Fresh source Task #' + cleanTaskId + ' is no longer completed. Automatic RECREATE skipped.'
    };
  }

  const completion = taskRecoveryAutoExtractCompletionEvidence_(task);
  if (!completion || !completion.date || isNaN(completion.date.getTime())) {
    return {
      ok: false,
      status: 'SKIPPED_COMPLETION_DATE_UNKNOWN',
      taskId: cleanTaskId,
      sourceStatus: statusName,
      reason: 'Task #' + cleanTaskId + ' is completed, but its completion/status-change timestamp cannot be proven. Automatic RECREATE skipped.'
    };
  }

  const now = new Date();
  const ageMs = now.getTime() - completion.date.getTime();
  const ageHours = ageMs / 3600000;
  const timeZone = taskRecoveryAutoBusinessTimeZone_();

  if (ageMs < 0) {
    return {
      ok: false,
      status: 'SKIPPED_COMPLETION_DATE_UNKNOWN',
      taskId: cleanTaskId,
      sourceStatus: statusName,
      completionField: completion.field,
      completionEvidence: completion.evidence,
      completionDateTime: completion.date.toISOString(),
      reason: 'Task #' + cleanTaskId + ' has a future completion/status-change timestamp. Automatic RECREATE skipped for review.'
    };
  }

  if (ageHours < TM_FIX_PACK_R4.RECENT_COMPLETION_HOURS) {
    // Keep legacy status token for compatibility with existing counters/branches.
    return {
      ok: false,
      status: 'SKIPPED_COMPLETED_TODAY',
      recentCompletion24h: true,
      protectionWindowHours: TM_FIX_PACK_R4.RECENT_COMPLETION_HOURS,
      taskId: cleanTaskId,
      sourceStatus: statusName,
      completionField: completion.field,
      completionEvidence: completion.evidence,
      completionDateTime: completion.date.toISOString(),
      hoursAgo: Math.round(ageHours * 100) / 100,
      businessDate: Utilities.formatDate(completion.date, timeZone, 'yyyy-MM-dd'),
      reason: 'Task #' + cleanTaskId + ' was completed/changed to completed within the last 24 hours. Automatic RECREATE skipped.'
    };
  }

  return {
    ok: true,
    status: 'COMPLETED_SOURCE_ELIGIBLE',
    recentCompletion24h: false,
    taskId: cleanTaskId,
    sourceStatus: statusName,
    completionField: completion.field,
    completionEvidence: completion.evidence,
    completionDateTime: completion.date.toISOString(),
    hoursAgo: Math.round(ageHours * 100) / 100,
    businessDate: Utilities.formatDate(completion.date, timeZone, 'yyyy-MM-dd'),
    reason: 'Completed source Task is outside the 24-hour protection window.'
  };
}

/************************************************************
 * SERVICE CALENDAR LINKS — EVENT LEVEL TASK SET
 ************************************************************/
function tmR4_pushSelectedServiceCalendarEventTaskSet_(dryRun) {
  const ctx = tmSelectedRowE2EReadContext_();
  if (ctx.division !== 'Service') {
    throw new Error('Select a row in Service Task Mapping.');
  }

  const model = tmR4_buildServiceEventLinkModel_(ctx.eventId);
  return tmR4_applyServiceEventLinkModel_(model, !!dryRun);
}

function tmR4_pushCalendarLinksForAllReadyMappingRows() {
  return tmR4_runAllCalendarLinkPipelines_(false);
}

function tmR4_dryRunCalendarLinksForAllReadyMappingRows() {
  return tmR4_runAllCalendarLinkPipelines_(true);
}

function tmR4_pushServiceCalendarLinksForReadyRows() {
  return tmR4_runServiceCalendarLinkPipeline_(false, 0);
}

function tmR4_dryRunServiceCalendarLinksForReadyRows() {
  return tmR4_runServiceCalendarLinkPipeline_(true, 0);
}

function tmR4_runAllCalendarLinkPipelines_(dryRun) {
  const install = stlRunCalendarLinkPipelineStageForDivision_('INSTALL', !!dryRun);
  const delivery = stlRunCalendarLinkPipelineStageForDivision_('DELIVERY', !!dryRun);
  const service = tmR4_runServiceCalendarLinkPipeline_(!!dryRun, 0);

  return {
    mode: dryRun ? 'DRY_RUN' : 'PUSH',
    status: 'COMPLETE',
    install: install,
    delivery: delivery,
    service: service
  };
}

function tmR4_runServiceCalendarLinkPipeline_(dryRun, limitEvents) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss && ss.getSheetByName('Service Task Mapping');
  if (!sheet) throw new Error('Missing Service Task Mapping sheet.');

  const data = sheet.getDataRange().getDisplayValues();
  if (!data.length) return { status: 'NO_ROWS', events: [] };

  const headers = data[0].map(function(v) { return String(v || '').trim(); });
  const eventIdx = headers.indexOf('Event ID');
  if (eventIdx < 0) throw new Error('Service Task Mapping is missing Event ID.');

  const eventIds = [];
  const seen = {};
  for (let r = 1; r < data.length; r++) {
    const eventId = String(data[r][eventIdx] || '').trim();
    if (!eventId || seen[eventId]) continue;
    seen[eventId] = true;
    eventIds.push(eventId);
  }

  const max = Number(limitEvents || 0) > 0 ? Math.min(eventIds.length, Number(limitEvents)) : eventIds.length;
  const results = [];

  for (let i = 0; i < max; i++) {
    const model = tmR4_buildServiceEventLinkModel_(eventIds[i]);
    if (!model.eligible) {
      results.push({ eventId: model.eventId, status: 'REVIEW', reason: model.reason });
      continue;
    }
    results.push(tmR4_applyServiceEventLinkModel_(model, !!dryRun));
  }

  return {
    mode: dryRun ? 'DRY_RUN' : 'PUSH',
    status: 'COMPLETE',
    eventCount: max,
    events: results
  };
}

function tmR4_buildServiceEventLinkModel_(eventId) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss && ss.getSheetByName('Service Task Mapping');
  if (!sheet) throw new Error('Missing Service Task Mapping sheet.');

  const values = sheet.getDataRange().getDisplayValues();
  if (!values.length) throw new Error('Service Task Mapping is empty.');

  const headers = values[0].map(function(v) { return String(v || '').trim(); });
  const idx = {};
  headers.forEach(function(name, i) { idx[name] = i; });

  ['Event ID', 'Task ID'].forEach(function(name) {
    if (idx[name] === undefined) throw new Error('Service Task Mapping is missing ' + name + '.');
  });

  const rows = [];
  for (let r = 1; r < values.length; r++) {
    if (String(values[r][idx['Event ID']] || '').trim() !== String(eventId || '').trim()) continue;
    const row = {};
    headers.forEach(function(name, c) { row[name] = values[r][c]; });
    row.__rowNumber = r + 1;
    rows.push(row);
  }

  if (!rows.length) {
    return { eligible: false, eventId: eventId, reason: 'No Service mapping rows found for event.' };
  }

  const blocking = rows.filter(function(row) {
    const status = String(row.Status || '').trim().toUpperCase();
    const taskId = tmR4_positiveNumber_(row['Task ID']);
    return !taskId || status === 'REVIEW' || status === 'SKIP' || status === 'NOT MATCHED';
  });

  if (blocking.length) {
    return {
      eligible: false,
      eventId: eventId,
      reason: 'Service event has incomplete/blocked sibling mapping rows; aggregated Calendar link write was blocked.',
      blockedRows: blocking.map(function(row) { return row.__rowNumber; })
    };
  }

  const taskMap = {};
  rows.forEach(function(row) {
    const taskId = tmR4_positiveNumber_(row['Task ID']);
    if (taskId) taskMap[taskId] = row;
  });
  const taskIds = Object.keys(taskMap).map(Number).sort(function(a, b) { return a - b; });

  const salesOrders = {};
  rows.forEach(function(row) {
    const so = String(row['SO #'] || row['Sales Order #'] || '').trim();
    if (so) salesOrders[so] = true;
  });
  const soNumbers = Object.keys(salesOrders);

  if (soNumbers.length > 1) {
    return {
      eligible: false,
      eventId: eventId,
      reason: 'Service event maps to multiple Sales Order numbers; aggregated link write requires review.',
      salesOrders: soNumbers
    };
  }

  return {
    eligible: true,
    eventId: String(eventId || '').trim(),
    rows: rows,
    taskIds: taskIds,
    taskRows: taskMap,
    salesOrderNumber: soNumbers.length === 1 ? soNumbers[0] : ''
  };
}

function tmR4_applyServiceEventLinkModel_(model, dryRun) {
  if (!model || !model.eligible) {
    return { status: 'REVIEW', eventId: model && model.eventId, reason: model && model.reason };
  }

  const ctx = {
    division: 'Service',
    eventId: model.eventId
  };
  const fresh = tmR4_readFreshCalendarEvent_(ctx);
  if (!fresh || !fresh.event) {
    throw new Error('Service Calendar event not found for aggregated link write: ' + model.eventId);
  }

  const original = String(fresh.event.getDescription() || '');
  const cleaned = stlRemoveManagedBlocksFromDescription_(original, 'SERVICE');
  const links = [];

  if (model.salesOrderNumber) {
    links.push({
      label: 'Sales Order #' + model.salesOrderNumber,
      url: STL_SALES_ORDER_BASE_URL + encodeURIComponent(model.salesOrderNumber)
    });
  }

  model.taskIds.forEach(function(taskId) {
    const row = model.taskRows[taskId] || {};
    links.push({
      label: 'Task #' + taskId + (row['Task Name'] ? ' - ' + row['Task Name'] : ''),
      url: STL_TASK_BASE_URL + encodeURIComponent(taskId)
    });
  });

  if (!links.length) {
    return { status: 'NO_LINKS', eventId: model.eventId, taskIds: model.taskIds };
  }

  let block = '<br><br>------- Striven Links -------<br>';
  links.forEach(function(link) {
    block += '<a href="' + link.url + '">' + String(link.label || '') + '</a><br>';
  });
  block += '------------------------------------';

  const next = String(cleaned || '').replace(/\s+$/g, '') + block;
  const result = {
    status: dryRun ? 'WOULD_WRITE' : 'WRITTEN',
    eventId: model.eventId,
    taskIds: model.taskIds,
    salesOrderNumber: model.salesOrderNumber || null,
    writeCount: dryRun ? 0 : 1,
    previewLength: next.length
  };

  if (dryRun) return result;

  fresh.event.setDescription(next);

  const readBack = tmR4_readFreshCalendarEvent_(ctx);
  if (!readBack || !readBack.event) {
    throw new Error('Service Calendar event disappeared after aggregated link write.');
  }
  const actual = String(readBack.event.getDescription() || '');

  for (let i = 0; i < model.taskIds.length; i++) {
    const url = STL_TASK_BASE_URL + encodeURIComponent(model.taskIds[i]);
    if (actual.indexOf(url) === -1) {
      throw new Error('Service Calendar read-back is missing Task #' + model.taskIds[i] + ' after aggregated write.');
    }
  }
  if (model.salesOrderNumber) {
    const soUrl = STL_SALES_ORDER_BASE_URL + encodeURIComponent(model.salesOrderNumber);
    if (actual.indexOf(soUrl) === -1) {
      throw new Error('Service Calendar read-back is missing Sales Order link after aggregated write.');
    }
  }

  result.readBackVerified = true;
  return result;
}

/************************************************************
 * REPORT SAFETY — VALIDATED SHAPE + PAGINATION CAP
 * Existing tm_fetchAllReportRows_ delegates here.
 ************************************************************/
function tmR4_extractValidatedReportRows_(json, label, pageIndex) {
  const name = String(label || 'Striven report');
  const page = Number(pageIndex || 0);

  if (Array.isArray(json)) {
    return { rows: json, shape: 'ARRAY' };
  }

  if (!json || typeof json !== 'object') {
    throw new Error(name + ' PageIndex=' + page + ' returned an invalid JSON shape.');
  }

  const keys = ['data', 'Data', 'rows', 'Rows', 'Items', 'items'];
  for (let i = 0; i < keys.length; i++) {
    if (Object.prototype.hasOwnProperty.call(json, keys[i])) {
      if (!Array.isArray(json[keys[i]])) {
        throw new Error(name + ' PageIndex=' + page + ' field ' + keys[i] + ' is not an array. Last-known-good sheet was preserved.');
      }
      return { rows: json[keys[i]], shape: keys[i] };
    }
  }

  throw new Error(
    name + ' PageIndex=' + page + ' HTTP succeeded but no recognized report row array was found. Last-known-good sheet was preserved.'
  );
}

function tmR4_validateReportRowObjects_(rows, label, pageIndex) {
  for (let i = 0; i < (rows || []).length; i++) {
    const row = rows[i];
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      throw new Error(
        label + ' PageIndex=' + pageIndex + ' returned a non-object report row at index ' + i + '. Last-known-good sheet was preserved.'
      );
    }
  }
}

function tmR4_fetchAllReportRowsValidated_(config) {
  const label = config && config.name ? config.name : 'Striven report';
  const url = config && config.url ? config.url : '';
  if (!url) throw new Error(label + ' URL is blank.');

  const pageSize = Number(config.pageSize || TASKMAP_PROJECT.API.DEFAULT_PAGE_SIZE || 10000);
  const maxPages = Number(config.maxPages || TASKMAP_PROJECT.API.MAX_PAGES || 50);
  const headers = tm_getStrivenHeaders_();
  const allRows = [];
  let terminated = false;

  for (let pageIndex = 0; pageIndex < maxPages; pageIndex++) {
    const pagedUrl = tm_buildPagedUrl_(url, pageIndex, pageSize);
    const result = tm_fetchJson_(pagedUrl, { method: 'get', headers: headers });
    tm_assertSuccessfulApiResponse_(label + ' PageIndex=' + pageIndex, result);

    const extracted = tmR4_extractValidatedReportRows_(result.json, label, pageIndex);
    const rows = extracted.rows;
    tmR4_validateReportRowObjects_(rows, label, pageIndex);

    if (!rows.length) {
      terminated = true;
      break;
    }

    Array.prototype.push.apply(allRows, rows);

    if (rows.length < pageSize) {
      terminated = true;
      break;
    }
  }

  if (!terminated) {
    throw new Error(
      label + ' reached maxPages=' + maxPages + ' with a full final page. Possible pagination truncation; last-known-good sheet was preserved.'
    );
  }

  return allRows;
}

function tmR4_fetchSingleReportRowsValidated_(url, label) {
  if (!url) throw new Error((label || 'Service report') + ' URL is blank.');

  const response = UrlFetchApp.fetch(url, {
    method: 'get',
    headers: tm_getStrivenHeaders_(),
    muteHttpExceptions: true
  });

  const code = response.getResponseCode();
  const text = response.getContentText();
  if (code < 200 || code >= 300) {
    throw new Error((label || 'Service report') + ' fetch failed. HTTP ' + code + '. Response: ' + String(text || '').slice(0, 1000));
  }

  let body;
  try {
    body = JSON.parse(text || '{}');
  } catch (err) {
    throw new Error((label || 'Service report') + ' returned non-JSON. Last-known-good sheet was preserved.');
  }

  const extracted = tmR4_extractValidatedReportRows_(body, label || 'Service report', 0);
  tmR4_validateReportRowObjects_(extracted.rows, label || 'Service report', 0);
  return extracted.rows;
}

/************************************************************
 * CONTROL TOWER — LEGACY VS TM2, EXCEPTIONS FIRST
 ************************************************************/
function showTaskMappingControlTowerR4() {
  const data = tmR4_buildControlTowerData_();
  const html = tmR4_controlTowerHtml_(data);
  const output = HtmlService.createHtmlOutput(html)
    .setWidth(1180)
    .setHeight(720);
  SpreadsheetApp.getUi().showModalDialog(output, 'Task Mapping Control Tower');
  return data;
}

function tmR4_buildControlTowerData_() {
  const workflows = ['Install', 'Delivery', 'Service', 'PreInspection'];
  const out = {
    version: TM_FIX_PACK_R4.VERSION,
    generatedAt: new Date().toISOString(),
    workflows: {},
    exceptions: []
  };

  workflows.forEach(function(workflow) {
    const source = tm2_readMappingProjection_(workflow, 500);
    const summary = { total: 0, matched: 0, ready: 0, attention: 0 };

    if (!source || source.status === TM2_ENDPOINT.BLOCKED) {
      out.workflows[workflow] = summary;
      out.exceptions.push({ workflow: workflow, legacyStatus: 'BLOCKED', tm2Endpoint: 'BLOCKED', reason: source && source.reason || 'Mapping source unavailable' });
      return;
    }

    source.rows.forEach(function(row, i) {
      const record = tm2_buildShadowRecord_(workflow, source.headers, row, source.headerRow + i + 1);
      const plan = tm2_planShadowRecord_(record);
      const legacy = String(record.identity.mappingStatus || '').trim().toUpperCase();
      summary.total++;
      if (legacy === 'MATCHED') summary.matched++;
      else if (legacy.indexOf('READY') === 0) summary.ready++;
      else summary.attention++;

      if (legacy !== 'MATCHED' || plan.endpoint === TM2_ENDPOINT.REVIEW_REQUIRED || plan.endpoint === TM2_ENDPOINT.BLOCKED || plan.endpoint === TM2_ENDPOINT.DEFERRED_RETRY) {
        out.exceptions.push({
          workflow: workflow,
          row: record.rowNumber,
          legacyStatus: legacy || 'UNSET',
          taskStatus: record.identity.taskStatus || '',
          tm2Endpoint: plan.endpoint,
          reason: plan.reason || ''
        });
      }
    });

    out.workflows[workflow] = summary;
  });

  return out;
}

function tmR4_controlTowerHtml_(data) {
  function esc(value) {
    return String(value === null || value === undefined ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  const cards = Object.keys(data.workflows).map(function(name) {
    const s = data.workflows[name];
    return '<div class="card"><div class="name">' + esc(name) + '</div>' +
      '<div class="counts"><span>Matched <b>' + s.matched + '</b></span><span>Ready <b>' + s.ready + '</b></span><span>Attention <b>' + s.attention + '</b></span></div></div>';
  }).join('');

  const rows = data.exceptions.slice(0, 250).map(function(item) {
    return '<tr><td>' + esc(item.workflow) + '</td><td>' + esc(item.row || '') + '</td><td>' + esc(item.legacyStatus) + '</td><td>' + esc(item.taskStatus) + '</td><td>' + esc(item.tm2Endpoint) + '</td><td>' + esc(item.reason) + '</td></tr>';
  }).join('');

  return '<!doctype html><html><head><base target="_top"><style>' +
    'body{font-family:Arial,sans-serif;margin:0;padding:22px;background:#f7f7f7;color:#222}' +
    'h1{font-size:22px;margin:0 0 6px}.sub{color:#666;font-size:12px;margin-bottom:18px}' +
    '.cards{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:18px}.card{background:white;border:1px solid #ddd;border-radius:10px;padding:14px}.name{font-weight:700;margin-bottom:10px}.counts{display:flex;gap:12px;font-size:12px}.counts span{background:#f1f1f1;border-radius:12px;padding:5px 8px}' +
    '.panel{background:white;border:1px solid #ddd;border-radius:10px;padding:14px}.panel h2{font-size:16px;margin:0 0 10px}' +
    'table{border-collapse:collapse;width:100%;font-size:12px}th,td{text-align:left;padding:8px;border-bottom:1px solid #eee;vertical-align:top}th{position:sticky;top:0;background:#fafafa}.tablewrap{max-height:500px;overflow:auto}' +
    '</style></head><body><h1>Task Mapping Control Tower</h1><div class="sub">' + esc(data.version) + ' · Exceptions first · Legacy status and TM2 endpoint are shown separately.</div>' +
    '<div class="cards">' + cards + '</div><div class="panel"><h2>Needs Attention / Difference Queue</h2><div class="tablewrap"><table><thead><tr><th>Workflow</th><th>Row</th><th>Legacy</th><th>Task</th><th>TM2</th><th>Reason</th></tr></thead><tbody>' + rows + '</tbody></table></div></div></body></html>';
}

/************************************************************
 * READ-ONLY REGRESSION SUITE
 ************************************************************/
function runTaskMappingFixPackR4Regression() {
  const result = {
    version: TM_FIX_PACK_R4.VERSION,
    mode: 'READ_ONLY_REGRESSION',
    reportParser: tmR4_testReportParser_(),
    tm2: typeof tm2_testSuite === 'function' ? tm2_testSuite() : { status: 'MISSING' },
    serviceCalendarLinksDryRun: tmR4_runServiceCalendarLinkPipeline_(true, TM_FIX_PACK_R4.SERVICE_LINK_LIMIT_EVENTS),
    controlTower: tmR4_buildControlTowerData_(),
    businessWritesPerformed: false
  };
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

function tmR4_testReportParser_() {
  const validEmpty = tmR4_extractValidatedReportRows_({ data: [] }, 'TEST', 0);
  const validRows = tmR4_extractValidatedReportRows_({ Data: [{ A: 1 }] }, 'TEST', 0);
  let invalidShapeBlocked = false;
  try {
    tmR4_extractValidatedReportRows_({ message: 'ok' }, 'TEST', 0);
  } catch (err) {
    invalidShapeBlocked = true;
  }

  if (!validEmpty || validEmpty.rows.length !== 0 || !validRows || validRows.rows.length !== 1 || !invalidShapeBlocked) {
    throw new Error('R4 report parser regression failed.');
  }

  return {
    status: 'PASS',
    validEmptyRecognized: true,
    validRowsRecognized: true,
    invalidShapeBlocked: true
  };
}

/************************************************************
 * R4.5 — PREINSPECTION PM PATCH QUARANTINE + DIAGNOSTIC
 *
 * Safety:
 * - Read-only diagnostic only.
 * - No Striven or Calendar write is performed here.
 * - Known-bad Task Type 105 afternoon PATCH attempts are blocked
 *   before mutation by tmR45AssertPreInspectDateTimePatchSafe_.
 ************************************************************/
function tmR45PreInspectLocalHour_(value) {
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return null;

  let tz = 'America/Toronto';
  if (typeof preinspectR3418bTimezone_ === 'function') {
    tz = preinspectR3418bTimezone_() || tz;
  } else if (typeof tm_getTimezone_ === 'function') {
    tz = tm_getTimezone_() || tz;
  }

  const h = Number(Utilities.formatDate(d, tz, 'H'));
  return isFinite(h) ? h : null;
}

function tmR45AssertPreInspectDateTimePatchSafe_(taskId, payload) {
  const fields = ['StartDateTime', 'DueDateTime'];
  const unsafe = [];

  fields.forEach(function(field) {
    if (
      !payload ||
      payload[field] === null ||
      payload[field] === undefined ||
      String(payload[field]).trim() === ''
    ) {
      return;
    }

    const hour = tmR45PreInspectLocalHour_(payload[field]);
    if (hour !== null && hour >= 13) {
      unsafe.push({
        field: field,
        hour24: hour,
        value: String(payload[field])
      });
    }
  });

  if (!unsafe.length) {
    return {
      status: 'SAFE_FOR_KNOWN_PATCH_DEFECT',
      taskId: Number(taskId),
      fieldsChecked: fields
    };
  }

  throw new Error(
    'BLOCKED_STRIVEN_PI_PM_PATCH_DEFECT: PreInspection Task Type 105 PM schedule PATCH is quarantined. ' +
    'Repeated authoritative read-backs showed Striven /v2/tasks/{id} storing hours 13-23 twelve hours early. ' +
    'Task=' + taskId + '; Unsafe=' + JSON.stringify(unsafe) + '. No Striven write attempted. ' +
    'Run Pre Inspect > Diagnostics / Preview > Diagnose Selected PI Date/Time for read-only v1/v2 evidence.'
  );
}

function tmR45PickDateField_(obj, names) {
  obj = obj && typeof obj === 'object' ? obj : {};

  for (let i = 0; i < names.length; i++) {
    if (obj[names[i]] !== undefined && obj[names[i]] !== null) {
      return obj[names[i]];
    }
  }

  return null;
}

function tmR45ReadTaskDateModels_(taskId) {
  const auth = preinspectR30ApiAuth_();
  let base = String(auth.apiBaseUrl || 'https://api.striven.com');
  while (base.slice(-1) === '/') base = base.slice(0, -1);

  const result = {
    taskId: Number(taskId),
    v2: null,
    v1: null,
    errors: []
  };

  try {
    const v2res = preinspectR30Request_(
      'get',
      base + '/v2/tasks/' + encodeURIComponent(taskId),
      null,
      'R45_V2_TASK_READ'
    );
    const v2 = v2res && v2res.json && typeof v2res.json === 'object'
      ? v2res.json
      : {};

    result.v2 = {
      statusCode: v2res.statusCode,
      startDateTime: tmR45PickDateField_(v2, [
        'startDateTime', 'StartDateTime', 'startDate', 'StartDate'
      ]),
      dueDateTime: tmR45PickDateField_(v2, [
        'dueDateTime', 'DueDateTime', 'dueDate', 'DueDate'
      ]),
      dateModified: tmR45PickDateField_(v2, [
        'dateModified', 'DateModified', 'modifiedDate', 'ModifiedDate'
      ]),
      taskType: tmR45PickDateField_(v2, [
        'taskType', 'TaskType', 'type', 'Type'
      ]),
      status: tmR45PickDateField_(v2, ['status', 'Status'])
    };
  } catch (err) {
    result.errors.push({
      source: 'v2',
      message: String(err && err.message ? err.message : err)
    });
  }

  try {
    const v1res = preinspectR30Request_(
      'get',
      base + '/v1/tasks/' + encodeURIComponent(taskId),
      null,
      'R45_V1_TASK_READ'
    );
    const v1 = v1res && v1res.json && typeof v1res.json === 'object'
      ? v1res.json
      : {};

    result.v1 = {
      statusCode: v1res.statusCode,
      desiredStartDate: tmR45PickDateField_(v1, [
        'desiredStartDate', 'DesiredStartDate', 'startDate', 'StartDate'
      ]),
      desiredEndDate: tmR45PickDateField_(v1, [
        'desiredEndDate', 'DesiredEndDate', 'dueDate', 'DueDate'
      ]),
      dateRequested: tmR45PickDateField_(v1, [
        'dateRequested', 'DateRequested'
      ]),
      dateModified: tmR45PickDateField_(v1, [
        'dateModified', 'DateModified'
      ]),
      taskTypeId: tmR45PickDateField_(v1, [
        'taskTypeId', 'TaskTypeId', 'taskTypeID', 'TaskTypeID'
      ]),
      status: tmR45PickDateField_(v1, ['status', 'Status']),
      statusId: tmR45PickDateField_(v1, [
        'statusId', 'StatusId', 'statusID', 'StatusID'
      ])
    };
  } catch (err) {
    result.errors.push({
      source: 'v1',
      message: String(err && err.message ? err.message : err)
    });
  }

  return result;
}

function inspectSelectedPreInspectDateTimeTransportR45() {
  const ctx = tmSelectedRowE2EReadContext_();

  if (!ctx || ctx.division !== 'PreInspection') {
    throw new Error('Select a PreInspect Task Mapping data row first.');
  }
  if (!ctx.taskId) {
    throw new Error('Selected PreInspection row has no Task ID.');
  }

  const freshCalendar = tmR4_assertSelectedCalendarFresh_(ctx);
  const mapping = tmR4_readSelectedMapping_(ctx);
  const row = mapping.row || {};

  let preview = null;
  try {
    preview = JSON.parse(String(row['Patch Preview'] || '').trim() || '{}');
  } catch (err) {
    preview = {
      parseError: String(err && err.message ? err.message : err)
    };
  }

  const selected = tmR45ReadTaskDateModels_(ctx.taskId);
  const controlTaskId = 18309;
  const control = Number(ctx.taskId) === controlTaskId
    ? null
    : tmR45ReadTaskDateModels_(controlTaskId);

  const result = {
    mode: 'PREINSPECT_R45_DATETIME_TRANSPORT_DIAGNOSTIC',
    status: 'READ_ONLY_COMPLETE',
    writesPerformed: false,
    strivenWritesPerformed: false,
    calendarWritesPerformed: false,
    mappingRow: ctx.rowNumber,
    eventId: ctx.eventId,
    taskId: Number(ctx.taskId),
    mapping: {
      calendarStart: String(row['Calendar Start'] || ''),
      calendarEnd: String(row['Calendar End'] || ''),
      taskStart: String(row['Task Start'] || ''),
      taskDue: String(row['Task Due'] || ''),
      taskAction: String(row['Task Action'] || ''),
      patchPreview: preview
    },
    freshCalendar: freshCalendar,
    selectedTaskModels: selected,
    knownCorrectPmReferenceTaskId: controlTaskId,
    knownCorrectPmReferenceModels: control,
    safety: 'READ_ONLY_NO_STRIVEN_OR_CALENDAR_WRITE',
    purpose: 'Compare v2 StartDateTime/DueDateTime with legacy v1 DesiredStartDate/DesiredEndDate before selecting an alternate supported update path.'
  };

  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

/************************************************************
 * 98_6_All_Rows_Verification.js
 *
 * PUBLIC FUNCTION:
 *   VERIFY_ALL_ROWS_ALL_VERTICALS
 *
 * Purpose:
 * - Verify every nonblank mapping row across Install, Delivery,
 *   Service, and PreInspection.
 * - Refresh the smaller operational source reports/calendars.
 * - Rebuild mappings before verification.
 * - Batch-read each unique mapped Striven task once.
 * - Verify relationship IDs, mapping action flags, assignment IDs,
 *   and Calendar managed links.
 * - Write a durable audit table to "TM All Rows Verification".
 *
 * Safety:
 * - NO Striven task PATCH/POST/PUT/DELETE.
 * - NO Google Calendar writes.
 * - Sheet writes are limited to source-cache refreshes, mapping rebuilds,
 *   PreInspect read-only lookup hydration, and this verification report.
 ************************************************************/

const TM_ALL_ROWS_VERIFY = Object.freeze({
  VERSION: 'TM_ALL_ROWS_VERIFY_R1_20260921',
  REPORT_SHEET: 'TM All Rows Verification',
  TIME_ZONE: 'America/Toronto',
  TASK_FETCH_BATCH_SIZE: 40,
  PROFILES: [
    { division: 'Install', mappingSheet: 'Install Task Mapping', calendarSheet: 'Install Calendar' },
    { division: 'Delivery', mappingSheet: 'Delivery Task Mapping', calendarSheet: 'Deliveries Calendar' },
    { division: 'Service', mappingSheet: 'Service Task Mapping', calendarSheet: 'Service Tech Calendar' },
    { division: 'PreInspection', mappingSheet: 'PreInspect Task Mapping', calendarSheet: 'PreInspect Calendar' }
  ]
});

function VERIFY_ALL_ROWS_ALL_VERTICALS() {
  const started = new Date();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('No active spreadsheet.');

  const audit = {
    version: TM_ALL_ROWS_VERIFY.VERSION,
    mode: 'ALL_ROWS_ALL_VERTICALS_VERIFICATION',
    startedAt: started.toISOString(),
    businessWritesPerformed: false,
    strivenWritesPerformed: false,
    calendarWritesPerformed: false,
    preparation: [],
    taskRead: {},
    summary: {},
    reportSheet: TM_ALL_ROWS_VERIFY.REPORT_SHEET
  };

  // Operational refreshes only. Customer/location big-data caches are reused.
  tmAllVerifyPrep_(audit, 'Refresh Install Calendar', function() {
    return typeof syncInstallCalendarToSheet === 'function'
      ? syncInstallCalendarToSheet()
      : { status: 'FUNCTION_MISSING' };
  });
  tmAllVerifyPrep_(audit, 'Refresh Delivery Calendar', function() {
    return typeof syncDeliveriesCalendarToSheet === 'function'
      ? syncDeliveriesCalendarToSheet()
      : { status: 'FUNCTION_MISSING' };
  });
  tmAllVerifyPrep_(audit, 'Refresh Service Calendars', function() {
    if (typeof syncServiceTechCalendarsToSheet === 'function') return syncServiceTechCalendarsToSheet();
    if (typeof syncServiceTechCalendarToSheet === 'function') return syncServiceTechCalendarToSheet();
    return { status: 'FUNCTION_MISSING' };
  });
  tmAllVerifyPrep_(audit, 'Refresh PreInspection Calendar', function() {
    return typeof syncPreInspectCalendarNow === 'function'
      ? syncPreInspectCalendarNow()
      : { status: 'FUNCTION_MISSING' };
  });

  tmAllVerifyPrep_(audit, 'Refresh Approved Sales Orders', function() {
    return typeof syncApprovedSalesOrdersToSheet === 'function'
      ? syncApprovedSalesOrdersToSheet()
      : { status: 'FUNCTION_MISSING' };
  });
  tmAllVerifyPrep_(audit, 'Refresh Install Tasks', function() {
    return typeof syncStrivenTasksToSheet === 'function'
      ? syncStrivenTasksToSheet()
      : (typeof syncInstallTasksToSheet === 'function'
        ? syncInstallTasksToSheet()
        : { status: 'FUNCTION_MISSING' });
  });
  tmAllVerifyPrep_(audit, 'Refresh Delivery Approved Orders', function() {
    return typeof syncDeliveryApprovedOrdersToSheet === 'function'
      ? syncDeliveryApprovedOrdersToSheet()
      : { status: 'FUNCTION_MISSING' };
  });
  tmAllVerifyPrep_(audit, 'Refresh Delivery Tasks', function() {
    return typeof syncDeliveryTasksToSheet === 'function'
      ? syncDeliveryTasksToSheet()
      : (typeof syncStrivenDeliveryTasksToSheet === 'function'
        ? syncStrivenDeliveryTasksToSheet()
        : { status: 'FUNCTION_MISSING' });
  });
  tmAllVerifyPrep_(audit, 'Refresh Service Work Orders', function() {
    return typeof syncStrivenServiceWorkOrdersToSheet === 'function'
      ? syncStrivenServiceWorkOrdersToSheet()
      : (typeof syncServiceWorkOrdersToSheet === 'function'
        ? syncServiceWorkOrdersToSheet()
        : { status: 'FUNCTION_MISSING' });
  });
  tmAllVerifyPrep_(audit, 'Refresh Service Tasks', function() {
    return typeof syncStrivenServiceTasksToSheet === 'function'
      ? syncStrivenServiceTasksToSheet()
      : (typeof syncServiceTasksToSheet === 'function'
        ? syncServiceTasksToSheet()
        : { status: 'FUNCTION_MISSING' });
  });

  tmAllVerifyPrep_(audit, 'Rebuild Install Mapping', function() {
    if (typeof buildInstallTaskMappingFromSheets !== 'function') throw new Error('Missing buildInstallTaskMappingFromSheets');
    return buildInstallTaskMappingFromSheets();
  });
  tmAllVerifyPrep_(audit, 'Rebuild Delivery Mapping', function() {
    if (typeof buildDeliveryTaskMappingFromSheets !== 'function') throw new Error('Missing buildDeliveryTaskMappingFromSheets');
    const built = buildDeliveryTaskMappingFromSheets();
    const ids = typeof fillDeliveryMappingIdsFromDeliveryApprovedOrdersFinal === 'function'
      ? fillDeliveryMappingIdsFromDeliveryApprovedOrdersFinal()
      : { status: 'ID_FILL_FUNCTION_MISSING' };
    return { build: built, idFill: ids };
  });
  tmAllVerifyPrep_(audit, 'Rebuild Service Mapping', function() {
    if (typeof buildServiceTaskMappingFromSheets !== 'function') throw new Error('Missing buildServiceTaskMappingFromSheets');
    return buildServiceTaskMappingFromSheets();
  });
  tmAllVerifyPrep_(audit, 'Rebuild PreInspection Mapping', function() {
    if (typeof buildPreInspectTaskMapping !== 'function') throw new Error('Missing buildPreInspectTaskMapping');
    const built = buildPreInspectTaskMapping();
    const batches = [];
    if (typeof reviewNextPreInspectMappingBatch === 'function') {
      for (let i = 0; i < 20; i++) {
        const batch = reviewNextPreInspectMappingBatch();
        batches.push(batch);
        if (!batch || !Number(batch.processed || 0)) break;
        if (Number(batch.remaining || 0) <= 0) break;
      }
    }
    return { build: built, lookupBatches: batches };
  });

  SpreadsheetApp.flush();

  const allRows = [];
  const byDivision = {};
  TM_ALL_ROWS_VERIFY.PROFILES.forEach(function(profile) {
    const rows = tmAllVerifyReadMappingRows_(ss, profile);
    byDivision[profile.division] = rows;
    rows.forEach(function(rowCtx) { allRows.push(rowCtx); });
  });

  const taskIds = tmAllVerifyUniqueTaskIds_(allRows);
  const taskReads = tmAllVerifyBatchReadTasks_(taskIds);
  audit.taskRead = {
    requestedUniqueTaskIds: taskIds.length,
    succeeded: taskReads.succeeded,
    failed: taskReads.failed,
    batches: taskReads.batches
  };

  const calendarIndexes = {};
  TM_ALL_ROWS_VERIFY.PROFILES.forEach(function(profile) {
    calendarIndexes[profile.division] = tmAllVerifyBuildCalendarIndex_(ss, profile);
  });

  const serviceSiblingTasks = tmAllVerifyBuildServiceSiblingTaskIndex_(
    byDivision.Service || []
  );

  const details = allRows.map(function(ctx) {
    return tmAllVerifyEvaluateRow_(
      ctx,
      taskReads.byTaskId,
      calendarIndexes[ctx.division] || {},
      serviceSiblingTasks
    );
  });

  audit.summary = tmAllVerifySummarize_(details);
  audit.finishedAt = new Date().toISOString();
  audit.runtimeSeconds = Math.round(
    (new Date().getTime() - started.getTime()) / 1000
  );

  tmAllVerifyWriteReport_(ss, audit, details);

  Logger.log('============================================================');
  Logger.log('ALL ROWS / ALL VERTICALS VERIFICATION COMPLETE');
  Logger.log('============================================================');
  Logger.log(JSON.stringify({
    version: audit.version,
    taskRead: audit.taskRead,
    summary: audit.summary,
    reportSheet: audit.reportSheet,
    runtimeSeconds: audit.runtimeSeconds
  }, null, 2));

  return audit;
}

function tmAllVerifyPrep_(audit, name, fn) {
  const started = new Date();
  const step = { name: name, status: 'RUNNING' };
  audit.preparation.push(step);
  try {
    step.result = fn();
    step.status = 'PASS';
  } catch (err) {
    step.status = 'FAIL';
    step.error = String(err && err.message ? err.message : err);
  }
  step.runtimeSeconds = Math.round(
    (new Date().getTime() - started.getTime()) / 1000
  );
  Logger.log('VERIFY PREP ' + step.status + ': ' + name +
    (step.error ? ' — ' + step.error : ''));
  return step;
}

function tmAllVerifyReadMappingRows_(ss, profile) {
  const sheet = ss.getSheetByName(profile.mappingSheet);
  if (!sheet) {
    return [{
      division: profile.division,
      mappingSheet: profile.mappingSheet,
      mappingRow: 0,
      headers: [],
      row: {},
      sourceError: 'Missing mapping sheet.'
    }];
  }

  const grid = sheet.getDataRange().getDisplayValues();
  const headerIndex = tmAllVerifyFindHeaderIndex_(grid, ['Status', 'Event ID']);
  if (headerIndex < 0) {
    return [{
      division: profile.division,
      mappingSheet: profile.mappingSheet,
      mappingRow: 0,
      headers: [],
      row: {},
      sourceError: 'Could not locate mapping header row.'
    }];
  }

  const headers = grid[headerIndex].map(function(v) {
    return String(v || '').trim();
  });
  const output = [];

  for (let r = headerIndex + 1; r < grid.length; r++) {
    const raw = grid[r] || [];
    const obj = {};
    headers.forEach(function(name, c) {
      if (name) obj[name] = raw[c];
    });

    const meaningful = [
      obj['Status'], obj['Event ID'], obj['Task ID'],
      obj['Calendar Title'], obj['Customer'], obj['Customer #']
    ].some(function(v) { return String(v || '').trim() !== ''; });

    if (!meaningful) continue;

    output.push({
      division: profile.division,
      mappingSheet: profile.mappingSheet,
      calendarSheet: profile.calendarSheet,
      mappingRow: r + 1,
      row: obj
    });
  }

  return output;
}

function tmAllVerifyFindHeaderIndex_(grid, required) {
  for (let r = 0; r < Math.min(grid.length, 10); r++) {
    const headers = (grid[r] || []).map(function(v) {
      return String(v || '').trim();
    });
    const ok = required.every(function(name) {
      return headers.indexOf(name) >= 0 ||
        (name === 'Event ID' && headers.indexOf('EventId') >= 0);
    });
    if (ok) return r;
  }
  return -1;
}

function tmAllVerifyUniqueTaskIds_(rows) {
  const seen = {};
  const ids = [];
  (rows || []).forEach(function(ctx) {
    if (!ctx || !ctx.row) return;
    const id = tmAllVerifyPositive_(ctx.row['Task ID']);
    if (!id || seen[id]) return;
    seen[id] = true;
    ids.push(id);
  });
  ids.sort(function(a, b) { return a - b; });
  return ids;
}

function tmAllVerifyBatchReadTasks_(taskIds) {
  const byTaskId = {};
  let succeeded = 0;
  let failed = 0;
  let batches = 0;

  if (!taskIds.length) {
    return { byTaskId: byTaskId, succeeded: 0, failed: 0, batches: 0 };
  }

  const auth = getStrivenAuth_();
  const batchSize = TM_ALL_ROWS_VERIFY.TASK_FETCH_BATCH_SIZE;

  for (let offset = 0; offset < taskIds.length; offset += batchSize) {
    const ids = taskIds.slice(offset, offset + batchSize);
    const requests = ids.map(function(taskId) {
      return {
        url: strivenBuildTaskUrl_(taskId),
        method: 'get',
        muteHttpExceptions: true,
        headers: {
          Authorization: 'Bearer ' + auth.token,
          Accept: 'application/json'
        }
      };
    });

    const responses = UrlFetchApp.fetchAll(requests);
    batches++;

    responses.forEach(function(response, i) {
      const taskId = ids[i];
      const code = response.getResponseCode();
      const text = response.getContentText();

      if (code < 200 || code >= 300) {
        failed++;
        byTaskId[taskId] = {
          ok: false,
          taskId: taskId,
          httpCode: code,
          error: 'HTTP ' + code + ': ' + String(text || '').slice(0, 300)
        };
        return;
      }

      try {
        const obj = text ? JSON.parse(text) : {};
        byTaskId[taskId] = Object.assign(
          { ok: true, httpCode: code },
          tmAllVerifySnapshotFromObject_(taskId, obj)
        );
        succeeded++;
      } catch (err) {
        failed++;
        byTaskId[taskId] = {
          ok: false,
          taskId: taskId,
          httpCode: code,
          error: 'JSON parse/snapshot failed: ' +
            String(err && err.message ? err.message : err)
        };
      }
    });
  }

  return {
    byTaskId: byTaskId,
    succeeded: succeeded,
    failed: failed,
    batches: batches
  };
}

function tmAllVerifySnapshotFromObject_(taskId, obj) {
  const start = strivenTaskExtractDate_(
    obj.startDateTime || obj.StartDateTime ||
    obj.startDate || obj.StartDate ||
    obj.taskStartDate || obj.TaskStartDate
  );
  const due = strivenTaskExtractDate_(
    obj.dueDateTime || obj.DueDateTime ||
    obj.dueDate || obj.DueDate ||
    obj.taskDueDate || obj.TaskDueDate
  );

  const salesOrder = obj.salesOrder || obj.SalesOrder || null;
  const location = obj.location || obj.Location || null;
  const requestedBy = obj.requestedBy || obj.RequestedBy || null;
  const requestedByContact =
    obj.requestedByContact || obj.RequestedByContact || null;

  const soId =
    strivenPositiveNumberOrNull_(salesOrder && (salesOrder.id || salesOrder.Id)) ||
    strivenPositiveNumberOrNull_(obj.salesOrderId) ||
    strivenPositiveNumberOrNull_(obj.SalesOrderId) ||
    strivenPositiveNumberOrNull_(obj.SalesOrderID) ||
    strivenPositiveNumberOrNull_(obj.SOId);

  const locId =
    strivenPositiveNumberOrNull_(location && (location.id || location.Id)) ||
    strivenPositiveNumberOrNull_(obj.locationId) ||
    strivenPositiveNumberOrNull_(obj.LocationId) ||
    strivenPositiveNumberOrNull_(obj.CustomerLocationId);

  let conId =
    strivenPositiveNumberOrNull_(
      requestedBy && (requestedBy.id || requestedBy.Id)
    );

  if (!conId && requestedByContact) {
    conId =
      strivenPositiveNumberOrNull_(
        requestedByContact.contactId ||
        requestedByContact.ContactId ||
        requestedByContact.id ||
        requestedByContact.Id
      );
  }

  if (!conId) {
    conId =
      strivenPositiveNumberOrNull_(obj.contactId) ||
      strivenPositiveNumberOrNull_(obj.ContactId) ||
      strivenPositiveNumberOrNull_(obj.requestedByContactId) ||
      strivenPositiveNumberOrNull_(obj.RequestedByContactId);
  }

  const status = strivenExtractTaskStatus_(obj);
  const assignments = extractStrivenTaskAssignmentsFromObject_(obj);

  return {
    taskId: Number(taskId),
    statusName: status && status.name ? String(status.name) : '',
    soId: soId || null,
    locId: locId || null,
    conId: conId || null,
    start: start || null,
    due: due || null,
    employeeAssignmentIds: (assignments.employeeIds || []).map(Number),
    poolAssignmentIds: (assignments.poolIds || []).map(Number)
  };
}

function tmAllVerifyBuildCalendarIndex_(ss, profile) {
  const sheet = ss.getSheetByName(profile.calendarSheet);
  const index = {};

  if (!sheet || sheet.getLastRow() < 2) return index;

  const values = sheet.getDataRange().getDisplayValues();
  const headers = values[0].map(function(v) {
    return String(v || '').trim();
  });

  const eventIdx = tmAllVerifyHeaderAlias_(headers, [
    'Event ID', 'EventId', 'Calendar Event ID', 'CalendarEventId'
  ]);
  const htmlIdx = tmAllVerifyHeaderAlias_(headers, [
    'Description HTML Source', 'Description HTML', 'Description'
  ]);
  const taskLinkIdx = tmAllVerifyHeaderAlias_(headers, [
    'Striven Task Link', 'Task'
  ]);
  const soLinkIdx = tmAllVerifyHeaderAlias_(headers, [
    'Sales Order Link', 'Sales Order'
  ]);

  if (eventIdx < 0) return index;

  for (let r = 1; r < values.length; r++) {
    const eventId = String(values[r][eventIdx] || '').trim();
    if (!eventId) continue;

    index[eventId] = {
      rowNumber: r + 1,
      html: htmlIdx >= 0 ? String(values[r][htmlIdx] || '') : '',
      taskLink: taskLinkIdx >= 0 ? String(values[r][taskLinkIdx] || '') : '',
      salesOrderLink: soLinkIdx >= 0 ? String(values[r][soLinkIdx] || '') : ''
    };
  }

  return index;
}

function tmAllVerifyBuildServiceSiblingTaskIndex_(serviceRows) {
  const byEvent = {};
  (serviceRows || []).forEach(function(ctx) {
    const eventId = String(ctx.row['Event ID'] || '').trim();
    const taskId = tmAllVerifyPositive_(ctx.row['Task ID']);
    if (!eventId || !taskId) return;
    if (!byEvent[eventId]) byEvent[eventId] = {};
    byEvent[eventId][taskId] = true;
  });

  const out = {};
  Object.keys(byEvent).forEach(function(eventId) {
    out[eventId] = Object.keys(byEvent[eventId])
      .map(Number)
      .sort(function(a, b) { return a - b; });
  });
  return out;
}

function tmAllVerifyEvaluateRow_(ctx, taskReads, calendarIndex, serviceSiblingTasks) {
  if (ctx.sourceError) {
    return {
      division: ctx.division,
      mappingRow: ctx.mappingRow,
      overall: 'UNVERIFIED',
      firstBrokenStage: 'SOURCE',
      mappingStatus: '',
      push: '',
      customer: '',
      soNumber: '',
      taskId: '',
      liveTaskStatus: '',
      eventId: '',
      taskRead: 'ERROR',
      salesOrder: 'N/A',
      location: 'N/A',
      contact: 'N/A',
      dateTime: 'N/A',
      assignment: 'N/A',
      calendarTaskLink: 'N/A',
      calendarSalesOrderLink: 'N/A',
      issue: ctx.sourceError,
      detail: ctx.sourceError
    };
  }

  const row = ctx.row || {};
  const division = ctx.division;
  const mappingStatus = tmAllVerifyUpper_(row['Status']);
  const push = tmAllVerifyUpper_(row['Push']);
  const taskId = tmAllVerifyPositive_(row['Task ID']);
  const eventId = String(row['Event ID'] || '').trim();
  const customer = String(
    row['Customer'] || row['Customer Name'] || ''
  ).trim();
  const soNumber = String(
    row['SO #'] || row['Sales Order #'] || ''
  ).trim();

  const task = taskId ? taskReads[taskId] : null;
  const event = eventId ? calendarIndex[eventId] : null;

  const stages = {};

  if (!taskId) {
    stages.taskRead = /IGNORED|SKIP/.test(mappingStatus)
      ? tmAllVerifyStage_('N/A', 'No task is required for this row status.')
      : tmAllVerifyStage_('REVIEW', 'Mapping row has no Task ID.');
  } else if (!task || !task.ok) {
    stages.taskRead = tmAllVerifyStage_(
      'UNVERIFIED',
      task && task.error ? task.error : 'Fresh Striven task read missing.'
    );
  } else {
    stages.taskRead = tmAllVerifyStage_(
      'PASS',
      'Fresh /v2/tasks/' + taskId + ' read succeeded. Status=' +
        (task.statusName || 'UNKNOWN') + '.'
    );
  }

  const expected = tmAllVerifyExpectedRelationships_(division, row);

  stages.salesOrder = tmAllVerifyRelationshipStage_(
    'Sales Order',
    expected.soId,
    task && task.ok ? task.soId : null,
    expected.soRequired,
    stages.taskRead.status
  );

  stages.location = tmAllVerifyRelationshipStage_(
    'Location',
    expected.locationId,
    task && task.ok ? task.locId : null,
    expected.locationRequired,
    stages.taskRead.status
  );

  if (division === 'PreInspection') {
    const mappedTaskRequestedBy = tmAllVerifyPositive_(row['Task Contact ID']);
    stages.contact = tmAllVerifyRelationshipStage_(
      'Requested By',
      mappedTaskRequestedBy,
      task && task.ok ? task.conId : null,
      false,
      stages.taskRead.status
    );
    if (!mappedTaskRequestedBy) {
      stages.contact = tmAllVerifyStage_(
        'N/A',
        'PreInspection Requested By follows employee/organizer policy; no expected employee ID is surfaced as a desired mapping field.'
      );
    }
  } else {
    stages.contact = tmAllVerifyRelationshipStage_(
      'Contact',
      expected.contactId,
      task && task.ok ? task.conId : null,
      expected.contactRequired,
      stages.taskRead.status
    );
  }

  stages.dateTime = tmAllVerifyDateStage_(division, row, task);
  stages.assignment = tmAllVerifyAssignmentStage_(division, row, task);

  stages.calendarTaskLink = tmAllVerifyCalendarTaskStage_(
    division,
    taskId,
    eventId,
    event,
    serviceSiblingTasks
  );

  stages.calendarSalesOrderLink =
    tmAllVerifyCalendarSalesOrderStage_(
      division,
      expected.soId,
      eventId,
      event
    );

  const overall = tmAllVerifyOverall_(mappingStatus, push, stages);
  const firstBroken = tmAllVerifyFirstBrokenStage_(stages, mappingStatus);

  const detailParts = [];
  Object.keys(stages).forEach(function(name) {
    const stage = stages[name];
    if (stage.status !== 'PASS' && stage.status !== 'N/A') {
      detailParts.push(name + '=' + stage.status + ': ' + stage.reason);
    }
  });

  return {
    division: division,
    mappingRow: ctx.mappingRow,
    overall: overall,
    firstBrokenStage: firstBroken,
    mappingStatus: mappingStatus || '',
    push: push || '',
    customer: customer,
    soNumber: soNumber,
    taskId: taskId || '',
    liveTaskStatus: task && task.ok ? (task.statusName || '') : '',
    eventId: eventId,
    taskRead: stages.taskRead.status,
    salesOrder: stages.salesOrder.status,
    location: stages.location.status,
    contact: stages.contact.status,
    dateTime: stages.dateTime.status,
    assignment: stages.assignment.status,
    calendarTaskLink: stages.calendarTaskLink.status,
    calendarSalesOrderLink: stages.calendarSalesOrderLink.status,
    issue: String(row['Issue'] || '').trim(),
    detail: detailParts.join(' | '),
    taskReadDetail: stages.taskRead.reason,
    salesOrderDetail: stages.salesOrder.reason,
    locationDetail: stages.location.reason,
    contactDetail: stages.contact.reason,
    dateTimeDetail: stages.dateTime.reason,
    assignmentDetail: stages.assignment.reason,
    calendarTaskDetail: stages.calendarTaskLink.reason,
    calendarSalesOrderDetail: stages.calendarSalesOrderLink.reason
  };
}

function tmAllVerifyExpectedRelationships_(division, row) {
  if (division === 'Install') {
    return {
      soId: tmAllVerifyPositive_(row['Hidden Desired SalesOrderId']),
      locationId: tmAllVerifyPositive_(row['Hidden Desired LocationId']),
      contactId: tmAllVerifyPositive_(row['Hidden Desired ContactId']),
      soRequired: !!String(row['SO #'] || '').trim(),
      locationRequired: false,
      contactRequired: false
    };
  }

  if (division === 'Delivery') {
    return {
      soId: tmAllVerifyPositive_(row['Hidden SalesOrderId']),
      locationId: tmAllVerifyPositive_(row['Hidden LocationId']),
      contactId: tmAllVerifyPositive_(row['Hidden ContactId']),
      soRequired: !!String(row['SO #'] || '').trim(),
      locationRequired: true,
      contactRequired: true
    };
  }

  if (division === 'Service') {
    return {
      // Hidden Work Order ID is populated from the Service Work Order SOId.
      soId: tmAllVerifyPositive_(row['Hidden Work Order ID']),
      locationId: tmAllVerifyPositive_(row['Hidden Location ID']),
      contactId: tmAllVerifyPositive_(row['Hidden Contact ID']),
      soRequired: !!String(row['SO #'] || '').trim(),
      locationRequired: !!String(row['Customer'] || '').trim(),
      contactRequired: !!String(row['Customer'] || '').trim()
    };
  }

  return {
    soId: null,
    locationId: tmAllVerifyPositive_(row['Location ID']),
    contactId: null,
    soRequired: false,
    locationRequired: !!String(row['Customer ID'] || row['Customer #'] || '').trim(),
    contactRequired: false
  };
}

function tmAllVerifyRelationshipStage_(label, expected, actual, required, taskReadStatus) {
  if (taskReadStatus === 'UNVERIFIED') {
    return tmAllVerifyStage_('UNVERIFIED', label + ' cannot be verified because the fresh task read failed.');
  }

  if (!expected) {
    return required
      ? tmAllVerifyStage_('REVIEW', label + ' is required but the mapping did not resolve an expected ID.')
      : tmAllVerifyStage_('N/A', 'No expected ' + label + ' ID is required/surfaced.');
  }

  if (!actual) {
    return tmAllVerifyStage_(
      'ACTION REQUIRED',
      label + ' expected ID ' + expected + ' but the live task is blank.'
    );
  }

  if (Number(expected) !== Number(actual)) {
    return tmAllVerifyStage_(
      'ACTION REQUIRED',
      label + ' expected ID ' + expected + '; live task ID is ' + actual + '.'
    );
  }

  return tmAllVerifyStage_(
    'PASS',
    label + ' live ID ' + actual + ' matches expected mapping ID.'
  );
}

function tmAllVerifyDateStage_(division, row, task) {
  if (division === 'Install') {
    const action = String(row['Date Action'] || '').trim();
    if (/NO DATE CHANGE/i.test(action)) {
      return tmAllVerifyStage_('PASS', action);
    }
    if (/PUSH|UPDATE|CHANGE/i.test(action)) {
      return tmAllVerifyStage_('ACTION REQUIRED', action);
    }
    return tmAllVerifyStage_('REVIEW', action || 'Install date action is not resolved.');
  }

  if (division === 'Delivery' || division === 'Service') {
    const flag = tmAllVerifyUpper_(row['Hidden Needs Date Push']);
    if (flag === 'YES') {
      return tmAllVerifyStage_('ACTION REQUIRED', 'Mapping says date/time push is required.');
    }
    if (flag === 'NO') {
      return tmAllVerifyStage_('PASS', 'Mapping says Calendar and task date/time are aligned.');
    }
    return tmAllVerifyStage_('REVIEW', 'Date/time push state is blank/unknown.');
  }

  if (!task || !task.ok) {
    return tmAllVerifyStage_('UNVERIFIED', 'Fresh task date/time is unavailable.');
  }

  const calStart = tmAllVerifyDateTimeKey_(row['Calendar Start']);
  const calEnd = tmAllVerifyDateTimeKey_(row['Calendar End']);
  const liveStart = tmAllVerifyDateTimeKey_(task.start);
  const liveDue = tmAllVerifyDateTimeKey_(task.due);

  if (!calStart || !calEnd) {
    return tmAllVerifyStage_('REVIEW', 'PreInspection Calendar start/end is incomplete.');
  }

  if (calStart === liveStart && calEnd === liveDue) {
    return tmAllVerifyStage_('PASS', 'PreInspection live task date/time matches Calendar.');
  }

  return tmAllVerifyStage_(
    'BLOCKED',
    'PreInspection Calendar=' + calStart + ' → ' + calEnd +
    '; live task=' + (liveStart || 'blank') + ' → ' + (liveDue || 'blank') +
    '. Known PM PATCH quarantine remains authoritative.'
  );
}

function tmAllVerifyAssignmentStage_(division, row, task) {
  if (!task || !task.ok) {
    return tmAllVerifyStage_('UNVERIFIED', 'Fresh task assignments are unavailable.');
  }

  if (division === 'Install') {
    return tmAllVerifyStage_(
      'N/A',
      'Install mapping does not surface exact intended employee IDs in the shared schema.'
    );
  }

  if (division === 'PreInspection') {
    const pools = (task.poolAssignmentIds || []).map(Number);
    return pools.indexOf(8) >= 0
      ? tmAllVerifyStage_('PASS', 'Pre-Inspection Pool 8 is assigned.')
      : tmAllVerifyStage_('ACTION REQUIRED', 'Pre-Inspection Pool 8 is not assigned.');
  }

  const desired = tmAllVerifyNumberList_(row['Hidden Intended Assignee Ids']);
  const actual = (task.employeeAssignmentIds || [])
    .map(Number)
    .filter(function(v) { return v > 0; })
    .sort(function(a, b) { return a - b; });

  if (!desired.length) {
    const flag = tmAllVerifyUpper_(row['Hidden Needs Assignee Push']);
    return flag === 'YES'
      ? tmAllVerifyStage_('ACTION REQUIRED', 'Assignee push is required but intended assignee IDs are blank.')
      : tmAllVerifyStage_('N/A', 'No intended assignee IDs are surfaced for this row.');
  }

  desired.sort(function(a, b) { return a - b; });

  const pass = JSON.stringify(desired) === JSON.stringify(actual);
  return pass
    ? tmAllVerifyStage_('PASS', 'Live employee assignments match [' + desired.join(',') + '].')
    : tmAllVerifyStage_(
        'ACTION REQUIRED',
        'Expected employee IDs [' + desired.join(',') +
        ']; live task has [' + actual.join(',') + '].'
      );
}

function tmAllVerifyCalendarTaskStage_(division, taskId, eventId, event, serviceSiblingTasks) {
  if (!taskId) {
    return tmAllVerifyStage_('N/A', 'No mapped Task ID exists for Calendar-link verification.');
  }
  if (!eventId) {
    return tmAllVerifyStage_('REVIEW', 'Mapping row has no Event ID.');
  }
  if (!event) {
    return tmAllVerifyStage_('ACTION REQUIRED', 'Calendar mirror has no event for this Event ID.');
  }

  const html = String(event.html || '');
  const ids = division === 'Service'
    ? (serviceSiblingTasks[eventId] || [taskId])
    : [taskId];

  const missing = ids.filter(function(id) {
    const url = 'https://classicfireplace.striven.com/Tasks/TaskInfo.aspx?TaskID=' + id;
    return html.indexOf(url) === -1;
  });

  if (missing.length) {
    return tmAllVerifyStage_(
      'ACTION REQUIRED',
      'Calendar managed block is missing Task link(s): ' + missing.join(', ') + '.'
    );
  }

  return tmAllVerifyStage_(
    'PASS',
    division === 'Service' && ids.length > 1
      ? 'Calendar contains all sibling Service task links: ' + ids.join(', ') + '.'
      : 'Calendar contains the verified Task link.'
  );
}

function tmAllVerifyCalendarSalesOrderStage_(division, expectedSoId, eventId, event) {
  if (division === 'Install' || division === 'PreInspection') {
    return tmAllVerifyStage_('N/A', 'Sales Order Calendar link is not required by this vertical policy.');
  }

  if (!expectedSoId) {
    return tmAllVerifyStage_(
      'N/A',
      'Internal SalesOrderId is not currently resolved; verified Task-only Calendar block is allowed.'
    );
  }

  if (!eventId || !event) {
    return tmAllVerifyStage_('ACTION REQUIRED', 'Calendar event is unavailable for Sales Order link verification.');
  }

  const url =
    'https://classicfireplace.striven.com/next/crm#/sales-orders/' +
    expectedSoId;

  return String(event.html || '').indexOf(url) !== -1
    ? tmAllVerifyStage_('PASS', 'Calendar contains Sales Order URL with internal ID ' + expectedSoId + '.')
    : tmAllVerifyStage_('ACTION REQUIRED', 'Calendar is missing Sales Order URL for internal ID ' + expectedSoId + '.');
}

function tmAllVerifyOverall_(mappingStatus, push, stages) {
  if (mappingStatus === 'IGNORED' || mappingStatus === 'SKIP' || mappingStatus === 'SKIPPED') {
    return 'IGNORED';
  }

  if (mappingStatus === 'BLOCKED') return 'BLOCKED';
  if (mappingStatus === 'REVIEW' || mappingStatus === 'NOT MATCHED') return 'REVIEW';

  const statuses = Object.keys(stages).map(function(k) {
    return stages[k].status;
  });

  if (statuses.indexOf('UNVERIFIED') >= 0) return 'UNVERIFIED';
  if (statuses.indexOf('BLOCKED') >= 0) return 'BLOCKED';
  if (statuses.indexOf('REVIEW') >= 0) return 'REVIEW';
  if (statuses.indexOf('ACTION REQUIRED') >= 0) return 'ACTION REQUIRED';

  if (
    mappingStatus.indexOf('READY') === 0 ||
    push === 'YES'
  ) {
    return 'ACTION REQUIRED';
  }

  return 'PASS';
}

function tmAllVerifyFirstBrokenStage_(stages, mappingStatus) {
  if (mappingStatus === 'BLOCKED') return 'MAPPING STATUS';
  if (mappingStatus === 'REVIEW' || mappingStatus === 'NOT MATCHED') return 'MAPPING / MATCH';
  if (mappingStatus === 'IGNORED' || mappingStatus === 'SKIP' || mappingStatus === 'SKIPPED') return '';

  const order = [
    ['taskRead', 'TASK'],
    ['salesOrder', 'SALES ORDER'],
    ['location', 'LOCATION'],
    ['contact', 'CONTACT / REQUESTED BY'],
    ['dateTime', 'DATE / TIME'],
    ['assignment', 'ASSIGNMENT'],
    ['calendarTaskLink', 'CALENDAR TASK LINK'],
    ['calendarSalesOrderLink', 'CALENDAR SALES ORDER LINK']
  ];

  for (let i = 0; i < order.length; i++) {
    const stage = stages[order[i][0]];
    if (!stage) continue;
    if (stage.status !== 'PASS' && stage.status !== 'N/A') {
      return order[i][1];
    }
  }

  return '';
}

function tmAllVerifySummarize_(details) {
  const summary = {};
  const divisions = ['Install', 'Delivery', 'Service', 'PreInspection', 'ALL'];

  divisions.forEach(function(name) {
    summary[name] = {
      total: 0,
      PASS: 0,
      'ACTION REQUIRED': 0,
      REVIEW: 0,
      BLOCKED: 0,
      IGNORED: 0,
      UNVERIFIED: 0
    };
  });

  (details || []).forEach(function(row) {
    [row.division, 'ALL'].forEach(function(name) {
      if (!summary[name]) return;
      summary[name].total++;
      if (summary[name][row.overall] === undefined) {
        summary[name][row.overall] = 0;
      }
      summary[name][row.overall]++;
    });
  });

  return summary;
}

function tmAllVerifyWriteReport_(ss, audit, details) {
  let sheet = ss.getSheetByName(TM_ALL_ROWS_VERIFY.REPORT_SHEET);
  if (!sheet) sheet = ss.insertSheet(TM_ALL_ROWS_VERIFY.REPORT_SHEET);
  sheet.clear();

  const title = 'Task Mapping — All Rows Verification';
  const generated = Utilities.formatDate(
    new Date(),
    TM_ALL_ROWS_VERIFY.TIME_ZONE,
    'yyyy-MM-dd HH:mm:ss'
  );

  sheet.getRange(1, 1).setValue(title);
  sheet.getRange(2, 1).setValue(
    'Generated: ' + generated +
    ' | Version: ' + audit.version +
    ' | Striven writes: NONE | Calendar writes: NONE'
  );

  const summaryHeaders = [
    'Division', 'Total', 'PASS', 'ACTION REQUIRED',
    'REVIEW', 'BLOCKED', 'IGNORED', 'UNVERIFIED'
  ];
  sheet.getRange(4, 1, 1, summaryHeaders.length).setValues([summaryHeaders]);

  const summaryRows = ['Install', 'Delivery', 'Service', 'PreInspection', 'ALL']
    .map(function(name) {
      const s = audit.summary[name] || {};
      return [
        name,
        s.total || 0,
        s.PASS || 0,
        s['ACTION REQUIRED'] || 0,
        s.REVIEW || 0,
        s.BLOCKED || 0,
        s.IGNORED || 0,
        s.UNVERIFIED || 0
      ];
    });
  sheet.getRange(5, 1, summaryRows.length, summaryHeaders.length)
    .setValues(summaryRows);

  sheet.getRange(11, 1).setValue(
    'Fresh Striven task reads: ' +
    audit.taskRead.succeeded + '/' +
    audit.taskRead.requestedUniqueTaskIds +
    ' succeeded in ' + audit.taskRead.batches + ' batch(es).'
  );

  const headers = [
    'Division', 'Mapping Row', 'Overall', 'First Broken Stage',
    'Mapping Status', 'Push', 'Customer', 'SO #', 'Task ID',
    'Live Task Status', 'Event ID', 'Fresh Task Read',
    'Sales Order', 'Location', 'Contact / Requested By',
    'Date / Time', 'Assignment', 'Calendar Task Link',
    'Calendar SO Link', 'Mapping Issue', 'Verification Detail'
  ];
  const headerRow = 13;
  sheet.getRange(headerRow, 1, 1, headers.length).setValues([headers]);

  const rows = details.map(function(d) {
    return [
      d.division,
      d.mappingRow,
      d.overall,
      d.firstBrokenStage,
      d.mappingStatus,
      d.push,
      d.customer,
      d.soNumber,
      d.taskId,
      d.liveTaskStatus,
      d.eventId,
      d.taskRead,
      d.salesOrder,
      d.location,
      d.contact,
      d.dateTime,
      d.assignment,
      d.calendarTaskLink,
      d.calendarSalesOrderLink,
      d.issue,
      d.detail
    ];
  });

  if (rows.length) {
    sheet.getRange(headerRow + 1, 1, rows.length, headers.length)
      .setValues(rows);
  }

  sheet.setFrozenRows(headerRow);
  sheet.getRange(1, 1).setFontWeight('bold').setFontSize(14);
  sheet.getRange(4, 1, 1, summaryHeaders.length).setFontWeight('bold');
  sheet.getRange(headerRow, 1, 1, headers.length).setFontWeight('bold');
  sheet.getDataRange().setVerticalAlignment('top');

  sheet.setColumnWidth(1, 110);
  sheet.setColumnWidth(2, 85);
  sheet.setColumnWidth(3, 125);
  sheet.setColumnWidth(4, 160);
  sheet.setColumnWidth(5, 120);
  sheet.setColumnWidth(6, 70);
  sheet.setColumnWidth(7, 220);
  sheet.setColumnWidth(8, 90);
  sheet.setColumnWidth(9, 85);
  sheet.setColumnWidth(10, 110);
  sheet.setColumnWidth(11, 260);
  for (let c = 12; c <= 19; c++) sheet.setColumnWidth(c, 130);
  sheet.setColumnWidth(20, 320);
  sheet.setColumnWidth(21, 500);

  if (rows.length) {
    sheet.getRange(headerRow + 1, 1, rows.length, headers.length).setWrap(true);
    sheet.getRange(headerRow + 1, 3, rows.length, 2).setFontWeight('bold');
  }

  sheet.activate();
  sheet.getRange(headerRow, 1).activate();
}

function tmAllVerifyStage_(status, reason) {
  return { status: status, reason: reason || '' };
}

function tmAllVerifyHeaderAlias_(headers, aliases) {
  const normalized = headers.map(function(v) {
    return String(v || '').trim().toLowerCase();
  });
  for (let i = 0; i < aliases.length; i++) {
    const idx = normalized.indexOf(String(aliases[i] || '').trim().toLowerCase());
    if (idx >= 0) return idx;
  }
  return -1;
}

function tmAllVerifyPositive_(value) {
  const n = Number(
    String(value === null || value === undefined ? '' : value)
      .replace(/[^0-9.-]/g, '')
  );
  return isFinite(n) && n > 0 ? Math.floor(n) : null;
}

function tmAllVerifyUpper_(value) {
  return String(value || '').trim().toUpperCase();
}

function tmAllVerifyNumberList_(value) {
  const seen = {};
  return String(value || '')
    .split(/[,;|\s]+/)
    .map(tmAllVerifyPositive_)
    .filter(function(v) {
      if (!v || seen[v]) return false;
      seen[v] = true;
      return true;
    });
}

function tmAllVerifyDateTimeKey_(value) {
  if (!value) return '';

  if (value instanceof Date && !isNaN(value.getTime())) {
    return Utilities.formatDate(
      value,
      TM_ALL_ROWS_VERIFY.TIME_ZONE,
      'yyyy-MM-dd HH:mm'
    );
  }

  const text = String(value || '').trim();
  if (!text) return '';

  const direct = text.match(/(\d{4}-\d{2}-\d{2})[ T](\d{1,2}:\d{2})/);
  if (direct) {
    const hhmm = direct[2].split(':');
    return direct[1] + ' ' +
      ('0' + Number(hhmm[0])).slice(-2) + ':' + hhmm[1];
  }

  const d = new Date(text);
  if (!isNaN(d.getTime())) {
    return Utilities.formatDate(
      d,
      TM_ALL_ROWS_VERIFY.TIME_ZONE,
      'yyyy-MM-dd HH:mm'
    );
  }

  return text;
}

/************************************************************
 * 98_5_Four_Vertical_Pipeline_Test.js
 *
 * PUBLIC FUNCTION:
 *   TEST_ONE_ROW_EACH_VERTICAL_PIPELINE
 *
 * Runs ONE existing mapped/open task through the real selected-row
 * end-to-end production entrypoint for each vertical:
 *
 * INSTALL       Task 17982  Bruce & Elizabeth
 * DELIVERY      Task 18499  Walter Kolesnikovicz
 * SERVICE       Task 18438  Vivienne McCuaig
 * PREINSPECTION Task 18511  Andrew & Laura VALENTINE
 *
 * This IS a live pipeline test:
 * - It may perform the writes the existing production E2E function
 *   determines are necessary for the selected row.
 * - It does not create/recreate Install/Delivery/Service tasks.
 * - The selected PreInspection row already has an existing OPEN task;
 *   the normal PreInspection duplicate/review guards remain authoritative.
 *
 * The runner itself adds no business writes. It only:
 * - selects the intended row,
 * - snapshots live task state before/after,
 * - calls runSelectedTaskMappingRowEndToEnd(),
 * - compares actual relationships against mapping expectations,
 * - logs one consolidated report.
 ************************************************************/

const TM_FOUR_VERTICAL_PIPELINE_TEST = Object.freeze({
  VERSION: 'TM_FOUR_VERTICAL_PIPELINE_TEST_R2_INCOMPLETE_ROWS_20260921',
  CASES: [
    {
      division: 'Install',
      sheetName: 'Install Task Mapping',
      taskId: 17982,
      label: 'Bruce & Elizabeth',
      expectedEventId: '0m9rblgrg83d3qthhaq4v2g1fu@google.com'
    },
    {
      division: 'Delivery',
      sheetName: 'Delivery Task Mapping',
      taskId: 18499,
      label: 'Walter Kolesnikovicz',
      expectedEventId: '710bnj9s5t4cg3f1fi38kmb6ul@google.com'
    },
    {
      division: 'Service',
      sheetName: 'Service Task Mapping',
      taskId: 18438,
      label: 'Vivienne McCuaig',
      expectedEventId: '57uc09r4rs1bj0lv093i541g14@google.com'
    },
    {
      division: 'PreInspection',
      sheetName: 'PreInspect Task Mapping',
      taskId: 18511,
      label: 'Andrew & Laura VALENTINE',
      expectedEventId: '2i6bfn13m01tjr7ab189i6jtp3@google.com'
    }
  ]
});

function TEST_ONE_ROW_EACH_VERTICAL_PIPELINE() {
  const started = new Date();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('No active spreadsheet.');

  if (typeof runSelectedTaskMappingRowEndToEnd !== 'function') {
    throw new Error('Missing production entrypoint: runSelectedTaskMappingRowEndToEnd');
  }
  if (typeof getStrivenTaskSnapshotById_ !== 'function') {
    throw new Error('Missing live task snapshot helper: getStrivenTaskSnapshotById_');
  }

  const report = {
    mode: 'ONE_ROW_EACH_VERTICAL_PIPELINE_TEST',
    version: TM_FOUR_VERTICAL_PIPELINE_TEST.VERSION,
    status: 'RUNNING',
    startedAt: started.toISOString(),
    cases: [],
    summary: {}
  };

  TM_FOUR_VERTICAL_PIPELINE_TEST.CASES.forEach(function(testCase) {
    const caseResult = tmFourVerticalRunCase_(ss, testCase);
    report.cases.push(caseResult);
  });

  const passed = report.cases.filter(function(x) { return x.overall === 'PASS'; }).length;
  const partial = report.cases.filter(function(x) { return x.overall === 'PARTIAL'; }).length;
  const blocked = report.cases.filter(function(x) { return x.overall === 'BLOCKED'; }).length;
  const failed = report.cases.filter(function(x) { return x.overall === 'FAIL'; }).length;

  report.summary = {
    total: report.cases.length,
    pass: passed,
    partial: partial,
    blocked: blocked,
    fail: failed
  };

  report.status = failed ? 'COMPLETE_WITH_FAILURES'
    : (partial || blocked ? 'COMPLETE_WITH_GAPS' : 'PASS');
  report.finishedAt = new Date().toISOString();
  report.runtimeSeconds = Math.round((new Date().getTime() - started.getTime()) / 1000);

  Logger.log('============================================================');
  Logger.log('FOUR-VERTICAL PIPELINE TEST: ' + report.status);
  Logger.log('============================================================');
  Logger.log(JSON.stringify(report, null, 2));

  return report;
}

function tmFourVerticalRunCase_(ss, testCase) {
  const out = {
    division: testCase.division,
    sheetName: testCase.sheetName,
    taskId: testCase.taskId,
    label: testCase.label,
    rowNumber: null,
    eventId: null,
    before: null,
    pipeline: null,
    after: null,
    stages: {},
    overall: 'FAIL',
    error: ''
  };

  try {
    const located = tmFourVerticalLocateTaskRow_(ss, testCase.sheetName, testCase.taskId);
    out.rowNumber = located.rowNumber;
    out.eventId = located.eventId;

    if (testCase.expectedEventId &&
        String(located.eventId || '') !== String(testCase.expectedEventId)) {
      throw new Error(
        'Safety stop: Task ' + testCase.taskId +
        ' Event ID changed. Expected ' + testCase.expectedEventId +
        ', found ' + located.eventId + '.'
      );
    }

    out.before = tmFourVerticalSnapshot_(located, testCase.division);

    ss.setActiveSheet(located.sheet);
    located.sheet.getRange(located.rowNumber, 1).activate();
    SpreadsheetApp.flush();

    try {
      out.pipeline = runSelectedTaskMappingRowEndToEnd();
    } catch (pipelineErr) {
      out.pipeline = {
        status: 'THREW_ERROR',
        error: String(pipelineErr && pipelineErr.message ? pipelineErr.message : pipelineErr)
      };
    }

    SpreadsheetApp.flush();

    const relocated = tmFourVerticalLocateTaskRow_(ss, testCase.sheetName, testCase.taskId);
    out.after = tmFourVerticalSnapshot_(relocated, testCase.division);
    out.stages = tmFourVerticalEvaluateStages_(testCase.division, out.before, out.pipeline, out.after);
    out.overall = tmFourVerticalOverall_(out.stages, out.pipeline);

    if (out.pipeline && out.pipeline.status === 'THREW_ERROR') {
      out.error = out.pipeline.error || '';
    }

  } catch (err) {
    out.overall = 'FAIL';
    out.error = String(err && err.message ? err.message : err);
  }

  Logger.log(
    'PIPELINE TEST ' + out.division + ' Task ' + out.taskId +
    ' => ' + out.overall + '\n' +
    JSON.stringify(out, null, 2)
  );

  return out;
}

function tmFourVerticalLocateTaskRow_(ss, sheetName, taskId) {
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error('Missing mapping sheet: ' + sheetName);

  const grid = sheet.getDataRange().getDisplayValues();
  let headerRowIndex = -1;
  let headers = null;

  for (let r = 0; r < Math.min(grid.length, 10); r++) {
    const candidate = (grid[r] || []).map(function(v) { return String(v || '').trim(); });
    if (candidate.indexOf('Task ID') >= 0) {
      headerRowIndex = r;
      headers = candidate;
      break;
    }
  }

  if (headerRowIndex < 0) {
    throw new Error('Task ID header not found in ' + sheetName);
  }

  const taskIdx = headers.indexOf('Task ID');
  const eventIdx = headers.indexOf('Event ID');

  for (let r = headerRowIndex + 1; r < grid.length; r++) {
    const row = grid[r] || [];
    if (Number(String(row[taskIdx] || '').trim()) !== Number(taskId)) continue;

    return {
      sheet: sheet,
      sheetName: sheetName,
      rowNumber: r + 1,
      headerRow: headerRowIndex + 1,
      headers: headers,
      row: row,
      eventId: eventIdx >= 0 ? String(row[eventIdx] || '').trim() : ''
    };
  }

  throw new Error('Task ' + taskId + ' not found in ' + sheetName);
}

function tmFourVerticalRowObject_(located) {
  const obj = {};
  located.headers.forEach(function(header, i) {
    if (!header) return;
    obj[header] = located.row[i];
  });
  return obj;
}

function tmFourVerticalSnapshot_(located, division) {
  const row = tmFourVerticalRowObject_(located);
  const live = getStrivenTaskSnapshotById_(Number(row['Task ID']), {});

  return {
    mapping: tmFourVerticalReduceMapping_(division, row),
    task: tmFourVerticalReduceTaskSnapshot_(live)
  };
}

function tmFourVerticalReduceTaskSnapshot_(snap) {
  snap = snap || {};
  return {
    taskId: snap.taskId || null,
    statusName: snap.statusName || '',
    soId: snap.soId || null,
    locId: snap.locId || null,
    conId: snap.conId || null,
    start: snap.start || null,
    due: snap.due || null,
    employeeAssignmentIds: snap.employeeAssignmentIds || [],
    poolAssignmentIds: snap.poolAssignmentIds || []
  };
}

function tmFourVerticalReduceMapping_(division, row) {
  const common = {
    status: String(row['Status'] || '').trim(),
    taskAction: String(row['Task Action'] || '').trim(),
    taskId: tmFourVerticalPositive_(row['Task ID']),
    taskStatus: String(row['Task Status'] || '').trim(),
    eventId: String(row['Event ID'] || '').trim(),
    issue: String(row['Issue'] || '').trim(),
    calendarStartDate: String(row['Hidden Calendar Start Date'] || row['Calendar Start'] || '').trim(),
    calendarStartTime: String(row['Hidden Calendar Start Time'] || '').trim(),
    calendarEndDate: String(row['Hidden Calendar End Date'] || row['Calendar End'] || '').trim(),
    calendarEndTime: String(row['Hidden Calendar End Time'] || '').trim()
  };

  if (division === 'Install') {
    common.desiredSoId = tmFourVerticalPositive_(row['Hidden Desired SalesOrderId']);
    common.desiredLocationId = tmFourVerticalPositive_(row['Hidden Desired LocationId']);
    common.desiredContactId = tmFourVerticalPositive_(row['Hidden Desired ContactId']);
    common.currentSoId = tmFourVerticalPositive_(row['Hidden Current SalesOrderId']);
    common.currentLocationId = tmFourVerticalPositive_(row['Hidden Current LocationId']);
    common.currentContactId = tmFourVerticalPositive_(row['Hidden Current ContactId']);
    common.dateAction = String(row['Date Action'] || '').trim();
    common.idAction = String(row['ID Action'] || '').trim();
  } else if (division === 'Delivery') {
    common.desiredSoId = tmFourVerticalPositive_(row['Hidden SalesOrderId']);
    common.desiredLocationId = tmFourVerticalPositive_(row['Hidden LocationId']);
    common.desiredContactId = tmFourVerticalPositive_(row['Hidden ContactId']);
    common.needsIdPush = String(row['Hidden Needs ID Push'] || '').trim();
    common.needsDatePush = String(row['Hidden Needs Date Push'] || '').trim();
    common.needsAssigneePush = String(row['Hidden Needs Assignee Push'] || '').trim();
    common.intendedAssigneeIds = tmFourVerticalNumberList_(row['Hidden Intended Assignee Ids']);
  } else if (division === 'Service') {
    common.desiredSoId = null;
    common.desiredLocationId = tmFourVerticalPositive_(row['Hidden Location ID']);
    common.desiredContactId = tmFourVerticalPositive_(row['Hidden Contact ID']);
    common.needsDatePush = String(row['Hidden Needs Date Push'] || '').trim();
    common.needsAssigneePush = String(row['Hidden Needs Assignee Push'] || '').trim();
    common.intendedAssigneeIds = tmFourVerticalNumberList_(row['Hidden Intended Assignee Ids']);
    common.workOrderId = tmFourVerticalPositive_(row['Hidden Work Order ID']);
  } else if (division === 'PreInspection') {
    common.desiredSoId = null; // Sales Order is intentionally not required/attached.
    common.desiredLocationId = tmFourVerticalPositive_(row['Location ID']);
    common.desiredContactId = tmFourVerticalPositive_(row['Contact ID']);
    common.taskLocationId = tmFourVerticalPositive_(row['Task Location ID']);
    common.taskContactId = tmFourVerticalPositive_(row['Task Contact ID']);
    common.taskSalesOrderId = tmFourVerticalPositive_(row['Task SalesOrder ID']);
    common.calendarStartDate = String(row['Calendar Start'] || '').trim();
    common.calendarEndDate = String(row['Calendar End'] || '').trim();
    common.taskStart = String(row['Task Start'] || '').trim();
    common.taskDue = String(row['Task Due'] || '').trim();
    common.lookupState = String(row['Lookup State'] || '').trim();
  }

  return common;
}

function tmFourVerticalEvaluateStages_(division, before, pipeline, after) {
  const b = before.mapping || {};
  const a = after.mapping || {};
  const task = after.task || {};

  const stages = {
    rowIdentity: tmFourVerticalStage_(
      !!(a.taskId && a.eventId),
      a.taskId && a.eventId ? 'Task ID + Event ID retained.' : 'Missing Task ID or Event ID.'
    ),
    freshTaskRead: tmFourVerticalStage_(
      !!task.taskId,
      task.taskId ? ('Fresh task ' + task.taskId + ' read succeeded.') : 'Fresh task read failed.'
    ),
    taskOpen: tmFourVerticalStage_(
      String(task.statusName || '').trim().toUpperCase() === 'OPEN',
      'Fresh task status: ' + (task.statusName || 'UNKNOWN')
    ),
    salesOrderRelationship: tmFourVerticalRelationshipStage_(
      a.desiredSoId,
      task.soId,
      division === 'PreInspection'
    ),
    locationRelationship: tmFourVerticalRelationshipStage_(
      a.desiredLocationId,
      task.locId,
      false
    ),
    contactRelationship: tmFourVerticalRelationshipStage_(
      a.desiredContactId,
      task.conId,
      false
    ),
    dateTime: tmFourVerticalDateStage_(division, a, task),
    assignment: tmFourVerticalAssignmentStage_(division, a, task),
    calendarLink: tmFourVerticalCalendarStage_(division, pipeline),
    pipelineExecution: tmFourVerticalPipelineStage_(pipeline)
  };

  if (division === 'PreInspection') {
    stages.salesOrderRelationship = {
      status: 'N/A',
      reason: 'PreInspection policy does not require or attach Sales Order.'
    };
  }

  return stages;
}

function tmFourVerticalStage_(pass, reason) {
  return { status: pass ? 'PASS' : 'FAIL', reason: reason || '' };
}

function tmFourVerticalRelationshipStage_(expected, actual, forceNA) {
  if (forceNA || !expected) {
    return {
      status: 'N/A',
      expected: expected || null,
      actual: actual || null,
      reason: forceNA ? 'Not applicable by policy.' : 'No desired ID surfaced by mapping.'
    };
  }

  const pass = Number(expected) === Number(actual || 0);
  return {
    status: pass ? 'PASS' : 'FAIL',
    expected: Number(expected),
    actual: actual || null,
    reason: pass ? 'Live task relationship matches mapping.' : 'Live task relationship does not match mapping.'
  };
}

function tmFourVerticalDateStage_(division, mapping, task) {
  if (division === 'Install') {
    const noChange = /NO DATE CHANGE/i.test(mapping.dateAction || '');
    return {
      status: noChange ? 'PASS' : 'INFO',
      reason: mapping.dateAction || 'No Install date action surfaced.',
      liveStart: task.start || null,
      liveDue: task.due || null
    };
  }

  if (division === 'Delivery' || division === 'Service') {
    const flag = String(mapping.needsDatePush || '').toUpperCase();
    return {
      status: flag === 'NO' ? 'PASS' : (flag === 'YES' ? 'NEEDS_WRITE' : 'INFO'),
      reason: 'Mapping date-push flag: ' + (flag || 'blank'),
      liveStart: task.start || null,
      liveDue: task.due || null
    };
  }

  if (division === 'PreInspection') {
    const calStart = tmFourVerticalNormalizeDateText_(mapping.calendarStartDate);
    const calEnd = tmFourVerticalNormalizeDateText_(mapping.calendarEndDate);
    const liveStart = tmFourVerticalNormalizeDateText_(task.start);
    const liveDue = tmFourVerticalNormalizeDateText_(task.due);

    const pass = !!calStart && !!calEnd &&
      calStart === liveStart && calEnd === liveDue;

    return {
      status: pass ? 'PASS' : 'FAIL',
      reason: pass ? 'Live task start/due match Calendar.' : 'PreInspection live task start/due do not exactly match Calendar.',
      calendarStart: calStart,
      calendarEnd: calEnd,
      liveStart: liveStart,
      liveDue: liveDue
    };
  }

  return { status: 'INFO', reason: 'No date evaluator.' };
}

function tmFourVerticalAssignmentStage_(division, mapping, task) {
  if (division === 'Install') {
    return {
      status: 'INFO',
      reason: 'Install mapping does not surface intended employee IDs in the shared row schema.',
      liveEmployees: task.employeeAssignmentIds || [],
      livePools: task.poolAssignmentIds || []
    };
  }

  if (division === 'Delivery' || division === 'Service') {
    const expected = mapping.intendedAssigneeIds || [];
    if (!expected.length) {
      return {
        status: 'INFO',
        reason: 'No intended assignee IDs surfaced by mapping.',
        liveEmployees: task.employeeAssignmentIds || []
      };
    }
    const actual = (task.employeeAssignmentIds || []).map(Number).sort();
    const want = expected.map(Number).sort();
    const pass = JSON.stringify(actual) === JSON.stringify(want);
    return {
      status: pass ? 'PASS' : 'FAIL',
      expectedEmployeeIds: want,
      actualEmployeeIds: actual,
      reason: pass ? 'Employee assignments match.' : 'Employee assignments differ.'
    };
  }

  if (division === 'PreInspection') {
    const pools = (task.poolAssignmentIds || []).map(Number);
    const pass = pools.indexOf(8) >= 0;
    return {
      status: pass ? 'PASS' : 'FAIL',
      expectedPoolId: 8,
      actualPoolIds: pools,
      actualEmployeeIds: task.employeeAssignmentIds || [],
      reason: pass ? 'Pre-Inspection Pool 8 is assigned.' : 'Pre-Inspection Pool 8 is not assigned.'
    };
  }

  return { status: 'INFO', reason: 'No assignment evaluator.' };
}

function tmFourVerticalCalendarStage_(division, pipeline) {
  if (!pipeline) return { status: 'FAIL', reason: 'Pipeline returned no result.' };

  if (division === 'PreInspection') {
    const nested = pipeline.preInspectionEndToEnd || pipeline;
    const steps = nested.steps || [];
    const linkStep = steps.filter(function(step) {
      return String(step.action || '').toUpperCase() === 'CALENDAR_TASK_LINK';
    })[0];

    if (!linkStep) {
      return {
        status: /STOPPED_REVIEW|STOPPED_SKIP/.test(String(nested.status || '')) ? 'BLOCKED' : 'FAIL',
        reason: 'No PreInspection CALENDAR_TASK_LINK step completed.',
        pipelineStatus: nested.status || ''
      };
    }

    const result = linkStep.result || {};
    const status = String(result.status || '').toUpperCase();
    return {
      status: /UPDATED|COMPLETE|VERIFIED|NOT_NEEDED|SKIPPED_NO_CHANGE/.test(status) ? 'PASS'
        : (/DISABLED|BLOCKED|REVIEW/.test(status) ? 'BLOCKED' : 'INFO'),
      reason: result.reason || status || 'Calendar link step returned.',
      rawStatus: result.status || ''
    };
  }

  const cal = pipeline.calendar || {};
  const status = String(cal.status || '').toUpperCase();

  return {
    status: /UPDATED|COMPLETE|VERIFIED|NOT_NEEDED|SKIPPED_NO_CHANGE|ALREADY/.test(status) ? 'PASS'
      : (/BLOCKED|REVIEW|DISABLED/.test(status) ? 'BLOCKED' : (status ? 'INFO' : 'FAIL')),
    reason: cal.reason || cal.message || status || 'No Calendar-link status returned.',
    rawStatus: cal.status || ''
  };
}

function tmFourVerticalPipelineStage_(pipeline) {
  if (!pipeline) return { status: 'FAIL', reason: 'No pipeline result.' };
  if (String(pipeline.status || '').toUpperCase() === 'THREW_ERROR') {
    return { status: 'FAIL', reason: pipeline.error || 'Pipeline threw an error.' };
  }

  const status = String(pipeline.status || '').toUpperCase();
  if (/STOPPED_REVIEW|STOPPED_SKIP|REVIEW/.test(status)) {
    return { status: 'BLOCKED', reason: 'Pipeline stopped safely: ' + status };
  }
  if (/FAILED|ERROR/.test(status)) {
    return { status: 'FAIL', reason: 'Pipeline returned ' + status };
  }
  return { status: 'PASS', reason: 'Pipeline returned ' + (status || 'a result') };
}

function tmFourVerticalOverall_(stages, pipeline) {
  if (pipeline && String(pipeline.status || '').toUpperCase() === 'THREW_ERROR') return 'FAIL';

  const values = Object.keys(stages || {}).map(function(k) {
    return String(stages[k].status || '').toUpperCase();
  });

  if (values.indexOf('FAIL') >= 0) return 'FAIL';
  if (values.indexOf('BLOCKED') >= 0) return 'BLOCKED';
  if (values.indexOf('NEEDS_WRITE') >= 0 || values.indexOf('INFO') >= 0) return 'PARTIAL';
  return 'PASS';
}

function tmFourVerticalPositive_(value) {
  const n = Number(String(value === null || value === undefined ? '' : value).replace(/[^0-9.-]/g, ''));
  return isFinite(n) && n > 0 ? Math.floor(n) : null;
}

function tmFourVerticalNumberList_(value) {
  const seen = {};
  return String(value || '')
    .split(/[,;|\s]+/)
    .map(function(v) { return tmFourVerticalPositive_(v); })
    .filter(function(v) {
      if (!v || seen[v]) return false;
      seen[v] = true;
      return true;
    });
}

function tmFourVerticalNormalizeDateText_(value) {
  if (value instanceof Date && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, 'America/Toronto', 'yyyy-MM-dd HH:mm');
  }

  const text = String(value || '').trim();
  if (!text) return '';

  const direct = text
    .replace('T', ' ')
    .replace(/\.\d{3}Z$/, '')
    .replace(/([+-]\d\d:\d\d)$/, '')
    .trim();

  const m = direct.match(/(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})/);
  if (m) return m[1] + ' ' + m[2];

  const d = new Date(text);
  if (!isNaN(d.getTime())) {
    return Utilities.formatDate(d, 'America/Toronto', 'yyyy-MM-dd HH:mm');
  }

  return direct;
}

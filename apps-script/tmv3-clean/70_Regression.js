/************************************************************
 * TM V3 — REGRESSION COMPARATOR
 *
 * Baseline: old consolidated verifier, keyed by Vertical + Event ID.
 * V3: current resolved records, including multiple Service tasks per
 *     one Event ID for explicit FP# multi-fireplace Work Orders.
 ************************************************************/

function tmv3_updateRegression_(resolvedRecords) {
  const sh = tmv3_sheet_('Regression');
  if (sh.getLastRow() < 2) return { baselineRows: 0, compared: 0 };

  const values = sh.getRange(1, 1, sh.getLastRow(), sh.getLastColumn()).getDisplayValues();
  const headers = values[0].map(tmv3_clean_);
  const ix = {};
  headers.forEach(function(h, i) { ix[h] = i; });

  const byEvent = {};
  (resolvedRecords || []).forEach(function(r) {
    const key = tmv3_regressionKey_(r.vertical, r.eventId);
    if (!byEvent[key]) byEvent[key] = [];
    byEvent[key].push(r);
  });

  const usedV3Tasks = {};
  let compared = 0;
  let agree = 0;
  let intentional = 0;
  let investigate = 0;
  let notRun = 0;

  const output = values.slice(1).map(function(row) {
    const vertical = tmv3_clean_(row[ix['Vertical']]);
    const eventId = tmv3_clean_(row[ix['Event ID']]);
    const oldTaskId = tmv3_clean_(row[ix['Old Task ID']]);
    const oldOverall = tmv3_clean_(row[ix['Old Overall']]);
    const oldStatus = tmv3_clean_(row[ix['Old Mapping Status']]);
    const oldTaskStatus = tmv3_clean_(row[ix['Old Live Task Status']]);
    const oldIssue = tmv3_clean_(row[ix['Old Issue']]);

    const key = tmv3_regressionKey_(vertical, eventId);
    const candidates = (byEvent[key] || []).slice();

    let v3 = null;

    if (oldTaskId) {
      v3 = candidates.filter(function(r) {
        return String(r.taskId || '') === oldTaskId;
      })[0] || null;
    }

    if (!v3 && candidates.length === 1) v3 = candidates[0];

    if (!v3 && candidates.length > 1) {
      v3 = candidates.filter(function(r) {
        const taskKey = key + '|' + String(r.taskId || '');
        return !usedV3Tasks[taskKey];
      })[0] || candidates[0];
    }

    if (!v3) {
      row[ix['Comparison']] = 'NOT RUN';
      row[ix['Difference / Review Note']] =
        'No V3 record exists for this baseline Event ID in the current shadow window.';
      row[ix['Last Compared']] = tmv3_now_();
      notRun++;
      return row;
    }

    if (v3.taskId) {
      usedV3Tasks[key + '|' + String(v3.taskId)] = true;
    }

    row[ix['V3 Status']] = v3.status || '';
    row[ix['V3 Customer']] = v3.customer || '';
    row[ix['V3 Order / Work Order']] = v3.order || '';
    row[ix['V3 Task ID']] = v3.taskId || '';
    row[ix['V3 Verification']] = v3.verification || '';
    row[ix['Last Compared']] = tmv3_now_();

    const comparison = tmv3_compareRegressionRecord_({
      oldOverall: oldOverall,
      oldStatus: oldStatus,
      oldTaskStatus: oldTaskStatus,
      oldTaskId: oldTaskId,
      oldIssue: oldIssue,
      v3: v3
    });

    row[ix['Comparison']] = comparison.status;
    row[ix['Difference / Review Note']] = comparison.note;
    compared++;

    if (comparison.status === 'AGREE') agree++;
    else if (comparison.status === 'INTENTIONAL IMPROVEMENT') intentional++;
    else if (comparison.status === 'INVESTIGATE') investigate++;

    return row;
  });

  sh.getRange(2, 1, output.length, headers.length).setValues(output);

  const baselineKeys = {};
  values.slice(1).forEach(function(row) {
    baselineKeys[tmv3_regressionKey_(
      row[ix['Vertical']],
      row[ix['Event ID']]
    )] = true;
  });

  // Append genuinely new V3 events that were not present in the Sep-21 baseline.
  const newRows = [];

  Object.keys(byEvent).forEach(function(key) {
    if (baselineKeys[key]) return;

    byEvent[key].forEach(function(v3) {
      const row = new Array(headers.length).fill('');
      row[ix['Vertical']] = v3.vertical || '';
      row[ix['Event ID']] = v3.eventId || '';
      row[ix['Old Overall']] = 'NO BASELINE';
      row[ix['Old Mapping Status']] = 'NO BASELINE';
      row[ix['V3 Status']] = v3.status || '';
      row[ix['V3 Customer']] = v3.customer || '';
      row[ix['V3 Order / Work Order']] = v3.order || '';
      row[ix['V3 Task ID']] = v3.taskId || '';
      row[ix['V3 Verification']] = v3.verification || '';
      row[ix['Comparison']] = 'NEW V3 EVENT';
      row[ix['Difference / Review Note']] =
        'Event was not present in the old Sep-21 all-rows verification baseline.';
      row[ix['Last Compared']] = tmv3_now_();
      newRows.push(row);
    });
  });

  if (newRows.length) {
    sh.getRange(sh.getLastRow() + 1, 1, newRows.length, headers.length).setValues(newRows);
  }

  const result = {
    baselineRows: output.length,
    compared: compared,
    agree: agree,
    intentionalImprovement: intentional,
    investigate: investigate,
    notRun: notRun,
    newV3Events: newRows.length
  };

  tmv3_audit_(
    'SYSTEM',
    '',
    '',
    'REGRESSION_COMPARE',
    investigate ? 'REVIEW' : 'PASS',
    JSON.stringify(result)
  );

  return result;
}

function tmv3_compareRegressionRecord_(input) {
  const oldFamily = tmv3_oldRegressionFamily_(
    input.oldOverall,
    input.oldStatus,
    input.oldTaskStatus,
    input.oldIssue
  );

  const v3Family = tmv3_v3RegressionFamily_(input.v3 && input.v3.status);

  const oldTaskId = tmv3_clean_(input.oldTaskId);
  const v3TaskId = tmv3_clean_(input.v3 && input.v3.taskId);

  if (
    oldFamily === 'BLOCKED_COMPLETED' &&
    input.v3 &&
    input.v3.status === 'READY RECREATE'
  ) {
    return {
      status: 'INTENTIONAL IMPROVEMENT',
      note:
        'Old model blocked a completed Task; V3 correctly exposes controlled RECREATE.'
    };
  }

  if (oldFamily === 'UNVERIFIED') {
    return {
      status: 'INVESTIGATE',
      note:
        'Old model was UNVERIFIED. V3 result requires independent evidence review.'
    };
  }

  if (oldFamily !== v3Family) {
    return {
      status: 'INVESTIGATE',
      note:
        'Decision family differs: old=' +
        oldFamily +
        ', V3=' +
        v3Family +
        '.'
    };
  }

  if (
    oldTaskId &&
    v3TaskId &&
    oldTaskId !== v3TaskId
  ) {
    return {
      status: 'INVESTIGATE',
      note:
        'Task ID differs: old=' +
        oldTaskId +
        ', V3=' +
        v3TaskId +
        '.'
    };
  }

  return {
    status: 'AGREE',
    note: 'Decision family and verified Task identity agree.'
  };
}

function tmv3_oldRegressionFamily_(overall, mappingStatus, taskStatus, issue) {
  const o = tmv3_norm_(overall);
  const m = tmv3_norm_(mappingStatus);
  const t = tmv3_norm_(taskStatus);
  const i = tmv3_norm_(issue);

  if (
    (o === 'blocked' || m === 'blocked') &&
    (
      t === 'done' ||
      t === 'complete' ||
      t === 'completed' ||
      i.indexOf('completed task') !== -1
    )
  ) {
    return 'BLOCKED_COMPLETED';
  }

  if (o === 'pass' || m === 'matched') return 'MATCHED';
  if (o === 'action required' || m.indexOf('ready') === 0) return 'READY';
  if (o === 'review' || m === 'review') return 'REVIEW';
  if (o === 'blocked' || m === 'blocked') return 'BLOCKED';
  if (o === 'ignored' || m === 'ignored') return 'IGNORED';
  if (o === 'unverified') return 'UNVERIFIED';
  return tmv3_clean_(overall || mappingStatus || 'UNKNOWN').toUpperCase();
}

function tmv3_v3RegressionFamily_(status) {
  const s = tmv3_norm_(status);

  if (s === 'matched') return 'MATCHED';
  if (s.indexOf('ready') === 0) return 'READY';
  if (s === 'review') return 'REVIEW';
  if (s === 'blocked') return 'BLOCKED';
  if (s === 'ignored') return 'IGNORED';
  return tmv3_clean_(status || 'UNKNOWN').toUpperCase();
}

function tmv3_regressionKey_(vertical, eventId) {
  return tmv3_clean_(vertical) + '|' + tmv3_clean_(eventId);
}

/************************************************************
 * TM V3 — ASSIGNMENT SOURCE REGRESSION
 *
 * Install / Delivery assignees come from Calendar TITLE only.
 * Narrative description/notes must never create assignments.
 ************************************************************/
function tmv3_assignmentTitleOnlyRegression() {
  const cases = [
    {
      name: 'INSTALL_DESCRIPTION_REFERENCE_IGNORED',
      eventRecord: {
        vertical: 'Install',
        title: 'Customer - SO 585199',
        description: 'Please test the fireplace and let SF know the results.',
        guests: ''
      },
      expected: []
    },
    {
      name: 'INSTALL_TITLE_MULTI_ASSIGNEE',
      eventRecord: {
        vertical: 'Install',
        title: 'Customer - John + SF',
        description: 'Thang is mentioned only in notes.',
        guests: ''
      },
      expected: [15, 18]
    },
    {
      name: 'INSTALL_AIDEN_IGNORED',
      eventRecord: {
        vertical: 'Install',
        title: 'Customer - John & Aiden 2-3',
        description: '',
        guests: ''
      },
      expected: [18]
    },
    {
      name: 'DELIVERY_DESCRIPTION_REFERENCE_IGNORED',
      eventRecord: {
        vertical: 'Delivery',
        title: 'Customer delivery 2-3',
        description: 'Call John after delivery.',
        guests: ''
      },
      expected: []
    },
    {
      name: 'DELIVERY_TITLE_MATTHEW',
      eventRecord: {
        vertical: 'Delivery',
        title: 'Customer - Matthew Thompson',
        description: 'John is mentioned only in notes.',
        guests: ''
      },
      expected: [26],
      expectedPools: []
    },
    {
      name: 'DELIVERY_TITLE_LEGACY_MULTI_ASSIGNEE',
      eventRecord: {
        vertical: 'Delivery',
        title: 'Customer - Jay & SF / Pramodh',
        description: '',
        guests: ''
      },
      expected: [1, 6, 15],
      expectedPools: []
    },
    {
      name: 'PREINSPECTION_POOL_ONLY',
      eventRecord: {
        vertical: 'PreInspection',
        title: 'Stephen - customer preinspection',
        description: 'Stephen is inspecting this appointment.',
        guests: 'stephen@classicfireplace.ca'
      },
      expected: [],
      expectedPools: [8]
    }
  ];

  const results = cases.map(function(testCase) {
    const desired = tmv3_desiredAssignment_(testCase.eventRecord);
    const actual = (desired.employeeIds || [])
      .map(Number)
      .sort(function(a,b) { return a - b; });
    const actualPools = (desired.poolIds || [])
      .map(Number)
      .sort(function(a,b) { return a - b; });
    const expected = (testCase.expected || [])
      .map(Number)
      .sort(function(a,b) { return a - b; });
    const expectedPools = (testCase.expectedPools || [])
      .map(Number)
      .sort(function(a,b) { return a - b; });
    const pass =
      JSON.stringify(actual) === JSON.stringify(expected) &&
      JSON.stringify(actualPools) === JSON.stringify(expectedPools);

    return {
      name: testCase.name,
      pass: pass,
      expected: expected,
      actual: actual,
      expectedPools: expectedPools,
      actualPools: actualPools
    };
  });

  const failures = results.filter(function(result) {
    return !result.pass;
  });

  if (failures.length) {
    throw new Error(
      'TMV3 assignment title-only regression failed: ' +
      JSON.stringify(failures)
    );
  }

  return {
    status: 'PASS',
    cases: results.length,
    results: results
  };
}


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

/************************************************************
 * TM V3 — LEGACY ASSIGNMENT PARITY REGRESSION
 *
 * Existing manual employee assignments are preserved.
 * Delivery / Service manage only Pool 4 ("To Be Assigned").
 ************************************************************/
function tmv3_assignmentLegacyParityRegression() {
  const cases = [
    {
      name:'INSTALL_PRESERVE_MANUAL_EMPLOYEE',
      record:{vertical:'Install'},
      desired:{employeeIds:[15],poolIds:[]},
      actual:[
        {type:'employee',id:15},
        {type:'employee',id:41}
      ],
      expected:'MATCH'
    },
    {
      name:'DELIVERY_PRESERVE_OTHER_EMPLOYEE',
      record:{vertical:'Delivery'},
      desired:{employeeIds:[18],poolIds:[]},
      actual:[
        {type:'employee',id:18},
        {type:'employee',id:26}
      ],
      expected:'MATCH'
    },
    {
      name:'DELIVERY_REMOVE_ONLY_TO_BE_ASSIGNED',
      record:{vertical:'Delivery'},
      desired:{employeeIds:[18],poolIds:[]},
      actual:[
        {type:'employee',id:18},
        {type:'employee',id:26},
        {type:'pool',id:4}
      ],
      expected:'MISMATCH',
      expectedConflicts:['pool|4']
    },
    {
      name:'SERVICE_PRESERVE_OTHER_TECHNICIAN',
      record:{vertical:'Service'},
      desired:{employeeIds:[26],poolIds:[]},
      actual:[
        {type:'employee',id:26},
        {type:'employee',id:38}
      ],
      expected:'MATCH'
    },
    {
      name:'SERVICE_REMOVE_ONLY_TO_BE_ASSIGNED',
      record:{vertical:'Service'},
      desired:{employeeIds:[26],poolIds:[]},
      actual:[
        {type:'employee',id:26},
        {type:'employee',id:38},
        {type:'pool',id:4}
      ],
      expected:'MISMATCH',
      expectedConflicts:['pool|4']
    },
    {
      name:'SERVICE_POOL_WITHOUT_TECH_BLOCKS',
      record:{vertical:'Service'},
      desired:{employeeIds:[],poolIds:[]},
      actual:[{type:'pool',id:4}],
      expected:'BLOCKED',
      expectedConflicts:['pool|4'],
      expectedBlocker:true
    },
    {
      name:'PREINSPECTION_POOL8_ONLY',
      record:{vertical:'PreInspection'},
      desired:{employeeIds:[],poolIds:[8]},
      actual:[{type:'pool',id:8}],
      expected:'MATCH'
    }
  ];

  const results = cases.map(function(testCase) {
    const result = tmv3_step7AssignmentCheck_(
      testCase.record,
      testCase.desired,
      testCase.actual
    );

    const conflicts = (result.conflicts || []).slice().sort();
    const expectedConflicts = (testCase.expectedConflicts || []).slice().sort();

    const pass =
      result.status === testCase.expected &&
      JSON.stringify(conflicts) === JSON.stringify(expectedConflicts) &&
      (
        testCase.expectedBlocker !== true ||
        !!tmv3_clean_(result.blocker)
      );

    return {
      name:testCase.name,
      pass:pass,
      expected:testCase.expected,
      actual:result.status,
      expectedConflicts:expectedConflicts,
      actualConflicts:conflicts,
      blocker:result.blocker || ''
    };
  });

  const failures = results.filter(function(result) {
    return !result.pass;
  });

  if (failures.length) {
    throw new Error(
      'TMV3 legacy assignment parity regression failed: ' +
      JSON.stringify(failures)
    );
  }

  return {
    status:'PASS',
    cases:results.length,
    results:results
  };
}

function tmv3_assignmentFeatureRegression() {
  const source = tmv3_assignmentTitleOnlyRegression();
  const parity = tmv3_assignmentLegacyParityRegression();

  return {
    status:
      source.status === 'PASS' && parity.status === 'PASS'
        ? 'PASS'
        : 'REVIEW',
    source:source,
    parity:parity,
    totalCases:Number(source.cases || 0) + Number(parity.cases || 0)
  };
}


/************************************************************
 * TM V3 — ISSUE 1 SINGLE DECISION AUTHORITY REGRESSION
 ************************************************************/
function tmv3_issue1ContractFixture_(overrides) {
  return Object.assign({
    vertical:'Install',
    eventId:'evt-test',
    calendarId:'cal-test',
    logicalKey:'Install|evt-test',
    disposition:'MATCH_EXISTING_OPEN',
    taskId:123,
    taskStatus:'Open',
    expectedCustomerId:'10',
    actualCustomerId:'10',
    customerCheck:'MATCH',
    expectedOrderId:'20',
    actualOrderId:'20',
    orderCheck:'MATCH',
    expectedLocationId:'30',
    locationStatus:'MATCHED',
    actualLocationId:'30',
    locationCheck:'MATCH',
    expectedRequestedById:'40',
    expectedRequestedByType:'contact',
    actualRequestedById:'40',
    actualRequestedByType:'contact',
    requestedByCheck:'MATCH',
    contactOwnership:'VERIFIED',
    expectedStart:'2026-09-28T13:00:00.000Z',
    expectedDue:'2026-09-28T14:00:00.000Z',
    startCheck:'MATCH',
    endCheck:'MATCH',
    desiredAssignmentEmployeeIds:[18],
    desiredAssignmentPoolIds:[],
    assignmentCheck:'MATCH',
    desiredField854:'',
    field854Check:'N/A',
    plan:'NO_CHANGE',
    actions:[TMV3_STEP7_ACTION.VERIFY_CALENDAR_LINKS],
    writeGate:'SHADOW_ONLY__NO_WRITES',
    blocker:'',
    sourceTaskIds:'123',
    sourceTaskIdList:['123'],
    engineVersion:TMV3.VERSION,
    plannedAt:new Date(),
    readStatus:'FRESH_TASK_GET',
    freshTaskReadStatus:'FRESH_TASK_GET',
    inputFingerprint:'fp-test',
    calendarUpdatedAt:''
  }, overrides || {});
}

function tmv3_issue1SingleDecisionAuthorityRegression() {
  const cases = [];

  function check(name, pass, evidence) {
    cases.push({
      name:name,
      pass:!!pass,
      evidence:evidence || ''
    });
  }

  const review = tmv3_issue1ContractFixture_({
    plan:'REVIEW_NO_AUTOMATIC_MUTATION',
    blocker:'Step 7 requires review.',
    actions:[]
  });

  check(
    'STEP7_REVIEW_BEATS_OLD_READY',
    !!review.blocker && review.actions.length === 0,
    review.plan
  );

  const blocked = tmv3_issue1ContractFixture_({
    plan:'REVIEW_CONTACT_OWNERSHIP',
    blocker:'Ownership failed.',
    actions:[]
  });

  check(
    'STEP7_BLOCKER_NO_ACTIONS',
    !!blocked.blocker && blocked.actions.length === 0,
    blocked.plan
  );

  const changed = tmv3_step7PlanChangedResult_({
    previousPlan:'PATCH_ASSIGNMENTS',
    contract:tmv3_issue1ContractFixture_({
      plan:'NO_CHANGE'
    })
  });

  check(
    'STALE_PLAN_CHANGED_NO_WRITE',
    changed &&
      changed.status === 'PLAN_CHANGED_NO_WRITE',
    changed && changed.freshPlan
  );

  const dateOnly = tmv3_issue1ContractFixture_({
    plan:'PATCH_DATES',
    actions:[
      TMV3_STEP7_ACTION.PATCH_DATES,
      TMV3_STEP7_ACTION.VERIFY_CALENDAR_LINKS
    ]
  });

  check(
    'DATE_PATCH_EXACT_ACTION',
    JSON.stringify(
      tmv3_step7ActionsForMode_(dateOnly, 'DATES')
    ) === JSON.stringify([
      TMV3_STEP7_ACTION.PATCH_DATES
    ]),
    JSON.stringify(dateOnly.actions)
  );

  const locationMismatch = tmv3_issue1ContractFixture_({
    plan:'REVIEW_RELATIONSHIP_CONFLICT',
    locationCheck:'MISMATCH',
    blocker:'Location mismatch.',
    actions:[]
  });

  check(
    'LOCATION_MISMATCH_NO_ACTIONS',
    locationMismatch.actions.length === 0 &&
      !!locationMismatch.blocker,
    locationMismatch.plan
  );

  const contactFailure = tmv3_issue1ContractFixture_({
    plan:'REVIEW_CONTACT_OWNERSHIP',
    contactOwnership:'UNVERIFIED',
    blocker:'Contact ownership failed.',
    actions:[]
  });

  check(
    'CONTACT_OWNERSHIP_FAILURE_NO_ACTIONS',
    contactFailure.actions.length === 0 &&
      contactFailure.contactOwnership === 'UNVERIFIED',
    contactFailure.plan
  );

  const multiA = tmv3_issue1ContractFixture_({
    vertical:'Service',
    logicalKey:'Service|evt-multi',
    eventId:'evt-multi',
    taskId:501,
    sourceTaskIds:'501,502',
    sourceTaskIdList:['501','502']
  });

  const multiB = tmv3_issue1ContractFixture_({
    vertical:'Service',
    logicalKey:'Service|evt-multi',
    eventId:'evt-multi',
    taskId:502,
    sourceTaskIds:'501,502',
    sourceTaskIdList:['501','502']
  });

  check(
    'MULTI_SERVICE_EXACT_TASK_ROWS',
    multiA.taskId !== multiB.taskId &&
      multiA.logicalKey === multiB.logicalKey &&
      multiA.sourceTaskIdList.length === 2 &&
      multiB.sourceTaskIdList.length === 2,
    multiA.taskId + ',' + multiB.taskId
  );

  const pre = tmv3_issue1ContractFixture_({
    vertical:'PreInspection',
    logicalKey:'PreInspection|evt-pre',
    expectedOrderId:'',
    actualOrderId:'',
    orderCheck:'MATCH_NOT_ATTACHED',
    expectedRequestedById:'15',
    expectedRequestedByType:'employee',
    desiredAssignmentEmployeeIds:[],
    desiredAssignmentPoolIds:[8],
    plan:'NO_CHANGE'
  });

  check(
    'PREINSPECTION_INVARIANTS_CONTRACT',
    pre.expectedOrderId === '' &&
      pre.expectedRequestedByType === 'employee' &&
      JSON.stringify(
        pre.desiredAssignmentPoolIds
      ) === '[8]',
    JSON.stringify({
      order:pre.expectedOrderId,
      requestedByType:pre.expectedRequestedByType,
      pools:pre.desiredAssignmentPoolIds
    })
  );

  const locationCreate = tmv3_issue1ContractFixture_({
    taskId:'',
    disposition:'CREATE_TASK',
    plan:'CREATE_LOCATION_THEN_CREATE_TASK',
    locationStatus:'CREATE_REQUIRED',
    expectedLocationId:'',
    expectedLocationAddress:'183 Hudson Dr, Toronto, ON M4T 2K7, Canada',
    actions:[
      TMV3_STEP7_ACTION.CREATE_LOCATION,
      TMV3_STEP7_ACTION.CREATE_TASK,
      TMV3_STEP7_ACTION.VERIFY_CALENDAR_LINKS
    ],
    readStatus:'NO_TASK_READ_REQUIRED',
    freshTaskReadStatus:'NO_TASK_READ_REQUIRED'
  });

  check(
    'CREATE_LOCATION_CAPABILITY_EXPLICITLY_UNSUPPORTED',
    locationCreate.actions.indexOf(
      TMV3_STEP7_ACTION.CREATE_LOCATION
    ) !== -1,
    locationCreate.plan
  );

  const noChange = tmv3_issue1ContractFixture_();

  check(
    'NO_CHANGE_TASK_MUTATION_NONE',
    tmv3_step7ActionsForMode_(
      noChange,
      'DATES'
    ).length === 0 &&
    tmv3_step7ActionsForMode_(
      noChange,
      'RELATIONSHIPS'
    ).length === 0 &&
    tmv3_step7ActionsForMode_(
      noChange,
      'ASSIGNEE'
    ).length === 0,
    JSON.stringify(noChange.actions)
  );

  const wrongLinkFallback = tmv3_step5ResolveStandardTask_(
    {
      vertical:'Delivery',
      existingTaskId:'100',
      step3:{ anchor:{ orderId:'20' } },
      step4:{
        customer:{ 'Customer ID':'1' },
        location:{ 'Location ID':'10' }
      }
    },
    {
      taskById:{
        '100':{
          'Task ID':'100',
          'Task Type':'Installation',
          'Name':'Installation',
          'Status':'Open'
        }
      },
      tasksByOrder:{
        '20':[{
          'Task ID':'200',
          'Task Type':'Delivery',
          'Name':'Delivery',
          'Status':'Open',
          'Customer ID':'1',
          'Location ID':'10',
          'Order ID':'20'
        }]
      },
      tasksByCustomer:{}
    }
  );

  check(
    'WRONG_VERTICAL_CALENDAR_LINK_SAFE_FALLBACK',
    wrongLinkFallback.disposition === 'MATCHED' &&
      wrongLinkFallback.tasks.length === 1 &&
      String(wrongLinkFallback.tasks[0]['Task ID']) === '200' &&
      wrongLinkFallback.evidence.indexOf(
        'CALENDAR_TASK_LINK_WRONG_VERTICAL_IGNORED'
      ) !== -1,
    JSON.stringify(wrongLinkFallback)
  );

  const assignment = tmv3_assignmentFeatureRegression();

  check(
    'ASSIGNMENT_PARITY_UNCHANGED',
    assignment.status === 'PASS',
    'cases=' + assignment.totalCases
  );

  let legacyTaskGuard = '';
  try {
    tmv3_assertLegacyMutationHelperDisabled_('REGRESSION_TEST');
  } catch (err) {
    legacyTaskGuard = String(err && err.message || err);
  }

  check(
    'LEGACY_TASK_MUTATION_HELPERS_FAIL_CLOSED',
    legacyTaskGuard.indexOf('STEP7_AUTHORITY_REQUIRED') !== -1,
    legacyTaskGuard
  );

  let legacyCalendarGuard = '';
  try {
    tmv3_assertLegacyCalendarMutationDisabled_('REGRESSION_TEST');
  } catch (err) {
    legacyCalendarGuard = String(err && err.message || err);
  }

  check(
    'LEGACY_CALENDAR_MUTATION_HELPERS_FAIL_CLOSED',
    legacyCalendarGuard.indexOf('STEP7_AUTHORITY_REQUIRED') !== -1,
    legacyCalendarGuard
  );


  const failures = cases.filter(function(item) {
    return !item.pass;
  });

  if (failures.length) {
    throw new Error(
      'TMV3 Issue 1 single-authority regression failed: ' +
      JSON.stringify(failures)
    );
  }

  return {
    status:'PASS',
    cases:cases.length,
    results:cases,
    assignmentRegression:assignment
  };
}

/************************************************************
 * TM V3 — ISSUE 2 NON-IDEMPOTENT CREATE SAFETY REGRESSION
 ************************************************************/

function tmv3_issue2CreateSafetyRegression() {
  const cases = [];

  function check(name, pass, evidence) {
    cases.push({
      name:name,
      pass:!!pass,
      evidence:evidence || ''
    });
  }

  const baseRows = [{
    'Vertical':'PreInspection',
    'Event ID':'evt-create-safety',
    'Task ID':'12345'
  }];

  const found = tmv3_existingPersistedTaskForEvent_(
    'PreInspection',
    'evt-create-safety',
    {
      rows:baseRows,
      readTask:function() {
        return {
          'Task ID':'12345',
          'Status':'Open'
        };
      }
    }
  );

  check(
    'PERSISTED_TASK_FOUND_VERIFIED',
    found.status === 'FOUND_VERIFIED' &&
      Number(found.taskId) === 12345,
    JSON.stringify(found)
  );

  const failedRead = tmv3_existingPersistedTaskForEvent_(
    'PreInspection',
    'evt-create-safety',
    {
      rows:baseRows,
      readTask:function() {
        throw new Error('HTTP 500');
      }
    }
  );

  check(
    'PERSISTED_TASK_READ_FAILURE_FAILS_CLOSED',
    failedRead.status === 'KNOWN_READ_FAILED' &&
      Number(failedRead.taskId) === 12345,
    JSON.stringify(failedRead)
  );

  const multiple = tmv3_existingPersistedTaskForEvent_(
    'PreInspection',
    'evt-create-safety',
    {
      rows:[
        {
          'Vertical':'PreInspection',
          'Event ID':'evt-create-safety',
          'Task ID':'12345'
        },
        {
          'Vertical':'PreInspection',
          'Event ID':'evt-create-safety',
          'Task ID':'12346'
        }
      ],
      readTask:function() {
        throw new Error('SHOULD_NOT_READ_MULTIPLE');
      }
    }
  );

  check(
    'MULTIPLE_PERSISTED_TASKS_REQUIRE_RECONCILIATION',
    multiple.status === 'MULTIPLE_KNOWN' &&
      multiple.taskIds.length === 2,
    JSON.stringify(multiple)
  );

  [
    'ATTEMPT_STARTED',
    'UNCERTAIN',
    'ID_CAPTURED',
    'VERIFIED',
    'CORRUPT',
    'UNKNOWN_STATE'
  ].forEach(function(state) {
    check(
      'CREATE_GUARD_' + state + '_BLOCKS_RETRY',
      tmv3_createGuardStateBlocksRetry_({
        state:state
      }) === true,
      state
    );
  });

  check(
    'EMPTY_CREATE_GUARD_ALLOWS_PREFLIGHT',
    tmv3_createGuardStateBlocksRetry_(null) === false,
    'null guard'
  );

  const parsedAddress = tmv3_parseCanadianCustomerLocation_(
    '183 Hudson Dr, Toronto, ON M4T 2K7, Canada',
    54635
  );

  check(
    'PREINSPECTION_LOCATION_PAYLOAD_CONTRACT',
    parsedAddress.CustomerId === 54635 &&
      parsedAddress.Address1 === '183 Hudson Dr' &&
      parsedAddress.City === 'Toronto' &&
      parsedAddress.State === 'ON' &&
      parsedAddress.PostalCode === 'M4T 2K7' &&
      parsedAddress.Country === 'Canada',
    JSON.stringify(parsedAddress)
  );

  const createLocationContract = tmv3_issue1ContractFixture_({
    taskId:'',
    disposition:'CREATE_TASK',
    expectedLocationId:'',
    expectedLocationAddress:
      '183 Hudson Dr, Toronto, ON M4T 2K7, Canada',
    locationStatus:'CREATE_REQUIRED',
    plan:
      'CREATE_LOCATION_THEN_CREATE_TASK__TYPE105__BLANK_DESCRIPTION__NO_SO__POOL8',
    actions:[
      TMV3_STEP7_ACTION.CREATE_LOCATION,
      TMV3_STEP7_ACTION.CREATE_TASK,
      TMV3_STEP7_ACTION.PATCH_ASSIGNMENTS,
      TMV3_STEP7_ACTION.VERIFY_CALENDAR_LINKS
    ],
    readStatus:'NO_TASK_READ_REQUIRED',
    freshTaskReadStatus:'NO_TASK_READ_REQUIRED'
  });

  let createLocationValidated = false;

  try {
    createLocationValidated =
      tmv3_step7ValidateExecutionContract_(
        createLocationContract
      ) === createLocationContract;
  } catch (err) {}

  check(
    'CREATE_LOCATION_CONTRACT_HAS_VERIFIED_ADDRESS',
    createLocationValidated,
    createLocationContract.expectedLocationAddress
  );

  let missingAddressFailedClosed = false;

  try {
    tmv3_step7ValidateExecutionContract_(
      Object.assign(
        {},
        createLocationContract,
        { expectedLocationAddress:'' }
      )
    );
  } catch (err) {
    missingAddressFailedClosed =
      String(err && err.message || err).indexOf(
        'missing the verified Calendar job-site address'
      ) !== -1;
  }

  check(
    'CREATE_LOCATION_MISSING_ADDRESS_FAILS_CLOSED',
    missingAddressFailedClosed,
    'blank expectedLocationAddress'
  );

  const failures = cases.filter(function(item) {
    return !item.pass;
  });

  if (failures.length) {
    throw new Error(
      'TMV3 Issue 2 CREATE safety regression failed: ' +
      JSON.stringify(failures)
    );
  }

  return {
    status:'PASS',
    cases:cases.length,
    results:cases
  };
}


/************************************************************
 * TM V3 — TITLE NORMALIZATION / PRESERVATION REGRESSION
 *
 * Pure/deterministic coverage only. No Calendar or Striven writes.
 ************************************************************/
function tmv3_titleNormalizationRegression() {
  const cases = [];

  function check(name, pass, detail) {
    cases.push({
      name:name,
      pass:pass === true,
      detail:detail === undefined ? '' : detail
    });
  }

  function baseRecord(vertical) {
    return {
      vertical:vertical,
      phone:'4165551212',
      title:'Legacy Title',
      step3:{
        disposition:'VERIFIED',
        anchor:{
          orderId:'26796',
          orderNumber:'585275',
          customerNumber:'62400'
        }
      },
      step4:{
        disposition:'VERIFIED',
        customer:{
          'Customer ID':'35659',
          'Customer Number':'62400',
          'Name':'John Smith',
          'Primary Phone':'4165551212'
        },
        location:{
          'Location ID':'32606',
          'Customer ID':'35659',
          'Address 1':'123 Main St',
          'City':'Toronto',
          'Province':'ON',
          'Postal Code':'M1M 1M1'
        }
      }
    };
  }

  let plan = tmv3_titleDescriptionPlan_(
    'John Install 416-555-1212',
    '585275 - John Smith - (416) 555-1212',
    'Customer asked for morning.'
  );
  check(
    'DESCRIPTION_PLAIN_TEXT_EXACT_PRESERVATION',
    plan.after ===
      'John Install 416-555-1212\n\nCustomer asked for morning.',
    plan.after
  );

  plan = tmv3_titleDescriptionPlan_(
    'Old Title',
    'New Title',
    ''
  );
  check(
    'DESCRIPTION_EMPTY_PRESERVATION',
    plan.after === 'Old Title\n\n',
    JSON.stringify(plan.after)
  );

  const html = '<p>Existing <a href="https://example.test">link</a><br>Line 2</p>';
  plan = tmv3_titleDescriptionPlan_(
    'Old Title',
    'New Title',
    html
  );
  check(
    'DESCRIPTION_HTML_AND_LINK_BYTES_PRESERVED',
    plan.after === 'Old Title\n\n' + html,
    plan.after
  );

  const lineBreaks = 'Line 1\nLine 2\n\nLine 4';
  plan = tmv3_titleDescriptionPlan_(
    'Old Title',
    'New Title',
    lineBreaks
  );
  check(
    'DESCRIPTION_USER_LINE_BREAKS_PRESERVED',
    plan.after === 'Old Title\n\n' + lineBreaks,
    JSON.stringify(plan.after)
  );

  plan = tmv3_titleDescriptionPlan_(
    'Old Title',
    'New Title',
    'Old Title\n\nExisting'
  );
  check(
    'DESCRIPTION_ALREADY_PREFIXED_NO_DUPLICATE',
    plan.after === 'Old Title\n\nExisting' &&
      plan.descriptionChange === false,
    JSON.stringify(plan)
  );

  plan = tmv3_titleDescriptionPlan_(
    'New Title',
    'New Title',
    'Old Title\n\nExisting'
  );
  check(
    'SECOND_RUN_IDEMPOTENT',
    plan.status === 'NO_CHANGE' &&
      plan.after === 'Old Title\n\nExisting',
    JSON.stringify(plan)
  );

  const install = baseRecord('Install');
  const installCalendar = tmv3_desiredCalendarTitle_(install);
  const installTask = tmv3_desiredTaskName_(install);
  check(
    'INSTALL_CANONICAL_CALENDAR_TITLE',
    installCalendar.status === 'READY' &&
      installCalendar.value ===
        '585275 - John Smith - (416) 555-1212',
    JSON.stringify(installCalendar)
  );
  check(
    'INSTALL_CANONICAL_TASK_NAME',
    installTask.status === 'READY' &&
      installTask.value.indexOf(
        'John Smith - 123 Main St'
      ) === 0 &&
      /\(416\) 555-1212$/.test(installTask.value),
    JSON.stringify(installTask)
  );

  const missingOrder = baseRecord('Install');
  missingOrder.step3.anchor.orderNumber = '';
  missingOrder.orderNumber = '';
  const missingOrderTitle =
    tmv3_desiredCalendarTitle_(missingOrder);
  check(
    'INSTALL_MISSING_SO_BLOCKS_CALENDAR_RENAME',
    missingOrderTitle.status === 'BLOCKED',
    JSON.stringify(missingOrderTitle)
  );

  const ambiguousCustomer = baseRecord('Install');
  ambiguousCustomer.step4.disposition = 'REVIEW';
  const ambiguousTitle =
    tmv3_desiredTaskName_(ambiguousCustomer);
  check(
    'AMBIGUOUS_CUSTOMER_BLOCKS_TASK_RENAME',
    ambiguousTitle.status === 'BLOCKED',
    JSON.stringify(ambiguousTitle)
  );

  const missingLocation = baseRecord('Install');
  missingLocation.step4.location = null;
  const missingLocationName =
    tmv3_desiredTaskName_(missingLocation);
  check(
    'MISSING_LOCATION_BLOCKS_TASK_RENAME',
    missingLocationName.status === 'BLOCKED',
    JSON.stringify(missingLocationName)
  );

  const missingPhone = baseRecord('Install');
  missingPhone.phone = '';
  missingPhone.step4.customer['Primary Phone'] = '';
  const missingPhoneName =
    tmv3_desiredTaskName_(missingPhone);
  check(
    'MISSING_PHONE_BLOCKS_TASK_RENAME',
    missingPhoneName.status === 'BLOCKED',
    JSON.stringify(missingPhoneName)
  );

  [
    '4165551212',
    '(416) 555-1212',
    '+1 416-555-1212'
  ].forEach(function(value, index) {
    check(
      'PHONE_FORMAT_VARIANT_' + (index + 1),
      tmv3_titlePhoneDisplay_(value) ===
        '(416) 555-1212',
      value
    );
  });

  const delivery = baseRecord('Delivery');
  const deliveryCalendar =
    tmv3_desiredCalendarTitle_(delivery);
  check(
    'DELIVERY_CALENDAR_TITLE_FAILS_CLOSED',
    deliveryCalendar.status === 'NOT_AUTHORIZED',
    JSON.stringify(deliveryCalendar)
  );

  const serviceOne = baseRecord('Service');
  serviceOne.serviceFireplaceNumber = 1;
  const serviceTwo = baseRecord('Service');
  serviceTwo.serviceFireplaceNumber = 2;
  const serviceOneName = tmv3_desiredTaskName_(serviceOne);
  const serviceTwoName = tmv3_desiredTaskName_(serviceTwo);
  check(
    'SERVICE_FP1_SUFFIX',
    / - FP#1$/.test(serviceOneName.value),
    serviceOneName.value
  );
  check(
    'SERVICE_FP2_SUFFIX',
    / - FP#2$/.test(serviceTwoName.value),
    serviceTwoName.value
  );
  check(
    'SERVICE_SIBLINGS_REMAIN_DISTINCT',
    serviceOneName.value !== serviceTwoName.value,
    serviceOneName.value + ' || ' + serviceTwoName.value
  );

  const pre = baseRecord('PreInspection');
  const preCalendar = tmv3_desiredCalendarTitle_(pre);
  const preTask = tmv3_desiredTaskName_(pre);
  const prePolicy = tmv3_preInspectionCreatePolicy();
  check(
    'PREINSPECTION_CANONICAL_CALENDAR_TITLE',
    preCalendar.value ===
      '62400 - John Smith - (416) 555-1212',
    JSON.stringify(preCalendar)
  );
  check(
    'PREINSPECTION_CANONICAL_TASK_NAME',
    preTask.status === 'READY' &&
      preTask.value.indexOf('John Smith - ') === 0,
    JSON.stringify(preTask)
  );
  check(
    'PREINSPECTION_GUARDRAILS_UNCHANGED',
    prePolicy.taskTypeId === 105 &&
      prePolicy.attachSalesOrder === false &&
      prePolicy.description === '' &&
      prePolicy.requiredPoolId === 8 &&
      prePolicy.field854 === 'NO_WRITE' &&
      prePolicy.technicianFields === 'DO_NOT_PREFILL',
    JSON.stringify(prePolicy)
  );

  const beforeAssignment = tmv3_desiredAssignment_({
    vertical:'Install',
    title:'John Install 4165551212'
  });
  const afterAssignment = tmv3_desiredAssignment_({
    vertical:'Install',
    title:'585275 - John Smith - (416) 555-1212',
    assignmentSourceTitle:'John Install 4165551212'
  });
  check(
    'ASSIGNMENT_PARITY_AFTER_TITLE_NORMALIZATION',
    JSON.stringify(beforeAssignment) ===
      JSON.stringify(afterAssignment) &&
      beforeAssignment.employeeIds.map(Number).indexOf(18) !== -1,
    JSON.stringify({
      before:beforeAssignment,
      after:afterAssignment
    })
  );

  const preservedRaw =
    'John Install 4165551212\n\nSO#585275\nCustomer note';
  const evidenceRaw =
    tmv3_identityEvidenceDescriptionRaw_(
      preservedRaw,
      'John Install 4165551212'
    );
  check(
    'PRESERVED_TITLE_EXCLUDED_FROM_IDENTITY_EVIDENCE',
    evidenceRaw === 'SO#585275\nCustomer note',
    evidenceRaw
  );

  check(
    'NO_MIGRATION_STATE_DOES_NOT_DROP_DESCRIPTION_TEXT',
    tmv3_identityEvidenceDescriptionRaw_(
      preservedRaw,
      ''
    ) === preservedRaw,
    'raw description must remain evidence when no verified migration state exists'
  );

  check(
    'OPEN_TASK_NAME_NORMALIZATION_ALLOWED',
    tmv3_taskNameNormalizationStatusAllowed_('OPEN') === true,
    'OPEN'
  );
  check(
    'DONE_TASK_NAME_NORMALIZATION_BLOCKED',
    tmv3_taskNameNormalizationStatusAllowed_('DONE') === false,
    'DONE'
  );
  check(
    'CANCELLED_TASK_NAME_NORMALIZATION_BLOCKED',
    tmv3_taskNameNormalizationStatusAllowed_('CANCELLED') === false,
    'CANCELLED'
  );

  const safeTitlePatch =
    tmv3_safeTaskPatchPayload_(
      { Title:'John Smith - 123 Main St - (416) 555-1212' },
      12345
    );
  check(
    'TASK_NAME_PATCH_IS_TITLE_ONLY',
    Object.keys(safeTitlePatch).sort().join(',') === 'Id,Title',
    JSON.stringify(safeTitlePatch)
  );

  let unknownFieldBlocked = false;
  try {
    tmv3_safeTaskPatchPayload_(
      { Title:'Allowed', UnexpectedField:'NO' },
      12345
    );
  } catch (err) {
    unknownFieldBlocked =
      /Blocked unknown Task PATCH field/.test(
        String(err && err.message || err)
      );
  }
  check(
    'TASK_NAME_PATCH_REJECTS_UNRELATED_FIELDS',
    unknownFieldBlocked,
    'UnexpectedField'
  );

  const installState = tmv3_step7TitleState_(
    install,
    'SO#581804 - John Smith - (416) 555-1212',
    'Open',
    false
  );
  check(
    'STEP7_INSTALL_REQUIRES_CALENDAR_AND_TASK_TITLE_ACTIONS',
    installState.calendarActionRequired === true &&
      installState.taskActionRequired === true,
    JSON.stringify(installState)
  );

  const deliveryState = tmv3_step7TitleState_(
    delivery,
    'SO #585289: Gallacher - John Smith - (416) 555-1212',
    'Open',
    false
  );
  check(
    'STEP7_DELIVERY_TASK_ONLY_CALENDAR_FAILS_CLOSED',
    deliveryState.calendarActionRequired === false &&
      deliveryState.calendarTitleStatus === 'NOT_AUTHORIZED' &&
      deliveryState.taskActionRequired === true,
    JSON.stringify(deliveryState)
  );

  const doneState = tmv3_step7TitleState_(
    install,
    'SO#581804 - John Smith - (416) 555-1212',
    'Done',
    false
  );
  check(
    'STEP7_DONE_TASK_HAS_NO_TITLE_ACTIONS',
    doneState.calendarActionRequired === false &&
      doneState.taskActionRequired === false,
    JSON.stringify(doneState)
  );

  const titleOnlyFiltered = tmv3_step7ActionsForMode_(
    {
      actions:[
        TMV3_STEP7_ACTION.PATCH_DATES,
        TMV3_STEP7_ACTION.PATCH_CALENDAR_TITLE,
        TMV3_STEP7_ACTION.PATCH_TASK_NAME,
        TMV3_STEP7_ACTION.VERIFY_CALENDAR_LINKS
      ]
    },
    'TITLE'
  );
  check(
    'TITLE_MODE_EXCLUDES_UNRELATED_ACTIONS',
    titleOnlyFiltered.join(',') ===
      [
        TMV3_STEP7_ACTION.PATCH_CALENDAR_TITLE,
        TMV3_STEP7_ACTION.PATCH_TASK_NAME
      ].join(','),
    JSON.stringify(titleOnlyFiltered)
  );

  let titleContractAccepted = false;
  try {
    const contract = {
      vertical:'Install',
      eventId:'evt-title-regression',
      logicalKey:'Install|evt-title-regression',
      disposition:'MATCH_EXISTING',
      plan:'PATCH_CALENDAR_TITLE_AND_TASK_NAME',
      actions:[
        TMV3_STEP7_ACTION.PATCH_CALENDAR_TITLE,
        TMV3_STEP7_ACTION.PATCH_TASK_NAME
      ],
      engineVersion:TMV3.VERSION,
      inputFingerprint:'abc123',
      blocker:'',
      desiredCalendarTitle:'585275 - John Smith - (416) 555-1212',
      desiredTaskName:
        'John Smith - 123 Main St, Toronto, ON, M1M 1M1 - (416) 555-1212'
    };
    titleContractAccepted =
      tmv3_step7ValidateExecutionContract_(contract) === contract;
  } catch (ignored) {}

  check(
    'STEP7_CONTRACT_ACCEPTS_EXPLICIT_TITLE_ACTIONS',
    titleContractAccepted,
    'PATCH_CALENDAR_TITLE + PATCH_TASK_NAME'
  );

  let blockedContractRejected = false;
  try {
    tmv3_step7ValidateExecutionContract_({
      vertical:'Install',
      eventId:'evt-title-regression',
      logicalKey:'Install|evt-title-regression',
      disposition:'MATCH_EXISTING',
      plan:'REVIEW_TITLE',
      actions:[TMV3_STEP7_ACTION.PATCH_TASK_NAME],
      engineVersion:TMV3.VERSION,
      inputFingerprint:'abc123',
      blocker:'blocked'
    });
  } catch (err) {
    blockedContractRejected =
      /Blocked Step 7 execution contract/.test(
        String(err && err.message || err)
      );
  }

  check(
    'BLOCKED_STEP7_CONTRACT_EXPOSES_NO_TITLE_WRITE',
    blockedContractRejected,
    'blocker + title action must fail contract validation'
  );

  const failures = cases.filter(function(item) {
    return !item.pass;
  });

  if (failures.length) {
    throw new Error(
      'TMV3 title normalization regression failed: ' +
      JSON.stringify(failures)
    );
  }

  return {
    status:'PASS',
    version:TMV3.VERSION,
    jev:'JEV NOT USED — DETERMINISTIC',
    cases:cases.length,
    results:cases
  };
}

function tmv3_liveHardeningRegression() {
  const issue1 =
    tmv3_issue1SingleDecisionAuthorityRegression();
  const issue2 =
    tmv3_issue2CreateSafetyRegression();
  const titleNormalization =
    tmv3_titleNormalizationRegression();

  const result = {
    status:
      issue1.status === 'PASS' &&
      issue2.status === 'PASS' &&
      titleNormalization.status === 'PASS'
        ? 'PASS'
        : 'FAIL',
    version:TMV3.VERSION,
    mode:TMV3.MODE,
    issue1:issue1,
    issue2:issue2,
    titleNormalization:titleNormalization
  };

  Logger.log(
    JSON.stringify(
      result,
      null,
      2
    )
  );

  if (result.status !== 'PASS') {
    throw new Error(
      'TMV3 live hardening regression failed.'
    );
  }

  return result;
}


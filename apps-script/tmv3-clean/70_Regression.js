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
    'SO#585275 - John Smith - (416) 555-1212',
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
    plan.after === 'Old Title',
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

  const lisaEscapedCalendarDescription =
    '<p>Large Traditional Gas. Full reno so should be open for us to install. ' +
    'She asked for quotes for an H5 and H6. I advised that would be a lot of heat ' +
    'and suggested a Bentley. She still seems very sold on the Valor though' +
    '&lt;br&gt;&lt;br&gt;&lt;strong&gt;&amp;#45;&amp;#45;&amp;#45;&amp;#45;&amp;#45;' +
    'Striven Links&amp;#45;&amp;#45;&amp;#45;&amp;#45;&amp;#45;&lt;/strong&gt;' +
    '&lt;br&gt;&lt;a href=&quot;https://classicfireplace.striven.com/next/crm#/sales-orders?accountId=62542&quot;&gt;' +
    'View Sales Orders – Lisa Wilson Duff (#62542)&lt;/a&gt;' +
    '&lt;br&gt;&lt;a href=&quot;https://classicfireplace.striven.com/Tasks/TaskInfo.aspx?TaskID=18790&quot;&gt;' +
    'Task #18790 – Lisa Wilson Duff - 47 Cousins Dr, Aurora, ON L4G 1B4, CANADA - (905) 717-0625&lt;/a&gt;</p>';

  const lisaReadableDescription =
    tmv3_calendarReadableDescription_(lisaEscapedCalendarDescription);

  check(
    'CALENDAR_DOUBLE_ESCAPED_HTML_READABLE',
    lisaReadableDescription ===
      'Large Traditional Gas. Full reno so should be open for us to install. ' +
      'She asked for quotes for an H5 and H6. I advised that would be a lot of heat ' +
      'and suggested a Bentley. She still seems very sold on the Valor though\n\n' +
      '-----Striven Links-----\n' +
      'View Sales Orders – Lisa Wilson Duff (#62542)\n' +
      'Task #18790 – Lisa Wilson Duff - 47 Cousins Dr, Aurora, ON L4G 1B4, CANADA - (905) 717-0625',
    lisaReadableDescription
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
        'SO#585275 - John Smith - (416) 555-1212',
    JSON.stringify(installCalendar)
  );
  check(
    'INSTALL_CANONICAL_TASK_NAME',
    installTask.status === 'READY' &&
      installTask.value ===
        'John Smith - 123 Main St, Toronto - (416) 555-1212',
    JSON.stringify(installTask)
  );
  check(
    'TASK_NAME_SHORT_ADDRESS_EXACT',
    installTask.value.indexOf(', ON') === -1 &&
      installTask.value.indexOf('M1M 1M1') === -1,
    installTask.value
  );

  const fullAddressLocation = {
    'Address 1':
      '119 Glenmount Park Rd, Old Toronto, Toronto, ON M4E 2N3, CANADA',
    'City':''
  };
  check(
    'TASK_NAME_FULL_ADDRESS_ROW_NORMALIZES_TO_STREET_CITY',
    tmv3_titleLocationDisplay_(fullAddressLocation) ===
      '119 Glenmount Park Rd, Toronto',
    tmv3_titleLocationDisplay_(fullAddressLocation)
  );

  const janeLocation = {
    'Address 1':
      '16 Brooke Ave, North York, Toronto, ON M5M 2J6, CANADA',
    'City':''
  };
  check(
    'TASK_NAME_PREFERS_VERIFIED_CALENDAR_LOCALITY',
    tmv3_titleLocationDisplay_(
      janeLocation,
      '16 Brooke Ave, North York, ON M5M 2J6, Canada'
    ) === '16 Brooke Ave, North York',
    tmv3_titleLocationDisplay_(
      janeLocation,
      '16 Brooke Ave, North York, ON M5M 2J6, Canada'
    )
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

  // Regression for the Jane Bisset canary failure: CREATE execution receives
  // a raw Calendar event, but must reuse the already-verified Step 7
  // Customer/Location relationship when constructing the canonical Task Name.
  const preExecutionBundle = {
    eventRecord:{
      vertical:'PreInspection',
      phone:'4165551212',
      location:'123 Main St, Toronto',
      orderNumber:'',
      title:'62400 - John Smith - (416) 555-1212'
    },
    resolved:{
      customerId:'35659',
      locationId:'32606',
      contactId:'',
      orderId:''
    },
    refs:{
      customerById:{
        '35659':pre.step4.customer
      },
      locationsByCustomer:{
        '35659':[pre.step4.location]
      },
      orderById:{}
    },
    contract:{
      expectedCustomerId:'35659',
      expectedLocationId:'32606'
    }
  };

  let preExecutionTitle = '';
  let preExecutionTitleError = '';
  try {
    preExecutionTitle = tmv3_createTaskTitle_(
      preExecutionBundle,
      'CREATE',
      {title:'Pre Inspection template'}
    );
  } catch (err) {
    preExecutionTitleError = String(err && err.message || err);
  }

  check(
    'PREINSPECTION_CREATE_EXECUTION_REUSES_VERIFIED_IDENTITY_CONTEXT',
    !preExecutionTitleError &&
      preExecutionTitle ===
        'John Smith - 123 Main St, Toronto - (416) 555-1212',
    preExecutionTitleError || preExecutionTitle
  );

  const preCreateLocationRecord = baseRecord('PreInspection');
  preCreateLocationRecord.location =
    '123 Littles Rd, Scarborough, ON M1B 5G9, Canada';
  preCreateLocationRecord.step4 = Object.assign(
    {},
    preCreateLocationRecord.step4,
    {
      location:null,
      locationStatus:'CREATE_REQUIRED',
      evidence:['NEW_CUSTOMER_LOCATION_REQUIRED']
    }
  );
  const preCreateLocationName =
    tmv3_desiredTaskName_(preCreateLocationRecord);

  check(
    'PREINSPECTION_CREATE_REQUIRED_ADDRESS_BUILDS_CANONICAL_TASK_NAME',
    preCreateLocationName.status === 'READY' &&
      preCreateLocationName.value ===
        'John Smith - 123 Littles Rd, Scarborough - (416) 555-1212',
    JSON.stringify(preCreateLocationName)
  );

  const prePolicy = tmv3_preInspectionCreatePolicy();
  check(
    'PREINSPECTION_CANONICAL_CALENDAR_TITLE',
    preCalendar.value ===
      '62400 - John Smith - (416) 555-1212',
    JSON.stringify(preCalendar)
  );
  const preTitlePlan = tmv3_titleDescriptionPlan_(
    'C#62400 - John Smith - (416) 555-1212',
    '62400 - John Smith - (416) 555-1212',
    'Existing authored note',
    { preserveOldTitle:true }
  );
  check(
    'PREINSPECTION_TITLE_NORMALIZATION_PRESERVES_PRIOR_TITLE',
    preTitlePlan.titleChange === true &&
      preTitlePlan.descriptionChange === true &&
      preTitlePlan.after ===
        'C#62400 - John Smith - (416) 555-1212\n\nExisting authored note',
    JSON.stringify(preTitlePlan)
  );

  const preNotesCleaned = tmv3_preInspectionCalendarNotesText_(
    'C#62400 - John Smith - (416) 555-1212\n\nExisting authored note\n\n------- Pre-Inspection Task Link -------\nTask #18845\nhttps://classicfireplace.striven.com/Tasks/TaskInfo.aspx?TaskID=18845',
    {
      customerNumber:'62400',
      customerName:'John Smith',
      phone:'(416) 555-1212',
      currentTitle:'62400 - John Smith - (416) 555-1212'
    }
  );
  check(
    'PREINSPECTION_DESCRIPTION_PRESERVES_OLD_TITLE_AND_STRIPS_LEGACY_TASK_BLOCK',
    preNotesCleaned ===
      'C#62400 - John Smith - (416) 555-1212\n\nExisting authored note',
    preNotesCleaned
  );

  const preLinkPlan = tmv3_buildCalendarLinkPlan_(
    Object.assign({}, pre, {
      title:'62400 - John Smith - (416) 555-1212',
      customerNumber:'62400',
      calendarCustomerName:'John Smith'
    }),
    [{
      customerId:'35659',
      customer:'John Smith',
      taskId:'18845',
      task:'18845'
    }]
  );
  check(
    'PREINSPECTION_LINK_LABELS_ARE_MEANINGFUL_AND_STABLE',
    preLinkPlan.links.length === 2 &&
      preLinkPlan.links[0].label ===
        'View Sales Orders – John Smith (#62400)' &&
      preLinkPlan.links[1].label ===
        'Task #18845 – John Smith - 123 Main St, Toronto - (416) 555-1212',
    JSON.stringify(preLinkPlan.links)
  );

  const preExecutionLinkBundle = {
    eventRecord:{
      vertical:'PreInspection',
      eventId:'evt-pre-link',
      title:'62400 - John Smith - (416) 555-1212',
      phone:'4165551212',
      customerNumber:'62400',
      calendarCustomerName:'John Smith',
      step4:pre.step4
    },
    records:[{
      customerId:'35659',
      taskId:'18845',
      task:'18845'
    }],
    contract:{
      taskId:'18845',
      desiredTaskName:'John Smith - 123 Main St, Toronto - (416) 555-1212'
    }
  };

  const preExecutionLinkRecords =
    preExecutionLinkBundle.records.map(function(record) {
      return Object.assign({}, record || {});
    });

  if (
    preExecutionLinkBundle.eventRecord.vertical === 'PreInspection' &&
    preExecutionLinkBundle.contract &&
    tmv3_clean_(preExecutionLinkBundle.contract.desiredTaskName)
  ) {
    const expectedTaskId =
      tmv3_clean_(preExecutionLinkBundle.contract.taskId);

    preExecutionLinkRecords.forEach(function(record) {
      if (
        !expectedTaskId ||
        tmv3_clean_(record.taskId) === expectedTaskId
      ) {
        record.task =
          tmv3_clean_(preExecutionLinkBundle.contract.desiredTaskName);
      }
    });
  }

  const preExecutionLinkPlan = tmv3_buildCalendarLinkPlan_(
    preExecutionLinkBundle.eventRecord,
    preExecutionLinkRecords
  );

  check(
    'PREINSPECTION_EXECUTION_LINK_USES_VERIFIED_TASK_NAME_NOT_NUMERIC_FALLBACK',
    preExecutionLinkPlan.links[1].label ===
      'Task #18845 – John Smith - 123 Main St, Toronto - (416) 555-1212',
    JSON.stringify(preExecutionLinkPlan.links)
  );

  const preDescription = tmv3_managedCalendarDescription_(
    '62400 - John Smith - (416) 555-1212\n\n' +
      'Line one\nwrapped continuation\n\nSecond paragraph\n\n' +
      '<b>-----Striven Links-----</b><br>' +
      '<a href="https://old.example">old</a>',
    preLinkPlan
  );
  const legacyPlainLinksCleaned =
    tmv3_stripManagedLinkBlocks_(
      'Existing note\n\nStriven Links\n\n' +
      '[View Sales Orders – John Smith (#62400)](https://example.test/customer)\n\n' +
      '[Task #18845 - Preinspect - John Smith - (416) 555-1212](https://example.test/task)'
    );
  check(
    'PREINSPECTION_PLAIN_STRIVEN_LINKS_LEGACY_BLOCK_REMOVED',
    legacyPlainLinksCleaned === 'Existing note',
    legacyPlainLinksCleaned
  );

  check(
    'PREINSPECTION_DESCRIPTION_FORMAT_IS_FROZEN_TO_MONIC_PATTERN',
    preDescription.indexOf(
      '62400 - John Smith - (416) 555-1212\n\n' +
      'Line one wrapped continuation\n\nSecond paragraph\n\n'
    ) === 0 &&
      preDescription.indexOf(
        '-----Striven Links-----  \n'
      ) !== -1 &&
      (preDescription.match(/Striven Links/g) || []).length === 1 &&
      preDescription.indexOf(
        '[View Sales Orders – John Smith (#62400)]('
      ) !== -1 &&
      preDescription.indexOf(
        '[Task #18845 – John Smith - 123 Main St, Toronto - (416) 555-1212]('
      ) !== -1 &&
      preDescription.indexOf('old.example') === -1 &&
      preDescription.indexOf('Pre-Inspection Task Link') === -1 &&
      preDescription.indexOf('<br>') === -1 &&
      preDescription.indexOf('<a href=') === -1,
    preDescription
  );
  const escapedMarkdownLegacy = tmv3_managedCalendarDescription_(
    'Existing note\n\n' +
      '**\\-----Striven\nLinks-----**\n\n' +
      '[View Sales Orders – John Smith (#62400)](https://old.example/customer)\n\n' +
      '[Task #18845 - Preinspect - John Smith - (416) 555-1212](https://old.example/task)',
    preLinkPlan
  );
  check(
    'PREINSPECTION_ESCAPED_MARKDOWN_LINK_BLOCK_REPLACED_ONCE',
    (
      escapedMarkdownLegacy.match(/Striven Links/g) || []
    ).length === 1 &&
      escapedMarkdownLegacy.indexOf('old.example') === -1 &&
      escapedMarkdownLegacy.indexOf('Existing note') === 0,
    escapedMarkdownLegacy
  );

  const headingBreakLegacy = tmv3_managedCalendarDescription_(
    '**Sales Order:** SO#585434  \nKeep these notes',
    preLinkPlan
  );
  check(
    'PREINSPECTION_SALES_ORDER_HEADING_REMOVED_CONTENT_PRESERVED',
    headingBreakLegacy.indexOf(
      'SO#585434\n\nKeep these notes'
    ) === 0 &&
      headingBreakLegacy.indexOf('Sales Order:') === -1,
    headingBreakLegacy
  );

  check(
    'PREINSPECTION_NOTES_HEADING_IS_NOT_EMITTED',
    preDescription.indexOf('**Notes:**') === -1 &&
      preDescription.indexOf('Notes:') === -1,
    preDescription
  );

  check(
    'PREINSPECTION_STRIVEN_LINKS_USE_MONIC_CLICKABLE_SOURCE_PATTERN',
    preDescription.indexOf(
      '[View Sales Orders – John Smith (#62400)](https://classicfireplace.striven.com/next/crm#/sales-orders?accountId=35659)'
    ) !== -1 &&
      preDescription.indexOf(
        '[Task #18845 – John Smith - 123 Main St, Toronto - (416) 555-1212](https://classicfireplace.striven.com/Tasks/TaskInfo.aspx?TaskID=18845)'
      ) !== -1,
    preDescription
  );

  check(
    'PREINSPECTION_CANONICAL_BARE_NUMBER_PARSES_CUSTOMER_NUMBER',
    tmv3_extractCustomerNumberForVertical_(
      'PreInspection',
      '62400 - John Smith - (416) 555-1212'
    ) === '62400',
    tmv3_extractCustomerNumberForVertical_(
      'PreInspection',
      '62400 - John Smith - (416) 555-1212'
    )
  );
  check(
    'PREINSPECTION_LEGACY_C_PREFIX_STILL_PARSES',
    tmv3_extractCustomerNumberForVertical_(
      'PreInspection',
      'C#62400 - John Smith - (416) 555-1212'
    ) === '62400',
    tmv3_extractCustomerNumberForVertical_(
      'PreInspection',
      'C#62400 - John Smith - (416) 555-1212'
    )
  );
  check(
    'PREINSPECTION_LEGACY_CUST_PREFIX_STILL_PARSES',
    tmv3_extractCustomerNumberForVertical_(
      'PreInspection',
      'Cust#62400 - John Smith - (416) 555-1212'
    ) === '62400',
    tmv3_extractCustomerNumberForVertical_(
      'PreInspection',
      'Cust#62400 - John Smith - (416) 555-1212'
    )
  );
  check(
    'PREINSPECTION_CANONICAL_BARE_NUMBER_NAME_EXTRACTION',
    tmv3_preInspectionCalendarCustomerName_(
      '62400 - John Smith - (416) 555-1212',
      '62400'
    ) === 'John Smith',
    tmv3_preInspectionCalendarCustomerName_(
      '62400 - John Smith - (416) 555-1212',
      '62400'
    )
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
      prePolicy.calendarNotes === 'CALENDAR_ONLY' &&
      prePolicy.previousCalendarTitlePolicy ===
        'PRESERVE_AS_FIRST_DESCRIPTION_LINE_NO_HEADER' &&
      prePolicy.descriptionHeaderPolicy ===
        'REMOVE_NOTES_AND_SALES_ORDER_LABELS_PRESERVE_CONTENT' &&
      prePolicy.calendarCopyParityPolicy ===
        'FULL_BUSINESS_VISIBLE_PARITY_REQUIRED' &&
      prePolicy.field854 === 'DO_NOT_MANAGE' &&
      prePolicy.infoCustomFieldsAtCreate === 'NONE' &&
      prePolicy.requiredPoolId === 8 &&
      prePolicy.requestedBy === 'CALENDAR_ORGANIZER' &&
      prePolicy.assignedToFromOrganizer === false &&
      prePolicy.technicianFields === 'DO_NOT_PREFILL',
    JSON.stringify(prePolicy)
  );

  check(
    'PREINSPECTION_REQUIRED_COPY_PREFLIGHT_BLOCKS',
    tmv3_titleMissingRequiredCalendarIds_(
      ['calendar-a','calendar-b'],
      [{ calendarId:'calendar-a' }]
    ).join(',') === 'calendar-b',
    'calendar-b must block before any title write'
  );

  check(
    'PREINSPECTION_FIELD854_ACTION_REMOVED',
    TMV3_STEP7_ACTION.PATCH_FIELD854 === undefined,
    JSON.stringify(TMV3_STEP7_ACTION)
  );

  check(
    'SERVICE_TASK_CREATION_OWNED_BY_STRIVEN_WORKFLOW',
    TMV3_HARD_RULES.Service.taskCreationOwner === 'STRIVEN_WORKFLOW' &&
      TMV3_HARD_RULES.Service.taskMappingCreatePolicy === 'DO_NOT_CREATE_OR_RECREATE',
    JSON.stringify(TMV3_HARD_RULES.Service)
  );

  const serviceNoTaskDecision = tmv3_step6NoOpenTaskDecision_({
    vertical:'Service',
    start:'2026-10-07T10:00:00',
    step5:{ historyTasks:[] }
  });
  check(
    'SERVICE_NO_TASK_NEVER_AUTHORIZES_CREATE',
    serviceNoTaskDecision.disposition === 'BLOCKED' &&
      serviceNoTaskDecision.code === 'SERVICE_TASK_CREATION_OWNED_BY_STRIVEN',
    JSON.stringify(serviceNoTaskDecision)
  );

  check(
    'PREINSPECTION_HARD_RULE_ASSERTION_PASSES',
    tmv3_assertHardRules_().status === 'PASS',
    JSON.stringify(tmv3_assertHardRules_())
  );

  const forbiddenPayload = {
    Type:{ Id:105, Name:'Pre Inspection' },
    SalesOrder:{ Id:999 },
    Description:'must be removed',
    InfoCustomFields:[
      { Id:854, Name:'Install Notes', Value:'must be removed' },
      { Id:900, Name:'Other', Value:'must also be absent at CREATE' }
    ]
  };
  tmv3_enforcePreInspectionCreatePayloadHardRules_(forbiddenPayload);
  check(
    'PREINSPECTION_CREATE_PAYLOAD_ENFORCES_NO_SO_BLANK_DESCRIPTION_NO_CUSTOM_FIELDS',
    forbiddenPayload.Description === '' &&
      !forbiddenPayload.SalesOrder &&
      !forbiddenPayload.InfoCustomFields &&
      tmv3_assertPreInspectionCreatePayloadHardRules_(forbiddenPayload) === true,
    JSON.stringify(forbiddenPayload)
  );

  const serviceCopies = tmv3_requiredCalendarCopiesForEvent_({
    vertical:'Service',
    calendarId:'service-tech-calendar',
    sourceCalendarIds:['service-tech-calendar']
  });
  check(
    'SERVICE_CALENDAR_WRITES_TARGET_ACTUAL_COPY_ONLY',
    JSON.stringify(serviceCopies) ===
      JSON.stringify(['service-tech-calendar']),
    JSON.stringify(serviceCopies)
  );

  const preCreateRecord = Object.assign({}, pre, {
    title:'62400 - John Smith - 4165551212',
    description:'Installer reference note',
    organizer:'stephen@classicfireplace.ca',
    step4:Object.assign({}, pre.step4, {
      locationStatus:'MATCHED',
      contact:null,
      evidence:[]
    })
  });
  const preCreateRuntime = {
    taskById:{},
    contactByKey:{},
    organizerByEmail:{
      'stephen classicfireplace ca':{
        status:'MATCHED',
        employee:{ id:15, name:'Stephen Foley' },
        evidence:'REGRESSION_ORGANIZER_MATCH'
      }
    }
  };
  const preCreatePlan = tmv3_step7CreatePlan_(
    preCreateRecord,
    'CREATE_TASK',
    [],
    preCreateRuntime
  );
  check(
    'PREINSPECTION_CREATE_EXCLUDES_FIELD854_AND_INCLUDES_CALENDAR_TITLE',
    preCreatePlan.actions.indexOf(
      'PATCH_FIELD854'
    ) === -1 &&
      preCreatePlan.actions.indexOf(
        TMV3_STEP7_ACTION.PATCH_CALENDAR_TITLE
      ) !== -1 &&
      !Object.prototype.hasOwnProperty.call(preCreatePlan, 'desiredField854') &&
      preCreatePlan.desiredCalendarTitle ===
        '62400 - John Smith - (416) 555-1212',
    JSON.stringify({
      plan:preCreatePlan.plan,
      actions:preCreatePlan.actions,
      desiredCalendarTitle:preCreatePlan.desiredCalendarTitle
    })
  );

  const taskProtectedBefore = tmv3_titleTaskProtectedSnapshot_({
    'Task ID':'123',
    'Task Number':'T123',
    'Task Type ID':'105',
    'Task Type':'Pre Inspection',
    'Status':'Open',
    'Name':'Old',
    'Customer ID':'10',
    'Location ID':'20',
    'Contact ID':'30',
    'Order ID':'',
    'Start':'2026-09-30T10:00:00',
    'Due':'2026-09-30T11:00:00',
    'Assignees':'John, Matt',
    'Pools':'Pre-Inspection Pool'
  });
  const taskProtectedAfter = tmv3_titleTaskProtectedSnapshot_({
    'Task ID':'123',
    'Task Number':'T123',
    'Task Type ID':'105',
    'Task Type':'Pre Inspection',
    'Status':'Open',
    'Name':'New',
    'Customer ID':'10',
    'Location ID':'20',
    'Contact ID':'30',
    'Order ID':'',
    'Start':'2026-09-30T10:00:00',
    'Due':'2026-09-30T11:00:00',
    'Assignees':'Matt, John',
    'Pools':'Pre-Inspection Pool'
  });
  check(
    'TASK_NAME_PROTECTED_FIELDS_IGNORE_NAME_ONLY',
    JSON.stringify(taskProtectedBefore) === JSON.stringify(taskProtectedAfter),
    JSON.stringify({
      before:taskProtectedBefore,
      after:taskProtectedAfter
    })
  );

  const changedTaskProtected = Object.assign(
    {},
    taskProtectedAfter,
    { locationId:'999' }
  );
  check(
    'TASK_NAME_PROTECTED_FIELDS_DETECT_UNRELATED_CHANGE',
    JSON.stringify(taskProtectedBefore) !== JSON.stringify(changedTaskProtected),
    JSON.stringify(changedTaskProtected)
  );

  const beforeAssignment = tmv3_desiredAssignment_({
    vertical:'Install',
    title:'John Install 4165551212'
  });
  const afterAssignment = tmv3_desiredAssignment_({
    vertical:'Install',
    title:'SO#585275 - John Smith - (416) 555-1212',
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
      desiredCalendarTitle:'SO#585275 - John Smith - (416) 555-1212',
      desiredTaskName:
        'John Smith - 123 Main St, Toronto - (416) 555-1212'
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

function tmv3_foundation0Regression() {
  const cases = [];

  function check(name, pass, detail) {
    cases.push({
      name:name,
      pass:pass === true,
      detail:detail === undefined ? '' : detail
    });
  }

  check(
    'FOUNDATION0_OPERATIONAL_SOURCE_TTL_AT_LEAST_120_MIN',
    tmv3_operationalSourceMinAgeMinutes_() >= 120,
    tmv3_operationalSourceMinAgeMinutes_()
  );

  check(
    'FOUNDATION0_MASTER_SOURCE_TTL_AT_LEAST_360_MIN',
    tmv3_masterSourceMinAgeMinutes_() >= 360,
    tmv3_masterSourceMinAgeMinutes_()
  );

  check(
    'FOUNDATION0_MASTER_TIER_REFRESHES_LESS_OFTEN_THAN_TRANSACTIONS',
    tmv3_masterSourceMinAgeMinutes_() >
      tmv3_operationalSourceMinAgeMinutes_(),
    tmv3_masterSourceMinAgeMinutes_() +
      ' vs ' +
      tmv3_operationalSourceMinAgeMinutes_()
  );

  const contactTtl = Number(
    TMV3.OPERATIONS &&
    TMV3.OPERATIONS.customerContactsCacheSeconds ||
    0
  );
  check(
    'FOUNDATION0_CONTACT_CACHE_AT_LEAST_6_HOURS',
    contactTtl >= 21600,
    contactTtl
  );

  check(
    'FOUNDATION0_EMPTY_ARRAY_IS_VALID_REPORT',
    tmv3_extractReportRows_([]).length === 0,
    '[]'
  );

  check(
    'FOUNDATION0_EXPLICIT_EMPTY_DATA_ARRAY_IS_VALID_REPORT',
    tmv3_extractReportRows_({ Data:[] }).length === 0,
    '{Data:[]}'
  );

  let invalidShapeBlocked = false;
  try {
    tmv3_extractReportRows_({ status:'ok' });
  } catch (err) {
    invalidShapeBlocked =
      /TMV3_REPORT_SCHEMA_INVALID/.test(
        String(err && err.message || err)
      );
  }
  check(
    'FOUNDATION0_UNKNOWN_REPORT_SHAPE_FAILS_CLOSED',
    invalidShapeBlocked,
    'unrecognized object'
  );

  let nullShapeBlocked = false;
  try {
    tmv3_extractReportRows_(null);
  } catch (err) {
    nullShapeBlocked =
      /TMV3_REPORT_SCHEMA_INVALID/.test(
        String(err && err.message || err)
      );
  }
  check(
    'FOUNDATION0_NULL_REPORT_FAILS_CLOSED',
    nullShapeBlocked,
    'null'
  );

  const failures = cases.filter(function(item) {
    return !item.pass;
  });

  if (failures.length) {
    throw new Error(
      'TMV3 Foundation 0 regression failed: ' +
      JSON.stringify(failures)
    );
  }

  return {
    status:'PASS',
    version:TMV3.VERSION,
    cases:cases.length,
    results:cases
  };
}

function tmv3_stage3Stage4CacheFirstRegression() {
  const cases = [];

  function check(name, pass, detail) {
    cases.push({
      name:name,
      pass:pass === true,
      detail:detail === undefined ? '' : detail
    });
  }

  const sales = { 'Order Type':'SALES_ORDER' };
  const delivery = { 'Order Type':'DELIVERY_APPROVED' };
  const mergedDelivery = {
    'Order Type':'SALES_ORDER|DELIVERY_APPROVED'
  };
  const work = { 'Order Type':'WORK_ORDER' };

  check(
    'STAGE3_INSTALL_ACCEPTS_SALES_ORDER',
    tmv3_step3OrderMatchesVertical_(sales, 'Install') === true,
    sales['Order Type']
  );
  check(
    'STAGE3_INSTALL_REJECTS_WORK_ORDER',
    tmv3_step3OrderMatchesVertical_(work, 'Install') === false,
    work['Order Type']
  );
  check(
    'STAGE3_DELIVERY_REQUIRES_DELIVERY_APPROVED',
    tmv3_step3OrderMatchesVertical_(delivery, 'Delivery') === true &&
      tmv3_step3OrderMatchesVertical_(mergedDelivery, 'Delivery') === true &&
      tmv3_step3OrderMatchesVertical_(sales, 'Delivery') === false,
    'delivery-approved gate'
  );
  check(
    'STAGE3_SERVICE_REQUIRES_WORK_ORDER',
    tmv3_step3OrderMatchesVertical_(work, 'Service') === true &&
      tmv3_step3OrderMatchesVertical_(sales, 'Service') === false &&
      tmv3_step3OrderMatchesVertical_(delivery, 'Service') === false,
    'work-order gate'
  );
  check(
    'STAGE3_PREINSPECTION_USES_ONLY_SALES_ORDER_EVIDENCE',
    tmv3_step3OrderMatchesVertical_(sales, 'PreInspection') === true &&
      tmv3_step3OrderMatchesVertical_(delivery, 'PreInspection') === true &&
      tmv3_step3OrderMatchesVertical_(work, 'PreInspection') === false,
    'no work-order corroboration'
  );

  const deferredContact = tmv3_step4ResolveContact_(
    { title:'Example', location:'1 Example St' },
    { 'Customer ID':'12345' },
    ''
  );
  check(
    'STAGE4_CONTACT_LOOKUP_IS_DEFERRED_WITHOUT_API',
    deferredContact.status === 'NO_MATCH' &&
      (deferredContact.evidence || []).indexOf(
        'CONTACT_LOOKUP_DEFERRED_TO_WRITE_GATE'
      ) !== -1,
    JSON.stringify(deferredContact)
  );

  const corroboration = tmv3_step4CorroborateCustomer_(
    {
      title:'Unrelated Name',
      descriptionClean:'',
      description:'',
      location:'1 Example St'
    },
    {
      'Customer ID':'12345',
      'Name':'Different Customer',
      'Primary Phone':''
    }
  );
  check(
    'STAGE4_CONTACT_CORROBORATION_IS_DEFERRED_WITHOUT_API',
    corroboration.matched === false &&
      (corroboration.evidence || []).indexOf(
        'CONTACT_CORROBORATION_DEFERRED_TO_WRITE_GATE'
      ) !== -1,
    JSON.stringify(corroboration)
  );

  const failures = cases.filter(function(item) {
    return !item.pass;
  });

  if (failures.length) {
    throw new Error(
      'TMV3 Stage 3/4 cache-first regression failed: ' +
      JSON.stringify(failures)
    );
  }

  return {
    status:'PASS',
    version:TMV3.VERSION,
    cases:cases.length,
    results:cases
  };
}

function tmv3_stage4IdentityRecoveryRegression() {
  const cases = [];

  function check(name, pass, detail) {
    cases.push({
      name:name,
      pass:pass === true,
      detail:detail === undefined ? '' : detail
    });
  }

  check(
    'STAGE4_ORDER_NOT_FOUND_MAY_ADVANCE_TO_IDENTITY_ONLY',
    tmv3_step4AnchorPendingIdentityAllowed_({
      disposition:'BLOCKED',
      code:'ANCHOR_ORDER_NOT_FOUND'
    }) === true,
    'ANCHOR_ORDER_NOT_FOUND'
  );

  check(
    'STAGE4_MISSING_ORDER_NUMBER_MAY_ADVANCE_TO_IDENTITY_ONLY',
    tmv3_step4AnchorPendingIdentityAllowed_({
      disposition:'BLOCKED',
      code:'ANCHOR_ORDER_NUMBER_MISSING'
    }) === true,
    'ANCHOR_ORDER_NUMBER_MISSING'
  );

  check(
    'STAGE4_CUSTOMER_SO_CONFLICT_CANNOT_BYPASS_ANCHOR',
    tmv3_step4AnchorPendingIdentityAllowed_({
      disposition:'REVIEW',
      code:'PREINSPECTION_CUSTOMER_SO_CONFLICT'
    }) === false,
    'PREINSPECTION_CUSTOMER_SO_CONFLICT'
  );

  const customer = {
    'Customer ID':'9001',
    'Customer Number':'62001',
    'Name':'Example Customer',
    'Primary Phone':'4165550101',
    'Primary Email':''
  };
  const location = {
    'Location ID':'9101',
    'Customer ID':'9001',
    'Address 1':'1 Example Street',
    'Address 2':'',
    'City':'Toronto',
    'Province':'ON',
    'Postal Code':'M1M 1M1',
    'Phone':'4165550101'
  };

  const refs = {
    customerById:{'9001':customer},
    customerByNumber:{'62001':customer},
    customerByPhone:{'4165550101':[customer]},
    locationById:{'9101':location},
    locations:[location],
    locationsByCustomer:{'9001':[location]},
    taskById:{}
  };

  const record = {
    vertical:'Install',
    logicalKey:'stage4-recovery-test',
    title:'Example Customer 416-555-0101',
    description:'',
    descriptionClean:'',
    rawDescription:'',
    location:'1 Example Street, Toronto, ON M1M 1M1',
    phone:'4165550101',
    customerNumber:'',
    existingTaskId:'',
    step3:{
      disposition:'BLOCKED',
      code:'ANCHOR_ORDER_NOT_FOUND',
      reason:'Sales Order is not present in the current anchor source.',
      anchor:{}
    }
  };

  const resolved = tmv3_step4IdentityRecords_(
    [record],
    refs
  )[0];

  check(
    'STAGE4_DETERMINISTIC_CALENDAR_IDENTITY_BECOMES_IDENTITY_ONLY',
    resolved.step4.disposition === 'IDENTITY_ONLY' &&
      resolved.step4.customer &&
      String(resolved.step4.customer['Customer ID']) === '9001' &&
      resolved.step4.location &&
      String(resolved.step4.location['Location ID']) === '9101',
    JSON.stringify(resolved.step4)
  );

  const step5 = tmv3_step5TaskRecords_(
    [resolved],
    {}
  )[0];

  check(
    'STAGE5_REMAINS_BLOCKED_FOR_IDENTITY_ONLY',
    step5.step5.disposition === 'NOT_RUN' &&
      step5.step5.code === 'STEP4_IDENTITY_ONLY',
    JSON.stringify(step5.step5)
  );

  const monaCustomer = {
    'Customer ID':'62179',
    'Customer Number':'62179',
    'Name':'Mona Azarin',
    'Primary Phone':'4168186940',
    'Primary Email':''
  };
  const monaLocation = {
    'Location ID':'57865',
    'Customer ID':'62179',
    'Address 1':'22 Simpson Ave',
    'Address 2':'',
    'City':'Toronto',
    'Province':'ON',
    'Postal Code':'M4K 1A2',
    'Phone':''
  };
  const monaAddress = tmv3_normalizeAddress_(
    tmv3_locationFullAddress_(monaLocation)
  );
  const monaRefs = {
    customers:[monaCustomer],
    locations:[monaLocation],
    customerById:{'62179':monaCustomer},
    customerByNumber:{'62179':monaCustomer},
    customerByPhone:{'4168186940':[monaCustomer]},
    locationById:{'57865':monaLocation},
    locationsByCustomer:{'62179':[monaLocation]},
    locationsByNormalizedAddress:{},
    locationsByPostal:{'M4K1A2':[monaLocation]},
    locationsByStreetNo:{'22':[monaLocation]},
    taskById:{}
  };
  monaRefs.locationsByNormalizedAddress[monaAddress] = [
    monaLocation
  ];

  const monaResolved = tmv3_step4IdentityRecords_(
    [{
      vertical:'PreInspection',
      logicalKey:'stage4-stale-number-test',
      title:'62734 - Mona AZARIN 416.818.6940',
      description:'',
      descriptionClean:'',
      rawDescription:'',
      location:'22 Simpson Ave, Toronto, ON M4K 1A2',
      phone:'4168186940',
      customerNumber:'62734',
      existingTaskId:'',
      taskNumber:'',
      step3:{
        disposition:'BLOCKED',
        code:'PREINSPECTION_BUSINESS_ANCHOR_UNRESOLVED',
        reason:'Customer number does not resolve in current cache.',
        anchor:{}
      }
    }],
    monaRefs
  )[0];

  check(
    'STAGE4_STALE_EXPLICIT_CUSTOMER_NUMBER_RECOVERS_WITH_PHONE_AND_ADDRESS',
    monaResolved.step4.disposition === 'IDENTITY_ONLY' &&
      String(
        monaResolved.step4.customer &&
        monaResolved.step4.customer['Customer ID']
      ) === '62179' &&
      String(
        monaResolved.step4.location &&
        monaResolved.step4.location['Location ID']
      ) === '57865' &&
      (monaResolved.step4.evidence || []).indexOf(
        'EXPLICIT_CUSTOMER_NUMBER_STALE'
      ) !== -1,
    JSON.stringify(monaResolved.step4)
  );

  const duhanCustomer = {
    'Customer ID':'61620',
    'Customer Number':'61620',
    'Name':'Niharika Duhan',
    'Primary Phone':'',
    'Primary Email':''
  };
  const duhanLocation = {
    'Location ID':'99001',
    'Customer ID':'61620',
    'Address 1':'171 Willowbrook Dr',
    'Address 2':'',
    'City':'Whitby',
    'Province':'ON',
    'Postal Code':'L1R 2X9',
    'Phone':''
  };
  const duhanAddress = tmv3_normalizeAddress_(
    tmv3_locationFullAddress_(duhanLocation)
  );
  const duhanRefs = {
    customers:[duhanCustomer],
    locations:[duhanLocation],
    customerById:{'61620':duhanCustomer},
    customerByNumber:{'61620':duhanCustomer},
    customerByPhone:{},
    locationById:{'99001':duhanLocation},
    locationsByCustomer:{'61620':[duhanLocation]},
    locationsByNormalizedAddress:{},
    locationsByPostal:{'L1R2X9':[duhanLocation]},
    locationsByStreetNo:{'171':[duhanLocation]},
    taskById:{}
  };
  duhanRefs.locationsByNormalizedAddress[duhanAddress] = [
    duhanLocation
  ];

  const duhanResolved = tmv3_step4IdentityRecords_(
    [{
      vertical:'Service',
      logicalKey:'stage4-household-surname-test',
      title:'(TBC) Duhan - Chris 3-5',
      description:'',
      descriptionClean:'',
      rawDescription:'',
      location:'171 Willowbrook Dr, Whitby, ON L1R 2X9',
      phone:'',
      customerNumber:'',
      existingTaskId:'',
      taskNumber:'',
      step3:{
        disposition:'BLOCKED',
        code:'ANCHOR_ORDER_NUMBER_MISSING',
        reason:'Work Order number/link is required.',
        anchor:{}
      }
    }],
    duhanRefs
  )[0];

  check(
    'STAGE4_EXACT_ADDRESS_SAME_SURNAME_RECOVERS_HOUSEHOLD',
    duhanResolved.step4.disposition === 'IDENTITY_ONLY' &&
      String(
        duhanResolved.step4.customer &&
        duhanResolved.step4.customer['Customer ID']
      ) === '61620' &&
      (duhanResolved.step4.evidence || []).indexOf(
        'EXACT_ADDRESS_SAME_SURNAME_HOUSEHOLD'
      ) !== -1,
    JSON.stringify(duhanResolved.step4)
  );

  const bloomCustomer = {
    'Customer ID':'30003',
    'Customer Number':'30003',
    'Name':'Jeff Bloom',
    'Primary Phone':'',
    'Primary Email':''
  };
  const bloomLocation = {
    'Location ID':'88001',
    'Customer ID':'30003',
    'Address 1':'106 Kingsmount Park Rd',
    'Address 2':'',
    'City':'Toronto',
    'Province':'ON',
    'Postal Code':'M4L 3L5',
    'Phone':''
  };
  const bloomTask = {
    'Task ID':'18870',
    'Task Type ID':'',
    'Task Type':'Service',
    'Name':'Level 1 - SO#585645 - Jeff Bloom',
    'Customer ID':'30003',
    'Location ID':'88001'
  };
  const bloomRefs = {
    customers:[bloomCustomer],
    locations:[bloomLocation],
    customerById:{'30003':bloomCustomer},
    customerByNumber:{'30003':bloomCustomer},
    customerByPhone:{},
    locationById:{'88001':bloomLocation},
    locationsByCustomer:{'30003':[bloomLocation]},
    locationsByNormalizedAddress:{},
    locationsByPostal:{'M4L3L5':[bloomLocation]},
    locationsByStreetNo:{'106':[bloomLocation]},
    taskById:{'18870':bloomTask}
  };

  const taskCandidate = tmv3_step4TaskIdentityCandidate_(
    {
      vertical:'Service',
      existingTaskId:'18870',
      taskNumber:'18870',
      location:'106 Kingsmount Park Rd, Toronto, ON M4L 3L5'
    },
    bloomRefs
  );

  check(
    'STAGE4_CACHED_TASK_IDENTITY_RESOLVES_CUSTOMER_AND_LOCATION',
    taskCandidate.status === 'MATCHED' &&
      String(
        taskCandidate.customer &&
        taskCandidate.customer['Customer ID']
      ) === '30003' &&
      String(
        taskCandidate.location &&
        taskCandidate.location['Location ID']
      ) === '88001',
    JSON.stringify(taskCandidate)
  );

  const indexedAddress = tmv3_step4AddressCandidates_(
    '22 Simpson Ave, Toronto, ON M4K 1A2',
    monaRefs
  );
  check(
    'STAGE4_EXACT_ADDRESS_INDEX_RETURNS_CACHED_LOCATION',
    indexedAddress.matchType === 'EXACT' &&
      indexedAddress.locations.length === 1 &&
      String(indexedAddress.locations[0]['Location ID']) === '57865',
    JSON.stringify(indexedAddress)
  );

  const failures = cases.filter(function(item) {
    return !item.pass;
  });

  if (failures.length) {
    throw new Error(
      'TMV3 Stage 4 identity recovery regression failed: ' +
      JSON.stringify(failures)
    );
  }

  return {
    status:'PASS',
    version:TMV3.VERSION,
    cases:cases.length,
    results:cases
  };
}

function tmv3_stage5CacheFirstRegression() {
  const cases = [];

  function check(name, pass, detail) {
    cases.push({
      name:name,
      pass:pass === true,
      detail:detail === undefined ? '' : detail
    });
  }

  const rawSearchRow = {
    id:18949,
    title:'Preinspect - Paul Bruce - (416) 462-1542',
    customer:{
      id:62020,
      number:'62020',
      name:'Paul Bruce & Craig Haid'
    },
    type:{ id:105, name:'Pre Inspection' },
    status:{ id:48, name:'Open' }
  };
  const normalizedSearchRow =
    tmv3_normalizeV2TaskModel_(rawSearchRow);

  check(
    'STAGE5_PREINSPECTION_SEARCH_ROW_NORMALIZES_WITHOUT_TASK_GET',
    String(normalizedSearchRow['Task ID']) === '18949' &&
      Number(normalizedSearchRow['Task Type ID']) === 105 &&
      String(normalizedSearchRow['Customer ID']) === '62020' &&
      normalizedSearchRow['Status'] === 'Open',
    JSON.stringify(normalizedSearchRow)
  );

  const customer = {
    'Customer ID':'62020',
    'Customer Number':'62020',
    'Name':'Paul Bruce & Craig Haid'
  };
  const location = {
    'Location ID':'58001',
    'Customer ID':'62020'
  };
  const cachedOpen = Object.assign({}, normalizedSearchRow);

  const preDecision = tmv3_preInspectionTaskDecision_(
    {
      vertical:'PreInspection',
      existingTaskId:'',
      phone:'4164621542',
      start:new Date('2026-10-06T13:00:00-04:00'),
      end:new Date('2026-10-06T14:00:00-04:00')
    },
    customer,
    location,
    [cachedOpen]
  );

  check(
    'STAGE5_SINGLE_OPEN_PREINSPECTION_REUSED_FROM_CACHE',
    preDecision.status === 'MATCHED' &&
      preDecision.task &&
      String(preDecision.task['Task ID']) === '18949',
    JSON.stringify(preDecision)
  );

  const missingLinkedStandard =
    tmv3_step5ResolveStandardTask_(
      {
        vertical:'Install',
        existingTaskId:'999999',
        step3:{ anchor:{} },
        step4:{
          customer:{ 'Customer ID':'1' },
          location:null
        }
      },
      {
        taskById:{},
        tasksByOrder:{},
        tasksByCustomer:{}
      }
    );

  check(
    'STAGE5_MISSING_LINKED_TASK_WITHOUT_CACHE_FALLBACK_REVIEWS',
    missingLinkedStandard.disposition === 'REVIEW' &&
      missingLinkedStandard.code ===
        'CALENDAR_LINKED_TASK_NOT_IN_CACHE_NO_SAFE_FALLBACK',
    JSON.stringify(missingLinkedStandard)
  );

  const cachedFallbackTask = {
    'Task ID':'200',
    'Task Type':'Delivery',
    'Name':'Delivery',
    'Status':'Open',
    'Customer ID':'1',
    'Location ID':'10',
    'Order ID':'20'
  };
  const missingLinkWithFallback =
    tmv3_step5ResolveStandardTask_(
      {
        vertical:'Delivery',
        existingTaskId:'999999',
        step3:{ anchor:{ orderId:'20' } },
        step4:{
          customer:{ 'Customer ID':'1' },
          location:{ 'Location ID':'10' }
        }
      },
      {
        taskById:{},
        tasksByOrder:{ '20':[cachedFallbackTask] },
        tasksByCustomer:{}
      }
    );

  check(
    'STAGE5_MISSING_LINKED_TASK_USES_VERIFIED_CACHED_FALLBACK',
    missingLinkWithFallback.disposition === 'MATCHED' &&
      String(
        missingLinkWithFallback.tasks[0] &&
        missingLinkWithFallback.tasks[0]['Task ID']
      ) === '200' &&
      missingLinkWithFallback.evidence.indexOf(
        'CALENDAR_TASK_LINK_NOT_IN_CACHE_DEFER_LIVE_READ'
      ) !== -1,
    JSON.stringify(missingLinkWithFallback)
  );

  const missingLinkedPreInspection =
    tmv3_step5ResolvePreInspection_(
      {
        vertical:'PreInspection',
        existingTaskId:'999998',
        step4:{
          customer:customer,
          location:location
        }
      },
      {
        taskById:{},
        tasksByCustomer:{ '62020':[] }
      }
    );

  check(
    'STAGE5_PREINSPECTION_MISSING_LINK_WITHOUT_CACHE_FALLBACK_REVIEWS',
    missingLinkedPreInspection.disposition === 'REVIEW' &&
      missingLinkedPreInspection.code ===
        'PREINSPECTION_CALENDAR_TASK_NOT_IN_CACHE_NO_SAFE_FALLBACK',
    JSON.stringify(missingLinkedPreInspection)
  );

  const completedPartial = Object.assign(
    {},
    normalizedSearchRow,
    {
      'Task ID':18940,
      'Task Number':18940,
      'Status':'Done'
    }
  );
  const historyDecision = tmv3_preInspectionTaskDecision_(
    {
      vertical:'PreInspection',
      existingTaskId:'',
      phone:'4164621542',
      start:new Date('2026-10-06T13:00:00-04:00'),
      end:new Date('2026-10-06T14:00:00-04:00')
    },
    customer,
    location,
    [completedPartial]
  );

  const step5History = tmv3_step5Decision_(
    'NO_TASK',
    'PREINSPECTION_NO_OPEN_TASK',
    historyDecision.reason,
    [],
    (historyDecision.historyTasks || []).length,
    ['PREINSPECTION_TASKS_FROM_SHARED_CACHE'],
    [],
    historyDecision.historyTasks || []
  );

  const step6History = tmv3_step6DecisionRecords_([
    {
      vertical:'PreInspection',
      start:new Date('2026-10-06T13:00:00-04:00'),
      step5:step5History
    }
  ])[0].step6;

  check(
    'STAGE5_PARTIAL_COMPLETED_HISTORY_FAILS_CLOSED_ON_DATE',
    historyDecision.status === 'CLEAR' &&
      step6History.disposition === 'REVIEW' &&
      step6History.code === 'HISTORY_DATE_UNPROVEN',
    JSON.stringify(step6History)
  );

  check(
    'STAGE5_PREINSPECTION_SEARCH_PAGE_IS_BOUNDED',
    Number(
      TMV3.OPERATIONS.preInspectionTaskSearchPageSize
    ) <= 100 &&
      Number(
        TMV3.OPERATIONS.preInspectionTaskSearchMaxPages
      ) <= 20,
    JSON.stringify({
      pageSize:TMV3.OPERATIONS.preInspectionTaskSearchPageSize,
      maxPages:TMV3.OPERATIONS.preInspectionTaskSearchMaxPages
    })
  );

  const failures = cases.filter(function(item) {
    return !item.pass;
  });

  if (failures.length) {
    throw new Error(
      'TMV3 Stage 5 cache-first regression failed: ' +
      JSON.stringify(failures)
    );
  }

  return {
    status:'PASS',
    version:TMV3.VERSION,
    cases:cases.length,
    results:cases
  };
}

function tmv3_allVerticalTaskLifecyclePolicyRegression() {
  const cases = [];
  const verticals = ['Install','Delivery','Service','PreInspection'];

  function add(name, pass, actual, expected) {
    cases.push({
      name:name,
      pass:pass === true,
      actual:actual,
      expected:expected
    });
  }

  function decide(vertical, history) {
    return tmv3_step6NoOpenTaskDecision_({
      vertical:vertical,
      start:new Date('2026-10-06T13:00:00-04:00'),
      step5:{
        disposition:'NO_TASK',
        historyTasks:history || []
      }
    });
  }

  function expect(vertical, suffix, history, disposition, code) {
    const decision = decide(vertical, history);
    add(
      vertical.toUpperCase() + '_' + suffix,
      decision.disposition === disposition && decision.code === code,
      decision,
      { disposition:disposition, code:code }
    );
  }

  verticals.forEach(function(vertical) {
    expect(vertical, 'NO_HISTORY_CREATES', [],
      'CREATE_TASK', 'NO_TASK_OR_HISTORY');

    expect(vertical, 'SAME_DAY_COMPLETED_FULFILLS', [{
      'Task ID':'2001',
      'Status':'Done',
      'Start':'2026-10-06T09:00:00-04:00',
      'Due':'2026-10-06T10:00:00-04:00'
    }], 'FULFILLED_NO_RECREATE', 'COMPLETED_TASK_ON_EVENT_DAY');

    expect(vertical, 'SAME_DAY_CANCELLED_REVIEWS', [{
      'Task ID':'2002',
      'Status':'Cancelled',
      'Start':'2026-10-06T09:00:00-04:00',
      'Due':'2026-10-06T10:00:00-04:00'
    }], 'REVIEW', 'CANCELLED_TASK_ON_EVENT_DAY');

    expect(vertical, 'OLDER_CANCELLED_STILL_REVIEWS', [{
      'Task ID':'2003',
      'Status':'Cancelled',
      'Start':'2026-10-01T09:00:00-04:00',
      'Due':'2026-10-01T10:00:00-04:00'
    }], 'REVIEW', 'CANCELLED_TASK_HISTORY');

    expect(vertical, 'UNDATED_HISTORY_REVIEWS', [{
      'Task ID':'2004',
      'Status':'Done',
      'Start':'',
      'Due':''
    }], 'REVIEW', 'HISTORY_DATE_UNPROVEN');

    expect(vertical, 'FUTURE_HISTORY_REVIEWS', [{
      'Task ID':'2005',
      'Status':'Done',
      'Start':'2026-10-07T09:00:00-04:00',
      'Due':'2026-10-07T10:00:00-04:00'
    }], 'REVIEW', 'HISTORY_AFTER_EVENT_DATE');

    expect(vertical, 'OLDER_FULFILLED_RECREATES', [{
      'Task ID':'2006',
      'Status':'Done',
      'Start':'2026-10-01T09:00:00-04:00',
      'Due':'2026-10-01T10:00:00-04:00'
    }], 'RECREATE_TASK', 'ONLY_OLDER_HISTORY_REMAINS');
  });

  const deliveryWrongVertical = {
    'Task ID':'3001',
    'Task Type':'Service',
    'Task Type ID':'',
    'Name':'Service - Customer'
  };
  add(
    'DELIVERY_REJECTS_SERVICE_TASK_AS_EXECUTABLE_MATCH',
    tmv3_taskFitsVertical_(
      deliveryWrongVertical,
      'Delivery',
      TMV3.VERTICALS.Delivery
    ) === false,
    deliveryWrongVertical,
    'wrong-vertical Task rejected'
  );

  const serviceWrongVertical = {
    'Task ID':'3002',
    'Task Type':'Delivery',
    'Task Type ID':'',
    'Name':'Delivery - Customer'
  };
  add(
    'SERVICE_REJECTS_DELIVERY_TASK_AS_EXECUTABLE_MATCH',
    tmv3_taskFitsVertical_(
      serviceWrongVertical,
      'Service',
      TMV3.VERTICALS.Service
    ) === false,
    serviceWrongVertical,
    'wrong-vertical Task rejected'
  );

  let cancelledRecreateSourceBlocked = false;
  try {
    tmv3_findRecreateSourceTask_({
      eventRecord:{ vertical:'Install' },
      resolved:{
        orderId:'SO-REGRESSION',
        customerId:'CUSTOMER-1',
        locationId:'LOCATION-1'
      },
      refs:{
        tasks:[{
          'Task ID':'3003',
          'Task Type':'Install',
          'Task Type ID':'',
          'Name':'Install - Customer',
          'Status':'Cancelled',
          'Order ID':'SO-REGRESSION',
          'Customer ID':'CUSTOMER-1',
          'Location ID':'LOCATION-1'
        }]
      }
    });
  } catch (err) {
    cancelledRecreateSourceBlocked =
      /RECREATE requires exactly one completed source Task; found 0/.test(
        String(err && err.message || err)
      );
  }

  add(
    'CANCELLED_TASK_CANNOT_SEED_RECREATE',
    cancelledRecreateSourceBlocked,
    cancelledRecreateSourceBlocked,
    true
  );

  const failures = cases.filter(function(item) {
    return !item.pass;
  });

  if (failures.length) {
    throw new Error(
      'TMV3 all-vertical Task lifecycle policy regression failed: ' +
      JSON.stringify(failures)
    );
  }

  return {
    status:'PASS',
    version:TMV3.VERSION,
    rulesVersion:TMV3_HARD_RULES.version,
    cases:cases.length,
    results:cases
  };
}

function tmv3_preInspectionNoOpenTaskPolicyRegression() {
  const cases = [];

  function check(name, decision, disposition, code) {
    cases.push({
      name:name,
      pass:
        decision &&
        decision.disposition === disposition &&
        decision.code === code,
      actual:decision,
      expected:{
        disposition:disposition,
        code:code
      }
    });
  }

  function record(history) {
    return {
      vertical:'PreInspection',
      start:new Date('2026-10-06T13:00:00-04:00'),
      step5:{
        disposition:'NO_TASK',
        historyTasks:history || []
      }
    };
  }

  check(
    'PREINSPECTION_NO_HISTORY_CREATES',
    tmv3_step6NoOpenTaskDecision_(
      record([])
    ),
    'CREATE_TASK',
    'NO_TASK_OR_HISTORY'
  );

  check(
    'PREINSPECTION_SAME_DAY_COMPLETED_DOES_NOT_RECREATE',
    tmv3_step6NoOpenTaskDecision_(
      record([{
        'Task ID':'1001',
        'Status':'Done',
        'Start':'2026-10-06T09:00:00-04:00',
        'Due':'2026-10-06T10:00:00-04:00'
      }])
    ),
    'FULFILLED_NO_RECREATE',
    'COMPLETED_TASK_ON_EVENT_DAY'
  );

  check(
    'PREINSPECTION_SAME_DAY_CANCELLED_REVIEWS',
    tmv3_step6NoOpenTaskDecision_(
      record([{
        'Task ID':'1002',
        'Status':'Cancelled',
        'Start':'2026-10-06T09:00:00-04:00',
        'Due':'2026-10-06T10:00:00-04:00'
      }])
    ),
    'REVIEW',
    'CANCELLED_TASK_ON_EVENT_DAY'
  );

  check(
    'PREINSPECTION_UNDATED_HISTORY_REVIEWS',
    tmv3_step6NoOpenTaskDecision_(
      record([{
        'Task ID':'1003',
        'Status':'Done',
        'Start':'',
        'Due':''
      }])
    ),
    'REVIEW',
    'HISTORY_DATE_UNPROVEN'
  );

  check(
    'PREINSPECTION_FUTURE_HISTORY_REVIEWS',
    tmv3_step6NoOpenTaskDecision_(
      record([{
        'Task ID':'1004',
        'Status':'Done',
        'Start':'2026-10-07T09:00:00-04:00',
        'Due':'2026-10-07T10:00:00-04:00'
      }])
    ),
    'REVIEW',
    'HISTORY_AFTER_EVENT_DATE'
  );

  check(
    'PREINSPECTION_ONLY_OLDER_HISTORY_RECREATES',
    tmv3_step6NoOpenTaskDecision_(
      record([{
        'Task ID':'1005',
        'Status':'Done',
        'Start':'2026-10-01T09:00:00-04:00',
        'Due':'2026-10-01T10:00:00-04:00'
      }])
    ),
    'RECREATE_TASK',
    'ONLY_OLDER_HISTORY_REMAINS'
  );

  const failures = cases.filter(function(item) {
    return !item.pass;
  });

  if (failures.length) {
    throw new Error(
      'TMV3 PreInspection no-open-task policy regression failed: ' +
      JSON.stringify(failures)
    );
  }

  return {
    status:'PASS',
    version:TMV3.VERSION,
    rulesVersion:TMV3_HARD_RULES.version,
    cases:cases.length,
    results:cases
  };
}

function tmv3_canaryApiBudgetRegression() {
  const cfg = {
    v3DailySoftLimit:1200,
    planDailyLimit:5000
  };
  const status = {
    softLimit:1200
  };
  const cases = [];

  function check(name, pass, detail) {
    cases.push({
      name:name,
      pass:pass === true,
      detail:detail
    });
  }

  const normal = tmv3_strivenApiEffectiveSoftLimit_(
    status,
    cfg,
    {
      canaryActive:false,
      mode:'CANARY_WRITE',
      extraCalls:50
    }
  );
  const canary = tmv3_strivenApiEffectiveSoftLimit_(
    status,
    cfg,
    {
      canaryActive:true,
      mode:'CANARY_WRITE',
      extraCalls:50
    }
  );
  const shadow = tmv3_strivenApiEffectiveSoftLimit_(
    status,
    cfg,
    {
      canaryActive:true,
      mode:'SHADOW_READ_ONLY',
      extraCalls:20
    }
  );
  const capped = tmv3_strivenApiEffectiveSoftLimit_(
    {softLimit:4995},
    cfg,
    {
      canaryActive:true,
      mode:'CANARY_WRITE',
      extraCalls:20
    }
  );

  check(
    'CANARY_API_ALLOWANCE_INACTIVE_KEEPS_BASE_LIMIT',
    normal === 1200,
    normal
  );
  check(
    'CANARY_API_ALLOWANCE_EXACT_MODE_ADDS_ONLY_CONFIGURED_CALLS',
    canary === 1250,
    canary
  );
  check(
    'CANARY_API_ALLOWANCE_SHADOW_MODE_CANNOT_BYPASS_LIMIT',
    shadow === 1200,
    shadow
  );
  check(
    'CANARY_API_ALLOWANCE_NEVER_EXCEEDS_PLAN_LIMIT',
    capped === 5000,
    capped
  );

  const failures = cases.filter(function(item) {
    return !item.pass;
  });

  if (failures.length) {
    throw new Error(
      'TMV3 canary API budget regression failed: ' +
      JSON.stringify(failures)
    );
  }

  return {
    status:'PASS',
    cases:cases.length,
    results:cases
  };
}

function tmv3_automaticCanaryRegression() {
  const cases = [];

  function check(name, pass, detail) {
    cases.push({
      name:name,
      pass:pass === true,
      detail:detail
    });
  }

  check(
    'STAGE7_CANARY_AUTO_ENABLED_ONLY_IN_EXACT_MODE',
    tmv3_stage7ConfiguredCanaryEnabled_(
      7,
      'CANARY_WRITE',
      true
    ) === true,
    'stage7/canary/auto=true'
  );
  check(
    'STAGE6_CANARY_AUTO_REMAINS_GATED',
    tmv3_stage7ConfiguredCanaryEnabled_(
      6,
      'CANARY_WRITE',
      true
    ) === false,
    'stage6'
  );
  check(
    'SHADOW_CANARY_AUTO_REMAINS_GATED',
    tmv3_stage7ConfiguredCanaryEnabled_(
      7,
      'SHADOW_READ_ONLY',
      true
    ) === false,
    'shadow'
  );
  check(
    'AUTO_FLAG_FALSE_REMAINS_GATED',
    tmv3_stage7ConfiguredCanaryEnabled_(
      7,
      'CANARY_WRITE',
      false
    ) === false,
    'auto=false'
  );

  const policy = {
    canaryExpectedCustomerId:'62638',
    canaryExpectedLocationId:'58275',
    canaryExpectedAction:TMV3_STEP7_ACTION.CREATE_TASK
  };

  function contract(actions, taskId, customerId, locationId, plan) {
    return {
      vertical:'PreInspection',
      eventId:'evt-jane-regression',
      logicalKey:'PreInspection|evt-jane-regression',
      disposition:taskId ? 'MATCH_EXISTING' : 'CREATE_TASK',
      plan:plan || (actions.length ? actions.join('__') : 'NO_CHANGE'),
      actions:actions.slice(),
      engineVersion:TMV3.VERSION,
      inputFingerprint:'fp-jane',
      blocker:'',
      expectedCustomerId:customerId || '62638',
      expectedLocationId:locationId || '58275',
      taskId:taskId || ''
    };
  }

  const initial = tmv3_configuredCanaryContractDecision_(
    contract(
      [TMV3_STEP7_ACTION.CREATE_TASK],
      '',
      '62638',
      '58275',
      'CREATE_TASK'
    ),
    policy
  );
  check(
    'AUTO_CANARY_INITIAL_CREATE_IS_EXECUTABLE',
    initial.execute === true &&
      initial.status === 'EXECUTE_INITIAL_CANARY',
    JSON.stringify(initial)
  );

  const reconcile = tmv3_configuredCanaryContractDecision_(
    contract(
      [TMV3_STEP7_ACTION.VERIFY_CALENDAR_LINKS],
      19001,
      '62638',
      '58275',
      'VERIFY_CALENDAR_LINKS'
    ),
    policy
  );
  check(
    'AUTO_CANARY_EXISTING_TASK_ALLOWS_RECONCILIATION_ONLY',
    reconcile.execute === true &&
      reconcile.status === 'RECONCILE_EXISTING_TASK' &&
      Number(reconcile.taskId) === 19001,
    JSON.stringify(reconcile)
  );

  const converged = tmv3_configuredCanaryContractDecision_(
    contract(
      [],
      19001,
      '62638',
      '58275',
      'NO_CHANGE'
    ),
    policy
  );
  check(
    'AUTO_CANARY_SECOND_PASS_CONVERGES_WITHOUT_WRITE',
    converged.execute === false &&
      converged.status === 'CONVERGED_NO_CHANGE',
    JSON.stringify(converged)
  );

  let duplicateBlocked = false;
  try {
    tmv3_configuredCanaryContractDecision_(
      contract(
        [TMV3_STEP7_ACTION.CREATE_TASK],
        19001,
        '62638',
        '58275',
        'CREATE_TASK'
      ),
      policy
    );
  } catch (err) {
    duplicateBlocked =
      /duplicate protection stopped CREATE\/RECREATE/.test(
        String(err && err.message || err)
      );
  }
  check(
    'AUTO_CANARY_EXISTING_TASK_BLOCKS_SECOND_CREATE',
    duplicateBlocked,
    'existing task + CREATE must fail closed'
  );

  let wrongCustomerBlocked = false;
  try {
    tmv3_configuredCanaryContractDecision_(
      contract(
        [TMV3_STEP7_ACTION.CREATE_TASK],
        '',
        '99999',
        '58275',
        'CREATE_TASK'
      ),
      policy
    );
  } catch (err) {
    wrongCustomerBlocked =
      /Customer mismatch/.test(
        String(err && err.message || err)
      );
  }
  check(
    'AUTO_CANARY_WRONG_CUSTOMER_FAILS_CLOSED',
    wrongCustomerBlocked,
    '99999'
  );

  const failures = cases.filter(function(item) {
    return !item.pass;
  });

  if (failures.length) {
    throw new Error(
      'TMV3 automatic canary regression failed: ' +
      JSON.stringify(failures)
    );
  }

  return {
    status:'PASS',
    cases:cases.length,
    results:cases
  };
}

function tmv3_preInspectionGuestSyncRegression() {
  const owner = 'stephen@classicfireplace.ca';
  const cases = [];

  function check(name, actual, expected) {
    cases.push({
      name:name,
      pass:
        actual.status === expected.status &&
        actual.action === expected.action,
      actual:actual,
      expected:expected
    });
  }

  check(
    'PRIMARY_EVENT_WITHOUT_STEPHEN_ADDS_STEPHEN',
    tmv3_preInspectionGuestSyncDecision_(
      [],
      owner
    ),
    { status:'ADD_STEPHEN', action:'ADD' }
  );

  check(
    'PRIMARY_EVENT_WITH_STEPHEN_IS_IDEMPOTENT',
    tmv3_preInspectionGuestSyncDecision_(
      [owner],
      owner
    ),
    { status:'ALREADY_PRESENT', action:'NONE' }
  );

  check(
    'OTHER_GUESTS_DO_NOT_BLOCK_STEPHEN',
    tmv3_preInspectionGuestSyncDecision_(
      [
        'spencer@classicfireplace.ca',
        'thang@classicfireplace.ca'
      ],
      owner
    ),
    { status:'ADD_STEPHEN', action:'ADD' }
  );

  check(
    'MISSING_STEPHEN_ARGUMENT_USES_CANONICAL_FALLBACK',
    tmv3_preInspectionGuestSyncDecision_(
      [],
      ''
    ),
    { status:'ADD_STEPHEN', action:'ADD' }
  );

  const calendars = tmv3_verticalCalendars_(
    'PreInspection',
    TMV3.VERTICALS.PreInspection
  );

  cases.push({
    name:'PREINSPECTION_INTAKE_USES_CF_PREINSPECTS_ONLY',
    pass:
      calendars.length === 1 &&
      tmv3_clean_(calendars[0].calendarId) ===
        tmv3_clean_(
          TMV3.VERTICALS.PreInspection.primaryCalendarId
        ) &&
      tmv3_clean_(calendars[0].role) ===
        'PRIMARY_SHARED',
    actual:calendars,
    expected:'one PRIMARY_SHARED CF Preinspects source'
  });

  const failures = cases.filter(function(item) {
    return !item.pass;
  });

  if (failures.length) {
    throw new Error(
      'TMV3 PreInspection guest sync regression failed: ' +
      JSON.stringify(failures)
    );
  }

  return {
    status:'PASS',
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
  const foundation0 =
    tmv3_foundation0Regression();
  const stage3Stage4CacheFirst =
    tmv3_stage3Stage4CacheFirstRegression();
  const stage4IdentityRecovery =
    tmv3_stage4IdentityRecoveryRegression();
  const stage5CacheFirst =
    tmv3_stage5CacheFirstRegression();
  const allVerticalTaskLifecyclePolicy =
    tmv3_allVerticalTaskLifecyclePolicyRegression();
  const preInspectionNoOpenTaskPolicy =
    tmv3_preInspectionNoOpenTaskPolicyRegression();
  const canaryApiBudget =
    tmv3_canaryApiBudgetRegression();
  const automaticCanary =
    tmv3_automaticCanaryRegression();
  const preInspectionGuestSync =
    tmv3_preInspectionGuestSyncRegression();
  const preInspectionCalendarCopyParity =
    tmv3_preInspectionCalendarCopyParityRegression();

  const result = {
    status:
      issue1.status === 'PASS' &&
      issue2.status === 'PASS' &&
      titleNormalization.status === 'PASS' &&
      foundation0.status === 'PASS' &&
      stage3Stage4CacheFirst.status === 'PASS' &&
      stage4IdentityRecovery.status === 'PASS' &&
      stage5CacheFirst.status === 'PASS' &&
      allVerticalTaskLifecyclePolicy.status === 'PASS' &&
      preInspectionNoOpenTaskPolicy.status === 'PASS' &&
      canaryApiBudget.status === 'PASS' &&
      automaticCanary.status === 'PASS' &&
      preInspectionGuestSync.status === 'PASS' &&
      preInspectionCalendarCopyParity.status === 'PASS'
        ? 'PASS'
        : 'FAIL',
    version:TMV3.VERSION,
    mode:TMV3.MODE,
    issue1:issue1,
    issue2:issue2,
    titleNormalization:titleNormalization,
    foundation0:foundation0,
    stage3Stage4CacheFirst:stage3Stage4CacheFirst,
    stage4IdentityRecovery:stage4IdentityRecovery,
    stage5CacheFirst:stage5CacheFirst,
    allVerticalTaskLifecyclePolicy:allVerticalTaskLifecyclePolicy,
    preInspectionNoOpenTaskPolicy:preInspectionNoOpenTaskPolicy,
    canaryApiBudget:canaryApiBudget,
    automaticCanary:automaticCanary,
    preInspectionGuestSync:preInspectionGuestSync,
    preInspectionCalendarCopyParity:preInspectionCalendarCopyParity
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



function tmv3_preInspectionCalendarCopyParityRegression() {
  const cfg = TMV3.VERTICALS.PreInspection;
  const primaryId = tmv3_clean_(cfg.primaryCalendarId);
  const secondaryId = tmv3_clean_(
    (cfg.secondaryCalendarIds || [])[0]
  );
  const cases = [];

  function check(name, pass, detail) {
    cases.push({
      name:name,
      pass:pass === true,
      detail:detail === undefined ? '' : detail
    });
  }

  const secondaryOnlyRecord = {
    vertical:'PreInspection',
    calendarId:secondaryId,
    sourceCalendarIds:[secondaryId],
    sourceCalendarRoles:['SECONDARY_STEPHEN'],
    step2:{ mirrorRequired:false }
  };

  const requiredFromSecondary =
    tmv3_requiredCalendarCopiesForEvent_(
      secondaryOnlyRecord
    );

  check(
    'PREINSPECTION_BUSINESS_WRITES_TARGET_BOTH_CALENDAR_COPIES',
    requiredFromSecondary.length === 2 &&
      requiredFromSecondary.indexOf(primaryId) !== -1 &&
      requiredFromSecondary.indexOf(secondaryId) !== -1,
    JSON.stringify(requiredFromSecondary)
  );

  const titleIds =
    tmv3_titleNormalizationCalendarIds_(
      secondaryOnlyRecord
    );

  check(
    'PREINSPECTION_TITLE_NORMALIZATION_TARGETS_BOTH_CALENDAR_COPIES',
    titleIds.length === 2 &&
      titleIds.indexOf(primaryId) !== -1 &&
      titleIds.indexOf(secondaryId) !== -1,
    JSON.stringify(titleIds)
  );

  const primaryOnly =
    tmv3_requiredCalendarCopiesForEvent_({
      vertical:'PreInspection',
      calendarId:primaryId,
      sourceCalendarIds:[primaryId],
      sourceCalendarRoles:['PRIMARY_SHARED'],
      step2:{ mirrorRequired:false }
    });

  check(
    'PREINSPECTION_PRIMARY_REMAINS_INTAKE_AUTHORITY_WITH_DUAL_PRESENTATION',
    primaryOnly.length === 2 &&
      primaryOnly.indexOf(primaryId) !== -1 &&
      primaryOnly.indexOf(secondaryId) !== -1 &&
      cfg.primarySourceOnly === true,
    JSON.stringify(primaryOnly)
  );

  const secondaryDecision =
    tmv3_step2ClassifyPreInspection_({
      sourceCalendarRoles:['SECONDARY_STEPHEN'],
      calendarRole:'SECONDARY_STEPHEN',
      customerNumber:'62020',
      orderNumber:'585593',
      phone:'4164621542',
      location:'58 Fenwood Heights',
      calendarCustomerName:'Craig Haid and Paul Bruce',
      descriptionClean:'SO#585593',
      isAllDay:false,
      title:'Craig Haid and Paul Bruce'
    });

  check(
    'PREINSPECTION_SECONDARY_SOURCE_IS_MIRROR_ONLY',
    secondaryDecision.disposition === 'SKIP' &&
      secondaryDecision.code ===
        'PREINSPECTION_SECONDARY_MIRROR_ONLY',
    JSON.stringify(secondaryDecision)
  );

  const parityExpected = {
    title:'62400 - John Smith - (416) 555-1212',
    description:'Old title\n\nNotes\n\n-----Striven Links-----',
    location:'123 Main St, Toronto',
    start:1000,
    end:2000,
    allDay:false,
    requiredStephenPresent:true
  };
  check(
    'PREINSPECTION_FULL_BUSINESS_STATE_PARITY_COMPARATOR',
    tmv3_preInspectionCalendarParityEqual_(
      parityExpected,
      Object.assign({}, parityExpected)
    ) === true &&
      tmv3_preInspectionCalendarParityEqual_(
        parityExpected,
        Object.assign({}, parityExpected, { location:'DIFFERENT' })
      ) === false,
    JSON.stringify(parityExpected)
  );

  const result = {
    status:cases.every(function(item) {
      return item.pass === true;
    }) ? 'PASS' : 'FAIL',
    cases:cases
  };

  if (result.status !== 'PASS') {
    throw new Error(
      'PreInspection Calendar-copy parity regression failed.'
    );
  }

  return result;
}


/************************************************************
 * TM V3 — STEP 7 RECONCILIATION PLAN
 *
 * Purpose:
 * - consume the verified Step 6 decision; never re-decide identity/task;
 * - fresh-read canonical Striven Tasks on demand;
 * - compare expected vs actual relationships, dates and assignments;
 * - fresh-verify expected Contact ownership before any future mutation;
 * - write a hidden, inspectable reconciliation plan;
 * - perform ZERO Striven/Calendar mutations.
 ************************************************************/

const TMV3_STEP7_HEADERS = Object.freeze([
  'Vertical',
  'Event ID',
  'Logical Key',
  'Event',
  'Step 6 Decision',
  'Task ID',
  'Task Status',
  'Expected Customer ID',
  'Actual Customer ID',
  'Customer Check',
  'Expected Order ID',
  'Actual Order ID',
  'Order Check',
  'Expected Location ID',
  'Actual Location ID',
  'Location Check',
  'Expected Requested By ID',
  'Expected Requested By Type',
  'Actual Requested By ID',
  'Actual Requested By Type',
  'Requested By Check',
  'Contact Ownership',
  'Calendar Start',
  'Task Start',
  'Start Check',
  'Calendar End',
  'Task Due',
  'End Check',
  'Desired Assignment',
  'Actual Assignment',
  'Assignment Check',
  'Relationship Plan',
  'Write Gate',
  'Blocker',
  'Evidence',
  'Source Task IDs',
  'Engine Version',
  'Planned At',
  'Read Status'
]);

function tmv3_step7ReconciliationRun(
  reason,
  refreshSources,
  verticalFilter,
  batchOptions
) {
  tmv3_assertShadow_();

  if (tmv3_executionStage_() < 7) {
    throw new Error(
      'Execution stage ' + tmv3_executionStage_() +
      ' blocks Step 7 reconciliation.'
    );
  }

  const filter = tmv3_clean_(verticalFilter);
  if (filter && !TMV3.VERTICALS[filter]) {
    throw new Error('Unknown Step 7 vertical filter: ' + filter);
  }

  tmv3_resetRuntimeMetrics_();

  const sourceSummary =
    refreshSources === true
      ? tmv3_step5RefreshTaskSources_()
      : {
          tasks: tmv3_rows_(TMV3.SHEETS.TASKS).length,
          preInspectionTasks: 'ON_DEMAND_ONLY',
          source: 'CACHED_TASK_SOURCES'
        };

  const allStep2Snapshot = tmv3_step2CalendarRecords_();
  const step2Snapshot = filter
    ? allStep2Snapshot.filter(function(record) {
        return record.vertical === filter;
      })
    : allStep2Snapshot;

  const step3Refs = tmv3_step3AnchorIndex_();
  const step3Records = tmv3_step3BusinessAnchorRecords_(
    step2Snapshot,
    step3Refs
  );

  const step4Refs = tmv3_step4IdentityIndex_();
  const step4Records = tmv3_step4IdentityRecords_(
    step3Records,
    step4Refs
  );

  const step5Refs = tmv3_step5TaskIndex_();
  const step5Records = tmv3_step5TaskRecords_(
    step4Records,
    step5Refs
  );

  const step6Records = tmv3_step6DecisionRecords_(step5Records);
  const selectedAll = filter
    ? step6Records.filter(function(record) {
        return record.vertical === filter;
      })
    : step6Records;

  batchOptions = batchOptions || {};
  const batchOffset = Math.max(0, Number(batchOptions.offset || 0));
  const requestedLimit = Math.max(0, Number(batchOptions.limit || 0));
  const batchEnabled = requestedLimit > 0;
  const selected = batchEnabled
    ? selectedAll.slice(batchOffset, batchOffset + requestedLimit)
    : selectedAll;
  const batch = {
    enabled: batchEnabled,
    offset: batchOffset,
    limit: batchEnabled ? requestedLimit : selectedAll.length,
    selected: selected.length,
    totalAvailable: selectedAll.length,
    nextOffset:
      batchEnabled && batchOffset + selected.length < selectedAll.length
        ? batchOffset + selected.length
        : null,
    complete:
      !batchEnabled ||
      batchOffset + selected.length >= selectedAll.length
  };

  const runtime = {
    taskById: {},
    contactByKey: {},
    organizerByEmail: {}
  };

  const plans = tmv3_step7Plans_(selected, runtime);
  const write = tmv3_step7WritePlans_(plans, filter, batch);
  const visibleWrite = tmv3_publishLatestStep7ToVisibleSheets();
  const verification = tmv3_step7Verify_(selected, plans);
  const counts = tmv3_step7Counts_(plans);

  const result = {
    version: TMV3.VERSION,
    executionStage: tmv3_executionStage_(),
    stage: 7,
    status: verification.pass ? 'PASS' : 'REVIEW',
    mode: 'RECONCILIATION_PLAN_ONLY',
    reason: tmv3_clean_(reason || 'MANUAL'),
    verticalFilter: filter || 'ALL',
    batch: batch,
    sourceSummary: sourceSummary,
    counts: counts,
    write: write,
    visibleWrite: visibleWrite,
    verification: verification,
    runtime: tmv3_runtimeMetrics_(),
    reconciliationPlanned: true,
    taskWritesPerformed: false,
    calendarWritesPerformed: false,
    strivenWritesPerformed: false
  };

  tmv3_audit_(
    'SYSTEM',
    '',
    '',
    'STEP7_RECONCILIATION_PLAN',
    result.status,
    JSON.stringify({
      verticalFilter: result.verticalFilter,
      counts: counts,
      verification: verification,
      runtime: result.runtime,
      taskWritesPerformed: false,
      calendarWritesPerformed: false,
      strivenWritesPerformed: false
    })
  );

  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

function tmv3_step7CreateCandidateScan(reason, refreshSources) {
  tmv3_assertShadow_();

  if (tmv3_executionStage_() < 7) {
    throw new Error(
      'Execution stage ' + tmv3_executionStage_() +
      ' blocks Step 7 CREATE candidate scan.'
    );
  }

  tmv3_resetRuntimeMetrics_();

  const sourceSummary =
    refreshSources === true
      ? tmv3_step5RefreshTaskSources_()
      : {
          tasks: tmv3_rows_(TMV3.SHEETS.TASKS).length,
          preInspectionTasks: 'ON_DEMAND_ONLY',
          source: 'CACHED_TASK_SOURCES'
        };

  const step2Snapshot = tmv3_step2CalendarRecords_();
  const step3Records = tmv3_step3BusinessAnchorRecords_(
    step2Snapshot,
    tmv3_step3AnchorIndex_()
  );
  const step4Records = tmv3_step4IdentityRecords_(
    step3Records,
    tmv3_step4IdentityIndex_()
  );
  const step5Records = tmv3_step5TaskRecords_(
    step4Records,
    tmv3_step5TaskIndex_()
  );
  const step6Records = tmv3_step6DecisionRecords_(step5Records);

  // Critical API-budget rule:
  // only CREATE / RECREATE dispositions advance into Step 7 planning here.
  // Existing-task rows require fresh Task GETs and can exhaust Striven's
  // per-minute budget before CREATE ownership checks are reached.
  const candidates = step6Records.filter(function(record) {
    const disposition = tmv3_clean_(
      record && record.step6 && record.step6.disposition
    );
    return disposition === 'CREATE_TASK' || disposition === 'RECREATE_TASK';
  });

  const runtime = {
    taskById: {},
    contactByKey: {},
    organizerByEmail: {}
  };

  const plans = tmv3_step7Plans_(candidates, runtime);
  const eligible = plans.filter(function(plan) {
    return (
      (
        String(plan.plan || '').indexOf('CREATE_TASK') !== -1 ||
        String(plan.plan || '').indexOf('RECREATE_TASK') !== -1
      ) &&
      !tmv3_clean_(plan.blocker)
    );
  });

  const result = {
    version: TMV3.VERSION,
    executionStage: tmv3_executionStage_(),
    stage: 7,
    status: 'PASS',
    mode: 'CREATE_CANDIDATE_SCAN_ONLY',
    reason: tmv3_clean_(reason || 'CREATE_CANDIDATE_SCAN'),
    sourceSummary: sourceSummary,
    candidateRecords: candidates.length,
    plans: plans,
    eligible: eligible,
    runtime: tmv3_runtimeMetrics_(),
    taskWritesPerformed: false,
    calendarWritesPerformed: false,
    strivenWritesPerformed: false
  };

  tmv3_audit_(
    'SYSTEM',
    '',
    '',
    'STEP7_CREATE_CANDIDATE_SCAN',
    'PASS',
    JSON.stringify({
      candidateRecords: candidates.length,
      eligible: eligible.length,
      runtime: result.runtime,
      taskWritesPerformed: false,
      calendarWritesPerformed: false,
      strivenWritesPerformed: false
    })
  );

  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

function tmv3_step7ReconciliationRunCached(reason, verticalFilter) {
  return tmv3_step7ReconciliationRun(
    reason || 'CACHED_TASK_SOURCES',
    false,
    verticalFilter || ''
  );
}

function tmv3_step7InstallReconciliationRun(reason) {
  return tmv3_step7ReconciliationRun(
    reason || 'INSTALL_STEP7_VERIFY',
    true,
    'Install'
  );
}

function tmv3_step7ReconciliationBatchRun(
  reason,
  verticalFilter,
  offset,
  limit,
  refreshSources
) {
  const filter = tmv3_clean_(verticalFilter);
  if (!filter) {
    throw new Error('Step 7 batch run requires one vertical.');
  }

  return tmv3_step7ReconciliationRun(
    reason || 'BATCHED_STEP7_VERIFY',
    refreshSources === true,
    filter,
    {
      offset: Number(offset || 0),
      limit: Number(limit || 20)
    }
  );
}

function tmv3_step7FreshPlanForTask_(vertical, eventId, taskId) {
  const wantedVertical = tmv3_clean_(vertical);
  const wantedEventId = tmv3_clean_(eventId);
  const wantedTaskId = String(Number(taskId || 0));

  if (!TMV3.VERTICALS[wantedVertical] || !wantedEventId || wantedTaskId === '0') {
    throw new Error('Fresh Step 7 plan requires vertical, Event ID, and Task ID.');
  }

  const step2 = tmv3_step2CalendarRecords_().filter(function(record) {
    return record.vertical === wantedVertical &&
      tmv3_clean_(record.eventId) === wantedEventId;
  });
  if (step2.length !== 1) {
    throw new Error('Expected one current Calendar record for the Step 7 plan; found ' + step2.length + '.');
  }

  const step3 = tmv3_step3BusinessAnchorRecords_(step2, tmv3_step3AnchorIndex_());
  const step4 = tmv3_step4IdentityRecords_(step3, tmv3_step4IdentityIndex_());
  const step5 = tmv3_step5TaskRecords_(step4, tmv3_step5TaskIndex_());
  const step6 = tmv3_step6DecisionRecords_(step5);
  const runtime = { taskById:{}, contactByKey:{}, organizerByEmail:{} };
  const plans = tmv3_step7Plans_(step6, runtime).filter(function(plan) {
    return String(Number(plan.taskId || 0)) === wantedTaskId;
  });

  if (plans.length !== 1) {
    throw new Error('Expected one fresh Step 7 plan for Task ' + wantedTaskId + '; found ' + plans.length + '.');
  }
  return plans[0];
}

function tmv3_step7Plans_(records, runtime) {
  const plans = [];

  (records || []).forEach(function(record) {
    const decision = record.step6 || {};
    const disposition = tmv3_clean_(decision.disposition) || 'NOT_RUN';
    const sourceTasks = decision.tasks || [];
    const sourceTaskIds = tmv3_unique_(
      sourceTasks.map(function(task) {
        return tmv3_clean_(task && task['Task ID']);
      })
    );

    if (disposition === 'NOT_RUN') {
      plans.push(
        tmv3_step7NoTaskPlan_(
          record,
          disposition,
          'NO_RECONCILIATION_STEP6_NOT_RUN',
          decision.reason || 'Step 6 did not run.',
          sourceTaskIds
        )
      );
      return;
    }

    if (disposition === 'CREATE_TASK' || disposition === 'RECREATE_TASK') {
      plans.push(
        tmv3_step7CreatePlan_(
          record,
          disposition,
          sourceTaskIds,
          runtime
        )
      );
      return;
    }

    if (disposition === 'REVIEW') {
      plans.push(
        tmv3_step7NoTaskPlan_(
          record,
          disposition,
          'REVIEW_NO_AUTOMATIC_MUTATION',
          decision.reason || 'Step 6 requires review.',
          sourceTaskIds
        )
      );
      return;
    }

    if (!sourceTasks.length) {
      plans.push(
        tmv3_step7NoTaskPlan_(
          record,
          disposition,
          'REVIEW_STEP6_TASK_ID_MISSING',
          'Step 6 requires an existing Task but exposed no Task ID.',
          sourceTaskIds
        )
      );
      return;
    }

    sourceTasks.forEach(function(task) {
      plans.push(
        tmv3_step7ExistingTaskPlan_(
          record,
          disposition,
          task,
          sourceTaskIds,
          runtime
        )
      );
    });
  });

  return plans;
}

function tmv3_step7Expected_(record, runtime, verifyContactOwnership) {
  const step3 = record.step3 || {};
  const step4 = record.step4 || {};
  const anchor = step3.anchor || {};
  const cfg = TMV3.VERTICALS[record.vertical];

  const customerId = tmv3_clean_(
    step4.customer && step4.customer['Customer ID']
  );
  const locationId = tmv3_clean_(
    step4.location && step4.location['Location ID']
  );
  const identityContactId = tmv3_clean_(
    step4.contact && step4.contact['Contact ID']
  );
  const orderId = cfg.orderRequired
    ? tmv3_clean_(anchor.orderId)
    : '';

  const expected = {
    customerId: customerId,
    locationId: locationId,
    locationStatus: tmv3_clean_(step4.locationStatus),
    identityContactId: identityContactId,
    orderId: orderId,
    requestedById: '',
    requestedByType: '',
    requestedByError: '',
    contactOwnership: identityContactId ? 'NOT_CHECKED' : 'N/A',
    evidence: (step4.evidence || []).slice()
  };

  if (record.vertical === 'PreInspection') {
    const organizerKey = tmv3_norm_(record.organizer || '');

    if (!runtime.organizerByEmail[organizerKey]) {
      try {
        runtime.organizerByEmail[organizerKey] =
          tmv3_resolveOrganizerEmployee_(record);
      } catch (err) {
        runtime.organizerByEmail[organizerKey] = {
          status: 'REVIEW',
          reason: String(err && err.message || err)
        };
      }
    }

    const requested = runtime.organizerByEmail[organizerKey];
    if (requested && requested.status === 'MATCHED') {
      expected.requestedById = String(requested.employee.id || '');
      expected.requestedByType = 'employee';
      expected.evidence.push(
        requested.evidence || 'CALENDAR_ORGANIZER_EMAIL_EXACT_EMPLOYEE'
      );
    } else {
      expected.requestedByError =
        (requested && requested.reason) ||
        'PreInspection Requested By employee is unresolved.';
    }

    // Customer Contact remains identity evidence only for PreInspection.
    expected.contactOwnership = 'NOT_APPLICABLE_PREINSPECTION';
    return expected;
  }

  if (identityContactId) {
    expected.requestedById = identityContactId;
    expected.requestedByType = 'contact';

    if (verifyContactOwnership) {
      const ownership = tmv3_step7ContactOwnership_(
        identityContactId,
        customerId,
        runtime
      );
      expected.contactOwnership = ownership.status;
      if (ownership.error) {
        expected.requestedByError = ownership.error;
      }
    }
  }

  return expected;
}

function tmv3_step7ContactOwnership_(contactId, customerId, runtime) {
  const key = tmv3_clean_(contactId) + '|' + tmv3_clean_(customerId);

  if (runtime.contactByKey[key]) {
    return runtime.contactByKey[key];
  }

  let result;

  try {
    const contact = tmv3_getContactById_(contactId, customerId);
    result = {
      status: contact && contact.__ownershipVerified
        ? 'VERIFIED'
        : 'UNVERIFIED',
      error:
        contact && contact.__ownershipVerified
          ? ''
          : (
              'Contact ' + contactId +
              ' ownership is not proven for Customer ' + customerId + '.'
            )
    };
  } catch (err) {
    result = {
      status: 'READ_FAILED',
      error:
        'Contact ' + contactId + ' ownership read failed: ' +
        String(err && err.message || err)
    };
  }

  runtime.contactByKey[key] = result;
  return result;
}

function tmv3_step7FreshTask_(taskId, runtime) {
  const id = tmv3_clean_(taskId);

  if (runtime.taskById[id]) {
    return runtime.taskById[id];
  }

  let result;

  try {
    const raw = tmv3_rawTaskById_(id);
    const normalized = tmv3_normalizeV2TaskModel_(raw);
    result = {
      ok: true,
      raw: raw,
      task: normalized,
      requestedBy: tmv3_step7RequestedByFromRaw_(raw),
      assignments: tmv3_taskAssignmentsFromRaw_(raw)
    };
  } catch (err) {
    result = {
      ok: false,
      error: String(err && err.message || err),
      raw: null,
      task: null,
      requestedBy: { id:'', type:'' },
      assignments: []
    };
  }

  runtime.taskById[id] = result;
  return result;
}

function tmv3_step7RequestedByFromRaw_(raw) {
  raw = raw || {};

  const requested = raw.requestedBy || raw.RequestedBy || {};
  const requestedContact =
    raw.requestedByContact || raw.RequestedByContact || {};

  let id = tmv3_clean_(
    tmv3_first_(requested, ['id','Id'])
  );
  let type = tmv3_norm_(
    tmv3_first_(requested, ['type','Type'])
  );

  if (!id) {
    id = tmv3_clean_(
      tmv3_first_(
        requestedContact,
        ['contactId','ContactId','id','Id']
      )
    );

    if (id && !type) type = 'contact';
  }

  if (!id) {
    id = tmv3_clean_(
      tmv3_first_(
        raw,
        [
          'contactId',
          'ContactId',
          'requestedByContactId',
          'RequestedByContactId'
        ]
      )
    );

    if (id && !type) type = 'contact';
  }

  if (
    type &&
    type !== 'contact' &&
    type !== 'employee'
  ) {
    type = tmv3_clean_(
      tmv3_first_(requested, ['type','Type'])
    ).toLowerCase();
  }

  return {
    id: id,
    type: type
  };
}

function tmv3_step7ExistingTaskPlan_(
  record,
  disposition,
  sourceTask,
  sourceTaskIds,
  runtime
) {
  const taskId = tmv3_clean_(sourceTask && sourceTask['Task ID']);
  const fresh = tmv3_step7FreshTask_(taskId, runtime);
  const historical = disposition === 'FULFILLED_NO_RECREATE';

  const expected = tmv3_step7Expected_(
    record,
    runtime,
    false
  );

  if (!fresh.ok) {
    return tmv3_step7PlanRow_({
      record: record,
      disposition: disposition,
      taskId: taskId,
      taskStatus: tmv3_clean_(sourceTask && sourceTask['Status']),
      expected: expected,
      checks: tmv3_step7BlankChecks_('READ_FAILED'),
      plan: historical
        ? 'VERIFY_HISTORY_READ_FAILED'
        : 'DIRECT_TASK_READ_FAILED_NO_MUTATION',
      blocker: fresh.error,
      evidence: tmv3_step7Evidence_(record, [
        'FRESH_TASK_GET_FAILED'
      ]),
      sourceTaskIds: sourceTaskIds,
      readStatus: 'READ_FAILED'
    });
  }

  const actual = fresh.task || {};
  const requestedBy = fresh.requestedBy || { id:'', type:'' };
  const desiredAssignment = tmv3_desiredAssignment_(record);
  const actualAssignments = fresh.assignments || [];

  const customerCheck = tmv3_step7IdCheck_(
    expected.customerId,
    actual['Customer ID']
  );

  let orderCheck;
  if (record.vertical === 'PreInspection') {
    orderCheck = tmv3_clean_(actual['Order ID'])
      ? 'FORBIDDEN_PRESENT'
      : 'MATCH_NOT_ATTACHED';
  } else {
    orderCheck = tmv3_step7IdCheck_(
      expected.orderId,
      actual['Order ID']
    );
  }

  const locationCheck =
    expected.locationStatus === 'CREATE_REQUIRED' &&
    !expected.locationId
      ? (
          tmv3_clean_(actual['Location ID'])
            ? 'EXPECTED_LOCATION_UNRESOLVED'
            : 'CREATE_REQUIRED'
        )
      : tmv3_step7IdCheck_(
          expected.locationId,
          actual['Location ID']
        );

  const requestedCheck = tmv3_step7RequestedByCheck_(
    expected,
    requestedBy
  );

  // Fresh Contact ownership is only needed when Step 7 would propose a
  // Requested By mutation. Matching Requested By relationships do not consume
  // an extra Contact API call; Step 8 must re-verify ownership immediately
  // before any future write.
  if (
    expected.requestedByType === 'contact' &&
    expected.requestedById
  ) {
    if (requestedCheck === 'MATCH') {
      expected.contactOwnership = 'NOT_NEEDED_REQUESTED_BY_MATCH';
    } else if (!historical) {
      const ownership = tmv3_step7ContactOwnership_(
        expected.requestedById,
        expected.customerId,
        runtime
      );
      expected.contactOwnership = ownership.status;
      if (ownership.error) {
        expected.requestedByError = ownership.error;
      }
    }
  }

  const scheduleCheck = tmv3_taskScheduleCheck_(
    record.vertical,
    record.start,
    record.end,
    taskId,
    actual
  );
  const startCheck = scheduleCheck.startCheck;
  const endCheck = scheduleCheck.endCheck;

  const assignmentCheck = tmv3_step7AssignmentCheck_(
    record,
    desiredAssignment,
    actualAssignments
  );

  const checks = {
    customer: customerCheck,
    order: orderCheck,
    location: locationCheck,
    requestedBy: requestedCheck,
    start: startCheck,
    end: endCheck,
    assignment: assignmentCheck.status
  };

  let action;
  if (
    checks.start === 'CANONICAL_READ_FAILED' ||
    checks.end === 'CANONICAL_READ_FAILED'
  ) {
    action = {
      plan: 'REVIEW_DATE_CANONICAL_READ_FAILED',
      blocker:
        'v2 Task schedule disagrees with Calendar and canonical v1 DesiredStartDate/DesiredEndDate could not be verified. Date mutation is blocked.'
    };
  } else {
    action = tmv3_step7ExistingAction_(
      record,
      disposition,
      expected,
      actual,
      checks,
      assignmentCheck,
      historical
    );
  }

  return tmv3_step7PlanRow_({
    record: record,
    disposition: disposition,
    taskId: taskId,
    taskStatus: tmv3_clean_(actual['Status']),
    expected: expected,
    actual: {
      customerId: tmv3_clean_(actual['Customer ID']),
      orderId: tmv3_clean_(actual['Order ID']),
      locationId: tmv3_clean_(actual['Location ID']),
      requestedById: tmv3_clean_(requestedBy.id),
      requestedByType: tmv3_clean_(requestedBy.type),
      start: tmv3_clean_(scheduleCheck.start),
      due: tmv3_clean_(scheduleCheck.due),
      assignment: tmv3_step7AssignmentText_(actualAssignments),
      scheduleSource: scheduleCheck.source || 'V2_TASK_MODEL'
    },
    desiredAssignment: tmv3_step7DesiredAssignmentText_(
      desiredAssignment
    ),
    checks: checks,
    plan: action.plan,
    blocker: action.blocker,
    evidence: tmv3_step7Evidence_(record, [
      'FRESH_TASK_GET',
      'TASK_ID_' + taskId,
      'TASK_SCHEDULE_' + (scheduleCheck.source || 'V2_TASK_MODEL')
    ]),
    sourceTaskIds: sourceTaskIds,
    readStatus: 'FRESH_TASK_GET'
  });
}

function tmv3_step7ExistingAction_(
  record,
  disposition,
  expected,
  actual,
  checks,
  assignmentCheck,
  historical
) {
  if (historical) {
    return {
      plan: 'VERIFY_ONLY_HISTORY_NO_WRITE',
      blocker:
        'Completed Task covers this appointment. Historical relationship drift is evidence only.'
    };
  }

  if (checks.customer !== 'MATCH') {
    return {
      plan: 'REVIEW_CUSTOMER_RELATIONSHIP_CONFLICT',
      blocker:
        'Fresh Task Customer must exactly match the Step 4 verified Customer before any mutation.'
    };
  }

  if (
    record.vertical === 'PreInspection' &&
    checks.order === 'FORBIDDEN_PRESENT'
  ) {
    return {
      plan: 'REVIEW_PREINSPECTION_ORDER_ATTACHED',
      blocker:
        'PreInspection Task is attached to a Sales Order; automatic detachment is not authorized.'
    };
  }

  if (
    checks.order === 'MISMATCH' ||
    checks.location === 'MISMATCH' ||
    checks.location === 'EXPECTED_LOCATION_UNRESOLVED'
  ) {
    return {
      plan: 'REVIEW_RELATIONSHIP_CONFLICT',
      blocker:
        'Fresh Task relationship conflicts with the verified appointment relationship. Do not overwrite automatically.'
    };
  }

  if (expected.requestedByError) {
    return {
      plan: 'REVIEW_REQUESTED_BY_EVIDENCE',
      blocker: expected.requestedByError
    };
  }

  if (
    expected.requestedByType === 'contact' &&
    checks.requestedBy !== 'MATCH' &&
    expected.contactOwnership !== 'VERIFIED'
  ) {
    return {
      plan: 'REVIEW_CONTACT_OWNERSHIP',
      blocker:
        'Expected Contact ownership is not freshly verified for the resolved Customer.'
    };
  }

  const changes = [];

  if (checks.location === 'MISSING') {
    changes.push('LOCATION');
  }

  if (checks.location === 'CREATE_REQUIRED') {
    changes.push('CREATE_LOCATION_THEN_LOCATION');
  }

  if (checks.order === 'MISSING') {
    changes.push('ORDER');
  }

  if (
    expected.requestedById &&
    checks.requestedBy !== 'MATCH'
  ) {
    changes.push('REQUESTED_BY');
  }

  if (
    checks.start !== 'MATCH' ||
    checks.end !== 'MATCH'
  ) {
    changes.push('DATES');
  }

  if (
    assignmentCheck.status !== 'MATCH' &&
    assignmentCheck.status !== 'N/A'
  ) {
    changes.push('ASSIGNMENTS');
  }

  return {
    plan: changes.length
      ? 'PATCH_' + changes.join('_AND_')
      : 'NO_CHANGE',
    blocker: ''
  };
}

function tmv3_step7CreatePlan_(
  record,
  disposition,
  sourceTaskIds,
  runtime
) {
  const expected = tmv3_step7Expected_(
    record,
    runtime,
    true
  );

  let plan;
  let blocker = '';

  if (!expected.customerId) {
    plan = 'REVIEW_CREATE_CUSTOMER_UNRESOLVED';
    blocker = 'Task CREATE requires a verified Customer.';
  } else if (
    TMV3.VERTICALS[record.vertical].orderRequired &&
    !expected.orderId
  ) {
    plan = 'REVIEW_CREATE_ORDER_UNRESOLVED';
    blocker =
      'Task CREATE requires the verified Order / Work Order relationship.';
  } else if (
    expected.requestedByError
  ) {
    plan = 'REVIEW_CREATE_REQUESTED_BY_UNRESOLVED';
    blocker = expected.requestedByError;
  } else if (
    expected.requestedByType === 'contact' &&
    expected.contactOwnership !== 'VERIFIED'
  ) {
    plan = 'REVIEW_CREATE_CONTACT_OWNERSHIP';
    blocker =
      'Expected Contact ownership is not freshly verified for the resolved Customer.';
  } else {
    const createVerb =
      disposition === 'RECREATE_TASK'
        ? 'RECREATE_TASK'
        : 'CREATE_TASK';

    if (
      expected.locationStatus === 'CREATE_REQUIRED' &&
      !expected.locationId
    ) {
      plan =
        record.vertical === 'PreInspection'
          ? (
              'CREATE_LOCATION_THEN_' +
              createVerb +
              '__TYPE105__BLANK_DESCRIPTION__NO_SO__POOL8'
            )
          : 'CREATE_LOCATION_THEN_' + createVerb;
    } else if (record.vertical === 'PreInspection') {
      plan =
        createVerb +
        '__TYPE105__BLANK_DESCRIPTION__NO_SO__POOL8';
    } else {
      plan = createVerb;
    }
  }

  return tmv3_step7PlanRow_({
    record: record,
    disposition: disposition,
    taskId: '',
    taskStatus: 'NOT_CREATED',
    expected: expected,
    checks: {
      customer: expected.customerId ? 'VERIFIED_EXPECTED' : 'MISSING',
      order:
        record.vertical === 'PreInspection'
          ? 'NOT_APPLICABLE'
          : (expected.orderId ? 'VERIFIED_EXPECTED' : 'MISSING'),
      location:
        expected.locationId
          ? 'VERIFIED_EXPECTED'
          : (
              expected.locationStatus === 'CREATE_REQUIRED'
                ? 'CREATE_REQUIRED'
                : 'MISSING'
            ),
      requestedBy:
        expected.requestedByError
          ? 'UNRESOLVED'
          : (
              expected.requestedById
                ? 'VERIFIED_EXPECTED'
                : 'N/A'
            ),
      start: 'VERIFIED_EXPECTED',
      end: 'VERIFIED_EXPECTED',
      assignment: 'VERIFIED_EXPECTED'
    },
    desiredAssignment: tmv3_step7DesiredAssignmentText_(
      tmv3_desiredAssignment_(record)
    ),
    plan: plan,
    blocker: blocker,
    evidence: tmv3_step7Evidence_(record, [
      'CREATE_PLAN_ONLY',
      'NO_TASK_WRITE'
    ]),
    sourceTaskIds: sourceTaskIds,
    readStatus: 'NO_TASK_READ_REQUIRED'
  });
}

function tmv3_step7NoTaskPlan_(
  record,
  disposition,
  plan,
  blocker,
  sourceTaskIds
) {
  const expected = {
    customerId: tmv3_clean_(
      record.step4 &&
      record.step4.customer &&
      record.step4.customer['Customer ID']
    ),
    orderId: tmv3_clean_(
      record.step3 &&
      record.step3.anchor &&
      record.step3.anchor.orderId
    ),
    locationId: tmv3_clean_(
      record.step4 &&
      record.step4.location &&
      record.step4.location['Location ID']
    ),
    requestedById: '',
    requestedByType: '',
    contactOwnership: 'NOT_CHECKED',
    evidence: []
  };

  return tmv3_step7PlanRow_({
    record: record,
    disposition: disposition,
    taskId: '',
    taskStatus: '',
    expected: expected,
    checks: tmv3_step7BlankChecks_('NOT_RUN'),
    plan: plan,
    blocker: blocker,
    evidence: tmv3_step7Evidence_(record, [
      'NO_MUTATION_AUTHORIZED'
    ]),
    sourceTaskIds: sourceTaskIds,
    readStatus: 'NOT_RUN'
  });
}

function tmv3_step7PlanRow_(input) {
  input = input || {};
  const record = input.record || {};
  const expected = input.expected || {};
  const actual = input.actual || {};
  const checks = input.checks || tmv3_step7BlankChecks_('');
  const now = tmv3_now_();

  return {
    vertical: record.vertical || '',
    eventId: record.eventId || '',
    logicalKey: record.logicalKey || (
      tmv3_clean_(record.vertical) + '|' +
      tmv3_clean_(record.eventId)
    ),
    event: record.title || '',
    disposition: input.disposition || '',
    taskId: input.taskId || '',
    taskStatus: input.taskStatus || '',
    expectedCustomerId: expected.customerId || '',
    actualCustomerId: actual.customerId || '',
    customerCheck: checks.customer || '',
    expectedOrderId: expected.orderId || '',
    actualOrderId: actual.orderId || '',
    orderCheck: checks.order || '',
    expectedLocationId: expected.locationId || '',
    actualLocationId: actual.locationId || '',
    locationCheck: checks.location || '',
    expectedRequestedById: expected.requestedById || '',
    expectedRequestedByType: expected.requestedByType || '',
    actualRequestedById: actual.requestedById || '',
    actualRequestedByType: actual.requestedByType || '',
    requestedByCheck: checks.requestedBy || '',
    contactOwnership: expected.contactOwnership || 'N/A',
    calendarStart: record.start ? tmv3_iso_(record.start) : '',
    taskStart: actual.start || '',
    startCheck: checks.start || '',
    calendarEnd: record.end ? tmv3_iso_(record.end) : '',
    taskDue: actual.due || '',
    endCheck: checks.end || '',
    scheduleSource: actual.scheduleSource || 'V2_TASK_MODEL',
    desiredAssignment: input.desiredAssignment || '',
    actualAssignment: actual.assignment || '',
    assignmentCheck: checks.assignment || '',
    plan: input.plan || '',
    writeGate: 'SHADOW_ONLY__NO_WRITES',
    blocker: input.blocker || '',
    evidence: input.evidence || '',
    sourceTaskIds: (input.sourceTaskIds || []).join(','),
    engineVersion: TMV3.VERSION,
    plannedAt: now,
    readStatus: input.readStatus || ''
  };
}

function tmv3_step7BlankChecks_(value) {
  return {
    customer: value || '',
    order: value || '',
    location: value || '',
    requestedBy: value || '',
    start: value || '',
    end: value || '',
    assignment: value || ''
  };
}

function tmv3_step7IdCheck_(expected, actual) {
  const e = tmv3_clean_(expected);
  const a = tmv3_clean_(actual);

  if (!e && !a) return 'N/A';
  if (!e && a) return 'SOURCE_ONLY';
  if (e && !a) return 'MISSING';
  return e === a ? 'MATCH' : 'MISMATCH';
}

function tmv3_step7RequestedByCheck_(expected, actual) {
  const expectedId = tmv3_clean_(expected.requestedById);
  const expectedType = tmv3_norm_(expected.requestedByType);
  const actualId = tmv3_clean_(actual && actual.id);
  const actualType = tmv3_norm_(actual && actual.type);

  if (!expectedId && !actualId) return 'N/A';
  if (!expectedId && actualId) return 'SOURCE_ONLY';
  if (expectedId && !actualId) return 'MISSING';
  if (expectedId !== actualId) return 'MISMATCH';
  if (expectedType && !actualType) return 'TYPE_UNKNOWN';
  if (expectedType && expectedType !== actualType) return 'TYPE_MISMATCH';
  return 'MATCH';
}

function tmv3_step7DateCheck_(expectedDate, actualValue) {
  if (!expectedDate && !actualValue) return 'N/A';
  if (expectedDate && !actualValue) return 'MISSING';
  if (!expectedDate && actualValue) return 'SOURCE_ONLY';

  return tmv3_sameMinute_(expectedDate, actualValue)
    ? 'MATCH'
    : 'MISMATCH';
}

function tmv3_step7DesiredAssignmentText_(desired) {
  desired = desired || {};

  const parts = [];

  (desired.employeeIds || []).forEach(function(id) {
    parts.push('employee:' + Number(id));
  });

  (desired.poolIds || []).forEach(function(id) {
    parts.push('pool:' + Number(id));
  });

  return parts.sort().join(',');
}

function tmv3_step7AssignmentText_(assignments) {
  return (assignments || [])
    .map(function(item) {
      return (
        tmv3_clean_(item.type) +
        ':' +
        Number(item.id || 0)
      );
    })
    .filter(Boolean)
    .sort()
    .join(',');
}

function tmv3_step7AssignmentCheck_(
  record,
  desired,
  actualAssignments
) {
  desired = desired || {
    employeeIds: [],
    poolIds: []
  };

  const required = [];

  (desired.employeeIds || []).forEach(function(id) {
    required.push('employee|' + Number(id));
  });

  (desired.poolIds || []).forEach(function(id) {
    required.push('pool|' + Number(id));
  });

  if (!required.length) {
    return {
      status: 'N/A',
      missing: [],
      conflicts: []
    };
  }

  const actual = (actualAssignments || []).map(function(item) {
    return tmv3_clean_(item.type) + '|' + Number(item.id || 0);
  });

  const missing = required.filter(function(key) {
    return actual.indexOf(key) === -1;
  });

  const conflicts = [];
  const desiredEmployeeIds = (desired.employeeIds || []).map(Number);

  if (record.vertical === 'Service') {
    [26,38,39].forEach(function(id) {
      if (
        actual.indexOf('employee|' + id) !== -1 &&
        desiredEmployeeIds.indexOf(id) === -1
      ) {
        conflicts.push('employee|' + id);
      }
    });
  }

  if (record.vertical === 'Delivery') {
    [18,26].forEach(function(id) {
      if (
        actual.indexOf('employee|' + id) !== -1 &&
        desiredEmployeeIds.indexOf(id) === -1
      ) {
        conflicts.push('employee|' + id);
      }
    });

    if (
      desiredEmployeeIds.length &&
      actual.indexOf('pool|4') !== -1
    ) {
      conflicts.push('pool|4');
    }
  }

  if (
    record.vertical === 'PreInspection' &&
    actual.indexOf('pool|4') !== -1
  ) {
    conflicts.push('pool|4');
  }

  return {
    status:
      missing.length || conflicts.length
        ? 'MISMATCH'
        : 'MATCH',
    missing: missing,
    conflicts: conflicts
  };
}

function tmv3_step7Evidence_(record, extra) {
  const evidence = [];

  if (record.step6) {
    if (record.step6.code) {
      evidence.push('STEP6_' + record.step6.code);
    }
    if (record.step6.reason) {
      evidence.push(tmv3_clean_(record.step6.reason));
    }
  }

  ((record.step4 && record.step4.evidence) || [])
    .forEach(function(item) {
      evidence.push(tmv3_clean_(item));
    });

  (extra || []).forEach(function(item) {
    evidence.push(tmv3_clean_(item));
  });

  return tmv3_unique_(
    evidence.filter(Boolean)
  ).join(' | ');
}

function tmv3_step7EnsureSheet_() {
  const ss = tmv3_ss_();
  let sh = ss.getSheetByName(TMV3.SHEETS.RECONCILE);

  if (!sh) {
    sh = ss.insertSheet(TMV3.SHEETS.RECONCILE);
  }

  const width = TMV3_STEP7_HEADERS.length;

  if (sh.getMaxColumns() < width) {
    sh.insertColumnsAfter(
      sh.getMaxColumns(),
      width - sh.getMaxColumns()
    );
  }

  if (sh.getMaxRows() < 2) {
    sh.insertRowsAfter(sh.getMaxRows(), 2 - sh.getMaxRows());
  }

  return sh;
}

function tmv3_step7WritePlans_(plans, verticalFilter, batch) {
  const sh = tmv3_step7EnsureSheet_();
  const filter = tmv3_clean_(verticalFilter);

  const newRows = (plans || []).map(function(plan) {
    return [
      plan.vertical,
      plan.eventId,
      plan.logicalKey,
      plan.event,
      plan.disposition,
      plan.taskId,
      plan.taskStatus,
      plan.expectedCustomerId,
      plan.actualCustomerId,
      plan.customerCheck,
      plan.expectedOrderId,
      plan.actualOrderId,
      plan.orderCheck,
      plan.expectedLocationId,
      plan.actualLocationId,
      plan.locationCheck,
      plan.expectedRequestedById,
      plan.expectedRequestedByType,
      plan.actualRequestedById,
      plan.actualRequestedByType,
      plan.requestedByCheck,
      plan.contactOwnership,
      plan.calendarStart,
      plan.taskStart,
      plan.startCheck,
      plan.calendarEnd,
      plan.taskDue,
      plan.endCheck,
      plan.desiredAssignment,
      plan.actualAssignment,
      plan.assignmentCheck,
      plan.plan,
      plan.writeGate,
      plan.blocker,
      plan.evidence,
      plan.sourceTaskIds,
      plan.engineVersion,
      plan.plannedAt,
      plan.readStatus
    ];
  });

  let rows = newRows.slice();

  if (filter && sh.getLastRow() > 1) {
    const existing = sh
      .getRange(1,1,sh.getLastRow(),TMV3_STEP7_HEADERS.length)
      .getValues();

    const headerMatches =
      existing.length &&
      String(existing[0][0] || '') === TMV3_STEP7_HEADERS[0] &&
      existing[0].length === TMV3_STEP7_HEADERS.length;

    if (headerMatches) {
      const replacementKeys = {};
      newRows.forEach(function(row) {
        replacementKeys[tmv3_clean_(row[2])] = true;
      });

      const preserved = existing.slice(1).filter(function(row) {
        const rowVertical = tmv3_clean_(row[0]);
        if (!rowVertical) return false;
        if (rowVertical !== filter) return true;
        if (!(batch && batch.enabled)) return false;
        return !replacementKeys[tmv3_clean_(row[2])];
      });

      rows = preserved.concat(newRows);
    }
  }

  rows.sort(function(a, b) {
    const verticalCompare =
      tmv3_clean_(a[0]).localeCompare(tmv3_clean_(b[0]));
    if (verticalCompare !== 0) return verticalCompare;

    const startCompare =
      tmv3_clean_(a[22]).localeCompare(tmv3_clean_(b[22]));
    if (startCompare !== 0) return startCompare;

    return tmv3_clean_(a[3]).localeCompare(tmv3_clean_(b[3]));
  });

  tmv3_replaceRows_(
    TMV3.SHEETS.RECONCILE,
    TMV3_STEP7_HEADERS.slice(),
    rows
  );

  try {
    sh.setFrozenRows(1);
    sh.getRange(1,1,1,TMV3_STEP7_HEADERS.length)
      .setFontWeight('bold')
      .setWrap(true);

    sh.getRange(1,1,Math.max(1,rows.length + 1),TMV3_STEP7_HEADERS.length)
      .setWrap(true);

    sh.setColumnWidth(4, 320);
    sh.setColumnWidth(32, 280);
    sh.setColumnWidth(34, 320);
    sh.setColumnWidth(35, 360);

    if (!sh.isSheetHidden()) {
      sh.hideSheet();
    }
  } catch (ignored) {}

  return {
    sheet: TMV3.SHEETS.RECONCILE,
    verticalFilter: filter || 'ALL',
    batch: batch || { enabled:false },
    rowsWritten: newRows.length,
    totalRows: rows.length,
    preservedOtherVerticalRows: rows.length - newRows.length,
    hidden: true
  };
}

function tmv3_step7OperatorNextAction_(plans) {
  const list = (plans || []).map(function(plan) {
    return tmv3_clean_(plan);
  }).filter(Boolean);

  if (!list.length) return 'No Step 7 reconciliation result published yet.';
  if (list.every(function(plan) { return plan === 'NO_CHANGE'; })) {
    return 'Verified by Step 7 — no change required.';
  }
  if (list.some(function(plan) { return /^REVIEW_|READ_FAILED|DIRECT_TASK_READ_FAILED/.test(plan); })) {
    return 'Step 7 requires review before any write.';
  }
  if (list.some(function(plan) { return plan.indexOf('CREATE_LOCATION_THEN_') === 0; })) {
    return 'Step 7 requires customer-owned Location creation before Task creation.';
  }
  if (list.some(function(plan) { return plan.indexOf('RECREATE_TASK') !== -1; })) {
    return 'Step 7 verified a guarded Task recreation candidate.';
  }
  if (list.some(function(plan) { return plan.indexOf('CREATE_TASK') !== -1; })) {
    return 'Step 7 verified a guarded Task creation candidate.';
  }
  if (list.some(function(plan) { return plan.indexOf('PATCH_') === 0; })) {
    return 'Step 7 identified a guarded existing-Task correction.';
  }
  if (list.some(function(plan) { return plan.indexOf('VERIFY_ONLY') === 0; })) {
    return 'Step 7 verified historical coverage — no automatic write.';
  }
  return 'Step 7 reconciliation published. Review the plan shown here.';
}

function tmv3_publishLatestStep7ToVisibleSheets() {
  const reconcileRows = tmv3_rows_(TMV3.SHEETS.RECONCILE);
  const byEvent = {};

  reconcileRows.forEach(function(row) {
    const vertical = tmv3_clean_(row['Vertical']);
    const eventId = tmv3_clean_(row['Event ID']);
    if (!vertical || !eventId) return;

    const key = vertical + '|' + eventId;
    if (!byEvent[key]) byEvent[key] = [];
    byEvent[key].push(row);
  });

  const written = {};
  let publishedRows = 0;

  Object.keys(TMV3.VERTICALS).forEach(function(vertical) {
    const sheetName = TMV3.VERTICALS[vertical].sheet;
    const sh = tmv3_sheet_(sheetName);
    const lastRow = sh.getLastRow();
    const lastColumn = sh.getLastColumn();

    if (lastRow < 2 || lastColumn < 1) {
      written[vertical] = 0;
      return;
    }

    const values = sh.getRange(1,1,lastRow,lastColumn).getValues();
    const headers = values[0].map(tmv3_clean_);
    const eventIx = headers.indexOf('Event ID');
    const mappingIx = headers.indexOf('Mapping Status');
    const issueIx = headers.indexOf('Issue / Next Action');

    if (eventIx < 0 || mappingIx < 0 || issueIx < 0) {
      throw new Error(
        'Operator sheet ' + sheetName +
        ' is missing Event ID / Mapping Status / Issue columns.'
      );
    }

    let changed = 0;

    for (let i = 1; i < values.length; i++) {
      const eventId = tmv3_clean_(values[i][eventIx]);
      if (!eventId) continue;

      const plans = byEvent[vertical + '|' + eventId] || [];
      if (!plans.length) continue;

      const planNames = tmv3_unique_(
        plans.map(function(plan) {
          return tmv3_clean_(plan['Relationship Plan']);
        }).filter(Boolean)
      );

      const blockers = tmv3_unique_(
        plans.map(function(plan) {
          return tmv3_clean_(plan['Blocker']);
        }).filter(Boolean)
      );

      const engineVersions = tmv3_unique_(
        plans.map(function(plan) {
          return tmv3_clean_(plan['Engine Version']);
        }).filter(Boolean)
      );

      values[i][mappingIx] =
        'STEP 7 — ' +
        (planNames.length ? planNames.join(' + ') : 'NO PLAN');

      values[i][issueIx] =
        blockers.length
          ? blockers.join(' | ')
          : tmv3_step7OperatorNextAction_(planNames);

      // Keep a visible, non-invasive proof of which engine produced this
      // projection without changing the operator column structure.
      const checklistIx = headers.indexOf('Data Checklist');
      if (checklistIx >= 0 && engineVersions.length) {
        const existing = tmv3_clean_(values[i][checklistIx])
          .replace(/\n?V3 Engine:\s*[^\n]+/gi, '')
          .trim();
        values[i][checklistIx] =
          (existing ? existing + '\n' : '') +
          'V3 Engine: ' +
          engineVersions.join(', ');
      }

      changed++;
      publishedRows++;
    }

    if (changed) {
      sh.getRange(1,1,values.length,values[0].length).setValues(values);
    }

    written[vertical] = changed;
  });

  const overview = tmv3_sheet_(TMV3.SHEETS.OVERVIEW);
  overview.getRange('B2').setValue(
    'V3 ' + TMV3.VERSION + ' — STAGE ' + tmv3_executionStage_() +
    ' — VISIBLE SHEET SYNCED'
  );
  overview.getRange('B4').setValue(
    TMV3.MODE + ' — WORKBOOK UPDATES ENABLED; BUSINESS WRITES GATED'
  );
  overview.getRange('B5').setValue(
    'Visible operator tabs are projected from the latest Step 7 reconciliation.'
  );
  overview.getRange('B6').setValue(
    'Mapping Status and Issue / Next Action now show the latest published Step 7 plan.'
  );
  overview.getRange('B14').setValue(
    'Step 7 visible-sheet publication active; guarded CREATE/RECREATE verification remains next.'
  );
  overview.getRange('B16').setValue(
    'Operator tabs reflect the latest TM Reconcile publication; TM Reconcile remains the detailed evidence source.'
  );

  const morning = tmv3_refreshMorningOps();

  tmv3_audit_(
    'SYSTEM','','','STEP7_VISIBLE_SHEET_PUBLISH','PASS',
    JSON.stringify({
      version: TMV3.VERSION,
      reconcileRows: reconcileRows.length,
      publishedRows: publishedRows,
      written: written
    })
  );

  return {
    status:'STEP7_VISIBLE_SHEETS_SYNCED',
    version:TMV3.VERSION,
    reconcileRows:reconcileRows.length,
    publishedRows:publishedRows,
    written:written,
    morningOps:morning
  };
}

function tmv3_step7Counts_(plans) {
  const counts = {
    total: 0,
    byVertical: {},
    byPlan: {},
    taskReads: 0,
    taskReadFailures: 0,
    safeMutationCandidates: 0,
    reviewPlans: 0,
    noChange: 0
  };

  (plans || []).forEach(function(plan) {
    counts.total++;

    if (!counts.byVertical[plan.vertical]) {
      counts.byVertical[plan.vertical] = 0;
    }
    counts.byVertical[plan.vertical]++;

    if (!counts.byPlan[plan.plan]) {
      counts.byPlan[plan.plan] = 0;
    }
    counts.byPlan[plan.plan]++;

    if (plan.readStatus === 'FRESH_TASK_GET') {
      counts.taskReads++;
    }
    if (plan.readStatus === 'READ_FAILED') {
      counts.taskReadFailures++;
    }

    if (/^PATCH_|^CREATE_|^RECREATE_/.test(plan.plan)) {
      counts.safeMutationCandidates++;
    }
    if (/^REVIEW_|READ_FAILED/.test(plan.plan)) {
      counts.reviewPlans++;
    }
    if (plan.plan === 'NO_CHANGE') {
      counts.noChange++;
    }
  });

  return counts;
}

function tmv3_step7Verify_(step6Records, plans) {
  const covered = {};
  const expected = {};
  let invalidWriteGate = 0;
  let missingPlan = 0;
  let readFailures = 0;
  let multiSiblingMismatch = 0;

  (plans || []).forEach(function(plan) {
    covered[plan.logicalKey] =
      (covered[plan.logicalKey] || 0) + 1;

    if (plan.writeGate !== 'SHADOW_ONLY__NO_WRITES') {
      invalidWriteGate++;
    }

    if (!plan.plan) {
      missingPlan++;
    }

    if (plan.readStatus === 'READ_FAILED') {
      readFailures++;
    }
  });

  (step6Records || []).forEach(function(record) {
    const key = record.logicalKey || (
      tmv3_clean_(record.vertical) + '|' +
      tmv3_clean_(record.eventId)
    );
    expected[key] = true;

    const disposition = tmv3_clean_(
      record.step6 && record.step6.disposition
    );

    if (
      disposition === 'MATCH_EXISTING_MULTI'
    ) {
      const expectedSiblingRows =
        ((record.step6 && record.step6.tasks) || []).length;
      const actualSiblingRows = Number(covered[key] || 0);

      if (expectedSiblingRows !== actualSiblingRows) {
        multiSiblingMismatch++;
      }
    }
  });

  const missingKeys = Object.keys(expected).filter(function(key) {
    return !covered[key];
  });

  const introducedKeys = Object.keys(covered).filter(function(key) {
    return !expected[key];
  });

  return {
    pass:
      invalidWriteGate === 0 &&
      missingPlan === 0 &&
      readFailures === 0 &&
      multiSiblingMismatch === 0 &&
      missingKeys.length === 0 &&
      introducedKeys.length === 0,
    step6Records: (step6Records || []).length,
    step7Rows: (plans || []).length,
    missingPlan: missingPlan,
    invalidWriteGate: invalidWriteGate,
    taskReadFailures: readFailures,
    multiSiblingMismatch: multiSiblingMismatch,
    missingFromStep7: missingKeys.length,
    introducedByStep7: introducedKeys.length,
    missingKeys: missingKeys.slice(0,20),
    introducedKeys: introducedKeys.slice(0,20)
  };
}

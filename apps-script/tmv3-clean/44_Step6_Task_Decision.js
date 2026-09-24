/************************************************************
 * TM V3 — STAGE 6 TASK DECISION
 *
 * Narrow contract:
 * - Consumes exact Step-5 records.
 * - Decides MATCH / FULFILLED / CREATE / RECREATE / REVIEW.
 * - Does not create, patch, assign, or link anything.
 * - Same-day completed-task protection is shared across all verticals.
 ************************************************************/

function tmv3_step6TaskDecisionRun(reason, refreshSources) {
  tmv3_assertShadow_();

  const sourceSummary =
    refreshSources === true
      ? tmv3_step5RefreshTaskSources_()
      : {
          tasks: tmv3_rows_(TMV3.SHEETS.TASKS).length,
          preInspectionTasks: 'ON_DEMAND_ONLY',
          source: 'CACHED_TASK_SOURCES'
        };

  const step2Snapshot = tmv3_step2CalendarRecords_();
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

  const records = tmv3_step6DecisionRecords_(step5Records);
  const counts = tmv3_step6Counts_(records);
  const write = tmv3_step6WriteOperatorViews_(records);
  const verification = tmv3_step6Verify_(records, step5Records);

  const result = {
    version: TMV3.VERSION,
    executionStage: tmv3_executionStage_(),
    stage: 6,
    status: verification.pass ? 'PASS' : 'REVIEW',
    mode: 'TASK_DECISION_ONLY',
    reason: tmv3_clean_(reason || 'MANUAL'),
    sourceSummary: sourceSummary,
    counts: counts,
    write: write,
    verification: verification,
    taskWritesPerformed: false,
    calendarWritesPerformed: false,
    strivenWritesPerformed: false,
    reconciliationPerformed: false
  };

  tmv3_audit_(
    'SYSTEM','','','STEP6_TASK_DECISION',
    result.status,
    JSON.stringify(result)
  );

  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

function tmv3_step6TaskDecisionRunCached(reason) {
  return tmv3_step6TaskDecisionRun(
    reason || 'CACHED_TASK_SOURCES',
    false
  );
}

function tmv3_step6DecisionRecords_(step5Records) {
  return (step5Records || []).map(function(record) {
    const step5 = record.step5 || {};
    let decision;

    if (step5.disposition === 'NOT_RUN') {
      decision = tmv3_step6Decision_(
        'NOT_RUN',
        'STEP5_NOT_RUN',
        'Task decision did not run because Step 5 did not run.',
        []
      );

    } else if (step5.disposition === 'REVIEW') {
      decision = tmv3_step6Decision_(
        'REVIEW',
        'STEP5_REVIEW',
        step5.reason || 'Step 5 requires review.',
        step5.tasks || []
      );

    } else if (step5.disposition === 'MATCHED') {
      decision = tmv3_step6Decision_(
        'MATCH_EXISTING',
        'OPEN_TASK_MATCHED',
        'Use the verified OPEN Task.',
        step5.tasks || []
      );

    } else if (step5.disposition === 'MATCHED_MULTI') {
      decision = tmv3_step6Decision_(
        'MATCH_EXISTING_MULTI',
        'OPEN_MULTI_TASKS_MATCHED',
        'Use the verified OPEN Service fireplace Tasks.',
        step5.tasks || []
      );

    } else if (step5.disposition === 'NO_TASK') {
      decision = tmv3_step6NoOpenTaskDecision_(record);

    } else {
      decision = tmv3_step6Decision_(
        'REVIEW',
        'UNKNOWN_STEP5_DISPOSITION',
        'Unknown Step 5 disposition: ' + tmv3_clean_(step5.disposition),
        []
      );
    }

    return Object.assign({}, record, { step6: decision });
  });
}

function tmv3_step6NoOpenTaskDecision_(record) {
  const history = (record.step5 && record.step5.historyTasks) || [];
  const eventDay = tmv3_step6LocalDay_(record.start);

  if (!history.length) {
    return tmv3_step6Decision_(
      'CREATE_TASK',
      'NO_TASK_OR_HISTORY',
      'No applicable OPEN Task or historical Task was found.',
      []
    );
  }

  const fulfilled = history.filter(function(task) {
    return tmv3_step6IsFulfilledStatus_(task['Status']);
  });

  const cancelled = history.filter(function(task) {
    return tmv3_step6IsCancelledStatus_(task['Status']);
  });

  const sameDayFulfilled = fulfilled.filter(function(task) {
    return tmv3_step6TaskTouchesEventDay_(record, task);
  });

  if (sameDayFulfilled.length) {
    return tmv3_step6Decision_(
      'FULFILLED_NO_RECREATE',
      'COMPLETED_TASK_ON_EVENT_DAY',
      'Applicable completed Task is scheduled on the Calendar event date. Do not recreate.',
      sameDayFulfilled,
      history
    );
  }

  const sameDayCancelled = cancelled.filter(function(task) {
    return tmv3_step6TaskTouchesEventDay_(record, task);
  });

  if (sameDayCancelled.length) {
    return tmv3_step6Decision_(
      'REVIEW',
      'CANCELLED_TASK_ON_EVENT_DAY',
      'A cancelled Task is scheduled on the Calendar event date. Do not auto-create or recreate.',
      sameDayCancelled,
      history
    );
  }

  const historyDays = history.map(function(task) {
    return tmv3_step6TaskLocalDay_(task);
  });

  if (historyDays.some(function(day) { return !day; })) {
    return tmv3_step6Decision_(
      'REVIEW',
      'HISTORY_DATE_UNPROVEN',
      'Historical Task exists but its appointment date cannot be proven.',
      history,
      history
    );
  }

  if (
    eventDay &&
    historyDays.some(function(day) { return day > eventDay; })
  ) {
    return tmv3_step6Decision_(
      'REVIEW',
      'HISTORY_AFTER_EVENT_DATE',
      'Historical Task evidence falls after the Calendar event date.',
      history,
      history
    );
  }

  return tmv3_step6Decision_(
    'RECREATE_TASK',
    'ONLY_OLDER_HISTORY_REMAINS',
    'No OPEN Task remains and only older historical Task evidence exists.',
    history,
    history
  );
}

function tmv3_step6Decision_(
  disposition,
  code,
  reason,
  tasks,
  historyTasks
) {
  return {
    disposition: disposition,
    code: code,
    reason: reason,
    tasks: tasks || [],
    historyTasks: historyTasks || [],
    writesAuthorized: false
  };
}

function tmv3_step6IsFulfilledStatus_(status) {
  const clean = tmv3_norm_(status);
  return ['done','complete','completed','closed'].indexOf(clean) !== -1;
}

function tmv3_step6IsCancelledStatus_(status) {
  const clean = tmv3_norm_(status);
  return ['canceled','cancelled'].indexOf(clean) !== -1;
}

function tmv3_step6TaskTouchesEventDay_(record, task) {
  return (
    tmv3_sameLocalDay_(record.start, task && task['Start']) ||
    tmv3_sameLocalDay_(record.start, task && task['Due'])
  );
}

function tmv3_step6TaskLocalDay_(task) {
  const start = tmv3_clean_(task && task['Start']);
  const due = tmv3_clean_(task && task['Due']);
  return tmv3_step6LocalDay_(start || due);
}

function tmv3_step6LocalDay_(value) {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return '';
  return Utilities.formatDate(d, TMV3_TIMEZONE, 'yyyy-MM-dd');
}

function tmv3_step6Counts_(records) {
  const counts = {
    total:0,
    matchExisting:0,
    matchExistingMulti:0,
    fulfilledNoRecreate:0,
    createTask:0,
    recreateTask:0,
    review:0,
    notRun:0,
    byVertical:{}
  };

  (records || []).forEach(function(record) {
    counts.total++;

    if (!counts.byVertical[record.vertical]) {
      counts.byVertical[record.vertical] = {
        total:0,
        matchExisting:0,
        matchExistingMulti:0,
        fulfilledNoRecreate:0,
        createTask:0,
        recreateTask:0,
        review:0,
        notRun:0
      };
    }

    const bucket = counts.byVertical[record.vertical];
    bucket.total++;

    const d = record.step6 ? record.step6.disposition : 'NOT_RUN';
    const map = {
      MATCH_EXISTING:'matchExisting',
      MATCH_EXISTING_MULTI:'matchExistingMulti',
      FULFILLED_NO_RECREATE:'fulfilledNoRecreate',
      CREATE_TASK:'createTask',
      RECREATE_TASK:'recreateTask',
      REVIEW:'review',
      NOT_RUN:'notRun'
    };

    const key = map[d] || 'review';
    counts[key]++;
    bucket[key]++;
  });

  return counts;
}

function tmv3_step6WriteOperatorViews_(records) {
  const written = {};

  Object.keys(TMV3.VERTICALS).forEach(function(vertical) {
    const verticalRecords = (records || [])
      .filter(function(record) { return record.vertical === vertical; })
      .sort(function(a, b) {
        const aTime = a.start instanceof Date ? a.start.getTime() : 0;
        const bTime = b.start instanceof Date ? b.start.getTime() : 0;
        if (aTime !== bTime) return aTime - bTime;
        return tmv3_clean_(a.title).localeCompare(tmv3_clean_(b.title));
      });

    const rows = verticalRecords.map(tmv3_step6OperatorRow_);
    const sheetName = TMV3.VERTICALS[vertical].sheet;
    const priorLastRow = tmv3_sheet_(sheetName).getLastRow();

    tmv3_replaceRows_(sheetName, TMV3_STEP1_HEADERS.slice(), rows);
    tmv3_step1FormatOperatorView_(
      sheetName,
      vertical,
      verticalRecords,
      priorLastRow
    );

    written[vertical] = rows.length;
  });

  return written;
}

function tmv3_step6OperatorRow_(record) {
  const row = tmv3_step5OperatorRow_(record);
  const decision = record.step6 || {};

  row[9] = 'STEP 6 — ' + (decision.disposition || 'NOT_RUN');

  if (decision.disposition === 'MATCH_EXISTING') {
    row[10] = 'Use existing OPEN Task.';
  } else if (decision.disposition === 'MATCH_EXISTING_MULTI') {
    row[10] = 'Use existing OPEN fireplace Tasks.';
  } else if (decision.disposition === 'FULFILLED_NO_RECREATE') {
    row[10] = 'Completed Task covers this event date — do not recreate.';
  } else if (decision.disposition === 'CREATE_TASK') {
    row[10] = 'No Task/history found — Task creation candidate.';
  } else if (decision.disposition === 'RECREATE_TASK') {
    row[10] = 'Only older Task history remains — Task recreation candidate.';
  } else if (decision.disposition === 'REVIEW') {
    row[10] = decision.reason || 'Task decision requires review.';
  }

  return row;
}

function tmv3_step6Verify_(records, step5Records) {
  const prior = {};
  const current = {};
  let missingDecision = 0;
  let invalidTransition = 0;
  let sameDayCompletedRecreateError = 0;

  (step5Records || []).forEach(function(record) {
    prior[record.logicalKey] = true;
  });

  (records || []).forEach(function(record) {
    current[record.logicalKey] = true;

    const s5 = record.step5 ? record.step5.disposition : '';
    const s6 = record.step6 ? record.step6.disposition : '';

    if (!s6) missingDecision++;

    const allowed = {
      NOT_RUN:['NOT_RUN'],
      REVIEW:['REVIEW'],
      MATCHED:['MATCH_EXISTING'],
      MATCHED_MULTI:['MATCH_EXISTING_MULTI'],
      NO_TASK:[
        'FULFILLED_NO_RECREATE',
        'CREATE_TASK',
        'RECREATE_TASK',
        'REVIEW'
      ]
    };

    if (!allowed[s5] || allowed[s5].indexOf(s6) === -1) {
      invalidTransition++;
    }

    if (
      s5 === 'NO_TASK' &&
      ((record.step5 && record.step5.historyTasks) || [])
        .some(function(task) {
          return (
            tmv3_step6IsFulfilledStatus_(task['Status']) &&
            tmv3_step6TaskTouchesEventDay_(record, task)
          );
        }) &&
      s6 !== 'FULFILLED_NO_RECREATE'
    ) {
      sameDayCompletedRecreateError++;
    }
  });

  const missing = Object.keys(prior).filter(function(key) {
    return !current[key];
  });

  const introduced = Object.keys(current).filter(function(key) {
    return !prior[key];
  });

  const expectedRows = {};
  const actualRows = {};

  Object.keys(TMV3.VERTICALS).forEach(function(vertical) {
    expectedRows[vertical] = records.filter(function(record) {
      return record.vertical === vertical;
    }).length;

    actualRows[vertical] = Math.max(
      0,
      tmv3_sheet_(TMV3.VERTICALS[vertical].sheet).getLastRow() - 1
    );
  });

  const rowCountsMatch = Object.keys(expectedRows).every(function(vertical) {
    return expectedRows[vertical] === actualRows[vertical];
  });

  return {
    pass:
      missingDecision === 0 &&
      invalidTransition === 0 &&
      sameDayCompletedRecreateError === 0 &&
      missing.length === 0 &&
      introduced.length === 0 &&
      rowCountsMatch,
    step5Records:(step5Records || []).length,
    step6Records:(records || []).length,
    missingDecision:missingDecision,
    invalidTransition:invalidTransition,
    sameDayCompletedRecreateError:sameDayCompletedRecreateError,
    missingFromStep6:missing.length,
    introducedByStep6:introduced.length,
    expectedRows:expectedRows,
    actualRows:actualRows
  };
}

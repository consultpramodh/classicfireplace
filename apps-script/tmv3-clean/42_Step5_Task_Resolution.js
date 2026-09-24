/************************************************************
 * TM V3 — STAGE 5 TASK RESOLUTION
 *
 * Narrow contract:
 * - Consumes exact Step-4 records.
 * - Finds the current applicable Striven Task(s).
 * - No Task create / patch / assignment writes.
 * - No Calendar writes.
 * - No reconciliation plan yet.
 ************************************************************/

function tmv3_step5RefreshTaskSources_() {
  tmv3_assertShadow_();
  tmv3_resetRuntimeMetrics_();

  const orders = tmv3_rows_(TMV3.SHEETS.ORDERS);
  const orderIdByNumber = {};

  orders.forEach(function(order) {
    const id = tmv3_clean_(order['Order ID']);
    const number = tmv3_clean_(order['Order Number']);
    if (id && number) orderIdByNumber[number] = id;
  });

  const installTasks =
    tmv3_reportRows_(TMV3.PROPERTIES.INSTALL_TASKS)
      .map(function(r) {
        return tmv3_normalizeTask_(r, 'Install', orderIdByNumber);
      });

  const deliveryTasks =
    tmv3_reportRows_(TMV3.PROPERTIES.DELIVERY_TASKS)
      .map(function(r) {
        return tmv3_normalizeTask_(r, 'Delivery', orderIdByNumber);
      });

  const serviceTasks =
    tmv3_reportRows_(TMV3.PROPERTIES.SERVICE_TASKS)
      .map(function(r) {
        return tmv3_normalizeTask_(r, 'Service', orderIdByNumber);
      });

  const tasks = tmv3_dedupeObjects_(
    installTasks.concat(deliveryTasks, serviceTasks),
    function(r) { return r[0]; }
  );

  tmv3_replaceRows_(
    TMV3.SHEETS.TASKS,
    [
      'Task ID',
      'Task Number',
      'Task Type ID',
      'Task Type',
      'Status',
      'Name',
      'Customer ID',
      'Location ID',
      'Contact ID',
      'Order ID',
      'Start',
      'Due',
      'Assignees',
      'Pools',
      'URL',
      'Fingerprint'
    ],
    tasks
  );

  const result = {
    installTasks: installTasks.length,
    deliveryTasks: deliveryTasks.length,
    serviceTasks: serviceTasks.length,
    tasks: tasks.length,
    preInspectionTasks: 'ON_DEMAND_ONLY',
    api: tmv3_runtimeMetrics_()
  };

  tmv3_audit_(
    'SYSTEM','','','STEP5_REFRESH_TASK_SOURCES','PASS',
    JSON.stringify(result)
  );

  return result;
}

function tmv3_step5TaskIndex_() {
  const tasks = tmv3_rows_(TMV3.SHEETS.TASKS);

  const refs = {
    tasks: tasks,
    taskById: {},
    tasksByOrder: {},
    tasksByCustomer: {}
  };

  tasks.forEach(function(task) {
    const taskId = tmv3_clean_(task['Task ID']);
    const orderId = tmv3_clean_(task['Order ID']);
    const customerId = tmv3_clean_(task['Customer ID']);

    if (taskId) refs.taskById[taskId] = task;

    if (orderId) {
      if (!refs.tasksByOrder[orderId]) refs.tasksByOrder[orderId] = [];
      refs.tasksByOrder[orderId].push(task);
    }

    if (customerId) {
      if (!refs.tasksByCustomer[customerId]) refs.tasksByCustomer[customerId] = [];
      refs.tasksByCustomer[customerId].push(task);
    }
  });

  return refs;
}

function tmv3_step5TaskRecords_(step4Records, refs) {
  const records = (step4Records || []).map(function(record) {
    const step4 = record.step4 || {};

    if (step4.disposition !== 'VERIFIED') {
      return Object.assign({}, record, {
        step5: {
          disposition: 'NOT_RUN',
          code: 'STEP4_' + (step4.disposition || 'UNKNOWN'),
          reason: 'Task resolution did not run because Step 4 is not VERIFIED.',
          tasks: [],
          completedHistory: 0,
          historyTasks: [],
          warnings: []
        }
      });
    }

    const decision =
      record.vertical === 'PreInspection'
        ? tmv3_step5ResolvePreInspection_(record)
        : tmv3_step5ResolveStandardTask_(record, refs);

    return Object.assign({}, record, { step5: decision });
  });

  tmv3_step5NormalizePreInspectionTaskTimesAcrossRecords_(records);
  tmv3_step5GuardTaskLinkedAcrossEventDates_(records);

  return records;
}

function tmv3_step5ResolvePreInspection_(record) {
  const identity = record.step4 || {};
  const customer = identity.customer;
  const location = identity.location;

  try {
    const decision = tmv3_preInspectionTaskDecision_(
      record,
      customer,
      location
    );

    if (decision.status === 'MATCHED' && decision.task) {
      return tmv3_step5Decision_(
        'MATCHED',
        'PREINSPECTION_TASK_MATCHED',
        decision.reason,
        [decision.task],
        (decision.historyTasks || []).length,
        decision.evidence || [],
        [],
        decision.historyTasks || []
      );
    }

    if (decision.status === 'CLEAR') {
      return tmv3_step5Decision_(
        'NO_TASK',
        'PREINSPECTION_NO_OPEN_TASK',
        decision.reason,
        [],
        (decision.historyTasks || []).length,
        [],
        [],
        decision.historyTasks || []
      );
    }

    return tmv3_step5Decision_(
      'REVIEW',
      decision.errorCode || 'PREINSPECTION_TASK_REVIEW',
      decision.reason || 'PreInspection Task candidates require review.',
      [],
      0,
      decision.evidence || []
    );
  } catch (err) {
    return tmv3_step5Decision_(
      'REVIEW',
      'PREINSPECTION_TASK_LOOKUP_ERROR',
      String(err && err.message || err),
      [],
      0,
      []
    );
  }
}

function tmv3_step5ResolveStandardTask_(record, refs) {
  const cfg = TMV3.VERTICALS[record.vertical];
  const identity = record.step4 || {};
  const anchor = record.step3 && record.step3.anchor
    ? record.step3.anchor
    : {};

  const customer = identity.customer || null;
  const location = identity.location || null;

  const customerId = tmv3_clean_(customer && customer['Customer ID']);
  const locationId = tmv3_clean_(location && location['Location ID']);
  const orderId = tmv3_clean_(anchor.orderId);

  let candidates = [];
  const evidence = [];
  const warnings = [];

  if (record.existingTaskId) {
    const linkedId = tmv3_clean_(record.existingTaskId);
    let linked = refs.taskById[linkedId] || null;

    if (!linked) {
      try {
        linked = tmv3_getTaskById_(linkedId);
        if (linked) evidence.push('CALENDAR_TASK_LINK_LIVE_READ');
      } catch (err) {
        return tmv3_step5Decision_(
          'REVIEW',
          'CALENDAR_LINKED_TASK_READ_FAILED',
          'Calendar carries Task ' + linkedId + ', but the Task could not be read.',
          [],
          0,
          [],
          [String(err && err.message || err)]
        );
      }
    } else {
      evidence.push('CALENDAR_TASK_LINK_CACHE_EXACT');
    }

    if (
      linked &&
      !tmv3_taskFitsVertical_(linked, record.vertical, cfg)
    ) {
      return tmv3_step5Decision_(
        'REVIEW',
        'CALENDAR_LINKED_TASK_WRONG_TYPE',
        'Calendar Task link resolves to a Task that does not fit the ' +
          record.vertical + ' vertical.',
        [linked],
        0,
        evidence
      );
    }

    candidates = linked ? [linked] : [];

  } else if (orderId) {
    candidates = (refs.tasksByOrder[orderId] || [])
      .filter(function(task) {
        return tmv3_taskFitsVertical_(task, record.vertical, cfg);
      });

    evidence.push('TASKS_FROM_VERIFIED_BUSINESS_ANCHOR');

  } else if (customerId && locationId) {
    candidates = (refs.tasksByCustomer[customerId] || [])
      .filter(function(task) {
        return (
          tmv3_taskFitsVertical_(task, record.vertical, cfg) &&
          tmv3_clean_(task['Location ID']) === locationId
        );
      });

    evidence.push('TASKS_FROM_VERIFIED_CUSTOMER_LOCATION');
  }

  const open = candidates.filter(function(task) {
    return tmv3_taskIsOpen_(task['Status']);
  });

  const completed = candidates.filter(function(task) {
    return tmv3_taskIsCompleted_(task['Status']);
  });

  const nonOpenActive = candidates.filter(function(task) {
    return (
      !tmv3_taskIsOpen_(task['Status']) &&
      !tmv3_taskIsCompleted_(task['Status'])
    );
  });

  if (open.length === 0 && nonOpenActive.length) {
    return tmv3_step5Decision_(
      'REVIEW',
      'NON_OPEN_ACTIVE_TASK_EXISTS',
      'Applicable Task exists in a non-open active status and must not be duplicated.',
      nonOpenActive,
      completed.length,
      evidence,
      [],
      completed
    );
  }

  if (open.length === 0) {
    return tmv3_step5Decision_(
      'NO_TASK',
      completed.length
        ? 'NO_OPEN_TASK_COMPLETED_HISTORY'
        : 'NO_TASK_FOUND',
      completed.length
        ? 'No applicable OPEN Task remains; completed history exists.'
        : 'No applicable Task was found.',
      [],
      completed.length,
      evidence,
      [],
      completed
    );
  }

  if (open.length === 1) {
    return tmv3_step5Decision_(
      'MATCHED',
      'SINGLE_OPEN_TASK_MATCHED',
      'Exactly one applicable OPEN Task was found.',
      [open[0]],
      completed.length,
      evidence,
      [],
      completed
    );
  }

  if (record.vertical === 'Service') {
    const expanded = open.map(function(task) {
      return {
        task: task,
        fireplaceNumber: tmv3_extractServiceFireplaceNumber_(task['Name'])
      };
    });

    const everyNumbered = expanded.every(function(item) {
      return item.fireplaceNumber > 0;
    });

    const numbers = expanded.map(function(item) {
      return item.fireplaceNumber;
    });

    const uniqueNumbers = tmv3_unique_(numbers.map(String));

    if (
      everyNumbered &&
      uniqueNumbers.length === expanded.length
    ) {
      expanded.sort(function(a, b) {
        return a.fireplaceNumber - b.fireplaceNumber;
      });

      return tmv3_step5Decision_(
        'MATCHED_MULTI',
        'SERVICE_MULTI_FIREPLACE_TASKS_MATCHED',
        'Multiple OPEN Service Tasks are valid because each has a unique fireplace marker.',
        expanded.map(function(item) { return item.task; }),
        completed.length,
        evidence.concat(
          expanded.map(function(item) {
            return 'FP#' + item.fireplaceNumber;
          })
        ),
        [],
        completed
      );
    }
  }

  return tmv3_step5Decision_(
    'REVIEW',
    'MULTIPLE_OPEN_TASKS',
    'Multiple applicable OPEN Tasks were found.',
    open,
    completed.length,
    evidence,
    warnings,
    completed
  );
}

function tmv3_step5Decision_(
  disposition,
  code,
  reason,
  tasks,
  completedHistory,
  evidence,
  warnings,
  historyTasks
) {
  return {
    disposition: disposition,
    code: code,
    reason: reason,
    tasks: tasks || [],
    completedHistory: Number(completedHistory || 0),
    historyTasks: historyTasks || [],
    evidence: evidence || [],
    warnings: warnings || []
  };
}

function tmv3_step5TaskResolutionRun(reason, refreshSources) {
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

  const refs = tmv3_step5TaskIndex_();
  const records = tmv3_step5TaskRecords_(step4Records, refs);

  const counts = tmv3_step5Counts_(records);
  const write = tmv3_step5WriteOperatorViews_(records);
  const verify = tmv3_step5Verify_(records, step4Records);

  const result = {
    version: TMV3.VERSION,
    executionStage: tmv3_executionStage_(),
    stage: 5,
    status: verify.pass ? 'PASS' : 'REVIEW',
    mode: 'TASK_RESOLUTION_ONLY',
    reason: tmv3_clean_(reason || 'MANUAL'),
    sourceSummary: sourceSummary,
    counts: counts,
    write: write,
    verification: verify,
    taskWritesPerformed: false,
    calendarWritesPerformed: false,
    strivenWritesPerformed: false,
    reconciliationPerformed: false
  };

  tmv3_audit_(
    'SYSTEM','','','STEP5_TASK_RESOLUTION',
    result.status,
    JSON.stringify(result)
  );

  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

function tmv3_step5TaskResolutionRunCached(reason) {
  return tmv3_step5TaskResolutionRun(
    reason || 'CACHED_TASK_SOURCES',
    false
  );
}

function tmv3_step5Counts_(records) {
  const counts = {
    total:0,
    step4Verified:0,
    matched:0,
    matchedMulti:0,
    noTask:0,
    review:0,
    notRun:0,
    byVertical:{}
  };

  (records || []).forEach(function(record) {
    counts.total++;

    if (!counts.byVertical[record.vertical]) {
      counts.byVertical[record.vertical] = {
        total:0,
        step4Verified:0,
        matched:0,
        matchedMulti:0,
        noTask:0,
        review:0,
        notRun:0
      };
    }

    const bucket = counts.byVertical[record.vertical];
    bucket.total++;

    if (record.step4 && record.step4.disposition === 'VERIFIED') {
      counts.step4Verified++;
      bucket.step4Verified++;
    }

    const disposition = record.step5 ? record.step5.disposition : 'NOT_RUN';

    if (disposition === 'MATCHED') {
      counts.matched++;
      bucket.matched++;
    } else if (disposition === 'MATCHED_MULTI') {
      counts.matchedMulti++;
      bucket.matchedMulti++;
    } else if (disposition === 'NO_TASK') {
      counts.noTask++;
      bucket.noTask++;
    } else if (disposition === 'REVIEW') {
      counts.review++;
      bucket.review++;
    } else {
      counts.notRun++;
      bucket.notRun++;
    }
  });

  return counts;
}

function tmv3_step5WriteOperatorViews_(records) {
  const written = {};

  Object.keys(TMV3.VERTICALS).forEach(function(vertical) {
    const verticalRecords = (records || [])
      .filter(function(record) { return record.vertical === vertical; })
      .sort(function(a, b) {
        const aTime = a.start instanceof Date ? a.start.getTime() : 0;
        const bTime = b.start instanceof Date ? b.start.getTime() : 0;
        if (aTime !== bTime) return aTime - bTime;

        if (vertical === 'Service') {
          const techCompare = tmv3_clean_(a.technician)
            .localeCompare(tmv3_clean_(b.technician));
          if (techCompare !== 0) return techCompare;
        }

        return tmv3_clean_(a.title).localeCompare(tmv3_clean_(b.title));
      });

    const rows = verticalRecords.map(tmv3_step5OperatorRow_);
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

function tmv3_step5OperatorRow_(record) {
  const row = tmv3_step4OperatorRow_(record);
  const step4 = record.step4 || {};
  const step5 = record.step5 || {};

  if (step4.disposition !== 'VERIFIED') {
    return row;
  }

  const disposition = step5.disposition || 'REVIEW';
  const tasks = step5.tasks || [];

  row[4] = tmv3_step5SyncChecklist_(record, tasks);
  row[6] = tmv3_step5TaskColumnSummary_(record, tasks, disposition);
  row[7] = tmv3_step5TaskScheduleSummary_(tasks);
  row[8] = tmv3_step5TaskStatusSummary_(tasks, disposition);
  row[9] = 'STEP 5 — ' + disposition;

  const details = [];

  if (disposition === 'REVIEW') {
    details.push(step5.reason || 'Task candidates require review.');
  } else if (disposition === 'NO_TASK' && step5.completedHistory) {
    details.push('No OPEN Task; completed history exists.');
  } else if (disposition === 'NO_TASK') {
    details.push('No applicable Task found.');
  }

  (step5.warnings || []).forEach(function(warning) {
    details.push(warning);
  });

  row[10] = details.join('\n');

  return row;
}

function tmv3_step5SyncChecklist_(record, tasks) {
  const step4 = record.step4 || {};
  const customer = step4.customer || null;
  const location = step4.location || null;
  const matched = (tasks || []).length > 0;

  let customerSync = '⏳';
  let locationSync = '⏳';
  let timeSync = '⏳';
  let assigneeSync = '⏳';
  let taskLinkSync = '⏳';

  if (matched) {
    customerSync = tasks.every(function(task) {
      const taskCustomer = tmv3_clean_(task['Customer ID']);
      return (
        !taskCustomer ||
        taskCustomer === tmv3_clean_(customer && customer['Customer ID'])
      );
    }) ? '✅' : '⚠';

    locationSync = tasks.every(function(task) {
      const taskLocation = tmv3_clean_(task['Location ID']);
      return (
        !taskLocation ||
        taskLocation === tmv3_clean_(location && location['Location ID'])
      );
    }) ? '✅' : '⚠';

    timeSync = tasks.every(function(task) {
      return (
        tmv3_sameMinute_(record.start, task['Start']) &&
        tmv3_sameMinute_(record.end, task['Due'])
      );
    }) ? '✅' : '⚠';

    if (record.vertical === 'Service' && record.technician) {
      assigneeSync = tasks.every(function(task) {
        return tmv3_norm_(task['Assignees']).indexOf(
          tmv3_norm_(record.technician)
        ) !== -1;
      }) ? '✅' : '⚠';
    }

    const linkedId = tmv3_clean_(record.existingTaskId);
    if (tasks.length === 1) {
      taskLinkSync =
        linkedId &&
        linkedId === tmv3_clean_(tasks[0]['Task ID'])
          ? '✅'
          : '⚠';
    }
  }

  return [
    'Customer ' + customerSync,
    'Location ' + locationSync,
    'Date / Time ' + timeSync,
    'Assignee ' + assigneeSync,
    'Notes ⏳',
    'Task Link ' + taskLinkSync
  ].join('\n');
}

function tmv3_step5TaskSummary_(tasks, disposition) {
  if (!tasks || !tasks.length) {
    return disposition === 'NO_TASK'
      ? 'No OPEN Task'
      : 'Task not resolved';
  }

  return tasks.map(function(task) {
    const id = tmv3_clean_(task['Task ID']);
    const name = tmv3_clean_(task['Name']);
    return 'Task #' + id + (name ? ' · ' + name : '');
  }).join('\n');
}

function tmv3_step5NormalizePreInspectionTaskTimesAcrossRecords_(records) {
  const corrections = {};

  (records || []).forEach(function(record) {
    if (record.vertical !== 'PreInspection') return;

    const tasks =
      record.step5 && Array.isArray(record.step5.tasks)
        ? record.step5.tasks
        : [];

    tasks.forEach(function(task) {
      const taskId = tmv3_clean_(task && task['Task ID']);
      if (!taskId) return;

      if (!corrections[taskId]) {
        corrections[taskId] = {
          Start:null,
          Due:null,
          conflictStart:false,
          conflictDue:false
        };
      }

      [
        ['Start', record.start],
        ['Due', record.end]
      ].forEach(function(pair) {
        const field = pair[0];
        const calendarValue = pair[1];
        const taskValue = tmv3_clean_(task && task[field]);
        if (!taskValue || !calendarValue) return;

        const taskDate = tmv3_parseDateTime_(taskValue);
        const calendarDate = tmv3_parseDateTime_(calendarValue);
        if (!taskDate || !calendarDate) return;

        if (
          tmv3_step6LocalDay_(taskDate) !==
          tmv3_step6LocalDay_(calendarDate)
        ) {
          return;
        }

        const diff = Math.abs(
          taskDate.getTime() - calendarDate.getTime()
        );

        if (diff !== 12 * 60 * 60 * 1000) return;

        const corrected = Utilities.formatDate(
          calendarDate,
          TMV3_TIMEZONE,
          "yyyy-MM-dd'T'HH:mm:ssXXX"
        );

        if (
          corrections[taskId][field] &&
          corrections[taskId][field] !== corrected
        ) {
          corrections[taskId]['conflict' + field] = true;
          return;
        }

        corrections[taskId][field] = corrected;
      });
    });
  });

  (records || []).forEach(function(record) {
    if (record.vertical !== 'PreInspection' || !record.step5) return;

    ['tasks','historyTasks'].forEach(function(listName) {
      const list = Array.isArray(record.step5[listName])
        ? record.step5[listName]
        : [];

      record.step5[listName] = list.map(function(task) {
        const out = Object.assign({}, task || {});
        const taskId = tmv3_clean_(out['Task ID']);
        const fix = corrections[taskId];
        if (!fix) return out;

        if (fix.Start && !fix.conflictStart) out.Start = fix.Start;
        if (fix.Due && !fix.conflictDue) out.Due = fix.Due;

        return out;
      });
    });
  });

  return records;
}

function tmv3_step5GuardTaskLinkedAcrossEventDates_(records) {
  const usage = {};

  (records || []).forEach(function(record) {
    if (
      record.vertical !== 'PreInspection' ||
      !record.step5 ||
      record.step5.disposition !== 'MATCHED'
    ) {
      return;
    }

    (record.step5.tasks || []).forEach(function(task) {
      const taskId = tmv3_clean_(task && task['Task ID']);
      if (!taskId) return;

      if (!usage[taskId]) usage[taskId] = [];
      usage[taskId].push({
        record:record,
        eventDay:tmv3_step6LocalDay_(record.start)
      });
    });
  });

  Object.keys(usage).forEach(function(taskId) {
    const entries = usage[taskId];
    const days = tmv3_unique_(
      entries.map(function(entry) {
        return entry.eventDay;
      }).filter(Boolean)
    );

    if (days.length <= 1) return;

    entries.forEach(function(entry) {
      const prior = entry.record.step5 || {};
      entry.record.step5 = Object.assign({}, prior, {
        disposition:'REVIEW',
        code:'TASK_LINKED_TO_MULTIPLE_EVENT_DATES',
        reason:
          'Task #' + taskId +
          ' is linked to multiple PreInspection event dates (' +
          days.join(', ') +
          '). Do not reconcile either appointment automatically.'
      });
    });
  });

  return records;
}

function tmv3_step5AlignPreInspectionTaskClock_(task, record) {
  const out = Object.assign({}, task || {});

  [
    ['Start', record && record.start],
    ['Due', record && record.end]
  ].forEach(function(pair) {
    const field = pair[0];
    const calendarValue = pair[1];
    const taskValue = tmv3_clean_(out[field]);

    if (!taskValue || !calendarValue) return;

    const taskDate = tmv3_parseDateTime_(taskValue);
    const calendarDate = tmv3_parseDateTime_(calendarValue);

    if (!taskDate || !calendarDate) {
      return;
    }

    if (
      tmv3_step6LocalDay_(taskDate) !==
      tmv3_step6LocalDay_(calendarDate)
    ) {
      return;
    }

    const diff = Math.abs(
      taskDate.getTime() - calendarDate.getTime()
    );

    // Striven V2 occasionally serializes afternoon 1–11 PM as 1–11 AM.
    // Correct only the exact 12-hour case corroborated by this Calendar event.
    if (diff === 12 * 60 * 60 * 1000) {
      out[field] = Utilities.formatDate(
        calendarDate,
        TMV3_TIMEZONE,
        "yyyy-MM-dd'T'HH:mm:ssXXX"
      );
    }
  });

  return out;
}

function tmv3_step5TaskColumnSummary_(record, tasks, disposition) {
  const identity = tmv3_step4TaskColumnIdentity_(
    record,
    record.step4 || {}
  );

  const task = tmv3_step5TaskCombinedSummary_(tasks, disposition);

  return [identity, task]
    .filter(Boolean)
    .join('\n\n');
}

function tmv3_step5TaskCombinedSummary_(tasks, disposition) {
  if (!tasks || !tasks.length) {
    return disposition === 'NO_TASK'
      ? 'No OPEN Task'
      : 'Task not resolved';
  }

  return tasks.map(function(task) {
    const id = tmv3_clean_(task['Task ID']);
    const name = tmv3_step5DisplayTaskName_(task['Name']);
    const detail = 'Task #' + id + (name ? ' · ' + name : '');
    const schedule = tmv3_step5TaskScheduleOne_(task);
    const status = tmv3_step5DisplayStatus_(task['Status']);

    return [detail, schedule, status]
      .filter(Boolean)
      .join('\n\n');
  }).join('\n\n');
}

function tmv3_step5DisplayTaskName_(value) {
  return tmv3_clean_(value)
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&nbsp;/gi, ' ');
}

function tmv3_step5TaskScheduleSummary_(tasks) {
  if (!tasks || !tasks.length) return '';

  return tasks.map(function(task) {
    return tmv3_step5TaskScheduleOne_(task);
  }).filter(Boolean).join('\n');
}

function tmv3_step5TaskScheduleOne_(task) {
  const startRaw = tmv3_clean_(task && task['Start']);
  const dueRaw = tmv3_clean_(task && task['Due']);
  if (!startRaw && !dueRaw) return '';

  const start = startRaw ? tmv3_parseDateTime_(startRaw) : null;
  const due = dueRaw ? tmv3_parseDateTime_(dueRaw) : null;

  const startOk = !!start;
  const dueOk = !!due;

  if (!startOk && !dueOk) return [startRaw, dueRaw].filter(Boolean).join(' - ');

  if (startOk && dueOk) {
    const startDay = Utilities.formatDate(start, TMV3_TIMEZONE, 'yyyy-MM-dd');
    const dueDay = Utilities.formatDate(due, TMV3_TIMEZONE, 'yyyy-MM-dd');

    if (startDay === dueDay) {
      return (
        Utilities.formatDate(start, TMV3_TIMEZONE, 'MMM d, yyyy') +
        ' (' +
        Utilities.formatDate(start, TMV3_TIMEZONE, 'h:mm a') +
        ' - ' +
        Utilities.formatDate(due, TMV3_TIMEZONE, 'h:mm a') +
        ')'
      );
    }

    return (
      Utilities.formatDate(start, TMV3_TIMEZONE, 'MMM d, yyyy h:mm a') +
      ' - ' +
      Utilities.formatDate(due, TMV3_TIMEZONE, 'MMM d, yyyy h:mm a')
    );
  }

  const only = startOk ? start : due;
  return Utilities.formatDate(only, TMV3_TIMEZONE, 'MMM d, yyyy h:mm a');
}

function tmv3_step5DisplayStatus_(status) {
  const clean = tmv3_norm_(status);

  if (['open','in progress','inprogress'].indexOf(clean) !== -1) {
    return 'Open';
  }

  if (['done','complete','completed','closed'].indexOf(clean) !== -1) {
    return 'Done';
  }

  if (['on hold','onhold'].indexOf(clean) !== -1) {
    return 'On Hold';
  }

  if (['cancelled','canceled'].indexOf(clean) !== -1) {
    return 'Cancelled';
  }

  return tmv3_clean_(status);
}

function tmv3_step5TaskStatusSummary_(tasks, disposition) {
  if (!tasks || !tasks.length) {
    return disposition === 'NO_TASK' ? 'NO OPEN TASK' : '';
  }

  return tmv3_unique_(
    tasks.map(function(task) {
      return tmv3_step5DisplayStatus_(task['Status']);
    }).filter(Boolean)
  ).join(', ');
}

function tmv3_step5Verify_(records, step4Records) {
  const priorKeys = {};
  const currentKeys = {};
  let missingDecision = 0;
  let verifiedWithoutDecision = 0;
  let nonVerifiedAdvanced = 0;

  (step4Records || []).forEach(function(record) {
    priorKeys[record.logicalKey] = true;
  });

  (records || []).forEach(function(record) {
    currentKeys[record.logicalKey] = true;

    const s4 = record.step4 ? record.step4.disposition : '';
    const s5 = record.step5 ? record.step5.disposition : '';

    if (!s5) missingDecision++;

    if (
      s4 === 'VERIFIED' &&
      ['MATCHED','MATCHED_MULTI','NO_TASK','REVIEW'].indexOf(s5) === -1
    ) {
      verifiedWithoutDecision++;
    }

    if (s4 !== 'VERIFIED' && s5 !== 'NOT_RUN') {
      nonVerifiedAdvanced++;
    }
  });

  const missing = Object.keys(priorKeys).filter(function(key) {
    return !currentKeys[key];
  });

  const introduced = Object.keys(currentKeys).filter(function(key) {
    return !priorKeys[key];
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
      verifiedWithoutDecision === 0 &&
      nonVerifiedAdvanced === 0 &&
      missing.length === 0 &&
      introduced.length === 0 &&
      rowCountsMatch,
    step4Records: (step4Records || []).length,
    step5Records: (records || []).length,
    missingDecision: missingDecision,
    verifiedWithoutDecision: verifiedWithoutDecision,
    nonVerifiedAdvanced: nonVerifiedAdvanced,
    missingFromStep5: missing.length,
    introducedByStep5: introduced.length,
    expectedRows: expectedRows,
    actualRows: actualRows
  };
}

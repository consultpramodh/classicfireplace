function tmv3_shadowRun() {
  tmv3_assertShadow_();

  const sourceSummary =
    tmv3_refreshSources();

  return tmv3_shadowMapFromCache_(
    sourceSummary
  );
}

function tmv3_shadowMapFromCache() {
  tmv3_assertShadow_();

  return tmv3_shadowMapFromCache_(
    tmv3_sourceCacheSummary_()
  );
}

function tmv3_sourceCacheSummary_() {
  return {
    customers: tmv3_rows_(TMV3.SHEETS.CUSTOMERS).length,
    locations: tmv3_rows_(TMV3.SHEETS.LOCATIONS).length,
    contacts: tmv3_rows_(TMV3.SHEETS.CONTACTS).length,
    orders: tmv3_rows_(TMV3.SHEETS.ORDERS).length,
    tasks: tmv3_rows_(TMV3.SHEETS.TASKS).length,
    source: 'CACHED'
  };
}

function tmv3_shadowMapFromCache_(sourceSummary) {
  tmv3_resetRuntimeMetrics_();

  if (
    typeof tmv3_executionStage_ === 'function' &&
    tmv3_executionStage_() < 6
  ) {
    throw new Error(
      'Execution stage ' + tmv3_executionStage_() +
      ' blocks Striven/customer/task mapping. Run the current Calendar stage instead.'
    );
  }

  const events =
    typeof tmv3_step2EligibleCalendarRecords_ === 'function'
      ? tmv3_step2EligibleCalendarRecords_()
      : tmv3_calendarRecords_();

  const refs =
    tmv3_referenceIndex_();

  const state =
    tmv3_eventStateIndex_();

  const resolved = [];

  events.forEach(function(e) {
    const records = tmv3_resolveEventRecords_(e, refs, state);
    Array.prototype.push.apply(resolved, records);
  });

  tmv3_writeOperatorViews_(
    resolved
  );

  tmv3_upsertState_(
    resolved
  );

  tmv3_updateOverview_(
    resolved
  );

  const regression =
    tmv3_updateRegression_(
      resolved
    );

  tmv3_audit_(
    'SYSTEM',
    '',
    '',
    'SHADOW_RUN',
    'PASS',
    'Events ' +
      resolved.length +
      '; Sources ' +
      JSON.stringify(sourceSummary || {}) +
      '; API ' +
      JSON.stringify(tmv3_runtimeMetrics_())
  );

  const morningOps =
    tmv3_refreshMorningOps();

  return {
    version:
      TMV3.VERSION,
    mode:
      TMV3.MODE,
    sources:
      sourceSummary,
    events:
      resolved.length,
    counts:
      tmv3_statusCounts_(
        resolved
      ),
    regression:
      regression,
    morningOps:
      morningOps
  };
}

function tmv3_referenceIndex_() {
  const customers =
    tmv3_rows_(
      TMV3.SHEETS.CUSTOMERS
    );

  const locations =
    tmv3_rows_(
      TMV3.SHEETS.LOCATIONS
    );

  const contacts =
    tmv3_rows_(
      TMV3.SHEETS.CONTACTS
    );

  const orders =
    tmv3_rows_(
      TMV3.SHEETS.ORDERS
    );

  const tasks =
    tmv3_rows_(
      TMV3.SHEETS.TASKS
    );

  const index = {
    customers: customers,
    locations: locations,
    contacts: contacts,
    orders: orders,
    tasks: tasks,
    customerById: {},
    customerByNumber: {},
    customerByPhone: {},
    locationsByCustomer: {},
    orderById: {},
    ordersByNumber: {},
    taskById: {},
    tasksByOrder: {},
    tasksByCustomer: {}
  };

  customers.forEach(
    function(r) {
      const id =
        tmv3_clean_(
          r['Customer ID']
        );

      const no =
        tmv3_clean_(
          r['Customer Number']
        );

      const phone =
        tmv3_phone10_(
          r['Primary Phone']
        );

      if (id) {
        index.customerById[id] =
          r;
      }

      if (no) {
        index.customerByNumber[no] =
          r;
      }

      if (phone) {
        if (
          !index
            .customerByPhone[
              phone
            ]
        ) {
          index
            .customerByPhone[
              phone
            ] = [];
        }

        index
          .customerByPhone[
            phone
          ]
          .push(r);
      }
    }
  );

  locations.forEach(
    function(r) {
      const id =
        tmv3_clean_(
          r['Customer ID']
        );

      if (id) {
        if (
          !index
            .locationsByCustomer[
              id
            ]
        ) {
          index
            .locationsByCustomer[
              id
            ] = [];
        }

        index
          .locationsByCustomer[
            id
          ]
          .push(r);
      }
    }
  );

  orders.forEach(
    function(r) {
      const id =
        tmv3_clean_(
          r['Order ID']
        );

      const no =
        tmv3_clean_(
          r['Order Number']
        );

      if (id) {
        index.orderById[id] =
          r;
      }

      if (no) {
        if (
          !index
            .ordersByNumber[
              no
            ]
        ) {
          index
            .ordersByNumber[
              no
            ] = [];
        }

        index
          .ordersByNumber[
            no
          ]
          .push(r);
      }
    }
  );

  tasks.forEach(
    function(r) {
      const id =
        tmv3_clean_(
          r['Task ID']
        );

      const orderId =
        tmv3_clean_(
          r['Order ID']
        );

      const customerId =
        tmv3_clean_(
          r['Customer ID']
        );

      if (id) {
        index.taskById[id] =
          r;
      }

      if (orderId) {
        if (
          !index
            .tasksByOrder[
              orderId
            ]
        ) {
          index
            .tasksByOrder[
              orderId
            ] = [];
        }

        index
          .tasksByOrder[
            orderId
          ]
          .push(r);
      }

      if (customerId) {
        if (
          !index
            .tasksByCustomer[
              customerId
            ]
        ) {
          index
            .tasksByCustomer[
              customerId
            ] = [];
        }

        index
          .tasksByCustomer[
            customerId
          ]
          .push(r);
      }
    }
  );

  return index;
}

function tmv3_resolveEvent_(
  e,
  refs,
  stateIndex
) {
  const cfg =
    TMV3.VERTICALS[
      e.vertical
    ];

  const key =
    e.vertical +
    '|' +
    e.eventId;

  const prior =
    stateIndex[key] ||
    {};

  const override =
    tmv3_clean_(
      prior[
        'Classification Override'
      ]
    );

  if (
    e.vertical ===
      'PreInspection' &&
    tmv3_norm_(override) ===
      'not preinspect'
  ) {
    return tmv3_result_(
      e,
      {
        status:
          'IGNORED',
        nextAction:
          'NONE',
        issue:
          'Manual override: NOT Preinspect'
      }
    );
  }

  let order = null;
  let evidence = [];

  if (cfg.orderRequired) {
    const orderCandidates =
      e.existingOrderId && refs.orderById[e.existingOrderId]
        ? [refs.orderById[e.existingOrderId]]
        : (
            e.orderNumber
              ? (refs.ordersByNumber[e.orderNumber] || [])
              : []
          );

    if (orderCandidates.length > 1) {
      return tmv3_result_(
        e,
        {
          status: 'REVIEW',
          nextAction: 'RESOLVE ' + cfg.orderLabel.toUpperCase(),
          issue: 'Multiple matching ' + cfg.orderLabel + ' records.',
          errorCode: 'AMBIGUOUS_ORDER'
        }
      );
    }

    if (orderCandidates.length === 0) {
      return tmv3_result_(
        e,
        {
          status: 'BLOCKED',
          nextAction: 'ADD / VERIFY ' + cfg.orderLabel.toUpperCase(),
          issue: cfg.orderLabel + ' is required and was not resolved.',
          errorCode: 'ORDER_REQUIRED'
        }
      );
    }

    order = orderCandidates[0];
    evidence.push(cfg.orderLabel + ' exact');
  }

  const identity = tmv3_resolveIdentity_(
    e,
    cfg,
    refs,
    order
  );

  if (identity.status !== 'MATCHED') {
    return tmv3_result_(
      e,
      {
        status: identity.status || 'REVIEW',
        nextAction:
          identity.errorCode === 'LOCATION_UNRESOLVED'
            ? (
                e.vertical === 'PreInspection'
                  ? 'VERIFY / CREATE LOCATION'
                  : 'RESOLVE LOCATION'
              )
            : 'RESOLVE IDENTITY',
        issue: identity.reason || 'Identity requires review.',
        customer: identity.customer || null,
        location: identity.location || null,
        order: order,
        evidence: evidence.concat(identity.evidence || []),
        errorCode: identity.errorCode || 'IDENTITY_REVIEW'
      }
    );
  }

  const customer = identity.customer;
  const location = identity.location;
  const contact = identity.contact || null;
  const customerId = tmv3_clean_(customer['Customer ID']);
  const contactId = contact
    ? tmv3_clean_(contact['Contact ID'])
    : (
        order
          ? tmv3_clean_(order['Contact ID'])
          : ''
      );

  Array.prototype.push.apply(evidence, identity.evidence || []);

  let taskCandidates =
    [];

  if (
    e.forcedTaskId &&
    refs.taskById[String(e.forcedTaskId)]
  ) {
    taskCandidates = [refs.taskById[String(e.forcedTaskId)]];
    if (e.forcedMatchEvidence) evidence.push(e.forcedMatchEvidence);

  } else if (e.vertical === 'PreInspection') {
    let piDecision;

    try {
      piDecision = tmv3_preInspectionTaskDecision_(
        e,
        customer,
        location
      );
    } catch (err) {
      return tmv3_result_(
        e,
        {
          status: 'REVIEW',
          nextAction: 'REVIEW TASK LOOKUP',
          issue: String(err && err.message || err),
          customer: customer,
          location: location,
          evidence: evidence,
          errorCode: 'PREINSPECTION_TASK_LOOKUP_ERROR'
        }
      );
    }

    if (piDecision.status === 'REVIEW') {
      return tmv3_result_(
        e,
        {
          status: 'REVIEW',
          nextAction: 'REVIEW TASK CANDIDATES',
          issue: piDecision.reason,
          customer: customer,
          location: location,
          evidence: evidence.concat(piDecision.evidence || []),
          errorCode: piDecision.errorCode || 'PREINSPECTION_TASK_REVIEW'
        }
      );
    }

    taskCandidates = piDecision.task ? [piDecision.task] : [];

    if (piDecision.task) {
      evidence.push(piDecision.reason || 'PreInspection task verified');
    }

  } else if (
    e.existingTaskId &&
    refs
      .taskById[
        e.existingTaskId
      ]
  ) {
    taskCandidates =
      [
        refs
          .taskById[
            e.existingTaskId
          ]
      ];

  } else if (
    order &&
    tmv3_clean_(
      order[
        'Order ID'
      ]
    )
  ) {
    taskCandidates =
      (
        refs
          .tasksByOrder[
            tmv3_clean_(
              order[
                'Order ID'
              ]
            )
          ] ||
        []
      )
        .filter(
          function(t) {
            return tmv3_taskFitsVertical_(
              t,
              e.vertical,
              cfg
            );
          }
        );

  } else {
    taskCandidates =
      (
        refs
          .tasksByCustomer[
            customerId
          ] ||
        []
      )
        .filter(
          function(t) {
            return (
              tmv3_taskFitsVertical_(
                t,
                e.vertical,
                cfg
              ) &&
              tmv3_clean_(
                t[
                  'Location ID'
                ]
              ) ===
              tmv3_clean_(
                location[
                  'Location ID'
                ]
              )
            );
          }
        );
  }

  const open =
    taskCandidates
      .filter(
        function(t) {
          return tmv3_taskIsOpen_(
            t[
              'Status'
            ]
          );
        }
      );

  const completed =
    taskCandidates
      .filter(
        function(t) {
          return tmv3_taskIsCompleted_(
            t[
              'Status'
            ]
          );
        }
      );

  if (
    open.length >
    1
  ) {
    return tmv3_result_(
      e,
      {
        status:
          'REVIEW',
        nextAction:
          'SELECT TASK',
        issue:
          'Multiple applicable OPEN tasks found.',
        customer:
          customer,
        location:
          location,
        order:
          order,
        contact:
          contact,
        evidence:
          evidence,
        errorCode:
          'MULTIPLE_OPEN_TASKS'
      }
    );
  }

  if (
    open.length ===
    0
  ) {
    const safeCreate =
      !!customerId &&
      !!tmv3_clean_(
        location[
          'Location ID'
        ]
      ) &&
      (
        !cfg.orderRequired ||
        !!order
      );

    return tmv3_result_(
      e,
      {
        status:
          safeCreate
            ? (
                completed.length
                  ? 'READY RECREATE'
                  : 'READY CREATE'
              )
            : 'BLOCKED',
        nextAction:
          safeCreate
            ? (
                completed.length
                  ? 'RECREATE TASK'
                  : 'CREATE TASK'
              )
            : 'RESOLVE REQUIRED DATA',
        issue:
          completed.length
            ? 'No applicable OPEN task; completed history exists.'
            : 'No applicable task found.',
        customer:
          customer,
        location:
          location,
        order:
          order,
        contact:
          contact,
        evidence:
          evidence,
        errorCode:
          ''
      }
    );
  }

  const task =
    open[0];

  evidence.push(
    'Single OPEN task'
  );

  const differences =
    tmv3_taskDifferences_(
      e,
      cfg,
      task,
      order,
      customer,
      location
    );

  const links =
    tmv3_calendarLinkAcceptance_(
      e,
      cfg,
      task,
      order,
      customer
    );

  const allGood =
    differences.length ===
      0 &&
    links.ok;

  const verification =
    tmv3_verificationSummary_(
      e,
      cfg,
      task,
      order,
      customer,
      location,
      differences,
      links
    );

  return tmv3_result_(
    e,
    {
      status:
        allGood
          ? 'MATCHED'
          : 'READY',
      nextAction:
        allGood
          ? 'NONE'
          : 'SYNC + VERIFY',
      issue:
        allGood
          ? ''
          : differences
              .concat(
                links.issues
              )
              .join('; '),
      customer:
        customer,
      location:
        location,
      order:
        order,
      contact:
        contact,
      task:
        task,
      evidence:
        evidence,
      verification:
        verification,
      lastVerified:
        allGood
          ? tmv3_now_()
          : ''
    }
  );
}

function tmv3_taskFitsVertical_(
  task,
  vertical,
  cfg
) {
  const typeId =
    Number(
      tmv3_clean_(
        task[
          'Task Type ID'
        ]
      ) ||
      0
    );

  if (
    cfg.taskTypeId &&
    typeId ===
      Number(
        cfg.taskTypeId
      )
  ) {
    return true;
  }

  const hay =
    tmv3_norm_(
      task[
        'Task Type'
      ] +
      ' ' +
      task[
        'Name'
      ]
    );

  return (
    cfg.taskTypeNames ||
    []
  )
    .some(
      function(name) {
        return (
          hay.indexOf(
            tmv3_norm_(
              name
            )
          ) !== -1
        );
      }
    );
}

function tmv3_taskIsOpen_(
  status
) {
  return [
    'open',
    'in progress',
    'inprogress'
  ].indexOf(
    tmv3_norm_(
      status
    )
  ) !== -1;
}

function tmv3_taskIsCompleted_(
  status
) {
  return [
    'done',
    'complete',
    'completed',
    'closed',
    'cancelled',
    'canceled'
  ].indexOf(
    tmv3_norm_(
      status
    )
  ) !== -1;
}

function tmv3_taskDifferences_(
  e,
  cfg,
  task,
  order,
  customer,
  location
) {
  const issues =
    [];

  if (
    tmv3_clean_(
      task[
        'Customer ID'
      ]
    ) &&
    tmv3_clean_(
      task[
        'Customer ID'
      ]
    ) !==
      tmv3_clean_(
        customer[
          'Customer ID'
        ]
      )
  ) {
    issues.push(
      'Task customer differs'
    );
  }

  if (
    tmv3_clean_(
      task[
        'Location ID'
      ]
    ) &&
    tmv3_clean_(
      task[
        'Location ID'
      ]
    ) !==
      tmv3_clean_(
        location[
          'Location ID'
        ]
      )
  ) {
    issues.push(
      'Task location differs'
    );
  }

  if (
    cfg.orderRequired &&
    tmv3_clean_(
      task[
        'Order ID'
      ]
    ) &&
    tmv3_clean_(
      task[
        'Order ID'
      ]
    ) !==
      tmv3_clean_(
        order[
          'Order ID'
        ]
      )
  ) {
    issues.push(
      'Task ' +
      cfg.orderLabel +
      ' differs'
    );
  }

  if (
    e.vertical ===
      'PreInspection' &&
    tmv3_clean_(
      task[
        'Order ID'
      ]
    )
  ) {
    issues.push(
      'PreInspection task must not be attached to Sales Order'
    );
  }

  const taskStart =
    tmv3_clean_(
      task[
        'Start'
      ]
    );

  const taskDue =
    tmv3_clean_(
      task[
        'Due'
      ]
    );

  if (
    taskStart &&
    tmv3_norm_(
      taskStart
    ).indexOf(
      tmv3_date_(
        e.start
      )
    ) === -1
  ) {
    issues.push(
      'Start date/time differs'
    );
  }

  if (
    taskDue &&
    tmv3_norm_(
      taskDue
    ).indexOf(
      tmv3_date_(
        e.end
      )
    ) === -1
  ) {
    issues.push(
      'Due date/time differs'
    );
  }

  const assigned =
    tmv3_norm_(
      task[
        'Assignees'
      ]
    );

  if (
    e.vertical ===
      'Service' &&
    e.technician &&
    assigned.indexOf(
      tmv3_norm_(
        e.technician
      )
    ) === -1
  ) {
    issues.push(
      'Technician assignment differs'
    );
  }

  if (
    e.vertical ===
    'PreInspection'
  ) {
    const pools =
      tmv3_norm_(
        task[
          'Pools'
        ]
      );

    if (
      pools &&
      pools.indexOf(
        tmv3_norm_(
          cfg.defaultPoolName
        )
      ) === -1 &&
      pools.indexOf(
        String(
          cfg.defaultPoolId
        )
      ) === -1
    ) {
      issues.push(
        'Pre-Inspection Pool 8 missing'
      );
    }
  }

  return issues;
}

function tmv3_calendarLinkAcceptance_(
  e,
  cfg,
  task,
  order,
  customer
) {
  const issues =
    [];

  const taskId =
    tmv3_clean_(
      task[
        'Task ID'
      ]
    );

  if (
    cfg.calendarTaskLinkRequired &&
    tmv3_clean_(
      e.existingTaskId
    ) !==
      taskId
  ) {
    issues.push(
      'Calendar Task link missing/wrong'
    );
  }

  if (
    cfg.calendarOrderLinkRequired &&
    order &&
    tmv3_clean_(
      e.existingOrderId
    ) !==
      tmv3_clean_(
        order[
          'Order ID'
        ]
      )
  ) {
    issues.push(
      'Calendar ' +
      cfg.orderLabel +
      ' link missing/wrong'
    );
  }

  if (
    cfg.calendarOrdersPageLinkRequired
  ) {
    const expected =
      TMV3
        .CUSTOMER_ORDERS_PAGE_BASE +
      encodeURIComponent(
        tmv3_clean_(
          customer[
            'Customer ID'
          ]
        )
      );

    if (
      e.description.indexOf(
        expected
      ) === -1
    ) {
      issues.push(
        'Calendar Sales Orders page link missing'
      );
    }
  }

  return {
    ok:
      issues.length ===
      0,
    issues:
      issues
  };
}

function tmv3_result_(
  e,
  x
) {
  x = x || {};

  const customer = x.customer || null;
  const location = x.location || null;
  const order = x.order || null;
  const task = x.task || null;
  const contact = x.contact || null;
  const cfg = TMV3.VERTICALS[e.vertical];

  const result = {
    vertical: e.vertical,
    calendarId: e.calendarId,
    eventId: e.eventId,
    fingerprint: e.fingerprint,
    calendarUpdatedAt: e.calendarUpdatedAt,
    status: x.status || 'REVIEW',
    nextAction: x.nextAction || 'REVIEW',
    date: tmv3_date_(e.start),
    time: tmv3_time_(e.start),
    title: e.title,
    customer: customer ? tmv3_clean_(customer['Name']) : '',
    customerId: customer ? tmv3_clean_(customer['Customer ID']) : '',
    location: location
      ? [location['Address 1'], location['City']].map(tmv3_clean_).filter(Boolean).join(', ')
      : e.location,
    locationId: location ? tmv3_clean_(location['Location ID']) : '',
    contactId: contact
      ? tmv3_clean_(contact['Contact ID'])
      : (order ? tmv3_clean_(order['Contact ID']) : ''),
    order: order
      ? (
          tmv3_clean_(order['Order Number']) +
          (tmv3_clean_(order['Name']) ? ' - ' + tmv3_clean_(order['Name']) : '')
        )
      : '',
    orderId: order ? tmv3_clean_(order['Order ID']) : '',
    task: task
      ? (
          tmv3_clean_(task['Task Number']) +
          (tmv3_clean_(task['Name']) ? ' - ' + tmv3_clean_(task['Name']) : '')
        )
      : '',
    taskId: task ? tmv3_clean_(task['Task ID']) : '',
    taskStatus: task ? tmv3_clean_(task['Status']) : '',
    assignedTo: task ? tmv3_clean_(task['Assignees']) : (e.technician || ''),
    matchEvidence: (x.evidence || []).join(' + '),
    verification: x.verification || (
      x.status === 'MATCHED'
        ? 'CALENDAR ↔ STRIVEN PASS'
        : (
            x.status === 'READY CREATE' || x.status === 'READY RECREATE'
              ? 'IDENTITY VERIFIED · TASK ACTION PENDING'
              : 'NOT V3 VERIFIED'
          )
    ),
    issue: x.issue || '',
    calendarLinks: tmv3_calendarLinkSummary_(e),
    lastVerified: x.lastVerified || '',
    errorCode: x.errorCode || ''
  };

  result.dataChecklist = tmv3_buildDataChecklist_(
    e,
    cfg,
    customer,
    location,
    order,
    contact,
    task,
    result
  );

  return result;
}

function tmv3_buildDataChecklist_(eventRecord, cfg, customer, location, order, contact, task, result) {
  const lines = [];
  const issue = tmv3_clean_(result && result.issue);
  const verification = tmv3_clean_(result && result.verification);
  const hasTask = !!(task && tmv3_clean_(task['Task ID']));
  const hasContact = !!(
    (contact && tmv3_clean_(contact['Contact ID'])) ||
    (order && tmv3_clean_(order['Contact ID']))
  );

  lines.push(eventRecord && eventRecord.eventId ? '✅ Calendar' : '❌ Calendar');

  if (!hasTask) {
    lines.push('⚪ Time');
  } else if (/start date\/time differs|due date\/time differs/i.test(issue)) {
    lines.push('❌ Time');
  } else {
    lines.push('✅ Time');
  }

  lines.push(customer && tmv3_clean_(customer['Customer ID']) ? '✅ Customer' : '❌ Customer');

  if (cfg && cfg.orderRequired) {
    if (eventRecord.vertical === 'Service') {
      lines.push(eventRecord.orderNumber ? '✅ SO' : '❌ SO');
      lines.push(order && tmv3_clean_(order['Order ID']) ? '✅ WO' : '⚪ WO');
    } else {
      lines.push(order && tmv3_clean_(order['Order ID']) ? '✅ SO' : '❌ SO');
    }
  }

  lines.push(hasContact ? '✅ Contact' : '⚪ Contact');
  lines.push(location && tmv3_clean_(location['Location ID']) ? '✅ Location' : '❌ Location');

  if (hasTask) {
    lines.push('✅ Task');
    lines.push(tmv3_taskIsOpen_(task['Status']) ? '✅ Open Task' : '❌ Open Task');
  } else {
    const plannedCreate = /READY CREATE/i.test(tmv3_clean_(result && result.status));
    lines.push(plannedCreate ? '⚪ Task' : '❌ Task');
    lines.push('⚪ Open Task');
  }

  lines.push(tmv3_assignmentChecklistLine_(eventRecord, task, verification, issue));

  if (!hasTask) {
    lines.push('⚪ Calendar Link');
  } else if (/LINKS\s*✓/i.test(verification)) {
    lines.push('✅ Calendar Link');
  } else if (/LINKS\s*[△✕]/i.test(verification)) {
    lines.push('❌ Calendar Link');
  } else {
    lines.push(eventRecord && eventRecord.existingTaskUrl ? '✅ Calendar Link' : '❌ Calendar Link');
  }

  return lines.join('\n');
}

function tmv3_assignmentChecklistLine_(eventRecord, task, verification, issue) {
  if (!task) return '⚪ Assignee';

  if (/technician assignment differs|pool 8 missing|assignment differs/i.test(issue)) {
    return '❌ Assignee';
  }

  if (/ASSIGN\s*✓/i.test(verification)) {
    return '✅ Assignee';
  }

  if (/ASSIGN\s*[△✕]/i.test(verification)) {
    return '❌ Assignee';
  }

  if (
    eventRecord &&
    eventRecord.vertical === 'PreInspection' &&
    /POOL 8\s*✓/i.test(verification) &&
    !/INSPECTOR CHECK PENDING/i.test(verification)
  ) {
    return '✅ Assignee';
  }

  return '⚪ Assignee';
}

function tmv3_calendarLinkSummary_(
  e
) {
  const a =
    [];

  if (
    e.existingOrderUrl
  ) {
    a.push(
      'Order'
    );
  }

  if (
    e.existingTaskUrl
  ) {
    a.push(
      'Task'
    );
  }

  if (
    e.vertical ===
      'PreInspection' &&
    e.description.indexOf(
      TMV3
        .CUSTOMER_ORDERS_PAGE_BASE
    ) !== -1
  ) {
    a.push(
      'Sales Orders Page'
    );
  }

  return a.length
    ? a.join(' + ')
    : 'Missing';
}

function tmv3_writeOperatorViews_(
  resolved
) {
  Object.keys(
    TMV3.VERTICALS
  ).forEach(
    function(vertical) {
      const rows =
        resolved
          .filter(
            function(r) {
              return (
                r.vertical ===
                vertical
              );
            }
          )
          .sort(
            function(a,b) {
              return (
                a.date +
                a.time
              )
                .localeCompare(
                  b.date +
                  b.time
                );
            }
          )
          .map(
            function(r) {
              return [
                r.status,
                r.dataChecklist,
                r.date,
                r.time,
                r.customer,
                r.task,
                r.issue,
                r.nextAction,
                r.title,
                r.order,
                r.location,
                r.taskStatus,
                r.assignedTo,
                r.verification,
                r.calendarLinks,
                r.lastVerified,
                r.eventId
              ];
            }
          );

      const sheetName =
        TMV3
          .VERTICALS[
            vertical
          ]
          .sheet;

      tmv3_replaceRows_(
        sheetName,
        TMV3_OPERATOR_HEADERS
          .slice(),
        rows
      );

      tmv3_formatOperatorView_(
        sheetName
      );
    }
  );
}

function tmv3_formatOperatorView_(sheetName) {
  const sh = tmv3_sheet_(sheetName);
  const visible = Number(TMV3_OPERATOR_VISIBLE_COLUMN_COUNT || 8);
  const lastRow = sh.getLastRow();
  const maxColumns = sh.getMaxColumns();

  sh.showColumns(1, Math.min(visible, maxColumns));

  if (maxColumns > visible) {
    sh.hideColumns(visible + 1, maxColumns - visible);
  }

  const widths = [110, 185, 95, 85, 180, 220, 320, 145];
  widths.forEach(function(width, index) {
    if (index + 1 <= maxColumns) {
      sh.setColumnWidth(index + 1, width);
    }
  });

  if (lastRow >= 1) {
    sh.getRange(1, 1, lastRow, Math.min(visible, maxColumns))
      .setWrap(true)
      .setVerticalAlignment('middle');
  }

  sh.getRange(1, 1, 1, Math.min(visible, maxColumns))
    .setFontWeight('bold');

  if (lastRow > 1) {
    sh.autoResizeRows(2, lastRow - 1);
  }
}

function tmv3_statusCounts_(
  records
) {
  const out =
    {};

  (records || [])
    .forEach(
      function(r) {
        out[
          r.status
        ] =
          (
            out[
              r.status
            ] ||
            0
          ) +
          1;
      }
    );

  return out;
}

function tmv3_updateOverview_(
  records
) {
  const sh =
    tmv3_sheet_(
      TMV3
        .SHEETS
        .OVERVIEW
    );

  const verticals =
    [
      'Install',
      'Delivery',
      'Service',
      'PreInspection'
    ];

  verticals.forEach(
    function(v,i) {
      const rows =
        records.filter(
          function(r) {
            return (
              r.vertical ===
              v
            );
          }
        );

      const review =
        rows.filter(
          function(r) {
            return (
              r.status ===
              'REVIEW'
            );
          }
        ).length;

      const blocked =
        rows.filter(
          function(r) {
            return (
              r.status ===
              'BLOCKED'
            );
          }
        ).length;

      const matched =
        rows.filter(
          function(r) {
            return (
              r.status ===
              'MATCHED'
            );
          }
        ).length;

      sh
        .getRange(
          7 + i,
          1,
          1,
          6
        )
        .setValues(
          [[
            v,
            'SHADOW',
            rows.length,
            review,
            blocked,
            matched
              ? tmv3_now_()
              : ''
          ]]
        );
    }
  );
}


function tmv3_preInspectionTaskDecision_(eventRecord, customer, location) {
  const customerId = tmv3_clean_(customer && customer['Customer ID']);
  const locationId = tmv3_clean_(location && location['Location ID']);

  let candidates = [];

  if (eventRecord.existingTaskId) {
    const linked = tmv3_getTaskById_(eventRecord.existingTaskId);
    candidates = linked ? [linked] : [];
  } else {
    candidates = tmv3_searchPreInspectionTasks_(customer);
  }

  candidates = (candidates || []).filter(function(task) {
    return (
      Number(task['Task Type ID'] || 0) === 105 &&
      tmv3_clean_(task['Customer ID']) === customerId
    );
  });

  const evaluated = candidates.map(function(task) {
    const taskStart = tmv3_clean_(task['Start']);
    const taskDue = tmv3_clean_(task['Due']);
    const sameStart = tmv3_sameMinute_(eventRecord.start, taskStart);
    const sameDue = tmv3_sameMinute_(eventRecord.end, taskDue);
    const sameDay = tmv3_sameLocalDay_(eventRecord.start, taskStart);
    const sameLocation =
      !!locationId &&
      tmv3_clean_(task['Location ID']) === locationId;

    const taskTitle = tmv3_clean_(task['Name']);
    const titlePhones = tmv3_allPhones_(taskTitle);
    const titlePhoneMatch =
      !!eventRecord.phone &&
      titlePhones.indexOf(tmv3_phone10_(eventRecord.phone)) !== -1;

    const customerName = tmv3_norm_(customer && customer['Name']);
    const titleNameMatch =
      !!customerName &&
      tmv3_norm_(taskTitle).indexOf(customerName) !== -1;

    const identityCorroborated = titlePhoneMatch || titleNameMatch;
    const exactCalendarTaskLink =
      !!eventRecord.existingTaskId &&
      tmv3_clean_(eventRecord.existingTaskId) ===
        tmv3_clean_(task['Task ID']);

    const strongMatch =
      exactCalendarTaskLink ||
      sameStart ||
      (sameDay && sameLocation && identityCorroborated);

    return {
      task: task,
      open: tmv3_taskIsOpen_(task['Status']),
      sameStart: sameStart,
      sameDue: sameDue,
      sameDay: sameDay,
      sameLocation: sameLocation,
      titlePhoneMatch: titlePhoneMatch,
      titleNameMatch: titleNameMatch,
      identityCorroborated: identityCorroborated,
      exactCalendarTaskLink: exactCalendarTaskLink,
      strongMatch: strongMatch,
      hasStart: !!taskStart,
      score:
        (sameStart ? 100 : 0) +
        (sameDue ? 30 : 0) +
        (sameLocation ? 50 : 0) +
        (sameDay ? 20 : 0) +
        (titlePhoneMatch ? 80 : 0) +
        (titleNameMatch ? 40 : 0)
    };
  });

  const open = evaluated.filter(function(c) { return c.open; });
  const historyTasks = evaluated
    .filter(function(c) { return !c.open && tmv3_taskIsCompleted_(c.task['Status']); })
    .map(function(c) { return c.task; });
  const nonOpenActive = evaluated.filter(function(c) {
    return (
      !c.open &&
      !tmv3_taskIsCompleted_(c.task['Status'])
    );
  });

  if (!open.length && nonOpenActive.length) {
    return {
      status: 'REVIEW',
      task: null,
      historyTasks: historyTasks,
      reason: 'Applicable PreInspection Task exists in a non-open active status and must not be duplicated.',
      errorCode: 'NON_OPEN_ACTIVE_PREINSPECTION_TASK'
    };
  }

  // Step 5 resolves only the current OPEN task. Historical tasks are carried
  // forward so Step 6 can decide CREATE vs RECREATE vs FULFILLED safely.
  if (!open.length) {
    return {
      status: 'CLEAR',
      task: null,
      historyTasks: historyTasks,
      reason: 'No OPEN PreInspection task remains for this appointment.'
    };
  }

  open.sort(function(a, b) { return b.score - a.score; });

  const strong = open.filter(function(c) { return c.strongMatch; });

  if (strong.length === 1) {
    return {
      status: 'MATCHED',
      task: strong[0].task,
      reason: 'One OPEN PreInspection task strongly matches this appointment.',
      evidence: tmv3_preInspectionCandidateEvidence_(strong[0])
    };
  }

  if (strong.length > 1) {
    return {
      status: 'REVIEW',
      reason: 'Multiple OPEN PreInspection tasks strongly match this appointment.',
      errorCode: 'MULTIPLE_STRONG_PREINSPECTION_TASKS'
    };
  }

  const sameDay = open.filter(function(c) { return c.sameDay; });
  if (sameDay.length) {
    return {
      status: 'REVIEW',
      reason: 'Same-day OPEN PreInspection candidate(s) exist, but none is strong enough to link automatically.',
      errorCode: 'WEAK_SAME_DAY_PREINSPECTION_TASK'
    };
  }

  const sameLocation = open.filter(function(c) { return c.sameLocation; });
  if (sameLocation.length) {
    return {
      status: 'REVIEW',
      reason: 'OPEN PreInspection candidate(s) already use this Customer + Location. Duplicate creation is blocked.',
      errorCode: 'SAME_LOCATION_PREINSPECTION_TASK'
    };
  }

  const unresolved = open.filter(function(c) { return !c.hasStart; });
  const reusableUnscheduled = unresolved.filter(function(c) {
    const noConflictingLocation =
      !tmv3_clean_(c.task['Location ID']) || c.sameLocation;
    return c.identityCorroborated && noConflictingLocation;
  });

  if (open.length === 1 && reusableUnscheduled.length === 1) {
    return {
      status: 'MATCHED',
      task: reusableUnscheduled[0].task,
      reason: 'Exactly one unscheduled OPEN PreInspection task is identity-corroborated and has no conflicting Location.',
      evidence: tmv3_preInspectionCandidateEvidence_(reusableUnscheduled[0])
    };
  }

  if (unresolved.length) {
    return {
      status: 'REVIEW',
      reason: 'OPEN PreInspection candidate(s) have no usable start date and cannot be safely reused or ruled out.',
      errorCode: 'UNRESOLVED_PREINSPECTION_TASK'
    };
  }

  return {
    status: 'CLEAR',
    task: null,
    historyTasks: historyTasks,
    reason: 'No OPEN existing PreInspection task match was found for this appointment.'
  };
}

function tmv3_preInspectionCandidateEvidence_(candidate) {
  const parts = [];
  if (candidate.exactCalendarTaskLink) parts.push('CALENDAR_TASK_LINK');
  if (candidate.sameStart) parts.push('START');
  if (candidate.sameDue) parts.push('DUE');
  if (candidate.sameDay) parts.push('DAY');
  if (candidate.sameLocation) parts.push('LOCATION');
  if (candidate.titlePhoneMatch) parts.push('PHONE');
  if (candidate.titleNameMatch) parts.push('NAME');
  return parts;
}

function tmv3_sameMinute_(a, b) {
  const da = tmv3_parseDateTime_(a);
  const db = tmv3_parseDateTime_(b);
  if (!da || !db) return false;
  return Math.floor(da.getTime() / 60000) === Math.floor(db.getTime() / 60000);
}

function tmv3_sameLocalDay_(a, b) {
  const da = tmv3_parseDateTime_(a);
  const db = tmv3_parseDateTime_(b);
  if (!da || !db) return false;
  return tmv3_date_(da) === tmv3_date_(db);
}

function tmv3_allPhones_(text) {
  const raw = tmv3_clean_(text);
  const out = [];
  const rx = /(?:\+?1[\s.\-]?)?\(?([2-9]\d{2})\)?[\s.\-]?([2-9]\d{2})[\s.\-]?(\d{4})/g;
  let m;
  while ((m = rx.exec(raw)) !== null) {
    out.push(m[1] + m[2] + m[3]);
  }
  return tmv3_unique_(out);
}


function tmv3_verificationSummary_(
  eventRecord,
  cfg,
  task,
  order,
  customer,
  location,
  differences,
  links
) {
  const diff = (differences || []).join(' | ');
  const parts = [];

  parts.push('CUSTOMER ✓');
  parts.push('LOCATION ✓');

  if (cfg.orderRequired) {
    parts.push(order ? (cfg.orderLabel.toUpperCase() + ' ✓') : (cfg.orderLabel.toUpperCase() + ' ✕'));
  }

  parts.push(tmv3_taskIsOpen_(task && task['Status']) ? 'TASK OPEN ✓' : 'TASK OPEN ✕');

  const scheduleOk =
    !/start date\/time differs|due date\/time differs/i.test(diff);
  parts.push(scheduleOk ? 'TIME ✓' : 'TIME △');

  if (eventRecord.vertical === 'Service') {
    parts.push(/technician assignment differs/i.test(diff) ? 'ASSIGN △' : 'ASSIGN ✓');
  } else if (eventRecord.vertical === 'PreInspection') {
    parts.push(/pool 8 missing/i.test(diff) ? 'POOL 8 △' : 'POOL 8 ✓');
    parts.push('INSPECTOR CHECK PENDING');
  } else {
    parts.push('ASSIGN CHECK PENDING');
  }

  parts.push(links && links.ok ? 'LINKS ✓' : 'LINKS △');

  return (
    ((differences || []).length === 0 && links && links.ok)
      ? 'CALENDAR ↔ STRIVEN PASS · ' + parts.join(' · ')
      : 'CALENDAR ↔ STRIVEN CHECK · ' + parts.join(' · ')
  );
}


/************************************************************
 * SERVICE MULTI-FIREPLACE EXPANSION
 *
 * Old-system rule preserved:
 * If the same Work Order has multiple OPEN Service Tasks with
 * explicit FP#n / Fireplace #n markers, one Calendar event
 * expands to one V3 operational record per fireplace task.
 *
 * Arbitrary multiple tasks without those markers still REVIEW.
 ************************************************************/
function tmv3_resolveEventRecords_(eventRecord, refs, stateIndex) {
  if (eventRecord.vertical !== 'Service') {
    return [tmv3_resolveEvent_(eventRecord, refs, stateIndex)];
  }

  const orderCandidates =
    eventRecord.existingOrderId && refs.orderById[eventRecord.existingOrderId]
      ? [refs.orderById[eventRecord.existingOrderId]]
      : (
          eventRecord.orderNumber
            ? (refs.ordersByNumber[eventRecord.orderNumber] || [])
            : []
        );

  if (orderCandidates.length !== 1) {
    return [tmv3_resolveEvent_(eventRecord, refs, stateIndex)];
  }

  const order = orderCandidates[0];
  const orderId = tmv3_clean_(order['Order ID']);
  const cfg = TMV3.VERTICALS.Service;

  const candidates = (refs.tasksByOrder[orderId] || [])
    .filter(function(task) {
      return (
        tmv3_taskFitsVertical_(task, 'Service', cfg) &&
        tmv3_taskIsOpen_(task['Status'])
      );
    })
    .map(function(task) {
      return {
        task: task,
        fireplaceNumber: tmv3_extractServiceFireplaceNumber_(task['Name'])
      };
    })
    .filter(function(item) {
      return item.fireplaceNumber > 0;
    })
    .sort(function(a, b) {
      return a.fireplaceNumber - b.fireplaceNumber;
    });

  if (candidates.length <= 1) {
    return [tmv3_resolveEvent_(eventRecord, refs, stateIndex)];
  }

  const numberCounts = {};
  candidates.forEach(function(item) {
    numberCounts[item.fireplaceNumber] =
      (numberCounts[item.fireplaceNumber] || 0) + 1;
  });

  const duplicates = Object.keys(numberCounts).filter(function(n) {
    return numberCounts[n] > 1;
  });

  if (duplicates.length) {
    return [tmv3_result_(eventRecord, {
      status: 'REVIEW',
      nextAction: 'REVIEW MULTI-FIREPLACE TASKS',
      issue:
        'Multiple OPEN Service Tasks use the same fireplace marker: FP#' +
        duplicates.join(', FP#') +
        '.',
      errorCode: 'DUPLICATE_SERVICE_FIREPLACE_NUMBER'
    })];
  }

  return candidates.map(function(item) {
    const clone = Object.assign({}, eventRecord, {
      forcedTaskId: tmv3_clean_(item.task['Task ID']),
      forcedMatchEvidence: 'WORK ORDER + FP#' + item.fireplaceNumber,
      serviceFireplaceNumber: item.fireplaceNumber
    });

    const result = tmv3_resolveEvent_(clone, refs, stateIndex);
    result.serviceFireplaceNumber = item.fireplaceNumber;
    return result;
  });
}

function tmv3_extractServiceFireplaceNumber_(taskName) {
  const clean = tmv3_clean_(taskName);
  if (!clean) return 0;

  const patterns = [
    /\bFP\s*#?\s*(\d+)\b/i,
    /\bF\.?P\.?\s*#?\s*(\d+)\b/i,
    /\bFireplace\s*#?\s*(\d+)\b/i
  ];

  for (let i = 0; i < patterns.length; i++) {
    const match = clean.match(patterns[i]);
    if (match && match[1]) {
      const value = Number(match[1]);
      if (!isNaN(value) && value > 0) return value;
    }
  }

  return 0;
}

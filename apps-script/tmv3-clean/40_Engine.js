function tmv3_shadowRun() {
  tmv3_assertShadow_();

  const sourceSummary =
    tmv3_refreshSources();

  const events =
    tmv3_calendarRecords_();

  const refs =
    tmv3_referenceIndex_();

  const state =
    tmv3_eventStateIndex_();

  const resolved =
    events.map(function(e) {
      return tmv3_resolveEvent_(
        e,
        refs,
        state
      );
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

  tmv3_audit_(
    'SYSTEM',
    '',
    '',
    'SHADOW_RUN',
    'PASS',
    'Events ' +
      resolved.length
  );

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
      )
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

  let order =
    null;

  let customer =
    null;

  let location =
    null;

  let contactId =
    '';

  const evidence =
    [];

  if (
    cfg.orderRequired
  ) {
    const orderCandidates =
      e.existingOrderId &&
      refs
        .orderById[
          e.existingOrderId
        ]
        ? [
            refs
              .orderById[
                e.existingOrderId
              ]
          ]
        : (
            e.orderNumber
              ? (
                  refs
                    .ordersByNumber[
                      e.orderNumber
                    ] ||
                  []
                )
              : []
          );

    if (
      orderCandidates.length >
      1
    ) {
      return tmv3_result_(
        e,
        {
          status:
            'REVIEW',
          nextAction:
            'RESOLVE ORDER',
          issue:
            'Multiple matching ' +
            cfg.orderLabel +
            ' records.',
          errorCode:
            'AMBIGUOUS_ORDER'
        }
      );
    }

    if (
      orderCandidates.length ===
      0
    ) {
      return tmv3_result_(
        e,
        {
          status:
            'BLOCKED',
          nextAction:
            'ADD / VERIFY ' +
            cfg
              .orderLabel
              .toUpperCase(),
          issue:
            cfg.orderLabel +
            ' is required and was not resolved.',
          errorCode:
            'ORDER_REQUIRED'
        }
      );
    }

    order =
      orderCandidates[0];

    evidence.push(
      cfg.orderLabel +
      ' exact'
    );

    customer =
      refs
        .customerById[
          tmv3_clean_(
            order[
              'Customer ID'
            ]
          )
        ] ||
      null;

    if (!customer) {
      return tmv3_result_(
        e,
        {
          status:
            'BLOCKED',
          nextAction:
            'RESOLVE CUSTOMER',
          issue:
            'Resolved order does not resolve to a Customer.',
          order:
            order,
          errorCode:
            'ORDER_CUSTOMER_MISSING'
        }
      );
    }

    evidence.push(
      'Customer from ' +
      cfg.orderLabel
    );

    contactId =
      tmv3_clean_(
        order[
          'Contact ID'
        ]
      );

  } else {

    if (
      e.customerNumber &&
      refs
        .customerByNumber[
          e.customerNumber
        ]
    ) {
      customer =
        refs
          .customerByNumber[
            e.customerNumber
          ];

      evidence.push(
        'Customer # exact'
      );
    }

    if (
      !customer &&
      e.phone &&
      (
        refs
          .customerByPhone[
            e.phone
          ] ||
        []
      ).length === 1
    ) {
      customer =
        refs
          .customerByPhone[
            e.phone
          ][0];

      evidence.push(
        'Phone exact'
      );
    }

    if (
      !customer &&
      e.phone &&
      (
        refs
          .customerByPhone[
            e.phone
          ] ||
        []
      ).length > 1
    ) {
      return tmv3_result_(
        e,
        {
          status:
            'REVIEW',
          nextAction:
            'RESOLVE CUSTOMER',
          issue:
            'Phone matches multiple customers.',
          errorCode:
            'AMBIGUOUS_CUSTOMER'
        }
      );
    }

    if (!customer) {
      return tmv3_result_(
        e,
        {
          status:
            'REVIEW',
          nextAction:
            'RESOLVE CUSTOMER',
          issue:
            'PreInspection customer could not be proven.',
          errorCode:
            'CUSTOMER_UNRESOLVED'
        }
      );
    }
  }

  const customerId =
    tmv3_clean_(
      customer[
        'Customer ID'
      ]
    );

  const orderLocationId =
    order
      ? tmv3_clean_(
          order[
            'Location ID'
          ]
        )
      : '';

  const customerLocations =
    refs
      .locationsByCustomer[
        customerId
      ] ||
    [];

  if (
    orderLocationId
  ) {
    location =
      customerLocations
        .filter(
          function(r) {
            return (
              tmv3_clean_(
                r[
                  'Location ID'
                ]
              ) ===
              orderLocationId
            );
          }
        )[0] ||
      null;
  }

  if (
    !location &&
    e.location
  ) {
    const target =
      tmv3_norm_(
        e.location
      );

    const matches =
      customerLocations
        .filter(
          function(r) {
            const full =
              [
                r[
                  'Address 1'
                ],
                r[
                  'Address 2'
                ],
                r[
                  'City'
                ],
                r[
                  'Province'
                ],
                r[
                  'Postal Code'
                ]
              ]
                .map(
                  tmv3_clean_
                )
                .join(' ');

            return (
              target &&
              (
                tmv3_norm_(
                  full
                ) ===
                  target ||
                tmv3_norm_(
                  r[
                    'Address 1'
                  ]
                ) ===
                  target
              )
            );
          }
        );

    if (
      matches.length ===
      1
    ) {
      location =
        matches[0];

      evidence.push(
        'Location exact'
      );

    } else if (
      matches.length >
      1
    ) {
      return tmv3_result_(
        e,
        {
          status:
            'REVIEW',
          nextAction:
            'RESOLVE LOCATION',
          issue:
            'Multiple customer-owned locations match event.',
          customer:
            customer,
          order:
            order,
          errorCode:
            'AMBIGUOUS_LOCATION'
        }
      );
    }
  }

  if (!location) {
    return tmv3_result_(
      e,
      {
        status:
          'REVIEW',
        nextAction:
          e.vertical ===
            'PreInspection'
              ? 'VERIFY / CREATE LOCATION'
              : 'RESOLVE LOCATION',
        issue:
          'Customer is known but appointment location is not proven.',
        customer:
          customer,
        order:
          order,
        errorCode:
          'LOCATION_UNRESOLVED'
      }
    );
  }

  let taskCandidates =
    [];

  if (e.vertical === 'PreInspection') {
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
      task:
        task,
      evidence:
        evidence,
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

  const customer =
    x.customer ||
    null;

  const location =
    x.location ||
    null;

  const order =
    x.order ||
    null;

  const task =
    x.task ||
    null;

  return {
    vertical:
      e.vertical,
    calendarId:
      e.calendarId,
    eventId:
      e.eventId,
    fingerprint:
      e.fingerprint,
    calendarUpdatedAt:
      e.calendarUpdatedAt,
    status:
      x.status ||
      'REVIEW',
    nextAction:
      x.nextAction ||
      'REVIEW',
    date:
      tmv3_date_(
        e.start
      ),
    time:
      tmv3_time_(
        e.start
      ),
    title:
      e.title,
    customer:
      customer
        ? tmv3_clean_(
            customer[
              'Name'
            ]
          )
        : '',
    customerId:
      customer
        ? tmv3_clean_(
            customer[
              'Customer ID'
            ]
          )
        : '',
    location:
      location
        ? [
            location[
              'Address 1'
            ],
            location[
              'City'
            ]
          ]
            .map(
              tmv3_clean_
            )
            .filter(
              Boolean
            )
            .join(', ')
        : e.location,
    locationId:
      location
        ? tmv3_clean_(
            location[
              'Location ID'
            ]
          )
        : '',
    contactId:
      order
        ? tmv3_clean_(
            order[
              'Contact ID'
            ]
          )
        : '',
    order:
      order
        ? (
            tmv3_clean_(
              order[
                'Order Number'
              ]
            ) +
            (
              tmv3_clean_(
                order[
                  'Name'
                ]
              )
                ? ' - ' +
                  tmv3_clean_(
                    order[
                      'Name'
                    ]
                  )
                : ''
            )
          )
        : '',
    orderId:
      order
        ? tmv3_clean_(
            order[
              'Order ID'
            ]
          )
        : '',
    task:
      task
        ? (
            tmv3_clean_(
              task[
                'Task Number'
              ]
            ) +
            (
              tmv3_clean_(
                task[
                  'Name'
                ]
              )
                ? ' - ' +
                  tmv3_clean_(
                    task[
                      'Name'
                    ]
                  )
                : ''
            )
          )
        : '',
    taskId:
      task
        ? tmv3_clean_(
            task[
              'Task ID'
            ]
          )
        : '',
    taskStatus:
      task
        ? tmv3_clean_(
            task[
              'Status'
            ]
          )
        : '',
    assignedTo:
      task
        ? tmv3_clean_(
            task[
              'Assignees'
            ]
          )
        : (
            e.technician ||
            ''
          ),
    matchEvidence:
      (
        x.evidence ||
        []
      ).join(' + '),
    issue:
      x.issue ||
      '',
    calendarLinks:
      tmv3_calendarLinkSummary_(
        e
      ),
    lastVerified:
      x.lastVerified ||
      '',
    errorCode:
      x.errorCode ||
      ''
  };
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
                r.nextAction,
                r.date,
                r.time,
                r.title,
                r.customer,
                r.order,
                r.location,
                r.task,
                r.taskStatus,
                r.assignedTo,
                r.matchEvidence,
                r.issue,
                r.calendarLinks,
                r.lastVerified,
                r.eventId
              ];
            }
          );

      tmv3_replaceRows_(
        TMV3
          .VERTICALS[
            vertical
          ]
          .sheet,
        TMV3_OPERATOR_HEADERS
          .slice(),
        rows
      );
    }
  );
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
    const strongMatch =
      sameStart ||
      (sameDay && sameLocation) ||
      (sameLocation && identityCorroborated);

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

  // Current PreInspection policy: historical/non-open tasks never block the
  // current appointment. A new active task may be created when no OPEN
  // candidate remains.
  if (!open.length) {
    return {
      status: 'CLEAR',
      task: null,
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
    reason: 'No OPEN existing PreInspection task match was found for this appointment.'
  };
}

function tmv3_preInspectionCandidateEvidence_(candidate) {
  const parts = [];
  if (candidate.sameStart) parts.push('START');
  if (candidate.sameDue) parts.push('DUE');
  if (candidate.sameDay) parts.push('DAY');
  if (candidate.sameLocation) parts.push('LOCATION');
  if (candidate.titlePhoneMatch) parts.push('PHONE');
  if (candidate.titleNameMatch) parts.push('NAME');
  return parts;
}

function tmv3_sameMinute_(a, b) {
  const da = a instanceof Date ? a : new Date(a);
  const db = b instanceof Date ? b : new Date(b);
  if (isNaN(da.getTime()) || isNaN(db.getTime())) return false;
  return Math.floor(da.getTime() / 60000) === Math.floor(db.getTime() / 60000);
}

function tmv3_sameLocalDay_(a, b) {
  const da = a instanceof Date ? a : new Date(a);
  const db = b instanceof Date ? b : new Date(b);
  if (isNaN(da.getTime()) || isNaN(db.getTime())) return false;
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

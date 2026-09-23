function tmv3_desiredAssignment_(eventRecord) {
  const cfg = TMV3.VERTICALS[eventRecord.vertical];

  if (eventRecord.vertical === 'Service') {
    return {
      employeeIds:
        eventRecord.technicianEmployeeId
          ? [Number(eventRecord.technicianEmployeeId)]
          : [],
      poolIds: []
    };
  }

  if (eventRecord.vertical === 'PreInspection') {
    const employees = [];
    const text = tmv3_norm_(
      [
        eventRecord.title,
        eventRecord.description,
        eventRecord.guests
      ].join(' ')
    );

    (cfg.knownInspectors || []).forEach(function(p) {
      if (
        (p.patterns || []).some(function(q) {
          return text.indexOf(tmv3_norm_(q)) !== -1;
        })
      ) {
        employees.push(Number(p.employeeId));
      }
    });

    return {
      employeeIds: tmv3_unique_(employees),
      poolIds: [Number(cfg.defaultPoolId)]
    };
  }

  const text = tmv3_norm_(
    [
      eventRecord.title,
      eventRecord.description
    ].join(' ')
  );

  const ids = [];

  (cfg.assignees || []).forEach(function(p) {
    if (p.ignoreAssignment) return;

    if (
      (p.patterns || []).some(function(q) {
        return text.indexOf(tmv3_norm_(q)) !== -1;
      })
    ) {
      ids.push(Number(p.employeeId));
    }
  });

  return {
    employeeIds: tmv3_unique_(ids),
    poolIds: []
  };
}

function tmv3_preInspectionCreatePolicy() {
  return {
    taskTypeId: 105,
    attachSalesOrder: false,
    description: '',
    field854: 'NO_WRITE',
    requiredPoolId: 8,
    requestedBy: 'CALENDAR_ORGANIZER',
    calendarLinks: [
      'CUSTOMER_SALES_ORDERS_PAGE',
      'TASK'
    ],
    technicianFields: 'DO_NOT_PREFILL'
  };
}

function tmv3_servicePolicy() {
  return {
    orderRequired: true,
    operationalName: 'Work Order',
    sameUnderlyingRecordAsSalesOrder: true,
    calendarLinks: [
      'WORK_ORDER',
      'TASK'
    ]
  };
}

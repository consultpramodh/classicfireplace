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
    // Legacy rule: PreInspection stays assigned to Pool 8.
    // The Calendar organizer is Requested By, not Assigned To.
    return {
      employeeIds: [],
      poolIds: [Number(cfg.defaultPoolId)]
    };
  }

  // Install / Delivery parity rule:
  // assignment names must be explicit in the Calendar event TITLE.
  // Description/notes are narrative context and must never create an
  // assignment instruction (for example, "Let SF know the results").
  const title = tmv3_norm_(eventRecord.title);

  const ids = [];

  (cfg.assignees || []).forEach(function(p) {
    if (p.ignoreAssignment) return;

    if (
      (p.patterns || []).some(function(q) {
        const pattern = tmv3_norm_(q);
        return pattern &&
          (' ' + title + ' ').indexOf(' ' + pattern + ' ') !== -1;
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

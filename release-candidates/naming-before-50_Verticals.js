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
  const title = tmv3_norm_(eventRecord.assignmentSourceTitle || eventRecord.title);

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


/************************************************************
 * TM V3 — CANONICAL TITLE / TASK NAME POLICY
 *
 * Deterministic only. JEV is intentionally not used here.
 * Identity, ownership and canonical Task selection must already
 * be verified by the existing Step 3-7 pipeline.
 ************************************************************/

function tmv3_titlePhoneDisplay_(value) {
  const phone = tmv3_phone10_(value);
  if (!phone || phone.length !== 10) return '';
  return '(' + phone.slice(0,3) + ') ' + phone.slice(3,6) + '-' + phone.slice(6);
}


function tmv3_taskNameNormalizationStatusAllowed_(status) {
  return tmv3_clean_(status).toUpperCase() === 'OPEN';
}

function tmv3_titleCityFromAddress_(address) {
  const parts = tmv3_clean_(address)
    .split(',')
    .map(tmv3_clean_)
    .filter(Boolean);

  if (parts.length < 2) return '';

  let provinceIndex = -1;

  for (let i = 1; i < parts.length; i++) {
    if (
      /^(?:ON|QC|BC|AB|MB|SK|NS|NB|NL|PE|NT|NU|YT)\b/i.test(parts[i]) ||
      /\b[A-Z]\d[A-Z]\s?\d[A-Z]\d\b/i.test(parts[i])
    ) {
      provinceIndex = i;
      break;
    }
  }

  if (provinceIndex > 1) return parts[provinceIndex - 1];
  if (parts.length === 2) return parts[1];
  return '';
}

function tmv3_titleLocationDisplay_(location, calendarLocation) {
  if (!location) return '';

  const rawAddress = tmv3_clean_(location['Address 1']);
  const structuredCity = tmv3_clean_(location['City']);

  if (!rawAddress) {
    return (
      structuredCity ||
      tmv3_titleCityFromAddress_(calendarLocation)
    );
  }

  const parts = rawAddress
    .split(',')
    .map(tmv3_clean_)
    .filter(Boolean);

  const street = parts.length ? parts[0] : rawAddress;

  // Prefer the verified Calendar locality when Striven stores a complete
  // formatted address in Address 1 and leaves City blank. This keeps the
  // operational city that staff actually booked (e.g. North York) instead
  // of a broader hierarchy segment (e.g. Toronto).
  const city =
    structuredCity ||
    tmv3_titleCityFromAddress_(calendarLocation) ||
    tmv3_titleCityFromAddress_(rawAddress);

  return [street, city]
    .map(tmv3_clean_)
    .filter(Boolean)
    .join(', ');
}

function tmv3_verifiedTitleContext_(record) {
  record = record || {};

  const step3 = record.step3 || {};
  const step4 = record.step4 || {};
  const anchor = step3.anchor || {};
  const customer = step4.customer || null;
  const location = step4.location || null;

  const verified =
    step4.disposition === 'VERIFIED' &&
    (
      step3.disposition === 'VERIFIED' ||
      (
        record.vertical === 'PreInspection' &&
        (TMV3.VERTICALS.PreInspection || {}).orderRequired !== true
      )
    );

  const customerName = tmv3_clean_(
    customer && customer['Name']
  );

  const customerNumber = tmv3_clean_(
    (customer && customer['Customer Number']) ||
    anchor.customerNumber
  );

  const orderNumber = tmv3_clean_(
    anchor.orderNumber || record.orderNumber
  );

  const phone = tmv3_titlePhoneDisplay_(
    record.phone ||
    (customer && customer['Primary Phone']) ||
    (location && location['Primary Phone'])
  );

  const address =
    tmv3_titleLocationDisplay_(location, record.location) ||
    (
      step4.locationStatus === 'CREATE_REQUIRED' &&
      tmv3_clean_(record.location)
        ? tmv3_titleLocationDisplay_(
            {
              'Address 1':tmv3_clean_(record.location),
              'City':tmv3_titleCityFromAddress_(record.location)
            },
            record.location
          )
        : ''
    );

  return {
    verified: verified,
    customerName: customerName,
    customerNumber: customerNumber,
    orderNumber: orderNumber,
    phone: phone,
    address: address
  };
}

function tmv3_desiredTaskName_(record, options) {
  options = options || {};
  const context = tmv3_verifiedTitleContext_(record);

  if (!context.verified) {
    return {
      status:'BLOCKED',
      value:'',
      reason:'Customer/Location identity is not fully verified.'
    };
  }

  const missing = [];
  if (!context.customerName) missing.push('Customer Name');
  if (!context.address) missing.push('Address');
  if (!context.phone) missing.push('Phone');

  if (missing.length) {
    return {
      status:'BLOCKED',
      value:'',
      reason:'Canonical Task Name is missing verified ' + missing.join(', ') + '.'
    };
  }

  let value = [
    context.customerName,
    context.address,
    context.phone
  ].join(' - ');

  if (record.vertical === 'Service') {
    const sourceTitle = tmv3_clean_(options.sourceTaskTitle);
    const fireplaceNumber = Number(
      record.serviceFireplaceNumber ||
      (
        sourceTitle &&
        typeof tmv3_extractServiceFireplaceNumber_ === 'function'
          ? tmv3_extractServiceFireplaceNumber_(sourceTitle)
          : 0
      ) ||
      0
    );

    if (fireplaceNumber > 0) {
      value += ' - FP#' + fireplaceNumber;
    }
  }

  return {
    status:'READY',
    value:value,
    reason:'',
    source:'VERIFIED_CUSTOMER_LOCATION_PHONE'
  };
}

function tmv3_desiredCalendarTitle_(record) {
  record = record || {};
  const context = tmv3_verifiedTitleContext_(record);

  if (!context.verified) {
    return {
      status:'BLOCKED',
      value:'',
      reason:'Calendar title normalization requires verified Customer/Location identity.'
    };
  }

  if (record.vertical === 'Install') {
    if (!context.orderNumber || !context.customerName || !context.phone) {
      return {
        status:'BLOCKED',
        value:'',
        reason:'Install Calendar title requires verified Sales Order Number, Customer Name and Phone.'
      };
    }

    return {
      status:'READY',
      value:[
        'SO#' + context.orderNumber,
        context.customerName,
        context.phone
      ].join(' - '),
      reason:'',
      source:'VERIFIED_SO_CUSTOMER_PHONE'
    };
  }

  if (record.vertical === 'PreInspection') {
    if (!context.customerNumber || !context.customerName || !context.phone) {
      return {
        status:'BLOCKED',
        value:'',
        reason:'PreInspection Calendar title requires verified Customer Number, Customer Name and Phone.'
      };
    }

    return {
      status:'READY',
      value:[
        context.customerNumber,
        context.customerName,
        context.phone
      ].join(' - '),
      reason:'',
      source:'VERIFIED_CUSTOMER_NUMBER_NAME_PHONE'
    };
  }

  return {
    status:'NOT_AUTHORIZED',
    value:'',
    reason:
      record.vertical +
      ' Calendar title normalization has no explicitly approved canonical format. Existing Calendar title must remain unchanged.'
  };
}

function tmv3_preInspectionCreatePolicy() {
  return {
    taskTypeId: 105,
    attachSalesOrder: false,
    description: '',
    calendarNotes: 'CALENDAR_ONLY',
    previousCalendarTitlePolicy: 'PRESERVE_AS_FIRST_DESCRIPTION_LINE_NO_HEADER',
    descriptionHeaderPolicy: 'REMOVE_NOTES_AND_SALES_ORDER_LABELS_PRESERVE_CONTENT',
    calendarCopyParityPolicy: 'FULL_BUSINESS_VISIBLE_PARITY_REQUIRED',
    calendarLinksPreservationPolicy: 'PRESERVE_EXISTING_CLICKABLE_BLOCK_REPAIR_NONCLICKABLE_OR_MISSING_ONLY',
    calendarTaskLinkLabelPolicy: 'TASK_ID_PLUS_ACTUAL_STRIVEN_TASK_NAME',
    field854: 'DO_NOT_MANAGE',
    infoCustomFieldsAtCreate: 'NONE',
    requiredPoolId: 8,
    requestedBy: 'CALENDAR_ORGANIZER',
    assignedToFromOrganizer: false,
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

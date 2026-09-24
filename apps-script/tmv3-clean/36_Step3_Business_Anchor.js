/************************************************************
 * TM V3 — STAGE 3 BUSINESS-ANCHOR RESOLUTION
 *
 * Contract:
 * - Consumes the exact Step-2 event set.
 * - Resolves only business anchors.
 * - Does NOT resolve Location / Contact / Task.
 * - Does NOT create or update Striven.
 * - Does NOT write Google Calendar.
 ************************************************************/

function tmv3_step3RefreshAnchorSources_() {
  tmv3_assertShadow_();
  tmv3_resetRuntimeMetrics_();

  const customers =
    tmv3_reportRows_(TMV3.PROPERTIES.CUSTOMERS)
      .map(tmv3_normalizeCustomer_);

  const approved =
    tmv3_reportRows_(TMV3.PROPERTIES.APPROVED_ORDERS)
      .map(function(r) {
        return tmv3_normalizeOrder_(r, 'SALES_ORDER');
      });

  const deliveryApproved =
    tmv3_reportRows_(TMV3.PROPERTIES.DELIVERY_APPROVED_ORDERS)
      .map(function(r) {
        return tmv3_normalizeOrder_(r, 'DELIVERY_APPROVED');
      });

  const serviceOrders =
    tmv3_reportRows_(TMV3.PROPERTIES.SERVICE_WORK_ORDERS)
      .map(function(r) {
        return tmv3_normalizeOrder_(r, 'WORK_ORDER');
      });

  const orders = tmv3_mergeOrderRows_(
    approved.concat(deliveryApproved, serviceOrders)
  );

  tmv3_replaceRows_(
    TMV3.SHEETS.CUSTOMERS,
    [
      'Customer ID',
      'Customer Number',
      'Name',
      'Primary Phone',
      'Primary Email',
      'Fingerprint'
    ],
    customers
  );

  tmv3_replaceRows_(
    TMV3.SHEETS.ORDERS,
    [
      'Order ID',
      'Order Number',
      'Customer ID',
      'Location ID',
      'Contact ID',
      'Status',
      'Name',
      'Order Type',
      'URL',
      'Fingerprint'
    ],
    orders
  );

  const result = {
    customers: customers.length,
    orders: orders.length,
    api: tmv3_runtimeMetrics_()
  };

  tmv3_audit_(
    'SYSTEM','','','STEP3_REFRESH_ANCHOR_SOURCES','PASS',
    JSON.stringify(result)
  );

  return result;
}

function tmv3_step3AnchorSourceSummary_() {
  return {
    customers: tmv3_rows_(TMV3.SHEETS.CUSTOMERS).length,
    orders: tmv3_rows_(TMV3.SHEETS.ORDERS).length,
    source: 'CACHED_ANCHOR_SOURCES'
  };
}

function tmv3_step3AnchorIndex_() {
  const customers = tmv3_rows_(TMV3.SHEETS.CUSTOMERS);
  const orders = tmv3_rows_(TMV3.SHEETS.ORDERS);

  const refs = {
    customers: customers,
    orders: orders,
    customerById: {},
    customerByNumber: {},
    orderById: {},
    ordersByNumber: {}
  };

  customers.forEach(function(customer) {
    const id = tmv3_clean_(customer['Customer ID']);
    const number = tmv3_clean_(customer['Customer Number']);

    if (id) refs.customerById[id] = customer;
    if (number) refs.customerByNumber[number] = customer;
  });

  orders.forEach(function(order) {
    const id = tmv3_clean_(order['Order ID']);
    const number = tmv3_clean_(order['Order Number']);

    if (id) refs.orderById[id] = order;

    if (number) {
      if (!refs.ordersByNumber[number]) refs.ordersByNumber[number] = [];
      refs.ordersByNumber[number].push(order);
    }
  });

  return refs;
}

function tmv3_step3BusinessAnchorRecords_(step2Records, refs) {
  return (step2Records || []).map(function(record) {
    const step2 = record.step2 || {};

    if (step2.disposition !== 'ELIGIBLE') {
      return Object.assign({}, record, {
        step3: {
          disposition: 'NOT_RUN',
          code: 'STEP2_' + (step2.disposition || 'UNKNOWN'),
          reason: 'Business-anchor resolution did not run because Step 2 is not ELIGIBLE.',
          evidence: [],
          warnings: []
        }
      });
    }

    const decision =
      record.vertical === 'PreInspection'
        ? tmv3_step3ResolvePreInspectionAnchor_(record, refs)
        : tmv3_step3ResolveOrderAnchor_(record, refs);

    return Object.assign({}, record, { step3: decision });
  });
}

function tmv3_step3ResolveOrderAnchor_(record, refs) {
  const cfg = TMV3.VERTICALS[record.vertical];
  const label = cfg.orderLabel || 'Order';
  const orderNumber = tmv3_clean_(record.orderNumber);
  const existingOrderId = tmv3_clean_(record.existingOrderId);
  let candidates = [];
  const evidence = [];

  if (existingOrderId && refs.orderById[existingOrderId]) {
    candidates = [refs.orderById[existingOrderId]];
    evidence.push('CALENDAR_ORDER_LINK_ID_EXACT');
  } else if (orderNumber) {
    candidates = (refs.ordersByNumber[orderNumber] || []).slice();
    evidence.push('CALENDAR_ORDER_NUMBER_EXACT');
  }

  candidates = tmv3_step3UniqueOrders_(candidates);

  if (!existingOrderId && !orderNumber) {
    return tmv3_step3Decision_(
      'BLOCKED',
      'ANCHOR_ORDER_NUMBER_MISSING',
      label + ' number/link is required before business-anchor resolution.',
      null,
      evidence
    );
  }

  if (!candidates.length) {
    return tmv3_step3Decision_(
      'BLOCKED',
      'ANCHOR_ORDER_NOT_FOUND',
      label + ' was not found in the current Striven anchor source.',
      null,
      evidence
    );
  }

  if (candidates.length > 1) {
    return tmv3_step3Decision_(
      'REVIEW',
      'ANCHOR_ORDER_AMBIGUOUS',
      'Multiple distinct Striven records match ' + label + ' ' + (orderNumber || existingOrderId) + '.',
      null,
      evidence
    );
  }

  const order = candidates[0];
  const customerId = tmv3_clean_(order['Customer ID']);
  const customer = customerId ? (refs.customerById[customerId] || null) : null;
  const anchor = tmv3_step3AnchorFromOrder_(record, order, customer);

  if (!customerId && record.vertical === 'Service') {
    return tmv3_step3Decision_(
      'VERIFIED',
      'SERVICE_WORK_ORDER_ANCHOR_VERIFIED',
      'Work Order resolved uniquely. Customer identity is intentionally deferred to Step 4.',
      anchor,
      evidence.concat(['WORK_ORDER_UNIQUE']),
      ['Work Order source does not expose Customer ID; Step 4 will resolve Customer from independent evidence.']
    );
  }

  if (!customerId) {
    return tmv3_step3Decision_(
      'REVIEW',
      'ANCHOR_ORDER_CUSTOMER_MISSING',
      label + ' resolved, but it does not expose a Customer ID.',
      anchor,
      evidence
    );
  }

  if (!customer) {
    return tmv3_step3Decision_(
      'REVIEW',
      'ANCHOR_CUSTOMER_CACHE_MISSING',
      label + ' resolved to Customer ID ' + customerId + ', but that Customer is not present in the current Customer source.',
      anchor,
      evidence
    );
  }

  return tmv3_step3Decision_(
    'VERIFIED',
    'ANCHOR_ORDER_VERIFIED',
    label + ' resolved uniquely and exposes a verified Customer relationship.',
    anchor,
    evidence.concat(['ORDER_CUSTOMER_RELATIONSHIP_PRESENT'])
  );
}

function tmv3_step3ResolvePreInspectionAnchor_(record, refs) {
  const calendarCustomerNumber = tmv3_clean_(record.customerNumber);
  const evidence = [];
  const warnings = [];

  let customer = null;
  let order = null;
  let unresolvedCalendarCustomerNumber = '';

  if (calendarCustomerNumber) {
    customer = refs.customerByNumber[calendarCustomerNumber] || null;

    if (customer) {
      evidence.push('CALENDAR_CUSTOMER_NUMBER_EXACT');
    } else {
      unresolvedCalendarCustomerNumber = calendarCustomerNumber;
      warnings.push(
        'Calendar number ' + calendarCustomerNumber +
        ' did not match a Customer #; it will be tested only as deterministic SO evidence.'
      );
    }
  }

  const orderResolution = tmv3_step3ResolvePreInspectionOrderEvidence_(
    record,
    refs,
    unresolvedCalendarCustomerNumber
  );

  if (orderResolution.ambiguous) {
    return tmv3_step3Decision_(
      'REVIEW',
      'PREINSPECTION_SO_AMBIGUOUS',
      'Multiple distinct Striven orders are supported by the Calendar numeric evidence.',
      customer
        ? tmv3_step3AnchorFromPreInspection_(record, customer, null)
        : null,
      evidence.concat(orderResolution.evidence),
      warnings.concat(orderResolution.warnings)
    );
  }

  order = orderResolution.order;
  Array.prototype.push.apply(evidence, orderResolution.evidence);
  Array.prototype.push.apply(warnings, orderResolution.warnings);

  if (customer && order) {
    const orderCustomerId = tmv3_clean_(order['Customer ID']);
    const customerId = tmv3_clean_(customer['Customer ID']);

    if (orderCustomerId && customerId && orderCustomerId !== customerId) {
      return tmv3_step3Decision_(
        'REVIEW',
        'PREINSPECTION_CUSTOMER_SO_CONFLICT',
        'Calendar Customer # and Calendar SO resolve to different Striven Customers.',
        tmv3_step3AnchorFromPreInspection_(record, customer, order),
        evidence,
        warnings
      );
    }

    if (orderCustomerId && customerId) {
      evidence.push('SO_CORROBORATES_CUSTOMER');
    }
  }

  if (!customer && order) {
    const orderCustomerId = tmv3_clean_(order['Customer ID']);
    customer = orderCustomerId ? (refs.customerById[orderCustomerId] || null) : null;

    if (customer) {
      evidence.push('UNIQUE_SO_RESOLVES_CUSTOMER');
    }
  }

  if (!customer) {
    return tmv3_step3Decision_(
      'REVIEW',
      'PREINSPECTION_BUSINESS_ANCHOR_UNRESOLVED',
      'No exact Customer # or unique SO relationship resolved a Striven Customer.',
      tmv3_step3AnchorFromPreInspection_(record, null, order),
      evidence,
      warnings
    );
  }

  const anchor = tmv3_step3AnchorFromPreInspection_(record, customer, order);

  // Exact Customer # is already a deterministic business anchor.
  // SO is corroboration/data quality, not a prerequisite for Step 3.
  return tmv3_step3Decision_(
    'VERIFIED',
    order
      ? 'PREINSPECTION_CUSTOMER_SO_VERIFIED'
      : 'PREINSPECTION_CUSTOMER_VERIFIED',
    order
      ? 'PreInspection Customer resolved and the Calendar SO evidence points to the same Customer.'
      : 'PreInspection Customer resolved exactly; SO corroboration is unavailable or unresolved.',
    anchor,
    evidence,
    warnings
  );
}

function tmv3_step3ResolvePreInspectionOrderEvidence_(record, refs, unresolvedCalendarCustomerNumber) {
  const candidateNumbers = [];
  const evidence = [];
  const warnings = [];

  const parsed = tmv3_clean_(record.orderNumber);
  if (parsed) candidateNumbers.push(parsed);

  // A six-digit leading number that failed Customer lookup is a common
  // legacy pattern where the title actually carried the Sales Order.
  if (
    unresolvedCalendarCustomerNumber &&
    /^\d{6}$/.test(unresolvedCalendarCustomerNumber)
  ) {
    candidateNumbers.push(unresolvedCalendarCustomerNumber);
  }

  if (!parsed) {
    tmv3_step3BareSixDigitOrderCandidates_(record).forEach(function(number) {
      candidateNumbers.push(number);
    });
  }

  const uniqueNumbers = tmv3_unique_(
    candidateNumbers.map(tmv3_clean_).filter(Boolean)
  );

  const matchedOrders = [];

  uniqueNumbers.forEach(function(number) {
    const matches = tmv3_step3UniqueOrders_(
      (refs.ordersByNumber[number] || []).slice()
    );

    if (matches.length === 1) {
      matchedOrders.push(matches[0]);

      if (number === parsed) {
        evidence.push('CALENDAR_SO_NUMBER_EXACT');
      } else if (number === unresolvedCalendarCustomerNumber) {
        evidence.push('LEADING_NUMBER_RECOVERED_AS_SO');
      } else {
        evidence.push('LEGACY_BARE_SIX_DIGIT_SO_EXACT');
      }
    }
  });

  const orders = tmv3_step3UniqueOrders_(matchedOrders);

  if (orders.length > 1) {
    return {
      ambiguous: true,
      order: null,
      evidence: tmv3_unique_(evidence),
      warnings: warnings
    };
  }

  if (orders.length === 1) {
    return {
      ambiguous: false,
      order: orders[0],
      evidence: tmv3_unique_(evidence),
      warnings: warnings
    };
  }

  if (parsed) {
    warnings.push(
      'Calendar SO #' + parsed +
      ' was not found in the current Order source.'
    );
  } else {
    warnings.push('No deterministic SO corroboration was found.');
  }

  return {
    ambiguous: false,
    order: null,
    evidence: tmv3_unique_(evidence),
    warnings: warnings
  };
}

function tmv3_step3BareSixDigitOrderCandidates_(record) {
  const text = tmv3_stripPhonesForOrderParsing_(
    [
      tmv3_clean_(record.title),
      tmv3_clean_(record.descriptionClean)
    ].join(' ')
  );

  const matches = text.match(/\b\d{6}\b/g) || [];
  const customerNumber = tmv3_clean_(record.customerNumber);

  return tmv3_unique_(
    matches.filter(function(number) {
      return number !== customerNumber;
    })
  );
}

function tmv3_step3UniqueOrders_(orders) {
  const byKey = {};

  (orders || []).forEach(function(order) {
    const key =
      tmv3_clean_(order['Order ID']) ||
      ('NUMBER:' + tmv3_clean_(order['Order Number']));

    if (key) byKey[key] = order;
  });

  return Object.keys(byKey).map(function(key) {
    return byKey[key];
  });
}

function tmv3_step3AnchorFromOrder_(record, order, customer) {
  return {
    anchorType: record.vertical === 'Service' ? 'WORK_ORDER_OR_SALES_ORDER' : 'SALES_ORDER',
    orderId: tmv3_clean_(order && order['Order ID']),
    orderNumber: tmv3_clean_(order && order['Order Number']),
    orderType: tmv3_clean_(order && order['Order Type']),
    orderStatus: tmv3_clean_(order && order['Status']),
    orderUrl: tmv3_clean_(order && order['URL']),
    customerId: tmv3_clean_(order && order['Customer ID']),
    customerNumber: tmv3_clean_(customer && customer['Customer Number']),
    customerName: tmv3_clean_(customer && customer['Name']),
    orderLocationIdEvidence: tmv3_clean_(order && order['Location ID']),
    orderContactIdEvidence: tmv3_clean_(order && order['Contact ID']),
    orderEvidenceOnly: false
  };
}

function tmv3_step3AnchorFromPreInspection_(record, customer, order) {
  return {
    anchorType: customer ? 'CUSTOMER' : (order ? 'SALES_ORDER_EVIDENCE' : ''),
    customerId: tmv3_clean_(customer && customer['Customer ID']),
    customerNumber: tmv3_clean_(customer && customer['Customer Number']),
    customerName: tmv3_clean_(customer && customer['Name']),
    orderId: tmv3_clean_(order && order['Order ID']),
    orderNumber: tmv3_clean_(order && order['Order Number']),
    orderType: tmv3_clean_(order && order['Order Type']),
    orderStatus: tmv3_clean_(order && order['Status']),
    orderUrl: tmv3_clean_(order && order['URL']),
    orderLocationIdEvidence: tmv3_clean_(order && order['Location ID']),
    orderContactIdEvidence: tmv3_clean_(order && order['Contact ID']),
    orderEvidenceOnly: true
  };
}

function tmv3_step3Decision_(disposition, code, reason, anchor, evidence, warnings) {
  return {
    disposition: disposition,
    code: code,
    reason: reason,
    anchor: anchor || {},
    evidence: evidence || [],
    warnings: warnings || []
  };
}

function tmv3_step3BusinessAnchorRun(reason, refreshSources) {
  tmv3_assertShadow_();

  const sourceSummary =
    refreshSources === true
      ? tmv3_step3RefreshAnchorSources_()
      : tmv3_step3AnchorSourceSummary_();

  const step2Snapshot = tmv3_step2CalendarRecords_();
  const refs = tmv3_step3AnchorIndex_();
  const records = tmv3_step3BusinessAnchorRecords_(step2Snapshot, refs);
  const counts = tmv3_step3Counts_(records);
  const write = tmv3_step3WriteOperatorViews_(records);
  const verify = tmv3_step3Verify_(records, step2Snapshot);

  const result = {
    version: TMV3.VERSION,
    executionStage: tmv3_executionStage_(),
    stage: 3,
    status: verify.pass ? 'PASS' : 'REVIEW',
    mode: 'BUSINESS_ANCHOR_RESOLUTION_ONLY',
    reason: tmv3_clean_(reason || 'MANUAL'),
    sourceSummary: sourceSummary,
    counts: counts,
    write: write,
    verification: verify,
    calendarWritesPerformed: false,
    strivenWritesPerformed: false,
    taskResolutionPerformed: false,
    locationResolutionPerformed: false,
    contactResolutionPerformed: false
  };

  tmv3_audit_(
    'SYSTEM','','','STEP3_BUSINESS_ANCHOR',
    result.status,
    JSON.stringify(result)
  );

  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

function tmv3_step3BusinessAnchorRunCached(reason) {
  return tmv3_step3BusinessAnchorRun(
    reason || 'CACHED_ANCHOR_SOURCES',
    false
  );
}

function tmv3_step3Counts_(records) {
  const counts = {
    total: 0,
    eligible: 0,
    verified: 0,
    review: 0,
    blocked: 0,
    notRun: 0,
    byVertical: {}
  };

  (records || []).forEach(function(record) {
    counts.total++;

    if (!counts.byVertical[record.vertical]) {
      counts.byVertical[record.vertical] = {
        total:0, eligible:0, verified:0, review:0, blocked:0, notRun:0
      };
    }

    const bucket = counts.byVertical[record.vertical];
    bucket.total++;

    if (record.step2 && record.step2.disposition === 'ELIGIBLE') {
      counts.eligible++;
      bucket.eligible++;
    }

    const disposition = record.step3 ? record.step3.disposition : 'NOT_RUN';

    if (disposition === 'VERIFIED') {
      counts.verified++;
      bucket.verified++;
    } else if (disposition === 'REVIEW') {
      counts.review++;
      bucket.review++;
    } else if (disposition === 'BLOCKED') {
      counts.blocked++;
      bucket.blocked++;
    } else {
      counts.notRun++;
      bucket.notRun++;
    }
  });

  return counts;
}

function tmv3_step3WriteOperatorViews_(records) {
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

    const rows = verticalRecords.map(tmv3_step3OperatorRow_);
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

function tmv3_step3OperatorRow_(record) {
  const row = tmv3_step2OperatorRow_(record);
  const step2 = record.step2 || {};
  const step3 = record.step3 || {};

  if (step2.disposition !== 'ELIGIBLE') {
    return row;
  }

  const anchor = step3.anchor || {};
  const disposition = step3.disposition || 'REVIEW';

  row[4] = tmv3_step1CalendarChecklist_(record) +
    '\n✅ Step 2 Eligible' +
    '\n' +
    (disposition === 'VERIFIED'
      ? '✅ Business Anchor'
      : disposition === 'BLOCKED'
        ? '❌ Business Anchor'
        : '⚠ Business Anchor');

  row[5] = tmv3_step3AnchorSummary_(record, anchor);
  row[6] = 'NOT RUN — STEP 3';
  row[7] = 'NOT RUN — STEP 3';
  row[8] = 'NOT RUN — STEP 3';
  row[9] = 'STEP 3 — ' + disposition;

  const detail = [step3.reason || ''];

  if (step3.evidence && step3.evidence.length) {
    detail.push('Evidence: ' + step3.evidence.join(', '));
  }

  (step3.warnings || []).forEach(function(warning) {
    detail.push('Attention: ' + warning);
  });

  if (record.vertical === 'PreInspection' && anchor.orderId) {
    detail.push('SO is corroborating evidence only; it is not attached to the PreInspection Task.');
  }

  row[10] = detail.filter(Boolean).join('\n');

  return row;
}

function tmv3_step3AnchorSummary_(record, anchor) {
  if (!anchor || !Object.keys(anchor).length) return 'Anchor: —';

  const lines = [];

  if (anchor.customerNumber) {
    lines.push(
      'Customer #: ' +
      anchor.customerNumber +
      (anchor.customerName ? ' · ' + anchor.customerName : '')
    );
  }

  if (anchor.customerId) lines.push('Customer ID: ' + anchor.customerId);

  if (anchor.orderNumber) {
    lines.push(
      (record.vertical === 'Service' ? 'Work Order / SO #: ' : 'SO #: ') +
      anchor.orderNumber
    );
  }

  if (anchor.orderId) lines.push('Order ID: ' + anchor.orderId);
  if (anchor.orderType) lines.push('Order Type: ' + anchor.orderType);

  if (anchor.orderLocationIdEvidence) {
    lines.push('Order Location ID (evidence): ' + anchor.orderLocationIdEvidence);
  }

  return lines.length ? lines.join('\n') : 'Anchor: —';
}

function tmv3_step3Verify_(records, step2Snapshot) {
  const step2Keys = {};
  const step3Keys = {};
  let missingDecision = 0;
  let eligibleWithoutDecision = 0;
  let nonEligibleResolved = 0;

  (step2Snapshot || []).forEach(function(record) {
    step2Keys[record.logicalKey] = true;
  });

  (records || []).forEach(function(record) {
    step3Keys[record.logicalKey] = true;

    const s2 = record.step2 ? record.step2.disposition : '';
    const s3 = record.step3 ? record.step3.disposition : '';

    if (!s3) missingDecision++;

    if (
      s2 === 'ELIGIBLE' &&
      ['VERIFIED','REVIEW','BLOCKED'].indexOf(s3) === -1
    ) {
      eligibleWithoutDecision++;
    }

    if (
      s2 !== 'ELIGIBLE' &&
      s3 !== 'NOT_RUN'
    ) {
      nonEligibleResolved++;
    }
  });

  const missingFromStep3 = Object.keys(step2Keys).filter(function(key) {
    return !step3Keys[key];
  });

  const introducedByStep3 = Object.keys(step3Keys).filter(function(key) {
    return !step2Keys[key];
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
      eligibleWithoutDecision === 0 &&
      nonEligibleResolved === 0 &&
      missingFromStep3.length === 0 &&
      introducedByStep3.length === 0 &&
      rowCountsMatch,
    step2Records: (step2Snapshot || []).length,
    step3Records: (records || []).length,
    missingDecision: missingDecision,
    eligibleWithoutDecision: eligibleWithoutDecision,
    nonEligibleResolved: nonEligibleResolved,
    missingFromStep3: missingFromStep3.length,
    introducedByStep3: introducedByStep3.length,
    expectedRows: expectedRows,
    actualRows: actualRows
  };
}

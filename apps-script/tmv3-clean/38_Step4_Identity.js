/************************************************************
 * TM V3 — STAGE 4 CUSTOMER / CONTACT / LOCATION
 *
 * Contract:
 * - Consumes the exact Step-3 record set.
 * - Resolves Customer + Customer-owned Location.
 * - Resolves Contact when deterministic; Contact no-match is non-blocking,
 *   ambiguity or read failure is REVIEW.
 * - Does NOT resolve or mutate Tasks.
 * - Does NOT write Google Calendar.
 * - Does NOT write Striven.
 ************************************************************/

function tmv3_step4RefreshIdentitySources_() {
  tmv3_assertShadow_();
  tmv3_resetRuntimeMetrics_();

  const customers =
    tmv3_reportRows_(TMV3.PROPERTIES.CUSTOMERS)
      .map(tmv3_normalizeCustomer_);

  const customerNumberToId = {};
  customers.forEach(function(row) {
    const id = tmv3_clean_(row[0]);
    const number = tmv3_clean_(row[1]);
    if (id && number) customerNumberToId[number] = id;
  });

  const locations =
    tmv3_reportRows_(TMV3.PROPERTIES.LOCATIONS)
      .map(function(row) {
        return tmv3_normalizeLocation_(row, customerNumberToId);
      });

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
    TMV3.SHEETS.LOCATIONS,
    [
      'Location ID',
      'Customer ID',
      'Address 1',
      'Address 2',
      'City',
      'Province',
      'Postal Code',
      'Primary Phone',
      'Fingerprint'
    ],
    locations
  );

  const result = {
    customers: customers.length,
    locations: locations.length,
    contacts: 'ON_DEMAND_ONLY',
    api: tmv3_runtimeMetrics_()
  };

  tmv3_audit_(
    'SYSTEM','','','STEP4_REFRESH_IDENTITY_SOURCES','PASS',
    JSON.stringify(result)
  );

  return result;
}

function tmv3_step4IdentityIndex_() {
  const customers = tmv3_rows_(TMV3.SHEETS.CUSTOMERS);
  const locations = tmv3_rows_(TMV3.SHEETS.LOCATIONS);
  const orders = tmv3_rows_(TMV3.SHEETS.ORDERS);

  const refs = {
    customers: customers,
    locations: locations,
    contacts: [],
    orders: orders,
    customerById: {},
    customerByNumber: {},
    customerByPhone: {},
    locationsByCustomer: {},
    locationById: {},
    orderById: {}
  };

  customers.forEach(function(row) {
    const id = tmv3_clean_(row['Customer ID']);
    const number = tmv3_clean_(row['Customer Number']);
    const phone = tmv3_phone10_(row['Primary Phone']);

    if (id) refs.customerById[id] = row;
    if (number) refs.customerByNumber[number] = row;

    if (phone) {
      if (!refs.customerByPhone[phone]) refs.customerByPhone[phone] = [];
      refs.customerByPhone[phone].push(row);
    }
  });

  locations.forEach(function(row) {
    const id = tmv3_clean_(row['Location ID']);
    const customerId = tmv3_clean_(row['Customer ID']);

    if (id) refs.locationById[id] = row;

    if (customerId) {
      if (!refs.locationsByCustomer[customerId]) {
        refs.locationsByCustomer[customerId] = [];
      }
      refs.locationsByCustomer[customerId].push(row);
    }
  });

  orders.forEach(function(row) {
    const id = tmv3_clean_(row['Order ID']);
    if (id) refs.orderById[id] = row;
  });

  return refs;
}

function tmv3_step4IdentityRecords_(step3Records, refs) {
  return (step3Records || []).map(function(record) {
    const step3 = record.step3 || {};

    if (step3.disposition !== 'VERIFIED') {
      return Object.assign({}, record, {
        step4: {
          disposition: 'NOT_RUN',
          code: 'STEP3_' + (step3.disposition || 'UNKNOWN'),
          reason: 'Identity resolution did not run because Step 3 is not VERIFIED.',
          customer: null,
          location: null,
          contact: null,
          contactStatus: 'NOT_RUN',
          evidence: [],
          warnings: []
        }
      });
    }

    const result = tmv3_step4ResolveIdentity_(record, refs);
    return Object.assign({}, record, { step4: result });
  });
}

function tmv3_step4ResolveIdentity_(record, refs) {
  const step3 = record.step3 || {};
  const anchor = step3.anchor || {};

  if (record.vertical === 'Service') {
    return tmv3_step4ResolveServiceIdentity_(record, refs, anchor);
  }

  if (record.vertical === 'PreInspection') {
    return tmv3_step4ResolvePreInspectionIdentity_(record, refs, anchor);
  }

  return tmv3_step4ResolveOrderIdentity_(record, refs, anchor);
}

function tmv3_step4ResolveOrderIdentity_(record, refs, anchor) {
  const evidence = [];
  const warnings = [];

  const customerId = tmv3_clean_(anchor.customerId);
  const customer = customerId ? refs.customerById[customerId] : null;

  if (!customer) {
    return tmv3_step4Decision_(
      'BLOCKED',
      'CUSTOMER_FROM_ORDER_MISSING',
      'Step-3 Order anchor does not resolve to a current Customer.',
      null,
      null,
      null,
      'NOT_RESOLVED',
      evidence,
      warnings
    );
  }

  evidence.push('CUSTOMER_FROM_VERIFIED_ORDER');

  const locationResult = tmv3_step4ResolveLocation_(
    record,
    refs,
    customer,
    anchor.orderLocationIdEvidence
  );

  if (locationResult.status !== 'MATCHED') {
    return tmv3_step4Decision_(
      locationResult.status === 'BLOCKED' ? 'BLOCKED' : 'REVIEW',
      locationResult.errorCode,
      locationResult.reason,
      customer,
      null,
      null,
      'NOT_RESOLVED',
      evidence.concat(locationResult.evidence || []),
      warnings
    );
  }

  const contactResult = tmv3_step4ResolveContact_(
    record,
    customer,
    anchor.orderContactIdEvidence
  );

  if (contactResult.status === 'REVIEW') {
    return tmv3_step4Decision_(
      'REVIEW',
      contactResult.errorCode,
      contactResult.reason,
      customer,
      locationResult.location,
      null,
      'REVIEW',
      evidence.concat(locationResult.evidence || [], contactResult.evidence || []),
      warnings
    );
  }

  if (contactResult.status === 'NO_MATCH') {
    warnings.push('No deterministic Contact match; Customer and Location are still verified.');
  }

  return tmv3_step4Decision_(
    'VERIFIED',
    'ORDER_IDENTITY_VERIFIED',
    'Customer and Customer-owned Location are verified from the Step-3 business anchor.',
    customer,
    locationResult.location,
    contactResult.contact || null,
    contactResult.status,
    evidence.concat(locationResult.evidence || [], contactResult.evidence || []),
    warnings
  );
}

function tmv3_step4ResolveServiceIdentity_(record, refs, anchor) {
  const evidence = [];
  const warnings = [];

  let customer = null;
  let location = null;

  const anchorCustomerId = tmv3_clean_(anchor.customerId);

  if (anchorCustomerId && refs.customerById[anchorCustomerId]) {
    customer = refs.customerById[anchorCustomerId];
    evidence.push('SERVICE_CUSTOMER_FROM_WORK_ORDER');
  }

  const orderLocationId = tmv3_clean_(anchor.orderLocationIdEvidence);

  if (!customer && orderLocationId && refs.locationById[orderLocationId]) {
    const candidateLocation = refs.locationById[orderLocationId];
    const ownerId = tmv3_clean_(candidateLocation['Customer ID']);

    if (ownerId && refs.customerById[ownerId]) {
      customer = refs.customerById[ownerId];
      location = candidateLocation;
      evidence.push('SERVICE_CUSTOMER_FROM_WORK_ORDER_LOCATION');
      evidence.push('CUSTOMER_LOCATION_FROM_WORK_ORDER');
    }
  }

  if (!customer) {
    const recovery = tmv3_step4ResolveCustomerFromCalendarEvidence_(
      record,
      refs
    );

    if (recovery.status !== 'MATCHED') {
      return tmv3_step4Decision_(
        recovery.status === 'BLOCKED' ? 'BLOCKED' : 'REVIEW',
        recovery.errorCode,
        recovery.reason,
        recovery.customer || null,
        recovery.location || null,
        null,
        'NOT_RESOLVED',
        evidence.concat(recovery.evidence || []),
        warnings
      );
    }

    customer = recovery.customer;
    location = recovery.location || null;
    Array.prototype.push.apply(evidence, recovery.evidence || []);
  }

  if (!location) {
    const locationResult = tmv3_step4ResolveLocation_(
      record,
      refs,
      customer,
      orderLocationId
    );

    if (locationResult.status !== 'MATCHED') {
      return tmv3_step4Decision_(
        locationResult.status === 'BLOCKED' ? 'BLOCKED' : 'REVIEW',
        locationResult.errorCode,
        locationResult.reason,
        customer,
        null,
        null,
        'NOT_RESOLVED',
        evidence.concat(locationResult.evidence || []),
        warnings
      );
    }

    location = locationResult.location;
    Array.prototype.push.apply(evidence, locationResult.evidence || []);
  }

  const contactResult = tmv3_step4ResolveContact_(record, customer, '');

  if (contactResult.status === 'REVIEW') {
    return tmv3_step4Decision_(
      'REVIEW',
      contactResult.errorCode,
      contactResult.reason,
      customer,
      location,
      null,
      'REVIEW',
      evidence.concat(contactResult.evidence || []),
      warnings
    );
  }

  if (contactResult.status === 'NO_MATCH') {
    warnings.push('No deterministic Contact match; Customer and Location remain verified.');
  }

  return tmv3_step4Decision_(
    'VERIFIED',
    'SERVICE_IDENTITY_VERIFIED',
    'Service Customer and Customer-owned Location are verified from Work Order + Calendar evidence.',
    customer,
    location,
    contactResult.contact || null,
    contactResult.status,
    evidence.concat(contactResult.evidence || []),
    warnings
  );
}

function tmv3_step4ResolvePreInspectionIdentity_(record, refs, anchor) {
  const evidence = [];
  const warnings = [];

  let customer = null;

  const anchorCustomerId = tmv3_clean_(anchor.customerId);

  if (anchorCustomerId && refs.customerById[anchorCustomerId]) {
    customer = refs.customerById[anchorCustomerId];
    evidence.push('PREINSPECTION_CUSTOMER_FROM_STEP3');
  }

  if (!customer) {
    const recovery = tmv3_step4ResolveCustomerFromCalendarEvidence_(
      record,
      refs
    );

    if (recovery.status !== 'MATCHED') {
      return tmv3_step4Decision_(
        'REVIEW',
        recovery.errorCode,
        recovery.reason,
        recovery.customer || null,
        recovery.location || null,
        null,
        'NOT_RESOLVED',
        evidence.concat(recovery.evidence || []),
        warnings
      );
    }

    customer = recovery.customer;
    Array.prototype.push.apply(evidence, recovery.evidence || []);
  }

  const locationResult = tmv3_step4ResolveLocation_(
    record,
    refs,
    customer,
    anchor.orderLocationIdEvidence
  );

  if (locationResult.status !== 'MATCHED') {
    return tmv3_step4Decision_(
      'REVIEW',
      locationResult.errorCode,
      locationResult.reason,
      customer,
      null,
      null,
      'NOT_RESOLVED',
      evidence.concat(locationResult.evidence || []),
      warnings
    );
  }

  const contactResult = tmv3_step4ResolveContact_(record, customer, '');

  // PreInspection never invents a Contact. Contact ambiguity is retained as a
  // warning because Requested By comes from the Calendar organizer, not Contact.
  if (contactResult.status === 'REVIEW') {
    warnings.push(contactResult.reason || 'Contact requires review.');
  } else if (contactResult.status === 'NO_MATCH') {
    warnings.push('No deterministic Contact match; this does not block PreInspection.');
  }

  return tmv3_step4Decision_(
    'VERIFIED',
    'PREINSPECTION_IDENTITY_VERIFIED',
    'PreInspection Customer and Customer-owned Location are verified.',
    customer,
    locationResult.location,
    contactResult.status === 'MATCHED' ? contactResult.contact : null,
    contactResult.status,
    evidence.concat(locationResult.evidence || [], contactResult.evidence || []),
    warnings
  );
}

function tmv3_step4ResolveCustomerFromCalendarEvidence_(record, refs) {
  const explicit = tmv3_clean_(record.customerNumber);

  if (explicit) {
    const exactCustomer = refs.customerByNumber[explicit] || null;

    if (exactCustomer) {
      return {
        status: 'MATCHED',
        customer: exactCustomer,
        location: null,
        evidence: ['CUSTOMER_NUMBER_EXACT']
      };
    }

    return {
      status: 'REVIEW',
      errorCode: 'EXPLICIT_CUSTOMER_NUMBER_NOT_FOUND',
      reason:
        'Explicit Calendar Customer # ' +
        explicit +
        ' does not resolve to a Customer; other evidence will not silently override it.',
      evidence: []
    };
  }

  const phone = tmv3_phone10_(record.phone);

  if (phone) {
    const primaryMatches = refs.customerByPhone[phone] || [];

    if (primaryMatches.length === 1) {
      return {
        status: 'MATCHED',
        customer: primaryMatches[0],
        location: null,
        evidence: ['CUSTOMER_PRIMARY_PHONE_EXACT']
      };
    }

    if (primaryMatches.length > 1) {
      return {
        status: 'REVIEW',
        errorCode: 'AMBIGUOUS_CUSTOMER_PHONE',
        reason: 'Calendar phone matches multiple Customer primary phones.',
        evidence: []
      };
    }
  }

  const addressKey = tmv3_normalizeAddress_(record.location);

  if (addressKey) {
    const matchingLocations = refs.locations.filter(function(location) {
      return tmv3_normalizeAddress_(
        tmv3_locationFullAddress_(location)
      ) === addressKey;
    });

    const ownerIds = tmv3_unique_(
      matchingLocations
        .map(function(location) {
          return tmv3_clean_(location['Customer ID']);
        })
        .filter(Boolean)
    );

    if (ownerIds.length === 1 && refs.customerById[ownerIds[0]]) {
      const customer = refs.customerById[ownerIds[0]];
      const corroboration = tmv3_step4CorroborateCustomer_(
        record,
        customer
      );

      if (corroboration.matched) {
        const ownedExact = matchingLocations.filter(function(location) {
          return tmv3_clean_(location['Customer ID']) === ownerIds[0];
        });

        return {
          status: 'MATCHED',
          customer: customer,
          location: ownedExact.length === 1 ? ownedExact[0] : null,
          evidence: ['CUSTOMER_FROM_EXACT_ADDRESS'].concat(corroboration.evidence)
        };
      }

      return {
        status: 'REVIEW',
        errorCode: 'ADDRESS_OWNER_NOT_CORROBORATED',
        reason: 'Calendar address has one Customer owner, but name/phone evidence does not yet corroborate that household.',
        customer: customer,
        evidence: ['EXACT_ADDRESS_OWNER_ONLY']
      };
    }

    if (ownerIds.length > 1) {
      return {
        status: 'REVIEW',
        errorCode: 'AMBIGUOUS_ADDRESS_OWNER',
        reason: 'Calendar address is owned by multiple Customers.',
        evidence: []
      };
    }
  }

  return {
    status: 'REVIEW',
    errorCode: 'CUSTOMER_UNRESOLVED',
    reason: 'No deterministic Customer match was proven from Customer #, primary phone, or exact owned address.',
    evidence: []
  };
}

function tmv3_step4CorroborateCustomer_(record, customer) {
  const evidence = [];

  if (
    tmv3_nameCorroboratesCustomer_(
      record.title + ' ' + record.descriptionClean,
      customer['Name']
    )
  ) {
    evidence.push('CUSTOMER_NAME_CORROBORATES_ADDRESS');
    return { matched: true, evidence: evidence };
  }

  const eventPhones = tmv3_allPhones_(
    record.title + ' ' + record.descriptionClean + ' ' + record.location
  );

  const primary = tmv3_phone10_(customer['Primary Phone']);

  if (primary && eventPhones.indexOf(primary) !== -1) {
    evidence.push('CUSTOMER_PRIMARY_PHONE_CORROBORATES_ADDRESS');
    return { matched: true, evidence: evidence };
  }

  try {
    const contacts = tmv3_getCustomerContacts_(
      tmv3_clean_(customer['Customer ID'])
    );

    const matched = contacts.some(function(contact) {
      const phones = contact.Phones ||
        (contact['Phone'] ? [tmv3_phone10_(contact['Phone'])] : []);

      return phones.some(function(phone) {
        const clean = tmv3_phone10_(phone);
        return clean && eventPhones.indexOf(clean) !== -1;
      });
    });

    if (matched) {
      evidence.push('CUSTOMER_CONTACT_PHONE_CORROBORATES_ADDRESS');
      return { matched: true, evidence: evidence };
    }
  } catch (err) {
    return {
      matched: false,
      evidence: ['CONTACT_CORROBORATION_READ_FAILED']
    };
  }

  return { matched: false, evidence: evidence };
}

function tmv3_step4ResolveLocation_(record, refs, customer, preferredLocationId) {
  const customerId = tmv3_clean_(customer && customer['Customer ID']);

  if (!customerId) {
    return {
      status: 'BLOCKED',
      errorCode: 'LOCATION_CUSTOMER_REQUIRED',
      reason: 'Location cannot be resolved before Customer.',
      evidence: []
    };
  }

  if (preferredLocationId) {
    const preferred = refs.locationById[tmv3_clean_(preferredLocationId)] || null;

    if (!preferred) {
      return {
        status: 'REVIEW',
        errorCode: 'ORDER_LOCATION_NOT_IN_SOURCE',
        reason: 'Order Location ID is not present in the current Location source.',
        evidence: []
      };
    }

    if (tmv3_clean_(preferred['Customer ID']) !== customerId) {
      return {
        status: 'BLOCKED',
        errorCode: 'ORDER_LOCATION_OWNERSHIP_CONFLICT',
        reason: 'Order Location is not owned by the resolved Customer.',
        evidence: []
      };
    }

    return {
      status: 'MATCHED',
      location: preferred,
      evidence: ['LOCATION_FROM_BUSINESS_ANCHOR']
    };
  }

  return tmv3_resolveOwnedLocation_(
    customer,
    record.location,
    refs.locationsByCustomer[customerId] || []
  );
}

function tmv3_step4ResolveContact_(record, customer, preferredContactId) {
  const customerId = tmv3_clean_(customer && customer['Customer ID']);

  if (!customerId) {
    return {
      status: 'NO_MATCH',
      contact: null,
      evidence: []
    };
  }

  // Order Contact is deterministic relationship evidence. Fresh ownership is
  // still re-verified immediately before any later write.
  if (preferredContactId) {
    return {
      status: 'MATCHED',
      contact: {
        'Contact ID': tmv3_clean_(preferredContactId),
        'Customer ID': customerId,
        'Name': '',
        'Phone': '',
        'Email': ''
      },
      evidence: ['CONTACT_ID_FROM_VERIFIED_ORDER']
    };
  }

  const ix = tmv3_identityIndex_({
    contacts: [],
    locations: [],
    locationsByCustomer: {},
    customerByNumber: {},
    customerByPhone: {},
    customerById: {}
  });

  return tmv3_resolveOwnedContact_(
    customer,
    '',
    record,
    ix
  );
}

function tmv3_step4Decision_(
  disposition,
  code,
  reason,
  customer,
  location,
  contact,
  contactStatus,
  evidence,
  warnings
) {
  return {
    disposition: disposition,
    code: code,
    reason: reason,
    customer: customer || null,
    location: location || null,
    contact: contact || null,
    contactStatus: contactStatus || 'NO_MATCH',
    evidence: evidence || [],
    warnings: warnings || []
  };
}

function tmv3_step4IdentityRun(reason, refreshSources) {
  tmv3_assertShadow_();

  const sourceSummary =
    refreshSources === true
      ? tmv3_step4RefreshIdentitySources_()
      : {
          customers: tmv3_rows_(TMV3.SHEETS.CUSTOMERS).length,
          locations: tmv3_rows_(TMV3.SHEETS.LOCATIONS).length,
          contacts: 'ON_DEMAND_ONLY',
          source: 'CACHED_IDENTITY_SOURCES'
        };

  const step2Snapshot = tmv3_step2CalendarRecords_();
  const step3Refs = tmv3_step3AnchorIndex_();
  const step3Records = tmv3_step3BusinessAnchorRecords_(
    step2Snapshot,
    step3Refs
  );

  const refs = tmv3_step4IdentityIndex_();
  const records = tmv3_step4IdentityRecords_(step3Records, refs);
  const counts = tmv3_step4Counts_(records);
  const write = tmv3_step4WriteOperatorViews_(records);
  const verify = tmv3_step4Verify_(records, step3Records);

  const result = {
    version: TMV3.VERSION,
    executionStage: tmv3_executionStage_(),
    stage: 4,
    status: verify.pass ? 'PASS' : 'REVIEW',
    mode: 'CUSTOMER_CONTACT_LOCATION_RESOLUTION_ONLY',
    reason: tmv3_clean_(reason || 'MANUAL'),
    sourceSummary: sourceSummary,
    counts: counts,
    write: write,
    verification: verify,
    taskResolutionPerformed: false,
    calendarWritesPerformed: false,
    strivenWritesPerformed: false
  };

  tmv3_audit_(
    'SYSTEM','','','STEP4_IDENTITY',
    result.status,
    JSON.stringify(result)
  );

  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

function tmv3_step4IdentityRunCached(reason) {
  return tmv3_step4IdentityRun(
    reason || 'CACHED_IDENTITY_SOURCES',
    false
  );
}

function tmv3_step4Counts_(records) {
  const counts = {
    total:0,
    step3Verified:0,
    verified:0,
    review:0,
    blocked:0,
    notRun:0,
    contactMatched:0,
    contactNoMatch:0,
    byVertical:{}
  };

  (records || []).forEach(function(record) {
    counts.total++;

    if (!counts.byVertical[record.vertical]) {
      counts.byVertical[record.vertical] = {
        total:0,
        step3Verified:0,
        verified:0,
        review:0,
        blocked:0,
        notRun:0
      };
    }

    const bucket = counts.byVertical[record.vertical];
    bucket.total++;

    if (record.step3 && record.step3.disposition === 'VERIFIED') {
      counts.step3Verified++;
      bucket.step3Verified++;
    }

    const disposition = record.step4 ? record.step4.disposition : 'NOT_RUN';

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

    if (record.step4 && record.step4.contactStatus === 'MATCHED') {
      counts.contactMatched++;
    }

    if (record.step4 && record.step4.contactStatus === 'NO_MATCH') {
      counts.contactNoMatch++;
    }
  });

  return counts;
}

function tmv3_step4WriteOperatorViews_(records) {
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

    const rows = verticalRecords.map(tmv3_step4OperatorRow_);
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

function tmv3_step4OperatorRow_(record) {
  const row = tmv3_step3OperatorRow_(record);
  const step3 = record.step3 || {};
  const step4 = record.step4 || {};

  if (step3.disposition !== 'VERIFIED') {
    return row;
  }

  const customer = step4.customer || null;
  const location = step4.location || null;
  const contact = step4.contact || null;
  const disposition = step4.disposition || 'REVIEW';

  row[4] = tmv3_step4SyncChecklist_(record, step4);
  row[5] = tmv3_step4IdentitySummary_(customer, location, contact, step4.contactStatus);
  row[6] = 'Task not resolved yet';
  row[7] = '';
  row[8] = '';
  row[9] = 'STEP 4 — ' + disposition;

  const details = [step4.reason || ''];

  (step4.warnings || []).forEach(function(warning) {
    details.push('Attention: ' + warning);
  });

  row[10] = details.filter(Boolean).join('\n');

  return row;
}

function tmv3_step4SyncChecklist_(record, step4) {
  const customerOk = !!(
    step4.customer &&
    tmv3_clean_(step4.customer['Customer ID'])
  );

  const locationOk = !!(
    step4.location &&
    tmv3_clean_(step4.location['Location ID'])
  );

  return [
    'Customer ' + (customerOk ? '✅' : '⚠'),
    'Location ' + (locationOk ? '✅' : '⚠'),
    'Date / Time ⏳',
    'Assignee ⏳',
    'Notes ⏳',
    'Task Link ' + (record.existingTaskUrl ? '✅' : '⏳')
  ].join('\n');
}

function tmv3_step4IdentitySummary_(customer, location, contact, contactStatus) {
  const lines = [];

  if (customer) {
    lines.push(
      'Customer: #' +
      (tmv3_clean_(customer['Customer Number']) || '—') +
      ' · ' +
      (tmv3_clean_(customer['Name']) || '—')
    );
  } else {
    lines.push('Customer: —');
  }

  if (location) {
    lines.push(
      'Location ID: ' +
      (tmv3_clean_(location['Location ID']) || '—')
    );
  } else {
    lines.push('Location ID: —');
  }

  if (contact && tmv3_clean_(contact['Contact ID'])) {
    lines.push('Contact ID: ' + tmv3_clean_(contact['Contact ID']));
  } else {
    lines.push(
      'Contact: ' +
      (contactStatus === 'REVIEW' ? 'Review' : 'Not required / not resolved')
    );
  }

  return lines.join('\n');
}

function tmv3_step4Verify_(records, step3Records) {
  const priorKeys = {};
  const currentKeys = {};
  let missingDecision = 0;
  let verifiedWithoutIdentity = 0;
  let nonVerifiedAdvanced = 0;

  (step3Records || []).forEach(function(record) {
    priorKeys[record.logicalKey] = true;
  });

  (records || []).forEach(function(record) {
    currentKeys[record.logicalKey] = true;

    const s3 = record.step3 ? record.step3.disposition : '';
    const s4 = record.step4 ? record.step4.disposition : '';

    if (!s4) missingDecision++;

    if (
      s4 === 'VERIFIED' &&
      (
        !record.step4.customer ||
        !tmv3_clean_(record.step4.customer['Customer ID']) ||
        !record.step4.location ||
        !tmv3_clean_(record.step4.location['Location ID'])
      )
    ) {
      verifiedWithoutIdentity++;
    }

    if (s3 !== 'VERIFIED' && s4 !== 'NOT_RUN') {
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
      verifiedWithoutIdentity === 0 &&
      nonVerifiedAdvanced === 0 &&
      missing.length === 0 &&
      introduced.length === 0 &&
      rowCountsMatch,
    step3Records: (step3Records || []).length,
    step4Records: (records || []).length,
    missingDecision: missingDecision,
    verifiedWithoutIdentity: verifiedWithoutIdentity,
    nonVerifiedAdvanced: nonVerifiedAdvanced,
    missingFromStep4: missing.length,
    introducedByStep4: introduced.length,
    expectedRows: expectedRows,
    actualRows: actualRows
  };
}

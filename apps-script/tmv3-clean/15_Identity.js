/************************************************************
 * TM V3 — SHARED IDENTITY RESOLUTION
 *
 * Goals:
 * - One evidence ladder across all four verticals.
 * - Order-required verticals derive Customer from the verified
 *   Sales Order / Work Order rather than fuzzy Calendar text.
 * - PreInspection can resolve without an Order, but explicit
 *   Customer Number evidence is authoritative: if it is wrong,
 *   V3 REVIEWs rather than silently overriding it.
 * - Same surname alone is never enough.
 * - Customer-owned Location / Contact relationships are mandatory.
 ************************************************************/

function tmv3_identityIndex_(refs) {
  const out = {
    contactsByCustomer: {},
    contactsByPhone: {},
    contactsByEmail: {},
    locationsByCustomer: refs.locationsByCustomer || {},
    locationOwnersByAddress: {},
    customerByNumber: refs.customerByNumber || {},
    customerByPhone: refs.customerByPhone || {},
    customerById: refs.customerById || {}
  };

  (refs.contacts || []).forEach(function(r) {
    const customerId = tmv3_clean_(r['Customer ID']);
    const phone = tmv3_phone10_(r['Phone']);
    const email = tmv3_normEmail_(r['Email']);

    if (customerId) {
      if (!out.contactsByCustomer[customerId]) out.contactsByCustomer[customerId] = [];
      out.contactsByCustomer[customerId].push(r);
    }

    if (phone) {
      if (!out.contactsByPhone[phone]) out.contactsByPhone[phone] = [];
      out.contactsByPhone[phone].push(r);
    }

    if (email) {
      if (!out.contactsByEmail[email]) out.contactsByEmail[email] = [];
      out.contactsByEmail[email].push(r);
    }
  });

  (refs.locations || []).forEach(function(r) {
    const key = tmv3_normalizeAddress_(tmv3_locationFullAddress_(r));
    if (!key) return;
    if (!out.locationOwnersByAddress[key]) out.locationOwnersByAddress[key] = [];
    out.locationOwnersByAddress[key].push(r);
  });

  return out;
}

function tmv3_resolveIdentity_(eventRecord, cfg, refs, order) {
  const ix = tmv3_identityIndex_(refs);
  let evidence = [];

  let customer = null;
  let location = null;
  let contact = null;

  if (cfg.orderRequired) {
    if (!order) {
      return tmv3_identityFail_(
        'BLOCKED',
        'ORDER_REQUIRED',
        cfg.orderLabel + ' is required before identity can be resolved.'
      );
    }

    const customerId = tmv3_clean_(order['Customer ID']);
    if (!customerId || !refs.customerById[customerId]) {
      return tmv3_identityFail_(
        'BLOCKED',
        'ORDER_CUSTOMER_MISSING',
        'Verified ' + cfg.orderLabel + ' does not resolve to a valid Customer.'
      );
    }

    customer = refs.customerById[customerId];
    evidence.push('CUSTOMER_FROM_' + tmv3_normCode_(cfg.orderLabel));

    const orderLocationId = tmv3_clean_(order['Location ID']);
    if (orderLocationId) {
      const orderLocation =
        refs.locationById && refs.locationById[orderLocationId]
          ? refs.locationById[orderLocationId]
          : null;

      if (orderLocation) {
        if (tmv3_clean_(orderLocation['Customer ID']) !== customerId) {
          return tmv3_identityFail_(
            'BLOCKED',
            'ORDER_LOCATION_OWNERSHIP_CONFLICT',
            cfg.orderLabel + ' Location resolves to a Location owned by a different Customer.',
            customer,
            null,
            null,
            evidence
          );
        }

        location = orderLocation;
        evidence.push('LOCATION_FROM_' + tmv3_normCode_(cfg.orderLabel));
      } else {
        // Missing source evidence is not the same as a proven ownership
        // conflict. Fall back only to the normal customer-owned Location
        // resolver, which still requires a strong address match.
        evidence.push('ORDER_LOCATION_ID_NOT_IN_LOCATION_SOURCE');
      }
    }

    if (!location) {
      const locResult = tmv3_resolveOwnedLocation_(
        customer,
        eventRecord.location,
        refs.locationsByCustomer[customerId] || []
      );

      if (locResult.status !== 'MATCHED') {
        return tmv3_identityFail_(
          locResult.status,
          locResult.errorCode,
          locResult.reason,
          customer,
          null,
          null,
          evidence.concat(locResult.evidence || [])
        );
      }

      location = locResult.location;
      evidence = evidence.concat(locResult.evidence || []);
    }

    const orderContactId = tmv3_clean_(order['Contact ID']);
    const contactResult = tmv3_resolveOwnedContact_(
      customer,
      orderContactId,
      eventRecord,
      ix
    );

    if (contactResult.status === 'REVIEW') {
      return tmv3_identityFail_(
        'REVIEW',
        contactResult.errorCode,
        contactResult.reason,
        customer,
        location,
        null,
        evidence.concat(contactResult.evidence || [])
      );
    }

    contact = contactResult.contact || null;
    evidence = evidence.concat(contactResult.evidence || []);

    return {
      status: 'MATCHED',
      customer: customer,
      location: location,
      contact: contact,
      evidence: evidence
    };
  }

  // PreInspection / no-order-required path.
  const explicitCustomerNumber = tmv3_clean_(eventRecord.customerNumber);

  if (explicitCustomerNumber) {
    customer = refs.customerByNumber[explicitCustomerNumber] || null;

    if (!customer) {
      return tmv3_identityFail_(
        'REVIEW',
        'EXPLICIT_CUSTOMER_NUMBER_NOT_FOUND',
        'Explicit Customer Number ' + explicitCustomerNumber +
          ' was not found. Other evidence is retained but cannot silently override it.'
      );
    }

    evidence.push('CUSTOMER_NUMBER_EXACT');
  }

  if (!customer && eventRecord.phone) {
    const phoneMatches = refs.customerByPhone[tmv3_phone10_(eventRecord.phone)] || [];

    if (phoneMatches.length === 1) {
      customer = phoneMatches[0];
      evidence.push('CUSTOMER_PHONE_EXACT');
    } else if (phoneMatches.length > 1) {
      return tmv3_identityFail_(
        'REVIEW',
        'AMBIGUOUS_CUSTOMER_PHONE',
        'Calendar phone matches multiple Customers.'
      );
    }
  }

  if (!customer && eventRecord.location) {
    const addressKey = tmv3_normalizeAddress_(eventRecord.location);
    const ownedLocations = ix.locationOwnersByAddress[addressKey] || [];
    const ownerIds = tmv3_unique_(ownedLocations.map(function(r) {
      return tmv3_clean_(r['Customer ID']);
    }));

    if (ownerIds.length === 1 && refs.customerById[ownerIds[0]]) {
      const candidateCustomer = refs.customerById[ownerIds[0]];
      const nameCheck = tmv3_nameCorroboratesCustomer_(
        eventRecord.title + ' ' + eventRecord.description,
        candidateCustomer['Name']
      );

      // Exact address can identify a household, but same surname alone is not
      // treated as proof. Require at least useful name or phone corroboration.
      if (nameCheck || tmv3_phoneCorroboratesCustomer_(eventRecord, candidateCustomer, ix)) {
        customer = candidateCustomer;
        evidence.push('CUSTOMER_FROM_EXACT_ADDRESS_PLUS_IDENTITY');
      }
    }
  }

  if (!customer) {
    return tmv3_identityFail_(
      'REVIEW',
      'CUSTOMER_UNRESOLVED',
      'No deterministic Customer match was proven.'
    );
  }

  const customerId = tmv3_clean_(customer['Customer ID']);
  const locResult = tmv3_resolveOwnedLocation_(
    customer,
    eventRecord.location,
    refs.locationsByCustomer[customerId] || []
  );

  if (locResult.status !== 'MATCHED') {
    return tmv3_identityFail_(
      locResult.status,
      locResult.errorCode,
      locResult.reason,
      customer,
      null,
      null,
      evidence.concat(locResult.evidence || [])
    );
  }

  location = locResult.location;
  evidence = evidence.concat(locResult.evidence || []);

  const contactResult = tmv3_resolveOwnedContact_(
    customer,
    '',
    eventRecord,
    ix
  );

  // PreInspection contact ambiguity does not invent a Contact. It can continue
  // without one unless another rule explicitly requires it.
  if (contactResult.status === 'MATCHED') {
    contact = contactResult.contact || null;
    evidence = evidence.concat(contactResult.evidence || []);
  } else if (contactResult.status === 'REVIEW') {
    evidence.push('CONTACT_UNRESOLVED_NO_WRITE');
  }

  return {
    status: 'MATCHED',
    customer: customer,
    location: location,
    contact: contact,
    evidence: evidence
  };
}

function tmv3_resolveOwnedLocation_(customer, calendarAddress, ownedLocations) {
  const customerId = tmv3_clean_(customer && customer['Customer ID']);
  const target = tmv3_normalizeAddress_(calendarAddress);

  if (!target) {
    return {
      status: 'REVIEW',
      errorCode: 'CALENDAR_LOCATION_MISSING',
      reason: 'Calendar appointment has no usable Location.',
      evidence: []
    };
  }

  const exact = (ownedLocations || []).filter(function(r) {
    return tmv3_normalizeAddress_(tmv3_locationFullAddress_(r)) === target;
  });

  if (exact.length === 1) {
    return {
      status: 'MATCHED',
      location: exact[0],
      evidence: ['CUSTOMER_LOCATION_EXACT']
    };
  }

  if (exact.length > 1) {
    return {
      status: 'REVIEW',
      errorCode: 'AMBIGUOUS_EXACT_LOCATION',
      reason: 'Multiple Customer-owned Locations normalize to the Calendar address.',
      evidence: []
    };
  }

  const targetParts = tmv3_addressParts_(calendarAddress);
  const strong = (ownedLocations || []).filter(function(r) {
    const parts = tmv3_addressParts_(tmv3_locationFullAddress_(r));
    return tmv3_addressStrongMatch_(targetParts, parts);
  });

  if (strong.length === 1) {
    return {
      status: 'MATCHED',
      location: strong[0],
      evidence: ['CUSTOMER_LOCATION_STRONG']
    };
  }

  if (strong.length > 1) {
    return {
      status: 'REVIEW',
      errorCode: 'AMBIGUOUS_STRONG_LOCATION',
      reason: 'Multiple Customer-owned Locations strongly match the Calendar address.',
      evidence: []
    };
  }

  return {
    status: 'REVIEW',
    errorCode: 'LOCATION_UNRESOLVED',
    reason: customerId
      ? 'Customer is proven, but the Calendar address does not match a known Customer-owned Location.'
      : 'Location cannot be resolved because Customer ownership is unknown.',
    evidence: []
  };
}

function tmv3_resolveOwnedContact_(customer, preferredContactId, eventRecord, ix) {
  const customerId = tmv3_clean_(customer && customer['Customer ID']);
  let owned = (ix.contactsByCustomer[customerId] || []).slice();

  if (preferredContactId) {
    const preferred = owned.filter(function(r) {
      return tmv3_clean_(r['Contact ID']) === tmv3_clean_(preferredContactId);
    });

    if (preferred.length === 1) {
      return {
        status: 'MATCHED',
        contact: preferred[0],
        evidence: ['CONTACT_FROM_CACHE']
      };
    }

    try {
      const direct = tmv3_getContactById_(preferredContactId, customerId);

      if (direct && direct.__ownershipVerified) {
        return {
          status: 'MATCHED',
          contact: direct,
          evidence: ['CONTACT_FROM_ORDER_VERIFIED_BY_API']
        };
      }
    } catch (err) {
      return {
        status: 'REVIEW',
        errorCode: 'CONTACT_READ_FAILED',
        reason:
          'Order Contact ' +
          preferredContactId +
          ' could not be freshly verified: ' +
          String(err && err.message || err),
        evidence: []
      };
    }

    return {
      status: 'REVIEW',
      errorCode: 'ORDER_CONTACT_OWNERSHIP_CONFLICT',
      reason: 'Order Contact is not proven to belong to the resolved Customer.',
      evidence: []
    };
  }

  try {
    owned = tmv3_getCustomerContacts_(customerId);
  } catch (err) {
    return {
      status: 'REVIEW',
      errorCode: 'CUSTOMER_CONTACTS_READ_FAILED',
      reason:
        'Customer Contacts could not be read: ' +
        String(err && err.message || err),
      evidence: []
    };
  }

  const emails = tmv3_extractEmails_(
    eventRecord.title + ' ' + eventRecord.description
  );
  const phones = tmv3_allPhones_(
    eventRecord.title + ' ' + eventRecord.description + ' ' + eventRecord.location
  );

  let candidates = owned.filter(function(r) {
    const emailList = r.Emails || (r['Email'] ? [tmv3_normEmail_(r['Email'])] : []);
    const phoneList = r.Phones || (r['Phone'] ? [tmv3_phone10_(r['Phone'])] : []);

    const emailHit = emailList.some(function(email) {
      return email && emails.indexOf(tmv3_normEmail_(email)) !== -1;
    });

    const phoneHit = phoneList.some(function(phone) {
      const cleanPhone = tmv3_phone10_(phone);
      return cleanPhone && phones.indexOf(cleanPhone) !== -1;
    });

    return emailHit || phoneHit;
  });

  const seen = {};
  candidates = candidates.filter(function(r) {
    const id = tmv3_clean_(r['Contact ID']);
    if (!id || seen[id]) return false;
    seen[id] = true;
    return true;
  });

  if (candidates.length === 1) {
    return {
      status: 'MATCHED',
      contact: candidates[0],
      evidence: ['CUSTOMER_CONTACT_PHONE_EMAIL_EXACT']
    };
  }

  if (candidates.length > 1) {
    return {
      status: 'REVIEW',
      errorCode: 'AMBIGUOUS_CONTACT',
      reason: 'Calendar phone/email matches multiple Contacts owned by the Customer.',
      evidence: []
    };
  }

  if (owned.length === 1) {
    return {
      status: 'MATCHED',
      contact: owned[0],
      evidence: ['ONLY_CUSTOMER_CONTACT']
    };
  }

  return {
    status: 'NO_MATCH',
    contact: null,
    evidence: []
  };
}

function tmv3_identityFail_(status, errorCode, reason, customer, location, contact, evidence) {
  return {
    status: status || 'REVIEW',
    errorCode: errorCode || 'IDENTITY_REVIEW',
    reason: reason || 'Identity requires review.',
    customer: customer || null,
    location: location || null,
    contact: contact || null,
    evidence: evidence || []
  };
}

function tmv3_normalizeAddress_(value) {
  return tmv3_clean_(value)
    .toLowerCase()
    .replace(/&amp;/g, ' and ')
    .replace(/\bcanada\b/g, ' ')
    .replace(/\bontario\b/g, ' on ')
    .replace(/\broad\b/g, ' rd ')
    .replace(/\bstreet\b/g, ' st ')
    .replace(/\bavenue\b/g, ' ave ')
    .replace(/\bdrive\b/g, ' dr ')
    .replace(/\bcrescent\b/g, ' cres ')
    .replace(/\bcourt\b/g, ' ct ')
    .replace(/\bboulevard\b/g, ' blvd ')
    .replace(/\bplace\b/g, ' pl ')
    .replace(/\blane\b/g, ' ln ')
    .replace(/[.,#()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tmv3_addressParts_(value) {
  const normalized = tmv3_normalizeAddress_(value);
  const postal = (tmv3_clean_(value).toUpperCase().match(/\b[A-Z]\d[A-Z]\s?\d[A-Z]\d\b/) || [])[0] || '';
  const streetNo = (normalized.match(/^\s*(\d+[a-z]?)/i) || [])[1] || '';
  const tokens = normalized.split(' ').filter(Boolean);

  return {
    normalized: normalized,
    postal: postal.replace(/\s+/g, ''),
    streetNo: streetNo,
    tokens: tokens
  };
}

function tmv3_addressStrongMatch_(a, b) {
  if (!a || !b || !a.normalized || !b.normalized) return false;
  if (a.streetNo && b.streetNo && a.streetNo !== b.streetNo) return false;

  if (a.postal && b.postal && a.postal !== b.postal) return false;

  const aSet = {};
  a.tokens.forEach(function(t) { if (t.length > 2) aSet[t] = true; });
  const overlap = b.tokens.filter(function(t) {
    return t.length > 2 && aSet[t];
  }).length;

  return overlap >= 3 || (
    !!a.streetNo &&
    a.streetNo === b.streetNo &&
    overlap >= 2
  );
}

function tmv3_locationFullAddress_(r) {
  return [
    r['Address 1'],
    r['Address 2'],
    r['City'],
    r['Province'],
    r['Postal Code']
  ].map(tmv3_clean_).filter(Boolean).join(' ');
}

function tmv3_extractEmails_(text) {
  const matches = tmv3_clean_(text).match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
  return tmv3_unique_(matches.map(tmv3_normEmail_));
}

function tmv3_normEmail_(value) {
  return tmv3_clean_(value).toLowerCase();
}

function tmv3_nameCorroboratesCustomer_(haystack, customerName) {
  const hay = tmv3_norm_(haystack);
  const name = tmv3_norm_(customerName);
  if (!hay || !name) return false;

  if (hay.indexOf(name) !== -1) return true;

  const parts = name.split(' ').filter(function(x) { return x.length > 1; });
  if (parts.length < 2) return false;

  const first = parts[0];
  const last = parts[parts.length - 1];

  // Minor first-name tolerance is allowed only with the same surname and
  // other evidence. Surname alone is never enough.
  return hay.indexOf(last) !== -1 && hay.indexOf(first) !== -1;
}

function tmv3_phoneCorroboratesCustomer_(eventRecord, customer, ix) {
  const phones = tmv3_allPhones_(
    eventRecord.title + ' ' + eventRecord.description + ' ' + eventRecord.location
  );

  if (!phones.length) return false;

  const customerId = tmv3_clean_(customer && customer['Customer ID']);
  const primary = tmv3_phone10_(customer && customer['Primary Phone']);
  if (primary && phones.indexOf(primary) !== -1) return true;

  return (ix.contactsByCustomer[customerId] || []).some(function(r) {
    const p = tmv3_phone10_(r['Phone']);
    return p && phones.indexOf(p) !== -1;
  });
}

function tmv3_normCode_(value) {
  return tmv3_clean_(value).toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

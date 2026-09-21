/************************************************************
 * 98_1_Contact_Resolution_R1.js
 *
 * Shared, fail-closed Customer -> Contact resolver.
 * Canonical source: Striven_Customers (customer report cache).
 *
 * Safety:
 * - Read-only. No Striven or Calendar writes.
 * - Customer ID/number is preferred over name.
 * - Exact email/phone evidence may disambiguate multiple contacts.
 * - Never selects the first contact from an ambiguous customer.
 ************************************************************/

const TM_CONTACT_R1 = Object.freeze({
  VERSION: 'TM_CONTACT_RESOLUTION_R1_20260921',
  CUSTOMERS_SHEET: 'Striven_Customers'
});

let TM_CONTACT_R1_INDEX_CACHE = null;

function tmContactR1Clean_(value) {
  return String(value === null || value === undefined ? '' : value).trim();
}

function tmContactR1PositiveId_(value) {
  const n = Number(String(value === null || value === undefined ? '' : value).replace(/[^0-9.-]/g, ''));
  return isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

function tmContactR1NormalizeName_(value) {
  return tmContactR1Clean_(value)
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tmContactR1NormalizeEmail_(value) {
  return tmContactR1Clean_(value).toLowerCase();
}

function tmContactR1NormalizePhone_(value) {
  const digits = tmContactR1Clean_(value).replace(/\D/g, '');
  if (!digits) return '';
  return digits.length >= 10 ? digits.slice(-10) : digits;
}

function tmContactR1Unique_(values) {
  const seen = {};
  const out = [];
  (values || []).forEach(function(value) {
    const key = String(value || '');
    if (!key || seen[key]) return;
    seen[key] = true;
    out.push(value);
  });
  return out;
}

function tmContactR1HeaderIndex_(headers, aliases) {
  const normalized = (headers || []).map(function(header) {
    return tmContactR1Clean_(header).toLowerCase();
  });
  for (let i = 0; i < aliases.length; i++) {
    const idx = normalized.indexOf(String(aliases[i] || '').toLowerCase());
    if (idx >= 0) return idx;
  }
  return -1;
}

function tmContactR1PushIndex_(index, key, row) {
  const clean = tmContactR1Clean_(key);
  if (!clean) return;
  if (!index[clean]) index[clean] = [];
  index[clean].push(row);
}

function tmContactR1BuildIndexFromValues_(values) {
  const rows = Array.isArray(values) ? values : [];
  if (rows.length < 2) {
    return { status: 'EMPTY', rows: [], byCustomerId: {}, byCustomerNumber: {}, byName: {} };
  }

  const headers = rows[0].map(function(v) { return tmContactR1Clean_(v); });
  const customerIdIdx = tmContactR1HeaderIndex_(headers, ['CustomerCustomerId', 'CustomerId', 'Customer ID']);
  const customerNumberIdx = tmContactR1HeaderIndex_(headers, ['CustomerNumber', 'Customer Number', 'Customer #']);
  const nameIdx = tmContactR1HeaderIndex_(headers, ['FullName', 'CustomerName', 'Customer Name', 'Name']);
  const contactIdIdx = tmContactR1HeaderIndex_(headers, ['ContactId', 'ContactContactId', 'PrimaryContactId', 'Contact ID']);
  const emailIdx = tmContactR1HeaderIndex_(headers, ['PrimaryEmail', 'ContactEmail', 'Email', 'EmailAddress']);
  const primaryPhoneIdx = tmContactR1HeaderIndex_(headers, ['PrimaryPhone', 'ContactPrimaryPhone', 'Contact Phone']);
  const customerPhoneIdx = tmContactR1HeaderIndex_(headers, ['CustomerPrimaryPhone', 'Customer Phone']);

  if (customerIdIdx < 0 && customerNumberIdx < 0) {
    throw new Error('Striven_Customers is missing both Customer ID and Customer Number columns.');
  }
  if (contactIdIdx < 0) {
    throw new Error('Striven_Customers is missing ContactId.');
  }

  const out = { status: 'READY', rows: [], byCustomerId: {}, byCustomerNumber: {}, byName: {} };

  for (let r = 1; r < rows.length; r++) {
    const raw = rows[r] || [];
    const item = {
      sourceRow: r + 1,
      customerId: customerIdIdx >= 0 ? tmContactR1PositiveId_(raw[customerIdIdx]) : 0,
      customerNumber: customerNumberIdx >= 0 ? tmContactR1Clean_(raw[customerNumberIdx]) : '',
      customerName: nameIdx >= 0 ? tmContactR1Clean_(raw[nameIdx]) : '',
      contactId: tmContactR1PositiveId_(raw[contactIdIdx]),
      email: emailIdx >= 0 ? tmContactR1NormalizeEmail_(raw[emailIdx]) : '',
      phones: tmContactR1Unique_([
        primaryPhoneIdx >= 0 ? tmContactR1NormalizePhone_(raw[primaryPhoneIdx]) : '',
        customerPhoneIdx >= 0 ? tmContactR1NormalizePhone_(raw[customerPhoneIdx]) : ''
      ].filter(Boolean))
    };

    if (!item.customerId && !item.customerNumber && !item.customerName) continue;
    out.rows.push(item);
    if (item.customerId) tmContactR1PushIndex_(out.byCustomerId, String(item.customerId), item);
    if (item.customerNumber) tmContactR1PushIndex_(out.byCustomerNumber, item.customerNumber, item);
    const nameKey = tmContactR1NormalizeName_(item.customerName);
    if (nameKey) tmContactR1PushIndex_(out.byName, nameKey, item);
  }

  return out;
}

function tmContactR1ExtractEmails_(text) {
  const matches = String(text || '').match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
  return tmContactR1Unique_(matches.map(tmContactR1NormalizeEmail_).filter(Boolean));
}

function tmContactR1ExtractPhones_(text) {
  const matches = String(text || '').match(/(?:\+?1[\s.()-]*)?(?:\d[\s.()-]*){10}(?:\s*(?:x|ext\.?|extension)\s*\d+)?/gi) || [];
  return tmContactR1Unique_(matches.map(tmContactR1NormalizePhone_).filter(function(v) { return v.length === 10; }));
}

function tmContactR1UniqueContactIds_(rows) {
  return tmContactR1Unique_((rows || []).map(function(row) {
    return row && row.contactId ? Number(row.contactId) : 0;
  }).filter(Boolean));
}

function tmContactR1CandidateRows_(index, input) {
  const customerId = tmContactR1PositiveId_(input && input.customerId);
  const customerNumber = tmContactR1Clean_(input && input.customerNumber);
  const customerName = tmContactR1NormalizeName_(input && input.customerName);

  if (customerId && index.byCustomerId[String(customerId)]) {
    return { rows: index.byCustomerId[String(customerId)], keyType: 'CUSTOMER_ID', keyValue: String(customerId) };
  }
  if (customerNumber && index.byCustomerNumber[customerNumber]) {
    return { rows: index.byCustomerNumber[customerNumber], keyType: 'CUSTOMER_NUMBER', keyValue: customerNumber };
  }
  if (customerName && index.byName[customerName]) {
    const nameRows = index.byName[customerName];
    const identities = tmContactR1Unique_(nameRows.map(function(row) {
      return row.customerId ? 'ID:' + row.customerId : 'NO:' + row.customerNumber;
    }).filter(Boolean));
    if (identities.length === 1) {
      return { rows: nameRows, keyType: 'UNIQUE_EXACT_NAME', keyValue: customerName };
    }
    return { rows: [], keyType: 'AMBIGUOUS_NAME', keyValue: customerName, ambiguousNameCount: identities.length };
  }
  return { rows: [], keyType: 'NO_CUSTOMER_MATCH', keyValue: '' };
}

function tmContactR1ResolveFromIndex_(index, input) {
  if (!index || index.status !== 'READY') {
    return { status: 'CONTACT_SOURCE_UNAVAILABLE', contactId: 0, matchType: '', candidateContactCount: 0 };
  }

  const selected = tmContactR1CandidateRows_(index, input || {});
  if (!selected.rows.length) {
    return {
      status: selected.keyType === 'AMBIGUOUS_NAME' ? 'CONTACT_REVIEW_CUSTOMER_AMBIGUOUS' : 'CONTACT_MISSING_CUSTOMER',
      contactId: 0,
      matchType: selected.keyType,
      candidateContactCount: 0
    };
  }

  const evidenceText = String((input && input.evidenceText) || '');
  const evidenceEmails = tmContactR1ExtractEmails_(evidenceText);
  const evidencePhones = tmContactR1ExtractPhones_(evidenceText);
  const contactIds = tmContactR1UniqueContactIds_(selected.rows);

  if (evidenceEmails.length) {
    const emailRows = selected.rows.filter(function(row) {
      return row.email && evidenceEmails.indexOf(row.email) !== -1;
    });
    const emailIds = tmContactR1UniqueContactIds_(emailRows);
    if (emailIds.length === 1) {
      return { status: 'CONTACT_RESOLVED', contactId: emailIds[0], matchType: 'EMAIL_EXACT', candidateContactCount: contactIds.length };
    }
  }

  if (evidencePhones.length) {
    const phoneRows = selected.rows.filter(function(row) {
      return (row.phones || []).some(function(phone) { return evidencePhones.indexOf(phone) !== -1; });
    });
    const phoneIds = tmContactR1UniqueContactIds_(phoneRows);
    if (phoneIds.length === 1) {
      return { status: 'CONTACT_RESOLVED', contactId: phoneIds[0], matchType: 'PHONE_EXACT', candidateContactCount: contactIds.length };
    }
  }

  if (contactIds.length === 1) {
    return { status: 'CONTACT_RESOLVED', contactId: contactIds[0], matchType: 'UNIQUE_CUSTOMER_CONTACT', candidateContactCount: 1 };
  }

  if (contactIds.length > 1) {
    return { status: 'CONTACT_REVIEW_MULTIPLE', contactId: 0, matchType: selected.keyType, candidateContactCount: contactIds.length };
  }

  return { status: 'CONTACT_MISSING', contactId: 0, matchType: selected.keyType, candidateContactCount: 0 };
}

function tmContactR1LoadIndex_() {
  if (TM_CONTACT_R1_INDEX_CACHE) return TM_CONTACT_R1_INDEX_CACHE;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss && ss.getSheetByName(TM_CONTACT_R1.CUSTOMERS_SHEET);
  if (!sheet || sheet.getLastRow() < 2) {
    TM_CONTACT_R1_INDEX_CACHE = { status: 'EMPTY', rows: [], byCustomerId: {}, byCustomerNumber: {}, byName: {} };
    return TM_CONTACT_R1_INDEX_CACHE;
  }
  TM_CONTACT_R1_INDEX_CACHE = tmContactR1BuildIndexFromValues_(sheet.getDataRange().getDisplayValues());
  return TM_CONTACT_R1_INDEX_CACHE;
}

function tmContactR1Resolve_(input) {
  return tmContactR1ResolveFromIndex_(tmContactR1LoadIndex_(), input || {});
}

function testTmContactR1ResolverReadOnly() {
  const index = tmContactR1LoadIndex_();
  const result = {
    mode: 'TM_CONTACT_RESOLUTION_R1_DIAGNOSTIC',
    version: TM_CONTACT_R1.VERSION,
    status: index.status,
    sourceRows: index.rows.length,
    writesPerformed: false,
    strivenWritesPerformed: false,
    calendarWritesPerformed: false
  };
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

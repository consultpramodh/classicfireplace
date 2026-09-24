function tmv3_calendarRecords_() {
  return tmv3_calendarRecordsWithOptions_({
    stage: 'RUNTIME',
    applyEligibility: true,
    mergeLogical: false
  });
}

function tmv3_step1CalendarRecords_() {
  return tmv3_calendarRecordsWithOptions_({
    stage: 'STEP1',
    applyEligibility: false,
    mergeLogical: true
  });
}

function tmv3_calendarRecordsWithOptions_(options) {
  tmv3_assertShadow_();
  options = options || {};
  const out = [];

  Object.keys(TMV3.VERTICALS).forEach(function(vertical) {
    const cfg = TMV3.VERTICALS[vertical];
    const calendars = tmv3_verticalCalendars_(vertical, cfg);

    const start = new Date();
    start.setDate(start.getDate() - Number(cfg.lookbackDays || 0));
    start.setHours(0,0,0,0);

    const end = new Date();
    end.setDate(end.getDate() + Number(cfg.lookaheadDays || 365));
    end.setHours(23,59,59,999);

    calendars.forEach(function(calCfg) {
      const cal = CalendarApp.getCalendarById(calCfg.calendarId);

      if (!cal) {
        tmv3_audit_(
          vertical,'','','CALENDAR_ACCESS','BLOCKED',
          'Calendar unavailable: ' + calCfg.calendarId
        );
        return;
      }

      const resolvedCalCfg = Object.assign({}, calCfg, {
        calendarName: tmv3_safeCalendar_(function() {
          return cal.getName ? cal.getName() : '';
        }, '')
      });

      cal.getEvents(start, end).forEach(function(event) {
        const record = tmv3_calendarEvent_(vertical, cfg, resolvedCalCfg, event, options);
        if (record) out.push(record);
      });
    });
  });

  return options.mergeLogical === true
    ? tmv3_mergeLogicalCalendarRecords_(out)
    : out;
}

function tmv3_verticalCalendars_(vertical, cfg) {
  if (vertical === 'Service') {
    return (cfg.calendars || []).map(function(item) {
      return Object.assign({}, item, { role: 'TECHNICIAN' });
    });
  }

  if (vertical === 'PreInspection') {
    return [
      {
        calendarId: cfg.primaryCalendarId,
        role: 'PRIMARY_SHARED',
        calendarName: 'CF Preinspects'
      }
    ].concat(
      (cfg.secondaryCalendarIds || []).map(function(id) {
        return {
          calendarId: id,
          role: 'SECONDARY_STEPHEN',
          calendarName: 'Stephen'
        };
      })
    );
  }

  return (cfg.calendarIds || []).map(function(id) {
    return {
      calendarId: id,
      role: vertical.toUpperCase()
    };
  });
}

function tmv3_calendarEvent_(vertical, cfg, calCfg, event, options) {
  options = options || {};

  const title = tmv3_clean_(event.getTitle());
  const rawDescription = String(event.getDescription() || '');
  const descriptionClean = tmv3_calendarReadableDescription_(rawDescription);
  const location = tmv3_clean_(event.getLocation());

  const creator = tmv3_safeCalendar_(
    function() {
      return event.getCreators ? (event.getCreators() || []).join(',') : '';
    },
    ''
  );

  const guests = tmv3_safeCalendar_(
    function() {
      return event.getGuestList().map(function(g) {
        return g.getEmail();
      }).join(',');
    },
    ''
  );

  const organizerCalendarId = tmv3_safeCalendar_(
    function() {
      return event.getOriginalCalendarId ? event.getOriginalCalendarId() : '';
    },
    ''
  );

  const isAllDay = event.isAllDayEvent();

  if (
    options.stage === 'STEP1' &&
    vertical === 'PreInspection' &&
    !tmv3_preInspectionStep1SourceAllowed_(cfg, calCfg, creator)
  ) {
    return null;
  }

  if (
    options.applyEligibility !== false &&
    tmv3_shouldIgnoreEvent_(vertical, title, rawDescription, isAllDay, creator)
  ) {
    return null;
  }

  const start = event.getStartTime();
  const end = event.getEndTime();
  const eventId = event.getId();
  const links = tmv3_extractLinks_(rawDescription);

  const orderNumber = tmv3_extractOrderNumberForVertical_(
    vertical,
    title,
    descriptionClean,
    location
  );

  const customerNumber = tmv3_extractCustomerNumberForVertical_(
    vertical,
    title + ' ' + descriptionClean
  );

  const phone = tmv3_extractPhone_(
    title + ' ' + descriptionClean + ' ' + location
  );

  const taskNumber = tmv3_extractCalendarTaskNumber_(
    title + ' ' + descriptionClean
  );

  const serviceLegacyAllowed =
    vertical === 'Service'
      ? tmv3_serviceStep1LegacyAllowed_(title, isAllDay, creator)
      : true;

  const serviceExternalRecovery =
    vertical === 'Service' &&
    !serviceLegacyAllowed &&
    tmv3_serviceExternalCreatorRecoveryAllowed_({
      title: title,
      description: descriptionClean,
      location: location,
      isAllDay: isAllDay,
      creator: creator,
      orderNumber: orderNumber,
      phone: phone,
      taskNumber: taskNumber,
      existingTaskId: links.taskId,
      existingOrderId: links.orderId
    });

  if (
    options.stage === 'STEP1' &&
    vertical === 'Service' &&
    !serviceLegacyAllowed &&
    !serviceExternalRecovery
  ) {
    return null;
  }

  const calendarCustomerName = tmv3_extractCalendarCustomerName_(
    vertical, title, customerNumber, phone, orderNumber, calCfg
  );

  const fingerprint = tmv3_hash_(
    [
      vertical, calCfg.calendarId, eventId, title, location,
      tmv3_iso_(start), tmv3_iso_(end), rawDescription, creator, guests
    ].join('|')
  );

  return {
    vertical: vertical,
    calendarId: calCfg.calendarId,
    calendarName: calCfg.calendarName || '',
    calendarRole: calCfg.role || '',
    technician: calCfg.technician || '',
    technicianEmployeeId: calCfg.employeeId || '',
    eventId: eventId,
    title: title,
    description: rawDescription,
    descriptionClean: descriptionClean,
    rawDescription: rawDescription,
    location: location,
    start: start,
    end: end,
    isAllDay: isAllDay,
    organizer: creator,
    creator: creator,
    organizerCalendarId: organizerCalendarId,
    guests: guests,
    orderNumber: orderNumber,
    customerNumber: customerNumber,
    calendarCustomerName: calendarCustomerName,
    phone: phone,
    taskNumber: taskNumber,
    serviceLegacyAllowed: serviceLegacyAllowed,
    serviceExternalRecovery: serviceExternalRecovery,
    existingTaskId: links.taskId,
    existingTaskUrl: links.taskUrl,
    existingOrderId: links.orderId,
    existingOrderUrl: links.orderUrl,
    eventUrl: tmv3_calendarEventUrl_(eventId),
    fingerprint: fingerprint,
    logicalKey: tmv3_calendarLogicalKey_(eventId, start, title, location),
    sourceCalendarIds: [calCfg.calendarId],
    sourceCalendarNames: [calCfg.calendarName || calCfg.calendarId],
    sourceCalendarRoles: [calCfg.role || ''],
    sourceCreators: creator ? [creator] : [],
    sourceGuests: guests ? [guests] : [],
    duplicateSourceCount: 1,
    calendarUpdatedAt: tmv3_safeCalendar_(
      function() { return tmv3_iso_(event.getLastUpdated()); },
      ''
    )
  };
}

function tmv3_preInspectionStep1SourceAllowed_(cfg, calCfg, creator) {
  if (calCfg.role === 'PRIMARY_SHARED') return true;
  if (calCfg.role !== 'SECONDARY_STEPHEN') return true;

  const owner = tmv3_norm_(cfg.secondaryOwnerEmail || 'stephen@classicfireplace.ca');
  const creators = String(creator || '')
    .split(',')
    .map(function(v) { return tmv3_norm_(v); })
    .filter(Boolean);

  if (!creators.length) {
    tmv3_audit_(
      'PreInspection','','','STEP1_SOURCE_SCOPE','REVIEW',
      'Stephen calendar event had no readable creator; excluded from Step 1 intake.'
    );
    return false;
  }

  return creators.indexOf(owner) === -1;
}

function tmv3_mergeLogicalCalendarRecords_(records) {
  const byKey = {};
  const order = [];

  (records || []).forEach(function(record) {
    const key = record.logicalKey || tmv3_calendarLogicalKey_(
      record.eventId, record.start, record.title, record.location
    );

    if (!byKey[key]) {
      byKey[key] = Object.assign({}, record);
      order.push(key);
      return;
    }

    const base = byKey[key];

    base.sourceCalendarIds = tmv3_unique_(
      (base.sourceCalendarIds || []).concat(record.sourceCalendarIds || [record.calendarId])
    );
    base.sourceCalendarNames = tmv3_unique_(
      (base.sourceCalendarNames || []).concat(record.sourceCalendarNames || [record.calendarName || record.calendarId])
    );
    base.sourceCalendarRoles = tmv3_unique_(
      (base.sourceCalendarRoles || []).concat(record.sourceCalendarRoles || [record.calendarRole || ''])
    );
    base.sourceCreators = tmv3_unique_(
      (base.sourceCreators || []).concat(record.sourceCreators || (record.creator ? [record.creator] : []))
    );
    base.sourceGuests = tmv3_unique_(
      (base.sourceGuests || []).concat(record.sourceGuests || (record.guests ? [record.guests] : []))
    );

    base.duplicateSourceCount = Number(base.duplicateSourceCount || 1) + 1;

    if (!base.existingTaskId && record.existingTaskId) {
      base.existingTaskId = record.existingTaskId;
      base.existingTaskUrl = record.existingTaskUrl;
    }
    if (!base.existingOrderId && record.existingOrderId) {
      base.existingOrderId = record.existingOrderId;
      base.existingOrderUrl = record.existingOrderUrl;
    }
    if (!base.orderNumber && record.orderNumber) base.orderNumber = record.orderNumber;
    if (!base.customerNumber && record.customerNumber) base.customerNumber = record.customerNumber;
    if (!base.phone && record.phone) base.phone = record.phone;
    if (!base.calendarCustomerName && record.calendarCustomerName) {
      base.calendarCustomerName = record.calendarCustomerName;
    }

    base.guests = tmv3_unique_([base.guests, record.guests].filter(Boolean)).join(',');
    base.creator = tmv3_unique_([base.creator, record.creator].filter(Boolean)).join(',');
    base.organizer = base.creator;
    base.fingerprint = tmv3_hash_(
      [
        base.fingerprint, record.fingerprint,
        base.sourceCalendarIds.join(','), base.sourceCalendarRoles.join(',')
      ].join('|')
    );
  });

  return order.map(function(key) { return byKey[key]; });
}

function tmv3_calendarLogicalKey_(eventId, start, title, location) {
  const id = tmv3_norm_(eventId).replace(/@google\.com$/i, '');
  const startIso = start ? tmv3_iso_(start) : '';

  if (id) return id + '|' + startIso;

  return tmv3_hash_([
    startIso, tmv3_norm_(title), tmv3_norm_(location)
  ].join('|'));
}

function tmv3_calendarEventUrl_(eventId) {
  const id = tmv3_clean_(eventId);
  return id
    ? 'https://calendar.google.com/calendar/u/0/r/eventedit/' + encodeURIComponent(id)
    : '';
}

function tmv3_calendarReadableDescription_(value) {
  return tmv3_clean_(
    String(value || '')
      .replace(/<\s*br\s*\/?>/gi, '\n')
      .replace(/<\s*\/p\s*>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n[ \t]+/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
  );
}

function tmv3_serviceStep1LegacyAllowed_(title, isAllDay, creator) {
  const cleanTitle = tmv3_clean_(title);
  const normalizedTitle = tmv3_norm_(cleanTitle);
  const creatorText = String(creator || '').toLowerCase();

  // Original Service calendar intake rule:
  // only events actually created by @classicfireplace.ca.
  if (creatorText.indexOf('@classicfireplace.ca') === -1) return false;

  if (!cleanTitle) return false;
  if (isAllDay) return false;

  if (
    normalizedTitle === 'chris' ||
    normalizedTitle === 'travis' ||
    normalizedTitle === 'matt' ||
    normalizedTitle === 'matthew' ||
    normalizedTitle === 'matthew thompson'
  ) {
    return false;
  }

  if (
    normalizedTitle === 'classic fireplace' ||
    normalizedTitle === 'classic fireplace bbq' ||
    normalizedTitle === 'classic fireplace and bbq'
  ) {
    return false;
  }

  if (
    normalizedTitle.indexOf('take van home') !== -1 ||
    normalizedTitle.indexOf('van home') !== -1 ||
    normalizedTitle.indexOf('day off') !== -1 ||
    normalizedTitle.indexOf('vacation') !== -1 ||
    normalizedTitle.indexOf('sick') !== -1 ||
    normalizedTitle.indexOf('off') === normalizedTitle.length - 3
  ) {
    return false;
  }

  return true;
}

function tmv3_serviceExternalCreatorRecoveryAllowed_(evidence) {
  evidence = evidence || {};

  if (evidence.isAllDay) return false;

  const title = tmv3_norm_(evidence.title || '');

  if (
    !title ||
    title === 'chris' ||
    title === 'travis' ||
    title === 'matt' ||
    title === 'matthew' ||
    title === 'matthew thompson' ||
    title === 'classic fireplace' ||
    title === 'classic fireplace bbq' ||
    title === 'classic fireplace and bbq' ||
    /\b(day off|vacation|sick|take van home|van home|do not book|meeting|lunch|training|warehouse|pickup|pick up)\b/i.test(title)
  ) {
    return false;
  }

  // A managed Striven link or labelled Task number is strong Calendar-carried
  // evidence. Otherwise require SO/WO + phone + physical location together.
  if (evidence.existingTaskId || evidence.existingOrderId || evidence.taskNumber) {
    return true;
  }

  return !!(
    evidence.orderNumber &&
    evidence.phone &&
    tmv3_clean_(evidence.location)
  );
}

function tmv3_extractCalendarTaskNumber_(text) {
  const value = tmv3_clean_(text);
  if (!value) return '';

  const match = value.match(
    /\bTask\s*(?:#|No\.?|Number)?\s*[:\-]?\s*(\d{4,8})\b/i
  );

  return match ? match[1] : '';
}

function tmv3_extractOrderNumberForVertical_(vertical, title, description, location) {
  const titleText = tmv3_clean_(title);
  const descriptionText = tmv3_clean_(description);
  const locationText = tmv3_clean_(location);

  if (vertical === 'Install') {
    return tmv3_extractLegacyInstallOrderNumber_(titleText + ' ' + descriptionText);
  }

  if (vertical === 'Delivery') {
    return tmv3_extractLegacyDeliveryOrderNumber_(titleText + ' ' + descriptionText);
  }

  if (vertical === 'Service') {
    return tmv3_extractLegacyServiceOrderNumber_(
      [titleText, descriptionText, locationText].join(' ')
    );
  }

  if (vertical === 'PreInspection') {
    // Only labelled SO patterns are accepted here, so a leading Customer #
    // can never be mistaken for the Sales Order. Step 2 still separately
    // verifies that the SO is present in the description per the new format.
    return tmv3_extractLegacyPreInspectionOrderNumber_(
      titleText + ' ' + descriptionText
    );
  }

  return tmv3_extractOrderNumber_(
    [titleText, descriptionText, locationText].join(' ')
  );
}

function tmv3_stripPhonesForOrderParsing_(text) {
  return String(text || '')
    .replace(
      /(?:\+?1[\s\-.]?)?(?:\(?\d{3}\)?[\s\-.]?\d{3}[\s\-.]?\d{4})(?:\s*(?:x|ext\.?)\s*\d+)?/gi,
      ' '
    )
    .replace(/\s+/g, ' ')
    .trim();
}

function tmv3_extractLegacyInstallOrderNumber_(text) {
  const clean = tmv3_stripPhonesForOrderParsing_(text);
  if (!clean) return '';

  let match = clean.match(
    /\b(?:SO|S\/O|Sales\s*Order)\s*[#:\-]?\s*(\d{4,8})(?!\d)/i
  );
  if (match) return match[1];

  match = clean.match(/#\s*(\d{4,8})(?!\d)/);
  return match ? match[1] : '';
}

function tmv3_extractLegacyDeliveryOrderNumber_(text) {
  const clean = tmv3_stripPhonesForOrderParsing_(text);
  if (!clean) return '';

  const patterns = [
    /\bSO\s*#?\s*(\d{5,8})\b/i,
    /\bS\/O\s*#?\s*(\d{5,8})\b/i,
    /\bSales\s*Order\s*#?\s*(\d{5,8})\b/i,
    /\bOrder\s*#?\s*(\d{5,8})\b/i,
    /#\s*(\d{5,8})\b/i,
    /\b(\d{6})\b/
  ];

  for (let i = 0; i < patterns.length; i++) {
    const match = clean.match(patterns[i]);
    if (match && match[1]) return match[1];
  }

  return '';
}

function tmv3_extractLegacyServiceOrderNumber_(text) {
  const clean = tmv3_clean_(text);
  if (!clean) return '';

  const patterns = [
    /\bSO\s*#?\s*(\d{5,8})\b/i,
    /\bS\/O\s*#?\s*(\d{5,8})\b/i,
    /\bSales\s*Order\s*#?\s*(\d{5,8})\b/i,
    /\bOrder\s*#?\s*(\d{5,8})\b/i,
    /\b(\d{6})\b/
  ];

  for (let i = 0; i < patterns.length; i++) {
    const match = clean.match(patterns[i]);
    if (match && match[1]) return match[1];
  }

  return '';
}

function tmv3_extractLegacyPreInspectionOrderNumber_(description) {
  const clean = tmv3_stripPhonesForOrderParsing_(description);
  if (!clean) return '';

  const match = clean.match(
    /\b(?:SO|S\/O|Sales\s*Order|Order)\s*(?:#|No\.?|Number)?\s*[:\-]?\s*(\d{4,8})\b/i
  );

  return match ? match[1] : '';
}

function tmv3_extractCustomerNumberForVertical_(vertical, text) {
  const s = tmv3_clean_(text);

  const labelled = s.match(
    /(?:Customer|Cust(?:omer)?\s*#?)\s*(?:#|No\.?|Number)?\s*[:\-]?\s*(\d{3,8})/i
  );

  if (labelled) return labelled[1];

  if (vertical === 'PreInspection') {
    const leading = s.match(/^\s*#?(\d{4,8})\s*[-–—]/);
    return leading ? leading[1] : '';
  }

  return '';
}

function tmv3_extractCalendarCustomerName_(vertical, title, customerNumber, phone, orderNumber, calCfg) {
  if (vertical === 'Install') {
    return tmv3_installLegacyCustomerName_(title);
  }

  if (vertical === 'Delivery') {
    return tmv3_deliveryLegacyCustomerName_(title);
  }

  if (vertical === 'Service') {
    return tmv3_serviceLegacyCustomerName_(title);
  }

  return tmv3_preInspectionCalendarCustomerName_(
    title,
    customerNumber
  );
}

function tmv3_installLegacyCustomerName_(title) {
  return tmv3_clean_(title)
    .replace(/\b(?:SO|S\/O|Sales\s*Order)\s*[#:\-]?\s*\d{4,8}\b/ig, ' ')
    .replace(/#\s*\d{4,8}\b/g, ' ')
    .replace(/\b(?:install|installation|fireplace|bbq|delivery)\b/ig, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tmv3_deliveryLegacyCustomerName_(title) {
  let clean = tmv3_clean_(title);
  if (!clean) return '';

  clean = clean
    .replace(
      /(?:\+?1[\s\-.]?)?(?:\(?\d{3}\)?[\s\-.]?\d{3}[\s\-.]?\d{4})(?:\s*(?:x|ext\.?)\s*\d+)?/gi,
      ' '
    )
    .replace(/\b(?:SO|S\/O|Sales\s*Order)\s*[#:\-]?\s*\d{4,8}\b/gi, ' ')
    .replace(/#\s*\d{4,8}\b/g, ' ')
    .replace(
      /\b\d{1,2}(?::\d{2})?\s*(?:am|pm)?\s*[-–]\s*\d{1,2}(?::\d{2})?\s*(?:am|pm)?\b/gi,
      ' '
    )
    .replace(/\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/gi, ' ')
    .replace(/\bjohn\s+hoang\b/gi, ' ')
    .replace(/\bjohn\b/gi, ' ')
    .replace(/\bjay\s+scott\b/gi, ' ')
    .replace(/\bjay\b/gi, ' ')
    .replace(/\bstephen\s+foley\b/gi, ' ')
    .replace(/\bsteven\s+foley\b/gi, ' ')
    .replace(/\bstephen\b/gi, ' ')
    .replace(/\bsteven\b/gi, ' ')
    .replace(/\bsf\b/gi, ' ')
    .replace(/\bspencer\b/gi, ' ')
    .replace(/\bthang\b/gi, ' ')
    .replace(/\bpramodh\b/gi, ' ')
    .replace(/\bmatthew\s+thompson\b/gi, ' ')
    .replace(/\bmatthew\b/gi, ' ')
    .replace(/\bmatt\b/gi, ' ')
    .replace(/\baiden\b/gi, ' ')
    .replace(/\bdelivery\b/gi, ' ')
    .replace(/\bdeliveries\b/gi, ' ')
    .replace(/\binstall\b/gi, ' ')
    .replace(/\binstallation\b/gi, ' ')
    .replace(/\bfireplace\b/gi, ' ')
    .replace(/\bbbq\b/gi, ' ')
    .replace(/[&+/,]/g, ' ')
    .replace(/[-–]/g, ' ')
    .replace(/\band\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return clean;
}

function tmv3_serviceLegacyCustomerName_(title) {
  const clean = tmv3_clean_(title);
  if (!clean) return '';

  const value = clean
    .replace(/\bSO\s*#?\s*\d{5,8}\b/gi, '')
    .replace(/\bSales\s*Order\s*#?\s*\d{5,8}\b/gi, '')
    .replace(/\bOrder\s*#?\s*\d{5,8}\b/gi, '')
    .replace(/\bTask\s*#?\s*\d{4,8}\b/gi, '')
    .replace(/\bService\b/gi, '')
    .replace(/\bChris\b/gi, '')
    .replace(/\bTravis\b/gi, '')
    .replace(/\bMatt\b/gi, '')
    .replace(/\bMatthew\b/gi, '')
    .replace(/[|:;,#\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return value.length >= 3 ? value : '';
}

function tmv3_preInspectionCalendarCustomerName_(title, customerNumber) {
  let value = tmv3_clean_(title);
  if (!value) return '';

  value = value.replace(
    /(?:\+?1[\s.\-]?)?\(?[2-9]\d{2}\)?[\s.\-]?[2-9]\d{2}[\s.\-]?\d{4}/g,
    ' '
  );

  if (customerNumber) {
    value = value.replace(
      new RegExp('(^|\\s)#?' + String(customerNumber).replace(/[^0-9]/g, '') + '(?=\\s|[-–—:]|$)', 'g'),
      ' '
    );
  }

  return value
    .replace(/\bpre\s*-?inspect(?:ion)?\b/ig, ' ')
    .replace(/\s*[-–—:+&]+\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tmv3_shouldIgnoreEvent_(vertical, title, description, isAllDay, organizer) {
  const t = tmv3_norm_(title);

  if (isAllDay) return true;

  if (
    vertical !== 'PreInspection' &&
    organizer &&
    organizer.indexOf(TMV3.DOMAIN) === -1
  ) return true;

  if (/\b(off|vacation|pto|sick|holiday|unavailable|blocked|personal)\b/i.test(t)) {
    return true;
  }

  if (vertical === 'Install' && /\bcrane job\b/i.test(t)) return true;

  if (
    vertical === 'Service' &&
    /\b(admin|meeting|lunch|training|warehouse|pickup|pick up)\b/i.test(t)
  ) return true;

  return false;
}

function tmv3_extractLinks_(html) {
  const text = String(html || '');
  const hrefs = [];
  const rx = /href=["']([^"']+)["']/gi;
  let m;

  while ((m = rx.exec(text)) !== null) hrefs.push(m[1]);

  const rawUrls = text.match(/https?:\/\/[^\s<>"']+/gi) || [];
  const urls = tmv3_unique_(hrefs.concat(rawUrls));

  let taskUrl = '';
  let taskId = '';
  let orderUrl = '';
  let orderId = '';

  urls.forEach(function(url) {
    let mm = String(url).match(/TaskInfo\.aspx\?[^"']*TaskID=(\d+)/i);
    if (mm && !taskUrl) {
      taskUrl = url;
      taskId = mm[1];
    }

    mm = String(url).match(/\/sales-orders\/(\d+)/i);
    if (mm && !orderUrl) {
      orderUrl = url;
      orderId = mm[1];
    }
  });

  return {
    taskUrl: taskUrl,
    taskId: taskId,
    orderUrl: orderUrl,
    orderId: orderId
  };
}

function tmv3_extractOrderNumber_(text) {
  const s = tmv3_clean_(text);
  const labelled = s.match(
    /(?:SO|Sales\s*Order|Work\s*Order|Service\s*Order)\s*(?:#|No\.?|Number)?\s*[:\-]?\s*(\d{4,8})/i
  );
  return labelled ? labelled[1] : '';
}

function tmv3_extractCustomerNumber_(text) {
  const s = tmv3_clean_(text);
  const m = s.match(
    /(?:Customer|Cust(?:omer)?\s*#?)\s*(?:#|No\.?|Number)?\s*[:\-]?\s*(\d{3,8})/i
  );

  if (m) return m[1];

  const leading = s.match(/^\s*#?(\d{4,8})\s*[-–—]/);
  return leading ? leading[1] : '';
}

function tmv3_extractPhone_(text) {
  const m = tmv3_clean_(text).match(
    /(?:\+?1[\s.\-]?)?\(?([2-9]\d{2})\)?[\s.\-]?([2-9]\d{2})[\s.\-]?(\d{4})/
  );

  return m ? (m[1] + m[2] + m[3]) : '';
}

function tmv3_safeCalendar_(fn, fallback) {
  try {
    return fn();
  } catch (err) {
    return fallback;
  }
}

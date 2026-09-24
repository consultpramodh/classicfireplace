/************************************************************
 * TM V3 — STAGE 2 CALENDAR NORMALIZATION / ELIGIBILITY
 *
 * Stage contract:
 * - Consumes only tmv3_step1CalendarRecords_().
 * - Performs no Striven reads/writes.
 * - Performs no Google Calendar writes.
 * - Classifies every Step-1 record as ELIGIBLE / REVIEW / SKIP.
 * - Later stages may consume only tmv3_step2EligibleCalendarRecords_().
 ************************************************************/

function tmv3_step2CalendarRecords_() {
  return tmv3_step1CalendarRecords_().map(function(record) {
    const classified = tmv3_step2ClassifyCalendarRecord_(record);
    return Object.assign({}, record, { step2: classified });
  });
}

function tmv3_step2EligibleCalendarRecords_() {
  return tmv3_step2CalendarRecords_().filter(function(record) {
    return record.step2 && record.step2.disposition === 'ELIGIBLE';
  });
}

function tmv3_step2ClassifyCalendarRecord_(record) {
  if (!record || !record.vertical) {
    return tmv3_step2Decision_(
      'REVIEW',
      'INVALID_RECORD',
      'Calendar record is missing its vertical.',
      false
    );
  }

  if (record.vertical === 'PreInspection') {
    return tmv3_step2ClassifyPreInspection_(record);
  }

  if (record.vertical === 'Service') {
    return tmv3_step2ClassifyService_(record);
  }

  if (
    tmv3_shouldIgnoreEvent_(
      record.vertical,
      record.title,
      record.rawDescription,
      record.isAllDay,
      record.creator
    )
  ) {
    return tmv3_step2Decision_(
      'SKIP',
      'LEGACY_NON_JOB_FILTER',
      'Legacy Calendar non-job / creator filter matched.',
      false
    );
  }

  return tmv3_step2Decision_(
    'ELIGIBLE',
    'LEGACY_ELIGIBLE',
    'Calendar event passed the legacy ' + record.vertical + ' eligibility rules.',
    false
  );
}

function tmv3_step2ClassifyService_(record) {
  if (record.serviceLegacyAllowed === true) {
    return tmv3_step2Decision_(
      'ELIGIBLE',
      'SERVICE_LEGACY_ELIGIBLE',
      'Service event passed the original creator and blocker rules.',
      false
    );
  }

  if (record.serviceExternalRecovery === true) {
    return tmv3_step2Decision_(
      'ELIGIBLE',
      'SERVICE_EXTERNAL_CREATOR_RECOVERY',
      'External creator recovered because Calendar already carries strong Striven task/order evidence.',
      false,
      ['External creator — verify against Striven in the business-anchor stage.']
    );
  }

  return tmv3_step2Decision_(
    'SKIP',
    'SERVICE_CREATOR_OR_BLOCKER_REJECTED',
    'Service event did not pass the legacy creator/blocker rules and had no strong recovery evidence.',
    false
  );
}

function tmv3_step2ClassifyPreInspection_(record) {
  const roles = record.sourceCalendarRoles || [record.calendarRole || ''];
  const fromShared = roles.indexOf('PRIMARY_SHARED') !== -1;
  const fromStephen = roles.indexOf('SECONDARY_STEPHEN') !== -1;
  const cfg = TMV3.VERTICALS.PreInspection;

  const warnings = tmv3_step2PreInspectionFormatWarnings_(record);

  if (fromShared) {
    const mirrorStatus = fromStephen
      ? 'BOTH_CALENDAR_COPIES_PRESENT'
      : 'SHARED_ORIGIN_NO_MIRROR_WRITE_REQUIRED';

    return tmv3_step2Decision_(
      'ELIGIBLE',
      warnings.length ? 'PREINSPECTION_SHARED_FORMAT_ATTENTION' : 'PREINSPECTION_SHARED_ELIGIBLE',
      'Shared CF Preinspects events are part of the PreInspection appointment stream.',
      false,
      warnings,
      mirrorStatus
    );
  }

  if (!fromStephen) {
    return tmv3_step2Decision_(
      'REVIEW',
      'PREINSPECTION_UNKNOWN_SOURCE',
      'PreInspection event is not traceable to the shared or Stephen source.',
      false,
      warnings
    );
  }

  if (tmv3_step2PreInspectionNonCustomer_(record)) {
    return tmv3_step2Decision_(
      'SKIP',
      'PREINSPECTION_NON_CUSTOMER_EVENT',
      'Stephen-calendar event matches a known non-customer / blocking pattern.',
      false,
      warnings,
      'NOT_ELIGIBLE_FOR_MIRROR'
    );
  }

  const hasIdentity =
    !!record.phone &&
    !!(
      record.customerNumber ||
      record.orderNumber ||
      tmv3_clean_(record.location) ||
      tmv3_clean_(record.calendarCustomerName)
    );

  const alternateIdentity =
    !!record.customerNumber &&
    !!(
      record.orderNumber ||
      tmv3_clean_(record.location)
    );

  if (hasIdentity || alternateIdentity) {
    const sharedId = cfg.primaryCalendarId;
    const guestText = String(record.guests || '').toLowerCase();
    const alreadyGuest = guestText.indexOf(String(sharedId).toLowerCase()) !== -1;

    return tmv3_step2Decision_(
      'ELIGIBLE',
      warnings.length ? 'PREINSPECTION_SECONDARY_FORMAT_ATTENTION' : 'PREINSPECTION_SECONDARY_ELIGIBLE',
      'Stephen-calendar event has customer-appointment evidence and was created by someone other than Stephen.',
      !alreadyGuest,
      warnings,
      alreadyGuest ? 'SHARED_CALENDAR_ALREADY_GUEST' : 'MIRROR_REQUIRED_NOT_WRITTEN'
    );
  }

  return tmv3_step2Decision_(
    'REVIEW',
    'PREINSPECTION_SECONDARY_UNCLEAR',
    'Stephen-calendar event is not a known blocker, but customer-appointment evidence is incomplete.',
    false,
    warnings,
    'NOT_MIRRORED_UNTIL_ELIGIBLE'
  );
}

function tmv3_step2PreInspectionNonCustomer_(record) {
  if (record.isAllDay) return true;

  const title = tmv3_clean_(record.title);

  const patterns = [
    /\bdo not book\b/i,
    /\bno more calls\b/i,
    /\bteam meeting\b/i,
    /\bnewmarket day\b/i,
    /\bnewmarket all day\b/i,
    /^newmarket$/i,
    /\ball day installing fireplaces\b/i,
    /\bon vacation\b/i,
    /\bday off\b/i,
    /\bcivic holiday\b/i,
    /^travel to\b/i,
    /\bout of office\b/i,
    /\binstall shut offs? and tags\b/i,
    /\binstall with scaffolding\b/i
  ];

  return patterns.some(function(pattern) {
    return pattern.test(title);
  });
}

function tmv3_step2PreInspectionFormatWarnings_(record) {
  const warnings = [];

  if (!record.customerNumber) warnings.push('Title missing Customer #.');
  if (!tmv3_clean_(record.calendarCustomerName)) warnings.push('Title missing customer name.');
  if (!record.phone) warnings.push('Title missing phone.');

  const descriptionSo = tmv3_extractLegacyPreInspectionOrderNumber_(
    record.descriptionClean || ''
  );

  if (!descriptionSo) warnings.push('Description missing labelled SO #.');
  if (!tmv3_clean_(record.location)) warnings.push('Calendar Location is blank.');

  return warnings;
}

function tmv3_step2Decision_(disposition, code, reason, mirrorRequired, warnings, mirrorStatus) {
  return {
    disposition: disposition,
    code: code,
    reason: reason,
    mirrorRequired: mirrorRequired === true,
    mirrorStatus: mirrorStatus || '',
    warnings: warnings || []
  };
}

function tmv3_step2CalendarRun(reason) {
  tmv3_assertShadow_();

  const records = tmv3_step2CalendarRecords_();
  const counts = tmv3_step2Counts_(records);
  const write = tmv3_step2WriteOperatorViews_(records);
  const verify = tmv3_step2Verify_(records);

  const result = {
    version: TMV3.VERSION,
    executionStage: tmv3_executionStage_(),
    stage: 2,
    status: verify.pass ? 'PASS' : 'REVIEW',
    mode: 'CALENDAR_NORMALIZATION_AND_ELIGIBILITY_ONLY',
    reason: tmv3_clean_(reason || 'MANUAL'),
    calendarWritesPerformed: false,
    strivenReadsPerformed: false,
    strivenWritesPerformed: false,
    counts: counts,
    write: write,
    verification: verify
  };

  tmv3_audit_(
    'SYSTEM','','','STEP2_CALENDAR_ELIGIBILITY',
    result.status,
    JSON.stringify(result)
  );

  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

function tmv3_step2Counts_(records) {
  const counts = {
    total: 0,
    eligible: 0,
    review: 0,
    skip: 0,
    mirrorRequired: 0,
    serviceExternalRecovery: 0,
    byVertical: {}
  };

  (records || []).forEach(function(record) {
    counts.total++;
    if (!counts.byVertical[record.vertical]) {
      counts.byVertical[record.vertical] = {
        total:0, eligible:0, review:0, skip:0
      };
    }

    const bucket = counts.byVertical[record.vertical];
    bucket.total++;

    const disposition = record.step2 ? record.step2.disposition : 'REVIEW';
    if (disposition === 'ELIGIBLE') {
      counts.eligible++;
      bucket.eligible++;
    } else if (disposition === 'SKIP') {
      counts.skip++;
      bucket.skip++;
    } else {
      counts.review++;
      bucket.review++;
    }

    if (record.step2 && record.step2.mirrorRequired) counts.mirrorRequired++;
    if (record.step2 && record.step2.code === 'SERVICE_EXTERNAL_CREATOR_RECOVERY') {
      counts.serviceExternalRecovery++;
    }
  });

  return counts;
}

function tmv3_step2WriteOperatorViews_(records) {
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

    const rows = verticalRecords.map(tmv3_step2OperatorRow_);
    const sheetName = TMV3.VERTICALS[vertical].sheet;
    const priorLastRow = tmv3_sheet_(sheetName).getLastRow();

    tmv3_replaceRows_(sheetName, TMV3_STEP1_HEADERS.slice(), rows);
    tmv3_step1FormatOperatorView_(sheetName, vertical, verticalRecords, priorLastRow);
    written[vertical] = rows.length;
  });

  return written;
}

function tmv3_step2OperatorRow_(record) {
  const row = tmv3_step1OperatorRow_(record);
  const step2 = record.step2 || {};
  const disposition = step2.disposition || 'REVIEW';

  row[4] = tmv3_step1CalendarChecklist_(record) +
    '\n' +
    (disposition === 'ELIGIBLE' ? '✅ Step 2 Eligible' :
      disposition === 'SKIP' ? '⏭ Step 2 Skip' : '⚠ Step 2 Review');

  row[5] = 'NOT RUN — STEP 2';
  row[6] = 'NOT RUN — STEP 2';
  row[7] = 'NOT RUN — STEP 2';
  row[8] = 'NOT RUN — STEP 2';
  row[9] = 'STEP 2 — ' + disposition;

  const details = [step2.reason || ''];
  if (step2.mirrorStatus) details.push('Mirror: ' + step2.mirrorStatus);
  (step2.warnings || []).forEach(function(warning) {
    details.push('Attention: ' + warning);
  });
  row[10] = details.filter(Boolean).join('\n');

  return row;
}

function tmv3_step2Verify_(records) {
  const step1 = tmv3_step1CalendarRecords_();
  const step1Keys = {};
  const step2Keys = {};
  let missingDecision = 0;
  let badIdentity = 0;

  step1.forEach(function(record) {
    step1Keys[record.logicalKey] = true;
  });

  records.forEach(function(record) {
    step2Keys[record.logicalKey] = true;

    if (
      !record.step2 ||
      ['ELIGIBLE','REVIEW','SKIP'].indexOf(record.step2.disposition) === -1
    ) {
      missingDecision++;
    }

    if (!record.eventId || !record.start) badIdentity++;
  });

  const missingFromStep2 = Object.keys(step1Keys).filter(function(key) {
    return !step2Keys[key];
  });

  const introducedByStep2 = Object.keys(step2Keys).filter(function(key) {
    return !step1Keys[key];
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
      badIdentity === 0 &&
      missingFromStep2.length === 0 &&
      introducedByStep2.length === 0 &&
      rowCountsMatch,
    step1Records: step1.length,
    step2Records: records.length,
    missingDecision: missingDecision,
    badIdentity: badIdentity,
    missingFromStep2: missingFromStep2.length,
    introducedByStep2: introducedByStep2.length,
    expectedRows: expectedRows,
    actualRows: actualRows
  };
}

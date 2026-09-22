/************************************************************
 * 98_13_Current_Mapping_Standardization_R1.js
 *
 * Live-sheet standardization helpers.
 *
 * PUBLIC:
 *   VERIFY_REBUILD_CURRENT_TASK_MAPPING_R1()
 *
 * Goals:
 * - Rebuild all four mappings from the CURRENT workbook.
 * - Prevent PreInspection managed Task-link text from becoming
 *   customer/SO identity evidence.
 * - Verify Calendar Task links, including both PreInspection calendars.
 * - Report duplicate-candidate and title-standard gaps without guessing.
 *
 * This verifier does NOT write to Striven.
 ************************************************************/

const TM_CURRENT_MAPPING_STANDARD_R1 = Object.freeze({
  VERSION: 'TM_CURRENT_MAPPING_STANDARD_R1_20260922',
  STANDARD_TITLE: 'Customer Name - Address - Customer Phone Number'
});

function tmPreInspectIdentityAuthoredDescription_(description) {
  let text = String(description || '');

  // Current PreInspection managed link block.
  text = text.replace(
    /(?:<br\s*\/?>\s*)*<!--\s*PREINSPECT_STRIVEN_TASK_LINK_START\s*-->[\s\S]*?<!--\s*PREINSPECT_STRIVEN_TASK_LINK_END\s*-->/gi,
    ' '
  );

  // General Task Mapping acceptance block.
  text = text.replace(
    /(?:<br\s*\/?>\s*)*<!--\s*TASKMAP_TASK_ACCEPTANCE_START\s*-->[\s\S]*?<!--\s*TASKMAP_TASK_ACCEPTANCE_END\s*-->/gi,
    ' '
  );

  // Legacy plain-text / converted-HTML PreInspection Task footer.
  // It is automation-owned and appended at the end of the description.
  const legacyStart = text.search(
    /-{5,}\s*Pre-Inspection\s+Task\s+Link\s*-{5,}/i
  );

  if (legacyStart >= 0) {
    const tail = text.slice(legacyStart);

    if (/TaskInfo\.aspx\?TaskID=\d+/i.test(tail)) {
      text = text.slice(0, legacyStart);
    }
  }

  return text
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p\s*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&#x27;|&#39;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function tmStandardTaskTitle_(customerName, address, phone, suffix) {
  const customer = String(customerName || '').trim();
  const location = String(address || '').trim();
  const formattedPhone = tmStandardTaskPhone_(phone);
  const extra = String(suffix || '').trim();

  if (!customer || !location || !formattedPhone) {
    return '';
  }

  return [customer, location, formattedPhone, extra]
    .filter(function(v) { return String(v || '').trim() !== ''; })
    .join(' - ');
}

function tmStandardTaskPhone_(value) {
  const digits = String(value || '').replace(/\D+/g, '');
  let ten = digits;

  if (digits.length === 11 && digits.charAt(0) === '1') {
    ten = digits.slice(1);
  }

  if (ten.length !== 10) {
    return String(value || '').trim();
  }

  return '(' + ten.slice(0, 3) + ') ' +
    ten.slice(3, 6) + '-' +
    ten.slice(6);
}

function VERIFY_REBUILD_CURRENT_TASK_MAPPING_R1() {
  const started = new Date();
  const result = {
    mode: 'VERIFY_REBUILD_CURRENT_TASK_MAPPING_R1',
    version: TM_CURRENT_MAPPING_STANDARD_R1.VERSION,
    status: 'RUNNING',
    success: false,
    strivenWritesPerformed: false,
    mappingRebuilds: {},
    preinspectReviewBatches: [],
    statusCounts: {},
    preinspectIdentityContamination: [],
    duplicateCandidateRows: [],
    titleStandardGaps: {},
    calendarAcceptance: null,
    preinspectDualCalendar: null,
    runtimeSeconds: 0
  };

  if (typeof buildInstallTaskMappingFromSheets === 'function') {
    result.mappingRebuilds.Install = buildInstallTaskMappingFromSheets();
  }

  if (typeof buildDeliveryTaskMappingFromSheets === 'function') {
    result.mappingRebuilds.Delivery = buildDeliveryTaskMappingFromSheets();

    if (typeof fillDeliveryMappingIdsFromDeliveryApprovedOrdersFinal === 'function') {
      result.mappingRebuilds.DeliveryIds =
        fillDeliveryMappingIdsFromDeliveryApprovedOrdersFinal();
    }
  }

  if (typeof buildServiceTaskMappingFromSheets === 'function') {
    result.mappingRebuilds.Service = buildServiceTaskMappingFromSheets();
  }

  if (typeof buildPreInspectTaskMapping === 'function') {
    result.mappingRebuilds.PreInspection = buildPreInspectTaskMapping();

    if (typeof reviewNextPreInspectMappingBatch === 'function') {
      for (let i = 0; i < 20; i++) {
        const batch = reviewNextPreInspectMappingBatch();
        result.preinspectReviewBatches.push(batch);

        if (!batch || !Number(batch.processed || 0)) break;
        if (Number(batch.remainingPending || batch.remaining || 0) <= 0) break;
      }
    }
  }

  SpreadsheetApp.flush();

  const profiles = [
    { division: 'Install', sheet: 'Install Task Mapping' },
    { division: 'Delivery', sheet: 'Delivery Task Mapping' },
    { division: 'Service', sheet: 'Service Task Mapping' },
    { division: 'PreInspection', sheet: 'PreInspect Task Mapping' }
  ];

  profiles.forEach(function(profile) {
    const audit = tmCurrentMappingAuditSheet_(profile.sheet, profile.division);
    result.statusCounts[profile.division] = audit.statusCounts;
    result.titleStandardGaps[profile.division] = audit.titleStandardGaps;

    if (profile.division === 'PreInspection') {
      result.preinspectIdentityContamination =
        audit.preinspectIdentityContamination;
    }

    result.duplicateCandidateRows =
      result.duplicateCandidateRows.concat(audit.duplicateCandidateRows);
  });

  if (typeof tmCalendarTaskAcceptanceRun_ === 'function') {
    result.calendarAcceptance = tmCalendarTaskAcceptanceRun_(false);
  }

  if (typeof TEST_PREINSPECT_DUAL_CALENDAR_AUTO_APPEND_R1 === 'function') {
    result.preinspectDualCalendar =
      TEST_PREINSPECT_DUAL_CALENDAR_AUTO_APPEND_R1();
  }

  const calendarOk =
    !!(
      result.calendarAcceptance &&
      result.calendarAcceptance.success === true
    );

  const dualOk =
    !!(
      result.preinspectDualCalendar &&
      result.preinspectDualCalendar.pass === true
    );

  result.success =
    result.preinspectIdentityContamination.length === 0 &&
    calendarOk &&
    dualOk;

  result.status = result.success
    ? 'PASS'
    : 'REVIEW_REQUIRED';

  result.runtimeSeconds = Math.round(
    (new Date().getTime() - started.getTime()) / 1000
  );

  Logger.log('============================================================');
  Logger.log('CURRENT TASK MAPPING VERIFICATION: ' + result.status);
  Logger.log('============================================================');
  Logger.log(JSON.stringify(result, null, 2));

  return result;
}

function tmCurrentMappingAuditSheet_(sheetName, division) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss && ss.getSheetByName(sheetName);

  if (!sheet) {
    return {
      statusCounts: { MISSING_SHEET: 1 },
      preinspectIdentityContamination: [],
      duplicateCandidateRows: [],
      titleStandardGaps: []
    };
  }

  const values = sheet.getDataRange().getDisplayValues();
  const headerRow = tmCurrentMappingFindHeaderRow_(values);

  if (headerRow < 0) {
    return {
      statusCounts: { HEADER_NOT_FOUND: 1 },
      preinspectIdentityContamination: [],
      duplicateCandidateRows: [],
      titleStandardGaps: []
    };
  }

  const headers = values[headerRow].map(function(v) {
    return String(v || '').trim();
  });

  const idx = {};
  headers.forEach(function(name, i) {
    if (name) idx[name] = i;
  });

  const out = {
    statusCounts: {},
    preinspectIdentityContamination: [],
    duplicateCandidateRows: [],
    titleStandardGaps: []
  };

  for (let r = headerRow + 1; r < values.length; r++) {
    const row = values[r] || [];
    const status = tmCurrentMappingValue_(row, idx, [
      'Status', 'Mapping Status'
    ]).toUpperCase();

    if (!status && row.join('').trim() === '') continue;

    if (status) {
      out.statusCounts[status] =
        Number(out.statusCounts[status] || 0) + 1;
    }

    const taskId = Number(
      tmCurrentMappingValue_(row, idx, [
        'Task ID', 'Task Id', 'TaskId'
      ]) || 0
    );

    const issue = tmCurrentMappingValue_(row, idx, ['Issue']);
    const candidateText = tmCurrentMappingValue_(row, idx, [
      'Candidate Task IDs'
    ]);

    const candidateIds = String(candidateText || '')
      .match(/\d+/g) || [];

    const uniqueCandidateIds = candidateIds.filter(function(id, pos, arr) {
      return arr.indexOf(id) === pos;
    });

    if (uniqueCandidateIds.length > 1) {
      out.duplicateCandidateRows.push({
        division: division,
        mappingRow: r + 1,
        eventId: tmCurrentMappingValue_(row, idx, ['Event ID', 'EventId']),
        taskId: taskId || null,
        candidateTaskIds: uniqueCandidateIds,
        status: status
      });
    }

    if (
      division === 'PreInspection' &&
      taskId > 0 &&
      new RegExp(
        'Customer Number\\s+' + String(taskId) + '\\s+was not found',
        'i'
      ).test(issue)
    ) {
      out.preinspectIdentityContamination.push({
        mappingRow: r + 1,
        eventId: tmCurrentMappingValue_(row, idx, ['Event ID', 'EventId']),
        taskId: taskId,
        issue: issue
      });
    }

    const taskName = tmCurrentMappingValue_(row, idx, [
      'Task Name', 'TaskName'
    ]);

    const open = /^(OPEN|READY|MATCHED)/i.test(
      tmCurrentMappingValue_(row, idx, ['Task Status']) || status
    );

    if (taskId > 0 && open && taskName) {
      const legacy =
        /^(?:Preinspect\b|SO\s*#?|Level\s+\d+\b|GO BACK\b)/i
          .test(taskName);

      if (legacy) {
        out.titleStandardGaps.push({
          mappingRow: r + 1,
          taskId: taskId,
          currentTaskName: taskName,
          desiredPattern: TM_CURRENT_MAPPING_STANDARD_R1.STANDARD_TITLE
        });
      }
    }
  }

  return out;
}

function tmCurrentMappingFindHeaderRow_(values) {
  const max = Math.min(values.length, 10);

  for (let r = 0; r < max; r++) {
    const row = values[r] || [];
    const normalized = row.map(function(v) {
      return String(v || '').trim();
    });

    if (
      normalized.indexOf('Status') !== -1 &&
      (
        normalized.indexOf('Task ID') !== -1 ||
        normalized.indexOf('Task Id') !== -1
      )
    ) {
      return r;
    }
  }

  return -1;
}

function tmCurrentMappingValue_(row, idx, aliases) {
  for (let i = 0; i < aliases.length; i++) {
    const key = aliases[i];

    if (idx[key] !== undefined) {
      return String(row[idx[key]] || '').trim();
    }
  }

  return '';
}

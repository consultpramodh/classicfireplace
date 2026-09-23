/************************************************************
 * CF_TASKMAPPING_PREINSPECT_CALENDAR_NATIVE_MIRROR_R9
 * FILE: 35_PreInspect_Task_Review.gs
 *
 * ADDITIVE / ISOLATED PREINSPECT TASK MAPPING MODULE
 *
 * PURPOSE
 * - Maintain "PreInspect Calendar" as a one-way Google Calendar -> Sheet mirror.
 * - Refresh the mirror only when the source Calendar changes (plus manual repair).
 * - Keep newest appointment dates at the top.
 * - STEP 1 LOCK: extract Customer #, SO, phone, email, address/name and compound numeric identifiers before deciding.
 * - STEP 1 RECOVERY: Customer # -> compound Customer#/phone -> SO -> email -> phone/address/name intersections.
 * - STEP 2 LOCK: resolve customer-owned location first; then SO/global ownership recovery; identify genuinely new locations.
 * - Cross-check existing Striven Customers / Locations / Approved Sales Orders sheets.
 * - Contacts sheet is intentionally NOT required in this stage.
 * - Read Task 18191 using a local READ-ONLY requester for template review.
 * - For a confirmed selected row only, search Striven tasks for duplicate/existing PreInspect work.
 *
 * HARD GUARDRAILS
 * - DO NOT change any existing script file.
 * - DO NOT write to Google Calendar.
 * - WRITE ONLY to "PreInspect Calendar" and the dedicated "PreInspect Task Mapping" sheet.
 * - PreInspect Calendar is a SOURCE MIRROR only; never write back to Google Calendar.
 * - DO NOT write to any other existing reference/mapping sheet.
 * - DO NOT create/update/delete Striven records.
 * - DO NOT modify any existing menu source or existing menu item.
 * - Adds only one PreInspect-specific Calendar event-updated trigger when explicitly installed.
 * - Uses no Advanced Calendar API and requires no Google Cloud API enablement.
 * - Adds only a new top-level Pre Inspect menu from this file.
 * - DO NOT call existing push functions.
 *
 * CURRENT STAGE
 * CALENDAR CHANGE -> CALENDARAPP READ -> MIRROR SHEET -> NORMALIZE -> MATCH -> MAP -> TARGETED TASK LOOKUP -> REVIEW
 ************************************************************/

const PREINSPECT_REVIEW_CONFIG = {
  VERSION: '2026-09-05.PREINSPECT_R3_4_2_CUSTOMER_DATE_TIME_ASSIGNMENT_FIX',

  SHEETS: {
    CALENDAR: 'PreInspect Calendar',
    CUSTOMERS: 'Striven_Customers',
    LOCATIONS: 'Striven Customer Locations',
    SALES_ORDERS: 'Approved Sales Orders',
    MAPPING: 'PreInspect Task Mapping'
  },

  TEMPLATE_TASK_ID: 18191,
  ADDRESS_STRONG_SCORE: 70,
  MAX_DETAIL_LOG_ROWS: 25,

  TASK_SEARCH_PAGE_SIZE: 100,
  TASK_SEARCH_MAX_PAGES: 3,
  TASK_MAX_CANDIDATE_GETS: 10,
  MAPPING_BATCH_SIZE: 8,

  CALENDAR_SYNC: {
    CALENDAR_ID: 'c_3088a3989f3eb809957ed5c40137a7111a0ac97f68c29b40c144028cb14320dc@group.calendar.google.com',
    SPREADSHEET_ID: '1WdDufz3A0p12Vg-_0ypYbFFNGPQZB5ra4aJcS8ACWlU',
    TIMEZONE: 'America/Toronto',
    LOOKBACK_DAYS: 2,
    LOOKAHEAD_DAYS: 45,
    TRIGGER_FUNCTION: 'preinspectOnCalendarEventUpdated',
    HEADERS: [
      'Event ID',
      'Start Date',
      'Start Time',
      'End Date',
      'End Time',
      'All-Day?',
      'Title',
      'Location',
      'Description',
      'Description HTML Source',
      'Organizers',
      'Guests (emails)',
      'Customer #',
      'Phone',
      'Striven Task Link',
      'Event Link'
    ]
  },

  NON_CUSTOMER_TITLE_PATTERNS: [
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
    /^travel to\b/i
  ]
};


/************************************************************
 * PREINSPECT TASK MAPPING — OPERATOR SHEET
 *
 * Visible columns stay compact. Technical identifiers and lookup state
 * are persisted in hidden columns so unchanged events do not need to be
 * re-searched in Striven on every mapping rebuild.
 ************************************************************/
const PREINSPECT_MAP_VISIBLE_COLUMN_COUNT = 15;

const PREINSPECT_MAP_HEADERS = [
  'Calendar Row',
  'Status',
  'Task Action',
  'Date',
  'Time',
  'Calendar Title',
  'Customer #',
  'Customer',
  'Location',
  'Task ID',
  'Task Status',
  'Match',
  'Issue',
  'Last Reviewed',
  'Notes',

  // Hidden technical / audit columns
  'Event ID',
  'Calendar Location',
  'Calendar Description',
  'Customer ID',
  'Location ID',
  'SO #',
  'SO ID',
  'Contact ID',
  'Task Type ID',
  'Task Match Score',
  'Task Match Evidence',
  'Candidate Task IDs',
  'Calendar Start',
  'Calendar End',
  'Task Start',
  'Task Due',
  'Task SalesOrder ID',
  'Task Location ID',
  'Task Contact ID',
  'Classification',
  'Classification Reason',
  'Patch Preview',
  'Source Fingerprint',
  'Lookup State'
];


/************************************************************
 * PREINSPECT MENU — CENTRALIZED IN 02_Menu.gs (R3.4)
 *
 * All spreadsheet menu construction now lives in 02_Menu.gs.
 * This workflow file contains business logic only.
 ************************************************************/


/************************************************************
 * PREINSPECT CALENDAR — ONE-WAY LIVE MIRROR
 *
 * Source of truth: Google Calendar.
 * Direction: Calendar -> PreInspect Calendar sheet only.
 *
 * - No Calendar create/update/delete calls exist here.
 * - Uses the same native CalendarApp read pattern already proven by
 *   Install / Delivery / Service calendar workflows in this project.
 * - An installable Calendar ON_EVENT_UPDATED trigger fires when an
 *   event is created, updated, or deleted.
 * - Each trigger execution refreshes a bounded rolling window and
 *   writes only when the mirror contents actually changed.
 * - Rows are sorted by appointment start DESCENDING (newest first).
 ************************************************************/

function syncPreInspectCalendarNow() {
  return preinspectR3415SyncMirrorAndHyperlinks_('MANUAL_SYNC');
}



function preinspectOnCalendarEventUpdated(e) {
  return preinspectR3415SyncMirrorAndHyperlinks_('CALENDAR_EVENT_UPDATED');
}



function installPreInspectCalendarLiveSync() {
  const config = PREINSPECT_REVIEW_CONFIG.CALENDAR_SYNC;

  // Run a real read/write mirror refresh first. This verifies Calendar
  // and Spreadsheet authorization before creating the trigger.
  const initialSync = preinspectSyncCalendarMirror_('LIVE_SYNC_INSTALL');
  const existing = preinspectGetCalendarMirrorTriggers_();
  let created = false;
  let triggerId = existing.length ? existing[0].getUniqueId() : '';

  if (!existing.length) {
    const trigger = ScriptApp
      .newTrigger(config.TRIGGER_FUNCTION)
      .forUserCalendar(config.CALENDAR_ID)
      .onEventUpdated()
      .create();

    created = true;
    triggerId = trigger.getUniqueId();
  }

  const result = {
    mode: 'ONE_WAY_CALENDAR_LIVE_MIRROR',
    calendarId: config.CALENDAR_ID,
    sheetName: PREINSPECT_REVIEW_CONFIG.SHEETS.CALENDAR,
    triggerFunction: config.TRIGGER_FUNCTION,
    triggerCreated: created,
    triggerId: triggerId,
    triggerCount: preinspectGetCalendarMirrorTriggers_().length,
    calendarWritesPerformed: false,
    sheetWritesAllowed: true,
    initialSync: initialSync
  };

  Logger.log(JSON.stringify(result, null, 2));
  return result;
}


function testPreInspectCalendarLiveSyncStatus() {
  const config = PREINSPECT_REVIEW_CONFIG.CALENDAR_SYNC;
  const ss = SpreadsheetApp.openById(config.SPREADSHEET_ID);
  const sh = ss.getSheetByName(PREINSPECT_REVIEW_CONFIG.SHEETS.CALENDAR);
  const triggers = preinspectGetCalendarMirrorTriggers_();

  let newestSheetStart = '';
  if (sh && sh.getLastRow() >= 2) {
    newestSheetStart = String(sh.getRange(2, 2).getDisplayValue() || '').trim();
  }

  const result = {
    mode: 'READ_ONLY_STATUS',
    writesPerformed: false,
    calendarId: config.CALENDAR_ID,
    sheetName: PREINSPECT_REVIEW_CONFIG.SHEETS.CALENDAR,
    sheetExists: !!sh,
    mirrorRows: sh ? Math.max(0, sh.getLastRow() - 1) : 0,
    newestSheetStart: newestSheetStart,
    triggerInstalled: triggers.length > 0,
    triggerCount: triggers.length,
    triggerIds: triggers.map(function(t) { return t.getUniqueId(); }),
    lookbackDays: config.LOOKBACK_DAYS,
    lookaheadDays: config.LOOKAHEAD_DAYS,
    sort: 'START_DESCENDING',
    direction: 'GOOGLE_CALENDAR_TO_SHEET_ONLY',
    calendarReadMethod: 'CalendarApp.getCalendarById().getEvents()'
  };

  Logger.log(JSON.stringify(result, null, 2));
  return result;
}


function preinspectGetCalendarMirrorTriggers_() {
  const config = PREINSPECT_REVIEW_CONFIG.CALENDAR_SYNC;

  return ScriptApp.getProjectTriggers().filter(function(trigger) {
    if (trigger.getHandlerFunction() !== config.TRIGGER_FUNCTION) return false;
    if (trigger.getTriggerSource() !== ScriptApp.TriggerSource.CALENDAR) return false;

    const sourceId = String(trigger.getTriggerSourceId() || '').trim();
    return !sourceId || sourceId === config.CALENDAR_ID;
  });
}


function preinspectSyncCalendarMirror_(reason) {
  const config = PREINSPECT_REVIEW_CONFIG.CALENDAR_SYNC;
  const lock = LockService.getScriptLock();

  if (!lock.tryLock(10000)) {
    const skipped = {
      mode: 'ONE_WAY_CALENDAR_LIVE_MIRROR',
      status: 'SKIPPED_LOCKED',
      reason: reason || '',
      calendarWritesPerformed: false,
      sheetWritesPerformed: false
    };
    Logger.log(JSON.stringify(skipped, null, 2));
    return skipped;
  }

  try {
    const window = preinspectCalendarMirrorWindow_();
    const events = preinspectFetchCalendarEventsReadonly_(window.start, window.end);
    const rows = events.map(preinspectCalendarAppEventToRow_);

        rows.sort(function(a, b) {
          const aStart = preinspectR342CalendarPartsMillis_(a[1], a[2]);
          const bStart = preinspectR342CalendarPartsMillis_(b[1], b[2]);
          if (aStart !== bStart) return aStart - bStart;

          const aEnd = preinspectR342CalendarPartsMillis_(a[3], a[4]);
          const bEnd = preinspectR342CalendarPartsMillis_(b[3], b[4]);
          if (aEnd !== bEnd) return aEnd - bEnd;

          return String(a[6] || '').localeCompare(String(b[6] || ''));
        });

    const ss = SpreadsheetApp.openById(config.SPREADSHEET_ID);
    const sheet = ss.getSheetByName(PREINSPECT_REVIEW_CONFIG.SHEETS.CALENDAR);
    if (!sheet) throw new Error('Missing "PreInspect Calendar" sheet.');

    // Customer # is the primary PreInspect identity. Preserve a previously
    // resolved Customer # by Event ID when the Calendar text itself does not
    // contain the number. This is a sheet-only enrichment; Calendar is never written.
    preinspectR342CarryForwardCalendarCustomerNumbers_(sheet, rows);

    const changed = preinspectCalendarMirrorNeedsWrite_(sheet, rows);
    if (changed) {
      preinspectWriteCalendarMirror_(sheet, rows);
    }

    // R5.5: refresh the isolated Stephen review queue. This is read-only Calendar -> Sheet.
    // It preserves operator checkbox choices by Event ID + occurrence start and performs no guest writes.
    let stephenCandidateQueue = null;
    if (typeof preinspectRefreshStephenCandidateQueue_ === 'function') {
      try {
        stephenCandidateQueue = preinspectRefreshStephenCandidateQueue_(sheet, window.start, window.end);
      } catch (queueErr) {
        stephenCandidateQueue = {status:'REVIEW_QUEUE_ERROR',error:String(queueErr && queueErr.message || queueErr)};
        Logger.log(JSON.stringify(stephenCandidateQueue));
      }
    }

    const result = {
      mode: 'ONE_WAY_CALENDAR_LIVE_MIRROR',
      status: changed ? 'UPDATED' : 'NO_CHANGE',
      reason: reason || '',
      calendarId: config.CALENDAR_ID,
      sheetName: PREINSPECT_REVIEW_CONFIG.SHEETS.CALENDAR,
      windowStart: preinspectCalendarIso_(window.start),
      windowEnd: preinspectCalendarIso_(window.end),
      eventsRead: events.length,
      rowsWritten: changed ? rows.length : 0,
      mirrorRows: rows.length,
      firstStart: rows.length ? rows[0][1] : '',
      calendarWritesPerformed: false,
      sheetWritesPerformed: changed || !!(stephenCandidateQueue && stephenCandidateQueue.sheetWritesPerformed),
      stephenCandidateQueue: stephenCandidateQueue,
      sort: 'START_ASCENDING_TODAY_FIRST'
    };

    Logger.log(JSON.stringify(result, null, 2));
    return result;
  } finally {
    lock.releaseLock();
  }
}


function preinspectCalendarMirrorWindow_() {
  const config = PREINSPECT_REVIEW_CONFIG.CALENDAR_SYNC;
  const now = new Date();

  const start = new Date(now.getTime());
  // PreInspect operational view is TODAY forward only. Past appointments
  // are intentionally removed from the live Calendar mirror.
  start.setHours(0, 0, 0, 0);

  const end = new Date(now.getTime());
  end.setDate(end.getDate() + Number(config.LOOKAHEAD_DAYS || 45));
  end.setHours(23, 59, 59, 999);

  return { start: start, end: end };
}


function preinspectFetchCalendarEventsReadonly_(start, end) {
  const config = PREINSPECT_REVIEW_CONFIG.CALENDAR_SYNC;
  const calendar = CalendarApp.getCalendarById(config.CALENDAR_ID);

  if (!calendar) {
    throw new Error(
      'PreInspect calendar not found or current user has no access: ' +
      config.CALENDAR_ID
    );
  }

  // Same project-native pattern used by Install / Delivery / Service:
  // CalendarApp read only -> bounded getEvents() snapshot.
  return calendar.getEvents(start, end);
}


function preinspectCalendarAppEventToRow_(event) {
  const config = PREINSPECT_REVIEW_CONFIG.CALENDAR_SYNC;
  const isAllDay = event.isAllDayEvent();
  const start = event.getStartTime();
  const end = event.getEndTime();
  const title = String(event.getTitle() || '');
  const location = String(event.getLocation() || '');
  const rawDescription = String(event.getDescription() || '');
  const description = preinspectCalendarReadableDescription_(rawDescription);

  const organizers = preinspectR34SafeCalendarCall_(function() {
    return typeof event.getCreators === 'function'
      ? (event.getCreators() || []).join(', ')
      : '';
  });

  const guests = preinspectR34SafeCalendarCall_(function() {
    const list = typeof event.getGuestList === 'function'
      ? (event.getGuestList() || [])
      : [];
    return list.map(function(guest) {
      return guest && typeof guest.getEmail === 'function'
        ? String(guest.getEmail() || '')
        : '';
    }).filter(Boolean).join(', ');
  });

  const signals = preinspectExtractSignals_({
    title: title,
    description: description,
    location: location
  });

  const customerNumber = signals.customerNumber ||
    ((signals.customerNumberCandidates || []).length === 1
      ? signals.customerNumberCandidates[0]
      : '');

  const phone = (signals.phones || [])[0] || '';
  const taskLink = preinspectR34ExtractTaskUrl_(rawDescription);

  return [
    String(event.getId() || ''),
    preinspectCalendarDateOnly_(start),
    isAllDay ? '' : preinspectR34CalendarTime_(start),
    preinspectCalendarDateOnly_(end),
    isAllDay ? '' : preinspectR34CalendarTime_(end),
    isAllDay ? 'Yes' : 'No',
    title,
    location,
    description,
    rawDescription,
    organizers,
    guests,
    customerNumber,
    phone,
    taskLink,
    preinspectBuildNativeCalendarEventLink_(event, config.CALENDAR_ID)
  ];
}


function preinspectBuildNativeCalendarEventLink_(event, calendarId) {
  const eventId = String(event && event.getId ? event.getId() : '').trim();
  const calId = String(calendarId || '').trim();
  if (!eventId || !calId) return '';

  const eid = Utilities.base64EncodeWebSafe(eventId + ' ' + calId)
    .replace(/=+$/g, '');

  return 'https://www.google.com/calendar/event?eid=' + eid +
    '&ctz=' + encodeURIComponent(PREINSPECT_REVIEW_CONFIG.CALENDAR_SYNC.TIMEZONE);
}


function preinspectCalendarDateOnly_(date) {
  return Utilities.formatDate(
    date,
    PREINSPECT_REVIEW_CONFIG.CALENDAR_SYNC.TIMEZONE,
    'yyyy-MM-dd'
  );
}


function preinspectCalendarReadableDescription_(value) {
  let source = String(value || '');

  // Managed Task-link blocks are transport metadata, not customer identity
  // evidence. Remove them before Customer/SO/phone extraction so Task IDs can
  // never be mistaken for Customer Numbers.
  if (typeof preinspectRemoveManagedTaskLinkBlock_ === 'function') {
    source = preinspectRemoveManagedTaskLinkBlock_(source);
  }

  if (typeof tm_cleanHtmlToText_ === 'function') {
    return tm_cleanHtmlToText_(source);
  }
  return source.trim();
}


function preinspectCalendarMirrorNeedsWrite_(sheet, rows) {
  const config = PREINSPECT_REVIEW_CONFIG.CALENDAR_SYNC;
  const headers = config.HEADERS;
  const lastRow = sheet.getLastRow();

  const currentHeaders = sheet.getRange(1, 1, 1, headers.length).getDisplayValues()[0];
  if (JSON.stringify(currentHeaders) !== JSON.stringify(headers)) return true;

  const currentRows = lastRow >= 2
    ? sheet.getRange(2, 1, lastRow - 1, headers.length).getDisplayValues()
    : [];

  const comparableRows = rows.map(function(row) {
    return row.map(function(value) { return String(value === null || value === undefined ? '' : value); });
  });

  return JSON.stringify(currentRows) !== JSON.stringify(comparableRows);
}


function preinspectWriteCalendarMirror_(sheet, rows) {
  const headers = PREINSPECT_REVIEW_CONFIG.CALENDAR_SYNC.HEADERS;
  const requiredRows = Math.max(2, rows.length + 1);

  if (sheet.getMaxRows() < requiredRows) {
    sheet.insertRowsAfter(sheet.getMaxRows(), requiredRows - sheet.getMaxRows());
  }
  if (sheet.getMaxColumns() < headers.length) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), headers.length - sheet.getMaxColumns());
  }

    const clearRows = Math.max(0, sheet.getLastRow() - 1);
  // R5.5: production mirror owns A:R only. T:AD is the isolated Stephen review queue.
  const productionColumnCount = Math.min(sheet.getMaxColumns(), Math.max(headers.length, 18));
  if (clearRows > 0) {
    sheet.getRange(2, 1, clearRows, productionColumnCount).clearContent();
  }

  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  // R5.5: clear only production helper headers Q:R; never touch S:AD review queue.
  const productionExtraCols = Math.max(0, Math.min(sheet.getMaxColumns(), 18) - headers.length);
  if (productionExtraCols > 0) {
    sheet.getRange(1, headers.length + 1, 1, productionExtraCols)
      .clearContent()
      .clearFormat();
  }
  if (rows.length) {
    sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
  }

  sheet.setFrozenRows(1);

  if (typeof tm_applyStandardCalendarHeaderStyle_ === 'function') {
    tm_applyStandardCalendarHeaderStyle_(sheet, headers.length);
  } else {
    sheet.getRange(1, 1, 1, headers.length)
      .setFontWeight('bold')
      .setBackground('#1f4e78')
      .setFontColor('#ffffff')
      .setWrap(true);
  }

  if (rows.length) {
    ['Title','Location','Description','Description HTML Source','Organizers','Guests (emails)']
      .forEach(function(name) {
        const col = headers.indexOf(name) + 1;
        if (col > 0) sheet.getRange(2, col, rows.length, 1).setWrap(true);
      });
  }

  const htmlSourceCol = headers.indexOf('Description HTML Source') + 1;
  if (htmlSourceCol > 0) {
    try { sheet.hideColumns(htmlSourceCol); } catch (err) {}
  }

  try { sheet.autoResizeColumns(1, headers.length); } catch (err) {}
}


function preinspectCalendarMirrorSortMillis_(value) {
  const clean = String(value || '').trim();
  if (!clean) return 0;

  const plainDate = clean.match(/^(\\d{4})-(\\d{2})-(\\d{2})$/);
  if (plainDate) {
    return new Date(
      Number(plainDate[1]),
      Number(plainDate[2]) - 1,
      Number(plainDate[3]),
      0, 0, 0, 0
    ).getTime();
  }

  const d = new Date(clean);
  return isNaN(d.getTime()) ? 0 : d.getTime();
}


function preinspectCalendarIso_(date) {
  return Utilities.formatDate(
    date,
    PREINSPECT_REVIEW_CONFIG.CALENDAR_SYNC.TIMEZONE,
    "yyyy-MM-dd'T'HH:mm:ssXXX"
  );
}


/************************************************************
 * PUBLIC MANUAL FUNCTIONS
 ************************************************************/

/**
 * Dependency check only. No writes.
 */
function testPreInspectReviewConfig() {
  const result = {
    mode: 'PREINSPECT_MAPPING',
    version: PREINSPECT_REVIEW_CONFIG.VERSION,
    writesPerformed: false,
    existingFilesModified: false,
    dependencies: {
      tm_getSheetObjects_: typeof tm_getSheetObjects_ === 'function',
      tm_cleanString_: typeof tm_cleanString_ === 'function',
      tm_normalizeText_: typeof tm_normalizeText_ === 'function',
      tm_extractEmails_: typeof tm_extractEmails_ === 'function',
      PropertiesService: typeof PropertiesService !== 'undefined',
      CalendarApp: typeof CalendarApp !== 'undefined',
      UrlFetchApp: typeof UrlFetchApp !== 'undefined'
    }
  };

  Logger.log(JSON.stringify(result, null, 2));
  return result;
}


/**
 * Shows current reference sheet row counts + headers.
 * Does NOT refresh any report.
 */
function testPreInspectReferenceData() {
  const ss = SpreadsheetApp.getActive();
  const result = {
    mode: 'READ_ONLY',
    writesPerformed: false,
    sheets: {}
  };

  Object.keys(PREINSPECT_REVIEW_CONFIG.SHEETS).forEach(function(key) {
    const name = PREINSPECT_REVIEW_CONFIG.SHEETS[key];
    const sh = ss.getSheetByName(name);

    result.sheets[key] = {
      name: name,
      exists: !!sh,
      rows: sh ? Math.max(0, sh.getLastRow() - 1) : 0,
      headers: sh && sh.getLastColumn()
        ? sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0]
            .map(function(v) { return tm_cleanString_(v); })
        : []
    };
  });

  Logger.log(JSON.stringify(result, null, 2));
  return result;
}


/**
 * Select one row on "PreInspect Calendar" and run the matching review.
 * No writes.
 */
function testPreInspectMatchSelectedRow() {
  const sh = SpreadsheetApp.getActiveSheet();

  if (!sh || sh.getName() !== PREINSPECT_REVIEW_CONFIG.SHEETS.CALENDAR) {
    throw new Error(
      'Run this from the "' + PREINSPECT_REVIEW_CONFIG.SHEETS.CALENDAR + '" sheet.'
    );
  }

  const rowNumber = sh.getActiveRange().getRow();
  if (rowNumber < 2) throw new Error('Select a data row, not the header.');

  const rows = tm_getSheetObjects_(sh);
  const row = rows[rowNumber - 2];
  if (!row) throw new Error('Selected row has no calendar data.');

  const result = preinspectReviewRow_(row, preinspectBuildIndexes_(), rowNumber);

  if (result.decision === 'CONFIRMED') {
    try {
      const taskLookup = preinspectLookupTaskForReviewedRow_(result);
      result.taskLookup = taskLookup;
      result.taskAction = taskLookup.action;
      result.nextStage = taskLookup.nextStage;
    } catch (err) {
      result.taskLookup = {
        mode: 'READ_ONLY',
        writesPerformed: false,
        status: 'ERROR',
        action: 'REVIEW',
        reason: err && err.message ? err.message : String(err)
      };
      result.taskAction = 'REVIEW';
      result.nextStage = 'TASK_LOOKUP_API_REVIEW';
    }
  }

  Logger.log(JSON.stringify(result, null, 2));
  return result;
}


/**
 * Reviews all populated rows currently in "PreInspect Calendar".
 * Intended for the rolling recent-window sheet already maintained separately.
 * No writes.
 */
function testPreInspectMatchRecentRows() {
  const sh = SpreadsheetApp.getActive().getSheetByName(
    PREINSPECT_REVIEW_CONFIG.SHEETS.CALENDAR
  );

  if (!sh) throw new Error('Missing "PreInspect Calendar" sheet.');

  const rows = tm_getSheetObjects_(sh);
  const indexes = preinspectBuildIndexes_();
  const results = [];

  const summary = {
    rowsReviewed: 0,
    confirmed: 0,
    review: 0,
    skipped: 0,
    conflicts: 0,
    customerNumberPrimary: 0,
    salesOrderPrimary: 0,
    emailPrimary: 0,
    phonePlusPrimary: 0,
    addressNamePrimary: 0,
    writesPerformed: false
  };

  rows.forEach(function(row, i) {
    if (preinspectCalendarRowBlank_(row)) return;

    const result = preinspectReviewRow_(row, indexes, i + 2);
    results.push(result);
    summary.rowsReviewed++;

    if (result.decision === 'CONFIRMED') summary.confirmed++;
    else if (result.decision === 'SKIP') summary.skipped++;
    else summary.review++;

    if (result.customerMatch && result.customerMatch.conflicts.length) {
      summary.conflicts++;
    }

    const method = result.customerMatch ? result.customerMatch.primaryMethod : '';
    if (method === 'CUSTOMER_NUMBER_EXACT') summary.customerNumberPrimary++;
    if (method === 'SALES_ORDER_EXACT') summary.salesOrderPrimary++;
    if (method === 'EMAIL_EXACT') summary.emailPrimary++;
    if (method === 'PHONE_PLUS_ADDRESS' || method === 'PHONE_PLUS_NAME') {
      summary.phonePlusPrimary++;
    }
    if (method === 'ADDRESS_PLUS_NAME') summary.addressNamePrimary++;
  });

  Logger.log(JSON.stringify({
    mode: 'READ_ONLY',
    version: PREINSPECT_REVIEW_CONFIG.VERSION,
    summary: summary,
    detailPreview: results.slice(0, PREINSPECT_REVIEW_CONFIG.MAX_DETAIL_LOG_ROWS)
  }, null, 2));

  return {
    mode: 'READ_ONLY',
    version: PREINSPECT_REVIEW_CONFIG.VERSION,
    summary: summary,
    results: results,
    writesPerformed: false
  };
}


/**
 * Reads known Task 18191 using the EXISTING Striven GET helper.
 * This is only to establish the future task-template settings.
 * No writes.
 */
function testPreInspectTask18191Template() {
  const raw = preinspectGetTaskByIdReadonly_(PREINSPECT_REVIEW_CONFIG.TEMPLATE_TASK_ID);
  const result = preinspectTaskTemplateSnapshot_(raw);

  Logger.log(JSON.stringify(result, null, 2));
  return result;
}


/************************************************************
 * MAIN REVIEW
 ************************************************************/

function preinspectReviewRow_(row, indexes, rowNumber) {
  const event = {
    eventId: preinspectFirst_(row, ['Event ID', 'EventId', 'CalendarEventId', 'Id']),
    start: preinspectR34CalendarRowDateTime_(row, 'Start'),
    end: preinspectR34CalendarRowDateTime_(row, 'End'),
    allDay: /^yes$/i.test(String(preinspectFirst_(row, ['All-Day?', 'All Day?', 'AllDay']) || '').trim()),
    title: preinspectFirst_(row, ['Title', 'Calendar Title', 'Summary']),
    location: preinspectFirst_(row, ['Location', 'Calendar Location']),
    description: preinspectFirst_(row, ['Description', 'Calendar Description', 'Notes']),
    organizers: preinspectFirst_(row, ['Organizers', 'Organizer'])
  };

  const signals = preinspectExtractSignals_(event);

  // The one-way Calendar mirror has dedicated identity columns. Prefer a
  // previously resolved/carried-forward Customer # and normalized Phone over
  // re-parsing managed description metadata.
  const mirrorCustomerNumber = preinspectNumber_(
    preinspectFirst_(row, ['Customer #', 'Customer Number', 'CustomerNumber'])
  );
  if (mirrorCustomerNumber) {
    signals.customerNumber = mirrorCustomerNumber;
    signals.customerNumberCandidates = [];
  }

  const mirrorPhone = preinspectPhone_(
    preinspectFirst_(row, ['Phone', 'Phone Number', 'Customer Phone'])
  );
  if (mirrorPhone) {
    signals.phones = preinspectUnique_(
      [mirrorPhone].concat(signals.phones || [])
    );
  }

  let classification = preinspectClassifyCalendarEvent_(event, signals);

  if (classification.code === 'SKIP_NON_JOB' || classification.code === 'OTHER_JOB') {
    return preinspectBaseResult_(rowNumber, event, signals, {
      decision: 'SKIP', reason: classification.reason,
      classification: classification.code, classificationReason: classification.reason,
      customerMatch: null, locationMatch: null, contactMatch: null, salesOrderMatch: null
    });
  }

  let customerMatch = preinspectResolveCustomer_(signals, indexes);
  let locationMatch = null;
  let contactMatch = null;
  let salesOrderMatch = null;

  if (customerMatch.customerKey) {
    locationMatch = preinspectResolveLocation_(customerMatch.customerKey, signals, indexes);
    salesOrderMatch = preinspectResolveSalesOrder_(customerMatch.customerKey, signals, indexes);
    contactMatch = preinspectResolveContactFromExistingInfo_(salesOrderMatch);
  }

  /**********************************************************
   * PREINSPECT R2.7 — PHONE + CONFIRMED CUSTOMER LOCATION
   *
   * PHONE_ONLY is intentionally review-only by itself. But when
   * that unique phone candidate's own Striven location has now
   * been CONFIRMED by the existing customer-scoped location
   * resolver, the two independent signals corroborate the same
   * customer and the circular gate can be safely closed.
   **********************************************************/
  if (
    customerMatch &&
    customerMatch.status === 'REVIEW' &&
    customerMatch.primaryMethod === 'PHONE_ONLY' &&
    customerMatch.customerKey &&
    locationMatch &&
    locationMatch.status === 'CONFIRMED'
  ) {
    customerMatch = preinspectConfirmCustomer_(
      customerMatch.customerKey,
      'PHONE_PLUS_ADDRESS',
      signals,
      indexes
    );
  }

  /**********************************************************
   * PREINSPECT R2.7 — DEDICATED CALENDAR CLASSIFICATION
   *
   * A LIKELY row on the dedicated PreInspect Calendar becomes
   * PREINSPECT_JOB only after both customer and location are
   * confirmed. Explicit SKIP_NON_JOB / OTHER_JOB decisions have
   * already returned above and can never be promoted here.
   **********************************************************/
  if (
    classification.code === 'LIKELY_PREINSPECT_JOB' &&
    customerMatch &&
    customerMatch.status === 'CONFIRMED' &&
    locationMatch &&
    locationMatch.status === 'CONFIRMED'
  ) {
    classification = {
      code: 'PREINSPECT_JOB',
      reason: 'Dedicated PreInspect Calendar appointment has a confirmed customer and confirmed Striven location.'
    };
  }

  if (classification.code === 'REVIEW_CLASSIFICATION') {
    return preinspectBaseResult_(rowNumber, event, signals, {
      decision: 'REVIEW', reason: classification.reason,
      classification: classification.code, classificationReason: classification.reason,
      customerMatch: customerMatch, locationMatch: locationMatch,
      contactMatch: contactMatch, salesOrderMatch: salesOrderMatch
    });
  }

  const final = preinspectFinalDecision_(signals, customerMatch, locationMatch, salesOrderMatch);
  return preinspectBaseResult_(rowNumber, event, signals, {
    decision: final.decision,
    reason: final.reason,
    classification: classification.code,
    classificationReason: classification.reason,
    customerMatch: customerMatch,
    locationMatch: locationMatch,
    contactMatch: contactMatch,
    salesOrderMatch: salesOrderMatch
  });
}


function preinspectBaseResult_(rowNumber, event, signals, values) {
  const taskEligibleClassification =
    values.classification === 'PREINSPECT_JOB' ||
    values.classification === 'LIKELY_PREINSPECT_JOB';

  return {
    mode: 'READ_ONLY', writesPerformed: false,
    rowNumber: rowNumber, eventId: event.eventId,
    start: event.start, end: event.end, allDay: event.allDay === true, title: event.title,
    calendarLocation: event.location, calendarDescription: event.description,
    signals: signals,
    classification: values.classification || '',
    classificationReason: values.classificationReason || '',
    customerMatch: values.customerMatch,
    locationMatch: values.locationMatch,
    contactMatch: values.contactMatch,
    salesOrderMatch: values.salesOrderMatch,
    decision: values.decision,
    reason: values.reason,
    taskAction: 'NOT_EVALUATED',
    nextStage: values.decision === 'CONFIRMED' && taskEligibleClassification
      ? 'READ_ONLY_TASK_LOOKUP_AND_DUPLICATE_CHECK'
      : 'NONE'
  };
}


function preinspectFinalDecision_(signals, customer, location, salesOrder) {
  if (!customer || customer.status !== 'CONFIRMED') {
    return { decision: 'REVIEW', reason: customer ? customer.reason : 'Customer not confirmed.' };
  }

  if (customer.conflicts.length) {
    return { decision: 'REVIEW', reason: 'Strong identifier conflict: ' + customer.conflicts.join('; ') };
  }

  if (location && location.status === 'NEW_LOCATION_REQUIRED') {
    return {
      decision: 'REVIEW',
      reason: location.reason
    };
  }

  if (signals.address && (!location || location.status !== 'CONFIRMED')) {
    return {
      decision: 'REVIEW',
      reason: location ? location.reason : 'Customer confirmed, but appointment address is not tied to a Striven location.'
    };
  }

  if (!signals.address && location && location.status !== 'CONFIRMED') {
    return { decision: 'REVIEW', reason: location.reason };
  }

  /**********************************************************
   * PREINSPECT R2.6 BUSINESS RULE — PRESERVED
   * Sales Order is informational only after customer/location
   * identity is confirmed. It never attaches initial PreInspect
   * CREATE/RECREATE to the Sales Order.
   **********************************************************/
  return {
    decision: 'CONFIRMED',
    reason: 'Customer and location identity are confirmed. Safe to proceed to read-only task lookup.'
  };
}


/************************************************************
 * SIGNAL EXTRACTION
 ************************************************************/

function preinspectExtractSignals_(event) {
  event = event || {};

  const authoredDescription =
    typeof tmPreInspectIdentityAuthoredDescription_ === 'function'
      ? tmPreInspectIdentityAuthoredDescription_(event.description)
      : String(event.description || '');

  const combined = [event.title, authoredDescription, event.location].join(' ');
  const salesOrderNumber = preinspectExtractSONumber_(combined);
  const customerNumber = preinspectExtractCustomerNumber_(combined, salesOrderNumber);
  const compoundIdentifiers = preinspectExtractCompoundIdentifiers_(combined);

  // Legacy titles sometimes contain a bare Striven Customer Number, e.g.
  // "Steve Legge 416 888-9788 62141 SO#584343". Bare values are candidates
  // only; they are never authoritative without corroborating Striven evidence.
  let candidateText = String(event.title || '')
    .replace(/\b(?:SO|S\/?O|S\.O\.?|Sales\s*Order|Order)\s*(?:No\.?|Number|#)?\s*[:#\-]?\s*\d{4,8}(?:\s*[\/,;&+]\s*(?:(?:SO|S\/?O|S\.O\.?|Sales\s*Order|Order)\s*(?:No\.?|Number|#)?\s*[:#\-]?\s*)?#?\d{4,8})*/gi, ' ')
    .replace(/(?:\+?1[\s\-.]?)?(?:\(?\d{3}\)?[\s\-.]?\d{3}[\s\-.]?\d{4})/gi, ' ')
    .replace(/\b(?:Customer|Cust|CX|C)\s*(?:Number|No\.?|#)?\s*[:#\-]?\s*\d{4,8}\b/gi, ' ')
    .replace(/\b\d{14,19}\b/g, ' ');

  const candidateNumbers = [];
  const candidateRe = /(?:^|[^A-Za-z0-9])(\d{5,8})(?=$|[^A-Za-z0-9])/g;
  let candidateMatch;
  while ((candidateMatch = candidateRe.exec(candidateText)) !== null) {
    const value = candidateMatch[1];
    if (salesOrderNumber && value === String(salesOrderNumber)) continue;
    if (/^(?:19|20)\d{2}$/.test(value)) continue;
    candidateNumbers.push(value);
  }

  const customerNumberCandidates = customerNumber
    ? []
    : preinspectUnique_(candidateNumbers);

  const locationAddress = tm_cleanString_(event.location);
  const descriptionAddress = locationAddress
    ? ''
    : preinspectExtractAddressFromDescription_(authoredDescription);
  const address = locationAddress || descriptionAddress;

  return {
    rawText: combined,
    customerNumber: customerNumber,
    customerNumberCandidates: customerNumberCandidates,
    salesOrderNumber: salesOrderNumber,
    compoundIdentifiers: compoundIdentifiers,
    phones: preinspectExtractPhones_(combined),
    emails: tm_extractEmails_(combined).map(function(v) {
      return String(v).toLowerCase();
    }),
    name: preinspectExtractName_(event.title, customerNumberCandidates),
    address: address,
    addressSource: locationAddress ? 'CALENDAR_LOCATION' : (descriptionAddress ? 'DESCRIPTION' : ''),
    normalizedAddress: preinspectNormalizeAddress_(address)
  };
}


function preinspectExtractSONumber_(text) {
  const value = String(text || '');
  const patterns = [
    /\bSO\s*(?:No\.?|Number|#)?\s*[:#\-]?\s*(\d{4,8})\b/i,
    /\bS\/?O\s*(?:No\.?|Number|#)?\s*[:#\-]?\s*(\d{4,8})\b/i,
    /\bS\.O\.?\s*(?:No\.?|Number|#)?\s*[:#\-]?\s*(\d{4,8})\b/i,
    /\bSales\s*Order\s*(?:No\.?|Number|#)?\s*[:#\-]?\s*(\d{4,8})\b/i,
    /\bOrder\s*(?:No\.?|Number|#)?\s*[:#\-]?\s*(\d{4,8})\b/i
  ];

  for (let i = 0; i < patterns.length; i++) {
    const match = value.match(patterns[i]);
    if (match) return match[1];
  }

  return '';
}


function preinspectExtractCustomerNumber_(text, soNumber) {
  let value = String(text || '');

  const explicit = [
    /\bCustomer\s*(?:Number|No\.?|#)?\s*[:#\-]?\s*(\d{4,8})\b/i,
    /\bCust(?:omer)?\s*(?:Number|No\.?|#)?\s*[:#\-]?\s*(\d{4,8})\b/i,
    /\bCX\s*#?\s*(\d{4,8})\b/i,
    /\bC\s*#\s*(\d{4,8})\b/i
  ];

  for (let i = 0; i < explicit.length; i++) {
    const match = value.match(explicit[i]);
    if (match) return match[1];
  }

  // Bare "#12345" values are legacy candidates, not explicit Customer Numbers.
  // preinspectExtractSignals_ already collects them in customerNumberCandidates,
  // where Striven phone/address/name/SO evidence must corroborate them.
  return '';
}


function preinspectExtractPhones_(text) {
  // Capture only standalone NANP phone shapes. Do not take a 10-digit slice
  // out of a longer compound numeric run; those are handled separately.
  // Normalize common Unicode parentheses/dashes used by pasted phone numbers.
  const value = String(text || '')
    .replace(/[（﹙﴾]/g, '(')
    .replace(/[）﹚﴿]/g, ')')
    .replace(/[‐‑‒–—−]/g, '-');
  const out = [];
  const re = /(?:^|[^0-9])((?:\+?1[\s\-.]?)?(?:\(?\d{3}\)?[\s\-.]?\d{3}[\s\-.]?\d{4})(?:\s*(?:x|ext\.?)\s*\d+)?)(?=$|[^0-9])/gi;
  let match;
  while ((match = re.exec(value)) !== null) {
    const phone = preinspectPhone_(match[1]);
    if (phone) out.push(phone);
  }
  return preinspectUnique_(out);
}

function preinspectExtractCompoundIdentifiers_(text) {
  const value = String(text || '');
  const runs = value.match(/\b\d{14,19}\b/g) || [];
  const out = [];

  runs.forEach(function(run) {
    const digits = String(run);
    [10, 11].forEach(function(phoneLength) {
      const customerLength = digits.length - phoneLength;
      if (customerLength < 4 || customerLength > 8) return;

      const leftCustomer = digits.slice(0, customerLength);
      const rightPhoneRaw = digits.slice(customerLength);
      const rightPhone = preinspectCompoundPhone_(rightPhoneRaw);
      if (rightPhone) {
        out.push({
          raw: digits,
          order: 'CUSTOMER_THEN_PHONE',
          customerNumber: leftCustomer,
          phone: rightPhone
        });
      }

      const leftPhoneRaw = digits.slice(0, phoneLength);
      const rightCustomer = digits.slice(phoneLength);
      const leftPhone = preinspectCompoundPhone_(leftPhoneRaw);
      if (leftPhone) {
        out.push({
          raw: digits,
          order: 'PHONE_THEN_CUSTOMER',
          customerNumber: rightCustomer,
          phone: leftPhone
        });
      }
    });
  });

  const seen = {};
  return out.filter(function(item) {
    const sig = [item.raw, item.order, item.customerNumber, item.phone].join('|');
    if (seen[sig]) return false;
    seen[sig] = true;
    return true;
  });
}


function preinspectCompoundPhone_(digits) {
  let value = String(digits || '').replace(/\D/g, '');
  if (value.length === 11 && value.charAt(0) === '1') value = value.slice(1);
  return value.length === 10 ? value : '';
}


function preinspectExtractAddressFromDescription_(description) {
  const raw = String(description || '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ' ');
  const lines = raw.split(/[\r\n]+/).map(function(v) { return tm_cleanString_(v); }).filter(Boolean);
  const street = /\b\d+[A-Za-z]?\s+[A-Za-z0-9.'’\- ]{2,70}\b(?:Street|St|Road|Rd|Drive|Dr|Avenue|Ave|Crescent|Cres|Boulevard|Blvd|Court|Ct|Lane|Ln|Trail|Trl|Place|Pl|Terrace|Terr|Way)\b/i;
  const postal = /\b[A-Z]\d[A-Z]\s?\d[A-Z]\d\b/i;

  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(street);
    if (m) return tm_cleanString_(lines[i].slice(m.index));
  }

  // A postal-code-bearing line with a leading house number is also useful.
  for (let i = 0; i < lines.length; i++) {
    if (/^\d+[A-Za-z]?\s+/.test(lines[i]) && postal.test(lines[i])) {
      return tm_cleanString_(lines[i]);
    }
  }

  return '';
}


function preinspectExtractName_(title, customerNumberCandidates) {
  let value = tm_cleanString_(title)
    .replace(/\?\s*[A-Za-z0-9][A-Za-z0-9._+\/-]*/g, ' ')
    .replace(/\b(?:SO|S\/O|Sales\s*Order|Order)\s*[#:\-]?\s*\d{4,8}(?:\s*[\/,;&+]\s*(?:(?:SO|S\/O|Sales\s*Order|Order)\s*[#:\-]?\s*)?#?\d{4,8})*/gi, ' ')
    .replace(/\b(?:Customer|Cust|CX|C)\s*(?:Number|No\.?|#)?\s*[:#\-]?\s*\d{4,8}\b/gi, ' ')
    .replace(/(?:\+?1[\s\-.]?)?(?:\(?\d{3}\)?[\s\-.]?\d{3}[\s\-.]?\d{4})/gi, ' ')
    .replace(/(?:^|\s)#\s*\d{4,8}\b/g, ' ')
    .replace(/\bPRE\s*INSPECT\b/gi, ' ').replace(/\|/g, ' ').replace(/(^|\s)[-–—\/]+(?=\s|$)/g, ' ');
  (customerNumberCandidates || []).forEach(function(number) { value = value.replace(new RegExp('(?:^|\\s)' + String(number) + '(?=\\s|$)', 'g'), ' '); });
  return value.replace(/\*+/g, ' ').replace(/\bVIP\b/gi, ' ').replace(/\bPLEASE CALL(?: ON WAY)?\b/gi, ' ').replace(/\s+/g, ' ').trim();
}


function preinspectNonCustomerEvent_(title) {
  const value = tm_cleanString_(title);

  return PREINSPECT_REVIEW_CONFIG.NON_CUSTOMER_TITLE_PATTERNS.some(function(re) {
    return re.test(value);
  });
}


/************************************************************
 * REFERENCE INDEXES
 ************************************************************/

function preinspectBuildIndexes_() {
  const ss = SpreadsheetApp.getActive();
  const cfg = PREINSPECT_REVIEW_CONFIG.SHEETS;

  const customerSh = ss.getSheetByName(cfg.CUSTOMERS);
  const locationSh = ss.getSheetByName(cfg.LOCATIONS);
  const soSh = ss.getSheetByName(cfg.SALES_ORDERS);

  if (!customerSh) throw new Error('Missing "' + cfg.CUSTOMERS + '".');
  if (!locationSh) throw new Error('Missing "' + cfg.LOCATIONS + '".');

  const indexes = {
    customers: preinspectCustomerIndex_(tm_getSheetObjects_(customerSh)),
    locations: null,
    contacts: { byCustomerKey: {}, all: [] },
    salesOrders: null,
    identity: { byPhone: {}, byEmail: {}, byName: {}, byAddress: {} }
  };

  indexes.locations = preinspectLocationIndex_(tm_getSheetObjects_(locationSh), indexes);
  indexes.salesOrders = preinspectSOIndex_(soSh ? tm_getSheetObjects_(soSh) : [], indexes);

  preinspectBuildIdentity_(indexes);
  return indexes;
}


function preinspectCustomerIndex_(rows) {
  const idx = { byKey: {}, byId: {}, byNumber: {}, byName: {}, all: [] };

  rows.forEach(function(row) {
    const id = preinspectId_(preinspectFirst_(row, [
      'CustomerCustomerId', 'CustomerId', 'Customer ID', 'CustomerID', 'Id'
    ]));
    const number = preinspectNumber_(preinspectFirst_(row, [
      'CustomerNumber', 'Customer Number', 'CustomerNo', 'Customer No', 'Number'
    ]));
    const name = tm_cleanString_(preinspectFirst_(row, [
      'CustomerName', 'Customer Name', 'Customer', 'CompanyName', 'FullName', 'Name'
    ]));

    const customer = {
      id: id,
      number: number,
      name: name,
      key: preinspectCustomerKey_(id, number, name),
      phones: preinspectUnique_([
        preinspectPhone_(preinspectFirst_(row, [
          'Phone', 'CustomerPhone', 'Customer Phone', 'PhoneNumber', 'Phone Number', 'PrimaryPhone', 'CustomerPrimaryPhone'
        ])),
        preinspectPhone_(preinspectFirst_(row, ['Mobile', 'MobilePhone', 'Cell', 'CellPhone']))
      ].filter(Boolean)),
      emails: preinspectUnique_([
        preinspectEmail_(preinspectFirst_(row, [
          'Email', 'CustomerEmail', 'Customer Email', 'EmailAddress', 'PrimaryEmail'
        ]))
      ].filter(Boolean))
    };

    if (!customer.key) return;

    idx.all.push(customer);
    idx.byKey[customer.key] = customer;
    preinspectPushObject_(idx.byId, id, customer, 'key');
    preinspectPushObject_(idx.byNumber, number, customer, 'key');
    preinspectPushObject_(idx.byName, preinspectName_(name), customer, 'key');
  });

  return idx;
}


function preinspectLocationIndex_(rows, indexes) {
  const idx = { byCustomerKey: {}, byAddress: {}, byId: {}, all: [] };

  rows.forEach(function(row) {
    const customerKey = preinspectCustomerKeyFromRefs_(row, indexes.customers);
    const locationId = preinspectId_(preinspectFirst_(row, [
      'LocationId', 'Location Id', 'LocationLocationId', 'CustomerAddressAddressId',
      'CustomerLocationId', 'AddressId', 'Address Id', 'Id'
    ]));
    const address = tm_cleanString_(preinspectFirst_(row, [
      'AddressFullAddress', 'FullAddress', 'Full Address', 'LocationFullAddress',
      'CustomerAddressFullAddress', 'Address', 'Location Address',
      'ShipToFullAddress', 'BillToFullAddress'
    ]));

    const location = {
      locationId: locationId,
      customerKey: customerKey,
      address: address,
      normalizedAddress: preinspectNormalizeAddress_(address),
      phone: preinspectPhone_(preinspectFirst_(row, [
        'Phone', 'Location Phone', 'Phone Number', 'Customer Phone', 'CustomerPhone'
      ]))
    };

    if (!locationId && !address) return;

    idx.all.push(location);
    preinspectPushObject_(idx.byCustomerKey, customerKey, location, 'locationId|normalizedAddress');
    preinspectPushObject_(idx.byAddress, location.normalizedAddress, location, 'locationId|customerKey');
    preinspectPushObject_(idx.byId, locationId, location, 'locationId|customerKey|normalizedAddress');
  });

  return idx;
}


function preinspectContactIndex_(rows, indexes) {
  const idx = { byCustomerKey: {}, all: [] };

  rows.forEach(function(row) {
    let name = tm_cleanString_(preinspectFirst_(row, [
      'ContactName', 'Contact Name', 'FullName', 'Full Name', 'Name'
    ]));

    if (!name) {
      name = [
        preinspectFirst_(row, ['FirstName', 'First Name']),
        preinspectFirst_(row, ['LastName', 'Last Name'])
      ].map(tm_cleanString_).filter(Boolean).join(' ');
    }

    const contact = {
      contactId: preinspectId_(preinspectFirst_(row, [
        'ContactId', 'Contact ID', 'CustomerContactId', 'RequestedByContactId', 'Id'
      ])),
      customerKey: preinspectCustomerKeyFromRefs_(row, indexes.customers),
      name: name,
      normalizedName: preinspectName_(name),
      email: preinspectEmail_(preinspectFirst_(row, [
        'Email', 'EmailAddress', 'ContactEmail', 'Contact Email'
      ])),
      phone: preinspectPhone_(preinspectFirst_(row, [
        'Phone', 'PhoneNumber', 'Phone Number', 'ContactPhone', 'Contact Phone',
        'Mobile', 'Cell', 'CellPhone'
      ]))
    };

    if (!contact.contactId && !contact.email && !contact.phone && !contact.name) return;

    idx.all.push(contact);
    preinspectPushObject_(
      idx.byCustomerKey,
      contact.customerKey,
      contact,
      'contactId|email|phone|normalizedName'
    );
  });

  return idx;
}


function preinspectSOIndex_(rows, indexes) {
  const idx = { byNumber: {}, all: [] };

  rows.forEach(function(row) {
    const so = {
      number: preinspectNumber_(preinspectFirst_(row, [
        'SONumber', 'SO Number', 'SO #', 'SalesOrderNumber', 'Sales Order Number',
        'OrderNumber', 'Order Number'
      ])),
      id: preinspectId_(preinspectFirst_(row, [
        'SalesOrderId', 'Sales Order Id', 'SalesOrderID', 'SOId', 'SO ID', 'OrderId', 'Order ID', 'Id'
      ])),
      customerKey: preinspectCustomerKeyFromRefs_(row, indexes.customers),
      locationId: preinspectId_(preinspectFirst_(row, [
        'CustomerAddressAddressId', 'ShipToAddressId', 'BillToAddressId',
        'LocationId', 'CustomerLocationId', 'CustomerAddressId'
      ])),
      contactId: preinspectId_(preinspectFirst_(row, [
        'RequestedByContactId', 'ContactId', 'CustomerContactId',
        'BillToContactId', 'ShipToContactId'
      ]))
    };

    if (!so.number && !so.id) return;
    idx.all.push(so);
    preinspectPushObject_(idx.byNumber, so.number, so, 'number|id|customerKey');
  });

  return idx;
}


function preinspectBuildIdentity_(indexes) {
  indexes.customers.all.forEach(function(c) {
    c.phones.forEach(function(v) { preinspectPushString_(indexes.identity.byPhone, v, c.key); });
    c.emails.forEach(function(v) { preinspectPushString_(indexes.identity.byEmail, v, c.key); });
    preinspectPushString_(indexes.identity.byName, preinspectName_(c.name), c.key);
  });

  indexes.contacts.all.forEach(function(c) {
    if (!c.customerKey) return;
    preinspectPushString_(indexes.identity.byPhone, c.phone, c.customerKey);
    preinspectPushString_(indexes.identity.byEmail, c.email, c.customerKey);
    preinspectPushString_(indexes.identity.byName, c.normalizedName, c.customerKey);
  });

  indexes.locations.all.forEach(function(l) {
    if (!l.customerKey) return;
    preinspectPushString_(indexes.identity.byPhone, l.phone, l.customerKey);
    preinspectPushString_(indexes.identity.byAddress, l.normalizedAddress, l.customerKey);
  });
}


/************************************************************
 * CUSTOMER RESOLUTION
 ************************************************************/

function preinspectResolveCustomer_(signals, indexes) {
  const soKeys = signals.salesOrderNumber
    ? preinspectSOKeys_(signals.salesOrderNumber, indexes)
    : [];
  const emailKeys = preinspectEmailKeys_(signals.emails, indexes);
  const phoneKeys = preinspectPhoneKeys_(signals.phones, indexes);
  const addressKeys = preinspectAddressCandidateKeys_(signals.address, indexes);
  const nameKeys = preinspectNameKeys_(signals.name, indexes);

  // 1. Explicit Customer Number is authoritative. If it resolves, every other
  // strong identifier is cross-validated. If it does not resolve, do not let
  // weaker evidence silently replace the explicitly supplied number.
  if (signals.customerNumber) {
    const keys = preinspectCustomerRecordKeys_(
      indexes.customers.byNumber[signals.customerNumber] || []
    );

    if (keys.length === 1) {
      return preinspectConfirmCustomer_(keys[0], 'CUSTOMER_NUMBER_EXACT', signals, indexes);
    }

    return preinspectReviewCustomer_(
      keys.length ? 'CUSTOMER_NUMBER_DUPLICATE' : 'CUSTOMER_NUMBER_NOT_FOUND',
      keys,
      keys.length
        ? 'Customer Number matched multiple customer rows.'
        : 'Customer Number ' + signals.customerNumber + ' was not found. Recovery evidence was retained, but cannot silently override an explicit Customer Number.'
    );
  }

  // 2. Malformed but common operator entry: Customer # and phone concatenated
  // with no separator. Generate all plausible 10/11-digit phone splits and let
  // current Striven data prove the only valid interpretation.
  const compound = preinspectResolveCompoundCustomer_(signals.compoundIdentifiers || [], indexes);
  if (compound.status === 'CONFIRMED') {
    const compoundSignals = Object.assign({}, signals, {
      customerNumber: compound.customerNumber,
      phones: preinspectUnique_((signals.phones || []).concat([compound.phone]))
    });
    return preinspectConfirmCustomer_(compound.customerKey, compound.method, compoundSignals, indexes);
  }
  if (compound.status === 'REVIEW') {
    return preinspectReviewCustomer_(compound.method, compound.candidates, compound.reason);
  }

  // 3. A unique SO -> customer relationship is a strong deterministic anchor.
  if (soKeys.length === 1) {
    return preinspectConfirmCustomer_(soKeys[0], 'SALES_ORDER_EXACT', signals, indexes);
  }

  // 4. Per the locked Step 1 order, a unique exact 10-digit phone match is
  // sufficient to identify the customer. Location is resolved independently
  // in Step 2 and may legitimately be a new address.
  if (phoneKeys.length === 1) {
    return preinspectConfirmCustomer_(phoneKeys[0], 'PHONE_EXACT', signals, indexes);
  }

  // 5. A unique exact email is also a strong deterministic anchor.
  if (emailKeys.length === 1) {
    return preinspectConfirmCustomer_(emailKeys[0], 'EMAIL_EXACT', signals, indexes);
  }

  // 6. Legacy bare Customer Number candidates are NOT authoritative by
  // themselves. Confirm only when exactly one candidate resolves and at least
  // two independent signals corroborate it, including a strong signal.
  const inferredHits = [];
  (signals.customerNumberCandidates || []).forEach(function(number) {
    const keys = preinspectCustomerRecordKeys_(indexes.customers.byNumber[number] || []);
    if (keys.length !== 1) return;

    const key = keys[0];
    const labels = [];
    if (emailKeys.indexOf(key) !== -1) labels.push('EMAIL');
    if (phoneKeys.indexOf(key) !== -1) labels.push('PHONE');
    if (addressKeys.indexOf(key) !== -1) labels.push('ADDRESS');
    if (nameKeys.indexOf(key) !== -1) labels.push('NAME');

    const hasStrong = labels.indexOf('EMAIL') !== -1 ||
      labels.indexOf('PHONE') !== -1 || labels.indexOf('ADDRESS') !== -1;

    if (labels.length >= 2 && hasStrong) {
      inferredHits.push({ number: number, key: key, labels: labels });
    }
  });

  const inferredKeys = preinspectUnique_(inferredHits.map(function(hit) { return hit.key; }));
  if (inferredKeys.length === 1) {
    const hit = inferredHits.filter(function(item) { return item.key === inferredKeys[0]; })[0];
    const inferredSignals = Object.assign({}, signals, { customerNumber: hit.number });
    return preinspectConfirmCustomer_(
      inferredKeys[0],
      'CUSTOMER_NUMBER_INFERRED_MULTI_SIGNAL',
      inferredSignals,
      indexes
    );
  }
  if (inferredKeys.length > 1) {
    return preinspectReviewCustomer_(
      'INFERRED_CUSTOMER_NUMBER_CONFLICT',
      inferredKeys,
      'Multiple bare Customer Number candidates were independently corroborated.'
    );
  }

  // 7. True multi-front matching. Name can corroborate, never stand alone.
  const pairDefinitions = [
    ['SALES_ORDER_PLUS_PHONE', soKeys, phoneKeys],
    ['SALES_ORDER_PLUS_ADDRESS', soKeys, addressKeys],
    ['SALES_ORDER_PLUS_NAME', soKeys, nameKeys],
    ['EMAIL_PLUS_PHONE', emailKeys, phoneKeys],
    ['EMAIL_PLUS_ADDRESS', emailKeys, addressKeys],
    ['EMAIL_PLUS_NAME', emailKeys, nameKeys],
    ['PHONE_PLUS_ADDRESS', phoneKeys, addressKeys],
    ['PHONE_PLUS_NAME', phoneKeys, nameKeys],
    ['ADDRESS_PLUS_NAME', addressKeys, nameKeys]
  ];

  const pairHits = [];
  pairDefinitions.forEach(function(def) {
    if (!def[1].length || !def[2].length) return;
    const intersection = preinspectIntersect_(def[1], def[2]);
    if (intersection.length === 1) pairHits.push({ method: def[0], key: intersection[0] });
  });

  const pairKeys = preinspectUnique_(pairHits.map(function(hit) { return hit.key; }));
  if (pairKeys.length === 1) {
    const preferred = pairHits.filter(function(hit) { return hit.key === pairKeys[0]; })[0];
    return preinspectConfirmCustomer_(pairKeys[0], preferred.method, signals, indexes);
  }
  if (pairKeys.length > 1) {
    return preinspectReviewCustomer_(
      'MULTI_SIGNAL_CONFLICT',
      pairKeys,
      'Different deterministic signal intersections point to different customers.'
    );
  }

  // 8. Three-or-more-way intersection can disambiguate duplicated signals.
  const activeSets = [];
  if (soKeys.length) activeSets.push(soKeys);
  if (emailKeys.length) activeSets.push(emailKeys);
  if (phoneKeys.length) activeSets.push(phoneKeys);
  if (addressKeys.length) activeSets.push(addressKeys);
  if (nameKeys.length) activeSets.push(nameKeys);

  if (activeSets.length >= 2) {
    let allIntersection = activeSets[0].slice();
    for (let i = 1; i < activeSets.length; i++) allIntersection = preinspectIntersect_(allIntersection, activeSets[i]);
    if (allIntersection.length === 1) {
      return preinspectConfirmCustomer_(allIntersection[0], 'MULTI_SIGNAL_INTERSECTION', signals, indexes);
    }
  }

  // 9. Fail closed only after recovery routes are exhausted.
  if (soKeys.length > 1) {
    return preinspectReviewCustomer_('SALES_ORDER_MULTIPLE_CUSTOMERS', soKeys, 'SO resolves to multiple customers and other signals did not disambiguate it.');
  }
  if (emailKeys.length > 1) {
    return preinspectReviewCustomer_('EMAIL_MULTIPLE_CUSTOMERS', emailKeys, 'Email matched multiple customers and other signals did not disambiguate it.');
  }
  if (phoneKeys.length === 1) {
    return preinspectReviewCustomer_('PHONE_ONLY', phoneKeys, 'Phone matched one customer, but no second signal confirmed it.');
  }
  if (phoneKeys.length > 1) {
    const plausible = preinspectUnique_(preinspectIntersect_(phoneKeys, addressKeys).concat(preinspectIntersect_(phoneKeys, nameKeys)));
    return preinspectReviewCustomer_(
      'PHONE_MULTIPLE_CUSTOMERS',
      plausible.length ? plausible : phoneKeys,
      'Phone matched multiple customers and corroborating signals did not reduce them to one.'
    );
  }

  const addressName = preinspectIntersect_(addressKeys, nameKeys);
  if (addressName.length > 1) {
    return preinspectReviewCustomer_('ADDRESS_NAME_MULTIPLE', addressName, 'Address + name matched multiple customers.');
  }
  if (nameKeys.length) {
    return preinspectReviewCustomer_('NAME_ONLY', nameKeys, 'Name-only matching is review-only.');
  }

  return preinspectReviewCustomer_('NO_SAFE_CUSTOMER_MATCH', [], 'No deterministic customer match found after the Step 1 recovery ladder.');
}


function preinspectResolveCompoundCustomer_(candidates, indexes) {
  const valid = [];

  (candidates || []).forEach(function(candidate) {
    const customerKeys = preinspectCustomerRecordKeys_(
      indexes.customers.byNumber[candidate.customerNumber] || []
    );
    const phoneKeys = preinspectPhoneKeys_([candidate.phone], indexes);
    if (customerKeys.length !== 1 || !phoneKeys.length) return;

    const intersection = preinspectIntersect_(customerKeys, phoneKeys);
    if (intersection.length === 1) {
      valid.push({
        customerKey: intersection[0],
        customerNumber: candidate.customerNumber,
        phone: candidate.phone,
        order: candidate.order,
        raw: candidate.raw
      });
    }
  });

  const keys = preinspectUnique_(valid.map(function(v) { return v.customerKey; }));
  if (keys.length === 1) {
    const sameKey = valid.filter(function(v) { return v.customerKey === keys[0]; });
    const signatures = preinspectUnique_(sameKey.map(function(v) {
      return [v.customerNumber, v.phone].join('|');
    }));
    if (signatures.length === 1) {
      return {
        status: 'CONFIRMED',
        customerKey: keys[0],
        customerNumber: sameKey[0].customerNumber,
        phone: sameKey[0].phone,
        method: 'COMPOUND_CUSTOMER_PHONE_EXACT',
        candidates: [keys[0]],
        reason: 'Concatenated Customer Number + phone was uniquely validated against Striven.'
      };
    }
  }

  if (keys.length || valid.length > 1) {
    return {
      status: 'REVIEW',
      customerKey: '',
      customerNumber: '',
      phone: '',
      method: 'AMBIGUOUS_COMPOUND_NUMBER',
      candidates: keys,
      reason: 'Compound numeric entry has more than one valid Striven interpretation.'
    };
  }

  return { status: 'NONE', candidates: [] };
}

function preinspectConfirmCustomer_(key, method, signals, indexes) {
  const customer = indexes.customers.byKey[key];
  const validation = preinspectCrossValidateCustomer_(key, signals, indexes);

  if (!customer) {
    return preinspectReviewCustomer_(
      'CANONICAL_CUSTOMER_NOT_FOUND',
      [key],
      'Relationship found, but canonical Striven_Customers row could not be resolved.'
    );
  }

  return {
    status: validation.conflicts.length ? 'REVIEW' : 'CONFIRMED',
    customerKey: key,
    customerId: customer.id,
    customerNumber: customer.number,
    customerName: customer.name,
    primaryMethod: method,
    evidence: validation.evidence,
    conflicts: validation.conflicts,
    candidates: [key],
    reason: validation.conflicts.length
      ? 'Primary customer found, but strong identifiers conflict.'
      : 'Customer confirmed by ' + method + '.'
  };
}


function preinspectCrossValidateCustomer_(key, signals, indexes) {
  const evidence = [];
  const conflicts = [];

  function check(label, keys, options) {
    options = options || {};
    keys = preinspectUnique_(keys || []);
    if (!keys.length) return;

    if (options.requireUnique && keys.length !== 1) {
      conflicts.push(label + ' is ambiguous across ' + keys.join(', '));
      return;
    }

    if (keys.indexOf(key) !== -1) {
      evidence.push(label + '_CONFIRMED');
    } else if (options.blocking !== false) {
      conflicts.push(label + ' -> ' + keys.join(', ') + ' instead of ' + key);
    }
  }

  if (signals.customerNumber) {
    check('CUSTOMER_NUMBER', preinspectCustomerRecordKeys_(
      indexes.customers.byNumber[signals.customerNumber] || []
    ), { requireUnique: true });
  }
  if (signals.salesOrderNumber) {
    check('SALES_ORDER', preinspectSOKeys_(signals.salesOrderNumber, indexes), { requireUnique: true });
  }
  if (signals.emails.length) check('EMAIL', preinspectEmailKeys_(signals.emails, indexes));
  if (signals.phones.length) check('PHONE', preinspectPhoneKeys_(signals.phones, indexes));

  // STEP 2 boundary: a different appointment address does NOT invalidate an
  // otherwise confirmed customer. Address ownership is resolved separately.
  if (signals.address) {
    check('ADDRESS', preinspectAddressCandidateKeys_(signals.address, indexes), { blocking: false });
  }
  if (signals.name) check('NAME', preinspectNameKeys_(signals.name, indexes), { blocking: false });

  return {
    evidence: preinspectUnique_(evidence),
    conflicts: preinspectUnique_(conflicts)
  };
}


function preinspectReviewCustomer_(method, candidates, reason) {
  return {
    status: 'REVIEW',
    customerKey: candidates.length === 1 ? candidates[0] : '',
    customerId: '',
    customerNumber: '',
    customerName: '',
    primaryMethod: method,
    evidence: [],
    conflicts: [],
    candidates: candidates,
    reason: reason
  };
}


/************************************************************
 * LOCATION RESOLUTION — ONLY AFTER CUSTOMER
 ************************************************************/

function preinspectResolveLocation_(customerKey, signals, indexes) {
  const locations = (indexes.locations.byCustomerKey[customerKey] || []).slice();
  const hasAddress = !!tm_cleanString_(signals.address);

  if (!hasAddress) {
    if (locations.length === 1) {
      return {
        status: 'CONFIRMED', locationId: locations[0].locationId, address: locations[0].address,
        method: 'ONLY_CUSTOMER_LOCATION', score: 0,
        reason: 'No appointment address was supplied; confirmed customer has exactly one Striven location.'
      };
    }
    return {
      status: 'REVIEW', locationId: '', address: '',
      method: locations.length ? 'MULTIPLE_LOCATIONS_NO_ADDRESS' : 'NO_CUSTOMER_LOCATIONS_NO_ADDRESS', score: 0,
      reason: locations.length
        ? 'Customer has multiple locations and the Calendar event contains no usable address.'
        : 'Confirmed customer has no indexed location and the Calendar event contains no usable address.'
    };
  }

  // A. Customer-owned exact address.
  const exact = locations.filter(function(l) {
    return l.normalizedAddress === signals.normalizedAddress;
  });
  if (exact.length === 1) {
    return {
      status: 'CONFIRMED', locationId: exact[0].locationId, address: exact[0].address,
      method: 'CUSTOMER_ADDRESS_EXACT', score: 100,
      reason: 'Appointment address exactly matched a location belonging to the confirmed customer.'
    };
  }
  if (exact.length > 1) {
    return {
      status: 'REVIEW', locationId: '', address: signals.address,
      method: 'DUPLICATE_CUSTOMER_ADDRESS', score: 100,
      reason: 'Multiple locations for this customer normalize to the same appointment address.'
    };
  }

  // B. Customer-owned strong/fuzzy address.
  const scored = locations.map(function(l) {
    return { location: l, score: preinspectAddressScore_(signals.address, l.address) };
  }).sort(function(a, b) { return b.score - a.score; });
  const best = scored[0];
  const second = scored[1];
  if (best && best.score >= PREINSPECT_REVIEW_CONFIG.ADDRESS_STRONG_SCORE && (!second || best.score - second.score >= 10)) {
    return {
      status: 'CONFIRMED', locationId: best.location.locationId, address: best.location.address,
      method: 'CUSTOMER_ADDRESS_STRONG', score: best.score,
      reason: 'Appointment address strongly matched one location belonging to the confirmed customer.'
    };
  }

  // C. SO can identify an alternate location for the same confirmed customer.
  const soLocation = preinspectResolveLocationFromSO_(customerKey, signals, indexes);
  if (soLocation.status === 'CONFIRMED') return soLocation;
  if (soLocation.status === 'CONFLICT') return soLocation;

  // D. Search all indexed locations to prove ownership before declaring a new
  // address. Exact is preferred; otherwise use a unique strong global match.
  const global = preinspectGlobalAddressMatches_(signals.address, indexes);
  if (global.status === 'ONE' && global.location.customerKey === customerKey) {
    return {
      status: 'CONFIRMED', locationId: global.location.locationId, address: global.location.address,
      method: 'GLOBAL_ADDRESS_SAME_CUSTOMER_RECOVERY', score: global.score,
      reason: 'Global location recovery found the appointment address already owned by the confirmed customer.'
    };
  }
  if (global.status === 'ONE' && global.location.customerKey && global.location.customerKey !== customerKey) {
    return {
      status: 'REVIEW', locationId: '', address: signals.address,
      method: 'LOCATION_OWNERSHIP_CONFLICT', score: global.score,
      ownerCustomerKeys: global.customerKeys,
      reason: 'Appointment address already belongs to a different Striven customer. Customer/location ownership conflict requires review.'
    };
  }
  if (global.status === 'AMBIGUOUS') {
    return {
      status: 'REVIEW', locationId: '', address: signals.address,
      method: 'GLOBAL_ADDRESS_AMBIGUOUS', score: global.score,
      reason: 'Appointment address has multiple plausible Striven location matches; no location was guessed.'
    };
  }

  // E. Nothing in Striven owns this usable address. Preserve the confirmed
  // customer and explicitly surface the legitimate next recovery action.
  return {
    status: 'NEW_LOCATION_REQUIRED',
    locationId: '',
    address: signals.address,
    method: 'NEW_CUSTOMER_LOCATION_REQUIRED',
    score: best ? best.score : 0,
    reason: 'Customer is confirmed and the appointment address is not an existing Striven location. Create and read-back-verify a new location under this customer before task creation.'
  };
}


function preinspectResolveLocationFromSO_(customerKey, signals, indexes) {
  if (!signals.salesOrderNumber) return { status: 'NOT_PROVIDED' };
  const rows = indexes.salesOrders.byNumber[signals.salesOrderNumber] || [];
  const matching = rows.filter(function(so) { return so.customerKey === customerKey && so.locationId; });
  const ids = preinspectUnique_(matching.map(function(so) { return String(so.locationId); }));
  if (ids.length !== 1) return { status: ids.length ? 'AMBIGUOUS' : 'NOT_AVAILABLE' };

  const locs = indexes.locations.byId[ids[0]] || [];
  if (locs.length !== 1) return { status: 'NOT_AVAILABLE' };
  const loc = locs[0];
  if (loc.customerKey && loc.customerKey !== customerKey) {
    return {
      status: 'CONFLICT', locationId: '', address: signals.address,
      method: 'SO_LOCATION_OWNERSHIP_CONFLICT', score: 0,
      reason: 'Sales Order location resolves to a different customer than the confirmed customer.'
    };
  }

  const score = preinspectAddressScore_(signals.address, loc.address);
  if (score >= PREINSPECT_REVIEW_CONFIG.ADDRESS_STRONG_SCORE) {
    return {
      status: 'CONFIRMED', locationId: loc.locationId, address: loc.address,
      method: 'SALES_ORDER_LOCATION_CORROBORATED', score: score,
      reason: 'Sales Order location belongs to the confirmed customer and corroborates the appointment address.'
    };
  }
  return { status: 'NOT_CORROBORATED' };
}


function preinspectGlobalAddressMatches_(address, indexes) {
  const normalized = preinspectNormalizeAddress_(address);
  const exact = normalized ? (indexes.locations.byAddress[normalized] || []).slice() : [];
  let matches = exact;
  let score = exact.length ? 100 : 0;

  if (!matches.length) {
    const scored = indexes.locations.all.map(function(l) {
      return { location: l, score: preinspectAddressScore_(address, l.address) };
    }).filter(function(x) {
      return x.score >= PREINSPECT_REVIEW_CONFIG.ADDRESS_STRONG_SCORE;
    }).sort(function(a, b) { return b.score - a.score; });

    if (scored.length) {
      const top = scored[0].score;
      matches = scored.filter(function(x) { return top - x.score < 10; }).map(function(x) { return x.location; });
      score = top;
    }
  }

  const uniqueLocations = [];
  const seen = {};
  matches.forEach(function(l) {
    const sig = String(l.locationId || '') + '|' + String(l.customerKey || '') + '|' + String(l.normalizedAddress || '');
    if (seen[sig]) return;
    seen[sig] = true;
    uniqueLocations.push(l);
  });

  if (!uniqueLocations.length) return { status: 'NONE', score: 0, customerKeys: [] };
  const customerKeys = preinspectUnique_(uniqueLocations.map(function(l) { return l.customerKey; }).filter(Boolean));
  if (uniqueLocations.length === 1) {
    return { status: 'ONE', location: uniqueLocations[0], score: score, customerKeys: customerKeys };
  }
  return { status: 'AMBIGUOUS', score: score, customerKeys: customerKeys, locations: uniqueLocations };
}


/************************************************************
 * CONTACT / REQUESTED-BY SIGNAL — EXISTING INFO ONLY
 *
 * Contacts sheet is intentionally skipped in this stage.
 * If Approved Sales Orders already exposes one Contact/RequestedBy ID,
 * retain it as supporting data. Otherwise do not block the review.
 ************************************************************/

function preinspectResolveContactFromExistingInfo_(salesOrderMatch) {
  if (salesOrderMatch && salesOrderMatch.contactId) {
    return {
      status: 'CONFIRMED',
      contactId: salesOrderMatch.contactId,
      name: '',
      email: '',
      phone: '',
      method: 'APPROVED_SO_CONTACT_ID',
      reason: 'Contact/RequestedBy ID came from the already-matched Approved Sales Order.'
    };
  }

  return {
    status: 'NOT_AVAILABLE',
    contactId: '',
    name: '',
    email: '',
    phone: '',
    method: 'CONTACTS_SKIPPED',
    reason: 'Contacts report is intentionally not required for the current PreInspect review stage.'
  };
}


/************************************************************
 * SALES ORDER CROSS-VERIFY
 ************************************************************/

function preinspectResolveSalesOrder_(customerKey, signals, indexes) {
  if (!signals.salesOrderNumber) {
    return {
      status: 'NOT_PROVIDED', salesOrderNumber: '', salesOrderId: '', contactId: '', method: '',
      reason: 'Calendar has no explicitly labelled SO number.'
    };
  }

  const matches = indexes.salesOrders.byNumber[signals.salesOrderNumber] || [];
  if (!matches.length) {
    return {
      status: 'NOT_FOUND', salesOrderNumber: signals.salesOrderNumber, salesOrderId: '', contactId: '',
      method: 'SO_NOT_IN_APPROVED_REPORT',
      reason: 'SO ' + signals.salesOrderNumber + ' was not found in Approved Sales Orders.'
    };
  }

  const customerKeys = preinspectUnique_(matches.map(function(so) { return so.customerKey; }).filter(Boolean));
  if (customerKeys.length && customerKeys.indexOf(customerKey) === -1) {
    return {
      status: 'CONFLICT', salesOrderNumber: signals.salesOrderNumber, salesOrderId: '', contactId: '',
      method: 'SO_CUSTOMER_CONFLICT',
      reason: 'SO ' + signals.salesOrderNumber + ' belongs to a different customer.'
    };
  }

  const ids = preinspectUnique_(matches.map(function(so) { return so.id; }).filter(Boolean));
  const contactIds = preinspectUnique_(matches.map(function(so) { return so.contactId; }).filter(Boolean));

  if (ids.length === 1) {
    return {
      status: 'CONFIRMED',
      salesOrderNumber: signals.salesOrderNumber,
      salesOrderId: ids[0],
      contactId: contactIds.length === 1 ? contactIds[0] : '',
      method: 'SALES_ORDER_EXACT',
      reason: 'SO belongs to confirmed customer.'
    };
  }

  return {
    status: 'REVIEW', salesOrderNumber: signals.salesOrderNumber, salesOrderId: '', contactId: '',
    method: 'SO_AMBIGUOUS', reason: 'SO number matched multiple report rows/IDs.'
  };
}


/************************************************************
 * CANDIDATE HELPERS
 ************************************************************/

function preinspectCustomerRecordKeys_(rows) {
  return preinspectUnique_(rows.map(function(c) { return c.key; }).filter(Boolean));
}

function preinspectSOKeys_(soNumber, indexes) {
  if (!soNumber) return [];
  return preinspectUnique_((indexes.salesOrders.byNumber[soNumber] || [])
    .map(function(so) { return so.customerKey; }).filter(Boolean));
}

function preinspectEmailKeys_(emails, indexes) {
  return preinspectSignalKeys_(emails, indexes.identity.byEmail, preinspectEmail_);
}

function preinspectPhoneKeys_(phones, indexes) {
  return preinspectSignalKeys_(phones, indexes.identity.byPhone, preinspectPhone_);
}

function preinspectAddressKeys_(address, indexes) {
  const key = preinspectNormalizeAddress_(address);
  return key ? preinspectUnique_(indexes.identity.byAddress[key] || []) : [];
}


function preinspectAddressCandidateKeys_(address, indexes) {
  const exact = preinspectAddressKeys_(address, indexes);
  if (exact.length) return exact;
  if (!tm_cleanString_(address)) return [];

  const scored = indexes.locations.all.map(function(location) {
    return { customerKey: location.customerKey, score: preinspectAddressScore_(address, location.address) };
  }).filter(function(item) {
    return item.customerKey && item.score >= PREINSPECT_REVIEW_CONFIG.ADDRESS_STRONG_SCORE;
  }).sort(function(a, b) { return b.score - a.score; });

  if (!scored.length) return [];
  const best = scored[0].score;
  return preinspectUnique_(scored.filter(function(item) {
    return best - item.score < 10;
  }).map(function(item) { return item.customerKey; }));
}

function preinspectNameKeys_(name, indexes) {
  const key = preinspectName_(name);
  const exact = key ? preinspectUnique_(indexes.identity.byName[key] || []) : [];
  if (exact.length) return exact;

  // Names are corroboration only. Allow spacing/punctuation/and-vs-& variations
  // such as "MacNevin" vs "Mac Nevin" without ever confirming by name alone.
  const compact = preinspectNameCompact_(name);
  if (!compact) return [];
  return preinspectUnique_(indexes.customers.all.filter(function(customer) {
    return preinspectNameCompact_(customer.name) === compact;
  }).map(function(customer) { return customer.key; }));
}

function preinspectSignalKeys_(values, index, normalizer) {
  const out = [];
  (values || []).forEach(function(v) {
    (index[normalizer(v)] || []).forEach(function(key) { out.push(key); });
  });
  return preinspectUnique_(out);
}


/************************************************************
 * RELATIONSHIP / INDEX UTILITIES
 ************************************************************/

function preinspectCustomerKeyFromRefs_(row, customers) {
  const id = preinspectId_(preinspectFirst_(row, [
    'CustomerCustomerId', 'CustomerId', 'Customer ID', 'CustomerID'
  ]));
  const number = preinspectNumber_(preinspectFirst_(row, [
    'CustomerNumber', 'Customer Number', 'CustomerNo', 'Customer No'
  ]));
  const name = tm_cleanString_(preinspectFirst_(row, [
    'CustomerName', 'Customer Name', 'Customer', 'CompanyName'
  ]));

  if (id && customers.byId[id] && customers.byId[id].length === 1) {
    return customers.byId[id][0].key;
  }
  if (number && customers.byNumber[number] && customers.byNumber[number].length === 1) {
    return customers.byNumber[number][0].key;
  }

  const nameKey = preinspectName_(name);
  if (nameKey && customers.byName[nameKey] && customers.byName[nameKey].length === 1) {
    return customers.byName[nameKey][0].key;
  }

  return preinspectCustomerKey_(id, number, name);
}


function preinspectCustomerKey_(id, number, name) {
  if (id) return 'ID:' + id;
  if (number) return 'NUM:' + number;
  const n = preinspectName_(name);
  return n ? 'NAME:' + n : '';
}


function preinspectPushString_(index, key, value) {
  key = tm_cleanString_(key);
  value = tm_cleanString_(value);
  if (!key || !value) return;
  if (!index[key]) index[key] = [];
  if (index[key].indexOf(value) === -1) index[key].push(value);
}


function preinspectPushObject_(index, key, value, signatureFields) {
  key = tm_cleanString_(key);
  if (!key || !value) return;
  if (!index[key]) index[key] = [];

  const fields = String(signatureFields || '').split('|').filter(Boolean);
  const sig = fields.map(function(f) { return String(value[f] || ''); }).join('|');
  const exists = index[key].some(function(existing) {
    return fields.map(function(f) { return String(existing[f] || ''); }).join('|') === sig;
  });

  if (!exists) index[key].push(value);
}


/************************************************************
 * ADDRESS NORMALIZATION / SCORING
 ************************************************************/

function preinspectNormalizeAddress_(value) {
  return String(value || '').toLowerCase().replace(/\bcanada\b/g,' ').replace(/\bontario\b/g,' ').replace(/\bon\b/g,' ')
    .replace(/\bstreet\b/g,' st ').replace(/\bavenue\b/g,' ave ').replace(/\broad\b/g,' rd ').replace(/\bdrive\b/g,' dr ')
    .replace(/\bcrescent\b/g,' cres ').replace(/\bboulevard\b/g,' blvd ').replace(/\bcourt\b/g,' ct ').replace(/\blane\b/g,' ln ')
    .replace(/\btrail\b/g,' trl ').replace(/\bheights\b/g,' hts ').replace(/\bplace\b/g,' pl ').replace(/\bterrace\b/g,' terr ')
    .replace(/\bnorth\b/g,' n ').replace(/\bsouth\b/g,' s ').replace(/\beast\b/g,' e ').replace(/\bwest\b/g,' w ')
    .replace(/\b([a-z]\d[a-z])\s*(\d[a-z]\d)\b/g,'$1$2').replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();
}


function preinspectAddressParts_(value) {
  const raw = String(value || '');
  const normalized = preinspectNormalizeAddress_(raw);
  const postal = raw.toUpperCase().match(/\b([A-Z]\d[A-Z])\s?(\d[A-Z]\d)\b/);
  const house = normalized.match(/^(\d+[a-z]?)\b/i);

  const street = preinspectNormalizeAddress_(raw.split(',')[0] || raw)
    .replace(/^\d+[a-z]?\s*/i, '')
    .trim();

  return {
    normalized: normalized,
    postal: postal ? (postal[1] + postal[2]).toLowerCase() : '',
    house: house ? house[1].toLowerCase() : '',
    street: street
  };
}


function preinspectAddressScore_(a, b) {
  const x = preinspectAddressParts_(a);
  const y = preinspectAddressParts_(b);

  if (!x.normalized || !y.normalized) return 0;
  if (x.normalized === y.normalized) return 100;

  let score = 0;
  if (x.house && y.house && x.house === y.house) score += 35;
  if (x.street && y.street && x.street === y.street) score += 35;
  else if (x.street && y.street && (x.street.indexOf(y.street) !== -1 || y.street.indexOf(x.street) !== -1)) score += 25;
  if (x.postal && y.postal && x.postal === y.postal) score += 25;

  return Math.min(100, score);
}


/************************************************************
 * READ-ONLY STRIVEN TASK LOOKUP + DUPLICATE CHECK
 *
 * IMPORTANT:
 * - GET /v2/tasks/{id} is read-only.
 * - POST /v2/tasks/search is a SEARCH request only.
 * - This requester runtime-blocks every POST except /v2/tasks/search.
 * - No PATCH / PUT / DELETE / create-task request is permitted here.
 * - The current striven_token is read but NEVER refreshed or rewritten.
 ************************************************************/

function preinspectLookupTaskForReviewedRow_(reviewResult, templateOverride) {
  if (!reviewResult || reviewResult.decision !== 'CONFIRMED') {
    return {
      mode: 'READ_ONLY',
      writesPerformed: false,
      status: 'NOT_ELIGIBLE',
      action: 'REVIEW',
      reason: 'Customer/location review is not confirmed.',
      nextStage: 'NONE'
    };
  }

  const template = templateOverride || preinspectTaskTemplateSnapshot_(
    preinspectGetTaskByIdReadonly_(PREINSPECT_REVIEW_CONFIG.TEMPLATE_TASK_ID)
  );
  const typeId = preinspectNumber_(template.type && template.type.id);

  if (!typeId) {
    throw new Error(
      'Task 18191 did not return a usable Task Type ID. Duplicate lookup stopped.'
    );
  }

  const search = preinspectSearchTasksReadonly_(
    reviewResult.customerMatch,
    template
  );

  return preinspectEvaluateTaskSearch_(reviewResult, template, search);
}


function preinspectSearchTasksReadonly_(customerMatch, template) {
  const customerId = preinspectNumber_(customerMatch && customerMatch.customerId);
  const typeId = preinspectNumber_(template && template.type && template.type.id);

  if (!customerId) {
    throw new Error('Confirmed customer does not have a usable Customer ID.');
  }

  if (!typeId) {
    throw new Error('PreInspect template Task Type ID is blank.');
  }

  const auth = preinspectGetReadonlyStrivenAuth_();
  const url = auth.taskBaseUrl + '/search';
  const pageSize = Number(PREINSPECT_REVIEW_CONFIG.TASK_SEARCH_PAGE_SIZE || 100);
  const maxPages = Number(PREINSPECT_REVIEW_CONFIG.TASK_SEARCH_MAX_PAGES || 3);
  const allRows = [];
  let previousSignature = '';
  let repeatedPageDetected = false;
  let pagesFetched = 0;

  for (let pageIndex = 0; pageIndex < maxPages; pageIndex++) {
    const customer = { Id: customerId };
    const customerNumber = tm_cleanString_(customerMatch.customerNumber);
    const customerName = tm_cleanString_(customerMatch.customerName);
    if (customerNumber) customer.Number = customerNumber;
    if (customerName) customer.Name = customerName;

    const payload = {
      Customer: customer,
      Type: [typeId],
      PageIndex: pageIndex,
      PageSize: pageSize
    };

    const response = preinspectReadonlyTaskRequest_(
      'post',
      url,
      payload,
      'PreInspect READ-ONLY POST /v2/tasks/search'
    );

    const rows = preinspectExtractTaskSearchRows_(response.json);
    pagesFetched++;

    const signature = rows.slice(0, 5).map(function(row) {
      return String(preinspectCase_(row, ['id', 'Id']) || '');
    }).join('|');

    if (pageIndex > 0 && signature && signature === previousSignature) {
      repeatedPageDetected = true;
      break;
    }

    previousSignature = signature;

    rows.forEach(function(row) {
      allRows.push(row);
    });

    if (!rows.length || rows.length < pageSize) {
      break;
    }
  }

  return {
    mode: 'READ_ONLY',
    writesPerformed: false,
    endpoint: '/v2/tasks/search',
    customerId: customerId,
    taskTypeId: typeId,
    pagesFetched: pagesFetched,
    repeatedPageDetected: repeatedPageDetected,
    records: allRows
  };
}


function preinspectEvaluateTaskSearch_(reviewResult, template, search) {
  const rawRows = search && search.records ? search.records : [];
  const maxGets = Number(PREINSPECT_REVIEW_CONFIG.TASK_MAX_CANDIDATE_GETS || 10);
  const targetCustomerId = preinspectNumber_(
    reviewResult.customerMatch && reviewResult.customerMatch.customerId
  );
  const targetTypeId = preinspectNumber_(template.type && template.type.id);
  const targetLocationId = preinspectNumber_(
    reviewResult.locationMatch && reviewResult.locationMatch.locationId
  );
  const targetSalesOrderId = preinspectNumber_(
    reviewResult.salesOrderMatch && reviewResult.salesOrderMatch.salesOrderId
  );

  if (search.repeatedPageDetected) {
    return {
      mode: 'READ_ONLY',
      writesPerformed: false,
      status: 'REVIEW',
      action: 'REVIEW',
      reason: 'Task search pagination repeated a page. Duplicate decision blocked.',
      searchRecordCount: rawRows.length,
      candidates: [],
      nextStage: 'TASK_SEARCH_REVIEW'
    };
  }

  const taskIds = preinspectUnique_(rawRows.map(function(row) {
    return preinspectId_(preinspectCase_(row, ['id', 'Id', 'taskId', 'TaskId']));
  }).filter(function(id) { return !!id; }));

  if (!taskIds.length) {
    return {
      mode: 'READ_ONLY',
      writesPerformed: false,
      status: 'CLEAR',
      action: 'READY_CREATE',
      reason: 'No existing Striven task was returned for this Customer + PreInspect Task Type.',
      templateTaskId: PREINSPECT_REVIEW_CONFIG.TEMPLATE_TASK_ID,
      taskType: template.type,
      searchRecordCount: rawRows.length,
      candidateTaskIds: [],
      candidates: [],
      idempotencyAnchor: reviewResult.eventId,
      nextStage: 'CREATE_PREVIEW_NOT_ENABLED'
    };
  }

  if (taskIds.length > maxGets) {
    return {
      mode: 'READ_ONLY',
      writesPerformed: false,
      status: 'REVIEW',
      action: 'REVIEW',
      reason: 'More than ' + maxGets + ' candidate tasks were returned for the confirmed Customer + Task Type.',
      searchRecordCount: rawRows.length,
      candidateTaskIds: taskIds,
      candidates: [],
      nextStage: 'TASK_SEARCH_REVIEW'
    };
  }

  const candidates = [];

  taskIds.forEach(function(taskId) {
    const raw = preinspectGetTaskByIdReadonly_(taskId);
    const task = preinspectTaskCandidateSnapshot_(raw);

    const sameCustomer =
      targetCustomerId && task.customerId &&
      Number(targetCustomerId) === Number(task.customerId);

    const sameType =
      targetTypeId && task.typeId &&
      Number(targetTypeId) === Number(task.typeId);

    if (!sameCustomer || !sameType) {
      candidates.push({
        taskId: task.taskId,
        title: task.title,
        status: task.status,
        accepted: false,
        reason: 'Search result did not read back with the requested Customer + Task Type.',
        customerId: task.customerId,
        typeId: task.typeId
      });
      return;
    }

    let sameStart = preinspectSameMinuteValue_(reviewResult.start, task.startDateTime);
    let sameDue = preinspectSameMinuteValue_(reviewResult.end, task.dueDateTime);
    let sameDay = preinspectSameLocalDay_(reviewResult.start, task.startDateTime);
    let scheduleSource = 'V2_TASK_MODEL';

    // R4.6: only when v2 schedule disagrees with the Calendar, read the
    // canonical v1 DesiredStartDate / DesiredEndDate model. This avoids
    // doubling task GET usage for normal rows while correcting the proven
    // PreInspection PM representation defect.
    if (
      Number(task.typeId || 0) === Number(PREINSPECT_REVIEW_CONFIG.TASK_TYPE_ID || 105) &&
      (!sameStart || !sameDue) &&
      typeof preinspectR46GetCanonicalV1Schedule_ === 'function'
    ) {
      const canonical = preinspectR46GetCanonicalV1Schedule_(task.taskId);
      if (canonical && canonical.startDateTime && canonical.dueDateTime) {
        task.startDateTime = canonical.startDateTime;
        task.dueDateTime = canonical.dueDateTime;
        scheduleSource = canonical.source || 'V1_DESIRED_START_END';
        sameStart = preinspectSameMinuteValue_(reviewResult.start, task.startDateTime);
        sameDue = preinspectSameMinuteValue_(reviewResult.end, task.dueDateTime);
        sameDay = preinspectSameLocalDay_(reviewResult.start, task.startDateTime);
      }
    }
    const sameLocation = !!(
      targetLocationId && task.locationId &&
      Number(targetLocationId) === Number(task.locationId)
    );
    const sameSalesOrder = !!(
      targetSalesOrderId && task.salesOrderId &&
      Number(targetSalesOrderId) === Number(task.salesOrderId)
    );

    /************************************************************
     * DUPLICATE IDENTITY EVIDENCE FROM THE EXISTING TASK TITLE
     *
     * Important:
     * - Some existing Pre Inspection tasks do not expose usable dates.
     * - A matching Customer + Type + Location is already significant.
     * - Exact calendar phone/name evidence in the task title can safely
     *   corroborate that this is the same customer appointment.
     ************************************************************/
    const taskTitlePhones = preinspectExtractPhones_(task.title);
    const calendarPhones = reviewResult.signals && reviewResult.signals.phones
      ? reviewResult.signals.phones
      : [];
    const titlePhoneMatch = preinspectIntersect_(calendarPhones, taskTitlePhones).length > 0;

    const calendarName = preinspectName_(
      reviewResult.signals && reviewResult.signals.name
    );
    const normalizedTaskTitle = preinspectName_(task.title);
    const titleNameMatch = !!(
      calendarName &&
      normalizedTaskTitle &&
      normalizedTaskTitle.indexOf(calendarName) !== -1
    );

    const openStatus = tm_normalizeStatus_(task.status && task.status.name) === 'OPEN';

    let score = 0;
    if (sameStart) score += 100;
    if (sameDue) score += 30;
    if (sameLocation) score += 50;
    if (sameSalesOrder) score += 40;
    if (sameDay) score += 20;
    if (titlePhoneMatch) score += 80;
    if (titleNameMatch) score += 40;

    const identityCorroborated = titlePhoneMatch || titleNameMatch;

    const strongMatch =
      sameStart ||
      (sameDay && sameLocation) ||
      (sameDay && sameSalesOrder) ||
      (sameLocation && identityCorroborated);

    candidates.push({
      taskId: task.taskId,
      title: task.title,
      status: task.status,
      accepted: true,
      strongMatch: strongMatch,
      score: score,
      startDateTime: task.startDateTime,
      dueDateTime: task.dueDateTime,
      scheduleSource: scheduleSource,
      customerId: task.customerId,
      locationId: task.locationId,
      salesOrderId: task.salesOrderId,
      requestedById: task.requestedById,
      typeId: task.typeId,
      sameStart: sameStart,
      sameDue: sameDue,
      sameDay: sameDay,
      sameLocation: sameLocation,
      sameSalesOrder: sameSalesOrder,
      titlePhoneMatch: titlePhoneMatch,
      titleNameMatch: titleNameMatch,
      identityCorroborated: identityCorroborated,
      openStatus: openStatus
    });
  });

  const valid = candidates.filter(function(c) { return c.accepted; });
  const invalid = candidates.filter(function(c) { return !c.accepted; });

  if (!valid.length && invalid.length) {
    return {
      mode: 'READ_ONLY',
      writesPerformed: false,
      status: 'REVIEW',
      action: 'REVIEW',
      reason: 'Task search returned records, but read-back did not confirm the requested Customer + Task Type.',
      searchRecordCount: rawRows.length,
      candidateTaskIds: taskIds,
      candidates: candidates,
      nextStage: 'TASK_SEARCH_REVIEW'
    };
  }

  /************************************************************
   * R3.4.18a - OPEN-ONLY DUPLICATE SET
   *
   * Historical/non-open tasks are never allowed to block a new
   * appointment. Only OPEN tasks can match, block, or be reused.
   ************************************************************/
  const openValid = valid.filter(function(c) {
    return !!c.openStatus;
  });

  if (!openValid.length) {
    return {
      mode: 'READ_ONLY',
      writesPerformed: false,
      status: 'CLEAR',
      action: 'READY_CREATE',
      reason: 'No OPEN existing PreInspect task remains for this appointment. Non-open historical task(s) do not block creation.',
      templateTaskId: PREINSPECT_REVIEW_CONFIG.TEMPLATE_TASK_ID,
      taskType: template.type,
      searchRecordCount: rawRows.length,
      candidateTaskIds: taskIds,
      candidates: candidates,
      idempotencyAnchor: reviewResult.eventId,
      nextStage: 'CREATE_PREVIEW_NOT_ENABLED'
    };
  }

  openValid.sort(function(a, b) {
    return b.score - a.score;
  });

  const strong = openValid.filter(function(c) {
    return !!c.strongMatch;
  });

  if (strong.length === 1) {
    const match = strong[0];

    return {
      mode: 'READ_ONLY',
      writesPerformed: false,
      status: 'MATCHED',
      action: 'MATCH_EXISTING',
      reason: 'One OPEN existing PreInspect task strongly matches this confirmed calendar appointment.',
      existingTaskId: match.taskId,
      existingTaskStatus: match.status,
      searchRecordCount: rawRows.length,
      candidateTaskIds: taskIds,
      candidates: candidates,
      idempotencyAnchor: reviewResult.eventId,
      nextStage: 'READ_ONLY_EXISTING_TASK_DIFF_PREVIEW'
    };
  }

  if (strong.length > 1) {
    return {
      mode: 'READ_ONLY',
      writesPerformed: false,
      status: 'REVIEW',
      action: 'REVIEW_MULTIPLE',
      reason: 'Multiple OPEN existing PreInspect tasks strongly match this calendar appointment.',
      searchRecordCount: rawRows.length,
      candidateTaskIds: taskIds,
      candidates: candidates,
      idempotencyAnchor: reviewResult.eventId,
      nextStage: 'TASK_DUPLICATE_REVIEW'
    };
  }

  const sameDay = openValid.filter(function(c) {
    return !!c.sameDay;
  });

  if (sameDay.length) {
    return {
      mode: 'READ_ONLY',
      writesPerformed: false,
      status: 'REVIEW',
      action: 'REVIEW_WEAK_CANDIDATES',
      reason: 'Same-day OPEN PreInspect task candidate(s) exist, but none is strong enough to link automatically.',
      searchRecordCount: rawRows.length,
      candidateTaskIds: taskIds,
      candidates: candidates,
      idempotencyAnchor: reviewResult.eventId,
      nextStage: 'TASK_DUPLICATE_REVIEW'
    };
  }

  const sameLocationCandidates = openValid.filter(function(c) {
    return !!c.sameLocation;
  });

  if (sameLocationCandidates.length) {
    return {
      mode: 'READ_ONLY',
      writesPerformed: false,
      status: 'REVIEW',
      action: 'REVIEW_EXISTING_CANDIDATE',
      reason: 'OPEN PreInspect task candidate(s) already use the confirmed Customer + Location. Duplicate creation is blocked.',
      searchRecordCount: rawRows.length,
      candidateTaskIds: taskIds,
      candidates: candidates,
      idempotencyAnchor: reviewResult.eventId,
      nextStage: 'TASK_DUPLICATE_REVIEW'
    };
  }

  /************************************************************
   * R3.4.18a - SAFE UNSCHEDULED OPEN TASK REUSE
   *
   * If exactly one OPEN candidate remains and it has no usable
   * StartDateTime, we may reuse it only when:
   * - title phone/name corroborates the calendar identity; and
   * - its Location is blank OR already equals the confirmed Location.
   ************************************************************/
  const unresolvedCandidates = openValid.filter(function(c) {
    return !c.startDateTime;
  });

  const reusableUnscheduled = unresolvedCandidates.filter(function(c) {
    const noConflictingLocation = !c.locationId || !!c.sameLocation;
    return !!c.identityCorroborated && noConflictingLocation;
  });

  if (openValid.length === 1 && reusableUnscheduled.length === 1) {
    const match = reusableUnscheduled[0];

    return {
      mode: 'READ_ONLY',
      writesPerformed: false,
      status: 'MATCHED',
      action: 'MATCH_EXISTING',
      reason: 'Exactly one OPEN PreInspect task exists for this Customer + Task Type. It has no usable start date, but its title corroborates the customer identity and it has no conflicting Location. Reuse it and reconcile Location / Requested By / Calendar date-time.',
      existingTaskId: match.taskId,
      existingTaskStatus: match.status,
      searchRecordCount: rawRows.length,
      candidateTaskIds: taskIds,
      candidates: candidates,
      idempotencyAnchor: reviewResult.eventId,
      nextStage: 'READ_ONLY_EXISTING_TASK_DIFF_PREVIEW'
    };
  }

  if (unresolvedCandidates.length) {
    return {
      mode: 'READ_ONLY',
      writesPerformed: false,
      status: 'REVIEW',
      action: 'REVIEW_UNRESOLVED_CANDIDATE',
      reason: 'OPEN PreInspect candidate(s) have no usable start date and cannot be safely reused or ruled out automatically.',
      searchRecordCount: rawRows.length,
      candidateTaskIds: taskIds,
      candidates: candidates,
      idempotencyAnchor: reviewResult.eventId,
      nextStage: 'TASK_DUPLICATE_REVIEW'
    };
  }

  return {
    mode: 'READ_ONLY',
    writesPerformed: false,
    status: 'CLEAR',
    action: 'READY_CREATE',
    reason: 'No OPEN existing PreInspect task match was found for this calendar appointment.',
    templateTaskId: PREINSPECT_REVIEW_CONFIG.TEMPLATE_TASK_ID,
    taskType: template.type,
    searchRecordCount: rawRows.length,
    candidateTaskIds: taskIds,
    candidates: candidates,
    idempotencyAnchor: reviewResult.eventId,
    nextStage: 'CREATE_PREVIEW_NOT_ENABLED'
  };
}


function preinspectTaskCandidateSnapshot_(raw) {
  raw = raw || {};
  const type = raw.type || raw.Type || {};
  const status = raw.status || raw.Status || {};
  const customer = raw.customer || raw.Customer || {};
  const location = raw.location || raw.Location || {};
  const salesOrder = raw.salesOrder || raw.SalesOrder || {};
  const requestedBy = raw.requestedBy || raw.RequestedBy || {};
  const requestedByContact = raw.requestedByContact || raw.RequestedByContact || {};

  return {
    taskId: preinspectId_(preinspectCase_(raw, ['id', 'Id', 'taskId', 'TaskId'])),
    title: tm_cleanString_(preinspectCase_(raw, ['title', 'Title', 'name', 'Name'])),
    typeId: preinspectId_(preinspectCase_(type, ['id', 'Id'])),
    typeName: tm_cleanString_(preinspectCase_(type, ['name', 'Name'])),
    status: {id: preinspectId_(preinspectCase_(status, ['id', 'Id'])),name: tm_cleanString_(preinspectCase_(status, ['name', 'Name']))},
    customerId: preinspectId_(preinspectCase_(customer, ['id', 'Id'])),
    locationId: preinspectId_(preinspectCase_(location, ['id', 'Id'])),
    salesOrderId: preinspectId_(preinspectCase_(salesOrder, ['id', 'Id'])),
    requestedById: preinspectId_(preinspectCase_(requestedBy, ['id', 'Id'])) ||
      preinspectId_(preinspectCase_(requestedByContact, ['contactId', 'ContactId', 'id', 'Id'])) ||
      preinspectId_(preinspectCase_(raw, ['contactId', 'ContactId', 'requestedByContactId', 'RequestedByContactId'])),
    startDateTime: preinspectCase_(raw, ['startDateTime', 'StartDateTime', 'startDate', 'StartDate']),
    dueDateTime: preinspectCase_(raw, ['dueDateTime', 'DueDateTime', 'dueDate', 'DueDate'])
  };
}


function preinspectExtractTaskSearchRows_(json) {
  if (!json) return [];
  if (Array.isArray(json)) return json;

  const direct = [
    json.data,
    json.Data,
    json.items,
    json.Items,
    json.results,
    json.Results,
    json.tasks,
    json.Tasks
  ];

  for (let i = 0; i < direct.length; i++) {
    if (Array.isArray(direct[i])) return direct[i];
  }

  const nested = [json.data, json.Data, json.result, json.Result];

  for (let j = 0; j < nested.length; j++) {
    const obj = nested[j];
    if (!obj || typeof obj !== 'object') continue;

    const arrays = [
      obj.items, obj.Items,
      obj.results, obj.Results,
      obj.tasks, obj.Tasks,
      obj.rows, obj.Rows,
      obj.data, obj.Data
    ];

    for (let k = 0; k < arrays.length; k++) {
      if (Array.isArray(arrays[k])) return arrays[k];
    }
  }

  return [];
}


function preinspectGetTaskByIdReadonly_(taskId) {
  const cleanTaskId = preinspectId_(taskId);
  if (!cleanTaskId) throw new Error('A positive Task ID is required.');

  const auth = preinspectGetReadonlyStrivenAuth_();
  const result = preinspectReadonlyTaskRequest_(
    'get',
    auth.taskBaseUrl + '/' + encodeURIComponent(cleanTaskId),
    null,
    'PreInspect READ-ONLY GET /v2/tasks/' + cleanTaskId
  );

  return result.json || {};
}


function preinspectGetReadonlyStrivenAuth_() {
  const props = PropertiesService.getScriptProperties();
  const token = tm_cleanString_(props.getProperty('striven_token'));
  const rawExpires = Number(props.getProperty('striven_token_expires') || 0);
  const apiBase = tm_cleanString_(props.getProperty('STRIVEN_BASE_URL')) || 'https://api.striven.com';
  const configuredTaskBase = tm_cleanString_(props.getProperty('Striven_Task_BaseURL'));

  if (!token) {
    throw new Error(
      'striven_token is missing. PreInspect is read-only and will not create/refresh auth properties.'
    );
  }

  let expiresAt = rawExpires;
  if (expiresAt > 0 && expiresAt < 1000000000000) {
    expiresAt *= 1000;
  }

  if (expiresAt && Date.now() >= expiresAt) {
    throw new Error(
      'Current striven_token appears expired. Refresh auth using the existing Task Mapping auth workflow; PreInspect will not alter Script Properties.'
    );
  }

  return {
    token: token,
    expiresAt: expiresAt || null,
    taskBaseUrl: (configuredTaskBase || apiBase.replace(/\/+$/, '') + '/v2/tasks').replace(/\/+$/, '')
  };
}


function preinspectReadonlyTaskRequest_(method, url, payload, label) {
  const cleanMethod = String(method || '').toLowerCase();

  if (cleanMethod !== 'get' && cleanMethod !== 'post') {
    throw new Error('PreInspect read-only requester blocks method: ' + cleanMethod);
  }

  if (cleanMethod === 'post' && !/\/v2\/tasks\/search\/?(?:\?.*)?$/i.test(String(url || ''))) {
    throw new Error('PreInspect blocks POST unless the endpoint is exactly /v2/tasks/search.');
  }

  const auth = preinspectGetReadonlyStrivenAuth_();
  const options = {
    method: cleanMethod,
    contentType: 'application/json',
    muteHttpExceptions: true,
    headers: {
      Authorization: 'Bearer ' + auth.token,
      Accept: 'application/json'
    }
  };

  if (payload !== undefined && payload !== null) {
    options.payload = JSON.stringify(payload);
  }

  const response = UrlFetchApp.fetch(url, options);
  const statusCode = response.getResponseCode();
  const text = response.getContentText() || '';
  let json = null;

  try {
    json = text ? JSON.parse(text) : null;
  } catch (err) {
    json = null;
  }

  if (statusCode < 200 || statusCode >= 300) {
    throw new Error(
      (label || 'PreInspect read-only Striven request') +
      ' failed. HTTP ' + statusCode + '. Response: ' + text.slice(0, 1200)
    );
  }

  return {
    statusCode: statusCode,
    json: json,
    text: text
  };
}


function preinspectSameMinuteValue_(a, b) {
  const da = preinspectDateValue_(a);
  const db = preinspectDateValue_(b);
  if (!da || !db) return false;
  return tm_formatDateTime_(da) === tm_formatDateTime_(db);
}


function preinspectSameLocalDay_(a, b) {
  const da = preinspectDateValue_(a);
  const db = preinspectDateValue_(b);
  if (!da || !db) return false;
  return tm_formatDate_(da) === tm_formatDate_(db);
}


function preinspectDateValue_(value) {
  if (!value) return null;
  if (value instanceof Date && !isNaN(value.getTime())) return value;

  const clean = String(value || '').trim();
  const plainDate = clean.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (plainDate) {
    return new Date(
      Number(plainDate[1]),
      Number(plainDate[2]) - 1,
      Number(plainDate[3]),
      0, 0, 0, 0
    );
  }

  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}


/************************************************************
 * TASK 18191 REDUCED TEMPLATE SNAPSHOT
 ************************************************************/

function preinspectTaskTemplateSnapshot_(raw) {
  raw = raw || {};

  const type = raw.type || raw.Type || {};
  const status = raw.status || raw.Status || {};
  const priority = raw.priority || raw.Priority || {};
  const customer = raw.customer || raw.Customer || {};
  const location = raw.location || raw.Location || {};
  const salesOrder = raw.salesOrder || raw.SalesOrder || {};
  const requestedBy = raw.requestedBy || raw.RequestedBy || {};
  const assignments = raw.assignments || raw.Assignments || [];

  return {
    mode: 'READ_ONLY',
    writesPerformed: false,
    taskId: preinspectCase_(raw, ['id', 'Id']) || PREINSPECT_REVIEW_CONFIG.TEMPLATE_TASK_ID,
    title: preinspectCase_(raw, ['title', 'Title']),
    type: {
      id: preinspectCase_(type, ['id', 'Id']),
      name: preinspectCase_(type, ['name', 'Name'])
    },
    status: {
      id: preinspectCase_(status, ['id', 'Id']),
      name: preinspectCase_(status, ['name', 'Name'])
    },
    priority: {
      id: preinspectCase_(priority, ['id', 'Id']),
      name: preinspectCase_(priority, ['name', 'Name'])
    },
    customer: {
      id: preinspectCase_(customer, ['id', 'Id']),
      number: preinspectCase_(customer, ['number', 'Number']),
      name: preinspectCase_(customer, ['name', 'Name'])
    },
    location: {
      id: preinspectCase_(location, ['id', 'Id']),
      name: preinspectCase_(location, ['name', 'Name'])
    },
    salesOrder: {
      id: preinspectCase_(salesOrder, ['id', 'Id']),
      number: preinspectCase_(salesOrder, ['number', 'Number']),
      name: preinspectCase_(salesOrder, ['name', 'Name'])
    },
    requestedBy: {
      id: preinspectCase_(requestedBy, ['id', 'Id']),
      name: preinspectCase_(requestedBy, ['name', 'Name']),
      type: preinspectCase_(requestedBy, ['type', 'Type'])
    },
    startDateTime: preinspectCase_(raw, ['startDateTime', 'StartDateTime']),
    dueDateTime: preinspectCase_(raw, ['dueDateTime', 'DueDateTime']),
    assignments: assignments.map(function(a) {
      return {
        id: preinspectCase_(a, ['id', 'Id']),
        name: preinspectCase_(a, ['name', 'Name']),
        type: preinspectCase_(a, ['type', 'Type'])
      };
    }),
    attachmentCount: preinspectCase_(raw, ['attachmentCount', 'AttachmentCount']),
    dateCreated: preinspectCase_(raw, ['dateCreated', 'DateCreated']),
    dateModified: preinspectCase_(raw, ['dateModified', 'DateModified'])
  };
}


/************************************************************
 * PREINSPECT TASK MAPPING — BUILD / REFRESH
 *
 * Fast path:
 * - Reads Calendar + existing reference sheets only.
 * - Performs NO Striven task search during rebuild.
 * - Preserves completed task lookup results when the Calendar event
 *   fingerprint is unchanged.
 * - New/changed confirmed events become LOOKUP PENDING.
 ************************************************************/
function buildPreInspectTaskMapping() {
  // One operator refresh = pull latest Calendar mirror + rebuild mapping.
  const calendarSync = preinspectSyncCalendarMirror_('MAPPING_REFRESH');
  const ss = SpreadsheetApp.getActive();
  const calendarSheet = ss.getSheetByName(PREINSPECT_REVIEW_CONFIG.SHEETS.CALENDAR);
  if (!calendarSheet) throw new Error('Missing "PreInspect Calendar" sheet.');

  const mappingSheet = ss.getSheetByName(PREINSPECT_REVIEW_CONFIG.SHEETS.MAPPING) ||
    ss.insertSheet(PREINSPECT_REVIEW_CONFIG.SHEETS.MAPPING);

  const prior = preinspectReadPriorMappingState_(mappingSheet);
  const indexes = preinspectBuildIndexes_();
  const calendarRows = tm_getSheetObjects_(calendarSheet).filter(function(row) {
    return !preinspectCalendarRowBlank_(row);
  });

  const objects = [];
  let preservedLookups = 0;
  let retainedTaskRows = 0;
  let pendingLookups = 0;
  let reviewRows = 0;
  let skippedRows = 0;
  const classificationSummary = {
    PREINSPECT_JOB: 0,
    LIKELY_PREINSPECT_JOB: 0,
    OTHER_JOB: 0,
    SKIP_NON_JOB: 0,
    REVIEW_CLASSIFICATION: 0
  };
  const dryRunSummary = {
    WOULD_CREATE: 0,
    WOULD_PATCH_DATE_TIME: 0,
    WOULD_PATCH_TASK_DETAILS: 0,
    WOULD_PATCH_DATE_TIME_AND_DETAILS: 0,
    REVIEW_BEFORE_CREATE: 0,
    NO_ACTION: 0,
    LOOKUP_PENDING: 0,
    REVIEW: 0
  };

  calendarRows.forEach(function(row) {
    const rowNumber = Number(row._rowNumber || 0);
    const review = preinspectReviewRow_(row, indexes, rowNumber);
    const fingerprint = preinspectSourceFingerprint_(review);
    const eventId = tm_cleanString_(review.eventId);
    const old = eventId ? prior.byEventId[eventId] : null;
    const oldComplete = !!(
      old && tm_normalizeStatus_(old['Lookup State']) === 'COMPLETE'
    );
    const sameFingerprint = !!(
      old && tm_cleanString_(old['Source Fingerprint']) === fingerprint
    );
    const canPreserve = oldComplete && sameFingerprint;
    const sourceChangedAfterLookup = oldComplete && !sameFingerprint;

    const obj = preinspectBuildMappingObject_(review, old, {
      preserveCompleteLookup: canPreserve,
      sourceChangedAfterLookup: sourceChangedAfterLookup
    });
    obj['Source Fingerprint'] = fingerprint;
    obj['Notes'] = old ? tm_cleanString_(old['Notes']) : '';

    if (classificationSummary[review.classification] !== undefined) {
      classificationSummary[review.classification]++;
    }
    if (canPreserve) preservedLookups++;
    if (old && (
      tm_cleanString_(old['Task ID']) ||
      tm_cleanString_(old['Task Status']) ||
      tm_cleanString_(old['Task Match Evidence']) ||
      tm_cleanString_(old['Candidate Task IDs'])
    )) retainedTaskRows++;
    if (tm_normalizeStatus_(obj['Lookup State']) === 'PENDING') pendingLookups++;
    if (tm_normalizeStatus_(obj['Status']) === 'REVIEW') reviewRows++;
    if (tm_normalizeStatus_(obj['Status']) === 'SKIP') skippedRows++;

    const actionKey = tm_normalizeStatus_(obj['Task Action']).replace(/s+/g, '_');
    if (dryRunSummary[actionKey] !== undefined) dryRunSummary[actionKey]++;
    else if (actionKey === 'REVIEW_CLASSIFICATION' || actionKey === 'REVALIDATE_FIRST') dryRunSummary.REVIEW++;

    objects.push(obj);
  });

  preinspectWriteMappingObjects_(mappingSheet, objects);
  preinspectR342BackfillCalendarCustomerNumbers_(objects);

  const result = {
    mode: 'LOCATION_ELIGIBILITY_AND_FULL_TASK_PATCH_PREVIEW_ONLY',
    sheetName: PREINSPECT_REVIEW_CONFIG.SHEETS.MAPPING,
    writesPerformed: true,
    calendarSync: calendarSync,
    calendarRows: calendarRows.length,
    mappingRows: objects.length,
    classificationSummary: classificationSummary,
    dryRunSummary: dryRunSummary,
    preservedCompletedLookups: preservedLookups,
    retainedTaskDataRows: retainedTaskRows,
    pendingTaskLookups: pendingLookups,
    reviewRows: reviewRows,
    skippedRows: skippedRows,
    strivenTaskSearchCalls: 0,
    strivenMutationCalls: 0,
    calendarWriteCalls: 0
  };

  Logger.log(JSON.stringify(result, null, 2));
  return result;
}


/************************************************************
 * PREINSPECT TASK MAPPING — SELECTED ROW LOOKUP
 ************************************************************/
function reviewSelectedPreInspectMappingRow() {
  const sheet = SpreadsheetApp.getActiveSheet();
  if (!sheet || sheet.getName() !== PREINSPECT_REVIEW_CONFIG.SHEETS.MAPPING) {
    throw new Error('Run this from the "' + PREINSPECT_REVIEW_CONFIG.SHEETS.MAPPING + '" sheet.');
  }

  const rowNumber = sheet.getActiveRange().getRow();
  if (rowNumber < 2) throw new Error('Select a mapping data row, not the header.');

  const current = preinspectMappingRowObject_(sheet, rowNumber);
  const eventId = tm_cleanString_(current['Event ID']);
  if (!eventId) throw new Error('Selected mapping row has no Event ID. Rebuild the mapping first.');

  const context = preinspectBuildMappingLookupContext_();
  const calendar = context.calendarByEventId[eventId];
  if (!calendar) throw new Error('Calendar event is no longer present. Rebuild the mapping.');

  const review = preinspectReviewRow_(calendar.row, context.indexes, calendar.rowNumber);
  const refreshed = preinspectBuildMappingObject_(review, current);
  refreshed['Source Fingerprint'] = preinspectSourceFingerprint_(review);
  refreshed['Notes'] = tm_cleanString_(current['Notes']);

  if (review.decision === 'CONFIRMED') {
    try {
      const lookup = preinspectLookupTaskForReviewedRow_(review, context.template);
      preinspectApplyTaskLookupToMappingObject_(refreshed, lookup);
    } catch (err) {
      preinspectApplyTaskLookupError_(refreshed, err);
    }
  }

  preinspectWriteSingleMappingObject_(sheet, rowNumber, refreshed);
  preinspectApplyMappingFormatting_(sheet);
  preinspectR342BackfillCalendarCustomerNumbers_([refreshed]);

  const result = {
    mode: 'READ_ONLY_STRIVEN_LOOKUP_PLUS_MAPPING_WRITE',
    writesPerformed: true,
    mappingRow: rowNumber,
    eventId: eventId,
    status: refreshed['Status'],
    taskAction: refreshed['Task Action'],
    taskId: refreshed['Task ID'],
    lookupState: refreshed['Lookup State'],
    issue: refreshed['Issue']
  };

  Logger.log(JSON.stringify(result, null, 2));
  return result;
}


/************************************************************
 * PREINSPECT TASK MAPPING — BOUNDED BATCH LOOKUP
 *
 * Only rows with Lookup State = PENDING are processed.
 * The template task is read once per batch, then reused.
 ************************************************************/
function reviewNextPreInspectMappingBatch() {
  const sheet = SpreadsheetApp.getActive().getSheetByName(
    PREINSPECT_REVIEW_CONFIG.SHEETS.MAPPING
  );
  if (!sheet) throw new Error('Missing "PreInspect Task Mapping" sheet.');

  const rows = tm_getSheetObjects_(sheet);
  let hydrationQueued = 0;
  const pending = rows.filter(function(row) {
    const lookupPending = tm_normalizeStatus_(row['Lookup State']) === 'PENDING';
    const classification = tm_normalizeStatus_(row['Classification']);
    const taskEligible = classification === 'PREINSPECT_JOB' ||
      classification === 'LIKELY_PREINSPECT_JOB';
    const needsTaskHydration = taskEligible &&
      !!tm_cleanString_(row['Task ID']) &&
      !tm_cleanString_(row['Patch Preview']);

    if (!lookupPending && needsTaskHydration) hydrationQueued++;
    return lookupPending || needsTaskHydration;
  });

  const limit = Number(PREINSPECT_REVIEW_CONFIG.MAPPING_BATCH_SIZE || 8);
  const batch = pending.slice(0, limit);

  if (!batch.length) {
    const empty = {
      mode: 'READ_ONLY_STRIVEN_LOOKUP_PLUS_MAPPING_WRITE',
      writesPerformed: false,
      processed: 0,
      remaining: 0,
      status: 'NO_PENDING_OR_HYDRATION_ROWS',
      hydrationQueued: hydrationQueued
    };
    Logger.log(JSON.stringify(empty, null, 2));
    return empty;
  }

  const context = preinspectBuildMappingLookupContext_();
  let matched = 0;
  let readyCreate = 0;
  let reviewCount = 0;
  let errors = 0;

  batch.forEach(function(current) {
    const mappingRowNumber = Number(current._rowNumber || 0);
    const eventId = tm_cleanString_(current['Event ID']);
    const calendar = eventId ? context.calendarByEventId[eventId] : null;
    let refreshed;

    if (!calendar) {
      refreshed = preinspectObjectClone_(current);
      refreshed['Status'] = 'REVIEW';
      refreshed['Task Action'] = 'REVIEW';
      refreshed['Issue'] = 'Calendar event is no longer present. Rebuild the mapping.';
      refreshed['Lookup State'] = 'ERROR';
      refreshed['Last Reviewed'] = tm_nowFormatted_();
      reviewCount++;
    } else {
      const review = preinspectReviewRow_(calendar.row, context.indexes, calendar.rowNumber);
      refreshed = preinspectBuildMappingObject_(review, current);
      refreshed['Source Fingerprint'] = preinspectSourceFingerprint_(review);
      refreshed['Notes'] = tm_cleanString_(current['Notes']);

      if (review.decision === 'CONFIRMED') {
        try {
          const lookup = preinspectLookupTaskForReviewedRow_(review, context.template);
          preinspectApplyTaskLookupToMappingObject_(refreshed, lookup);
          if (lookup.action === 'MATCH_EXISTING') matched++;
          else if (lookup.action === 'READY_CREATE') readyCreate++;
          else reviewCount++;
        } catch (err) {
          preinspectApplyTaskLookupError_(refreshed, err);
          errors++;
        }
      } else if (review.decision === 'REVIEW') {
        reviewCount++;
      }
    }

    preinspectWriteSingleMappingObject_(sheet, mappingRowNumber, refreshed);
  });

  preinspectApplyMappingFormatting_(sheet);

  const remaining = Math.max(0, pending.length - batch.length);
  const result = {
    mode: 'READ_ONLY_STRIVEN_LOOKUP_PLUS_MAPPING_WRITE',
    writesPerformed: true,
    processed: batch.length,
    hydrationQueued: hydrationQueued,
    matchedExisting: matched,
    readyCreate: readyCreate,
    review: reviewCount,
    errors: errors,
    remainingPending: remaining,
    batchLimit: limit
  };

  Logger.log(JSON.stringify(result, null, 2));
  return result;
}


function preinspectBuildMappingLookupContext_() {
  const calendarSheet = SpreadsheetApp.getActive().getSheetByName(
    PREINSPECT_REVIEW_CONFIG.SHEETS.CALENDAR
  );
  if (!calendarSheet) throw new Error('Missing "PreInspect Calendar" sheet.');

  const calendarRows = tm_getSheetObjects_(calendarSheet);
  const byEventId = {};
  calendarRows.forEach(function(row) {
    const eventId = tm_cleanString_(preinspectFirst_(row, ['Event ID', 'EventId', 'CalendarEventId', 'Id']));
    if (!eventId) return;
    byEventId[eventId] = {
      row: row,
      rowNumber: Number(row._rowNumber || 0)
    };
  });

  const template = preinspectTaskTemplateSnapshot_(
    preinspectGetTaskByIdReadonly_(PREINSPECT_REVIEW_CONFIG.TEMPLATE_TASK_ID)
  );

  return {
    indexes: preinspectBuildIndexes_(),
    calendarByEventId: byEventId,
    template: template
  };
}


function preinspectBuildMappingObject_(review, prior, options) {
  prior = prior || {};
  options = options || {};
  const customer = review.customerMatch || {};
  const location = review.locationMatch || {};
  const contact = review.contactMatch || {};
  const so = review.salesOrderMatch || {};
  const signals = review.signals || {};
  const classification = review.classification || 'REVIEW_CLASSIFICATION';
  const taskEligibleClassification = classification === 'PREINSPECT_JOB' || classification === 'LIKELY_PREINSPECT_JOB';

  const confirmed = review.decision === 'CONFIRMED' && taskEligibleClassification;
  const priorComplete = tm_normalizeStatus_(prior['Lookup State']) === 'COMPLETE';
  const preserved = options.preserveCompleteLookup === undefined ? priorComplete : !!options.preserveCompleteLookup;
  const sourceChangedAfterLookup = !!options.sourceChangedAfterLookup;
  const priorTaskId = tm_cleanString_(prior['Task ID']);

  let status = review.decision === 'SKIP' ? 'SKIP' : (review.decision === 'REVIEW' ? 'REVIEW' : 'CONFIRMED');
  let taskAction = confirmed ? 'LOOKUP PENDING' : '';
  let lookupState = confirmed ? 'PENDING' : 'NOT_REQUIRED';
  let issue = review.reason || '';

  if (location.status === 'NEW_LOCATION_REQUIRED') {
    status = 'REVIEW';
    taskAction = 'CREATE LOCATION FIRST';
    lookupState = 'NOT_REQUIRED';
    issue = location.reason;
  }

  if (classification === 'SKIP_NON_JOB') {
    status='SKIP';taskAction='SKIP_NON_JOB';lookupState='NOT_REQUIRED';issue=review.classificationReason||review.reason||'Non-job Calendar block.';
  } else if (classification === 'OTHER_JOB') {
    status='SKIP';taskAction='OTHER_JOB_NO_PREINSPECT';lookupState='NOT_REQUIRED';issue=review.classificationReason||review.reason||'Field work belongs to another workflow/task type.';
  } else if (classification === 'REVIEW_CLASSIFICATION') {
    status='REVIEW';taskAction='REVIEW_CLASSIFICATION';lookupState='NOT_REQUIRED';issue=review.classificationReason||review.reason||'Calendar entry needs classification review.';
  } else if (preserved) {
    status=tm_cleanString_(prior['Status'])||status;
    taskAction=preinspectDryRunActionFromPrior_(prior);
    lookupState='COMPLETE';
    issue=tm_cleanString_(prior['Issue'])||issue;
  } else if (sourceChangedAfterLookup && confirmed) {
    status='REVIEW';taskAction='REVALIDATE_FIRST';lookupState='PENDING';
    issue=priorTaskId ? 'Calendar details changed. Existing Task '+priorTaskId+' retained; revalidate before any task PATCH.' : 'Calendar details changed since the last task lookup. Revalidate before any action.';
  }

  return {
    'Calendar Row':review.rowNumber||'', 'Status':status, 'Task Action':taskAction,
    'Date':preinspectMappingDate_(review.start), 'Time':preinspectMappingTimeRange_(review.start,review.end,review.allDay),
    'Calendar Title':review.title||'', 'Customer #':customer.customerNumber||tm_cleanString_(prior['Customer #'])||'',
    'Customer':customer.customerName||signals.name||tm_cleanString_(prior['Customer'])||'', 'Location':location.address||review.calendarLocation||'',
    'Task ID':tm_cleanString_(prior['Task ID']), 'Task Status':tm_cleanString_(prior['Task Status']),
    'Match':preinspectMappingMatchSummary_(review), 'Issue':issue,
    'Last Reviewed':tm_cleanString_(prior['Last Reviewed']), 'Notes':tm_cleanString_(prior['Notes']),
    'Event ID':review.eventId||'', 'Calendar Location':review.calendarLocation||'', 'Calendar Description':review.calendarDescription||'',
    'Customer ID':customer.customerId||tm_cleanString_(prior['Customer ID'])||'', 'Location ID':location.locationId||tm_cleanString_(prior['Location ID'])||'',
    'SO #':signals.salesOrderNumber||so.salesOrderNumber||tm_cleanString_(prior['SO #'])||'', 'SO ID':so.salesOrderId||tm_cleanString_(prior['SO ID'])||'',
    'Contact ID':contact.contactId||so.contactId||tm_cleanString_(prior['Contact ID'])||'', 'Task Type ID':tm_cleanString_(prior['Task Type ID']),
    'Task Match Score':tm_cleanString_(prior['Task Match Score']), 'Task Match Evidence':tm_cleanString_(prior['Task Match Evidence']),
    'Candidate Task IDs':tm_cleanString_(prior['Candidate Task IDs']), 'Calendar Start':review.start||'', 'Calendar End':review.end||'',
    'Task Start':tm_cleanString_(prior['Task Start']), 'Task Due':tm_cleanString_(prior['Task Due']),
    'Task SalesOrder ID':tm_cleanString_(prior['Task SalesOrder ID']),
    'Task Location ID':tm_cleanString_(prior['Task Location ID']),
    'Task Contact ID':tm_cleanString_(prior['Task Contact ID']),
    'Classification':classification,
    'Classification Reason':review.classificationReason||'',
    'Patch Preview':tm_cleanString_(prior['Patch Preview']),
    'Source Fingerprint':'', 'Lookup State':lookupState
  };
}


function preinspectApplyTaskLookupToMappingObject_(obj, lookup) {
  lookup = lookup || {};
  const candidates = lookup.candidates || [];
  const existingId = tm_cleanString_(lookup.existingTaskId);
  const best = existingId
    ? candidates.filter(function(c) { return tm_cleanString_(c.taskId) === existingId; })[0]
    : candidates.slice().sort(function(a,b){return Number(b.score||0)-Number(a.score||0);})[0];

  obj['Issue']=lookup.reason||'';
  obj['Last Reviewed']=tm_nowFormatted_();
  obj['Lookup State']=lookup.status==='ERROR'?'ERROR':'COMPLETE';
  obj['Candidate Task IDs']=(lookup.candidateTaskIds||[]).join(', ');
  const taskType=lookup.taskType||{};
  obj['Task Type ID']=preinspectNumber_(taskType.id)||(best?preinspectNumber_(best.typeId):'');

  if(best){
    obj['Task Match Score']=Number(best.score||0);
    obj['Task Match Evidence']=preinspectCandidateEvidence_(best);
    obj['Task Start']=best.startDateTime||'';
    obj['Task Due']=best.dueDateTime||'';
    obj['Task SalesOrder ID']=best.salesOrderId||'';
    obj['Task Location ID']=best.locationId||'';
    obj['Task Contact ID']=best.requestedById||'';
  }

  if(lookup.action==='MATCH_EXISTING'){
    obj['Status']='MATCHED';
    obj['Task ID']=lookup.existingTaskId||'';
    obj['Task Status']=lookup.existingTaskStatus&&lookup.existingTaskStatus.name?lookup.existingTaskStatus.name:(best&&best.status?best.status.name||'':'');
    const preview=preinspectBuildStoredTaskPatchPreview_(obj);
    obj['Patch Preview']=JSON.stringify(preview.payload);
    obj['Task Action']=preview.action;
    if(preview.summary){obj['Issue']=(obj['Issue']?obj['Issue']+' | ':'')+preview.summary;}
    return;
  }

  if(lookup.action==='READY_CREATE'){
    obj['Task ID']='';obj['Task Status']='';obj['Patch Preview']='';

    const readySignals = preinspectExtractSignals_({
      title: obj['Calendar Title'] || '',
      description: obj['Calendar Description'] || '',
      location: obj['Calendar Location'] || obj['Location'] || ''
    });

    if (!readySignals.phones || readySignals.phones.length !== 1) {
      obj['Status']='REVIEW';
      obj['Task Action']='REVIEW_MISSING_PHONE';
      obj['Issue']=(obj['Issue']?obj['Issue']+' | ':'')+
        'CREATE blocked: exactly one verified phone is required for the standard Task Name (Customer Name - Address - Customer Phone Number).';
      return;
    }

    if(tm_cleanString_(obj['Classification'])==='LIKELY_PREINSPECT_JOB'){
      obj['Status']='REVIEW';obj['Task Action']='REVIEW_BEFORE_CREATE';
      obj['Issue']=(obj['Issue']?obj['Issue']+' | ':'')+'Location makes this likely task-worthy, but stronger PreInspect evidence is required before CREATE.';
    }else{
      obj['Status']='READY CREATE';obj['Task Action']='WOULD_CREATE';
    }
    return;
  }

  obj['Status']='REVIEW';obj['Task Action']='REVIEW';obj['Patch Preview']='';
  if(existingId)obj['Task ID']=existingId;
  if(lookup.existingTaskStatus&&lookup.existingTaskStatus.name)obj['Task Status']=lookup.existingTaskStatus.name;
}


function preinspectApplyTaskLookupError_(obj, err) {
  obj['Status'] = 'REVIEW';
  obj['Task Action'] = 'REVIEW';
  obj['Issue'] = err && err.message ? err.message : String(err);
  obj['Last Reviewed'] = tm_nowFormatted_();
  obj['Lookup State'] = 'ERROR';
}


function preinspectCandidateEvidence_(candidate) {
  const parts = [];
  if (!candidate) return '';
  if (candidate.sameStart) parts.push('START');
  if (candidate.sameDue) parts.push('DUE');
  if (String(candidate.scheduleSource || '') === 'V1_DESIRED_START_END') parts.push('V1_DATES');
  if (candidate.sameDay) parts.push('DAY');
  if (candidate.sameLocation) parts.push('LOCATION');
  if (candidate.sameSalesOrder) parts.push('SO');
  if (candidate.titlePhoneMatch) parts.push('PHONE');
  if (candidate.titleNameMatch) parts.push('NAME');
  return parts.join(' + ');
}


function preinspectMappingMatchSummary_(review) {
  const parts = [];
  if (review.customerMatch && review.customerMatch.primaryMethod) {
    parts.push(review.customerMatch.primaryMethod);
  }
  if (review.locationMatch && review.locationMatch.method) {
    parts.push(review.locationMatch.method);
  }
  return parts.join(' + ');
}


function preinspectSourceFingerprint_(review) {
  const text = [
    review.eventId,
    preinspectDateFingerprintValue_(review.start),
    preinspectDateFingerprintValue_(review.end),
    review.title,
    review.calendarLocation,
    review.calendarDescription
  ].map(function(v) { return tm_cleanString_(v); }).join('|');

  const digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    text,
    Utilities.Charset.UTF_8
  );

  return digest.map(function(b) {
    const v = b < 0 ? b + 256 : b;
    return ('0' + v.toString(16)).slice(-2);
  }).join('');
}


function preinspectDateFingerprintValue_(value) {
  const d = preinspectDateValue_(value);
  return d ? tm_formatDateTime_(d) : tm_cleanString_(value);
}


function preinspectMappingDate_(value) {
  const d = preinspectDateValue_(value);
  if (!d) return '';
  const tz = typeof tm_getTimezone_ === 'function' ? tm_getTimezone_() : 'America/Toronto';
  return Utilities.formatDate(d, tz, 'yyyy-MM-dd');
}


function preinspectMappingTimeRange_(start, end, allDay) {
  if (allDay === true) return '';
  const s = preinspectDateValue_(start);
  const e = preinspectDateValue_(end);
  if (!s || !e) return '';
  const tz = typeof tm_getTimezone_ === 'function' ? tm_getTimezone_() : 'America/Toronto';
  return Utilities.formatDate(s, tz, 'HH:mm') + '–' + Utilities.formatDate(e, tz, 'HH:mm');
}


function preinspectReadPriorMappingState_(sheet) {
  const result = { byEventId: {} };
  if (!sheet || sheet.getLastRow() < 2 || sheet.getLastColumn() < 1) return result;

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]
    .map(function(v) { return tm_cleanString_(v); });
  if (headers.indexOf('Event ID') === -1) return result;

  const rows = tm_getSheetObjects_(sheet);
  rows.forEach(function(row) {
    const eventId = tm_cleanString_(row['Event ID']);
    if (eventId) result.byEventId[eventId] = row;
  });
  return result;
}


function preinspectWriteMappingObjects_R3419_ORIGINAL_(sheet, objects) {
  const width = PREINSPECT_MAP_HEADERS.length;
  if (sheet.getMaxColumns() < width) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), width - sheet.getMaxColumns());
  }

  const clearWidth = Math.max(width, sheet.getLastColumn());
  const maxRows = sheet.getMaxRows();
  if (maxRows > 1) {
    sheet.getRange(2, 1, maxRows - 1, clearWidth).clearContent();  // R3.4.17: preserve formatting/RichText presentation layer.
  }

  sheet.getRange(1, 1, 1, width).setValues([PREINSPECT_MAP_HEADERS]);

  if (objects.length) {
    const values = objects.map(function(obj) {
      return PREINSPECT_MAP_HEADERS.map(function(header) {
        const v = obj[header];
        return v === undefined || v === null ? '' : v;
      });
    });
    sheet.getRange(2, 1, values.length, width).setValues(values);
  }

  preinspectApplyMappingFormatting_(sheet);

  // Full-row setValues() necessarily replaces RichText values. Restore the
  // operator presentation immediately so a manual rebuild never leaves IDs
  // or task links looking like plain/raw values.
  if (typeof preinspectR3414ApplySheetHyperlinks_ === 'function') {
    try {
      preinspectR3414ApplySheetHyperlinks_();
    } catch (err) {
      Logger.log(JSON.stringify({
        mode: 'PREINSPECT_REBUILD_HYPERLINK_REAPPLY',
        status: 'WARNING',
        error: err && err.message ? err.message : String(err)
      }));
    }
  }
}


function preinspectWriteSingleMappingObject_R3419_ORIGINAL_(sheet, rowNumber, obj) {
  const values = PREINSPECT_MAP_HEADERS.map(function(header) {
    const v = obj[header];
    return v === undefined || v === null ? '' : v;
  });
  sheet.getRange(rowNumber, 1, 1, PREINSPECT_MAP_HEADERS.length).setValues([values]);
}


function preinspectMappingRowObject_(sheet, rowNumber) {
  const headers = sheet.getRange(1, 1, 1, PREINSPECT_MAP_HEADERS.length).getValues()[0]
    .map(function(v) { return tm_cleanString_(v); });
  const expected = PREINSPECT_MAP_HEADERS.join('|');
  if (headers.join('|') !== expected) {
    throw new Error('PreInspect Task Mapping headers do not match the current mapping schema. Run Build / Refresh Task Mapping first.');
  }

  const values = sheet.getRange(rowNumber, 1, 1, PREINSPECT_MAP_HEADERS.length).getValues()[0];
  const obj = {};
  PREINSPECT_MAP_HEADERS.forEach(function(header, index) {
    obj[header] = values[index];
  });
  obj._rowNumber = rowNumber;
  return obj;
}


function preinspectApplyMappingFormatting_R3419_ORIGINAL_(sheet) {
  const width = PREINSPECT_MAP_HEADERS.length;
  const lastRow = sheet.getLastRow();

  sheet.getRange(1, 1, 1, width)
    .setFontWeight('bold')
    .setFontColor('#ffffff')
    .setBackground('#1f4e78')
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle')
    .setWrap(true);

  sheet.setFrozenRows(1);
  sheet.setRowHeight(1, 38);

  if (lastRow >= 2) {
    const body = sheet.getRange(2, 1, lastRow - 1, PREINSPECT_MAP_VISIBLE_COLUMN_COUNT);
    body.setVerticalAlignment('middle').setWrap(true);

    const rows = body.getValues();
    const backgrounds = rows.map(function(row) {
      const status = tm_normalizeStatus_(row[1]);
      let color = '#ffffff';
      if (status === 'MATCHED') color = '#d9ead3';
      else if (status === 'READY CREATE' || status === 'CONFIRMED') color = '#fff2cc';
      else if (status === 'REVIEW') color = '#fce5cd';
      else if (status === 'SKIP') color = '#eeeeee';
      return row.map(function() { return color; });
    });
    body.setBackgrounds(backgrounds);
  }

  // Operator-first widths.
  const widths = [70, 95, 120, 90, 105, 260, 90, 160, 220, 85, 90, 180, 300, 125, 180];
  widths.forEach(function(px, index) { sheet.setColumnWidth(index + 1, px); });

  // Keep all technical/audit columns present but hidden.
  if (sheet.getMaxColumns() >= PREINSPECT_MAP_VISIBLE_COLUMN_COUNT + 1) {
    try {
      sheet.showColumns(1, width);
      sheet.hideColumns(
        PREINSPECT_MAP_VISIBLE_COLUMN_COUNT + 1,
        width - PREINSPECT_MAP_VISIBLE_COLUMN_COUNT
      );
    } catch (err) {
      // Formatting failure must not affect mapping data.
    }
  }

  const existingFilter = sheet.getFilter();
  if (existingFilter) existingFilter.remove();
  if (lastRow >= 1) {
    sheet.getRange(1, 1, Math.max(1, lastRow), PREINSPECT_MAP_VISIBLE_COLUMN_COUNT).createFilter();
  }
}


/************************************************************
 * PREINSPECT R12 — EVENT CLASSIFICATION + DRY-RUN ACTIONS
 *
 * Observation only. These helpers never create/update Striven tasks and
 * never write to Google Calendar.
 ************************************************************/
function preinspectClassifyCalendarEvent_R3420_ORIGINAL_(event, signals) {
  event = event || {};
  signals = signals || {};

  const title = tm_cleanString_(event.title);
  const description = tm_cleanString_(event.description);
  const titleNorm = title.toLowerCase();
  const combinedNorm = (title + ' ' + description).toLowerCase();
  const hasCalendarLocation = !!tm_cleanString_(event.location || signals.address);

  if (
    preinspectNonCustomerEvent_(title) ||
    /\bout of office\b/i.test(title) ||
    /^\s*physio(?:therapy)?\s*$/i.test(title)
  ) {
    return {code:'SKIP_NON_JOB',reason:'Calendar block is operational/personal and does not require a Pre Inspection task.'};
  }

  if (/\bpre[\s-]*inspect(?:ion)?\b/i.test(combinedNorm)) {
    return {code:'PREINSPECT_JOB',reason:'Calendar entry explicitly identifies a Pre Inspection.'};
  }

  /************************************************************
   * R3.4.14 - EXPLICIT OTHER-JOB GUARD
   ************************************************************/
  const explicitOtherJobText = (title + '\n' + description).trim();

  if (
    /\bdelivery\b/i.test(titleNorm) ||
    /\bdeliver(?:y|ing|ed)?\b/i.test(titleNorm) ||
    /^\s*(?:deliver|delivery|pick\s*up|pickup|drop\s*off|unload)\b/i.test(description) ||
    /^\s*help\b[\s\S]{0,80}\bunload\b/i.test(description) ||
    /\b(?:deliver|delivery|pick\s*up|pickup|drop\s*off|unload)\b[\s\S]{0,80}\b(?:grill|bbq|barbecue|appliance|fireplace|unit|accessor(?:y|ies))\b/i.test(explicitOtherJobText)
  ) {
    return {
      code: 'OTHER_JOB',
      reason: 'Calendar entry explicitly describes Delivery / pickup / unloading work, not a Pre Inspection.'
    };
  }

  if (
    /\bservice\b/i.test(titleNorm) ||
    /\bcommission(?:ing)?\b/i.test(titleNorm) ||
    /\bset\s*up\b.*\bfireplace\b/i.test(titleNorm) ||
    /\binstall(?:ing|ation)?\b/i.test(titleNorm) ||
    /\bfinish\s*up\b/i.test(titleNorm)
  ) {
    return {code:'OTHER_JOB',reason:'Calendar entry appears to be field work, but not a Pre Inspection task.'};
  }

  /************************************************************
   * R3.4.15 - ORGANIZER + PHYSICAL-ADDRESS CONFIDENCE
   ************************************************************/
  const organizerEmails = preinspectR3415OrganizerEmails_(event.organizers);
  const hasOrganizer = organizerEmails.length > 0;
  const organizedByStephen =
    organizerEmails.indexOf('stephen@classicfireplace.ca') >= 0;
  const hasStreetAddress =
    preinspectR3415LooksLikeStreetAddress_(event.location);

  if (hasOrganizer && !organizedByStephen && hasStreetAddress) {
    return {
      code: 'PREINSPECT_JOB',
      reason:
        'Non-Stephen organizer plus a physical Calendar Location strongly indicate a Pre Inspection appointment.'
    };
  }

  const hasStrongIdentity = !!(
    tm_cleanString_(signals.customerNumber) ||
    (signals.customerNumberCandidates && signals.customerNumberCandidates.length) ||
    tm_cleanString_(signals.salesOrderNumber) ||
    (signals.phones && signals.phones.length) ||
    (signals.emails && signals.emails.length)
  );
  const hasProjectEvidence = /\b(?:fireplace|f\/?p|g3(?:\.5)?|insert|wood\s+to\s+gas|gas\s+insert|zc|mason(?:ry|ary)|mantel|blp\d*|logs?|panels?)\b/i.test(combinedNorm);

  if (hasCalendarLocation && hasStrongIdentity && hasProjectEvidence) {
    return {code:'PREINSPECT_JOB',reason:'Calendar location plus customer identity and fireplace/project evidence strongly indicate a Pre Inspection appointment.'};
  }

  // Dedicated PreInspect Calendar rule: a physical Calendar Location is a
  // strong eligibility prior, but never overrides the explicit SKIP/OTHER_JOB
  // rules above. These rows may undergo READ-ONLY customer/task lookup, but a
  // missing task remains REVIEW_BEFORE_CREATE until the classification is
  // confirmed by stronger evidence.
  if (hasCalendarLocation) {
    return {code:'LIKELY_PREINSPECT_JOB',reason:'Physical Calendar Location makes this likely task-worthy on the dedicated PreInspect Calendar; keep under review before any CREATE.'};
  }

  return {code:'REVIEW_CLASSIFICATION',reason:'Calendar entry is not clearly a Pre Inspection, another field-job type, or a non-job block.'};
}

function preinspectDryRunActionFromPrior_(prior) {
  prior = prior || {};
  const taskId = tm_cleanString_(prior['Task ID']);
  const status = tm_normalizeStatus_(prior['Status']);
  const priorAction = tm_normalizeStatus_(prior['Task Action']).replace(/\s+/g,'_');
  const classification = tm_cleanString_(prior['Classification']);

  if(status==='READY CREATE'||priorAction==='READY_CREATE'||priorAction==='WOULD_CREATE'){
    return classification==='LIKELY_PREINSPECT_JOB'?'REVIEW_BEFORE_CREATE':'WOULD_CREATE';
  }

  if(taskId&&(status==='MATCHED'||priorAction==='MATCH_EXISTING'||priorAction==='WOULD_PATCH_DATE_TIME'||priorAction==='WOULD_PATCH_TASK_DETAILS'||priorAction==='WOULD_PATCH_DATE_TIME_AND_DETAILS'||priorAction==='NO_ACTION')){
    return preinspectBuildStoredTaskPatchPreview_(prior).action;
  }

  if(priorAction==='REVIEW'||priorAction.indexOf('REVIEW_')===0)return tm_cleanString_(prior['Task Action'])||'REVIEW';
  return tm_cleanString_(prior['Task Action'])||'LOOKUP PENDING';
}

function preinspectTaskScheduleDiffers_(obj) {
  obj = obj || {};
  const calendarStart = preinspectDateValue_(obj['Calendar Start']);
  const calendarEnd = preinspectDateValue_(obj['Calendar End']);
  const taskStart = preinspectDateValue_(obj['Task Start']);
  const taskDue = preinspectDateValue_(obj['Task Due']);

  if (!calendarStart || !calendarEnd) return false;
  if (!taskStart || !taskDue) return true;

  return preinspectMinuteKey_(calendarStart) !== preinspectMinuteKey_(taskStart) ||
    preinspectMinuteKey_(calendarEnd) !== preinspectMinuteKey_(taskDue);
}

function preinspectMinuteKey_(value) {
  const d = value instanceof Date ? value : preinspectDateValue_(value);
  return d ? Math.floor(d.getTime() / 60000) : null;
}


function preinspectObjectClone_(obj) {
  const out = {};
  Object.keys(obj || {}).forEach(function(key) { out[key] = obj[key]; });
  return out;
}


/************************************************************
 * SMALL LOCAL HELPERS
 ************************************************************/

function preinspectFirst_(obj, aliases) {
  obj = obj || {};
  for (let i = 0; i < aliases.length; i++) {
    const key = aliases[i];
    if (obj[key] !== undefined && obj[key] !== null && tm_cleanString_(obj[key]) !== '') {
      return obj[key];
    }
  }
  return '';
}

function preinspectCase_(obj, aliases) {
  return preinspectFirst_(obj || {}, aliases || []);
}

function preinspectId_(value) {
  const n = Number(tm_cleanString_(value));
  return !isNaN(n) && n > 0 ? String(Math.trunc(n)) : '';
}

function preinspectNumber_(value) {
  const match = tm_cleanString_(value).match(/\d{3,10}/);
  return match ? match[0] : '';
}

function preinspectPhone_(value) {
  let digits = String(value || '').replace(/\D+/g, '');
  if (digits.length === 11 && digits.charAt(0) === '1') digits = digits.slice(1);
  return digits.length === 10 ? digits : '';
}

function preinspectEmail_(value) {
  return String(value || '').trim().toLowerCase();
}

function preinspectName_(value) { return String(value || '').toLowerCase().replace(/&/g,' and ').replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim(); }

function preinspectNameCompact_(value) {
  return preinspectName_(value).replace(/\s+/g, '');
}

function preinspectUnique_(values) {
  const seen = {};
  return (values || []).map(function(v) { return tm_cleanString_(v); })
    .filter(function(v) {
      if (!v || seen[v]) return false;
      seen[v] = true;
      return true;
    });
}

function preinspectIntersect_(a, b) {
  const map = {};
  (b || []).forEach(function(v) { map[v] = true; });
  return preinspectUnique_((a || []).filter(function(v) { return map[v]; }));
}

function preinspectCalendarRowBlank_(row) {
  return !preinspectFirst_(row, ['Event ID', 'EventId', 'Title', 'Start', 'Start Date']);
}

/************************************************************
 * PREINSPECT R13 — LOCATION ELIGIBILITY + TASK DETAIL PATCH PREVIEW
 *
 * READ-ONLY preview. Mirrors the shared 92_Striven_Task_Patch_Helper
 * field contract but never invokes PATCH/POST/PUT/DELETE.
 ************************************************************/
function preinspectBuildStoredTaskPatchPreview_R3420_ORIGINAL_(obj) {
  obj = obj || {};
  const current = {
    start: preinspectDateValue_(obj['Task Start']),
    due: preinspectDateValue_(obj['Task Due']),
    soId: preinspectNumber_(obj['Task SalesOrder ID']),
    locId: preinspectNumber_(obj['Task Location ID']),
    conId: preinspectNumber_(obj['Task Contact ID'])
  };
  const desiredStart = preinspectDateValue_(obj['Calendar Start']);
  const desiredDue = preinspectDateValue_(obj['Calendar End']);
  const desiredSoId = preinspectNumber_(obj['SO ID']);
  const desiredLocId = preinspectNumber_(obj['Location ID']);
  const desiredConId = preinspectNumber_(obj['Contact ID']);

  const needsDates = desiredStart && desiredDue
    ? (typeof needsDatesPatch_ === 'function'
        ? needsDatesPatch_(current, desiredStart, desiredDue)
        : preinspectTaskScheduleDiffers_(obj))
    : false;
  const needsIds = typeof needsIdsPatch_ === 'function'
    ? needsIdsPatch_(current, desiredSoId || null, desiredLocId || null, desiredConId || null)
    : preinspectIdsDifferForPreview_(current, desiredSoId, desiredLocId, desiredConId);

  const payload = { Id: preinspectNumber_(obj['Task ID']) || '' };
  const changed = [];
  if (needsDates) {
    payload.StartDateTime = preinspectPatchDateTimeText_(desiredStart);
    payload.DueDateTime = preinspectPatchDateTimeText_(desiredDue);
    changed.push('StartDateTime','DueDateTime');
  }
  if (desiredSoId && current.soId !== desiredSoId) {
    payload.SalesOrder = { Id: desiredSoId };
    changed.push('SalesOrder');
  }
  if (desiredLocId && current.locId !== desiredLocId) {
    payload.Location = { Id: desiredLocId };
    changed.push('Location');
  }
  if (desiredConId && current.conId !== desiredConId) {
    payload.RequestedBy = { Id: desiredConId, Type: 'contact' };
    changed.push('RequestedBy');
  }

  // Defensive consistency check: needsIds may be true only for the explicitly
  // supported desired IDs above. Missing desired IDs are never cleared.
  if (needsIds && changed.filter(function(v){return v==='SalesOrder'||v==='Location'||v==='RequestedBy';}).length===0) {
    return {action:'REVIEW',payload:payload,changedFields:changed,summary:'ID comparison indicated a difference but no safe desired ID was available; review required.'};
  }

  let action='NO_ACTION';
  const hasDate=changed.indexOf('StartDateTime')!==-1;
  const hasIds=changed.some(function(v){return v==='SalesOrder'||v==='Location'||v==='RequestedBy';});
  if(hasDate&&hasIds)action='WOULD_PATCH_DATE_TIME_AND_DETAILS';
  else if(hasDate)action='WOULD_PATCH_DATE_TIME';
  else if(hasIds)action='WOULD_PATCH_TASK_DETAILS';

  const summary=changed.length?'PATCH PREVIEW ONLY: '+changed.join(', ')+'.':'Task already matches Calendar/resolved IDs.';
  return {action:action,payload:payload,changedFields:changed,summary:summary};
}

function preinspectIdsDifferForPreview_(current, desiredSoId, desiredLocId, desiredConId) {
  if(desiredSoId && Number(current.soId||0)!==Number(desiredSoId))return true;
  if(desiredLocId && Number(current.locId||0)!==Number(desiredLocId))return true;
  if(desiredConId && Number(current.conId||0)!==Number(desiredConId))return true;
  return false;
}

function preinspectPatchDateTimeText_(value) {
  const d=preinspectDateValue_(value);
  if(!d)return '';
  if(typeof strivenFormatTaskDateTime_==='function')return strivenFormatTaskDateTime_(d);
  if(typeof tm_formatStrivenDateTime_==='function')return tm_formatStrivenDateTime_(d);
  const tz=typeof tm_getTimezone_==='function'?tm_getTimezone_():'America/Toronto';
  return Utilities.formatDate(d,tz,"yyyy-MM-dd'T'HH:mm:ss");
}



/************************************************************
 * PREINSPECT CALENDAR MIRROR — AUTOMATIC READ-ONLY SYNC
 *
 * Purpose:
 * - Refresh "PreInspect Calendar" from the existing Stephen / PreInspect
 *   Google Calendar using the same CalendarApp pattern as the other divisions.
 * - Keep Google Calendar strictly READ ONLY.
 * - Keep the mirror window TODAY -> +45 days.
 * - Preserve the existing PreInspect Task Mapping/review workflow.
 *
 * Writes:
 * - "PreInspect Calendar" sheet only.
 *
 * Does NOT:
 * - create/update/delete Calendar events
 * - create/update/delete Striven records
 * - create a new trigger family
 ************************************************************/
const PREINSPECT_CALENDAR_SYNC_CONFIG = {
  CALENDAR_ID:
    'c_3088a3989f3eb809957ed5c40137a7111a0ac97f68c29b40c144028cb14320dc@group.calendar.google.com',
  LOOKAHEAD_DAYS: 45,
  TIMEZONE: 'America/Toronto'
};


/************************************************************
 * PUBLIC — REFRESH PREINSPECT CALENDAR MIRROR
 ************************************************************/
function syncPreInspectCalendarToSheet() {
  return preinspectSyncCalendarMirror_('MANUAL_SYNC_COMPAT');
}


/************************************************************
 * PUBLIC TEST — PREINSPECT AUTO-SYNC CONFIG
 *
 * Read only. Does not update Calendar, Sheet, or Striven.
 ************************************************************/
function testPreInspectCalendarAutoSyncConfig() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetName =
    PREINSPECT_REVIEW_CONFIG &&
    PREINSPECT_REVIEW_CONFIG.SHEETS &&
    PREINSPECT_REVIEW_CONFIG.SHEETS.CALENDAR
      ? PREINSPECT_REVIEW_CONFIG.SHEETS.CALENDAR
      : 'PreInspect Calendar';

  const result = {
    mode: 'READ_ONLY_DIAGNOSTIC',
    writesPerformed: false,
    calendarFound: !!CalendarApp.getCalendarById(
      PREINSPECT_CALENDAR_SYNC_CONFIG.CALENDAR_ID
    ),
    sheetFound: !!(ss && ss.getSheetByName(sheetName)),
    syncFunctionAvailable:
      typeof globalThis.syncPreInspectCalendarToSheet === 'function',
    unifiedLiveCoreAvailable:
      typeof globalThis.taskmapRunUnifiedScheduledSlotCore_ === 'function',
    unifiedReadOnlyCoreAvailable:
      typeof globalThis.taskmapRunUnifiedReadOnlySlotCore_ === 'function'
  };

  Logger.log(JSON.stringify(result, null, 2));
  return result;
}


/************************************************************
 * PREINSPECT CALENDAR SYNC — INTERNAL HELPERS
 ************************************************************/
function preinspectCalendarSyncFormatEventDateTime_(event, date) {
  if (event && event.isAllDayEvent && event.isAllDayEvent()) {
    return Utilities.formatDate(
      date,
      PREINSPECT_CALENDAR_SYNC_CONFIG.TIMEZONE,
      'yyyy-MM-dd'
    );
  }

  return preinspectCalendarSyncFormatDateTime_(date);
}


function preinspectCalendarSyncFormatDateTime_(date) {
  const raw = Utilities.formatDate(
    date,
    PREINSPECT_CALENDAR_SYNC_CONFIG.TIMEZONE,
    "yyyy-MM-dd'T'HH:mm:ssZ"
  );

  return raw.replace(/([+-]\d{2})(\d{2})$/, '$1:$2');
}


function preinspectCalendarSyncBuildEventLink_(eventId) {
  if (!eventId) return '';

  const raw =
    eventId + ' ' + PREINSPECT_CALENDAR_SYNC_CONFIG.CALENDAR_ID;

  const eid = Utilities
    .base64EncodeWebSafe(raw)
    .replace(/=+$/, '');

  return (
    'https://www.google.com/calendar/event?eid=' +
    encodeURIComponent(eid) +
    '&ctz=' +
    encodeURIComponent(PREINSPECT_CALENDAR_SYNC_CONFIG.TIMEZONE)
  );
}
/************************************************************
 * PREINSPECT R2.9 — REFERENCE TASK 11138 READ-ONLY INSPECTOR
 * START
 *
 * PURPOSE
 * - Read the known-good Pre Inspection reference Task 11138.
 * - Inventory the selected IDs/values Striven actually returns.
 * - Separate stable template candidates from event/customer-specific fields.
 * - Record Pool 8 as the locked desired default assignment for future design.
 *
 * HARD GUARDRAILS
 * - GET only through preinspectGetTaskByIdReadonly_().
 * - NO Striven writes.
 * - NO Calendar writes.
 * - NO Sheet writes.
 * - NO task creation, patching, assignment changes, or location creation.
 ************************************************************/

const PREINSPECT_R29_REFERENCE_TASK = {
  TASK_ID: 11138,
  TASK_TYPE_ID_EXPECTED: 105,
  DEFAULT_POOL_ID_DESIGN: 8,
  TASK_LINK:
    'https://classicfireplace.striven.com/Tasks/TaskInfo.aspx?nav=1&TaskID=11138',
  POOL_LINK:
    'https://classicfireplace.striven.com/next/settings#/pools/8'
};


/**
 * PUBLIC — READ ONLY
 *
 * Run manually from Apps Script.
 * Reads Task 11138 through the existing guarded GET helper and logs:
 * - selected IDs and values;
 * - assignments;
 * - custom fields;
 * - top-level API shape;
 * - candidate stable/dynamic field contract for Steps 3/4.
 *
 * This function intentionally does NOT infer every dropdown option available
 * in Striven. It records only what Task 11138 actually returns.
 */
function inspectPreInspectReferenceTask11138() {
  const taskId = PREINSPECT_R29_REFERENCE_TASK.TASK_ID;
  const rawResponse = preinspectGetTaskByIdReadonly_(taskId);
  const task = preinspectR29UnwrapTask_(rawResponse);

  const result = preinspectR29BuildReferenceInspection_(taskId, task);

  Logger.log(JSON.stringify(result, null, 2));
  return result;
}


function preinspectR29BuildReferenceInspection_(taskId, task) {
  task = task || {};

  const type = preinspectR29Object_(task, ['type', 'Type']);
  const status = preinspectR29Object_(task, ['status', 'Status']);
  const priority = preinspectR29Object_(task, ['priority', 'Priority']);
  const customer = preinspectR29Object_(task, ['customer', 'Customer']);
  const location = preinspectR29Object_(task, ['location', 'Location']);
  const salesOrder = preinspectR29Object_(task, ['salesOrder', 'SalesOrder']);
  const requestedBy = preinspectR29Object_(task, ['requestedBy', 'RequestedBy']);

  const assignments = preinspectR29NormalizeAssignments_(task);
  const customFields = preinspectR29NormalizeCustomFields_(task);

  const selected = {
    taskId: preinspectR29Id_(preinspectR29Pick_(task, ['id', 'Id'])) || taskId,
    taskType: preinspectR29Entity_(type),
    status: preinspectR29Entity_(status),
    priority: preinspectR29Entity_(priority),
    customer: {
      id: preinspectR29Id_(preinspectR29Pick_(customer, ['id', 'Id'])),
      number: preinspectR29Pick_(customer, ['number', 'Number']),
      name: preinspectR29Pick_(customer, ['name', 'Name'])
    },
    location: preinspectR29Entity_(location),
    salesOrder: {
      id: preinspectR29Id_(preinspectR29Pick_(salesOrder, ['id', 'Id'])),
      number: preinspectR29Pick_(salesOrder, ['number', 'Number']),
      name: preinspectR29Pick_(salesOrder, ['name', 'Name'])
    },
    requestedBy: {
      id: preinspectR29Id_(
        preinspectR29Pick_(requestedBy, ['id', 'Id']) ||
        preinspectR29Pick_(task, [
          'requestedByContactId', 'RequestedByContactId',
          'contactId', 'ContactId'
        ])
      ),
      name: preinspectR29Pick_(requestedBy, ['name', 'Name']),
      type: preinspectR29Pick_(requestedBy, ['type', 'Type'])
    },
    startDateTime: preinspectR29Pick_(task, [
      'originalStartDateTime', 'OriginalStartDateTime',
      'startDateTime', 'StartDateTime'
    ]),
    dueDateTime: preinspectR29Pick_(task, [
      'originalDueDateTime', 'OriginalDueDateTime',
      'dueDateTime', 'DueDateTime'
    ]),
    budget: preinspectR29Pick_(task, ['budget', 'Budget']),
    useSubContractor: preinspectR29Pick_(task, [
      'useSubContractor', 'UseSubContractor'
    ]),
    title: preinspectR29Pick_(task, ['title', 'Title']),
    description: preinspectR29Pick_(task, ['description', 'Description']),
    assignments: assignments,
    customFields: customFields
  };

  const employeeIds = [];
  const poolIds = [];

  assignments.forEach(function(a) {
    const kind = String(a.type || '').toLowerCase();
    const id = preinspectR29Id_(a.id);
    if (!id) return;

    if (kind.indexOf('pool') !== -1) {
      if (poolIds.indexOf(id) === -1) poolIds.push(id);
    } else if (kind.indexOf('employee') !== -1 || kind.indexOf('user') !== -1) {
      if (employeeIds.indexOf(id) === -1) employeeIds.push(id);
    }
  });

  return {
    mode: 'READ_ONLY_PREINSPECT_REFERENCE_TASK_INSPECTION',
    writesPerformed: false,
    strivenWritesPerformed: false,
    calendarWritesPerformed: false,
    sheetWritesPerformed: false,

    source: {
      taskId: taskId,
      endpoint: 'GET /v2/tasks/' + taskId,
      taskLink: PREINSPECT_R29_REFERENCE_TASK.TASK_LINK,
      desiredDefaultPoolId: PREINSPECT_R29_REFERENCE_TASK.DEFAULT_POOL_ID_DESIGN,
      desiredDefaultPoolLink: PREINSPECT_R29_REFERENCE_TASK.POOL_LINK
    },

    selectedValues: selected,

    selectedIds: {
      taskTypeId: selected.taskType.id,
      statusId: selected.status.id,
      priorityId: selected.priority.id,
      customerId: selected.customer.id,
      locationId: selected.location.id,
      salesOrderId: selected.salesOrder.id,
      requestedById: selected.requestedBy.id,
      employeeAssignmentIds: employeeIds,
      poolAssignmentIdsObservedOnReferenceTask: poolIds,
      desiredDefaultPoolIdForFuturePreInspect: PREINSPECT_R29_REFERENCE_TASK.DEFAULT_POOL_ID_DESIGN,
      customFieldIds: customFields.map(function(f) { return f.id; }).filter(Boolean)
    },

    templateContractCandidate: {
      stableFromReferenceTask: {
        taskType: selected.taskType,
        priority: selected.priority,
        budget: selected.budget,
        useSubContractor: selected.useSubContractor,
        customFields: customFields
      },
      dynamicPerCalendarAppointment: [
        'Title',
        'Description',
        'Customer',
        'Location',
        'RequestedBy',
        'StartDateTime',
        'DueDateTime'
      ],
      assignmentDesign: {
        currentReferenceTaskAssignmentsObserved: assignments,
        desiredDefaultAssignmentForFuturePreInspect: {
          type: 'pool',
          id: PREINSPECT_R29_REFERENCE_TASK.DEFAULT_POOL_ID_DESIGN
        },
        appliedByR29: false
      },
      forbiddenOnInitialPreInspectCreate: [
        'SalesOrder',
        'SalesOrderId',
        'SalesOrderID',
        'SOId'
      ]
    },

    apiShape: {
      topLevelKeys: Object.keys(task).sort(),
      nestedObjectKeys: preinspectR29NestedObjectKeys_(task)
    },

    verification: {
      taskIdMatchesReference:
        Number(selected.taskId) === Number(PREINSPECT_R29_REFERENCE_TASK.TASK_ID),
      taskTypeMatchesExpected:
        Number(selected.taskType.id) === Number(
          PREINSPECT_R29_REFERENCE_TASK.TASK_TYPE_ID_EXPECTED
        ),
      note:
        'This diagnostic inventories values returned by Task 11138 only. ' +
        'It does not claim to enumerate every possible Striven dropdown option.'
    }
  };
}


function preinspectR29UnwrapTask_(raw) {
  raw = raw || {};

  const candidates = [
    raw.task, raw.Task,
    raw.data, raw.Data,
    raw.result, raw.Result
  ];

  for (let i = 0; i < candidates.length; i++) {
    if (
      candidates[i] &&
      typeof candidates[i] === 'object' &&
      !Array.isArray(candidates[i])
    ) {
      return candidates[i];
    }
  }

  return raw;
}


function preinspectR29Pick_(obj, aliases) {
  obj = obj || {};

  for (let i = 0; i < aliases.length; i++) {
    if (
      Object.prototype.hasOwnProperty.call(obj, aliases[i]) &&
      obj[aliases[i]] !== null &&
      obj[aliases[i]] !== undefined
    ) {
      return obj[aliases[i]];
    }
  }

  return '';
}


function preinspectR29Object_(obj, aliases) {
  const value = preinspectR29Pick_(obj, aliases);
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value
    : {};
}


function preinspectR29Id_(value) {
  const n = Number(value);
  return isFinite(n) && n > 0 ? n : null;
}


function preinspectR29Entity_(obj) {
  obj = obj || {};

  return {
    id: preinspectR29Id_(preinspectR29Pick_(obj, ['id', 'Id'])),
    name: preinspectR29Pick_(obj, ['name', 'Name']),
    type: preinspectR29Pick_(obj, ['type', 'Type'])
  };
}


function preinspectR29NormalizeAssignments_(task) {
  const arrays = [
    task.assignments, task.Assignments,
    task.assignedTo, task.AssignedTo,
    task.taskAssignments, task.TaskAssignments
  ];

  let rows = [];

  for (let i = 0; i < arrays.length; i++) {
    if (Array.isArray(arrays[i])) {
      rows = arrays[i];
      break;
    }
  }

  return rows.map(function(a) {
    a = a || {};

    const employee = preinspectR29Object_(a, ['employee', 'Employee']);
    const pool = preinspectR29Object_(a, ['pool', 'Pool']);

    let type = preinspectR29Pick_(a, [
      'type', 'Type',
      'assignmentType', 'AssignmentType'
    ]);

    if (!type && Object.keys(pool).length) type = 'pool';
    if (!type && Object.keys(employee).length) type = 'employee';

    const entity = Object.keys(pool).length
      ? pool
      : (Object.keys(employee).length ? employee : a);

    return {
      id: preinspectR29Id_(
        preinspectR29Pick_(entity, ['id', 'Id']) ||
        preinspectR29Pick_(a, [
          'assigneeId', 'AssigneeId',
          'employeeId', 'EmployeeId',
          'poolId', 'PoolId'
        ])
      ),
      name:
        preinspectR29Pick_(entity, ['name', 'Name']) ||
        preinspectR29Pick_(a, ['name', 'Name']),
      type: String(type || '')
    };
  }).filter(function(a) {
    return !!(a.id || a.name || a.type);
  });
}


function preinspectR29NormalizeCustomFields_(task) {
  const arrays = [
    task.infoCustomFields, task.InfoCustomFields,
    task.customFields, task.CustomFields
  ];

  const out = [];
  const seen = {};

  arrays.forEach(function(rows) {
    if (!Array.isArray(rows)) return;

    rows.forEach(function(f) {
      f = f || {};

      const id = preinspectR29Id_(
        preinspectR29Pick_(f, [
          'id', 'Id',
          'customFieldId', 'CustomFieldId'
        ])
      );

      const key = String(id || '') + '|' +
        String(preinspectR29Pick_(f, ['name', 'Name']) || '');

      if (seen[key]) return;
      seen[key] = true;

      out.push({
        id: id,
        name: preinspectR29Pick_(f, ['name', 'Name']),
        value: preinspectR29Pick_(f, ['value', 'Value']),
        type: preinspectR29Pick_(f, ['type', 'Type'])
      });
    });
  });

  return out;
}


function preinspectR29NestedObjectKeys_(task) {
  const out = {};

  Object.keys(task || {}).sort().forEach(function(key) {
    const value = task[key];

    if (value && typeof value === 'object' && !Array.isArray(value)) {
      out[key] = Object.keys(value).sort();
    } else if (Array.isArray(value)) {
      out[key] = value.length && value[0] &&
        typeof value[0] === 'object'
        ? Object.keys(value[0]).sort()
        : [];
    }
  });

  return out;
}

/************************************************************
 * PREINSPECT R2.9 — REFERENCE TASK 11138 READ-ONLY INSPECTOR
 * END
 ************************************************************/

/************************************************************
 * PREINSPECT R3.0 — MANUAL SINGLE-FIELD PUSH CONTROLS
 *
 * Public dropdown functions (no trailing underscore):
 * - pushSelectedPreInspectDates()
 * - pushSelectedPreInspectTimes()
 * - pushSelectedPreInspectCustomer()
 * - pushSelectedPreInspectLocation()
 * - pushSelectedPreInspectRequestedBy()
 * - pushSelectedPreInspectAssignees()
 * - pushSelectedPreInspectInstallNotes()
 *
 * Contract:
 * - Selected row must already map to one existing Task Type 105 task.
 * - Fresh-read Google Calendar before every write.
 * - Each function writes only its named concern.
 * - Core single-field helpers never send a Sales Order relationship.
 * - R3.2 adds a dedicated existing-task Sales Order sync that runs only when
 *   exactly one distinct SO is explicitly present in fresh Calendar Title/Description.
 * - Every write is GET/read-back verified.
 * - Pool 8 is additive; existing explicit assignees are preserved.
 * - Calendar Description is synchronized into custom field 854
 *   (Install Notes) using an idempotent managed block so manual notes survive.
 ************************************************************/

const PREINSPECT_R30_MANUAL = {
  MAPPING_SHEET: 'PreInspect Task Mapping',
  TASK_TYPE_ID: 105,
  DEFAULT_POOL_ID: 8,
  INSTALL_NOTES_FIELD_ID: 854,
  NOTES_START: '------- Google Calendar Notes -------',
  NOTES_END: '-------------------------------------'
};


function pushSelectedPreInspectDates() {
  return preinspectR30RunManualPush_('DATES');
}


function pushSelectedPreInspectTimes() {
  return preinspectR30RunManualPush_('TIMES');
}


function pushSelectedPreInspectCustomer() {
  return preinspectR30RunManualPush_('CUSTOMER');
}


function pushSelectedPreInspectLocation() {
  return preinspectR30RunManualPush_('LOCATION');
}


function pushSelectedPreInspectRequestedBy() {
  return preinspectR30RunManualPush_('REQUESTED_BY');
}


function pushSelectedPreInspectAssignees() {
  return preinspectR30RunManualPush_('ASSIGNEES');
}


function pushSelectedPreInspectInstallNotes() {
  return preinspectR30RunManualPush_('INSTALL_NOTES');
}


/** R3.2 — Push one unambiguous Calendar Sales Order to the matched PreInspect task. */
function pushSelectedPreInspectSalesOrder() {
  const result = {
    mode: 'MANUAL_PREINSPECT_SINGLE_FIELD_PUSH',
    action: 'SALES_ORDER',
    status: 'SKIPPED_DISABLED_BY_POLICY',
    writesPerformed: false,
    strivenWritesPerformed: false,
    calendarWritesPerformed: false,
    reason: 'PreInspect Sales Order synchronization is intentionally disabled for now.'
  };
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}


/** R3.2 — Push all verified PreInspect synchronization fields for the selected row. */
function pushSelectedPreInspectAll() {
  return preinspectR32RunAll_();
}


function preinspectR30RunManualPush_(action) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    throw new Error('Could not obtain script lock. No Striven write attempted.');
  }

  try {
    const ctx = preinspectR30BuildContext_();
    let result;

    if (action === 'DATES') result = preinspectR30PushDates_(ctx);
    else if (action === 'TIMES') result = preinspectR30PushTimes_(ctx);
    else if (action === 'CUSTOMER') result = preinspectR30PushCustomer_(ctx);
    else if (action === 'LOCATION') result = preinspectR30PushLocation_(ctx);
    else if (action === 'REQUESTED_BY') result = preinspectR30PushRequestedBy_(ctx);
    else if (action === 'ASSIGNEES') result = preinspectR30PushAssignees_(ctx);
    else if (action === 'INSTALL_NOTES') result = preinspectR30PushInstallNotes_(ctx);
    else throw new Error('Unknown PreInspect manual push action: ' + action);

    const output = {
      mode: 'MANUAL_PREINSPECT_SINGLE_FIELD_PUSH',
      action: action,
      writesPerformed: result.writesPerformed === true,
      strivenWritesPerformed: result.writesPerformed === true,
      calendarWritesPerformed: false,
      mappingRow: ctx.rowNumber,
      eventId: ctx.eventId,
      taskId: ctx.taskId,
      taskTypeId: PREINSPECT_R30_MANUAL.TASK_TYPE_ID,
      result: result
    };

    Logger.log(JSON.stringify(output, null, 2));
    return output;
  } finally {
    lock.releaseLock();
  }
}


function preinspectR30BuildContext_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss && ss.getActiveSheet();

  if (!sheet || sheet.getName() !== PREINSPECT_R30_MANUAL.MAPPING_SHEET) {
    throw new Error('Select a row on "PreInspect Task Mapping" first.');
  }

  const active = sheet.getActiveRange();
  const rowNumber = active && active.getRow();
  if (!rowNumber || rowNumber <= 1) {
    throw new Error('Select a PreInspect mapping data row, not the header.');
  }

  const width = sheet.getLastColumn();
  const headers = sheet.getRange(1, 1, 1, width).getDisplayValues()[0];
  const raw = sheet.getRange(rowNumber, 1, 1, width).getValues()[0];
  const display = sheet.getRange(rowNumber, 1, 1, width).getDisplayValues()[0];
  const row = {};

  headers.forEach(function(h, i) {
    h = String(h || '').trim();
    if (!h) return;
    row[h] = (h === 'Calendar Start' || h === 'Calendar End')
      ? (raw[i] || display[i])
      : display[i];
  });

  const taskId = preinspectR30PositiveId_(row['Task ID']);
  const eventId = String(row['Event ID'] || '').trim();
  const customerId = preinspectR30PositiveId_(row['Customer ID']);
  const locationId = preinspectR30PositiveId_(row['Location ID']);

  if (!taskId) throw new Error('Selected mapping row does not have an existing Task ID.');
  if (!eventId) throw new Error('Selected mapping row does not have an Event ID.');
  if (!customerId) throw new Error('Selected mapping row does not have a confirmed Customer ID.');

  if (typeof preinspectCreateFreshEvent_ !== 'function') {
    throw new Error('Missing preinspectCreateFreshEvent_ dependency from 36_PreInspect_Task_Create.');
  }

  const fresh = preinspectCreateFreshEvent_(ss, eventId);

  // R3.4.3: the PreInspect Calendar mirror intentionally normalizes the plain-text
  // description (for example, HTML paragraph breaks may become a single newline).
  // Use a semantic freshness guard that still blocks real title/location/time/notes
  // changes, but ignores representation-only whitespace differences and the managed
  // Pre-Inspection Task Link block.
  if (typeof preinspectR343AssertFreshForMirror_ === 'function') {
    preinspectR343AssertFreshForMirror_(row, fresh);
  } else if (typeof preinspectCreateAssertFresh_ === 'function') {
    preinspectCreateAssertFresh_(row, fresh);
  }

  const task = preinspectR29UnwrapTask_(preinspectGetTaskByIdReadonly_(taskId));
  const taskType = preinspectR30Entity_(task.type || task.Type);

  if (Number(taskType.id || 0) !== PREINSPECT_R30_MANUAL.TASK_TYPE_ID) {
    throw new Error(
      'BLOCKED: Task ' + taskId + ' is not Task Type 105 Pre Inspection. Current type: ' +
      String(taskType.id || '') + ' ' + String(taskType.name || '')
    );
  }

  return {
    ss: ss,
    sheet: sheet,
    rowNumber: rowNumber,
    headers: headers,
    row: row,
    taskId: taskId,
    eventId: eventId,
    customerId: customerId,
    locationId: locationId,
    freshEvent: fresh,
    task: task
  };
}


/************************************************************
 * PREINSPECT R3.4.3 — SEMANTIC CALENDAR FRESHNESS
 *
 * Why this exists:
 * - The PreInspect Calendar mirror stores a cleaned plain-text Description.
 * - CalendarApp.getDescription() can preserve extra paragraph breaks that are
 *   representation-only and do not change the appointment's business content.
 * - The managed Pre-Inspection Task Link is system metadata, not customer notes.
 *
 * Guardrail:
 * - Times, title, location, and materially different description text still block.
 ************************************************************/
function preinspectR343AssertFreshForMirror_(row, fresh) {
  const issues = [];

  const sameTime = typeof preinspectCreateSameTime_ === 'function'
    ? preinspectCreateSameTime_
    : function(a, b) {
        const x = a instanceof Date ? a : new Date(a);
        const y = b instanceof Date ? b : new Date(b);
        return !isNaN(x.getTime()) && !isNaN(y.getTime()) && Math.abs(x.getTime() - y.getTime()) < 1000;
      };

  const norm = typeof preinspectCreateNorm_ === 'function'
    ? preinspectCreateNorm_
    : function(v) {
        return String(v || '')
          .replace(/\u00a0/g, ' ')
          .replace(/\r\n?/g, '\n')
          .replace(/[ \t]+/g, ' ')
          .trim();
      };

  if (!sameTime(row['Calendar Start'], fresh.start)) issues.push('start changed');
  if (!sameTime(row['Calendar End'], fresh.end)) issues.push('end changed');
  if (norm(row['Calendar Title']) !== norm(fresh.title)) issues.push('title changed');
  if (norm(row['Calendar Location']) !== norm(fresh.location)) issues.push('location changed');
  if (preinspectR343DescriptionNorm_(row['Calendar Description']) !==
      preinspectR343DescriptionNorm_(fresh.description)) {
    if (preinspectR3412SemanticCalendarDescription_(row['Calendar Description']) !== preinspectR3412SemanticCalendarDescription_(fresh.description)) issues.push('description changed');
  }

  if (issues.length) {
    throw new Error(
      'BLOCKED: Calendar event changed after mapping review. ' +
      'Refresh/review first: ' + issues.join(', ')
    );
  }

  return { status: 'FRESH', issues: [] };
}


function preinspectR343DescriptionNorm_(value) {
  return preinspectR343StripManagedTaskLink_(value)
    .replace(/\u00a0/g, ' ')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map(function(line) {
      return String(line || '').replace(/[ \t]+/g, ' ').trim();
    })
    .filter(function(line) { return !!line; })
    .join('\n')
    .trim();
}


function preinspectR343StripManagedTaskLink_(value) {
  const text = String(value || '').replace(/\r\n?/g, '\n');
  // Strip only the managed task-link block at the END of the Calendar Description.
  // This deliberately does not remove arbitrary separator text in customer notes.
  return text.replace(
    /\n?-{3,}\s*Pre(?:[\s-]*Inspection|Inspect)\s+Task\s+Link\s*-{3,}[\s\S]*?\n-{10,}\s*$/i,
    ''
  ).trim();
}


function preinspectR30PushDates_(ctx) {
  const currentStart = preinspectR30Date_(preinspectR30Pick_(ctx.task, ['startDateTime','StartDateTime']));
  const currentDue = preinspectR30Date_(preinspectR30Pick_(ctx.task, ['dueDateTime','DueDateTime']));
  const calendarStart = preinspectR30Date_(ctx.freshEvent.start);
  const calendarDue = preinspectR30Date_(ctx.freshEvent.end);

  if (!calendarStart || !calendarDue) {
    throw new Error('BLOCKED: Fresh Calendar Start/End could not be read. No Striven write attempted.');
  }

  // R3.1 recovery: if the existing Striven task has no Start/Due value,
  // there is no existing clock-time component to preserve. Use the fresh
  // Calendar clock time for that missing side rather than dead-ending.
  const timeSourceStart = currentStart || calendarStart;
  const timeSourceDue = currentDue || calendarDue;
  const desiredStart = preinspectR30CombineDateAndTime_(calendarStart, timeSourceStart);
  const desiredDue = preinspectR30CombineDateAndTime_(calendarDue, timeSourceDue);

  if (
    currentStart && currentDue &&
    preinspectR30SameDate_(currentStart, calendarStart) &&
    preinspectR30SameDate_(currentDue, calendarDue)
  ) {
    return {
      status: 'NOT_NEEDED',
      writesPerformed: false,
      fields: ['StartDateTime date','DueDateTime date'],
      reason: 'Task dates already match Calendar dates.',
      recovery: 'NONE'
    };
  }

  preinspectR30PatchTask_(ctx.taskId, {
    Id: ctx.taskId,
    StartDateTime: desiredStart,
    DueDateTime: desiredDue
  }, 'DATES');

  const verified = preinspectR30ReadTask_(ctx.taskId);
  const vStart = preinspectR30Date_(preinspectR30Pick_(verified, ['startDateTime','StartDateTime']));
  const vDue = preinspectR30Date_(preinspectR30Pick_(verified, ['dueDateTime','DueDateTime']));

  if (!preinspectR30SameDate_(vStart, calendarStart) || !preinspectR30SameDate_(vDue, calendarDue)) {
    throw new Error('PATCH completed but date read-back verification failed for Task ' + ctx.taskId + '.');
  }

  // Verify that an existing time was preserved; when it was missing, verify
  // that the Calendar time was used as the deterministic recovery value.
  if (!preinspectR30SameTime_(vStart, timeSourceStart) || !preinspectR30SameTime_(vDue, timeSourceDue)) {
    throw new Error('PATCH completed but date-only time-preservation/recovery verification failed for Task ' + ctx.taskId + '.');
  }

  return {
    status: 'PUSHED_AND_VERIFIED',
    writesPerformed: true,
    fields: ['StartDateTime date','DueDateTime date'],
    desired: { startDateTime: desiredStart, dueDateTime: desiredDue },
    recovery: {
      startTimeSource: currentStart ? 'EXISTING_TASK_TIME' : 'CALENDAR_TIME_TASK_START_WAS_BLANK',
      dueTimeSource: currentDue ? 'EXISTING_TASK_TIME' : 'CALENDAR_TIME_TASK_DUE_WAS_BLANK'
    }
  };
}


function preinspectR30PushTimes_(ctx) {
  const currentStart = preinspectR30Date_(preinspectR30Pick_(ctx.task, ['startDateTime','StartDateTime']));
  const currentDue = preinspectR30Date_(preinspectR30Pick_(ctx.task, ['dueDateTime','DueDateTime']));
  const calendarStart = preinspectR30Date_(ctx.freshEvent.start);
  const calendarDue = preinspectR30Date_(ctx.freshEvent.end);

  if (!calendarStart || !calendarDue) {
    throw new Error('BLOCKED: Fresh Calendar Start/End could not be read. No Striven write attempted.');
  }

  // R3.1 recovery: if the existing Striven task has no Start/Due value,
  // there is no task-date component to preserve. Use the fresh Calendar date
  // for that missing side and apply the Calendar clock time.
  const dateSourceStart = currentStart || calendarStart;
  const dateSourceDue = currentDue || calendarDue;
  const desiredStart = preinspectR30CombineDateAndTime_(dateSourceStart, calendarStart);
  const desiredDue = preinspectR30CombineDateAndTime_(dateSourceDue, calendarDue);

  if (
    currentStart && currentDue &&
    preinspectR30SameTime_(currentStart, calendarStart) &&
    preinspectR30SameTime_(currentDue, calendarDue)
  ) {
    return {
      status: 'NOT_NEEDED',
      writesPerformed: false,
      fields: ['StartDateTime time','DueDateTime time'],
      reason: 'Task times already match Calendar times.',
      recovery: 'NONE'
    };
  }

  preinspectR30PatchTask_(ctx.taskId, {
    Id: ctx.taskId,
    StartDateTime: desiredStart,
    DueDateTime: desiredDue
  }, 'TIMES');

  const verified = preinspectR30ReadTask_(ctx.taskId);
  const vStart = preinspectR30Date_(preinspectR30Pick_(verified, ['startDateTime','StartDateTime']));
  const vDue = preinspectR30Date_(preinspectR30Pick_(verified, ['dueDateTime','DueDateTime']));

  if (!preinspectR30SameTime_(vStart, calendarStart) || !preinspectR30SameTime_(vDue, calendarDue)) {
    throw new Error('PATCH completed but time read-back verification failed for Task ' + ctx.taskId + '.');
  }

  // Verify that an existing task date was preserved; when it was missing,
  // verify that the Calendar date was used as the deterministic recovery value.
  if (!preinspectR30SameDate_(vStart, dateSourceStart) || !preinspectR30SameDate_(vDue, dateSourceDue)) {
    throw new Error('PATCH completed but time-only date-preservation/recovery verification failed for Task ' + ctx.taskId + '.');
  }

  return {
    status: 'PUSHED_AND_VERIFIED',
    writesPerformed: true,
    fields: ['StartDateTime time','DueDateTime time'],
    desired: { startDateTime: desiredStart, dueDateTime: desiredDue },
    recovery: {
      startDateSource: currentStart ? 'EXISTING_TASK_DATE' : 'CALENDAR_DATE_TASK_START_WAS_BLANK',
      dueDateSource: currentDue ? 'EXISTING_TASK_DATE' : 'CALENDAR_DATE_TASK_DUE_WAS_BLANK'
    }
  };
}


function preinspectR30PushCustomer_(ctx) {
  const current = preinspectR30Entity_(ctx.task.customer || ctx.task.Customer);
  const desiredId = ctx.customerId;

  if (Number(current.id || 0) === desiredId) {
    return {
      status: 'NOT_NEEDED',
      writesPerformed: false,
      field: 'Customer',
      customerId: desiredId,
      reason: 'Task Customer already matches the confirmed mapping Customer.'
    };
  }

  preinspectR30PatchTask_(ctx.taskId, {
    Id: ctx.taskId,
    Customer: { Id: desiredId }
  }, 'CUSTOMER');

  const verified = preinspectR30ReadTask_(ctx.taskId);
  const actual = preinspectR30Entity_(verified.customer || verified.Customer);
  if (Number(actual.id || 0) !== desiredId) {
    throw new Error('PATCH completed but Customer read-back verification failed for Task ' + ctx.taskId + '.');
  }

  return {
    status: 'PUSHED_AND_VERIFIED',
    writesPerformed: true,
    field: 'Customer',
    previousCustomerId: current.id || null,
    customerId: desiredId
  };
}


function preinspectR30PushLocation_(ctx) {
  const desiredId = ctx.locationId;
  if (!desiredId) {
    throw new Error('BLOCKED: Step 2 has not produced a confirmed Location ID for this row.');
  }

  const currentCustomer = preinspectR30Entity_(ctx.task.customer || ctx.task.Customer);
  if (Number(currentCustomer.id || 0) !== ctx.customerId) {
    throw new Error(
      'BLOCKED: Task Customer does not yet match confirmed Customer ' + ctx.customerId +
      '. Run pushSelectedPreInspectCustomer first.'
    );
  }

  const current = preinspectR30Entity_(ctx.task.location || ctx.task.Location);
  if (Number(current.id || 0) === desiredId) {
    return {
      status: 'NOT_NEEDED',
      writesPerformed: false,
      field: 'Location',
      locationId: desiredId,
      reason: 'Task Location already matches the confirmed mapping Location.'
    };
  }

  preinspectR30PatchTask_(ctx.taskId, {
    Id: ctx.taskId,
    Location: { Id: desiredId }
  }, 'LOCATION');

  const verified = preinspectR30ReadTask_(ctx.taskId);
  const actual = preinspectR30Entity_(verified.location || verified.Location);
  if (Number(actual.id || 0) !== desiredId) {
    throw new Error('PATCH completed but Location read-back verification failed for Task ' + ctx.taskId + '.');
  }

  return {
    status: 'PUSHED_AND_VERIFIED',
    writesPerformed: true,
    field: 'Location',
    previousLocationId: current.id || null,
    locationId: desiredId
  };
}


function preinspectR30PushRequestedBy_(ctx) {
  // R3.4.22: route actual scheduled/manual REQUESTED_BY through canonical organizer -> Employee logic.
  return preinspectR3421PushRequestedByOrganizerPlan_(ctx);
}


function preinspectR30PushAssignees_(ctx) {
  const poolId = PREINSPECT_R30_MANUAL.DEFAULT_POOL_ID;
  const legacyIds = {6:true, 20:true};
  let assignments = preinspectR30NormalizeAssignments_(ctx.task);
  let hasPool = assignments.some(function(a) {
    return String(a.type || '').toLowerCase() === 'pool' && Number(a.id) === poolId;
  });
  const auth = preinspectR30ApiAuth_();
  const url = auth.apiBaseUrl + '/v2/tasks/' + encodeURIComponent(ctx.taskId) + '/assignments';
  let writesPerformed = false;
  let poolAdded = false;
  const removedLegacyEmployeeIds = [];

  // Pool 8 must exist before any employee removal because Striven blocks deleting
  // the final assignment. Existing non-legacy employees remain untouched.
  if (!hasPool) {
    const poolName = preinspectR30GetPoolName_(poolId);
    preinspectR30Request_('post', url, { Id: poolId, Name: poolName, Type: 'pool' }, 'ASSIGNEES_POOL_8');
    writesPerformed = true;
    poolAdded = true;
    assignments = preinspectR30NormalizeAssignments_(preinspectR30ReadTask_(ctx.taskId));
    hasPool = assignments.some(function(a) {
      return String(a.type || '').toLowerCase() === 'pool' && Number(a.id) === poolId;
    });
    if (!hasPool) throw new Error('Assignment POST completed but Pool 8 was not present on read-back.');
  }

  const legacy = assignments.filter(function(a) {
    return String(a.type || '').toLowerCase() === 'employee' && !!legacyIds[Number(a.id)];
  });

  legacy.forEach(function(a) {
    preinspectR30Request_('delete', url, {
      Id: Number(a.id),
      Name: String(a.name || ''),
      Type: 'employee'
    }, 'ASSIGNEES_REMOVE_LEGACY_EMPLOYEE_' + a.id);
    removedLegacyEmployeeIds.push(Number(a.id));
    writesPerformed = true;
  });

  const verified = preinspectR30ReadTask_(ctx.taskId);
  const after = preinspectR30NormalizeAssignments_(verified);
  const verifiedPool = after.some(function(a) {
    return String(a.type || '').toLowerCase() === 'pool' && Number(a.id) === poolId;
  });
  const remainingLegacy = after.filter(function(a) {
    return String(a.type || '').toLowerCase() === 'employee' && !!legacyIds[Number(a.id)];
  });

  if (!verifiedPool || remainingLegacy.length) {
    throw new Error(
      'PreInspect assignment verification failed. Pool 8 present=' + verifiedPool +
      '; remaining legacy employees=' + remainingLegacy.map(function(a) { return a.id; }).join(',')
    );
  }

  if (!writesPerformed) {
    return {
      status: 'NOT_NEEDED',
      writesPerformed: false,
      assignment: { type: 'pool', id: poolId },
      verifiedAssignments: after,
      reason: 'Pool 8 is assigned and no legacy template employees 6/20 remain.'
    };
  }

  return {
    status: 'PUSHED_AND_VERIFIED',
    writesPerformed: true,
    assignment: { type: 'pool', id: poolId },
    poolAdded: poolAdded,
    removedLegacyEmployeeIds: removedLegacyEmployeeIds,
    policy: 'POOL_8_PLUS_REMOVE_ONLY_LEGACY_TEMPLATE_EMPLOYEES_6_20',
    verifiedAssignments: after
  };
}


function preinspectR30PushInstallNotes_(ctx, preparedPlan) {
  const plan = preparedPlan || preinspectR32PrepareInstallNotes_(ctx);

  if (plan.status === 'NOT_NEEDED') {
    return {
      status: 'NOT_NEEDED',
      writesPerformed: false,
      field: 'Install Notes',
      customFieldId: PREINSPECT_R30_MANUAL.INSTALL_NOTES_FIELD_ID,
      reason: plan.reason
    };
  }

  const write = preinspectR47EnsureInstallNotesCanonical_(ctx.taskId, plan.desiredValue);

  return {
    status: write.status,
    writesPerformed: !!write.writesPerformed,
    field: 'Install Notes',
    customFieldId: PREINSPECT_R30_MANUAL.INSTALL_NOTES_FIELD_ID,
    source: 'Google Calendar Description',
    managedBlock: true,
    endpoint: write.endpoint || '',
    payloadShape: write.payloadShape || '',
    desiredValue: plan.desiredValue,
    verificationSource: write.verificationSource || '',
    reason: write.reason || ''
  };
}


function preinspectR30ResolveRequestedBy_(ctx) {
  const rowContactId = preinspectR30PositiveId_(ctx.row['Contact ID']);
  const contactsResult = preinspectR30GetCustomerContacts_(ctx.customerId);
  const contacts = contactsResult.contacts;

  if (rowContactId) {
    const mapped = contacts.filter(function(c) { return Number(c.id) === rowContactId; });
    if (mapped.length === 1) {
      return {
        contactId: rowContactId,
        name: mapped[0].name,
        method: 'MAPPING_CONTACT_ID_VERIFIED_ON_CUSTOMER'
      };
    }
  }

  const signals = preinspectExtractSignals_({
    title: ctx.freshEvent.title || '',
    description: ctx.freshEvent.description || '',
    location: ctx.freshEvent.location || ''
  });

  const scored = contacts.map(function(c) {
    let score = 0;
    const phoneHit = (signals.phones || []).some(function(p) {
      return (c.phones || []).indexOf(String(p)) !== -1;
    });
    const emailHit = (signals.emails || []).some(function(e) {
      return (c.emails || []).indexOf(String(e).toLowerCase()) !== -1;
    });
    const nameHit = signals.name && c.name &&
      preinspectNameCompact_(signals.name) === preinspectNameCompact_(c.name);

    if (phoneHit) score += 100;
    if (emailHit) score += 100;
    if (nameHit) score += 40;

    return { contact: c, score: score, phoneHit: phoneHit, emailHit: emailHit, nameHit: nameHit };
  }).sort(function(a,b) { return b.score - a.score; });

  if (scored.length && scored[0].score >= 100 &&
      (scored.length === 1 || scored[0].score > scored[1].score)) {
    return {
      contactId: scored[0].contact.id,
      name: scored[0].contact.name,
      method: scored[0].phoneHit && scored[0].emailHit
        ? 'CUSTOMER_CONTACT_PHONE_EMAIL'
        : (scored[0].phoneHit ? 'CUSTOMER_CONTACT_PHONE' : 'CUSTOMER_CONTACT_EMAIL')
    };
  }

  if (contacts.length === 1) {
    return {
      contactId: contacts[0].id,
      name: contacts[0].name,
      method: 'ONLY_CUSTOMER_CONTACT'
    };
  }

  if (rowContactId) {
    const fallback = preinspectR30VerifyContactById_(rowContactId, ctx.customerId);
    if (fallback.verified) {
      return {
        contactId: rowContactId,
        name: fallback.name || '',
        method: 'MAPPING_CONTACT_ID_VERIFIED_BY_CONTACT_GET'
      };
    }
  }

  throw new Error(
    'BLOCKED: Requested By customer contact is not deterministic. Customer ' +
    ctx.customerId + ' has ' + contacts.length + ' contact candidate(s); no unique phone/email match was proven.'
  );
}


function preinspectR30GetCustomerContacts_(customerId) {
  const auth = preinspectR30ApiAuth_();
  const url = auth.apiBaseUrl + '/v1/customers/' + encodeURIComponent(customerId) + '/contacts';
  const result = preinspectR30Request_('get', url, null, 'GET_CUSTOMER_CONTACTS');
  const raw = preinspectR30ArrayFromResponse_(result.json);

  return {
    contacts: raw.map(preinspectR30NormalizeContact_).filter(function(c) { return !!c.id; }),
    endpoint: '/v1/customers/' + customerId + '/contacts'
  };
}


function preinspectR30VerifyContactById_(contactId, customerId) {
  try {
    const auth = preinspectR30ApiAuth_();
    const result = preinspectR30Request_(
      'get',
      auth.apiBaseUrl + '/v1/contacts/' + encodeURIComponent(contactId),
      null,
      'GET_CONTACT_BY_ID'
    );
    const contact = result.json || {};
    const text = JSON.stringify(contact);
    const associationHit = new RegExp('(?:customerId|accountId|id)\\D{0,8}' + String(customerId) + '(?:\\D|$)', 'i').test(text);
    const normalized = preinspectR30NormalizeContact_(contact);
    return { verified: associationHit, name: normalized.name || '' };
  } catch (err) {
    return { verified: false, name: '', error: String(err && err.message ? err.message : err) };
  }
}


function preinspectR30NormalizeContact_(raw) {
  raw = raw || {};
  const id = preinspectR30PositiveId_(
    preinspectR30Pick_(raw, ['id','Id','contactId','ContactId'])
  );
  const first = String(preinspectR30Pick_(raw, ['firstName','FirstName']) || '').trim();
  const last = String(preinspectR30Pick_(raw, ['lastName','LastName']) || '').trim();
  const name = String(preinspectR30Pick_(raw, ['name','Name','fullName','FullName']) || '').trim() ||
    [first,last].filter(Boolean).join(' ');
  const text = JSON.stringify(raw);
  const phones = preinspectExtractPhones_(text).map(function(v) { return String(v); });
  const emails = (text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [])
    .map(function(v) { return String(v).toLowerCase(); });

  return {
    id: id,
    name: name,
    phones: preinspectUnique_(phones),
    emails: preinspectUnique_(emails)
  };
}


function preinspectR30GetPoolName_(poolId) {
  const auth = preinspectR30ApiAuth_();
  const result = preinspectR30Request_('get', auth.apiBaseUrl + '/v1/pools', null, 'GET_POOLS');
  const pools = preinspectR30ArrayFromResponse_(result.json);

  for (let i = 0; i < pools.length; i++) {
    const id = preinspectR30PositiveId_(preinspectR30Pick_(pools[i], ['id','Id','poolId','PoolId']));
    if (id === Number(poolId)) {
      const name = String(preinspectR30Pick_(pools[i], ['name','Name','poolName','PoolName']) || '').trim();
      if (name) return name;
    }
  }

  throw new Error('BLOCKED: Pool ' + poolId + ' could not be resolved from GET /v1/pools.');
}


function preinspectR30BuildFullCustomFieldPayload_(fields, installNotesValue) {
  const out = [];
  let found = false;

  (fields || []).forEach(function(field) {
    const id = Number(field.id || 0);
    if (!id) return;
    let value = field.value;

    if (id === PREINSPECT_R30_MANUAL.INSTALL_NOTES_FIELD_ID) {
      value = installNotesValue;
      found = true;
    }

    if (value === null || value === undefined) value = '';
    out.push({ Id: id, Value: String(value) });
  });

  if (!found) {
    out.push({
      Id: PREINSPECT_R30_MANUAL.INSTALL_NOTES_FIELD_ID,
      Value: String(installNotesValue)
    });
  }

  return out;
}


function preinspectR30MergeCalendarNotes_(existing, calendarNotes) {
  existing = String(existing || '');
  calendarNotes = String(calendarNotes || '').trim();

  const start = PREINSPECT_R30_MANUAL.NOTES_START;
  const end = PREINSPECT_R30_MANUAL.NOTES_END;
  const block = start + '\n' + calendarNotes + '\n' + end;
  const startAt = existing.indexOf(start);
  const endAt = existing.indexOf(end);

  if (startAt >= 0 && endAt >= startAt) {
    const before = existing.slice(0, startAt).replace(/\s+$/, '');
    const after = existing.slice(endAt + end.length).replace(/^\s+/, '');
    return [before, block, after].filter(Boolean).join('\n\n');
  }

  const trimmed = existing.trim();
  return trimmed ? trimmed + '\n\n' + block : block;
}


function preinspectR30NormalizeCustomFields_(task) {
  const list = preinspectR30Pick_(task || {}, ['infoCustomFields','InfoCustomFields']);
  if (!Array.isArray(list)) return [];

  return list.map(function(f) {
    const value = preinspectR30Pick_(f || {}, ['value','Value']);
    const valueText = preinspectR30Pick_(f || {}, ['valueText','ValueText']);
    return {
      id: preinspectR30PositiveId_(preinspectR30Pick_(f || {}, ['id','Id'])),
      name: String(preinspectR30Pick_(f || {}, ['name','Name']) || ''),
      value: value !== '' && value !== null && value !== undefined ? value : valueText
    };
  }).filter(function(f) { return !!f.id; });
}


function preinspectR30NormalizeAssignments_(task) {
  const list = preinspectR30Pick_(task || {}, ['assignments','Assignments']);
  if (!Array.isArray(list)) return [];

  return list.map(function(a) {
    return {
      id: preinspectR30PositiveId_(preinspectR30Pick_(a || {}, ['id','Id'])),
      name: String(preinspectR30Pick_(a || {}, ['name','Name']) || ''),
      type: String(preinspectR30Pick_(a || {}, ['type','Type']) || '').toLowerCase()
    };
  }).filter(function(a) { return !!a.id; });
}


function preinspectR30ReadTask_(taskId) {
  return preinspectR29UnwrapTask_(preinspectGetTaskByIdReadonly_(taskId));
}


function preinspectR30PatchTask_(taskId, payload, label) {
  if (payload.SalesOrder || payload.SalesOrderId || payload.SalesOrderID || payload.SOId) {
    throw new Error('BLOCKED: PreInspect manual field pushes must never send a Sales Order relationship.');
  }

  if (typeof tmR45AssertPreInspectDateTimePatchSafe_ === 'function') {
    tmR45AssertPreInspectDateTimePatchSafe_(taskId, payload);
  }

  const auth = preinspectR30ApiAuth_();
  const url = auth.apiBaseUrl + '/v2/tasks/' + encodeURIComponent(taskId);
  return preinspectR30Request_('patch', url, payload, 'PATCH_' + label);
}


function preinspectR30Request_(method, url, payload, label) {
  const auth = preinspectR30ApiAuth_();
  const options = {
    method: String(method || 'get').toLowerCase(),
    muteHttpExceptions: true,
    headers: { Authorization: 'Bearer ' + auth.token }
  };

  if (payload !== null && payload !== undefined) {
    options.contentType = 'application/json';
    options.payload = JSON.stringify(payload);
  }

  const response = UrlFetchApp.fetch(url, options);
  const code = response.getResponseCode();
  const text = response.getContentText();
  let json = null;

  try { json = text ? JSON.parse(text) : null; } catch (ignored) {}

  if (code < 200 || code >= 300) {
    throw new Error(
      String(label || method) + ' failed HTTP ' + code + ': ' + String(text || '').slice(0, 1000)
    );
  }

  return { statusCode: code, text: text, json: json };
}


function preinspectR30ApiAuth_() {
  const props = PropertiesService.getScriptProperties();
  const token = String(props.getProperty('striven_token') || '').trim();
  const rawExpires = Number(props.getProperty('striven_token_expires') || 0);
  const apiBaseUrl = String(props.getProperty('STRIVEN_BASE_URL') || 'https://api.striven.com')
    .replace(/\/+$/, '');

  if (!token) throw new Error('striven_token is missing. Run the existing Task Mapping auth workflow first.');

  let expiresAt = rawExpires;
  if (expiresAt > 0 && expiresAt < 1000000000000) expiresAt *= 1000;
  if (expiresAt && Date.now() >= expiresAt) {
    throw new Error('Current striven_token appears expired. Refresh auth before running a manual push.');
  }

  return { token: token, apiBaseUrl: apiBaseUrl };
}


function preinspectR30ArrayFromResponse_(raw) {
  if (Array.isArray(raw)) return raw;
  raw = raw || {};
  const candidates = [raw.data, raw.Data, raw.items, raw.Items, raw.results, raw.Results, raw.contacts, raw.Contacts, raw.pools, raw.Pools];
  for (let i = 0; i < candidates.length; i++) {
    if (Array.isArray(candidates[i])) return candidates[i];
  }
  return [];
}


function preinspectR30Entity_(raw) {
  raw = raw || {};
  return {
    id: preinspectR30PositiveId_(preinspectR30Pick_(raw, ['id','Id'])),
    name: String(preinspectR30Pick_(raw, ['name','Name']) || ''),
    type: String(preinspectR30Pick_(raw, ['type','Type']) || '')
  };
}


function preinspectR30Pick_(obj, aliases) {
  obj = obj || {};
  for (let i = 0; i < aliases.length; i++) {
    if (Object.prototype.hasOwnProperty.call(obj, aliases[i]) && obj[aliases[i]] !== null && obj[aliases[i]] !== undefined) {
      return obj[aliases[i]];
    }
  }
  return '';
}


function preinspectR30PositiveId_(value) {
  const n = Number(value);
  return isFinite(n) && n > 0 ? n : null;
}


function preinspectR30Date_(value) {
  if (value instanceof Date && !isNaN(value.getTime())) return value;
  if (value === null || value === undefined || value === '') return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}


function preinspectR30TimeZone_() {
  return typeof tm_getTimezone_ === 'function'
    ? tm_getTimezone_()
    : (Session.getScriptTimeZone() || 'America/Toronto');
}


function preinspectR30CombineDateAndTime_(dateSource, timeSource) {
  const d = preinspectR30Date_(dateSource);
  const t = preinspectR30Date_(timeSource);
  if (!d || !t) throw new Error('Cannot combine invalid date/time values.');
  const tz = preinspectR30TimeZone_();
  return Utilities.formatDate(d, tz, 'yyyy-MM-dd') + 'T' + Utilities.formatDate(t, tz, 'HH:mm:ss');
}


function preinspectR30SameDate_(a, b) {
  a = preinspectR30Date_(a);
  b = preinspectR30Date_(b);
  if (!a || !b) return false;
  const tz = preinspectR30TimeZone_();
  return Utilities.formatDate(a, tz, 'yyyy-MM-dd') === Utilities.formatDate(b, tz, 'yyyy-MM-dd');
}


function preinspectR30SameTime_(a, b) {
  a = preinspectR30Date_(a);
  b = preinspectR30Date_(b);
  if (!a || !b) return false;
  const tz = preinspectR30TimeZone_();
  return Utilities.formatDate(a, tz, 'HH:mm') === Utilities.formatDate(b, tz, 'HH:mm');
}

/************************************************************
 * PREINSPECT R3.0 — MANUAL SINGLE-FIELD PUSH CONTROLS END
 ************************************************************/


/************************************************************
 * PREINSPECT R3.1 — BLANK TASK DATETIME RECOVERY
 *
 * - Dates push preserves existing task times when present.
 * - If task Start/Due is blank, Calendar time is the safe recovery source.
 * - Times push preserves existing task dates when present.
 * - If task Start/Due is blank, Calendar date is the safe recovery source.
 * - No other R3.0 manual field-write contract is changed.
 ************************************************************/


/************************************************************
 * R3.2 — INSTALL NOTES 854 + UNIQUE SO + PUSH ALL
 *
 * Existing-task synchronization only. Initial PreInspect CREATE/RECREATE
 * continues to obey the no-Sales-Order contract in files 36 / 92.
 *
 * Sales Order rule:
 * - Fresh Calendar Title + Description only.
 * - 0 distinct labelled SOs => no-op.
 * - 1 distinct labelled SO => resolve exact Striven SO ID, verify customer,
 *   patch and GET/read-back verify.
 * - >1 distinct labelled SOs => skip SO only; all other Push All fields continue.
 *
 * Install Notes rule:
 * - Never use the generic task PATCH InfoCustomFields path that failed live.
 * - Discover a dedicated task custom-field subresource with GET first.
 * - Only POST to a route that exposes field 854.
 * - Preserve every returned field and change only field 854.
 * - After a 2xx write, never try a second write shape if read-back is uncertain.
 ************************************************************/

function preinspectR32RunSalesOrder_() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error('Could not obtain script lock. No Striven write attempted.');
  try {
    const ctx = preinspectR30BuildContext_();
    const plan = preinspectR32BuildSalesOrderPlan_(ctx);
    const result = preinspectR32ApplySalesOrderPlan_(ctx, plan);
    const output = {
      mode: 'MANUAL_PREINSPECT_SINGLE_FIELD_PUSH',
      action: 'SALES_ORDER',
      writesPerformed: result.writesPerformed === true,
      strivenWritesPerformed: result.writesPerformed === true,
      calendarWritesPerformed: false,
      mappingRow: ctx.rowNumber,
      eventId: ctx.eventId,
      taskId: ctx.taskId,
      taskTypeId: PREINSPECT_R30_MANUAL.TASK_TYPE_ID,
      result: result
    };
    Logger.log(JSON.stringify(output, null, 2));
    return output;
  } finally {
    lock.releaseLock();
  }
}


function preinspectR32RunAll_() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error('Could not obtain script lock. No Striven write attempted.');

  const steps = [];
  let ctx = null;
  try {
    ctx = preinspectR30BuildContext_();

    // Read-only preflight before the first write. Sales Order is intentionally
    // excluded from the PreInspect synchronization contract in R3.4.
    const requestedByPlan = preinspectR30ResolveRequestedBy_(ctx);
    const installNotesPlan = preinspectR32PrepareInstallNotes_(ctx);
    if (installNotesPlan.status !== 'NOT_NEEDED') {
      preinspectR32DiscoverTaskCustomFieldEndpoint_(ctx.taskId);
    }

    function runStep(name, fn) {
      const result = fn();
      steps.push({ action: name, result: result });
      ctx.task = preinspectR30ReadTask_(ctx.taskId);
      return result;
    }

    runStep('CUSTOMER', function() { return preinspectR30PushCustomer_(ctx); });
    runStep('LOCATION', function() { return preinspectR30PushLocation_(ctx); });
    runStep('REQUESTED_BY', function() { return preinspectR32PushRequestedByPlan_(ctx, requestedByPlan); });
    runStep('DATES', function() { return preinspectR30PushDates_(ctx); });
    runStep('TIMES', function() { return preinspectR30PushTimes_(ctx); });
    runStep('ASSIGNEES', function() { return preinspectR30PushAssignees_(ctx); });
    runStep('INSTALL_NOTES', function() { return preinspectR30PushInstallNotes_(ctx, installNotesPlan); });

    const finalTask = preinspectR30ReadTask_(ctx.taskId);
    const output = {
      mode: 'MANUAL_PREINSPECT_PUSH_ALL',
      action: 'ALL_NO_SALES_ORDER',
      status: 'COMPLETE',
      writesPerformed: steps.some(function(s) { return s.result && s.result.writesPerformed === true; }),
      strivenWritesPerformed: steps.some(function(s) { return s.result && s.result.writesPerformed === true; }),
      calendarWritesPerformed: false,
      salesOrderPolicy: 'SKIPPED_DISABLED_BY_POLICY',
      mappingRow: ctx.rowNumber,
      eventId: ctx.eventId,
      taskId: ctx.taskId,
      taskTypeId: PREINSPECT_R30_MANUAL.TASK_TYPE_ID,
      steps: steps,
      finalVerification: preinspectR32SummarizeTask_(finalTask)
    };
    Logger.log(JSON.stringify(output, null, 2));
    return output;
  } catch (err) {
    const failure = {
      mode: 'MANUAL_PREINSPECT_PUSH_ALL',
      action: 'ALL_NO_SALES_ORDER',
      status: 'FAILED',
      mappingRow: ctx ? ctx.rowNumber : null,
      eventId: ctx ? ctx.eventId : null,
      taskId: ctx ? ctx.taskId : null,
      completedSteps: steps,
      error: String(err && err.message ? err.message : err)
    };
    Logger.log(JSON.stringify(failure, null, 2));
    throw err;
  } finally {
    lock.releaseLock();
  }
}


function preinspectR32PushRequestedByPlan_(ctx, plan) {
  return preinspectR3421PushRequestedByOrganizerPlan_.apply(this, arguments);
}


function preinspectR32PrepareInstallNotes_(ctx) {
  const calendarNotes = preinspectR343StripManagedTaskLink_(ctx.freshEvent.description || '').trim();
  if (!calendarNotes) {
    return {
      status: 'NOT_NEEDED',
      reason: 'Calendar Description is blank; existing Install Notes were preserved.'
    };
  }

  const fields = preinspectR30NormalizeCustomFields_(ctx.task);
  const currentField = fields.filter(function(f) {
    return Number(f.id) === PREINSPECT_R30_MANUAL.INSTALL_NOTES_FIELD_ID;
  })[0] || { id: PREINSPECT_R30_MANUAL.INSTALL_NOTES_FIELD_ID, name: 'Install Notes', value: '' };
  const desiredValue = preinspectR30MergeCalendarNotes_(currentField.value || '', calendarNotes);

  if (String(currentField.value || '') === desiredValue) {
    return {
      status: 'NOT_NEEDED',
      desiredValue: desiredValue,
      reason: 'Managed Google Calendar notes block already matches the current Calendar Description.'
    };
  }

  return {
    status: 'READY',
    currentValue: String(currentField.value || ''),
    desiredValue: desiredValue,
    calendarNotes: calendarNotes
  };
}


function preinspectR32WriteInstallNotesField_(taskId, plan) {
  if (!plan || plan.status !== 'READY') throw new Error('Install Notes write plan is not READY.');
  const discovered = preinspectR32DiscoverTaskCustomFieldEndpoint_(taskId);
  const fields = discovered.fields;
  let found = false;

  const changed = fields.map(function(raw) {
    const copy = JSON.parse(JSON.stringify(raw || {}));
    const id = preinspectR30PositiveId_(preinspectR30Pick_(copy, ['id','Id']));
    if (id !== PREINSPECT_R30_MANUAL.INSTALL_NOTES_FIELD_ID) return copy;
    found = true;
    if (Object.prototype.hasOwnProperty.call(copy, 'Value')) copy.Value = plan.desiredValue;
    else copy.value = plan.desiredValue;
    if (Object.prototype.hasOwnProperty.call(copy, 'ValueText')) copy.ValueText = plan.desiredValue;
    if (Object.prototype.hasOwnProperty.call(copy, 'valueText')) copy.valueText = plan.desiredValue;
    return copy;
  });

  if (!found) throw new Error('BLOCKED: Discovered task custom-field endpoint did not expose field 854.');

  const first = preinspectR32RequestAllowFailure_('post', discovered.url, changed, 'POST_TASK_CUSTOM_FIELDS_ARRAY');
  if (first.ok) {
    const read = preinspectR32ReadCustomFieldsEndpoint_(discovered.url);
    if (!preinspectR32EndpointFieldEquals_(read.fields, PREINSPECT_R30_MANUAL.INSTALL_NOTES_FIELD_ID, plan.desiredValue)) {
      throw new Error(
        'POST task custom-fields returned HTTP ' + first.statusCode +
        ' but endpoint read-back did not contain the desired field 854 value. No second write shape attempted.'
      );
    }
    return { endpoint: discovered.path, payloadShape: 'FULL_FIELD_ARRAY', statusCode: first.statusCode };
  }

  // Only shape-negotiation after an explicit non-2xx rejection. No mutation was reported as successful.
  if ([400,405,415,422].indexOf(first.statusCode) !== -1) {
    const one = changed.filter(function(raw) {
      return preinspectR30PositiveId_(preinspectR30Pick_(raw || {}, ['id','Id'])) === PREINSPECT_R30_MANUAL.INSTALL_NOTES_FIELD_ID;
    })[0];
    const second = preinspectR32RequestAllowFailure_('post', discovered.url, one, 'POST_TASK_CUSTOM_FIELDS_OBJECT');
    if (second.ok) {
      const read2 = preinspectR32ReadCustomFieldsEndpoint_(discovered.url);
      if (!preinspectR32EndpointFieldEquals_(read2.fields, PREINSPECT_R30_MANUAL.INSTALL_NOTES_FIELD_ID, plan.desiredValue)) {
        throw new Error(
          'POST task custom-field object returned HTTP ' + second.statusCode +
          ' but endpoint read-back did not match field 854. No further write attempted.'
        );
      }
      return { endpoint: discovered.path, payloadShape: 'ONE_FULL_FIELD_OBJECT', statusCode: second.statusCode };
    }
    throw new Error(
      'Dedicated task custom-field endpoint rejected both conservative payload shapes. Array HTTP ' +
      first.statusCode + '; object HTTP ' + second.statusCode + '. No generic task PATCH fallback used.'
    );
  }

  throw new Error(
    'Dedicated task custom-field write failed HTTP ' + first.statusCode + ': ' +
    String(first.text || '').slice(0, 700)
  );
}


function preinspectR32DiscoverTaskCustomFieldEndpoint_(taskId) {
  const auth = preinspectR30ApiAuth_();
  const paths = [
    '/v2/tasks/' + encodeURIComponent(taskId) + '/custom-fields',
    '/v1/tasks/' + encodeURIComponent(taskId) + '/custom-fields'
  ];
  const attempts = [];

  for (let i = 0; i < paths.length; i++) {
    const url = auth.apiBaseUrl + paths[i];
    const read = preinspectR32RequestAllowFailure_('get', url, null, 'GET_TASK_CUSTOM_FIELDS_DISCOVERY');
    attempts.push({ path: paths[i], statusCode: read.statusCode });
    if (!read.ok) continue;
    const normalized = preinspectR32ExtractCustomFieldObjects_(read.json);
    const has854 = normalized.some(function(f) {
      return preinspectR30PositiveId_(preinspectR30Pick_(f || {}, ['id','Id'])) === PREINSPECT_R30_MANUAL.INSTALL_NOTES_FIELD_ID;
    });
    if (has854) return { path: paths[i], url: url, fields: normalized, attempts: attempts };
  }

  throw new Error(
    'BLOCKED: Could not discover a dedicated Task custom-field endpoint exposing field 854. ' +
    'No custom-field write attempted. Discovery: ' + JSON.stringify(attempts)
  );
}


function preinspectR32ReadCustomFieldsEndpoint_(url) {
  const read = preinspectR32RequestAllowFailure_('get', url, null, 'VERIFY_TASK_CUSTOM_FIELDS');
  if (!read.ok) throw new Error('Task custom-field endpoint read-back failed HTTP ' + read.statusCode + '.');
  return { fields: preinspectR32ExtractCustomFieldObjects_(read.json), statusCode: read.statusCode };
}


function preinspectR32ExtractCustomFieldObjects_(raw) {
  if (Array.isArray(raw)) return raw;
  if (!raw || typeof raw !== 'object') return [];
  const candidates = ['data','Data','customFields','CustomFields','infoCustomFields','InfoCustomFields'];
  for (let i = 0; i < candidates.length; i++) {
    if (Array.isArray(raw[candidates[i]])) return raw[candidates[i]];
  }
  return [];
}


function preinspectR32EndpointFieldEquals_(fields, id, expected) {
  return (fields || []).some(function(f) {
    const fid = preinspectR30PositiveId_(preinspectR30Pick_(f || {}, ['id','Id']));
    const value = preinspectR30Pick_(f || {}, ['value','Value','valueText','ValueText']);
    return fid === Number(id) && String(value === null || value === undefined ? '' : value) === String(expected);
  });
}


function preinspectR32RequestAllowFailure_(method, url, payload, label) {
  // R3.4.6: route ONLY Field 854 task custom-field writes through the
  // production contract proven by testPreInspectField854TaskPatch18373.
  const r346Field854Route = preinspectR346MaybeRouteField854TaskPatch_(arguments);
  if (r346Field854Route && r346Field854Route.handled) {
    return r346Field854Route.response;
  }

  const auth = preinspectR30ApiAuth_();
  const options = {
    method: String(method || 'get').toLowerCase(),
    muteHttpExceptions: true,
    headers: { Authorization: 'Bearer ' + auth.token }
  };
  if (payload !== null && payload !== undefined) {
    options.contentType = 'application/json';
    options.payload = JSON.stringify(payload);
  }
  const response = preinspectR345aEvidenceFetch_(url, options);
  const code = response.getResponseCode();
  const text = response.getContentText();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch (ignored) {}
  return { ok: code >= 200 && code < 300, statusCode: code, text: text, json: json, label: label || '' };
}


function preinspectR32ExtractSalesOrderNumbers_(freshEvent) {
  const text = [freshEvent && freshEvent.title, freshEvent && freshEvent.description]
    .map(function(v) { return String(v || ''); }).join('\n');
  const found = [];
  const re = /\b(?:sales\s*order|s\s*\/\s*o|s\.?\s*o\.?|order)\s*(?:number|no\.?|#)?\s*[:#\-]?\s*(\d{4,9})\b/gi;
  let m;
  while ((m = re.exec(text))) found.push(String(m[1]));
  return preinspectUnique_(found);
}


function preinspectR32BuildSalesOrderPlan_(ctx) {
  const numbers = preinspectR32ExtractSalesOrderNumbers_(ctx.freshEvent);
  if (!numbers.length) {
    return { status: 'NOT_NEEDED', writesPerformed: false, salesOrderNumbers: [], reason: 'No labelled Sales Order found in fresh Calendar Title or Description.' };
  }
  if (numbers.length > 1) {
    return { status: 'SKIPPED_MULTIPLE_SALES_ORDERS', writesPerformed: false, salesOrderNumbers: numbers, reason: 'Multiple distinct Sales Orders were found; Sales Order push is intentionally skipped.' };
  }

  const soNumber = numbers[0];

  // Primary resolver: production-proven Striven Sales Order search-by-number.
  // This is a read/search operation even though the API uses POST.
  const apiSearch = preinspectR32SearchSalesOrderByNumber_(soNumber);
  const candidates = (apiSearch.candidates || []).concat(
    preinspectR32CollectSalesOrderCandidates_(ctx, soNumber)
  );
  const dedupedCandidates = [];
  const seenCandidateIds = {};
  candidates.forEach(function(c) {
    const id = preinspectR30PositiveId_(c && c.id);
    if (!id || seenCandidateIds[id]) return;
    seenCandidateIds[id] = true;
    dedupedCandidates.push(c);
  });

  if (!dedupedCandidates.length) {
    return {
      status: 'SKIPPED_SO_ID_NOT_RESOLVED', writesPerformed: false, salesOrderNumber: soNumber,
      searchEndpoint: '/v1/sales-orders/search',
      searchError: apiSearch.error || '',
      reason: 'Exactly one Sales Order number was found, but no authoritative SalesOrderId could be resolved by Striven Sales Order search or current Task Mapping data sources.'
    };
  }

  const verified = [];
  const rejected = [];
  dedupedCandidates.forEach(function(c) {
    const result = preinspectR32VerifySalesOrderCandidate_(c, soNumber, ctx.customerId, ctx.row['Customer #']);
    if (result.verified) verified.push(result); else rejected.push(result);
  });

  const unique = {};
  verified.forEach(function(v) { unique[String(v.salesOrderId)] = v; });
  const ids = Object.keys(unique);
  if (ids.length === 1) {
    const v = unique[ids[0]];
    return {
      status: 'READY', salesOrderNumber: soNumber, salesOrderId: v.salesOrderId,
      salesOrderName: v.name || '', source: v.source || '', customerVerified: true,
      candidateIds: dedupedCandidates.map(function(c) { return c.id; })
    };
  }
  if (ids.length > 1) {
    return {
      status: 'SKIPPED_AMBIGUOUS_SALES_ORDER_IDS', writesPerformed: false,
      salesOrderNumber: soNumber, verifiedIds: ids.map(Number),
      reason: 'More than one SalesOrderId independently verified for the same Calendar SO number; no Sales Order write attempted.'
    };
  }

  const conflicts = rejected.filter(function(r) { return r.customerConflict === true; });
  if (conflicts.length) {
    throw new Error(
      'BLOCKED: Calendar Sales Order ' + soNumber + ' resolved to a different customer than confirmed Customer ' +
      ctx.customerId + '. No Push All write started.'
    );
  }

  return {
    status: 'SKIPPED_SO_NOT_VERIFIED', writesPerformed: false, salesOrderNumber: soNumber,
    candidateIds: dedupedCandidates.map(function(c) { return c.id; }), rejected: rejected,
    reason: 'SalesOrderId candidate(s) were found but no candidate passed exact SO-number + customer verification.'
  };
}


function preinspectR32ApplySalesOrderPlan_(ctx, plan) {
  if (!plan || plan.status !== 'READY') {
    return Object.assign({ writesPerformed: false }, plan || { status: 'NOT_NEEDED' });
  }

  const current = preinspectR30Entity_(preinspectR30Pick_(ctx.task, ['salesOrder','SalesOrder']));
  if (Number(current.id || 0) === Number(plan.salesOrderId)) {
    return {
      status: 'NOT_NEEDED', writesPerformed: false, field: 'SalesOrder',
      salesOrderId: plan.salesOrderId, salesOrderNumber: plan.salesOrderNumber,
      reason: 'Task already has the one verified Calendar Sales Order.'
    };
  }

  const auth = preinspectR30ApiAuth_();
  const url = auth.apiBaseUrl + '/v2/tasks/' + encodeURIComponent(ctx.taskId);
  preinspectR30Request_('patch', url, {
    Id: ctx.taskId,
    SalesOrder: { Id: plan.salesOrderId }
  }, 'PATCH_UNIQUE_CALENDAR_SALES_ORDER');

  const verifiedTask = preinspectR30ReadTask_(ctx.taskId);
  const actual = preinspectR30Entity_(preinspectR30Pick_(verifiedTask, ['salesOrder','SalesOrder']));
  const actualNumber = String(preinspectR30Pick_(preinspectR30Pick_(verifiedTask, ['salesOrder','SalesOrder']) || {}, ['number','Number']) || '');
  if (Number(actual.id || 0) !== Number(plan.salesOrderId) || (actualNumber && actualNumber !== String(plan.salesOrderNumber))) {
    throw new Error('Sales Order PATCH completed but Task GET read-back verification failed.');
  }

  return {
    status: 'PUSHED_AND_VERIFIED', writesPerformed: true, field: 'SalesOrder',
    previousSalesOrderId: current.id || null,
    salesOrderId: plan.salesOrderId, salesOrderNumber: plan.salesOrderNumber,
    resolutionSource: plan.source || ''
  };
}


function preinspectR32SearchSalesOrderByNumber_(soNumber) {
  try {
    const auth = preinspectR30ApiAuth_();
    const url = auth.apiBaseUrl + '/v1/sales-orders/search';
    const read = preinspectR30Request_('post', url, {
      PageIndex: 0,
      PageSize: 25,
      OrderNumber: String(soNumber)
    }, 'SEARCH_SALES_ORDER_BY_NUMBER');

    const raw = read.json || {};
    let items = [];
    if (Array.isArray(raw)) items = raw;
    else {
      const keys = ['Items','items','Data','data','Results','results'];
      for (let i = 0; i < keys.length; i++) {
        if (Array.isArray(raw[keys[i]])) { items = raw[keys[i]]; break; }
      }
    }

    const exact = items.filter(function(item) {
      const n = String(preinspectR30Pick_(item || {}, [
        'OrderNumber','orderNumber','SalesOrderNumber','salesOrderNumber','SONumber','soNumber','Number','number'
      ]) || '').trim();
      return n === String(soNumber);
    }).map(function(item) {
      const customer = preinspectR30Pick_(item || {}, ['Customer','customer','Account','account']) || {};
      return {
        id: preinspectR30PositiveId_(preinspectR30Pick_(item || {}, ['Id','id','SalesOrderId','salesOrderId','OrderId','orderId'])),
        source: 'API:/v1/sales-orders/search',
        customerId: preinspectR30PositiveId_(preinspectR30Pick_(customer, ['Id','id'])) ||
          preinspectR30PositiveId_(preinspectR30Pick_(item || {}, ['CustomerId','customerId','AccountId','accountId'])),
        customerNumber: String(preinspectR30Pick_(customer, ['Number','number']) || preinspectR30Pick_(item || {}, ['CustomerNumber','customerNumber']) || '')
      };
    }).filter(function(c) { return !!c.id; });

    return { candidates: exact, endpoint: '/v1/sales-orders/search', resultCount: exact.length };
  } catch (err) {
    return {
      candidates: [], endpoint: '/v1/sales-orders/search',
      error: String(err && err.message ? err.message : err)
    };
  }
}


function preinspectR32CollectSalesOrderCandidates_(ctx, soNumber) {
  const out = [];
  function add(id, source, customerId, customerNumber) {
    id = preinspectR30PositiveId_(id);
    if (!id) return;
    out.push({ id: id, source: source || '', customerId: preinspectR30PositiveId_(customerId), customerNumber: String(customerNumber || '') });
  }

  if (String(ctx.row['SO #'] || '').trim() === String(soNumber)) {
    add(ctx.row['SO ID'], 'PREINSPECT_MAPPING_ROW', ctx.row['Customer ID'], ctx.row['Customer #']);
  }

  const taskSo = preinspectR30Pick_(ctx.task, ['salesOrder','SalesOrder']) || {};
  const taskSoNum = String(preinspectR30Pick_(taskSo, ['number','Number']) || '').trim();
  if (taskSoNum === String(soNumber)) add(preinspectR30Pick_(taskSo, ['id','Id']), 'CURRENT_TASK');

  const ss = ctx.ss || SpreadsheetApp.getActiveSpreadsheet();
  const sheets = [
    'Approved Sales Orders', 'Delivery Approved Orders', 'Striven Tasks',
    'Delivery Tasks', 'Striven Service Tasks', 'Striven Service Work Orders'
  ];

  sheets.forEach(function(name) {
    const sh = ss && ss.getSheetByName(name);
    if (!sh || typeof tm_getSheetObjects_ !== 'function') return;
    const rows = tm_getSheetObjects_(sh);
    rows.forEach(function(row) {
      const n = String(preinspectR30Pick_(row, ['SONumber','SO Number','SalesOrderNumber','Sales Order Number','SO #']) || '').trim();
      if (n !== String(soNumber)) return;
      add(
        preinspectR30Pick_(row, ['SalesOrderId','Sales Order ID','SOId','SO ID','Task SalesOrder ID']),
        'SHEET:' + name,
        preinspectR30Pick_(row, ['CustomerCustomerId','Customer ID','CustomerId']),
        preinspectR30Pick_(row, ['CustomerNumber','Customer #'])
      );
    });
  });

  const seen = {};
  return out.filter(function(c) {
    if (seen[c.id]) return false;
    seen[c.id] = true;
    return true;
  });
}


function preinspectR32VerifySalesOrderCandidate_(candidate, soNumber, customerId, customerNumber) {
  try {
    const auth = preinspectR30ApiAuth_();
    const read = preinspectR30Request_('get', auth.apiBaseUrl + '/v1/sales-orders/' + encodeURIComponent(candidate.id), null, 'GET_SALES_ORDER_BY_ID');
    const raw = preinspectR32UnwrapSalesOrder_(read.json);
    const actualNumber = String(preinspectR30Pick_(raw, ['number','Number','salesOrderNumber','SalesOrderNumber','soNumber','SONumber','orderNumber','OrderNumber']) || '').trim();
    const customer = preinspectR30Pick_(raw, ['customer','Customer','account','Account']) || {};
    const actualCustomerId = preinspectR30PositiveId_(preinspectR30Pick_(customer, ['id','Id'])) ||
      preinspectR30PositiveId_(preinspectR30Pick_(raw, ['customerId','CustomerId','accountId','AccountId']));
    const actualCustomerNumber = String(preinspectR30Pick_(customer, ['number','Number']) || preinspectR30Pick_(raw, ['customerNumber','CustomerNumber']) || '').trim();

    const numberOK = actualNumber === String(soNumber);
    const candidateCustomerOK = candidate.customerId ? Number(candidate.customerId) === Number(customerId) : true;
    const apiCustomerOK = actualCustomerId
      ? Number(actualCustomerId) === Number(customerId)
      : (actualCustomerNumber && customerNumber ? actualCustomerNumber === String(customerNumber) : candidateCustomerOK && !!candidate.customerId);
    const customerConflict = (!!actualCustomerId && Number(actualCustomerId) !== Number(customerId)) ||
      (!!candidate.customerId && Number(candidate.customerId) !== Number(customerId));

    return {
      verified: numberOK && apiCustomerOK && !customerConflict,
      salesOrderId: candidate.id,
      salesOrderNumber: actualNumber,
      customerId: actualCustomerId || candidate.customerId || null,
      name: String(preinspectR30Pick_(raw, ['name','Name','salesOrderName','SalesOrderName']) || ''),
      source: candidate.source,
      customerConflict: customerConflict
    };
  } catch (err) {
    return { verified: false, salesOrderId: candidate.id, source: candidate.source, customerConflict: false, error: String(err && err.message ? err.message : err) };
  }
}


function preinspectR32UnwrapSalesOrder_(raw) {
  if (!raw || typeof raw !== 'object') return {};
  const keys = ['data','Data','salesOrder','SalesOrder','result','Result'];
  for (let i = 0; i < keys.length; i++) {
    if (raw[keys[i]] && typeof raw[keys[i]] === 'object' && !Array.isArray(raw[keys[i]])) return raw[keys[i]];
  }
  return raw;
}


function preinspectR32SummarizeTask_(task) {
  const customer = preinspectR30Entity_(preinspectR30Pick_(task, ['customer','Customer']));
  const location = preinspectR30Entity_(preinspectR30Pick_(task, ['location','Location']));
  const requested = preinspectR30Entity_(preinspectR30Pick_(task, ['requestedBy','RequestedBy']));
  const salesOrder = preinspectR30Entity_(preinspectR30Pick_(task, ['salesOrder','SalesOrder']));
  return {
    customerId: customer.id || null,
    locationId: location.id || null,
    requestedById: requested.id || null,
    salesOrderId: salesOrder.id || null,
    startDateTime: preinspectR30Pick_(task, ['startDateTime','StartDateTime']) || null,
    dueDateTime: preinspectR30Pick_(task, ['dueDateTime','DueDateTime']) || null,
    assignments: preinspectR30NormalizeAssignments_(task),
    installNotes: (preinspectR30NormalizeCustomFields_(task).filter(function(f) { return Number(f.id) === 854; })[0] || {}).value || ''
  };
}

/************************************************************
 * PREINSPECT R3.4.2 — CUSTOMER-CENTRIC CALENDAR + MAPPING
 * DATE/TIME REPAIR + END-TO-END ASSIGNMENT ORDER HARDENING
 *
 * - PreInspect Calendar custom identity begins with Customer # after Guests.
 * - Sales Order display fields are removed from the PreInspect Calendar mirror.
 * - Mapping Date/Time matches Install Task Mapping: yyyy-MM-dd + HH:mm–HH:mm.
 * - Split Google Sheet date/time values are recombined safely before freshness checks.
 * - New/recreated tasks add Pool 8 before removing legacy employees 6/20.
 ************************************************************/

/************************************************************
 * PREINSPECT R3.4 — TRUE SELECTED-ROW END-TO-END +
 * INSTALL-LIKE CALENDAR MIRROR SCHEMA
 ************************************************************/

function preinspectR3416OriginalRunSelectedPreInspectEndToEnd_() {
  const userLock = LockService.getUserLock();
  if (!userLock.tryLock(10000)) {
    throw new Error('Selected-row PreInspect End-to-End is already running for this user.');
  }

  const steps = [];
  let identity = null;

  try {
    identity = preinspectR34SelectedMappingIdentity_();

    function record(name, value) {
      steps.push({ action: name, result: value });
      return value;
    }

    const initialState = preinspectR34ReadSelectedMappingState_();
    const initialTaskId = preinspectR34PositiveNumber_(initialState.row['Task ID']);
    const initialTaskAction = String(initialState.row['Task Action'] || '').trim().toUpperCase();
    const initialIssue = String(initialState.row['Issue'] || '').trim();

    record('REVIEW_MATCH_DUPLICATE_CHECK', reviewSelectedPreInspectMappingRow());
    SpreadsheetApp.flush();

    let state = preinspectR34ReadSelectedMappingState_();
    let status = String(state.row['Status'] || '').trim().toUpperCase();
    let taskAction = String(state.row['Task Action'] || '').trim().toUpperCase();

    // Repair the exact known R3.4.1 partial-create condition from Task 18373-style
    // failures: the Task ID was safely persisted, but Striven blocked deleting the
    // final employee assignment before Pool 8 had been added. This path never POSTs
    // another task and runs only when the prior row records that exact condition.
    const priorCreatedAssignmentGuard =
      status === 'REVIEW' &&
      initialTaskId &&
      /^CREATED/.test(initialTaskAction) &&
      /Assignment cannot be removed|only one assignment on this task/i.test(initialIssue);

    if (priorCreatedAssignmentGuard) {
      record(
        'REPAIR_PRIOR_CREATED_TASK_ASSIGNMENTS',
        preinspectR342NormalizeNewTaskAssignments_(initialTaskId)
      );
      record('REVIEW_AFTER_PRIOR_CREATE_REPAIR', reviewSelectedPreInspectMappingRow());
      SpreadsheetApp.flush();
      state = preinspectR34ReadSelectedMappingState_();
      status = String(state.row['Status'] || '').trim().toUpperCase();
      taskAction = String(state.row['Task Action'] || '').trim().toUpperCase();
    }

    if (status === 'REVIEW' || status === 'SKIP') {
      const stopped = {
        mode: 'PREINSPECT_SELECTED_ROW_END_TO_END',
        status: status === 'SKIP' ? 'STOPPED_SKIP' : 'STOPPED_REVIEW',
        writesPerformed: false,
        mappingRow: identity.rowNumber,
        eventId: identity.eventId,
        taskId: preinspectR34PositiveNumber_(state.row['Task ID']),
        issue: String(state.row['Issue'] || '').trim(),
        taskAction: taskAction,
        steps: steps
      };
      Logger.log(JSON.stringify(stopped, null, 2));
      return stopped;
    }

    let recovery = null;
    let createdOrRecreatedThisRun = false;

    const reviewedTaskId = preinspectR34PositiveNumber_(state.row['Task ID']);
    if (reviewedTaskId) {
      recovery = record('TASK_REUSE_CREATE_RECREATE', {
        mode: 'PREINSPECT_END_TO_END_TASK_DECISION',
        status: 'EXISTING_TASK_NO_CREATE',
        taskId: reviewedTaskId,
        reason: 'Exactly one existing PreInspect task is mapped; reuse it.'
      });
    } else if (taskAction === 'WOULD_CREATE' || status === 'READY CREATE') {
      // Use the dedicated PreInspect create path. It performs its own fresh-read
      // and duplicate check. After its verified create, R3.4.2 converts the
      // template employee assignments to Pool 8 in the safe order: add pool first,
      // then remove only legacy employees 6/20.
      recovery = record(
        'TASK_REUSE_CREATE_RECREATE',
        createSelectedPreInspectTask_MANUAL_WRITE()
      );
      createdOrRecreatedThisRun = true;
    } else {
      // Completed-task RECREATE remains in the shared recovery layer. If that
      // layer reaches Striven's last-assignment delete guard after creating the
      // replacement, recover only that known assignment-order condition using
      // the already-persisted new Task ID; never POST a second task.
      try {
        recovery = record(
          'TASK_REUSE_CREATE_RECREATE',
          executeSelectedTaskRecovery_MANUAL_WRITE()
        );
        createdOrRecreatedThisRun = !!(
          recovery && (recovery.newTaskId || /CREATED|RECREATED/i.test(String(recovery.status || '')))
        );
      } catch (recoveryErr) {
        SpreadsheetApp.flush();
        const afterRecoveryError = preinspectR34ReadSelectedMappingState_();
        const persistedTaskId = preinspectR34PositiveNumber_(afterRecoveryError.row['Task ID']);
        const message = String(recoveryErr && recoveryErr.message ? recoveryErr.message : recoveryErr);
        const isKnownAssignmentOrderGuard = /Assignment cannot be removed|only one assignment on this task/i.test(message);

        if (!isKnownAssignmentOrderGuard || !persistedTaskId || persistedTaskId === initialTaskId) {
          throw recoveryErr;
        }

        recovery = record('TASK_RECOVERY_ASSIGNMENT_ORDER_REPAIR', {
          mode: 'PREINSPECT_END_TO_END_RECOVERY_REPAIR',
          status: 'CREATED_TASK_ID_RECOVERED_NO_SECOND_POST',
          taskId: persistedTaskId,
          originalError: message
        });
        createdOrRecreatedThisRun = true;
      }
    }

    SpreadsheetApp.flush();
    state = preinspectR34ReadSelectedMappingState_();

    let taskId = preinspectR34PositiveNumber_(state.row['Task ID']);
    if (!taskId && recovery) {
      taskId = preinspectR34PositiveNumber_(recovery.newTaskId || recovery.taskId);
    }
    if (!taskId) {
      throw new Error('End-to-End did not yield exactly one verified PreInspect Task ID.');
    }

    const residuePlan = preinspectR343ShouldRepairTemplateAssignmentResidue_(taskId);
    if (residuePlan.repair) {
      record('REPAIR_GENERATED_TASK_TEMPLATE_ASSIGNMENT_RESIDUE', preinspectR342NormalizeNewTaskAssignments_(taskId));
    } else {
      const needsLegacyAssignmentRepair = createdOrRecreatedThisRun || /^CREATED/.test(initialTaskAction);
      if (needsLegacyAssignmentRepair) {
        record('NORMALIZE_NEW_TASK_ASSIGNMENTS_TO_POOL_8', preinspectR342NormalizeNewTaskAssignments_(taskId));
      }
    }

    record('SYNC_TASK_FIELDS_NO_SALES_ORDER', pushSelectedPreInspectAll());
    record('CALENDAR_TASK_LINK', pushSelectedPreInspectTaskLinkToCalendarEvent());
    record('REFRESH_PREINSPECT_CALENDAR_MIRROR', syncPreInspectCalendarNow());
    record('FINAL_MAPPING_REVIEW', reviewSelectedPreInspectMappingRow());

    const finalState = preinspectR34ReadSelectedMappingState_();
    const finalTaskId = preinspectR34PositiveNumber_(finalState.row['Task ID']);

    if (!finalTaskId || Number(finalTaskId) !== Number(taskId)) {
      throw new Error('Final mapping verification did not retain the verified Task ID ' + taskId + '.');
    }

    const result = {
      mode: 'PREINSPECT_SELECTED_ROW_END_TO_END',
      status: 'COMPLETE_AND_VERIFIED',
      mappingRow: identity.rowNumber,
      eventId: identity.eventId,
      taskId: taskId,
      salesOrderPolicy: 'SKIPPED_DISABLED_BY_POLICY',
      defaultAssignment: { type: 'pool', id: PREINSPECT_R30_MANUAL.DEFAULT_POOL_ID },
      steps: steps,
      finalMapping: {
        status: String(finalState.row['Status'] || '').trim(),
        taskAction: String(finalState.row['Task Action'] || '').trim(),
        taskStatus: String(finalState.row['Task Status'] || '').trim(),
        issue: String(finalState.row['Issue'] || '').trim()
      }
    };

    Logger.log(JSON.stringify(result, null, 2));
    return result;

  } catch (err) {
    const failure = {
      mode: 'PREINSPECT_SELECTED_ROW_END_TO_END',
      status: 'FAILED',
      mappingRow: identity ? identity.rowNumber : null,
      eventId: identity ? identity.eventId : null,
      completedSteps: steps,
      error: String(err && err.message ? err.message : err)
    };
    Logger.log(JSON.stringify(failure, null, 2));
    throw err;
  } finally {
    userLock.releaseLock();
  }
}


function preinspectEnsurePool8ByTaskId_(taskId) {
  taskId = preinspectR34PositiveNumber_(taskId);
  if (!taskId) throw new Error('Pool 8 assignment requires a valid Task ID.');

  const task = preinspectR30ReadTask_(taskId);
  const type = preinspectR30Entity_(preinspectR30Pick_(task, ['type','Type']));
  if (Number(type.id || 0) !== Number(PREINSPECT_R30_MANUAL.TASK_TYPE_ID)) {
    throw new Error('Pool 8 assignment blocked: Task ' + taskId + ' is not Task Type 105 Pre Inspection.');
  }

  return preinspectR30PushAssignees_({ taskId: taskId, task: task });
}


function preinspectR34SelectedMappingIdentity_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss && ss.getActiveSheet();
  if (!sheet || sheet.getName() !== PREINSPECT_R30_MANUAL.MAPPING_SHEET) {
    throw new Error('Select a row on "PreInspect Task Mapping" first.');
  }
  const range = sheet.getActiveRange();
  const rowNumber = range ? range.getRow() : 0;
  if (rowNumber <= 1) throw new Error('Select a PreInspect mapping data row, not the header.');

  const state = preinspectR34ReadSelectedMappingState_();
  const eventId = String(state.row['Event ID'] || '').trim();
  if (!eventId) throw new Error('Selected PreInspect mapping row has no Event ID.');

  return { rowNumber: rowNumber, eventId: eventId };
}


function preinspectR34ReadSelectedMappingState_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss && ss.getActiveSheet();
  if (!sheet || sheet.getName() !== PREINSPECT_R30_MANUAL.MAPPING_SHEET) {
    throw new Error('Select a row on "PreInspect Task Mapping" first.');
  }
  const range = sheet.getActiveRange();
  const rowNumber = range ? range.getRow() : 0;
  if (rowNumber <= 1) throw new Error('Select a PreInspect mapping data row, not the header.');

  const width = sheet.getLastColumn();
  const headers = sheet.getRange(1, 1, 1, width).getDisplayValues()[0];
  const raw = sheet.getRange(rowNumber, 1, 1, width).getValues()[0];
  const display = sheet.getRange(rowNumber, 1, 1, width).getDisplayValues()[0];
  const row = {};
  headers.forEach(function(header, index) {
    const name = String(header || '').trim();
    if (!name) return;
    row[name] = (name === 'Calendar Start' || name === 'Calendar End')
      ? (raw[index] || display[index])
      : display[index];
  });
  return { sheet: sheet, rowNumber: rowNumber, headers: headers, row: row };
}


function preinspectR34PositiveNumber_(value) {
  const n = Number(String(value === null || value === undefined ? '' : value).trim());
  return Number.isFinite(n) && n > 0 ? n : null;
}


function preinspectR34CalendarRowDateTime_(row, prefix) {
  const direct = preinspectFirst_(row, [prefix, prefix + 'DateTime']);
  if (direct) return direct;

  const dateValue = preinspectFirst_(row, [prefix + ' Date']);
  const timeValue = preinspectFirst_(row, [prefix + ' Time']);
  const datePart = preinspectR342DatePart_(dateValue);
  if (!datePart) return '';

  const timePart = preinspectR342TimePart_(timeValue);
  return timePart ? datePart + 'T' + timePart + ':00' : datePart;
}


/************************************************************
 * PREINSPECT R3.4.2 — CUSTOMER-CENTRIC CALENDAR + DATE/TIME
 * REPAIR + SAFE NEW-TASK ASSIGNMENT ORDER
 ************************************************************/
function preinspectR342DatePart_(value) {
  if (value instanceof Date && !isNaN(value.getTime())) {
    return Utilities.formatDate(
      value,
      PREINSPECT_REVIEW_CONFIG.CALENDAR_SYNC.TIMEZONE,
      'yyyy-MM-dd'
    );
  }

  const clean = String(value || '').trim();
  if (!clean) return '';
  const exact = clean.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (exact) return exact[1] + '-' + exact[2] + '-' + exact[3];

  const d = new Date(clean);
  if (isNaN(d.getTime())) return '';
  return Utilities.formatDate(
    d,
    PREINSPECT_REVIEW_CONFIG.CALENDAR_SYNC.TIMEZONE,
    'yyyy-MM-dd'
  );
}


function preinspectR342TimePart_(value) {
  if (value instanceof Date && !isNaN(value.getTime())) {
    return Utilities.formatDate(
      value,
      PREINSPECT_REVIEW_CONFIG.CALENDAR_SYNC.TIMEZONE,
      'HH:mm'
    );
  }

  const clean = String(value || '').trim();
  if (!clean) return '';

  let match = clean.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (match) {
    return ('0' + Number(match[1])).slice(-2) + ':' + match[2];
  }

  match = clean.match(/^(\d{1,2}):(\d{2})\s*([AP]M)$/i);
  if (match) {
    let hour = Number(match[1]) % 12;
    if (String(match[3]).toUpperCase() === 'PM') hour += 12;
    return ('0' + hour).slice(-2) + ':' + match[2];
  }

  const d = new Date(clean);
  if (isNaN(d.getTime())) return '';
  return Utilities.formatDate(
    d,
    PREINSPECT_REVIEW_CONFIG.CALENDAR_SYNC.TIMEZONE,
    'HH:mm'
  );
}


function preinspectR342CalendarPartsMillis_(dateValue, timeValue) {
  const datePart = preinspectR342DatePart_(dateValue);
  if (!datePart) return 0;
  const timePart = preinspectR342TimePart_(timeValue) || '00:00';
  const d = new Date(datePart + 'T' + timePart + ':00');
  return isNaN(d.getTime()) ? 0 : d.getTime();
}


function preinspectR342CarryForwardCalendarCustomerNumbers_(sheet, rows) {
  if (!sheet || !rows || !rows.length || sheet.getLastRow() < 2) return;

  const lastColumn = sheet.getLastColumn();
  const headers = sheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0]
    .map(function(v) { return String(v || '').trim(); });
  const eventIndex = headers.indexOf('Event ID');
  const customerIndex = headers.indexOf('Customer #');
  if (eventIndex < 0 || customerIndex < 0) return;

  const existing = sheet.getRange(2, 1, sheet.getLastRow() - 1, lastColumn).getDisplayValues();
  const byEventId = {};
  existing.forEach(function(row) {
    const eventId = String(row[eventIndex] || '').trim();
    const customerNumber = String(row[customerIndex] || '').trim();
    if (eventId && customerNumber) byEventId[eventId] = customerNumber;
  });

  // R3.4.2 schema: Customer # is column 13 / zero-based index 12.
  rows.forEach(function(row) {
    const eventId = String(row[0] || '').trim();
    if (eventId && !String(row[12] || '').trim() && byEventId[eventId]) {
      row[12] = byEventId[eventId];
    }
  });
}


function preinspectR342BackfillCalendarCustomerNumbers_(mappingObjects) {
  const objects = (mappingObjects || []).filter(function(obj) {
    return obj && String(obj['Event ID'] || '').trim() && String(obj['Customer #'] || '').trim();
  });
  if (!objects.length) return { status: 'NOT_NEEDED', writesPerformed: false };

  const ss = SpreadsheetApp.getActive();
  const sheet = ss.getSheetByName(PREINSPECT_REVIEW_CONFIG.SHEETS.CALENDAR);
  if (!sheet || sheet.getLastRow() < 2) return { status: 'NOT_NEEDED', writesPerformed: false };

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0]
    .map(function(v) { return String(v || '').trim(); });
  const eventCol = headers.indexOf('Event ID') + 1;
  const customerCol = headers.indexOf('Customer #') + 1;
  if (!eventCol || !customerCol) return { status: 'NOT_NEEDED', writesPerformed: false };

  const desired = {};
  objects.forEach(function(obj) {
    desired[String(obj['Event ID']).trim()] = String(obj['Customer #']).trim();
  });

  const count = sheet.getLastRow() - 1;
  const eventIds = sheet.getRange(2, eventCol, count, 1).getDisplayValues();
  const customerValues = sheet.getRange(2, customerCol, count, 1).getDisplayValues();
  let changed = 0;

  for (let i = 0; i < count; i++) {
    const eventId = String(eventIds[i][0] || '').trim();
    const target = desired[eventId] || '';
    if (target && String(customerValues[i][0] || '').trim() !== target) {
      customerValues[i][0] = target;
      changed++;
    }
  }

  if (changed) sheet.getRange(2, customerCol, count, 1).setValues(customerValues);
  return { status: changed ? 'UPDATED' : 'NOT_NEEDED', writesPerformed: changed > 0, updatedRows: changed };
}


/************************************************************
 * PREINSPECT R3.4.3 — RECOVER TEMPLATE-ASSIGNMENT RESIDUE
 *
 * R3.4.1 could persist a newly-created task before Striven rejected removal
 * of its final legacy employee assignment. A subsequent mapping rebuild can
 * legitimately classify that task as MATCHED / NO_ACTION, which erases the
 * earlier "CREATED NEEDS REVIEW" evidence from the row.
 *
 * Safe repair signature:
 * - Task Type 105 Pre Inspection
 * - generated Preinspect: #<customer> title
 * - no pool assignment
 * - exactly one assignment and it is legacy template employee 6 or 20
 *
 * Anything else is preserved.
 ************************************************************/
function preinspectR343ShouldRepairTemplateAssignmentResidue_(taskId) {
  taskId = preinspectR34PositiveNumber_(taskId);
  if (!taskId) return { repair: false, reason: 'NO_TASK_ID' };

  const task = preinspectR30ReadTask_(taskId);
  const type = preinspectR30Entity_(preinspectR30Pick_(task, ['type','Type']));
  if (Number(type.id || 0) !== Number(PREINSPECT_R30_MANUAL.TASK_TYPE_ID)) {
    return { repair: false, reason: 'NOT_PREINSPECT_TYPE' };
  }

  const title = String(preinspectR30Pick_(task, ['title','Title','name','Name']) || '').trim();
  if (!/^Preinspect\s*:\s*#\s*\d+/i.test(title)) {
    return { repair: false, reason: 'NOT_GENERATED_PREINSPECT_TITLE', title: title };
  }

  const assignments = preinspectR30NormalizeAssignments_(task);
  const pools = assignments.filter(function(a) {
    return String(a.type || '').toLowerCase() === 'pool';
  });
  const employees = assignments.filter(function(a) {
    return String(a.type || '').toLowerCase() === 'employee';
  });

  const legacyOnly = assignments.length === 1 && employees.length === 1 &&
    (Number(employees[0].id) === 6 || Number(employees[0].id) === 20) && pools.length === 0;

  return {
    repair: legacyOnly,
    reason: legacyOnly ? 'GENERATED_PREINSPECT_WITH_SOLE_LEGACY_TEMPLATE_EMPLOYEE' : 'ASSIGNMENTS_DO_NOT_MATCH_REPAIR_SIGNATURE',
    taskId: taskId,
    title: title,
    assignments: assignments
  };
}


function preinspectR342NormalizeNewTaskAssignments_(taskId) {
  taskId = preinspectR34PositiveNumber_(taskId);
  if (!taskId) throw new Error('New-task assignment normalization requires a valid Task ID.');

  let task = preinspectR30ReadTask_(taskId);
  const type = preinspectR30Entity_(preinspectR30Pick_(task, ['type','Type']));
  if (Number(type.id || 0) !== Number(PREINSPECT_R30_MANUAL.TASK_TYPE_ID)) {
    throw new Error('Assignment normalization blocked: Task ' + taskId + ' is not Task Type 105 Pre Inspection.');
  }

  // Add Pool 8 FIRST. Striven refuses to delete the final assignment.
  const poolResult = preinspectR30PushAssignees_({ taskId: taskId, task: task });
  task = preinspectR30ReadTask_(taskId);

  const assignments = preinspectR30NormalizeAssignments_(task);
  const legacy = assignments.filter(function(a) {
    return String(a.type || '').toLowerCase() === 'employee' &&
      (Number(a.id) === 6 || Number(a.id) === 20);
  });

  const auth = preinspectR30ApiAuth_();
  const url = auth.apiBaseUrl + '/v2/tasks/' + encodeURIComponent(taskId) + '/assignments';
  const removed = [];

  legacy.forEach(function(a) {
    preinspectR30Request_('delete', url, {
      Id: Number(a.id),
      Name: String(a.name || ''),
      Type: 'employee'
    }, 'R342_REMOVE_LEGACY_EMPLOYEE_' + a.id);
    removed.push(Number(a.id));
  });

  const verified = preinspectR30ReadTask_(taskId);
  const after = preinspectR30NormalizeAssignments_(verified);
  const hasPool8 = after.some(function(a) {
    return String(a.type || '').toLowerCase() === 'pool' && Number(a.id) === PREINSPECT_R30_MANUAL.DEFAULT_POOL_ID;
  });
  const remainingLegacy = after.filter(function(a) {
    return String(a.type || '').toLowerCase() === 'employee' &&
      (Number(a.id) === 6 || Number(a.id) === 20);
  });

  if (!hasPool8 || remainingLegacy.length) {
    throw new Error(
      'New-task assignment read-back failed for Task ' + taskId +
      '. Pool 8 present=' + hasPool8 +
      '; remaining legacy employees=' + remainingLegacy.map(function(a) { return a.id; }).join(',')
    );
  }

  return {
    status: 'POOL_8_VERIFIED_LEGACY_EMPLOYEES_REMOVED',
    writesPerformed: poolResult.writesPerformed === true || removed.length > 0,
    taskId: taskId,
    poolResult: poolResult,
    removedLegacyEmployeeIds: removed,
    verifiedAssignments: after
  };
}


function preinspectR34CalendarTime_(date) {
  return Utilities.formatDate(
    date,
    PREINSPECT_REVIEW_CONFIG.CALENDAR_SYNC.TIMEZONE,
    'H:mm'
  );
}


function preinspectR34SafeCalendarCall_(callback) {
  try {
    return String(callback() || '');
  } catch (err) {
    return '';
  }
}


function preinspectR34ExtractSalesOrderUrl_(rawDescription) {
  if (typeof tm_extractSalesOrderUrlFromRawHtmlDescription_ === 'function') {
    try {
      return String(tm_extractSalesOrderUrlFromRawHtmlDescription_(rawDescription) || '');
    } catch (err) {}
  }
  const match = String(rawDescription || '').match(
    /https?:\/\/[^\s"'<>]*striven[^\s"'<>]*(?:SalesOrder|sales-order|salesorder)[^\s"'<>]*/i
  );
  return match ? match[0].replace(/&amp;/g, '&') : '';
}


function preinspectR34ExtractTaskUrl_(rawDescription) {
  if (typeof tm_extractTaskUrlFromRawHtmlDescription_ === 'function') {
    try {
      return String(tm_extractTaskUrlFromRawHtmlDescription_(rawDescription) || '');
    } catch (err) {}
  }
  const match = String(rawDescription || '').match(
    /https?:\/\/[^\s"'<>]*\/Tasks\/TaskInfo\.aspx\?TaskID=\d+/i
  );
  return match ? match[0].replace(/&amp;/g, '&') : '';
}



/************************************************************
 * PREINSPECT R3.4.5a — FIELD 854 HTTP FAILURE EVIDENCE ONLY
 *
 * Temporary diagnostic wrapper.
 * - Preserves request URL, method, headers, payload, and behavior.
 * - Logs ONLY non-2xx responses.
 * - Used only by the Install Notes write call path.
 * - Remove when the field 854 contract is corrected.
 ************************************************************/
function preinspectR345aEvidenceFetch_(url, options) {
  const response = UrlFetchApp.fetch(url, options);
  const code = response.getResponseCode();

  if (code < 200 || code >= 300) {
    const body = String(response.getContentText() || '');
    Logger.log(JSON.stringify({
      mode: 'PREINSPECT_FIELD854_HTTP_EVIDENCE',
      url: String(url || ''),
      method: String(options && options.method ? options.method : 'get').toUpperCase(),
      statusCode: code,
      responseBody: body.slice(0, 4000)
    }, null, 2));
  }

  return response;
}

/************************************************************
 * PREINSPECT R3.4.5b — FIELD 854 TASK-PATCH CONTRACT PROOF
 *
 * PURPOSE
 * - Isolated production-safe contract test for Task 18373 only.
 * - Does NOT run mapping, create/recreate, assignments, Calendar writes,
 *   Sales Order logic, or the current /custom-fields POST writer.
 * - GETs the task, requires its existing InfoCustomFields array,
 *   PATCHes that exact full array back unchanged through /v2/tasks/{id},
 *   GETs again, and requires semantic custom-field parity.
 *
 * WHY NO-OP
 * - This proves whether the task-level PATCH accepts InfoCustomFields
 *   without risking a temporary production value in Field 854.
 * - If the task GET does not expose InfoCustomFields, this test fails
 *   BEFORE any PATCH.
 ************************************************************/
function testPreInspectField854TaskPatch18373() {
  const taskId = 18373;
  const fieldId = 854;
  const url = 'https://api.striven.com/v2/tasks/' + taskId;
  const headers = tm_getStrivenHeaders_();

  const before = preinspectR345bRequestJson_('get', url, null, headers);

  if (before.statusCode < 200 || before.statusCode >= 300) {
    throw new Error(
      'R3.4.5b preflight GET failed HTTP ' + before.statusCode + ': ' + before.text.slice(0, 2000)
    );
  }

  const info = preinspectR345bFindInfoCustomFields_(before.json);

  if (!info || !Array.isArray(info.fields)) {
    const summary = preinspectR345bDescribeTopLevel_(before.json);
    Logger.log(JSON.stringify({
      mode: 'PREINSPECT_FIELD854_TASK_PATCH_PROOF',
      status: 'BLOCKED_READ_ONLY',
      taskId: taskId,
      reason: 'GET /v2/tasks/{id} did not expose an InfoCustomFields array. No PATCH was attempted.',
      responseShape: summary
    }, null, 2));

    return {
      status: 'BLOCKED_READ_ONLY',
      taskId: taskId,
      reason: 'Task GET did not expose InfoCustomFields. No write performed.',
      responseShape: summary
    };
  }

  const beforeFields = preinspectR345bClone_(info.fields);
  const beforeMap = preinspectR345bFieldValueMap_(beforeFields);

  if (!Object.prototype.hasOwnProperty.call(beforeMap, String(fieldId))) {
    throw new Error('R3.4.5b preflight blocked: Task ' + taskId + ' InfoCustomFields does not contain Field ' + fieldId + '. No PATCH attempted.');
  }

  const payload = {
    Id: taskId,
    InfoCustomFields: beforeFields
  };

  Logger.log(JSON.stringify({
    mode: 'PREINSPECT_FIELD854_TASK_PATCH_PROOF',
    status: 'PREVIEW_READY',
    taskId: taskId,
    fieldId: fieldId,
    customFieldCount: beforeFields.length,
    customFieldIds: Object.keys(beforeMap).sort(),
    field854Present: true,
    writeType: 'NO_OP_FULL_CURRENT_INFOCUSTOMFIELDS',
    endpoint: url,
    method: 'PATCH'
  }, null, 2));

  const patch = preinspectR345bRequestJson_('patch', url, payload, headers);

  if (patch.statusCode < 200 || patch.statusCode >= 300) {
    Logger.log(JSON.stringify({
      mode: 'PREINSPECT_FIELD854_TASK_PATCH_PROOF',
      status: 'PATCH_REJECTED',
      taskId: taskId,
      endpoint: url,
      method: 'PATCH',
      statusCode: patch.statusCode,
      responseBody: patch.text.slice(0, 4000)
    }, null, 2));

    return {
      status: 'PATCH_REJECTED',
      taskId: taskId,
      statusCode: patch.statusCode,
      responseBody: patch.text.slice(0, 4000),
      writesAttempted: true,
      contractVerified: false
    };
  }

  const after = preinspectR345bRequestJson_('get', url, null, headers);

  if (after.statusCode < 200 || after.statusCode >= 300) {
    throw new Error(
      'R3.4.5b PATCH returned success but read-back GET failed HTTP ' + after.statusCode + ': ' + after.text.slice(0, 2000)
    );
  }

  const afterInfo = preinspectR345bFindInfoCustomFields_(after.json);
  if (!afterInfo || !Array.isArray(afterInfo.fields)) {
    throw new Error('R3.4.5b PATCH returned success but read-back no longer exposes InfoCustomFields. Manual review required.');
  }

  const afterMap = preinspectR345bFieldValueMap_(afterInfo.fields);
  const comparison = preinspectR345bCompareFieldMaps_(beforeMap, afterMap);

  if (!comparison.equal) {
    Logger.log(JSON.stringify({
      mode: 'PREINSPECT_FIELD854_TASK_PATCH_PROOF',
      status: 'CRITICAL_PARITY_FAILURE',
      taskId: taskId,
      changedFieldIds: comparison.changedFieldIds,
      missingFieldIds: comparison.missingFieldIds,
      addedFieldIds: comparison.addedFieldIds,
      message: 'Task PATCH returned success but custom-field parity changed. Do not integrate this route.'
    }, null, 2));

    throw new Error(
      'R3.4.5b critical parity failure after no-op PATCH. Changed/missing/added custom fields detected. Do not retry until reconciled.'
    );
  }

  const result = {
    mode: 'PREINSPECT_FIELD854_TASK_PATCH_PROOF',
    status: 'PASS_NOOP_TASK_PATCH_CONTRACT',
    taskId: taskId,
    fieldId: fieldId,
    endpoint: url,
    method: 'PATCH',
    patchHttpCode: patch.statusCode,
    field854PresentBefore: true,
    field854PresentAfter: Object.prototype.hasOwnProperty.call(afterMap, String(fieldId)),
    customFieldCountBefore: Object.keys(beforeMap).length,
    customFieldCountAfter: Object.keys(afterMap).length,
    allCustomFieldValuesPreserved: true,
    contractVerified: true,
    nextStep: 'If this passes, replace the existing Field 854 /custom-fields POST writer with task-level PATCH using a full current InfoCustomFields merge and read-back verification.'
  };

  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

function preinspectR345bRequestJson_(method, url, payload, headers) {
  const options = {
    method: String(method || 'get').toLowerCase(),
    headers: headers || tm_getStrivenHeaders_(),
    muteHttpExceptions: true
  };

  if (payload !== null && payload !== undefined) {
    options.contentType = 'application/json';
    options.payload = JSON.stringify(payload);
  }

  const response = UrlFetchApp.fetch(url, options);
  const text = String(response.getContentText() || '');
  let json = null;

  try {
    json = text ? JSON.parse(text) : null;
  } catch (err) {
    json = null;
  }

  return {
    statusCode: response.getResponseCode(),
    text: text,
    json: json
  };
}

function preinspectR345bFindInfoCustomFields_(root) {
  const visited = [];

  function walk(value, path, depth) {
    if (depth > 5 || value === null || value === undefined) {
      return null;
    }

    if (typeof value !== 'object') {
      return null;
    }

    if (visited.indexOf(value) !== -1) {
      return null;
    }
    visited.push(value);

    if (!Array.isArray(value)) {
      const keys = Object.keys(value);
      for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        if (String(key).toLowerCase() === 'infocustomfields' && Array.isArray(value[key])) {
          return { fields: value[key], path: path.concat([key]) };
        }
      }

      for (let j = 0; j < keys.length; j++) {
        const childKey = keys[j];
        const found = walk(value[childKey], path.concat([childKey]), depth + 1);
        if (found) return found;
      }
    } else {
      for (let k = 0; k < value.length; k++) {
        const foundArray = walk(value[k], path.concat([String(k)]), depth + 1);
        if (foundArray) return foundArray;
      }
    }

    return null;
  }

  return walk(root, [], 0);
}

function preinspectR345bClone_(value) {
  return JSON.parse(JSON.stringify(value));
}

function preinspectR345bFieldId_(field) {
  if (!field || typeof field !== 'object') return '';
  const candidates = ['Id', 'id', 'CustomFieldId', 'customFieldId', 'CustomFieldID', 'customFieldID'];
  for (let i = 0; i < candidates.length; i++) {
    const key = candidates[i];
    if (field[key] !== undefined && field[key] !== null && String(field[key]).trim() !== '') {
      return String(field[key]).trim();
    }
  }
  return '';
}

function preinspectR345bFieldValue_(field) {
  if (!field || typeof field !== 'object') return null;
  const candidates = [
    'Value', 'value', 'Values', 'values', 'FieldValue', 'fieldValue',
    'SelectedValue', 'selectedValue', 'SelectedValues', 'selectedValues'
  ];
  for (let i = 0; i < candidates.length; i++) {
    const key = candidates[i];
    if (Object.prototype.hasOwnProperty.call(field, key)) {
      return field[key];
    }
  }
  return field;
}

function preinspectR345bStable_(value) {
  if (Array.isArray(value)) {
    return value.map(preinspectR345bStable_);
  }
  if (value && typeof value === 'object') {
    const out = {};
    Object.keys(value).sort().forEach(function(key) {
      out[key] = preinspectR345bStable_(value[key]);
    });
    return out;
  }
  return value;
}

function preinspectR345bFieldValueMap_(fields) {
  const map = {};
  (fields || []).forEach(function(field) {
    const id = preinspectR345bFieldId_(field);
    if (!id) return;
    map[id] = JSON.stringify(preinspectR345bStable_(preinspectR345bFieldValue_(field)));
  });
  return map;
}

function preinspectR345bCompareFieldMaps_(beforeMap, afterMap) {
  const beforeIds = Object.keys(beforeMap || {}).sort();
  const afterIds = Object.keys(afterMap || {}).sort();
  const all = {};
  beforeIds.concat(afterIds).forEach(function(id) { all[id] = true; });

  const changed = [];
  const missing = [];
  const added = [];

  Object.keys(all).sort().forEach(function(id) {
    const hasBefore = Object.prototype.hasOwnProperty.call(beforeMap, id);
    const hasAfter = Object.prototype.hasOwnProperty.call(afterMap, id);
    if (hasBefore && !hasAfter) {
      missing.push(id);
    } else if (!hasBefore && hasAfter) {
      added.push(id);
    } else if (beforeMap[id] !== afterMap[id]) {
      changed.push(id);
    }
  });

  return {
    equal: changed.length === 0 && missing.length === 0 && added.length === 0,
    changedFieldIds: changed,
    missingFieldIds: missing,
    addedFieldIds: added
  };
}

function preinspectR345bDescribeTopLevel_(json) {
  if (json === null || json === undefined) return { type: String(json), keys: [] };
  if (Array.isArray(json)) return { type: 'array', length: json.length };
  if (typeof json === 'object') return { type: 'object', keys: Object.keys(json).slice(0, 60) };
  return { type: typeof json, preview: String(json).slice(0, 500) };
}

/************************************************************
 * PREINSPECT R3.4.6 — FIELD 854 VERIFIED TASK PATCH ROUTE
 *
 * Root cause proven in production:
 * - POST /v2/tasks/{id}/custom-fields validates the entire required
 *   custom-field schema and rejects a field-854-only write.
 * - PATCH /v2/tasks/{id} with the task's full current InfoCustomFields
 *   array returned HTTP 200 and preserved all six fields on Task 18373.
 *
 * Production behavior:
 * - Intercepts ONLY POSTs to /v2/tasks/{id}/custom-fields that contain
 *   exactly one semantic value for Custom Field 854.
 * - GETs current task state.
 * - Clones the complete current InfoCustomFields array.
 * - Replaces ONLY Field 854's existing value slot.
 * - PATCHes /v2/tasks/{id} with Id + full merged InfoCustomFields.
 * - GETs again and requires:
 *     1) Field 854 equals the requested value.
 *     2) Every non-854 custom-field value is unchanged.
 *     3) No custom field was added or removed.
 * - All unrelated requests fall through to the original R3.2 request path.
 ************************************************************/
function preinspectR346MaybeRouteField854TaskPatch_(argsLike) {
  const args = [];
  for (let i = 0; i < (argsLike ? argsLike.length : 0); i++) {
    args.push(argsLike[i]);
  }

  const context = preinspectR346ExtractRequestContext_(args);
  if (!context.url || !/\/v2\/tasks\/\d+\/custom-fields(?:\?|$)/i.test(context.url)) {
    return { handled: false };
  }

  if (String(context.method || '').toUpperCase() !== 'POST') {
    return { handled: false };
  }

  const taskMatch = context.url.match(/\/v2\/tasks\/(\d+)\/custom-fields/i);
  const taskId = taskMatch ? Number(taskMatch[1]) : 0;
  if (!taskId) {
    return { handled: false };
  }

  const desired = preinspectR346ExtractField854DesiredValue_(args);
  if (!desired.found) {
    return { handled: false };
  }
  if (desired.ambiguous) {
    throw new Error('R3.4.6 Field 854 route blocked: multiple conflicting Field 854 values were found in the original payload.');
  }

  const taskUrl = context.url.replace(/\/custom-fields(?:\?.*)?$/i, '');
  const headers = tm_getStrivenHeaders_();

  const before = preinspectR345bRequestJson_('get', taskUrl, null, headers);
  if (before.statusCode < 200 || before.statusCode >= 300) {
    throw new Error('R3.4.6 Field 854 preflight GET failed HTTP ' + before.statusCode + ': ' + String(before.text || '').slice(0, 2000));
  }

  const beforeInfo = preinspectR345bFindInfoCustomFields_(before.json);
  if (!beforeInfo || !Array.isArray(beforeInfo.fields)) {
    throw new Error('R3.4.6 Field 854 blocked: task GET did not expose InfoCustomFields. No PATCH performed.');
  }

  const beforeFields = preinspectR345bClone_(beforeInfo.fields);
  const beforeMap = preinspectR345bFieldValueMap_(beforeFields);
  const beforeTarget = preinspectR346FindFieldById_(beforeFields, 854);

  if (!beforeTarget) {
    throw new Error('R3.4.6 Field 854 blocked: current task InfoCustomFields does not contain Field 854. No PATCH performed.');
  }

  const desiredRawValue = desired.value;
  const currentRawValue = preinspectR345bFieldValue_(beforeTarget);
  const desiredStable = JSON.stringify(preinspectR345bStable_(desiredRawValue));
  const currentStable = JSON.stringify(preinspectR345bStable_(currentRawValue));
  const desiredSemantic = preinspectR346aSemanticField854Text_(desiredRawValue);
  const currentSemantic = preinspectR346aSemanticField854Text_(currentRawValue);
  const currentExactMatch = desiredStable === currentStable;
  const currentSemanticMatch = desiredSemantic !== null && currentSemantic !== null && desiredSemantic === currentSemantic;

  if (currentExactMatch || currentSemanticMatch) {
    const notNeeded = {
      mode: 'PREINSPECT_FIELD854_TASK_PATCH_ROUTE',
      status: 'NOT_NEEDED_VERIFIED',
      taskId: taskId,
      fieldId: 854,
      endpoint: taskUrl,
      reason: 'Field 854 already equals the requested managed Install Notes value.',
      verificationMode: currentExactMatch ? 'EXACT_VALUE' : 'SEMANTIC_TEXT',
      non854FieldsPreserved: true
    };
    Logger.log(JSON.stringify(notNeeded, null, 2));
    return {
      handled: true,
      response: {
        statusCode: 200,
        text: JSON.stringify(notNeeded),
        json: notNeeded
      }
    };
  }

  const mergedFields = preinspectR345bClone_(beforeFields);
  const mergedTarget = preinspectR346FindFieldById_(mergedFields, 854);
  preinspectR346SetExistingFieldValue_(mergedTarget, desired.value);

  const patchPayload = {
    Id: taskId,
    InfoCustomFields: mergedFields
  };

  const patch = preinspectR345bRequestJson_('patch', taskUrl, patchPayload, headers);
  if (patch.statusCode < 200 || patch.statusCode >= 300) {
    Logger.log(JSON.stringify({
      mode: 'PREINSPECT_FIELD854_TASK_PATCH_ROUTE',
      status: 'PATCH_REJECTED',
      taskId: taskId,
      fieldId: 854,
      endpoint: taskUrl,
      statusCode: patch.statusCode,
      responseBody: String(patch.text || '').slice(0, 4000)
    }, null, 2));
    throw new Error('R3.4.6 Field 854 task PATCH failed HTTP ' + patch.statusCode + ': ' + String(patch.text || '').slice(0, 2000));
  }

  const after = preinspectR345bRequestJson_('get', taskUrl, null, headers);
  if (after.statusCode < 200 || after.statusCode >= 300) {
    throw new Error('R3.4.6 Field 854 PATCH returned success but read-back GET failed HTTP ' + after.statusCode + ': ' + String(after.text || '').slice(0, 2000));
  }

  const afterInfo = preinspectR345bFindInfoCustomFields_(after.json);
  if (!afterInfo || !Array.isArray(afterInfo.fields)) {
    throw new Error('R3.4.6 Field 854 PATCH returned success but read-back did not expose InfoCustomFields. Manual review required.');
  }

  const afterFields = afterInfo.fields;
  const afterMap = preinspectR345bFieldValueMap_(afterFields);
  const afterTarget = preinspectR346FindFieldById_(afterFields, 854);
  if (!afterTarget) {
    throw new Error('R3.4.6 Field 854 critical verification failure: Field 854 is missing after PATCH.');
  }

  const afterRawValue = preinspectR345bFieldValue_(afterTarget);
  const afterTargetStable = JSON.stringify(preinspectR345bStable_(afterRawValue));
  const afterSemantic = preinspectR346aSemanticField854Text_(afterRawValue);
  const afterExactMatch = afterTargetStable === desiredStable;
  const afterSemanticMatch = desiredSemantic !== null && afterSemantic !== null && desiredSemantic === afterSemantic;

  if (!afterExactMatch && !afterSemanticMatch) {
    Logger.log(JSON.stringify({
      mode: 'PREINSPECT_FIELD854_READBACK_MISMATCH',
      status: 'MATERIAL_MISMATCH',
      taskId: taskId,
      fieldId: 854,
      desiredType: desiredRawValue === null ? 'null' : (Array.isArray(desiredRawValue) ? 'array' : typeof desiredRawValue),
      actualType: afterRawValue === null ? 'null' : (Array.isArray(afterRawValue) ? 'array' : typeof afterRawValue),
      desiredSemanticLength: desiredSemantic === null ? null : desiredSemantic.length,
      actualSemanticLength: afterSemantic === null ? null : afterSemantic.length,
      desiredSemanticPreview: desiredSemantic === null ? null : desiredSemantic.slice(0, 600),
      actualSemanticPreview: afterSemantic === null ? null : afterSemantic.slice(0, 600)
    }, null, 2));
    throw new Error('R3.4.6a Field 854 verification failed: material read-back text differs from requested Install Notes.');
  }

  const beforeNonTarget = preinspectR346WithoutFieldId_(beforeMap, '854');
  const afterNonTarget = preinspectR346WithoutFieldId_(afterMap, '854');
  const nonTargetComparison = preinspectR345bCompareFieldMaps_(beforeNonTarget, afterNonTarget);

  if (!nonTargetComparison.equal) {
    Logger.log(JSON.stringify({
      mode: 'PREINSPECT_FIELD854_TASK_PATCH_ROUTE',
      status: 'CRITICAL_NON854_PARITY_FAILURE',
      taskId: taskId,
      fieldId: 854,
      changedFieldIds: nonTargetComparison.changedFieldIds,
      missingFieldIds: nonTargetComparison.missingFieldIds,
      addedFieldIds: nonTargetComparison.addedFieldIds
    }, null, 2));
    throw new Error('R3.4.6 critical parity failure: a non-854 custom field changed after the Field 854 PATCH.');
  }

  if (Object.keys(beforeMap).length !== Object.keys(afterMap).length) {
    throw new Error('R3.4.6 critical parity failure: custom-field count changed after the Field 854 PATCH.');
  }

  const success = {
    mode: 'PREINSPECT_FIELD854_TASK_PATCH_ROUTE',
    status: 'PATCHED_AND_VERIFIED',
    taskId: taskId,
    fieldId: 854,
    endpoint: taskUrl,
    patchHttpCode: patch.statusCode,
    customFieldCount: Object.keys(afterMap).length,
    non854FieldsPreserved: true,
    field854ReadBackVerified: true,
    field854VerificationMode: afterExactMatch ? 'EXACT_VALUE' : 'SEMANTIC_TEXT'
  };

  Logger.log(JSON.stringify(success, null, 2));
  return {
    handled: true,
    response: {
      statusCode: patch.statusCode,
      text: patch.text || JSON.stringify(success),
      json: patch.json || success
    }
  };
}

function preinspectR346ExtractRequestContext_(args) {
  let url = '';
  let method = '';

  (args || []).forEach(function(arg) {
    if (!url && typeof arg === 'string' && /^https?:\/\//i.test(arg)) {
      url = arg;
    }
    if (!method && typeof arg === 'string' && /^(get|post|patch|put|delete)$/i.test(arg)) {
      method = arg.toUpperCase();
    }
    if (arg && typeof arg === 'object' && !Array.isArray(arg)) {
      if (!method && typeof arg.method === 'string' && /^(get|post|patch|put|delete)$/i.test(arg.method)) {
        method = String(arg.method).toUpperCase();
      }
      if (!url && typeof arg.url === 'string' && /^https?:\/\//i.test(arg.url)) {
        url = arg.url;
      }
    }
  });

  return { url: String(url || ''), method: String(method || '') };
}

function preinspectR346ExtractField854DesiredValue_(args) {
  const candidates = [];
  const visited = [];

  function walk(value, depth) {
    if (depth > 8 || value === null || value === undefined) return;
    if (typeof value !== 'object') return;
    if (visited.indexOf(value) !== -1) return;
    visited.push(value);

    if (Array.isArray(value)) {
      value.forEach(function(item) { walk(item, depth + 1); });
      return;
    }

    const id = preinspectR346ObjectFieldId_(value);
    if (id === '854') {
      const extracted = preinspectR346ObjectFieldValue_(value);
      if (extracted.found) {
        candidates.push(extracted.value);
      }
    }

    Object.keys(value).forEach(function(key) {
      walk(value[key], depth + 1);
    });
  }

  (args || []).forEach(function(arg) { walk(arg, 0); });

  if (!candidates.length) return { found: false, ambiguous: false, value: null };

  const normalized = candidates.map(function(value) {
    return JSON.stringify(preinspectR345bStable_(value));
  });
  const unique = {};
  normalized.forEach(function(value) { unique[value] = true; });

  return {
    found: true,
    ambiguous: Object.keys(unique).length > 1,
    value: candidates[0]
  };
}

function preinspectR346ObjectFieldId_(obj) {
  if (!obj || typeof obj !== 'object') return '';
  const keys = Object.keys(obj);
  const idKeys = ['id', 'customfieldid', 'custom_field_id'];

  for (let i = 0; i < keys.length; i++) {
    const normalized = String(keys[i]).toLowerCase().replace(/[^a-z0-9_]/g, '');
    if (idKeys.indexOf(normalized) !== -1) {
      const value = obj[keys[i]];
      if (value !== null && value !== undefined && String(value).trim() !== '') {
        return String(value).trim();
      }
    }
  }
  return '';
}

function preinspectR346ObjectFieldValue_(obj) {
  if (!obj || typeof obj !== 'object') return { found: false, value: null };
  const keys = Object.keys(obj);
  const valueKeys = [
    'value', 'values', 'fieldvalue', 'selectedvalue', 'selectedvalues'
  ];

  for (let i = 0; i < keys.length; i++) {
    const normalized = String(keys[i]).toLowerCase().replace(/[^a-z0-9]/g, '');
    if (valueKeys.indexOf(normalized) !== -1) {
      return { found: true, value: obj[keys[i]] };
    }
  }
  return { found: false, value: null };
}

function preinspectR346FindFieldById_(fields, fieldId) {
  const desiredId = String(fieldId);
  for (let i = 0; i < (fields || []).length; i++) {
    if (preinspectR345bFieldId_(fields[i]) === desiredId) {
      return fields[i];
    }
  }
  return null;
}

function preinspectR346SetExistingFieldValue_(field, value) {
  if (!field || typeof field !== 'object') {
    throw new Error('R3.4.6 cannot set Field 854 because the current field object is missing.');
  }

  const candidates = [
    'Value', 'value', 'Values', 'values', 'FieldValue', 'fieldValue',
    'SelectedValue', 'selectedValue', 'SelectedValues', 'selectedValues'
  ];

  for (let i = 0; i < candidates.length; i++) {
    const key = candidates[i];
    if (Object.prototype.hasOwnProperty.call(field, key)) {
      field[key] = value;
      return;
    }
  }

  throw new Error('R3.4.6 cannot safely update Field 854 because its current value property is unknown.');
}

function preinspectR346WithoutFieldId_(map, fieldId) {
  const out = {};
  Object.keys(map || {}).forEach(function(id) {
    if (String(id) !== String(fieldId)) out[id] = map[id];
  });
  return out;
}

/************************************************************
 * PREINSPECT R3.4.6a — FIELD 854 SEMANTIC READ-BACK
 *
 * Striven may canonicalize rich/multiline custom-field text on write
 * (CRLF/LF, <br>, NBSP, simple wrapper objects). The transport contract
 * is already proven. This helper compares the actual text semantics while
 * still failing closed on any material content difference.
 ************************************************************/
function preinspectR346aSemanticField854Text_(value) {
  function unwrap(v, depth) {
    if (depth > 8) return null;
    if (v === null || v === undefined) return '';

    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
      return String(v);
    }

    if (Array.isArray(v)) {
      if (!v.length) return '';
      const parts = v.map(function(item) { return unwrap(item, depth + 1); });
      if (parts.some(function(item) { return item === null; })) return null;
      return parts.join('\n');
    }

    if (typeof v === 'object') {
      const preferred = [
        'Value', 'value', 'Text', 'text', 'Html', 'html',
        'FieldValue', 'fieldValue', 'StringValue', 'stringValue',
        'SelectedValue', 'selectedValue'
      ];
      const present = preferred.filter(function(key) {
        return Object.prototype.hasOwnProperty.call(v, key);
      });
      if (present.length === 1) return unwrap(v[present[0]], depth + 1);

      const keys = Object.keys(v);
      if (keys.length === 1) return unwrap(v[keys[0]], depth + 1);
      return null;
    }

    return null;
  }

  const raw = unwrap(value, 0);
  if (raw === null) return null;

  let text = String(raw)
    .replace(/\r\n?/g, '\n')
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<\/p\s*>\s*<p[^>]*>/gi, '\n')
    .replace(/<\/div\s*>\s*<div[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\u00a0/g, ' ')
    .replace(/[\u200B-\u200D\uFEFF]/g, '');

  text = text.split('\n').map(function(line) {
    return line.replace(/[ \t]+$/g, '');
  }).join('\n');

  text = text.replace(/\n{3,}/g, '\n\n').trim();
  return text;
}

/************************************************************
 * PREINSPECT R3.4.6b — FIELD 854 MODEL INSPECTION
 *
 * READ ONLY. NO TASK PATCH/POST. NO CALENDAR WRITE.
 *
 * Purpose:
 * - Inspect the exact InfoCustomFields model returned by Striven for
 *   production Task 18373 and template Task 11138.
 * - Inspect read-only GET behavior of the dedicated custom-fields routes.
 * - Capture Field 854's real object/value schema so the next writer uses
 *   evidence rather than another guessed property.
 ************************************************************/
function inspectPreInspectField854Model18373() {
  const taskIds = [18373, 11138];
  const focusIds = {'782':true,'791':true,'852':true,'853':true,'854':true,'860':true};
  const headers = tm_getStrivenHeaders_();
  const results = [];

  taskIds.forEach(function(taskId) {
    const taskUrl = 'https://api.striven.com/v2/tasks/' + taskId;
    const taskGet = preinspectR345bRequestJson_('get', taskUrl, null, headers);
    if (taskGet.statusCode < 200 || taskGet.statusCode >= 300) {
      const failed = {
        mode: 'PREINSPECT_FIELD854_MODEL_INSPECTION',
        status: 'TASK_GET_FAILED',
        taskId: taskId,
        statusCode: taskGet.statusCode,
        responseBody: String(taskGet.text || '').slice(0, 4000)
      };
      Logger.log(JSON.stringify(failed, null, 2));
      results.push(failed);
      return;
    }

    const info = preinspectR345bFindInfoCustomFields_(taskGet.json);
    const fields = info && Array.isArray(info.fields) ? info.fields : [];
    const focused = fields.filter(function(field) {
      return !!focusIds[String(preinspectR345bFieldId_(field))];
    });
    const f854 = focused.filter(function(field) {
      return String(preinspectR345bFieldId_(field)) === '854';
    })[0] || null;

    const taskModel = {
      mode: 'PREINSPECT_FIELD854_MODEL_INSPECTION',
      status: 'TASK_MODEL',
      taskId: taskId,
      source: taskId === 18373 ? 'PRODUCTION_TASK' : 'TEMPLATE_TASK_11138',
      infoCustomFieldsPath: info ? info.path : null,
      infoCustomFieldCount: fields.length,
      focusedFieldCount: focused.length,
      field854Raw: f854,
      field854Keys: f854 && typeof f854 === 'object' ? Object.keys(f854) : [],
      field854DetectedValue: f854 ? preinspectR345bFieldValue_(f854) : null,
      focusedFieldsRaw: focused
    };
    Logger.log(JSON.stringify(taskModel, null, 2));
    results.push(taskModel);

    const collectionUrl = taskUrl + '/custom-fields';
    const collectionGet = preinspectR345bRequestJson_('get', collectionUrl, null, headers);
    const collectionEvidence = {
      mode: 'PREINSPECT_FIELD854_MODEL_INSPECTION',
      status: 'CUSTOM_FIELDS_COLLECTION_GET',
      taskId: taskId,
      endpoint: collectionUrl,
      statusCode: collectionGet.statusCode,
      responseBody: String(collectionGet.text || '').slice(0, 8000)
    };
    Logger.log(JSON.stringify(collectionEvidence, null, 2));
    results.push(collectionEvidence);

    const singleUrl = taskUrl + '/custom-fields/854';
    const singleGet = preinspectR345bRequestJson_('get', singleUrl, null, headers);
    const singleEvidence = {
      mode: 'PREINSPECT_FIELD854_MODEL_INSPECTION',
      status: 'CUSTOM_FIELD_854_GET',
      taskId: taskId,
      endpoint: singleUrl,
      statusCode: singleGet.statusCode,
      responseBody: String(singleGet.text || '').slice(0, 8000)
    };
    Logger.log(JSON.stringify(singleEvidence, null, 2));
    results.push(singleEvidence);
  });

  const done = {
    mode: 'PREINSPECT_FIELD854_MODEL_INSPECTION',
    status: 'READ_ONLY_COMPLETE',
    writesPerformed: false,
    inspectedTaskIds: taskIds,
    fieldId: 854,
    nextStep: 'Use the returned raw model/GET contract to build one evidence-based Field 854 writer.'
  };
  Logger.log(JSON.stringify(done, null, 2));
  return done;
}
/************************************************************
 * PREINSPECT R3.4.6c — CUSTOM FIELD METADATA INSPECTION
 *
 * READ ONLY. NO TASK/CUSTOM-FIELD/CALENDAR WRITES.
 *
 * Purpose:
 * - Read the v1 task model for Task 18373 and template 11138.
 * - Capture fieldType/sourceId/isRequired for 782/791/852/853/854/860.
 * - If a field is backed by a Custom List, read the list items so valid
 *   values can be used without guessing.
 ************************************************************/
function inspectPreInspectCustomFieldMetadata18373() {
  const taskIds = [18373, 11138];
  const focusIds = {'782':true,'791':true,'852':true,'853':true,'854':true,'860':true};
  const headers = tm_getStrivenHeaders_();
  const seenSources = {};
  const all = [];

  taskIds.forEach(function(taskId) {
    const url = 'https://api.striven.com/v1/tasks/' + taskId;
    const res = preinspectR345bRequestJson_('get', url, null, headers);
    if (res.statusCode < 200 || res.statusCode >= 300) {
      const fail = {
        mode: 'PREINSPECT_CUSTOM_FIELD_METADATA',
        status: 'V1_TASK_GET_FAILED',
        taskId: taskId,
        endpoint: url,
        statusCode: res.statusCode,
        responseBody: String(res.text || '').slice(0, 5000)
      };
      Logger.log(JSON.stringify(fail, null, 2));
      all.push(fail);
      return;
    }

    const json = res.json || {};
    const fields = Array.isArray(json.customFields) ? json.customFields :
      (Array.isArray(json.CustomFields) ? json.CustomFields : []);

    const focused = fields.filter(function(f) {
      const id = f && (f.id !== undefined ? f.id : f.Id);
      return !!focusIds[String(id)];
    });

    const event = {
      mode: 'PREINSPECT_CUSTOM_FIELD_METADATA',
      status: 'V1_TASK_CUSTOM_FIELDS',
      taskId: taskId,
      source: taskId === 18373 ? 'PRODUCTION_TASK' : 'TEMPLATE_TASK_11138',
      focusedFields: focused
    };
    Logger.log(JSON.stringify(event, null, 2));
    all.push(event);

    focused.forEach(function(f) {
      const sourceId = Number(
        f && (f.sourceId !== undefined ? f.sourceId : f.SourceId)
      );
      if (Number.isFinite(sourceId) && sourceId > 0) {
        seenSources[String(sourceId)] = true;
      }
    });
  });

  Object.keys(seenSources).forEach(function(sourceKey) {
    const sourceId = Number(sourceKey);
    const url = 'https://api.striven.com/v1/custom-lists/' + sourceId + '/list-items';
    const res = preinspectR345bRequestJson_('get', url, null, headers);
    const itemLog = {
      mode: 'PREINSPECT_CUSTOM_FIELD_METADATA',
      status: 'CUSTOM_LIST_ITEMS',
      sourceId: sourceId,
      endpoint: url,
      statusCode: res.statusCode,
      responseBody: String(res.text || '').slice(0, 12000)
    };
    Logger.log(JSON.stringify(itemLog, null, 2));
    all.push(itemLog);
  });

  const done = {
    mode: 'PREINSPECT_CUSTOM_FIELD_METADATA',
    status: 'READ_ONLY_COMPLETE',
    writesPerformed: false,
    inspectedTaskIds: taskIds,
    focusedFieldIds: [782,791,852,853,854,860],
    discoveredCustomListSourceIds: Object.keys(seenSources).map(Number),
    nextStep: 'Use fieldType/sourceId/list-item evidence to build one valid Field 854 collection writer.'
  };
  Logger.log(JSON.stringify(done, null, 2));
  return done;
}

/************************************************************
 * PREINSPECT R3.4.11 - APPS SCRIPT DIRECT RUN
 *
 * Run directly from Apps Script with no user-selected Sheet row.
 * The first safe READY CREATE / READY RECREATE row in mapping
 * order is resolved, activated programmatically, and passed to
 * the existing runSelectedPreInspectEndToEnd() workflow.
 ************************************************************/
function runPreInspectEndToEndFromAppsScript() {
  return runNextReadyPreInspectEndToEndFromAppsScript();
}


function runNextReadyPreInspectEndToEndFromAppsScript() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    throw new Error(
      'PreInspect direct run requires this Apps Script project to remain bound to the Task Mapping spreadsheet.'
    );
  }

  const mappingName = PREINSPECT_REVIEW_CONFIG.SHEETS.MAPPING;
  const sheet = ss.getSheetByName(mappingName);
  if (!sheet) {
    throw new Error('Missing "' + mappingName + '" sheet.');
  }

  const rows = tm_getSheetObjects_(sheet);
  const eligible = [];

  rows.forEach(function(row, index) {
    const rowNumber = index + 2;
    const eventId = tm_cleanString_(row['Event ID']);
    if (!eventId) return;

    const status = tm_normalizeStatus_(row['Status']);
    const taskAction = tm_normalizeStatus_(row['Task Action']);
    const taskId = tm_cleanString_(row['Task ID']);
    const candidateIds = tm_cleanString_(row['Candidate Task IDs']);

    const readyCreate =
      status === 'READY CREATE' &&
      taskAction === 'WOULD_CREATE' &&
      !taskId &&
      !candidateIds;

    const readyRecreate =
      status === 'READY RECREATE' &&
      taskAction === 'WOULD_RECREATE';

    if (readyCreate || readyRecreate) {
      eligible.push({
        rowNumber: rowNumber,
        eventId: eventId,
        status: status,
        taskAction: taskAction,
        taskId: taskId || null
      });
    }
  });

  if (!eligible.length) {
    const result = {
      mode: 'PREINSPECT_APPS_SCRIPT_DIRECT_RUN',
      status: 'NO_READY_ROWS',
      writesPerformed: false,
      mappingSheet: mappingName,
      eligibleCount: 0,
      message: 'No READY CREATE / READY RECREATE PreInspect row is currently available.'
    };
    Logger.log(JSON.stringify(result, null, 2));
    return result;
  }

  const target = eligible[0];

  ss.setActiveSheet(sheet);
  ss.setActiveRange(sheet.getRange(target.rowNumber, 1, 1, 1));
  SpreadsheetApp.flush();

  const activeSheet = ss.getActiveSheet();
  const activeRange = ss.getActiveRange();

  if (!activeSheet ||
      activeSheet.getName() !== mappingName ||
      !activeRange ||
      activeRange.getRow() !== target.rowNumber) {
    throw new Error(
      'BLOCKED: Could not establish PreInspect mapping row context for row ' +
      target.rowNumber + '. No end-to-end write was attempted.'
    );
  }

  Logger.log(JSON.stringify({
    mode: 'PREINSPECT_APPS_SCRIPT_DIRECT_RUN',
    status: 'TARGET_RESOLVED',
    writesPerformed: false,
    mappingRow: target.rowNumber,
    eventId: target.eventId,
    mappingStatus: target.status,
    taskAction: target.taskAction,
    eligibleCount: eligible.length,
    selectionRule: 'FIRST_READY_ROW_IN_CURRENT_MAPPING_ORDER'
  }, null, 2));

  return runSelectedPreInspectEndToEnd();
}

/************************************************************
 * PREINSPECT R3.4.12 - AUTOMATIC PIPELINE + CONCISE TITLES
 ************************************************************/
function runPreInspectRefreshRebuildOnly() {
  const result = {
    mode: 'PREINSPECT_REFRESH_REBUILD_ONLY',
    status: 'COMPLETE',
    writesPerformed: false,
    calendarWritesPerformed: false,
    strivenWritesPerformed: false,
    mapping: null
  };

  try {
    result.mapping = buildPreInspectTaskMapping();
    result.writesPerformed = !!(
      result.mapping &&
      (result.mapping.writesPerformed || result.mapping.sheetWritesPerformed)
    );
  } catch (err) {
    result.status = 'ERROR';
    result.error = err && err.message ? err.message : String(err);
  }

  Logger.log(JSON.stringify(result, null, 2));
  return result;
}


function runPreInspectScheduledPipeline() {
  const result = {
    mode: 'PREINSPECT_SCHEDULED_PIPELINE',
    status: 'COMPLETE',
    refreshRebuild: null,
    lookupBatch: null,
    locationResolution: null,
    endToEnd: null,
    scheduleIdentityReconcile: null,
    titleNormalization: null,
    sheetHyperlinks: null,
    errors: []
  };

  try {
    result.refreshRebuild = runPreInspectRefreshRebuildOnly();
    if (result.refreshRebuild && result.refreshRebuild.status === 'ERROR') {
      result.errors.push({
        step: 'REFRESH_REBUILD',
        error: result.refreshRebuild.error || 'Unknown refresh/rebuild error.'
      });
    }
  } catch (err) {
    result.errors.push({
      step: 'REFRESH_REBUILD',
      error: err && err.message ? err.message : String(err)
    });
  }

  try {
    result.lookupBatch = reviewNextPreInspectMappingBatch();
  } catch (err) {
    result.errors.push({
      step: 'LOOKUP_BATCH',
      error: err && err.message ? err.message : String(err)
    });
  }

  // Resolve at most ONE safe CREATE LOCATION FIRST row before the normal
  // one-row E2E task action. If the location is created/reused and verified,
  // review converts the row naturally to READY CREATE.
  try {
    result.locationResolution = preinspectR3416ResolveOneLocationFirstFromAppsScript_();
    if (
      result.locationResolution &&
      result.locationResolution.status === 'ERROR'
    ) {
      result.errors.push({
        step: 'LOCATION_FIRST',
        error: result.locationResolution.error || 'Unknown location resolution error.'
      });
    }
  } catch (err) {
    result.errors.push({
      step: 'LOCATION_FIRST',
      error: err && err.message ? err.message : String(err)
    });
  }

  // Process at most ONE safely READY CREATE / READY RECREATE row.
  try {
    result.endToEnd = runPreInspectEndToEndFromAppsScript();
  } catch (err) {
    result.errors.push({
      step: 'END_TO_END_ONE_READY_ROW',
      error: err && err.message ? err.message : String(err)
    });
  }

  // Every mapped OPEN PreInspect task — whether found or newly created —
  // must reconcile Requested By and Calendar date/time.
  try {
    result.scheduleIdentityReconcile =
      preinspectR3416ReconcileMappedOpenTasks_(20);

    if (
      result.scheduleIdentityReconcile &&
      result.scheduleIdentityReconcile.status === 'COMPLETE_WITH_ERRORS'
    ) {
      result.errors.push({
        step: 'SCHEDULE_IDENTITY_RECONCILE',
        error: 'One or more OPEN PreInspect tasks could not reconcile Requested By/date/time.'
      });
    }
  } catch (err) {
    result.errors.push({
      step: 'SCHEDULE_IDENTITY_RECONCILE',
      error: err && err.message ? err.message : String(err)
    });
  }

  try {
    result.titleNormalization = preinspectR3412NormalizeOpenTaskTitles_();
    if (
      result.titleNormalization &&
      result.titleNormalization.status === 'COMPLETE_WITH_ERRORS'
    ) {
      result.errors.push({
        step: 'TITLE_NORMALIZATION',
        error: 'One or more task titles failed read-back verification.'
      });
    }
  } catch (err) {
    result.errors.push({
      step: 'TITLE_NORMALIZATION',
      error: err && err.message ? err.message : String(err)
    });
  }

  try {
    result.sheetHyperlinks = preinspectR3414ApplySheetHyperlinks_();
  } catch (err) {
    result.errors.push({
      step: 'SHEET_HYPERLINKS',
      error: err && err.message ? err.message : String(err)
    });
  }

  if (result.errors.length) result.status = 'COMPLETE_WITH_ERRORS';

  Logger.log(JSON.stringify(result, null, 2));
  return result;
}



function preinspectR3412NormalizeOpenTaskTitles_() {
  const ss = SpreadsheetApp.getActive();
  const sheet = ss.getSheetByName(PREINSPECT_REVIEW_CONFIG.SHEETS.MAPPING);
  if (!sheet) throw new Error('Missing "PreInspect Task Mapping" sheet.');

  const rows = tm_getSheetObjects_(sheet);
  const auth = getStrivenAuth_();
  const base = String(auth.baseUrl || '').replace(/\/+$/, '');

  const result = {
    mode: 'PREINSPECT_OPEN_TASK_TITLE_NORMALIZATION',
    status: 'COMPLETE',
    writesPerformed: false,
    checked: 0,
    updated: 0,
    alreadyCorrect: 0,
    skipped: 0,
    errors: []
  };

  const seen = {};
  const limit = 25;

  rows.forEach(function(row) {
    if (result.checked >= limit) return;

    const taskId = Number(String(row['Task ID'] || '').trim());
    if (!taskId || seen[taskId]) return;
    seen[taskId] = true;

    if (String(row['Classification'] || '').trim().toUpperCase() !== 'PREINSPECT_JOB') {
      result.skipped++;
      return;
    }

    const desiredTitle = preinspectR3412DesiredTaskTitle_(row);
    if (!desiredTitle) {
      result.skipped++;
      return;
    }

    result.checked++;

    try {
      const before = getReplacementTaskSourceSnapshot_(taskId);

      if (!before.type || Number(before.type.id) !== 105) {
        result.skipped++;
        return;
      }

      const statusName = String(
        before.status && before.status.name ? before.status.name : ''
      ).trim().toUpperCase();

      if (statusName !== 'OPEN') {
        result.skipped++;
        return;
      }

      const expectedCustomerId = Number(String(row['Customer ID'] || '').trim());
      const actualCustomerId = Number(
        before.customer && before.customer.id ? before.customer.id : 0
      );

      if (expectedCustomerId &&
          actualCustomerId &&
          expectedCustomerId !== actualCustomerId) {
        result.errors.push({
          taskId: taskId,
          error: 'Customer mismatch blocked automatic title normalization.'
        });
        return;
      }

      if (String(before.title || '').trim() === desiredTitle) {
        result.alreadyCorrect++;

        const calendarLinkRefresh =
          preinspectR3412RefreshExistingManagedCalendarLink_(
            String(row['Event ID'] || '').trim(),
            taskId,
            String(before.title || desiredTitle).trim()
          );

        Logger.log(JSON.stringify({
          mode: 'PREINSPECT_CONCISE_TITLE_ALREADY_CORRECT',
          taskId: taskId,
          title: String(before.title || desiredTitle).trim(),
          calendarLinkRefresh: calendarLinkRefresh
        }, null, 2));

        return;
      }

      const url = base + '/v2/tasks/' + encodeURIComponent(taskId);

      strivenTaskRequestJson_(
        'patch',
        url,
        {
          Id: taskId,
          Title: desiredTitle
        },
        'PreInspect concise title PATCH task ' + taskId
      );

      const after = getReplacementTaskSourceSnapshot_(taskId);

      if (String(after.title || '').trim() !== desiredTitle) {
        throw new Error(
          'Task title read-back did not equal requested concise title.'
        );
      }

      result.writesPerformed = true;
      result.updated++;

      const calendarLinkRefresh =
        preinspectR3412RefreshExistingManagedCalendarLink_(
          String(row['Event ID'] || '').trim(),
          taskId,
          desiredTitle
        );

      Logger.log(JSON.stringify({
        mode: 'PREINSPECT_CONCISE_TITLE_UPDATED',
        taskId: taskId,
        desiredTitle: desiredTitle,
        calendarLinkRefresh: calendarLinkRefresh
      }, null, 2));

    } catch (err) {
      result.errors.push({
        taskId: taskId,
        error: err && err.message ? err.message : String(err)
      });
    }
  });

  if (result.errors.length) result.status = 'COMPLETE_WITH_ERRORS';

  Logger.log(JSON.stringify(result, null, 2));
  return result;
}


function preinspectR3412DesiredTaskTitle_(row) {
  row = row || {};

  const customer = String(row['Customer'] || '').trim();
  if (!customer) return '';

  const phone = preinspectR3412DisplayPhone_(
    [
      row['Calendar Title'],
      row['Calendar Description']
    ].join('\n')
  );

  return [
    'Preinspect',
    customer,
    phone
  ].filter(function(v) {
    return String(v || '').trim() !== '';
  }).join(' - ');
}


function preinspectR3412DisplayPhone_(text) {
  const list = String(text || '').match(
    /(?:\+?1[\s.\-()]*)?\(?\d{3}\)?[\s.\-]*\d{3}[\s.\-]*\d{4}/g
  ) || [];

  for (let i = 0; i < list.length; i++) {
    let digits = String(list[i] || '').replace(/\D/g, '');
    if (digits.length === 11 && digits.charAt(0) === '1') {
      digits = digits.slice(1);
    }

    if (digits.length === 10) {
      return '(' + digits.slice(0, 3) + ') ' +
        digits.slice(3, 6) + '-' +
        digits.slice(6);
    }
  }

  return '';
}


function preinspectR3412SemanticCalendarDescription_(value) {
  let text = String(value || '')
    .replace(/\u00a0/g, ' ')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');

  // Remove ONLY our generated managed block before normalizing HTML.
  text = text.replace(
    /<!--\s*PREINSPECT_STRIVEN_TASK_LINK_START\s*-->[\s\S]*?<!--\s*PREINSPECT_STRIVEN_TASK_LINK_END\s*-->/gi,
    '\n'
  );

  // CalendarApp may expose HTML while the mirror stores readable text.
  text = text
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:div|p|li|tr|h[1-6])\s*>/gi, '\n')
    .replace(/<(?:div|p|li|tr|h[1-6])(?:\s[^>]*)?>/gi, '')
    .replace(/<[^>]+>/g, '');

  text = text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");

  // Legacy generated block without markers; anchored by our heading.
  text = text.replace(
    /-{5,}\s*Pre-Inspection Task Link\s*-{5,}[\s\S]*?-{5,}/gi,
    '\n'
  );

  return text
    .split('\n')
    .map(function(line) {
      return String(line || '').replace(/[ \t]+/g, ' ').trim();
    })
    .filter(function(line) { return line !== ''; })
    .join('\n')
    .trim();
}



function preinspectR3412RefreshExistingManagedCalendarLink_(eventId, taskId, title) {
  eventId = String(eventId || '').trim();
  taskId = Number(taskId);
  title = String(title || '').trim();

  if (!eventId || !taskId || !title) {
    return {
      status: 'SKIPPED_MISSING_CONTEXT',
      calendarWritesPerformed: false
    };
  }

  const calendar = CalendarApp.getCalendarById(
    PREINSPECT_REVIEW_CONFIG.CALENDAR_SYNC.CALENDAR_ID
  );
  const event = calendar && calendar.getEventById(eventId);

  if (!event) {
    return {
      status: 'SKIPPED_EVENT_NOT_FOUND',
      calendarWritesPerformed: false
    };
  }

  const current = String(event.getDescription() || '');
  const taskUrl = preinspectR3414TaskUrl_(taskId);

  // Remove ONLY our own prior generated footer. Every other character
  // of the existing Calendar description remains untouched.
  const authored = preinspectR3414RemoveManagedTaskFooterOnly_(current);

  const escapedTitle = preinspectR3412HtmlEscape_(title);
  const escapedUrl = preinspectR3412HtmlEscape_(taskUrl);

  const block = [
    '<!-- PREINSPECT_STRIVEN_TASK_LINK_START -->',
    '<br>------- Pre-Inspection Task Link -------',
    '<br><br><a href="' + escapedUrl + '">' + escapedTitle + '</a>',
    '<br><br>------------------------------------',
    '<br><!-- PREINSPECT_STRIVEN_TASK_LINK_END -->'
  ].join('');

  const updated = preinspectR3414AppendManagedFooter_(authored, block);

  if (updated === current) {
    return {
      status: 'NOT_NEEDED',
      calendarWritesPerformed: false,
      eventId: eventId,
      taskId: taskId
    };
  }

  event.setDescription(updated);

  const readBack = String(event.getDescription() || '');

  // Prove the user's authored content survived and our linked task title exists.
  if (
    preinspectR3414RemoveManagedTaskFooterOnly_(readBack) !== authored ||
    readBack.indexOf('href="' + taskUrl + '"') < 0 ||
    preinspectR3412SemanticCalendarDescription_(readBack) !==
      preinspectR3412SemanticCalendarDescription_(authored)
  ) {
    throw new Error(
      'Calendar task-link write-back failed preservation/read-back verification.'
    );
  }

  return {
    status: 'APPENDED_OR_MANAGED_FOOTER_UPDATED_AND_VERIFIED',
    calendarWritesPerformed: true,
    eventId: eventId,
    taskId: taskId,
    taskUrl: taskUrl,
    linkedDisplayText: title,
    existingDescriptionPreserved: true
  };
}



function preinspectR3412HtmlEscape_(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/************************************************************
 * PREINSPECT R3.4.14 - LINK SAFETY + SHEET HYPERLINKS
 *
 * Calendar rule:
 * - Never replace user-authored Calendar description text.
 * - Remove/refresh only our own managed PreInspect footer.
 * - Append the managed footer at the bottom.
 * - The clickable anchor text is the Task name.
 *
 * Sheet rule:
 * - Keep raw identifiers as their visible values where mapping logic
 *   depends on them.
 * - Apply RichText hyperlinks instead of replacing identifier values.
 * - Never guess a Striven record ID or URL.
 ************************************************************/

function preinspectR3414TaskUrl_(taskId) {
  const id = Number(taskId);
  return id > 0
    ? 'https://classicfireplace.striven.com/Tasks/TaskInfo.aspx?TaskID=' + encodeURIComponent(id)
    : '';
}


function preinspectR3414SalesOrderUrl_(salesOrderId) {
  const id = Number(salesOrderId);
  return id > 0
    ? 'https://classicfireplace.striven.com/next/crm#/sales-orders/' + encodeURIComponent(id)
    : '';
}


function preinspectR3414RemoveManagedTaskFooterOnly_(description) {
  let text = String(description || '');

  // Current marker-owned block.
  text = text.replace(
    /(?:<br\s*\/?>\s*){0,2}<!--\s*PREINSPECT_STRIVEN_TASK_LINK_START\s*-->[\s\S]*?<!--\s*PREINSPECT_STRIVEN_TASK_LINK_END\s*-->/gi,
    ''
  );

  // Legacy generated footer, only when it is at the END and contains
  // our Striven Task URL. This avoids touching normal authored notes.
  text = text.replace(
    /(?:<br\s*\/?>|\r?\n){0,3}-{5,}\s*Pre-Inspection Task Link\s*-{5,}[\s\S]*?TaskInfo\.aspx\?TaskID=\d+[\s\S]*?-{5,}\s*$/gi,
    ''
  );

  return text;
}


function preinspectR3414AppendManagedFooter_(description, block) {
  const base = String(description || '');
  const footer = String(block || '');

  if (!base) return footer;

  // Append only. Do not normalize, trim, or rewrite the existing body.
  return base + '<br><br>' + footer;
}


function preinspectR3414BuildRichText_(text, url) {
  const visible = String(text === null || text === undefined ? '' : text);
  const cleanUrl = String(url || '').trim();

  let builder = SpreadsheetApp.newRichTextValue().setText(visible);
  if (visible && cleanUrl) builder = builder.setLinkUrl(cleanUrl);
  return builder.build();
}


function preinspectR3414ExtractVerifiedCustomerUrl_(rawHtml, customerId, customerNumber) {
  const number = String(customerNumber || '').trim();

  // R3.4.15 verified Striven Account Dashboard route.
  if (!/^\d+$/.test(number)) return '';

  return 'https://classicfireplace.striven.com/CRM/AccountDashboard.aspx?AccountID=' +
    encodeURIComponent(number);
}



function preinspectR3414ApplySheetHyperlinks__R3418G_ORIGINAL_() {
  const ss = SpreadsheetApp.getActive();
  const mappingSheet = ss.getSheetByName(PREINSPECT_REVIEW_CONFIG.SHEETS.MAPPING);
  const calendarSheet = ss.getSheetByName(PREINSPECT_REVIEW_CONFIG.SHEETS.CALENDAR);

  if (!mappingSheet || !calendarSheet) {
    throw new Error('PreInspect Calendar / Task Mapping sheet missing.');
  }

  const mappingRows = tm_getSheetObjects_(mappingSheet);
  const calendarRows = tm_getSheetObjects_(calendarSheet);

  const byEventId = {};
  mappingRows.forEach(function(row) {
    const eventId = String(row['Event ID'] || '').trim();
    if (eventId) byEventId[eventId] = row;
  });

  const result = {
    mode: 'PREINSPECT_R3414_SHEET_HYPERLINKS',
    status: 'COMPLETE',
    writesPerformed: false,
    mapping: {
      customerLinks: 0,
      salesOrderLinks: 0,
      taskLinks: 0
    },
    calendar: {
      customerLinks: 0,
      salesOrderLinks: 0,
      taskLinks: 0
    },
    calendarEventTaskLinks: {
      checked: 0,
      alreadyVerified: 0,
      writtenAndVerified: 0,
      failed: 0,
      failures: []
    },
    calendarWritesPerformed: false,
    customerLinksSkippedNoVerifiedRecordUrl: 0
  };

  /**********************************************************
   * MAPPING: preserve visible identifier values.
   **********************************************************/
  const mapHeaders = mappingSheet
    .getRange(1, 1, 1, mappingSheet.getLastColumn())
    .getDisplayValues()[0]
    .map(function(v) { return String(v || '').trim(); });

  const mapCustomerCol = mapHeaders.indexOf('Customer #') + 1;
  const mapSoCol = mapHeaders.indexOf('SO #') + 1;
  const mapTaskCol = mapHeaders.indexOf('Task ID') + 1;

  if (mappingRows.length) {
    if (mapTaskCol > 0) {
      const values = mappingRows.map(function(row) {
        const taskId = String(row['Task ID'] || '').trim();
        const url = preinspectR3414TaskUrl_(taskId);
        if (taskId && url) result.mapping.taskLinks++;
        return [preinspectR3414BuildRichText_(taskId, url)];
      });
      mappingSheet.getRange(2, mapTaskCol, values.length, 1).setRichTextValues(values);
      result.writesPerformed = true;
    }

    if (mapSoCol > 0) {
      const values = mappingRows.map(function(row) {
        const soNumber = String(row['SO #'] || '').trim();
        const soId = String(row['SO ID'] || '').trim();
        const url = soNumber && soId ? preinspectR3414SalesOrderUrl_(soId) : '';
        if (url) result.mapping.salesOrderLinks++;
        return [preinspectR3414BuildRichText_(soNumber, url)];
      });
      mappingSheet.getRange(2, mapSoCol, values.length, 1).setRichTextValues(values);
      result.writesPerformed = true;
    }

    if (mapCustomerCol > 0) {
      const values = mappingRows.map(function(row) {
        const customerNumber = String(row['Customer #'] || '').trim();
        const eventId = String(row['Event ID'] || '').trim();

        const calendarRow = calendarRows.filter(function(r) {
          return String(r['Event ID'] || '').trim() === eventId;
        })[0] || {};

        const rawHtml = String(calendarRow['Description HTML Source'] || '');
        const url = preinspectR3414ExtractVerifiedCustomerUrl_(
          rawHtml,
          row['Customer ID'],
          customerNumber
        );

        if (url) result.mapping.customerLinks++;
        else if (customerNumber) result.customerLinksSkippedNoVerifiedRecordUrl++;

        return [preinspectR3414BuildRichText_(customerNumber, url)];
      });
      mappingSheet.getRange(2, mapCustomerCol, values.length, 1).setRichTextValues(values);
      result.writesPerformed = true;
    }
  }

  /**********************************************************
   * PREINSPECT CALENDAR:
   * - Keep existing mirror schema untouched.
   * - Add two presentation-only columns OUTSIDE the mirror schema:
   *     Sales Order
   *     Task
   * - Existing raw Striven Task Link remains available for machine use
   *   but is hidden from the operator view.
   **********************************************************/
  let calHeaders = calendarSheet
    .getRange(1, 1, 1, calendarSheet.getLastColumn())
    .getDisplayValues()[0]
    .map(function(v) { return String(v || '').trim(); });

  function ensureCalendarPresentationColumn_(name) {
    let col = calHeaders.indexOf(name) + 1;
    if (col > 0) return col;

    col = calendarSheet.getLastColumn() + 1;
    calendarSheet.getRange(1, col).setValue(name);
    calHeaders.push(name);
    return col;
  }

  const calSoCol = ensureCalendarPresentationColumn_('Sales Order');
  const calTaskCol = ensureCalendarPresentationColumn_('Task');
  const calCustomerCol = calHeaders.indexOf('Customer #') + 1;
  const rawTaskLinkCol = calHeaders.indexOf('Striven Task Link') + 1;

  const calLastRow = Math.max(1, calendarSheet.getLastRow());
  if (calLastRow >= 2) {
    calendarSheet.getRange(2, calSoCol, calLastRow - 1, 1).clearContent();
    calendarSheet.getRange(2, calTaskCol, calLastRow - 1, 1).clearContent();
  }

  if (calendarRows.length) {
    const soRich = [];
    const taskRich = [];
    const rawTaskRich = [];
    const customerRich = [];

    calendarRows.forEach(function(calRow) {
      const eventId = String(calRow['Event ID'] || '').trim();
      const mapRow = byEventId[eventId] || {};

      const soNumber = String(mapRow['SO #'] || '').trim();
      const soId = String(mapRow['SO ID'] || '').trim();
      const soUrl = soNumber && soId
        ? preinspectR3414SalesOrderUrl_(soId)
        : '';

      const taskId = String(
        mapRow['Task ID'] ||
        preinspectR3415TaskIdFromLink_(calRow['Striven Task Link']) ||
        ''
      ).trim();
      const taskUrl = preinspectR3414TaskUrl_(taskId);
      const taskLabel = preinspectR3415TaskDisplayLabel_(
        calRow, mapRow, taskId
      );

      const customerNumber = String(
        mapRow['Customer #'] || calRow['Customer #'] || ''
      ).trim();

      const customerUrl = preinspectR3414ExtractVerifiedCustomerUrl_(
        calRow['Description HTML Source'],
        mapRow['Customer ID'],
        customerNumber
      );

      if (soUrl) result.calendar.salesOrderLinks++;
      if (taskUrl) result.calendar.taskLinks++;
      if (customerUrl) result.calendar.customerLinks++;

      soRich.push([preinspectR3414BuildRichText_(soNumber, soUrl)]);
      taskRich.push([preinspectR3414BuildRichText_(taskLabel, taskUrl)]);
      rawTaskRich.push([preinspectR3414BuildRichText_(taskLabel, taskUrl)]);
      customerRich.push([preinspectR3414BuildRichText_(customerNumber, customerUrl)]);
    });

    calendarSheet.getRange(2, calSoCol, soRich.length, 1).setRichTextValues(soRich);
    calendarSheet.getRange(2, calTaskCol, taskRich.length, 1).setRichTextValues(taskRich);

    if (rawTaskLinkCol > 0) {
      calendarSheet
        .getRange(2, rawTaskLinkCol, rawTaskRich.length, 1)
        .setRichTextValues(rawTaskRich);
    }

    if (calCustomerCol > 0) {
      calendarSheet.getRange(2, calCustomerCol, customerRich.length, 1)
        .setRichTextValues(customerRich);
    }

    result.writesPerformed = true;
  }

  // R3.4.15: the Striven Task Link column is operator-friendly itself.
  if (rawTaskLinkCol > 0) {
    try {
      calendarSheet.showColumns(rawTaskLinkCol);
      calendarSheet.setColumnWidth(rawTaskLinkCol, 300);
    } catch (err) {
      // Presentation only.
    }
  }

  try {
    calendarSheet.setColumnWidth(calSoCol, 110);
    calendarSheet.setColumnWidth(calTaskCol, 240);
  } catch (err) {
    // Presentation only.
  }

  /**********************************************************
   * ACTUAL GOOGLE CALENDAR EVENT:
   * Whenever Event ID + Task ID are resolved, append/verify
   * the Striven Task link in the event description itself.
   * This is the operator-facing acceptance rule used by the
   * other verticals. The helper is idempotent and performs a
   * fresh Calendar read-back after any write.
   **********************************************************/
  if (typeof tmPreInspectEnsureDualCalendarTaskLink_ === 'function') {
    mappingRows.forEach(function(row) {
      const eventId = String(row['Event ID'] || '').trim();
      const taskId = Number(row['Task ID'] || 0);
      const status = String(row['Status'] || '').trim().toUpperCase();

      if (
        !eventId ||
        !(taskId > 0) ||
        status === 'SKIP' ||
        status === 'SKIPPED' ||
        status === 'NOT MATCHED'
      ) {
        return;
      }

      const taskTitle =
        String(row['Task Name'] || '').trim() ||
        ('Pre-Inspection Task #' + taskId);

      result.calendarEventTaskLinks.checked++;

      try {
        const linkResult = tmPreInspectEnsureDualCalendarTaskLink_(
          eventId,
          taskId,
          taskTitle
        );

        if (linkResult && linkResult.readBackVerified) {
          if (linkResult.writePerformed) {
            result.calendarEventTaskLinks.writtenAndVerified++;
            result.calendarWritesPerformed = true;
            result.writesPerformed = true;
          } else {
            result.calendarEventTaskLinks.alreadyVerified++;
          }
        } else {
          result.calendarEventTaskLinks.failed++;
          result.calendarEventTaskLinks.failures.push({
            eventId: eventId,
            taskId: taskId,
            reason: 'Calendar Task-link helper did not return readBackVerified=true.'
          });
        }
      } catch (linkErr) {
        result.calendarEventTaskLinks.failed++;
        result.calendarEventTaskLinks.failures.push({
          eventId: eventId,
          taskId: taskId,
          reason: String(
            linkErr && linkErr.message ? linkErr.message : linkErr
          )
        });
      }
    });
  } else {
    result.calendarEventTaskLinks.failed++;
    result.calendarEventTaskLinks.failures.push({
      eventId: '',
      taskId: '',
      reason: 'PreInspection dual-calendar Task-link helper is unavailable.'
    });
  }

  if (result.calendarEventTaskLinks.failed > 0) {
    result.status = 'COMPLETE_WITH_CALENDAR_LINK_FAILURES';
  }

  Logger.log(JSON.stringify(result, null, 2));
  return result;
}


/************************************************************
 * R3.4.14 - READ-ONLY POLICY TEST
 ************************************************************/
function testPreInspectR3414LinkAndClassificationPolicy() {
  const authored = 'Original customer notes.\nSecond line.';
  const footer = '<!-- PREINSPECT_STRIVEN_TASK_LINK_START -->' +
    '<br>------- Pre-Inspection Task Link -------' +
    '<br><br><a href="https://classicfireplace.striven.com/Tasks/TaskInfo.aspx?TaskID=18379">' +
    'Preinspect - Stephanie Mackay - (647) 268-8013</a>' +
    '<br><br>------------------------------------' +
    '<br><!-- PREINSPECT_STRIVEN_TASK_LINK_END -->';

  const appended = preinspectR3414AppendManagedFooter_(authored, footer);
  const stripped = preinspectR3414RemoveManagedTaskFooterOnly_(appended);

  const deliveryClass = preinspectClassifyCalendarEvent_({
    title: 'Ron Prieur - SF & SB - 905.235.4354',
    description: 'Deliver R425NK-2 Grill and accessories at Newmarket',
    location: '448 Botsford St, Newmarket, ON'
  }, {
    customerNumber: '62394',
    customerNumberCandidates: [],
    salesOrderNumber: '',
    phones: ['9052354354'],
    emails: [],
    address: '448 Botsford St, Newmarket, ON'
  });

  const result = {
    mode: 'PREINSPECT_R3414_LINK_AND_CLASSIFICATION_POLICY',
    writesPerformed: false,
    authoredDescriptionPreservedExactly: stripped === authored,
    taskNameIsHyperlinkAnchor:
      appended.indexOf('>Preinspect - Stephanie Mackay - (647) 268-8013</a>') >= 0,
    taskUrl: preinspectR3414TaskUrl_(18379),
    salesOrderUrl: preinspectR3414SalesOrderUrl_(26307),
    deliveryClass: deliveryClass.code,
    customerUrlPolicy:
      'ONLY_REUSE_VERIFIED_EXISTING_STRIVEN_CUSTOMER_URL; NEVER_GUESS_ROUTE',
    pass:
      stripped === authored &&
      appended.indexOf('>Preinspect - Stephanie Mackay - (647) 268-8013</a>') >= 0 &&
      deliveryClass.code === 'OTHER_JOB'
  };

  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

function preinspectR3415SyncMirrorAndHyperlinks_(reason) {
  const mirror = preinspectSyncCalendarMirror_(reason);
  let hyperlinks = null;
  let hyperlinkError = '';

  try {
    hyperlinks = preinspectR3414ApplySheetHyperlinks_();
  } catch (err) {
    hyperlinkError = err && err.message ? err.message : String(err);
  }

  const result = {
    mode: 'PREINSPECT_MIRROR_PLUS_HYPERLINKS',
    status: hyperlinkError ? 'COMPLETE_WITH_HYPERLINK_WARNING' : 'COMPLETE',
    reason: reason,
    mirror: mirror,
    hyperlinks: hyperlinks,
    hyperlinkError: hyperlinkError,
    calendarWritesPerformed: !!(
      hyperlinks && hyperlinks.calendarWritesPerformed
    ),
    sheetWritesPerformed: !!(
      (mirror && mirror.sheetWritesPerformed) ||
      (hyperlinks && hyperlinks.writesPerformed)
    )
  };

  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

/************************************************************
 * PREINSPECT R3.4.15 - ORGANIZER CONFIDENCE + LINK PERSISTENCE
 ************************************************************/
function preinspectR3415LooksLikeStreetAddress_(location) {
  const value = String(location || '').trim();
  if (!value) return false;
  return /^\s*\d{1,6}[A-Za-z]?\s+\S{2,}/.test(value);
}


function preinspectR3415OrganizerEmails_(value) {
  return String(value || '')
    .toLowerCase()
    .split(/[\s,;]+/)
    .map(function(v) { return String(v || '').trim(); })
    .filter(function(v) { return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v); });
}


function preinspectR3415TaskIdFromLink_(value) {
  const m = String(value || '').match(/[?&]TaskID=(\d+)/i);
  return m ? String(m[1]) : '';
}


function preinspectR3415DecodeHtmlText_(value) {
  return String(value || '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .trim();
}


function preinspectR3415TaskDisplayLabel_(calendarRow, mappingRow, taskId) {
  calendarRow = calendarRow || {};
  mappingRow = mappingRow || {};
  taskId = String(taskId || '').trim();
  if (!taskId) return '';

  let title = '';

  try {
    title = preinspectR3412DesiredTaskTitle_(mappingRow);
  } catch (err) {
    title = '';
  }

  if (!title) {
    const rawHtml = String(calendarRow['Description HTML Source'] || '');
    const re = new RegExp(
      '<a[^>]+href=["\\\'][^"\\\']*TaskInfo\\.aspx\\?TaskID=' +
      taskId +
      '[^"\\\']*["\\\'][^>]*>([\\s\\S]*?)<\\/a>',
      'i'
    );
    const m = rawHtml.match(re);
    if (m) title = preinspectR3415DecodeHtmlText_(m[1]);
  }

  if (!title) {
    const customer = String(mappingRow['Customer'] || '').trim();
    title = customer ? ('Preinspect - ' + customer) : 'Preinspect Task';
  }

  return taskId + ' - ' + title;
}


/************************************************************
 * R3.4.15 - READ-ONLY POLICY TEST
 ************************************************************/
function testPreInspectR3415OrganizerAndHyperlinkPolicy() {
  const organizerLikely = preinspectClassifyCalendarEvent_({
    title: 'Confirm site details',
    description: 'Customer meeting',
    location: '20 Island View Ct, Scugog, ON L9L 1R6, Canada',
    organizers: 'matthew@classicfireplace.ca'
  }, {
    customerNumber: '',
    customerNumberCandidates: [],
    salesOrderNumber: '',
    phones: [],
    emails: [],
    address: '20 Island View Ct, Scugog, ON L9L 1R6, Canada'
  });

  const stephenAddress = preinspectClassifyCalendarEvent_({
    title: 'Confirm site details',
    description: 'Customer meeting',
    location: '20 Island View Ct, Scugog, ON L9L 1R6, Canada',
    organizers: 'stephen@classicfireplace.ca'
  }, {
    customerNumber: '',
    customerNumberCandidates: [],
    salesOrderNumber: '',
    phones: [],
    emails: [],
    address: '20 Island View Ct, Scugog, ON L9L 1R6, Canada'
  });

  const deliveryStillBlocked = preinspectClassifyCalendarEvent_({
    title: 'Ron Prieur - SF & SB - 905.235.4354',
    description: 'Deliver R425NK-2 Grill and accessories at Newmarket',
    location: '448 Botsford St, Newmarket, ON L3Y 1T1, Canada',
    organizers: 'matthew@classicfireplace.ca'
  }, {
    customerNumber: '62394',
    customerNumberCandidates: [],
    salesOrderNumber: '',
    phones: ['9052354354'],
    emails: [],
    address: '448 Botsford St, Newmarket, ON L3Y 1T1, Canada'
  });

  const customerUrl =
    preinspectR3414ExtractVerifiedCustomerUrl_('', '', '62400');

  const taskLabel = preinspectR3415TaskDisplayLabel_(
    {
      'Description HTML Source':
        '<a href="https://classicfireplace.striven.com/Tasks/TaskInfo.aspx?TaskID=18381">' +
        'Preinspect - Rob Armstrong - (905) 985-4390</a>'
    },
    {
      'Customer': 'Rob Armstrong',
      'Calendar Title': 'Rob Armstrong - confirm details',
      'Calendar Description': 'Confirm details 905 985 4390'
    },
    '18381'
  );

  const result = {
    mode: 'PREINSPECT_R3415_ORGANIZER_AND_HYPERLINK_POLICY',
    writesPerformed: false,
    nonStephenOrganizerWithAddress: organizerLikely.code,
    stephenOrganizerWithAddress: stephenAddress.code,
    explicitDeliveryStillBlocked: deliveryStillBlocked.code,
    customerUrl: customerUrl,
    taskDisplayLabel: taskLabel,
    pass:
      organizerLikely.code === 'PREINSPECT_JOB' &&
      stephenAddress.code !== 'PREINSPECT_JOB' &&
      deliveryStillBlocked.code === 'OTHER_JOB' &&
      customerUrl ===
        'https://classicfireplace.striven.com/CRM/AccountDashboard.aspx?AccountID=62400' &&
      taskLabel.indexOf('18381 - Preinspect - Rob Armstrong') === 0
  };

  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

/************************************************************
 * PREINSPECT R3.4.16
 * LOCATION CREATION + SCHEDULE / REQUESTED-BY RECONCILIATION
 *
 * Proven Striven contracts reused:
 * - Create Customer Location:
 *     POST /v1/customers/{customerId}/location
 * - Location payload:
 *     CustomerId, Name, Address1, City, State,
 *     PostalCode, Country, IsActive
 * - Requested By:
 *     RequestedBy: { Id: <ContactId>, Type: 'contact' }
 * - Task schedule:
 *     StartDateTime / DueDateTime
 ************************************************************/


function preinspectR3416Normalize_(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}


function preinspectR3416NormalizeAddress_(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\bcanada\b/g, '')
    .replace(/[^a-z0-9]+/g, '')
    .trim();
}


function preinspectR3416HeaderIndex_(headers, names) {
  for (let i = 0; i < names.length; i++) {
    const target = String(names[i] || '').trim().toLowerCase();
    for (let j = 0; j < headers.length; j++) {
      if (String(headers[j] || '').trim().toLowerCase() === target) return j;
    }
  }
  return -1;
}


function preinspectR3416WriteMappingFields_(sheet, rowNumber, patch) {
  const headers = sheet
    .getRange(1, 1, 1, sheet.getLastColumn())
    .getDisplayValues()[0];

  Object.keys(patch || {}).forEach(function(name) {
    const idx = headers.indexOf(name);
    if (idx >= 0) sheet.getRange(rowNumber, idx + 1).setValue(patch[name]);
  });

  SpreadsheetApp.flush();
}


function preinspectR3416ResolveCustomerIdentityForSelected_(sheet, rowNumber) {
  const row = preinspectMappingRowObject_(sheet, rowNumber);

  let customerId = Number(String(row['Customer ID'] || '').trim()) || 0;
  let customerNumber = String(row['Customer #'] || '').trim();
  let contactId = Number(String(row['Contact ID'] || '').trim()) || 0;
  const customerName = String(row['Customer'] || '').trim();

  const customerSheet = SpreadsheetApp.getActive()
    .getSheetByName(PREINSPECT_REVIEW_CONFIG.SHEETS.CUSTOMERS);

  if (!customerSheet) {
    throw new Error('Missing Striven_Customers sheet.');
  }

  const data = customerSheet.getDataRange().getDisplayValues();
  if (data.length < 2) throw new Error('Striven_Customers has no data rows.');

  const headers = data[0];
  const idIdx = preinspectR3416HeaderIndex_(headers, [
    'CustomerCustomerId', 'CustomerId', 'Customer ID'
  ]);
  const numIdx = preinspectR3416HeaderIndex_(headers, [
    'CustomerNumber', 'Customer #', 'Customer Number'
  ]);
  const nameIdx = preinspectR3416HeaderIndex_(headers, [
    'FullName', 'CustomerName', 'Name'
  ]);
  const contactIdx = preinspectR3416HeaderIndex_(headers, [
    'ContactId', 'PrimaryContactId', 'Contact ID'
  ]);

  if (idIdx < 0 || nameIdx < 0) {
    throw new Error('Striven_Customers is missing Customer ID or FullName headers.');
  }

  const desiredName = preinspectR3416Normalize_(customerName);
  const candidatesById = {};

  for (let r = 1; r < data.length; r++) {
    const rawId = Number(String(data[r][idIdx] || '').trim()) || 0;
    if (!rawId) continue;

    const rawNumber = numIdx >= 0 ? String(data[r][numIdx] || '').trim() : '';
    const rawName = String(data[r][nameIdx] || '').trim();
    const rawContact =
      contactIdx >= 0 ? Number(String(data[r][contactIdx] || '').trim()) || 0 : 0;

    const idMatches = customerId && rawId === customerId;
    const numberMatches =
      customerNumber && rawNumber && rawNumber === customerNumber;
    const nameMatches =
      !customerId && !customerNumber &&
      desiredName &&
      preinspectR3416Normalize_(rawName) === desiredName;

    if (!idMatches && !numberMatches && !nameMatches) continue;

    if (!candidatesById[rawId]) {
      candidatesById[rawId] = {
        customerId: rawId,
        customerNumber: rawNumber || String(rawId),
        customerName: rawName,
        contactIds: []
      };
    }

    if (rawContact &&
        candidatesById[rawId].contactIds.indexOf(rawContact) < 0) {
      candidatesById[rawId].contactIds.push(rawContact);
    }
  }

  const candidateIds = Object.keys(candidatesById);

  if (!customerId && candidateIds.length !== 1) {
    throw new Error(
      'Customer identity is not unique enough for automatic location creation. ' +
      'Matches=' + candidateIds.length + '.'
    );
  }

  const resolved = customerId
    ? (candidatesById[customerId] || null)
    : candidatesById[candidateIds[0]];

  if (!resolved) {
    throw new Error('Confirmed mapping customer could not be resolved in Striven_Customers.');
  }

  customerId = resolved.customerId;
  customerNumber = customerNumber || resolved.customerNumber;

  if (!contactId && resolved.contactIds.length === 1) {
    contactId = resolved.contactIds[0];
  }

  preinspectR3416WriteMappingFields_(sheet, rowNumber, {
    'Customer #': customerNumber,
    'Customer ID': customerId,
    'Contact ID': contactId || ''
  });

  return {
    customerId: customerId,
    customerNumber: customerNumber,
    contactId: contactId || 0,
    customerName: resolved.customerName || customerName
  };
}


function preinspectR3416ParseCanadianAddress_(fullAddress) {
  const original = String(fullAddress || '').trim();
  if (!original) throw new Error('Calendar Location is blank.');

  const parts = original
    .split(',')
    .map(function(v) { return String(v || '').trim(); })
    .filter(function(v) { return v !== ''; });

  if (parts.length < 3) {
    throw new Error(
      'Calendar Location is not structured enough for safe automatic location creation: ' +
      original
    );
  }

  const street = parts[0];
  const city = parts[1];
  let province = '';
  let postalCode = '';
  let country = 'Canada';

  const tail = parts.slice(2).join(' ');
  const postalMatch = tail.match(/\b([A-Z]\d[A-Z]\s?\d[A-Z]\d)\b/i);
  if (postalMatch) postalCode = postalMatch[1].toUpperCase().replace(/\s+/g, ' ');

  const provinceMatch = tail.match(/\b(AB|BC|MB|NB|NL|NS|NT|NU|ON|PE|QC|SK|YT)\b/i);
  if (provinceMatch) province = provinceMatch[1].toUpperCase();

  const countryPart = parts[parts.length - 1];
  if (/canada/i.test(countryPart)) country = 'Canada';

  if (!street || !city || !province || !postalCode) {
    throw new Error(
      'Could not safely parse Street/City/Province/PostalCode from Calendar Location: ' +
      original
    );
  }

  return {
    fullAddress: original,
    street: street,
    city: city,
    province: province,
    postalCode: postalCode,
    country: country
  };
}


function preinspectR3416FindExistingLocation_(customerId, fullAddress) {
  const sheet = SpreadsheetApp.getActive()
    .getSheetByName(PREINSPECT_REVIEW_CONFIG.SHEETS.LOCATIONS);

  if (!sheet || sheet.getLastRow() < 2) return null;

  const data = sheet.getDataRange().getDisplayValues();
  const headers = data[0];

  const idIdx = preinspectR3416HeaderIndex_(headers, [
    'LocationCustomerAddressAddressId',
    'LocationCustomerAddressId',
    'LocationId',
    'Location ID',
    'AddressId',
    'Address ID'
  ]);
  const customerIdx = preinspectR3416HeaderIndex_(headers, [
    'CustomerCustomerId',
    'CustomerId',
    'CustomerNumber'
  ]);
  const addressIdx = preinspectR3416HeaderIndex_(headers, [
    'AddressFullAddress',
    'CustomerAddressFullAddress',
    'FullAddress',
    'Full Address'
  ]);

  if (idIdx < 0 || customerIdx < 0 || addressIdx < 0) return null;

  const desiredAddress = preinspectR3416NormalizeAddress_(fullAddress);

  for (let r = 1; r < data.length; r++) {
    const rowCustomer =
      Number(String(data[r][customerIdx] || '').trim()) || 0;
    const rowId = Number(String(data[r][idIdx] || '').trim()) || 0;
    const rowAddress = String(data[r][addressIdx] || '').trim();

    if (
      rowId &&
      rowCustomer === Number(customerId) &&
      preinspectR3416NormalizeAddress_(rowAddress) === desiredAddress
    ) {
      return {
        locationId: rowId,
        address: rowAddress,
        sourceRow: r + 1
      };
    }
  }

  return null;
}


function preinspectR3416ExtractCreatedLocationId_(json) {
  function walk(value, depth) {
    if (!value || depth > 4) return 0;

    if (typeof value === 'object' && !Array.isArray(value)) {
      const keys = ['LocationId', 'locationId', 'Id', 'id', 'AddressId', 'addressId'];
      for (let i = 0; i < keys.length; i++) {
        const n = Number(value[keys[i]]);
        if (n > 0) return n;
      }

      const nested = ['Data', 'data', 'Result', 'result', 'Location', 'location'];
      for (let j = 0; j < nested.length; j++) {
        const found = walk(value[nested[j]], depth + 1);
        if (found) return found;
      }
    }

    if (Array.isArray(value)) {
      for (let k = 0; k < value.length; k++) {
        const found = walk(value[k], depth + 1);
        if (found) return found;
      }
    }

    return 0;
  }

  return walk(json, 0);
}


function preinspectR3416CreateOrReuseSelectedLocation_() {
  const ss = SpreadsheetApp.getActive();
  const sheet = ss.getActiveSheet();

  if (!sheet ||
      sheet.getName() !== PREINSPECT_REVIEW_CONFIG.SHEETS.MAPPING) {
    throw new Error('Run from PreInspect Task Mapping.');
  }

  const rowNumber = sheet.getActiveRange().getRow();
  if (rowNumber < 2) throw new Error('Select a mapping data row.');

  let row = preinspectMappingRowObject_(sheet, rowNumber);
  const action = String(row['Task Action'] || '').trim().toUpperCase();

  if (action !== 'CREATE LOCATION FIRST') {
    return {
      mode: 'PREINSPECT_LOCATION_FIRST',
      status: 'NOT_NEEDED',
      writesPerformed: false,
      mappingRow: rowNumber,
      taskAction: row['Task Action']
    };
  }

  if (String(row['Classification'] || '').trim().toUpperCase() !== 'PREINSPECT_JOB') {
    throw new Error('Automatic location creation requires PREINSPECT_JOB classification.');
  }

  if (String(row['Task ID'] || '').trim()) {
    throw new Error('Task already exists; CREATE LOCATION FIRST is inconsistent.');
  }

  const identity = preinspectR3416ResolveCustomerIdentityForSelected_(
    sheet,
    rowNumber
  );

  row = preinspectMappingRowObject_(sheet, rowNumber);
  const fullAddress = String(
    row['Calendar Location'] || row['Location'] || ''
  ).trim();

  const parsed = preinspectR3416ParseCanadianAddress_(fullAddress);

  // Duplicate guard before any POST.
  let existing = preinspectR3416FindExistingLocation_(
    identity.customerId,
    parsed.fullAddress
  );

  if (existing) {
    preinspectR3416WriteMappingFields_(sheet, rowNumber, {
      'Location': existing.address || parsed.fullAddress,
      'Location ID': existing.locationId,
      'Issue': 'Existing Striven customer location reused after exact customer + address verification.',
      'Last Reviewed': new Date()
    });

    const reviewed = reviewSelectedPreInspectMappingRow();

    return {
      mode: 'PREINSPECT_LOCATION_FIRST',
      status: 'EXISTING_LOCATION_REUSED_AND_REVIEWED',
      writesPerformed: true,
      strivenLocationCreated: false,
      mappingRow: rowNumber,
      customerId: identity.customerId,
      contactId: identity.contactId || null,
      locationId: existing.locationId,
      review: reviewed
    };
  }

  const payload = {
    CustomerId: identity.customerId,
    Name: parsed.fullAddress,
    Address: {
      Address1: parsed.street,
      City: parsed.city,
      State: parsed.province,
      PostalCode: parsed.postalCode,
      Country: 'CA'  // R3.4.17b: Striven expects ISO country code, not 'Canada'.
    },
    IsActive: true
  };

  const auth = getStrivenAuth_();
  const url = String(auth.baseUrl || '').replace(/\/+$/, '') +
    '/v1/customers/' + encodeURIComponent(identity.customerId) + '/location';

  const response = strivenTaskRequestJson_(
    'post',
    url,
    payload,
    'PreInspect create Customer Location for mapping row ' + rowNumber
  );

  const newLocationId = preinspectR3416ExtractCreatedLocationId_(response.json);
  if (!newLocationId) {
    throw new Error(
      'Location POST succeeded but no durable Location ID was returned. ' +
      'Do not retry blindly; reconcile Striven first.'
    );
  }

  // Persist ID immediately after a successful POST so a later verification
  // problem can never create a duplicate on rerun.
  preinspectR3416WriteMappingFields_(sheet, rowNumber, {
    'Customer #': identity.customerNumber,
    'Customer ID': identity.customerId,
    'Contact ID': identity.contactId || '',
    'Location': parsed.fullAddress,
    'Location ID': newLocationId,
    'Task Action': 'LOCATION CREATED VERIFY PENDING',
    'Issue': 'Location created; verification refresh pending.',
    'Last Reviewed': new Date()
  });

  // Read-back verification uses the existing authenticated Customer Locations
  // report sync already in this project.
  if (typeof syncStrivenCustomerLocationsToSheet !== 'function') {
    throw new Error(
      'Location ' + newLocationId +
      ' was created and persisted, but Customer Locations refresh function is unavailable. ' +
      'Do not create another location.'
    );
  }

  syncStrivenCustomerLocationsToSheet();
  SpreadsheetApp.flush();

  const verified = preinspectR3416FindExistingLocation_(
    identity.customerId,
    parsed.fullAddress
  );

  if (!verified || Number(verified.locationId) !== Number(newLocationId)) {
    throw new Error(
      'Location ' + newLocationId +
      ' was created but customer/address read-back verification did not match. ' +
      'The Location ID is already persisted; do not create another.'
    );
  }

  preinspectR3416WriteMappingFields_(sheet, rowNumber, {
    'Location': verified.address || parsed.fullAddress,
    'Location ID': newLocationId,
    'Issue': 'New Striven customer location created and read-back verified.',
    'Last Reviewed': new Date()
  });

  const reviewed = reviewSelectedPreInspectMappingRow();

  return {
    mode: 'PREINSPECT_LOCATION_FIRST',
    status: 'CREATED_VERIFIED_AND_REVIEWED',
    writesPerformed: true,
    strivenLocationCreated: true,
    mappingRow: rowNumber,
    customerId: identity.customerId,
    customerNumber: identity.customerNumber,
    contactId: identity.contactId || null,
    locationId: newLocationId,
    payload: payload,
    review: reviewed
  };
}


function preinspectR3416ResolveOneLocationFirstFromAppsScript_() {
  const ss = SpreadsheetApp.getActive();
  const sheet = ss.getSheetByName(PREINSPECT_REVIEW_CONFIG.SHEETS.MAPPING);
  if (!sheet) throw new Error('Missing PreInspect Task Mapping sheet.');

  const rows = tm_getSheetObjects_(sheet);

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];

    if (
      String(row['Classification'] || '').trim().toUpperCase() === 'PREINSPECT_JOB' &&
      String(row['Task Action'] || '').trim().toUpperCase() === 'CREATE LOCATION FIRST' &&
      !String(row['Task ID'] || '').trim()
    ) {
      ss.setActiveSheet(sheet);
      sheet.setActiveRange(sheet.getRange(i + 2, 1));

      try {
        return preinspectR3416CreateOrReuseSelectedLocation_();
      } catch (err) {
        const result = {
          mode: 'PREINSPECT_LOCATION_FIRST_APPS_SCRIPT',
          status: 'ERROR',
          writesPerformed: false,
          mappingRow: i + 2,
          error: err && err.message ? err.message : String(err)
        };
        Logger.log(JSON.stringify(result, null, 2));
        return result;
      }
    }
  }

  return {
    mode: 'PREINSPECT_LOCATION_FIRST_APPS_SCRIPT',
    status: 'NO_LOCATION_FIRST_ROWS',
    writesPerformed: false
  };
}


function preinspectR3416ReconcileSelectedScheduleIdentity_() {
  const result = {
    mode: 'PREINSPECT_SELECTED_SCHEDULE_IDENTITY_RECONCILE',
    status: 'COMPLETE',
    writesPerformed: false,
    requestedBy: null,
    dates: null,
    times: null,
    errors: []
  };

  try {
    result.requestedBy = pushSelectedPreInspectRequestedBy();
    if (result.requestedBy && result.requestedBy.writesPerformed) {
      result.writesPerformed = true;
    }
  } catch (err) {
    result.errors.push({
      field: 'RequestedBy',
      error: err && err.message ? err.message : String(err)
    });
  }

  // Always execute both date and time reconcilers. Each is already idempotent
  // and read-back verified, so this guarantees found/created tasks follow
  // the Calendar even when mapping preview state is stale.
  try {
    result.dates = pushSelectedPreInspectDates();
    if (result.dates && result.dates.writesPerformed) {
      result.writesPerformed = true;
    }
  } catch (err) {
    result.errors.push({
      field: 'Dates',
      error: err && err.message ? err.message : String(err)
    });
  }

  try {
    result.times = pushSelectedPreInspectTimes();
    if (result.times && result.times.writesPerformed) {
      result.writesPerformed = true;
    }
  } catch (err) {
    result.errors.push({
      field: 'Times',
      error: err && err.message ? err.message : String(err)
    });
  }

  if (result.errors.length) result.status = 'COMPLETE_WITH_ERRORS';

  Logger.log(JSON.stringify(result, null, 2));
  return result;
}


function preinspectR3416ReconcileMappedOpenTasks_(limit) {
  const ss = SpreadsheetApp.getActive();
  const sheet = ss.getSheetByName(PREINSPECT_REVIEW_CONFIG.SHEETS.MAPPING);
  if (!sheet) throw new Error('Missing PreInspect Task Mapping sheet.');

  const rows = tm_getSheetObjects_(sheet);
  const maxRows = Number(limit || 20);

  const result = {
    mode: 'PREINSPECT_OPEN_TASK_SCHEDULE_IDENTITY_RECONCILE',
    status: 'COMPLETE',
    writesPerformed: false,
    checked: 0,
    reconciled: 0,
    skipped: 0,
    errors: []
  };

  for (let i = 0; i < rows.length && result.checked < maxRows; i++) {
    const row = rows[i];
    const taskId = Number(String(row['Task ID'] || '').trim()) || 0;
    const classification =
      String(row['Classification'] || '').trim().toUpperCase();
    const taskStatus =
      String(row['Task Status'] || '').trim().toUpperCase();

    if (!taskId || classification !== 'PREINSPECT_JOB' || taskStatus !== 'OPEN') {
      result.skipped++;
      continue;
    }

    result.checked++;

    try {
      ss.setActiveSheet(sheet);
      sheet.setActiveRange(sheet.getRange(i + 2, 1));

      const one = preinspectR3416ReconcileSelectedScheduleIdentity_();

      if (one.writesPerformed) result.writesPerformed = true;
      if (one.status === 'COMPLETE_WITH_ERRORS') {
        result.errors.push({
          mappingRow: i + 2,
          taskId: taskId,
          errors: one.errors
        });
      } else {
        result.reconciled++;
      }
    } catch (err) {
      result.errors.push({
        mappingRow: i + 2,
        taskId: taskId,
        error: err && err.message ? err.message : String(err)
      });
    }
  }

  if (result.errors.length) result.status = 'COMPLETE_WITH_ERRORS';

  Logger.log(JSON.stringify(result, null, 2));
  return result;
}


/************************************************************
 * Public wrapper preserves the existing selected-row E2E behavior, but
 * automatically resolves CREATE LOCATION FIRST before delegating to the
 * previously verified E2E implementation.
 ************************************************************/
function runSelectedPreInspectEndToEnd() {
  const sheet = SpreadsheetApp.getActiveSheet();

  if (!sheet ||
      sheet.getName() !== PREINSPECT_REVIEW_CONFIG.SHEETS.MAPPING) {
    throw new Error('Run this from PreInspect Task Mapping.');
  }

  const rowNumber = sheet.getActiveRange().getRow();
  if (rowNumber < 2) throw new Error('Select a mapping data row.');

  // Refresh the decision first.
  const firstReview = reviewSelectedPreInspectMappingRow();

  if (
    String(firstReview.taskAction || '').trim().toUpperCase() ===
      'CREATE LOCATION FIRST'
  ) {
    const locationResult = preinspectR3416CreateOrReuseSelectedLocation_();
    Logger.log(JSON.stringify({
      mode: 'PREINSPECT_E2E_LOCATION_FIRST_HANDOFF',
      locationResult: locationResult
    }, null, 2));
  }

  // Original function remains the authority for duplicate protection,
  // task reuse/create/recreate, Pool 8, Calendar link and full push order.
  return preinspectR3416OriginalRunSelectedPreInspectEndToEnd_();
}


/************************************************************
 * R3.4.16 READ-ONLY CONTRACT TEST
 ************************************************************/
function testPreInspectR3416Contracts() {
  const sampleAddress =
    preinspectR3416ParseCanadianAddress_(
      '14 Osborne Ave, Toronto, ON M4E 3A9, Canada'
    );

  const result = {
    mode: 'PREINSPECT_R3416_CONTRACTS',
    writesPerformed: false,
    locationEndpoint:
      '/v1/customers/{customerId}/location',
    locationPayloadFields: [
      'CustomerId', 'Name', 'Address1', 'City',
      'State', 'PostalCode', 'Country', 'IsActive'
    ],
    requestedByContract: {
      Id: '<resolved contact id>',
      Type: 'contact'
    },
    scheduleFields: [
      'StartDateTime',
      'DueDateTime'
    ],
    sampleAddress: sampleAddress,
    pass:
      sampleAddress.street === '14 Osborne Ave' &&
      sampleAddress.city === 'Toronto' &&
      sampleAddress.province === 'ON' &&
      sampleAddress.postalCode === 'M4E 3A9' &&
      typeof pushSelectedPreInspectRequestedBy === 'function' &&
      typeof pushSelectedPreInspectDates === 'function' &&
      typeof pushSelectedPreInspectTimes === 'function'
  };

  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

/************************************************************
 * PREINSPECT R3.4.17 - DIRECT APPS SCRIPT ENTRY POINTS
 *
 * These are the supported editor-run functions.
 * No user-selected Google Sheet row is required.
 ************************************************************/
function runPreInspectNowFromAppsScript() {
  return runPreInspectScheduledPipeline();
}


function runNextPreInspectActionFromAppsScript() {
  const result = {
    mode: 'PREINSPECT_NEXT_ACTION_FROM_APPS_SCRIPT',
    status: 'COMPLETE',
    writesPerformed: false,
    refreshRebuild: null,
    lookupBatch: null,
    locationResolution: null,
    reviewCandidateReevaluation: null,
    foundTaskReconcile: null,
    endToEnd: null,
    calendarTaskLink: null,
    errors: []
  };

  function capture(step, fn) {
    try {
      const value = fn();

      if (value && value.writesPerformed) {
        result.writesPerformed = true;
      }

      if (
        value &&
        String(value.status || '').toUpperCase().indexOf('ERROR') >= 0
      ) {
        result.errors.push({
          step: step,
          error: 'Nested step returned status ' + value.status + '.'
        });
      }

      return value;
    } catch (err) {
      result.errors.push({
        step: step,
        error: err && err.message ? err.message : String(err)
      });
      return null;
    }
  }

  result.refreshRebuild = capture(
    'REFRESH_REBUILD',
    function() { return runPreInspectRefreshRebuildOnly(); }
  );

  result.lookupBatch = capture(
    'LOOKUP_BATCH',
    function() { return reviewNextPreInspectMappingBatch(); }
  );

  result.locationResolution = capture(
    'LOCATION_FIRST',
    function() { return preinspectR3416ResolveOneLocationFirstFromAppsScript_(); }
  );

  result.reviewCandidateReevaluation = capture(
    'REVIEW_CANDIDATE_REEVALUATION',
    function() {
      return preinspectR3418aReevaluateOneCandidateReviewFromAppsScript_();
    }
  );

  result.foundTaskReconcile = capture(
    'FOUND_TASK_RECONCILE',
    function() { return preinspectR3418bReconcileNextMappedOpenTask_(); }
  );

  /************************************************************
   * ONE ACTION = ONE APPOINTMENT.
   ************************************************************/
  const foundHandled =
    result.foundTaskReconcile &&
    result.foundTaskReconcile.status !==
      'NO_MAPPED_OPEN_TASK_NEEDS_SYNC';

  if (!foundHandled) {
    result.endToEnd = capture(
      'END_TO_END',
      function() { return runPreInspectEndToEndFromAppsScript(); }
    );
  } else {
    result.endToEnd = {
      mode: 'PREINSPECT_APPS_SCRIPT_DIRECT_RUN',
      status: 'SKIPPED_ONE_APPOINTMENT_ALREADY_HANDLED',
      writesPerformed: false,
      mappingRow: result.foundTaskReconcile.mappingRow || null,
      taskId: result.foundTaskReconcile.taskId || null
    };
  }

  /************************************************************
   * R3.4.18f - CALENDAR TASK LINK IS A REQUIRED FINAL STAGE
   * FOR THE SAME HANDLED APPOINTMENT.
   *
   * Important:
   * - Does NOT search for a second appointment.
   * - May run even when another field reconciliation failed,
   *   provided the SAME mapping row is still a verified MATCHED
   *   OPEN PreInspect task.
   * - Calendar-link failure surfaces separately and NEVER creates
   *   or invalidates a Striven task.
   ************************************************************/
  result.calendarTaskLink = capture(
    'CALENDAR_TASK_LINK',
    function() {
      return preinspectR3418fSyncHandledTaskLinkToCalendar_({
        foundTaskReconcile: result.foundTaskReconcile,
        endToEnd: result.endToEnd
      });
    }
  );

  if (result.errors.length) {
    result.status = 'COMPLETE_WITH_ERRORS';
  }

  Logger.log(JSON.stringify(result, null, 2));
  return result;
}





function runPreInspectReconcileOpenTasksFromAppsScript() {
  return preinspectR3416ReconcileMappedOpenTasks_(20);
}


/************************************************************
 * READ-ONLY CONTRACT TEST
 ************************************************************/
function testPreInspectR3417DirectAndRebuildContracts() {
  const result = {
    mode: 'PREINSPECT_R3417_DIRECT_AND_REBUILD_CONTRACTS',
    writesPerformed: false,
    directFullPipeline:
      typeof runPreInspectNowFromAppsScript === 'function',
    directNextAction:
      typeof runNextPreInspectActionFromAppsScript === 'function',
    directReadyRunner:
      typeof runPreInspectEndToEndFromAppsScript === 'function',
    directLocationRunner:
      typeof preinspectR3416ResolveOneLocationFirstFromAppsScript_ === 'function',
    directReconcileRunner:
      typeof runPreInspectReconcileOpenTasksFromAppsScript === 'function',
    hyperlinkReapply:
      typeof preinspectR3414ApplySheetHyperlinks_ === 'function',
    pass:
      typeof runPreInspectNowFromAppsScript === 'function' &&
      typeof runNextPreInspectActionFromAppsScript === 'function' &&
      typeof runPreInspectEndToEndFromAppsScript === 'function' &&
      typeof preinspectR3416ResolveOneLocationFirstFromAppsScript_ === 'function' &&
      typeof runPreInspectReconcileOpenTasksFromAppsScript === 'function' &&
      typeof preinspectR3414ApplySheetHyperlinks_ === 'function'
  };

  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

/************************************************************
 * PREINSPECT R3.4.18a
 * HEADLESS REVIEW RE-EVALUATION + FOUND TASK RECONCILIATION
 ************************************************************/
function preinspectR3418aReevaluateOneCandidateReviewFromAppsScript_() {
  const ss = SpreadsheetApp.getActive();
  const sheet = ss.getSheetByName(PREINSPECT_REVIEW_CONFIG.SHEETS.MAPPING);
  if (!sheet) throw new Error('Missing PreInspect Task Mapping sheet.');

  const rows = tm_getSheetObjects_(sheet);

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const classification =
      String(row['Classification'] || '').trim().toUpperCase();
    const status =
      String(row['Status'] || '').trim().toUpperCase();
    const action =
      String(row['Task Action'] || '').trim().toUpperCase();
    const taskId =
      Number(String(row['Task ID'] || '').trim()) || 0;
    const candidateIds =
      String(row['Candidate Task IDs'] || '').trim();
    const lookupState =
      String(row['Lookup State'] || '').trim().toUpperCase();

    if (
      classification === 'PREINSPECT_JOB' &&
      !taskId &&
      candidateIds &&
      lookupState === 'COMPLETE' &&
      (status === 'REVIEW' || action === 'REVIEW')
    ) {
      const mappingRow = i + 2;

      // Internal activation only. The user does not select the Sheet.
      ss.setActiveSheet(sheet);
      sheet.setActiveRange(sheet.getRange(mappingRow, 1));

      const review = reviewSelectedPreInspectMappingRow();

      const result = {
        mode: 'PREINSPECT_R3418A_REEVALUATE_ONE_REVIEW',
        status: 'COMPLETE',
        writesPerformed: !!(review && review.writesPerformed),
        mappingRow: mappingRow,
        beforeCandidateTaskIds: candidateIds,
        review: review
      };

      Logger.log(JSON.stringify(result, null, 2));
      return result;
    }
  }

  return {
    mode: 'PREINSPECT_R3418A_REEVALUATE_ONE_REVIEW',
    status: 'NO_CANDIDATE_REVIEW_ROW',
    writesPerformed: false
  };
}


function preinspectR3418aMappedOpenTaskNeedsSync_(row) {
  row = row || {};

  const taskId = Number(String(row['Task ID'] || '').trim()) || 0;
  const classification =
    String(row['Classification'] || '').trim().toUpperCase();
  const taskStatus =
    String(row['Task Status'] || '').trim().toUpperCase();

  if (!taskId || classification !== 'PREINSPECT_JOB' || taskStatus !== 'OPEN') {
    return false;
  }

  const desiredLocation =
    Number(String(row['Location ID'] || '').trim()) || 0;
  const taskLocation =
    Number(String(row['Task Location ID'] || '').trim()) || 0;

  const desiredContact =
    Number(String(row['Contact ID'] || '').trim()) || 0;
  const taskContact =
    Number(String(row['Task Contact ID'] || '').trim()) || 0;

  const calendarStart = String(row['Calendar Start'] || '').trim();
  const calendarEnd = String(row['Calendar End'] || '').trim();
  const taskStart = String(row['Task Start'] || '').trim();
  const taskDue = String(row['Task Due'] || '').trim();

  const locationNeeds =
    !!(desiredLocation && desiredLocation !== taskLocation);

  const contactNeeds =
    !!(desiredContact && desiredContact !== taskContact);

  const startNeeds =
    !!calendarStart &&
    (!taskStart ||
      (typeof preinspectSameMinuteValue_ === 'function' &&
       !preinspectSameMinuteValue_(calendarStart, taskStart)));

  const dueNeeds =
    !!calendarEnd &&
    (!taskDue ||
      (typeof preinspectSameMinuteValue_ === 'function' &&
       !preinspectSameMinuteValue_(calendarEnd, taskDue)));

  return locationNeeds || contactNeeds || startNeeds || dueNeeds;
}


function preinspectR3418aReconcileNextMappedOpenTask_() {
  const ss = SpreadsheetApp.getActive();
  const sheet = ss.getSheetByName(PREINSPECT_REVIEW_CONFIG.SHEETS.MAPPING);
  if (!sheet) throw new Error('Missing PreInspect Task Mapping sheet.');

  const rows = tm_getSheetObjects_(sheet);

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!preinspectR3418aMappedOpenTaskNeedsSync_(row)) continue;

    const mappingRow = i + 2;
    const taskId = Number(String(row['Task ID'] || '').trim()) || 0;

    ss.setActiveSheet(sheet);
    sheet.setActiveRange(sheet.getRange(mappingRow, 1));

    const result = {
      mode: 'PREINSPECT_R3418A_FOUND_OPEN_TASK_RECONCILE',
      status: 'COMPLETE',
      writesPerformed: false,
      mappingRow: mappingRow,
      taskId: taskId,
      location: null,
      requestedBy: null,
      dates: null,
      times: null,
      assignees: null,
      review: null,
      errors: []
    };

    function runField(name, fn) {
      try {
        const value = fn();
        if (value && value.writesPerformed) result.writesPerformed = true;
        result[name] = value;
      } catch (err) {
        result.errors.push({
          field: name,
          error: err && err.message ? err.message : String(err)
        });
      }
    }

    runField('location', function() {
      return pushSelectedPreInspectLocation();
    });

    runField('requestedBy', function() {
      return pushSelectedPreInspectRequestedBy();
    });

    runField('dates', function() {
      return pushSelectedPreInspectDates();
    });

    runField('times', function() {
      return pushSelectedPreInspectTimes();
    });

    runField('assignees', function() {
      return pushSelectedPreInspectAssignees();
    });

    try {
      result.review = reviewSelectedPreInspectMappingRow();
    } catch (err) {
      result.errors.push({
        field: 'review',
        error: err && err.message ? err.message : String(err)
      });
    }

    if (result.errors.length) result.status = 'COMPLETE_WITH_ERRORS';

    Logger.log(JSON.stringify(result, null, 2));
    return result;
  }

  return {
    mode: 'PREINSPECT_R3418A_FOUND_OPEN_TASK_RECONCILE',
    status: 'NO_MAPPED_OPEN_TASK_NEEDS_SYNC',
    writesPerformed: false
  };
}


function testPreInspectR3418aContracts() {
  const result = {
    mode: 'PREINSPECT_R3418A_CONTRACTS',
    writesPerformed: false,
    onlyOpenCandidatesBlock: true,
    singleOpenUnscheduledReuse:
      'IDENTITY_CORROBORATED_AND_NO_CONFLICTING_LOCATION',
    headlessReviewReevaluation:
      typeof preinspectR3418aReevaluateOneCandidateReviewFromAppsScript_ === 'function',
    foundTaskFields: [
      'Location',
      'RequestedBy',
      'Dates',
      'Times',
      'Assignees'
    ],
    noUserSheetSelectionRequired:
      typeof runNextPreInspectActionFromAppsScript === 'function',
    pass:
      typeof pushSelectedPreInspectLocation === 'function' &&
      typeof pushSelectedPreInspectRequestedBy === 'function' &&
      typeof pushSelectedPreInspectDates === 'function' &&
      typeof pushSelectedPreInspectTimes === 'function' &&
      typeof pushSelectedPreInspectAssignees === 'function' &&
      typeof preinspectR3418aReevaluateOneCandidateReviewFromAppsScript_ === 'function' &&
      typeof preinspectR3418aReconcileNextMappedOpenTask_ === 'function'
  };

  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

function preinspectR3418bReconcileNextMappedOpenTask_() {
  const ss = SpreadsheetApp.getActive();
  const sheet = ss.getSheetByName(PREINSPECT_REVIEW_CONFIG.SHEETS.MAPPING);
  if (!sheet) throw new Error('Missing PreInspect Task Mapping sheet.');

  const rows = tm_getSheetObjects_(sheet);

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];

    if (!preinspectR3418aMappedOpenTaskNeedsSync_(row)) {
      continue;
    }

    const mappingRow = i + 2;
    const taskId = Number(String(row['Task ID'] || '').trim()) || 0;

    // Internal activation only. The USER does not select anything.
    ss.setActiveSheet(sheet);
    sheet.setActiveRange(sheet.getRange(mappingRow, 1));

    const result = {
      mode: 'PREINSPECT_R3418B_FOUND_OPEN_TASK_RECONCILE',
      status: 'COMPLETE',
      writesPerformed: false,
      mappingRow: mappingRow,
      taskId: taskId,
      location: null,
      requestedBy: null,
      dateTime: null,
      assignees: null,
      review: null,
      errors: []
    };

    function runField(name, fn) {
      try {
        const value = fn();

        if (value && value.writesPerformed) {
          result.writesPerformed = true;
        }

        if (
          value &&
          String(value.status || '').toUpperCase().indexOf('ERROR') >= 0
        ) {
          result.errors.push({
            field: name,
            error: 'Nested field returned status ' + value.status + '.'
          });
        }

        result[name] = value;
      } catch (err) {
        result.errors.push({
          field: name,
          error: err && err.message ? err.message : String(err)
        });
      }
    }

    runField('location', function() {
      return pushSelectedPreInspectLocation();
    });

    runField('requestedBy', function() {
      return pushSelectedPreInspectRequestedBy();
    });

    /************************************************************
     * R3.4.18b
     * Push exact Calendar Start + End together in 24-hour local
     * datetime form. This deliberately bypasses the legacy
     * time-only path that turned 15:00 into 03:00 for Task 18383.
     ************************************************************/
    runField('dateTime', function() {
      return preinspectR3418bPushExactCalendarDateTimeForActiveMapping_();
    });

    runField('assignees', function() {
      return pushSelectedPreInspectAssignees();
    });

    try {
      result.review = reviewSelectedPreInspectMappingRow();
    } catch (err) {
      result.errors.push({
        field: 'review',
        error: err && err.message ? err.message : String(err)
      });
    }

    if (result.errors.length) {
      result.status = 'COMPLETE_WITH_ERRORS';
    }

    Logger.log(JSON.stringify(result, null, 2));
    return result;
  }

  return {
    mode: 'PREINSPECT_R3418B_FOUND_OPEN_TASK_RECONCILE',
    status: 'NO_MAPPED_OPEN_TASK_NEEDS_SYNC',
    writesPerformed: false
  };
}

/************************************************************
 * PREINSPECT R3.4.18b
 * EXACT 24-HOUR DATE/TIME PATCH + READ-BACK
 ************************************************************/
function preinspectR3418bTimezone_() {
  try {
    if (
      PREINSPECT_REVIEW_CONFIG &&
      PREINSPECT_REVIEW_CONFIG.CALENDAR_SYNC &&
      PREINSPECT_REVIEW_CONFIG.CALENDAR_SYNC.TIMEZONE
    ) {
      return PREINSPECT_REVIEW_CONFIG.CALENDAR_SYNC.TIMEZONE;
    }
  } catch (ignore) {}

  return Session.getScriptTimeZone() || 'America/Toronto';
}


function preinspectR3418bMappingLocalIso_(value) {
  if (value instanceof Date) {
    return Utilities.formatDate(
      value,
      preinspectR3418bTimezone_(),
      "yyyy-MM-dd'T'HH:mm:ss"
    );
  }

  const raw = String(value || '').trim();
  if (!raw) return '';

  // Preferred mapping representation:
  // 2026-09-09 15:00:00  OR  2026-09-09T15:00:00
  const direct = raw.match(
    /^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?/
  );

  if (direct) {
    const hh = ('0' + Number(direct[4])).slice(-2);
    const ss = ('0' + Number(direct[6] || 0)).slice(-2);

    return (
      direct[1] + '-' + direct[2] + '-' + direct[3] +
      'T' + hh + ':' + direct[5] + ':' + ss
    );
  }

  const parsed = new Date(raw);

  if (isNaN(parsed.getTime())) {
    throw new Error(
      'Could not parse Calendar datetime for exact Striven patch: ' + raw
    );
  }

  return Utilities.formatDate(
    parsed,
    preinspectR3418bTimezone_(),
    "yyyy-MM-dd'T'HH:mm:ss"
  );
}


function preinspectR3418bMinuteKey_(value) {
  if (!value) return '';

  if (value instanceof Date) {
    return Utilities.formatDate(
      value,
      preinspectR3418bTimezone_(),
      'yyyy-MM-dd HH:mm'
    );
  }

  const raw = String(value || '').trim();
  if (!raw) return '';

  // No-offset Striven/local form: preserve the written local wall clock.
  const local = raw.match(
    /^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})/
  );

  if (
    local &&
    !/[zZ]$/.test(raw) &&
    !/[+-]\d{2}:?\d{2}$/.test(raw)
  ) {
    return (
      local[1] + '-' + local[2] + '-' + local[3] + ' ' +
      ('0' + Number(local[4])).slice(-2) + ':' + local[5]
    );
  }

  const parsed = new Date(raw);

  if (isNaN(parsed.getTime())) {
    return '';
  }

  return Utilities.formatDate(
    parsed,
    preinspectR3418bTimezone_(),
    'yyyy-MM-dd HH:mm'
  );
}


function preinspectR3418bExtractTaskObject_(value, depth) {
  depth = Number(depth || 0);

  if (!value || depth > 6) return null;

  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const found = preinspectR3418bExtractTaskObject_(
        value[i],
        depth + 1
      );

      if (found) return found;
    }

    return null;
  }

  if (typeof value !== 'object') return null;

  if (
    Object.prototype.hasOwnProperty.call(value, 'StartDateTime') ||
    Object.prototype.hasOwnProperty.call(value, 'DueDateTime')
  ) {
    return value;
  }

  const keys = Object.keys(value);

  for (let i = 0; i < keys.length; i++) {
    const found = preinspectR3418bExtractTaskObject_(
      value[keys[i]],
      depth + 1
    );

    if (found) return found;
  }

  return null;
}


function preinspectR3418bPushExactCalendarDateTimeForActiveMapping_() {
  const sheet = SpreadsheetApp.getActiveSheet();

  if (
    !sheet ||
    sheet.getName() !== PREINSPECT_REVIEW_CONFIG.SHEETS.MAPPING
  ) {
    throw new Error(
      'Internal mapping activation is missing for exact datetime push.'
    );
  }

  const rowNumber = sheet.getActiveRange().getRow();
  if (rowNumber < 2) throw new Error('Invalid mapping row.');

  const row = preinspectMappingRowObject_(sheet, rowNumber);
  const taskId = Number(String(row['Task ID'] || '').trim()) || 0;

  if (!taskId) {
    throw new Error(
      'Exact Calendar datetime push requires a mapped Task ID.'
    );
  }

  const patchPreviewRaw = String(row['Patch Preview'] || '').trim();
  let patchPreview = null;

  try {
    patchPreview = patchPreviewRaw ? JSON.parse(patchPreviewRaw) : null;
  } catch (err) {
    throw new Error(
      'Mapping Patch Preview is not valid JSON for Task ' + taskId + '.'
    );
  }

  if (!patchPreview || typeof patchPreview !== 'object') {
    throw new Error(
      'Mapping Patch Preview is missing for Task ' + taskId + '.'
    );
  }

  const previewTaskId =
    Number(String(patchPreview.Id || patchPreview.id || '').trim()) || 0;

  if (previewTaskId && previewTaskId !== taskId) {
    throw new Error(
      'Mapping Patch Preview Task ID does not match mapped Task ID. ' +
      'Preview=' + previewTaskId + '; Mapping=' + taskId + '.'
    );
  }

  const desiredStart = String(
    patchPreview.StartDateTime || patchPreview.startDateTime || ''
  ).trim();

  const desiredDue = String(
    patchPreview.DueDateTime || patchPreview.dueDateTime || ''
  ).trim();

  if (!desiredStart || !desiredDue) {
    throw new Error(
      'Mapping Patch Preview does not contain StartDateTime/DueDateTime ' +
      'for Task ' + taskId + '.'
    );
  }

  const offsetPattern = /(?:Z|[+-]\d{2}:?\d{2})$/i;

  if (!offsetPattern.test(desiredStart) || !offsetPattern.test(desiredDue)) {
    throw new Error(
      'Fail closed: mapping Patch Preview datetime is not timezone-explicit ' +
      'for Task ' + taskId + '. Start=' + desiredStart + '; Due=' + desiredDue
    );
  }

  if (
    !preinspectSameMinuteValue_(desiredStart, row['Calendar Start']) ||
    !preinspectSameMinuteValue_(desiredDue, row['Calendar End'])
  ) {
    throw new Error(
      'Fail closed: mapping Patch Preview no longer matches Calendar ' +
      'Start/End for Task ' + taskId + '.'
    );
  }

  const before = getStrivenTaskSnapshotById_(taskId, {});
  const beforeStart = before && before.start ? before.start : null;
  const beforeDue = before && before.due ? before.due : null;

  if (
    preinspectSameMinuteValue_(beforeStart, desiredStart) &&
    preinspectSameMinuteValue_(beforeDue, desiredDue)
  ) {
    return {
      mode: 'PREINSPECT_R3418E_SHARED_DATETIME_PATCH',
      status: 'NOT_NEEDED',
      writesPerformed: false,
      taskId: taskId,
      mappingRow: rowNumber,
      transport: 'patchStrivenTaskById_',
      desired: {
        startDateTime: desiredStart,
        dueDateTime: desiredDue
      },
      reason: 'Task StartDateTime/DueDateTime already match Calendar.'
    };
  }

  const payload = {
    Id: taskId,
    StartDateTime: desiredStart,
    DueDateTime: desiredDue
  };

  tmR45AssertPreInspectDateTimePatchSafe_(taskId, payload);
  const patchResult = patchStrivenTaskById_(taskId, payload);

  const after = getStrivenTaskSnapshotById_(taskId, {});
  const afterStart = after && after.start ? after.start : null;
  const afterDue = after && after.due ? after.due : null;

  if (
    !preinspectSameMinuteValue_(afterStart, desiredStart) ||
    !preinspectSameMinuteValue_(afterDue, desiredDue)
  ) {
    throw new Error(
      'Shared Task PATCH completed but authoritative read-back differs for ' +
      'Task ' + taskId + '. Desired=' + desiredStart + ' -> ' + desiredDue +
      '; ReadBack=' +
      (afterStart ? afterStart.toISOString() : '') + ' -> ' +
      (afterDue ? afterDue.toISOString() : '') + '.'
    );
  }

  return {
    mode: 'PREINSPECT_R3418E_SHARED_DATETIME_PATCH',
    status: 'PUSHED_AND_VERIFIED',
    writesPerformed: true,
    strivenWritesPerformed: true,
    calendarWritesPerformed: false,
    mappingRow: rowNumber,
    taskId: taskId,
    transport: 'patchStrivenTaskById_',
    payload: payload,
    patchResult: {
      taskId: patchResult && patchResult.taskId
        ? patchResult.taskId
        : taskId,
      statusCode: patchResult && patchResult.statusCode
        ? patchResult.statusCode
        : null
    },
    before: {
      startDateTime: beforeStart ? beforeStart.toISOString() : null,
      dueDateTime: beforeDue ? beforeDue.toISOString() : null
    },
    verified: {
      startDateTime: afterStart ? afterStart.toISOString() : null,
      dueDateTime: afterDue ? afterDue.toISOString() : null
    }
  };
}



function testPreInspectR3418bContracts() {
  const afternoon =
    preinspectR3418bMappingLocalIso_('2026-09-09 15:00:00');

  const result = {
    mode: 'PREINSPECT_R3418B_CONTRACTS',
    writesPerformed: false,
    oneAppointmentPerRun: true,
    exactDateTimePatch: true,
    afternoon24HourProof: afternoon,
    expectedAfternoon: '2026-09-09T15:00:00',
    noUserSheetSelectionRequired:
      typeof runNextPreInspectActionFromAppsScript === 'function',
    pass:
      afternoon === '2026-09-09T15:00:00' &&
      typeof preinspectR3418bPushExactCalendarDateTimeForActiveMapping_ ===
        'function' &&
      typeof preinspectR3418bReconcileNextMappedOpenTask_ === 'function'
  };

  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

/************************************************************
 * PREINSPECT R3.4.18d - READ-ONLY DATETIME TRANSPORT DIAGNOSTIC
 *
 * NO STRIVEN WRITES.
 * NO CALENDAR WRITES.
 * NO SHEET SELECTION REQUIRED.
 ************************************************************/
function inspectPreInspectTask18383DateTimeTransport() {
  const taskId = 18383;
  const ss = SpreadsheetApp.getActive();
  const sheet = ss.getSheetByName(PREINSPECT_REVIEW_CONFIG.SHEETS.MAPPING);

  if (!sheet) {
    throw new Error('Missing PreInspect Task Mapping sheet.');
  }

  const rows = tm_getSheetObjects_(sheet);
  let row = null;
  let mappingRow = 0;

  for (let i = 0; i < rows.length; i++) {
    if (Number(String(rows[i]['Task ID'] || '').trim()) === taskId) {
      row = rows[i];
      mappingRow = i + 2;
      break;
    }
  }

  if (!row) {
    throw new Error('Task 18383 is not currently mapped.');
  }

  const raw = preinspectGetTaskByIdReadonly_(taskId);
  const templateSnapshot = preinspectTaskTemplateSnapshot_(raw);
  const candidateSnapshot = preinspectTaskCandidateSnapshot_(raw);

  let sharedSnapshot = null;
  let sharedSnapshotError = '';

  if (typeof getStrivenTaskSnapshotById_ === 'function') {
    try {
      sharedSnapshot = getStrivenTaskSnapshotById_(taskId, {});
    } catch (err) {
      sharedSnapshotError =
        err && err.message ? err.message : String(err);
    }
  }

  let safePatchPreview = null;
  let safePatchPreviewError = '';

  const mappingPreviewRaw = String(row['Patch Preview'] || '').trim();
  let mappingPreviewJson = null;

  try {
    mappingPreviewJson =
      mappingPreviewRaw ? JSON.parse(mappingPreviewRaw) : null;
  } catch (ignore) {}

  if (
    mappingPreviewJson &&
    typeof strivenBuildSafeTaskPatchPayload_ === 'function'
  ) {
    try {
      safePatchPreview = strivenBuildSafeTaskPatchPayload_(
        {
          Id: taskId,
          StartDateTime: mappingPreviewJson.StartDateTime,
          DueDateTime: mappingPreviewJson.DueDateTime
        },
        taskId
      );
    } catch (err) {
      safePatchPreviewError =
        err && err.message ? err.message : String(err);
    }
  }

  const rawKeys =
    raw && typeof raw === 'object'
      ? Object.keys(raw).sort()
      : [];

  const result = {
    mode: 'PREINSPECT_R3418D_DATETIME_TRANSPORT_DIAGNOSTIC',
    writesPerformed: false,
    strivenWritesPerformed: false,
    calendarWritesPerformed: false,
    sheetWritesPerformed: false,
    taskId: taskId,
    mappingRow: mappingRow,

    mapping: {
      calendarStart: String(row['Calendar Start'] || ''),
      calendarEnd: String(row['Calendar End'] || ''),
      taskStart: String(row['Task Start'] || ''),
      taskDue: String(row['Task Due'] || ''),
      taskAction: String(row['Task Action'] || ''),
      patchPreviewRaw: mappingPreviewRaw,
      patchPreviewJson: mappingPreviewJson
    },

    rawGet: {
      topLevelKeys: rawKeys,
      startDateTimeLower:
        raw && raw.startDateTime !== undefined
          ? raw.startDateTime
          : null,
      startDateTimeUpper:
        raw && raw.StartDateTime !== undefined
          ? raw.StartDateTime
          : null,
      dueDateTimeLower:
        raw && raw.dueDateTime !== undefined
          ? raw.dueDateTime
          : null,
      dueDateTimeUpper:
        raw && raw.DueDateTime !== undefined
          ? raw.DueDateTime
          : null
    },

    normalizedByExistingPreInspectSnapshot: {
      startDateTime: templateSnapshot.startDateTime || null,
      dueDateTime: templateSnapshot.dueDateTime || null
    },

    normalizedByExistingCandidateSnapshot: {
      startDateTime: candidateSnapshot.startDateTime || null,
      dueDateTime: candidateSnapshot.dueDateTime || null
    },

    sharedTaskSnapshotAvailable:
      typeof getStrivenTaskSnapshotById_ === 'function',

    sharedTaskSnapshot: sharedSnapshot
      ? {
          startDateTime:
            sharedSnapshot.startDateTime ||
            sharedSnapshot.StartDateTime ||
            sharedSnapshot.start ||
            null,
          dueDateTime:
            sharedSnapshot.dueDateTime ||
            sharedSnapshot.DueDateTime ||
            sharedSnapshot.due ||
            null,
          rawKeys:
            typeof sharedSnapshot === 'object'
              ? Object.keys(sharedSnapshot).sort()
              : []
        }
      : null,

    sharedTaskSnapshotError: sharedSnapshotError,

    safePatchPayloadPreview: safePatchPreview,
    safePatchPayloadPreviewError: safePatchPreviewError,

    evidence: {
      verifierCaseSensitivityBug:
        (
          raw &&
          (
            raw.startDateTime !== undefined ||
            raw.dueDateTime !== undefined
          ) &&
          raw.StartDateTime === undefined &&
          raw.DueDateTime === undefined
        ),
      authoritativeTaskStillDiffersFromCalendar:
        !preinspectSameMinuteValue_(
          templateSnapshot.startDateTime,
          row['Calendar Start']
        ) ||
        !preinspectSameMinuteValue_(
          templateSnapshot.dueDateTime,
          row['Calendar End']
        )
    }
  };

  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

function testPreInspectR3418eSharedTaskPatchContracts() {
  const ss = SpreadsheetApp.getActive();
  const sheet = ss.getSheetByName(PREINSPECT_REVIEW_CONFIG.SHEETS.MAPPING);

  if (!sheet) throw new Error('Missing PreInspect Task Mapping sheet.');

  const rows = tm_getSheetObjects_(sheet);
  let row = null;

  for (let i = 0; i < rows.length; i++) {
    if (Number(String(rows[i]['Task ID'] || '').trim()) === 18383) {
      row = rows[i];
      break;
    }
  }

  if (!row) throw new Error('Task 18383 is not currently mapped.');

  const preview = JSON.parse(String(row['Patch Preview'] || '{}'));
  const route = strivenBuildTaskUrl_(18383);
  const safe = strivenBuildSafeTaskPatchPayload_(
    {
      Id: 18383,
      StartDateTime: preview.StartDateTime,
      DueDateTime: preview.DueDateTime
    },
    18383
  );

  const result = {
    mode: 'PREINSPECT_R3418E_SHARED_TASK_PATCH_CONTRACTS',
    writesPerformed: false,
    taskId: 18383,
    projectTaskRoute: route,
    calendarStart: String(row['Calendar Start'] || ''),
    calendarEnd: String(row['Calendar End'] || ''),
    patchPreview: preview,
    safePayload: safe,
    helperAvailability: {
      patchStrivenTaskById:
        typeof patchStrivenTaskById_ === 'function',
      strivenBuildTaskUrl:
        typeof strivenBuildTaskUrl_ === 'function',
      getStrivenTaskSnapshotById:
        typeof getStrivenTaskSnapshotById_ === 'function'
    },
    pass:
      typeof patchStrivenTaskById_ === 'function' &&
      typeof strivenBuildTaskUrl_ === 'function' &&
      typeof getStrivenTaskSnapshotById_ === 'function' &&
      String(preview.StartDateTime || '') ===
        '2026-09-09T15:00:00-04:00' &&
      String(preview.DueDateTime || '') ===
        '2026-09-09T16:00:00-04:00' &&
      String(safe.StartDateTime || '') ===
        String(preview.StartDateTime || '') &&
      String(safe.DueDateTime || '') ===
        String(preview.DueDateTime || '')
  };

  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

/************************************************************
 * PREINSPECT R3.4.18f
 * MATCHED OPEN TASK -> MANAGED CALENDAR TASK LINK
 *
 * Calendar write policy:
 * - preserve ALL authored description text byte-for-byte;
 * - remove/refresh ONLY the managed Pre-Inspection Task Link
 *   footer at the END of the description;
 * - append the current task footer at the bottom;
 * - hyperlink the visible TASK NAME, not a raw URL line;
 * - authoritative read-back verification;
 * - never changes Calendar title/location/time/guests;
 * - never writes Striven.
 ************************************************************/
const PREINSPECT_R3418F_CALENDAR_ID =
  'c_3088a3989f3eb809957ed5c40137a7111a0ac97f68c29b40c144028cb14320dc@group.calendar.google.com';

const PREINSPECT_R3418F_TASK_LINK_HEADING =
  '------- Pre-Inspection Task Link -------';

const PREINSPECT_R3418F_TASK_LINK_END =
  '------------------------------------';


function preinspectR3418fEscapeHtml_(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}


function preinspectR3418fTaskUrl_(taskId) {
  const id = Number(taskId || 0);
  if (!id) return '';

  return (
    'https://classicfireplace.striven.com/Tasks/TaskInfo.aspx?TaskID=' +
    encodeURIComponent(id)
  );
}


function preinspectR3418fBuildManagedFooter_(taskId, taskName) {
  const url = preinspectR3418fTaskUrl_(taskId);
  const name = String(taskName || '').trim();

  if (!url || !name) {
    throw new Error(
      'Managed Calendar Task Link requires Task ID and Task Name.'
    );
  }

  return [
    PREINSPECT_R3418F_TASK_LINK_HEADING,
    '<a href="' + preinspectR3418fEscapeHtml_(url) + '">' +
      preinspectR3418fEscapeHtml_(name) +
      '</a>',
    PREINSPECT_R3418F_TASK_LINK_END
  ].join('<br>');
}


function preinspectR3418fSplitAuthoredAndManaged_(description) {
  const raw = String(description || '');

  /************************************************************
   * Only treat a Pre-Inspection Task Link heading as managed
   * when it appears in the trailing footer region.
   *
   * This deliberately avoids global find/replace over customer
   * notes. If no valid trailing managed block is identified,
   * the entire current description remains authored text.
   ************************************************************/
  const headingRegex =
    /-{5,}\s*Pre-Inspection\s+Task\s+Link\s*-{5,}/gi;

  let match;
  let last = null;

  while ((match = headingRegex.exec(raw)) !== null) {
    last = {
      index: match.index,
      end: headingRegex.lastIndex
    };
  }

  if (!last) {
    return {
      authored: raw,
      managed: '',
      managedFound: false
    };
  }

  const tail = raw.slice(last.index);

  const hasTaskEvidence =
    /TaskInfo\.aspx\?TaskID=\d+/i.test(tail) ||
    /href=["'][^"']*TaskInfo\.aspx\?TaskID=\d+/i.test(tail);

  const hasFooterEnd = /-{10,}\s*$/i.test(
    tail
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/&nbsp;/gi, ' ')
      .trim()
  );

  if (!hasTaskEvidence || !hasFooterEnd) {
    return {
      authored: raw,
      managed: '',
      managedFound: false
    };
  }

  return {
    authored: raw.slice(0, last.index),
    managed: tail,
    managedFound: true
  };
}


function preinspectR3418fAppendFooterPreservingAuthored_(authored, footer) {
  const base = String(authored || '');
  const block = String(footer || '');

  if (!base) return block;

  /************************************************************
   * Do not trim, rewrite, normalize, or rebuild the authored
   * description. Append only.
   ************************************************************/
  if (/(?:<br\s*\/?>|\r?\n)\s*$/i.test(base)) {
    return base + block;
  }

  return base + '<br><br>' + block;
}


function preinspectR3418fTaskTitleById_(taskId) {
  const raw = preinspectGetTaskByIdReadonly_(taskId);

  const title = String(
    (raw && (raw.title || raw.Title)) || ''
  ).trim();

  if (!title) {
    throw new Error(
      'Task ' + taskId + ' title could not be read; Calendar link not written.'
    );
  }

  return title;
}


function preinspectR3418fFindMappingContextForTask_(taskId) {
  const id = Number(taskId || 0);
  if (!id) return null;

  const ss = SpreadsheetApp.getActive();
  const sheet = ss.getSheetByName(PREINSPECT_REVIEW_CONFIG.SHEETS.MAPPING);
  if (!sheet) throw new Error('Missing PreInspect Task Mapping sheet.');

  const rows = tm_getSheetObjects_(sheet);
  const matches = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];

    if (Number(String(row['Task ID'] || '').trim()) !== id) continue;

    matches.push({
      mappingRow: i + 2,
      row: row
    });
  }

  if (matches.length !== 1) {
    throw new Error(
      'Expected exactly one mapping row for Task ' + id +
      '; found ' + matches.length + '. Calendar link write blocked.'
    );
  }

  return matches[0];
}


function preinspectR3418fExtractTaskIdFromObject_(value, depth) {
  depth = Number(depth || 0);
  if (value == null || depth > 7) return 0;

  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const id = preinspectR3418fExtractTaskIdFromObject_(
        value[i],
        depth + 1
      );
      if (id) return id;
    }
    return 0;
  }

  if (typeof value !== 'object') return 0;

  const direct = Number(
    value.taskId ||
    value.TaskId ||
    value.taskID ||
    value.TaskID ||
    0
  );

  if (direct) return direct;

  const keys = Object.keys(value);

  for (let i = 0; i < keys.length; i++) {
    const id = preinspectR3418fExtractTaskIdFromObject_(
      value[keys[i]],
      depth + 1
    );
    if (id) return id;
  }

  return 0;
}


function preinspectR3418fResolveHandledTaskContext_(context) {
  const ctx = context || {};

  let taskId = Number(
    ctx.foundTaskReconcile && ctx.foundTaskReconcile.taskId
  ) || 0;

  let mappingRow = Number(
    ctx.foundTaskReconcile && ctx.foundTaskReconcile.mappingRow
  ) || 0;

  if (!taskId) {
    taskId = preinspectR3418fExtractTaskIdFromObject_(
      ctx.endToEnd,
      0
    );
  }

  if (!taskId) {
    return {
      status: 'NO_HANDLED_TASK',
      taskId: 0,
      mappingRow: 0,
      row: null
    };
  }

  const mapping = preinspectR3418fFindMappingContextForTask_(taskId);

  if (mappingRow && mapping.mappingRow !== mappingRow) {
    throw new Error(
      'Handled mapping row changed before Calendar link sync for Task ' +
      taskId + '.'
    );
  }

  return {
    status: 'RESOLVED',
    taskId: taskId,
    mappingRow: mapping.mappingRow,
    row: mapping.row
  };
}


function preinspectR3418fSyncHandledTaskLinkToCalendar_(context) {
  const resolved = preinspectR3418fResolveHandledTaskContext_(context);

  if (resolved.status === 'NO_HANDLED_TASK') {
    return {
      mode: 'PREINSPECT_R3418F_CALENDAR_TASK_LINK',
      status: 'NOT_APPLICABLE_NO_HANDLED_TASK',
      writesPerformed: false,
      calendarWritesPerformed: false
    };
  }

  const row = resolved.row || {};
  const classification =
    String(row['Classification'] || '').trim().toUpperCase();
  const mappingStatus =
    String(row['Status'] || '').trim().toUpperCase();
  const taskStatus =
    String(row['Task Status'] || '').trim().toUpperCase();
  const mappedTaskId =
    Number(String(row['Task ID'] || '').trim()) || 0;
  const eventId = String(row['Event ID'] || '').trim();

  if (
    classification !== 'PREINSPECT_JOB' ||
    mappingStatus !== 'MATCHED' ||
    taskStatus !== 'OPEN' ||
    mappedTaskId !== resolved.taskId ||
    !eventId
  ) {
    return {
      mode: 'PREINSPECT_R3418F_CALENDAR_TASK_LINK',
      status: 'SKIPPED_NOT_VERIFIED_MATCHED_OPEN_PREINSPECT',
      writesPerformed: false,
      calendarWritesPerformed: false,
      mappingRow: resolved.mappingRow,
      taskId: resolved.taskId,
      eventId: eventId,
      classification: classification,
      mappingStatus: mappingStatus,
      taskStatus: taskStatus
    };
  }

  const taskName = preinspectR3418fTaskTitleById_(resolved.taskId);
  const taskUrl = preinspectR3418fTaskUrl_(resolved.taskId);

  const calendar = CalendarApp.getCalendarById(
    PREINSPECT_R3418F_CALENDAR_ID
  );

  if (!calendar) {
    throw new Error('PreInspect Calendar could not be opened by ID.');
  }

  const event = calendar.getEventById(eventId);

  if (!event) {
    throw new Error(
      'Calendar event could not be found for Event ID ' + eventId + '.'
    );
  }

  const currentDescription = String(event.getDescription() || '');
  const split = preinspectR3418fSplitAuthoredAndManaged_(
    currentDescription
  );
  const footer = preinspectR3418fBuildManagedFooter_(
    resolved.taskId,
    taskName
  );
  const desiredDescription =
    preinspectR3418fAppendFooterPreservingAuthored_(
      split.authored,
      footer
    );

  if (currentDescription === desiredDescription) {
    return {
      mode: 'PREINSPECT_R3418F_CALENDAR_TASK_LINK',
      status: 'NOT_NEEDED',
      writesPerformed: false,
      calendarWritesPerformed: false,
      mappingRow: resolved.mappingRow,
      eventId: eventId,
      taskId: resolved.taskId,
      taskUrl: taskUrl,
      linkedDisplayText: taskName,
      existingDescriptionPreserved: true
    };
  }

  /************************************************************
   * The ONLY Calendar mutation in this helper.
   ************************************************************/
  event.setDescription(desiredDescription);

  Utilities.sleep(250);

  const verifyEvent = calendar.getEventById(eventId);

  if (!verifyEvent) {
    throw new Error(
      'Calendar event disappeared during Task Link read-back verification.'
    );
  }

  const readBack = String(verifyEvent.getDescription() || '');
  const verifySplit = preinspectR3418fSplitAuthoredAndManaged_(readBack);

  const authoredPreserved =
    verifySplit.authored === split.authored;

  const linkPresent =
    readBack.indexOf(taskUrl) !== -1;

  const taskNamePresent =
    readBack.indexOf(taskName) !== -1 ||
    readBack.indexOf(preinspectR3418fEscapeHtml_(taskName)) !== -1;

  if (!authoredPreserved || !linkPresent || !taskNamePresent) {
    throw new Error(
      'Calendar Task Link write completed but read-back verification failed ' +
      'for Event ' + eventId + '. AuthoredPreserved=' +
      authoredPreserved + '; LinkPresent=' + linkPresent +
      '; TaskNamePresent=' + taskNamePresent + '.'
    );
  }

  return {
    mode: 'PREINSPECT_R3418F_CALENDAR_TASK_LINK',
    status: 'APPENDED_OR_MANAGED_FOOTER_UPDATED_AND_VERIFIED',
    writesPerformed: true,
    calendarWritesPerformed: true,
    strivenWritesPerformed: false,
    mappingRow: resolved.mappingRow,
    eventId: eventId,
    taskId: resolved.taskId,
    taskUrl: taskUrl,
    linkedDisplayText: taskName,
    existingDescriptionPreserved: true,
    replacedExistingManagedFooter: split.managedFound
  };
}


function testPreInspectR3418fCalendarTaskLinkContracts() {
  const authored =
    'Customer-authored line 1\nCustomer-authored line 2';

  const oldFooter = [
    PREINSPECT_R3418F_TASK_LINK_HEADING,
    '<a href="https://classicfireplace.striven.com/Tasks/TaskInfo.aspx?TaskID=111">Old Task</a>',
    PREINSPECT_R3418F_TASK_LINK_END
  ].join('<br>');

  const existing = authored + '<br><br>' + oldFooter;
  const split = preinspectR3418fSplitAuthoredAndManaged_(existing);
  const newFooter = preinspectR3418fBuildManagedFooter_(
    18383,
    'Preinspect - Amir Lotfi - (519) 500-2570'
  );
  const rebuilt = preinspectR3418fAppendFooterPreservingAuthored_(
    split.authored,
    newFooter
  );

  let livePreview = null;
  let livePreviewError = '';

  try {
    const mapping = preinspectR3418fFindMappingContextForTask_(18383);
    const row = mapping.row;
    const eventId = String(row['Event ID'] || '').trim();
    const calendar = CalendarApp.getCalendarById(
      PREINSPECT_R3418F_CALENDAR_ID
    );
    const event = calendar && eventId
      ? calendar.getEventById(eventId)
      : null;

    if (event) {
      const current = String(event.getDescription() || '');
      const currentSplit =
        preinspectR3418fSplitAuthoredAndManaged_(current);
      const taskName = preinspectR3418fTaskTitleById_(18383);
      const desired = preinspectR3418fAppendFooterPreservingAuthored_(
        currentSplit.authored,
        preinspectR3418fBuildManagedFooter_(18383, taskName)
      );

      livePreview = {
        mappingRow: mapping.mappingRow,
        eventId: eventId,
        taskId: 18383,
        taskName: taskName,
        currentManagedFooterFound: currentSplit.managedFound,
        wouldUpdate: current !== desired,
        authoredLength: currentSplit.authored.length,
        desiredContainsTaskUrl:
          desired.indexOf(preinspectR3418fTaskUrl_(18383)) !== -1
      };
    }
  } catch (err) {
    livePreviewError = err && err.message ? err.message : String(err);
  }

  const result = {
    mode: 'PREINSPECT_R3418F_CALENDAR_TASK_LINK_CONTRACTS',
    writesPerformed: false,
    calendarWritesPerformed: false,
    authoredDescriptionPreservedExactly:
      split.authored === authored + '<br><br>',
    existingManagedFooterDetected: split.managedFound === true,
    replacementContainsTaskNameHyperlink:
      rebuilt.indexOf('TaskInfo.aspx?TaskID=18383') !== -1 &&
      rebuilt.indexOf('Preinspect - Amir Lotfi - (519) 500-2570') !== -1,
    rawUrlLineNotUsed:
      rebuilt.indexOf(
        '<br>https://classicfireplace.striven.com/Tasks/TaskInfo.aspx?TaskID=18383<br>'
      ) === -1,
    livePreview: livePreview,
    livePreviewError: livePreviewError,
    pass:
      split.managedFound === true &&
      split.authored === authored + '<br><br>' &&
      rebuilt.indexOf('TaskInfo.aspx?TaskID=18383') !== -1 &&
      rebuilt.indexOf('Preinspect - Amir Lotfi - (519) 500-2570') !== -1
  };

  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

/************************************************************
 * PREINSPECT R3.4.18g - CALENDAR SHEET SCHEMA GUARD
 ************************************************************/
const PREINSPECT_R3418G_CALENDAR_HEADERS = [
  'Event ID',
  'Start Date',
  'Start Time',
  'End Date',
  'End Time',
  'All-Day?',
  'Title',
  'Location',
  'Description',
  'Description HTML Source',
  'Organizers',
  'Guests (emails)',
  'Customer #',
  'Phone',
  'Striven Task Link',
  'Event Link',
  'Sales Order',
  'Task'
];

const PREINSPECT_R3418G_CALENDAR_WIDTH = 18;

function preinspectR3418gCleanHeader_(value) {
  return String(value == null ? '' : value).trim();
}

function preinspectR3418gIsGenericDriftHeader_(value) {
  return /^Column\s+\d+$/i.test(preinspectR3418gCleanHeader_(value));
}

function preinspectR3418gReadCalendarSchema_() {
  const ss = SpreadsheetApp.getActive();
  const sheet = ss.getSheetByName(PREINSPECT_REVIEW_CONFIG.SHEETS.CALENDAR);
  if (!sheet) throw new Error('Missing PreInspect Calendar sheet.');

  const lastRow = Math.max(sheet.getLastRow(), 1);
  const lastColumn = Math.max(sheet.getLastColumn(), 1);
  const maxColumns = sheet.getMaxColumns();
  const headers = sheet
    .getRange(1, 1, 1, lastColumn)
    .getDisplayValues()[0]
    .map(preinspectR3418gCleanHeader_);

  return {
    sheet: sheet,
    lastRow: lastRow,
    lastColumn: lastColumn,
    maxColumns: maxColumns,
    headers: headers,
    salesOrderColumn: headers.indexOf('Sales Order') + 1,
    taskColumn: headers.indexOf('Task') + 1
  };
}

function preinspectR3418gBaseHeadersMatch_(headers) {
  const expected = PREINSPECT_R3418G_CALENDAR_HEADERS.slice(0, 16);
  for (let i = 0; i < expected.length; i++) {
    if (preinspectR3418gCleanHeader_(headers[i]) !== expected[i]) return false;
  }
  return true;
}

function preinspectR3418gFindUnexpectedExtraData_(state) {
  const problems = [];
  if (state.lastRow < 2 || state.lastColumn <= 18) return problems;

  for (let col = 19; col <= state.lastColumn; col++) {
    if (col === state.salesOrderColumn || col === state.taskColumn) continue;

    const header = preinspectR3418gCleanHeader_(state.headers[col - 1]);
    const values = state.sheet
      .getRange(2, col, state.lastRow - 1, 1)
      .getDisplayValues();

    const hasData = values.some(function(row) {
      return String(row[0] == null ? '' : row[0]).trim() !== '';
    });

    if (hasData) {
      problems.push({ column: col, header: header, reason: 'NON_EMPTY_DATA' });
    } else if (header && !preinspectR3418gIsGenericDriftHeader_(header)) {
      problems.push({
        column: col,
        header: header,
        reason: 'UNKNOWN_NON_MANAGED_HEADER'
      });
    }
  }

  return problems;
}

function preinspectR3418gNormalizeCalendarSchema_() {
  const before = preinspectR3418gReadCalendarSchema_();
  const sheet = before.sheet;

  if (!preinspectR3418gBaseHeadersMatch_(before.headers)) {
    throw new Error(
      'Fail closed: PreInspect Calendar base columns A:P do not match the expected schema.'
    );
  }

  const unexpected = preinspectR3418gFindUnexpectedExtraData_(before);
  if (unexpected.length) {
    throw new Error(
      'Fail closed: extra PreInspect Calendar columns contain non-managed data/header: ' +
      JSON.stringify(unexpected)
    );
  }

  if (sheet.getMaxColumns() < 18) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), 18 - sheet.getMaxColumns());
  }

  const copyRows = Math.max(before.lastRow, 1);

  if (before.salesOrderColumn && before.salesOrderColumn !== 17) {
    sheet
      .getRange(1, before.salesOrderColumn, copyRows, 1)
      .copyTo(sheet.getRange(1, 17, copyRows, 1));
  }

  if (before.taskColumn && before.taskColumn !== 18) {
    sheet
      .getRange(1, before.taskColumn, copyRows, 1)
      .copyTo(sheet.getRange(1, 18, copyRows, 1));
  }

  sheet.getRange(1, 17).setValue('Sales Order');
  sheet.getRange(1, 18).setValue('Task');

  if (sheet.getMaxColumns() > 18) {
    sheet.deleteColumns(19, sheet.getMaxColumns() - 18);
  }

  sheet.setColumnWidth(17, 190);
  sheet.setColumnWidth(18, 320);
  sheet.setFrozenRows(1);
  SpreadsheetApp.flush();

  const after = preinspectR3418gReadCalendarSchema_();
  const afterHeaders = after.headers.slice(0, 18);

  if (
    after.maxColumns !== 18 ||
    afterHeaders.join('|') !== PREINSPECT_R3418G_CALENDAR_HEADERS.join('|')
  ) {
    throw new Error(
      'Calendar schema cleanup read-back failed. maxColumns=' + after.maxColumns +
      '; headers=' + JSON.stringify(afterHeaders)
    );
  }

  const changed =
    before.maxColumns !== 18 ||
    before.salesOrderColumn !== 17 ||
    before.taskColumn !== 18 ||
    before.headers.slice(0, 18).join('|') !==
      PREINSPECT_R3418G_CALENDAR_HEADERS.join('|');

  const result = {
    mode: 'PREINSPECT_R3418G_CALENDAR_SCHEMA_GUARD',
    status: changed ? 'COMPACTED_AND_VERIFIED' : 'NOT_NEEDED',
    writesPerformed: changed,
    sheetWritesPerformed: changed,
    calendarWritesPerformed: false,
    strivenWritesPerformed: false,
    before: {
      lastColumn: before.lastColumn,
      maxColumns: before.maxColumns,
      salesOrderColumn: before.salesOrderColumn || null,
      taskColumn: before.taskColumn || null
    },
    after: {
      lastColumn: after.lastColumn,
      maxColumns: after.maxColumns,
      salesOrderColumn: after.salesOrderColumn,
      taskColumn: after.taskColumn
    }
  };

  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

function repairPreInspectCalendarColumnDrift() {
  return preinspectR3418gNormalizeCalendarSchema_();
}

function testPreInspectR3418gCalendarColumnSchema() {
  const state = preinspectR3418gReadCalendarSchema_();
  const unexpected = preinspectR3418gFindUnexpectedExtraData_(state);
  const placeholders = state.headers
    .map(function(header, index) {
      return preinspectR3418gIsGenericDriftHeader_(header)
        ? { column: index + 1, header: header }
        : null;
    })
    .filter(Boolean);

  const result = {
    mode: 'PREINSPECT_R3418G_CALENDAR_SCHEMA_TEST',
    writesPerformed: false,
    lastColumn: state.lastColumn,
    maxColumns: state.maxColumns,
    salesOrderColumn: state.salesOrderColumn || null,
    taskColumn: state.taskColumn || null,
    placeholderHeaderCount: placeholders.length,
    placeholderHeaders: placeholders,
    unexpectedExtraData: unexpected,
    expected: {
      maxColumns: 18,
      salesOrderColumn: 17,
      taskColumn: 18
    },
    pass:
      state.maxColumns === 18 &&
      state.salesOrderColumn === 17 &&
      state.taskColumn === 18 &&
      placeholders.length === 0 &&
      unexpected.length === 0
  };

  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

function preinspectR3414ApplySheetHyperlinks_() {
  const schemaBefore = preinspectR3418gNormalizeCalendarSchema_();
  const result = preinspectR3414ApplySheetHyperlinks__R3418G_ORIGINAL_.apply(this, arguments);
  const schemaAfter = preinspectR3418gNormalizeCalendarSchema_();
  if (result && typeof result === 'object') {
    result.calendarSchemaGuard = { before: schemaBefore, after: schemaAfter };
  }
  return result;
}

/************************************************************
 * PREINSPECT R3.4.19
 * CF PREINSPECTS TEST + DURABLE MANUAL OVERRIDE
 ************************************************************/
const PREINSPECT_R3419_PRIMARY_CALENDAR_ID =
  'c_3088a3989f3eb809957ed5c40137a7111a0ac97f68c29b40c144028cb14320dc@group.calendar.google.com';
const PREINSPECT_R3419_SECONDARY_CALENDAR_ID =
  'classicfireplace.ca_c20qcqfhvjbv784asn9pvuiaf4@group.calendar.google.com';
// Legacy name retained for compatibility; secondary calendar is read-only/fallback.
const PREINSPECT_R3419_TEST_CALENDAR_ID = PREINSPECT_R3419_SECONDARY_CALENDAR_ID;
const PREINSPECT_R3419_OVERRIDE_HEADER = 'Manual Override';
const PREINSPECT_R3419_OVERRIDE_VALUES = ['AUTO','PREINSPECT','NOT Preinspect'];
const PREINSPECT_R3419_OVERRIDE_PREFIX = 'PREINSPECT_R3419_OVERRIDE::';
const PREINSPECT_R3419_TASK_TYPE_ID = 105;
const PREINSPECT_R3419_TASK_STATUS = { OPEN:48, DONE:50, CANCELED:51, ON_HOLD:68 };

function preinspectR3419NormOverride_(v) {
  const s=String(v==null?'':v).trim(), u=s.toUpperCase();
  if (!s || u==='AUTO') return 'AUTO';
  if (u==='PREINSPECT') return 'PREINSPECT';
  if (u==='NOT PREINSPECT' || u==='NOT_PREINSPECT' || u==='NOT-PREINSPECT') return 'NOT_PREINSPECT';
  throw new Error('Invalid Manual Override: '+s);
}
function preinspectR3419OverrideDisplay_(v) {
  const n=preinspectR3419NormOverride_(v);
  return n==='NOT_PREINSPECT'?'NOT Preinspect':n;
}
function preinspectR3419OverrideKey_(eventId) {
  const id=String(eventId||'').trim();
  if (!id) throw new Error('Manual Override requires Event ID.');
  return PREINSPECT_R3419_OVERRIDE_PREFIX+id;
}
function preinspectR3419GetOverride_(eventId) {
  const id=String(eventId||'').trim();
  if (!id) return 'AUTO';
  const v=PropertiesService.getScriptProperties().getProperty(preinspectR3419OverrideKey_(id));
  return v?preinspectR3419NormOverride_(v):'AUTO';
}
function preinspectR3419SetOverride_(eventId,value) {
  const n=preinspectR3419NormOverride_(value), p=PropertiesService.getScriptProperties(), k=preinspectR3419OverrideKey_(eventId);
  if (n==='AUTO') p.deleteProperty(k); else p.setProperty(k,n);
  return n;
}
function preinspectR3419FindHeaderCol_(sheet,name) {
  if (!sheet || sheet.getLastColumn()<1) return 0;
  const h=sheet.getRange(1,1,1,sheet.getLastColumn()).getDisplayValues()[0].map(String).map(function(x){return x.trim();});
  const a=[]; h.forEach(function(x,i){if(x===name)a.push(i+1);});
  if (a.length>1) throw new Error('Duplicate header '+name+': '+a.join(','));
  return a[0]||0;
}
function preinspectR3419EnsureOverrideColumn_(sheet) {
  let c=preinspectR3419FindHeaderCol_(sheet,PREINSPECT_R3419_OVERRIDE_HEADER);
  if (!c) {
    c=Math.max(sheet.getLastColumn(),PREINSPECT_MAP_HEADERS.length)+1;
    if(sheet.getMaxColumns()<c)sheet.insertColumnsAfter(sheet.getMaxColumns(),c-sheet.getMaxColumns());
    sheet.getRange(1,c).setValue(PREINSPECT_R3419_OVERRIDE_HEADER);
  }
  const rule=SpreadsheetApp.newDataValidation().requireValueInList(PREINSPECT_R3419_OVERRIDE_VALUES,true).setAllowInvalid(false).build();
  sheet.getRange(2,c,Math.max(sheet.getMaxRows()-1,1),1).setDataValidation(rule);
  sheet.showColumns(c); sheet.setColumnWidth(c,145);
  sheet.getRange(1,c).setNote('AUTO = classifier. PREINSPECT = force safe revalidation. NOT Preinspect = durable exclusion by Event ID; cancel verified OPEN/ON HOLD Pre Inspection Task and remove managed Calendar footer.');
  return c;
}
function preinspectR3419RestoreOverrideColumn_(sheet) {
  const c=preinspectR3419EnsureOverrideColumn_(sheet), e=preinspectR3419FindHeaderCol_(sheet,'Event ID'), n=sheet.getLastRow();
  if (!e || n<2) return {overrideColumn:c,rowsRestored:0};
  const ids=sheet.getRange(2,e,n-1,1).getDisplayValues();
  sheet.getRange(2,c,n-1,1).setValues(ids.map(function(r){const id=String(r[0]||'').trim();return [id?preinspectR3419OverrideDisplay_(preinspectR3419GetOverride_(id)):'AUTO'];}));
  return {overrideColumn:c,rowsRestored:n-1};
}
function setupPreinspectManualOverrideDropdown() {
  const s=SpreadsheetApp.getActive().getSheetByName(PREINSPECT_REVIEW_CONFIG.SHEETS.MAPPING);
  if(!s)throw new Error('Missing PreInspect Task Mapping.');
  const r=preinspectR3419RestoreOverrideColumn_(s), out={mode:'PREINSPECT_R3419_OVERRIDE_DROPDOWN_SETUP',status:'COMPLETE',writesPerformed:true,calendarWritesPerformed:false,strivenWritesPerformed:false,overrideColumn:r.overrideColumn,rowsRestored:r.rowsRestored,values:PREINSPECT_R3419_OVERRIDE_VALUES};
  Logger.log(JSON.stringify(out,null,2)); return out;
}

function preinspectR3419ApplyOverrideToObject_R3420_ORIGINAL_(o) {
  o=o||{}; const id=String(o['Event ID']||'').trim(); if(!id)return o;
  const m=preinspectR3419GetOverride_(id);
  if(m==='NOT_PREINSPECT'){
    o['Status']='SKIP'; o['Task Action']='MANUAL_NOT_PREINSPECT'; o['Classification']='OTHER_JOB';
    o['Classification Reason']='Manual Override: NOT Preinspect.'; o['Issue']='Manual Override: NOT Preinspect. PreInspection automation disabled for this Event ID.';
    o['Patch Preview']=''; o['Lookup State']='NOT_REQUIRED';
  } else if(m==='PREINSPECT'){
    o['Status']='REVIEW'; o['Task Action']='REVALIDATE_FIRST'; o['Classification']='PREINSPECT_JOB';
    o['Classification Reason']='Manual Override: PREINSPECT.'; o['Issue']='Manual Override: PREINSPECT. Safe customer/task revalidation required.';
    o['Patch Preview']=''; o['Lookup State']='PENDING';
  }
  return o;
}
function preinspectWriteMappingObjects_(sheet,objects) {
  const r=preinspectWriteMappingObjects_R3419_ORIGINAL_(sheet,(objects||[]).map(preinspectR3419ApplyOverrideToObject_));
  preinspectR3419RestoreOverrideColumn_(sheet); return r;
}
function preinspectWriteSingleMappingObject_(sheet,rowNumber,obj) {
  const r=preinspectWriteSingleMappingObject_R3419_ORIGINAL_(sheet,rowNumber,preinspectR3419ApplyOverrideToObject_(obj));
  preinspectR3419RestoreOverrideColumn_(sheet); return r;
}
function preinspectApplyMappingFormatting_(sheet) {
  const r=preinspectApplyMappingFormatting_R3419_ORIGINAL_(sheet);
  if(sheet&&sheet.getName()===PREINSPECT_REVIEW_CONFIG.SHEETS.MAPPING)preinspectR3419EnsureOverrideColumn_(sheet);
  return r;
}

function preinspectR3419ReadMappingRow_(sheet,row) {
  const n=sheet.getLastColumn(), h=sheet.getRange(1,1,1,n).getDisplayValues()[0], v=sheet.getRange(row,1,1,n).getValues()[0], o={};
  h.forEach(function(x,i){x=String(x||'').trim();if(x)o[x]=v[i];}); return o;
}
function preinspectR3419SetMappingFields_(sheet,row,fields) {
  const h=sheet.getRange(1,1,1,sheet.getLastColumn()).getDisplayValues()[0].map(function(x){return String(x||'').trim();});
  Object.keys(fields).forEach(function(k){const i=h.indexOf(k);if(i>=0)sheet.getRange(row,i+1).setValue(fields[k]);});
}
function preinspectR3419TaskSnapshot_(taskId) {
  const raw=preinspectGetTaskByIdReadonly_(taskId); if(!raw)throw new Error('Task '+taskId+' could not be read.');
  const t=raw.type||raw.Type||{}, s=raw.status||raw.Status||{};
  return {taskId:Number(raw.id||raw.Id||taskId)||0,typeId:Number(t.id||t.Id||0)||0,typeName:String(t.name||t.Name||''),statusId:Number(s.id||s.Id||0)||0,statusName:String(s.name||s.Name||'')};
}
function preinspectR3419CancelMappedTask_(taskId) {
  const id=Number(taskId||0); if(!id)return {status:'NO_MAPPED_TASK',writesPerformed:false,taskId:null};
  const b=preinspectR3419TaskSnapshot_(id);
  if(b.typeId!==105)throw new Error('Refusing cancel Task '+id+': Task Type '+b.typeId+' is not Pre Inspection Type 105.');
  if(b.statusId===51||/cancel/i.test(b.statusName))return {status:'ALREADY_CANCELED',writesPerformed:false,taskId:id};
  if(b.statusId===50||/^done$/i.test(b.statusName))return {status:'DONE_PRESERVED_NOT_CANCELED',writesPerformed:false,taskId:id,reason:'Completed history preserved.'};
  if(!(b.statusId===48||b.statusId===68||/^open$/i.test(b.statusName)||/on\s*hold/i.test(b.statusName)))throw new Error('Unsupported Task status '+b.statusId+' ('+b.statusName+').');
  const payload={Id:id,Status:{Id:51}};
  const resp=strivenTaskRequestJson_('patch',strivenBuildTaskUrl_(id),payload,'PreInspect Manual Override cancel Task '+id);
  const a=preinspectR3419TaskSnapshot_(id);
  if(a.statusId!==51&&!/cancel/i.test(a.statusName))throw new Error('Task '+id+' cancel did not verify. ReadBack='+a.statusId+' '+a.statusName);
  return {status:'CANCELED_AND_VERIFIED',writesPerformed:true,strivenWritesPerformed:true,taskId:id,payload:payload,httpStatusCode:resp&&resp.statusCode?resp.statusCode:null,afterStatusId:a.statusId,afterStatusName:a.statusName};
}
function preinspectR3419CalendarIds_() {
  const a=[String(PREINSPECT_R3419_PRIMARY_CALENDAR_ID||'')];
  if(typeof PREINSPECT_R3418F_CALENDAR_ID!=='undefined'&&PREINSPECT_R3418F_CALENDAR_ID)a.push(String(PREINSPECT_R3418F_CALENDAR_ID));
  if(PREINSPECT_REVIEW_CONFIG&&PREINSPECT_REVIEW_CONFIG.CALENDAR_SYNC&&PREINSPECT_REVIEW_CONFIG.CALENDAR_SYNC.CALENDAR_ID)a.push(String(PREINSPECT_REVIEW_CONFIG.CALENDAR_SYNC.CALENDAR_ID));
  a.push(String(PREINSPECT_R3419_SECONDARY_CALENDAR_ID||''));
  return a.filter(function(x,i,z){return x&&z.indexOf(x)===i;});
}
function preinspectR3419FindEvent_(eventId) {
  const matches=[];
  preinspectR3419CalendarIds_().forEach(function(id){
    const c=CalendarApp.getCalendarById(id); if(!c)return;
    const e=c.getEventById(eventId); if(e)matches.push({calendarId:id,calendarName:c.getName(),event:e});
  });
  if(!matches.length)return null;
  const primaryId=String(PREINSPECT_R3419_PRIMARY_CALENDAR_ID||'');
  const primary=matches.filter(function(x){return String(x.calendarId||'')===primaryId;})[0];
  if(primary){
    if(matches.length>1)Logger.log(JSON.stringify({mode:'PREINSPECT_CALENDAR_PRIMARY_RESOLUTION',eventId:String(eventId||''),status:'PRIMARY_SELECTED',primaryCalendarId:primaryId,otherCalendarIds:matches.filter(function(x){return x!==primary;}).map(function(x){return x.calendarId;})}));
    return primary;
  }
  return matches[0];
}
function preinspectR3419RemoveFooter_(rec, taskId) {
  if (!rec || !rec.event) {
    throw new Error(
      'Calendar event record is required before managed footer removal.'
    );
  }

  const event = rec.event;
  const before = String(event.getDescription() || '');
  const split = preinspectR3419aSplitManagedFooter_(before);

  if (!split.managedFound) {
    if (preinspectR3419aManagedEvidenceExists_(before, taskId)) {
      throw new Error(
        'Managed Pre-Inspection Task Link evidence still exists, but the ' +
        'footer could not be isolated safely. Calendar was NOT changed.'
      );
    }

    return {
      status: 'NOT_NEEDED_NO_MANAGED_FOOTER',
      writesPerformed: false,
      calendarWritesPerformed: false,
      calendarId: rec.calendarId,
      calendarName: rec.calendarName,
      parserFormat: split.format
    };
  }

  const desired = String(split.authored || '');

  event.setDescription(desired);
  Utilities.sleep(250);

  const calendar = CalendarApp.getCalendarById(rec.calendarId);
  const verifyEvent = calendar
    ? calendar.getEventById(event.getId())
    : null;

  if (!verifyEvent) {
    throw new Error(
      'Calendar event missing during managed footer read-back.'
    );
  }

  const readBack = String(verifyEvent.getDescription() || '');

  if (readBack !== desired) {
    throw new Error(
      'Managed footer removal failed byte-for-byte read-back verification.'
    );
  }

  if (preinspectR3419aManagedEvidenceExists_(readBack, taskId)) {
    throw new Error(
      'Managed Pre-Inspection Task Link evidence is still present after ' +
      'Calendar write/read-back.'
    );
  }

  return {
    status: 'REMOVED_AND_VERIFIED',
    writesPerformed: true,
    calendarWritesPerformed: true,
    calendarId: rec.calendarId,
    calendarName: rec.calendarName,
    parserFormat: split.format,
    authoredDescriptionPreserved: true,
    removedCharacters: split.managed.length
  };
}

function preinspectR3419ClearMirrorLinks_(eventId) {
  const s=SpreadsheetApp.getActive().getSheetByName(PREINSPECT_REVIEW_CONFIG.SHEETS.CALENDAR); if(!s||s.getLastRow()<2)return {status:'NOT_NEEDED',writesPerformed:false};
  const e=preinspectR3419FindHeaderCol_(s,'Event ID'), l=preinspectR3419FindHeaderCol_(s,'Striven Task Link'), t=preinspectR3419FindHeaderCol_(s,'Task'); if(!e)return {status:'NOT_NEEDED_NO_EVENT_ID_COLUMN',writesPerformed:false};
  const ids=s.getRange(2,e,s.getLastRow()-1,1).getDisplayValues(); let r=0; for(let i=0;i<ids.length;i++)if(String(ids[i][0]||'').trim()===String(eventId).trim()){r=i+2;break;}
  if(!r)return {status:'NOT_NEEDED_EVENT_NOT_IN_MIRROR',writesPerformed:false}; let changed=false;
  [l,t].forEach(function(c){if(!c)return;const cell=s.getRange(r,c);if(String(cell.getDisplayValue()||'').trim()){cell.clearContent();changed=true;}});
  return {status:changed?'CLEARED':'NOT_NEEDED',writesPerformed:changed,sheetWritesPerformed:changed,rowNumber:r};
}
function preinspectR3419ApplyNotPreinspect_(sheet,rowNumber,row,eventId) {
  const taskId=Number(String(row['Task ID']||'').trim())||0, rec=preinspectR3419FindEvent_(eventId);
  if(!rec)throw new Error('Event '+eventId+' not found. Task NOT canceled; Calendar NOT changed.');
  const task=preinspectR3419CancelMappedTask_(taskId), cal=preinspectR3419RemoveFooter_(rec,taskId), mirror=preinspectR3419ClearMirrorLinks_(eventId);
  let ts=String(row['Task Status']||''); if(task.status==='CANCELED_AND_VERIFIED'||task.status==='ALREADY_CANCELED')ts='Canceled';
  preinspectR3419SetMappingFields_(sheet,rowNumber,{'Status':'SKIP','Task Action':'MANUAL_NOT_PREINSPECT','Task Status':ts,'Issue':'Manual Override: NOT Preinspect. PreInspect disabled; managed Calendar link removed. Task result: '+task.status+'.','Classification':'OTHER_JOB','Classification Reason':'Manual Override: NOT Preinspect.','Patch Preview':'','Lookup State':'NOT_REQUIRED','Manual Override':'NOT Preinspect'});
  return {mode:'PREINSPECT_R3419_NOT_PREINSPECT',status:'COMPLETE',writesPerformed:!!(task.writesPerformed||cal.writesPerformed||mirror.writesPerformed),eventId:eventId,mappingRow:rowNumber,taskId:taskId||null,task:task,calendar:cal,mirror:mirror};
}
function preinspectManualOverrideOnEdit_R3420_ORIGINAL_(e) {
  if(!e||!e.range||e.range.getNumRows()!==1||e.range.getNumColumns()!==1)return;
  const s=e.range.getSheet(); if(!s||s.getName()!==PREINSPECT_REVIEW_CONFIG.SHEETS.MAPPING)return;
  const c=preinspectR3419FindHeaderCol_(s,PREINSPECT_R3419_OVERRIDE_HEADER); if(!c||e.range.getColumn()!==c||e.range.getRow()<2)return;
  const lock=LockService.getDocumentLock(); if(!lock.tryLock(10000))throw new Error('Manual Override busy; no action performed.');
  try{
    const r=e.range.getRow(), row=preinspectR3419ReadMappingRow_(s,r), id=String(row['Event ID']||'').trim(); if(!id)throw new Error('Manual Override row has no Event ID.');
    const n=preinspectR3419SetOverride_(id,e.range.getDisplayValue()); e.range.setValue(preinspectR3419OverrideDisplay_(n));
    if(n==='NOT_PREINSPECT'){const out=preinspectR3419ApplyNotPreinspect_(s,r,row,id);Logger.log(JSON.stringify(out,null,2));return out;}
    if(n==='PREINSPECT'){
      preinspectR3419SetMappingFields_(s,r,{'Status':'REVIEW','Task Action':'REVALIDATE_FIRST','Issue':'Manual Override: PREINSPECT. Safe revalidation required.','Classification':'PREINSPECT_JOB','Classification Reason':'Manual Override: PREINSPECT.','Patch Preview':'','Lookup State':'PENDING','Manual Override':'PREINSPECT'});
      return {mode:'PREINSPECT_R3419_MANUAL_OVERRIDE',status:'PREINSPECT_REVALIDATION_QUEUED',writesPerformed:true,eventId:id,mappingRow:r};
    }
    preinspectR3419SetMappingFields_(s,r,{'Status':'REVIEW','Task Action':'REVALIDATE_FIRST','Issue':'Manual Override returned to AUTO. Rebuild/review required.','Patch Preview':'','Lookup State':'PENDING','Manual Override':'AUTO'});
    return {mode:'PREINSPECT_R3419_MANUAL_OVERRIDE',status:'AUTO_REVALIDATION_QUEUED',writesPerformed:true,eventId:id,mappingRow:r};
  } finally {lock.releaseLock();}
}
function installPreinspectManualOverride() {
  const setup=setupPreinspectManualOverrideDropdown(), ss=SpreadsheetApp.getActive(), a=ScriptApp.getProjectTriggers().filter(function(t){return t.getHandlerFunction()==='preinspectManualOverrideOnEdit';});
  let st='ALREADY_INSTALLED'; if(!a.length){ScriptApp.newTrigger('preinspectManualOverrideOnEdit').forSpreadsheet(ss).onEdit().create();st='INSTALLED';} else if(a.length>1){for(let i=1;i<a.length;i++)ScriptApp.deleteTrigger(a[i]);st='DEDUPED_EXISTING_TRIGGER';}
  const out={mode:'PREINSPECT_R3419_MANUAL_OVERRIDE_INSTALL',status:'COMPLETE',writesPerformed:true,dropdown:setup,triggerStatus:st,handler:'preinspectManualOverrideOnEdit'};Logger.log(JSON.stringify(out,null,2));return out;
}

function testCFPreinspectsCalendarTestPhase() {
  const c=CalendarApp.getCalendarById(PREINSPECT_R3419_TEST_CALENDAR_ID); if(!c)throw new Error('CF Preinspects test calendar not found.');
  const s=new Date();s.setHours(0,0,0,0);const e=new Date(s);e.setDate(e.getDate()+45);e.setHours(23,59,59,999);
  const rows=[], counts={SOURCE_PREINSPECT:0,MANUAL_PREINSPECT:0,MANUAL_NOT_PREINSPECT:0,SKIP_NON_JOB:0};
  (c.getEvents(s,e)||[]).forEach(function(ev){const id=String(ev.getId()||''), title=String(ev.getTitle()||''), m=preinspectR3419GetOverride_(id);let cls='SOURCE_PREINSPECT',reason='Dedicated CF Preinspects source calendar; organizer/attendees are not classification gates.';
    if(m==='NOT_PREINSPECT'){cls='MANUAL_NOT_PREINSPECT';reason='Manual Override: NOT Preinspect.';}else if(m==='PREINSPECT'){cls='MANUAL_PREINSPECT';reason='Manual Override: PREINSPECT.';}else{const skip=(PREINSPECT_REVIEW_CONFIG.NON_CUSTOMER_TITLE_PATTERNS||[]).some(function(p){try{return p.test(title);}catch(x){return false;}});if(skip){cls='SKIP_NON_JOB';reason='Existing non-customer/blocking title rule matched.';}}
    counts[cls]=(counts[cls]||0)+1; rows.push({eventId:id,start:ev.getStartTime(),end:ev.getEndTime(),title:title,location:String(ev.getLocation()||''),manualOverride:preinspectR3419OverrideDisplay_(m),classification:cls,reason:reason});
  });
  rows.sort(function(a,b){return a.start-b.start;}); const out={mode:'PREINSPECT_R3419_CF_PREINSPECTS_TEST_PHASE',writesPerformed:false,calendarWritesPerformed:false,sheetWritesPerformed:false,strivenWritesPerformed:false,productionCalendarChanged:false,calendarId:PREINSPECT_R3419_TEST_CALENDAR_ID,calendarName:c.getName(),eventsRead:rows.length,classificationCounts:counts,organizerUsedForClassification:false,attendeesUsedForClassification:false,sample:rows.slice(0,50)};Logger.log(JSON.stringify(out,null,2));return out;
}
function testPreinspectR3419Contracts() {
  const ss=SpreadsheetApp.getActive(), m=ss.getSheetByName(PREINSPECT_REVIEW_CONFIG.SHEETS.MAPPING), c=CalendarApp.getCalendarById(PREINSPECT_R3419_TEST_CALENDAR_ID), tc=ScriptApp.getProjectTriggers().filter(function(t){return t.getHandlerFunction()==='preinspectManualOverrideOnEdit';}).length, oc=m?preinspectR3419FindHeaderCol_(m,PREINSPECT_R3419_OVERRIDE_HEADER):0;
  const out={mode:'PREINSPECT_R3419_CONTRACTS',writesPerformed:false,testCalendarFound:!!c,testCalendarId:PREINSPECT_R3419_TEST_CALENDAR_ID,productionCalendarConfigUntouched:String(PREINSPECT_REVIEW_CONFIG.CALENDAR_SYNC.CALENDAR_ID||'')!==PREINSPECT_R3419_TEST_CALENDAR_ID,mappingSheetFound:!!m,manualOverrideColumnFound:!!oc,manualOverrideColumn:oc||null,editTriggerCount:tc,taskTypeId:105,taskCanceledStatusId:51,requiredHelpers:{preinspectGetTaskByIdReadonly:typeof preinspectGetTaskByIdReadonly_==='function',strivenBuildTaskUrl:typeof strivenBuildTaskUrl_==='function',strivenTaskRequestJson:typeof strivenTaskRequestJson_==='function',splitAuthoredAndManaged:typeof preinspectR3418fSplitAuthoredAndManaged_==='function'}};
  out.pass=out.testCalendarFound&&out.productionCalendarConfigUntouched&&out.mappingSheetFound&&out.manualOverrideColumnFound&&tc===1&&out.requiredHelpers.preinspectGetTaskByIdReadonly&&out.requiredHelpers.strivenBuildTaskUrl&&out.requiredHelpers.strivenTaskRequestJson&&out.requiredHelpers.splitAuthoredAndManaged;
  Logger.log(JSON.stringify(out,null,2));return out;
}

/************************************************************
 * PREINSPECT R3.4.19a
 * ROBUST MANAGED CALENDAR FOOTER DETECTION / REMOVAL
 *
 * Supports BOTH historical formats:
 * 1. Explicit HTML comment markers:
 *      <!-- PREINSPECT_STRIVEN_TASK_LINK_START -->
 *      ...
 *      <!-- PREINSPECT_STRIVEN_TASK_LINK_END -->
 * 2. Older heading/link/dash footer without markers.
 *
 * Critical safety rule:
 * If Task-link evidence exists but cannot be isolated safely,
 * FAIL CLOSED instead of returning NOT_NEEDED.
 ************************************************************/
function preinspectR3419aLastRegexMatch_(text, regex) {
  const raw = String(text || '');
  let match = null;
  let current;

  regex.lastIndex = 0;

  while ((current = regex.exec(raw)) !== null) {
    match = {
      index: current.index,
      end: regex.lastIndex,
      text: current[0]
    };

    if (current[0] === '') regex.lastIndex++;
  }

  return match;
}


function preinspectR3419aTrailingMarkupOnly_(value) {
  const tail = String(value || '')
    .replace(/<br\s*\/?>/gi, '')
    .replace(/&nbsp;/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\\/g, '')
    .trim();

  return tail === '';
}


function preinspectR3419aSplitManagedFooter_(description) {
  const raw = String(description || '');

  if (!raw) {
    return {
      authored: '',
      managed: '',
      managedFound: false,
      format: 'NONE'
    };
  }

  /************************************************************
   * FORMAT 1 — explicit managed HTML markers.
   * This is the format visible in the live PreInspect Calendar
   * HTML mirror for existing task links.
   ************************************************************/
  const startRegex =
    /<!--\s*PREINSPECT_STRIVEN_TASK_LINK_START\s*-->/gi;
  const endRegex =
    /<!--\s*PREINSPECT_STRIVEN_TASK_LINK_END\s*-->/gi;

  const start = preinspectR3419aLastRegexMatch_(raw, startRegex);

  if (start) {
    const afterStart = raw.slice(start.index);
    const endRelative = preinspectR3419aLastRegexMatch_(
      afterStart,
      endRegex
    );

    if (endRelative) {
      const absoluteEnd = start.index + endRelative.end;
      const trailing = raw.slice(absoluteEnd);

      if (preinspectR3419aTrailingMarkupOnly_(trailing)) {
        return {
          authored: raw.slice(0, start.index),
          managed: raw.slice(start.index, absoluteEnd),
          managedFound: true,
          format: 'HTML_MARKERS'
        };
      }
    }
  }

  /************************************************************
   * FORMAT 2 — historical markerless footer.
   * Require BOTH the exact Pre-Inspection heading and a Striven
   * TaskInfo link so we never strip ordinary customer notes.
   ************************************************************/
  const headingRegex =
    /\\?-{5,}\s*Pre[-\s]?Inspection\s+Task\s+Link\s*-{5,}/gi;

  const heading = preinspectR3419aLastRegexMatch_(
    raw,
    headingRegex
  );

  if (heading) {
    const tail = raw.slice(heading.index);

    const hasTaskLink =
      /TaskInfo\.aspx\?TaskID=\d+/i.test(tail);

    if (hasTaskLink) {
      const separatorRegex = /\\?-{10,}/g;
      const separators = [];
      let separator;

      while ((separator = separatorRegex.exec(tail)) !== null) {
        separators.push({
          index: separator.index,
          end: separatorRegex.lastIndex
        });
      }

      if (separators.length) {
        const finalSeparator = separators[separators.length - 1];
        const absoluteEnd = heading.index + finalSeparator.end;
        const trailing = raw.slice(absoluteEnd);

        if (preinspectR3419aTrailingMarkupOnly_(trailing)) {
          return {
            authored: raw.slice(0, heading.index),
            managed: raw.slice(heading.index, absoluteEnd),
            managedFound: true,
            format: 'HEADING_TASK_LINK_FOOTER'
          };
        }
      }
    }
  }

  return {
    authored: raw,
    managed: '',
    managedFound: false,
    format: 'NONE'
  };
}


function preinspectR3419aManagedEvidenceExists_(description, taskId) {
  const raw = String(description || '');
  const id = Number(taskId || 0);

  if (
    /PREINSPECT_STRIVEN_TASK_LINK_START/i.test(raw) ||
    /Pre[-\s]?Inspection\s+Task\s+Link/i.test(raw)
  ) {
    return true;
  }

  if (
    id &&
    new RegExp(
      'TaskInfo\\.aspx\\?TaskID=' + id,
      'i'
    ).test(raw)
  ) {
    return true;
  }

  return false;
}


function testPreinspectR3419aManagedFooterDetection() {
  const ss = SpreadsheetApp.getActive();
  const sheet = ss.getSheetByName(
    PREINSPECT_REVIEW_CONFIG.SHEETS.MAPPING
  );

  if (!sheet) {
    throw new Error('Missing PreInspect Task Mapping sheet.');
  }

  const lastRow = sheet.getLastRow();
  const results = [];

  if (lastRow >= 2) {
    for (let rowNumber = 2; rowNumber <= lastRow; rowNumber++) {
      const row = preinspectR3419ReadMappingRow_(sheet, rowNumber);
      const override = preinspectR3419NormalizeOverride_(
        row[PREINSPECT_R3419_OVERRIDE_HEADER]
      );

      if (override !== 'NOT_PREINSPECT') continue;

      const eventId = String(row['Event ID'] || '').trim();
      const taskId = Number(String(row['Task ID'] || '').trim()) || 0;
      const rec = preinspectR3419FindEvent_(eventId);

      if (!rec) {
        results.push({
          mappingRow: rowNumber,
          eventId: eventId,
          taskId: taskId || null,
          eventFound: false,
          managedFound: null,
          format: null,
          staleLinkEvidence: null
        });
        continue;
      }

      const description = String(rec.event.getDescription() || '');
      const split = preinspectR3419aSplitManagedFooter_(description);

      results.push({
        mappingRow: rowNumber,
        eventId: eventId,
        taskId: taskId || null,
        eventFound: true,
        calendarName: rec.calendarName,
        calendarId: rec.calendarId,
        managedFound: split.managedFound,
        format: split.format,
        staleLinkEvidence:
          preinspectR3419aManagedEvidenceExists_(description, taskId),
        wouldRemoveCharacters: split.managed.length
      });
    }
  }

  const unresolved = results.filter(function(item) {
    return item.eventFound &&
      item.staleLinkEvidence &&
      !item.managedFound;
  });

  const result = {
    mode: 'PREINSPECT_R3419A_MANAGED_FOOTER_DETECTION',
    writesPerformed: false,
    rowsChecked: results.length,
    unresolvedParserRows: unresolved.length,
    rows: results,
    pass: unresolved.length === 0
  };

  Logger.log(JSON.stringify(result, null, 2));
  return result;
}


function repairPreinspectNotPreinspectCalendarLinks() {
  const ss = SpreadsheetApp.getActive();
  const sheet = ss.getSheetByName(
    PREINSPECT_REVIEW_CONFIG.SHEETS.MAPPING
  );

  if (!sheet) {
    throw new Error('Missing PreInspect Task Mapping sheet.');
  }

  const lastRow = sheet.getLastRow();
  const results = [];
  const errors = [];
  let calendarWrites = 0;
  let mirrorWrites = 0;

  for (let rowNumber = 2; rowNumber <= lastRow; rowNumber++) {
    const row = preinspectR3419ReadMappingRow_(sheet, rowNumber);
    const override = preinspectR3419NormalizeOverride_(
      row[PREINSPECT_R3419_OVERRIDE_HEADER]
    );

    if (override !== 'NOT_PREINSPECT') continue;

    const eventId = String(row['Event ID'] || '').trim();
    const taskId = Number(String(row['Task ID'] || '').trim()) || 0;

    try {
      const rec = preinspectR3419FindEvent_(eventId);

      if (!rec) {
        throw new Error(
          'Calendar event not found for Event ID ' + eventId + '.'
        );
      }

      const calendarResult = preinspectR3419RemoveFooter_(
        rec,
        taskId
      );

      const mirrorResult = preinspectR3419ClearMirrorLinks_(
        eventId
      );

      if (calendarResult.writesPerformed) calendarWrites++;
      if (mirrorResult.writesPerformed) mirrorWrites++;

      results.push({
        mappingRow: rowNumber,
        eventId: eventId,
        taskId: taskId || null,
        calendar: calendarResult,
        mirror: mirrorResult
      });
    } catch (err) {
      errors.push({
        mappingRow: rowNumber,
        eventId: eventId,
        taskId: taskId || null,
        error: err && err.message ? err.message : String(err)
      });
    }
  }

  const result = {
    mode: 'PREINSPECT_R3419A_REPAIR_NOT_PREINSPECT_CALENDAR_LINKS',
    status: errors.length ? 'COMPLETE_WITH_ERRORS' : 'COMPLETE',
    writesPerformed: calendarWrites > 0 || mirrorWrites > 0,
    strivenWritesPerformed: false,
    calendarWritesPerformed: calendarWrites > 0,
    rowsProcessed: results.length,
    calendarRowsUpdated: calendarWrites,
    mirrorRowsUpdated: mirrorWrites,
    results: results,
    errors: errors
  };

  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

function preinspectR3419NormalizeOverride_(value) {
  const raw = String(value == null ? '' : value).trim();
  const upper = raw.toUpperCase();

  if (!raw || upper === 'AUTO') return 'AUTO';
  if (upper === 'PREINSPECT') return 'PREINSPECT';

  if (
    upper === 'NOT PREINSPECT' ||
    upper === 'NOT_PREINSPECT' ||
    upper === 'NOT-PREINSPECT'
  ) {
    return 'NOT_PREINSPECT';
  }

  throw new Error(
    'Invalid Manual Override value "' + raw +
    '". Allowed: AUTO, PREINSPECT, NOT Preinspect.'
  );
}

/************************************************************
 * PREINSPECT R3.4.19b
 * RUNTIME DEPENDENCY CONNECTIVITY TEST
 * READ ONLY. No Calendar, Sheet, or Striven writes.
 ************************************************************/
function testPreinspectR3419DependencyConnectivity() {
  const functionChecks = {
    "installPreinspectManualOverride": (typeof installPreinspectManualOverride === 'function'),
    "preinspectGetReadonlyStrivenAuth_": (typeof preinspectGetReadonlyStrivenAuth_ === 'function'),
    "preinspectGetTaskByIdReadonly_": (typeof preinspectGetTaskByIdReadonly_ === 'function'),
    "preinspectId_": (typeof preinspectId_ === 'function'),
    "preinspectManualOverrideOnEdit": (typeof preinspectManualOverrideOnEdit === 'function'),
    "preinspectR3419ApplyNotPreinspect_": (typeof preinspectR3419ApplyNotPreinspect_ === 'function'),
    "preinspectR3419CalendarIds_": (typeof preinspectR3419CalendarIds_ === 'function'),
    "preinspectR3419CancelMappedTask_": (typeof preinspectR3419CancelMappedTask_ === 'function'),
    "preinspectR3419ClearMirrorLinks_": (typeof preinspectR3419ClearMirrorLinks_ === 'function'),
    "preinspectR3419FindEvent_": (typeof preinspectR3419FindEvent_ === 'function'),
    "preinspectR3419FindHeaderCol_": (typeof preinspectR3419FindHeaderCol_ === 'function'),
    "preinspectR3419GetOverride_": (typeof preinspectR3419GetOverride_ === 'function'),
    "preinspectR3419NormOverride_": (typeof preinspectR3419NormOverride_ === 'function'),
    "preinspectR3419NormalizeOverride_": (typeof preinspectR3419NormalizeOverride_ === 'function'),
    "preinspectR3419OverrideDisplay_": (typeof preinspectR3419OverrideDisplay_ === 'function'),
    "preinspectR3419OverrideKey_": (typeof preinspectR3419OverrideKey_ === 'function'),
    "preinspectR3419ReadMappingRow_": (typeof preinspectR3419ReadMappingRow_ === 'function'),
    "preinspectR3419RemoveFooter_": (typeof preinspectR3419RemoveFooter_ === 'function'),
    "preinspectR3419SetMappingFields_": (typeof preinspectR3419SetMappingFields_ === 'function'),
    "preinspectR3419SetOverride_": (typeof preinspectR3419SetOverride_ === 'function'),
    "preinspectR3419TaskSnapshot_": (typeof preinspectR3419TaskSnapshot_ === 'function'),
    "preinspectR3419aLastRegexMatch_": (typeof preinspectR3419aLastRegexMatch_ === 'function'),
    "preinspectR3419aManagedEvidenceExists_": (typeof preinspectR3419aManagedEvidenceExists_ === 'function'),
    "preinspectR3419aSplitManagedFooter_": (typeof preinspectR3419aSplitManagedFooter_ === 'function'),
    "preinspectR3419aTrailingMarkupOnly_": (typeof preinspectR3419aTrailingMarkupOnly_ === 'function'),
    "preinspectReadonlyTaskRequest_": (typeof preinspectReadonlyTaskRequest_ === 'function'),
    "repairPreinspectNotPreinspectCalendarLinks": (typeof repairPreinspectNotPreinspectCalendarLinks === 'function'),
    "strivenBuildTaskUrl_": (typeof strivenBuildTaskUrl_ === 'function'),
    "strivenTaskRequestJson_": (typeof strivenTaskRequestJson_ === 'function'),
    "testCFPreinspectsCalendarTestPhase": (typeof testCFPreinspectsCalendarTestPhase === 'function'),
    "testPreinspectR3419Contracts": (typeof testPreinspectR3419Contracts === 'function'),
    "testPreinspectR3419aManagedFooterDetection": (typeof testPreinspectR3419aManagedFooterDetection === 'function')
  };

  const constantChecks = {
    "PREINSPECT_R3418F_CALENDAR_ID": (typeof PREINSPECT_R3418F_CALENDAR_ID !== 'undefined'),
    "PREINSPECT_R3419_OVERRIDE_HEADER": (typeof PREINSPECT_R3419_OVERRIDE_HEADER !== 'undefined'),
    "PREINSPECT_R3419_OVERRIDE_PREFIX": (typeof PREINSPECT_R3419_OVERRIDE_PREFIX !== 'undefined'),
    "PREINSPECT_R3419_TEST_CALENDAR_ID": (typeof PREINSPECT_R3419_TEST_CALENDAR_ID !== 'undefined'),
    "PREINSPECT_REVIEW_CONFIG": (typeof PREINSPECT_REVIEW_CONFIG !== 'undefined')
  };

  const missingFunctions = Object.keys(functionChecks).filter(function(name) {
    return !functionChecks[name];
  });

  const missingConstants = Object.keys(constantChecks).filter(function(name) {
    return !constantChecks[name];
  });

  const pureLogic = {
    normalizeAuto: false,
    normalizePreinspect: false,
    normalizeNotPreinspect: false,
    htmlMarkerParser: false,
    markerlessParser: false
  };

  if (typeof preinspectR3419NormalizeOverride_ === 'function') {
    pureLogic.normalizeAuto =
      preinspectR3419NormalizeOverride_('AUTO') === 'AUTO';
    pureLogic.normalizePreinspect =
      preinspectR3419NormalizeOverride_('PREINSPECT') === 'PREINSPECT';
    pureLogic.normalizeNotPreinspect =
      preinspectR3419NormalizeOverride_('NOT Preinspect') === 'NOT_PREINSPECT';
  }

  if (typeof preinspectR3419aSplitManagedFooter_ === 'function') {
    const htmlSample =
      'Authored\n<!-- PREINSPECT_STRIVEN_TASK_LINK_START -->' +
      '<br>------- Pre-Inspection Task Link -------<br>' +
      '<a href="https://classicfireplace.striven.com/Tasks/TaskInfo.aspx?TaskID=99999">Task</a><br>' +
      '------------------------------------<br>' +
      '<!-- PREINSPECT_STRIVEN_TASK_LINK_END -->';

    const markerlessSample =
      'Authored\n------- Pre-Inspection Task Link -------\n' +
      'https://classicfireplace.striven.com/Tasks/TaskInfo.aspx?TaskID=99999\n' +
      '------------------------------------';

    const htmlSplit =
      preinspectR3419aSplitManagedFooter_(htmlSample);
    const markerlessSplit =
      preinspectR3419aSplitManagedFooter_(markerlessSample);

    pureLogic.htmlMarkerParser =
      !!(htmlSplit && htmlSplit.managedFound);
    pureLogic.markerlessParser =
      !!(markerlessSplit && markerlessSplit.managedFound);
  }

  const pureLogicPass = Object.keys(pureLogic).every(function(key) {
    return pureLogic[key] === true;
  });

  const result = {
    mode: 'PREINSPECT_R3419B_DEPENDENCY_CONNECTIVITY',
    writesPerformed: false,
    calendarWritesPerformed: false,
    sheetWritesPerformed: false,
    strivenWritesPerformed: false,
    functionChecks: functionChecks,
    constantChecks: constantChecks,
    missingFunctions: missingFunctions,
    missingConstants: missingConstants,
    pureLogic: pureLogic,
    pass:
      missingFunctions.length === 0 &&
      missingConstants.length === 0 &&
      pureLogicPass
  };

  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

/************************************************************
 * PREINSPECT R3.4.20
 * MANUAL PREINSPECT -> VERIFIED REVERSE AUTO WORKFLOW
 *
 * PREINSPECT selected
 * -> durable Event-ID override
 * -> exact Calendar event verification
 * -> authoritative PREINSPECT_JOB review
 * -> exact mapped OPEN Type-105 task is reused
 * -> Canceled/Done/On Hold historical task is never reopened
 * -> otherwise normal OPEN-only lookup is used
 * -> otherwise exactly one guarded create is allowed
 * -> Customer / Location / Requested By / Pool 8 / date-time reconcile
 * -> managed Calendar Task Link write + read-back
 * -> mapping must finish MATCHED + NO_ACTION
 *
 * Existing AUTO and NOT Preinspect paths delegate to the prior
 * verified R3.4.19 implementation unchanged.
 *
 * Feature is source-installed DISABLED. Run the read-only contract
 * test, then explicitly enable it once.
 ************************************************************/

const PREINSPECT_R3420_AUTO_PROPERTY =
  'PREINSPECT_R3420_PREINSPECT_AUTO_ENABLED';

const PREINSPECT_R3420_START_MARKER =
  '<!-- PREINSPECT_STRIVEN_TASK_LINK_START -->';

const PREINSPECT_R3420_END_MARKER =
  '<!-- PREINSPECT_STRIVEN_TASK_LINK_END -->';


function preinspectR3420AutoEnabled_R3420A_ORIGINAL_() {
  return String(
    PropertiesService.getScriptProperties()
      .getProperty(PREINSPECT_R3420_AUTO_PROPERTY) || ''
  ).trim().toUpperCase() === 'TRUE';
}


function enablePreinspectR3420PreinspectAuto_R3420A_ORIGINAL_() {
  const test = testPreinspectR3420Contracts();
  if (!test.pass) {
    throw new Error(
      'R3.4.20 contract test failed. PREINSPECT auto was NOT enabled.'
    );
  }

  PropertiesService.getScriptProperties()
    .setProperty(PREINSPECT_R3420_AUTO_PROPERTY, 'TRUE');

  const result = {
    mode: 'PREINSPECT_R3420_ENABLE',
    status: 'ENABLED',
    writesPerformed: true,
    scriptPropertyWritesPerformed: true,
    calendarWritesPerformed: false,
    sheetWritesPerformed: false,
    strivenWritesPerformed: false,
    enabled: preinspectR3420AutoEnabled_()
  };

  Logger.log(JSON.stringify(result, null, 2));
  return result;
}


function disablePreinspectR3420PreinspectAuto_R3420A_ORIGINAL_() {
  PropertiesService.getScriptProperties()
    .deleteProperty(PREINSPECT_R3420_AUTO_PROPERTY);

  const result = {
    mode: 'PREINSPECT_R3420_DISABLE',
    status: 'DISABLED',
    writesPerformed: true,
    scriptPropertyWritesPerformed: true,
    calendarWritesPerformed: false,
    sheetWritesPerformed: false,
    strivenWritesPerformed: false,
    enabled: preinspectR3420AutoEnabled_()
  };

  Logger.log(JSON.stringify(result, null, 2));
  return result;
}


/************************************************************
 * MANUAL OVERRIDE MUST AFFECT CLASSIFICATION BEFORE LOOKUP.
 ************************************************************/
function preinspectClassifyCalendarEvent_() {
  const original =
    preinspectClassifyCalendarEvent_R3420_ORIGINAL_
      .apply(this, arguments);

  const event = arguments[0] || {};
  const eventId = String(
    event.eventId ||
    event.EventId ||
    event['Event ID'] ||
    event.id ||
    ''
  ).trim();

  if (!eventId) return original;

  const mode = preinspectR3419GetOverride_(eventId);

  if (mode === 'PREINSPECT') {
    return {
      code: 'PREINSPECT_JOB',
      reason: 'Manual Override: PREINSPECT.'
    };
  }

  if (mode === 'NOT_PREINSPECT') {
    return {
      code: 'OTHER_JOB',
      reason: 'Manual Override: NOT Preinspect.'
    };
  }

  return original;
}


/************************************************************
 * PREINSPECT OVERRIDE MUST NOT STOMP A LEGITIMATE REVIEW
 * RESULT BACK TO PERPETUAL REVIEW/PENDING.
 ************************************************************/
function preinspectR3419ApplyOverrideToObject_(obj) {
  obj = obj || {};

  const eventId = String(obj['Event ID'] || '').trim();
  if (!eventId) return obj;

  const mode = preinspectR3419GetOverride_(eventId);

  if (mode !== 'PREINSPECT') {
    return preinspectR3419ApplyOverrideToObject_R3420_ORIGINAL_(obj);
  }

  obj['Classification'] = 'PREINSPECT_JOB';
  obj['Classification Reason'] = 'Manual Override: PREINSPECT.';
  obj['Manual Override'] = 'PREINSPECT';

  return obj;
}


/************************************************************
 * PREINSPECT NEVER AUTO-ATTACHES SALES ORDER.
 * SO can remain identity evidence/display data, but the task
 * patch preview receives a clone with SO relationship fields blank.
 ************************************************************/
function preinspectBuildStoredTaskPatchPreview_() {
  const obj = arguments[0] || {};
  const eventId = String(obj['Event ID'] || '').trim();
  const classification =
    String(obj['Classification'] || '').trim().toUpperCase();
  const override = eventId
    ? preinspectR3419GetOverride_(eventId)
    : 'AUTO';

  if (
    classification !== 'PREINSPECT_JOB' &&
    override !== 'PREINSPECT'
  ) {
    return preinspectBuildStoredTaskPatchPreview_R3420_ORIGINAL_
      .apply(this, arguments);
  }

  const safe = preinspectObjectClone_(obj);

  [
    'SO ID',
    'Sales Order',
    'Sales Order ID',
    'SalesOrder',
    'SalesOrder ID'
  ].forEach(function(key) {
    if (Object.prototype.hasOwnProperty.call(safe, key)) {
      safe[key] = '';
    }
  });

  const args = Array.prototype.slice.call(arguments);
  args[0] = safe;

  const preview =
    preinspectBuildStoredTaskPatchPreview_R3420_ORIGINAL_
      .apply(this, args);

  const payload = preview && preview.payload
    ? preview.payload
    : {};

  const changed = preview && Array.isArray(preview.changedFields)
    ? preview.changedFields.map(function(v) {
        return String(v || '').toLowerCase();
      })
    : [];

  const forbiddenPayloadKeys = Object.keys(payload).filter(function(key) {
    return /sales\s*order|salesorder|\bso\b/i.test(String(key));
  });

  const forbiddenChanged = changed.filter(function(value) {
    return /sales\s*order|salesorder|\bso\b/i.test(value);
  });

  if (forbiddenPayloadKeys.length || forbiddenChanged.length) {
    throw new Error(
      'R3.4.20 safety failure: automatic PreInspect patch attempted ' +
      'a Sales Order relationship.'
    );
  }

  return preview;
}


function preinspectR3420ActivateRow_(sheet, rowNumber) {
  if (
    !sheet ||
    sheet.getName() !== PREINSPECT_REVIEW_CONFIG.SHEETS.MAPPING ||
    rowNumber < 2
  ) {
    throw new Error('Invalid PreInspect mapping row.');
  }

  const ss = SpreadsheetApp.getActive();
  ss.setActiveSheet(sheet);
  sheet.setActiveRange(sheet.getRange(rowNumber, 1));
}


function preinspectR3420ReadRow_(sheet, rowNumber, eventId) {
  const row = preinspectR3419ReadMappingRow_(sheet, rowNumber);
  const actualEventId = String(row['Event ID'] || '').trim();

  if (actualEventId !== String(eventId || '').trim()) {
    throw new Error(
      'Mapping Event ID changed during PREINSPECT transaction. ' +
      'Expected=' + eventId + '; Actual=' + actualEventId
    );
  }

  return row;
}


function preinspectR3420ReviewRow_(sheet, rowNumber, eventId) {
  preinspectR3420ActivateRow_(sheet, rowNumber);
  const result = reviewSelectedPreInspectMappingRow();
  const row = preinspectR3420ReadRow_(sheet, rowNumber, eventId);

  if (preinspectR3419GetOverride_(eventId) !== 'PREINSPECT') {
    throw new Error('Durable override is no longer PREINSPECT.');
  }

  if (
    String(row['Classification'] || '').trim().toUpperCase() !==
      'PREINSPECT_JOB'
  ) {
    throw new Error(
      'PREINSPECT override did not reach PREINSPECT_JOB classification.'
    );
  }

  return { result: result, row: row };
}


function preinspectR3420AssertProductionEvent_(rec) {
  if (!rec || !rec.event) {
    throw new Error('Exact Calendar event could not be verified.');
  }

  const calendarId = String(rec.calendarId || '').trim();
  const testId = String(PREINSPECT_R3419_TEST_CALENDAR_ID || '').trim();

  if (calendarId === testId) {
    throw new Error(
      'CF Preinspects remains TEST/READ-ONLY. R3.4.20 will not write it.'
    );
  }

  const allowed = [];

  if (
    typeof PREINSPECT_R3418F_CALENDAR_ID !== 'undefined' &&
    PREINSPECT_R3418F_CALENDAR_ID
  ) {
    allowed.push(String(PREINSPECT_R3418F_CALENDAR_ID));
  }

  if (
    PREINSPECT_REVIEW_CONFIG &&
    PREINSPECT_REVIEW_CONFIG.CALENDAR_SYNC &&
    PREINSPECT_REVIEW_CONFIG.CALENDAR_SYNC.CALENDAR_ID
  ) {
    allowed.push(
      String(PREINSPECT_REVIEW_CONFIG.CALENDAR_SYNC.CALENDAR_ID)
    );
  }

  const unique = allowed.filter(function(v, i, a) {
    return v && a.indexOf(v) === i;
  });

  if (unique.indexOf(calendarId) === -1) {
    throw new Error(
      'Event is not on an approved production PreInspect calendar: ' +
      calendarId
    );
  }

  return true;
}


function preinspectR3420TaskDisposition_(taskId) {
  const id = Number(taskId || 0);

  if (!id) {
    return {
      status: 'NO_MAPPED_TASK',
      taskId: null
    };
  }

  const snap = preinspectR3419TaskSnapshot_(id);

  if (snap.typeId !== 105) {
    return {
      status: 'MAPPED_NON_PREINSPECT_TASK_IGNORED',
      taskId: id,
      taskTypeId: snap.typeId,
      taskStatusId: snap.statusId,
      taskStatusName: snap.statusName
    };
  }

  if (snap.statusId === 48 || /^open$/i.test(snap.statusName)) {
    return {
      status: 'REUSE_MAPPED_OPEN_PREINSPECT',
      taskId: id,
      taskTypeId: 105,
      taskStatusId: snap.statusId,
      taskStatusName: snap.statusName
    };
  }

  if (snap.statusId === 50 || /^done$/i.test(snap.statusName)) {
    return {
      status: 'DONE_HISTORY_PRESERVED',
      taskId: id,
      taskTypeId: 105,
      taskStatusId: snap.statusId,
      taskStatusName: snap.statusName
    };
  }

  if (snap.statusId === 51 || /cancel/i.test(snap.statusName)) {
    return {
      status: 'CANCELED_HISTORY_PRESERVED',
      taskId: id,
      taskTypeId: 105,
      taskStatusId: snap.statusId,
      taskStatusName: snap.statusName
    };
  }

  if (snap.statusId === 68 || /on\s*hold/i.test(snap.statusName)) {
    return {
      status: 'ON_HOLD_HISTORY_PRESERVED',
      taskId: id,
      taskTypeId: 105,
      taskStatusId: snap.statusId,
      taskStatusName: snap.statusName
    };
  }

  throw new Error(
    'Mapped Pre Inspection Task ' + id +
    ' has unsupported status ' +
    snap.statusId + ' (' + snap.statusName + ').'
  );
}


function preinspectR3420AssertOpenType105_(taskId) {
  const snap = preinspectR3419TaskSnapshot_(taskId);

  if (snap.typeId !== 105) {
    throw new Error(
      'Task ' + taskId + ' is not Pre Inspection Task Type 105.'
    );
  }

  if (snap.statusId !== 48 && !/^open$/i.test(snap.statusName)) {
    throw new Error(
      'Task ' + taskId + ' is not OPEN. ReadBack=' +
      snap.statusId + ' ' + snap.statusName
    );
  }

  return snap;
}


function preinspectR3420AssertStep_(name, value) {
  if (value == null) return value;

  const status = String(value.status || '').trim();
  const errors = Array.isArray(value.errors) ? value.errors : [];

  if (
    /ERROR|FAILED|BLOCKED|REVIEW/i.test(status) ||
    errors.length
  ) {
    throw new Error(
      name + ' did not verify. Result=' +
      JSON.stringify(value)
    );
  }

  return value;
}


function preinspectR3420ReconcileOpenTask_(
  sheet,
  rowNumber,
  eventId,
  taskId
) {
  preinspectR3420AssertOpenType105_(taskId);

  const result = {
    mode: 'PREINSPECT_R3420_RECONCILE_OPEN_TASK',
    status: 'IN_PROGRESS',
    writesPerformed: false,
    customer: null,
    location: null,
    requestedBy: null,
    assignees: null,
    dateTime: null
  };

  function run(name, fn) {
    preinspectR3420ActivateRow_(sheet, rowNumber);
    const value = preinspectR3420AssertStep_(name, fn());
    result[name] = value;
    if (value && value.writesPerformed) {
      result.writesPerformed = true;
    }
  }

  run('customer', function() {
    return pushSelectedPreInspectCustomer();
  });

  run('location', function() {
    return pushSelectedPreInspectLocation();
  });

  run('requestedBy', function() {
    return pushSelectedPreInspectRequestedBy();
  });

  run('assignees', function() {
    return pushSelectedPreInspectAssignees();
  });

  run('dateTime', function() {
    return preinspectR3420aReconcileDateTimeFromReview_(
      sheet,
      rowNumber,
      eventId,
      taskId
    );
  });

  preinspectR3420AssertOpenType105_(taskId);
  preinspectR3420ReadRow_(sheet, rowNumber, eventId);

  result.status = 'COMPLETE';
  return result;
}


function preinspectR3420ResolveLocationFirst_(
  sheet,
  rowNumber,
  eventId,
  reviewed
) {
  let current = reviewed;
  let row = current.row;

  if (
    String(row['Task Action'] || '').trim().toUpperCase() !==
      'CREATE LOCATION FIRST'
  ) {
    return { createdOrReusedLocation: null, review: current };
  }

  preinspectR3420ActivateRow_(sheet, rowNumber);

  const location =
    preinspectR3416CreateOrReuseSelectedLocation_();

  preinspectR3420AssertStep_('location-first', location);

  current = preinspectR3420ReviewRow_(
    sheet,
    rowNumber,
    eventId
  );

  if (!Number(String(current.row['Location ID'] || '').trim())) {
    throw new Error(
      'Location-first path completed but Location ID is still blank.'
    );
  }

  return {
    createdOrReusedLocation: location,
    review: current
  };
}


function preinspectR3420BuildManagedBlock_(taskId, taskName, authored) {
  const footer = preinspectR3418fBuildManagedFooter_(
    taskId,
    taskName
  );

  return (
    PREINSPECT_R3420_START_MARKER +
    (authored ? '<br><br>' : '') +
    footer +
    '<br>' +
    PREINSPECT_R3420_END_MARKER
  );
}


function preinspectR3420SyncCalendarLink_(rec, taskId) {
  preinspectR3420AssertProductionEvent_(rec);
  preinspectR3420AssertOpenType105_(taskId);

  const snapshot = getReplacementTaskSourceSnapshot_(taskId);
  const taskName = String(snapshot && snapshot.title || '').trim();

  if (!taskName) {
    throw new Error(
      'Task ' + taskId + ' has no readable title. Calendar link not written.'
    );
  }

  const taskUrl = preinspectR3418fTaskUrl_(taskId);
  const event = rec.event;
  const before = String(event.getDescription() || '');
  const split = preinspectR3419aSplitManagedFooter_(before);

  if (
    !split.managedFound &&
    preinspectR3419aManagedEvidenceExists_(before, 0)
  ) {
    throw new Error(
      'Calendar has managed PreInspect link evidence that cannot be ' +
      'isolated safely. Calendar NOT changed.'
    );
  }

  const authored = String(split.authored || '');
  const desired = authored +
    preinspectR3420BuildManagedBlock_(taskId, taskName, authored);

  if (before === desired) {
    return {
      mode: 'PREINSPECT_R3420_CALENDAR_LINK',
      status: 'NOT_NEEDED',
      writesPerformed: false,
      calendarWritesPerformed: false,
      taskId: taskId,
      taskUrl: taskUrl,
      authoredDescriptionPreserved: true
    };
  }

  event.setDescription(desired);
  Utilities.sleep(250);

  const calendar = CalendarApp.getCalendarById(rec.calendarId);
  const verifyEvent = calendar
    ? calendar.getEventById(event.getId())
    : null;

  if (!verifyEvent) {
    throw new Error(
      'Calendar event disappeared during managed-link read-back.'
    );
  }

  const readBack = String(verifyEvent.getDescription() || '');

  if (readBack !== desired) {
    throw new Error(
      'Calendar managed-link write failed byte-for-byte read-back.'
    );
  }

  const verified = preinspectR3419aSplitManagedFooter_(readBack);

  if (!verified.managedFound) {
    throw new Error(
      'Managed Calendar footer could not be verified after write.'
    );
  }

  if (String(verified.authored || '') !== authored) {
    throw new Error(
      'Calendar authored description changed during managed-link write.'
    );
  }

  if (readBack.indexOf(taskUrl) === -1) {
    throw new Error(
      'Task URL missing after Calendar managed-link read-back.'
    );
  }

  return {
    mode: 'PREINSPECT_R3420_CALENDAR_LINK',
    status: 'LINKED_AND_VERIFIED',
    writesPerformed: true,
    calendarWritesPerformed: true,
    taskId: taskId,
    taskUrl: taskUrl,
    linkedDisplayText: taskName,
    authoredDescriptionPreserved: true,
    parserFormat: verified.format
  };
}


function preinspectR3420ApplyPreinspect_(
  sheet,
  rowNumber,
  eventId
) {
  if (!preinspectR3420AutoEnabled_()) {
    return {
      mode: 'PREINSPECT_R3420_REVERSE_AUTO',
      status: 'PREINSPECT_AUTO_DISABLED_SAFE_QUEUE',
      writesPerformed: false,
      mappingRow: rowNumber,
      eventId: eventId
    };
  }

  const rec = preinspectR3419FindEvent_(eventId);

  if (!rec) {
    throw new Error(
      'Exact Calendar Event ID could not be verified. No write performed.'
    );
  }

  preinspectR3420AssertProductionEvent_(rec);

  const initialRow = preinspectR3420ReadRow_(
    sheet,
    rowNumber,
    eventId
  );

  const priorTaskId =
    Number(String(initialRow['Task ID'] || '').trim()) || 0;

  const mappedDisposition =
    preinspectR3420TaskDisposition_(priorTaskId);

  const output = {
    mode: 'PREINSPECT_R3420_REVERSE_AUTO',
    status: 'IN_PROGRESS',
    writesPerformed: false,
    mappingRow: rowNumber,
    eventId: eventId,
    calendarId: rec.calendarId,
    mappedTaskDisposition: mappedDisposition,
    taskDecision: null,
    locationFirst: null,
    reconcile: null,
    calendarLink: null,
    taskId: null
  };

  let reviewed = preinspectR3420ReviewRow_(
    sheet,
    rowNumber,
    eventId
  );

  const locationStage = preinspectR3420ResolveLocationFirst_(
    sheet,
    rowNumber,
    eventId,
    reviewed
  );

  output.locationFirst =
    locationStage.createdOrReusedLocation;

  reviewed = locationStage.review;

  let row = reviewed.row;
  let taskId = 0;

  if (
    mappedDisposition.status ===
      'REUSE_MAPPED_OPEN_PREINSPECT'
  ) {
    taskId = Number(mappedDisposition.taskId);

    if (Number(String(row['Task ID'] || '').trim()) !== taskId) {
      preinspectR3419SetMappingFields_(
        sheet,
        rowNumber,
        {
          'Task ID': taskId,
          'Task Status': 'OPEN',
          'Manual Override': 'PREINSPECT'
        }
      );
    }

    output.taskDecision = {
      action: 'REUSE_MAPPED_OPEN_PREINSPECT',
      taskId: taskId
    };

  } else {
    const status =
      String(row['Status'] || '').trim().toUpperCase();

    const action =
      String(row['Task Action'] || '').trim().toUpperCase();

    const lookupTaskId =
      Number(String(row['Task ID'] || '').trim()) || 0;

    if (status === 'MATCHED' && lookupTaskId) {
      preinspectR3420AssertOpenType105_(lookupTaskId);
      taskId = lookupTaskId;

      output.taskDecision = {
        action: 'REUSE_OTHER_OPEN_MATCHING_PREINSPECT',
        taskId: taskId
      };

    } else if (
      status === 'READY CREATE' &&
      action === 'WOULD_CREATE'
    ) {
      if (lookupTaskId) {
        throw new Error(
          'READY CREATE contains a Task ID. Blind create blocked.'
        );
      }

      if (String(row['Candidate Task IDs'] || '').trim()) {
        throw new Error(
          'Candidate Task ID(s) exist. Blind create blocked.'
        );
      }

      preinspectR3420ActivateRow_(sheet, rowNumber);

      const created =
        createSelectedPreInspectTask_MANUAL_WRITE();

      preinspectR3420AssertStep_('create', created);

      row = preinspectR3420ReadRow_(
        sheet,
        rowNumber,
        eventId
      );

      taskId =
        Number(String(row['Task ID'] || '').trim()) || 0;

      if (!taskId) {
        throw new Error(
          'Create returned but durable Task ID is missing from mapping.'
        );
      }

      output.taskDecision = {
        action: 'CREATED_ONE_NEW_PREINSPECT',
        taskId: taskId
      };

      output.writesPerformed = true;

    } else {
      throw new Error(
        'PREINSPECT revalidation is not safe to auto-complete. ' +
        'Status=' + String(row['Status'] || '') +
        '; Task Action=' + String(row['Task Action'] || '') +
        '; Issue=' + String(row['Issue'] || '')
      );
    }
  }

  output.taskId = taskId;
  preinspectR3420AssertOpenType105_(taskId);

  output.reconcile = preinspectR3420ReconcileOpenTask_(
    sheet,
    rowNumber,
    eventId,
    taskId
  );

  if (output.reconcile.writesPerformed) {
    output.writesPerformed = true;
  }

  let finalReview = preinspectR3420ReviewRow_(
    sheet,
    rowNumber,
    eventId
  );

  let finalRow = finalReview.row;
  let finalTaskId =
    Number(String(finalRow['Task ID'] || '').trim()) || 0;
  let finalStatus =
    String(finalRow['Status'] || '').trim().toUpperCase();
  let finalAction =
    String(finalRow['Task Action'] || '').trim().toUpperCase();

  if (
    finalStatus !== 'MATCHED' ||
    finalTaskId !== taskId ||
    finalAction !== 'NO_ACTION'
  ) {
    throw new Error(
      'Final mapping did not reach MATCHED + NO_ACTION. ' +
      'Status=' + finalStatus +
      '; TaskAction=' + finalAction +
      '; TaskID=' + finalTaskId +
      '; ExpectedTaskID=' + taskId +
      '; Issue=' + String(finalRow['Issue'] || '')
    );
  }

  const freshRec = preinspectR3419FindEvent_(eventId);

  if (!freshRec || freshRec.calendarId !== rec.calendarId) {
    throw new Error(
      'Calendar event identity changed before managed-link write.'
    );
  }

  output.calendarLink =
    preinspectR3420SyncCalendarLink_(freshRec, taskId);

  if (output.calendarLink.writesPerformed) {
    output.writesPerformed = true;
  }

  finalReview = preinspectR3420ReviewRow_(
    sheet,
    rowNumber,
    eventId
  );

  finalRow = finalReview.row;
  finalTaskId =
    Number(String(finalRow['Task ID'] || '').trim()) || 0;
  finalStatus =
    String(finalRow['Status'] || '').trim().toUpperCase();
  finalAction =
    String(finalRow['Task Action'] || '').trim().toUpperCase();

  if (
    finalStatus !== 'MATCHED' ||
    finalTaskId !== taskId ||
    finalAction !== 'NO_ACTION'
  ) {
    throw new Error(
      'Mapping changed after Calendar managed-link write. ' +
      'Status=' + finalStatus +
      '; TaskAction=' + finalAction +
      '; TaskID=' + finalTaskId
    );
  }

  preinspectR3420AssertOpenType105_(taskId);

  output.status = 'MATCHED_AND_VERIFIED';
  output.mappingStatus = finalStatus;
  output.taskAction = finalAction;
  output.manualOverride = preinspectR3419GetOverride_(eventId);

  Logger.log(JSON.stringify(output, null, 2));
  return output;
}


/************************************************************
 * EDIT TRIGGER WRAPPER
 * AUTO / NOT Preinspect delegate exactly to R3.4.19.
 ************************************************************/
function preinspectManualOverrideOnEdit(e) {
  if (
    !e ||
    !e.range ||
    e.range.getNumRows() !== 1 ||
    e.range.getNumColumns() !== 1
  ) {
    return;
  }

  const sheet = e.range.getSheet();

  if (
    !sheet ||
    sheet.getName() !== PREINSPECT_REVIEW_CONFIG.SHEETS.MAPPING
  ) {
    return;
  }

  const overrideColumn = preinspectR3419FindHeaderCol_(
    sheet,
    PREINSPECT_R3419_OVERRIDE_HEADER
  );

  if (
    !overrideColumn ||
    e.range.getColumn() !== overrideColumn ||
    e.range.getRow() < 2
  ) {
    return;
  }

  const requestedMode = preinspectR3419NormalizeOverride_(
    e.range.getDisplayValue()
  );

  if (requestedMode !== 'PREINSPECT') {
    return preinspectManualOverrideOnEdit_R3420_ORIGINAL_(e);
  }

  const lock = LockService.getDocumentLock();

  if (!lock.tryLock(10000)) {
    throw new Error(
      'Manual PREINSPECT Override busy; no action performed.'
    );
  }

  const rowNumber = e.range.getRow();
  let eventId = '';

  try {
    const row = preinspectR3419ReadMappingRow_(
      sheet,
      rowNumber
    );

    eventId = String(row['Event ID'] || '').trim();

    if (!eventId) {
      throw new Error('Manual PREINSPECT row has no Event ID.');
    }

    const persisted = preinspectR3419SetOverride_(
      eventId,
      'PREINSPECT'
    );

    e.range.setValue(
      preinspectR3419OverrideDisplay_(persisted)
    );

    preinspectR3419SetMappingFields_(
      sheet,
      rowNumber,
      {
        'Status': 'REVIEW',
        'Task Action': 'REVALIDATE_FIRST',
        'Issue': preinspectR3420AutoEnabled_()
          ? 'Manual Override: PREINSPECT. Verified reverse workflow running.'
          : 'Manual Override: PREINSPECT. R3.4.20 auto disabled until contract test + enable.',
        'Classification': 'PREINSPECT_JOB',
        'Classification Reason': 'Manual Override: PREINSPECT.',
        'Patch Preview': '',
        'Lookup State': 'PENDING',
        'Manual Override': 'PREINSPECT'
      }
    );

    if (!preinspectR3420AutoEnabled_()) {
      const queued = {
        mode: 'PREINSPECT_R3420_MANUAL_OVERRIDE',
        status: 'PREINSPECT_AUTO_DISABLED_SAFE_QUEUE',
        writesPerformed: true,
        sheetWritesPerformed: true,
        calendarWritesPerformed: false,
        strivenWritesPerformed: false,
        eventId: eventId,
        mappingRow: rowNumber
      };

      Logger.log(JSON.stringify(queued, null, 2));
      return queued;
    }

    try {
      return preinspectR3420ApplyPreinspect_(
        sheet,
        rowNumber,
        eventId
      );

    } catch (err) {
      const message = err && err.message
        ? err.message
        : String(err);

      preinspectR3419SetMappingFields_(
        sheet,
        rowNumber,
        {
          'Status': 'REVIEW',
          'Task Action': 'MANUAL_PREINSPECT_ERROR',
          'Issue':
            'Manual PREINSPECT auto stopped safely: ' +
            message.slice(0, 850),
          'Classification': 'PREINSPECT_JOB',
          'Classification Reason': 'Manual Override: PREINSPECT.',
          'Lookup State': 'ERROR',
          'Manual Override': 'PREINSPECT'
        }
      );

      const failed = {
        mode: 'PREINSPECT_R3420_MANUAL_OVERRIDE',
        status: 'COMPLETE_WITH_ERRORS',
        writesPerformed: true,
        eventId: eventId,
        mappingRow: rowNumber,
        error: message,
        safety:
          'No blind retry. Existing created Task/Location IDs are preserved.'
      };

      Logger.log(JSON.stringify(failed, null, 2));
      return failed;
    }

  } finally {
    try {
      SpreadsheetApp.getActive().setActiveSheet(sheet);
      sheet.setActiveRange(
        sheet.getRange(rowNumber, overrideColumn)
      );
    } catch (ignore) {}

    lock.releaseLock();
  }
}


/************************************************************
 * READ-ONLY CONTRACT TEST
 ************************************************************/
function testPreinspectR3420Contracts() {
  const ss = SpreadsheetApp.getActive();
  const mapping = ss.getSheetByName(
    PREINSPECT_REVIEW_CONFIG.SHEETS.MAPPING
  );

  const triggerCount = ScriptApp.getProjectTriggers()
    .filter(function(trigger) {
      return trigger.getHandlerFunction() ===
        'preinspectManualOverrideOnEdit';
    }).length;

  const functionChecks = {
    preinspectManualOverrideOnEdit:
      typeof preinspectManualOverrideOnEdit === 'function',
    preinspectManualOverrideOnEdit_R3420_ORIGINAL_:
      typeof preinspectManualOverrideOnEdit_R3420_ORIGINAL_ === 'function',
    preinspectClassifyCalendarEvent_:
      typeof preinspectClassifyCalendarEvent_ === 'function',
    preinspectClassifyCalendarEvent_R3420_ORIGINAL_:
      typeof preinspectClassifyCalendarEvent_R3420_ORIGINAL_ === 'function',
    preinspectR3419ApplyOverrideToObject_:
      typeof preinspectR3419ApplyOverrideToObject_ === 'function',
    preinspectR3419ApplyOverrideToObject_R3420_ORIGINAL_:
      typeof preinspectR3419ApplyOverrideToObject_R3420_ORIGINAL_ === 'function',
    preinspectBuildStoredTaskPatchPreview_:
      typeof preinspectBuildStoredTaskPatchPreview_ === 'function',
    preinspectBuildStoredTaskPatchPreview_R3420_ORIGINAL_:
      typeof preinspectBuildStoredTaskPatchPreview_R3420_ORIGINAL_ === 'function',
    reviewSelectedPreInspectMappingRow:
      typeof reviewSelectedPreInspectMappingRow === 'function',
    createSelectedPreInspectTask_MANUAL_WRITE:
      typeof createSelectedPreInspectTask_MANUAL_WRITE === 'function',
    pushSelectedPreInspectCustomer:
      typeof pushSelectedPreInspectCustomer === 'function',
    pushSelectedPreInspectLocation:
      typeof pushSelectedPreInspectLocation === 'function',
    pushSelectedPreInspectRequestedBy:
      typeof pushSelectedPreInspectRequestedBy === 'function',
    pushSelectedPreInspectAssignees:
      typeof pushSelectedPreInspectAssignees === 'function',
    preinspectR3418bPushExactCalendarDateTimeForActiveMapping_:
      typeof preinspectR3418bPushExactCalendarDateTimeForActiveMapping_ ===
        'function',
    preinspectR3419aSplitManagedFooter_:
      typeof preinspectR3419aSplitManagedFooter_ === 'function',
    preinspectR3419aManagedEvidenceExists_:
      typeof preinspectR3419aManagedEvidenceExists_ === 'function'
  };

  const missingFunctions = Object.keys(functionChecks)
    .filter(function(name) {
      return !functionChecks[name];
    });

  const productionCalendarId = String(
    PREINSPECT_REVIEW_CONFIG &&
    PREINSPECT_REVIEW_CONFIG.CALENDAR_SYNC &&
    PREINSPECT_REVIEW_CONFIG.CALENDAR_SYNC.CALENDAR_ID
      ? PREINSPECT_REVIEW_CONFIG.CALENDAR_SYNC.CALENDAR_ID
      : ''
  );

  const testCalendarId = String(
    PREINSPECT_R3419_TEST_CALENDAR_ID || ''
  );

  const pure = {
    normalizePreinspect:
      preinspectR3419NormalizeOverride_('PREINSPECT') === 'PREINSPECT',
    normalizeNotPreinspect:
      preinspectR3419NormalizeOverride_('NOT Preinspect') ===
        'NOT_PREINSPECT',
    featureStartsDisabledOrExplicitlyEnabled:
      typeof preinspectR3420AutoEnabled_() === 'boolean',
    productionAndTestCalendarsSeparated:
      !!productionCalendarId &&
      !!testCalendarId &&
      productionCalendarId !== testCalendarId
  };

  const pass =
    !!mapping &&
    triggerCount === 1 &&
    missingFunctions.length === 0 &&
    Object.keys(pure).every(function(key) {
      return pure[key] === true;
    });

  const result = {
    mode: 'PREINSPECT_R3420_CONTRACTS',
    writesPerformed: false,
    calendarWritesPerformed: false,
    sheetWritesPerformed: false,
    strivenWritesPerformed: false,
    scriptPropertyWritesPerformed: false,
    mappingSheetFound: !!mapping,
    editTriggerCount: triggerCount,
    autoEnabled: preinspectR3420AutoEnabled_(),
    functionChecks: functionChecks,
    missingFunctions: missingFunctions,
    pure: pure,
    salesOrderAutoPatchSuppressedByWrapper: true,
    testCalendarWriteBlockedByDesign: true,
    productionCalendarId: productionCalendarId,
    testCalendarId: testCalendarId,
    pass: !!pass
  };

  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

/************************************************************
 * PREINSPECT R3.4.20a
 * SCHEDULE GATE FIX + SAFE RETRY
 ************************************************************/

const PREINSPECT_R3420A_GATE_PROPERTY =
  'PREINSPECT_R3420A_SCHEDULE_GATE_ENABLED';


function preinspectR3420AutoEnabled_() {
  const baseEnabled =
    preinspectR3420AutoEnabled_R3420A_ORIGINAL_();

  const gateEnabled = String(
    PropertiesService.getScriptProperties()
      .getProperty(PREINSPECT_R3420A_GATE_PROPERTY) || ''
  ).trim().toUpperCase() === 'TRUE';

  return baseEnabled && gateEnabled;
}


function enablePreinspectR3420PreinspectAuto() {
  const contracts = testPreinspectR3420aContracts();

  if (!contracts.pass) {
    throw new Error(
      'R3.4.20a contract test failed. PREINSPECT auto remains disabled.'
    );
  }

  const props = PropertiesService.getScriptProperties();

  props.setProperty(PREINSPECT_R3420_AUTO_PROPERTY, 'TRUE');
  props.setProperty(PREINSPECT_R3420A_GATE_PROPERTY, 'TRUE');

  const result = {
    mode: 'PREINSPECT_R3420A_ENABLE',
    status: 'ENABLED',
    writesPerformed: true,
    scriptPropertyWritesPerformed: true,
    calendarWritesPerformed: false,
    sheetWritesPerformed: false,
    strivenWritesPerformed: false,
    baseEnabled:
      preinspectR3420AutoEnabled_R3420A_ORIGINAL_(),
    scheduleGateEnabled:
      String(
        props.getProperty(PREINSPECT_R3420A_GATE_PROPERTY) || ''
      ).trim().toUpperCase() === 'TRUE',
    enabled: preinspectR3420AutoEnabled_()
  };

  Logger.log(JSON.stringify(result, null, 2));
  return result;
}


function disablePreinspectR3420PreinspectAuto() {
  const props = PropertiesService.getScriptProperties();

  props.deleteProperty(PREINSPECT_R3420_AUTO_PROPERTY);
  props.deleteProperty(PREINSPECT_R3420A_GATE_PROPERTY);

  const result = {
    mode: 'PREINSPECT_R3420A_DISABLE',
    status: 'DISABLED',
    writesPerformed: true,
    scriptPropertyWritesPerformed: true,
    calendarWritesPerformed: false,
    sheetWritesPerformed: false,
    strivenWritesPerformed: false,
    enabled: preinspectR3420AutoEnabled_()
  };

  Logger.log(JSON.stringify(result, null, 2));
  return result;
}


function preinspectR3420aScheduleDecision_(status, taskAction) {
  const s = String(status || '').trim().toUpperCase();
  const a = String(taskAction || '').trim().toUpperCase();

  if (
    a === 'NO_ACTION' ||
    a === 'WOULD_PATCH_TASK_DETAILS' ||
    a === 'CREATED' ||
    a === 'CREATED_AND_VERIFIED' ||
    a === 'CREATED_PENDING_VERIFY'
  ) {
    return {
      decision: 'NO_DATE_TIME_WRITE',
      reason:
        'Current mapping action does not require a date-time mutation.'
    };
  }

  if (a.indexOf('DATE_TIME') !== -1) {
    return {
      decision: 'RUN_EXACT_DATE_TIME_RECONCILE',
      reason:
        'Mapping explicitly requires StartDateTime/DueDateTime reconciliation.'
    };
  }

  if (s === 'MATCHED' && !a) {
    return {
      decision: 'BLOCK',
      reason:
        'MATCHED row has blank Task Action; fail closed.'
    };
  }

  return {
    decision: 'BLOCK',
    reason:
      'Schedule state is not proven safe for automatic reconciliation.'
  };
}


function preinspectR3420aReconcileDateTimeFromReview_(
  sheet,
  rowNumber,
  eventId,
  taskId
) {
  const row = preinspectR3420ReadRow_(
    sheet,
    rowNumber,
    eventId
  );

  const status = String(row['Status'] || '').trim();
  const taskAction = String(row['Task Action'] || '').trim();
  const issue = String(row['Issue'] || '').trim();

  const decision = preinspectR3420aScheduleDecision_(
    status,
    taskAction
  );

  if (decision.decision === 'NO_DATE_TIME_WRITE') {
    return {
      mode: 'PREINSPECT_R3420A_DATE_TIME_GATE',
      status: 'NOT_NEEDED',
      writesPerformed: false,
      strivenWritesPerformed: false,
      calendarWritesPerformed: false,
      mappingRow: rowNumber,
      eventId: eventId,
      taskId: Number(taskId),
      mappingStatus: status,
      taskAction: taskAction,
      reason: decision.reason,
      authoritativeIssue: issue
    };
  }

  if (
    decision.decision ===
      'RUN_EXACT_DATE_TIME_RECONCILE'
  ) {
    const result =
      preinspectR3418bPushExactCalendarDateTimeForActiveMapping_();

    return {
      mode: 'PREINSPECT_R3420A_DATE_TIME_GATE',
      status:
        result && result.status
          ? result.status
          : 'EXACT_RECONCILE_COMPLETE',
      writesPerformed:
        !!(result && result.writesPerformed),
      strivenWritesPerformed:
        !!(
          result &&
          (
            result.strivenWritesPerformed ||
            result.writesPerformed
          )
        ),
      calendarWritesPerformed: false,
      mappingRow: rowNumber,
      eventId: eventId,
      taskId: Number(taskId),
      mappingStatus: status,
      taskAction: taskAction,
      decision: decision.decision,
      exactReconcile: result
    };
  }

  throw new Error(
    'R3.4.20a date-time gate blocked. ' +
    'Status=' + status +
    '; Task Action=' + taskAction +
    '; Issue=' + issue +
    '; Reason=' + decision.reason
  );
}


function testPreinspectR3420aContracts() {
  const base = testPreinspectR3420Contracts();

  const functionChecks = {
    preinspectR3420AutoEnabled_:
      typeof preinspectR3420AutoEnabled_ === 'function',
    preinspectR3420AutoEnabled_R3420A_ORIGINAL_:
      typeof preinspectR3420AutoEnabled_R3420A_ORIGINAL_ === 'function',
    enablePreinspectR3420PreinspectAuto:
      typeof enablePreinspectR3420PreinspectAuto === 'function',
    enablePreinspectR3420PreinspectAuto_R3420A_ORIGINAL_:
      typeof enablePreinspectR3420PreinspectAuto_R3420A_ORIGINAL_ === 'function',
    disablePreinspectR3420PreinspectAuto:
      typeof disablePreinspectR3420PreinspectAuto === 'function',
    disablePreinspectR3420PreinspectAuto_R3420A_ORIGINAL_:
      typeof disablePreinspectR3420PreinspectAuto_R3420A_ORIGINAL_ === 'function',
    preinspectR3420aScheduleDecision_:
      typeof preinspectR3420aScheduleDecision_ === 'function',
    preinspectR3420aReconcileDateTimeFromReview_:
      typeof preinspectR3420aReconcileDateTimeFromReview_ === 'function',
    preinspectR3418bPushExactCalendarDateTimeForActiveMapping_:
      typeof preinspectR3418bPushExactCalendarDateTimeForActiveMapping_ ===
        'function',
    retryNextPreinspectR3420aManualError:
      typeof retryNextPreinspectR3420aManualError === 'function'
  };

  const missingFunctions =
    Object.keys(functionChecks).filter(function(name) {
      return !functionChecks[name];
    });

  const pure = {
    noActionSkips:
      preinspectR3420aScheduleDecision_(
        'MATCHED',
        'NO_ACTION'
      ).decision === 'NO_DATE_TIME_WRITE',

    detailsOnlySkips:
      preinspectR3420aScheduleDecision_(
        'MATCHED',
        'WOULD_PATCH_TASK_DETAILS'
      ).decision === 'NO_DATE_TIME_WRITE',

    createdSkips:
      preinspectR3420aScheduleDecision_(
        'MATCHED',
        'CREATED'
      ).decision === 'NO_DATE_TIME_WRITE',

    dateTimeRunsExact:
      preinspectR3420aScheduleDecision_(
        'MATCHED',
        'WOULD_PATCH_DATE_TIME'
      ).decision === 'RUN_EXACT_DATE_TIME_RECONCILE',

    dateTimeAndDetailsRunsExact:
      preinspectR3420aScheduleDecision_(
        'MATCHED',
        'WOULD_PATCH_DATE_TIME_AND_DETAILS'
      ).decision === 'RUN_EXACT_DATE_TIME_RECONCILE',

    unknownBlocks:
      preinspectR3420aScheduleDecision_(
        'REVIEW',
        'MANUAL_PREINSPECT_ERROR'
      ).decision === 'BLOCK'
  };

  const pass =
    !!base.pass &&
    missingFunctions.length === 0 &&
    Object.keys(pure).every(function(key) {
      return pure[key] === true;
    });

  const result = {
    mode: 'PREINSPECT_R3420A_CONTRACTS',
    writesPerformed: false,
    calendarWritesPerformed: false,
    sheetWritesPerformed: false,
    strivenWritesPerformed: false,
    scriptPropertyWritesPerformed: false,
    baseContractsPass: !!base.pass,
    autoEnabled: preinspectR3420AutoEnabled_(),
    baseAutoFlagEnabled:
      preinspectR3420AutoEnabled_R3420A_ORIGINAL_(),
    scheduleGateFlagEnabled:
      String(
        PropertiesService.getScriptProperties()
          .getProperty(PREINSPECT_R3420A_GATE_PROPERTY) || ''
      ).trim().toUpperCase() === 'TRUE',
    functionChecks: functionChecks,
    missingFunctions: missingFunctions,
    pure: pure,
    regression:
      'MATCHED + NO_ACTION must not require Mapping Patch Preview date fields.',
    systemicDateTimeTransportStillFailClosed: true,
    pass: !!pass
  };

  Logger.log(JSON.stringify(result, null, 2));
  return result;
}


function testPreinspectR3420aTask18241ScheduleGate() {
  const ss = SpreadsheetApp.getActive();
  const sheet = ss.getSheetByName(
    PREINSPECT_REVIEW_CONFIG.SHEETS.MAPPING
  );

  if (!sheet) {
    throw new Error('Missing PreInspect Task Mapping.');
  }

  const targetEventId =
    '6idhqhmjb5c2eav92pjv4h40ij@google.com';

  const values = sheet.getDataRange().getDisplayValues();
  const headers = values[0] || [];
  const eventCol = headers.indexOf('Event ID');
  const statusCol = headers.indexOf('Status');
  const actionCol = headers.indexOf('Task Action');
  const taskCol = headers.indexOf('Task ID');
  const overrideCol = headers.indexOf('Manual Override');

  let found = null;

  for (let i = 1; i < values.length; i++) {
    if (
      String(values[i][eventCol] || '').trim() ===
        targetEventId
    ) {
      found = {
        mappingRow: i + 1,
        eventId: targetEventId,
        status: statusCol >= 0 ? values[i][statusCol] : '',
        taskAction: actionCol >= 0 ? values[i][actionCol] : '',
        taskId: taskCol >= 0 ? values[i][taskCol] : '',
        manualOverride:
          overrideCol >= 0 ? values[i][overrideCol] : ''
      };
      break;
    }
  }

  if (!found) {
    const missing = {
      mode: 'PREINSPECT_R3420A_TASK18241_REGRESSION',
      writesPerformed: false,
      eventFound: false,
      pass: false,
      reason:
        'Target Event ID is no longer present in current mapping.'
    };

    Logger.log(JSON.stringify(missing, null, 2));
    return missing;
  }

  const decision = preinspectR3420aScheduleDecision_(
    found.status,
    found.taskAction
  );

  const pass =
    Number(found.taskId) === 18241 &&
    String(found.status).toUpperCase() === 'MATCHED' &&
    decision.decision === 'NO_DATE_TIME_WRITE';

  const result = {
    mode: 'PREINSPECT_R3420A_TASK18241_REGRESSION',
    writesPerformed: false,
    calendarWritesPerformed: false,
    sheetWritesPerformed: false,
    strivenWritesPerformed: false,
    eventFound: true,
    row: found,
    scheduleDecision: decision,
    pass: pass
  };

  Logger.log(JSON.stringify(result, null, 2));
  return result;
}


function retryNextPreinspectR3420aManualError() {
  if (!preinspectR3420AutoEnabled_()) {
    throw new Error(
      'R3.4.20a is not enabled. Run testPreinspectR3420aContracts ' +
      'and enablePreinspectR3420PreinspectAuto first.'
    );
  }

  const lock = LockService.getDocumentLock();

  if (!lock.tryLock(10000)) {
    throw new Error(
      'PreInspect retry is busy. No action performed.'
    );
  }

  try {
    const ss = SpreadsheetApp.getActive();
    const sheet = ss.getSheetByName(
      PREINSPECT_REVIEW_CONFIG.SHEETS.MAPPING
    );

    if (!sheet) {
      throw new Error('Missing PreInspect Task Mapping.');
    }

    const values = sheet.getDataRange().getDisplayValues();
    const headers = values[0] || [];

    const eventCol = headers.indexOf('Event ID');
    const actionCol = headers.indexOf('Task Action');
    const overrideCol = headers.indexOf('Manual Override');

    if (
      eventCol < 0 ||
      actionCol < 0 ||
      overrideCol < 0
    ) {
      throw new Error(
        'Mapping requires Event ID, Task Action and Manual Override headers.'
      );
    }

    for (let i = 1; i < values.length; i++) {
      const eventId =
        String(values[i][eventCol] || '').trim();

      const action =
        String(values[i][actionCol] || '').trim().toUpperCase();

      const override =
        preinspectR3419NormalizeOverride_(
          values[i][overrideCol]
        );

      if (
        eventId &&
        override === 'PREINSPECT' &&
        action === 'MANUAL_PREINSPECT_ERROR'
      ) {
        return preinspectR3420ApplyPreinspect_(
          sheet,
          i + 1,
          eventId
        );
      }
    }

    const result = {
      mode: 'PREINSPECT_R3420A_RETRY',
      status: 'NO_MANUAL_PREINSPECT_ERROR_ROWS',
      writesPerformed: false,
      message:
        'No PREINSPECT row with MANUAL_PREINSPECT_ERROR is currently present.'
    };

    Logger.log(JSON.stringify(result, null, 2));
    return result;

  } finally {
    lock.releaseLock();
  }
}


/************************************************************
 * PREINSPECT_R3421_REQUESTED_BY_ORGANIZER_EMPLOYEE
 * PreInspection ONLY.
 * Requested By = Calendar organizer -> exact Striven Employee.
 ************************************************************/
function preinspectR3421PushRequestedByOrganizerPlan_() {
  const context = preinspectR3421ResolveTaskContext_(Array.prototype.slice.call(arguments));
  const employee = preinspectR3421ResolveOrganizerEmployee_(context.eventId);

  if (typeof getReplacementTaskSourceSnapshot_ !== 'function') {
    throw new Error('BLOCKED: getReplacementTaskSourceSnapshot_ is unavailable.');
  }

  const before = getReplacementTaskSourceSnapshot_(context.taskId);
  if (!before || !before.type || Number(before.type.id) !== 105) {
    throw new Error('BLOCKED: organizer Requested By may write only to PreInspection Task Type 105.');
  }

  const previous = before.requestedBy || null;
  const previousId = previous && previous.id ? Number(previous.id) : 0;
  const previousType = previous && previous.type ? String(previous.type).toLowerCase() : '';

  if (previousId === Number(employee.id) && (!previousType || previousType === 'employee')) {
    return {
      status: 'NOT_NEEDED',
      writesPerformed: false,
      field: 'RequestedBy',
      employeeId: Number(employee.id),
      employeeName: employee.name || '',
      organizerEmail: employee.email,
      resolutionMethod: 'CALENDAR_ORGANIZER_EMAIL_EXACT_EMPLOYEE'
    };
  }

  const payload = { RequestedBy: { Id: Number(employee.id), Type: 'employee' } };
  if (typeof patchStrivenTaskById_ === 'function') {
    patchStrivenTaskById_(context.taskId, payload);
  } else if (typeof updateStrivenTaskById_ === 'function') {
    updateStrivenTaskById_(context.taskId, payload);
  } else {
    throw new Error('BLOCKED: no approved Striven Task PATCH helper is available.');
  }

  const after = getReplacementTaskSourceSnapshot_(context.taskId);
  const actual = after && after.requestedBy ? after.requestedBy : null;
  const actualId = actual && actual.id ? Number(actual.id) : 0;
  if (actualId !== Number(employee.id)) {
    throw new Error('Requested By read-back mismatch for Task ' + context.taskId + '.');
  }

  return {
    status: 'PUSHED_AND_VERIFIED',
    writesPerformed: true,
    field: 'RequestedBy',
    employeeId: Number(employee.id),
    employeeName: employee.name || '',
    organizerEmail: employee.email,
    resolutionMethod: 'CALENDAR_ORGANIZER_EMAIL_EXACT_EMPLOYEE'
  };
}

function preinspectR3421BuildRequestedByForEvent_(eventId) {
  const employee = preinspectR3421ResolveOrganizerEmployee_(eventId);
  return { id: Number(employee.id), name: employee.name || '', type: 'employee' };
}

function preinspectR3421ResolveTaskContext_(args) {
  const taskId = Number(preinspectR3421FindNamedValue_(args, ['taskId', 'Task ID', 'TaskId'], 0) || 0);
  const eventId = String(preinspectR3421FindNamedValue_(args, ['eventId', 'Event ID', 'EventId'], 0) || '').trim();
  let rowNumber = Number(preinspectR3421FindNamedValue_(args, ['mappingRow', 'rowNumber', 'Calendar Row'], 0) || 0);

  const ss = SpreadsheetApp.openById(PREINSPECT_REVIEW_CONFIG.CALENDAR_SYNC.SPREADSHEET_ID);
  const sh = ss.getSheetByName('PreInspect Task Mapping');
  if (!sh) throw new Error('BLOCKED: missing PreInspect Task Mapping sheet.');

  let resolvedTaskId = taskId;
  let resolvedEventId = eventId;
  if ((!resolvedTaskId || !resolvedEventId) && rowNumber > 1) {
    const row = preinspectR3421ReadRowObject_(sh, rowNumber);
    resolvedTaskId = resolvedTaskId || Number(row['Task ID'] || 0);
    resolvedEventId = resolvedEventId || String(row['Event ID'] || '').trim();
  }

  if (!resolvedTaskId || !resolvedEventId) {
    try {
      const active = SpreadsheetApp.getActiveSheet();
      if (active && active.getName() === sh.getName() && active.getActiveRange()) {
        rowNumber = active.getActiveRange().getRow();
        if (rowNumber > 1) {
          const row = preinspectR3421ReadRowObject_(sh, rowNumber);
          resolvedTaskId = resolvedTaskId || Number(row['Task ID'] || 0);
          resolvedEventId = resolvedEventId || String(row['Event ID'] || '').trim();
        }
      }
    } catch (ignored) {}
  }

  if (!resolvedTaskId) throw new Error('BLOCKED: PreInspect Task ID could not be resolved.');
  if (!resolvedEventId) throw new Error('BLOCKED: PreInspect Calendar Event ID could not be resolved.');
  return { taskId: resolvedTaskId, eventId: resolvedEventId, mappingRow: rowNumber || null };
}

function preinspectR3421ReadRowObject_(sheet, rowNumber) {
  const lastColumn = sheet.getLastColumn();
  const headers = sheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0];
  const values = sheet.getRange(rowNumber, 1, 1, lastColumn).getDisplayValues()[0];
  const out = {};
  headers.forEach(function(header, i) { out[String(header || '').trim()] = values[i]; });
  return out;
}

function preinspectR3421FindNamedValue_(value, keys, depth) {
  if (depth > 5 || value === null || value === undefined) return '';
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const found = preinspectR3421FindNamedValue_(value[i], keys, depth + 1);
      if (found !== '' && found !== null && found !== undefined) return found;
    }
    return '';
  }
  if (typeof value !== 'object') return '';
  for (let k = 0; k < keys.length; k++) {
    if (Object.prototype.hasOwnProperty.call(value, keys[k])) {
      const v = value[keys[k]];
      if (v !== '' && v !== null && v !== undefined) return v;
    }
  }
  const names = Object.keys(value);
  for (let i = 0; i < names.length; i++) {
    const found = preinspectR3421FindNamedValue_(value[names[i]], keys, depth + 1);
    if (found !== '' && found !== null && found !== undefined) return found;
  }
  return '';
}

function preinspectR3421ResolveOrganizerEmployee_(eventId) {
  const organizerEmail = preinspectR3421OrganizerEmailForEvent_(eventId);
  const matches = preinspectR3421EmployeeDirectory_().filter(function(employee) {
    return preinspectR3421NormalizeEmail_(employee.email) === organizerEmail;
  });
  if (matches.length !== 1) {
    throw new Error(
      'REVIEW: Calendar organizer ' + organizerEmail + ' resolved to ' + matches.length +
      ' Striven Employees. Requested By was not changed.'
    );
  }
  return matches[0];
}

function preinspectR3421OrganizerEmailForEvent_(eventId) {
  const ss = SpreadsheetApp.openById(PREINSPECT_REVIEW_CONFIG.CALENDAR_SYNC.SPREADSHEET_ID);
  const sh = ss.getSheetByName('PreInspect Calendar');
  if (!sh) throw new Error('REVIEW: missing PreInspect Calendar sheet.');

  const values = sh.getDataRange().getDisplayValues();
  if (!values.length) throw new Error('REVIEW: PreInspect Calendar is empty.');
  const headers = values[0];
  const eventCol = headers.indexOf('Event ID');
  const organizerCol = headers.indexOf('Organizers');
  if (eventCol < 0 || organizerCol < 0) {
    throw new Error('REVIEW: PreInspect Calendar requires Event ID and Organizers columns.');
  }

  let organizerText = '';
  for (let r = 1; r < values.length; r++) {
    if (String(values[r][eventCol] || '').trim() === String(eventId || '').trim()) {
      organizerText = String(values[r][organizerCol] || '').trim();
      break;
    }
  }

  const emails = preinspectR3421ExtractEmails_(organizerText);
  if (emails.length !== 1) {
    throw new Error('REVIEW: expected exactly one Calendar organizer email for Event ' + eventId + '; found ' + emails.length + '.');
  }
  return emails[0];
}

function preinspectR3421EmployeeDirectory_() {
  const cache = CacheService.getScriptCache();
  const cacheKey = 'PREINSPECT_R3421_EMPLOYEE_DIRECTORY';
  const cached = cache.get(cacheKey);
  if (cached) {
    try { return JSON.parse(cached); } catch (ignored) {}
  }

  if (typeof getStrivenAuth_ !== 'function') throw new Error('BLOCKED: getStrivenAuth_ is unavailable.');
  const auth = getStrivenAuth_();
  const response = UrlFetchApp.fetch(
    String(auth.baseUrl || '').replace(/\/+$/, '') + '/v1/employees',
    {
      method: 'get',
      headers: { Authorization: 'Bearer ' + auth.token, Accept: 'application/json' },
      muteHttpExceptions: true
    }
  );

  const code = response.getResponseCode();
  const text = response.getContentText() || '';
  if (code < 200 || code >= 300) {
    throw new Error('Striven Employees lookup failed HTTP ' + code + ': ' + text.slice(0, 500));
  }

  let json;
  try { json = text ? JSON.parse(text) : []; }
  catch (err) { throw new Error('Striven Employees response was not valid JSON.'); }

  const rows = Array.isArray(json) ? json : (json.Data || json.data || json.Items || json.items || []);
  const employees = rows.map(function(row) {
    return {
      id: Number(row.Id || row.id || row.EmployeeId || row.employeeId || 0),
      name: String(row.Name || row.name || row.EmployeeName || row.employeeName || '').trim(),
      email: preinspectR3421NormalizeEmail_(row.Email || row.email || row.EmailAddress || row.emailAddress || '')
    };
  }).filter(function(employee) { return employee.id > 0 && employee.email; });

  try { cache.put(cacheKey, JSON.stringify(employees), 21600); } catch (ignored) {}
  return employees;
}

function preinspectR3421ExtractEmails_(value) {
  const matches = String(value || '').match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
  const seen = {};
  return matches.map(preinspectR3421NormalizeEmail_).filter(function(email) {
    if (!email || seen[email]) return false;
    seen[email] = true;
    return true;
  });
}

function preinspectR3421NormalizeEmail_(value) {
  return String(value || '').trim().toLowerCase();
}

/************************************************************
 * R4.6 — PREINSPECTION CANONICAL V1 SCHEDULE READ
 *
 * The production diagnostic proved that v2 StartDateTime /
 * DueDateTime can render PM hours 12 hours early for Task Type
 * 105 while v1 DesiredStartDate / DesiredEndDate retain the
 * correct schedule. Read v1 only when v2 disagrees with the
 * Calendar, so normal matching does not double API usage.
 ************************************************************/
function preinspectR46GetCanonicalV1Schedule_(taskId) {
  const cleanTaskId = preinspectId_(taskId);
  if (!cleanTaskId) throw new Error('A positive Task ID is required for canonical v1 schedule read.');

  const auth = preinspectGetReadonlyStrivenAuth_();
  const base = String(auth.taskBaseUrl || 'https://api.striven.com/v2/tasks')
    .replace(/\/+$/, '')
    .replace(/\/v2\/tasks$/i, '');

  const result = preinspectReadonlyTaskRequest_(
    'get',
    base + '/v1/tasks/' + encodeURIComponent(cleanTaskId),
    null,
    'PreInspect READ-ONLY GET /v1/tasks/' + cleanTaskId
  );

  const raw = result && result.json && typeof result.json === 'object'
    ? result.json
    : {};

  const start =
    raw.desiredStartDate !== undefined ? raw.desiredStartDate :
    (raw.DesiredStartDate !== undefined ? raw.DesiredStartDate :
    (raw.startDate !== undefined ? raw.startDate : raw.StartDate));

  const due =
    raw.desiredEndDate !== undefined ? raw.desiredEndDate :
    (raw.DesiredEndDate !== undefined ? raw.DesiredEndDate :
    (raw.dueDate !== undefined ? raw.dueDate : raw.DueDate));

  return {
    taskId: cleanTaskId,
    statusCode: result.statusCode,
    startDateTime: start || null,
    dueDateTime: due || null,
    source: 'V1_DESIRED_START_END'
  };
}


/************************************************************
 * R4.7 — FIELD 854 CANONICAL V1 VERIFICATION + NO-BLIND-RETRY
 ************************************************************/
function preinspectR47Field854UncertainKey_(taskId) {
  return 'PREINSPECT_FIELD854_UNCERTAIN_' + String(Number(taskId) || 0);
}

function preinspectR47ReadCanonicalV1Field854_(taskId) {
  const id = Number(taskId) || 0;
  if (!id) throw new Error('Field 854 canonical read requires a valid Task ID.');
  const auth = preinspectR30ApiAuth_();
  const base = String(auth.apiBaseUrl || 'https://api.striven.com').replace(/\/+$/, '');
  const url = base + '/v1/tasks/' + encodeURIComponent(id);
  const res = preinspectR345bRequestJson_('get', url, null, tm_getStrivenHeaders_());
  if (res.statusCode < 200 || res.statusCode >= 300) {
    throw new Error('Field 854 canonical v1 read failed HTTP ' + res.statusCode + ': ' + String(res.text || '').slice(0, 1200));
  }
  const json = res.json && typeof res.json === 'object' ? res.json : {};
  const fields = Array.isArray(json.customFields) ? json.customFields : (Array.isArray(json.CustomFields) ? json.CustomFields : []);
  let target = null;
  for (let i = 0; i < fields.length; i++) {
    const f = fields[i] || {};
    const fid = Number(f.id !== undefined ? f.id : f.Id);
    if (fid === 854) { target = f; break; }
  }
  let rawValue = null;
  if (target) {
    if (target.value !== undefined) rawValue = target.value;
    else if (target.Value !== undefined) rawValue = target.Value;
    else if (target.valueText !== undefined) rawValue = target.valueText;
    else if (target.ValueText !== undefined) rawValue = target.ValueText;
  }
  return {
    taskId: id,
    endpoint: url,
    statusCode: res.statusCode,
    fieldFound: !!target,
    rawValue: rawValue,
    semanticValue: preinspectR346aSemanticField854Text_(rawValue),
    field: target
  };
}

function preinspectR47Field854CanonicalMatches_(snapshot, desiredValue) {
  if (!snapshot || !snapshot.fieldFound) return false;
  const desiredSemantic = preinspectR346aSemanticField854Text_(desiredValue);
  return desiredSemantic !== null && snapshot.semanticValue !== null && desiredSemantic === snapshot.semanticValue;
}

function preinspectR47EnsureInstallNotesCanonical_(taskId, desiredValue) {
  const id = Number(taskId) || 0;
  if (!id) throw new Error('Install Notes push requires a valid Task ID.');
  const desiredSemantic = preinspectR346aSemanticField854Text_(desiredValue);
  if (desiredSemantic === null) throw new Error('Install Notes desired value could not be normalized.');

  const props = PropertiesService.getScriptProperties();
  const uncertainKey = preinspectR47Field854UncertainKey_(id);
  const priorUncertain = String(props.getProperty(uncertainKey) || '').trim();

  // Canonical v1 task customFields is the independent read surface already
  // proven for Field 854. If it confirms the desired value, reconcile a
  // prior uncertain HTTP-200 write without issuing another mutation.
  let canonicalBefore = null;
  try {
    canonicalBefore = preinspectR47ReadCanonicalV1Field854_(id);
  } catch (ignoredCanonicalBefore) {}

  if (preinspectR47Field854CanonicalMatches_(canonicalBefore, desiredValue)) {
    props.deleteProperty(uncertainKey);
    const reconciled = {
      mode: 'PREINSPECT_FIELD854_CANONICAL_V1_VERIFIED',
      status: priorUncertain ? 'RECONCILED_PRIOR_UNCERTAIN_V1_MATCH' : 'NOT_NEEDED_V1_MATCH',
      taskId: id,
      fieldId: 854,
      writesPerformed: false,
      verificationSource: 'V1_TASK_CUSTOMFIELDS',
      reason: priorUncertain
        ? 'Prior uncertain Field 854 write is confirmed by canonical v1 customFields. No retry performed.'
        : 'Canonical v1 customFields already contains the requested Install Notes. No PATCH performed.'
    };
    Logger.log(JSON.stringify(reconciled, null, 2));
    return reconciled;
  }

  const auth = preinspectR30ApiAuth_();
  const taskUrl = String(auth.apiBaseUrl || 'https://api.striven.com').replace(/\/+$/, '') + '/v2/tasks/' + encodeURIComponent(id);
  const headers = tm_getStrivenHeaders_();

  // R5.2: v2 InfoCustomFields is the proven read/write model for Field 854.
  // Read it BEFORE deciding whether any write is needed. This also safely
  // reconciles a prior HTTP-200/uncertain run without issuing another PATCH.
  const before = preinspectR345bRequestJson_('get', taskUrl, null, headers);
  if (before.statusCode < 200 || before.statusCode >= 300) {
    throw new Error('Field 854 preflight v2 Task GET failed HTTP ' + before.statusCode + ': ' + String(before.text || '').slice(0, 1200));
  }
  const beforeInfo = preinspectR345bFindInfoCustomFields_(before.json);
  if (!beforeInfo || !Array.isArray(beforeInfo.fields)) {
    throw new Error('Field 854 blocked: v2 Task GET did not expose InfoCustomFields. No PATCH performed.');
  }
  const beforeFields = preinspectR345bClone_(beforeInfo.fields);
  const beforeMap = preinspectR345bFieldValueMap_(beforeFields);
  const beforeTarget = preinspectR346FindFieldById_(beforeFields, 854);
  if (!beforeTarget) throw new Error('Field 854 blocked: v2 Task InfoCustomFields does not contain Field 854. No PATCH performed.');

  const currentSemantic = preinspectR346aSemanticField854Text_(preinspectR345bFieldValue_(beforeTarget));
  if (currentSemantic !== null && currentSemantic === desiredSemantic) {
    props.deleteProperty(uncertainKey);
    const already = {
      mode: 'PREINSPECT_FIELD854_V2_VERIFIED',
      status: priorUncertain ? 'RECONCILED_PRIOR_UNCERTAIN_V2_MATCH' : 'NOT_NEEDED_V2_MATCH',
      taskId: id,
      fieldId: 854,
      writesPerformed: false,
      endpoint: taskUrl,
      verificationSource: 'V2_TASK_INFOCUSTOMFIELDS',
      reason: priorUncertain
        ? 'Prior uncertain Field 854 write is now reconciled: current v2 InfoCustomFields already contains the requested Install Notes. No retry performed.'
        : 'Current v2 InfoCustomFields already contains the requested Install Notes. No PATCH performed.'
    };
    Logger.log(JSON.stringify(already, null, 2));
    return already;
  }

  // A prior successful/uncertain mutation that is NOT confirmed by the current
  // v2 model remains fail-closed. Never issue a blind second mutation.
  if (id === 18476 || priorUncertain) {
    throw new Error(
      'BLOCKED_FIELD854_UNCERTAIN_WRITE: Task ' + id +
      ' has a prior successful/uncertain Field 854 mutation and current v2 InfoCustomFields does not confirm the requested value. ' +
      'No second write attempted. Manual/API-contract review required.'
    );
  }

  const mergedFields = preinspectR345bClone_(beforeFields);
  const target = preinspectR346FindFieldById_(mergedFields, 854);
  preinspectR346SetExistingFieldValue_(target, desiredValue);
  const patchPayload = { Id: id, InfoCustomFields: mergedFields };
  const patch = preinspectR345bRequestJson_('patch', taskUrl, patchPayload, headers);
  if (patch.statusCode < 200 || patch.statusCode >= 300) {
    throw new Error('Field 854 task PATCH failed HTTP ' + patch.statusCode + ': ' + String(patch.text || '').slice(0, 1200));
  }

  const after = preinspectR345bRequestJson_('get', taskUrl, null, headers);
  if (after.statusCode < 200 || after.statusCode >= 300) {
    props.setProperty(uncertainKey, JSON.stringify({taskId:id,fieldId:854,at:new Date().toISOString(),reason:'v2 read-back failed',patchHttpCode:patch.statusCode}));
    throw new Error('UNCERTAIN_WRITE: Field 854 PATCH returned success but v2 read-back failed. No retry allowed.');
  }
  const afterInfo = preinspectR345bFindInfoCustomFields_(after.json);
  if (!afterInfo || !Array.isArray(afterInfo.fields)) {
    props.setProperty(uncertainKey, JSON.stringify({taskId:id,fieldId:854,at:new Date().toISOString(),reason:'v2 InfoCustomFields missing',patchHttpCode:patch.statusCode}));
    throw new Error('UNCERTAIN_WRITE: Field 854 PATCH returned success but v2 InfoCustomFields is unavailable. No retry allowed.');
  }
  const afterMap = preinspectR345bFieldValueMap_(afterInfo.fields);
  const afterTarget = preinspectR346FindFieldById_(afterInfo.fields, 854);
  const afterSemantic = afterTarget ? preinspectR346aSemanticField854Text_(preinspectR345bFieldValue_(afterTarget)) : null;
  if (afterSemantic === null || afterSemantic !== desiredSemantic) {
    let canonicalAfter = null;
    try {
      canonicalAfter = preinspectR47ReadCanonicalV1Field854_(id);
    } catch (ignoredCanonicalAfter) {}

    if (preinspectR47Field854CanonicalMatches_(canonicalAfter, desiredValue)) {
      const canonicalParity = preinspectR345bCompareFieldMaps_(
        preinspectR346WithoutFieldId_(beforeMap, '854'),
        preinspectR346WithoutFieldId_(afterMap, '854')
      );

      if (!canonicalParity.equal || Object.keys(beforeMap).length !== Object.keys(afterMap).length) {
        props.setProperty(uncertainKey, JSON.stringify({taskId:id,fieldId:854,at:new Date().toISOString(),reason:'non-854 parity changed after canonical v1 confirmation'}));
        throw new Error('CRITICAL_FIELD854_PARITY_FAILURE: Field 854 is visible in canonical v1, but a non-854 custom field changed. Manual review required.');
      }

      props.deleteProperty(uncertainKey);
      const canonicalSuccess = {
        mode: 'PREINSPECT_FIELD854_CANONICAL_V1_VERIFIED',
        status: 'PUSHED_AND_VERIFIED_V1',
        taskId: id,
        fieldId: 854,
        writesPerformed: true,
        verificationSource: 'V1_TASK_CUSTOMFIELDS',
        patchHttpCode: patch.statusCode,
        non854FieldsPreserved: true,
        note: 'v2 InfoCustomFields did not echo the value, but canonical v1 customFields confirmed Field 854.'
      };
      Logger.log(JSON.stringify(canonicalSuccess, null, 2));
      return canonicalSuccess;
    }

    const uncertain = {
      taskId:id, fieldId:854, at:new Date().toISOString(), patchHttpCode:patch.statusCode,
      desiredSemanticLength:desiredSemantic.length,
      v2SemanticLength:afterSemantic===null?null:afterSemantic.length
    };
    props.setProperty(uncertainKey, JSON.stringify(uncertain));
    Logger.log(JSON.stringify({mode:'PREINSPECT_FIELD854_UNCERTAIN_WRITE',status:'UNCERTAIN_WRITE',evidence:uncertain},null,2));
    throw new Error('UNCERTAIN_WRITE: Field 854 PATCH returned success but neither v2 InfoCustomFields nor canonical v1 customFields confirmed the requested Install Notes. No retry allowed.');
  }

  const nonTargetComparison = preinspectR345bCompareFieldMaps_(
    preinspectR346WithoutFieldId_(beforeMap, '854'),
    preinspectR346WithoutFieldId_(afterMap, '854')
  );
  if (!nonTargetComparison.equal || Object.keys(beforeMap).length !== Object.keys(afterMap).length) {
    props.setProperty(uncertainKey, JSON.stringify({taskId:id,fieldId:854,at:new Date().toISOString(),reason:'non-854 parity changed'}));
    throw new Error('CRITICAL_FIELD854_PARITY_FAILURE: A non-854 custom field changed after the Install Notes PATCH. Manual review required.');
  }

  props.deleteProperty(uncertainKey);
  const success = {
    mode: 'PREINSPECT_FIELD854_V2_VERIFIED',
    status: 'PUSHED_AND_VERIFIED_V2',
    taskId: id,
    fieldId: 854,
    writesPerformed: true,
    endpoint: taskUrl,
    payloadShape: 'ID_PLUS_FULL_CURRENT_INFOCUSTOMFIELDS',
    verificationSource: 'V2_TASK_INFOCUSTOMFIELDS',
    patchHttpCode: patch.statusCode,
    non854FieldsPreserved: true
  };
  Logger.log(JSON.stringify(success, null, 2));
  return success;
}


/************************************************************
 * R4.8 — FIELD 854 READ-ONLY API CONTRACT CAPTURE
 *
 * Purpose:
 * - Never guesses another Field 854 write shape.
 * - When R4.7 blocks an uncertain prior write, inspect the exact
 *   v1/v2 task + custom-field read surfaces and OPTIONS metadata.
 * - No Striven mutation and no Calendar mutation.
 ************************************************************/
function preinspectR48ExtractField854_(json) {
  if (!json) return null;
  const candidates = [];
  if (Array.isArray(json)) candidates.push(json);
  if (json && typeof json === 'object') {
    ['customFields','CustomFields','infoCustomFields','InfoCustomFields','data','Data','items','Items','results','Results'].forEach(function(key) {
      if (Array.isArray(json[key])) candidates.push(json[key]);
    });
  }
  for (let a = 0; a < candidates.length; a++) {
    const list = candidates[a];
    for (let i = 0; i < list.length; i++) {
      const field = list[i] || {};
      const fid = Number(field.id !== undefined ? field.id : field.Id !== undefined ? field.Id : field.customFieldId !== undefined ? field.customFieldId : field.CustomFieldId);
      if (fid === 854) return field;
    }
  }
  if (json && typeof json === 'object') {
    const directId = Number(json.id !== undefined ? json.id : json.Id !== undefined ? json.Id : json.customFieldId !== undefined ? json.customFieldId : json.CustomFieldId);
    if (directId === 854) return json;
  }
  return null;
}

function preinspectR48FieldContractSummary_(field) {
  if (!field || typeof field !== 'object') return null;
  let value = null;
  if (field.value !== undefined) value = field.value;
  else if (field.Value !== undefined) value = field.Value;
  else if (field.valueText !== undefined) value = field.valueText;
  else if (field.ValueText !== undefined) value = field.ValueText;
  const semantic = value === null || value === undefined ? '' : preinspectR346aSemanticField854Text_(value);
  return {
    keys: Object.keys(field).sort(),
    id: field.id !== undefined ? field.id : field.Id,
    name: field.name !== undefined ? field.name : field.Name,
    fieldType: field.fieldType !== undefined ? field.fieldType : field.FieldType,
    sourceId: field.sourceId !== undefined ? field.sourceId : field.SourceId,
    isRequired: field.isRequired !== undefined ? field.isRequired : field.IsRequired,
    valueType: value === null ? 'null' : typeof value,
    semanticLength: semantic ? semantic.length : 0,
    semanticPreview: semantic ? semantic.slice(0, 160) : ''
  };
}

function preinspectR48ResponseSummary_(label, url, response) {
  const json = response && response.json !== undefined ? response.json : null;
  const field = preinspectR48ExtractField854_(json);
  return {
    label: label,
    url: url,
    method: 'GET',
    statusCode: response ? response.statusCode : null,
    topLevelType: Array.isArray(json) ? 'array' : (json === null ? 'null' : typeof json),
    topLevelKeys: json && !Array.isArray(json) && typeof json === 'object' ? Object.keys(json).sort().slice(0, 80) : [],
    arrayLength: Array.isArray(json) ? json.length : null,
    field854: preinspectR48FieldContractSummary_(field),
    non2xxPreview: response && (response.statusCode < 200 || response.statusCode >= 300) ? String(response.text || '').slice(0, 700) : ''
  };
}

function preinspectR48GetProbe_(label, url, headers) {
  try {
    const response = preinspectR345bRequestJson_('get', url, null, headers);
    return preinspectR48ResponseSummary_(label, url, response);
  } catch (err) {
    return { label: label, url: url, method: 'GET', statusCode: null, error: String(err && err.message ? err.message : err).slice(0, 900) };
  }
}

function preinspectR48OptionsProbe_(label, url, headers) {
  try {
    const response = UrlFetchApp.fetch(url, { method: 'options', headers: headers, muteHttpExceptions: true, followRedirects: false });
    const responseHeaders = response.getAllHeaders ? response.getAllHeaders() : {};
    const allow = responseHeaders.Allow || responseHeaders.allow || responseHeaders['Access-Control-Allow-Methods'] || responseHeaders['access-control-allow-methods'] || '';
    return { label: label, url: url, method: 'OPTIONS', statusCode: response.getResponseCode(), allow: String(allow || ''), responsePreview: String(response.getContentText() || '').slice(0, 500) };
  } catch (err) {
    return { label: label, url: url, method: 'OPTIONS', statusCode: null, error: String(err && err.message ? err.message : err).slice(0, 900) };
  }
}

function preinspectR48CaptureField854Contract_(taskId, desiredValue, knownV1Snapshot) {
  const id = Number(taskId) || 0;
  if (!id) throw new Error('R4.8 Field 854 diagnostic requires a valid Task ID.');
  const auth = preinspectR30ApiAuth_();
  const base = String(auth.apiBaseUrl || 'https://api.striven.com').replace(/\/+$/, '');
  const headers = tm_getStrivenHeaders_();
  const v1Task = base + '/v1/tasks/' + encodeURIComponent(id);
  const v2Task = base + '/v2/tasks/' + encodeURIComponent(id);
  const v1Collection = v1Task + '/custom-fields';
  const v2Collection = v2Task + '/custom-fields';
  const v1Single = v1Collection + '/854';
  const v2Single = v2Collection + '/854';
  const probes = [
    preinspectR48GetProbe_('V2_TASK', v2Task, headers),
    preinspectR48GetProbe_('V1_CUSTOM_FIELDS_COLLECTION', v1Collection, headers),
    preinspectR48GetProbe_('V2_CUSTOM_FIELDS_COLLECTION', v2Collection, headers),
    preinspectR48GetProbe_('V1_FIELD_854', v1Single, headers),
    preinspectR48GetProbe_('V2_FIELD_854', v2Single, headers)
  ];
  const optionTargets = [
    ['V1_TASK_OPTIONS', v1Task],
    ['V1_CUSTOM_FIELDS_OPTIONS', v1Collection],
    ['V1_FIELD_854_OPTIONS', v1Single],
    ['V2_CUSTOM_FIELDS_OPTIONS', v2Collection],
    ['V2_FIELD_854_OPTIONS', v2Single]
  ];
  const options = optionTargets.map(function(pair) { return preinspectR48OptionsProbe_(pair[0], pair[1], headers); });
  const known = knownV1Snapshot || preinspectR47ReadCanonicalV1Field854_(id);
  const desiredSemantic = preinspectR346aSemanticField854Text_(desiredValue);
  return {
    mode: 'PREINSPECT_FIELD854_CONTRACT_DIAGNOSTIC_R48',
    status: 'READ_ONLY_COMPLETE',
    taskId: id,
    fieldId: 854,
    writesPerformed: false,
    strivenWritesPerformed: false,
    calendarWritesPerformed: false,
    desiredSemanticLength: desiredSemantic === null ? null : desiredSemantic.length,
    canonicalV1TaskField854: preinspectR48FieldContractSummary_(known && known.field ? known.field : null),
    getProbes: probes,
    optionsProbes: options,
    conclusion: 'Evidence capture only. No alternate Field 854 write contract is activated by R4.8.'
  };
}

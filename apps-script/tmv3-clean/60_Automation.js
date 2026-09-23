/************************************************************
 * TM V3 — MENU + AUTOMATION PARITY
 ************************************************************/

function onOpen() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const morning = ss.getSheetByName(TMV3.SHEETS.MORNING);

  if (morning) ss.setActiveSheet(morning);

  const ui = SpreadsheetApp.getUi();

  ui.createMenu('Task Mapping V3')
    .addSubMenu(
      ui.createMenu('Operations')
        .addItem('Refresh Sources + Mapping', 'tmv3_shadowRun')
        .addItem('Refresh Mapping From Cache', 'tmv3_shadowMapFromCache')
        .addItem('Refresh Morning Ops', 'tmv3_refreshMorningOps')
        .addSeparator()
        .addItem('Run Safe READY Rows Now', 'tmv3_runSafeReadyRows_MANUAL')
    )
    .addSubMenu(
      ui.createMenu('Selected Appointment')
        .addItem('Preview Selected Action', 'tmv3_previewSelectedAction')
        .addSeparator()
        .addItem('Sync ALL Safe Fields', 'tmv3_syncSelectedAppointment')
        .addItem('Push Date / Time', 'tmv3_pushSelectedDates')
        .addItem('Push Relationships / IDs', 'tmv3_pushSelectedRelationships')
        .addItem('Reconcile Assignee', 'tmv3_reconcileSelectedAssignee')
        .addItem('Fix Calendar Links', 'tmv3_fixSelectedCalendarLinks')
        .addSeparator()
        .addItem('Create / Recreate Task', 'tmv3_createOrRecreateSelectedTask')
        .addItem('Push PreInspection Install Notes (854)', 'tmv3_pushSelectedPreInspectionInstallNotes')
    )
    .addSubMenu(
      ui.createMenu('Reminders')
        .addItem('Send Missing SO Reminder Emails Now', 'tmv3_sendInstallMissingSoRemindersNow')
    )
    .addSubMenu(
      ui.createMenu('Automation')
        .addItem('Install Managed Triggers', 'tmv3_installTriggers')
        .addItem('Remove Managed Triggers', 'tmv3_removeTriggers')
        .addItem('List Managed Triggers', 'tmv3_logTriggers')
    )
    .addSubMenu(
      ui.createMenu('Diagnostics')
        .addItem('Run Full Shadow Verification', 'tmv3_shadowRun')
        .addItem('Health Check', 'tmv3_healthCheck')
        .addItem('Acknowledge Selected Exception', 'tmv3_acknowledgeSelectedMorningOps')
        .addItem('Clear Selected Acknowledgement', 'tmv3_clearAcknowledgementSelectedMorningOps')
    )
    .addToUi();
}

function tmv3_managedTriggerHandlers_() {
  return [
    'tmv3_dailySourceRefresh',
    'tmv3_scheduledOperations',
    'tmv3_refreshLinksSlot_0800',
    'tmv3_refreshLinksSlot_1000',
    'tmv3_refreshLinksSlot_1200',
    'tmv3_refreshLinksSlot_1400',
    'tmv3_refreshLinksSlot_1600',
    'tmv3_refreshLinksSlot_1800',
    'tmv3_installReminderCheck',
    'tmv3_calendarEventUpdated',
    // Older V3 handler retained for cleanup during upgrade.
    'tmv3_scheduledShadow'
  ];
}

function tmv3_installTriggers() {
  tmv3_removeTriggers();
  const created = [];

  created.push(
    ScriptApp.newTrigger('tmv3_dailySourceRefresh')
      .timeBased().atHour(7).nearMinute(0).everyDays(1).create()
  );

  [8,11,13,15,17].forEach(function(hour) {
    created.push(
      ScriptApp.newTrigger('tmv3_scheduledOperations')
        .timeBased().atHour(hour).nearMinute(30).everyDays(1).create()
    );
  });

  [
    ['tmv3_refreshLinksSlot_0800',8],
    ['tmv3_refreshLinksSlot_1000',10],
    ['tmv3_refreshLinksSlot_1200',12],
    ['tmv3_refreshLinksSlot_1400',14],
    ['tmv3_refreshLinksSlot_1600',16],
    ['tmv3_refreshLinksSlot_1800',18]
  ].forEach(function(slot) {
    created.push(
      ScriptApp.newTrigger(slot[0])
        .timeBased().atHour(slot[1]).nearMinute(0).everyDays(1).create()
    );
  });

  created.push(
    ScriptApp.newTrigger('tmv3_installReminderCheck')
      .timeBased().atHour(11).nearMinute(0).everyDays(1).create()
  );

  // Restore the original Delivery + Service event-update response path.
  const watchedCalendars = [
    TMV3.VERTICALS.Delivery.calendarIds[0]
  ].concat(
    (TMV3.VERTICALS.Service.calendars || []).map(function(item) {
      return item.calendarId;
    })
  );

  watchedCalendars.forEach(function(calendarId) {
    try {
      created.push(
        ScriptApp.newTrigger('tmv3_calendarEventUpdated')
          .forUserCalendar(calendarId)
          .onEventUpdated()
          .create()
      );
    } catch (err) {
      tmv3_audit_(
        'SYSTEM','','','INSTALL_CALENDAR_TRIGGER','ATTENTION',
        calendarId + ': ' + String(err && err.message || err)
      );
    }
  });

  const result = tmv3_listTriggers();
  tmv3_audit_(
    'SYSTEM','','','INSTALL_MANAGED_TRIGGERS','PASS',
    'Created ' + created.length + ' managed trigger(s).'
  );
  return result;
}

function tmv3_removeTriggers() {
  const managed = tmv3_managedTriggerHandlers_();
  let deleted = 0;

  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    if (managed.indexOf(trigger.getHandlerFunction()) !== -1) {
      ScriptApp.deleteTrigger(trigger);
      deleted++;
    }
  });

  tmv3_audit_(
    'SYSTEM','','','REMOVE_MANAGED_TRIGGERS','PASS',
    'Deleted ' + deleted + ' managed trigger(s).'
  );
  return tmv3_listTriggers();
}

function tmv3_dailySourceRefresh() {
  tmv3_assertShadow_();
  const result = tmv3_refreshSources();
  tmv3_audit_(
    'SYSTEM','','','DAILY_SOURCE_REFRESH','PASS',JSON.stringify(result)
  );
  tmv3_shadowMapFromCache_({
    customers: result.customers,
    locations: result.locations,
    contacts: result.contacts,
    orders: result.orders,
    tasks: result.tasks,
    source: 'FRESH_DAILY'
  });
  return result;
}

function tmv3_scheduledShadow() {
  // Compatibility alias. Scheduled production uses tmv3_scheduledOperations.
  return tmv3_scheduledOperations();
}

function tmv3_scheduledOperations() {
  const mapped = tmv3_shadowMapFromCache();
  const writes = tmv3_runSafeReadyRows_AUTO();
  return { mapped: mapped, writes: writes };
}

function tmv3_refreshLinksSlot_(label) {
  const mapped = tmv3_shadowMapFromCache();
  const links = tmv3_runCalendarLinksForReady_AUTO();
  tmv3_audit_(
    'SYSTEM','','','REFRESH_LINK_SLOT','PASS',
    String(label || '') + ' · ' + JSON.stringify(links)
  );
  return { slot: label, mapped: mapped, links: links };
}

function tmv3_refreshLinksSlot_0800() { return tmv3_refreshLinksSlot_('8:00 AM'); }
function tmv3_refreshLinksSlot_1000() { return tmv3_refreshLinksSlot_('10:00 AM'); }
function tmv3_refreshLinksSlot_1200() { return tmv3_refreshLinksSlot_('12:00 PM'); }
function tmv3_refreshLinksSlot_1400() { return tmv3_refreshLinksSlot_('2:00 PM'); }
function tmv3_refreshLinksSlot_1600() { return tmv3_refreshLinksSlot_('4:00 PM'); }
function tmv3_refreshLinksSlot_1800() { return tmv3_refreshLinksSlot_('6:00 PM'); }

function tmv3_installReminderCheck() {
  return tmv3_sendInstallMissingSoReminders_('AUTO');
}

function tmv3_calendarEventUpdated() {
  const cache = CacheService.getScriptCache();
  const key = 'TMV3_CALENDAR_EVENT_UPDATE_DEBOUNCE';
  if (cache.get(key)) {
    return { status: 'DEBOUNCED' };
  }
  try { cache.put(key, '1', 45); } catch (ignored) {}

  const mapped = tmv3_shadowMapFromCache();
  const writes = tmv3_runSafeReadyRows_AUTO();
  return { mapped: mapped, writes: writes };
}

function tmv3_listTriggers() {
  return ScriptApp.getProjectTriggers().map(function(t) {
    return {
      handler: t.getHandlerFunction(),
      source: String(t.getTriggerSource()),
      eventType: String(t.getEventType()),
      sourceId: tmv3_safeCalendar_(function() { return t.getTriggerSourceId(); }, '')
    };
  });
}

function tmv3_logTriggers() {
  const result = tmv3_listTriggers();
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

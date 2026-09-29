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
        .addItem('Step 1 — Refresh Calendar Intake', 'tmv3_step1CalendarRun')
        .addItem('Step 2 — Refresh Eligibility', 'tmv3_step2CalendarRun')
        .addItem('Step 3 — Resolve Business Anchors', 'tmv3_step3BusinessAnchorRunCached')
        .addItem('Step 4 — Resolve Customer / Location', 'tmv3_step4IdentityRunCached')
        .addItem('Step 5 — Resolve Tasks', 'tmv3_step5TaskResolutionRunCached')
        .addItem('Step 6 — Decide Task Action', 'tmv3_step6TaskDecisionRunCached')
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
    )
    .addSubMenu(
      ui.createMenu('Reminders')
        .addItem('Send Missing SO Reminder Emails Now', 'tmv3_sendInstallMissingSoRemindersNow')
        .addItem('Preview Pre-Inspection Missing Detail Emails', 'tmv3_previewPreInspectionMissingDetailEmails')
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
        .addItem('Run Live Hardening Regression', 'tmv3_liveHardeningRegression')
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
    'tmv3_calendarReconciliationFallback',
    // Older V3 handler retained for cleanup during upgrade.
    'tmv3_scheduledShadow'
  ];
}

function tmv3_assertCalendarTriggerAuthorization_(calendarIds) {
  const ids = (calendarIds || []).map(tmv3_clean_).filter(Boolean);
  if (!ids.length) return true;

  // Explicitly require the scopes needed by this installation flow.
  // When the Calendar scope is missing, Apps Script stops here and presents
  // the user authorization flow before any managed trigger is deleted.
  ScriptApp.requireScopes(ScriptApp.AuthMode.FULL, [
    'https://www.googleapis.com/auth/calendar',
    'https://www.googleapis.com/auth/script.scriptapp'
  ]);

  try {
    const probe = CalendarApp.getCalendarById(ids[0]);
    if (!probe) {
      throw new Error(
        'Configured Calendar is not accessible: ' + ids[0]
      );
    }
  } catch (err) {
    const message =
      'Managed trigger install blocked before deleting existing triggers. ' +
      'Calendar authorization/access is required. ' +
      String(err && err.message || err);

    tmv3_audit_(
      'SYSTEM','','','INSTALL_TRIGGER_PREFLIGHT','BLOCKED',
      message
    );

    throw new Error(message);
  }

  return true;
}

function tmv3_installTriggers() {
  // V3 watches every configured Calendar through the staged pipeline.
  // Authorization is proved BEFORE any existing managed trigger is removed.
  const watchedCalendars =
    typeof tmv3_step1CalendarIds_ === 'function'
      ? tmv3_step1CalendarIds_()
      : [];

  tmv3_assertCalendarTriggerAuthorization_(watchedCalendars);
  tmv3_removeTriggers();

  const created = [];
  const calendarFailures = [];

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

  created.push(
    ScriptApp.newTrigger('tmv3_installReminderCheck')
      .timeBased().atHour(11).nearMinute(0).everyDays(1).create()
  );

  created.push(
    ScriptApp.newTrigger('tmv3_calendarReconciliationFallback')
      .timeBased().everyHours(1).create()
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
      const failure = {
        calendarId:calendarId,
        error:String(err && err.message || err)
      };
      calendarFailures.push(failure);
      tmv3_audit_(
        'SYSTEM','','','INSTALL_CALENDAR_TRIGGER','FAIL',
        calendarId + ': ' + failure.error
      );
    }
  });

  const result = tmv3_listTriggers();
  const installedCalendarIds = {};
  result.forEach(function(trigger) {
    if (
      tmv3_clean_(trigger.handler) === 'tmv3_calendarEventUpdated' &&
      tmv3_clean_(trigger.sourceId)
    ) {
      installedCalendarIds[tmv3_clean_(trigger.sourceId)] = true;
    }
  });

  const missingCalendarIds = watchedCalendars.filter(function(calendarId) {
    return !installedCalendarIds[tmv3_clean_(calendarId)];
  });

  if (calendarFailures.length || missingCalendarIds.length) {
    const detail = JSON.stringify({
      calendarFailures:calendarFailures,
      missingCalendarIds:missingCalendarIds,
      createdCount:created.length
    });

    tmv3_audit_(
      'SYSTEM','','','INSTALL_MANAGED_TRIGGERS','FAIL',
      detail
    );

    throw new Error(
      'Managed trigger install incomplete. ' + detail
    );
  }

  tmv3_audit_(
    'SYSTEM','','','INSTALL_MANAGED_TRIGGERS','PASS',
    'Created ' + created.length + ' managed trigger(s), including ' +
      watchedCalendars.length + ' Calendar update trigger(s).'
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

function tmv3_calendarStageRefresh_(reason) {
  const stage = tmv3_executionStage_();

  if (stage <= 1) {
    return tmv3_step1CalendarRun(reason || 'STAGE1_REFRESH');
  }

  if (stage === 2) {
    return tmv3_step2CalendarRun(reason || 'STAGE2_REFRESH');
  }

  if (stage === 3) {
    return tmv3_step3BusinessAnchorRunCached(
      reason || 'STAGE3_ANCHOR_REFRESH'
    );
  }

  if (stage === 4) {
    return tmv3_step4IdentityRunCached(
      reason || 'STAGE4_IDENTITY_REFRESH'
    );
  }

  if (stage === 5) {
    return tmv3_step5TaskResolutionRunCached(
      reason || 'STAGE5_TASK_REFRESH'
    );
  }

  if (stage === 6) {
    return tmv3_step6TaskDecisionRunCached(
      reason || 'STAGE6_TASK_DECISION_REFRESH'
    );
  }

  if (stage === 7) {
    // Keep routine Calendar-driven refreshes on the proven Step 6 view.
    // Full Step 7 performs many fresh Task/Contact reads and is deliberately
    // invoked through the guarded verification runner during this stage.
    return tmv3_step6TaskDecisionRunCached(
      reason || 'STAGE7_RECONCILIATION_VIEW_REFRESH'
    );
  }

  return tmv3_shadowMapFromCache();
}

function tmv3_operationalSourceRefreshState_() {
  const props = PropertiesService.getScriptProperties();
  const raw = props.getProperty('TMV3_LAST_OPERATIONAL_SOURCE_REFRESH');
  const ms = raw ? new Date(raw).getTime() : 0;
  return {
    lastRefresh:raw || '',
    ageMinutes:ms ? Math.max(0, (Date.now() - ms) / 60000) : null
  };
}

function tmv3_refreshOperationalSourcesIfNeeded_(maxAgeMinutes, force) {
  const state = tmv3_operationalSourceRefreshState_();
  const maxAge = Math.max(1, Number(maxAgeMinutes || 15));
  const stale =
    force === true ||
    state.ageMinutes === null ||
    state.ageMinutes >= maxAge;

  if (!stale) {
    return {
      status:'CACHE_FRESH',
      refreshed:false,
      lastRefresh:state.lastRefresh,
      ageMinutes:state.ageMinutes
    };
  }

  const result = tmv3_refreshSources();
  const refreshedAt = new Date().toISOString();
  PropertiesService.getScriptProperties().setProperty(
    'TMV3_LAST_OPERATIONAL_SOURCE_REFRESH',
    refreshedAt
  );

  return {
    status:'REFRESHED',
    refreshed:true,
    refreshedAt:refreshedAt,
    result:result
  };
}

function tmv3_runProductionAutomationCycle_(reason, options) {
  options = options || {};

  if (tmv3_executionStage_() <= 7) {
    return {
      status:'CALENDAR_STAGE_GATED',
      stage:tmv3_executionStage_(),
      mapped:tmv3_calendarStageRefresh_(reason || 'AUTOMATION_STAGE_GATED'),
      writes:{ status:'CALENDAR_STAGE_GATED', writes:0 }
    };
  }

  if (!tmv3_operationWritesEnabled_('AUTO')) {
    return {
      status:'AUTO_WRITES_GATED',
      stage:tmv3_executionStage_(),
      sources:tmv3_refreshOperationalSourcesIfNeeded_(
        Number(options.maxSourceAgeMinutes || 15),
        options.forceSourceRefresh === true
      ),
      mapped:tmv3_shadowMapFromCache(),
      writes:{ status:'AUTO_WRITES_GATED', writes:0 }
    };
  }

  const sources = tmv3_refreshOperationalSourcesIfNeeded_(
    Number(options.maxSourceAgeMinutes || 15),
    options.forceSourceRefresh === true
  );
  const mapped = tmv3_shadowMapFromCache();
  const writes = tmv3_runSafeReadyRows_AUTO();

  const result = {
    status:'AUTOMATION_CYCLE_COMPLETE',
    reason:tmv3_clean_(reason || 'AUTO'),
    stage:tmv3_executionStage_(),
    sources:sources,
    mapped:mapped,
    writes:writes
  };

  tmv3_audit_(
    'SYSTEM','','','PRODUCTION_AUTOMATION_CYCLE',
    'PASS',
    JSON.stringify({
      reason:result.reason,
      sourceStatus:sources.status,
      writeStatus:writes.status,
      writes:Number(writes.writes || 0),
      attempts:Number(writes.attempts || 0)
    })
  );

  return result;
}

function tmv3_calendarReconciliationFallback() {
  const hour = Number(
    Utilities.formatDate(
      new Date(),
      TMV3_TIMEZONE,
      'H'
    )
  );

  if (hour < 8 || hour > 18) {
    return { status:'OUTSIDE_BUSINESS_HOURS' };
  }

  if (tmv3_executionStage_() <= 7) {
    return tmv3_calendarStageRefresh_(
      'CALENDAR_RECONCILIATION_FALLBACK'
    );
  }

  return tmv3_runProductionAutomationCycle_(
    'CALENDAR_RECONCILIATION_FALLBACK',
    {
      maxSourceAgeMinutes:60,
      forceSourceRefresh:false
    }
  );
}

function tmv3_dailySourceRefresh() {
  tmv3_assertShadow_();

  if (tmv3_executionStage_() <= 2) {
    return tmv3_calendarStageRefresh_('DAILY_CALENDAR_STAGE_REFRESH');
  }

  if (tmv3_executionStage_() === 3) {
    const sources = tmv3_step3RefreshAnchorSources_();
    const mapped = tmv3_step3BusinessAnchorRunCached(
      'DAILY_STAGE3_ANCHOR_REFRESH'
    );
    return { sources: sources, mapped: mapped };
  }

  if (tmv3_executionStage_() === 4) {
    const sources = tmv3_step4RefreshIdentitySources_();
    const mapped = tmv3_step4IdentityRunCached(
      'DAILY_STAGE4_IDENTITY_REFRESH'
    );
    return { sources: sources, mapped: mapped };
  }

  if (tmv3_executionStage_() === 5) {
    const sources = tmv3_step5RefreshTaskSources_();
    const mapped = tmv3_step5TaskResolutionRunCached(
      'DAILY_STAGE5_TASK_REFRESH'
    );
    return { sources: sources, mapped: mapped };
  }

  if (tmv3_executionStage_() === 6) {
    const sources = tmv3_step5RefreshTaskSources_();
    const mapped = tmv3_step6TaskDecisionRunCached(
      'DAILY_STAGE6_TASK_DECISION_REFRESH'
    );
    return { sources: sources, mapped: mapped };
  }

  if (tmv3_executionStage_() === 7) {
    const sources = tmv3_step5RefreshTaskSources_();
    const mapped = tmv3_step6TaskDecisionRunCached(
      'DAILY_STAGE7_RECONCILIATION_VIEW_REFRESH'
    );
    return { sources: sources, mapped: mapped };
  }

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
  if (tmv3_executionStage_() <= 7) {
    return {
      stage:tmv3_executionStage_(),
      mapped:tmv3_calendarStageRefresh_(
        'SCHEDULED_CALENDAR_STAGE_REFRESH'
      ),
      writes:{ status:'CALENDAR_STAGE_GATED', writes:0 }
    };
  }

  return tmv3_runProductionAutomationCycle_(
    'SCHEDULED_OPERATIONS',
    {
      maxSourceAgeMinutes:30,
      forceSourceRefresh:false
    }
  );
}

function tmv3_refreshLinksSlot_(label) {
  if (tmv3_executionStage_() <= 7) {
    const mapped = tmv3_calendarStageRefresh_(
      'CALENDAR_STAGE_SLOT_' + String(label || '')
    );
    const links = { status: 'CALENDAR_STAGE_GATED', writes: 0 };
    return { slot: label, mapped: mapped, links: links };
  }

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
  if (tmv3_executionStage_() <= 7) {
    return { status: 'CALENDAR_STAGE_GATED', sent: 0 };
  }
  return tmv3_sendInstallMissingSoReminders_('AUTO');
}

function tmv3_calendarEventUpdated() {
  const lock = LockService.getScriptLock();
  const cache = CacheService.getScriptCache();
  const dirtyKey = 'TMV3_CALENDAR_EVENT_UPDATE_DIRTY';

  if (!lock.tryLock(1000)) {
    try { cache.put(dirtyKey, '1', 300); } catch (ignored) {}
    return { status:'QUEUED_BEHIND_ACTIVE_REFRESH' };
  }

  try {
    try { cache.remove(dirtyKey); } catch (ignored) {}

    const first =
      tmv3_executionStage_() <= 7
        ? tmv3_calendarStageRefresh_('CALENDAR_EVENT_UPDATED')
        : tmv3_runProductionAutomationCycle_(
            'CALENDAR_EVENT_UPDATED',
            {
              maxSourceAgeMinutes:15,
              forceSourceRefresh:false
            }
          );

    let rerun = null;

    if (cache.get(dirtyKey)) {
      try { cache.remove(dirtyKey); } catch (ignored) {}

      rerun =
        tmv3_executionStage_() <= 7
          ? tmv3_calendarStageRefresh_(
              'CALENDAR_EVENT_UPDATED_RERUN'
            )
          : tmv3_runProductionAutomationCycle_(
              'CALENDAR_EVENT_UPDATED_RERUN',
              {
                maxSourceAgeMinutes:15,
                forceSourceRefresh:false
              }
            );
    }

    return {
      status:rerun ? 'REFRESHED_AND_RERUN' : 'REFRESHED',
      first:first,
      rerun:rerun,
      writes:
        tmv3_executionStage_() <= 7
          ? { status:'CALENDAR_STAGE_GATED', writes:0 }
          : (
              (rerun && rerun.writes) ||
              (first && first.writes) ||
              { status:'NO_WRITE_RESULT', writes:0 }
            )
    };
  } finally {
    lock.releaseLock();
  }
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

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
        .addItem('Run Pre-Inspection Automation Now', 'tmv3_runPreInspectionAutomation')
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

function tmv3_sourceRefreshState_(propertyKey) {
  const props = PropertiesService.getScriptProperties();
  const raw = props.getProperty(propertyKey);
  const ms = raw ? new Date(raw).getTime() : 0;

  return {
    lastRefresh:raw || '',
    ageMinutes:ms ? Math.max(0, (Date.now() - ms) / 60000) : null
  };
}

function tmv3_operationalSourceRefreshState_() {
  return tmv3_sourceRefreshState_(
    'TMV3_LAST_OPERATIONAL_SOURCE_REFRESH'
  );
}

function tmv3_masterSourceRefreshState_() {
  return tmv3_sourceRefreshState_(
    'TMV3_LAST_MASTER_SOURCE_REFRESH'
  );
}

function tmv3_operationalSourceMinAgeMinutes_() {
  return Math.max(
    1,
    Number(
      TMV3.OPERATIONS &&
      TMV3.OPERATIONS.sourceRefreshMinMinutes ||
      120
    )
  );
}

function tmv3_masterSourceMinAgeMinutes_() {
  return Math.max(
    tmv3_operationalSourceMinAgeMinutes_(),
    Number(
      TMV3.OPERATIONS &&
      TMV3.OPERATIONS.masterSourceRefreshMinMinutes ||
      360
    )
  );
}

function tmv3_refreshOperationalSourcesIfNeeded_(maxAgeMinutes, force) {
  const operationalState = tmv3_operationalSourceRefreshState_();
  const masterState = tmv3_masterSourceRefreshState_();
  const operationalMinimum = tmv3_operationalSourceMinAgeMinutes_();
  const masterMinimum = tmv3_masterSourceMinAgeMinutes_();
  const requestedOperationalAge = Math.max(
    1,
    Number(maxAgeMinutes || operationalMinimum)
  );
  const operationalMaxAge =
    force === true
      ? requestedOperationalAge
      : Math.max(operationalMinimum, requestedOperationalAge);

  const operationalStale =
    force === true ||
    operationalState.ageMinutes === null ||
    operationalState.ageMinutes >= operationalMaxAge;

  const masterStale =
    force === true ||
    masterState.ageMinutes === null ||
    masterState.ageMinutes >= masterMinimum;

  if (!operationalStale && !masterStale) {
    return {
      status:'CACHE_FRESH',
      refreshed:false,
      master:{
        refreshed:false,
        lastRefresh:masterState.lastRefresh,
        ageMinutes:masterState.ageMinutes,
        effectiveMaxAgeMinutes:masterMinimum
      },
      transactions:{
        refreshed:false,
        lastRefresh:operationalState.lastRefresh,
        ageMinutes:operationalState.ageMinutes,
        requestedMaxAgeMinutes:requestedOperationalAge,
        effectiveMaxAgeMinutes:operationalMaxAge
      }
    };
  }

  tmv3_resetRuntimeMetrics_();

  const props = PropertiesService.getScriptProperties();
  let masterResult = null;
  let transactionResult = null;
  let masterRefreshedAt = masterState.lastRefresh;
  let operationalRefreshedAt = operationalState.lastRefresh;

  if (masterStale) {
    masterResult = tmv3_refreshMasterSources_();
    masterRefreshedAt = new Date().toISOString();
    props.setProperty(
      'TMV3_LAST_MASTER_SOURCE_REFRESH',
      masterRefreshedAt
    );
  }

  if (operationalStale) {
    transactionResult = tmv3_refreshTransactionSources_();
    operationalRefreshedAt = new Date().toISOString();
    props.setProperty(
      'TMV3_LAST_OPERATIONAL_SOURCE_REFRESH',
      operationalRefreshedAt
    );
  }

  return {
    status:'REFRESHED',
    refreshed:true,
    master:{
      refreshed:masterStale,
      refreshedAt:masterRefreshedAt,
      effectiveMaxAgeMinutes:masterMinimum,
      result:masterResult
    },
    transactions:{
      refreshed:operationalStale,
      refreshedAt:operationalRefreshedAt,
      requestedMaxAgeMinutes:requestedOperationalAge,
      effectiveMaxAgeMinutes:operationalMaxAge,
      result:transactionResult
    },
    api:tmv3_runtimeMetrics_()
  };
}

function tmv3_stage7ConfiguredCanaryEnabled_(
  stage,
  mode,
  automationWritesEnabled
) {
  return (
    Number(stage) === 7 &&
    String(mode || '') === 'CANARY_WRITE' &&
    automationWritesEnabled === true
  );
}

function tmv3_stage7AutomaticCanaryCycle_(reason) {
  const stage = tmv3_executionStage_();
  const policy = tmv3_operationPolicy_();
  let sources = null;
  let sourceError = '';
  let mapped = null;

  try {
    sources = tmv3_refreshOperationalSourcesIfNeeded_(
      tmv3_operationalSourceMinAgeMinutes_(),
      false
    );
  } catch (err) {
    sourceError = String(err && err.message || err);
    sources = {
      status:'FAILED_KEEP_LAST_GOOD',
      refreshed:false,
      error:sourceError
    };

    tmv3_audit_(
      'SYSTEM','','','STAGE7_SOURCE_REFRESH','ATTENTION',
      JSON.stringify({
        reason:tmv3_clean_(reason),
        error:sourceError
      })
    );
  }

  try {
    mapped = tmv3_calendarStageRefresh_(
      reason || 'STAGE7_AUTOMATIC_CANARY'
    );
  } catch (err) {
    mapped = {
      status:'ATTENTION',
      error:String(err && err.message || err)
    };

    tmv3_audit_(
      'SYSTEM','','','STAGE7_CANARY_MAPPING','ATTENTION',
      JSON.stringify({
        reason:tmv3_clean_(reason),
        error:mapped.error
      })
    );
  }

  if (sourceError) {
    return {
      status:'SOURCE_REFRESH_ATTENTION',
      stage:stage,
      sources:sources,
      mapped:mapped,
      writes:{
        status:'AUTO_WRITES_GATED_SOURCE_REFRESH_FAILED',
        writes:0
      }
    };
  }

  if (
    !tmv3_stage7ConfiguredCanaryEnabled_(
      stage,
      TMV3.MODE,
      policy.automationWritesEnabled === true
    )
  ) {
    return {
      status:'CALENDAR_STAGE_GATED',
      stage:stage,
      sources:sources,
      mapped:mapped,
      writes:{
        status:'AUTO_WRITES_GATED',
        writes:0
      }
    };
  }

  let writes;

  try {
    writes = tmv3_runConfiguredCanary_AUTO();

    tmv3_audit_(
      'SYSTEM','','','STAGE7_AUTOMATIC_CANARY','PASS',
      JSON.stringify({
        reason:tmv3_clean_(reason),
        status:tmv3_clean_(writes && writes.status),
        taskId:tmv3_clean_(writes && writes.taskId)
      })
    );
  } catch (err) {
    writes = {
      status:'ATTENTION',
      writes:0,
      error:String(err && err.message || err)
    };

    tmv3_audit_(
      'SYSTEM','','','STAGE7_AUTOMATIC_CANARY','ATTENTION',
      JSON.stringify({
        reason:tmv3_clean_(reason),
        error:writes.error
      })
    );
  }

  return {
    status:'STAGE7_AUTOMATIC_CANARY_CYCLE',
    stage:stage,
    sources:sources,
    mapped:mapped,
    writes:writes
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

function tmv3_preInspectionGuestSyncDecision_(
  guestEmails,
  stephenEmail
) {
  const stephen = tmv3_normEmail_(
    stephenEmail ||
    'stephen@classicfireplace.ca'
  );
  const guests = tmv3_unique_(
    (guestEmails || [])
      .map(tmv3_normEmail_)
      .filter(Boolean)
  );

  if (!stephen) {
    return {
      status:'BLOCKED_CONFIG',
      action:'NONE'
    };
  }

  if (guests.indexOf(stephen) !== -1) {
    return {
      status:'ALREADY_PRESENT',
      action:'NONE'
    };
  }

  return {
    status:'ADD_STEPHEN',
    action:'ADD'
  };
}

function tmv3_reconcilePreInspectionSharedGuest_AUTO_(options) {
  options = options || {};
  const policy = tmv3_operationPolicy_();
  if (policy.preInspectionAutomationScheduleHours && options.force !== true) return {status:'SCHEDULE_ONLY',writes:0};
  const cfg = TMV3.VERTICALS.PreInspection;

  if (policy.preInspectionGuestSyncEnabled !== true) {
    return { status:'DISABLED', writes:0 };
  }

  const primaryId = tmv3_clean_(cfg.primaryCalendarId);
  const stephenEmail = tmv3_clean_(
    cfg.secondaryOwnerEmail ||
    'stephen@classicfireplace.ca'
  );

  if (!primaryId || !stephenEmail) {
    return {
      status:'BLOCKED_CONFIG',
      writes:0,
      errors:[
        'CF Preinspects Calendar ID or Stephen guest email is not configured.'
      ]
    };
  }

  const intervalMinutes = Math.max(
    1,
    Number(
      policy.preInspectionGuestSyncIntervalMinutes ||
      5
    )
  );
  const maxWrites = Math.max(
    1,
    Number(
      policy.preInspectionGuestSyncMaxWrites ||
      50
    )
  );
  const cache = CacheService.getScriptCache();
  const throttleKey =
    'TMV3_PREINSPECTION_STEPPHEN_GUEST_SYNC_ACTIVE'
      .replace('STEPPHEN', 'STEPHEN');

  if (
    options.force !== true &&
    cache.get(throttleKey)
  ) {
    return { status:'THROTTLED', writes:0 };
  }

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) {
    return { status:'LOCK_BUSY', writes:0 };
  }

  try {
    if (
      options.force !== true &&
      cache.get(throttleKey)
    ) {
      return { status:'THROTTLED', writes:0 };
    }

    cache.put(
      throttleKey,
      String(new Date().getTime()),
      Math.min(21600, intervalMinutes * 60)
    );

    const start = new Date();
    start.setDate(
      start.getDate() -
      Number(cfg.lookbackDays || 0)
    );
    start.setHours(0,0,0,0);

    const end = new Date();
    end.setDate(
      end.getDate() +
      Number(cfg.lookaheadDays || 365)
    );
    end.setHours(23,59,59,999);

    const result = {
      status:'PASS',
      reason:tmv3_clean_(
        options.reason ||
        'AUTO'
      ),
      authoritativeCalendar:'CF Preinspects',
      primaryCalendarId:primaryId,
      requiredGuest:stephenEmail,
      scanned:0,
      writes:0,
      added:0,
      alreadyPresent:0,
      deferred:0,
      errors:[]
    };

    const cal =
      CalendarApp.getCalendarById(primaryId);

    if (!cal) {
      result.status = 'ATTENTION';
      result.errors.push(
        'CF Preinspects Calendar unavailable: ' +
        primaryId
      );
      return result;
    }

    cal.getEvents(start, end).forEach(
      function(event) {
        result.scanned++;

        const guests = tmv3_safeCalendar_(
          function() {
            return (
              event.getGuestList
                ? event.getGuestList(true)
                : []
            )
              .map(function(guest) {
                return (
                  guest &&
                  guest.getEmail
                    ? guest.getEmail()
                    : ''
                );
              })
              .filter(Boolean);
          },
          []
        );

        const decision =
          tmv3_preInspectionGuestSyncDecision_(
            guests,
            stephenEmail
          );

        if (
          decision.status ===
          'ALREADY_PRESENT'
        ) {
          result.alreadyPresent++;
          return;
        }

        if (
          decision.action === 'NONE'
        ) {
          result.errors.push(
            'Guest decision blocked for Event ' +
            tmv3_clean_(event.getId()) +
            ': ' +
            decision.status
          );
          return;
        }

        if (
          result.writes >= maxWrites
        ) {
          result.deferred++;
          return;
        }

        try {
          event.addGuest(stephenEmail);

          const readbackGuests = (
            event.getGuestList
              ? event.getGuestList(true)
              : []
          )
            .map(function(guest) {
              return tmv3_normEmail_(
                guest &&
                guest.getEmail
                  ? guest.getEmail()
                  : ''
              );
            })
            .filter(Boolean);

          if (
            readbackGuests.indexOf(
              tmv3_normEmail_(
                stephenEmail
              )
            ) === -1
          ) {
            throw new Error(
              'Stephen guest read-back failed.'
            );
          }

          result.writes++;
          result.added++;
        } catch (err) {
          result.errors.push(
            'Event ' +
            tmv3_clean_(event.getId()) +
            ': ' +
            String(
              err &&
              err.message ||
              err
            )
          );
        }
      }
    );

    if (result.errors.length) {
      result.status = 'ATTENTION';
    }

    tmv3_audit_(
      'PreInspection',
      '',
      '',
      'PREINSPECTION_STEPPHEN_GUEST_SYNC'.replace(
        'STEPPHEN',
        'STEPHEN'
      ),
      result.status,
      JSON.stringify(result)
    );

    return result;
  } finally {
    lock.releaseLock();
  }
}

function tmv3_calendarReconciliationFallback() {
  const preInspection = tmv3_preInspectionAutomationCycle_({reason:'HOURLY_FALLBACK'});
  tmv3_reconcilePreInspectionSharedGuest_AUTO_({
    reason:'CALENDAR_RECONCILIATION_FALLBACK'
  });

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

  // Reuse the verified hourly trigger. The independent relationship lane
  // remains throttled and cannot authorize Calendar, schedule or CREATE writes.
  const taskFirst = tmv3_taskFirstProductionCycle_();

  if (tmv3_executionStage_() < 7) {
    return {taskFirst:taskFirst,preInspection:preInspection,mapped:tmv3_calendarStageRefresh_(
      'CALENDAR_RECONCILIATION_FALLBACK'
    )};
  }

  if (tmv3_executionStage_() === 7) {
    return Object.assign({taskFirst:taskFirst,preInspection:preInspection},tmv3_stage7AutomaticCanaryCycle_(
      'CALENDAR_RECONCILIATION_FALLBACK'
    ));
  }

  return Object.assign({taskFirst:taskFirst,preInspection:preInspection},tmv3_runProductionAutomationCycle_(
    'CALENDAR_RECONCILIATION_FALLBACK',
    {
      maxSourceAgeMinutes:60,
      forceSourceRefresh:false
    }
  ));
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
    // Stage 7 still depends on Stage 3/4 source integrity. Refresh the complete
    // shared snapshot here instead of refreshing Task reports alone.
    const sources = tmv3_refreshOperationalSourcesIfNeeded_(
      tmv3_operationalSourceMinAgeMinutes_(),
      true
    );
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


/**
 * V3-001/P0 relationship-only lane. Runs independently of all Calendar
 * stages and cannot enable other V3 mutation scopes.
 *
 * API budget: one candidate/task per 60-minute slot, one fresh Task GET,
 * one fresh Work Order GET, and only when applicable a verified Contact GET.
 * The existing relationship writer independently repeats identity checks,
 * performs a pre-mutation drift GET and requires field-level GET readback.
 * No creates, no dates, no assignments, no Calendar writes.
 */
function tmv3_taskFirstProductionCycle_() {
  const policy = tmv3_operationPolicy_();
  if (!tmv3_operationWritesEnabled_('taskfirstproduction')) {
    return {status:'TASK_FIRST_PRODUCTION_GATED',writes:0};
  }

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return {status:'LOCK_BUSY',writes:0};

  try {
    const props = PropertiesService.getScriptProperties();
    const lastKey = 'TMV3_TASK_FIRST_PRODUCTION_LAST_ATTEMPT_MS';
    const cursorKey = 'TMV3_TASK_FIRST_PRODUCTION_CURSOR';
    const last = Number(props.getProperty(lastKey) || 0);
    const now = Date.now();
    const interval = Math.max(60,
      Number(policy.taskFirstProductionIntervalMinutes || 60)) * 60000;
    if (last && now - last < interval) {
      return {status:'THROTTLED',writes:0};
    }

    let detailWriteStarted=false;
    // The existing native timer owns both lanes and their shared one-hour budget.
    // Calendar-backed existing Tasks get full safe details; unscheduled Tasks
    // continue through the relationship-only fallback below.
    function detailActions(plan) {
      return (plan.actions || []).filter(function(action) {
        return ['PATCH_LOCATION','PATCH_ORDER','PATCH_REQUESTED_BY',
          'PATCH_DATES','PATCH_ASSIGNMENTS'].indexOf(action) >= 0;
      });
    }
    function executeDetails(plan, record, guardKey) {
      plan = tmv3_step7ValidateExecutionContract_(plan);
      if (['Service','Delivery'].indexOf(plan.vertical)<0 || !plan.taskId || plan.blocker ||
          (plan.actions || []).some(function(a){return /CREATE|RECREATE/.test(a);})) {
        throw new Error('EXISTING_SERVICE_DELIVERY_DETAILS_ONLY');
      }
      if (!/^[1-9]\d*$/.test(String(plan.expectedOrderId || '')) ||
          !/^[1-9]\d*$/.test(String(plan.expectedLocationId || '')) ||
          !/^[1-9]\d*$/.test(String(plan.expectedRequestedById || '')) ||
          tmv3_norm_(plan.expectedRequestedByType)!=='contact' ||
          !/^\d+$/.test(String(record.orderNumber || ''))) {
        throw new Error('TASK_DETAILS_REQUIRED_RELATIONSHIPS_UNRESOLVED');
      }
      tmv3_taskFirstFreshOrderOwnershipById_(plan.expectedOrderId,
        plan.expectedCustomerId,'SO#'+record.orderNumber);
      tmv3_step7FreshLocationOwnership_(plan);
      const contact=tmv3_getContactById_(plan.expectedRequestedById,plan.expectedCustomerId);
      if (!contact || contact.__ownershipVerified!==true) throw new Error('TASK_DETAILS_CONTACT_OWNERSHIP');
      const beforeRaw=tmv3_rawTaskById_(plan.taskId);
      const before=tmv3_normalizeV2TaskModel_(beforeRaw);
      const requested=tmv3_step7RequestedByFromRaw_(beforeRaw);
      if (String(before['Task ID'])!==String(plan.taskId) ||
          !tmv3_taskIsOpen_(before['Status']) ||
          tmv3_clean_(before['Customer ID'])!==String(plan.expectedCustomerId) ||
          (plan.vertical==='Service' && tmv3_norm_(before['Task Type']).indexOf('service')<0) ||
          (plan.vertical==='Delivery' && tmv3_norm_(before['Task Type']).indexOf('deliver')<0)) {
        throw new Error('TASK_DETAILS_TASK_IDENTITY_CHANGED');
      }
      [['Order ID',plan.expectedOrderId],['Location ID',plan.expectedLocationId]].forEach(function(pair){
        if (tmv3_clean_(before[pair[0]]) && tmv3_clean_(before[pair[0]])!==String(pair[1])) {
          throw new Error('TASK_DETAILS_EXISTING_RELATIONSHIP_CONFLICT');
        }
      });
      if (tmv3_clean_(requested.id) && (tmv3_clean_(requested.id)!==String(plan.expectedRequestedById) ||
          tmv3_norm_(requested.type)!=='contact')) throw new Error('TASK_DETAILS_REQUESTED_BY_CONFLICT');
      const actions=detailActions(plan);
      const scoped=Object.assign({},plan,{actions:actions});
      const payload=tmv3_step7RelationshipPayload_(scoped);
      if (actions.indexOf('PATCH_DATES')>=0) {
        const start=new Date(plan.expectedStart),due=new Date(plan.expectedDue);
        if (!Number.isFinite(start.getTime()) || !Number.isFinite(due.getTime()) || due<=start ||
            !tmv3_sameMinute_(start,record.start) || !tmv3_sameMinute_(due,record.end)) {
          throw new Error('TASK_DETAILS_CALENDAR_DATES_UNVERIFIED');
        }
        Object.assign(payload,tmv3_step7DatePayload_(scoped));
      }
      const desired=tmv3_step7DesiredAssignmentFromContract_(plan);
      const freshRecord=tmv3_findFreshEventRecord_(plan.vertical,plan.eventId);
      if (!record.fingerprint || freshRecord.fingerprint!==record.fingerprint) {
        throw new Error('TASK_DETAILS_CALENDAR_CHANGED_NO_WRITE');
      }
      const assignmentsBefore=tmv3_taskAssignmentsFromRaw_(beforeRaw);
      props.setProperty(guardKey,JSON.stringify({state:'INTENT',taskId:plan.taskId,
        fingerprint:record.fingerprint,at:now}));
      tmv3_taskFirstProductionCycle_.detailContext={vertical:plan.vertical,
        taskId:Number(plan.taskId),payload:payload,desiredAssignment:desired};
      try {
        if (Object.keys(payload).length>1) {detailWriteStarted=true;tmv3_operationPatchTask_(plan.taskId,payload,'SERVICEDELIVERYDETAILS');}
        if (actions.indexOf('PATCH_ASSIGNMENTS')>=0) {
          detailWriteStarted=true;
          tmv3_reconcileTaskAssignments_(record,plan.taskId,'SERVICEDELIVERYDETAILS',{desiredAssignment:desired});
        }
        const afterRaw=tmv3_rawTaskById_(plan.taskId);
        const after=tmv3_normalizeV2TaskModel_(afterRaw);
        const assignmentsAfter=tmv3_taskAssignmentsFromRaw_(afterRaw);
        if (String(after['Task ID'])!==String(plan.taskId) ||
            tmv3_clean_(after['Customer ID'])!==String(plan.expectedCustomerId) ||
            after['Task Type']!==before['Task Type'] || after['Status']!==before['Status'] ||
            after['Name']!==before['Name'] ||
            JSON.stringify(afterRaw.description || afterRaw.Description || '')!==
              JSON.stringify(beforeRaw.description || beforeRaw.Description || '') ||
            !assignmentsBefore.filter(function(a){return !(a.type==='pool' && Number(a.id)===4 && desired.employeeIds.length);})
              .every(function(a){return assignmentsAfter.some(function(b){return a.type===b.type && Number(a.id)===Number(b.id);});})) {
          throw new Error('TASK_DETAILS_UNRELATED_FIELDS_READBACK_MISMATCH');
        }
        const afterPlan=tmv3_step7FreshExecutionContract_(plan.vertical,plan.eventId,plan.taskId);
        if (afterPlan.blocker || detailActions(afterPlan).length ||
            String(afterPlan.expectedOrderId)!==String(plan.expectedOrderId) ||
            String(afterPlan.expectedLocationId)!==String(plan.expectedLocationId) ||
            String(afterPlan.expectedRequestedById)!==String(plan.expectedRequestedById) ||
            String(afterPlan.expectedStart)!==String(plan.expectedStart) ||
            String(afterPlan.expectedDue)!==String(plan.expectedDue)) {
          throw new Error('TASK_DETAILS_FRESH_PLAN_READBACK_NOT_VERIFIED');
        }
        props.setProperty(guardKey,JSON.stringify({state:'VERIFIED',taskId:plan.taskId,
          fingerprint:record.fingerprint,at:Date.now()}));
        tmv3_upsertTaskCacheRow_(after);
        return {status:'TASK_DETAILS_PATCHED_AND_VERIFIED',taskId:plan.taskId,
          vertical:plan.vertical,eventId:plan.eventId,actions:actions,writes:1,readbackVerified:true};
      } finally {delete tmv3_taskFirstProductionCycle_.detailContext;}
    }
    function detailCycle() {
    const eventQueues=['Service','Delivery'].map(function(vertical){
      const cfg=TMV3.VERTICALS && TMV3.VERTICALS[vertical];
      return cfg ? tmv3_rows_(cfg.sheet).filter(function(row){return !!tmv3_clean_(row['Event ID']);})
        .map(function(row){return {vertical:vertical,eventId:tmv3_clean_(row['Event ID'])};}) : [];
    });
    const detailEvents=[],seenEvents={};
    for(let q=0;q<Math.max(eventQueues[0].length,eventQueues[1].length);q++) {
      eventQueues.forEach(function(queue){
        const event=queue[q];if(!event)return;
        const key=event.vertical+'|'+event.eventId;
        if(!seenEvents[key]){seenEvents[key]=true;detailEvents.push(event);}
      });
    }
    const detailCursorKey='TMV3_SD_DETAILS_EVENT_CURSOR';
    let detailCursor=Number(props.getProperty(detailCursorKey)||0);
    if(!Number.isSafeInteger(detailCursor)||detailCursor<0)detailCursor=0;
    for(let j=0;j<Math.min(4,detailEvents.length);j++) {
      const item=detailEvents[(detailCursor+j)%detailEvents.length];
      props.setProperty(detailCursorKey,String((detailCursor+j+1)%detailEvents.length));
      try {
        const record=tmv3_findFreshEventRecord_(item.vertical,item.eventId);
        if(String(record.orderNumber)==='586061')continue;
        const plans=tmv3_step7FreshPlansForEvent_(item.vertical,item.eventId);
        for(let k=0;k<plans.length;k++) {
          const plan=plans[k];
          if(!plan.taskId || plan.blocker || (plan.actions||[]).some(function(a){return /CREATE|RECREATE/.test(a);}))continue;
          const guardKey='TMV3_SD_DETAILS_'+tmv3_hash_(item.vertical+'|'+item.eventId+'|'+plan.taskId);
          const guard=JSON.parse(props.getProperty(guardKey)||'null');
          if(!detailActions(plan).length) {
            if(guard && guard.state==='INTENT')props.setProperty(guardKey,JSON.stringify({state:'VERIFIED_AFTER_RECONCILIATION',taskId:plan.taskId,at:now}));
            continue;
          }
          if(guard && guard.state==='INTENT') {
            tmv3_audit_(item.vertical,item.eventId,String(plan.taskId),'TASK_DETAILS_AUTO','REVIEW','UNCERTAIN_PRIOR_WRITE_RECONCILE_BEFORE_RETRY');
            continue;
          }
          props.setProperty(lastKey,String(now));
          const result=executeDetails(plan,record,guardKey);
          tmv3_audit_(item.vertical,item.eventId,String(plan.taskId),'TASK_DETAILS_AUTO','PASS',JSON.stringify(result));
          return result;
        }
      } catch(err) {
        tmv3_audit_(item.vertical,item.eventId,'','TASK_DETAILS_AUTO',detailWriteStarted?'ATTENTION':'REVIEW',String(err && err.message || err));
        // Once an event transaction was reserved, do not spend another write slot.
        if(Number(props.getProperty(lastKey)||0)===now)return {status:'TASK_DETAILS_ATTENTION',writes:detailWriteStarted?null:0,requiresReadback:detailWriteStarted};
      }
    }

      return null;
    }

    // Read cached business anchors at zero Striven API cost.
    const orderMap = {};
    tmv3_rows_(TMV3.SHEETS.ORDERS).forEach(function(row) {
      const number = tmv3_clean_(row['Order Number']);
      const id = tmv3_clean_(row['Order ID']);
      if (!number || !/^[1-9]\d*$/.test(id)) return;
      if (!orderMap[number]) orderMap[number] = [];
      orderMap[number].push(row);
    });
    const candidates = tmv3_rows_(TMV3.SHEETS.TASKS)
      .filter(function(row) {
        const type = tmv3_norm_(row['Task Type']);
        const status = tmv3_norm_(row['Status']);
        return status === 'open' &&
          (type.indexOf('service') !== -1 || type.indexOf('delivery') !== -1) &&
          // SO 586061 / 27795 was explicitly identified as canceled by the operator.
          !/\bSO\s*#\s*586061\b/i.test(tmv3_clean_(row['Name'])) &&
          Number.isSafeInteger(Number(row['Task ID'])) && Number(row['Task ID']) > 0 &&
          (!tmv3_clean_(row['Order ID']) || !tmv3_clean_(row['Contact ID'])) &&
          /\bSO\s*#\s*\d{4,9}\b/i.test(tmv3_clean_(row['Name']));
      })
      .sort(function(a,b) {
        return Number(b['Task ID'] || 0)-Number(a['Task ID'] || 0);
      });
    const unlinked=candidates.filter(function(row){return !tmv3_clean_(row['Order ID']);});
    if (unlinked.length) candidates.splice(0,candidates.length,...unlinked);
    else {const details=detailCycle();if(details)return details;}
    if (!candidates.length) {
      props.setProperty(lastKey,String(now));
      return {status:'NO_CACHED_CANDIDATES',writes:0};
    }
    let cursor = Number(props.getProperty(cursorKey) || 0);
    if (!Number.isSafeInteger(cursor) || cursor < 0) cursor = 0;
    cursor = cursor % candidates.length;
    const source = candidates[cursor];
    props.setProperty(cursorKey,String((cursor + 1) % candidates.length));
    // Throttle even after failure; repeated exceptions must not burn API calls.
    props.setProperty(lastKey,String(now));

    const taskId = Number(source['Task ID']);
    const title = tmv3_clean_(source['Name']);
    const titleOrder = tmv3_taskFirstTitleOrderNumber_(title);
    if (titleOrder.status !== 'UNIQUE') {
      tmv3_audit_('SYSTEM','',String(taskId),'TASK_FIRST_AUTO','REVIEW','TASK_TITLE_SO_'+titleOrder.status);
      return {status:'REVIEW_TASK_TITLE_SO',taskId:taskId,writes:0};
    }
    const vertical = tmv3_norm_(source['Task Type']).indexOf('delivery') !== -1
      ? 'Delivery' : 'Service';
    const match = (orderMap[titleOrder.number] || []).filter(function(order) {
      return tmv3_step3OrderMatchesVertical_(order, vertical);
    }).filter(function(order,index,all){return all.findIndex(function(other){
      return tmv3_clean_(other['Order ID'])===tmv3_clean_(order['Order ID']);
    })===index;});
    if (match.length !== 1) {
      const reason = match.length ? 'AMBIGUOUS_WORK_ORDER' : 'WORK_ORDER_NOT_IN_CACHE';
      tmv3_audit_(vertical,'',String(taskId),'TASK_FIRST_AUTO','REVIEW',reason);
      return {status:'REVIEW',taskId:taskId,reason:reason,writes:0};
    }

    let repairStarted = false;
    try {
      const live = tmv3_rawTaskById_(taskId);
      const normalized = tmv3_normalizeV2TaskModel_(live);
      const liveCustomerId = tmv3_clean_(normalized['Customer ID']);
      const liveOrderId = tmv3_clean_(normalized['Order ID']);
      const liveType = tmv3_norm_(normalized['Task Type']);
      if (tmv3_clean_(normalized['Task ID']) !== String(taskId) ||
          (vertical === 'Service' && liveType.indexOf('service') < 0) ||
          (vertical === 'Delivery' && liveType.indexOf('deliver') < 0) ||
          !tmv3_taskIsOpen_(normalized['Status']) ||
          !/^[1-9]\d*$/.test(liveCustomerId)) {
        return {status:'REVIEW_TASK_STATUS_OR_CUSTOMER',taskId:taskId,writes:0};
      }
      const freshTitleOrder=tmv3_taskFirstTitleOrderNumber_(normalized['Name']);
      if (freshTitleOrder.status!=='UNIQUE' || freshTitleOrder.number!==titleOrder.number) {
        return {status:'REVIEW_TASK_TITLE_CHANGED',taskId:taskId,writes:0};
      }
      // Persist the fresh GET locally so report omissions do not cause
      // repeated per-task reads on already-correct relationships.
      tmv3_upsertTaskCacheRow_(normalized);

      // A live relationship that appeared since cache refresh takes priority.
      if (liveOrderId && liveOrderId !== tmv3_clean_(match[0]['Order ID'])) {
        return {status:'REVIEW_EXISTING_ORDER_CONFLICT',taskId:taskId,writes:0};
      }

      // Work Order identity must be independently proven from Striven, never
      // inferred solely from the task name or stale Source Orders cache.
      const id = Number(match[0]['Order ID']);
      let proof;
      try {
        proof = tmv3_taskFirstFreshOrderOwnershipById_(id,liveCustomerId,normalized['Name']);
      } catch (err) {
        const reason = String(err && err.message || err);
        tmv3_audit_(vertical,'',String(taskId),'TASK_FIRST_AUTO','REVIEW',reason);
        return {status:'REVIEW_ORDER_NOT_VERIFIED_ACTIVE',taskId:taskId,writes:0,reason:reason,requiresReadback:false,writeOutcome:'NOT_ATTEMPTED'};
      }
      const contactId = proof.contactId;
      // Missing/conflicting Contact remains REVIEW in the guarded writer;
      // it must not prevent an independently safe Order relationship repair.

      // Keep an existing location; do not invent or update location fields.
      repairStarted = true;
      const result = tmv3_repairExistingTaskRelationships(
        taskId,vertical,
        {customerId:liveCustomerId,orderId:String(id),
          contactId:contactId,locationId:''},
        'TASK_FIRST_PRODUCTION'
      );
      tmv3_audit_(vertical,'',String(taskId),'TASK_FIRST_AUTO',
        (result.status === 'PATCHED_AND_VERIFIED' || result.status === 'NO_CHANGE_VERIFIED')
          ? 'PASS' : 'REVIEW',JSON.stringify(result));
      return result;
    } catch(err) {
      const message = String(err && err.message || err);
      tmv3_audit_(vertical,'',String(taskId),'TASK_FIRST_AUTO','ATTENTION',message);
      return {
        status:'ATTENTION',taskId:taskId,error:message,
        writes:repairStarted ? null : 0,
        writeOutcome:repairStarted ? 'UNKNOWN_RECONCILE_BEFORE_RETRY' : 'NOT_ATTEMPTED',
        requiresReadback:repairStarted
      };
    }
  } finally {
    lock.releaseLock();
  }
}

function tmv3_scheduledOperations() {
  const preInspection = tmv3_preInspectionAutomationCycle_({reason:'SCHEDULED_OPERATIONS'});
  // Relationship-first is independent from the Stage-7 Calendar gate.
  const taskFirst = tmv3_taskFirstProductionCycle_();
  tmv3_reconcilePreInspectionSharedGuest_AUTO_({
    reason:'SCHEDULED_OPERATIONS'
  });

  if (tmv3_executionStage_() < 7) {
    return {
      taskFirst:taskFirst,preInspection:preInspection,
      stage:tmv3_executionStage_(),
      mapped:tmv3_calendarStageRefresh_(
        'SCHEDULED_CALENDAR_STAGE_REFRESH'
      ),
      writes:{ status:'CALENDAR_STAGE_GATED', writes:0 }
    };
  }

  if (tmv3_executionStage_() === 7) {
    return Object.assign(
      {taskFirst:taskFirst,preInspection:preInspection},
      tmv3_stage7AutomaticCanaryCycle_('SCHEDULED_CALENDAR_STAGE_REFRESH')
    );
  }

  return Object.assign(
    {taskFirst:taskFirst,preInspection:preInspection},
    tmv3_runProductionAutomationCycle_('SCHEDULED_OPERATIONS',{
      maxSourceAgeMinutes:30,forceSourceRefresh:false
    })
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
  const preInspection = tmv3_preInspectionAutomationCycle_({reason:'CALENDAR_EVENT_UPDATED'});
  const guestSync =
    tmv3_reconcilePreInspectionSharedGuest_AUTO_({
      reason:'CALENDAR_EVENT_UPDATED'
    });

  const lock = LockService.getScriptLock();
  const cache = CacheService.getScriptCache();
  const dirtyKey = 'TMV3_CALENDAR_EVENT_UPDATE_DIRTY';

  if (!lock.tryLock(1000)) {
    try { cache.put(dirtyKey, '1', 300); } catch (ignored) {}
    return { status:'QUEUED_BEHIND_ACTIVE_REFRESH' };
  }

  try {
    try { cache.remove(dirtyKey); } catch (ignored) {}

    const currentStage = tmv3_executionStage_();
    const first =
      currentStage < 7
        ? tmv3_calendarStageRefresh_('CALENDAR_EVENT_UPDATED')
        : (
            currentStage === 7
              ? tmv3_stage7AutomaticCanaryCycle_(
                  'CALENDAR_EVENT_UPDATED'
                )
              : tmv3_runProductionAutomationCycle_(
                  'CALENDAR_EVENT_UPDATED',
                  {
                    maxSourceAgeMinutes:15,
                    forceSourceRefresh:false
                  }
                )
          );

    let rerun = null;

    if (cache.get(dirtyKey)) {
      try { cache.remove(dirtyKey); } catch (ignored) {}

      rerun =
        currentStage < 7
          ? tmv3_calendarStageRefresh_(
              'CALENDAR_EVENT_UPDATED_RERUN'
            )
          : (
              currentStage === 7
                ? tmv3_stage7AutomaticCanaryCycle_(
                    'CALENDAR_EVENT_UPDATED_RERUN'
                  )
                : tmv3_runProductionAutomationCycle_(
                    'CALENDAR_EVENT_UPDATED_RERUN',
                    {
                      maxSourceAgeMinutes:15,
                      forceSourceRefresh:false
                    }
                  )
            );
    }

    return {
      status:rerun ? 'REFRESHED_AND_RERUN' : 'REFRESHED',
      first:first,
      rerun:rerun,
      guestSync:guestSync,
      preInspection:preInspection,
      writes:
        (rerun && rerun.writes) ||
        (first && first.writes) ||
        { status:'NO_WRITE_RESULT', writes:0 }
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


/** Google Apps Script: bounded PreInspection lane. Other verticals stay gated. */
function tmv3_preInspectionExplicitCandidate_(record) {
  return !!record && !tmv3_step2PreInspectionNonCustomer_(record) &&
    /\bpre[\s-]*inspect(?:ion)?\b/i.test([record.title || '',
      record.descriptionClean || record.rawDescription || ''].join(' '));
}

function tmv3_preInspectionIntakeRecords_() {
  const cfg = TMV3.VERTICALS.PreInspection;
  const calendars = tmv3_verticalCalendars_('PreInspection',cfg).concat(
    (cfg.secondaryCalendarIds || []).map(function(id) {
      return {calendarId:id,calendarName:'Stephen',role:'SECONDARY_STEPHEN'};
    })
  );
  const start = new Date(); start.setHours(0,0,0,0);
  const end = new Date(start); end.setDate(end.getDate() + Number(cfg.lookaheadDays || 365));
  const records = [];
  calendars.forEach(function(source) {
    const cal = CalendarApp.getCalendarById(source.calendarId);
    if (!cal) throw new Error('PreInspection source calendar unavailable: ' + source.calendarId);
    cal.getEvents(start,end).forEach(function(event) {
      const record = tmv3_calendarEvent_('PreInspection',cfg,source,event,
        {applyEligibility:false});
      if (!record || tmv3_step2PreInspectionNonCustomer_(record)) return;
      if (source.role === 'SECONDARY_STEPHEN' && !tmv3_preInspectionExplicitCandidate_(record)) return;
      records.push(record);
    });
  });
  const seen = {};
  return records.filter(function(record) {
    // CF source is visited first. Guest mirrors keep the same iCal UID.
    const key = record.eventId + '|' + tmv3_iso_(record.start);
    if (seen[key]) return false;
    seen[key] = true;
    return true;
  }).sort(function(a,b) { return new Date(a.start)-new Date(b.start); });
}

function tmv3_preInspectionPromoteCandidate_(record) {
  if (record.calendarRole !== 'SECONDARY_STEPHEN') return {status:'PRIMARY',record:record};
  if (!tmv3_preInspectionExplicitCandidate_(record)) throw new Error('NOT_EXPLICIT_PREINSPECTION');
  if (!tmv3_preInspectionCreatorEmail_(record)) throw new Error('CREATOR_MISSING_OR_AMBIGUOUS_NO_INTAKE_WRITE');
  tmv3_assertOperationWrite_('PREINSPECTIONAUTO','PREINSPECTION_INTAKE');
  const cfg = TMV3.VERTICALS.PreInspection;
  const primary = CalendarApp.getCalendarById(cfg.primaryCalendarId);
  if (!primary) throw new Error('CF Preinspects unavailable.');
  const existing = tmv3_findCalendarEventById_(cfg.primaryCalendarId,record.eventId);
  if (existing && existing.event) return {status:'PRIMARY',record:
    tmv3_calendarEvent_('PreInspection',cfg,tmv3_verticalCalendars_('PreInspection',cfg)[0],existing.event)};
  const duplicates = primary.getEvents(new Date(record.start),new Date(record.end)).filter(function(event) {
    return event.getId() !== record.eventId &&
      event.getStartTime().getTime() === new Date(record.start).getTime() &&
      event.getEndTime().getTime() === new Date(record.end).getTime() &&
      tmv3_phone10_(tmv3_extractPhone_(event.getTitle())) === tmv3_phone10_(record.phone) &&
      !!tmv3_phone10_(record.phone) && tmv3_norm_(event.getLocation()) === tmv3_norm_(record.location);
  });
  if (duplicates.length) throw new Error('POSSIBLE_DUPLICATE_CF_EVENT_NO_INTAKE_WRITE');
  const source = tmv3_findCalendarEventById_(record.calendarId,record.eventId);
  if (!source || !source.event) throw new Error('Stephen source event disappeared.');
  const guests = source.event.getGuestList(true).map(function(g) {return tmv3_normEmail_(g.getEmail());});
  [cfg.primaryCalendarId,cfg.secondaryOwnerEmail].forEach(function(email) {
    if (guests.indexOf(tmv3_normEmail_(email)) < 0) source.event.addGuest(email);
  });
  const after = source.event.getGuestList(true).map(function(g) {return tmv3_normEmail_(g.getEmail());});
  if (after.indexOf(tmv3_normEmail_(cfg.primaryCalendarId)) < 0 ||
      after.indexOf(tmv3_normEmail_(cfg.secondaryOwnerEmail)) < 0) throw new Error('INTAKE_GUEST_READBACK_FAILED');
  // Calendar propagation is asynchronous; no task writes until CF copy exists.
  const promoted = tmv3_findCalendarEventById_(cfg.primaryCalendarId,record.eventId);
  return promoted && promoted.event ? {status:'PRIMARY',record:
    tmv3_calendarEvent_('PreInspection',cfg,tmv3_verticalCalendars_('PreInspection',cfg)[0],promoted.event)}
    : {status:'WAITING_FOR_CF_COPY',record:record};
}

// Toronto wall-clock dates keep business-day deadlines stable across DST.
function tmv3_preInspectionNotificationDateParts_(value) {
  const date=new Date(value);
  if (!isFinite(date.getTime())) return null;
  const text=Utilities.formatDate(date,'America/Toronto','yyyy-MM-dd HH:mm:ss');
  const day=text.slice(0,10);
  const utc=new Date(day+'T12:00:00Z');
  return {text:text,day:day,weekday:utc.getUTCDay(),utc:utc};
}
function tmv3_preInspectionNotificationWeek_(parts) {
  const day=new Date(parts.utc.getTime());
  day.setUTCDate(day.getUTCDate()-((day.getUTCDay()+6)%7));
  return day.toISOString().slice(0,10);
}
function tmv3_preInspectionNotificationDecision_(record,state,nowValue) {
  const now=new Date(nowValue || Date.now());
  const start=new Date(record.start);
  if (!isFinite(start.getTime())) return {status:'EVENT_START_UNKNOWN',send:false};
  if (record.status==='cancelled' || now.getTime()>=start.getTime()) return {status:'APPOINTMENT_ENDED',send:false};
  if (state && state.status!=='SENT') return {status:'UNCERTAIN_SEND_NO_RETRY',send:false};
  const today=tmv3_preInspectionNotificationDateParts_(now);
  if (today.weekday===0 || today.weekday===6) return {status:'WEEKEND_DEFERRED',send:false};
  if (state) {
    const last=new Date(state.lastSentAt);
    if (!isFinite(last.getTime())) return {status:'SEND_TIME_UNKNOWN_NO_RETRY',send:false};
    if (now.getTime()-last.getTime()<86400000 ||
        today.day===tmv3_preInspectionNotificationDateParts_(last).day) return {status:'ALREADY_SENT',send:false};
    return {status:'FOLLOW_UP_DUE',send:true,followupNumber:Number(state.sentCount || 1)};
  }
  const created=tmv3_preInspectionNotificationDateParts_(record.calendarCreatedAt);
  if (!created) return {status:'EVENT_CREATION_TIME_UNKNOWN',send:false};
  const appointment=tmv3_preInspectionNotificationDateParts_(start);
  if (tmv3_preInspectionNotificationWeek_(created)===tmv3_preInspectionNotificationWeek_(appointment)) {
    return {status:'SAME_WEEK_DUE',send:true,followupNumber:0};
  }
  const due=new Date(created.utc.getTime());let remaining=2;
  while (remaining) {due.setUTCDate(due.getUTCDate()+1);if(due.getUTCDay()!==0 && due.getUTCDay()!==6) remaining--;}
  const eligibleAt=due.toISOString().slice(0,10)+created.text.slice(10);
  return today.text>=eligibleAt ? {status:'FIRST_DUE',send:true,followupNumber:0} :
    {status:'GRACE_PERIOD',send:false,eligibleAt:eligibleAt,timezone:'America/Toronto'};
}
function tmv3_preInspectionSendMissingDetails_(record) {
  const assessment=tmv3_preInspectionMissingDetailAssessment_(record);
  if (!assessment.shouldNotify) return {status:'NO_MISSING_DETAILS',sent:0};
  if (TMV3.MODE!=='PRODUCTION_WRITE' || TMV3.OPERATIONS.preInspectionMissingDetailEmailsEnabled!==true) return {status:'DELIVERY_GATED',sent:0};
  const props=PropertiesService.getScriptProperties();
  const key='TMV3_PI_NOTIFICATION_'+tmv3_hash_(record.eventId);
  const prior=props.getProperty(key);let state=null;
  // Old SENT markers lack timestamps. Start a conservative 24-hour waiting
  // period at migration instead of resending all historic notifications.
  if (prior==='SENT') {
    state={status:'SENT',sentCount:1,lastSentAt:new Date().toISOString(),migrated:true};
    props.setProperty(key,JSON.stringify(state));
    return {status:'ALREADY_SENT',sent:0};
  }
  if (prior) {
    try {state=JSON.parse(prior);} catch(err) {return {status:'UNCERTAIN_SEND_NO_RETRY',sent:0};}
  }
  const decision=tmv3_preInspectionNotificationDecision_(record,state);
  if (!decision.send) return Object.assign({sent:0},decision);
  const email=tmv3_preInspectionMissingDetailEmailPreview_(Object.assign({},record,{notificationFollowupNumber:decision.followupNumber}));
  if (!email.recipient) return {status:'CREATOR_MISSING_OR_AMBIGUOUS_NO_SEND',sent:0};
  if (MailApp.getRemainingDailyQuota()<3) return {status:'EMAIL_QUOTA_DEFERRED',sent:0};
  const next={status:'SENDING',sentCount:Number(state && state.sentCount || 0)+1,lastSentAt:new Date().toISOString()};
  props.setProperty(key,JSON.stringify(next));
  MailApp.sendEmail({to:email.recipient,cc:email.cc.join(','),subject:email.subject,
    body:(decision.followupNumber ? 'FOLLOW-UP #'+decision.followupNumber+': ' : '')+'Please update the missing Pre-Inspection details: '+assessment.missing.map(function(x){return x.message;}).join('; '),
    htmlBody:email.htmlBody,name:'Classic Fireplace & BBQ Store'});
  next.status='SENT';props.setProperty(key,JSON.stringify(next));
  tmv3_audit_('PreInspection',record.eventId,'','MISSING_DETAILS_EMAIL','SENT',JSON.stringify({to:email.recipient,followupNumber:decision.followupNumber,missing:assessment.missing}));
  return {status:'SENT',sent:1,to:email.recipient,followupNumber:decision.followupNumber,missing:assessment.missing};
}

function tmv3_preInspectionAutomationCycle_(options) {
  options = options || {};
  if (!tmv3_operationWritesEnabled_('PREINSPECTIONAUTO')) return {status:'PREINSPECTION_GATED',writes:0};
  if (TMV3.OPERATIONS.preInspectionAutomationScheduleHours && options.force !== true) return {status:'SCHEDULE_ONLY',writes:0};
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(options.force === true ? 30000 : 1000)) return {status:'LOCK_BUSY',writes:0};
  const props = PropertiesService.getScriptProperties();
  const result = {status:'COMPLETE',processed:0,writes:0,notifications:0,results:[]};
  try {
    const now = Date.now();
    const last = Number(props.getProperty('TMV3_PI_LAST_CYCLE') || 0);
    if (options.force !== true && now-last < Math.max(1,Number(TMV3.OPERATIONS.preInspectionAutomationIntervalMinutes || 5))*60000) {
      return {status:'THROTTLED',writes:0};
    }
    props.setProperty('TMV3_PI_LAST_CYCLE',String(now));
    // Reuse the cache-age gates and last-good source policy; refresh failure
    // stops this cycle before task creation or misleading missing-data emails.
    tmv3_refreshOperationalSourcesIfNeeded_(120,false);
    result.classification=tmv3_preInspectionClassificationCycle_();
    const records = tmv3_preInspectionIntakeRecords_();
    let pending = JSON.parse(props.getProperty('TMV3_PI_PENDING_EVENTS') || '[]');
    pending.forEach(function(id) {
      if (records.some(function(r) {return r.eventId===id;})) return;
      try {records.push(tmv3_preInspectionRecoveryRecord_(id));}
      catch(err) {tmv3_audit_('PreInspection',id,'','PREINSPECTION_RECOVERY','ATTENTION',String(err));}
    });
    const scopeEventId = tmv3_clean_(TMV3.OPERATIONS.preInspectionAutomationCanaryEventId || options.eventId);
    const selected = scopeEventId ? records.filter(function(r){return r.eventId===scopeEventId;}) : records;
    // Check notification deadlines for every authoritative event each slot;
    // the bounded task-write cursor must not delay due reminders.
    selected.filter(function(r){return r.calendarRole==='PRIMARY_SHARED';}).forEach(function(r){
      try {const notice=tmv3_preInspectionSendMissingDetails_(r);result.notifications+=Number(notice.sent || 0);}
      catch(err) {result.status='ATTENTION';tmv3_preInspectionFailureAlert_(r.eventId,String(err));}
    });
    let cursor = Number(props.getProperty('TMV3_PI_CURSOR') || 0);
    const cap = Math.max(1,Math.min(3,Number(TMV3.OPERATIONS.preInspectionAutomationMaxEventsPerRun || 3)));
    if (selected.length) cursor = cursor % selected.length;
    for (let i=0;i<Math.min(cap,selected.length);i++) {
      let record = selected[(cursor+i)%selected.length];
      const one = {eventId:record.eventId};
      result.processed++;
      try {
        const preservation=tmv3_restorePreInspectionLegacyTitle_(record);
        if (preservation.writes) record=tmv3_preInspectionRecoveryRecord_(record.eventId);
        const doneKey='TMV3_PI_DONE_'+tmv3_hash_(record.eventId);
        const done=JSON.parse(props.getProperty(doneKey) || 'null');
        if (!options.eventId && done && done.fingerprint===record.fingerprint && now-Number(done.at || 0)<3600000) {
          one.status='VERIFIED_UNCHANGED_CACHE';result.results.push(one);continue;
        }
        const intake = tmv3_preInspectionPromoteCandidate_(record);
        one.intake = intake.status;
        record = intake.record;
        if (intake.status !== 'PRIMARY') {
          if (pending.indexOf(record.eventId)<0) pending.push(record.eventId);
          // Wait until authoritative intake and matching have been attempted.
          one.notification = {status:'WAITING_FOR_INTAKE',sent:0};
        } else {
          let plans = tmv3_step7FreshPlansForEvent_('PreInspection',record.eventId);
          if (plans.length === 1 && !plans[0].blocker && (plans[0].actions || []).some(function(a) {
            return a===TMV3_STEP7_ACTION.CREATE_TASK || a===TMV3_STEP7_ACTION.RECREATE_TASK;
          })) {
            plans = tmv3_preInspectionFreshHistoryBeforeCreate_(record,plans[0]);
          }
          if (plans.length !== 1) throw new Error('MULTIPLE_CANONICAL_PLANS_NO_WRITE');
          const plan = plans[0];
          one.plan=plan.plan;one.blocker=plan.blocker || '';one.taskId=plan.taskId || '';
          if (!plan.blocker && plan.actions.length && result.writes<1) {
            // One event transaction per run, using the existing fresh ownership,
            // lifecycle, durable create guards and field-level readbacks.
            result.writes++;
            one.execution = tmv3_executeFreshStep7Selection_({previousPlan:plan.plan,contract:plan},'PREINSPECTIONAUTO','ALL');
            if (!/VERIFIED|CONVERGED|NO_CHANGE/.test(String(one.execution.status || ''))) {
              throw new Error('PREINSPECTION_RECONCILIATION_NOT_VERIFIED: '+one.execution.status);
            }
          }
          const fresh = tmv3_findFreshEventRecord_('PreInspection',record.eventId);
          one.notification = tmv3_preInspectionSendMissingDetails_(fresh);
          if (/CREATOR_MISSING|UNCERTAIN_SEND/.test(one.notification.status || '')) {
            result.status='ATTENTION';
            tmv3_preInspectionFailureAlert_(record.eventId,one.notification.status);
          }
          const after = tmv3_step7FreshPlansForEvent_('PreInspection',record.eventId);
          one.afterPlans=after.map(function(p){return {plan:p.plan,blocker:p.blocker,taskId:p.taskId,actions:p.actions};});
          const complete = after.length===1 && !after[0].blocker && !after[0].actions.length;
          if (complete) {
            pending=pending.filter(function(id){return id!==record.eventId;});
            props.setProperty(doneKey,JSON.stringify({fingerprint:fresh.fingerprint,at:Date.now()}));
          }
          else if (pending.indexOf(record.eventId)<0) pending.push(record.eventId);
        }
        result.notifications += Number(one.notification && one.notification.sent || 0);
      } catch(err) {
        one.status='ATTENTION';one.error=String(err && err.message || err);result.status='ATTENTION';
        if (pending.indexOf(record.eventId)<0) pending.push(record.eventId);
        tmv3_audit_('PreInspection',record.eventId,'','PREINSPECTIONAUTO','ATTENTION',one.error);
        tmv3_preInspectionFailureAlert_(record.eventId,one.error);
      }
      result.results.push(one);
    }
    if (!options.eventId && selected.length) props.setProperty('TMV3_PI_CURSOR',String((cursor+result.processed)%selected.length));
    props.setProperty('TMV3_PI_PENDING_EVENTS',JSON.stringify(pending));
    props.setProperty('TMV3_PI_LAST_RESULT',JSON.stringify({status:result.status,
      processed:result.processed,writes:result.writes,notifications:result.notifications,
      events:result.results.map(function(x){return {eventId:x.eventId,status:x.status || x.plan || x.intake,
        taskId:x.taskId,error:String(x.error || '').slice(0,500)};})}));
    return result;
  } catch(err) {
    result.status='ATTENTION';result.error=String(err && err.message || err);
    tmv3_audit_('PreInspection','','','PREINSPECTION_CYCLE','ATTENTION',result.error);
    tmv3_preInspectionFailureAlert_('',result.error);
    return result;
  } finally {lock.releaseLock();}
}

function tmv3_runPreInspectionAutomation() {
  const result=tmv3_preInspectionAutomationCycle_({force:true,reason:'MANUAL_KICK'});
  Logger.log(JSON.stringify(result));return result;
}

function tmv3_verifyPreInspectionAutomation(eventId) {
  const records=tmv3_preInspectionIntakeRecords_().filter(function(r){return !eventId || r.eventId===eventId;});
  if (eventId && !records.length) records.push(tmv3_preInspectionRecoveryRecord_(eventId));
  return {status:'READ_ONLY_VERIFICATION',version:TMV3.VERSION,
    automationEnabled:TMV3.OPERATIONS.preInspectionAutomationEnabled,
    emailEnabled:TMV3.OPERATIONS.preInspectionMissingDetailEmailsEnabled,
    triggers:tmv3_listTriggers(),records:records.map(function(record){
      let diagnostics=null;
      if (record.calendarRole==='PRIMARY_SHARED') {
        const s2=tmv3_step2CalendarRecords_([record]);
        const s3=tmv3_step3BusinessAnchorRecords_(s2,tmv3_step3AnchorIndex_());
        const s4=tmv3_step4IdentityRecords_(s3,tmv3_step4IdentityIndex_());
        diagnostics=s4.map(function(r){return {step2:r.step2,step3:r.step3,step4:r.step4};});
      }
      return {eventId:record.eventId,title:record.title,source:record.calendarRole,
        creator:tmv3_preInspectionCreatorEmail_(record),location:record.location,
        calendarCreatedAt:record.calendarCreatedAt,firstNotificationTiming:tmv3_preInspectionNotificationDecision_(record,null),
        diagnostics:diagnostics,
        notification:tmv3_preInspectionMissingDetailEmailPreview_(record),
        plans:record.calendarRole==='PRIMARY_SHARED' ? tmv3_step7FreshPlansForEvent_('PreInspection',record.eventId) : [],
        intake:record.calendarRole==='SECONDARY_STEPHEN' ? 'PROMOTE_EXPLICIT_PREINSPECTION' : 'PRIMARY'};
    })};
}

function tmv3_preInspectionScheduledCycle() {
  return {status:'RETIRED_FIVE_MINUTE_SCHEDULE',writes:0};
}
function tmv3_preInspectionCheck0800() { return tmv3_runPreInspectionDailySlot_('08:00'); }
function tmv3_preInspectionCheck1300() { return tmv3_runPreInspectionDailySlot_('13:00'); }
function tmv3_preInspectionCheck1700() { return tmv3_runPreInspectionDailySlot_('17:00'); }
function tmv3_runPreInspectionDailySlot_(slot) {
  const result=tmv3_preInspectionAutomationCycle_({force:true,reason:'DAILY_SLOT_'+slot});
  Logger.log(JSON.stringify(result));return result;
}
function tmv3_installPreInspectionAutomationTrigger() {
  const hours=TMV3.OPERATIONS.preInspectionAutomationScheduleHours || [8,13,17];
  const timezone=TMV3.OPERATIONS.preInspectionAutomationScheduleTimezone || 'America/Toronto';
  const handlers=['tmv3_preInspectionCheck0800','tmv3_preInspectionCheck1300','tmv3_preInspectionCheck1700'];
  const retired=['tmv3_preInspectionScheduledCycle'].concat(handlers);
  ScriptApp.getProjectTriggers().forEach(function(t){
    if (retired.indexOf(t.getHandlerFunction())!==-1) ScriptApp.deleteTrigger(t);
  });
  handlers.forEach(function(handler,index){
    ScriptApp.newTrigger(handler).timeBased().atHour(hours[index]).nearMinute(0).everyDays(1).inTimezone(timezone).create();
  });
  const result=tmv3_listTriggers();
  if (result.some(function(t){return t.handler==='tmv3_preInspectionScheduledCycle';}) ||
      handlers.some(function(h){return result.filter(function(t){return t.handler===h;}).length!==1;})) {
    throw new Error('PREINSPECTION_TRIGGER_READBACK_FAILED');
  }
  return {status:'PREINSPECTION_TRIGGERS_VERIFIED',hours:hours,timezone:timezone,triggers:result};
}

function tmv3_preInspectionFreshHistoryBeforeCreate_(record,plan) {
  const customer=tmv3_step4IdentityIndex_().customerById[String(plan.expectedCustomerId)];
  if (!customer) throw new Error('CREATE_CUSTOMER_NOT_IN_VERIFIED_CACHE');
  const ids=tmv3_searchPreInspectionTaskIdsForCustomer_(customer);
  if (ids.length>10) throw new Error('CREATE_HISTORY_API_LIMIT_REVIEW_NO_CREATE');
  ids.forEach(function(id){
    const task=tmv3_getTaskById_(Number(id));
    if (String(task['Task ID'])!==String(id) ||
        String(task['Customer ID'])!==String(plan.expectedCustomerId) ||
        Number(task['Task Type ID'])!==105) throw new Error('CREATE_HISTORY_OWNERSHIP_FAILED_NO_CREATE');
    tmv3_upsertTaskCacheRow_(task);
  });
  // Recompute the same lifecycle gate on fresh complete Customer task history.
  return tmv3_step7FreshPlansForEvent_('PreInspection',record.eventId);
}

function tmv3_preInspectionRecoveryRecord_(eventId) {
  const cfg=TMV3.VERTICALS.PreInspection;
  const sources=tmv3_verticalCalendars_('PreInspection',cfg).concat(
    (cfg.secondaryCalendarIds || []).map(function(id){return {calendarId:id,calendarName:'Stephen',role:'SECONDARY_STEPHEN'};})
  );
  for(let i=0;i<sources.length;i++) {
    const found=tmv3_findCalendarEventById_(sources[i].calendarId,eventId);
    if (!found || !found.event) continue;
    const record=tmv3_calendarEvent_('PreInspection',cfg,sources[i],found.event,{applyEligibility:false});
    if (record && !tmv3_step2PreInspectionNonCustomer_(record) &&
        (sources[i].role==='PRIMARY_SHARED' || tmv3_preInspectionExplicitCandidate_(record))) return record;
  }
  throw new Error('RECOVERY_EVENT_MISSING_OR_NO_LONGER_PREINSPECTION');
}

function tmv3_preInspectionFailureAlert_(eventId,error) {
  if (TMV3.MODE!=='PRODUCTION_WRITE' || TMV3.OPERATIONS.preInspectionFailureAlertsEnabled!==true) return {status:'ALERT_GATED'};
  const day=Utilities.formatDate(new Date(),TMV3_TIMEZONE,'yyyy-MM-dd');
  const key='TMV3_PI_FAILURE_'+tmv3_hash_(day+'|'+eventId+'|'+error);
  const props=PropertiesService.getScriptProperties();
  if (props.getProperty(key)) return {status:'ALREADY_ALERTED'};
  try {
    if (MailApp.getRemainingDailyQuota()<1) return {status:'QUOTA_DEFERRED'};
    props.setProperty(key,'SENDING');
    const esc=tmv3_preInspectionHtmlEscape_;
    MailApp.sendEmail({to:TMV3.OPERATIONS.preInspectionFailureAlertEmail,
      subject:'Pre-Inspection Automation: action required',
      body:'Pre-Inspection automation needs review. Event: '+(eventId || 'Source refresh')+'\n'+error,
      htmlBody:'<p><em>This is an automated email notification from Classic Fireplace &amp; BBQ Store.</em></p>'+
        '<p>Hi Pramodh,</p><p style="color:#B42318;font-weight:700;">Pre-Inspection automation requires review.</p>'+
        '<p>Event: '+esc(eventId || 'Source refresh')+'</p><p>'+esc(error)+'</p>'+
        '<p>The affected action remains queued. Verify any uncertain write before retrying.</p>',
      name:'Classic Fireplace & BBQ Store'});
    props.setProperty(key,'SENT');return {status:'SENT'};
  } catch(err) {
    tmv3_audit_('PreInspection',eventId,'','PREINSPECTION_FAILURE_ALERT','ATTENTION',String(err));
    return {status:'ALERT_UNCERTAIN_NO_RETRY'};
  }
}

// Google Apps Script: restore only the recorded legacy-title prefix. No Task writes.
function tmv3_restorePreInspectionLegacyTitle_(record) {
  tmv3_assertOperationWrite_('PREINSPECTIONAUTO','PRESERVE_LEGACY_TITLE');
  if (!record || record.vertical!=='PreInspection') throw new Error('PreInspection event required.');
  const cfg=TMV3.VERTICALS.PreInspection;
  const state=tmv3_titleMigrationStateForEvent_('PreInspection',record.eventId,cfg.primaryCalendarId);
  const legacy=state.preservedTitle;
  if (!legacy) return {status:'NO_RECORDED_LEGACY_TITLE',eventId:record.eventId,writes:0};
  const copies=tmv3_requiredCalendarCopiesForEvent_(record).map(function(id){
    const found=tmv3_findEventCopyRobust_(id,record.eventId);
    if (!found || !found.event) throw new Error('LEGACY_TITLE_REPAIR_MISSING_COPY: '+id);
    return {calendarId:id,event:found.event};
  });
  let writes=0;
  copies.forEach(function(copy){
    const before=String(copy.event.getDescription() || '');
    const desired=tmv3_preInspectionEnsureLegacyTitle_(before,legacy);
    if (desired!==before) {copy.event.setDescription(desired);writes++;}
    const found=tmv3_findEventCopyRobust_(copy.calendarId,record.eventId);
    if (!found || !found.event || String(found.event.getDescription() || '')!==desired) {
      throw new Error('LEGACY_TITLE_REPAIR_READBACK_FAILED: '+copy.calendarId);
    }
  });
  return {status:'LEGACY_TITLE_VERIFIED',eventId:record.eventId,legacyTitle:legacy,writes:writes};
}

function tmv3_restoreRecordedPreInspectionLegacyTitles() {
  const lock=LockService.getScriptLock();
  if (!lock.tryLock(30000)) return {status:'LOCK_BUSY',writes:0};
  try {
    const states=tmv3_titleMigrationStateIndex_();
    const result={status:'COMPLETE',writes:0,results:[]};
    Object.keys(states).filter(function(key){return key.indexOf('PreInspection|')===0;}).forEach(function(key){
      const id=key.slice('PreInspection|'.length);
      const row=states[key];
      if (!tmv3_clean_(row['Title Migration Map'])) return;
      try {
        const record=tmv3_preInspectionRecoveryRecord_(id);
        const one=tmv3_restorePreInspectionLegacyTitle_(record);
        result.results.push(one);result.writes+=one.writes;
      } catch(err) {result.status='ATTENTION';result.results.push({eventId:id,error:String(err)});}
    });
    Logger.log(JSON.stringify(result));return result;
  } finally {lock.releaseLock();}
}

// Google Apps Script: token-bound PreInspection classification confirmation.
function tmv3_preInspectionPossibleCandidate_(record) {
  if (!record || record.calendarRole!=='SECONDARY_STEPHEN' || record.isAllDay) return false;
  if (tmv3_step2PreInspectionNonCustomer_(record) || tmv3_preInspectionExplicitCandidate_(record)) return false;
  const text=[record.title,record.rawDescription,record.descriptionClean].join(' ');
  if (/\b(installation|delivery|maintenance|warranty|service call|repair appointment)\b/i.test(text)) return false;
  return /\b(fireplace|gas insert|gas stove|gas linear|gas line|valor|stuv\d*|dekko|wood burning)\b/i.test(text) &&
    !!tmv3_preInspectionCreatorEmail_(record);
}
function tmv3_preInspectionClassificationKey_(eventId) {
  return 'TMV3_PI_CLASSIFICATION_'+tmv3_hash_(eventId);
}
function tmv3_preInspectionClassificationCreate_(record,testMode) {
  const props=PropertiesService.getScriptProperties();
  const token=Utilities.getUuid().replace(/-/g,'')+Utilities.getUuid().replace(/-/g,'');
  const key=testMode ? 'TMV3_PI_CLASSIFICATION_TEST_'+tmv3_hash_(token) : tmv3_preInspectionClassificationKey_(record.eventId);
  const state={eventId:record.eventId,calendarId:record.calendarId,recipient:testMode ? 'pramodh@classicfireplace.ca' : tmv3_preInspectionCreatorEmail_(record),
    token:token,status:'PENDING',testMode:testMode===true,createdAt:new Date().toISOString(),
    expiresAt:new Date(Date.now()+30*86400000).toISOString(),sentCount:0,lastSentAt:'',
    title:record.title,location:record.location,start:tmv3_iso_(record.start),end:tmv3_iso_(record.end),
    notes:tmv3_calendarReadableDescription_(record.rawDescription || record.descriptionClean || ''),
    customerNumber:tmv3_clean_(record.customerNumber),orderNumber:tmv3_clean_(record.orderNumber)};
  props.setProperty(key,JSON.stringify(state));
  props.setProperty('TMV3_PI_RESPONSE_'+tmv3_hash_(token),key);
  return state;
}
function tmv3_preInspectionClassificationLoad_(token) {
  if (!/^[a-f0-9]{64}$/i.test(String(token || ''))) throw new Error('Invalid response link.');
  const props=PropertiesService.getScriptProperties();
  const key=props.getProperty('TMV3_PI_RESPONSE_'+tmv3_hash_(token));
  const state=key && JSON.parse(props.getProperty(key) || 'null');
  if (!state || state.token!==token) throw new Error('Response link not found.');
  if (Date.now()>new Date(state.expiresAt).getTime()) throw new Error('This response link has expired.');
  if (Date.now()>=new Date(state.start).getTime()) throw new Error('This appointment has already started.');
  return {key:key,state:state};
}
function tmv3_preInspectionClassificationEmail_(state,url) {
  const escape=tmv3_preInspectionHtmlEscape_;
  if (!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(url || '')) throw new Error('Published confirmation endpoint is not configured.');
  const when=Utilities.formatDate(new Date(state.start),'America/Toronto','MMM d, yyyy h:mm a');
  const label=state.sentCount>0 ? 'FOLLOW-UP #'+state.sentCount+' | ' : '';
  const yes=url+'?action=classify&choice=YES&token='+encodeURIComponent(state.token);
  const no=url+'?action=classify&choice=NO&token='+encodeURIComponent(state.token);
  return {to:state.recipient,subject:(state.testMode?'[TEST] ':'')+label+'CONFIRM PREINSPECTION: '+state.title+' | '+when,
    htmlBody:'<!doctype html><html><body style="background:#f4f3f1;font-family:Arial;color:#222"><table width="100%"><tr><td align="center"><table width="760" style="width:100%;max-width:760px;background:white"><tr><td style="background:#202020;color:white;padding:20px;border-top:4px solid #b42b2f"><h2>'+escape(label)+'Is this a Preinspection?</h2></td></tr><tr><td style="padding:24px"><p><i>This is an automated email notification from Classic Fireplace &amp; BBQ Store.</i></p><p>Hi '+escape(tmv3_preInspectionCreatorFirstName_(state.recipient))+',</p>'+
      (state.testMode ? '<p><strong>TEST MODE: Your response will not change a calendar event or create a task.</strong></p>' : '')+
      '<h3>'+escape(state.title)+'</h3><p><strong>'+escape(when)+'</strong><br>'+escape(state.location || 'Location missing')+'</p><div style="white-space:pre-wrap;background:#f6f5f3;padding:14px">'+escape(state.notes)+'</div><p>This appointment may be a Preinspection. Please confirm its purpose.</p><p><a style="display:inline-block;background:#28632f;color:white;padding:12px 24px;text-decoration:none" href="'+escape(yes)+'">YES — Preinspection</a> &nbsp; <a style="display:inline-block;background:#b42b2f;color:white;padding:12px 24px;text-decoration:none" href="'+escape(no)+'">NO — Other appointment</a></p><p>YES opens a form for the Customer Number and optional Sales Order Number. Nothing changes until you submit. NO also requires confirmation.</p></td></tr></table></td></tr></table></body></html>'};
}
function tmv3_preInspectionClassificationForm_(state,choice) {
  const escape=tmv3_preInspectionHtmlEscape_;
  choice=choice==='NO'?'NO':'YES';
  const fields=choice==='YES' ? '<label>Customer Number (required)<input name="customerNumber" inputmode="numeric" pattern="[0-9]+" required value="'+escape(state.customerNumber || '')+'"></label><label>Sales Order Number (optional)<input name="orderNumber" inputmode="numeric" pattern="[0-9]*" value="'+escape(state.orderNumber || '')+'"></label>' : '<p>Confirm that this appointment is not a Preinspection.</p>';
  return '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><base target="_top"><style>body{font-family:Arial;background:#f4f3f1;color:#222;margin:0}main{max-width:650px;background:white;margin:30px auto;padding:24px;border-top:5px solid #b42b2f}label{display:block;margin:20px 0}input{display:block;padding:10px;width:90%;margin-top:6px}button{padding:12px 22px;background:#202020;color:white;border:0}#result{white-space:pre-wrap;margin-top:20px}</style></head><body><main><p><i>This is an automated email notification from Classic Fireplace &amp; BBQ Store.</i></p><h1>Confirm appointment purpose</h1>'+
    (state.testMode?'<p><strong>TEST MODE — no live calendar or task changes.</strong></p>':'')+'<h2>'+escape(state.title)+'</h2><p>'+escape(state.start)+'<br>'+escape(state.location)+'</p><form id="response">'+fields+'<button type="submit">'+(choice==='YES'?'Confirm Preinspection':'Confirm NO')+'</button></form><div id="result" role="status"></div></main><script>const token='+JSON.stringify(state.token)+';const choice='+JSON.stringify(choice)+';document.getElementById("response").addEventListener("submit",function(e){e.preventDefault();const f=e.target;const button=f.querySelector("button");button.disabled=true;document.getElementById("result").textContent="Submitting…";google.script.run.withSuccessHandler(function(r){document.getElementById("result").textContent=r.message;f.hidden=true;}).withFailureHandler(function(e){document.getElementById("result").textContent=e.message;button.disabled=false;}).tmv3_submitPreInspectionClassification({token:token,choice:choice,customerNumber:f.elements.customerNumber?f.elements.customerNumber.value:"",orderNumber:f.elements.orderNumber?f.elements.orderNumber.value:""});});</script></body></html>';
}
function doGet(e) {
  try {
    const p=e && e.parameter || {};
    if (p.action!=='classify') return HtmlService.createHtmlOutput('Classic Fireplace appointment confirmation. Use the link in your notification email.');
    const response=tmv3_preInspectionClassificationLoad_(p.token);
    if (['PENDING','SENT','EMAIL_SENDING'].indexOf(response.state.status)<0) return HtmlService.createHtmlOutput('This response has already been recorded.');
    // GET never records a decision or mutates a calendar: scanner-safe.
    return HtmlService.createHtmlOutput(tmv3_preInspectionClassificationForm_(response.state,p.choice)).setTitle('Classic Fireplace — Appointment confirmation');
  } catch(err) {return HtmlService.createHtmlOutput(tmv3_preInspectionHtmlEscape_(String(err.message || err)));}
}
function tmv3_submitPreInspectionClassification(input) {
  const lock=LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw new Error('The system is processing another request. Please try again shortly.');
  try {
    const response=tmv3_preInspectionClassificationLoad_(input && input.token);
    const state=response.state;const props=PropertiesService.getScriptProperties();
    if (['PENDING','SENT','EMAIL_SENDING'].indexOf(state.status)<0) return {message:'This response has already been recorded. No further changes were made.'};
    if (input.choice!=='YES' && input.choice!=='NO') throw new Error('Choose YES or NO.');
    if (input.choice==='NO') {
      state.status='NO';state.respondedAt=new Date().toISOString();props.setProperty(response.key,JSON.stringify(state));
      return {message:state.testMode ? 'TEST: NO recorded. No live event was changed.' : 'NO recorded. This event will not be enrolled in CF Preinspects.'};
    }
    const customerNumber=String(input.customerNumber || '').trim();const orderNumber=String(input.orderNumber || '').trim();
    if (!/^\d{1,10}$/.test(customerNumber)) throw new Error('Enter a valid Customer Number.');
    if (orderNumber && !/^\d{1,10}$/.test(orderNumber)) throw new Error('Enter a numeric Sales Order Number or leave it blank.');
    const refs=tmv3_step4IdentityIndex_();const customer=refs.customerByNumber[customerNumber];
    if (!customer) throw new Error('Customer Number could not be verified. Please check it; newly created customers may need the next source refresh.');
    if (state.customerNumber && String(state.customerNumber)!==customerNumber) throw new Error('Customer Number conflicts with the current appointment. Please correct the event before confirming.');
    if (orderNumber) {
      const orders=(refs.orders || []).filter(function(o){return String(o['Order Number'])===orderNumber;});
      if (orders.length!==1 || String(orders[0]['Customer ID'])!==String(customer['Customer ID'])) throw new Error('Sales Order could not be verified for this customer. Check the number or leave it blank.');
    }
    if (state.testMode) {
      state.status='TEST_YES';state.customerNumber=customerNumber;state.orderNumber=orderNumber;props.setProperty(response.key,JSON.stringify(state));
      return {message:'TEST: YES and numbers validated. No calendar event was changed and no task was created.'};
    }
    tmv3_assertOperationWrite_('PREINSPECTIONAUTO','PREINSPECTION_CONFIRMATION');
    const found=tmv3_findCalendarEventById_(state.calendarId,state.eventId);
    if (!found || !found.event) throw new Error('The original appointment is no longer available.');
    const cfg=TMV3.VERTICALS.PreInspection;
    const record=tmv3_calendarEvent_('PreInspection',cfg,{calendarId:state.calendarId,role:'SECONDARY_STEPHEN'},found.event,{applyEligibility:false});
    if (tmv3_preInspectionCreatorEmail_(record)!==state.recipient) throw new Error('The event creator changed. A new confirmation is required.');
    if (record.customerNumber && String(record.customerNumber)!==customerNumber) throw new Error('Customer Number changed on the event. A new confirmation is required.');
    const raw=String(found.event.getDescription() || '');
    const body=tmv3_preInspectionEnsureLegacyTitle_(raw,found.event.getTitle());
    const html=/<[a-z][^>]*>/i.test(body);const sep=html?'<br>':'\n';
    const description=body+(html?'<br><br>':'\n\n')+'PRE-INSPECTION'+sep+'Customer Number: '+customerNumber+(orderNumber?sep+'Sales Order Number: '+orderNumber:'');
    state.status='APPLYING';state.customerNumber=customerNumber;state.orderNumber=orderNumber;props.setProperty(response.key,JSON.stringify(state));
    found.event.setDescription(description);
    if (String(found.event.getDescription())!==description) throw new Error('Description verification failed; response held for review.');
    const guests=found.event.getGuestList(true).map(function(g){return tmv3_normEmail_(g.getEmail());});
    [cfg.primaryCalendarId,cfg.secondaryOwnerEmail].forEach(function(email){if(guests.indexOf(tmv3_normEmail_(email))<0) found.event.addGuest(email);});
    const after=found.event.getGuestList(true).map(function(g){return tmv3_normEmail_(g.getEmail());});
    if (after.indexOf(tmv3_normEmail_(cfg.primaryCalendarId))<0) throw new Error('Calendar enrollment verification failed; response held for review.');
    state.status='YES';state.respondedAt=new Date().toISOString();props.setProperty(response.key,JSON.stringify(state));
    return {message:'Preinspection confirmed and CF Preinspects added. The next 8 AM, 1 PM or 5 PM check will standardise the event and create or reuse its task.'};
  } finally {lock.releaseLock();}
}
function tmv3_preInspectionClassificationCycle_() {
  const props=PropertiesService.getScriptProperties();const url=props.getProperty('TMV3_PI_CONFIRMATION_WEBAPP_URL');
  if (TMV3.OPERATIONS.preInspectionClassificationEmailsEnabled!==true || !url) return {status:'CLASSIFICATION_DELIVERY_GATED',sent:0};
  const cfg=TMV3.VERTICALS.PreInspection;const records=[];
  (cfg.secondaryCalendarIds || []).forEach(function(id){
    const cal=CalendarApp.getCalendarById(id);if(!cal) return;
    const start=new Date();const end=new Date(start.getTime()+Number(cfg.lookaheadDays || 365)*86400000);
    cal.getEvents(start,end).forEach(function(event){
      const r=tmv3_calendarEvent_('PreInspection',cfg,{calendarId:id,role:'SECONDARY_STEPHEN'},event,{applyEligibility:false});
      if(tmv3_preInspectionPossibleCandidate_(r) && !tmv3_findCalendarEventById_(cfg.primaryCalendarId,r.eventId)) records.push(r);
    });
  });
  let sent=0;
  records.forEach(function(r){
    const key=tmv3_preInspectionClassificationKey_(r.eventId);let state=JSON.parse(props.getProperty(key) || 'null');
    if (state && ['YES','NO','APPLYING','EMAIL_SENDING','TEST_YES'].indexOf(state.status)>=0) return;
    const timing=tmv3_preInspectionNotificationDecision_(r,state && state.sentCount ? {status:'SENT',sentCount:state.sentCount,lastSentAt:state.lastSentAt} : null);
    if(!timing.send) return;
    if(!state) state=tmv3_preInspectionClassificationCreate_(r,false);
    if(Date.now()>new Date(state.expiresAt).getTime()) return;
    if(MailApp.getRemainingDailyQuota()<3) return;
    const email=tmv3_preInspectionClassificationEmail_(state,url);
    state.status='EMAIL_SENDING';props.setProperty(key,JSON.stringify(state));
    MailApp.sendEmail({to:email.to,cc:tmv3_preInspectionNotificationCc_().join(','),subject:email.subject,htmlBody:email.htmlBody,body:'Please confirm whether this appointment is a Preinspection using the buttons in this email.',name:'Classic Fireplace & BBQ Store'});
    state.status='SENT';state.sentCount++;state.lastSentAt=new Date().toISOString();props.setProperty(key,JSON.stringify(state));sent++;
  });
  return {status:'COMPLETE',sent:sent,candidates:records.length};
}
function tmv3_sendPreInspectionClassificationTest(eventId) {
  const url=PropertiesService.getScriptProperties().getProperty('TMV3_PI_CONFIRMATION_WEBAPP_URL');
  const cfg=TMV3.VERTICALS.PreInspection;let record=null;
  (cfg.secondaryCalendarIds || []).some(function(id){const found=tmv3_findCalendarEventById_(id,eventId);if(!found) return false;record=tmv3_calendarEvent_('PreInspection',cfg,{calendarId:id,role:'SECONDARY_STEPHEN'},found.event,{applyEligibility:false});return true;});
  if(!record || !tmv3_preInspectionPossibleCandidate_(record)) throw new Error('Test requires a verified possible Preinspection appointment on Stephen.');
  const state=tmv3_preInspectionClassificationCreate_(record,true);
  const email=tmv3_preInspectionClassificationEmail_(state,url);
  MailApp.sendEmail({to:'pramodh@classicfireplace.ca',subject:email.subject,htmlBody:email.htmlBody,body:'TEST: Confirm appointment purpose using the YES/NO buttons. No live calendar or task changes will be made.',name:'Classic Fireplace & BBQ Store'});
  return {status:'TEST_SENT',to:'pramodh@classicfireplace.ca',eventId:eventId};
}

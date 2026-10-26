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
    'tmv3_allVerticalAutomationTick',
    'tmv3_dailySourceRefresh',
    'tmv3_scheduledSheetRefresh',
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

function tmv3_installTriggers() { return tmv3_installStandardDailyTriggers(); }

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

function tmv3_calendarReconciliationFallback() { return {status:'RETIRED_USE_STANDARD_DAILY_SLOTS',businessWrites:0}; }

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
    // Explicit one-time backlog: independent of the routine hourly allowance.
    const backfill = tmv3_serviceDeliveryOrderBackfill_(props);
    if (backfill) return backfill;
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
        plan.expectedCustomerId,'SO#'+record.orderNumber,plan.vertical);
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
        const backfillState=JSON.parse(props.getProperty('TMV3_SD_ORDER_BACKFILL_20261020_'+row['Task ID']) || 'null');
        if (backfillState && ['INTENT','UNCERTAIN'].indexOf(backfillState.state)>=0) return false;
        return status === 'open' &&
          (type.indexOf('service') !== -1 || type.indexOf('delivery') !== -1) &&
          Number.isSafeInteger(Number(row['Task ID'])) && Number(row['Task ID']) > 0 &&
          (!tmv3_clean_(row['Order ID']) || !tmv3_clean_(row['Contact ID'])) &&
          /\bSO\s*#\s*\d{4,9}\b/i.test(tmv3_clean_(row['Name']));
      })
      .sort(function(a,b) {
        return Number(b['Task ID'] || 0)-Number(a['Task ID'] || 0);
      });
    const unlinked=candidates.filter(function(row){
      if(tmv3_clean_(row['Order ID']))return false;
      const title=tmv3_taskFirstTitleOrderNumber_(row.Name);
      if(title.status!=='UNIQUE')return false;
      const vertical=tmv3_norm_(row['Task Type']).indexOf('deliver')>=0?'Delivery':'Service';
      const matches=(orderMap[title.number] || []).filter(function(order){return tmv3_taskFirstOrderMatchesVertical_(order,vertical);});
      const ids=[];matches.forEach(function(order){const id=tmv3_clean_(order['Order ID']);if(ids.indexOf(id)<0)ids.push(id);});
      // Unresolved or known-closed links cannot starve Calendar-backed details.
      // A refreshed active Order automatically becomes eligible again.
      return ids.length===1 && matches.some(function(order){
        const status=tmv3_norm_(order.Status);
        return !status || status==='approved' || status==='in progress';
      });
    });
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
      return tmv3_taskFirstOrderMatchesVertical_(order, vertical);
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
        proof = tmv3_taskFirstFreshOrderOwnershipById_(id,liveCustomerId,normalized['Name'],vertical);
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

/** Google Apps Script: dedicated resumable continuation, never a general write gate. */
function tmv3_serviceDeliveryOrderBackfill() {
  const result=tmv3_taskFirstProductionCycle_();
  if (result && result.status==='LOCK_BUSY') {
    // A consumed one-shot must survive a collision with an existing Calendar refresh.
    const handler='tmv3_serviceDeliveryOrderBackfill';
    ScriptApp.getProjectTriggers().filter(function(t){return t.getHandlerFunction()===handler;})
      .forEach(function(t){ScriptApp.deleteTrigger(t);});
    ScriptApp.newTrigger(handler).timeBased().after(60000).create();
  }
  return result;
}

function tmv3_serviceDeliveryOrderBackfill_(props) {
  const ids = [18374,18471,18733,18735,18754,18774,18801,18806,18831,18896,18897,18908,18913,18914,18979,19037,19064,19098,19109,19126,19137,19190,19195,19198,19201,19203,19204,19205,19214,19218,19221,19222,19223,19224,19225,19226,19227,19228,19229,19230,19231,19232,19233,19234,19235,19240,19241,19242,19248,19249,19250,19251,19252,19253,19255,19256,19257,19258,19259,19260,19261,19262,19263,19264,19265,19266,19267,19268,19269,19270,19272,19273,19274,19275,19276,19279,19280,19281,19282,19283,19284];
  const prefix = 'TMV3_SD_ORDER_BACKFILL_20261020_';
  const handler = 'tmv3_serviceDeliveryOrderBackfill';
  const tasks = tmv3_rows_(TMV3.SHEETS.TASKS);
  // Isolated test projects and other source sets never enroll extra Tasks.
  if (!ids.some(function(id){return tasks.some(function(row){return String(row['Task ID'])===String(id);});})) return null;
  const orders=tmv3_rows_(TMV3.SHEETS.ORDERS);
  function needsWork(id) {
    const value=props.getProperty(prefix+id);
    if (!value) return true;
    const saved=JSON.parse(value);
    if (['INTENT','RETRY'].indexOf(saved.state)>=0) return true;
    // A newly available compatible cached Order may resolve a prior cache hold.
    if (saved.state==='BLOCKED' && ['ORDER_NOT_IN_CACHE','ORDER_SEARCH_NO_EXACT_CUSTOMER_MATCH'].indexOf(saved.reason)>=0 && saved.soNumber) {
      if (saved.reason==='ORDER_NOT_IN_CACHE' && !saved.searchAttempted) return true;
      return orders.some(function(order){return tmv3_clean_(order['Order Number'])===saved.soNumber &&
        tmv3_taskFirstOrderMatchesVertical_(order,saved.vertical);});
    }
    return false;
  }
  const pending=ids.filter(needsWork);
  if (!pending.length) return null;
  const started=Date.now();
  const initialBudget=tmv3_strivenApiBudgetStatus_();
  let processed=0,writes=0,paused='';
  function save(id,value) {
    const result=Object.assign({taskId:id,at:new Date().toISOString()},value);
    props.setProperty(prefix+id,JSON.stringify(result));
    tmv3_audit_(result.vertical || 'SYSTEM','',String(id),'SD_ORDER_BACKFILL',
      result.state==='VERIFIED'?'PASS':'REVIEW',JSON.stringify(result));
    return result;
  }
  function continueLater(delay) {
    // Only our own one-shot continuation is replaced; installed schedules stay intact.
    ScriptApp.getProjectTriggers().filter(function(t){return t.getHandlerFunction()===handler;})
      .forEach(function(t){ScriptApp.deleteTrigger(t);});
    ScriptApp.newTrigger(handler).timeBased().after(delay).create();
  }
  // Queue the next slice before work so a hard timeout cannot strand the backlog.
  continueLater(180000);
  for (let n=0;n<pending.length && processed<8;n++) {
    const budget=tmv3_strivenApiBudgetStatus_();
    if (budget.exhausted || budget.remaining<12) {paused='API_DAILY_BUDGET';break;}
    if (budget.count-initialBudget.count>=32 || Date.now()-started>=120000) {paused='SLICE_BUDGET';break;}
    const id=pending[n];
    processed++;
    let intent=false,vertical='',expectedOrderId='',customerId='',soNumber='',searchAttempted=false;
    try {
      const source=tasks.filter(function(row){return String(row['Task ID'])===String(id);});
      if (source.length!==1) {save(id,{state:'BLOCKED',reason:'SOURCE_TASK_NOT_UNIQUE'});continue;}
      const sourceType=tmv3_norm_(source[0]['Task Type']);
      vertical=sourceType.indexOf('service')>=0?'Service':sourceType.indexOf('deliver')>=0?'Delivery':'';
      if (!vertical) {save(id,{state:'BLOCKED',reason:'WRONG_VERTICAL'});continue;}
      const live=tmv3_normalizeV2TaskModel_(tmv3_rawTaskById_(id));
      const type=tmv3_norm_(live['Task Type']);
      customerId=tmv3_clean_(live['Customer ID']);
      if (String(live['Task ID'])!==String(id) || !tmv3_taskIsOpen_(live.Status) ||
          (vertical==='Service'?type.indexOf('service')<0:type.indexOf('deliver')<0) ||
          !/^[1-9]\d*$/.test(customerId)) {
        save(id,{state:'BLOCKED',vertical:vertical,reason:'FRESH_TASK_IDENTITY_STATUS_OR_CUSTOMER'});continue;
      }
      tmv3_upsertTaskCacheRow_(live);
      const title=tmv3_taskFirstTitleOrderNumber_(live.Name);
      if (title.status!=='UNIQUE') {save(id,{state:'BLOCKED',vertical:vertical,reason:'TASK_TITLE_SO_'+title.status});continue;}
      soNumber=title.number;
      const matches=orders.filter(function(order){return tmv3_clean_(order['Order Number'])===title.number &&
        tmv3_taskFirstOrderMatchesVertical_(order,vertical);});
      const orderIds=[];
      matches.forEach(function(order){const value=tmv3_clean_(order['Order ID']);
        if (/^[1-9]\d*$/.test(value) && orderIds.indexOf(value)<0) orderIds.push(value);});
      // Explicit user-provided identity; fresh API proof still must accept the lifecycle.
      if (!orderIds.length && id===19198 && title.number==='586061') orderIds.push('27795');
      if (!orderIds.length) {searchAttempted=true;orderIds.push(tmv3_taskFirstFindOrderByTitle_(title.number,customerId));}
      if (orderIds.length!==1) {save(id,{state:'BLOCKED',vertical:vertical,soNumber:title.number,
        reason:orderIds.length?'AMBIGUOUS_ORDER':'ORDER_NOT_IN_CACHE'});continue;}
      expectedOrderId=orderIds[0];
      const actual=tmv3_clean_(live['Order ID']);
      if (actual && actual!==expectedOrderId) {save(id,{state:'BLOCKED',vertical:vertical,reason:'EXISTING_ORDER_CONFLICT'});continue;}
      tmv3_taskFirstFreshOrderOwnershipById_(expectedOrderId,customerId,live.Name,vertical);
      const prior=JSON.parse(props.getProperty(prefix+id) || 'null');
      if (prior && prior.state==='INTENT') {
        if (prior.orderId===actual && prior.customerId===customerId) {
          save(id,{state:'VERIFIED',vertical:vertical,orderId:actual,customerId:customerId,
            reason:'INTENT_RECONCILED_BY_FRESH_READ',writes:0});
        } else save(id,{state:'UNCERTAIN',vertical:vertical,orderId:expectedOrderId,
          reason:'PREVIOUS_WRITE_NOT_CONFIRMED_NO_RETRY'});
        continue;
      }
      if (actual===expectedOrderId) {
        save(id,{state:'VERIFIED',vertical:vertical,orderId:actual,customerId:customerId,
          reason:'ALREADY_LINKED_FRESH_VERIFIED',writes:0});continue;
      }
      // Persist intent before the existing, independently guarded, Order-only PATCH.
      props.setProperty(prefix+id,JSON.stringify({state:'INTENT',taskId:id,vertical:vertical,
        orderId:expectedOrderId,customerId:customerId,at:new Date().toISOString()}));
      intent=true;
      const result=tmv3_repairExistingTaskRelationships(id,vertical,
        {customerId:customerId,orderId:expectedOrderId,contactId:'',locationId:''},'TASK_FIRST_PRODUCTION');
      writes+=Number(result.writes || 0);
      const after=tmv3_normalizeV2TaskModel_(tmv3_rawTaskById_(id));
      if (String(after['Task ID'])!==String(id) || tmv3_clean_(after['Order ID'])!==expectedOrderId ||
          tmv3_clean_(after['Customer ID'])!==customerId || !tmv3_taskIsOpen_(after.Status) ||
          tmv3_clean_(after['Task Type'])!==tmv3_clean_(live['Task Type']) ||
          tmv3_clean_(after.Name)!==tmv3_clean_(live.Name)) throw new Error('BACKFILL_READBACK_MISMATCH');
      tmv3_upsertTaskCacheRow_(after);
      save(id,{state:'VERIFIED',vertical:vertical,orderId:expectedOrderId,customerId:customerId,
        soNumber:title.number,writes:Number(result.writes || 0),readbackVerified:true});
    } catch(err) {
      const reason=String(err && err.message || err).slice(0,600);
      if (intent) {
        // Keep INTENT for one automatic fresh read on continuation; never blind retry.
        tmv3_audit_(vertical,'',String(id),'SD_ORDER_BACKFILL','ATTENTION',reason);
      } else {
        const prior=JSON.parse(props.getProperty(prefix+id) || 'null');
        const attempts=Number(prior && prior.attempts || 0)+1;
        const transient=/HTTP (429|5\d\d)|DAILY_GUARD|GET failure|timed out|timeout|temporar|Service invoked too many/i.test(reason);
        save(id,{state:transient && attempts<3?'RETRY':'BLOCKED',vertical:vertical,reason:reason,attempts:attempts,soNumber:soNumber,searchAttempted:searchAttempted});
      }
      if (/429|DAILY_GUARD/.test(reason)) {paused='API_RATE_OR_DAILY_GUARD';break;}
    }
  }
  const tally={VERIFIED:0,BLOCKED:0,UNCERTAIN:0,PENDING:0};
  ids.forEach(function(id){const value=JSON.parse(props.getProperty(prefix+id) || 'null');
    const state=value && value.state;
    if (needsWork(id)) {tally.PENDING++;return;}
    if (state && Object.prototype.hasOwnProperty.call(tally,state)) tally[state]++;
    else tally.PENDING++;});
  ScriptApp.getProjectTriggers().filter(function(t){return t.getHandlerFunction()===handler;})
    .forEach(function(t){ScriptApp.deleteTrigger(t);});
  if (tally.PENDING) continueLater(paused==='API_DAILY_BUDGET'?3600000:
    Math.max(1000,60000-(Date.now()-started))); // At least 60 seconds between slice starts; no extra idle minute after a slow slice.
  const summary={status:tally.PENDING?'ORDER_BACKFILL_CONTINUING':'ORDER_BACKFILL_COMPLETE',
    total:ids.length,processed:processed,writes:writes,tally:tally,paused:paused,apiBudget:tmv3_strivenApiBudgetStatus_()};
  props.setProperty(prefix+'SUMMARY',JSON.stringify(summary));
  tmv3_audit_('SYSTEM','','','SD_ORDER_BACKFILL_SUMMARY','INFO',JSON.stringify(summary));
  return summary;
}

/** Existing Delivery Task identity does not require a Calendar approval-report row. */
function tmv3_taskFirstOrderMatchesVertical_(order,vertical) {
  if (vertical==='Delivery' && tmv3_clean_(order && order['Order Type']).split('|')
      .some(function(type){return tmv3_clean_(type).toUpperCase()==='SALES_ORDER';})) return true;
  return tmv3_step3OrderMatchesVertical_(order,vertical);
}

/** Official Striven OpenAPI: SalesOrderSearchParameters Number/CustomerId, paged Data/TotalCount. */
function tmv3_taskFirstFindOrderByTitle_(number,customerId) {
  if (!/^\d{4,9}$/.test(String(number)) || !/^[1-9]\d*$/.test(String(customerId))) throw new Error('ORDER_SEARCH_INVALID_IDENTITY');
  const result=tmv3_fetchJson_(TMV3.API_BASE+'/v1/sales-orders/search',{
    method:'post',contentType:'application/json',
    payload:JSON.stringify({Number:String(number),CustomerId:Number(customerId),PageIndex:0,PageSize:100})
  }) || {};
  const data=result.Data!==undefined?result.Data:result.data;
  const total=Number(result.TotalCount!==undefined?result.TotalCount:result.totalCount);
  if (!Array.isArray(data) || !Number.isSafeInteger(total) || total<0 || total!==data.length || total>100) {
    throw new Error('ORDER_SEARCH_INCOMPLETE_RESULT_NO_PATCH');
  }
  const ids=[];
  data.forEach(function(row){
    const id=tmv3_clean_(row.Id!==undefined?row.Id:row.id);
    const candidate=tmv3_clean_(row.Number!==undefined?row.Number:row.number);
    const customer=row.Customer || row.customer || {};
    const owner=tmv3_clean_(customer.Id!==undefined?customer.Id:customer.id);
    if (candidate===String(number) && owner===String(customerId) && /^[1-9]\d*$/.test(id) && ids.indexOf(id)<0) ids.push(id);
  });
  if (ids.length!==1) throw new Error(ids.length?'ORDER_SEARCH_AMBIGUOUS_NO_PATCH':'ORDER_SEARCH_NO_EXACT_CUSTOMER_MATCH');
  return ids[0]; // The caller must still freshly GET this Order to prove ownership and active status.
}

function tmv3_scheduledOperations() { return {status:'RETIRED_USE_STANDARD_DAILY_SLOTS',businessWrites:0}; }

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
  if (TMV3.MODE!=='PRODUCTION_WRITE' || TMV3.OPERATIONS.installRemindersEnabled!==true) {
    return {status:'REMINDERS_GATED',sent:0};
  }
  return tmv3_sendInstallMissingSoReminders_('AUTO');
}

function tmv3_calendarEventUpdated() { return {status:'RETIRED_USE_STANDARD_DAILY_SLOTS',businessWrites:0}; }

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
  return !!record && tmv3_preInspectionClassifyLikely_(record,TMV3.VERTICALS.PreInspection).status==='EXPLICIT_PREINSPECTION';
}

// Google Apps Script: discovery is metadata-only. Identity evidence never proves visit type.
function tmv3_preInspectionDiscoveryDecision_(record,cfg) {
  if (!record || tmv3_step2PreInspectionNonCustomer_(record) || record.status==='cancelled') return {status:'IGNORE',reason:'NON_CUSTOMER_OR_CANCELLED'};
  const creator=tmv3_preInspectionCreatorEmail_(record);
  const excluded=(cfg.secondaryIgnoredCreatorEmails || []).map(tmv3_normEmail_);
  if (!creator || excluded.indexOf(creator)>=0) return {status:'IGNORE',reason:creator?'EXCLUDED_CREATOR':'CREATOR_UNVERIFIED'};
  const text=[record.title || '',record.descriptionClean || record.rawDescription || ''].join(' ');
  if (/\b(?:not|no)\s+(?:a\s+)?pre[\s-]*inspect(?:ion)?\b/i.test(text)) return {status:'IGNORE',reason:'EXPLICIT_NOT_PREINSPECTION'};
  if (/\bpre[\s-]*inspect(?:ion)?\s+(?:(?:is|was)\s+)?(?:not\b|required later|already completed)/i.test(text)) return {status:'IGNORE',reason:'EXPLICIT_NOT_PREINSPECTION'};
  const instruction=/\bpre[\s-]*inspect(?:ion)?\b/i.test(record.title || '') ||
    /^\s*(?:(?:this is (?:a )?|appointment(?: type)?[: -]+))?pre[\s-]*inspect(?:ion)?\b/i.test(record.descriptionClean || record.rawDescription || '');
  if (instruction) return {status:'EXPLICIT_PREINSPECTION',reason:'EXPLICIT_SOURCE_INSTRUCTION'};
  if (!tmv3_phone10_(record.phone) || !tmv3_clean_(record.location)) return {status:'IGNORE',reason:'INSUFFICIENT_CUSTOMER_VISIT_EVIDENCE'};
  return {status:'REVIEW_VISIT_TYPE',reason:/\b(?:return|go back|measure|filler|trim)\b/i.test(text)?'RETURN_OR_MEASURING_VISIT_UNCONFIRMED':'CUSTOMER_VISIT_TYPE_UNCONFIRMED'};
}
// Google Apps Script: classify likely visits using current Order ownership and job site.
var TMV3_PI_LIKELY_REFS = null;
var TMV3_PI_LIKELY_DECISIONS = {};
function tmv3_preInspectionClassifyLikely_(record,cfg,fresh) {
  const base=tmv3_preInspectionDiscoveryDecision_(record,cfg);
  if(base.status!=='REVIEW_VISIT_TYPE')return base;
  if(/\b(?:service|delivery|repair|maintenance|troubleshoot(?:ing)?)\b/i.test(record.title || '') ||
      /^\s*(?:service|delivery|repair|maintenance)\b/i.test(record.descriptionClean || record.rawDescription || ''))return {status:'REVIEW_VISIT_TYPE',reason:'OTHER_VERTICAL_INTENT_REQUIRES_REVIEW'};
  const key=record.eventId+'|'+record.fingerprint;
  if(!fresh && TMV3_PI_LIKELY_DECISIONS[key])return TMV3_PI_LIKELY_DECISIONS[key];
  let result=base;
  try {
    const refs=TMV3_PI_LIKELY_REFS || (TMV3_PI_LIKELY_REFS=tmv3_step4IdentityIndex_());
    const identity=tmv3_step4ResolveCustomerFromCalendarEvidence_(record,refs);
    const customerId=Number(identity.customer && identity.customer['Customer ID']);
    if(!Number.isSafeInteger(customerId)||customerId<=0)return {status:'REVIEW_VISIT_TYPE',reason:'CUSTOMER_IDENTITY_UNRESOLVED'};
    const explicit=String(record.orderNumber || '');
    // Never silently choose the first of multiple authored SO references.
    const text=[record.title,record.descriptionClean || record.rawDescription || ''].join(' ');
    const mentions=tmv3_unique_((text.match(/\b(?:SO|Sales\s+Order)\s*#?\s*\d{5,}/ig)||[]).map(function(v){return v.match(/\d+/)[0];}));
    if(mentions.length>1)return {status:'REVIEW_VISIT_TYPE',reason:'MULTIPLE_ORDER_REFERENCES'};
    const query={PageIndex:0,PageSize:10,CustomerId:customerId};
    if(explicit)query.Number=explicit;
    const search=tmv3_fetchJson_(TMV3.API_BASE+'/v1/sales-orders/search',{method:'post',contentType:'application/json',payload:JSON.stringify(query)});
    const rows=tmv3_first_(search,['Data']),total=Number(tmv3_first_(search,['TotalCount']));
    if(!Array.isArray(rows)||!Number.isSafeInteger(total)||total!==rows.length||total>10 || (explicit && rows.length!==1))return {status:'REVIEW_VISIT_TYPE',reason:'ORDER_SEARCH_INCOMPLETE_OR_AMBIGUOUS'};
    const locations=tmv3_preInspectionCustomerLocationsFresh_(customerId);
    const sites=locations.filter(function(l){return Number(l['Customer ID'])===customerId && tmv3_addressStrongMatch_(tmv3_addressParts_(record.location),tmv3_addressParts_(tmv3_locationFullAddress_(l)));});
    if(sites.length!==1)return {status:'REVIEW_VISIT_TYPE',reason:'JOB_SITE_NOT_UNIQUE_FOR_CUSTOMER'};
    const relevant=[];
    rows.forEach(function(row){
      const id=Number(tmv3_first_(row,['Id'])),number=String(tmv3_first_(row,['Number']));
      if(!Number.isSafeInteger(id)||id<=0||(explicit&&number!==explicit))throw Error('ORDER_SEARCH_IDENTITY_CONFLICT');
      const raw=tmv3_fetchJson_(TMV3.API_BASE+'/v1/sales-orders/'+id,{method:'get'});
      const customer=tmv3_first_(raw,['Customer']),location=tmv3_first_(raw,['ShipToLocation']),status=tmv3_first_(raw,['Status']);
      if(Number(tmv3_first_(raw,['Id']))!==id||String(tmv3_first_(raw,['OrderNumber','Number']))!==number||Number(tmv3_first_(customer,['Id']))!==customerId)throw Error('ORDER_READBACK_IDENTITY_CONFLICT');
      const statusId=String(tmv3_first_(status,['Id'])),statusName=tmv3_norm_(tmv3_first_(status,['Name']));
      const known={'19':'quoted','22':'approved','25':'in progress'};
      if(!known[statusId]||known[statusId]!==statusName)return;
      if(Number(tmv3_first_(location,['Id']))!==Number(sites[0]['Location ID']))return;
      relevant.push({orderId:id,orderNumber:number,customerId:customerId,locationId:Number(sites[0]['Location ID']),orderStatus:statusName});
    });
    const installations=relevant.filter(function(o){return o.orderStatus==='approved'||o.orderStatus==='in progress';});
    if(installations.length)result={status:'INSTALLATION',reason:'APPROVED_OR_IN_PROGRESS_ORDER_AT_JOB_SITE',orders:installations};
    else if(relevant.length===1 && relevant[0].orderStatus==='quoted') {
      // Measuring return visits already booked for install are not initial inspections.
      if(/\binstall(?:ation)?\b/i.test(record.title || '') || (/\b(?:return|go back)\b/i.test(text) && /\binstall(?:ation)?\b/i.test(text)))result={status:'REVIEW_VISIT_TYPE',reason:'INSTALLATION_RETURN_VISIT_ORDER_NOT_APPROVED'};
      else result={status:'EXPLICIT_PREINSPECTION',reason:'VERIFIED_QUOTED_ORDER_LIKELY_PREINSPECTION',orders:relevant};
    } else result={status:'REVIEW_VISIT_TYPE',reason:'NO_UNIQUE_ACTIVE_ORDER_AT_JOB_SITE'};
  }catch(error){result={status:'REVIEW_VISIT_TYPE',reason:'LIVE_ORDER_CLASSIFICATION_FAILED',error:String(error).slice(0,240)};}
  TMV3_PI_LIKELY_DECISIONS[key]=result;
  return result;
}

// Recheck the current Order after asynchronous Calendar intake, immediately before CREATE.
// An inferred visit keeps its verified Order evidence even when no SO was authored on Calendar.
function tmv3_preInspectionOrderBeforeCreate_(record,plan) {
  const key='TMV3_PI_INFERRED_'+tmv3_hash_(record.eventId);
  const rawEvidence=PropertiesService.getScriptProperties().getProperty(key);
  const evidence=rawEvidence ? JSON.parse(rawEvidence) : null;
  const number=String(record.orderNumber || (evidence && evidence.orderNumber) || '');
  if(!number)return {status:'OPTIONAL_ORDER_NOT_ATTACHED'};
  if(!/^\d+$/.test(number))throw Error('PREINSPECTION_ORDER_STATUS_UNVERIFIED_NO_CREATE');
  const customerId=Number(plan.expectedCustomerId),locationId=Number(plan.expectedLocationId);
  if(!Number.isSafeInteger(customerId)||customerId<=0)throw Error('PREINSPECTION_ORDER_CUSTOMER_UNVERIFIED_NO_CREATE');
  if(evidence && (String(evidence.orderNumber)!==number || Number(evidence.customerId)!==customerId || Number(evidence.locationId)!==locationId))throw Error('PREINSPECTION_INFERRED_ORDER_EVIDENCE_CONFLICT_NO_CREATE');
  let id=Number(evidence && evidence.orderId);
  if(!Number.isSafeInteger(id)||id<=0){
    const found=tmv3_fetchJson_(TMV3.API_BASE+'/v1/sales-orders/search',{method:'post',contentType:'application/json',payload:JSON.stringify({PageIndex:0,PageSize:2,Number:number,CustomerId:customerId})});
    const data=tmv3_first_(found,['Data']),count=Number(tmv3_first_(found,['TotalCount']));
    if(!Array.isArray(data)||count!==1||data.length!==1||String(tmv3_first_(data[0],['Number']))!==number)throw Error('PREINSPECTION_ORDER_NOT_UNIQUE_NO_CREATE');
    id=Number(tmv3_first_(data[0],['Id']));
  }
  if(!Number.isSafeInteger(id)||id<=0)throw Error('PREINSPECTION_ORDER_ID_UNVERIFIED_NO_CREATE');
  const order=tmv3_fetchJson_(TMV3.API_BASE+'/v1/sales-orders/'+id,{method:'get'});
  const customer=tmv3_first_(order,['Customer']),status=tmv3_first_(order,['Status']);
  if(Number(tmv3_first_(order,['Id']))!==id || String(tmv3_first_(order,['OrderNumber','Number']))!==number || Number(tmv3_first_(customer,['Id']))!==customerId)throw Error('PREINSPECTION_ORDER_OWNERSHIP_CONFLICT_NO_CREATE');
  const statusId=String(tmv3_first_(status,['Id'])),statusName=tmv3_norm_(tmv3_first_(status,['Name']));
  const known={'18':'incomplete','19':'quoted','20':'pending approval','22':'approved','25':'in progress'};
  if(!known[statusId]||known[statusId]!==statusName)throw Error('PREINSPECTION_ORDER_STATUS_UNVERIFIED_NO_CREATE');
  if(statusId==='22'||statusId==='25')throw Error('APPROVED_ORDER_REQUIRES_INSTALLATION_NO_PREINSPECTION_CREATE');
  return {status:'FRESH_PREAPPROVAL_ORDER_VERIFIED',orderId:id,orderNumber:number,orderStatus:statusName};
}

function tmv3_preInspectionStoreDiscovery_(records) {
  const sorted=records.slice().sort(function(a,b){return new Date(a.start)-new Date(b.start);});
  const state={checkedAt:new Date().toISOString(),total:sorted.length,
    review:sorted.filter(function(r){return r.status==='REVIEW_VISIT_TYPE';}).length,
    explicit:sorted.filter(function(r){return r.status==='EXPLICIT_PREINSPECTION';}).length,
    installation:sorted.filter(function(r){return r.status==='INSTALLATION';}).length,
    records:sorted.slice(0,15),truncated:sorted.length>15};
  // A bounded property is only the operator projection; every sweep rescans the source.
  while(JSON.stringify(state).length>2700 && state.records.length){state.records.pop();state.truncated=true;}
  const props=PropertiesService.getScriptProperties();
  const previous=tmv3_preInspectionDiscoveryStatus();
  props.setProperty('TMV3_PI_DISCOVERY',JSON.stringify(state));
  if(JSON.stringify(previous.records)!==JSON.stringify(state.records) || previous.total!==state.total) {
    tmv3_audit_('PreInspection','','','PREINSPECTION_DISCOVERY','REVIEW',JSON.stringify({total:state.total,review:state.review,explicit:state.explicit,truncated:state.truncated}));
  }
  return state;
}
function tmv3_preInspectionDiscoveryStatus() {
  const raw=PropertiesService.getScriptProperties().getProperty('TMV3_PI_DISCOVERY');
  if(!raw)return {status:'NOT_SCANNED',total:0,records:[]};
  try{return JSON.parse(raw);}catch(error){return {status:'INVALID_DISCOVERY_STATE',total:0,records:[]};}
}
function tmv3_refreshPreInspectionDiscovery() {
  const lock=LockService.getScriptLock();if(!lock.tryLock(30000))return {status:'LOCK_BUSY',writes:0};
  try{tmv3_preInspectionIntakeRecords_({recordDiscovery:true,resolveLikely:true});return tmv3_preInspectionDiscoveryStatus();}
  finally{lock.releaseLock();}
}
// Same executor as the scheduled slots; no second repair implementation.
function tmv3_reconcilePreInspectionEvent(eventId) {
  if(!/^[a-z0-9_]+@google\.com$/.test(String(eventId || '')))throw new Error('INVALID_PREINSPECTION_EVENT_ID');
  const started=Date.now();
  const result=tmv3_preInspectionAutomationCycle_({force:true,eventId:eventId,reason:'TARGETED_RECONCILIATION'});
  result.sheetRefresh=tmv3_refreshAutomationSheetsAfter_(started);
  return result;
}

function tmv3_preInspectionIntakeRecords_(options) {
  options=options || {};
  const cfg = TMV3.VERTICALS.PreInspection;
  const calendars = tmv3_verticalCalendars_('PreInspection',cfg).concat(
    (cfg.secondaryCalendarIds || []).map(function(id) {
      return {calendarId:id,calendarName:'Stephen',role:'SECONDARY_STEPHEN'};
    })
  );
  const start = new Date(); start.setHours(0,0,0,0);
  const end = new Date(start); end.setDate(end.getDate() + Number(cfg.lookaheadDays || 365));
  const records = [], discovery = [];
  calendars.forEach(function(source) {
    const cal = CalendarApp.getCalendarById(source.calendarId);
    if (!cal) throw new Error('PreInspection source calendar unavailable: ' + source.calendarId);
    cal.getEvents(start,end).forEach(function(event) {
      const record = tmv3_calendarEvent_('PreInspection',cfg,source,event,
        {applyEligibility:false});
      if (!record || tmv3_step2PreInspectionNonCustomer_(record)) return;
      if (source.role === 'SECONDARY_STEPHEN') {
        if(records.some(function(r){return r.calendarRole==='PRIMARY_SHARED' && r.eventId===record.eventId && tmv3_iso_(r.start)===tmv3_iso_(record.start);}))return;
        const decision=options.resolveLikely===true ? tmv3_preInspectionClassifyLikely_(record,cfg) : tmv3_preInspectionDiscoveryDecision_(record,cfg);
        if (decision.status==='IGNORE') return;
        discovery.push({eventId:record.eventId,calendarId:record.calendarId,
          title:String(record.title || '').slice(0,100),start:tmv3_iso_(record.start),
          reason:decision.reason,status:decision.status,orders:decision.orders || [],error:decision.error || ''});
        if (decision.status!=='EXPLICIT_PREINSPECTION') return;
      }
      records.push(record);
    });
  });
  const primaryKeys={};
  records.filter(function(r){return r.calendarRole==='PRIMARY_SHARED';}).forEach(function(r){primaryKeys[r.eventId+'|'+tmv3_iso_(r.start)]=true;});
  if(options.recordDiscovery===true) tmv3_preInspectionStoreDiscovery_(discovery.filter(function(r){return !primaryKeys[r.eventId+'|'+r.start];}));
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
  const freshSource=tmv3_calendarEvent_('PreInspection',cfg,{calendarId:record.calendarId,calendarName:'Stephen',role:'SECONDARY_STEPHEN'},source.event,{applyEligibility:false});
  const freshClassification=tmv3_preInspectionClassifyLikely_(freshSource,cfg,true);
  if(freshClassification.status!=='EXPLICIT_PREINSPECTION') throw new Error('SOURCE_INTENT_OR_CREATOR_NOT_AUTHORIZED_NO_INTAKE_WRITE');
  if(freshSource.fingerprint!==record.fingerprint) throw new Error('SOURCE_CHANGED_NO_INTAKE_WRITE');
  if(freshClassification.reason==='VERIFIED_QUOTED_ORDER_LIKELY_PREINSPECTION' && freshClassification.orders.length===1)PropertiesService.getScriptProperties().setProperty('TMV3_PI_INFERRED_'+tmv3_hash_(record.eventId),JSON.stringify(freshClassification.orders[0]));
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
  if (!assessment.shouldNotify || (assessment.missing||[]).every(function(item){return item.code==='SALES_ORDER';})) return {status:'NO_MISSING_DETAILS',sent:0};
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

// Stable key lets successive time-driven executions cover the complete eligible
// calendar snapshot without holding a large list in Script Properties.
function tmv3_preInspectionSweepKey_(record) {
  const start = new Date(record.start);
  if (!isFinite(start.getTime())) throw new Error('PREINSPECTION_SWEEP_INVALID_START');
  return start.toISOString() + '|' + String(record.eventId || '');
}

function tmv3_preInspectionAutomationCycle_(options) {
  options = options || {};
  if (!tmv3_operationWritesEnabled_('PREINSPECTIONAUTO')) return {status:'PREINSPECTION_GATED',writes:0};
  if (TMV3.OPERATIONS.preInspectionAutomationScheduleHours && options.force !== true) return {status:'SCHEDULE_ONLY',writes:0};
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(options.force === true ? 30000 : 1000)) return {status:'LOCK_BUSY',writes:0};
  const props = PropertiesService.getScriptProperties();
  const result = {status:'COMPLETE',processed:0,writes:0,notifications:0,results:[]};
  const previousApiContext=TMV3_PREINSPECTION_API_CONTEXT_ACTIVE;
  TMV3_PREINSPECTION_API_CONTEXT_ACTIVE=true;
  try {
    const records=tmv3_preInspectionIntakeRecords_({recordDiscovery:true,resolveLikely:true});
    result.discovery=tmv3_preInspectionDiscoveryStatus();
    const budget=tmv3_strivenApiBudgetStatus_();
    if(budget.exhausted||budget.remaining<30) {
      result.status='API_BUDGET_WAIT';result.apiBudget=budget;
      result.resume='NEXT_SCHEDULED_SLOT_AFTER_DAILY_RESET';
      const pauseKey='TMV3_PI_BUDGET_PAUSE_DATE';
      if(props.getProperty(pauseKey)!==budget.date) {
        props.setProperty(pauseKey,budget.date);
        tmv3_audit_('PreInspection','','','PREINSPECTION_API_BUDGET_WAIT','WAIT',JSON.stringify({date:budget.date,count:budget.count,softLimit:budget.softLimit,resume:result.resume,triggers:tmv3_listTriggers()}));
      }
      props.setProperty('TMV3_PI_LAST_RESULT',JSON.stringify(result));
      return result;
    }
    const now = Date.now();
    const last = Number(props.getProperty('TMV3_PI_LAST_CYCLE') || 0);
    if (options.force !== true && now-last < Math.max(1,Number(TMV3.OPERATIONS.preInspectionAutomationIntervalMinutes || 5))*60000) {
      return {status:'THROTTLED',writes:0};
    }
    props.setProperty('TMV3_PI_LAST_CYCLE',String(now));
    // Reuse the cache-age gates and last-good source policy; refresh failure
    // stops this cycle before task creation or misleading missing-data emails.
    tmv3_refreshOperationalSourcesIfNeeded_(120,false);
    let pending = JSON.parse(props.getProperty('TMV3_PI_PENDING_EVENTS') || '[]');
    pending.forEach(function(id) {
      if (records.some(function(r) {return r.eventId===id;})) return;
      try {
        const recovered=tmv3_preInspectionRecoveryRecord_(id);
        if(recovered.calendarRole==='PRIMARY_SHARED' || tmv3_preInspectionClassifyLikely_(recovered,TMV3.VERTICALS.PreInspection).status==='EXPLICIT_PREINSPECTION') records.push(recovered);
        else pending=pending.filter(function(pendingId){return pendingId!==id;});
      }
      catch(err) {tmv3_audit_('PreInspection',id,'','PREINSPECTION_RECOVERY','ATTENTION',String(err));}
    });
    const scopeEventId = tmv3_clean_(TMV3.OPERATIONS.preInspectionAutomationCanaryEventId || options.eventId);
    let selected = scopeEventId ? records.filter(function(r){return r.eventId===scopeEventId;}) : records;
    const sweepRequested = options.sweepStart === true || options.sweepContinue === true;
    let sweep = null;
    if (sweepRequested && scopeEventId) {
      return {status:'SWEEP_BLOCKED_BY_CANARY_SCOPE',processed:0,writes:0,eligible:records.length};
    }
    if (sweepRequested) {
      const raw = props.getProperty('TMV3_PI_SWEEP_STATE') || '';
      let prior = null;
      try {if (raw) prior=JSON.parse(raw);} catch (ignored) {}
      const valid = prior && prior.status==='IN_PROGRESS' &&
        isFinite(new Date(prior.startedAt).getTime()) &&
        now-new Date(prior.startedAt).getTime() < 86400000;
      if (options.sweepContinue === true && !valid) {
        return {status:'NO_ACTIVE_PREINSPECTION_SWEEP',processed:0,writes:0};
      }
      sweep = valid ? prior : {status:'IN_PROGRESS',startedAt:new Date(now).toISOString(),
        lastKey:'',processed:0};
      // Deterministic position survives batch boundaries without a 9-KB
      // Script Properties queue; new earlier events enter the next sweep.
      selected.sort(function(a,b) {
        const aa=tmv3_preInspectionSweepKey_(a),bb=tmv3_preInspectionSweepKey_(b);
        return aa<bb?-1:aa>bb?1:0;
      });
      selected=selected.filter(function(r){return tmv3_preInspectionSweepKey_(r)>sweep.lastKey;});
      result.eligible=records.length;
    }
    // Scheduled slots still evaluate notification deadlines for all
    // authoritative events; continuations do not repeat the full mail scan.
    const notificationRecords=options.sweepContinue===true ? [] :
      (scopeEventId ? selected : records);
    notificationRecords.filter(function(r){return r.calendarRole==='PRIMARY_SHARED';}).forEach(function(r){
      try {const notice=tmv3_preInspectionSendMissingDetails_(r);result.notifications+=Number(notice.sent || 0);}
      catch(err) {result.status='ATTENTION';tmv3_preInspectionFailureAlert_(r.eventId,String(err));}
    });
    let cursor = sweep ? 0 : Number(props.getProperty('TMV3_PI_CURSOR') || 0);
    // Preserve the tested three-event and one-mutation safety budgets.
    const cap = Math.max(1,Math.min(3,Number(TMV3.OPERATIONS.preInspectionAutomationMaxEventsPerRun || 3)));
    if (selected.length) cursor = cursor % selected.length;
    for (let i=0;i<Math.min(cap,selected.length);i++) {
      let record = selected[(cursor+i)%selected.length];
      const one = {eventId:record.eventId};
      result.processed++;
      try {
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
          const preservation=tmv3_restorePreInspectionLegacyTitle_(record);
          if (preservation.writes) record=tmv3_preInspectionRecoveryRecord_(record.eventId);
          let plans = tmv3_step7FreshPlansForEvent_('PreInspection',record.eventId);
          if (plans.length===1 && plans[0].blocker &&
              !tmv3_preInspectionHistoricalCoverageVerified_(plans[0])) {
            one.optionalOrderEvidence=tmv3_preInspectionOptionalOrderLocationEvidence_(record);
            if (one.optionalOrderEvidence.status==='CACHE_REPAIRED') plans=tmv3_step7FreshPlansForEvent_('PreInspection',record.eventId);
          }
          if (plans.length === 1 && !plans[0].blocker && (plans[0].actions || []).some(function(a) {
            return a===TMV3_STEP7_ACTION.CREATE_TASK || a===TMV3_STEP7_ACTION.RECREATE_TASK;
          })) {
            plans = tmv3_preInspectionFreshHistoryBeforeCreate_(record,plans[0]);
          }
          if (plans.length !== 1) throw new Error('MULTIPLE_CANONICAL_PLANS_NO_WRITE');
          const plan = plans[0];
          if(!plan.blocker && plan.actions.some(function(a){return a===TMV3_STEP7_ACTION.CREATE_TASK || a===TMV3_STEP7_ACTION.RECREATE_TASK;}))one.orderStatusBeforeCreate=tmv3_preInspectionOrderBeforeCreate_(record,plan);
          one.plan=plan.plan;one.blocker=plan.blocker || '';one.taskId=plan.taskId || '';
          // Preserve the single business-write transaction cap. Do not
          // advance the durable sweep cursor past a record whose update has
          // been deferred solely because this batch used its write allowance.
          if (!plan.blocker && plan.actions.length && result.writes>=1) {
            result.processed--;
            result.deferredWriteBudget=true;
            break;
          }
          if (!plan.blocker && plan.actions.length && result.writes<1) {
            // One event transaction per run, using the existing fresh ownership,
            // lifecycle, durable create guards and field-level readbacks.
            if (plan.actions.some(function(action){return action!==TMV3_STEP7_ACTION.VERIFY_CALENDAR_LINKS;})) result.writes++;
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
          const complete = tmv3_preInspectionCompletionVerified_(after,one.execution);
          if (complete) {
            if (tmv3_preInspectionHistoricalCoverageVerified_(after[0])) {
              one.status='FULFILLED_NO_RECREATE';one.historicalEvidence=one.blocker;one.blocker='';
            }
            pending=pending.filter(function(id){return id!==record.eventId;});
            const inferredKey='TMV3_PI_INFERRED_'+tmv3_hash_(record.eventId);
            if(props.getProperty(inferredKey))props.deleteProperty(inferredKey);
            props.setProperty(doneKey,JSON.stringify({fingerprint:fresh.fingerprint,at:Date.now()}));
          }
          else {
            one.status='ATTENTION';
            result.status='ATTENTION';
            if (pending.indexOf(record.eventId)<0) pending.push(record.eventId);
          }
        }
        result.notifications += Number(one.notification && one.notification.sent || 0);
      } catch(err) {
        one.status='ATTENTION';one.error=String(err && err.message || err);result.status='ATTENTION';
        if (pending.indexOf(record.eventId)<0) pending.push(record.eventId);
        tmv3_audit_('PreInspection',record.eventId,'','PREINSPECTIONAUTO','ATTENTION',one.error);
        tmv3_preInspectionFailureAlert_(record.eventId,one.error);
        if(/TMV3_STRIVEN_API_DAILY_GUARD|daily api usage limit/i.test(one.error)) {
          // Preserve this event's cursor position for a fresh reconciliation after reset.
          result.status='API_BUDGET_WAIT';result.processed--;
          result.results.push(one);break;
        }
      }
      result.results.push(one);
    }
    if (sweep) {
      if (result.processed) sweep.lastKey=tmv3_preInspectionSweepKey_(selected[result.processed-1]);
      sweep.processed=Number(sweep.processed || 0)+result.processed;
      const remaining=Math.max(0,selected.length-result.processed);
      sweep.status=remaining ? 'IN_PROGRESS' :
        (pending.length ? 'SCANNED_WITH_PENDING_REVIEW' : 'COMPLETE');
      props.setProperty('TMV3_PI_SWEEP_STATE',JSON.stringify(sweep));
      result.sweep={status:sweep.status,eligible:result.eligible,attempted:sweep.processed,
        remaining:remaining,pendingReview:pending.length,lastKey:sweep.lastKey};
    } else if (!options.eventId && selected.length) {
      props.setProperty('TMV3_PI_CURSOR',String((cursor+result.processed)%selected.length));
    }
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
  } finally {TMV3_PREINSPECTION_API_CONTEXT_ACTIVE=previousApiContext;lock.releaseLock();}
}

function tmv3_runPreInspectionAutomation() {
  const sheetRefreshStarted=Date.now();
  const result=tmv3_preInspectionAutomationCycle_({force:true,reason:'MANUAL_KICK'});
  result.sheetRefresh=tmv3_refreshAutomationSheetsAfter_(sheetRefreshStarted);
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

// Runs one bounded batch after the preceding batch finishes. Trigger
// installation for the 08/13/17 slots remains unchanged.
function tmv3_preInspectionScheduleNextSweep_() {
  const handler='tmv3_preInspectionContinueEligibleSweep';
  const exists=ScriptApp.getProjectTriggers().some(function(t){
    return t.getHandlerFunction()===handler;
  });
  if (exists) return 'CONTINUATION_ALREADY_SCHEDULED';
  ScriptApp.newTrigger(handler).timeBased().after(120000).create();
  return 'CONTINUATION_SCHEDULED';
}
function tmv3_preInspectionClearContinuationTrigger_() {
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction()==='tmv3_preInspectionContinueEligibleSweep') {
      ScriptApp.deleteTrigger(t);
    }
  });
}
function tmv3_preInspectionLogSweep_(slot,result) {
  const summary={
    slot:slot,status:result.status,processed:result.processed,
    writes:result.writes,notifications:result.notifications,
    sweep:result.sweep || null,continuation:result.continuation || null,
    error:result.error || '',
    attentionEvents:(result.results || []).filter(function(r){
      return r.status==='ATTENTION'||!!r.blocker||!!r.error;
    }).map(function(r){return {eventId:r.eventId,status:r.status||'',blocker:r.blocker||'',error:r.error||''};})
  };
  Logger.log(JSON.stringify(summary));
  tmv3_audit_('PreInspection','','','PREINSPECTION_SWEEP',result.status||'UNKNOWN',JSON.stringify(summary));
}
function tmv3_preInspectionMaybeContinueSweep_(result) {
  const errors=[result.error||''].concat((result.results||[]).map(function(r){return r.error||'';})).join(' ');
  if(result.status==='API_BUDGET_WAIT'||/TMV3_STRIVEN_API_DAILY_GUARD|daily api usage limit/i.test(errors)) {
    result.continuation='WAIT_FOR_DAILY_API_BUDGET';
    return result;
  }
  // A reviewed historical relationship is not an infrastructure failure.
  const allTechnicalFailures=(result.results||[]).length>0 &&
    result.results.every(function(r){return !!r.error;});
  if(allTechnicalFailures) {
    result.continuation='PAUSED_TECHNICAL_FAILURE_AUTOMATIC_RECOVERY';
    return result;
  }
  if((result.sweep&&result.sweep.remaining>0)||result.status==='LOCK_BUSY') {
    try {result.continuation=tmv3_preInspectionScheduleNextSweep_();}
    catch(err) {
      result.status='ATTENTION';result.continuation='SCHEDULING_FAILED';
      result.error=String(err&&err.message||err);
      tmv3_audit_('PreInspection','','','ELIGIBLE_SWEEP','ATTENTION',result.error);
      tmv3_preInspectionFailureAlert_('',result.error);
    }
  }
  return result;
}

function tmv3_preInspectionContinueEligibleSweep() {
  const sheetRefreshStarted=Date.now();
  tmv3_preInspectionClearContinuationTrigger_();
  const result=tmv3_preInspectionAutomationCycle_({force:true,sweepContinue:true,reason:'ELIGIBLE_SWEEP_CONTINUATION'});
  tmv3_preInspectionMaybeContinueSweep_(result);
  tmv3_preInspectionLogSweep_('CONTINUATION',result);
  result.sheetRefresh=tmv3_refreshAutomationSheetsAfter_(sheetRefreshStarted);
  return result;
}
function tmv3_runPreInspectionDailySlot_(slot) {
  const sheetRefreshStarted=Date.now();
  const result=tmv3_preInspectionAutomationCycle_({force:true,sweepStart:true,reason:'DAILY_SLOT_'+slot});
  tmv3_preInspectionMaybeContinueSweep_(result);
  tmv3_preInspectionLogSweep_(slot,result);
  result.sheetRefresh=tmv3_refreshAutomationSheetsAfter_(sheetRefreshStarted);
  return result;
}
function tmv3_installPreInspectionAutomationTrigger() { return tmv3_installStandardDailyTriggers(); }

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
  let legacy=state.preservedTitle;
  const copies=tmv3_requiredCalendarCopiesForEvent_(record).map(function(id){
    const found=tmv3_findEventCopyRobust_(id,record.eventId);
    if (!found || !found.event) throw new Error('LEGACY_TITLE_REPAIR_MISSING_COPY: '+id);
    return {calendarId:id,event:found.event};
  });
  if (!legacy) {
    const primary=copies.filter(function(copy){return copy.calendarId===cfg.primaryCalendarId;})[0];
    const canonical=primary && String(primary.event.getTitle() || '');
    const oldTitles=tmv3_unique_(copies.map(function(copy){return String(copy.event.getTitle() || '');}).filter(function(title){return title && title!==canonical;}));
    if (/^\d+ - .+ - \(\d{3}\) \d{3}-\d{4}$/.test(canonical) && oldTitles.length===1) {
      legacy=oldTitles[0];
      tmv3_recordTitleMigrationState_('PreInspection',record.eventId,cfg.primaryCalendarId,legacy,canonical);
    } else if (oldTitles.length>1) throw new Error('AMBIGUOUS_PREVIOUS_COPY_TITLES_NO_OVERWRITE');
    else return {status:'NO_RECORDED_LEGACY_TITLE',eventId:record.eventId,writes:0};
  }
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

// Google Apps Script: verification-only actions must not keep a converged event pending.
function tmv3_preInspectionCompletionVerified_(plans, execution) {
  if (!Array.isArray(plans) || plans.length !== 1) return false;
  const plan = plans[0];
  if (tmv3_preInspectionHistoricalCoverageVerified_(plan)) return true;
  if (!plan || plan.blocker || !Array.isArray(plan.actions)) return false;
  if (plan.actions.length === 0) return true;
  if (plan.plan !== 'NO_CHANGE' || plan.actions.some(function(action) {
    return action !== TMV3_STEP7_ACTION.VERIFY_CALENDAR_LINKS;
  })) return false;
  return !!(execution &&
    ['VERIFIED_CONVERGENCE','CREATED_VERIFIED_AND_CONVERGED'].indexOf(execution.status) >= 0 &&
    execution.calendarLinks &&
    execution.calendarLinks.status === 'CALENDAR_LINKS_VERIFIED');
}

function tmv3_preInspectionAutomaticRecovery_(reason) {
  const hour=Number(Utilities.formatDate(new Date(),TMV3_TIMEZONE,'H'));
  if(hour<8||hour>18) return {status:'OUTSIDE_PREINSPECTION_RECOVERY_HOURS',writes:0};
  const props=PropertiesService.getScriptProperties();
  let state=null;
  try {state=JSON.parse(props.getProperty('TMV3_PI_SWEEP_STATE')||'null');} catch(ignored) {}
  if(!state||state.status!=='IN_PROGRESS') return {status:'NO_STALLED_PREINSPECTION_SWEEP',writes:0};
  const last=Number(props.getProperty('TMV3_PI_LAST_CYCLE')||0);
  if(Date.now()-last<20*60000) return {status:'RECENT_PREINSPECTION_BATCH',writes:0};
  // Existing scheduled jobs provide recovery; no API executable or manual run needed.
  tmv3_preInspectionClearContinuationTrigger_();
  const result=tmv3_preInspectionAutomationCycle_({force:true,sweepContinue:true,reason:'AUTOMATIC_RECOVERY_'+reason});
  tmv3_preInspectionMaybeContinueSweep_(result);
  tmv3_preInspectionLogSweep_('RECOVERY',result);
  return result;
}

// Google Apps Script: classify fresh same-day completed coverage without changing history.
function tmv3_preInspectionHistoricalCoverageVerified_(plan) {
  if (!plan || plan.vertical !== 'PreInspection' ||
      plan.disposition !== 'FULFILLED_NO_RECREATE' ||
      plan.plan !== 'VERIFY_ONLY_HISTORY_NO_WRITE' ||
      plan.readStatus !== 'FRESH_TASK_GET' ||
      !/^[1-9]\d*$/.test(String(plan.taskId || '')) ||
      !Array.isArray(plan.actions) || plan.actions.length !== 0 ||
      !tmv3_step6IsFulfilledStatus_(plan.taskStatus) ||
      plan.customerCheck !== 'MATCH' ||
      !/^[1-9]\d*$/.test(String(plan.expectedCustomerId || '')) ||
      String(plan.expectedCustomerId) !== String(plan.actualCustomerId)) return false;
  return tmv3_step6TaskTouchesEventDay_({start:plan.calendarStart},
    {Start:plan.taskStart,Due:plan.taskDue});
}

// Metadata-only reconciliation. Every removal requires a new canonical Task read.
function tmv3_reconcilePreInspectionPendingReview() {
  const lock=LockService.getScriptLock();
  if (!lock.tryLock(1000)) return {status:'LOCK_BUSY',businessWrites:0};
  try {
    const props=PropertiesService.getScriptProperties();
    const stored=JSON.parse(props.getProperty('TMV3_PI_PENDING_EVENTS') || '[]');
    if (!Array.isArray(stored) || stored.some(function(id){return typeof id!=='string' || !id;})) {
      throw new Error('INVALID_PENDING_QUEUE_NO_CHANGE');
    }
    let pending=stored.slice();
    const results=[];
    const ids=stored.filter(function(id,index){return stored.indexOf(id)===index;}).slice(0,5);
    ids.forEach(function(id) {
      try {
        const plans=tmv3_step7FreshPlansForEvent_('PreInspection',id);
        if (plans.length===1 && tmv3_preInspectionHistoricalCoverageVerified_(plans[0])) {
          pending=pending.filter(function(candidate){return candidate!==id;});
          results.push({eventId:id,taskId:plans[0].taskId,status:'FULFILLED_NO_RECREATE',
            readbackVerified:true,businessWrites:0});
        } else {
          results.push({eventId:id,status:'REVIEW_RETAINED',plans:plans.map(function(p){
            return {plan:p.plan,blocker:p.blocker,taskId:p.taskId};
          }),businessWrites:0});
        }
      } catch(err) {results.push({eventId:id,status:'READ_FAILED_REVIEW_RETAINED',error:String(err),businessWrites:0});}
    });
    props.setProperty('TMV3_PI_PENDING_EVENTS',JSON.stringify(pending));
    const readback=JSON.parse(props.getProperty('TMV3_PI_PENDING_EVENTS') || '[]');
    if (JSON.stringify(readback)!==JSON.stringify(pending)) throw new Error('PENDING_QUEUE_READBACK_FAILED');
    const result={status:pending.length?'REVIEW_REMAINS':'COMPLETE',
      before:stored.length,remaining:pending.length,cleared:stored.length-pending.length,
      results:results,businessWrites:0};
    props.setProperty('TMV3_PI_LAST_PENDING_RECONCILIATION',JSON.stringify(result));
    tmv3_audit_('PreInspection','','','PENDING_HISTORY_RECONCILE',result.status,JSON.stringify(result));
    Logger.log(JSON.stringify(result));return result;
  } finally {lock.releaseLock();}
}
// Google Apps Script: targeted evidence refresh; no Striven or Calendar mutation.
function tmv3_verticalEnrichEvidence_(vertical, record, plans) {
  if (['Install','Delivery','Service'].indexOf(vertical)<0) throw new Error('VERTICAL_REQUIRED');
  const one=(plans||[])[0] || {};
  const customerId=tmv3_clean_(one.expectedCustomerId);
  const number=tmv3_clean_(record.orderNumber);
  if (!/^[1-9]\d*$/.test(customerId) || !/^\d+$/.test(number)) return {status:'IDENTITY_OR_ORDER_REVIEW'};
  let id=tmv3_clean_(one.expectedOrderId);
  if (!id) id=tmv3_taskFirstFindOrderByTitle_(number,customerId);
  const proof=tmv3_taskFirstFreshOrderOwnershipById_(id,customerId,'SO#'+number,vertical);
  const sheet=tmv3_sheet_(TMV3.SHEETS.ORDERS),values=sheet.getDataRange().getValues();
  const headers=['Order ID','Order Number','Customer ID','Location ID','Contact ID','Status','Name','Order Type','URL','Fingerprint'];
  if (!values.length || JSON.stringify(values[0].slice(0,10))!==JSON.stringify(headers)) throw new Error('ORDER_CACHE_SCHEMA_DRIFT');
  const matches=[];
  values.slice(1).forEach(function(row,index){if(String(row[0])===String(id))matches.push({row:row,index:index+2});});
  if (matches.length>1 || matches.some(function(x){return String(x.row[1])!==number ||
    (tmv3_clean_(x.row[2]) && String(x.row[2])!==customerId);})) throw new Error('ORDER_CACHE_IDENTITY_CONFLICT');
  const current=matches.length?matches[0].row.slice(0,10):[id,number,customerId,'','','','','SALES_ORDER',TMV3.ORDER_URL_BASE+id,''];
  // In Progress alone does not establish a Service Work Order classification.
  if (vertical==='Service' && String(current[7]).split('|').indexOf('WORK_ORDER')<0) return {status:'WORK_ORDER_SOURCE_REQUIRED'};
  if (proof.contactId) {
    const contact=tmv3_getContactById_(proof.contactId,customerId);
    if (!contact || contact.__ownershipVerified!==true) throw new Error('ORDER_CONTACT_OWNERSHIP_UNPROVEN');
    current[4]=proof.contactId;
  }
  const owned=tmv3_preInspectionCustomerLocationsFresh_(Number(customerId));
  const locations=owned.filter(function(location){return tmv3_addressStrongMatch_(
    tmv3_addressParts_(record.location),tmv3_addressParts_(tmv3_locationFullAddress_(location)));});
  if (locations.length===1) tmv3_upsertLocationCacheObject_(locations[0]);
  if (proof.locationId) current[3]=proof.locationId;
  current[2]=customerId;current[5]=proof.status;
  current[9]=tmv3_hash_(current.slice(0,9).map(String).join('|'));
  sheet.getRange(matches.length?matches[0].index:values.length+1,1,1,10).setValues([current]);
  const after=sheet.getRange(matches.length?matches[0].index:values.length+1,1,1,10).getValues()[0];
  if (String(after[0])!==String(id) || String(after[2])!==customerId || String(after[4])!==String(current[4])) throw new Error('TARGETED_ORDER_CACHE_READBACK_FAILED');
  return {status:'EVIDENCE_REFRESHED',orderId:id,orderStatus:proof.status,contactVerified:!!proof.contactId,locationMatches:locations.length};
}

function tmv3_verticalProductionCycle_(vertical, options) {
  options=options || {};
  const policy=TMV3.OPERATIONS;
  if (TMV3.MODE!=='PRODUCTION_WRITE' || policy.verticalProductionEnabled!==true ||
      (policy.verticalProductionVerticals||[]).indexOf(vertical)<0) return {status:'VERTICAL_DISABLED',vertical:vertical,writes:0};
  const lock=LockService.getScriptLock();
  if (!lock.tryLock(1000)) return {status:'LOCK_BUSY',vertical:vertical,writes:0};
  const result={status:'ACTIVE_NO_READY_RECORD',vertical:vertical,writes:0,scanned:0,results:[]};
  try {
    const props=PropertiesService.getScriptProperties(),now=Date.now();
    const stateKey='TMV3_VERTICAL_SWEEP_'+vertical;
    let state=JSON.parse(props.getProperty(stateKey)||'null');
    if(!state || state.complete) {
      // Consume the existing intake queue; each event is freshly verified below.
      // Rebuilding every operator sheet here can consume the entire execution.
      const today=tmv3_step6LocalDay_(new Date()),seen={};
      const events=tmv3_rows_(TMV3.VERTICALS[vertical].sheet).filter(function(row){
        const id=tmv3_clean_(row['Event ID']),day=tmv3_step6LocalDay_(row['Calendar Start']);
        if(!id||seen[id]||!day||day<today)return false;seen[id]=true;return true;
      }).sort(function(a,b){return new Date(a['Calendar Start'])-new Date(b['Calendar Start']);});
      const ids=events.map(function(row){return tmv3_clean_(row['Event ID']);});
      const chunks=Math.ceil(ids.length/50);
      for(let n=0;n<chunks;n++)props.setProperty(stateKey+'_IDS_'+n,JSON.stringify(ids.slice(n*50,n*50+50)));
      state={id:String(now),cursor:0,total:ids.length,chunks:chunks,complete:false,scanned:0,verified:0,review:0,uncertain:0};
      props.setProperty(stateKey,JSON.stringify(state));
    }
    result.total=state.total;result.sweepId=state.id;
    const events=[];for(let n=0;n<state.chunks;n++)events.push.apply(events,JSON.parse(props.getProperty(stateKey+'_IDS_'+n)||'[]'));
    if(events.length!==state.total)throw Error('SWEEP_SNAPSHOT_INCOMPLETE_NO_WRITE');
    for(let i=state.cursor;i<events.length;i++) {
      const budget=tmv3_strivenApiBudgetStatus_();
      if(Date.now()-now>120000){result.status='RUNTIME_CONTINUATION_REQUIRED';break;}
      if(budget.exhausted||budget.remaining<Number(policy.verticalProductionMinApiRemaining||60)){result.status='API_BUDGET_WAIT';break;}
      const id=events[i];result.scanned++;
      const key='TMV3_VERTICAL_EVENT_'+tmv3_hash_(vertical+'|'+id);
      let writeStarted=false;
      try {
        const record=tmv3_findFreshEventRecord_(vertical,id);
        let plans=tmv3_step7FreshPlansForEvent_(vertical,id);
        const alreadyFulfilled=plans.length>0 && plans.every(function(p){return p.disposition==='FULFILLED_NO_RECREATE' && p.plan==='VERIFY_ONLY_HISTORY_NO_WRITE' && p.readStatus==='FRESH_TASK_GET' && p.actions.length===0 && p.customerCheck==='MATCH' && tmv3_step6IsFulfilledStatus_(p.taskStatus) && tmv3_step6TaskTouchesEventDay_({start:p.calendarStart},{Start:p.taskStart,Due:p.taskDue});});
        if(alreadyFulfilled){result.results.push({eventId:id,status:'FULFILLED_NO_RECREATE'});continue;}
        const enriched=tmv3_verticalEnrichEvidence_(vertical,record,plans);
        if(enriched.status==='EVIDENCE_REFRESHED') plans=tmv3_step7FreshPlansForEvent_(vertical,id);
        const historical=plans.length>0 && plans.every(function(p){return p.disposition==='FULFILLED_NO_RECREATE' && p.plan==='VERIFY_ONLY_HISTORY_NO_WRITE' && p.readStatus==='FRESH_TASK_GET' && p.actions.length===0 && p.customerCheck==='MATCH' && tmv3_step6IsFulfilledStatus_(p.taskStatus);});
        if(historical){result.results.push({eventId:id,status:'FULFILLED_NO_RECREATE'});continue;}
        if (!plans.length || plans.some(function(p){return !!p.blocker;}) ||
            (plans.length>1 && (vertical!=='Service' || !plans.every(function(p){return p.disposition==='MATCH_EXISTING_MULTI' && p.taskId;})))) {
          result.results.push({eventId:id,status:'REVIEW',plans:plans.map(function(p){return {taskId:p.taskId,plan:p.plan,blocker:p.blocker};})});continue;
        }
        if(plans.some(function(p){return p.actualRequestedById && p.expectedRequestedById && (String(p.actualRequestedById)!==String(p.expectedRequestedById) || p.actualRequestedByType!==p.expectedRequestedByType);})) {
          result.results.push({eventId:id,status:'REVIEW_EXISTING_REQUESTED_BY_CONFLICT'});continue;
        }
        let prior=JSON.parse(props.getProperty(key)||'null');
        // This exact local validation error occurs before any business mutation
        // in tmv3_step7FreshCriticalOwnership_. It is a proven rejection, not
        // an unknown network/write outcome. Other uncertain writes stay held.
        if(prior && prior.state==='UNCERTAIN' &&
          /^Fresh Customer existence verification expected one Customer \d+; found \d+\.$/.test(prior.error||'') &&
          Number((prior.error.match(/found (\d+)/)||[])[1])>1) {
          props.deleteProperty(key);prior=null;
          tmv3_audit_(vertical,id,'','KNOWN_PREWRITE_REJECTION_RECOVERED','PASS','Duplicate report rows for one Customer ID; canonical ownership checks remain required.');
        }
        const noTaskActions=plans.every(function(p){return p.plan==='NO_CHANGE' && (p.actions||[]).every(function(a){return a==='VERIFY_CALENDAR_LINKS';});});
        if(prior && ['INTENT','UNCERTAIN'].indexOf(prior.state)>=0 && !noTaskActions) {
          result.results.push({eventId:id,status:'UNCERTAIN_RECONCILIATION_REQUIRED'});continue;
        }
        const taskIds=[];
        if(plans.some(function(p){const duplicate=p.taskId && taskIds.indexOf(String(p.taskId))>=0;if(p.taskId)taskIds.push(String(p.taskId));return duplicate;})) throw new Error('DUPLICATE_TASK_CONTRACTS');
        const executions=[];
        for(let j=0;j<plans.length;j++) {
          const plan=j ? tmv3_step7FreshExecutionContract_(vertical,id,plans[j].taskId) : plans[j];
          if(plan.blocker)throw new Error('FRESH_SIBLING_CONTRACT_BLOCKED');
          if(vertical==='Service' && (plan.actions||[]).some(function(a){return /CREATE|RECREATE/.test(a);})) throw new Error('SERVICE_TASK_CREATION_OWNED_BY_STRIVEN');
          // Canonical executor rechecks identity/lifecycle/duplicate evidence and reads every write back.
          props.setProperty(key,JSON.stringify({state:'INTENT',at:Date.now(),fingerprint:record.fingerprint,taskId:plan.taskId||'',plan:plan.plan}));
          tmv3_verticalProductionCycle_.context={vertical:vertical,eventId:id,contractJson:JSON.stringify(plan)};
          writeStarted=true;
          try {
            const execution=tmv3_executeFreshStep7Selection_({previousPlan:plan.plan,contract:plan},'VERTICALAUTO','ALL');
            if(['VERIFIED_CONVERGENCE','CREATED_VERIFIED_AND_CONVERGED'].indexOf(execution.status)<0) throw new Error('VERTICAL_CONVERGENCE_NOT_VERIFIED:'+execution.status);
            executions.push({taskId:execution.taskId||plan.taskId,status:execution.status,actions:plan.actions,readbackVerified:true});
          }finally{delete tmv3_verticalProductionCycle_.context;}
        }
        props.setProperty(key,JSON.stringify({state:'VERIFIED',at:Date.now(),fingerprint:record.fingerprint,taskIds:executions.map(function(x){return x.taskId;})}));
        result.status='VERIFIED_CONVERGENCE';result.transactionsVerified=Number(result.transactionsVerified||0)+1;result.writes+=noTaskActions?0:1;result.results.push({eventId:id,status:'VERIFIED_CONVERGENCE',executions:executions});
        tmv3_audit_(vertical,id,'','VERTICAL_AUTO','PASS',JSON.stringify(result.results[result.results.length-1]));
      } catch(err) {
        const message=String(err && err.message || err);
        if(writeStarted)props.setProperty(key,JSON.stringify({state:'UNCERTAIN',at:Date.now(),error:message.slice(0,500)}));
        result.results.push({eventId:id,status:writeStarted?'UNCERTAIN_RECONCILIATION_REQUIRED':'REVIEW',error:message});
        tmv3_audit_(vertical,id,'','VERTICAL_AUTO',writeStarted?'ATTENTION':'REVIEW',message);
        if(writeStarted)tmv3_verticalAutomationFailureAlert_(vertical,id,message);
      } finally {
        const outcome=result.results[result.results.length-1]||{status:'UNKNOWN'};
        state.cursor=i+1;state.scanned++;
        if(outcome.status==='VERIFIED_CONVERGENCE'||outcome.status==='FULFILLED_NO_RECREATE')state.verified++;
        else if(outcome.status==='UNCERTAIN_RECONCILIATION_REQUIRED')state.uncertain++;
        else state.review++;
        props.setProperty(stateKey,JSON.stringify(state));
        tmv3_audit_(vertical,id,'','VERTICAL_SWEEP_EVENT',outcome.status,JSON.stringify(outcome));
      }
    }
    state.complete=state.cursor>=state.total;props.setProperty(stateKey,JSON.stringify(state));
    result.sweep=state;result.pending=state.total-state.cursor;
    if(state.complete)result.status='SWEEP_COMPLETE';
    return result;
  } finally {
    delete tmv3_verticalProductionCycle_.context;
    PropertiesService.getScriptProperties().setProperty('TMV3_VERTICAL_RESULT_'+vertical,JSON.stringify(Object.assign({},result,{results:result.results.slice(-8)})));
    lock.releaseLock();
  }
}

function tmv3_allVerticalAutomationTick() {
  const hour=Number(Utilities.formatDate(new Date(),TMV3_TIMEZONE,'H'));
  if(hour<8 || hour>18) return {status:'OUTSIDE_BUSINESS_HOURS',writes:0};
  const props=PropertiesService.getScriptProperties(),all=['Service','Delivery','Install'];
  const start=Number(props.getProperty('TMV3_VERTICAL_ROTATION')||0)%all.length;
  props.setProperty('TMV3_VERTICAL_ROTATION',String((start+1)%all.length));
  const result={status:'ACTIVE',results:[]},began=Date.now();
  for(let i=0;i<all.length;i++){
    if(Date.now()-began>210000)break;
    try{result.results.push(tmv3_verticalProductionCycle_(all[(start+i)%all.length]));}
    catch(err){result.results.push({vertical:all[(start+i)%all.length],status:'ATTENTION',error:String(err)});}
  }
  result.sheetRefresh=tmv3_refreshAutomationSheetsAfter_(began);
  Logger.log(JSON.stringify(result));return result;
}

function tmv3_runServiceAutomation() {const r=tmv3_runFullVerticalSweep_('Service');Logger.log(JSON.stringify(r));return r;}
function tmv3_runDeliveryAutomation() {const r=tmv3_runFullVerticalSweep_('Delivery');Logger.log(JSON.stringify(r));return r;}
function tmv3_runInstallAutomation() {const r=tmv3_runFullVerticalSweep_('Install');Logger.log(JSON.stringify(r));return r;}

function tmv3_installVerticalProductionTrigger() { return tmv3_installStandardDailyTriggers(); }

function tmv3_verticalAutomationFailureAlert_(vertical,eventId,error) {
  const props=PropertiesService.getScriptProperties();
  const key='TMV3_VERTICAL_ALERT_'+tmv3_hash_(tmv3_step6LocalDay_(new Date())+'|'+vertical+'|'+eventId);
  if(props.getProperty(key))return {status:'ALREADY_ALERTED_OR_UNCERTAIN'};
  if(MailApp.getRemainingDailyQuota()<1)return {status:'QUOTA_WAIT'};
  props.setProperty(key,'SENDING');
  try{
    MailApp.sendEmail({to:TMV3.OPERATIONS.verticalFailureAlertEmail,
      subject:vertical+' automation: action required',
      body:'This is an automated email notification from Classic Fireplace & BBQ Store.\n\nHi Pramodh,\n\n'+vertical+' could not verify an automatic transaction.\nEvent: '+eventId+'\n'+error+'\n\nThe record remains held. An uncertain write must be reconciled before retrying.',
      name:'Classic Fireplace & BBQ Store'});
    props.setProperty(key,'SENT');return {status:'SENT'};
  }catch(err){tmv3_audit_(vertical,eventId,'','VERTICAL_FAILURE_ALERT','ATTENTION',String(err));return {status:'UNCERTAIN_SEND_NO_RETRY'};}
}

function tmv3_fourVerticalAutomationStatus() {
  const props=PropertiesService.getScriptProperties(),policy=TMV3.OPERATIONS;
  const verticals={PreInspection:{enabled:tmv3_operationWritesEnabled_('PREINSPECTIONAUTO'),hours:[8,13,17]}};
  ['Service','Delivery','Install'].forEach(function(v){
    let recent=null;try{recent=JSON.parse(props.getProperty('TMV3_VERTICAL_RESULT_'+v)||'null');}catch(ignored){}
    verticals[v]={enabled:TMV3.MODE==='PRODUCTION_WRITE' && policy.verticalProductionEnabled===true &&
      (policy.verticalProductionVerticals||[]).indexOf(v)>=0,requiredSalesOrderStatus:v==='Service'?'In Progress':'Approved',recent:recent};
  });
  return {version:TMV3.VERSION,mode:TMV3.MODE,verticals:verticals,triggers:tmv3_listTriggers(),
    generalAutomationWritesEnabled:policy.automationWritesEnabled,manualWritesEnabled:policy.manualWritesEnabled,
    installReminderEnabled:TMV3.MODE==='PRODUCTION_WRITE'&&policy.installRemindersEnabled===true,
    apiBudget:tmv3_strivenApiBudgetStatus_()};
}


// Google Apps Script: cache-backed operator publication, with no Striven/Calendar writes.
function tmv3_refreshAutomationSheetsAfter_(startedAt) {
  try {
    PropertiesService.getScriptProperties().setProperty('TMV3_SHEET_REFRESH_PENDING','true');
    if(Date.now()-Number(startedAt)>240000) return {status:'DEFERRED_TO_HOURLY_SHEET_REFRESH'};
    return tmv3_refreshAutomationSheets();
  } catch(err) {
    // A view-publication failure must not replay or relabel a completed business transaction.
    return {status:'SHEET_REFRESH_ATTENTION',error:String(err && err.message || err)};
  }
}
function tmv3_scheduledSheetRefresh() {
  const hour=Number(Utilities.formatDate(new Date(),TMV3_TIMEZONE,'H'));
  if(hour<8||hour>18)return {status:'OUTSIDE_BUSINESS_HOURS'};
  return tmv3_refreshAutomationSheets();
}
function tmv3_refreshAutomationSheets() {
  const lock=LockService.getScriptLock(),props=PropertiesService.getScriptProperties();
  props.setProperty('TMV3_SHEET_REFRESH_PENDING','true');
  if(!lock.tryLock(1000))return {status:'LOCK_BUSY'};
  const startedAt=new Date().toISOString();
  try {
    const mapped=tmv3_step6TaskDecisionRunCached('AUTOMATIC_SHEET_REFRESH');
    if(!mapped.verification || mapped.verification.pass!==true)throw Error('SHEET_PROJECTION_VERIFICATION_FAILED');
    const counts={};
    Object.keys(TMV3.VERTICALS).forEach(function(v){
      const rows=tmv3_rows_(TMV3.VERTICALS[v].sheet);
      counts[v]=rows.filter(function(r){return !!tmv3_clean_(r['Event ID']);}).length;
      if(counts[v]!==Number(mapped.write[v]))throw Error('SHEET_ROW_READBACK_MISMATCH:'+v);
    });
    const morning=tmv3_refreshMorningOps();
    const stamp=Utilities.formatDate(new Date(),TMV3_TIMEZONE,'yyyy-MM-dd h:mm a');
    const overview=tmv3_sheet_(TMV3.SHEETS.OVERVIEW);
    const title='V3 '+TMV3.VERSION+' — Sheet refreshed '+stamp+' Toronto';
    overview.getRange('B2').setValue(title);
    overview.getRange('B4').setValue(TMV3.MODE+' — dedicated four-vertical automation; general AUTO/MANUAL remain gated.');
    overview.getRange('B5').setValue('Current Calendar intake + latest local Striven cache; fresh write verification stays in TM Audit.');
    overview.getRange('B6').setValue('Mapping Status shows the current cached decision; refresh does not certify business writes.');
    overview.getRange('B16').setValue('Automatic Sheet refresh: '+stamp+' Toronto. Operator tabs and Morning Ops refreshed.');
    SpreadsheetApp.flush();
    if(overview.getRange('B2').getValue()!==title)throw Error('SHEET_TIMESTAMP_READBACK_MISMATCH');
    const result={status:'AUTOMATION_SHEETS_REFRESHED',version:TMV3.VERSION,startedAt:startedAt,
      completedAt:new Date().toISOString(),timezone:TMV3_TIMEZONE,rows:counts,
      projectionVerified:true,timestampReadbackVerified:true,sourceMode:'CURRENT_CALENDAR_AND_LOCAL_STRIVEN_CACHE',
      strivenWrites:0,calendarWrites:0,morningOps:morning};
    props.setProperty('TMV3_SHEET_REFRESH_LAST_SUCCESS',JSON.stringify(result));
    props.deleteProperty('TMV3_SHEET_REFRESH_PENDING');props.deleteProperty('TMV3_SHEET_REFRESH_LAST_ERROR');
    tmv3_audit_('SYSTEM','','','AUTOMATIC_SHEET_REFRESH','PASS',JSON.stringify(result));
    Logger.log(JSON.stringify(result));return result;
  } catch(err) {
    props.setProperty('TMV3_SHEET_REFRESH_LAST_ERROR',JSON.stringify({at:new Date().toISOString(),error:String(err && err.message || err)}));
    tmv3_audit_('SYSTEM','','','AUTOMATIC_SHEET_REFRESH','ATTENTION',String(err && err.message || err));
    throw err;
  } finally {lock.releaseLock();}
}
function tmv3_installAutomationSheetRefreshTrigger() {
  const handler='tmv3_scheduledSheetRefresh';
  const existing=ScriptApp.getProjectTriggers().filter(function(t){return t.getHandlerFunction()===handler;});
  if(!existing.length){
    if(ScriptApp.getProjectTriggers().length>=20)throw Error('SHEET_REFRESH_TRIGGER_CAPACITY');
    ScriptApp.newTrigger(handler).timeBased().everyHours(1).create();
  }
  existing.slice(1).forEach(function(t){ScriptApp.deleteTrigger(t);});
  const triggers=tmv3_listTriggers();
  if(triggers.filter(function(t){return t.handler===handler;}).length!==1)throw Error('SHEET_REFRESH_TRIGGER_READBACK_FAILED');
  return {status:'SHEET_REFRESH_TRIGGER_VERIFIED',triggers:triggers};
}
function tmv3_automationSheetRefreshStatus() {
  const p=PropertiesService.getScriptProperties();
  function json(key){const value=p.getProperty(key);return value?JSON.parse(value):null;}
  return {version:TMV3.VERSION,lastSuccess:json('TMV3_SHEET_REFRESH_LAST_SUCCESS'),
    lastError:json('TMV3_SHEET_REFRESH_LAST_ERROR'),pending:p.getProperty('TMV3_SHEET_REFRESH_PENDING')==='true',
    triggers:tmv3_listTriggers()};
}


// Google Apps Script: independent daily execution windows for each vertical.
function tmv3_standardDailySchedule_() {
  return {hours:[8,13,17],timezone:'America/Toronto',verticals:['PreInspection','Install','Delivery','Service']};
}
function tmv3_standardVerticalSlot_(vertical,slot) {
  const result=tmv3_runFullVerticalSweep_(vertical);
  if(vertical==='Install') {
    result.relationships=tmv3_taskFirstProductionCycle_();
    result.reminders=tmv3_installReminderCheck();
  }
  tmv3_audit_(vertical,'','','STANDARD_DAILY_SLOT',result.status,JSON.stringify({slot:slot,result:result}));
  return result;
}
function tmv3_installCheck0800() { return tmv3_standardVerticalSlot_('Install','08:00'); }
function tmv3_installCheck1300() { return tmv3_standardVerticalSlot_('Install','13:00'); }
function tmv3_installCheck1700() { return tmv3_standardVerticalSlot_('Install','17:00'); }
function tmv3_deliveryCheck0800() { return tmv3_standardVerticalSlot_('Delivery','08:00'); }
function tmv3_deliveryCheck1300() { return tmv3_standardVerticalSlot_('Delivery','13:00'); }
function tmv3_deliveryCheck1700() { return tmv3_standardVerticalSlot_('Delivery','17:00'); }
function tmv3_serviceCheck0800() { return tmv3_standardVerticalSlot_('Service','08:00'); }
function tmv3_serviceCheck1300() { return tmv3_standardVerticalSlot_('Service','13:00'); }
function tmv3_serviceCheck1700() { return tmv3_standardVerticalSlot_('Service','17:00'); }

function tmv3_installStandardDailyTriggers() {
  const schedule=tmv3_standardDailySchedule_();
  const handlers=[];
  schedule.verticals.forEach(function(v){
    const prefix=v==='PreInspection'?'preInspection':v.toLowerCase();
    schedule.hours.forEach(function(hour){handlers.push({handler:'tmv3_'+prefix+'Check'+('0'+hour).slice(-2)+'00',hour:hour});});
  });
  // This is the complete V3 schedule. Calendar updates are picked up by the
  // read-only sheet refresh; they no longer initiate business execution.
  const before=ScriptApp.getProjectTriggers();
  const removable=before.filter(function(t){return /^tmv3_/.test(t.getHandlerFunction());});
  const unrelated=before.length-removable.length;
  if(unrelated+handlers.length+2>20)throw Error('STANDARD_SCHEDULE_CAPACITY_NO_CHANGE');
  removable.forEach(function(t){ScriptApp.deleteTrigger(t);});
  handlers.forEach(function(spec){
    ScriptApp.newTrigger(spec.handler).timeBased().atHour(spec.hour).nearMinute(0).everyDays(1).inTimezone(schedule.timezone).create();
  });
  ScriptApp.newTrigger('tmv3_dailySourceRefresh').timeBased().atHour(7).nearMinute(0).everyDays(1).inTimezone(schedule.timezone).create();
  ScriptApp.newTrigger('tmv3_scheduledSheetRefresh').timeBased().everyHours(1).create();
  const triggers=tmv3_listTriggers();
  const expected=handlers.map(function(x){return x.handler;}).concat(['tmv3_dailySourceRefresh','tmv3_scheduledSheetRefresh']);
  if(expected.some(function(h){return triggers.filter(function(t){return t.handler===h;}).length!==1;}) ||
    triggers.some(function(t){return /^tmv3_/.test(t.handler)&&expected.indexOf(t.handler)<0;}))throw Error('STANDARD_SCHEDULE_READBACK_FAILED');
  const result={status:'STANDARD_DAILY_TRIGGERS_VERIFIED',schedule:schedule,triggers:triggers,businessTriggerCount:12,maintenanceTriggerCount:2};
  PropertiesService.getScriptProperties().setProperty('TMV3_STANDARD_SCHEDULE',JSON.stringify(result));
  return result;
}

// Google Apps Script: resume the same daily sweep; no additional recurring window.
function tmv3_runFullVerticalSweep_(vertical) {
  const handler='tmv3_'+vertical.toLowerCase()+'SweepContinue';
  function clear(){ScriptApp.getProjectTriggers().filter(function(t){return t.getHandlerFunction()===handler;}).forEach(function(t){ScriptApp.deleteTrigger(t);});}
  clear();
  // Pre-arm recovery before business execution: survives a native hard timeout.
  if(ScriptApp.getProjectTriggers().length>=20)throw Error('SWEEP_CONTINUATION_CAPACITY');
  ScriptApp.newTrigger(handler).timeBased().after(420000).create();
  const began=Date.now(),result=tmv3_verticalProductionCycle_(vertical);
  clear();
  if(result.status==='LOCK_BUSY'||result.pending>0&&result.status!=='API_BUDGET_WAIT') {
    ScriptApp.newTrigger(handler).timeBased().after(60000).create();
    result.continuation='SCHEDULED';
  }
  result.sheetRefresh=tmv3_refreshAutomationSheetsAfter_(began);
  Logger.log(JSON.stringify(result));return result;
}

function tmv3_installSweepContinue(){return tmv3_runFullVerticalSweep_('Install');}
function tmv3_deliverySweepContinue(){return tmv3_runFullVerticalSweep_('Delivery');}
function tmv3_serviceSweepContinue(){return tmv3_runFullVerticalSweep_('Service');}
function tmv3_verticalPatchDiagnostics(vertical,eventIds) {
  if(['Install','Delivery','Service'].indexOf(vertical)<0)throw Error('VERTICAL_REQUIRED');
  return (eventIds||[]).map(function(id){try{
    const plans=tmv3_step7FreshPlansForEvent_(vertical,id);
    return {eventId:id,plans:plans.map(function(p){return {taskId:p.taskId,plan:p.plan,blocker:p.blocker,actions:p.actions,requestedBy:p.expectedRequestedById,actualRequestedBy:p.actualRequestedById,order:p.expectedOrderId,location:p.expectedLocationId};})};
  }catch(e){return {eventId:id,error:String(e)};}});
}

function tmv3_fullVerticalSweepStatus() {
  const p=PropertiesService.getScriptProperties(),out={version:TMV3.VERSION,budget:tmv3_strivenApiBudgetStatus_(),verticals:{},triggers:tmv3_listTriggers()};
  ['Install','Delivery','Service'].forEach(function(v){
    const state=JSON.parse(p.getProperty('TMV3_VERTICAL_SWEEP_'+v)||'null');
    const recent=JSON.parse(p.getProperty('TMV3_VERTICAL_RESULT_'+v)||'null');
    out.verticals[v]={sweep:state,recent:recent};
  });return out;
}
function tmv3_resumeFullVerticalQueues() {
  ['Delivery','Service','Install'].forEach(function(v){
    const handler='tmv3_'+v.toLowerCase()+'SweepContinue';
    const existing=ScriptApp.getProjectTriggers().filter(function(t){return t.getHandlerFunction()===handler;});
    existing.forEach(function(t){ScriptApp.deleteTrigger(t);});
    if(ScriptApp.getProjectTriggers().length>=20)throw Error('SWEEP_CONTINUATION_CAPACITY');
    ScriptApp.newTrigger(handler).timeBased().after(60000).create();
  });return tmv3_fullVerticalSweepStatus();
}
function tmv3_verticalLinkedTaskDiagnostics(vertical,eventIds) {
  return (eventIds||[]).map(function(id){try{
    const record=tmv3_findFreshEventRecord_(vertical,id);
    const records=tmv3_step4IdentityRecords_(tmv3_step3BusinessAnchorRecords_(tmv3_step2CalendarRecords_([record]),tmv3_step3AnchorIndex_()),tmv3_step4IdentityIndex_());
    const identity=records[0].step4||{},linkedId=record.existingTaskId;
    const fresh=linkedId?tmv3_step7FreshTask_(linkedId,{taskById:{}}):null;
    return {eventId:id,linkedId:linkedId,identity:identity.disposition,expectedCustomer:identity.customer&&identity.customer['Customer ID'],expectedLocation:identity.location&&identity.location['Location ID'],locationStatus:identity.locationStatus,fresh:fresh&&{ok:fresh.ok,error:fresh.error,task:fresh.task}};
  }catch(e){return {eventId:id,error:String(e)};}});
}

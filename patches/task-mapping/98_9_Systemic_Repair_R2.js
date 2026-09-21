/************************************************************
 * 98_9_Systemic_Repair_R2.js
 *
 * LINK-FIRST systemic repair.
 *
 * Public:
 *   REPAIR_ALL_VERTICALS_SYSTEMIC_R2()
 *
 * Acceptance:
 *   This function never returns status SUCCESS unless the final
 *   Calendar Task-link acceptance pass proves that every target
 *   Google Calendar event contains every expected Striven Task URL.
 *
 * Runtime:
 *   Removes the lock-heavy matched PreInspection E2E loop and the
 *   full all-row verifier from the same execution so Calendar
 *   acceptance is reached before Apps Script's execution ceiling.
 ************************************************************/

const TM_SYSTEMIC_REPAIR_R2 = Object.freeze({
  VERSION: 'TM_SYSTEMIC_REPAIR_R2_LINK_FIRST_20260921'
});

function REPAIR_ALL_VERTICALS_SYSTEMIC_R2() {
  const started = new Date();
  const userLock = LockService.getUserLock();

  if (!userLock.tryLock(10000)) {
    throw new Error('Systemic repair R2 is already running for this user.');
  }

  const report = {
    mode: 'SYSTEMIC_ALL_VERTICAL_REPAIR_R2',
    version: TM_SYSTEMIC_REPAIR_R2.VERSION,
    status: 'RUNNING',
    success: false,
    acceptanceRule:
      'SUCCESS only when every target Google Calendar event contains every expected Striven Task URL.',
    phases: [],
    residualIssues: [],
    finalCalendarAcceptance: null,
    startedAt: started.toISOString(),
    finishedAt: '',
    runtimeSeconds: 0
  };

  try {
    tmSystemicR2Phase_(report, '0. CALENDAR TASK LINK ACCEPTANCE — FIRST', function() {
      if (typeof REPAIR_VERIFY_ALL_CALENDAR_TASK_LINKS_R1 !== 'function') {
        throw new Error('Calendar Task-link acceptance engine is unavailable.');
      }

      const acceptance = REPAIR_VERIFY_ALL_CALENDAR_TASK_LINKS_R1();

      if (!acceptance || acceptance.success !== true) {
        throw new Error(
          'Initial Calendar Task-link acceptance incomplete: verified ' +
          String(acceptance && acceptance.verifiedEvents || 0) + '/' +
          String(acceptance && acceptance.targetEvents || 0) +
          '; failed=' +
          String(acceptance && acceptance.failedEvents || 0)
        );
      }

      return acceptance;
    });

    tmSystemicR2Phase_(report, '1. REPORT REFRESH + MAPPING REBUILD', function() {
      return tmSystemicR2RefreshAndRebuild_();
    });

    tmSystemicR2Phase_(report, '1B. CALENDAR TASK LINK ACCEPTANCE — REBUILT MAPPING', function() {
      const acceptance = tmCalendarTaskAcceptanceRun_(false);

      if (!acceptance || acceptance.success !== true) {
        throw new Error(
          'Calendar Task-link acceptance after rebuild is incomplete: failed=' +
          String(acceptance && acceptance.failedEvents || 0)
        );
      }

      return acceptance;
    });

    tmSystemicR2Phase_(report, '2. INSTALL SAFE READY WRITES', function() {
      if (typeof pushSafeChangedInstallRows !== 'function') {
        throw new Error('Install safe-push function is unavailable.');
      }
      return pushSafeChangedInstallRows();
    });

    tmSystemicR2Phase_(report, '3. DELIVERY SAFE READY WRITES', function() {
      if (typeof fillDeliveryMappingIdsFromDeliveryApprovedOrdersFinal === 'function') {
        fillDeliveryMappingIdsFromDeliveryApprovedOrdersFinal();
      }
      if (typeof pushSafeChangedDeliveryRows !== 'function') {
        throw new Error('Delivery safe-push function is unavailable.');
      }
      return pushSafeChangedDeliveryRows();
    });

    if (typeof tmSystemicPauseRateWindow_ === 'function') {
      tmSystemicPauseRateWindow_('R2 before Service relationship verification');
    }

    tmSystemicR2Phase_(report, '4. SERVICE RELATIONSHIP RECONCILIATION', function() {
      if (typeof tmSystemicReconcileServiceRelationships_ !== 'function') {
        throw new Error('Service relationship reconciler is unavailable.');
      }
      return tmSystemicReconcileServiceRelationships_();
    });

    tmSystemicR2Phase_(report, '5. SERVICE DATE + ASSIGNMENT WRITES', function() {
      if (typeof pushSafeChangedServiceRows !== 'function') {
        throw new Error('Service safe-push function is unavailable.');
      }
      return pushSafeChangedServiceRows();
    });

    tmSystemicR2Phase_(
      report,
      '6. SAFE TASK RECOVERY + IMMEDIATE CALENDAR TASK LINK ACCEPTANCE',
      function() {
        return tmSystemicR2RecoveryAndImmediateLinks_(report);
      }
    );

    tmSystemicR2Phase_(report, '7. FINAL CALENDAR TASK LINK ACCEPTANCE', function() {
      const acceptance = tmCalendarTaskAcceptanceRun_(false);
      report.finalCalendarAcceptance = acceptance;

      if (!acceptance || acceptance.success !== true) {
        throw new Error(
          'FINAL Calendar Task-link acceptance failed: verified ' +
          String(acceptance && acceptance.verifiedEvents || 0) + '/' +
          String(acceptance && acceptance.targetEvents || 0) +
          '; failed=' +
          String(acceptance && acceptance.failedEvents || 0)
        );
      }

      return acceptance;
    });

    report.phases.forEach(function(phase) {
      if (phase.status === 'FAIL') {
        report.residualIssues.push(
          phase.name + ': ' + (phase.error || 'failed')
        );
      }
    });

    const calendarSuccess =
      !!(
        report.finalCalendarAcceptance &&
        report.finalCalendarAcceptance.success === true
      );

    report.success =
      calendarSuccess &&
      report.residualIssues.length === 0;

    report.status = report.success
      ? 'SUCCESS'
      : (
          calendarSuccess
            ? 'CALENDAR_LINKS_SUCCESS_WITH_RESIDUAL_REVIEW'
            : 'FAILED_CALENDAR_TASK_LINK_ACCEPTANCE'
        );

    report.finishedAt = new Date().toISOString();
    report.runtimeSeconds = Math.round(
      (new Date().getTime() - started.getTime()) / 1000
    );

    Logger.log('============================================================');
    Logger.log('SYSTEMIC R2: ' + report.status);
    Logger.log('============================================================');
    Logger.log(JSON.stringify({
      version: report.version,
      status: report.status,
      success: report.success,
      acceptanceRule: report.acceptanceRule,
      finalCalendarAcceptance: report.finalCalendarAcceptance
        ? {
            status: report.finalCalendarAcceptance.status,
            success: report.finalCalendarAcceptance.success,
            targetEvents: report.finalCalendarAcceptance.targetEvents,
            expectedTaskLinks: report.finalCalendarAcceptance.expectedTaskLinks,
            verifiedEvents: report.finalCalendarAcceptance.verifiedEvents,
            verifiedTaskLinks: report.finalCalendarAcceptance.verifiedTaskLinks,
            failedEvents: report.finalCalendarAcceptance.failedEvents
          }
        : null,
      residualIssues: report.residualIssues,
      phases: report.phases.map(function(phase) {
        return {
          name: phase.name,
          status: phase.status,
          runtimeSeconds: phase.runtimeSeconds,
          error: phase.error || ''
        };
      }),
      runtimeSeconds: report.runtimeSeconds
    }, null, 2));

    return report;
  } finally {
    userLock.releaseLock();
  }
}

function tmSystemicR2Phase_(report, name, fn) {
  const started = new Date();
  const phase = {
    name: name,
    status: 'RUNNING',
    result: null,
    error: ''
  };

  report.phases.push(phase);
  Logger.log('SYSTEMIC R2 START: ' + name);

  try {
    phase.result = fn();
    phase.status = 'PASS';
    Logger.log('SYSTEMIC R2 PASS: ' + name);
  } catch (err) {
    phase.status = 'FAIL';
    phase.error = String(err && err.message ? err.message : err);
    Logger.log('SYSTEMIC R2 FAIL: ' + name + ' — ' + phase.error);
  }

  phase.runtimeSeconds = Math.round(
    (new Date().getTime() - started.getTime()) / 1000
  );

  return phase;
}

function tmSystemicR2RefreshAndRebuild_() {
  const out = {
    refresh: {},
    rebuild: {},
    preinspectLookupBatches: []
  };

  function run(name, fnName) {
    const fn = globalThis[fnName];

    if (typeof fn !== 'function') {
      out.refresh[name] = {
        status: 'FUNCTION_MISSING',
        functionName: fnName
      };
      return null;
    }

    const value = fn();
    out.refresh[name] = value;
    return value;
  }

  // Phase 0 already refreshed all Calendar mirrors from Google Calendar.
  // Refresh only the Striven/report surfaces here.
  run('approvedSalesOrders', 'syncApprovedSalesOrdersToSheet');
  run('installTasks', 'syncStrivenTasksToSheet');
  run('deliveryApprovedOrders', 'syncDeliveryApprovedOrdersToSheet');
  run('deliveryTasks', 'syncDeliveryTasksToSheet');
  run('serviceWorkOrders', 'syncStrivenServiceWorkOrdersToSheet');
  run('serviceTasks', 'syncStrivenServiceTasksToSheet');

  if (typeof buildInstallTaskMappingFromSheets === 'function') {
    out.rebuild.install = buildInstallTaskMappingFromSheets();
  }

  if (typeof buildDeliveryTaskMappingFromSheets === 'function') {
    out.rebuild.delivery = buildDeliveryTaskMappingFromSheets();

    if (typeof fillDeliveryMappingIdsFromDeliveryApprovedOrdersFinal === 'function') {
      out.rebuild.deliveryIdFill =
        fillDeliveryMappingIdsFromDeliveryApprovedOrdersFinal();
    }
  }

  if (typeof buildServiceTaskMappingFromSheets === 'function') {
    out.rebuild.service = buildServiceTaskMappingFromSheets();
  }

  if (typeof buildPreInspectTaskMapping === 'function') {
    out.rebuild.preInspection = buildPreInspectTaskMapping();

    if (typeof reviewNextPreInspectMappingBatch === 'function') {
      for (let i = 0; i < 20; i++) {
        const batch = reviewNextPreInspectMappingBatch();
        out.preinspectLookupBatches.push(batch);

        if (!batch || !Number(batch.processed || 0)) break;
        if (Number(batch.remainingPending || batch.remaining || 0) <= 0) {
          break;
        }
      }
    }
  }

  SpreadsheetApp.flush();
  return out;
}

function tmSystemicR2RecoveryAndImmediateLinks_(report) {
  if (typeof taskRecoveryRunDivisionWorkflowSilent_ !== 'function') {
    throw new Error('Task recovery function is unavailable.');
  }

  const out = {
    status: 'COMPLETE',
    divisions: {},
    createdTaskCalendarAcceptance: [],
    recoveryErrors: []
  };

  ['Install', 'Delivery', 'Service', 'PreInspect'].forEach(function(division) {
    let divisionResult;

    try {
      divisionResult =
        taskRecoveryRunDivisionWorkflowSilent_(division);
    } catch (err) {
      const message = String(err && err.message ? err.message : err);

      out.divisions[division] = {
        status: 'ERROR_CONTINUED',
        error: message
      };

      out.recoveryErrors.push(division + ': ' + message);
      return;
    }

    out.divisions[division] = divisionResult;

    (divisionResult && divisionResult.errors || []).forEach(function(message) {
      out.recoveryErrors.push(
        division + ': ' + String(message || '')
      );
    });

    const acceptanceDivision =
      division === 'PreInspect'
        ? 'PreInspection'
        : division;

    (divisionResult && divisionResult.rows || []).forEach(function(rowResult) {
      const raw = rowResult && rowResult.rawResult
        ? rowResult.rawResult
        : null;

      const newTaskId = Number(
        rowResult && rowResult.newTaskId ||
        raw && raw.newTaskId ||
        0
      );

      const eventId = String(
        rowResult && rowResult.eventId ||
        raw && raw.eventId ||
        ''
      ).trim();

      if (!newTaskId || !eventId) return;

      try {
        if (typeof tmCalendarTaskAcceptanceEnsureTaskLink_ !== 'function') {
          throw new Error(
            'Calendar Task-link acceptance helper is unavailable after task creation.'
          );
        }

        const acceptance =
          tmCalendarTaskAcceptanceEnsureTaskLink_(
            acceptanceDivision,
            eventId,
            newTaskId,
            ''
          );

        rowResult.calendarAcceptance = acceptance;
        if (raw) raw.calendarLinkResult = acceptance;

        out.createdTaskCalendarAcceptance.push({
          division: acceptanceDivision,
          eventId: eventId,
          taskId: newTaskId,
          status: acceptance.status,
          readBackVerified: !!acceptance.readBackVerified
        });

        if (!acceptance.readBackVerified) {
          rowResult.status = 'CREATED_NEEDS_REVIEW';
          out.recoveryErrors.push(
            acceptanceDivision +
            ' Task ' + newTaskId +
            ': Calendar Task-link read-back was not verified.'
          );
        }
      } catch (linkErr) {
        const message = String(
          linkErr && linkErr.message ? linkErr.message : linkErr
        );

        rowResult.status = 'CREATED_NEEDS_REVIEW';
        rowResult.calendarAcceptance = {
          status: 'FAILED',
          readBackVerified: false,
          error: message
        };

        out.createdTaskCalendarAcceptance.push({
          division: acceptanceDivision,
          eventId: eventId,
          taskId: newTaskId,
          status: 'FAILED',
          readBackVerified: false,
          error: message
        });

        out.recoveryErrors.push(
          acceptanceDivision +
          ' Task ' + newTaskId +
          ': Calendar Task-link acceptance failed: ' +
          message
        );
      }
    });
  });

  if (out.recoveryErrors.length) {
    report.residualIssues.push.apply(
      report.residualIssues,
      out.recoveryErrors
    );
    out.status = 'COMPLETE_WITH_REVIEW';
  }

  return out;
}

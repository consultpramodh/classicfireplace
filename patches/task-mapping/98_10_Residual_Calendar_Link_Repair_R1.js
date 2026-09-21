/************************************************************
 * 98_10_Residual_Calendar_Link_Repair_R1.js
 *
 * PUBLIC:
 *   REPAIR_RESIDUAL_CALENDAR_TASK_LINKS_R1()
 *
 * Purpose:
 * - Re-run guarded Install recovery after desired/current ID
 *   priority is corrected.
 * - Immediately re-run all-vertical Calendar Task-link acceptance.
 * - SUCCESS is impossible unless final Calendar read-back proves
 *   every target event contains every expected Task URL.
 ************************************************************/

function REPAIR_RESIDUAL_CALENDAR_TASK_LINKS_R1() {
  const started = new Date();

  const result = {
    mode: 'RESIDUAL_CALENDAR_TASK_LINK_REPAIR_R1',
    version: 'TM_RESIDUAL_CALENDAR_LINK_REPAIR_R1B_CALENDAR_TRUTH_20260921',
    status: 'RUNNING',
    success: false,
    installRecovery: null,
    calendarAcceptance: null,
    startedAt: started.toISOString(),
    finishedAt: '',
    runtimeSeconds: 0
  };

  if (typeof taskRecoveryRunDivisionWorkflowSilent_ !== 'function') {
    throw new Error('Install task recovery function is unavailable.');
  }

  result.installRecovery =
    taskRecoveryRunDivisionWorkflowSilent_('Install');

  if (typeof REPAIR_VERIFY_ALL_CALENDAR_TASK_LINKS_R1 !== 'function') {
    throw new Error('Calendar Task-link acceptance function is unavailable.');
  }

  result.calendarAcceptance =
    REPAIR_VERIFY_ALL_CALENDAR_TASK_LINKS_R1();

  const recoveryErrors =
    result.installRecovery &&
    Array.isArray(result.installRecovery.errors)
      ? result.installRecovery.errors
      : [];

  const unresolvedRecoveryRows =
    result.installRecovery &&
    Array.isArray(result.installRecovery.rows)
      ? result.installRecovery.rows.filter(function(row) {
          const status = String(row && row.status || '').toUpperCase();
          return status === 'ERROR' || status === 'REVIEW';
        })
      : [];

  result.recoveryGate = {
    pass:
      recoveryErrors.length === 0 &&
      unresolvedRecoveryRows.length === 0,
    errorCount: recoveryErrors.length,
    unresolvedRows: unresolvedRecoveryRows.map(function(row) {
      return {
        rowNumber: row.rowNumber || null,
        status: row.status || '',
        sourceTaskId: row.sourceTaskId || null,
        newTaskId: row.newTaskId || null,
        reason: row.reason || row.message || ''
      };
    })
  };

  result.calendarLinkSuccess =
    !!(
      result.calendarAcceptance &&
      result.calendarAcceptance.success === true
    );

  result.success =
    result.calendarLinkSuccess &&
    result.recoveryGate.pass === true;

  if (result.success) {
    result.status = 'SUCCESS';
  } else if (
    result.calendarLinkSuccess &&
    !result.recoveryGate.pass
  ) {
    result.status = 'CALENDAR_LINKS_SUCCESS_WITH_RESIDUAL_RECOVERY_REVIEW';
  } else if (
    !result.calendarLinkSuccess &&
    result.recoveryGate.pass
  ) {
    result.status = 'FAILED_CALENDAR_TASK_LINK_ACCEPTANCE';
  } else {
    result.status = 'FAILED_TASK_RECOVERY_AND_CALENDAR_ACCEPTANCE';
  }

  result.finishedAt = new Date().toISOString();
  result.runtimeSeconds = Math.round(
    (new Date().getTime() - started.getTime()) / 1000
  );

  Logger.log('============================================================');
  Logger.log('RESIDUAL CALENDAR TASK LINK REPAIR: ' + result.status);
  Logger.log('============================================================');
  Logger.log(JSON.stringify({
    version: result.version,
    status: result.status,
    success: result.success,
    calendarLinkSuccess: result.calendarLinkSuccess,
    installRecoveryStatus:
      result.installRecovery && result.installRecovery.status || '',
    recoveryGate: result.recoveryGate || null,
    calendarAcceptance: result.calendarAcceptance
      ? {
          status: result.calendarAcceptance.status,
          success: result.calendarAcceptance.success,
          targetEvents: result.calendarAcceptance.targetEvents,
          expectedTaskLinks: result.calendarAcceptance.expectedTaskLinks,
          verifiedEvents: result.calendarAcceptance.verifiedEvents,
          verifiedTaskLinks: result.calendarAcceptance.verifiedTaskLinks,
          failedEvents: result.calendarAcceptance.failedEvents,
          failures: result.calendarAcceptance.failures
        }
      : null,
    runtimeSeconds: result.runtimeSeconds
  }, null, 2));

  return result;
}

/** Google Apps Script prototype only; NOT DEPLOYABLE: requires guarded handler integration and durable timeout recovery. */
function tmv3_continueTriggerName_(vertical) {
  const names = {PreInspection:'tmv3_preInspectionContinueEligibleSweep', Install:'tmv3_installSweepContinue', Delivery:'tmv3_deliverySweepContinue', Service:'tmv3_serviceSweepContinue'};
  if (!names[vertical]) throw Error('CONTINUATION_INVALID_VERTICAL');
  return names[vertical];
}

function tmv3_consumeContinuationTrigger_(e, vertical) {
  const uid = e && String(e.triggerUid || '');
  if (!uid) throw Error('CONTINUATION_TRIGGER_ID_REQUIRED');
  const handler = tmv3_continueTriggerName_(vertical);
  const matches = ScriptApp.getProjectTriggers().filter(function(t) {return t.getHandlerFunction() === handler && String(t.getUniqueId()) === uid;});
  if (matches.length !== 1) throw Error('CONTINUATION_TRIGGER_ID_NOT_UNIQUE');
  ScriptApp.deleteTrigger(matches[0]);
}

function tmv3_queueContinuation_(vertical, ignoreTriggerUid) {
  const handler = tmv3_continueTriggerName_(vertical);
  const lock = LockService.getUserLock();
  if (!lock.tryLock(30000)) return {status:'CONTINUATION_SCHEDULER_LOCK_BUSY'};
  try {
    const existing = ScriptApp.getProjectTriggers().filter(function(t) {return t.getHandlerFunction() === handler && (!ignoreTriggerUid || String(t.getUniqueId()) !== String(ignoreTriggerUid));});
    if (existing.length > 1) return {status:'CONTINUATION_DUPLICATE_REVIEW'};
    if (existing.length === 1) return {status:'CONTINUATION_ALREADY_QUEUED',triggerId:String(existing[0].getUniqueId())};
    if (ScriptApp.getProjectTriggers().length >= 20) return {status:'CONTINUATION_TRIGGER_LIMIT'};
    const hour = Number(Utilities.formatDate(new Date(), 'America/Toronto', 'H'));
    const dueHour = Number(Utilities.formatDate(new Date(Date.now() + 120000), 'America/Toronto', 'H'));
    if (hour < 6 || hour >= 20 || dueHour < 6 || dueHour >= 20) return {status:'CONTINUATION_OUTSIDE_WINDOW'};
    const trigger = ScriptApp.newTrigger(handler).timeBased().after(120000).create();
    return {status:'CONTINUATION_QUEUED', triggerId:String(trigger.getUniqueId())};
  } finally {lock.releaseLock();}
}

function tmv3_runQueuedContinuation_(vertical, e) {
  const uid = e && String(e.triggerUid || '');
  if (!uid) throw Error('CONTINUATION_TRIGGER_ID_REQUIRED');
  const hour = Number(Utilities.formatDate(new Date(), 'America/Toronto', 'H'));
  if (hour < 6 || hour >= 20) {
    tmv3_consumeContinuationTrigger_(e, vertical);
    return {status:'CONTINUATION_OUTSIDE_WINDOW'};
  }
  // Pre-arm a successor before deleting the fired trigger or doing business work.
  // If this execution times out, the successor retains the ability to retry.
  const watchdog = tmv3_queueContinuation_(vertical, uid);
  if (['CONTINUATION_QUEUED','CONTINUATION_ALREADY_QUEUED'].indexOf(watchdog.status) < 0) {
    return {status:'CONTINUATION_NOT_STARTED', reason:watchdog.status};
  }
  tmv3_consumeContinuationTrigger_(e, vertical);
  const result = vertical === 'PreInspection' ? tmv3_resumePreInspectionSweep_() : tmv3_runFullVerticalSweep_(vertical);
  const pending = result.status === 'LOCK_BUSY' || Number(result.pending || 0) > 0 || Number(result.sweep && result.sweep.remaining || 0) > 0;
  const pause = result.status === 'API_BUDGET_WAIT' || (result.status === 'ATTENTION' && !!result.error);
  if (!pending || pause) {
    const handler = tmv3_continueTriggerName_(vertical);
    ScriptApp.getProjectTriggers().filter(function(t) { return t.getHandlerFunction() === handler && String(t.getUniqueId()) === String(watchdog.triggerId); }).forEach(function(t) { ScriptApp.deleteTrigger(t); });
  }
  return result;
}

/** Prototype: resume a persisted pre-inspection sweep without repeating its full notification scan. */
function tmv3_resumePreInspectionSweep_() {
  const props = PropertiesService.getScriptProperties();
  let state = null;
  try { state = JSON.parse(props.getProperty('TMV3_PI_SWEEP_STATE') || 'null'); } catch (error) { throw Error('PREINSPECTION_SWEEP_STATE_INVALID'); }
  const startedAt = state && new Date(state.startedAt).getTime();
  const valid = state && state.status === 'IN_PROGRESS' && isFinite(startedAt) &&
    Date.now() - startedAt >= 0 && Date.now() - startedAt < 86400000;
  const options = {force:true,reason:'CONTINUATION'};
  if (valid) options.sweepContinue = true; else options.sweepStart = true;
  const result = tmv3_preInspectionAutomationCycle_(options);
  tmv3_preInspectionLogSweep_('CONTINUATION',result);
  return result;
}

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
  PropertiesService.getScriptProperties().deleteProperty('TMV3_WATCHDOG_BASELINE_' + uid);
}

function tmv3_queueContinuation_(vertical, ignoreTriggerUid, baselineRaw) {
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
    const props = PropertiesService.getScriptProperties();
    if (vertical === 'PreInspection' && typeof baselineRaw !== 'string') return {status:'CONTINUATION_BASELINE_REQUIRED'};
    const day = Utilities.formatDate(new Date(), 'America/Toronto', 'yyyy-MM-dd');
    const key = 'TMV3_CONTINUATION_ATTEMPTS_' + vertical + '_' + day;
    const raw = props.getProperty(key);
    if (raw !== null && !/^\d+$/.test(String(raw))) return {status:'CONTINUATION_COUNTER_INVALID'};
    const attempts = Number(raw || 0);
    if (attempts >= 12) return {status:'CONTINUATION_RETRY_LIMIT'};
    const trigger = ScriptApp.newTrigger(handler).timeBased().after(120000).create();
    const baselineKey = 'TMV3_WATCHDOG_BASELINE_' + String(trigger.getUniqueId());
    try {
      if (vertical === 'PreInspection') props.setProperty(baselineKey,JSON.stringify({baseline:baselineRaw}));
      props.setProperty(key,String(attempts + 1));
    } catch (error) { try { ScriptApp.deleteTrigger(trigger); props.deleteProperty(baselineKey); } catch (cleanup) {} throw error; }
    return {status:'CONTINUATION_QUEUED', triggerId:String(trigger.getUniqueId()), attempts:attempts + 1};
  } finally {lock.releaseLock();}
}

function tmv3_runQueuedContinuation_(vertical, e) {
  const uid = e && String(e.triggerUid || '');
  if (!uid) throw Error('CONTINUATION_TRIGGER_ID_REQUIRED');
  const matching = ScriptApp.getProjectTriggers().filter(function(t) {return t.getHandlerFunction() === tmv3_continueTriggerName_(vertical) && String(t.getUniqueId()) === uid;});
  if (matching.length !== 1) throw Error('CONTINUATION_TRIGGER_ID_NOT_UNIQUE');
  const hour = Number(Utilities.formatDate(new Date(), 'America/Toronto', 'H'));
  if (hour < 6 || hour >= 20) {
    tmv3_consumeContinuationTrigger_(e, vertical);
    return {status:'CONTINUATION_OUTSIDE_WINDOW'};
  }
  let baseline;
  if (vertical === 'PreInspection') {
    const raw = PropertiesService.getScriptProperties().getProperty('TMV3_WATCHDOG_BASELINE_' + uid);
    if (!raw) throw Error('PREINSPECTION_WATCHDOG_BASELINE_MISSING');
    try { baseline = JSON.parse(raw).baseline; } catch (error) { throw Error('PREINSPECTION_WATCHDOG_BASELINE_INVALID'); }
    if (typeof baseline !== 'string') throw Error('PREINSPECTION_WATCHDOG_BASELINE_INVALID');
  }
  // Pre-arm a successor before deleting the fired trigger or doing business work.
  // If this execution times out, the successor retains the ability to retry.
  const watchdog = tmv3_queueContinuation_(vertical, uid, baseline);
  if (['CONTINUATION_QUEUED','CONTINUATION_ALREADY_QUEUED'].indexOf(watchdog.status) < 0) {
    tmv3_consumeContinuationTrigger_(e, vertical);
    PropertiesService.getScriptProperties().setProperty('TMV3_CONTINUATION_ATTENTION_' + vertical,JSON.stringify({at:new Date().toISOString(),reason:watchdog.status}));
    return {status:'CONTINUATION_NOT_STARTED', reason:watchdog.status};
  }
  tmv3_consumeContinuationTrigger_(e, vertical);
  const result = vertical === 'PreInspection' ? tmv3_resumePreInspectionSweep_(baseline) : tmv3_runFullVerticalSweep_(vertical);
  if (Number(result.processed || 0) > 0 || Number(result.scanned || 0) > 0) {
    const day = Utilities.formatDate(new Date(), 'America/Toronto', 'yyyy-MM-dd');
    PropertiesService.getScriptProperties().deleteProperty('TMV3_CONTINUATION_ATTEMPTS_' + vertical + '_' + day);
  }
  const pending = result.status === 'LOCK_BUSY' || Number(result.pending || 0) > 0 || Number(result.sweep && result.sweep.remaining || 0) > 0;
  const pause = result.status === 'API_BUDGET_WAIT' || (result.status === 'ATTENTION' && !!result.error);
  if ((!pending || pause) && watchdog.status === 'CONTINUATION_QUEUED') {
    const handler = tmv3_continueTriggerName_(vertical);
    ScriptApp.getProjectTriggers().filter(function(t) { return t.getHandlerFunction() === handler && String(t.getUniqueId()) === String(watchdog.triggerId); }).forEach(function(t) { const id=String(t.getUniqueId()); ScriptApp.deleteTrigger(t); PropertiesService.getScriptProperties().deleteProperty('TMV3_WATCHDOG_BASELINE_' + id); });
  }
  return result;
}

/** Prototype: resume a persisted pre-inspection sweep without repeating its full notification scan. */
function tmv3_resumePreInspectionSweep_(baselineRaw) {
  if (typeof baselineRaw !== 'string') throw Error('PREINSPECTION_WATCHDOG_BASELINE_REQUIRED');
  const result = tmv3_preInspectionAutomationCycle_({force:true,reason:'CONTINUATION',watchdogBaseline:baselineRaw});
  tmv3_preInspectionLogSweep_('CONTINUATION',result);
  return result;
}

/** Prototype: pre-arm recovery before the first business batch; not wired to live handlers. */
function tmv3_withInitialSweepWatchdog_(vertical, operation) {
  if (typeof operation !== 'function') throw Error('INITIAL_SWEEP_OPERATION_REQUIRED');
  const baseline = vertical === 'PreInspection' ? (PropertiesService.getScriptProperties().getProperty('TMV3_PI_SWEEP_STATE') || '') : undefined;
  const watchdog = tmv3_queueContinuation_(vertical, null, baseline);
  if (watchdog.status !== 'CONTINUATION_QUEUED') {
    PropertiesService.getScriptProperties().setProperty('TMV3_CONTINUATION_ATTENTION_' + vertical,JSON.stringify({at:new Date().toISOString(),reason:watchdog.status}));
    return {status:'INITIAL_SWEEP_NOT_STARTED',reason:watchdog.status};
  }
  const result = operation();
  if (Number(result.processed || 0) > 0 || Number(result.scanned || 0) > 0) {
    const day = Utilities.formatDate(new Date(), 'America/Toronto', 'yyyy-MM-dd');
    PropertiesService.getScriptProperties().deleteProperty('TMV3_CONTINUATION_ATTEMPTS_' + vertical + '_' + day);
  }
  const pending = result.status === 'LOCK_BUSY' || Number(result.pending || 0) > 0 || Number(result.sweep && result.sweep.remaining || 0) > 0;
  const pause = result.status === 'API_BUDGET_WAIT' || (result.status === 'ATTENTION' && !!result.error);
  if ((!pending || pause) && watchdog.status === 'CONTINUATION_QUEUED') {
    const handler = tmv3_continueTriggerName_(vertical);
    ScriptApp.getProjectTriggers().filter(function(t) { return t.getHandlerFunction() === handler && String(t.getUniqueId()) === String(watchdog.triggerId); }).forEach(function(t) { const id=String(t.getUniqueId()); ScriptApp.deleteTrigger(t); PropertiesService.getScriptProperties().deleteProperty('TMV3_WATCHDOG_BASELINE_' + id); });
  }
  return result;
}

/** Draft decision; caller MUST compare the snapshot while holding the business script lock. */
function tmv3_preInspectionResumeDecision_(baselineRaw, currentRaw) {
  const before = baselineRaw || '';
  const now = currentRaw || '';
  let state = null;
  if (before) {
    try { const prior = JSON.parse(before); if (!prior || typeof prior !== 'object' || Array.isArray(prior)) return 'INVALID'; } catch (error) { return 'INVALID'; }
  }
  if (now) {
    try { state = JSON.parse(now); } catch (error) { return 'INVALID'; }
    if (!state || typeof state !== 'object' || Array.isArray(state)) return 'INVALID';
  }
  if (state && ['IN_PROGRESS','COMPLETE','SCANNED_WITH_PENDING_REVIEW'].indexOf(state.status) < 0) return 'INVALID';
  if (state && state.status === 'IN_PROGRESS') {
    const age=Date.now()-new Date(state.startedAt).getTime();
    if (!isFinite(age) || age < 0) return 'INVALID';
    if (age >= 86400000) return before === now ? 'START' : 'REVIEW';
    return 'CONTINUE';
  }
  if (before !== now) {
    if (state && (state.status === 'COMPLETE' || state.status === 'SCANNED_WITH_PENDING_REVIEW')) return 'FINISHED';
    return 'REVIEW';
  }
  return 'START';
}

/** Google Apps Script prototype only; NOT DEPLOYABLE: requires tmv3_resumePreInspectionSweep_ and handler integration. */
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

function tmv3_queueContinuation_(vertical) {
  const handler = tmv3_continueTriggerName_(vertical);
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return {status:'CONTINUATION_LOCK_BUSY'};
  try {
    const existing = ScriptApp.getProjectTriggers().filter(function(t) {return t.getHandlerFunction() === handler;});
    if (existing.length > 1) return {status:'CONTINUATION_DUPLICATE_REVIEW'};
    if (existing.length === 1) return {status:'CONTINUATION_ALREADY_QUEUED'};
    if (ScriptApp.getProjectTriggers().length >= 20) return {status:'CONTINUATION_TRIGGER_LIMIT'};
    const hour = Number(Utilities.formatDate(new Date(), 'America/Toronto', 'H'));
    const dueHour = Number(Utilities.formatDate(new Date(Date.now() + 120000), 'America/Toronto', 'H'));
    if (hour < 6 || hour >= 20 || dueHour < 6 || dueHour >= 20) return {status:'CONTINUATION_OUTSIDE_WINDOW'};
    const trigger = ScriptApp.newTrigger(handler).timeBased().after(120000).create();
    return {status:'CONTINUATION_QUEUED', triggerId:String(trigger.getUniqueId())};
  } finally {lock.releaseLock();}
}

function tmv3_runQueuedContinuation_(vertical, e) {
  tmv3_consumeContinuationTrigger_(e, vertical);
  const hour = Number(Utilities.formatDate(new Date(), 'America/Toronto', 'H'));
  if (hour < 6 || hour >= 20) return {status:'CONTINUATION_OUTSIDE_WINDOW'};
  if (vertical === 'PreInspection') return tmv3_resumePreInspectionSweep_();
  return tmv3_runFullVerticalSweep_(vertical);
}

/** Google Apps Script candidate. Five-minute heartbeat; not installed or deployable yet. */
function tmv3_dispatchClockPlan_(now, state, localDay, localHour) {
  if (!Number.isFinite(now) || typeof localDay!=='string' || !/^\d{4}-\d\d-\d\d$/.test(localDay) || !Number.isInteger(localHour) || localHour<0 || localHour>23) throw Error('DISPATCH_INVALID_TIME');
  if (localHour<6 || localHour>=20) return {action:'OUTSIDE_WINDOW'};
  if (state && state.status!=='COMPLETE') return {action:'TICK'};
  if ([6,11,16].indexOf(localHour)<0) return {action:'WAIT_FOR_SLOT'};
  const slot=localDay+'T'+String(localHour).padStart(2,'0');
  if (state && state.slot===slot) return {action:'ALREADY_RUN'};
  return {action:'START',slot:slot};
}
function tmv3_dispatchHeartbeat_() {
  const now=Date.now(),day=Utilities.formatDate(new Date(now),'America/Toronto','yyyy-MM-dd'),hour=Number(Utilities.formatDate(new Date(now),'America/Toronto','H'));
  const props=PropertiesService.getScriptProperties(),lock=LockService.getScriptLock();
  if (!lock.tryLock(1000)) return {status:'COORDINATOR_LOCK_BUSY'};
  let plan;
  try {
    const state=tmv3_dispatchRead_(props);plan=tmv3_dispatchClockPlan_(now,state,day,hour);
    if (plan.action==='START') {
      const fresh=tmv3_dispatchStart_(Utilities.getUuid(),now);fresh.slot=plan.slot;
      tmv3_dispatchSave_(props,fresh);
    }
  } finally {lock.releaseLock();}
  if (plan.action!=='TICK' && plan.action!=='START') return {status:plan.action};
  return tmv3_dispatchTick_(tmv3_dispatchBusinessBatch_,now,function(){return Utilities.getUuid();});
}

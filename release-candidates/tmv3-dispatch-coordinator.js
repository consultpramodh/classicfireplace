/** Google Apps Script candidate: durable dispatcher coordinator. NOT DEPLOYABLE until hooks,
 * scheduling, business integration, notifications and trigger cutover are verified. */
const TMV3_DISPATCH_KEY = 'TMV3_DISPATCH_COORDINATOR_V1';
const TMV3_DISPATCH_MAX_AGE_MS = 35 * 60 * 1000;
function tmv3_dispatchRead_(props) {
  const raw=props.getProperty(TMV3_DISPATCH_KEY);
  if (!raw) return null;
  let s; try { s=JSON.parse(raw); } catch(e) { throw Error('DISPATCH_CORRUPT_STATE'); }
  tmv3_dispatchValidate_(s);
  if (s.status==='RUNNING' && (!Number.isFinite(s.claimedAt) || s.claimedAt<0)) throw Error('DISPATCH_CORRUPT_CLAIM');
  return s;
}
function tmv3_dispatchSave_(props,s) {
  tmv3_dispatchValidate_(s);
  const raw=JSON.stringify(s);
  if (raw.length>7000) throw Error('DISPATCH_STATE_TOO_LARGE');
  props.setProperty(TMV3_DISPATCH_KEY,raw);
}
/** Must be called while the script lock is held. */
function tmv3_dispatchClaimDurable_(props,now,makeId) {
  let s=tmv3_dispatchRead_(props);
  if (!s) return {status:'NO_CYCLE'};
  if (s.status==='RUNNING') {
    if (now<s.claimedAt) return {status:'CLOCK_INVALID'};
    if (now-s.claimedAt>=TMV3_DISPATCH_MAX_AGE_MS) {
      // A timeout does not prove a remote write failed. Block instead of retrying.
      s=Object.assign({},s,{status:'ATTENTION',attemptId:null,reason:'STALE_RUNNING_RECONCILE'});
      tmv3_dispatchSave_(props,s);
      return {status:'ATTENTION',reason:s.reason};
    }
    return {status:'ALREADY_RUNNING'};
  }
  if (s.status!=='READY') return {status:s.status};
  const attemptId=makeId();
  s=Object.assign({},tmv3_dispatchClaim_(s,attemptId),{claimedAt:now});
  tmv3_dispatchSave_(props,s);
  return {status:'CLAIMED',cycleId:s.cycleId,attemptId:attemptId,vertical:TMV3_DISPATCH_ORDER[s.index],firstBatch:!s.startedVerticals || !s.startedVerticals[TMV3_DISPATCH_ORDER[s.index]]};
}
/** Must be called while the script lock is held. */
function tmv3_dispatchCommitDurable_(props,claim,classification,result) {
  const s=tmv3_dispatchRead_(props);
  if (!s || s.status!=='RUNNING' || s.cycleId!==claim.cycleId || s.attemptId!==claim.attemptId || TMV3_DISPATCH_ORDER[s.index]!==claim.vertical) return {status:'STALE_ATTEMPT'};
  let next=tmv3_dispatchFinish_(s,claim.cycleId,claim.attemptId,classification.outcome);
  // Keep state bounded: detailed event data stays in the existing audit logs.
  next.outcomes=next.outcomes.slice(-20);
  next.lastReason=classification.reason;
  next.lastReviewCount=Number(classification.reviewCount || 0);
  next.startedVerticals=Object.assign({},s.startedVerticals||{});
  if (result && result.sweep) next.startedVerticals[claim.vertical]=true;
  tmv3_dispatchSave_(props,next);
  return {status:next.status,reason:classification.reason,index:next.index};
}
/** One tick; caller supplies a tested business adapter. Never hold script lock during business work. */
function tmv3_dispatchTick_(adapter,now,makeId) {
  if (typeof adapter!=='function' || typeof makeId!=='function' || !Number.isFinite(now)) throw Error('DISPATCH_INVALID_ARGUMENT');
  const props=PropertiesService.getScriptProperties(),lock=LockService.getScriptLock();
  if (!lock.tryLock(1000)) return {status:'COORDINATOR_LOCK_BUSY'};
  let claim;
  try { claim=tmv3_dispatchClaimDurable_(props,now,makeId); } finally { lock.releaseLock(); }
  if (claim.status!=='CLAIMED') return claim;
  let result,classification;
  try { result=adapter(claim.vertical,claim.firstBatch,claim); classification=tmv3_dispatchClassifyBatch_(claim.vertical,result); }
  catch(e) { result=null; classification={outcome:'UNCERTAIN',reason:'ADAPTER_EXCEPTION'}; }
  if (!lock.tryLock(1000)) return {status:'COMMIT_LOCK_BUSY',cycleId:claim.cycleId,attemptId:claim.attemptId};
  try { return tmv3_dispatchCommitDurable_(props,claim,classification,result); } finally { lock.releaseLock(); }
}

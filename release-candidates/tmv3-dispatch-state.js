/** Google Apps Script prototype: pure state transitions only. NOT WIRED OR DEPLOYABLE. */
const TMV3_DISPATCH_ORDER = Object.freeze(['PreInspection','Install','Delivery','Service']);
function tmv3_dispatchStart_(cycleId, startTime) {
  if (typeof cycleId !== 'string' || !cycleId || !Number.isFinite(startTime)) throw Error('DISPATCH_INVALID_CYCLE');
  return {cycleId:cycleId, startedAt:startTime, index:0, status:'READY', attemptId:null, outcomes:[]};
}
function tmv3_dispatchClaim_(state, attemptId) {
  tmv3_dispatchValidate_(state);
  if (state.status !== 'READY' || typeof attemptId !== 'string' || !attemptId) throw Error('DISPATCH_CLAIM_REJECTED');
  return Object.assign({},state,{status:'RUNNING',attemptId:attemptId});
}
function tmv3_dispatchFinish_(state, cycleId, attemptId, outcome) {
  tmv3_dispatchValidate_(state);
  if (state.status !== 'RUNNING' || state.cycleId !== cycleId || state.attemptId !== attemptId) throw Error('DISPATCH_STALE_ATTEMPT');
  if (['COMPLETE','PENDING','BLOCKED','UNCERTAIN'].indexOf(outcome)<0) throw Error('DISPATCH_INVALID_OUTCOME');
  const history=state.outcomes.concat([{vertical:TMV3_DISPATCH_ORDER[state.index],attemptId:attemptId,outcome:outcome}]);
  if (outcome==='COMPLETE') {
    const next=state.index+1;
    return Object.assign({},state,{index:next,status:next===TMV3_DISPATCH_ORDER.length?'COMPLETE':'READY',attemptId:null,outcomes:history});
  }
  if (outcome==='PENDING') return Object.assign({},state,{status:'READY',attemptId:null,outcomes:history});
  return Object.assign({},state,{status:'ATTENTION',attemptId:null,outcomes:history});
}
function tmv3_dispatchValidate_(s) {
  if (!s || typeof s.cycleId!=='string' || !s.cycleId || !Number.isFinite(s.startedAt) || !Number.isInteger(s.index) || s.index<0 || s.index>TMV3_DISPATCH_ORDER.length || ['READY','RUNNING','ATTENTION','COMPLETE'].indexOf(s.status)<0 || !Array.isArray(s.outcomes) || (s.status==='COMPLETE') !== (s.index===TMV3_DISPATCH_ORDER.length) || (s.status==='RUNNING' ? typeof s.attemptId!=='string' || !s.attemptId : s.attemptId!==null)) throw Error('DISPATCH_INVALID_STATE');
}

/** Google Apps Script prototype. Normalize one existing business-cycle result; not wired to live execution. */
function tmv3_dispatchClassifyBatch_(vertical, result) {
  if (['PreInspection','Install','Delivery','Service','SheetPublication'].indexOf(vertical)<0 || !result || typeof result!=='object' || Array.isArray(result) || typeof result.status!=='string') return {outcome:'UNCERTAIN',reason:'INVALID_RESULT'};
  if (vertical==='SheetPublication') {
    if (result.status==='AUTOMATION_SHEETS_REFRESHED' && result.projectionVerified===true && result.timestampReadbackVerified===true) return {outcome:'COMPLETE',reason:'SHEETS_PUBLISHED'};
    if (result.status==='LOCK_BUSY' || result.status==='DEFERRED_ACTIVE_BUSINESS_SWEEP') return {outcome:'PENDING',reason:result.status};
    return {outcome:'UNCERTAIN',reason:'SHEET_PUBLICATION_NOT_VERIFIED'};
  }
  if (result.status==='LOCK_BUSY') return {outcome:'PENDING',reason:'LOCK_BUSY'};
  if (result.status==='API_BUDGET_WAIT') return {outcome:'BLOCKED',reason:'API_BUDGET_WAIT'};
  if (result.dispatchSideEffectError) return {outcome:'BLOCKED',reason:result.dispatchSideEffectError};
  if (result.status==='ATTENTION' || result.error) return {outcome:'BLOCKED',reason:'CYCLE_ATTENTION'};
  const events=Array.isArray(result.results)?result.results:[];
  if (events.some(function(x){return x && (x.status==='UNCERTAIN_RECONCILIATION_REQUIRED' || x.status==='ATTENTION' || !!x.error);})) return {outcome:'BLOCKED',reason:'EVENT_ATTENTION'};
  if (vertical==='PreInspection') {
    const s=result.sweep;
    if (result.status!=='COMPLETE' || !s || !Number.isInteger(s.remaining) || s.remaining<0 || !Number.isInteger(s.pendingReview) || s.pendingReview<0 || ['IN_PROGRESS','COMPLETE','SCANNED_WITH_PENDING_REVIEW'].indexOf(s.status)<0) return {outcome:'UNCERTAIN',reason:'INVALID_PREINSPECTION_SWEEP'};
    if (s.remaining>0) {
      if (s.status!=='IN_PROGRESS') return {outcome:'UNCERTAIN',reason:'INCONSISTENT_PREINSPECTION_SWEEP'};
      return result.processed>0 ? {outcome:'PENDING',reason:'WORK_REMAINING'} : {outcome:'BLOCKED',reason:'NO_PROGRESS'};
    }
    if (s.status==='IN_PROGRESS' || (s.status==='COMPLETE' && s.pendingReview!==0) || (s.status==='SCANNED_WITH_PENDING_REVIEW' && s.pendingReview===0)) return {outcome:'UNCERTAIN',reason:'INCONSISTENT_PREINSPECTION_SWEEP'};
    return {outcome:'COMPLETE',reason:s.pendingReview?'COMPLETE_WITH_REVIEW':'COMPLETE',reviewCount:s.pendingReview};
  }
  const s=result.sweep;
  if (!s || typeof s.complete!=='boolean' || !Number.isInteger(result.pending) || result.pending<0 || !Number.isInteger(s.cursor) || !Number.isInteger(s.total) || s.cursor<0 || s.total<0 || s.cursor>s.total || result.pending!==s.total-s.cursor || s.complete!==(result.pending===0)) return {outcome:'UNCERTAIN',reason:'INVALID_VERTICAL_SWEEP'};
  if (s.complete) {
    if (result.status!=='SWEEP_COMPLETE') return {outcome:'UNCERTAIN',reason:'INCONSISTENT_VERTICAL_STATUS'};
    if (!Number.isInteger(s.uncertain) || s.uncertain<0 || !Number.isInteger(s.review) || s.review<0) return {outcome:'UNCERTAIN',reason:'INVALID_REVIEW_COUNTS'};
    if (s.uncertain>0) return {outcome:'BLOCKED',reason:'UNCERTAIN_WRITES'};
    return {outcome:'COMPLETE',reason:s.review?'COMPLETE_WITH_REVIEW':'COMPLETE',reviewCount:s.review};
  }
  if (!['ACTIVE_NO_READY_RECORD','VERIFIED_CONVERGENCE','RUNTIME_CONTINUATION_REQUIRED'].includes(result.status)) return {outcome:'UNCERTAIN',reason:'UNKNOWN_VERTICAL_STATUS'};
  return result.scanned>0 ? {outcome:'PENDING',reason:'WORK_REMAINING'} : {outcome:'BLOCKED',reason:'NO_PROGRESS'};
}

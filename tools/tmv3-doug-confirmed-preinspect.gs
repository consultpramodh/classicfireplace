// Google Apps Script: targeted real production test using existing guards and readbacks.
function tmv3_dougConfirmedPreinspect20261023() {
  var id='4540pk2ej2ejl8uubeo2o4ova2@google.com';
  if(TMV3.MODE!=='PRODUCTION_WRITE')throw new Error('PRODUCTION_MODE_REQUIRED');
  if(TMV3.OPERATIONS.preInspectionAutomationCanaryEventId&&TMV3.OPERATIONS.preInspectionAutomationCanaryEventId!==id)throw new Error('DIFFERENT_CANARY_SCOPE_NO_RUN');
  // Owner explicitly confirmed this exact event as PreInspection on October 21.
  var originalCandidate=tmv3_preInspectionExplicitCandidate_;
  tmv3_preInspectionExplicitCandidate_=function(r){return !!r&&!tmv3_step2PreInspectionNonCustomer_(r)&&(String(r.eventId)===id||originalCandidate(r));};
  var record=tmv3_preInspectionRecoveryRecord_(id);
  if(Utilities.formatDate(new Date(record.start),TMV3_TIMEZONE,'yyyy-MM-dd')!=='2026-10-23'||String(record.title).indexOf('29447')<0)throw new Error('FRIDAY_EVENT_IDENTITY_DATE_MISMATCH');
  var before={title:record.title,start:record.start,end:record.end,location:record.location,budget:tmv3_strivenApiBudgetStatus_()};
  tmv3_audit_('PreInspection',id,'','OWNER_CONFIRMED_PREINSPECTION','CONFIRMED','Doug Beatty Friday 5-6 PM explicitly confirmed by owner; use existing intake and duplicate guards.');
  var intake;
  try{intake=tmv3_preInspectionPromoteCandidate_(record);}catch(e){return {status:'INTAKE_BLOCKED',error:String(e),creator:tmv3_preInspectionCreatorEmail_(record),source:record.calendarRole,eventId:id};}
  if(intake.status!=='PRIMARY')return {status:'INTAKE_PENDING',intake:intake.status,eventId:id,creator:tmv3_preInspectionCreatorEmail_(record)};
  var native=tmv3_preInspectionAutomationCycle_({force:true,eventId:id,reason:'OWNER_REQUESTED_FRIDAY_REAL_TEST'});
  for(var attempt=1;native.status==='LOCK_BUSY'&&attempt<4;attempt++){Utilities.sleep(15000);native=tmv3_preInspectionAutomationCycle_({force:true,eventId:id,reason:'OWNER_FRIDAY_TEST_LOCK_RETRY'});}
  if(native.results&&native.results.some(function(r){return r.intake==='WAITING_FOR_CF_COPY';})){Utilities.sleep(15000);native=tmv3_preInspectionAutomationCycle_({force:true,eventId:id,reason:'OWNER_CONFIRMED_INTAKE_PROPAGATION_RETRY'});}
  var plans=tmv3_step7FreshPlansForEvent_('PreInspection',id);
  var taskIds=plans.map(function(p){return String(p.taskId||'');}).filter(function(x){return /^\d+$/.test(x);});
  var tasks=taskIds.map(function(taskId){return tmv3_getTaskById_(Number(taskId));});
  var fresh=tmv3_preInspectionRecoveryRecord_(id);
  var copies=tmv3_requiredCalendarCopiesForEvent_(fresh).map(function(calendarId){
    var found=tmv3_findEventCopyRobust_(calendarId,id);
    return {calendarId:calendarId,found:!!(found&&found.event),title:found&&found.event?found.event.getTitle():'',description:found&&found.event?found.event.getDescription():''};
  });
  var result={status:'FRIDAY_LIVE_TEST_RETURNED',eventId:id,before:before,native:native,afterPlans:plans,tasks:tasks,calendarCopies:copies,afterBudget:tmv3_strivenApiBudgetStatus_()};
  tmv3_audit_('PreInspection',id,taskIds.join(','),'OWNER_FRIDAY_LIVE_TEST',native.status,JSON.stringify({processed:native.processed,writes:native.writes,notifications:native.notifications,plans:plans.map(function(p){return {plan:p.plan,blocker:p.blocker,taskId:p.taskId,actions:p.actions};})}));
  return result;
}

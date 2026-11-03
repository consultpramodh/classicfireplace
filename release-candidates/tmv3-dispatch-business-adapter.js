/** Google Apps Script candidate only: not wired to production triggers. */
function tmv3_dispatchBusinessBatch_(vertical,firstBatch,claim) {
  if (!claim || claim.vertical!==vertical || typeof claim.cycleId!=='string' || typeof claim.attemptId!=='string' || typeof firstBatch!=='boolean') throw Error('DISPATCH_INVALID_CLAIM');
  const props=PropertiesService.getScriptProperties();
  if (vertical==='SheetPublication') return tmv3_refreshAutomationSheets();
  if (vertical==='PreInspection') {
    const options={force:true,reason:'DISPATCH_'+claim.cycleId};
    if (firstBatch) options.sweepStart=true; else options.sweepContinue=true;
    const result=tmv3_preInspectionAutomationCycle_(options);
    tmv3_preInspectionLogSweep_('DISPATCH',result);
    props.setProperty('TMV3_SHEET_REFRESH_PENDING','true');
    return result;
  }
  if (['Install','Delivery','Service'].indexOf(vertical)<0) throw Error('DISPATCH_INVALID_VERTICAL');
  const result=tmv3_verticalProductionCycle_(vertical);
  props.setProperty('TMV3_SHEET_REFRESH_PENDING','true');
  if (vertical==='Install' && result && result.status==='SWEEP_COMPLETE' && result.sweep && result.sweep.complete===true) {
    // Existing reminder code marks send intent before sending. An exception is
    // still uncertain and must block the coordinator rather than replay work.
    result.reminders=tmv3_installReminderCheck();
    result.sheetRefresh=tmv3_installSchedulePublication_();
    if (!result.reminders || result.reminders.status==='COMPLETE_WITH_ERRORS') result.dispatchSideEffectError='INSTALL_REMINDERS_NEED_REVIEW';
  }
  tmv3_audit_(vertical,'','','STANDARD_DAILY_SLOT',result.status,JSON.stringify({slot:'DISPATCH',result:result}));
  return result;
}

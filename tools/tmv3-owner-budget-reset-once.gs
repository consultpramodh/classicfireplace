// Google Apps Script: explicit owner-authorized one-time internal reset and guarded test.
function tmv3_ownerBudgetResetTest20261021() {
  var lock=LockService.getScriptLock();
  if(!lock.tryLock(10000))throw new Error('RESET_LOCK_BUSY_NO_RESET');
  var before,after;
  try {
    var props=PropertiesService.getScriptProperties();
    var marker='TMV3_OWNER_BUDGET_RESET_20261021';
    if(props.getProperty(marker))throw new Error('RESET_ALREADY_APPLIED_NO_RETRY');
    if(tmv3_strivenApiBudgetDate_()!=='2026-10-21')throw new Error('RESET_AUTHORIZATION_DATE_EXPIRED');
    before=tmv3_strivenApiBudgetStatus_();
    if(before.count!==1200)throw new Error('RESET_EXPECTED_COUNT_CHANGED_NO_RESET');
    var keys=tmv3_strivenApiBudgetKeys_(),saved={};
    Object.keys(keys).forEach(function(k){saved[keys[k]]=props.getProperty(keys[k]);});
    props.setProperty(marker,JSON.stringify({authorizedBy:'Explicit owner request in ChatGPT',at:new Date().toISOString(),before:before,properties:saved}));
    var next={};next[keys.date]=before.date;next[keys.count]='0';
    props.setProperties(next,false);
    props.deleteProperty(keys.exhaustedDate);props.deleteProperty(keys.exhaustedReason);
    after=tmv3_strivenApiBudgetStatus_();
    if(after.count!==0||after.exhausted)throw new Error('RESET_READBACK_FAILED');
  } finally {lock.releaseLock();}
  tmv3_audit_('PreInspection','','','OWNER_AUTHORIZED_API_BUDGET_RESET','RESET',JSON.stringify({before:before,after:after,providerQuotaReset:false}));
  var native=tmv3_preInspectionCheck0800();
  return {status:'RESET_AND_TEST_RETURNED',before:before,afterReset:after,native:native,afterTest:tmv3_strivenApiBudgetStatus_()};
}

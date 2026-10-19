function tmv3_healthCheck() {
  const requiredSheets = [
    TMV3.SHEETS.MORNING,TMV3.SHEETS.OVERVIEW,TMV3.SHEETS.INSTALL,TMV3.SHEETS.DELIVERY,TMV3.SHEETS.SERVICE,
    TMV3.SHEETS.PREINSPECTION,TMV3.SHEETS.STATE,TMV3.SHEETS.AUDIT,TMV3.SHEETS.CUSTOMERS,
    TMV3.SHEETS.LOCATIONS,TMV3.SHEETS.CONTACTS,TMV3.SHEETS.ORDERS,TMV3.SHEETS.TASKS
  ];
  const ss = tmv3_ss_();
  const missingSheets = requiredSheets.filter(function(n) { return !ss.getSheetByName(n); });
  const caps = tmv3_configCapabilities_();
  const missingCaps = Object.keys(caps).filter(function(k) { return !caps[k].present; });
  const result = {
    version:TMV3.VERSION,
    mode:TMV3.MODE,
    scriptId:ScriptApp.getScriptId(),
    spreadsheetId:ss.getId(),
    missingSheets:missingSheets,
    missingPropertyCapabilities:missingCaps,
    ready:missingSheets.length===0 && missingCaps.length===0
  };
  Logger.log(JSON.stringify(result));
  return result;
}

function tmv3_configKeysOnly() {
  return Object.keys(PropertiesService.getScriptProperties().getProperties()).sort();
}

function tmv3_importConfigBundle(bundle) {
  if (!bundle || typeof bundle !== 'object') throw new Error('Configuration bundle required.');
  const allowed = [
    'CLIENT_ID','CLIENT_SECRET','Striven_Customers_ReportAPI','Striven_CustomerLocations_ReportAPI',
    'Striven_ApprovedSalesOrders_ReportAPI','Striven_DeliveryApprovedOrders_ReportAPI',
    'Striven_InstallTasks_ReportAPI','Striven_DeliveryTasks_ReportAPI','Striven_ServiceTasks_ReportAPI','Striven_ServiceWorkOrders_ReportAPI'
  ];
  const safe = {};
  allowed.forEach(function(k) {
    if (bundle[k] !== undefined && bundle[k] !== null && tmv3_clean_(bundle[k]) !== '') safe[k] = String(bundle[k]);
  });
  if (Object.keys(safe).length !== allowed.length) {
    throw new Error('Config bundle incomplete. Expected ' + allowed.length + ' keys, received ' + Object.keys(safe).length + '.');
  }
  PropertiesService.getScriptProperties().setProperties(safe, false);
  return { status:'IMPORTED', keys:Object.keys(safe).sort() };
}

function tmv3_assertNoBusinessWrites() {
  const legacyWrites = tmv3_writesEnabled_();
  const manualWrites = tmv3_operationWritesEnabled_('MANUAL');
  const automationWrites = tmv3_operationWritesEnabled_('AUTO');
  const anyWrites = legacyWrites || manualWrites || automationWrites;

  return {
    mode: TMV3.MODE,
    businessWritesEnabled: anyWrites,
    calendarWritesEnabled: anyWrites,
    taskCreateEnabled: manualWrites || automationWrites,
    taskPatchEnabled: anyWrites,
    manualWritesEnabled: manualWrites,
    automationWritesEnabled: automationWrites,
    assertionPass: !anyWrites
  };
}


// Google Apps Script: current-day operator controls; each run executes at most one event.
function tmv3_preInspectionTodayRecords_() {
  const today=Utilities.formatDate(new Date(),TMV3_TIMEZONE,'yyyy-MM-dd');
  return tmv3_preInspectionIntakeRecords_().filter(function(record){
    return record.calendarRole==='PRIMARY_SHARED' &&
      Utilities.formatDate(new Date(record.start),TMV3_TIMEZONE,'yyyy-MM-dd')===today;
  });
}
function tmv3_preInspectionCompactPlan_(plan) {
  return {eventId:plan.eventId,taskId:plan.taskId,plan:plan.plan,blocker:plan.blocker,
    customer:plan.customerCheck,location:plan.locationCheck,requestedBy:plan.requestedByCheck,
    start:plan.startCheck,end:plan.endCheck,assignment:plan.assignmentCheck,
    calendarTitle:plan.calendarTitleCheck,taskName:plan.taskNameCheck};
}
function tmv3_preInspectionTodayPreview() {
  const before=tmv3_strivenApiBudgetStatus_();
  if (before.exhausted || !Number.isFinite(before.remaining) || before.remaining<100) throw new Error('INSUFFICIENT_READBACK_HEADROOM');
  const records=tmv3_preInspectionTodayRecords_();
  records.forEach(function(record){
    const plans=tmv3_step7FreshPlansForEvent_('PreInspection',record.eventId);
    Logger.log(JSON.stringify({title:record.title,plans:plans.map(tmv3_preInspectionCompactPlan_)}));
  });
  Logger.log(JSON.stringify({status:'PREVIEW_ONLY',events:records.length,before:before.count,
    after:tmv3_strivenApiBudgetStatus_().count}));
}
function tmv3_preInspectionTodayRunNext() {
  const before=tmv3_strivenApiBudgetStatus_();
  if (before.exhausted || !Number.isFinite(before.remaining) || before.remaining<100) throw new Error('INSUFFICIENT_READBACK_HEADROOM');
  const records=tmv3_preInspectionTodayRecords_();
  const props=PropertiesService.getScriptProperties();
  const day=Utilities.formatDate(new Date(),TMV3_TIMEZONE,'yyyy-MM-dd');
  const key='TMV3_PI_TODAY_CURSOR_'+day;
  let cursor=Number(props.getProperty(key)||0);
  for(let i=0;i<records.length;i++) {
    const index=(cursor+i)%records.length,record=records[index];
    const done=JSON.parse(props.getProperty('TMV3_PI_DONE_'+tmv3_hash_(record.eventId))||'null');
    if (done && done.fingerprint===record.fingerprint && Date.now()-Number(done.at||0)<3600000) continue;
    props.setProperty(key,String((index+1)%records.length));
    const result=tmv3_preInspectionAutomationCycle_({force:true,eventId:record.eventId,reason:'TODAY_SINGLE_EVENT'});
    const one=(result.results||[])[0]||{};
    const execution=one.execution||{};
    Logger.log(JSON.stringify({status:result.status,eventId:record.eventId,title:record.title,
      execution:execution.status,taskId:execution.taskId||one.taskId,after:one.afterPlans,
      calendarLinks:execution.calendarLinks&&execution.calendarLinks.status,error:one.error||result.error,
      checks:execution.readbackPlan&&tmv3_preInspectionCompactPlan_(execution.readbackPlan),
      before:before.count,afterCalls:tmv3_strivenApiBudgetStatus_().count}));
    return result;
  }
  const result={status:'TODAY_VERIFIED_UNCHANGED',events:records.length,strivenCalls:0};
  Logger.log(JSON.stringify(result));return result;
}

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
// Google Apps Script: prioritize cached eligible PreInspection events.
// These cached values are only a low-cost scheduling hint. The production
// transaction always revalidates the customer, location, task history and
// duplicate guards using tmv3_preInspectionAutomationCycle_.
function tmv3_preInspectionTodayEligibleQueue_(records, sheetRows) {
  const byId={};
  (sheetRows||[]).forEach(function(row){
    const id=tmv3_clean_(row[9]); // PreInspection!O, from read of F:O.
    if (!id) return;
    if (byId[id]) { byId[id].duplicate=true;return; }
    byId[id]={evidence:String(row[0]||''),status:String(row[4]||''),duplicate:false};
  });
  const eligible=[],excluded=[];
  (records||[]).forEach(function(record){
    const entry=byId[record.eventId];
    const status=entry ? entry.status : '';
    const evidence=entry ? entry.evidence : '';
    const decision=/STEP\s*6\s*[\u2014-]\s*(CREATE_TASK|RECREATE_TASK|MATCH_EXISTING)\b/i.exec(status);
    let reason='';
    if (!entry) reason='NO_CACHED_STEP6_DECISION';
    else if (entry.duplicate) reason='DUPLICATE_OPERATOR_ROWS';
    else if (!decision) reason='STEP6_NOT_ELIGIBLE: '+status;
    else if (!/Customer:\s*#\d+\b/i.test(evidence)) reason='CUSTOMER_NOT_RESOLVED_IN_OPERATOR_VIEW';
    else if (!/Location ID:\s*\d+\b/i.test(evidence)) reason='LOCATION_NOT_RESOLVED_IN_OPERATOR_VIEW';
    if (reason) {excluded.push({eventId:record.eventId,title:record.title,reason:reason});return;}
    const disposition=decision[1].toUpperCase();
    eligible.push({record:record,disposition:disposition,
      priority:disposition==='CREATE_TASK'?0:disposition==='RECREATE_TASK'?1:2});
  });
  eligible.sort(function(a,b){
    return a.priority-b.priority ||
      new Date(a.record.start).getTime()-new Date(b.record.start).getTime();
  });
  return {eligible:eligible,excluded:excluded};
}

function tmv3_preInspectionTodayRunNext(excludeEventIds) {
  const before=tmv3_strivenApiBudgetStatus_();
  if (before.exhausted || !Number.isFinite(before.remaining) || before.remaining<100) {
    const gated={status:'API_BUDGET_GATED',remaining:before.remaining,
      reason:'Minimum 100-call readback headroom is required before another event transaction.'};
    Logger.log(JSON.stringify(gated));return gated;
  }
  const records=tmv3_preInspectionTodayRecords_();
  const sheet=tmv3_sheet_(TMV3.SHEETS.PREINSPECTION);
  const last=sheet.getLastRow();
  const rows=last>1?sheet.getRange(2,6,last-1,10).getDisplayValues():[];
  const queue=tmv3_preInspectionTodayEligibleQueue_(records,rows);
  const skipIds={};
  (Array.isArray(excludeEventIds)?excludeEventIds:[]).forEach(function(id){skipIds[String(id)]=true;});
  if (!queue.eligible.length) {
    const empty={status:'NO_ELIGIBLE_EVENTS',events:records.length,excluded:queue.excluded,strivenCalls:0};
    Logger.log(JSON.stringify(empty));return empty;
  }
  const props=PropertiesService.getScriptProperties();
  const day=Utilities.formatDate(new Date(),TMV3_TIMEZONE,'yyyy-MM-dd');
  const key='TMV3_PI_ELIGIBLE_CURSOR_'+day;
  const cursor=Array.isArray(excludeEventIds)&&excludeEventIds.length
    ? 0 : Number(props.getProperty(key)||0);
  let recent=0;
  for(let i=0;i<queue.eligible.length;i++){
    const index=(cursor+i)%queue.eligible.length;
    const candidate=queue.eligible[index],record=candidate.record;
    if (skipIds[record.eventId]) continue;
    const done=JSON.parse(props.getProperty('TMV3_PI_DONE_'+tmv3_hash_(record.eventId))||'null');
    if (done && done.fingerprint===record.fingerprint &&
        Date.now()-Number(done.at||0)<3600000){recent++;continue;}
    // Advance even for blocked events; do not retry the same blocker forever.
    props.setProperty(key,String((index+1)%queue.eligible.length));
    const result=tmv3_preInspectionAutomationCycle_({
      force:true,eventId:record.eventId,reason:'TODAY_ELIGIBLE_SINGLE_EVENT'});
    const one=(result.results||[]).filter(function(r){
      return r.eventId===record.eventId;
    })[0]||{};
    const after=one.afterPlans||[];
    const taskId=tmv3_clean_(one.taskId||
      (one.execution&&one.execution.taskId)||
      (after[0]&&after[0].taskId));
    const complete=result.status==='COMPLETE'&&!!taskId&&
      tmv3_preInspectionCompletionVerified_(after,one.execution);
    const response={
      status:complete?'EVENT_RECONCILED_AND_VERIFIED':'EVENT_NOT_CONVERGED',
      eventId:record.eventId,title:record.title,
      candidate: candidate.disposition,taskId:taskId,
      processingStatus:result.status,
      executionStatus:one.execution&&one.execution.status||'NO_EXECUTION',
      after:after,error:one.error||result.error||'',
      before:before.count,afterCalls:tmv3_strivenApiBudgetStatus_().count,
      excluded:queue.excluded
    };
    Logger.log(JSON.stringify(response));return response;
  }
  const doneResult={status:'ALL_ELIGIBLE_RECENTLY_VERIFIED',
    events:queue.eligible.length,recent:recent,excluded:queue.excluded,strivenCalls:0};
  Logger.log(JSON.stringify(doneResult));return doneResult;
}

// Google Apps Script: bounded operator batch (maximum 3 event transactions).
// Every selected event gets its own lock, API guard, fresh identity check,
// duplicate check and readback. Do not parallelize task creations.
function tmv3_preInspectionTodayRunEligibleBatch() {
  const results=[],seen={};
  for(let i=0;i<3;i++){
    const r=tmv3_preInspectionTodayRunNext(Object.keys(seen));
    if (!r.eventId){if (!results.length) results.push(r);break;}
    if (seen[r.eventId]){results.push({status:'CURSOR_DID_NOT_ADVANCE',eventId:r.eventId});break;}
    seen[r.eventId]=true;
    results.push(r);
  }
  const verified=results.filter(function(r){return r.status==='EVENT_RECONCILED_AND_VERIFIED';}).length;
  const result={status:verified===results.length?'ALL_SELECTED_VERIFIED':'PARTIAL_OR_BLOCKED',
    verified:verified,attempted:results.length,results:results};
  Logger.log(JSON.stringify(result));return result;
}

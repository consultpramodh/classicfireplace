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

// Google Apps Script: bounded Install-only diagnostic; no business writes or emails.
function tmv3_installReadinessAudit() {
  const cfg = TMV3.VERTICALS.Install;
  const calendar = CalendarApp.getCalendarById(cfg.calendarIds[0]);
  if (!calendar) throw new Error('INSTALL_CALENDAR_UNAVAILABLE');
  const start = new Date();start.setHours(0,0,0,0);
  const end = new Date(start);end.setDate(end.getDate()+7);
  const records = calendar.getEvents(start,end).map(function(event) {
    return tmv3_calendarEvent_('Install',cfg,{calendarId:cfg.calendarIds[0]},event);
  }).filter(Boolean);
  const result = {status:'READ_ONLY_SNAPSHOT',vertical:'Install',
    from:tmv3_iso_(start),untilExclusive:tmv3_iso_(end),eventsDiscovered:records.length,
    cacheRefreshPerformed:false,liveAcceptanceComplete:false,results:[],
    installWritesEnabled:tmv3_operationWritesEnabled_('INSTALLAUTO')};
  const seen = {};
  for (let i=0;i<records.length && result.results.length<25;i++) {
    const record = records[i];
    if (seen[record.eventId]) continue;
    seen[record.eventId] = true;
    const budget = tmv3_strivenApiBudgetStatus_();
    if (budget.exhausted || !Number.isFinite(budget.remaining) || budget.remaining < 30) {
      result.status = 'PARTIAL_API_HEADROOM_REQUIRED';break;
    }
    const one = {eventId:record.eventId,status:'REVIEW'};
    try {
      const eligibility = tmv3_step2ClassifyCalendarRecord_(record);
      if (eligibility.disposition !== 'ELIGIBLE') {
        one.status = 'EXCLUDED';one.blocker = eligibility.reason || eligibility.code || eligibility.disposition;
      } else {
        const plans = tmv3_step7FreshPlansForEvent_('Install',record.eventId);
        one.plans = plans.map(function(p) {return {
          taskId:p.taskId,taskStatus:p.taskStatus,plan:p.plan,blocker:p.blocker || '',actions:p.actions,
          customer:p.customerCheck,order:p.orderCheck,location:p.locationCheck,
          requestedBy:p.requestedByCheck,contactOwnership:p.contactOwnership,
          start:p.startCheck,end:p.endCheck,assignment:p.assignmentCheck,
          expectedStart:p.expectedStart,taskStart:p.taskStart,expectedDue:p.expectedDue,taskDue:p.taskDue
        };});
        if (plans.length !== 1) one.blocker = 'INSTALL_ONE_CANONICAL_PLAN_REQUIRED';
        else {
          const p = plans[0];
          one.blocker = p.blocker || '';
          one.status = p.blocker ? 'BLOCKED' :
            p.actions.some(function(a) {return ['CREATE_LOCATION','CREATE_TASK','RECREATE_TASK'].indexOf(a)>=0;})
              ? 'LIFECYCLE_ACCEPTANCE_REQUIRED' :
              p.actions.some(function(a) {return ['PATCH_TASK_NAME','PATCH_CALENDAR_TITLE'].indexOf(a)>=0;})
                ? 'TITLE_POLICY_REVIEW' : p.plan === 'NO_CHANGE' ? 'MATCHES_SNAPSHOT' : 'RECONCILIATION_REQUIRED';
        }
      }
    } catch (err) {one.blocker = String(err && err.message || err);}
    result.results.push(one);
  }
  if (records.length>result.results.length && result.status==='READ_ONLY_SNAPSHOT') result.status='PARTIAL_EVENT_CAP';
  result.eventsExamined = result.results.length;
  result.blocked = result.results.filter(function(r) {return !!r.blocker;}).length;
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


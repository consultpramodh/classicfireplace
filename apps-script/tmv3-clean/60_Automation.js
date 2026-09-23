function onOpen() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const morning = ss.getSheetByName(TMV3.SHEETS.MORNING);

  if (morning) {
    ss.setActiveSheet(morning);
  }

  SpreadsheetApp.getUi().createMenu('Task Mapping V3')
    .addItem('Refresh Morning Ops', 'tmv3_refreshMorningOps')
    .addItem('Run Full Shadow Verification', 'tmv3_shadowRun')
    .addItem('Health Check', 'tmv3_healthCheck')
    .addSeparator()
    .addItem('Acknowledge Selected Exception', 'tmv3_acknowledgeSelectedMorningOps')
    .addItem('Clear Selected Acknowledgement', 'tmv3_clearAcknowledgementSelectedMorningOps')
    .addSeparator()
    .addItem('Install Managed Triggers', 'tmv3_installTriggers')
    .addItem('Remove Managed Triggers', 'tmv3_removeTriggers')
    .addToUi();
}

function tmv3_installTriggers() {
  tmv3_removeTriggers();

  // One heavy source refresh before the business day.
  ScriptApp
    .newTrigger('tmv3_dailySourceRefresh')
    .timeBased()
    .atHour(7)
    .nearMinute(0)
    .everyDays(1)
    .create();

  // Lightweight Calendar -> cached Striven mapping slots.
  [8,11,13,15,17].forEach(function(hour) {
    ScriptApp
      .newTrigger('tmv3_scheduledShadow')
      .timeBased()
      .atHour(hour)
      .nearMinute(30)
      .everyDays(1)
      .create();
  });

  // Install missing-SO operational reminder.
  ScriptApp
    .newTrigger('tmv3_installReminderCheck')
    .timeBased()
    .atHour(11)
    .nearMinute(0)
    .everyDays(1)
    .create();

  return tmv3_listTriggers();
}

function tmv3_removeTriggers() {
  const managed = [
    'tmv3_scheduledShadow',
    'tmv3_dailySourceRefresh',
    'tmv3_installReminderCheck'
  ];

  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (managed.indexOf(t.getHandlerFunction()) !== -1) {
      ScriptApp.deleteTrigger(t);
    }
  });

  return tmv3_listTriggers();
}

function tmv3_dailySourceRefresh() {
  tmv3_assertShadow_();

  const result = tmv3_refreshSources();

  tmv3_audit_(
    'SYSTEM',
    '',
    '',
    'DAILY_SOURCE_REFRESH',
    'PASS',
    JSON.stringify(result)
  );

  tmv3_refreshMorningOps();
  return result;
}

function tmv3_scheduledShadow() {
  return tmv3_shadowMapFromCache();
}

function tmv3_listTriggers() {
  return ScriptApp.getProjectTriggers().map(function(t) {
    return { handler:t.getHandlerFunction(), source:String(t.getTriggerSource()), eventType:String(t.getEventType()) };
  });
}


function tmv3_installReminderCheck() {
  tmv3_assertShadow_();
  const rows = tmv3_rows_(TMV3.SHEETS.INSTALL);
  const today = new Date();
  today.setHours(0,0,0,0);
  const due = rows.filter(function(r) {
    if (tmv3_clean_(r['Order / Work Order'])) return false;
    const d = new Date(tmv3_clean_(r['Date']) + 'T00:00:00');
    if (isNaN(d.getTime())) return false;
    let business = 0;
    const cur = new Date(today);
    while (cur < d && business <= 3) {
      cur.setDate(cur.getDate() + 1);
      const day = cur.getDay();
      if (day !== 0 && day !== 6) business++;
    }
    return business <= 3;
  });
  tmv3_audit_('Install','','','MISSING_SO_REMINDER_SHADOW','PASS','Would remind for ' + due.length + ' Install events.');
  return { mode:'SHADOW', wouldSend:due.length };
}

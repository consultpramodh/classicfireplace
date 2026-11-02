function tmv3_preInspectionScheduleNextSweep_() {
  return 'DEFERRED_TO_NEXT_STANDARD_SLOT';
}

function tmv3_preInspectionContinueEligibleSweep() {
  return {status:'RETIRED_OUTSIDE_STANDARD_SLOTS',writes:0,notifications:0};
}

function tmv3_runPreInspectionDailySlot_(slot) {
  const sheetRefreshStarted=Date.now();
  let result=tmv3_preInspectionAutomationCycle_({force:true,sweepStart:true,reason:'DAILY_SLOT_'+slot});
  const totals={processed:Number(result.processed||0),writes:Number(result.writes||0),notifications:Number(result.notifications||0),results:(result.results||[]).slice()};
  let priorRemaining=result.sweep && result.sweep.remaining;
  const batchStatuses=[result.status];
  while (result.sweep && result.sweep.remaining>0 && result.processed>0 &&
      result.status!=='API_BUDGET_WAIT' && result.status!=='LOCK_BUSY' &&
      Date.now()-sheetRefreshStarted<240000) {
    const next=tmv3_preInspectionAutomationCycle_({force:true,sweepContinue:true,reason:'DAILY_SLOT_'+slot});
    batchStatuses.push(next.status);
    totals.processed+=Number(next.processed||0);totals.writes+=Number(next.writes||0);totals.notifications+=Number(next.notifications||0);totals.results.push.apply(totals.results,next.results||[]);
    if (!next.sweep || next.sweep.remaining>=priorRemaining || !next.processed) {result=next;break;}
    priorRemaining=next.sweep.remaining;result=next;
  }
  result.batchStatuses=batchStatuses;
  result.processed=totals.processed;result.writes=totals.writes;result.notifications=totals.notifications;result.results=totals.results;
  if (result.status==='LOCK_BUSY') PropertiesService.getScriptProperties().setProperty('TMV3_PI_RETRY_SWEEP_START','1');
  tmv3_preInspectionMaybeContinueSweep_(result);
  tmv3_preInspectionLogSweep_(slot,result);
  result.sheetRefresh=tmv3_refreshAutomationSheetsAfter_(sheetRefreshStarted);
  return result;
}

function tmv3_refreshAutomationSheetsAfter_(startedAt) {
  try {
    PropertiesService.getScriptProperties().setProperty('TMV3_SHEET_REFRESH_PENDING','true');
    if(Date.now()-Number(startedAt)>240000) return {status:'DEFERRED_TO_NEXT_STANDARD_SLOT'};
    return tmv3_refreshAutomationSheets();
  } catch(err) {
    // A view-publication failure must not replay or relabel a completed business transaction.
    return {status:'SHEET_REFRESH_ATTENTION',error:String(err && err.message || err)};
  }
}

function tmv3_scheduledSheetRefresh() {
  const hour=Number(Utilities.formatDate(new Date(),TMV3_TIMEZONE,'H'));
  if([8,13,17].indexOf(hour)<0)return {status:'OUTSIDE_STANDARD_SLOTS'};
  return tmv3_refreshAutomationSheets();
}

function tmv3_installAutomationSheetRefreshTrigger() {
  const handler='tmv3_scheduledSheetRefresh';
  const existing=ScriptApp.getProjectTriggers().filter(function(t){return t.getHandlerFunction()===handler;});
  if(ScriptApp.getProjectTriggers().length-existing.length+3>20)throw Error('SHEET_REFRESH_TRIGGER_CAPACITY');
  existing.forEach(function(t){ScriptApp.deleteTrigger(t);});
  [8,13,17].forEach(function(hour){ScriptApp.newTrigger(handler).timeBased().atHour(hour).nearMinute(0).everyDays(1).inTimezone('America/Toronto').create();});
  const triggers=tmv3_listTriggers();
  if(triggers.filter(function(t){return t.handler===handler;}).length!==3)throw Error('SHEET_REFRESH_TRIGGER_READBACK_FAILED');
  return {status:'SHEET_REFRESH_TRIGGER_VERIFIED',triggers:triggers};
}

function tmv3_installStandardDailyTriggers() {
  const schedule=tmv3_standardDailySchedule_();
  const handlers=[];
  schedule.verticals.forEach(function(v){
    const prefix=v==='PreInspection'?'preInspection':v.toLowerCase();
    schedule.hours.forEach(function(hour){handlers.push({handler:'tmv3_'+prefix+'Check'+('0'+hour).slice(-2)+'00',hour:hour});});
  });
  const before=ScriptApp.getProjectTriggers();
  const obsolete=['tmv3_dailySourceRefresh','tmv3_scheduledSheetRefresh',
    'tmv3_preInspectionContinueEligibleSweep','tmv3_installSweepContinue',
    'tmv3_deliverySweepContinue','tmv3_serviceSweepContinue',
    'tmv3_allVerticalAutomationTick','tmv3_scheduledOperations',
    'tmv3_calendarEventUpdated','tmv3_calendarReconciliationFallback',
    'tmv3_installReminderCheck','tmv3_installPublishView',
    'tmv3_serviceDeliveryOrderBackfill'];
  const removable=before.filter(function(t){return obsolete.indexOf(t.getHandlerFunction())>=0;});
  const retained=before.filter(function(t){return removable.indexOf(t)<0;});
  const missing=handlers.filter(function(spec){return !retained.some(function(t){return t.getHandlerFunction()===spec.handler;});});
  if(retained.length+missing.length+3>20)throw Error('STANDARD_SCHEDULE_CAPACITY_NO_CHANGE');
  removable.forEach(function(t){ScriptApp.deleteTrigger(t);});
  missing.forEach(function(spec){
    ScriptApp.newTrigger(spec.handler).timeBased().atHour(spec.hour).nearMinute(0).everyDays(1).inTimezone(schedule.timezone).create();
  });
  schedule.hours.forEach(function(hour){ScriptApp.newTrigger('tmv3_scheduledSheetRefresh').timeBased().atHour(hour).nearMinute(0).everyDays(1).inTimezone(schedule.timezone).create();});
  const triggers=tmv3_listTriggers();
  const expected=handlers.map(function(x){return x.handler;});
  if(expected.some(function(h){return triggers.filter(function(t){return t.handler===h;}).length!==1;}) ||
    triggers.filter(function(t){return t.handler==='tmv3_scheduledSheetRefresh';}).length!==3 ||
    triggers.some(function(t){return obsolete.indexOf(t.handler)>=0 && t.handler!=='tmv3_scheduledSheetRefresh';}))throw Error('STANDARD_SCHEDULE_READBACK_FAILED');
  const result={status:'STANDARD_DAILY_TRIGGERS_VERIFIED',schedule:schedule,triggers:triggers,businessTriggerCount:12,maintenanceTriggerCount:3};
  PropertiesService.getScriptProperties().setProperty('TMV3_STANDARD_SCHEDULE',JSON.stringify(result));
  return result;
}

// Google Apps Script: resume the same daily sweep; no additional recurring window.

function tmv3_runFullVerticalSweep_(vertical) {
  const began=Date.now();let result=tmv3_verticalProductionCycle_(vertical);
  let totalWrites=Number(result.writes||0),totalScanned=Number(result.scanned||0),allResults=(result.results||[]).slice(),batchStatuses=[result.status];
  while (result.pending>0 && result.status!=='API_BUDGET_WAIT' && result.status!=='LOCK_BUSY' &&
      result.scanned>0 && Date.now()-began<240000) {
    const before=result.pending,next=tmv3_verticalProductionCycle_(vertical);
    batchStatuses.push(next.status);
    totalWrites+=Number(next.writes||0);totalScanned+=Number(next.scanned||0);allResults.push.apply(allResults,next.results||[]);
    result=next;if(!next.scanned || next.pending>=before)break;
  }
  result.batchStatuses=batchStatuses;
  result.writes=totalWrites;result.scanned=totalScanned;result.results=allResults;
  if(result.status==='LOCK_BUSY'||result.pending>0) result.continuation='DEFERRED_TO_NEXT_STANDARD_SLOT';
  PropertiesService.getScriptProperties().setProperty('TMV3_SHEET_REFRESH_PENDING','true');
  result.sheetRefresh={status:'DEFERRED_TO_NEXT_STANDARD_SLOT'};
  if(vertical==='Install' && result.sweep && result.sweep.complete)result.sheetRefresh=tmv3_installSchedulePublication_();
  Logger.log(JSON.stringify(result));return result;
}


function tmv3_installSweepContinue(){return {status:'RETIRED_OUTSIDE_STANDARD_SLOTS',writes:0};}

function tmv3_deliverySweepContinue(){return {status:'RETIRED_OUTSIDE_STANDARD_SLOTS',writes:0};}

function tmv3_serviceSweepContinue(){return {status:'RETIRED_OUTSIDE_STANDARD_SLOTS',writes:0};}

function tmv3_serviceDeliveryOrderBackfill() {
  const result=tmv3_taskFirstProductionCycle_();
  if (result && result.status==='LOCK_BUSY') result.continuation='DEFERRED_TO_NEXT_STANDARD_SLOT';
  return result;
}


function tmv3_serviceDeliveryOrderBackfill_(props) {
  const ids = [18374,18471,18733,18735,18754,18774,18801,18806,18831,18896,18897,18908,18913,18914,18979,19037,19064,19098,19109,19126,19137,19190,19195,19198,19201,19203,19204,19205,19214,19218,19221,19222,19223,19224,19225,19226,19227,19228,19229,19230,19231,19232,19233,19234,19235,19240,19241,19242,19248,19249,19250,19251,19252,19253,19255,19256,19257,19258,19259,19260,19261,19262,19263,19264,19265,19266,19267,19268,19269,19270,19272,19273,19274,19275,19276,19279,19280,19281,19282,19283,19284];
  const prefix = 'TMV3_SD_ORDER_BACKFILL_20261020_';
  const handler = 'tmv3_serviceDeliveryOrderBackfill';
  const tasks = tmv3_rows_(TMV3.SHEETS.TASKS);
  // Isolated test projects and other source sets never enroll extra Tasks.
  if (!ids.some(function(id){return tasks.some(function(row){return String(row['Task ID'])===String(id);});})) return null;
  const orders=tmv3_rows_(TMV3.SHEETS.ORDERS);
  function needsWork(id) {
    const value=props.getProperty(prefix+id);
    if (!value) return true;
    const saved=JSON.parse(value);
    if (['INTENT','RETRY'].indexOf(saved.state)>=0) return true;
    // A newly available compatible cached Order may resolve a prior cache hold.
    if (saved.state==='BLOCKED' && ['ORDER_NOT_IN_CACHE','ORDER_SEARCH_NO_EXACT_CUSTOMER_MATCH'].indexOf(saved.reason)>=0 && saved.soNumber) {
      if (saved.reason==='ORDER_NOT_IN_CACHE' && !saved.searchAttempted) return true;
      return orders.some(function(order){return tmv3_clean_(order['Order Number'])===saved.soNumber &&
        tmv3_taskFirstOrderMatchesVertical_(order,saved.vertical);});
    }
    return false;
  }
  const pending=ids.filter(needsWork);
  if (!pending.length) return null;
  const started=Date.now();
  const initialBudget=tmv3_strivenApiBudgetStatus_();
  let processed=0,writes=0,paused='';
  function save(id,value) {
    const result=Object.assign({taskId:id,at:new Date().toISOString()},value);
    props.setProperty(prefix+id,JSON.stringify(result));
    tmv3_audit_(result.vertical || 'SYSTEM','',String(id),'SD_ORDER_BACKFILL',
      result.state==='VERIFIED'?'PASS':'REVIEW',JSON.stringify(result));
    return result;
  }
  function continueLater(delay) {
    // Persisted queue state remains available; no off-slot trigger is created.
    return 'DEFERRED_TO_NEXT_STANDARD_SLOT';
  }
  // Queue the next slice before work so a hard timeout cannot strand the backlog.
  continueLater(180000);
  for (let n=0;n<pending.length && processed<8;n++) {
    const budget=tmv3_strivenApiBudgetStatus_();
    if (budget.exhausted || budget.remaining<12) {paused='API_DAILY_BUDGET';break;}
    if ((budget.enabled !== false && budget.count-initialBudget.count>=32) || Date.now()-started>=120000) {paused='SLICE_BUDGET';break;}
    const id=pending[n];
    processed++;
    let intent=false,vertical='',expectedOrderId='',customerId='',soNumber='',searchAttempted=false;
    try {
      const source=tasks.filter(function(row){return String(row['Task ID'])===String(id);});
      if (source.length!==1) {save(id,{state:'BLOCKED',reason:'SOURCE_TASK_NOT_UNIQUE'});continue;}
      const sourceType=tmv3_norm_(source[0]['Task Type']);
      vertical=sourceType.indexOf('service')>=0?'Service':sourceType.indexOf('deliver')>=0?'Delivery':'';
      if (!vertical) {save(id,{state:'BLOCKED',reason:'WRONG_VERTICAL'});continue;}
      const live=tmv3_normalizeV2TaskModel_(tmv3_rawTaskById_(id));
      const type=tmv3_norm_(live['Task Type']);
      customerId=tmv3_clean_(live['Customer ID']);
      if (String(live['Task ID'])!==String(id) || !tmv3_taskIsOpen_(live.Status) ||
          (vertical==='Service'?type.indexOf('service')<0:type.indexOf('deliver')<0) ||
          !/^[1-9]\d*$/.test(customerId)) {
        save(id,{state:'BLOCKED',vertical:vertical,reason:'FRESH_TASK_IDENTITY_STATUS_OR_CUSTOMER'});continue;
      }
      tmv3_upsertTaskCacheRow_(live);
      const title=tmv3_taskFirstTitleOrderNumber_(live.Name);
      if (title.status!=='UNIQUE') {save(id,{state:'BLOCKED',vertical:vertical,reason:'TASK_TITLE_SO_'+title.status});continue;}
      soNumber=title.number;
      const matches=orders.filter(function(order){return tmv3_clean_(order['Order Number'])===title.number &&
        tmv3_taskFirstOrderMatchesVertical_(order,vertical);});
      const orderIds=[];
      matches.forEach(function(order){const value=tmv3_clean_(order['Order ID']);
        if (/^[1-9]\d*$/.test(value) && orderIds.indexOf(value)<0) orderIds.push(value);});
      // Explicit user-provided identity; fresh API proof still must accept the lifecycle.
      if (!orderIds.length && id===19198 && title.number==='586061') orderIds.push('27795');
      if (!orderIds.length) {searchAttempted=true;orderIds.push(tmv3_taskFirstFindOrderByTitle_(title.number,customerId));}
      if (orderIds.length!==1) {save(id,{state:'BLOCKED',vertical:vertical,soNumber:title.number,
        reason:orderIds.length?'AMBIGUOUS_ORDER':'ORDER_NOT_IN_CACHE'});continue;}
      expectedOrderId=orderIds[0];
      const actual=tmv3_clean_(live['Order ID']);
      if (actual && actual!==expectedOrderId) {save(id,{state:'BLOCKED',vertical:vertical,reason:'EXISTING_ORDER_CONFLICT'});continue;}
      tmv3_taskFirstFreshOrderOwnershipById_(expectedOrderId,customerId,live.Name,vertical);
      const prior=JSON.parse(props.getProperty(prefix+id) || 'null');
      if (prior && prior.state==='INTENT') {
        if (prior.orderId===actual && prior.customerId===customerId) {
          save(id,{state:'VERIFIED',vertical:vertical,orderId:actual,customerId:customerId,
            reason:'INTENT_RECONCILED_BY_FRESH_READ',writes:0});
        } else save(id,{state:'UNCERTAIN',vertical:vertical,orderId:expectedOrderId,
          reason:'PREVIOUS_WRITE_NOT_CONFIRMED_NO_RETRY'});
        continue;
      }
      if (actual===expectedOrderId) {
        save(id,{state:'VERIFIED',vertical:vertical,orderId:actual,customerId:customerId,
          reason:'ALREADY_LINKED_FRESH_VERIFIED',writes:0});continue;
      }
      // Persist intent before the existing, independently guarded, Order-only PATCH.
      props.setProperty(prefix+id,JSON.stringify({state:'INTENT',taskId:id,vertical:vertical,
        orderId:expectedOrderId,customerId:customerId,at:new Date().toISOString()}));
      intent=true;
      const result=tmv3_repairExistingTaskRelationships(id,vertical,
        {customerId:customerId,orderId:expectedOrderId,contactId:'',locationId:''},'TASK_FIRST_PRODUCTION');
      writes+=Number(result.writes || 0);
      const after=tmv3_normalizeV2TaskModel_(tmv3_rawTaskById_(id));
      if (String(after['Task ID'])!==String(id) || tmv3_clean_(after['Order ID'])!==expectedOrderId ||
          tmv3_clean_(after['Customer ID'])!==customerId || !tmv3_taskIsOpen_(after.Status) ||
          tmv3_clean_(after['Task Type'])!==tmv3_clean_(live['Task Type']) ||
          tmv3_clean_(after.Name)!==tmv3_clean_(live.Name)) throw new Error('BACKFILL_READBACK_MISMATCH');
      tmv3_upsertTaskCacheRow_(after);
      save(id,{state:'VERIFIED',vertical:vertical,orderId:expectedOrderId,customerId:customerId,
        soNumber:title.number,writes:Number(result.writes || 0),readbackVerified:true});
    } catch(err) {
      const reason=String(err && err.message || err).slice(0,600);
      if (intent) {
        // Keep INTENT for one automatic fresh read on continuation; never blind retry.
        tmv3_audit_(vertical,'',String(id),'SD_ORDER_BACKFILL','ATTENTION',reason);
      } else {
        const prior=JSON.parse(props.getProperty(prefix+id) || 'null');
        const attempts=Number(prior && prior.attempts || 0)+1;
        const transient=/HTTP (429|5\d\d)|DAILY_GUARD|GET failure|timed out|timeout|temporar|Service invoked too many/i.test(reason);
        save(id,{state:transient && attempts<3?'RETRY':'BLOCKED',vertical:vertical,reason:reason,attempts:attempts,soNumber:soNumber,searchAttempted:searchAttempted});
      }
      if (/429|DAILY_GUARD/.test(reason)) {paused='API_RATE_OR_DAILY_GUARD';break;}
    }
  }
  const tally={VERIFIED:0,BLOCKED:0,UNCERTAIN:0,PENDING:0};
  ids.forEach(function(id){const value=JSON.parse(props.getProperty(prefix+id) || 'null');
    const state=value && value.state;
    if (needsWork(id)) {tally.PENDING++;return;}
    if (state && Object.prototype.hasOwnProperty.call(tally,state)) tally[state]++;
    else tally.PENDING++;});
  ScriptApp.getProjectTriggers().filter(function(t){return t.getHandlerFunction()===handler;})
    .forEach(function(t){ScriptApp.deleteTrigger(t);});
  if (tally.PENDING) continueLater(paused==='API_DAILY_BUDGET'?3600000:
    Math.max(1000,60000-(Date.now()-started))); // At least 60 seconds between slice starts; no extra idle minute after a slow slice.
  const summary={status:tally.PENDING?'ORDER_BACKFILL_CONTINUING':'ORDER_BACKFILL_COMPLETE',
    total:ids.length,processed:processed,writes:writes,tally:tally,paused:paused,apiBudget:tmv3_strivenApiBudgetStatus_()};
  props.setProperty(prefix+'SUMMARY',JSON.stringify(summary));
  tmv3_audit_('SYSTEM','','','SD_ORDER_BACKFILL_SUMMARY','INFO',JSON.stringify(summary));
  return summary;
}

/** Existing Delivery Task identity does not require a Calendar approval-report row. */

function tmv3_resumeFullVerticalQueues() {
  return {status:'QUEUES_RETAINED_FOR_NEXT_STANDARD_SLOT',snapshot:tmv3_fullVerticalSweepStatus()};
}

function tmv3_installSchedulePublication_() {
  return {status:'DEFERRED_TO_NEXT_STANDARD_SLOT'};
}

function tmv3_installPublishView() {
  return {status:'RETIRED_OUTSIDE_STANDARD_SLOTS',writes:0};
}
// Read-only readiness inspection. It never installs triggers or executes tasks.

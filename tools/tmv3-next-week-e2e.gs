// Google Apps Script: one owner-confirmed event through production gates and canonical readbacks.
function tmv3_nextWeekConfirmedRun(target) {
  var id=target.id+'@google.com';
  var excluded=['trevor@classicfireplace.ca','stephen@classicfireplace.ca','pramodh@classicfireplace.ca','jay@classicfireplace.ca','thang@classicfireplace.ca'];
  if(TMV3.MODE!=='PRODUCTION_WRITE'||excluded.indexOf(String(target.creatorEmail).toLowerCase())>=0)throw new Error('MODE_OR_CREATOR_GATED');
  if(TMV3.OPERATIONS.preInspectionAutomationCanaryEventId&&TMV3.OPERATIONS.preInspectionAutomationCanaryEventId!==id)throw new Error('DIFFERENT_CANARY_SCOPE_NO_RUN');
  if(target.originVerified){var original=CalendarApp.getCalendarById(target.sourceCalendarId).getEventById(id);var creators=original&&original.getCreators?original.getCreators():[];if(creators.length!==1||creators[0]!==target.creatorEmail)throw new Error('ORIGINAL_CREATOR_VERIFICATION_FAILED');PropertiesService.getScriptProperties().setProperty('TMV3_PI_ORIGIN_'+tmv3_hash_(id),JSON.stringify({eventId:id,calendarId:target.sourceCalendarId,creator:target.creatorEmail,at:new Date().toISOString(),reason:'OWNER_CONFIRMED_PREINSPECTION'}));}
  var record=tmv3_findFreshEventRecord_('PreInspection',id);
  if(new Date(record.start).getTime()!==new Date(target.start).getTime()||new Date(record.end).getTime()!==new Date(target.end).getTime()||tmv3_preInspectionCreatorEmail_(record)!==target.creatorEmail)throw new Error('IDENTITY_SCHEDULE_CREATOR_READBACK_MISMATCH');
  if(target.key==='alexandra') {
    var rows=tmv3_reportRows_(TMV3.PROPERTIES.CUSTOMERS).map(tmv3_normalizeCustomer_).filter(function(r){return String(r[0])==='62996'&&tmv3_phone10_(r[3])==='6474446352'&&String(r[2]).toLowerCase()==='alexandra alousis';});
    if(rows.length!==1||tmv3_phone10_(record.phone||tmv3_extractPhone_(record.title))!=='6474446352')throw new Error('ALEXANDRA_CUSTOMER_PROOF_FAILED');
    var locations=tmv3_preInspectionCustomerLocationsFresh_(62996).filter(function(l){return tmv3_addressStrongMatch_(tmv3_addressParts_(record.location),tmv3_addressParts_(tmv3_locationFullAddress_(l)));});
    if(locations.length!==1)throw new Error('ALEXANDRA_LOCATION_NOT_UNIQUE');
    var sh=tmv3_sheet_(TMV3.SHEETS.CUSTOMERS),values=sh.getDataRange().getValues();
    if(values[0].join('|')!=='Customer ID|Customer Number|Name|Primary Phone|Primary Email|Fingerprint')throw new Error('CUSTOMER_CACHE_SCHEMA_MISMATCH');
    var existing=[];values.slice(1).forEach(function(r,i){if(String(r[0])==='62996')existing.push(i+2);});
    if(existing.length>1)throw new Error('DUPLICATE_CUSTOMER_CACHE_ROWS');
    sh.getRange(existing.length?existing[0]:values.length+1,1,1,6).setValues([rows[0]]);
    tmv3_upsertLocationCacheObject_(locations[0]);
    tmv3_audit_('PreInspection',id,'','VERIFIED_CUSTOMER_LOCATION_CACHE_HYDRATION','PASS',JSON.stringify({customerId:62996,locationId:locations[0]['Location ID'],customerProof:'EXACT_LIVE_REPORT_NAME_PHONE',businessWrites:0}));
  }
  tmv3_audit_('PreInspection',id,'','OWNER_NEXT_WEEK_E2E','AUTHORIZED',JSON.stringify({name:target.name,creator:target.creatorEmail}));
  var native=tmv3_preInspectionAutomationCycle_({force:true,eventId:id,reason:'OWNER_NEXT_WEEK_E2E'});
  for(var attempt=1;native.status==='LOCK_BUSY'&&attempt<4;attempt++){Utilities.sleep(15000);native=tmv3_preInspectionAutomationCycle_({force:true,eventId:id,reason:'OWNER_NEXT_WEEK_LOCK_RETRY'});}
  var plans=tmv3_step7FreshPlansForEvent_('PreInspection',id);
  var tasks=plans.filter(function(p){return /^\d+$/.test(String(p.taskId||''));}).map(function(p){var raw=tmv3_getTaskById_(Number(p.taskId));var canonical=tmv3_getCanonicalV1TaskSchedule_(Number(p.taskId));return tmv3_preInspectionCanonicalCacheTask_(raw,canonical);});
  var copies=tmv3_requiredCalendarCopiesForEvent_(record).map(function(calendarId){var f=tmv3_findEventCopyRobust_(calendarId,id);var description=f&&f.event?String(f.event.getDescription()||''):'';return {calendarId:calendarId,found:!!(f&&f.event),title:f&&f.event?f.event.getTitle():'',taskLinks:description.match(/TaskID=\d+/g)||[]};});
  var clean=plans.length===1&&!plans[0].blocker&&plans[0].plan==='NO_CHANGE'&&(plans[0].actions||[]).every(function(a){return a===TMV3_STEP7_ACTION.VERIFY_CALENDAR_LINKS;})&&tasks.length===1&&copies.every(function(c){return c.found&&c.taskLinks.indexOf('TaskID='+tasks[0]['Task ID'])>=0;});
  var francesLocationEvidence=target.key==='robert'?tmv3_fetchJson_(TMV3.API_BASE+'/v1/customers/36935/locations',{method:'get'}):null;
  return {francesLocationEvidence:francesLocationEvidence,status:clean?'VERIFIED':'ATTENTION',eventId:id,name:target.name,native:native,afterPlans:plans,tasks:tasks,calendarCopies:copies,budget:tmv3_strivenApiBudgetStatus_()};
}

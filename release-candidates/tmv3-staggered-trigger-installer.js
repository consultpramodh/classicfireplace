/** Google Apps Script: replace the four vertical schedules one handler at a time. */
function tmv3_installStandardDailyTriggers() {
  const specs = [
    ['tmv3_preInspectionCheck0800',6], ['tmv3_preInspectionCheck1300',11], ['tmv3_preInspectionCheck1700',16],
    ['tmv3_installCheck0800',7], ['tmv3_installCheck1300',12], ['tmv3_installCheck1700',17],
    ['tmv3_deliveryCheck0800',8], ['tmv3_deliveryCheck1300',13], ['tmv3_deliveryCheck1700',18],
    ['tmv3_serviceCheck0800',9], ['tmv3_serviceCheck1300',14], ['tmv3_serviceCheck1700',19]
  ];
  const timezone = 'America/Toronto';
  const initial = ScriptApp.getProjectTriggers();
  const target = specs.map(function(s) { return s[0]; });
  const duplicates = target.filter(function(h) { return initial.filter(function(t) { return t.getHandlerFunction() === h; }).length !== 1; });
  if (duplicates.length) throw Error('TRIGGER_INVENTORY_NOT_UNIQUE:' + duplicates.join(','));
  if (initial.length >= 20) throw Error('TRIGGER_REPLACEMENT_REQUIRES_SPARE_SLOT');
  const results = [];
  const props = PropertiesService.getScriptProperties();
  const journalKey = 'TMV3_STAGGERED_INSTALL_JOURNAL';
  let pending = null;
  function checkpoint(status, handler, error) {
    props.setProperty(journalKey, JSON.stringify({status:status, completed:results.slice(), currentHandler:handler || '', pending:pending, error:String(error || ''), at:new Date().toISOString()}));
  }
  checkpoint('IN_PROGRESS');
  try { specs.forEach(function(spec) {
    const matches = ScriptApp.getProjectTriggers().filter(function(t) { return t.getHandlerFunction() === spec[0]; });
    if (matches.length !== 1) throw Error('TRIGGER_CHANGED_DURING_INSTALL:' + spec[0]);
    pending = {handler:spec[0],hour:spec[1],oldTriggerId:String(matches[0].getUniqueId()),newTriggerId:'',phase:'BEFORE_CREATE'};
    checkpoint('IN_PROGRESS',spec[0]);
    const created = ScriptApp.newTrigger(spec[0]).timeBased().atHour(spec[1]).nearMinute(30).everyDays(1).inTimezone(timezone).create();
    pending.newTriggerId=String(created.getUniqueId()); pending.phase='CREATED_BEFORE_DELETE';
    try { checkpoint('IN_PROGRESS',spec[0]); }
    catch (err) { try { ScriptApp.deleteTrigger(created); } catch (cleanup) {} throw err; }
    try { ScriptApp.deleteTrigger(matches[0]); }
    catch (err) { try { ScriptApp.deleteTrigger(created); } catch (cleanup) {} throw err; }
    results.push({handler:spec[0],hour:spec[1],triggerId:pending.newTriggerId});
    pending = null;
    checkpoint('IN_PROGRESS',spec[0]);
  }); } catch (error) {
    checkpoint('PARTIAL_REQUIRES_RETRY', '', error && error.message || error);
    throw error;
  }
  const actual = ScriptApp.getProjectTriggers();
  if (target.some(function(h) { return actual.filter(function(t) { return t.getHandlerFunction() === h; }).length !== 1; })) throw Error('TRIGGER_HANDLER_READBACK_FAILED');
  const out = {status:'STAGGERED_HANDLERS_INSTALLED',timezone:timezone,scheduled:results,maintenanceUnchanged:true};
  props.setProperty('TMV3_STANDARD_SCHEDULE',JSON.stringify(out));
  checkpoint('HANDLERS_INSTALLED');
  return out;
}

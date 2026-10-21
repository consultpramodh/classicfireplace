// Google Apps Script: inventory all Friday events on both configured PreInspection sources.
function tmv3_nextWeekAudit20261026() {
  var cfg=TMV3.VERTICALS.PreInspection;
  var sources=tmv3_verticalCalendars_('PreInspection',cfg).concat((cfg.secondaryCalendarIds||[]).map(function(id){return {calendarId:id,calendarName:'Stephen',role:'SECONDARY_STEPHEN'};}));
  var start=new Date('2026-10-26T00:00:00-04:00'),end=new Date('2026-11-02T00:00:00-05:00');
  var ignoredNames=['Trevor Burke','Stephen Foley','Pramodh Kumar','Jay Scott','Thang Tran'];
  var normalizedName=function(x){return String(x||'').toLowerCase().replace(/[^a-z0-9]/g,'');};
  var directory=tmv3_employeeDirectory_();
  var ignoredEmployees=directory.filter(function(e){return ignoredNames.some(function(n){return normalizedName(n)===normalizedName(e.name);});});
  var ignoredEmails=ignoredEmployees.map(function(e){return String(e.email).toLowerCase();});
  var unresolvedNames=ignoredNames.filter(function(n){return !ignoredEmployees.some(function(e){return normalizedName(n)===normalizedName(e.name);});});
  var inventory=[],eligible=[],seen={};
  sources.forEach(function(source){
    var calendar=CalendarApp.getCalendarById(source.calendarId);if(!calendar)throw new Error('SOURCE_CALENDAR_UNAVAILABLE');
    calendar.getEvents(start,end).forEach(function(event){
      if(event.getStartTime()>=end||event.getEndTime()<=start)return;
      var record=tmv3_calendarEvent_('PreInspection',cfg,source,event,{applyEligibility:false});
      var creators=event.getCreators().map(function(x){return String(x).toLowerCase();});
      var creatorExcluded=creators.some(function(email){return ignoredEmails.indexOf(email)>=0;});
      var reason=creatorExcluded?'IGNORED_CREATOR':!record?'NO_RECORD':tmv3_step2PreInspectionNonCustomer_(record)?'NON_CUSTOMER':source.role==='SECONDARY_STEPHEN'&&!tmv3_preInspectionExplicitCandidate_(record)?'SECONDARY_NOT_EXPLICIT_PREINSPECTION':'ELIGIBLE';
      var entry={creators:creators,creatorNames:directory.filter(function(e){return creators.indexOf(String(e.email).toLowerCase())>=0;}).map(function(e){return e.name;}),eventId:event.getId(),title:event.getTitle(),start:event.getStartTime().toISOString(),end:event.getEndTime().toISOString(),allDay:event.isAllDayEvent(),calendarId:source.calendarId,role:source.role,eligibility:reason,location:event.getLocation(),description:event.getDescription()};
      inventory.push(entry);
      var key=event.getId()+'|'+event.getStartTime().toISOString();
      if(reason==='ELIGIBLE'&&!seen[key]){seen[key]=true;eligible.push(record);}
    });
  });
  var results=eligible.map(function(record){
    try {var plans=record.calendarRole==='PRIMARY_SHARED'?tmv3_step7FreshPlansForEvent_('PreInspection',record.eventId):[];
    var tasks=plans.filter(function(p){return /^\d+$/.test(String(p.taskId||''));}).map(function(p){var raw=tmv3_getTaskById_(Number(p.taskId));var canonical=tmv3_getCanonicalV1TaskSchedule_(Number(p.taskId));return {task:tmv3_preInspectionCanonicalCacheTask_(raw,canonical),canonical:canonical,v2Start:raw['Start'],v2Due:raw['Due']};});
    var copies=tmv3_requiredCalendarCopiesForEvent_(record).map(function(id){var f=tmv3_findEventCopyRobust_(id,record.eventId);var desc=f&&f.event?String(f.event.getDescription()||''):'';return {calendarId:id,found:!!(f&&f.event),title:f&&f.event?f.event.getTitle():'',taskLinks:desc.match(/TaskID=\d+/g)||[],description:desc};});
    return {eventId:record.eventId,title:record.title,source:record.calendarRole,plans:plans,tasks:tasks,calendarCopies:copies};}catch(e){return {eventId:record.eventId,title:record.title,source:record.calendarRole,error:String(e)};}
  });
  return {status:'NEXT_WEEK_ALL_READBACK',weekStart:'2026-10-26',weekEnd:'2026-11-01',timezone:TMV3_TIMEZONE,calendarCount:sources.length,ignoredEmployees:ignoredEmployees,unresolvedIgnoredNames:unresolvedNames,inventory:inventory,eligibleCount:eligible.length,results:results,budget:tmv3_strivenApiBudgetStatus_(),taskWrites:0,calendarWrites:0};
}

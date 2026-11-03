/** Google Apps Script candidate: fresh Delivery calendar snapshot only. NOT DEPLOYED. */
function tmv3_deliveryFreshIntakeRows_() {
  const cfg=TMV3.VERTICALS.Delivery;
  if (!cfg || !Array.isArray(cfg.calendarIds) || cfg.calendarIds.length!==1 || !cfg.calendarIds[0]) throw Error('DELIVERY_CALENDAR_CONFIG_INVALID');
  const cal=CalendarApp.getCalendarById(cfg.calendarIds[0]);
  if (!cal) throw Error('DELIVERY_CALENDAR_UNAVAILABLE_NO_SWEEP');
  const start=new Date();start.setHours(0,0,0,0);start.setDate(start.getDate()-Number(cfg.lookbackDays||0));
  const end=new Date();end.setDate(end.getDate()+Number(cfg.lookaheadDays||365));end.setHours(23,59,59,999);
  const list=cal.getEvents(start,end);
  if (!Array.isArray(list)) throw Error('DELIVERY_CALENDAR_RESULT_INVALID_NO_SWEEP');
  const byId={},rows=[];
  list.forEach(function(event){
    const record=tmv3_calendarEvent_('Delivery',cfg,{calendarId:cfg.calendarIds[0],role:'DELIVERY'},event);
    if (!record) return;
    const id=tmv3_clean_(record.eventId),date=new Date(record.start);
    if (!id || !isFinite(date.getTime())) throw Error('DELIVERY_CALENDAR_EVENT_INVALID_NO_SWEEP');
    if (byId[id]) {
      // Duplicate IDs with different starts can represent recurrence; do not silently discard an occurrence.
      if (byId[id]!==date.toISOString()) throw Error('DELIVERY_DUPLICATE_EVENT_ID_DIFFERENT_START_NO_SWEEP');
      return;
    }
    byId[id]=date.toISOString();rows.push({'Event ID':id,'Calendar Start':date});
  });
  return rows;
}

// Google Apps Script: V3 owns its canonical footer; legacy-only events keep the legacy path.
const PREINSPECT_V3_LINK_OWNER_VERSION='2026-10-23-canonical-link-owner-r1';
function preinspectV3CanonicalTaskTarget_(description, taskId) {
  const text=String(description||'').replace(/&amp;/gi,'&');
  const targets=[];
  const rx=/<a\b[^>]*href\s*=\s*["']([^"']+)["']/gi;
  let m;
  while((m=rx.exec(text))) {
    let url=m[1];
    if(/^https:\/\/(?:www\.)?google\.com\/url\?/i.test(url)) {
      const q=url.match(/[?&](?:q|url)=([^&]+)/i);if(!q)continue;
      try{url=decodeURIComponent(q[1]);}catch(ignored){continue;}
    }
    for(let i=0;i<2 && /%[0-9a-f]{2}/i.test(url);i++){try{url=decodeURIComponent(url);}catch(ignored){break;}}
    const target=url.match(/^https:\/\/classicfireplace\.striven\.com\/Tasks\/TaskInfo\.aspx\?TaskID=(\d+)(?:&[^#]*)?$/i);
    if(target)targets.push(String(Number(target[1])));
  }
  return targets.length===1 && targets[0]===String(Number(taskId));
}
function preinspectV3CanonicalLinkOwner_(eventId, taskId) {
  const id=Number(taskId),eid=String(eventId||'').trim();
  if(!eid || !Number.isSafeInteger(id) || id<=0)return null;
  const calendars=[TM_PREINSPECT_DUAL_CALENDAR_R1.GROUP_CALENDAR_ID,TM_PREINSPECT_DUAL_CALENDAR_R1.STEPHEN_CALENDAR_ID];
  const copies=calendars.map(function(calendarId){
    const found=tmPreInspectFindCalendarEventById_(calendarId,eid);
    if(!found || !found.event)return {calendarId:calendarId,found:false,canonical:false,verified:false};
    const text=String(found.event.getDescription()||'');
    const visible=text.replace(/&#(?:0*45|x0*2d);/gi,'-');
    const canonical=/-{5,}\s*Striven\s+Links\s*-{5,}/i.test(visible);
    const unique=(visible.match(/Striven\s+Links/gi)||[]).length===1 && !/Pre[- ]Inspection\s+Task\s+Link|PREINSPECT_STRIVEN_TASK_LINK_(?:START|END)/i.test(visible);
    return {calendarId:calendarId,found:true,canonical:canonical,verified:canonical&&unique&&preinspectV3CanonicalTaskTarget_(text,id)};
  });
  if(!copies.some(function(c){return c.canonical;}))return null;
  const verified=copies.every(function(c){return c.verified;});
  return {mode:PREINSPECT_V3_LINK_OWNER_VERSION,status:verified?'V3_CANONICAL_LINK_PRESERVED':'DEFERRED_TO_V3_CANONICAL_LINK_REVIEW',
    eventId:eid,taskId:id,taskUrl:'https://classicfireplace.striven.com/Tasks/TaskInfo.aspx?TaskID='+id,
    writesPerformed:false,writePerformed:false,calendarWritesPerformed:false,strivenWritesPerformed:false,
    linkReturned:verified,readBackVerified:verified,existingDescriptionPreserved:true,
    authoredDescriptionPreserved:true,calendarCopiesFound:copies.filter(function(c){return c.found;}).length,
    calendarCopiesVerified:copies.filter(function(c){return c.verified;}).length,calendars:copies};
}
function verifyPreinspectV3CanonicalLinkOwnership(eventId,taskId) {
  const result=preinspectV3CanonicalLinkOwner_(eventId,taskId);
  if(!result)throw Error('EVENT_NOT_OWNED_BY_V3_CANONICAL_LINK_ENGINE');
  Logger.log(JSON.stringify(result));return result;
}

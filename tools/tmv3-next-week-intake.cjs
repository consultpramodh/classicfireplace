// JavaScript / Node.js: exact owner-confirmed event intake; no invitations or unrelated edits.
'use strict';
const fs=require('node:fs');
async function prepare(token,target){
 const headers={Authorization:'Bearer '+token,'Content-Type':'application/json'};
 async function api(url,method='GET',body){const r=await fetch(url,{method,headers,...(body?{body:JSON.stringify(body)}:{}),redirect:'error',signal:AbortSignal.timeout(120000)});const data=await r.json();if(!r.ok)throw Error('CALENDAR_INTAKE_HTTP_'+r.status+':'+String(data.error&&data.error.message||''));return data;}
 const root='https://www.googleapis.com/calendar/v3/calendars/';
 const sourceId='classicfireplace.ca_c20qcqfhvjbv784asn9pvuiaf4@group.calendar.google.com',primary='c_3088a3989f3eb809957ed5c40137a7111a0ac97f68c29b40c144028cb14320dc@group.calendar.google.com';
 const event=await api(root+encodeURIComponent(sourceId)+'/events/'+target.id);
 const norm=x=>String(x||'').toLowerCase().replace(/[^a-z0-9]/g,'');
 const excluded=['trevor@classicfireplace.ca','stephen@classicfireplace.ca','pramodh@classicfireplace.ca','jay@classicfireplace.ca','thang@classicfireplace.ca'];
 if(!event.creator||excluded.includes(String(event.creator.email).toLowerCase()))throw Error('IGNORED_OR_UNKNOWN_CREATOR_NO_RUN');
 if(event.iCalUID!==target.id+'@google.com'||!norm(event.summary).includes(norm(target.name))||new Date(event.start.dateTime).getTime()!==new Date(target.start).getTime()||new Date(event.end.dateTime).getTime()!==new Date(target.end).getTime()||event.recurrence||event.recurringEventId||event.status==='cancelled')throw Error('SOURCE_IDENTITY_OR_SCHEDULE_MISMATCH');
 const dir='next-week-e2e-evidence/'+target.key;fs.mkdirSync(dir,{recursive:true,mode:0o700});fs.writeFileSync(dir+'/source-event-before.json',JSON.stringify(event),{mode:0o600});
 const url=root+encodeURIComponent(primary)+'/events';
 let found=await api(url+'?iCalUID='+encodeURIComponent(event.iCalUID));
 if(found.nextPageToken||found.items.length>1)throw Error('MULTIPLE_CANONICAL_COPIES_NO_WRITE');
 let imported=false;
 if(!found.items.length){
  const nearby=await api(url+'?timeMin='+encodeURIComponent(event.start.dateTime)+'&timeMax='+encodeURIComponent(event.end.dateTime)+'&singleEvents=true&maxResults=100');
  if(nearby.nextPageToken||nearby.items.some(e=>e.iCalUID!==event.iCalUID&&(norm(e.summary).includes(norm(target.name))||(event.location&&norm(e.location)===norm(event.location)))))throw Error('POSSIBLE_DUPLICATE_CANONICAL_EVENT_NO_IMPORT');
  const body={iCalUID:event.iCalUID,start:event.start,end:event.end,summary:event.summary,location:event.location||'',description:event.description||'',organizer:event.organizer,attendees:[...(event.attendees||[]).filter(a=>String(a.email||'').toLowerCase()!==primary.toLowerCase()),{email:primary,responseStatus:'accepted'}],visibility:event.visibility||'default',reminders:event.reminders,extendedProperties:{private:{tmv3OwnerConfirmedPreinspection:'2026-10-21',tmv3SourceCalendarId:sourceId,tmv3OriginalCreator:event.creator&&event.creator.email||''}}};
  await api(url+'/import','POST',body);imported=true;
  found=await api(url+'?iCalUID='+encodeURIComponent(event.iCalUID));
 }
 if(found.items.length!==1)throw Error('CANONICAL_IMPORT_UNCERTAIN_NO_RETRY');
 const copy=found.items[0];if((imported&&(copy.summary!==event.summary||(copy.description||'')!==(event.description||'')))||(copy.location||'')!==(event.location||'')||new Date(copy.start.dateTime).getTime()!==new Date(event.start.dateTime).getTime()||new Date(copy.end.dateTime).getTime()!==new Date(event.end.dateTime).getTime())throw Error('CANONICAL_COPY_READBACK_MISMATCH');
 if(!copy.creator||String(copy.creator.email).toLowerCase()!==String(event.creator.email).toLowerCase()){const provenance=copy.extendedProperties&&copy.extendedProperties.private;if(!provenance||provenance.tmv3OriginalCreator!==event.creator.email||provenance.tmv3SourceCalendarId!==sourceId||provenance.tmv3OwnerConfirmedPreinspection!=='2026-10-21')throw Error('CANONICAL_CREATOR_PROVENANCE_MISSING_NO_TASK_RUN');target.originVerified=true;target.sourceCalendarId=sourceId;}
 target.creatorEmail=event.creator.email;
 console.log(JSON.stringify({calendarIntake:'CANONICAL_COPY_VERIFIED',imported,eventId:copy.iCalUID,sourceCreator:event.creator,canonicalCreator:copy.creator}));
 return target;
}
module.exports={prepare};

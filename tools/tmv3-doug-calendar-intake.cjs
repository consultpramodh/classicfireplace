// JavaScript / Node.js: exact owner-confirmed event intake; no invitations or unrelated edits.
'use strict';
const fs=require('node:fs');
async function prepare(token){
 const headers={Authorization:'Bearer '+token,'Content-Type':'application/json'};
 async function api(url,method='GET',body){const r=await fetch(url,{method,headers,...(body?{body:JSON.stringify(body)}:{}),redirect:'error',signal:AbortSignal.timeout(120000)});const data=await r.json();if(!r.ok)throw Error('CALENDAR_INTAKE_HTTP_'+r.status+':'+String(data.error&&data.error.message||''));return data;}
 const service='https://serviceusage.googleapis.com/v1/projects/499373863884/services/calendar-json.googleapis.com';
 const state=await api(service);if(state.state!=='ENABLED'){
  const op=await api(service+':enable','POST',{});if(op.error)throw Error('CALENDAR_API_ENABLE_FAILED');
  if(op.name&&!op.done){let done=false;for(let i=0;i<12;i++){await new Promise(r=>setTimeout(r,5000));const poll=await api('https://serviceusage.googleapis.com/v1/'+op.name);if(poll.error)throw Error('CALENDAR_API_ENABLE_FAILED');if(poll.done){done=true;break;}}if(!done)throw Error('CALENDAR_API_ENABLE_PENDING_NO_INTAKE');}
 }
 const root='https://www.googleapis.com/calendar/v3/calendars/';
 const sourceId='classicfireplace.ca_c20qcqfhvjbv784asn9pvuiaf4@group.calendar.google.com',primary='c_3088a3989f3eb809957ed5c40137a7111a0ac97f68c29b40c144028cb14320dc@group.calendar.google.com';
 const event=await api(root+encodeURIComponent(sourceId)+'/events/4540pk2ej2ejl8uubeo2o4ova2');
 if(event.iCalUID!=='4540pk2ej2ejl8uubeo2o4ova2@google.com'||!/^29447\b/.test(event.summary)||new Date(event.start.dateTime).toISOString()!=='2026-10-23T21:00:00.000Z'||new Date(event.end.dateTime).toISOString()!=='2026-10-23T22:00:00.000Z'||event.recurrence||event.recurringEventId||event.status==='cancelled')throw Error('SOURCE_IDENTITY_OR_SCHEDULE_MISMATCH');
 fs.mkdirSync('doug-confirmed-preinspect-evidence',{recursive:true,mode:0o700});fs.writeFileSync('doug-confirmed-preinspect-evidence/source-event-before.json',JSON.stringify(event),{mode:0o600});
 const url=root+encodeURIComponent(primary)+'/events';
 let found=await api(url+'?iCalUID='+encodeURIComponent(event.iCalUID));
 if(found.nextPageToken||found.items.length>1)throw Error('MULTIPLE_CANONICAL_COPIES_NO_WRITE');
 let imported=false;
 if(!found.items.length){
  const nearby=await api(url+'?timeMin='+encodeURIComponent(event.start.dateTime)+'&timeMax='+encodeURIComponent(event.end.dateTime)+'&singleEvents=true&maxResults=100');
  if(nearby.nextPageToken||nearby.items.some(e=>/29447|Doug\s+Beatty|509.?4304/i.test([e.summary,e.description].join(' '))))throw Error('POSSIBLE_DUPLICATE_CANONICAL_EVENT_NO_IMPORT');
  const body={iCalUID:event.iCalUID,start:event.start,end:event.end,summary:event.summary,location:event.location||'',description:event.description||'',organizer:event.organizer,attendees:event.attendees,visibility:event.visibility||'default',reminders:event.reminders,extendedProperties:{private:{tmv3OwnerConfirmedPreinspection:'2026-10-21',tmv3SourceCalendarId:sourceId,tmv3OriginalCreator:event.creator&&event.creator.email||''}}};
  await api(url+'/import','POST',body);imported=true;
  found=await api(url+'?iCalUID='+encodeURIComponent(event.iCalUID));
 }
 if(found.items.length!==1)throw Error('CANONICAL_IMPORT_UNCERTAIN_NO_RETRY');
 const copy=found.items[0];if(copy.summary!==event.summary||copy.location!==(event.location||'')||copy.description!==(event.description||'')||new Date(copy.start.dateTime).getTime()!==new Date(event.start.dateTime).getTime()||new Date(copy.end.dateTime).getTime()!==new Date(event.end.dateTime).getTime())throw Error('CANONICAL_COPY_READBACK_MISMATCH');
 console.log(JSON.stringify({calendarIntake:'CANONICAL_COPY_VERIFIED',imported,eventId:copy.iCalUID,sourceCreator:event.creator,sourceOrganizer:event.organizer,canonicalCreator:copy.creator,canonicalOrganizer:copy.organizer}));
}
module.exports={prepare};

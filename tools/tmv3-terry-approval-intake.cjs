// Node.js (GitHub Actions): exact-event private-copy intake; never invites or creates Striven Tasks.
'use strict';
const assert=require('node:assert/strict');
const SOURCE='classicfireplace.ca_c20qcqfhvjbv784asn9pvuiaf4@group.calendar.google.com';
const TARGET='c_3088a3989f3eb809957ed5c40137a7111a0ac97f68c29b40c144028cb14320dc@group.calendar.google.com';
const SCRIPT_ID='1shaSL1CeNhR2-fr8H4x0fP2KUIjpOizLFyrNRAnGGXkCvERX4hZyJ5Gt';
const EVENT_ID='5mafnqht16o2hrqv4232rofmm3';
const UID=EVENT_ID+'@google.com';
const EXPECTED=Object.freeze({
  title:'53480 - Terry Beettam (416) 523-9364',
  location:'29 Hilling Dr, Ajax, ON L1S 4Z7, Canada',
  start:'2026-11-11T20:00:00.000Z',
  end:'2026-11-11T21:00:00.000Z',
  creator:'adam@classicfireplace.ca'
});
const ROOT='https://www.googleapis.com/calendar/v3/calendars/';
function scope(o,keys){if(!o||typeof o!=='object')return '';for(const [k,v] of Object.entries(o))if(keys.includes(k)&&typeof v==='string'&&v)return v;for(const v of Object.values(o)){const r=scope(v,keys);if(r)return r;}return '';}
function validateSource(e){
  if(!e||e.status!=='confirmed'||e.id!==EVENT_ID||e.iCalUID!==UID)
    throw Error('SOURCE_EVENT_UID_OR_STATUS_CHANGED_NO_IMPORT');
  if(e.summary!==EXPECTED.title||e.location!==EXPECTED.location||
     new Date(e.start&&e.start.dateTime).toISOString()!==EXPECTED.start||
     new Date(e.end&&e.end.dateTime).toISOString()!==EXPECTED.end)
    throw Error('SOURCE_TITLE_ADDRESS_OR_SCHEDULE_CHANGED_NO_IMPORT');
  if(!e.creator||String(e.creator.email||'').toLowerCase()!==EXPECTED.creator)
    throw Error('SOURCE_CREATOR_NOT_VERIFIED_NO_IMPORT');
  if(!e.organizer||String(e.organizer.email||'').toLowerCase()!==SOURCE.toLowerCase())
    throw Error('SOURCE_CALENDAR_OWNER_NOT_VERIFIED_NO_IMPORT');
  if(e.eventType&&e.eventType!=='default'||e.recurringEventId||e.recurrence||
     (e.attendees||[]).length||e.attachments&&e.attachments.length)
    throw Error('SOURCE_RECURRENCE_ATTENDEES_OR_ATTACHMENTS_REQUIRE_MANUAL_REVIEW');
  if(typeof e.description!=='string'||!e.description.includes('H3 install')||
     !e.description.toLowerCase().includes('g3.5'))
    throw Error('SOURCE_AUTHORED_NOTES_CHANGED_NO_IMPORT');
  return e;
}
function makePrivateCopy(e){
  validateSource(e);
  return {
    iCalUID:e.iCalUID,summary:e.summary,description:e.description,
    start:e.start,end:e.end,location:e.location,organizer:e.organizer,
    visibility:e.visibility||'private',privateCopy:true,
    reminders:{useDefault:false,overrides:[]},
    extendedProperties:{private:{
      tmv3OwnerApprovedIntake:'2026-11-10',
      tmv3CustomerNumber:'53480',
      tmv3SourceEventUid:UID,
      tmv3SourceCalendarId:SOURCE,
      tmv3TaskWriteHold:'YES'
    }}
  };
}
function verifyCopy(copy,source){
  if(!copy||copy.status==='cancelled'||copy.iCalUID!==UID||
     copy.summary!==source.summary||copy.description!==source.description||
     copy.location!==source.location||
     new Date(copy.start&&copy.start.dateTime).getTime()!==new Date(source.start.dateTime).getTime()||
     new Date(copy.end&&copy.end.dateTime).getTime()!==new Date(source.end.dateTime).getTime())
    throw Error('COPY_EVENT_IDENTITY_OR_CONTENT_READBACK_FAILED');
  if((copy.attendees||[]).length)
    throw Error('UNEXPECTED_CALENDAR_ATTENDEES_NO_FURTHER_ACTION');
  if(copy.privateCopy!==true)
    throw Error('PRIVATE_COPY_NOT_VERIFIED_NO_FURTHER_ACTION');
  const tags=copy.extendedProperties&&copy.extendedProperties.private||{};
  if(tags.tmv3TaskWriteHold!=='YES'||tags.tmv3SourceEventUid!==UID)
    throw Error('COPY_APPROVAL_MARKERS_MISSING');
  return true;
}
function ensureNoDuplicate(nearby,source){
  if(nearby.nextPageToken)throw Error('CALENDAR_NEARBY_EVENTS_INCOMPLETE_NO_IMPORT');
  const same=(nearby.items||[]).filter(x=>x.status!=='cancelled'&&
    x.iCalUID!==source.iCalUID &&
    (String(x.summary||'').includes('53480')||
      /Terry\s+Beettam/i.test(String(x.summary||''))||
      String(x.summary||'').includes('523-9364')));
  if(same.length)throw Error('OTHER_CF_EVENT_POSSIBLY_DUPLICATE_NO_IMPORT');
}
async function authorize(){
  const config=JSON.parse(process.env.CLASPRC_JSON||'{}');
  const form=new URLSearchParams({grant_type:'refresh_token',
    client_id:scope(config,['clientId','client_id']),
    client_secret:scope(config,['clientSecret','client_secret']),
    refresh_token:scope(config,['refresh_token','refreshToken'])});
  if([...form.values()].some(x=>!x))throw Error('GOOGLE_CREDENTIAL_FIELDS_MISSING');
  const r=await fetch('https://oauth2.googleapis.com/token',{method:'POST',body:form,signal:AbortSignal.timeout(20000)});
  if(!r.ok)throw Error('GOOGLE_OAUTH_HTTP_'+r.status);
  const body=await r.json();if(!body.access_token)throw Error('GOOGLE_ACCESS_TOKEN_MISSING');return body.access_token;
}
async function api(token,url,method='GET',body){
  const r=await fetch(url,{method,headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},
    ...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(30000)});
  let data;try{data=await r.json();}catch(e){throw Error('UNKNOWN_GOOGLE_API_RESPONSE_NO_RETRY');}
  if(!r.ok)throw Error('GOOGLE_'+method+'_HTTP_'+r.status+'_'+String(data.error&&data.error.message||'').slice(0,100));
  return data;
}
function calUrl(cal,part=''){return ROOT+encodeURIComponent(cal)+'/events'+part;}
async function checkLiveHold(token){
  const data=await api(token,'https://script.googleapis.com/v1/projects/'+SCRIPT_ID+'/content');
  const files=Object.fromEntries((data.files||[]).map(x=>[x.name,x.source||'']));
  if(!files['00_Configuration'].includes('operatorApprovedIntakeHolds:Object.freeze(')||
     !files['00_Configuration'].includes(UID)||
     !files['10_Shared_Core'].includes('OPERATOR_APPROVED_INTAKE_AWAITING_FRESH_VERIFICATION')||
     !files['10_Shared_Core'].includes('OPERATOR_APPROVED_INTAKE_TASK_CREATION_HELD')||
     !files['30_PreInspection'].includes('APPROVED_INTAKE_TASK_AND_NOTIFICATION_HELD')||
     !files['30_PreInspection'].includes('APPROVAL_NOTIFICATION_HOLD')||
     !files['30_PreInspection'].includes('tmv3_preInspectionApprovalHold_(event.getId())'))
    throw Error('PRODUCTION_HOLD_NOT_DEPLOYED_NO_IMPORT');
}
async function inspect(token){
  await checkLiveHold(token);
  const source=validateSource(await api(token,calUrl(SOURCE,'/'+EVENT_ID)));
  const byUid=await api(token,calUrl(TARGET,'?iCalUID='+encodeURIComponent(UID)+'&maxResults=20'));
  if(byUid.nextPageToken||(byUid.items||[]).length>1)throw Error('MULTIPLE_OR_PAGED_CANONICAL_COPIES_NO_IMPORT');
  const existing=(byUid.items||[])[0]||null;
  if(existing)verifyCopy(existing,source);
  else {
    const nearbyUrl=calUrl(TARGET,
      '?timeMin='+encodeURIComponent('2026-11-11T19:50:00Z')+
      '&timeMax='+encodeURIComponent('2026-11-11T21:10:00Z')+
      '&singleEvents=true&maxResults=250');
    ensureNoDuplicate(await api(token,nearbyUrl),source);
  }
  return {source,existing};
}
async function main(){
  const mode=process.argv[2]||'dry-run';
  if(!['dry-run','import'].includes(mode))throw Error('MODE_NOT_AUTHORIZED');
  const token=await authorize();
  const first=await inspect(token);
  console.log('TERRY_INTAKE_PREFLIGHT='+JSON.stringify({
    mode,status:first.existing?'ALREADY_CONVERGED':'READY_TO_IMPORT',customerNumber:'53480',
    iCalUID:UID,sourcePreserved:true,notificationsRequested:0,
    invitedGuests:0,strivenWrites:0,taskCreates:0,liveHoldVerified:true
  }));
  if(mode==='dry-run')return;
  const before=await inspect(token);
  if(before.existing){
    console.log('TERRY_INTAKE_RESULT='+JSON.stringify({status:'ALREADY_CONVERGED',
      iCalUID:UID,calendarCopyId:before.existing.id,strivenWrites:0,taskCreates:0,invitationEmailsRequested:0}));
    return;
  }
  // Import, NOT insert, move, guest add, update, or CalendarApp.addGuest.
  // Google documents that direct importing with the same iCalUID avoids invitation emails.
  // On uncertain API outcome, do not retry POST; reconcile by iCalUID.
  const payload=makePrivateCopy(before.source);
  let created;
  try{created=await api(token,calUrl(TARGET,'/import'),'POST',payload);}
  catch(e){throw Error('CALENDAR_IMPORT_OUTCOME_UNCERTAIN_DO_NOT_RETRY_'+e.message);}
  if(!created||created.iCalUID!==UID)throw Error('IMPORT_RESPONSE_IDENTITY_MISMATCH_RECONCILE_NO_RETRY');
  const after=await inspect(token);
  if(!after.existing)throw Error('IMPORTED_COPY_NOT_VISIBLE_NO_RETRY');
  verifyCopy(after.existing,before.source);
  const sourceAfter=validateSource(await api(token,calUrl(SOURCE,'/'+EVENT_ID)));
  for(const k of ['summary','description','location'])
    assert.equal(sourceAfter[k],before.source[k],'SOURCE_FIELD_CHANGED_'+k);
  assert.deepEqual(sourceAfter.attendees||[],before.source.attendees||[],'SOURCE_ATTENDEES_CHANGED');
  console.log('TERRY_INTAKE_RESULT='+JSON.stringify({
    status:'PRIVATE_CF_COPY_READBACK_VERIFIED',originalSourceCalendar:SOURCE,
    targetCalendar:TARGET,sourceEventId:EVENT_ID,iCalUID:UID,calendarCopyId:after.existing.id,
    sourceDescriptionPreserved:true,sourceAttendeesPreserved:true,
    copiedDescriptionExact:true,notificationsRequested:0,invitedGuests:0,
    taskCreationHeld:true,taskCreates:0,strivenWrites:0
  }));
}
if(require.main===module)main().catch(e=>{
  console.error('TERRY_INTAKE_STOP='+String(e&&e.message||e).slice(0,230));
  process.exitCode=1;
});
module.exports={UID,EVENT_ID,SOURCE,TARGET,EXPECTED,validateSource,makePrivateCopy,verifyCopy,ensureNoDuplicate};

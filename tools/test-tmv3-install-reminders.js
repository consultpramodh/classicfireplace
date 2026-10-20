// JavaScript / Node.js: notification delivery, preview, isolation and idempotency.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const dir=__dirname+'/../apps-script/tmv3-clean/';
let checks=0;
function env(opts={}) {
 const sent=[],marks=new Set(),audits=[],properties={};let released=0;
 const record={eventId:'event',title:'Install',start:new Date('2026-10-21T13:00:00Z'),end:new Date('2026-10-21T17:00:00Z'),creator:'Staff@ClassicFireplace.ca',guests:'customer@example.com',description:'external@example.com',...opts.record};
 class Clock extends Date {constructor(...a){super(...(a.length?a:['2026-10-20T14:00:00Z']));}}
 const ctx={Date:Clock,TMV3:{VERTICALS:{Install:{calendarIds:['install']}}},
 TMV3_TIMEZONE:'America/Toronto',
 PropertiesService:{getScriptProperties:()=>({getProperty:k=>properties[k]||null,setProperty:(k,v)=>properties[k]=v})},
 tmv3_hash_:v=>v,tmv3_extractPhone_:s=>/\d{3}[- .]\d{3}[- .]\d{4}/.test(s)?'phone':'',
 tmv3_calendarEventUrl_:()=>opts.url||'https://www.google.com/calendar/event?eid=test',
 tmv3_calendarReadableDescription_:s=>s,tmv3_stripAuthoredCalendarNotes_:s=>s,
 Utilities:{formatDate:(_d,_tz,p)=>p==='MMM d, yyyy'?'Oct 21, 2026':'9:00 AM'},
 tmv3_operationPolicy_:()=>({installRemindersEnabled:opts.enabled!==false}),
 LockService:{getScriptLock:()=>({tryLock:()=>opts.lock!==false,releaseLock:()=>released++})},
 CalendarApp:{getCalendarById:()=>({getEvents:()=>opts.records||[record]})},
 tmv3_calendarEvent_:(_v,_c,_cc,e)=>e,tmv3_businessDaysUntil_:()=>opts.days??1,
 tmv3_installReminderAlreadySentToday_:id=>marks.has(id),tmv3_markInstallReminderSent_:id=>marks.add(id),
 tmv3_unique_:a=>[...new Set(a)],tmv3_clean_:s=>String(s||'').trim(),
 tmv3_date_:()=> '2026-10-21',tmv3_time_:()=> '09:00',tmv3_audit_:(...a)=>audits.push(a),
 MailApp:{sendEmail:m=>{if(opts.fail)throw Error('mail failed');sent.push(m);}},Logger:{log:()=>{}}};
 vm.createContext(ctx);const s=fs.readFileSync(dir+'58_Operations.js','utf8');
 for(const name of ['tmv3_preInspectionHtmlEscape_','tmv3_preInspectionCreatorFirstName_']) {
  const a=s.indexOf('function '+name+'('),b=s.indexOf('\nfunction ',a+10);vm.runInContext(s.slice(a,b),ctx);
 }
 vm.runInContext(s.slice(s.indexOf('// Google Apps Script: notifications have a separate gate'),s.indexOf('function tmv3_runCalendarLinksForReady_AUTO()')),ctx);
 return {ctx,sent,marks,audits,run:scope=>ctx.tmv3_sendInstallMissingSoReminders_(scope||'AUTO'),released:()=>released};
}
function check(v){assert(v);checks++;}
let e=env();check(e.run().sent===1);check(e.sent[0].to==='staff@classicfireplace.ca');check(e.run().sent===0);check(e.released()===2);
e=env();check(e.run('PREVIEW').candidates.length===1);check(e.sent.length===0&&e.marks.size===0&&e.audits.length===0);
for(const opts of [{enabled:false},{lock:false},{days:4},{days:-1},{record:{orderNumber:'585191'}},{record:{existingOrderId:'123'}},{record:{creator:'customer@example.com'}},{record:{creator:'x@classicfireplace.ca.evil.com'}}]){e=env(opts);check(e.run().sent===0&&e.sent.length===0);}
e=env({fail:true});check(e.run().errors===1&&e.marks.size===0);check(e.released()===1);
e=env({record:{creator:'staff@classicfireplace.ca, STAFF@classicfireplace.ca'}});check(e.run().sent===1&&e.sent[0].to==='staff@classicfireplace.ca');
const a=fs.readFileSync(dir+'60_Automation.js','utf8');const start=a.indexOf('function tmv3_installReminderCheck()');check(!a.slice(start,a.indexOf('\nfunction ',start+10)).includes('tmv3_executionStage_'));check(a.includes(".atHour(11).nearMinute(0).everyDays(1).create()"));
e=env();let m=e.ctx.tmv3_installReminderEmail_({title:'Times - Chatsworth',eventId:'x',start:new Date(),end:new Date()},{test:true});
check(m.recipient==='pramodh@classicfireplace.ca'&&m.subject.startsWith('TEST — '));
check(m.classificationRequired&&m.htmlBody.includes('Confirm the purpose'));
check(m.htmlBody.includes('What it is now')&&m.htmlBody.includes('What it should be'));
check((m.htmlBody.match(/Appointment requiring attention/g)||[]).length===1);
check(!m.htmlBody.includes('Calendar notes')&&m.htmlBody.includes('max-width:760px'));
let record={title:'Customer 416-555-1234 <script>',location:'22 Example St',creator:'staff@classicfireplace.ca',eventId:'x',start:new Date(),end:new Date(),description:'Long notes <unsafe>'};
m=e.ctx.tmv3_installReminderEmail_(record,{followupNumber:2});
check(m.subject.startsWith('FOLLOW-UP #2')&&!m.classificationRequired&&m.missing.length===1);
check(m.htmlBody.includes('&lt;script&gt;')&&!m.htmlBody.includes('<script>'));
check(m.htmlBody.includes('Calendar notes')&&m.htmlBody.includes('&lt;unsafe&gt;'));
check(e.ctx.tmv3_installReminderEmail_({...record,orderNumber:'123456'})===null);
e=env({url:'javascript:alert(1)'});m=e.ctx.tmv3_installReminderEmail_(record);check(!m.htmlBody.includes('javascript:')&&m.htmlBody.includes('link unavailable'));
e=env();e.run();e.marks.clear();e.run();check(e.sent[1].subject.startsWith('FOLLOW-UP #1'));
console.log(JSON.stringify({status:'PASS',checks}));

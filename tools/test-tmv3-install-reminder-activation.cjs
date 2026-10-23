// JavaScript / Node.js: creator-only routing, eligibility and uncertain-send protection.
'use strict';const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const dir=process.env.TMV3_TEST_SOURCE_DIR || 'apps-script/tmv3-clean';
class FixedDate extends Date{constructor(...a){super(...(a.length?a:['2026-10-23T15:00:00Z']));}static now(){return Date.parse('2026-10-23T15:00:00Z');}}
let events=[],sent=[],quota=100,fail=false;const values={};
const c={Date:FixedDate,console,Logger:{log(){}},PropertiesService:{getScriptProperties:()=>({getProperty:k=>values[k]||null,setProperty:(k,v)=>values[k]=v})},CalendarApp:{getCalendarById:()=>({getEvents:()=>events})},MailApp:{getRemainingDailyQuota:()=>quota,sendEmail:e=>{sent.push(e);if(fail)throw Error('timeout');}},Utilities:{base64EncodeWebSafe:s=>Buffer.from(s).toString('base64url'),DigestAlgorithm:{SHA_256:'sha256'},Charset:{UTF_8:'utf8'},computeDigest:(_,s)=>Array.from(crypto.createHash('sha256').update(s).digest()),formatDate:(d,tz,p)=>p==='H'?'11':new Intl.DateTimeFormat('en-CA',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(d))}};
vm.createContext(c);for(const f of fs.readdirSync(dir).filter(x=>x.endsWith('.js')).sort())vm.runInContext(fs.readFileSync(dir+'/'+f,'utf8'),c);c.tmv3_calendarEvent_=(_,cfg,src,e)=>e;c.tmv3_audit_=()=>{};
let cases=0;const check=(a,b)=>{assert.equal(a,b);cases++;};
const base={eventId:'reminder@google.com',vertical:'Install',calendarId:'install@group.calendar.google.com',title:'Install appointment',start:'2026-10-26T10:00:00-04:00',end:'2026-10-26T12:00:00-04:00',location:'Toronto',creator:'terry@classicfireplace.ca',organizer:'calendar-owner@classicfireplace.ca',guests:'customer@example.com,other@classicfireplace.ca',description:'customer@example.com'};
events=[base];let r=c.tmv3_installReminderCheck();check(r.sent,1);check(sent[0].to,'terry@classicfireplace.ca');check(sent[0].body.includes('Hi Terry,'),true);check(sent[0].htmlBody.includes('Sales Order Number missing'),true);check(sent[0].htmlBody.includes('Open calendar appointment'),true);check(sent[0].to.includes('customer@example.com'),false);
r=c.tmv3_installReminderCheck();check(r.sent,0);check(sent.length,1);
events=[{...base,eventId:'valid-so',orderNumber:'585000'},{...base,eventId:'valid-link',existingOrderId:'123'}];r=c.tmv3_installReminderCheck();check(r.sent,0);check(r.skipped,2);
events=[{...base,eventId:'no-creator',creator:''},{...base,eventId:'external',creator:'customer@example.com'},{...base,eventId:'ambiguous',sourceCreators:['other@classicfireplace.ca']}];r=c.tmv3_installReminderCheck();check(r.sent,0);check(r.skipped,3);
events=[{...base,eventId:'far-future',start:'2026-11-10T10:00:00-05:00'},{...base,eventId:'past',start:'2026-10-22T10:00:00-04:00'}];r=c.tmv3_installReminderCheck();check(r.sent,0);check(r.skipped,2);
events=[{...base,eventId:'uncertain'}];fail=true;r=c.tmv3_installReminderCheck();check(r.sent,0);check(r.errors,1);const before=sent.length;fail=false;r=c.tmv3_installReminderCheck();check(r.sent,0);check(sent.length,before);
events=[{...base,eventId:'quota'}];quota=0;r=c.tmv3_installReminderCheck();check(r.sent,0);check(sent.length,before);
console.log('PASS: '+cases+' Install reminder activation cases');

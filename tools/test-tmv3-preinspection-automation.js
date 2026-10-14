// JavaScript: verify notification policy and bounded unattended transaction behavior.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const values={},sent=[];let releases=0,acquires=0;
const ctx={console,Logger:{log(){}},Utilities:{base64EncodeWebSafe:s=>Buffer.from(s).toString('base64url'),formatDate:(d,tz,p)=>p==='yyyy-MM-dd'?'2026-10-14':p==='MMM d, yyyy'?'Oct 16, 2026':'9:00 AM',DigestAlgorithm:{SHA_256:'sha256'},Charset:{UTF_8:'utf8'},computeDigest:(_,s)=>[...crypto.createHash('sha256').update(s).digest()]},
 PropertiesService:{getScriptProperties:()=>({getProperty:k=>values[k]||null,setProperty:(k,v)=>{values[k]=v},deleteProperty:k=>delete values[k]})},
 LockService:{getScriptLock:()=>({tryLock:()=>{acquires++;return true},releaseLock:()=>releases++})},
 MailApp:{getRemainingDailyQuota:()=>100,sendEmail:e=>sent.push(e)}};
vm.createContext(ctx);
for(const f of fs.readdirSync('apps-script/tmv3-clean').filter(x=>x.endsWith('.js')).sort())vm.runInContext(f==='00_Config.js' ? fs.readFileSync('apps-script/tmv3-clean/'+f,'utf8').replace(/preInspectionAutomationEnabled: (?:true|false)/,'preInspectionAutomationEnabled: false').replace(/preInspectionMissingDetailEmailsEnabled: (?:true|false)/,'preInspectionMissingDetailEmailsEnabled: false') : fs.readFileSync('apps-script/tmv3-clean/'+f,'utf8'),ctx);
const run=s=>vm.runInContext(s,ctx);let cases=0;
const check=(v,msg)=>{assert.ok(v,msg);cases++};
const record={calendarId:'example@group.calendar.google.com',vertical:'PreInspection',calendarRole:'PRIMARY_SHARED',eventId:'frank@google.com',title:'Frank Besenthal (647) 542-8251',calendarCustomerName:'Frank Besenthal',rawDescription:'PRE-INSPECTION Re and re. Remove electric fireplace and install H3. Birch logs',descriptionClean:'PRE-INSPECTION Re and re. Remove electric fireplace and install H3. Birch logs',location:'2348 Wildwood Crescent, Pickering, ON L1X 2N1, Canada',start:new Date('2026-10-16T13:00:00Z'),end:new Date('2026-10-16T14:00:00Z'),creator:'babz@classicfireplace.ca'};
ctx.record=record;
check(run('tmv3_preInspectionMissingDetailAssessment_(record).missing.map(x=>x.code).join(",")')==='CUSTOMER_NUMBER,SALES_ORDER','Frank only 2 missing');
for(let mask=0;mask<8;mask++){
 ctx.variant={...record,title:mask&1?'62778 - Frank Besenthal - (647) 542-8251':record.title,rawDescription:mask&2?'SO#585732':record.rawDescription,descriptionClean:mask&2?'SO#585732':record.rawDescription,location:mask&4?record.location:''};
 const codes=run('tmv3_preInspectionMissingDetailAssessment_(variant).missing.map(x=>x.code)');
 check(codes.length===3-((mask&1?1:0)+(mask&2?1:0)+(mask&4?1:0)),'all presence combinations');
}
for(const text of ['SO585732','SO#585732','Sales Order Number: 585732','585732']){ctx.variant={...record,descriptionClean:text,rawDescription:text};check(run('tmv3_preInspectionHasSalesOrderReference_(variant)'),'SO variants '+text);}
for(const text of ['(647) 542-8251','Task #19120','https://site/TaskID=585732','Customer #585732']){ctx.variant={...record,title:'Frank',descriptionClean:text,rawDescription:text};check(!run('tmv3_preInspectionHasSalesOrderReference_(variant)'),'no false SO '+text);}
ctx.variant={...record,descriptionClean:'Customer Number: 62778',rawDescription:'Customer Number: 62778'};
check(!run('tmv3_preInspectionMissingDetailAssessment_(variant).missing.some(x=>x.code==="CUSTOMER_NUMBER")'),'Customer anywhere');
const preview=run('tmv3_preInspectionMissingDetailEmailPreview_(record)');
check(preview.recipient==='babz@classicfireplace.ca','actual creator');
check(preview.htmlBody.includes('Hi <strong>Babz</strong>'),'recipient greeting');
check(preview.htmlBody.indexOf('This is an automated')<preview.htmlBody.indexOf('Hi <strong>'),'automated notice at top');
check(preview.htmlBody.includes('#B42318'),'red missing text');
check(preview.htmlBody.includes('#202020')&&preview.htmlBody.includes('#b42b2f')&&!preview.htmlBody.includes('#FFF4D6'),'original colour scheme');
check(!run('tmv3_preInspectionComparisonRowsHtml_(record,tmv3_preInspectionMissingDetailAssessment_(record))').includes('Location'),'complete location omitted from correction table');
ctx.variant={...record,creator:'',sourceCreators:[]};check(run('tmv3_preInspectionCreatorEmail_(variant)')==='','no owner fallback');
ctx.variant={...record,sourceCreators:['terry@classicfireplace.ca']};check(run('tmv3_preInspectionCreatorEmail_(variant)')==='','ambiguous creator no send');
check(run('tmv3_preInspectionExplicitCandidate_(record)'),'explicit PI candidate');
ctx.variant={...record,rawDescription:'',descriptionClean:''};check(!run('tmv3_preInspectionExplicitCandidate_(variant)'),'name-only not classified PI');
ctx.variant={...record,isAllDay:true};check(!run('tmv3_preInspectionExplicitCandidate_(variant)'),'all-day excluded');
check(!run('tmv3_operationWritesEnabled_("PREINSPECTIONAUTO")'),'lane gated initially');
check(run('tmv3_preInspectionAutomationCycle_({}).status')==='PREINSPECTION_GATED','disabled cycle no writes');
check(sent.length===0,'no sends before enable');
run('TMV3.OPERATIONS = TMV3.OPERATIONS'); // frozen configuration: build a fresh enabled context below.
// Rebuild enabled configuration using source replacement, preserving broad gates.
const cfg=fs.readFileSync('apps-script/tmv3-clean/00_Config.js','utf8').replace(/preInspectionAutomationEnabled: (?:true|false)/,'preInspectionAutomationEnabled: true').replace(/preInspectionMissingDetailEmailsEnabled: (?:true|false)/,'preInspectionMissingDetailEmailsEnabled: true');
const enabled={...ctx};vm.createContext(enabled);vm.runInContext(cfg,enabled);
for(const f of fs.readdirSync('apps-script/tmv3-clean').filter(x=>x.endsWith('.js')&&x!=='00_Config.js').sort())vm.runInContext(fs.readFileSync('apps-script/tmv3-clean/'+f,'utf8'),enabled);
const erun=s=>vm.runInContext(s,enabled);enabled.record=record;enabled.tmv3_audit_=()=>{};
check(erun('tmv3_operationWritesEnabled_("PREINSPECTIONAUTO")'),'PI independent permission');
check(!erun('tmv3_operationWritesEnabled_("AUTO")')&&!erun('tmv3_operationWritesEnabled_("MANUAL")'),'other lanes gated');
check(erun('tmv3_preInspectionSendMissingDetails_(record).status')==='SENT','creator email send');
check(sent[0].to==='babz@classicfireplace.ca'&&sent[0].cc==='jay@classicfireplace.ca,thang@classicfireplace.ca','recipient routing');
check(erun('tmv3_preInspectionSendMissingDetails_(record).status')==='ALREADY_SENT'&&sent.length===1,'one email per event');
enabled.variant={...record,eventId:'uncertain@google.com'};
enabled.MailApp={getRemainingDailyQuota:()=>100,sendEmail:()=>{throw Error('timeout')}};
assert.throws(()=>erun('tmv3_preInspectionSendMissingDetails_(variant)'));cases++;
check(erun('tmv3_preInspectionSendMissingDetails_(variant).status')==='UNCERTAIN_SEND_NO_RETRY','timeout does not resend');
check(erun('tmv3_preInspectionCreatorEmail_({creator:""})')==='','unknown creator held');
assert.throws(()=>erun('tmv3_executeFreshStep7Selection_({contract:{vertical:"Service"}},"PREINSPECTIONAUTO","ALL")'),/PREINSPECTION_ONLY_SCOPE/);cases++;
// Full-cycle orchestration with real policy, mocked authoritative interfaces.
enabled.MailApp=ctx.MailApp;enabled.tmv3_refreshOperationalSourcesIfNeeded_=()=>({status:'CACHE_FRESH'});
enabled.tmv3_restorePreInspectionLegacyTitle_=()=>({writes:0});enabled.tmv3_preInspectionIntakeRecords_=()=>[record];enabled.tmv3_preInspectionPromoteCandidate_=r=>({status:'PRIMARY',record:r});
let plan={vertical:'PreInspection',eventId:record.eventId,taskId:19120,plan:'PATCH_EXISTING',actions:['PATCH_DATES'],blocker:''};
enabled.tmv3_step7FreshPlansForEvent_=()=>[plan];enabled.tmv3_findFreshEventRecord_=()=>record;
let mutations=0;enabled.tmv3_executeFreshStep7Selection_=()=>{mutations++;plan={...plan,plan:'NO_CHANGE',actions:[]};return {status:'VERIFIED_CONVERGENCE'}};
const first=erun('tmv3_preInspectionAutomationCycle_({force:true})');
check(mutations===1&&first.processed===1,'cycle executes one transaction');
const second=erun('tmv3_preInspectionAutomationCycle_({force:true})');
check(mutations===1&&second.writes===0,'converged repeat no mutation');
check(acquires===releases,'locks always released');
check(JSON.parse(values.TMV3_PI_PENDING_EVENTS).length===0,'verified event clears recovery queue');
// Legacy title survives plain text, HTML, footer rebuild and repeated passes.
ctx.legacy='Text Risa on way Risa Rosenfield 416 262-4040 SO#584502 G3.5';
for (const body of ['Original notes', '<b>Original notes</b><br>Second line', '']) {
 ctx.body=body;
 const preserved=run('tmv3_preInspectionEnsureLegacyTitle_(body,legacy)');ctx.preserved=preserved;
 check(run('tmv3_calendarReadableDescription_(preserved).split(/\\r?\\n/)[0].trim()')===ctx.legacy,'legacy first line');
 check(run('tmv3_preInspectionEnsureLegacyTitle_(preserved,legacy)')===preserved,'legacy idempotence');
 check(preserved.includes(body),'original body retained exactly');
}
ctx.variant={...record,identityDescriptionClean:'Notes without SO',rawDescription:ctx.legacy+'\nOriginal notes'};
check(run('tmv3_preInspectionHasSalesOrderReference_(variant)'),'SO in preserved legacy title counts');
console.log('PASS: '+cases+' PreInspection notification/intake/automation cases');

ctx.linkEvent='6bnhkq9hrpfr6rub4ka545m8bi@google.com';
ctx.linkCalendar='c_3088a3989f3eb809957ed5c40137a7111a0ac97f68c29b40c144028cb14320dc@group.calendar.google.com';
assert.equal(run('tmv3_calendarEventUrl_(linkEvent,linkCalendar)'), 'https://www.google.com/calendar/event?eid=NmJuaGtxOWhycGZyNnJ1YjRrYTU0NW04YmkgY18zMDg4YTM5ODlmM2ViODA5OTU3ZWQ1YzQwMTM3YTcxMTFhMGFjOTdmNjhjMjliNDBjMTQ0MDI4Y2IxNDMyMGRjQGc');
assert.equal(run('tmv3_calendarEventUrl_(linkEvent, "")'), '');
console.log('PASS: appointment URL matches actual Google Calendar URL; missing calendar fails closed');
// JavaScript: verify daily trigger replacement and off-schedule no-work gates.
ctx.tmv3_operationWritesEnabled_=()=>true;
assert.equal(run("tmv3_preInspectionAutomationCycle_({reason:'CALENDAR_EVENT_UPDATED'}).status"),'SCHEDULE_ONLY');
assert.equal(run("tmv3_preInspectionAutomationCycle_({reason:'HOURLY_FALLBACK'}).status"),'SCHEDULE_ONLY');
assert.equal(run("tmv3_reconcilePreInspectionSharedGuest_AUTO_({reason:'CALENDAR_EVENT_UPDATED'}).status"),'SCHEDULE_ONLY');
let scheduled=[{handler:'tmv3_preInspectionScheduledCycle'},{handler:'otherVerticalHandler'}];const created=[];
ctx.ScriptApp={getProjectTriggers:()=>scheduled.map(t=>({...t,getHandlerFunction:()=>t.handler})),deleteTrigger:t=>{scheduled=scheduled.filter(x=>x.handler!==t.handler)},newTrigger:handler=>{const t={handler};const b={timeBased:()=>b,atHour:h=>(t.hour=h,b),nearMinute:m=>(t.minute=m,b),everyDays:d=>(t.days=d,b),inTimezone:z=>(t.timezone=z,b),create:()=>{scheduled.push(t);created.push(t);return t}};return b}};
ctx.tmv3_listTriggers=()=>scheduled;
run('tmv3_installPreInspectionAutomationTrigger()');
assert.deepEqual(created.map(x=>x.hour),[8,13,17]);
assert.ok(created.every(x=>x.timezone==='America/Toronto' && x.minute===0 && x.days===1));
assert.ok(scheduled.some(x=>x.handler==='otherVerticalHandler'));
run('tmv3_installPreInspectionAutomationTrigger()');
assert.equal(scheduled.length,4);
console.log('PASS: three daily Toronto slots, old timer removed, rerun dedupe, unrelated triggers preserved, off-schedule routes blocked');

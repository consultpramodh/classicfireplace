#!/usr/bin/env node
'use strict';
const fs=require('fs'),os=require('os'),path=require('path'),crypto=require('crypto'),cp=require('child_process');
const SID='1E86mhD2dZcOFpqWnCvoIpwEkwZ0MA63MgM8DifV6WyB2FvVQkRWKIZ_m';
const CV='3.3.0';
const RELEASE='R5_4_PREINSPECT_PRIMARY_CALENDAR_20260916';
const EXPECTED_FILE_COUNT=59;
const PRIMARY='c_3088a3989f3eb809957ed5c40137a7111a0ac97f68c29b40c144028cb14320dc@group.calendar.google.com';
const SECONDARY='classicfireplace.ca_c20qcqfhvjbv784asn9pvuiaf4@group.calendar.google.com';
const TARGETS={
  '35_PreInspect_Task_Review.js':'a4f5fcdfcd704540736c7977c72a39a7a1c34957ed94f875545529b1ee9182f1',
  '36_PreInspect_Task_Create.js':'13a994dd755639be7492031e134fc8644f978dd8bea85074029656c57be806da',
  '96_Selected_Row_End_To_End_R3.js':'d500e61777a074475f034c1415ccffe20edcf12e32faf5208d4b2fa328fc6a54'
};
const OUT=path.resolve('task-mapping-preinspect-r5-4-primary-calendar-output'); fs.mkdirSync(OUT,{recursive:true});
const evidence={release:RELEASE,status:'STARTED',scriptId:SID,primaryCalendarId:PRIMARY,secondaryCalendarId:SECONDARY,targets:Object.keys(TARGETS),startedAt:new Date().toISOString()};
function run(cmd,args,cwd){const r=cp.spawnSync(cmd,args,{cwd:cwd||process.cwd(),env:process.env,encoding:'utf8',stdio:['ignore','pipe','pipe']});process.stdout.write(r.stdout||'');process.stderr.write(r.stderr||'');if(r.error)throw r.error;if(r.status!==0)throw new Error(`${cmd} ${args.join(' ')} failed ${r.status}`);return r.stdout||'';}
function clasp(args,cwd){return run('npx',['-y',`@google/clasp@${CV}`,...args],cwd);}
function sha(f){return crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');}
function files(d){return fs.readdirSync(d,{withFileTypes:true}).filter(x=>x.isFile()).map(x=>x.name).sort();}
function hashes(d,ns){const o={};ns.forEach(n=>o[n]=sha(path.join(d,n)));return o;}
function same(e,a,ns,label){const bad=ns.filter(n=>e[n]!==a[n]);if(bad.length)throw new Error(`${label}: hash mismatch ${bad.join(', ')}`);}
function fr(s,n){const re=new RegExp(`function\\s+${n}\\s*\\(`,'g'),m=[...s.matchAll(re)];if(m.length!==1)throw new Error(`Expected one ${n}; found ${m.length}`);let i=s.indexOf('{',m[0].index+m[0][0].length),d=0,q=null,esc=false,lc=false,bc=false;for(let j=i;j<s.length;j++){const c=s[j],nx=s[j+1];if(lc){if(c==='\n')lc=false;continue;}if(bc){if(c==='*'&&nx==='/'){bc=false;j++;}continue;}if(q){if(esc){esc=false;continue;}if(c==='\\'){esc=true;continue;}if(c===q)q=null;continue;}if(c==='/'&&nx==='/'){lc=true;j++;continue;}if(c==='/'&&nx==='*'){bc=true;j++;continue;}if(c==='\''||c==='"'||c==='`'){q=c;continue;}if(c==='{')d++;else if(c==='}'&&!--d)return{a:m[0].index,b:j+1,t:s.slice(m[0].index,j+1)};}throw new Error('No close for '+n);}
function rep(s,n,r){const x=fr(s,n);return s.slice(0,x.a)+r.trim()+s.slice(x.b);}
function replaceOnce(s,a,b,label){const n=s.split(a).length-1;if(n!==1)throw new Error(`${label}: expected 1 occurrence, found ${n}`);return s.replace(a,b);}
function syntaxCheck(file){run('node',['--check',file]);}
const root=fs.mkdtempSync(path.join(os.tmpdir(),'tm-r54-cal-')),P=path.join(root,'PRE'),W=path.join(root,'WORK'),F=path.join(root,'FRESH'),O=path.join(root,'POST');[P,W,F,O].forEach(d=>fs.mkdirSync(d,{recursive:true}));let pushed=false;
try{
  console.log('R5.4 authorize'); clasp(['show-authorized-user','--json']);
  console.log('R5.4 PRE'); clasp(['clone',SID,'--rootDir','src'],P); const ps=path.join(P,'src'),ns=files(ps); if(ns.length!==EXPECTED_FILE_COUNT)throw new Error(`Expected ${EXPECTED_FILE_COUNT} files, found ${ns.length}`); const ph=hashes(ps,ns);
  for(const [n,h] of Object.entries(TARGETS)){const f=path.join(ps,n);if(!fs.existsSync(f))throw new Error('Missing '+n);if(sha(f)!==h)throw new Error(`Unexpected live ${n} hash: ${sha(f)}`);}
  fs.cpSync(P,path.join(OUT,'PRE_SOURCE'),{recursive:true}); fs.cpSync(P,W,{recursive:true}); const ws=path.join(W,'src');
  const f35=path.join(ws,'35_PreInspect_Task_Review.js'); let s35=fs.readFileSync(f35,'utf8');
  const oldProd=`'${SECONDARY}'`, newProd=`'${PRIMARY}'`;
  const oldCount=s35.split(oldProd).length-1; if(oldCount!==3)throw new Error('35 production calendar occurrence guard expected 3 old IDs, found '+oldCount);
  s35=s35.split(oldProd).join(newProd);
  s35=replaceOnce(s35,
    "const PREINSPECT_R3419_TEST_CALENDAR_ID =\n  '"+PRIMARY+"';",
    "const PREINSPECT_R3419_PRIMARY_CALENDAR_ID =\n  '"+PRIMARY+"';\nconst PREINSPECT_R3419_SECONDARY_CALENDAR_ID =\n  '"+SECONDARY+"';\n// Legacy name retained for compatibility; secondary calendar is read-only/fallback.\nconst PREINSPECT_R3419_TEST_CALENDAR_ID = PREINSPECT_R3419_SECONDARY_CALENDAR_ID;",
    '35 R3419 calendar constants');
  s35=rep(s35,'preinspectR3419CalendarIds_',`function preinspectR3419CalendarIds_() {
  const a=[String(PREINSPECT_R3419_PRIMARY_CALENDAR_ID||'')];
  if(typeof PREINSPECT_R3418F_CALENDAR_ID!=='undefined'&&PREINSPECT_R3418F_CALENDAR_ID)a.push(String(PREINSPECT_R3418F_CALENDAR_ID));
  if(PREINSPECT_REVIEW_CONFIG&&PREINSPECT_REVIEW_CONFIG.CALENDAR_SYNC&&PREINSPECT_REVIEW_CONFIG.CALENDAR_SYNC.CALENDAR_ID)a.push(String(PREINSPECT_REVIEW_CONFIG.CALENDAR_SYNC.CALENDAR_ID));
  a.push(String(PREINSPECT_R3419_SECONDARY_CALENDAR_ID||''));
  return a.filter(function(x,i,z){return x&&z.indexOf(x)===i;});
}`);
  s35=rep(s35,'preinspectR3419FindEvent_',`function preinspectR3419FindEvent_(eventId) {
  const matches=[];
  preinspectR3419CalendarIds_().forEach(function(id){
    const c=CalendarApp.getCalendarById(id); if(!c)return;
    const e=c.getEventById(eventId); if(e)matches.push({calendarId:id,calendarName:c.getName(),event:e});
  });
  if(!matches.length)return null;
  const primaryId=String(PREINSPECT_R3419_PRIMARY_CALENDAR_ID||'');
  const primary=matches.filter(function(x){return String(x.calendarId||'')===primaryId;})[0];
  if(primary){
    if(matches.length>1)Logger.log(JSON.stringify({mode:'PREINSPECT_CALENDAR_PRIMARY_RESOLUTION',eventId:String(eventId||''),status:'PRIMARY_SELECTED',primaryCalendarId:primaryId,otherCalendarIds:matches.filter(function(x){return x!==primary;}).map(function(x){return x.calendarId;})}));
    return primary;
  }
  return matches[0];
}`);
  fs.writeFileSync(f35,s35);
  const f36=path.join(ws,'36_PreInspect_Task_Create.js'); let s36=fs.readFileSync(f36,'utf8');
  s36=rep(s36,'pushSelectedPreInspectTaskLinkToCalendarEvent',`function pushSelectedPreInspectTaskLinkToCalendarEvent() {
  const out={mode:'PREINSPECT_CALENDAR_TASK_LINK',status:'DISABLED_BY_POLICY',writesPerformed:false,calendarWritesPerformed:false,reason:'Calendar Task Link write disabled by operator policy on 2026-09-16.'};
  Logger.log(JSON.stringify(out,null,2)); return out;
}`);
  s36=rep(s36,'preinspectAppendTaskLinkToCalendarEvent_',`function preinspectAppendTaskLinkToCalendarEvent_(eventId,taskId,taskTitle) {
  return {mode:'PREINSPECT_CALENDAR_TASK_LINK',status:'DISABLED_BY_POLICY',writesPerformed:false,calendarWritesPerformed:false,eventId:String(eventId||''),taskId:preinspectCreateNum_(taskId)||null,reason:'Calendar Task Link write disabled by operator policy on 2026-09-16.'};
}`);
  fs.writeFileSync(f36,s36);
  const f96=path.join(ws,'96_Selected_Row_End_To_End_R3.js'); let s96=fs.readFileSync(f96,'utf8');
  s96=replaceOnce(s96,"VERSION: 'TM_SELECTED_ROW_E2E_R3_5_20260916'","VERSION: 'TM_SELECTED_ROW_E2E_R3_6_20260916'",'96 version');
  const oldBlock="    assertHeldTransactionLock_();\n    tmSelectedRowE2ER3RestoreAndVerifySelection_(ctx);\n    record('CALENDAR_TASK_LINK', pushSelectedPreInspectTaskLinkToCalendarEvent());";
  const newBlock="    record('CALENDAR_TASK_LINK', {\n      status: 'DISABLED_BY_POLICY',\n      writesPerformed: false,\n      calendarWritesPerformed: false,\n      reason: 'Calendar Task Link write disabled by operator policy on 2026-09-16.'\n    });";
  s96=replaceOnce(s96,oldBlock,newBlock,'96 calendar-link stage'); fs.writeFileSync(f96,s96);
  [f35,f36,f96].forEach(syntaxCheck);
  const wh=hashes(ws,ns); const changed=ns.filter(n=>ph[n]!==wh[n]); const expected=Object.keys(TARGETS).sort(); if(JSON.stringify(changed)!==JSON.stringify(expected))throw new Error('Changed-file guard failed: '+changed.join(', '));
  if(!s35.includes("CALENDAR_ID: '"+PRIMARY+"'"))throw new Error('Primary calendar config marker missing');
  if(!s35.includes("PREINSPECT_R3419_TEST_CALENDAR_ID = PREINSPECT_R3419_SECONDARY_CALENDAR_ID"))throw new Error('Secondary compatibility marker missing');
  if(!s35.includes("status:'PRIMARY_SELECTED'"))throw new Error('Primary resolution marker missing');
  if(!s36.includes("status:'DISABLED_BY_POLICY'"))throw new Error('Calendar task-link disable marker missing');
  if(!s96.includes('TM_SELECTED_ROW_E2E_R3_6_20260916'))throw new Error('R3.6 marker missing');
  console.log('R5.4 FRESH'); clasp(['clone',SID,'--rootDir','src'],F); const fsr=path.join(F,'src'),fns=files(fsr); if(JSON.stringify(fns)!==JSON.stringify(ns))throw new Error('Fresh file list drift'); const fh=hashes(fsr,fns); same(ph,fh,ns,'Freshness gate');
  fs.cpSync(F,W,{recursive:true,force:true});
  const wsrc=path.join(W,'src');
  fs.copyFileSync(f35,path.join(wsrc,'35_PreInspect_Task_Review.js'));
  fs.copyFileSync(f36,path.join(wsrc,'36_PreInspect_Task_Create.js'));
  fs.copyFileSync(f96,path.join(wsrc,'96_Selected_Row_End_To_End_R3.js'));
  console.log('R5.4 PUSH'); clasp(['push','--force'],W); pushed=true;
  console.log('R5.4 POST'); clasp(['clone',SID,'--rootDir','src'],O); const osrc=path.join(O,'src'),ons=files(osrc); if(JSON.stringify(ons)!==JSON.stringify(ns))throw new Error('Post file list drift'); const oh=hashes(osrc,ons); same(wh,oh,ns,'Post source parity');
  evidence.status='DEPLOYED_SOURCE_VERIFIED'; evidence.changedFiles=changed; evidence.preHashes=Object.fromEntries(expected.map(n=>[n,ph[n]])); evidence.postHashes=Object.fromEntries(expected.map(n=>[n,oh[n]])); evidence.fileCount=ns.length; evidence.businessWritesPerformed=false; evidence.completedAt=new Date().toISOString(); evidence.runtimeNext='Refresh PreInspect Calendar mirror; verify source events come from primary c_3088 calendar. Then rerun selected-row workflow. Calendar Task Link must report DISABLED_BY_POLICY and perform no Calendar write.';
  fs.writeFileSync(path.join(OUT,'evidence.json'),JSON.stringify(evidence,null,2)); console.log(JSON.stringify(evidence,null,2));
}catch(err){evidence.status='FAILED';evidence.error=String(err&&err.stack||err);evidence.businessWritesPerformed=false;evidence.completedAt=new Date().toISOString();fs.writeFileSync(path.join(OUT,'evidence.json'),JSON.stringify(evidence,null,2));if(pushed){try{console.error('R5.4 rollback');clasp(['push','--force'],P);evidence.rollback='ATTEMPTED_PRE_SOURCE_RESTORE';fs.writeFileSync(path.join(OUT,'evidence.json'),JSON.stringify(evidence,null,2));}catch(rb){console.error('ROLLBACK FAILED',rb);}}throw err;}

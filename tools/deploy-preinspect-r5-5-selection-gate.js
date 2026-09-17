#!/usr/bin/env node
'use strict';
const fs=require('fs'),os=require('os'),path=require('path'),crypto=require('crypto'),cp=require('child_process');
const SID='1E86mhD2dZcOFpqWnCvoIpwEkwZ0MA63MgM8DifV6WyB2FvVQkRWKIZ_m';
const CV='3.3.0';
const RELEASE='R5_5_PREINSPECT_SELECTION_GATE_20260917';
const EXPECTED_PRE_FILE_COUNT=59;
const EXPECTED_35_SHA='60a1d87adb6c76bf6992bee5cad2456ec3818282041046e5941328f423a95fce';
const NEW_FILE='97_PreInspect_Selection_Gate.js';
const OUT=path.resolve('task-mapping-preinspect-r5-5-selection-gate-output'); fs.mkdirSync(OUT,{recursive:true});
const evidence={release:RELEASE,status:'STARTED',scriptId:SID,startedAt:new Date().toISOString(),businessWritesPerformed:false};
function run(cmd,args,cwd){const r=cp.spawnSync(cmd,args,{cwd:cwd||process.cwd(),env:process.env,encoding:'utf8',stdio:['ignore','pipe','pipe']});process.stdout.write(r.stdout||'');process.stderr.write(r.stderr||'');if(r.error)throw r.error;if(r.status!==0)throw new Error(`${cmd} ${args.join(' ')} failed ${r.status}`);return r.stdout||'';}
function clasp(args,cwd){return run('npx',['-y',`@google/clasp@${CV}`,...args],cwd);}
function sha(f){return crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');}
function files(d){return fs.readdirSync(d,{withFileTypes:true}).filter(x=>x.isFile()).map(x=>x.name).sort();}
function hashes(d,ns){const o={};ns.forEach(n=>o[n]=sha(path.join(d,n)));return o;}
function replaceOnce(s,a,b,label){const n=s.split(a).length-1;if(n!==1)throw new Error(`${label}: expected 1 occurrence, found ${n}`);return s.replace(a,b);}
function syntaxCheck(file){run('node',['--check',file]);}
const newSource=`/************************************************************
 * PREINSPECT R5.5 — STEPHEN CALENDAR HUMAN SELECTION GATE
 *
 * PURPOSE
 * - Show Stephen's today-forward calendar as a REVIEW QUEUE on the
 *   existing PreInspect Calendar tab, isolated from production A:R.
 * - User explicitly chooses true PreInspects with a checkbox.
 * - ONLY checked rows may add CF Preinspects as a guest.
 * - After confirmed guest add, hand back to the existing PreInspect
 *   mirror/rebuild pipeline.
 *
 * HARD GUARDRAILS
 * - Unchecked rows perform ZERO Calendar / Striven writes.
 * - No automatic title/creator classification.
 * - No Calendar Task Link writes.
 * - No Field 854 policy changes.
 * - No new trigger.
 ************************************************************/

const PREINSPECT_R55_SELECTION = {
  VERSION: 'R5_5_PREINSPECT_SELECTION_GATE_20260917',
  STEPHEN_CALENDAR_ID: 'classicfireplace.ca_c20qcqfhvjbv784asn9pvuiaf4@group.calendar.google.com',
  CF_PREINSPECT_GUEST: 'c_3088a3989f3eb809957ed5c40137a7111a0ac97f68c29b40c144028cb14320dc@group.calendar.google.com',
  SHEET_NAME: 'PreInspect Calendar',
  START_COLUMN: 20, // T; S is an intentional visual spacer.
  COLUMN_COUNT: 11,
  MAX_SELECTED_PER_RUN: 25,
  HEADERS: [
    'PreInspect?', 'Date', 'Time', 'Stephen Calendar Event', 'Location',
    'Created By', 'Guests', 'Selection Status', 'Event ID', 'Start ISO', 'Event Link'
  ]
};

function refreshStephenPreInspectCandidates() {
  const config = PREINSPECT_REVIEW_CONFIG.CALENDAR_SYNC;
  const ss = SpreadsheetApp.openById(config.SPREADSHEET_ID);
  const sheet = ss.getSheetByName(PREINSPECT_R55_SELECTION.SHEET_NAME);
  if (!sheet) throw new Error('Missing PreInspect Calendar sheet.');

  const window = preinspectCalendarMirrorWindow_();
  return preinspectRefreshStephenCandidateQueue_(sheet, window.start, window.end);
}

function preinspectRefreshStephenCandidateQueue_(sheet, start, end) {
  const cfg = PREINSPECT_R55_SELECTION;
  const neededLastColumn = cfg.START_COLUMN + cfg.COLUMN_COUNT - 1;
  if (sheet.getMaxColumns() < neededLastColumn) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), neededLastColumn - sheet.getMaxColumns());
  }

  const selected = {};
  const oldLastRow = sheet.getLastRow();
  if (oldLastRow >= 2) {
    const old = sheet.getRange(2, cfg.START_COLUMN, oldLastRow - 1, cfg.COLUMN_COUNT).getValues();
    old.forEach(function(r) {
      const key = preinspectR55Key_(r[8], r[9]);
      if (key && r[0] === true) selected[key] = true;
    });
  }

  const cal = CalendarApp.getCalendarById(cfg.STEPHEN_CALENDAR_ID);
  if (!cal) throw new Error('Stephen calendar not found or inaccessible: ' + cfg.STEPHEN_CALENDAR_ID);

  const events = cal.getEvents(start, end);
  const rows = events.map(function(event) {
    const isAllDay = event.isAllDayEvent();
    const st = event.getStartTime();
    const id = String(event.getId() || '');
    const startIso = st.toISOString();
    const key = preinspectR55Key_(id, startIso);
    const creators = preinspectR55Safe_(function() {
      return typeof event.getCreators === 'function' ? (event.getCreators() || []).join(', ') : '';
    });
    const guests = preinspectR55GuestEmails_(event);
    const hasCf = guests.map(function(x){return x.toLowerCase();}).indexOf(cfg.CF_PREINSPECT_GUEST.toLowerCase()) >= 0;
    const isSelected = !!selected[key];
    let status = hasCf ? 'CF PREINSPECT GUEST PRESENT' : (isSelected ? 'SELECTED — READY TO PUSH' : 'REVIEW');

    return [
      isSelected,
      Utilities.formatDate(st, PREINSPECT_REVIEW_CONFIG.CALENDAR_SYNC.TIMEZONE, 'yyyy-MM-dd'),
      isAllDay ? 'ALL DAY' : Utilities.formatDate(st, PREINSPECT_REVIEW_CONFIG.CALENDAR_SYNC.TIMEZONE, 'HH:mm') + '–' + Utilities.formatDate(event.getEndTime(), PREINSPECT_REVIEW_CONFIG.CALENDAR_SYNC.TIMEZONE, 'HH:mm'),
      String(event.getTitle() || ''),
      String(event.getLocation() || ''),
      creators,
      guests.join(', '),
      status,
      id,
      startIso,
      preinspectR55EventLink_(event)
    ];
  });

  rows.sort(function(a,b) {
    const da = String(a[9] || ''), db = String(b[9] || '');
    if (da !== db) return da < db ? -1 : 1;
    return String(a[3] || '').localeCompare(String(b[3] || ''));
  });

  const clearRows = Math.max(0, sheet.getMaxRows() - 1);
  if (clearRows) sheet.getRange(2, cfg.START_COLUMN, clearRows, cfg.COLUMN_COUNT).clearContent();
  sheet.getRange(1, cfg.START_COLUMN, 1, cfg.COLUMN_COUNT).setValues([cfg.HEADERS]);

  if (rows.length) {
    sheet.getRange(2, cfg.START_COLUMN, rows.length, cfg.COLUMN_COUNT).setValues(rows);
    const checkRange = sheet.getRange(2, cfg.START_COLUMN, rows.length, 1);
    checkRange.insertCheckboxes();
    checkRange.setValues(rows.map(function(r){return [r[0] === true];}));
  }

  const header = sheet.getRange(1, cfg.START_COLUMN, 1, cfg.COLUMN_COUNT);
  header.setFontWeight('bold').setBackground('#E8EAED').setWrap(true);
  sheet.getRange(1, cfg.START_COLUMN, Math.max(1, rows.length + 1), cfg.COLUMN_COUNT).setVerticalAlignment('top');
  if (rows.length) sheet.getRange(2, cfg.START_COLUMN + 3, rows.length, 5).setWrap(true);

  sheet.setColumnWidth(cfg.START_COLUMN, 90);
  sheet.setColumnWidth(cfg.START_COLUMN + 1, 95);
  sheet.setColumnWidth(cfg.START_COLUMN + 2, 105);
  sheet.setColumnWidth(cfg.START_COLUMN + 3, 330);
  sheet.setColumnWidth(cfg.START_COLUMN + 4, 270);
  sheet.setColumnWidth(cfg.START_COLUMN + 5, 190);
  sheet.setColumnWidth(cfg.START_COLUMN + 6, 270);
  sheet.setColumnWidth(cfg.START_COLUMN + 7, 190);
  sheet.setColumnWidth(cfg.START_COLUMN + 10, 110);
  sheet.hideColumns(cfg.START_COLUMN + 8, 2); // Event ID + Start ISO remain technical.

  const result = {
    mode: 'STEPHEN_PREINSPECT_SELECTION_QUEUE',
    version: cfg.VERSION,
    status: 'UPDATED',
    calendarId: cfg.STEPHEN_CALENDAR_ID,
    eventsRead: events.length,
    rowsWritten: rows.length,
    selectedPreserved: Object.keys(selected).length,
    calendarWritesPerformed: false,
    strivenWritesPerformed: false,
    sheetWritesPerformed: true
  };
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

function pushSelectedStephenPreInspectCandidates() {
  const cfg = PREINSPECT_R55_SELECTION;
  const config = PREINSPECT_REVIEW_CONFIG.CALENDAR_SYNC;
  const ss = SpreadsheetApp.openById(config.SPREADSHEET_ID);
  const sheet = ss.getSheetByName(cfg.SHEET_NAME);
  if (!sheet) throw new Error('Missing PreInspect Calendar sheet.');

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return {status:'NO_CANDIDATES', calendarWritesPerformed:false, strivenWritesPerformed:false};

  const values = sheet.getRange(2, cfg.START_COLUMN, lastRow - 1, cfg.COLUMN_COUNT).getValues();
  const picks = [];
  values.forEach(function(r, i) {
    if (r[0] === true && String(r[8] || '').trim() && String(r[9] || '').trim()) {
      picks.push({sheetRow:i + 2, eventId:String(r[8]), startIso:String(r[9])});
    }
  });

  if (!picks.length) {
    const none={mode:'STEPHEN_PREINSPECT_SELECTION_PUSH',status:'NO_ROWS_SELECTED',calendarWritesPerformed:false,strivenWritesPerformed:false};
    Logger.log(JSON.stringify(none,null,2)); return none;
  }
  if (picks.length > cfg.MAX_SELECTED_PER_RUN) {
    throw new Error('Safety stop: ' + picks.length + ' rows selected. Maximum per run is ' + cfg.MAX_SELECTED_PER_RUN + '.');
  }

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw new Error('Could not acquire transaction lock. No selected Calendar writes attempted.');

  const cal = CalendarApp.getCalendarById(cfg.STEPHEN_CALENDAR_ID);
  if (!cal) { lock.releaseLock(); throw new Error('Stephen calendar not found or inaccessible.'); }

  const results = [];
  let calendarWrites = 0;
  try {
    picks.forEach(function(pick) {
      try {
        const event = preinspectR55FindExactEvent_(cal, pick.eventId, pick.startIso);
        if (!event) throw new Error('Exact Stephen-calendar occurrence not found.');
        let guests = preinspectR55GuestEmails_(event);
        let hasCf = guests.map(function(x){return x.toLowerCase();}).indexOf(cfg.CF_PREINSPECT_GUEST.toLowerCase()) >= 0;
        let action = 'ALREADY_PRESENT';
        if (!hasCf) {
          event.addGuest(cfg.CF_PREINSPECT_GUEST);
          calendarWrites++;
          guests = preinspectR55GuestEmails_(event);
          hasCf = guests.map(function(x){return x.toLowerCase();}).indexOf(cfg.CF_PREINSPECT_GUEST.toLowerCase()) >= 0;
          if (!hasCf) throw new Error('Guest add was not confirmed by Calendar readback.');
          action = 'GUEST_ADDED_VERIFIED';
        }
        sheet.getRange(pick.sheetRow, cfg.START_COLUMN + 7).setValue('PUSHED — CF PREINSPECT GUEST PRESENT');
        results.push({sheetRow:pick.sheetRow,eventId:pick.eventId,startIso:pick.startIso,status:'OK',action:action});
      } catch (err) {
        sheet.getRange(pick.sheetRow, cfg.START_COLUMN + 7).setValue('REVIEW — PUSH FAILED');
        results.push({sheetRow:pick.sheetRow,eventId:pick.eventId,startIso:pick.startIso,status:'ERROR',error:String(err && err.message || err)});
      }
    });
  } finally {
    lock.releaseLock();
  }

  let mirror = null;
  let rebuild = null;
  const successful = results.filter(function(r){return r.status === 'OK';}).length;
  if (successful) {
    if (typeof syncPreInspectCalendarNow === 'function') mirror = syncPreInspectCalendarNow();
    if (typeof runAllDivisionsRefreshRebuildOnly === 'function') rebuild = runAllDivisionsRefreshRebuildOnly();
  }

  const out = {
    mode:'STEPHEN_PREINSPECT_SELECTION_PUSH',
    version:cfg.VERSION,
    status:results.some(function(r){return r.status==='ERROR';}) ? 'PARTIAL_REVIEW_REQUIRED' : 'PASS',
    selected:picks.length,
    successful:successful,
    calendarWritesPerformed:calendarWrites > 0,
    calendarGuestAdds:calendarWrites,
    strivenWritesPerformed:false,
    results:results,
    mirror:mirror,
    rebuild:rebuild
  };
  Logger.log(JSON.stringify(out,null,2));
  return out;
}

function preinspectR55FindExactEvent_(calendar, eventId, startIso) {
  const target = new Date(startIso);
  if (isNaN(target.getTime())) return null;
  const from = new Date(target.getTime() - 12 * 60 * 60 * 1000);
  const to = new Date(target.getTime() + 36 * 60 * 60 * 1000);
  const matches = calendar.getEvents(from, to).filter(function(event) {
    return String(event.getId() || '') === String(eventId || '') &&
      Math.abs(event.getStartTime().getTime() - target.getTime()) < 60000;
  });
  if (matches.length !== 1) return null;
  return matches[0];
}

function preinspectR55GuestEmails_(event) {
  return preinspectR55Safe_(function() {
    return (event.getGuestList() || []).map(function(g) {
      return g && typeof g.getEmail === 'function' ? String(g.getEmail() || '') : '';
    }).filter(Boolean);
  }, []);
}

function preinspectR55EventLink_(event) {
  if (typeof preinspectBuildNativeCalendarEventLink_ === 'function') {
    return preinspectBuildNativeCalendarEventLink_(event, PREINSPECT_R55_SELECTION.STEPHEN_CALENDAR_ID);
  }
  return '';
}

function preinspectR55Key_(eventId, startIso) {
  const a=String(eventId || '').trim(), b=String(startIso || '').trim();
  return a && b ? a + '|' + b : '';
}

function preinspectR55Safe_(fn, fallback) {
  try { const v=fn(); return v === undefined || v === null ? (fallback === undefined ? '' : fallback) : v; }
  catch (err) { return fallback === undefined ? '' : fallback; }
}
`;
const root=fs.mkdtempSync(path.join(os.tmpdir(),'tm-r55-select-')),P=path.join(root,'PRE'),W=path.join(root,'WORK'),F=path.join(root,'FRESH'),O=path.join(root,'POST');
[P,W,F,O].forEach(d=>fs.mkdirSync(d,{recursive:true}));let pushed=false;
try{
  console.log('R5.5 authorize'); clasp(['show-authorized-user','--json']);
  console.log('R5.5 PRE'); clasp(['clone',SID,'--rootDir','src'],P);
  const ps=path.join(P,'src'),ns=files(ps); if(ns.length!==EXPECTED_PRE_FILE_COUNT)throw new Error(`Expected ${EXPECTED_PRE_FILE_COUNT} PRE files, found ${ns.length}`);
  const ph=hashes(ps,ns); const f35pre=path.join(ps,'35_PreInspect_Task_Review.js');
  if(sha(f35pre)!==EXPECTED_35_SHA)throw new Error('Unexpected live 35 hash: '+sha(f35pre));
  if(fs.existsSync(path.join(ps,NEW_FILE)))throw new Error(NEW_FILE+' already exists; refusing overwrite.');
  fs.cpSync(P,path.join(OUT,'PRE_SOURCE'),{recursive:true}); fs.cpSync(P,W,{recursive:true}); const ws=path.join(W,'src');

  const f35=path.join(ws,'35_PreInspect_Task_Review.js'); let s35=fs.readFileSync(f35,'utf8');
  s35=replaceOnce(s35,
    "    const clearRows = Math.max(0, sheet.getLastRow() - 1);\n  const clearCols = Math.max(sheet.getLastColumn(), headers.length);\n  if (clearRows > 0) {\n    sheet.getRange(2, 1, clearRows, clearCols).clearContent();\n  }",
    "    const clearRows = Math.max(0, sheet.getLastRow() - 1);\n  // R5.5: production mirror owns A:R only. T:AD is the isolated Stephen review queue.\n  const productionColumnCount = Math.min(sheet.getMaxColumns(), Math.max(headers.length, 18));\n  if (clearRows > 0) {\n    sheet.getRange(2, 1, clearRows, productionColumnCount).clearContent();\n  }",
    '35 row clear isolation');
  s35=replaceOnce(s35,
    "  if (sheet.getLastColumn() > headers.length) {\n    sheet.getRange(1, headers.length + 1, 1, sheet.getLastColumn() - headers.length)\n      .clearContent()\n      .clearFormat();\n  }",
    "  // R5.5: clear only production helper headers Q:R; never touch S:AD review queue.\n  const productionExtraCols = Math.max(0, Math.min(sheet.getMaxColumns(), 18) - headers.length);\n  if (productionExtraCols > 0) {\n    sheet.getRange(1, headers.length + 1, 1, productionExtraCols)\n      .clearContent()\n      .clearFormat();\n  }",
    '35 header clear isolation');
  s35=replaceOnce(s35,
    "    const changed = preinspectCalendarMirrorNeedsWrite_(sheet, rows);\n    if (changed) {\n      preinspectWriteCalendarMirror_(sheet, rows);\n    }",
    "    const changed = preinspectCalendarMirrorNeedsWrite_(sheet, rows);\n    if (changed) {\n      preinspectWriteCalendarMirror_(sheet, rows);\n    }\n\n    // R5.5: refresh the isolated Stephen review queue. This is read-only Calendar -> Sheet.\n    // It preserves operator checkbox choices by Event ID + occurrence start and performs no guest writes.\n    let stephenCandidateQueue = null;\n    if (typeof preinspectRefreshStephenCandidateQueue_ === 'function') {\n      try {\n        stephenCandidateQueue = preinspectRefreshStephenCandidateQueue_(sheet, window.start, window.end);\n      } catch (queueErr) {\n        stephenCandidateQueue = {status:'REVIEW_QUEUE_ERROR',error:String(queueErr && queueErr.message || queueErr)};\n        Logger.log(JSON.stringify(stephenCandidateQueue));\n      }\n    }",
    '35 queue refresh hook');
  s35=replaceOnce(s35,
    "      sheetWritesPerformed: changed,\n      sort: 'START_ASCENDING_TODAY_FIRST'",
    "      sheetWritesPerformed: changed || !!(stephenCandidateQueue && stephenCandidateQueue.sheetWritesPerformed),\n      stephenCandidateQueue: stephenCandidateQueue,\n      sort: 'START_ASCENDING_TODAY_FIRST'",
    '35 result queue evidence');
  fs.writeFileSync(f35,s35);
  fs.writeFileSync(path.join(ws,NEW_FILE),newSource);
  syntaxCheck(f35); syntaxCheck(path.join(ws,NEW_FILE));

  const wns=files(ws); if(wns.length!==EXPECTED_PRE_FILE_COUNT+1)throw new Error('Expected 60 WORK files, found '+wns.length);
  const wh=hashes(ws,wns); const changed=wns.filter(n=>!ph[n]||ph[n]!==wh[n]);
  const expected=['35_PreInspect_Task_Review.js',NEW_FILE].sort(); if(JSON.stringify(changed.sort())!==JSON.stringify(expected))throw new Error('Changed-file guard failed: '+changed.join(', '));
  if(!s35.includes('production mirror owns A:R only'))throw new Error('35 isolation marker missing');
  if(!newSource.includes("Unchecked rows perform ZERO Calendar / Striven writes"))throw new Error('selection gate guardrail marker missing');
  if(!newSource.includes("if (r[0] === true"))throw new Error('checkbox TRUE gate missing');
  if(!newSource.includes("event.addGuest(cfg.CF_PREINSPECT_GUEST)"))throw new Error('selected guest add missing');

  console.log('R5.5 FRESH'); clasp(['clone',SID,'--rootDir','src'],F); const fsr=path.join(F,'src'),fns=files(fsr); if(JSON.stringify(fns)!==JSON.stringify(ns))throw new Error('Fresh file list drift'); const fh=hashes(fsr,fns);
  ns.forEach(n=>{if(ph[n]!==fh[n])throw new Error('Freshness gate hash mismatch: '+n);});

  // Freshness clone matched PRE; preserve patched WORK tree for push.
  console.log('R5.5 PUSH'); clasp(['push','--force'],W); pushed=true;
  console.log('R5.5 POST'); clasp(['clone',SID,'--rootDir','src'],O); const osrc=path.join(O,'src'),ons=files(osrc); if(JSON.stringify(ons)!==JSON.stringify(wns))throw new Error('Post file list drift'); const oh=hashes(osrc,ons);
  wns.forEach(n=>{if(wh[n]!==oh[n])throw new Error('Post source parity mismatch: '+n);});

  evidence.status='DEPLOYED_SOURCE_VERIFIED'; evidence.changedFiles=expected; evidence.preFileCount=ns.length; evidence.postFileCount=ons.length;
  evidence.pre35Sha=ph['35_PreInspect_Task_Review.js']; evidence.post35Sha=oh['35_PreInspect_Task_Review.js']; evidence.new97Sha=oh[NEW_FILE];
  evidence.businessWritesPerformed=false; evidence.calendarWritesPerformed=false; evidence.strivenWritesPerformed=false; evidence.completedAt=new Date().toISOString();
  evidence.runtimeNext='Run refreshStephenPreInspectCandidates or existing PreInspect mirror refresh. Verify T:AD queue is populated with all checkboxes false and survives another primary mirror refresh. Do not run selected push until operator checks rows.';
  fs.writeFileSync(path.join(OUT,'evidence.json'),JSON.stringify(evidence,null,2)); console.log(JSON.stringify(evidence,null,2));
}catch(err){
  evidence.status='FAILED'; evidence.error=String(err&&err.stack||err); evidence.businessWritesPerformed=false; evidence.completedAt=new Date().toISOString(); fs.writeFileSync(path.join(OUT,'evidence.json'),JSON.stringify(evidence,null,2));
  if(pushed){try{console.error('R5.5 rollback PRE source');clasp(['push','--force'],P);evidence.rollback='ATTEMPTED_PRE_SOURCE_RESTORE';fs.writeFileSync(path.join(OUT,'evidence.json'),JSON.stringify(evidence,null,2));}catch(rb){console.error('ROLLBACK FAILED',rb);}}
  throw err;
}

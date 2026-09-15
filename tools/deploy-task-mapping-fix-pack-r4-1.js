#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const cp = require('child_process');

const manifestPath = process.argv[2];
if (!manifestPath) throw new Error('Usage: node tools/deploy-task-mapping-fix-pack-r4-1.js <release-manifest.json>');
const repoRoot = process.cwd();
const manifest = JSON.parse(fs.readFileSync(path.resolve(repoRoot, manifestPath), 'utf8'));
const scriptId = String(manifest.scriptId || '').trim();
const claspVersion = String(manifest.claspVersion || '3.3.0');
const expectedPreFileCount = Number(manifest.expectedPreFileCount || 59);
const targetFileName = String(manifest.targetFile || '97_Task_Mapping_Fix_Pack_R4.js');
if (!scriptId) throw new Error('release manifest missing scriptId');

function run(command, args, cwd) {
  const r = cp.spawnSync(command, args, { cwd, env: process.env, encoding: 'utf8', stdio: ['ignore','pipe','pipe'] });
  process.stdout.write(r.stdout || '');
  process.stderr.write(r.stderr || '');
  if (r.status !== 0) throw new Error(`${command} ${args.join(' ')} failed with exit ${r.status}`);
  return r.stdout || '';
}
function clasp(args, cwd) { return run('npx', ['-y', `@google/clasp@${claspVersion}`, ...args], cwd); }
function sha256(file) { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }
function listFiles(dir) { return fs.readdirSync(dir,{withFileTypes:true}).filter(e=>e.isFile()).map(e=>e.name).sort(); }
function hashMap(dir,names){const out={}; names.forEach(n=>out[n]=sha256(path.join(dir,n))); return out;}
function copyDir(src,dst){fs.cpSync(src,dst,{recursive:true});}
function assertExactHashes(expected,actual,names,label){const issues=[]; names.forEach(n=>{if(expected[n]!==actual[n]) issues.push(n);}); if(issues.length) throw new Error(`${label}: hash mismatch ${issues.join(', ')}`);}

function replaceNamedFunction(source, functionName, replacement) {
  const escapedName = functionName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const sig = new RegExp(`function\\s+${escapedName}\\s*\\(`);
  const match = sig.exec(source);
  if (!match) throw new Error(`Could not find function ${functionName}`);
  const start = match.index;
  const braceStart = source.indexOf('{', match.index + match[0].length);
  if (braceStart < 0) throw new Error(`Could not find opening brace for ${functionName}`);
  let depth=0, quote=null, escaped=false, lineComment=false, blockComment=false;
  for (let i=braceStart;i<source.length;i++) {
    const ch=source[i], next=source[i+1];
    if(lineComment){if(ch==='\n')lineComment=false;continue;}
    if(blockComment){if(ch==='*'&&next==='/'){blockComment=false;i++;}continue;}
    if(quote){if(escaped){escaped=false;continue;} if(ch==='\\'){escaped=true;continue;} if(ch===quote)quote=null; continue;}
    if(ch==='/'&&next==='/'){lineComment=true;i++;continue;}
    if(ch==='/'&&next==='*'){blockComment=true;i++;continue;}
    if(ch==='\''||ch==='"'||ch==='`'){quote=ch;continue;}
    if(ch==='{')depth++;
    else if(ch==='}'){depth--; if(depth===0) return source.slice(0,start)+replacement.trim()+source.slice(i+1);}
  }
  throw new Error(`Could not find closing brace for ${functionName}`);
}

const readFreshReplacement = `function tmR4_readFreshCalendarEvent_(ctx) {
  const eventId = String(ctx.eventId || '').trim();
  let candidates = [];

  function addCandidate(value) {
    if (!value) return;
    if (typeof value === 'string') {
      candidates.push(value);
      return;
    }
    if (typeof value === 'object') {
      const id = value.calendarId || value.calendarID || value.id || value.CalendarId || value.CalendarID || '';
      if (id) candidates.push(id);
    }
  }

  if (ctx.division === 'Install' && typeof TASKMAP_PROJECT !== 'undefined' && TASKMAP_PROJECT && TASKMAP_PROJECT.INSTALL_CALENDAR_ID) {
    addCandidate(TASKMAP_PROJECT.INSTALL_CALENDAR_ID);
  } else if (ctx.division === 'Delivery' && typeof TASKMAP_PROJECT !== 'undefined' && TASKMAP_PROJECT && TASKMAP_PROJECT.DELIVERY_CALENDAR_ID) {
    addCandidate(TASKMAP_PROJECT.DELIVERY_CALENDAR_ID);
  } else if (ctx.division === 'PreInspection') {
    if (typeof preinspectR3419FindEvent_ === 'function') {
      const found = preinspectR3419FindEvent_(eventId);
      if (found && found.event) {
        if (typeof preinspectR3420AssertProductionEvent_ === 'function') {
          preinspectR3420AssertProductionEvent_(found);
        }
        return {
          event: found.event,
          calendarId: found.calendarId || null,
          start: found.event.getStartTime(),
          end: found.event.getEndTime()
        };
      }
    }
    if (typeof PREINSPECT_R3418F_CALENDAR_ID !== 'undefined' && PREINSPECT_R3418F_CALENDAR_ID) addCandidate(PREINSPECT_R3418F_CALENDAR_ID);
    if (typeof PREINSPECT_REVIEW_CONFIG !== 'undefined' && PREINSPECT_REVIEW_CONFIG && PREINSPECT_REVIEW_CONFIG.CALENDAR_SYNC) addCandidate(PREINSPECT_REVIEW_CONFIG.CALENDAR_SYNC.CALENDAR_ID);
    if (typeof PREINSPECT_CALENDAR_SYNC_CONFIG !== 'undefined' && PREINSPECT_CALENDAR_SYNC_CONFIG) addCandidate(PREINSPECT_CALENDAR_SYNC_CONFIG.CALENDAR_ID);
  } else if (ctx.division === 'Service') {
    if (typeof serviceGetTechCalendarConfigs_ === 'function') {
      try {
        const configs = serviceGetTechCalendarConfigs_() || [];
        configs.forEach(addCandidate);
      } catch (err) {}
    }
    if (!candidates.length && typeof SERVICE_CONFIG !== 'undefined' && SERVICE_CONFIG && Array.isArray(SERVICE_CONFIG.TECH_CALENDARS)) SERVICE_CONFIG.TECH_CALENDARS.forEach(addCandidate);
    if (!candidates.length && typeof SERVICE_TECH_CALENDARS !== 'undefined' && Array.isArray(SERVICE_TECH_CALENDARS)) SERVICE_TECH_CALENDARS.forEach(addCandidate);
    if (!candidates.length && typeof TASKMAP_PROJECT !== 'undefined' && TASKMAP_PROJECT && TASKMAP_PROJECT.SERVICE_CALENDARS) {
      const svc = TASKMAP_PROJECT.SERVICE_CALENDARS;
      if (Array.isArray(svc)) svc.forEach(addCandidate); else Object.keys(svc).forEach(function(key){ addCandidate(svc[key]); });
    }
    if (!candidates.length && typeof SERVICE_CALENDAR_CONFIG !== 'undefined' && SERVICE_CALENDAR_CONFIG) {
      const cfg = SERVICE_CALENDAR_CONFIG;
      if (Array.isArray(cfg)) cfg.forEach(addCandidate); else Object.keys(cfg).forEach(function(key){ addCandidate(cfg[key]); });
    }
  }

  const seen = {};
  for (let i = 0; i < candidates.length; i++) {
    const calendarId = String(candidates[i] || '').trim();
    if (!calendarId || seen[calendarId]) continue;
    seen[calendarId] = true;
    const cal = CalendarApp.getCalendarById(calendarId);
    if (!cal) continue;
    const event = cal.getEventById(eventId);
    if (event) return { event: event, calendarId: calendarId, start: event.getStartTime(), end: event.getEndTime() };
  }
  return null;
}`;

const regressionReplacement = `function runTaskMappingFixPackR4Regression() {
  const result = {
    version: TM_FIX_PACK_R4.VERSION,
    mode: 'READ_ONLY_REGRESSION',
    reportParser: tmR4_testReportParser_(),
    preinspectCalendarLookup: tmR42_testPreInspectCalendarLookup_(),
    tm2: typeof tm2_testSuite === 'function' ? tm2_testSuite() : { status: 'MISSING' },
    serviceCalendarLinksDryRun: tmR4_runServiceCalendarLinkPipeline_(true, TM_FIX_PACK_R4.SERVICE_LINK_LIMIT_EVENTS),
    controlTower: tmR4_buildControlTowerData_(),
    businessWritesPerformed: false
  };
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}`;

const helperText = `\n\nfunction tmR42_testPreInspectCalendarLookup_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss && ss.getSheetByName('PreInspect Task Mapping');
  if (!sheet) throw new Error('R4.2 regression: missing PreInspect Task Mapping sheet.');
  const data = sheet.getDataRange().getDisplayValues();
  if (!data.length) throw new Error('R4.2 regression: PreInspect Task Mapping is empty.');
  const headers = data[0].map(function(v) { return String(v || '').trim(); });
  const eventIdx = headers.indexOf('Event ID');
  if (eventIdx < 0) throw new Error('R4.2 regression: PreInspect Task Mapping is missing Event ID.');
  let sampleEventId = '', sampleRow = 0;
  for (let r = 1; r < data.length; r++) {
    const id = String(data[r][eventIdx] || '').trim();
    if (!id) continue;
    sampleEventId = id; sampleRow = r + 1; break;
  }
  if (!sampleEventId) return { status: 'PASS_NO_SAMPLE_ROWS', writesPerformed: false };
  const fresh = tmR4_readFreshCalendarEvent_({ division: 'PreInspection', eventId: sampleEventId });
  if (!fresh || !fresh.event) throw new Error('R4.2 regression: authoritative PreInspection Calendar event lookup failed for mapping row ' + sampleRow + '.');
  return { status: 'PASS', writesPerformed: false, mappingRow: sampleRow, eventId: sampleEventId, calendarId: fresh.calendarId || null, start: fresh.start ? fresh.start.toISOString() : null, end: fresh.end ? fresh.end.toISOString() : null };
}\n`;

const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'task-mapping-r4-2-'));
const preRoot=path.join(tmp,'PRE'),freshRoot=path.join(tmp,'FRESH'),workRoot=path.join(tmp,'WORK'),postRoot=path.join(tmp,'POST');
[preRoot,freshRoot,workRoot,postRoot].forEach(d=>fs.mkdirSync(d,{recursive:true}));
const outputDir=path.resolve(repoRoot,'task-mapping-r4-2-output'); fs.mkdirSync(outputDir,{recursive:true});
const evidencePath=path.join(outputDir,'evidence.json'), preArchiveDir=path.join(outputDir,'PRE_SOURCE');
const evidence={schemaVersion:1,release:manifest.release||'TASK_MAPPING_FIX_PACK_R4_2',scriptId,startedAt:new Date().toISOString(),targetFile:targetFileName,status:'STARTED'};
let pushed=false;
try{
  console.log('=== R4.2 1/8 authorize ==='); clasp(['show-authorized-user','--json'],repoRoot);
  console.log('=== R4.2 2/8 PRE clone ==='); clasp(['clone',scriptId,'--rootDir','src'],preRoot);
  const preSrc=path.join(preRoot,'src'), preNames=listFiles(preSrc); if(preNames.length!==expectedPreFileCount)throw new Error(`expected ${expectedPreFileCount} PRE files, found ${preNames.length}`);
  if(!preNames.includes(targetFileName))throw new Error('PRE missing '+targetFileName);
  const preHashes=hashMap(preSrc,preNames); copyDir(preRoot,preArchiveDir);
  console.log('=== R4.2 3/8 build patch ==='); copyDir(preRoot,workRoot); const workSrc=path.join(workRoot,'src'); const targetPath=path.join(workSrc,targetFileName);
  let text=fs.readFileSync(targetPath,'utf8');
  if(!text.includes('TM_FIX_PACK_R4_1_20260915'))throw new Error('Unexpected live R4.1 version marker');
  text=text.replace('TM_FIX_PACK_R4_1_20260915','TM_FIX_PACK_R4_2_20260915');
  text=replaceNamedFunction(text,'tmR4_readFreshCalendarEvent_',readFreshReplacement);
  text=replaceNamedFunction(text,'runTaskMappingFixPackR4Regression',regressionReplacement);
  if(!text.includes('function tmR42_testPreInspectCalendarLookup_(')) text += helperText;
  fs.writeFileSync(targetPath,text); run(process.execPath,['--check',targetPath],repoRoot);
  const untouched=preNames.filter(n=>n!==targetFileName); assertExactHashes(preHashes,hashMap(workSrc,untouched),untouched,'WORK preservation');
  console.log('=== R4.2 4/8 freshness clone ==='); clasp(['clone',scriptId,'--rootDir','src'],freshRoot); const freshSrc=path.join(freshRoot,'src'); const freshNames=listFiles(freshSrc); if(JSON.stringify(freshNames)!==JSON.stringify(preNames))throw new Error('Freshness file set changed'); assertExactHashes(preHashes,hashMap(freshSrc,preNames),preNames,'freshness guard');
  console.log('=== R4.2 5/8 push ==='); clasp(['push','--force'],workRoot); pushed=true;
  console.log('=== R4.2 6/8 POST clone ==='); clasp(['clone',scriptId,'--rootDir','src'],postRoot); const postSrc=path.join(postRoot,'src'); const postNames=listFiles(postSrc); if(JSON.stringify(postNames)!==JSON.stringify(preNames))throw new Error('POST file set changed'); const postHashes=hashMap(postSrc,postNames); assertExactHashes(preHashes,postHashes,untouched,'POST untouched preservation');
  const postText=fs.readFileSync(path.join(postSrc,targetFileName),'utf8'); run(process.execPath,['--check',path.join(postSrc,targetFileName)],repoRoot);
  console.log('=== R4.2 7/8 verify contracts ===');
  ['TM_FIX_PACK_R4_2_20260915','preinspectR3419FindEvent_','preinspectR3420AssertProductionEvent_','PREINSPECT_R3418F_CALENDAR_ID','PREINSPECT_REVIEW_CONFIG','PREINSPECT_CALENDAR_SYNC_CONFIG','tmR42_testPreInspectCalendarLookup_'].forEach(marker=>{if(!postText.includes(marker))throw new Error('POST missing R4.2 marker '+marker);});
  evidence.status='DEPLOYED_SOURCE_VERIFIED'; evidence.completedAt=new Date().toISOString(); evidence.preFileCount=preNames.length; evidence.postFileCount=postNames.length; evidence.preTargetSha256=preHashes[targetFileName]; evidence.postTargetSha256=postHashes[targetFileName]; evidence.modifiedExistingFiles=[targetFileName]; evidence.runtimeTest='R4_READ_ONLY_REGRESSION_REQUIRED_THEN_PREINSPECTION_WRITE_RETEST';
  fs.writeFileSync(evidencePath,JSON.stringify(evidence,null,2)); console.log('=== R4.2 8/8 complete ==='); console.log('DEPLOYED_SOURCE_VERIFIED');
}catch(err){
  evidence.status='FAILED'; evidence.error=String(err&&err.stack?err.stack:err); evidence.failedAt=new Date().toISOString(); fs.writeFileSync(evidencePath,JSON.stringify(evidence,null,2));
  if(pushed){
    try{console.error('Attempting automatic rollback to PRE source...'); clasp(['push','--force'],preRoot); evidence.rollback='PRE_PUSH_ATTEMPTED'; fs.writeFileSync(evidencePath,JSON.stringify(evidence,null,2));}
    catch(rb){console.error('ROLLBACK FAILED',rb); evidence.rollback='FAILED: '+String(rb&&rb.stack?rb.stack:rb); fs.writeFileSync(evidencePath,JSON.stringify(evidence,null,2));}
  }
  throw err;
}

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
    if (typeof preinspectR3418bFindFreshCalendarEvent_ === 'function') {
      const found = preinspectR3418bFindFreshCalendarEvent_(eventId);
      if (found && found.event) {
        return { event: found.event, calendarId: found.calendarId || null, start: found.event.getStartTime(), end: found.event.getEndTime() };
      }
    }
    if (typeof PREINSPECT_R34 !== 'undefined' && PREINSPECT_R34 && PREINSPECT_R34.CALENDAR_ID) addCandidate(PREINSPECT_R34.CALENDAR_ID);
  } else if (ctx.division === 'Service') {
    // Authoritative Service source is SERVICE_CONFIG.TECH_CALENDARS / serviceGetTechCalendarConfigs_.
    // R4 incorrectly looked only for TASKMAP_PROJECT.SERVICE_CALENDARS, which is not the live config.
    if (typeof serviceGetTechCalendarConfigs_ === 'function') {
      try {
        const configs = serviceGetTechCalendarConfigs_() || [];
        configs.forEach(addCandidate);
      } catch (err) {
        // Fall through to direct config compatibility sources below.
      }
    }
    if (!candidates.length && typeof SERVICE_CONFIG !== 'undefined' && SERVICE_CONFIG && Array.isArray(SERVICE_CONFIG.TECH_CALENDARS)) {
      SERVICE_CONFIG.TECH_CALENDARS.forEach(addCandidate);
    }
    if (!candidates.length && typeof SERVICE_TECH_CALENDARS !== 'undefined' && Array.isArray(SERVICE_TECH_CALENDARS)) {
      SERVICE_TECH_CALENDARS.forEach(addCandidate);
    }
    if (!candidates.length && typeof TASKMAP_PROJECT !== 'undefined' && TASKMAP_PROJECT && TASKMAP_PROJECT.SERVICE_CALENDARS) {
      const svc = TASKMAP_PROJECT.SERVICE_CALENDARS;
      if (Array.isArray(svc)) svc.forEach(addCandidate);
      else Object.keys(svc).forEach(function(key){ addCandidate(svc[key]); });
    }
    if (!candidates.length && typeof SERVICE_CALENDAR_CONFIG !== 'undefined' && SERVICE_CALENDAR_CONFIG) {
      const cfg = SERVICE_CALENDAR_CONFIG;
      if (Array.isArray(cfg)) cfg.forEach(addCandidate);
      else Object.keys(cfg).forEach(function(key){ addCandidate(cfg[key]); });
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

const servicePipelineReplacement = `function tmR4_runServiceCalendarLinkPipeline_(dryRun, limitEvents) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss && ss.getSheetByName('Service Task Mapping');
  if (!sheet) throw new Error('Missing Service Task Mapping sheet.');
  const data = sheet.getDataRange().getDisplayValues();
  if (!data.length) return { status: 'NO_ROWS', events: [] };
  const headers = data[0].map(function(v){return String(v||'').trim();});
  const eventIdx = headers.indexOf('Event ID');
  if (eventIdx < 0) throw new Error('Service Task Mapping is missing Event ID.');
  const eventIds=[], seen={};
  for(let r=1;r<data.length;r++){
    const eventId=String(data[r][eventIdx]||'').trim();
    if(!eventId||seen[eventId])continue;
    seen[eventId]=true; eventIds.push(eventId);
  }
  const max=Number(limitEvents||0)>0?Math.min(eventIds.length,Number(limitEvents)):eventIds.length;
  const results=[];
  for(let i=0;i<max;i++){
    try {
      const model=tmR4_buildServiceEventLinkModel_(eventIds[i]);
      if(!model.eligible){results.push({eventId:model.eventId,status:'REVIEW',reason:model.reason});continue;}
      results.push(tmR4_applyServiceEventLinkModel_(model,!!dryRun));
    } catch(err) {
      results.push({eventId:eventIds[i],status:'REVIEW',reason:'Service Calendar link event was isolated instead of aborting the batch: '+String(err&&err.message?err.message:err)});
    }
  }
  return { mode:dryRun?'DRY_RUN':'PUSH', status:'COMPLETE', eventCount:max, events:results, reviewCount:results.filter(function(x){return x&&x.status==='REVIEW';}).length };
}`;

const applyServiceReplacement = `function tmR4_applyServiceEventLinkModel_(model, dryRun) {
  if (!model || !model.eligible) return { status:'REVIEW', eventId:model&&model.eventId, reason:model&&model.reason };
  const ctx={division:'Service',eventId:model.eventId};
  const fresh=tmR4_readFreshCalendarEvent_(ctx);
  if(!fresh||!fresh.event){
    return { status:'REVIEW', eventId:model.eventId, taskIds:model.taskIds||[], writeCount:0, reason:'Authoritative Service Calendar event was not found. No Calendar write attempted.' };
  }
  const original=String(fresh.event.getDescription()||'');
  const cleaned=stlRemoveManagedBlocksFromDescription_(original,'SERVICE');
  const links=[];
  if(model.salesOrderNumber) links.push({label:'Sales Order #'+model.salesOrderNumber,url:STL_SALES_ORDER_BASE_URL+encodeURIComponent(model.salesOrderNumber)});
  model.taskIds.forEach(function(taskId){const row=model.taskRows[taskId]||{};links.push({label:'Task #'+taskId+(row['Task Name']?' - '+row['Task Name']:''),url:STL_TASK_BASE_URL+encodeURIComponent(taskId)});});
  if(!links.length) return {status:'NO_LINKS',eventId:model.eventId,taskIds:model.taskIds};
  let block='<br><br>------- Striven Links -------<br>';
  links.forEach(function(link){block+='<a href="'+link.url+'">'+String(link.label||'')+'</a><br>';});
  block+='------------------------------------';
  const next=String(cleaned||'').replace(/\\s+$/g,'')+block;
  const result={status:dryRun?'WOULD_WRITE':'WRITTEN',eventId:model.eventId,calendarId:fresh.calendarId||null,taskIds:model.taskIds,salesOrderNumber:model.salesOrderNumber||null,writeCount:dryRun?0:1,previewLength:next.length};
  if(dryRun)return result;
  fresh.event.setDescription(next);
  const readBack=tmR4_readFreshCalendarEvent_(ctx);
  if(!readBack||!readBack.event)throw new Error('Service Calendar event disappeared after aggregated link write.');
  const actual=String(readBack.event.getDescription()||'');
  for(let i=0;i<model.taskIds.length;i++){
    const url=STL_TASK_BASE_URL+encodeURIComponent(model.taskIds[i]);
    if(actual.indexOf(url)===-1)throw new Error('Service Calendar read-back is missing Task #'+model.taskIds[i]+' after aggregated write.');
  }
  if(model.salesOrderNumber){const soUrl=STL_SALES_ORDER_BASE_URL+encodeURIComponent(model.salesOrderNumber);if(actual.indexOf(soUrl)===-1)throw new Error('Service Calendar read-back is missing Sales Order link after aggregated write.');}
  result.readBackVerified=true;
  return result;
}`;

const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'task-mapping-r4-1-'));
const preRoot=path.join(tmp,'PRE'),freshRoot=path.join(tmp,'FRESH'),workRoot=path.join(tmp,'WORK'),postRoot=path.join(tmp,'POST');
[preRoot,freshRoot,workRoot,postRoot].forEach(d=>fs.mkdirSync(d,{recursive:true}));
const outputDir=path.resolve(repoRoot,'task-mapping-r4-1-output'); fs.mkdirSync(outputDir,{recursive:true});
const evidencePath=path.join(outputDir,'evidence.json'), preArchiveDir=path.join(outputDir,'PRE_SOURCE');
const evidence={schemaVersion:1,release:manifest.release||'TASK_MAPPING_FIX_PACK_R4_1',scriptId,startedAt:new Date().toISOString(),targetFile:targetFileName,status:'STARTED'};
let pushed=false;
try{
  console.log('=== R4.1 1/8 authorize ==='); clasp(['show-authorized-user','--json'],repoRoot);
  console.log('=== R4.1 2/8 PRE clone ==='); clasp(['clone',scriptId,'--rootDir','src'],preRoot);
  const preSrc=path.join(preRoot,'src'), preNames=listFiles(preSrc); if(preNames.length!==expectedPreFileCount)throw new Error(`expected ${expectedPreFileCount} PRE files, found ${preNames.length}`);
  if(!preNames.includes(targetFileName))throw new Error('PRE missing '+targetFileName);
  const preHashes=hashMap(preSrc,preNames); copyDir(preRoot,preArchiveDir);
  console.log('=== R4.1 3/8 build patch ==='); copyDir(preRoot,workRoot); const workSrc=path.join(workRoot,'src'); const targetPath=path.join(workSrc,targetFileName);
  let text=fs.readFileSync(targetPath,'utf8');
  if(!text.includes("TM_FIX_PACK_R4_20260915"))throw new Error('Unexpected R4 version marker');
  text=text.replace("TM_FIX_PACK_R4_20260915","TM_FIX_PACK_R4_1_20260915");
  text=replaceNamedFunction(text,'tmR4_readFreshCalendarEvent_',readFreshReplacement);
  text=replaceNamedFunction(text,'tmR4_runServiceCalendarLinkPipeline_',servicePipelineReplacement);
  text=replaceNamedFunction(text,'tmR4_applyServiceEventLinkModel_',applyServiceReplacement);
  fs.writeFileSync(targetPath,text); run(process.execPath,['--check',targetPath],repoRoot);
  const untouched=preNames.filter(n=>n!==targetFileName); assertExactHashes(preHashes,hashMap(workSrc,untouched),untouched,'WORK preservation');
  console.log('=== R4.1 4/8 freshness clone ==='); clasp(['clone',scriptId,'--rootDir','src'],freshRoot); const freshSrc=path.join(freshRoot,'src'); const freshNames=listFiles(freshSrc); if(JSON.stringify(freshNames)!==JSON.stringify(preNames))throw new Error('Freshness file set changed'); assertExactHashes(preHashes,hashMap(freshSrc,preNames),preNames,'freshness guard');
  console.log('=== R4.1 5/8 push ==='); clasp(['push','--force'],workRoot); pushed=true;
  console.log('=== R4.1 6/8 POST clone ==='); clasp(['clone',scriptId,'--rootDir','src'],postRoot); const postSrc=path.join(postRoot,'src'); const postNames=listFiles(postSrc); if(JSON.stringify(postNames)!==JSON.stringify(preNames))throw new Error('POST file set changed'); const postHashes=hashMap(postSrc,postNames); assertExactHashes(preHashes,postHashes,untouched,'POST untouched preservation');
  const postText=fs.readFileSync(path.join(postSrc,targetFileName),'utf8'); run(process.execPath,['--check',path.join(postSrc,targetFileName)],repoRoot);
  console.log('=== R4.1 7/8 verify contracts ===');
  ['SERVICE_CONFIG','serviceGetTechCalendarConfigs_','Authoritative Service Calendar event was not found','Service Calendar link event was isolated','TM_FIX_PACK_R4_1_20260915'].forEach(marker=>{if(!postText.includes(marker))throw new Error('POST missing R4.1 marker '+marker);});
  evidence.status='DEPLOYED_SOURCE_VERIFIED'; evidence.completedAt=new Date().toISOString(); evidence.preFileCount=preNames.length; evidence.postFileCount=postNames.length; evidence.preTargetSha256=preHashes[targetFileName]; evidence.postTargetSha256=postHashes[targetFileName]; evidence.modifiedExistingFiles=[targetFileName]; evidence.runtimeTest='R4_READ_ONLY_REGRESSION_REQUIRED'; fs.writeFileSync(evidencePath,JSON.stringify(evidence,null,2));
  console.log('=== R4.1 8/8 complete ==='); console.log('DEPLOYED_SOURCE_VERIFIED');
}catch(err){evidence.status='FAILED';evidence.failedAt=new Date().toISOString();evidence.error=String(err&&err.stack||err);if(pushed){try{clasp(['push','--force'],preRoot);evidence.rollback='ROLLBACK_PUSH_COMPLETED';}catch(re){evidence.rollback='ROLLBACK_FAILED';evidence.rollbackError=String(re&&re.stack||re);}}else evidence.rollback='NOT_NEEDED_NO_PUSH_COMPLETED';fs.writeFileSync(evidencePath,JSON.stringify(evidence,null,2));throw err;}

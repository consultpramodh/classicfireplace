#!/usr/bin/env node
'use strict';
const fs=require('fs'),os=require('os'),path=require('path'),crypto=require('crypto'),cp=require('child_process');
const SID='1E86mhD2dZcOFpqWnCvoIpwEkwZ0MA63MgM8DifV6WyB2FvVQkRWKIZ_m';
const CV='3.3.0';
const REL='R5_7_PREINSPECT_EXISTING_TASK_REROUTE_20260917';
const FILE='97_Task_Mapping_Fix_Pack_R4.js';
const PRE_SHA='aac9ffb382de9fa46fed2f652ffbe835e3efcb2d150dfabbe7201ff2484fde85';
const COUNT=60;
const OUT=path.resolve('task-mapping-preinspect-r5-7-existing-task-reroute-output');
fs.mkdirSync(OUT,{recursive:true});
const ev={release:REL,status:'STARTED',scriptId:SID,startedAt:new Date().toISOString(),businessWritesPerformed:false,calendarWritesPerformed:false,strivenWritesPerformed:false,sheetWritesPerformed:false};
function run(c,a,d){const r=cp.spawnSync(c,a,{cwd:d||process.cwd(),env:process.env,encoding:'utf8',stdio:['ignore','pipe','pipe']});process.stdout.write(r.stdout||'');process.stderr.write(r.stderr||'');if(r.error)throw r.error;if(r.status)throw new Error(`${c} ${a.join(' ')} failed ${r.status}`);return r.stdout||'';}
function clasp(a,d){return run('npx',['-y',`@google/clasp@${CV}`,...a],d);}
function sha(f){return crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');}
function names(d){return fs.readdirSync(d,{withFileTypes:true}).filter(x=>x.isFile()).map(x=>x.name).sort();}
function hs(d,ns){const o={};ns.forEach(n=>o[n]=sha(path.join(d,n)));return o;}
function rf(s,n,r){const m=`function ${n}(`,a=s.indexOf(m);if(a<0||s.indexOf(m,a+m.length)>=0)throw new Error(`Function guard failed ${n}`);const b=s.indexOf('{',a);let dep=0,q=null,esc=false,lc=false,bc=false,e=-1;for(let i=b;i<s.length;i++){const c=s[i],x=s[i+1];if(lc){if(c==='\n')lc=false;continue;}if(bc){if(c==='*'&&x==='/'){bc=false;i++;}continue;}if(q){if(esc){esc=false;continue;}if(c==='\\'){esc=true;continue;}if(c===q)q=null;continue;}if(c==='/'&&x==='/'){lc=true;i++;continue;}if(c==='/'&&x==='*'){bc=true;i++;continue;}if(c==='\''||c==='"'||c==='`'){q=c;continue;}if(c==='{')dep++;else if(c==='}'&&--dep===0){e=i+1;break;}}if(e<0)throw new Error(`End guard failed ${n}`);return s.slice(0,a)+r.trim()+s.slice(e);}
const replacement=String.raw`function runSelectedTaskMappingRowEndToEndR4() {
  let ctx = tmSelectedRowE2EReadContext_();
  const calendarPreflight = tmR4_assertSelectedCalendarFresh_(ctx);

  // R5.7: A PreInspection row can begin this manual run with no mapped Task ID,
  // then the fresh read-only review can discover exactly one existing OPEN task.
  // Re-read the same selected row after review and route that task immediately
  // into the hardened R5.3 transaction path instead of continuing through the
  // legacy push-all path with its separate 10-second ScriptLock.
  if (!ctx.taskId && ctx.division === 'PreInspection') {
    const discoveryReview = reviewSelectedPreInspectMappingRow();
    SpreadsheetApp.flush();

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss && ss.getSheetByName(ctx.sheetName);
    if (!sheet) throw new Error('Missing PreInspect Task Mapping sheet after discovery review.');
    ss.setActiveSheet(sheet);
    sheet.setActiveRange(sheet.getRange(ctx.rowNumber, 1, 1, 1));
    SpreadsheetApp.flush();

    const refreshedCtx = tmSelectedRowE2EReadContext_();
    if (
      refreshedCtx.division !== 'PreInspection' ||
      Number(refreshedCtx.rowNumber) !== Number(ctx.rowNumber) ||
      String(refreshedCtx.eventId || '').trim() !== String(ctx.eventId || '').trim()
    ) {
      throw new Error(
        'BLOCKED: Selected PreInspection row identity changed during existing-task discovery. No Striven write attempted.'
      );
    }

    if (refreshedCtx.taskId) {
      const discoveredFresh = tmSelectedRowE2EReadFreshTaskState_(
        refreshedCtx.taskId,
        refreshedCtx.taskStatus
      );
      const discoveredStatus = discoveredFresh.status ||
        tmSelectedRowE2ENormalize_(refreshedCtx.taskStatus);

      if (discoveredStatus === 'OPEN') {
        Logger.log(JSON.stringify({
          mode: 'PREINSPECT_R57_EXISTING_TASK_REROUTE',
          status: 'ROUTING_TO_HARDENED_EXISTING_OPEN_TRANSACTION',
          mappingRow: refreshedCtx.rowNumber,
          eventId: refreshedCtx.eventId,
          taskId: refreshedCtx.taskId,
          discoveryReview: discoveryReview,
          calendarPreflight: calendarPreflight,
          writesPerformed: false,
          strivenWritesPerformed: false,
          calendarWritesPerformed: false
        }, null, 2));
        return tmSelectedRowE2ER3RunExistingOpenPreInspection_(refreshedCtx);
      }
    }

    ctx = refreshedCtx;
  }

  const fresh = tmSelectedRowE2EReadFreshTaskState_(ctx.taskId, ctx.taskStatus);
  const freshStatus = fresh.status || tmSelectedRowE2ENormalize_(ctx.taskStatus);

  if (!ctx.taskId) {
    if (ctx.division === 'PreInspection') {
      return tmSelectedRowE2ERunPreInspection_(ctx);
    }

    return tmSelectedRowE2EStop_(
      ctx,
      'NO_SAFE_TASK_FOUND',
      'No mapped Task ID is available. No external write was attempted. Use the guarded Task Recovery workflow after the mapping is reviewed.',
      { calendarPreflight: calendarPreflight }
    );
  }

  if (freshStatus !== 'OPEN') {
    const completion = tmSelectedRowE2ECompletionWindow_(fresh.rawTask, freshStatus);

    if (completion.recent) {
      return tmSelectedRowE2EStop_(
        ctx,
        'RECENTLY_COMPLETED_NO_RECREATE',
        'Task was completed/changed to completed within the last ' +
          TM_FIX_PACK_R4.RECENT_COMPLETION_HOURS +
          ' hours. No recreation or Striven mutation was attempted.',
        {
          freshTaskStatus: freshStatus,
          completion: completion,
          calendarPreflight: calendarPreflight
        }
      );
    }

    if (tmSelectedRowE2EIsCompletedStatus_(freshStatus) && !completion.proven) {
      return tmSelectedRowE2EStop_(
        ctx,
        'REVIEW_COMPLETION_TIME_UNKNOWN',
        'Task is completed, but the completion/status-change timestamp cannot be proven. No recreation was attempted.',
        {
          freshTaskStatus: freshStatus,
          completion: completion,
          calendarPreflight: calendarPreflight
        }
      );
    }

    if (ctx.division === 'PreInspection') {
      return tmSelectedRowE2ERunPreInspection_(ctx);
    }

    return tmSelectedRowE2EStop_(
      ctx,
      'NON_OPEN_TASK_NOT_MUTATED',
      'Task is not OPEN (' + (freshStatus || 'UNKNOWN') + '). No automatic Install/Delivery/Service recreation was attempted from this selected-row command.',
      {
        freshTaskStatus: freshStatus,
        completion: completion,
        calendarPreflight: calendarPreflight
      }
    );
  }

  if (ctx.division === 'PreInspection') {
    try {
      return tmSelectedRowE2ER3RunExistingOpenPreInspection_(ctx);
    } catch (err) {
      const message = String(err && err.message ? err.message : err);
      if (message.indexOf('BLOCKED_STRIVEN_PI_PM_PATCH_DEFECT') >= 0) {
        return tmSelectedRowE2EStop_(
          ctx,
          'BLOCKED_STRIVEN_PI_PM_PATCH_DEFECT',
          message,
          { nextDiagnostic: 'inspectSelectedPreInspectDateTimeTransportR45' }
        );
      }
      throw err;
    }
  }

  const mapping = tmR4_readSelectedMapping_(ctx);
  const before = getStrivenTaskSnapshotById_(ctx.taskId, {});
  const diff = tmR4_computeSelectedTaskDiff_(ctx, mapping, before);
  const strivenResult = tmR4_applySelectedTaskDiff_(ctx, mapping, diff);
  const verification = tmR4_verifySelectedTaskReadBack_(ctx, mapping);

  let calendarResult;
  if (ctx.division === 'Service') {
    calendarResult = tmR4_pushSelectedServiceCalendarEventTaskSet_(false);
  } else {
    calendarResult = tmSelectedRowE2ERunCalendarLink_(ctx.division);
  }

  const calendarVerification = tmR4_verifySelectedCalendarLink_(ctx);

  const result = {
    mode: 'SELECTED_ROW_END_TO_END_R4',
    version: TM_FIX_PACK_R4.VERSION,
    status: 'COMPLETE_AND_VERIFIED',
    division: ctx.division,
    mappingRow: ctx.rowNumber,
    eventId: ctx.eventId,
    taskId: ctx.taskId,
    calendarPreflight: calendarPreflight,
    freshTaskStatus: freshStatus,
    freshDiff: diff,
    striven: strivenResult,
    verification: verification,
    calendar: calendarResult,
    calendarVerification: calendarVerification
  };

  Logger.log(JSON.stringify(result, null, 2));
  return result;
}`;
const root=fs.mkdtempSync(path.join(os.tmpdir(),'tm-r57-')),P=path.join(root,'PRE'),W=path.join(root,'WORK'),F=path.join(root,'FRESH'),O=path.join(root,'POST');[P,W,F,O].forEach(d=>fs.mkdirSync(d,{recursive:true}));let pushed=false;
try{
  clasp(['show-authorized-user','--json']);
  clasp(['clone',SID,'--rootDir','src'],P);
  const ps=path.join(P,'src'),ns=names(ps);if(ns.length!==COUNT)throw new Error(`Expected ${COUNT} PRE files, found ${ns.length}`);
  const ph=hs(ps,ns);if(ph[FILE]!==PRE_SHA)throw new Error(`Unexpected PRE ${FILE} SHA ${ph[FILE]}`);
  fs.cpSync(P,path.join(OUT,'PRE_SOURCE'),{recursive:true});
  fs.cpSync(P,W,{recursive:true});
  const ws=path.join(W,'src'),tf=path.join(ws,FILE);let s=fs.readFileSync(tf,'utf8');
  if(!s.includes("VERSION: 'TM_FIX_PACK_R4_8_20260915'"))throw new Error('Expected R4.8 version marker missing');
  s=s.replace("VERSION: 'TM_FIX_PACK_R4_8_20260915'","VERSION: 'TM_FIX_PACK_R4_9_20260917'");
  s=rf(s,'runSelectedTaskMappingRowEndToEndR4',replacement);
  fs.writeFileSync(tf,s);run('node',['--check',tf]);
  if(!s.includes('PREINSPECT_R57_EXISTING_TASK_REROUTE'))throw new Error('R5.7 marker missing');
  if(!s.includes('tmSelectedRowE2ER3RunExistingOpenPreInspection_(refreshedCtx)'))throw new Error('Hardened reroute missing');
  const wh=hs(ws,ns),chg=ns.filter(n=>wh[n]!==ph[n]);if(JSON.stringify(chg)!==JSON.stringify([FILE]))throw new Error('Changed-file guard '+chg.join(','));
  clasp(['clone',SID,'--rootDir','src'],F);const fsr=path.join(F,'src'),fn=names(fsr),fh=hs(fsr,fn);if(JSON.stringify(fn)!==JSON.stringify(ns))throw new Error('Fresh file set changed');ns.forEach(n=>{if(fh[n]!==ph[n])throw new Error(`Freshness guard ${n}`)});
  clasp(['push','--force'],W);pushed=true;
  clasp(['clone',SID,'--rootDir','src'],O);const osrc=path.join(O,'src'),on=names(osrc),oh=hs(osrc,on);if(JSON.stringify(on)!==JSON.stringify(ns))throw new Error('POST file set changed');ns.forEach(n=>{const exp=n===FILE?wh[n]:ph[n];if(oh[n]!==exp)throw new Error(`POST verify ${n}`)});
  Object.assign(ev,{status:'DEPLOYED_SOURCE_VERIFIED',changedFiles:[FILE],preFileCount:ns.length,postFileCount:on.length,pre97R4Sha:ph[FILE],post97R4Sha:oh[FILE],completedAt:new Date().toISOString(),runtimeNext:'Manual rerun of one selected PreInspect mapping row only. Expect discovered existing OPEN task to route to R5.3 transaction-safe path.'});
  fs.writeFileSync(path.join(OUT,'evidence.json'),JSON.stringify(ev,null,2));console.log(JSON.stringify(ev,null,2));
}catch(err){Object.assign(ev,{status:'FAILED',error:String(err&&err.stack||err),completedAt:new Date().toISOString()});if(pushed){try{clasp(['push','--force'],P);ev.rollback='ROLLBACK_PUSH_COMPLETED';}catch(rb){ev.rollback='ROLLBACK_FAILED';ev.rollbackError=String(rb&&rb.stack||rb);}}else ev.rollback='NOT_NEEDED_NO_PUSH_COMPLETED';fs.writeFileSync(path.join(OUT,'evidence.json'),JSON.stringify(ev,null,2));throw err;}

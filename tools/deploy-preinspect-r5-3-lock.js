#!/usr/bin/env node
'use strict';
const fs=require('fs'),os=require('os'),path=require('path'),crypto=require('crypto'),cp=require('child_process');
const SID='1E86mhD2dZcOFpqWnCvoIpwEkwZ0MA63MgM8DifV6WyB2FvVQkRWKIZ_m';
const CV='3.3.0';
const RELEASE='R5_3_PREINSPECT_TRANSACTION_LOCK_20260916';
const TARGET='96_Selected_Row_End_To_End_R3.js';
const EXPECTED_PRE_SHA='fc53ee221d8db12988da42ef85e0fa6181cbd89f3f77122ad73c7d8128e748f2';
const EXPECTED_FILE_COUNT=59;
const OUT=path.resolve('task-mapping-preinspect-r5-3-lock-output'); fs.mkdirSync(OUT,{recursive:true});
const evidence={release:RELEASE,status:'STARTED',scriptId:SID,targetFile:TARGET,startedAt:new Date().toISOString()};
function run(cmd,args,cwd){const r=cp.spawnSync(cmd,args,{cwd:cwd||process.cwd(),env:process.env,encoding:'utf8',stdio:['ignore','pipe','pipe']});process.stdout.write(r.stdout||'');process.stderr.write(r.stderr||'');if(r.error)throw r.error;if(r.status!==0)throw new Error(`${cmd} ${args.join(' ')} failed ${r.status}`);return r.stdout||'';}
function clasp(args,cwd){return run('npx',['-y',`@google/clasp@${CV}`,...args],cwd);}
function sha(f){return crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');}
function files(d){return fs.readdirSync(d,{withFileTypes:true}).filter(x=>x.isFile()).map(x=>x.name).sort();}
function hashes(d,ns){const o={};ns.forEach(n=>o[n]=sha(path.join(d,n)));return o;}
function same(e,a,ns,label){const bad=ns.filter(n=>e[n]!==a[n]);if(bad.length)throw new Error(`${label}: hash mismatch ${bad.join(', ')}`);}
function fr(s,n){const re=new RegExp(`function\\s+${n}\\s*\\(`,'g'),m=[...s.matchAll(re)];if(m.length!==1)throw new Error(`Expected one ${n}; found ${m.length}`);let i=s.indexOf('{',m[0].index+m[0][0].length),d=0,q=null,esc=false,lc=false,bc=false;for(let j=i;j<s.length;j++){const c=s[j],nx=s[j+1];if(lc){if(c==='\n')lc=false;continue;}if(bc){if(c==='*'&&nx==='/'){bc=false;j++;}continue;}if(q){if(esc){esc=false;continue;}if(c==='\\'){esc=true;continue;}if(c===q)q=null;continue;}if(c==='/'&&nx==='/'){lc=true;j++;continue;}if(c==='/'&&nx==='*'){bc=true;j++;continue;}if(c==='\''||c==='"'||c==='`'){q=c;continue;}if(c==='{')d++;else if(c==='}'&&!--d)return{a:m[0].index,b:j+1,t:s.slice(m[0].index,j+1)};}throw new Error('No close for '+n);}
function rep(s,n,r){const x=fr(s,n);return s.slice(0,x.a)+r.trim()+s.slice(x.b);}

const OLD_CONFIG="const TM_SELECTED_ROW_E2E_R3 = Object.freeze({\n  VERSION: 'TM_SELECTED_ROW_E2E_R3_4_20260915',\n  LOCK_WAIT_MS: 10000,\n  READBACK_DELAYS_MS: [500, 1200, 2500],\n  LOCK_RETRY_DELAYS_MS: [1500, 3000, 6000]\n});";
const NEW_CONFIG="const TM_SELECTED_ROW_E2E_R3 = Object.freeze({\n  VERSION: 'TM_SELECTED_ROW_E2E_R3_5_20260916',\n  LOCK_WAIT_MS: 10000,\n  TRANSACTION_SCRIPT_LOCK_WAIT_MS: 90000,\n  READBACK_DELAYS_MS: [500, 1200, 2500],\n  LOCK_RETRY_DELAYS_MS: [1500, 3000, 6000]\n});";
const NEW_EXISTING_OPEN=String.raw`function tmSelectedRowE2ER3RunExistingOpenPreInspection_(ctx) {
  const userLock = LockService.getUserLock();
  if (!userLock.tryLock(TM_SELECTED_ROW_E2E_R3.LOCK_WAIT_MS)) {
    throw new Error('Selected-row End-to-End R3 is already running for this user.');
  }

  const transactionLock = LockService.getScriptLock();
  let transactionLockAcquired = false;
  const steps = [];

  function record(name, value) {
    steps.push({ action: name, result: value });
    return value;
  }

  function assertHeldTransactionLock_() {
    if (!transactionLockAcquired || !transactionLock.hasLock()) {
      throw new Error(
        'BLOCKED: Selected-row PreInspection transaction lost the ScriptLock. No further write attempted.'
      );
    }
  }

  function runHeldManualStep_(label, action, fn) {
    assertHeldTransactionLock_();
    tmSelectedRowE2ER3RestoreAndVerifySelection_(ctx);
    const stepCtx = preinspectR30BuildContext_();
    if (
      String(stepCtx.eventId || '').trim() !== String(ctx.eventId || '').trim() ||
      Number(stepCtx.taskId || 0) !== Number(ctx.taskId || 0)
    ) {
      throw new Error(
        'BLOCKED: PreInspection context changed before ' + label +
        '. No further Striven write attempted.'
      );
    }

    const result = fn(stepCtx);
    return {
      mode: 'MANUAL_PREINSPECT_SINGLE_FIELD_PUSH',
      action: action,
      writesPerformed: result && result.writesPerformed === true,
      strivenWritesPerformed: result && result.writesPerformed === true,
      calendarWritesPerformed: false,
      mappingRow: stepCtx.rowNumber,
      eventId: stepCtx.eventId,
      taskId: stepCtx.taskId,
      taskTypeId: PREINSPECT_R30_MANUAL.TASK_TYPE_ID,
      result: result
    };
  }

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss && ss.getSheetByName(ctx.sheetName);
    if (!sheet) throw new Error('Missing PreInspect Task Mapping sheet.');

    ss.setActiveSheet(sheet);
    sheet.setActiveRange(sheet.getRange(ctx.rowNumber, 1, 1, 1));
    SpreadsheetApp.flush();

    const lockWaitStarted = Date.now();
    if (!transactionLock.tryLock(TM_SELECTED_ROW_E2E_R3.TRANSACTION_SCRIPT_LOCK_WAIT_MS)) {
      throw new Error(
        'Could not obtain the selected-row PreInspection transaction ScriptLock within ' +
        TM_SELECTED_ROW_E2E_R3.TRANSACTION_SCRIPT_LOCK_WAIT_MS +
        ' ms. No Striven or Calendar write was attempted.'
      );
    }
    transactionLockAcquired = true;

    tmSelectedRowE2ER3RestoreAndVerifySelection_(ctx);
    record('TRANSACTION_SCRIPT_LOCK', {
      status: 'ACQUIRED',
      writesPerformed: false,
      waitMs: Date.now() - lockWaitStarted,
      policy: 'ONE_SCRIPT_LOCK_FOR_COMPLETE_PREINSPECTION_SELECTED_ROW_TRANSACTION'
    });

    record('REVIEW_MATCH_DUPLICATE_CHECK', reviewSelectedPreInspectMappingRow());
    SpreadsheetApp.flush();

    const state = preinspectR34ReadSelectedMappingState_();
    const status = String(state.row['Status'] || '').trim().toUpperCase();
    const taskAction = String(state.row['Task Action'] || '').trim().toUpperCase();
    const reviewedTaskId = preinspectR34PositiveNumber_(state.row['Task ID']);

    if (status === 'REVIEW' || status === 'SKIP') {
      const stopped = {
        mode: 'SELECTED_ROW_END_TO_END_R3',
        version: TM_SELECTED_ROW_E2E_R3.VERSION,
        status: status === 'SKIP' ? 'STOPPED_SKIP' : 'STOPPED_REVIEW',
        division: 'PreInspection',
        mappingRow: ctx.rowNumber,
        eventId: ctx.eventId,
        taskId: reviewedTaskId || ctx.taskId,
        taskAction: taskAction,
        issue: String(state.row['Issue'] || '').trim(),
        steps: steps
      };
      Logger.log(JSON.stringify(stopped, null, 2));
      return stopped;
    }

    if (!reviewedTaskId || Number(reviewedTaskId) !== Number(ctx.taskId)) {
      throw new Error(
        'BLOCKED: Selected PreInspection row changed Task ID during fresh review. ' +
        'Before=' + ctx.taskId + '; After=' + (reviewedTaskId || 'blank') + '. No further write attempted.'
      );
    }

    const refreshed = tmSelectedRowE2EReadFreshTaskState_(reviewedTaskId, state.row['Task Status']);
    const refreshedStatus = refreshed.status || tmSelectedRowE2ENormalize_(state.row['Task Status']);
    if (refreshedStatus !== 'OPEN') {
      return tmSelectedRowE2EStop_(ctx, 'TASK_STATUS_CHANGED_DURING_REVIEW',
        'Task is no longer OPEN after the fresh review. No further Striven mutation or Calendar write was attempted.',
        { freshTaskStatus: refreshedStatus, steps: steps });
    }

    record('CUSTOMER', runHeldManualStep_(
      'CUSTOMER',
      'CUSTOMER',
      function(stepCtx) { return preinspectR30PushCustomer_(stepCtx); }
    ));

    record('LOCATION', runHeldManualStep_(
      'LOCATION',
      'LOCATION',
      function(stepCtx) { return preinspectR30PushLocation_(stepCtx); }
    ));

    record('REQUESTED_BY', runHeldManualStep_(
      'REQUESTED_BY',
      'REQUESTED_BY',
      function(stepCtx) { return preinspectR30PushRequestedBy_(stepCtx); }
    ));

    const scheduleRow = preinspectMappingRowObject_(sheet, ctx.rowNumber);
    const canonicalSchedule = typeof preinspectR46GetCanonicalV1Schedule_ === 'function'
      ? preinspectR46GetCanonicalV1Schedule_(reviewedTaskId)
      : null;
    const canonicalMatchesCalendar = !!(
      canonicalSchedule &&
      canonicalSchedule.startDateTime &&
      canonicalSchedule.dueDateTime &&
      preinspectSameMinuteValue_(canonicalSchedule.startDateTime, scheduleRow['Calendar Start']) &&
      preinspectSameMinuteValue_(canonicalSchedule.dueDateTime, scheduleRow['Calendar End'])
    );

    if (canonicalMatchesCalendar) {
      record('DATE_TIME_CANONICAL_V1_VERIFIED', {
        mode: 'PREINSPECT_SELECTED_ROW_DATETIME_R46',
        status: 'NOT_NEEDED_CANONICAL_V1_MATCH',
        writesPerformed: false,
        strivenWritesPerformed: false,
        calendarWritesPerformed: false,
        taskId: Number(reviewedTaskId),
        mappingRow: Number(ctx.rowNumber),
        source: canonicalSchedule.source || 'V1_DESIRED_START_END',
        canonical: {
          startDateTime: canonicalSchedule.startDateTime,
          dueDateTime: canonicalSchedule.dueDateTime
        },
        calendar: {
          startDateTime: String(scheduleRow['Calendar Start'] || ''),
          dueDateTime: String(scheduleRow['Calendar End'] || '')
        },
        reason: 'Canonical v1 DesiredStartDate/DesiredEndDate already match the fresh Calendar. No schedule PATCH attempted.'
      });
    } else {
      assertHeldTransactionLock_();
      tmSelectedRowE2ER3RestoreAndVerifySelection_(ctx);
      record(
        'DATE_TIME_V2_FALLBACK_PATCH_RECONCILE',
        tmSelectedRowE2ER3ReconcilePreInspectionDateTime_(
          sheet,
          ctx.rowNumber,
          ctx.eventId,
          reviewedTaskId
        )
      );
    }

    record('ASSIGNEES', runHeldManualStep_(
      'ASSIGNEES',
      'ASSIGNEES',
      function(stepCtx) { return preinspectR30PushAssignees_(stepCtx); }
    ));

    record('INSTALL_NOTES_854', runHeldManualStep_(
      'INSTALL_NOTES_854',
      'INSTALL_NOTES',
      function(stepCtx) { return preinspectR30PushInstallNotes_(stepCtx); }
    ));

    assertHeldTransactionLock_();
    tmSelectedRowE2ER3RestoreAndVerifySelection_(ctx);
    record('CALENDAR_TASK_LINK', pushSelectedPreInspectTaskLinkToCalendarEvent());

    SpreadsheetApp.flush();
    transactionLock.releaseLock();
    transactionLockAcquired = false;

    record('REFRESH_PREINSPECT_CALENDAR_MIRROR', syncPreInspectCalendarNow());

    ss.setActiveSheet(sheet);
    sheet.setActiveRange(sheet.getRange(ctx.rowNumber, 1, 1, 1));
    SpreadsheetApp.flush();

    record('FINAL_MAPPING_REVIEW', reviewSelectedPreInspectMappingRow());
    SpreadsheetApp.flush();

    const finalState = preinspectR34ReadSelectedMappingState_();
    const finalTaskId = preinspectR34PositiveNumber_(finalState.row['Task ID']);
    if (!finalTaskId || Number(finalTaskId) !== Number(reviewedTaskId)) {
      throw new Error(
        'Final mapping verification did not retain the verified PreInspection Task ID ' +
        reviewedTaskId + '.'
      );
    }

    const result = {
      mode: 'SELECTED_ROW_END_TO_END_R3',
      version: TM_SELECTED_ROW_E2E_R3.VERSION,
      status: 'COMPLETE_AND_VERIFIED',
      division: 'PreInspection',
      mappingRow: ctx.rowNumber,
      eventId: ctx.eventId,
      taskId: reviewedTaskId,
      datetimeTransport: 'CANONICAL_V1_DESIRED_DATES_WITH_V2_PATCH_FALLBACK',
      lockPolicy: 'ONE_SCRIPT_LOCK_FOR_COMPLETE_PREINSPECTION_SELECTED_ROW_TRANSACTION',
      salesOrderPolicy: 'SKIPPED_DISABLED_BY_POLICY',
      steps: steps,
      finalMapping: {
        status: String(finalState.row['Status'] || '').trim(),
        taskAction: String(finalState.row['Task Action'] || '').trim(),
        taskStatus: String(finalState.row['Task Status'] || '').trim(),
        issue: String(finalState.row['Issue'] || '').trim()
      }
    };

    Logger.log(JSON.stringify(result, null, 2));
    return result;
  } catch (err) {
    const failure = {
      mode: 'SELECTED_ROW_END_TO_END_R3',
      version: TM_SELECTED_ROW_E2E_R3.VERSION,
      status: 'FAILED',
      division: 'PreInspection',
      mappingRow: ctx ? ctx.rowNumber : null,
      eventId: ctx ? ctx.eventId : null,
      taskId: ctx ? ctx.taskId : null,
      completedSteps: steps,
      error: String(err && err.message ? err.message : err)
    };
    Logger.log(JSON.stringify(failure, null, 2));
    throw err;
  } finally {
    if (transactionLockAcquired) {
      try { SpreadsheetApp.flush(); } catch (ignoreFlush) {}
      transactionLock.releaseLock();
    }
    userLock.releaseLock();
  }
}`;

const root=fs.mkdtempSync(path.join(os.tmpdir(),'tm-r53-lock-')),P=path.join(root,'PRE'),W=path.join(root,'WORK'),F=path.join(root,'FRESH'),O=path.join(root,'POST');[P,W,F,O].forEach(d=>fs.mkdirSync(d,{recursive:true}));let pushed=false;
try{
  console.log('R5.3 authorize'); clasp(['show-authorized-user','--json']);
  console.log('R5.3 PRE'); clasp(['clone',SID,'--rootDir','src'],P); const ps=path.join(P,'src'),ns=files(ps); if(ns.length!==EXPECTED_FILE_COUNT)throw new Error('Expected '+EXPECTED_FILE_COUNT+' files, found '+ns.length); const tp=path.join(ps,TARGET); if(!fs.existsSync(tp))throw new Error('Missing '+TARGET); const preSha=sha(tp); if(preSha!==EXPECTED_PRE_SHA)throw new Error('Unexpected live '+TARGET+' hash: '+preSha); const ph=hashes(ps,ns); fs.cpSync(P,path.join(OUT,'PRE_SOURCE'),{recursive:true});
  let pre=fs.readFileSync(tp,'utf8'); ['TM_SELECTED_ROW_E2E_R3_4_20260915','tmSelectedRowE2ER3RunLockAwareManualStep_','tmSelectedRowE2ER3RunDateTimeWithScriptLock_'].forEach(m=>{if(!pre.includes(m))throw new Error('Missing expected pre-R5.3 marker '+m);});
  console.log('R5.3 patch'); fs.cpSync(P,W,{recursive:true}); const ws=path.join(W,'src'),wp=path.join(ws,TARGET); let s=fs.readFileSync(wp,'utf8'); if(!s.includes(OLD_CONFIG))throw new Error('R5.3 config block not found'); if(s.indexOf(OLD_CONFIG)!==s.lastIndexOf(OLD_CONFIG))throw new Error('R5.3 config block found more than once'); s=s.replace(OLD_CONFIG,NEW_CONFIG); s=rep(s,'tmSelectedRowE2ER3RunExistingOpenPreInspection_',NEW_EXISTING_OPEN); fs.writeFileSync(wp,s); run(process.execPath,['--check',wp]);
  const main=fr(s,'tmSelectedRowE2ER3RunExistingOpenPreInspection_').t;
  ['TRANSACTION_SCRIPT_LOCK_WAIT_MS','ONE_SCRIPT_LOCK_FOR_COMPLETE_PREINSPECTION_SELECTED_ROW_TRANSACTION','preinspectR30PushAssignees_','preinspectR30PushInstallNotes_','transactionLock.hasLock()'].forEach(x=>{if(!s.includes(x))throw new Error('R5.3 marker missing '+x);});
  if(main.includes('tmSelectedRowE2ER3RunLockAwareManualStep_'))throw new Error('Old per-field lock helper still used by selected-row transaction');
  if(main.includes('tmSelectedRowE2ER3RunDateTimeWithScriptLock_'))throw new Error('Old nested datetime script-lock helper still used by selected-row transaction');
  if((main.match(/LockService\.getScriptLock\(\)/g)||[]).length!==1)throw new Error('Expected exactly one transaction ScriptLock acquisition in selected-row function');
  if(main.indexOf('transactionLock.releaseLock();')>main.indexOf("record('REFRESH_PREINSPECT_CALENDAR_MIRROR'"))throw new Error('Transaction ScriptLock must be released before Calendar mirror refresh reacquires it');
  const wh=hashes(ws,ns),chg=ns.filter(n=>ph[n]!==wh[n]); if(JSON.stringify(chg)!==JSON.stringify([TARGET]))throw new Error('Expected only '+TARGET+' changed; got '+JSON.stringify(chg)); evidence.changedFiles=chg; evidence.preTargetSha256=ph[TARGET]; evidence.workTargetSha256=wh[TARGET];
  console.log('R5.3 freshness'); clasp(['clone',SID,'--rootDir','src'],F); const fsr=path.join(F,'src'),fn=files(fsr); if(JSON.stringify(fn)!==JSON.stringify(ns))throw new Error('Fresh file set changed'); same(ph,hashes(fsr,fn),ns,'Freshness');
  console.log('R5.3 push'); clasp(['push','--force'],W); pushed=true;
  console.log('R5.3 POST'); clasp(['clone',SID,'--rootDir','src'],O); const osrc=path.join(O,'src'),on=files(osrc); if(JSON.stringify(on)!==JSON.stringify(ns))throw new Error('POST file set changed'); const oh=hashes(osrc,on); same(ph,oh,ns.filter(n=>n!==TARGET),'POST untouched'); if(oh[TARGET]!==wh[TARGET])throw new Error('POST target hash mismatch'); run(process.execPath,['--check',path.join(osrc,TARGET)]);
  evidence.status='DEPLOYED_SOURCE_VERIFIED'; evidence.postTargetSha256=oh[TARGET]; evidence.fileCount=on.length; evidence.completedAt=new Date().toISOString(); evidence.businessWritesPerformed=false; evidence.runtimeNext='Run runSelectedTaskMappingRowEndToEndR4 once on current Jill & Dave Crain / Task 18504 row. Expected: transaction ScriptLock acquired, Task 18504 retained, R5.2 assignment cleanup verified, Field 854 reconciled without blind retry, COMPLETE_AND_VERIFIED.'; fs.writeFileSync(path.join(OUT,'evidence.json'),JSON.stringify(evidence,null,2)); console.log('DEPLOYED_SOURCE_VERIFIED'); console.log(JSON.stringify(evidence,null,2));
}catch(e){evidence.status='FAILED';evidence.error=String(e.stack||e);evidence.failedAt=new Date().toISOString();if(pushed){try{clasp(['push','--force'],P);evidence.rollback='ROLLBACK_PUSH_COMPLETED';}catch(r){evidence.rollback='ROLLBACK_FAILED';evidence.rollbackError=String(r.stack||r);}}else evidence.rollback='NOT_NEEDED_NO_PUSH';fs.writeFileSync(path.join(OUT,'evidence.json'),JSON.stringify(evidence,null,2));throw e;}

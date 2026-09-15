#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const cp = require('child_process');

const manifestPath = process.argv[2];
if (!manifestPath) throw new Error('Usage: node tools/deploy-task-mapping-fix-pack-r4-6.js <manifest.json>');

const repoRoot = process.cwd();
const manifest = JSON.parse(fs.readFileSync(path.resolve(repoRoot, manifestPath), 'utf8'));
const scriptId = String(manifest.scriptId || '').trim();
const claspVersion = String(manifest.claspVersion || '3.3.0');
const expectedPreFileCount = Number(manifest.expectedPreFileCount || 59);
if (!scriptId) throw new Error('release manifest missing scriptId');

const targetPI = '35_PreInspect_Task_Review.js';
const targetR3 = '96_Selected_Row_End_To_End_R3.js';
const targetR4 = '97_Task_Mapping_Fix_Pack_R4.js';

function run(command, args, cwd) {
  const r = cp.spawnSync(command, args, { cwd, env: process.env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  process.stdout.write(r.stdout || '');
  process.stderr.write(r.stderr || '');
  if (r.status !== 0) throw new Error(`${command} ${args.join(' ')} failed with exit ${r.status}`);
  return r.stdout || '';
}
function clasp(args, cwd) { return run('npx', ['-y', `@google/clasp@${claspVersion}`, ...args], cwd); }
function sha256(file) { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }
function listFiles(dir) { return fs.readdirSync(dir, {withFileTypes:true}).filter(e => e.isFile()).map(e => e.name).sort(); }
function hashMap(dir, names) { const out = {}; names.forEach(n => out[n] = sha256(path.join(dir, n))); return out; }
function copyDir(src, dst) { fs.cpSync(src, dst, {recursive:true}); }
function assertExactHashes(expected, actual, names, label) {
  const bad = [];
  names.forEach(n => { if (expected[n] !== actual[n]) bad.push(n); });
  if (bad.length) throw new Error(`${label}: hash mismatch ${bad.join(', ')}`);
}
function replaceOnce(text, oldText, newText, label) {
  const first = text.indexOf(oldText);
  if (first < 0) throw new Error(`Missing expected source for ${label}`);
  if (text.indexOf(oldText, first + oldText.length) >= 0) throw new Error(`Expected exactly one occurrence for ${label}`);
  return text.slice(0, first) + newText + text.slice(first + oldText.length);
}

const canonicalHelper = `
/************************************************************
 * R4.6 — PREINSPECTION CANONICAL V1 SCHEDULE READ
 *
 * The production diagnostic proved that v2 StartDateTime /
 * DueDateTime can render PM hours 12 hours early for Task Type
 * 105 while v1 DesiredStartDate / DesiredEndDate retain the
 * correct schedule. Read v1 only when v2 disagrees with the
 * Calendar, so normal matching does not double API usage.
 ************************************************************/
function preinspectR46GetCanonicalV1Schedule_(taskId) {
  const cleanTaskId = preinspectId_(taskId);
  if (!cleanTaskId) throw new Error('A positive Task ID is required for canonical v1 schedule read.');

  const auth = preinspectGetReadonlyStrivenAuth_();
  const base = String(auth.taskBaseUrl || 'https://api.striven.com/v2/tasks')
    .replace(/\\/+$/, '')
    .replace(/\\/v2\\/tasks$/i, '');

  const result = preinspectReadonlyTaskRequest_(
    'get',
    base + '/v1/tasks/' + encodeURIComponent(cleanTaskId),
    null,
    'PreInspect READ-ONLY GET /v1/tasks/' + cleanTaskId
  );

  const raw = result && result.json && typeof result.json === 'object'
    ? result.json
    : {};

  const start =
    raw.desiredStartDate !== undefined ? raw.desiredStartDate :
    (raw.DesiredStartDate !== undefined ? raw.DesiredStartDate :
    (raw.startDate !== undefined ? raw.startDate : raw.StartDate));

  const due =
    raw.desiredEndDate !== undefined ? raw.desiredEndDate :
    (raw.DesiredEndDate !== undefined ? raw.DesiredEndDate :
    (raw.dueDate !== undefined ? raw.dueDate : raw.DueDate));

  return {
    taskId: cleanTaskId,
    statusCode: result.statusCode,
    startDateTime: start || null,
    dueDateTime: due || null,
    source: 'V1_DESIRED_START_END'
  };
}
`;

const oldSameBlock = `    const sameStart = preinspectSameMinuteValue_(reviewResult.start, task.startDateTime);
    const sameDue = preinspectSameMinuteValue_(reviewResult.end, task.dueDateTime);
    const sameDay = preinspectSameLocalDay_(reviewResult.start, task.startDateTime);`;

const newSameBlock = `    let sameStart = preinspectSameMinuteValue_(reviewResult.start, task.startDateTime);
    let sameDue = preinspectSameMinuteValue_(reviewResult.end, task.dueDateTime);
    let sameDay = preinspectSameLocalDay_(reviewResult.start, task.startDateTime);
    let scheduleSource = 'V2_TASK_MODEL';

    // R4.6: only when v2 schedule disagrees with the Calendar, read the
    // canonical v1 DesiredStartDate / DesiredEndDate model. This avoids
    // doubling task GET usage for normal rows while correcting the proven
    // PreInspection PM representation defect.
    if (
      Number(task.typeId || 0) === Number(PREINSPECT_REVIEW_CONFIG.TASK_TYPE_ID || 105) &&
      (!sameStart || !sameDue) &&
      typeof preinspectR46GetCanonicalV1Schedule_ === 'function'
    ) {
      const canonical = preinspectR46GetCanonicalV1Schedule_(task.taskId);
      if (canonical && canonical.startDateTime && canonical.dueDateTime) {
        task.startDateTime = canonical.startDateTime;
        task.dueDateTime = canonical.dueDateTime;
        scheduleSource = canonical.source || 'V1_DESIRED_START_END';
        sameStart = preinspectSameMinuteValue_(reviewResult.start, task.startDateTime);
        sameDue = preinspectSameMinuteValue_(reviewResult.end, task.dueDateTime);
        sameDay = preinspectSameLocalDay_(reviewResult.start, task.startDateTime);
      }
    }`;

const oldCandidateSource = `      dueDateTime: task.dueDateTime,
      customerId: task.customerId,`;
const newCandidateSource = `      dueDateTime: task.dueDateTime,
      scheduleSource: scheduleSource,
      customerId: task.customerId,`;

const oldEvidence = `  if (candidate.sameDue) parts.push('DUE');
  if (candidate.sameDay) parts.push('DAY');`;
const newEvidence = `  if (candidate.sameDue) parts.push('DUE');
  if (String(candidate.scheduleSource || '') === 'V1_DESIRED_START_END') parts.push('V1_DATES');
  if (candidate.sameDay) parts.push('DAY');`;

const oldR3DateBlock = `    record(
      'DATE_TIME_LOCAL_24H_ISO_SEQUENTIAL_RECONCILE',
      tmSelectedRowE2ER3RunDateTimeWithScriptLock_(ctx, function() {
        return tmSelectedRowE2ER3ReconcilePreInspectionDateTime_(
          sheet,
          ctx.rowNumber,
          ctx.eventId,
          reviewedTaskId
        );
      })
    );`;

const newR3DateBlock = `    const scheduleRow = preinspectMappingRowObject_(sheet, ctx.rowNumber);
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
      record(
        'DATE_TIME_V2_FALLBACK_PATCH_RECONCILE',
        tmSelectedRowE2ER3RunDateTimeWithScriptLock_(ctx, function() {
          return tmSelectedRowE2ER3ReconcilePreInspectionDateTime_(
            sheet,
            ctx.rowNumber,
            ctx.eventId,
            reviewedTaskId
          );
        })
      );
    }`;

const oldResultTransport = `      datetimeTransport: 'LOCAL_MERIDIEM_SEQUENTIAL_PATCH',`;
const newResultTransport = `      datetimeTransport: 'CANONICAL_V1_DESIRED_DATES_WITH_V2_PATCH_FALLBACK',`;

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'task-mapping-r4-6-'));
const preRoot = path.join(tmp, 'PRE');
const freshRoot = path.join(tmp, 'FRESH');
const workRoot = path.join(tmp, 'WORK');
const postRoot = path.join(tmp, 'POST');
[preRoot, freshRoot, workRoot, postRoot].forEach(d => fs.mkdirSync(d, {recursive:true}));

const outputDir = path.resolve(repoRoot, 'task-mapping-r4-6-output');
fs.mkdirSync(outputDir, {recursive:true});
const evidencePath = path.join(outputDir, 'evidence.json');
const preArchiveDir = path.join(outputDir, 'PRE_SOURCE');
const evidence = {
  schemaVersion: 1,
  release: manifest.release || 'TASK_MAPPING_FIX_PACK_R4_6',
  scriptId,
  startedAt: new Date().toISOString(),
  status: 'STARTED'
};

let pushed = false;
try {
  console.log('=== R4.6 1/8 authorize ===');
  clasp(['show-authorized-user', '--json'], repoRoot);

  console.log('=== R4.6 2/8 PRE clone ===');
  clasp(['clone', scriptId, '--rootDir', 'src'], preRoot);
  const preSrc = path.join(preRoot, 'src');
  const preNames = listFiles(preSrc);
  if (preNames.length !== expectedPreFileCount) throw new Error(`expected ${expectedPreFileCount} PRE files, found ${preNames.length}`);
  [targetPI, targetR3, targetR4].forEach(n => { if (!preNames.includes(n)) throw new Error('PRE missing ' + n); });
  const preHashes = hashMap(preSrc, preNames);
  copyDir(preRoot, preArchiveDir);

  console.log('=== R4.6 3/8 build patch ===');
  copyDir(preRoot, workRoot);
  const workSrc = path.join(workRoot, 'src');
  const piPath = path.join(workSrc, targetPI);
  const r3Path = path.join(workSrc, targetR3);
  const r4Path = path.join(workSrc, targetR4);

  let pi = fs.readFileSync(piPath, 'utf8');
  let r3 = fs.readFileSync(r3Path, 'utf8');
  let r4 = fs.readFileSync(r4Path, 'utf8');

  if (!r3.includes('TM_SELECTED_ROW_E2E_R3_3_20260915')) throw new Error('Unexpected live R3.3 marker');
  if (!r4.includes('TM_FIX_PACK_R4_5_20260915')) throw new Error('Unexpected live R4.5 marker');
  if (!pi.includes('tmR45AssertPreInspectDateTimePatchSafe_')) throw new Error('R4.5 PM quarantine hook missing from live PI source');

  if (!pi.includes('function preinspectR46GetCanonicalV1Schedule_(')) {
    pi += canonicalHelper;
  }
  pi = replaceOnce(pi, oldSameBlock, newSameBlock, 'candidate canonical schedule reconciliation');
  pi = replaceOnce(pi, oldCandidateSource, newCandidateSource, 'candidate schedule source evidence');
  pi = replaceOnce(pi, oldEvidence, newEvidence, 'mapping evidence V1_DATES');

  r3 = r3.replace('TM_SELECTED_ROW_E2E_R3_3_20260915', 'TM_SELECTED_ROW_E2E_R3_4_20260915');
  r3 = replaceOnce(r3, oldR3DateBlock, newR3DateBlock, 'selected-row canonical v1 datetime verification');
  r3 = replaceOnce(r3, oldResultTransport, newResultTransport, 'selected-row datetime transport label');

  r4 = r4.replace('TM_FIX_PACK_R4_5_20260915', 'TM_FIX_PACK_R4_6_20260915');

  fs.writeFileSync(piPath, pi);
  fs.writeFileSync(r3Path, r3);
  fs.writeFileSync(r4Path, r4);

  [piPath, r3Path, r4Path].forEach(f => run(process.execPath, ['--check', f], repoRoot));

  const changed = [targetPI, targetR3, targetR4];
  const untouched = preNames.filter(n => !changed.includes(n));
  assertExactHashes(preHashes, hashMap(workSrc, untouched), untouched, 'WORK preservation');

  console.log('=== R4.6 4/8 freshness clone ===');
  clasp(['clone', scriptId, '--rootDir', 'src'], freshRoot);
  const freshSrc = path.join(freshRoot, 'src');
  const freshNames = listFiles(freshSrc);
  if (JSON.stringify(freshNames) !== JSON.stringify(preNames)) throw new Error('Freshness file set changed');
  assertExactHashes(preHashes, hashMap(freshSrc, preNames), preNames, 'freshness guard');

  console.log('=== R4.6 5/8 push ===');
  clasp(['push', '--force'], workRoot);
  pushed = true;

  console.log('=== R4.6 6/8 POST clone ===');
  clasp(['clone', scriptId, '--rootDir', 'src'], postRoot);
  const postSrc = path.join(postRoot, 'src');
  const postNames = listFiles(postSrc);
  if (JSON.stringify(postNames) !== JSON.stringify(preNames)) throw new Error('POST file set changed');
  const postHashes = hashMap(postSrc, postNames);
  assertExactHashes(preHashes, postHashes, untouched, 'POST untouched preservation');
  [targetPI, targetR3, targetR4].forEach(n => run(process.execPath, ['--check', path.join(postSrc, n)], repoRoot));

  console.log('=== R4.6 7/8 verify contracts ===');
  const postPI = fs.readFileSync(path.join(postSrc, targetPI), 'utf8');
  const postR3 = fs.readFileSync(path.join(postSrc, targetR3), 'utf8');
  const postR4 = fs.readFileSync(path.join(postSrc, targetR4), 'utf8');

  [
    'preinspectR46GetCanonicalV1Schedule_',
    'V1_DESIRED_START_END',
    "parts.push('V1_DATES')"
  ].forEach(marker => { if (!postPI.includes(marker)) throw new Error('POST PI missing R4.6 marker ' + marker); });

  [
    'TM_SELECTED_ROW_E2E_R3_4_20260915',
    'DATE_TIME_CANONICAL_V1_VERIFIED',
    'NOT_NEEDED_CANONICAL_V1_MATCH',
    'CANONICAL_V1_DESIRED_DATES_WITH_V2_PATCH_FALLBACK'
  ].forEach(marker => { if (!postR3.includes(marker)) throw new Error('POST R3 missing R4.6 marker ' + marker); });

  if (!postR4.includes('TM_FIX_PACK_R4_6_20260915')) throw new Error('POST R4 missing R4.6 version marker');
  if (!postPI.includes('tmR45AssertPreInspectDateTimePatchSafe_')) throw new Error('POST PI lost R4.5 PM quarantine hook');

  evidence.status = 'DEPLOYED_SOURCE_VERIFIED';
  evidence.completedAt = new Date().toISOString();
  evidence.preFileCount = preNames.length;
  evidence.postFileCount = postNames.length;
  evidence.modifiedExistingFiles = changed;
  evidence.behavior = {
    canonicalScheduleSource: 'v1 DesiredStartDate/DesiredEndDate when v2 disagrees with Calendar',
    apiLoadControl: 'v1 extra GET only on v2 schedule mismatch',
    pmPatchQuarantinePreserved: true,
    nextRuntimeTest: 'Task 18476 selected row; expected NO schedule write and final NO_ACTION'
  };
  fs.writeFileSync(evidencePath, JSON.stringify(evidence, null, 2));

  console.log('=== R4.6 8/8 complete ===');
  console.log('DEPLOYED_SOURCE_VERIFIED');
} catch (err) {
  evidence.status = 'FAILED';
  evidence.error = String(err && err.stack ? err.stack : err);
  evidence.failedAt = new Date().toISOString();
  fs.writeFileSync(evidencePath, JSON.stringify(evidence, null, 2));

  if (pushed) {
    try {
      console.error('Attempting automatic rollback to PRE source...');
      clasp(['push', '--force'], preRoot);
      evidence.rollback = 'PRE_PUSH_ATTEMPTED';
      fs.writeFileSync(evidencePath, JSON.stringify(evidence, null, 2));
    } catch (rb) {
      evidence.rollback = 'FAILED: ' + String(rb && rb.stack ? rb.stack : rb);
      fs.writeFileSync(evidencePath, JSON.stringify(evidence, null, 2));
    }
  }
  throw err;
}

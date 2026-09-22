#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const cp = require('child_process');

const SCRIPT_ID = '1E86mhD2dZcOFpqWnCvoIpwEkwZ0MA63MgM8DifV6WyB2FvVQkRWKIZ_m';
const CLASP_VERSION = '3.3.0';
const RELEASE = 'TASK_MAPPING_STANDARDIZATION_R1_20260922';
const MODULE_SOURCE = 'patches/task-mapping/99_Task_Mapping_Standardization_R1.js';
const MODULE_TARGET = '99_Task_Mapping_Standardization_R1.js';
const OUTPUT = path.resolve('task-mapping-standardization-r1-output');

fs.mkdirSync(OUTPUT, { recursive: true });

function run(cmd, args, cwd) {
  const r = cp.spawnSync(cmd, args, {
    cwd: cwd || process.cwd(),
    env: process.env,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  });
  process.stdout.write(r.stdout || '');
  process.stderr.write(r.stderr || '');
  if (r.error) throw r.error;
  if (r.status !== 0) throw new Error(cmd + ' ' + args.join(' ') + ' failed with exit ' + r.status);
  return r.stdout || '';
}

function clasp(args, cwd) {
  return run('npx', ['-y', '@google/clasp@' + CLASP_VERSION].concat(args), cwd);
}

function sha(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function fileNames(dir) {
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter(function(e) { return e.isFile(); })
    .map(function(e) { return e.name; })
    .sort();
}

function hashMap(dir, names) {
  const out = {};
  names.forEach(function(name) { out[name] = sha(path.join(dir, name)); });
  return out;
}

function copyDir(src, dst) {
  fs.cpSync(src, dst, { recursive: true });
}

function assertHashes(expected, actual, names, label) {
  const bad = [];
  names.forEach(function(name) {
    if (expected[name] !== actual[name]) bad.push(name);
  });
  if (bad.length) throw new Error(label + ': hash mismatch: ' + bad.join(', '));
}

function sourceFiles(dir) {
  return fileNames(dir).filter(function(name) { return /\.(?:js|gs)$/i.test(name); });
}

function findUniqueFileContaining(dir, marker) {
  const matches = sourceFiles(dir).filter(function(name) {
    return fs.readFileSync(path.join(dir, name), 'utf8').indexOf(marker) >= 0;
  });
  if (matches.length !== 1) {
    throw new Error('Expected exactly one live source file containing [' + marker + '], found ' + matches.length + ': ' + matches.join(', '));
  }
  return matches[0];
}

function replaceUnique(text, before, after, label) {
  const first = text.indexOf(before);
  if (first < 0) throw new Error(label + ': anchor not found');
  if (text.indexOf(before, first + before.length) >= 0) throw new Error(label + ': anchor is not unique');
  return text.slice(0, first) + after + text.slice(first + before.length);
}

function replaceRegexUnique(text, regex, replacement, label) {
  const flags = regex.flags.indexOf('g') >= 0 ? regex.flags : regex.flags + 'g';
  const global = new RegExp(regex.source, flags);
  const matches = text.match(global) || [];
  if (matches.length !== 1) throw new Error(label + ': expected one regex match, found ' + matches.length);
  return text.replace(global, replacement);
}

function functionRange(text, functionName) {
  const marker = 'function ' + functionName + '(';
  const start = text.indexOf(marker);
  if (start < 0) throw new Error('Function not found: ' + functionName);
  if (text.indexOf(marker, start + marker.length) >= 0) throw new Error('Function marker not unique: ' + functionName);
  const open = text.indexOf('{', start);
  let depth = 0, quote = null, escaped = false, lineComment = false, blockComment = false;
  for (let i = open; i < text.length; i++) {
    const c = text[i], n = text[i + 1];
    if (lineComment) { if (c === '\n') lineComment = false; continue; }
    if (blockComment) { if (c === '*' && n === '/') { blockComment = false; i++; } continue; }
    if (quote) {
      if (escaped) { escaped = false; continue; }
      if (c === '\\') { escaped = true; continue; }
      if (c === quote) quote = null;
      continue;
    }
    if (c === '/' && n === '/') { lineComment = true; i++; continue; }
    if (c === '/' && n === '*') { blockComment = true; i++; continue; }
    if (c === "'" || c === '"' || c.charCodeAt(0) === 96) { quote = c; continue; }
    if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return { start: start, end: i + 1 };
  }
  throw new Error('Function end not found: ' + functionName);
}

function patchFunctionInFile(dir, functionName, patcher, changed) {
  const file = findUniqueFileContaining(dir, 'function ' + functionName + '(');
  const full = path.join(dir, file);
  let text = fs.readFileSync(full, 'utf8');
  const range = functionRange(text, functionName);
  const oldFn = text.slice(range.start, range.end);
  const newFn = patcher(oldFn);
  if (newFn === oldFn) throw new Error('No change produced for function ' + functionName);
  text = text.slice(0, range.start) + newFn + text.slice(range.end);
  fs.writeFileSync(full, text);
  changed[file] = true;
  return file;
}

function replaceWholeFunctionInFile(dir, functionName, replacement, changed) {
  return patchFunctionInFile(dir, functionName, function() { return replacement.trim(); }, changed);
}

const FN_STL_BUILD = [
"function stlBuildManagedLinksBlockHtml_(data) {",
"  data = data || {};",
"  return tmStdBuildCanonicalCalendarLinksBlock_({",
"    division: data.division,",
"    tasks: [{ id: data.taskId, url: data.taskUrl }],",
"    salesOrder: data.salesOrderUrl ? { number: data.salesOrderNumber || '', url: data.salesOrderUrl } : null",
"  });",
"}"
].join('\n');

const FN_STL_REMOVE = [
"function stlRemoveManagedLinksBlock_(description) {",
"  return tmStdRemoveManagedCalendarLinks_(description);",
"}"
].join('\n');

const FN_STL_SELECTED = [
"function stlRunSelectedMappingRow_(dryRun) {",
"  const data = stlGetSelectedRowData_();",
"  const result = stlPushCalendarLinksForResolvedRowData_(data, !!dryRun);",
"  Logger.log(JSON.stringify(result, null, 2));",
"  return result;",
"}"
].join('\n');

const FN_STL_PUSH = [
"function stlPushCalendarLinksForResolvedRowData_(data, dryRun) {",
"  const eventResult = stlFindCalendarEventForRow_(data);",
"  if (!eventResult || !eventResult.event) {",
"    throw new Error('Calendar event not found. Division=' + data.division + ', Event ID=' + data.eventId);",
"  }",
"  const currentDescription = String(eventResult.event.getDescription() || '');",
"  stlHydrateMissingLinksFromCalendarDescription_(data, currentDescription);",
"  stlValidateResolvedLinkData_(data);",
"  const division = tmStdNormalizeDivision_(data.division);",
"  const salesOrder = division === 'Install' ? null : (data.salesOrderUrl ? {",
"    number: data.salesOrderNumber || '',",
"    url: data.salesOrderUrl",
"  } : null);",
"  const result = tmStdWriteCanonicalCalendarLinks_(",
"    division,",
"    data.eventId,",
"    [{ id: data.taskId, url: data.taskUrl }],",
"    salesOrder,",
"    !!dryRun",
"  );",
"  result.sheetName = data.sheetName;",
"  result.rowNumber = data.rowNumber;",
"  result.taskId = data.taskId;",
"  return result;",
"}"
].join('\n');

const FN_ALL_LINKS = [
"function tmR4_runAllCalendarLinkPipelines_(dryRun) {",
"  const install = stlRunCalendarLinkPipelineStageForDivision_('INSTALL', !!dryRun);",
"  const delivery = stlRunCalendarLinkPipelineStageForDivision_('DELIVERY', !!dryRun);",
"  const service = tmR4_runServiceCalendarLinkPipeline_(!!dryRun, 0);",
"  const preinspection = tmStdRunPreInspectCalendarLinkPipeline_(!!dryRun);",
"  const presentation = dryRun ? null : tmStdRefreshAllPresentation_();",
"  return {",
"    mode: dryRun ? 'DRY_RUN' : 'PUSH',",
"    status: 'COMPLETE',",
"    install: install,",
"    delivery: delivery,",
"    service: service,",
"    preinspection: preinspection,",
"    presentation: presentation",
"  };",
"}"
].join('\n');

const FN_SERVICE_APPLY = [
"function tmR4_applyServiceEventLinkModel_(model, dryRun) {",
"  if (!model || !model.eligible) {",
"    return { status: 'REVIEW', eventId: model && model.eventId, reason: model && model.reason, writeCount: 0 };",
"  }",
"  let salesOrder = null;",
"  if (model.salesOrderNumber) {",
"    const salesOrderUrl = tmStdResolveSalesOrderUrlFromCalendarMirror_('Service', model.eventId, model.salesOrderNumber);",
"    if (!salesOrderUrl) {",
"      return {",
"        status: 'REVIEW',",
"        eventId: model.eventId,",
"        taskIds: model.taskIds || [],",
"        salesOrderNumber: model.salesOrderNumber,",
"        writeCount: 0,",
"        reason: 'Service Sales Order internal URL could not be resolved from the Calendar mirror. Refusing to guess from the Sales Order number.'",
"      };",
"    }",
"    salesOrder = { number: model.salesOrderNumber, url: salesOrderUrl };",
"  }",
"  const result = tmStdWriteCanonicalCalendarLinks_(",
"    'Service',",
"    model.eventId,",
"    (model.taskIds || []).map(function(taskId) { return { id: taskId }; }),",
"    salesOrder,",
"    !!dryRun",
"  );",
"  result.taskIds = model.taskIds || [];",
"  result.salesOrderNumber = model.salesOrderNumber || '';",
"  return result;",
"}"
].join('\n');

const FN_PI_SELECTED = [
"function pushSelectedPreInspectTaskLinkToCalendarEvent() {",
"  const ss = SpreadsheetApp.getActiveSpreadsheet();",
"  const sheet = ss && ss.getActiveSheet();",
"  if (!sheet || sheet.getName() !== 'PreInspect Task Mapping') {",
"    throw new Error('Select a row in PreInspect Task Mapping first.');",
"  }",
"  const headerRow = tmStdFindMappingHeaderRow_(sheet);",
"  const rowNumber = sheet.getActiveRange().getRow();",
"  if (!headerRow || rowNumber <= headerRow) throw new Error('Select a PreInspect data row.');",
"  const headers = sheet.getRange(headerRow, 1, 1, sheet.getLastColumn()).getDisplayValues()[0];",
"  const values = sheet.getRange(rowNumber, 1, 1, sheet.getLastColumn()).getDisplayValues()[0];",
"  const row = tmStdRowObject_(headers, values);",
"  return preinspectAppendTaskLinkToCalendarEvent_(row['Event ID'], row['Task ID'], row['Calendar Title']);",
"}"
].join('\n');

const FN_PI_APPEND = [
"function preinspectAppendTaskLinkToCalendarEvent_(eventId, taskId, taskTitle) {",
"  const id = tmStdPositiveNumber_(taskId);",
"  if (!id) return { mode: 'PREINSPECT_CALENDAR_TASK_LINK', status: 'REVIEW', writesPerformed: false, calendarWritesPerformed: false, reason: 'Task ID is blank.' };",
"  const result = tmStdWriteCanonicalCalendarLinks_('PreInspection', eventId, [{ id: id }], null, false);",
"  result.mode = 'PREINSPECT_CALENDAR_TASK_LINK';",
"  result.writesPerformed = Number(result.writeCount || 0) > 0;",
"  result.calendarWritesPerformed = result.writesPerformed;",
"  return result;",
"}"
].join('\n');

const FN_PI_BUILD_BLOCK = [
"function preinspectBuildManagedTaskLinkBlock_(taskId, taskTitle) {",
"  return tmStdBuildCanonicalCalendarLinksBlock_({",
"    division: 'PreInspection',",
"    tasks: [{ id: taskId }],",
"    salesOrder: null",
"  });",
"}"
].join('\n');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tm-standardization-r1-'));
const preRoot = path.join(tmp, 'PRE');
const freshRoot = path.join(tmp, 'FRESH');
const workRoot = path.join(tmp, 'WORK');
const postRoot = path.join(tmp, 'POST');
[preRoot, freshRoot, workRoot, postRoot].forEach(function(d) { fs.mkdirSync(d, { recursive: true }); });

const evidence = {
  schemaVersion: 1,
  release: RELEASE,
  scriptId: SCRIPT_ID,
  startedAt: new Date().toISOString(),
  status: 'STARTED',
  calendarWritesPerformedByDeployment: false,
  strivenWritesPerformedByDeployment: false
};
const evidencePath = path.join(OUTPUT, 'evidence.json');
let pushed = false;

try {
  console.log('=== R1 1/9 authorize ===');
  clasp(['show-authorized-user', '--json'], process.cwd());

  console.log('=== R1 2/9 PRE clone ===');
  clasp(['clone', SCRIPT_ID, '--rootDir', 'src'], preRoot);
  const preSrc = path.join(preRoot, 'src');
  const preNames = fileNames(preSrc);
  if (preNames.length < 55) throw new Error('Unexpected live file count ' + preNames.length + '; refusing to patch an unfamiliar project.');
  if (preNames.indexOf(MODULE_TARGET) >= 0) throw new Error('Live project already contains ' + MODULE_TARGET + '; refusing duplicate install.');
  const preHashes = hashMap(preSrc, preNames);
  copyDir(preRoot, path.join(OUTPUT, 'PRE_SOURCE'));

  [
    'const INSTALL_OPTION_B_VISIBLE_COLUMN_COUNT = 18;',
    'const PREINSPECT_MAP_VISIBLE_COLUMN_COUNT = 15;',
    'function stlBuildManagedLinksBlockHtml_(',
    'function tmR4_runAllCalendarLinkPipelines_(',
    'function tmR4_applyServiceEventLinkModel_(',
    'function pushSelectedPreInspectTaskLinkToCalendarEvent()'
  ].forEach(function(marker) { findUniqueFileContaining(preSrc, marker); });

  console.log('=== R1 3/9 build guarded WORK ===');
  copyDir(preRoot, workRoot);
  const workSrc = path.join(workRoot, 'src');
  const changed = {};

  const moduleRepoPath = path.resolve(MODULE_SOURCE);
  if (!fs.existsSync(moduleRepoPath)) throw new Error('Candidate module missing: ' + MODULE_SOURCE);
  run(process.execPath, ['--check', moduleRepoPath], process.cwd());
  fs.copyFileSync(moduleRepoPath, path.join(workSrc, MODULE_TARGET));
  changed[MODULE_TARGET] = true;

  let file = findUniqueFileContaining(workSrc, 'const INSTALL_OPTION_B_VISIBLE_COLUMN_COUNT = 18;');
  let full = path.join(workSrc, file);
  let text = fs.readFileSync(full, 'utf8');
  text = replaceUnique(text, 'const INSTALL_OPTION_B_VISIBLE_COLUMN_COUNT = 18;', 'const INSTALL_OPTION_B_VISIBLE_COLUMN_COUNT = 19;', 'Install visible column count');
  text = replaceRegexUnique(
    text,
    /'Last Push Detail',\s*\n\s*\/\/ Hidden source \/ audit columns/,
    "'Last Push Detail',\n  'Data',\n\n  // Hidden source / audit columns",
    'Install Data header'
  );
  fs.writeFileSync(full, text);
  changed[file] = true;

  patchFunctionInFile(workSrc, 'buildInstallTaskMappingFromSheets', function(fn) {
    fn = replaceUnique(
      fn,
      "  const output = calendarObjects.map(function(calendarRow, index) {\n    return installMapCalendarRowToTask_(calendarRow, indexes, index + 2);\n  });",
      "  const output = calendarObjects.map(function(calendarRow, index) {\n    return installMapCalendarRowToTask_(calendarRow, indexes, index + 2);\n  });\n\n  output.forEach(function(row, index) {\n    if (!row || row.length !== INSTALL_OPTION_B_HEADERS.length - 1) {\n      throw new Error('Install mapping row width changed before Standardization R1. Row index ' + index + ' has ' + (row ? row.length : 0) + ' columns.');\n    }\n    row.splice(18, 0, '');\n  });",
      'Install output Data slot'
    );
    return replaceUnique(
      fn,
      '  installApplyMappingFormatting_(mappingSheet);',
      "  installApplyMappingFormatting_(mappingSheet);\n  tmStdNormalizeCalendarMirrorTaskLinks_('Install');\n  tmStdPopulateMappingChecklist_('Install');",
      'Install presentation hook'
    );
  }, changed);

  file = findUniqueFileContaining(workSrc, 'const PREINSPECT_MAP_VISIBLE_COLUMN_COUNT = 15;');
  full = path.join(workSrc, file);
  text = fs.readFileSync(full, 'utf8');
  text = replaceUnique(text, 'const PREINSPECT_MAP_VISIBLE_COLUMN_COUNT = 15;', 'const PREINSPECT_MAP_VISIBLE_COLUMN_COUNT = 16;', 'PreInspect visible column count');
  text = replaceRegexUnique(
    text,
    /'Notes',\s*\n\s*\/\/ Hidden technical \/ audit columns/,
    "'Notes',\n  'Data',\n\n  // Hidden technical / audit columns",
    'PreInspect Data header'
  );
  fs.writeFileSync(full, text);
  changed[file] = true;

  patchFunctionInFile(workSrc, 'buildPreInspectTaskMapping', function(fn) {
    return replaceUnique(
      fn,
      '  preinspectWriteMappingObjects_(mappingSheet, objects);',
      "  preinspectWriteMappingObjects_(mappingSheet, objects);\n  tmStdNormalizeCalendarMirrorTaskLinks_('PreInspection');\n  tmStdPopulateMappingChecklist_('PreInspection');",
      'PreInspect presentation hook'
    );
  }, changed);

  patchFunctionInFile(workSrc, 'buildDeliveryTaskMappingFromSheets', function(fn) {
    return replaceUnique(
      fn,
      '  deliveryApplyMappingFormatting_(mappingSheet);',
      "  deliveryApplyMappingFormatting_(mappingSheet);\n  tmStdNormalizeCalendarMirrorTaskLinks_('Delivery');\n  tmStdPopulateMappingChecklist_('Delivery');",
      'Delivery presentation hook'
    );
  }, changed);

  patchFunctionInFile(workSrc, 'buildServiceTaskMappingFromSheets', function(fn) {
    return replaceUnique(
      fn,
      '  serviceApplyMappingFormatting_(mappingSheet);',
      "  serviceApplyMappingFormatting_(mappingSheet);\n  tmStdNormalizeCalendarMirrorTaskLinks_('Service');\n  tmStdPopulateMappingChecklist_('Service');",
      'Service presentation hook'
    );
  }, changed);

  replaceWholeFunctionInFile(workSrc, 'stlBuildManagedLinksBlockHtml_', FN_STL_BUILD, changed);
  replaceWholeFunctionInFile(workSrc, 'stlRemoveManagedLinksBlock_', FN_STL_REMOVE, changed);
  replaceWholeFunctionInFile(workSrc, 'stlRunSelectedMappingRow_', FN_STL_SELECTED, changed);
  replaceWholeFunctionInFile(workSrc, 'stlPushCalendarLinksForResolvedRowData_', FN_STL_PUSH, changed);
  replaceWholeFunctionInFile(workSrc, 'tmR4_runAllCalendarLinkPipelines_', FN_ALL_LINKS, changed);
  replaceWholeFunctionInFile(workSrc, 'tmR4_applyServiceEventLinkModel_', FN_SERVICE_APPLY, changed);
  replaceWholeFunctionInFile(workSrc, 'pushSelectedPreInspectTaskLinkToCalendarEvent', FN_PI_SELECTED, changed);
  replaceWholeFunctionInFile(workSrc, 'preinspectAppendTaskLinkToCalendarEvent_', FN_PI_APPEND, changed);
  replaceWholeFunctionInFile(workSrc, 'preinspectBuildManagedTaskLinkBlock_', FN_PI_BUILD_BLOCK, changed);

  patchFunctionInFile(workSrc, 'tmSelectedRowE2ER3RunExistingOpenPreInspection_', function(fn) {
    return replaceRegexUnique(
      fn,
      /record\('CALENDAR_TASK_LINK',\s*\{\s*status:\s*'DISABLED_BY_POLICY',\s*writesPerformed:\s*false,\s*calendarWritesPerformed:\s*false,\s*reason:\s*'Calendar Task Link write disabled by operator policy on 2026-09-16\.'\s*\}\);/,
      "record('CALENDAR_TASK_LINK', preinspectAppendTaskLinkToCalendarEvent_(ctx.eventId, reviewedTaskId, ''));",
      'PreInspect selected-row Calendar link activation'
    );
  }, changed);

  const changedNames = Object.keys(changed).sort();
  changedNames.forEach(function(name) {
    run(process.execPath, ['--check', path.join(workSrc, name)], process.cwd());
  });

  const workMarker = fs.readFileSync(path.join(workSrc, MODULE_TARGET), 'utf8');
  [
    'TASK_MAPPING_STANDARDIZATION_R1_20260922',
    'Calendar Task Link',
    'tmStdRunPreInspectCalendarLinkPipeline_',
    'runTaskMappingStandardizationR1'
  ].forEach(function(marker) {
    if (workMarker.indexOf(marker) < 0) throw new Error('Candidate module missing marker: ' + marker);
  });

  const untouched = preNames.filter(function(name) { return !changed[name]; });
  assertHashes(preHashes, hashMap(workSrc, untouched), untouched, 'WORK untouched preservation');

  console.log('=== R1 4/9 freshness clone ===');
  clasp(['clone', SCRIPT_ID, '--rootDir', 'src'], freshRoot);
  const freshSrc = path.join(freshRoot, 'src');
  const freshNames = fileNames(freshSrc);
  if (JSON.stringify(freshNames) !== JSON.stringify(preNames)) throw new Error('Freshness file set changed before push.');
  assertHashes(preHashes, hashMap(freshSrc, preNames), preNames, 'freshness guard');

  console.log('=== R1 5/9 push ===');
  clasp(['push', '--force'], workRoot);
  pushed = true;

  console.log('=== R1 6/9 POST clone ===');
  clasp(['clone', SCRIPT_ID, '--rootDir', 'src'], postRoot);
  const postSrc = path.join(postRoot, 'src');
  const postNames = fileNames(postSrc);
  const expectedPost = preNames.concat([MODULE_TARGET]).sort();
  if (JSON.stringify(postNames) !== JSON.stringify(expectedPost)) {
    throw new Error('POST file set differs from expected PRE + Standardization module.');
  }

  console.log('=== R1 7/9 verify hashes + markers ===');
  const postHashes = hashMap(postSrc, postNames);
  assertHashes(preHashes, postHashes, untouched, 'POST untouched preservation');
  const workHashes = hashMap(workSrc, changedNames);
  assertHashes(workHashes, postHashes, changedNames, 'POST changed-file parity');
  changedNames.forEach(function(name) {
    run(process.execPath, ['--check', path.join(postSrc, name)], process.cwd());
  });

  const postModule = fs.readFileSync(path.join(postSrc, MODULE_TARGET), 'utf8');
  if (postModule.indexOf('TASK_MAPPING_STANDARDIZATION_R1_20260922') < 0) throw new Error('POST standardization marker missing.');

  const postAll = postNames.map(function(name) { return fs.readFileSync(path.join(postSrc, name), 'utf8'); }).join('\n');
  if (postAll.indexOf('tmStdRunPreInspectCalendarLinkPipeline_') < 0) throw new Error('POST All Divisions PreInspection Calendar-link wiring missing.');
  if (postAll.indexOf('const INSTALL_OPTION_B_VISIBLE_COLUMN_COUNT = 19;') < 0) throw new Error('POST Install Data schema missing.');
  if (postAll.indexOf('const PREINSPECT_MAP_VISIBLE_COLUMN_COUNT = 16;') < 0) throw new Error('POST PreInspect Data schema missing.');

  console.log('=== R1 8/9 record evidence ===');
  evidence.status = 'DEPLOYED_SOURCE_VERIFIED';
  evidence.completedAt = new Date().toISOString();
  evidence.preFileCount = preNames.length;
  evidence.postFileCount = postNames.length;
  evidence.changedFiles = changedNames;
  evidence.untouchedFileCount = untouched.length;
  evidence.rollback = 'NOT_REQUIRED';
  evidence.runtimeVerification = 'SOURCE_VERIFIED; workbook presentation/runtime normalization follows on the normal refresh/link pipeline or explicit runTaskMappingStandardizationR1().';
  fs.writeFileSync(evidencePath, JSON.stringify(evidence, null, 2));

  console.log('=== R1 9/9 complete ===');
  console.log('DEPLOYED_SOURCE_VERIFIED');
} catch (err) {
  evidence.status = 'FAILED';
  evidence.failedAt = new Date().toISOString();
  evidence.error = String(err && err.stack ? err.stack : err);
  if (pushed) {
    try {
      console.error('POST verification failed after push; rolling back exact PRE source...');
      clasp(['push', '--force'], preRoot);
      evidence.rollback = 'ROLLBACK_PUSH_COMPLETED';
    } catch (rollbackErr) {
      evidence.rollback = 'ROLLBACK_FAILED';
      evidence.rollbackError = String(rollbackErr && rollbackErr.stack ? rollbackErr.stack : rollbackErr);
    }
  } else {
    evidence.rollback = 'NOT_NEEDED_NO_PUSH_COMPLETED';
  }
  fs.writeFileSync(evidencePath, JSON.stringify(evidence, null, 2));
  throw err;
}

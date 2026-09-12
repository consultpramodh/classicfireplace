function tm2_nowIso_() {
  return new Date().toISOString();
}

function tm2_clean_(value) {
  return value === null || value === undefined ? '' : String(value).trim();
}

function tm2_upper_(value) {
  return tm2_clean_(value).toUpperCase();
}

function tm2_truthyYes_(value) {
  return ['YES', 'TRUE', 'Y', '1'].indexOf(tm2_upper_(value)) !== -1;
}

function tm2_safeJson_(value) {
  try {
    return JSON.stringify(value);
  } catch (err) {
    return JSON.stringify({ serializationError: String(err && err.message || err) });
  }
}

function tm2_log_(stage, payload) {
  const row = {
    tm2Version: TM2_VERSION,
    mode: TM2_MODE.name,
    stage: stage,
    at: tm2_nowIso_(),
    payload: payload || null
  };
  Logger.log(tm2_safeJson_(row));
  return row;
}

function tm2_assertShadowSafe_() {
  if (TM2_MODE.writeEnabled ||
      TM2_MODE.createRecreateEnabled ||
      TM2_MODE.calendarWriteEnabled ||
      TM2_MODE.triggerInstallEnabled) {
    throw new Error('TM2 shadow safety gate failed: write-capable flags must all be false.');
  }
  return true;
}

function tm2_headerMap_(headers) {
  const out = {};
  (headers || []).forEach(function(h, i) {
    const key = tm2_clean_(h);
    if (key && out[key] === undefined) out[key] = i;
  });
  return out;
}

function tm2_pick_(row, map, aliases) {
  for (let i = 0; i < aliases.length; i++) {
    const idx = map[aliases[i]];
    if (idx !== undefined) return row[idx];
  }
  return '';
}

function tm2_hasFunction_(name) {
  try {
    return typeof globalThis[name] === 'function';
  } catch (err) {
    return false;
  }
}

function tm2_testEvidenceHeaders_() {
  return [
    'Timestamp',
    'Run ID',
    'TM2 Version',
    'Function',
    'Workflow',
    'Mode',
    'Execution Status',
    'Rows Inspected',
    'Endpoint Counts',
    'Business Write Attempts',
    'Cutover Flags',
    'Sheet Checks',
    'Capabilities / Details',
    'Error'
  ];
}

function tm2_sanitizeEvidenceText_(value) {
  let text = tm2_clean_(value);
  if (!text) return '';
  text = text.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[REDACTED_EMAIL]');
  text = text.replace(/\b\d{7,}\b/g, '[REDACTED_LONG_NUMBER]');
  if (text.length > 1500) text = text.substring(0, 1500) + '…';
  return text;
}

function tm2_compactSheetChecks_(workflowSheets) {
  if (!workflowSheets) return '';
  const out = {};
  Object.keys(workflowSheets).forEach(function(name) {
    const item = workflowSheets[name] || {};
    out[name] = {
      mappingSheet: tm2_clean_(item.mappingSheet),
      present: !!item.present,
      lastRow: item.lastRow === null || item.lastRow === undefined ? null : Number(item.lastRow),
      lastColumn: item.lastColumn === null || item.lastColumn === undefined ? null : Number(item.lastColumn)
    };
  });
  return tm2_safeJson_(out);
}

function tm2_compactEvidenceDetails_(result) {
  if (!result) return '';
  const details = {};
  if (result.tm2Functions) details.tm2Functions = result.tm2Functions;
  if (result.legacyEntrypointsObserved) details.legacyEntrypointsObserved = result.legacyEntrypointsObserved;
  if (result.reportCapabilities) details.reportCapabilities = result.reportCapabilities;
  if (result.sourceSheet) details.sourceSheet = result.sourceSheet;
  if (result.sourceTruncated !== undefined) details.sourceTruncated = !!result.sourceTruncated;
  if (result.workflow) details.workflow = result.workflow;
  return tm2_safeJson_(details);
}

function tm2_getOrCreateTestEvidenceSheet_() {
  if (!TM2_TEST_EVIDENCE || !TM2_TEST_EVIDENCE.enabled) return null;

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('TM2 test evidence logging requires an active spreadsheet.');

  const headers = tm2_testEvidenceHeaders_();
  let sheet = ss.getSheetByName(TM2_TEST_EVIDENCE.sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(TM2_TEST_EVIDENCE.sheetName);
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
  } else {
    const existing = sheet.getRange(1, 1, 1, headers.length).getDisplayValues()[0];
    const blank = existing.every(function(v) { return !tm2_clean_(v); });
    if (blank) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.setFrozenRows(1);
    } else {
      for (let i = 0; i < headers.length; i++) {
        if (tm2_clean_(existing[i]) !== headers[i]) {
          throw new Error('TM2 Test Log header mismatch at column ' + (i + 1) + '.');
        }
      }
    }
  }

  if (TM2_TEST_EVIDENCE.hideSheet && !sheet.isSheetHidden()) {
    sheet.hideSheet();
  }
  return sheet;
}

function tm2_recordTestEvidence_(functionName, workflow, result, error) {
  if (!TM2_TEST_EVIDENCE || !TM2_TEST_EVIDENCE.enabled) return false;

  try {
    const sheet = tm2_getOrCreateTestEvidenceSheet_();
    if (!sheet) return false;

    const runId = Utilities.getUuid();
    const endpointCounts = result && result.endpointCounts ? tm2_safeJson_(result.endpointCounts) : '';
    const cutover = result && (result.cutoverFlags || result.cutover) ?
      tm2_safeJson_(result.cutoverFlags || result.cutover) : tm2_safeJson_(TM2_CUTOVER);
    const sheetChecks = result && result.workflowSheets ? tm2_compactSheetChecks_(result.workflowSheets) : '';
    const details = tm2_compactEvidenceDetails_(result);
    const rowsInspected = result && result.rowsInspected !== undefined ? Number(result.rowsInspected) : '';
    const writeAttempts = result && result.writeAttempts !== undefined ? Number(result.writeAttempts) : 0;
    const executionStatus = error ? 'ERROR' : 'PASS';
    const errorText = error ? tm2_sanitizeEvidenceText_(error && (error.stack || error.message || error)) : '';

    sheet.appendRow([
      tm2_nowIso_(),
      runId,
      TM2_VERSION,
      tm2_clean_(functionName),
      tm2_clean_(workflow || 'Shared'),
      TM2_MODE.name,
      executionStatus,
      rowsInspected,
      endpointCounts,
      writeAttempts,
      cutover,
      sheetChecks,
      tm2_sanitizeEvidenceText_(details),
      errorText
    ]);

    const maxRows = Number(TM2_TEST_EVIDENCE.maxDataRows || 0);
    if (maxRows > 0 && sheet.getLastRow() > maxRows + 1) {
      const excess = sheet.getLastRow() - (maxRows + 1);
      if (excess > 0) sheet.deleteRows(2, excess);
    }

    tm2_log_('TEST_EVIDENCE_RECORDED', {
      functionName: tm2_clean_(functionName),
      workflow: tm2_clean_(workflow || 'Shared'),
      executionStatus: executionStatus,
      evidenceRunId: runId
    });
    return true;
  } catch (evidenceErr) {
    Logger.log(tm2_safeJson_({
      tm2Version: TM2_VERSION,
      mode: TM2_MODE.name,
      stage: 'TEST_EVIDENCE_WRITE_FAILED',
      at: tm2_nowIso_(),
      error: tm2_sanitizeEvidenceText_(evidenceErr && (evidenceErr.stack || evidenceErr.message || evidenceErr))
    }));
    return false;
  }
}

function tm2_runWithEvidence_(functionName, workflow, callback) {
  const startedAt = new Date();
  try {
    const result = callback();
    if (result && typeof result === 'object') {
      result.evidenceRecorded = tm2_recordTestEvidence_(functionName, workflow, result, null);
      result.durationMs = new Date().getTime() - startedAt.getTime();
    } else {
      tm2_recordTestEvidence_(functionName, workflow, { writeAttempts: 0 }, null);
    }
    return result;
  } catch (err) {
    tm2_recordTestEvidence_(functionName, workflow, { writeAttempts: 0 }, err);
    throw err;
  }
}

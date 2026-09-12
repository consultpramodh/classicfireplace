function tm2_detectMappingHeaderRow_(sheet) {
  const scanRows = Math.min(Math.max(sheet.getLastRow(), 1), 10);
  const lastCol = sheet.getLastColumn();
  if (lastCol < 1) return null;

  const rows = sheet.getRange(1, 1, scanRows, lastCol).getDisplayValues();
  const signatures = [
    'Event ID', 'Calendar Event ID', 'Task ID', 'Task Id',
    'Mapping Status', 'Task Status', 'Date', 'Time'
  ];

  let bestRow = null;
  let bestScore = 0;

  for (let r = 0; r < rows.length; r++) {
    const values = rows[r].map(function(v) { return tm2_clean_(v); });
    let score = 0;
    signatures.forEach(function(sig) {
      if (values.indexOf(sig) !== -1) score++;
    });
    if (score > bestScore) {
      bestScore = score;
      bestRow = r + 1;
    }
  }

  return bestScore >= 2 ? bestRow : null;
}

function tm2_readMappingProjection_(workflow, maxRows) {
  tm2_assertShadowSafe_();
  const profile = tm2_getWorkflowProfile_(workflow);
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(profile.mappingSheet);

  if (!sheet) {
    return {
      workflow: workflow,
      status: TM2_ENDPOINT.BLOCKED,
      reason: 'MAPPING_SHEET_NOT_FOUND',
      sheetName: profile.mappingSheet,
      rows: []
    };
  }

  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  if (lastRow < 1 || lastCol < 1) {
    return {
      workflow: workflow,
      status: TM2_ENDPOINT.SHADOW_ONLY,
      sheetName: profile.mappingSheet,
      headerRow: null,
      headers: [],
      rows: []
    };
  }

  const headerRow = tm2_detectMappingHeaderRow_(sheet);
  if (!headerRow) {
    return {
      workflow: workflow,
      status: TM2_ENDPOINT.BLOCKED,
      reason: 'MAPPING_HEADER_NOT_DETECTED',
      sheetName: profile.mappingSheet,
      rows: []
    };
  }

  if (lastRow <= headerRow) {
    return {
      workflow: workflow,
      status: TM2_ENDPOINT.SHADOW_ONLY,
      sheetName: profile.mappingSheet,
      headerRow: headerRow,
      headers: sheet.getRange(headerRow, 1, 1, lastCol).getDisplayValues()[0],
      rows: []
    };
  }

  const limit = Math.max(1, Math.min(Number(maxRows || 50), 500));
  const count = Math.min(lastRow - headerRow, limit);
  const values = sheet.getRange(headerRow, 1, count + 1, lastCol).getDisplayValues();

  return {
    workflow: workflow,
    status: TM2_ENDPOINT.SHADOW_ONLY,
    sheetName: profile.mappingSheet,
    headerRow: headerRow,
    headers: values[0],
    rows: values.slice(1),
    truncated: (lastRow - headerRow) > count
  };
}

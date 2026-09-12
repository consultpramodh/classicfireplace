function tm2_diagnostics() {
  return tm2_runWithEvidence_('tm2_diagnostics', 'Shared', function() {
    tm2_assertShadowSafe_();

    const sheetResults = {};
    TM2_WORKFLOWS.forEach(function(workflow) {
      const profile = tm2_getWorkflowProfile_(workflow);
      const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(profile.mappingSheet);
      sheetResults[workflow] = {
        mappingSheet: profile.mappingSheet,
        present: !!sheet,
        lastRow: sheet ? sheet.getLastRow() : null,
        lastColumn: sheet ? sheet.getLastColumn() : null
      };
    });

    const result = {
      tm2Version: TM2_VERSION,
      mode: TM2_MODE.name,
      cutover: TM2_CUTOVER,
      workflowSheets: sheetResults,
      reportCapabilities: tm2_reportCapabilitySnapshot_(),
      writeAttempts: 0
    };

    tm2_verifyNoWrites_(result);
    tm2_log_('DIAGNOSTICS', result);
    return result;
  });
}

function tm2_testSuite() {
  return tm2_runWithEvidence_('tm2_testSuite', 'ALL', function() {
    tm2_assertShadowSafe_();

    const result = {
      tm2Version: TM2_VERSION,
      mode: TM2_MODE.name,
      connectivity: tm2_connectivityAudit(),
      diagnostics: tm2_diagnostics(),
      shadow: tm2_shadowRunAll(),
      writeAttempts: 0
    };

    tm2_verifyNoWrites_(result);
    tm2_log_('TEST_SUITE_COMPLETE', {
      tm2Version: TM2_VERSION,
      mode: TM2_MODE.name,
      writeAttempts: 0
    });
    return result;
  });
}

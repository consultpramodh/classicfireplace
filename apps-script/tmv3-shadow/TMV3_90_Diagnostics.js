function tmv3_diagnostics() {
  tmv3_assertShadowSafe_();

  const propertyCapabilities = tmv3_propertyCapabilitySnapshot_();
  const missingCapabilities = Object.keys(propertyCapabilities).filter(function(key) {
    return !propertyCapabilities[key].present;
  });

  const sheetContract = tmv3_sheetContractSnapshot_();
  const missingSheets = [];
  Object.keys(sheetContract).forEach(function(vertical) {
    Object.keys(sheetContract[vertical]).forEach(function(sheetName) {
      if (!sheetContract[vertical][sheetName].present) {
        missingSheets.push(vertical + ':' + sheetName);
      }
    });
  });

  const result = {
    version: TMV3_VERSION,
    mode: TMV3_MODE.name,
    status: missingSheets.length ? 'BLOCKED_MISSING_SANDBOX_SHEETS' :
      (missingCapabilities.length ? 'CONFIG_GAPS' : 'READY'),
    scriptId: ScriptApp.getScriptId(),
    targetSpreadsheetId: TMV3_TARGET_SPREADSHEET_ID,
    propertyCapabilities: propertyCapabilities,
    missingPropertyCapabilities: missingCapabilities,
    sheetContract: sheetContract,
    missingSheets: missingSheets,
    businessWriteAttempts: 0,
    calendarWriteAttempts: 0,
    triggerInstallAttempts: 0
  };

  tmv3_log_('DIAGNOSTICS', result);
  return result;
}

function tmv3_testSuite() {
  tmv3_assertShadowSafe_();
  const diagnostics = tmv3_diagnostics();

  if (diagnostics.missingSheets.length) {
    throw new Error('TMV3 sandbox contract failed. Missing sheets: ' + diagnostics.missingSheets.join(', '));
  }

  const result = {
    version: TMV3_VERSION,
    mode: TMV3_MODE.name,
    status: diagnostics.status,
    diagnostics: diagnostics,
    verifiedSandboxReadOnly: true,
    verifiedExistingProjectPropertiesReusable:
      diagnostics.missingPropertyCapabilities.length === 0,
    writeAttempts: 0
  };

  tmv3_log_('TEST_SUITE_COMPLETE', {
    status: result.status,
    targetSpreadsheetId: TMV3_TARGET_SPREADSHEET_ID,
    missingPropertyCapabilities: diagnostics.missingPropertyCapabilities,
    writeAttempts: 0
  });
  return result;
}

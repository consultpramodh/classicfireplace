function tmv3_assertShadowSafe_() {
  if (TMV3_MODE.name !== 'SHADOW_READ_ONLY' ||
      TMV3_MODE.writeEnabled ||
      TMV3_MODE.createRecreateEnabled ||
      TMV3_MODE.calendarWriteEnabled ||
      TMV3_MODE.triggerInstallEnabled) {
    throw new Error('TMV3 shadow safety gate failed.');
  }
  return true;
}

function tmv3_openSandboxSpreadsheet_() {
  tmv3_assertShadowSafe_();
  const ss = SpreadsheetApp.openById(TMV3_TARGET_SPREADSHEET_ID);
  if (!ss) throw new Error('TMV3 sandbox spreadsheet could not be opened.');
  if (String(ss.getId()) !== String(TMV3_TARGET_SPREADSHEET_ID)) {
    throw new Error('TMV3 sandbox identity verification failed.');
  }
  return ss;
}

function tmv3_propertyCapabilitySnapshot_() {
  const props = PropertiesService.getScriptProperties();
  const result = {};
  Object.keys(TMV3_REQUIRED_PROPERTY_SOURCES).forEach(function(capability) {
    const aliases = TMV3_REQUIRED_PROPERTY_SOURCES[capability];
    let matchedKey = '';
    for (let i = 0; i < aliases.length; i++) {
      if (String(props.getProperty(aliases[i]) || '').trim()) {
        matchedKey = aliases[i];
        break;
      }
    }
    result[capability] = {
      present: !!matchedKey,
      sourceKey: matchedKey || null
    };
  });
  return result;
}

function tmv3_sheetContractSnapshot_() {
  const ss = tmv3_openSandboxSpreadsheet_();
  const out = {};
  Object.keys(TMV3_SHEET_CONTRACT).forEach(function(vertical) {
    out[vertical] = {};
    TMV3_SHEET_CONTRACT[vertical].forEach(function(sheetName) {
      const sheet = ss.getSheetByName(sheetName);
      out[vertical][sheetName] = {
        present: !!sheet,
        lastRow: sheet ? sheet.getLastRow() : null,
        lastColumn: sheet ? sheet.getLastColumn() : null
      };
    });
  });
  return out;
}

function tmv3_log_(stage, payload) {
  const record = {
    version: TMV3_VERSION,
    mode: TMV3_MODE.name,
    stage: stage,
    at: new Date().toISOString(),
    payload: payload || null
  };
  Logger.log(JSON.stringify(record));
  return record;
}

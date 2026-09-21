/************************************************************
 * 98_2_Contact_R1_Runtime_Test.js
 *
 * Remote-execution diagnostics for Contact Resolution R1.
 * Uses explicit workbook open so Apps Script Execution API / clasp
 * does not depend on an active container spreadsheet.
 *
 * Mapping rebuilds write only the existing mapping sheets.
 * No Striven task writes. No Calendar writes.
 ************************************************************/

const TM_CONTACT_R1_RUNTIME = Object.freeze({
  SPREADSHEET_ID: '1WdDufz3A0p12Vg-_0ypYbFFNGPQZB5ra4aJcS8ACWlU'
});

function tmContactR1RuntimeWithWorkbook_(callback) {
  const ss = SpreadsheetApp.openById(TM_CONTACT_R1_RUNTIME.SPREADSHEET_ID);
  if (typeof SpreadsheetApp.setActiveSpreadsheet === 'function') {
    SpreadsheetApp.setActiveSpreadsheet(ss);
  }
  TM_CONTACT_R1_INDEX_CACHE = null;
  return callback(ss);
}

function testTmContactR1ResolverRemote() {
  return tmContactR1RuntimeWithWorkbook_(function() {
    return testTmContactR1ResolverReadOnly();
  });
}

function testTmContactR1RebuildServiceRemote() {
  return tmContactR1RuntimeWithWorkbook_(function() {
    const result = buildServiceTaskMappingFromSheets();
    SpreadsheetApp.flush();
    return {
      status: 'SERVICE_MAPPING_REBUILT',
      builderResult: result,
      coverage: testTmContactR1ServiceCoverageRemote_()
    };
  });
}

function testTmContactR1RebuildInstallRemote() {
  return tmContactR1RuntimeWithWorkbook_(function() {
    const result = buildInstallTaskMappingFromSheets();
    SpreadsheetApp.flush();
    return {
      status: 'INSTALL_MAPPING_REBUILT',
      builderResult: result,
      coverage: testTmContactR1InstallCoverageRemote_()
    };
  });
}

function testTmContactR1CoverageRemote() {
  return tmContactR1RuntimeWithWorkbook_(function() {
    return {
      mode: 'TM_CONTACT_R1_LIVE_COVERAGE',
      service: testTmContactR1ServiceCoverageRemote_(),
      install: testTmContactR1InstallCoverageRemote_(),
      writesPerformed: false,
      strivenWritesPerformed: false,
      calendarWritesPerformed: false
    };
  });
}

function testTmContactR1ServiceCoverageRemote_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet() || SpreadsheetApp.openById(TM_CONTACT_R1_RUNTIME.SPREADSHEET_ID);
  const sh = ss.getSheetByName('Service Task Mapping');
  if (!sh) throw new Error('Missing Service Task Mapping.');
  const grid = sh.getDataRange().getDisplayValues();
  if (!grid.length) return { eligible: 0, contactResolved: 0, contactMissing: 0, samples: [] };

  const headers = grid[0].map(function(v) { return String(v || '').trim(); });
  const statusIdx = headers.indexOf('Status');
  const taskStatusIdx = headers.indexOf('Task Status');
  const contactIdx = headers.indexOf('Hidden Contact ID');
  const taskIdx = headers.indexOf('Task ID');
  const customerIdx = headers.indexOf('Customer');
  const woIdx = headers.indexOf('Hidden Work Order ID');

  let eligible = 0;
  let contactResolved = 0;
  const samples = [];

  for (let i = 1; i < grid.length; i++) {
    const row = grid[i];
    const status = statusIdx >= 0 ? String(row[statusIdx] || '').trim().toUpperCase() : '';
    const taskStatus = taskStatusIdx >= 0 ? String(row[taskStatusIdx] || '').trim().toUpperCase() : '';
    if (status !== 'MATCHED' || taskStatus !== 'OPEN') continue;
    eligible++;
    const contactId = contactIdx >= 0 ? String(row[contactIdx] || '').trim() : '';
    if (contactId) {
      contactResolved++;
      if (samples.length < 8) {
        samples.push({
          taskId: taskIdx >= 0 ? String(row[taskIdx] || '') : '',
          customer: customerIdx >= 0 ? String(row[customerIdx] || '') : '',
          workOrderId: woIdx >= 0 ? String(row[woIdx] || '') : '',
          contactId: contactId
        });
      }
    }
  }

  return {
    eligible: eligible,
    contactResolved: contactResolved,
    contactMissing: eligible - contactResolved,
    resolvedPct: eligible ? Math.round(contactResolved * 1000 / eligible) / 10 : 0,
    samples: samples
  };
}

function testTmContactR1InstallCoverageRemote_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet() || SpreadsheetApp.openById(TM_CONTACT_R1_RUNTIME.SPREADSHEET_ID);
  const sh = ss.getSheetByName('Install Task Mapping');
  if (!sh) throw new Error('Missing Install Task Mapping.');
  const grid = sh.getDataRange().getDisplayValues();
  if (grid.length < 4) return { eligible: 0, contactResolved: 0, contactMissing: 0, samples: [] };

  let headerIndex = -1;
  for (let i = 0; i < Math.min(grid.length, 10); i++) {
    if (grid[i].indexOf('Task ID') >= 0 && grid[i].indexOf('Hidden Desired ContactId') >= 0) {
      headerIndex = i;
      break;
    }
  }
  if (headerIndex < 0) throw new Error('Install Task Mapping header row not found.');

  const headers = grid[headerIndex].map(function(v) { return String(v || '').trim(); });
  const statusIdx = headers.indexOf('Status');
  const taskStatusIdx = headers.indexOf('Task Status');
  const contactIdx = headers.indexOf('Hidden Desired ContactId');
  const sourceIdx = headers.indexOf('Hidden ContactId Source');
  const taskIdx = headers.indexOf('Task ID');
  const customerIdx = headers.indexOf('Customer');

  let eligible = 0;
  let contactResolved = 0;
  const samples = [];

  for (let i = headerIndex + 1; i < grid.length; i++) {
    const row = grid[i];
    const status = statusIdx >= 0 ? String(row[statusIdx] || '').trim().toUpperCase() : '';
    const taskStatus = taskStatusIdx >= 0 ? String(row[taskStatusIdx] || '').trim().toUpperCase() : '';
    if (status !== 'MATCHED' || taskStatus !== 'OPEN') continue;
    eligible++;
    const contactId = contactIdx >= 0 ? String(row[contactIdx] || '').trim() : '';
    if (contactId) {
      contactResolved++;
      if (samples.length < 8) {
        samples.push({
          taskId: taskIdx >= 0 ? String(row[taskIdx] || '') : '',
          customer: customerIdx >= 0 ? String(row[customerIdx] || '') : '',
          contactId: contactId,
          source: sourceIdx >= 0 ? String(row[sourceIdx] || '') : ''
        });
      }
    }
  }

  return {
    eligible: eligible,
    contactResolved: contactResolved,
    contactMissing: eligible - contactResolved,
    resolvedPct: eligible ? Math.round(contactResolved * 1000 / eligible) / 10 : 0,
    samples: samples
  };
}

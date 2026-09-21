/************************************************************
 * 98_4_Contact_R1_One_Click_Test.js
 *
 * ONE-CLICK TEST for Contact Resolution R1.
 *
 * PUBLIC FUNCTION TO RUN:
 *   TEST_CONTACT_RESOLUTION_R1_ONE_CLICK
 *
 * What it does:
 * 1) Validates the existing Striven_Customers cache.
 * 2) Refreshes only the four reports needed for this test:
 *      - Approved Sales Orders
 *      - Install Tasks
 *      - Service Work Orders
 *      - Service Tasks
 * 3) Rebuilds Install + Service mapping sheets.
 * 4) Verifies known Contact-resolution cases.
 *
 * Safety:
 * - NO Striven PATCH/write calls.
 * - NO Calendar writes.
 * - Mapping/report sheet writes only.
 * - Does NOT call syncContactsReportToSheet().
 ************************************************************/

function TEST_CONTACT_RESOLUTION_R1_ONE_CLICK() {
  const startedAt = new Date();
  const result = {
    mode: 'CONTACT_RESOLUTION_R1_ONE_CLICK_TEST',
    version: 'R1_20260921',
    status: 'RUNNING',
    startedAt: startedAt.toISOString(),
    writes: {
      striven: false,
      calendar: false,
      sheetsOnly: true
    },
    steps: [],
    checks: [],
    summary: {}
  };

  try {
    tmContactR1OneClickStep_(result, '1. Validate Striven_Customers cache', function() {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const sh = ss && ss.getSheetByName('Striven_Customers');
      if (!sh) throw new Error('Missing Striven_Customers sheet.');
      if (sh.getLastRow() < 2) throw new Error('Striven_Customers has no data rows.');

      const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getDisplayValues()[0]
        .map(function(v) { return String(v || '').trim(); });

      ['CustomerNumber', 'ContactId'].forEach(function(required) {
        if (headers.indexOf(required) < 0) {
          throw new Error('Striven_Customers is missing required column: ' + required);
        }
      });

      TM_CONTACT_R1_INDEX_CACHE = null;

      return {
        sheet: 'Striven_Customers',
        rowsAvailable: sh.getLastRow() - 1,
        contactResolverCacheReset: true
      };
    });

    tmContactR1OneClickStep_(result, '2. Refresh Approved Sales Orders', function() {
      return { rows: syncApprovedSalesOrdersToSheet() };
    });

    tmContactR1OneClickStep_(result, '3. Refresh Install Tasks', function() {
      return { rows: syncStrivenTasksToSheet() };
    });

    tmContactR1OneClickStep_(result, '4. Refresh Service Work Orders', function() {
      return { rows: syncStrivenServiceWorkOrdersToSheet() };
    });

    tmContactR1OneClickStep_(result, '5. Refresh Service Tasks', function() {
      return { rows: syncStrivenServiceTasksToSheet() };
    });

    tmContactR1OneClickStep_(result, '6. Rebuild Install mapping', function() {
      buildInstallTaskMappingFromSheets();
      SpreadsheetApp.flush();
      return { rebuilt: true };
    });

    tmContactR1OneClickStep_(result, '7. Rebuild Service mapping', function() {
      TM_CONTACT_R1_INDEX_CACHE = null;
      buildServiceTaskMappingFromSheets();
      SpreadsheetApp.flush();
      return { rebuilt: true };
    });

    tmContactR1OneClickStep_(result, '8. Verify expected Contact results', function() {
      const checks = [
        tmContactR1CheckMappingTask_({
          division: 'SERVICE',
          sheetName: 'Service Task Mapping',
          taskId: '18438',
          contactHeader: 'Hidden Contact ID',
          expectedContactId: '36043',
          expectedBlank: false,
          label: 'Vivienne McCuaig'
        }),
        tmContactR1CheckMappingTask_({
          division: 'SERVICE',
          sheetName: 'Service Task Mapping',
          taskId: '18441',
          contactHeader: 'Hidden Contact ID',
          expectedContactId: '56345',
          expectedBlank: false,
          label: 'Saman Salman'
        }),
        tmContactR1CheckMappingTask_({
          division: 'SERVICE',
          sheetName: 'Service Task Mapping',
          taskId: '18307',
          contactHeader: 'Hidden Contact ID',
          expectedContactId: '56295',
          expectedBlank: false,
          label: 'MG Homes / Philip Mulkins - exact Calendar phone 519-807-3240'
        }),
        tmContactR1CheckMappingTask_({
          division: 'INSTALL',
          sheetName: 'Install Task Mapping',
          taskId: '17881',
          contactHeader: 'Hidden Desired ContactId',
          expectedContactId: '42852',
          expectedBlank: false,
          label: 'Cedric & Elizabeth Stevenson'
        }),
        tmContactR1CheckMappingTask_({
          division: 'INSTALL',
          sheetName: 'Install Task Mapping',
          taskId: '17982',
          contactHeader: 'Hidden Desired ContactId',
          expectedContactId: '55844',
          expectedBlank: false,
          label: 'Bruce & Elizabeth'
        })
      ];

      Array.prototype.push.apply(result.checks, checks);

      const failed = checks.filter(function(check) { return !check.pass; });
      if (failed.length) {
        throw new Error(
          'Contact verification failed for: ' +
          failed.map(function(check) {
            return check.division + ' Task ' + check.taskId + ' (' + check.label + ')';
          }).join(', ')
        );
      }

      return {
        checksRun: checks.length,
        checksPassed: checks.length,
        checksFailed: 0
      };
    });

    const coverage = tmContactR1BuildCoverageSummary_();
    result.summary = coverage;

    result.status = 'PASS';
    result.finishedAt = new Date().toISOString();
    result.runtimeSeconds = Math.round((new Date().getTime() - startedAt.getTime()) / 1000);

    Logger.log('============================================================');
    Logger.log('CONTACT RESOLUTION R1 ONE-CLICK TEST: PASS');
    Logger.log('============================================================');
    Logger.log(JSON.stringify(result, null, 2));

    return result;

  } catch (err) {
    result.status = 'FAIL';
    result.finishedAt = new Date().toISOString();
    result.runtimeSeconds = Math.round((new Date().getTime() - startedAt.getTime()) / 1000);
    result.error = String(err && err.message ? err.message : err);

    Logger.log('============================================================');
    Logger.log('CONTACT RESOLUTION R1 ONE-CLICK TEST: FAIL');
    Logger.log('============================================================');
    Logger.log(JSON.stringify(result, null, 2));

    throw err;
  }
}

function tmContactR1OneClickStep_(result, name, callback) {
  const started = new Date();
  Logger.log('START: ' + name);

  try {
    const detail = callback() || {};
    const step = {
      name: name,
      status: 'PASS',
      runtimeSeconds: Math.round((new Date().getTime() - started.getTime()) / 1000),
      detail: detail
    };
    result.steps.push(step);
    Logger.log('PASS: ' + name + ' ' + JSON.stringify(detail));
    return detail;
  } catch (err) {
    const step = {
      name: name,
      status: 'FAIL',
      runtimeSeconds: Math.round((new Date().getTime() - started.getTime()) / 1000),
      error: String(err && err.message ? err.message : err)
    };
    result.steps.push(step);
    Logger.log('FAIL: ' + name + ' ' + step.error);
    throw err;
  }
}

function tmContactR1FindHeaderRow_(grid, requiredHeaders) {
  for (let r = 0; r < Math.min(grid.length, 10); r++) {
    const headers = (grid[r] || []).map(function(v) { return String(v || '').trim(); });
    const ok = requiredHeaders.every(function(required) {
      return headers.indexOf(required) >= 0;
    });
    if (ok) return r;
  }
  return -1;
}

function tmContactR1CheckMappingTask_(cfg) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(cfg.sheetName);
  if (!sh) {
    return {
      pass: false,
      division: cfg.division,
      taskId: cfg.taskId,
      label: cfg.label,
      reason: 'Missing sheet: ' + cfg.sheetName
    };
  }

  const grid = sh.getDataRange().getDisplayValues();
  const headerRow = tmContactR1FindHeaderRow_(grid, ['Task ID', cfg.contactHeader]);
  if (headerRow < 0) {
    return {
      pass: false,
      division: cfg.division,
      taskId: cfg.taskId,
      label: cfg.label,
      reason: 'Required mapping headers were not found.'
    };
  }

  const headers = grid[headerRow].map(function(v) { return String(v || '').trim(); });
  const taskIdx = headers.indexOf('Task ID');
  const contactIdx = headers.indexOf(cfg.contactHeader);
  const issueIdx = headers.indexOf('Issue');
  const customerIdx = headers.indexOf('Customer');

  for (let r = headerRow + 1; r < grid.length; r++) {
    const row = grid[r] || [];
    if (String(row[taskIdx] || '').trim() !== String(cfg.taskId)) continue;

    const actualContactId = String(row[contactIdx] || '').trim();
    const issue = issueIdx >= 0 ? String(row[issueIdx] || '').trim() : '';
    const customer = customerIdx >= 0 ? String(row[customerIdx] || '').trim() : '';

    let pass = cfg.expectedBlank
      ? !actualContactId
      : actualContactId === String(cfg.expectedContactId || '');

    if (cfg.expectedIssueContains) {
      pass = pass &&
        issue.toLowerCase().indexOf(String(cfg.expectedIssueContains).toLowerCase()) >= 0;
    }

    return {
      pass: pass,
      division: cfg.division,
      taskId: cfg.taskId,
      label: cfg.label,
      customer: customer,
      expectedContactId: cfg.expectedBlank ? '(blank)' : String(cfg.expectedContactId || ''),
      actualContactId: actualContactId || '(blank)',
      issue: issue,
      mappingRow: r + 1
    };
  }

  return {
    pass: false,
    division: cfg.division,
    taskId: cfg.taskId,
    label: cfg.label,
    reason: 'Task ID was not found in ' + cfg.sheetName + '.'
  };
}

function tmContactR1BuildCoverageSummary_() {
  return {
    service: tmContactR1CoverageForSheet_(
      'Service Task Mapping',
      'Hidden Contact ID',
      1
    ),
    install: tmContactR1CoverageForSheet_(
      'Install Task Mapping',
      'Hidden Desired ContactId',
      4
    )
  };
}

function tmContactR1CoverageForSheet_(sheetName, contactHeader, expectedHeaderRow) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(sheetName);
  if (!sh) return { sheet: sheetName, status: 'MISSING' };

  const grid = sh.getDataRange().getDisplayValues();
  const headerRow = tmContactR1FindHeaderRow_(grid, [
    'Status',
    'Task ID',
    'Task Status',
    contactHeader
  ]);

  if (headerRow < 0) {
    return {
      sheet: sheetName,
      status: 'HEADER_NOT_FOUND',
      expectedHeaderRow: expectedHeaderRow
    };
  }

  const headers = grid[headerRow].map(function(v) { return String(v || '').trim(); });
  const statusIdx = headers.indexOf('Status');
  const taskStatusIdx = headers.indexOf('Task Status');
  const contactIdx = headers.indexOf(contactHeader);

  let eligible = 0;
  let populated = 0;

  for (let r = headerRow + 1; r < grid.length; r++) {
    const row = grid[r] || [];
    const status = String(row[statusIdx] || '').trim().toUpperCase();
    const taskStatus = String(row[taskStatusIdx] || '').trim().toUpperCase();

    if (status !== 'MATCHED' || taskStatus !== 'OPEN') continue;

    eligible++;
    if (String(row[contactIdx] || '').trim()) populated++;
  }

  return {
    sheet: sheetName,
    status: 'OK',
    eligibleMatchedOpen: eligible,
    contactPopulated: populated,
    contactMissing: eligible - populated,
    contactCoveragePct: eligible
      ? Math.round(populated * 1000 / eligible) / 10
      : 0
  };
}

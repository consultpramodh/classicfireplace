/************************************************************
 * APPS SCRIPT — 01_config_menu.gs
 * ENTERNEWPART — CONFIG + MENU
 *
 * PURPOSE
 * ----------------------------------------------------------
 * Single source of truth for:
 * - sheet names
 * - script property names
 * - ActionHub settings
 * - menu
 * - trigger installers
 *
 * IMPORTANT
 * ----------------------------------------------------------
 * Delete or disable old duplicate config/menu files first.
 * Do NOT keep older ENP_CFG / onOpen versions beside this.
 ************************************************************/

const ENP = {
  SHEETS: {
    APPROVED: 'Enternewpart',
    QUOTED: 'Enternewpart_Quoted',
    HUB: 'ActionHub',
    ITEMS: 'Striven_Items',
    MANUAL: 'Manual ItemCreation'
  },

  PROPS: {
    BASE_URL: 'STRIVEN_BASE_URL',
    CLIENT_ID: 'CLIENT_ID',
    CLIENT_SECRET: 'CLIENT_SECRET',
    TOKEN: 'striven_token',
    TOKEN_EXPIRES: 'striven_token_expires',

    APPROVED_REPORT_URL: 'STRIVEN_ENTERNEWPART_REPORT_API',
    QUOTED_REPORT_URL: 'STRIVEN_ENTERNEWPART_QUOTED_REPORT_API',
    ITEMS_REPORT_URL: 'ItemsReport_API_KEY',

    DEFAULT_ITEMTYPE_ID: 'ENTERNEWPART_DEFAULT_ITEMTYPE_ID',
    DEFAULT_INCOME_GL_ID: 'ENTERNEWPART_DEFAULT_INCOME_GLACCOUNT_ID',
    DEFAULT_INVENTORY_GL_ID: 'ENTERNEWPART_DEFAULT_INVENTORY_GLACCOUNT_ID',
    DEFAULT_COGS_GL_ID: 'ENTERNEWPART_DEFAULT_COGS_GLACCOUNT_ID',
    DEFAULT_LOCATION_ID: 'ENTERNEWPART_DEFAULT_INVENTORY_LOCATION_ID'
  },

  VALUES: {
    PLACEHOLDER_ITEMNUMBER: 'ENTERNEWPART',
    QUOTED_GATE_HEADER: 'SendToActions',
    PLACEHOLDER_ITEM_ID: 36935
  },

    EMAIL: {
    INVALID_DESC_ALERT_TEST_MODE: true,
    INVALID_DESC_ALERT_TEST_EMAIL: 'pramodh@classicfireplace.ca'
  },

  HUB: {
    HEADERS: [
      'SOId',
      'SONumber',
      'LineId',
      'RawDescription',
      'ParsedItemNumber',
      'ParsedItemName',
      'ParsedPrice',
      'Qty',
      'NewItemId',
      'State',
      'JobKey',
      'Attempts',
      'NextRunAt',
      'LastRunAt',
      'LastError',
      'SourceSheet',
      'SourceRow'
    ],
    STATE_PENDING: 'PENDING',
    STATE_RUNNING: 'RUNNING',
    STATE_DONE: 'DONE',
    STATE_FAILED: 'FAILED',
    RUNNER_BATCH_SIZE: 25,
    RUNNER_MAX_ATTEMPTS: 6
  },

  APPROVED_HEADERS: [
    'SalesOrderSalesOrderId',
    'SalesOrderCreatedOn',
    'ItemItemId',
    'ItemNumber',
    'ItemDescription',
    'Quantity',
    'Price',
    'SalesOrderNumber',
    'SalesOrderStatus',
    'SalesOrderCustomerName',
    'SalesOrderSalesRepFullName'
  ],

  ACTION_HEADERS: [
    'NewItemId',
    'NewItemNumber',
    'NewItemName',
    'NewItemPrice',
    'NewItemCost',
    'LastAction',
    'LastError',
    'LastUpdated'
  ],

  QUOTED_ACTION_HEADERS: [
    'SendToActions',
    'NewItemId',
    'NewItemNumber',
    'NewItemName',
    'NewItemPrice',
    'NewItemCost',
    'LastAction',
    'LastError',
    'LastUpdated'
  ]
};

/* =========================================================
 * APPS SCRIPT — MENU
 * ========================================================= */

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Enternewpart')
    .addItem('Sync All Reports', 'enp_syncAllReports')
    .addSeparator()
    .addItem('Queue Pending Rows to ActionHub', 'enp_queueAllPending')
    .addItem('Run ActionHub Batch Now', 'enp_runActionHubBatch')
    .addSeparator()
    .addItem('Create Items from Selected Rows', 'enp_createItemsFromSelectedRows')
    .addItem('Replace SO Lines from Selected Rows', 'enp_replaceSalesOrderLinesFromSelectedRows')
    .addSeparator()
    .addItem('Manual Item Creation: Selected Rows', 'manualCreateItems_selectedRows')
    .addSeparator()
    .addItem('Install Pipeline Trigger', 'enp_installPipelineTrigger')
    .addItem('Remove Pipeline Trigger', 'enp_removePipelineTrigger')
    .addToUi();
}

/* =========================================================
 * APPS SCRIPT — TRIGGERS
 * ========================================================= */

function enp_installPipelineTrigger() {
  enp_removePipelineTrigger();
  ScriptApp.newTrigger('enp_pipelineTick')
    .timeBased()
    .everyMinutes(10)
    .create();

  SpreadsheetApp.getActive().toast(
    'Pipeline trigger installed (every 10 minutes).',
    'Enternewpart',
    5
  );
}

function enp_removePipelineTrigger() {
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(t => {
    const fn = t.getHandlerFunction && t.getHandlerFunction();
    if (fn === 'enp_pipelineTick') {
      ScriptApp.deleteTrigger(t);
    }
  });

  SpreadsheetApp.getActive().toast(
    'Pipeline trigger removed.',
    'Enternewpart',
    4
  );
}

function enp_pipelineTick() {
  const lock = LockService.getDocumentLock();
  lock.waitLock(30000);

  try {
    enp_syncAllReports();
    enp_queueAllPending();
    enp_runActionHubBatch();
  } finally {
    lock.releaseLock();
  }
}

/* =========================================================
 * APPS SCRIPT — MENU WRAPPERS
 * ========================================================= */

function enp_createItemsFromSelectedRows() {
  const sh = SpreadsheetApp.getActiveSheet();
  const name = sh ? sh.getName() : '';

  if (name !== ENP.SHEETS.APPROVED && name !== ENP.SHEETS.QUOTED) {
    throw new Error(
      'Run this only from "' + ENP.SHEETS.APPROVED + '" or "' + ENP.SHEETS.QUOTED + '".'
    );
  }

  enp_createItemsForActiveSheetSelection_(sh);
}

function enp_replaceSalesOrderLinesFromSelectedRows() {
  const sh = SpreadsheetApp.getActiveSheet();
  const name = sh ? sh.getName() : '';

  if (name !== ENP.SHEETS.APPROVED && name !== ENP.SHEETS.QUOTED) {
    throw new Error(
      'Run this only from "' + ENP.SHEETS.APPROVED + '" or "' + ENP.SHEETS.QUOTED + '".'
    );
  }

  enp_replaceLinesForActiveSheetSelection_(sh);
}

function enp_runActionHubBatch() {
  enp_actionHubRunPendingBatch_(ENP.HUB.RUNNER_BATCH_SIZE);
}

/* =========================================================
 * APPS SCRIPT — BASIC HELPERS
 * ========================================================= */

function enp_getScriptProp_(key, required) {
  const value = PropertiesService.getScriptProperties().getProperty(key);
  if (required && !value) {
    throw new Error('Missing Script Property: ' + key);
  }
  return value || '';
}

function enp_num_(value) {
  if (value === '' || value == null) return null;
  const n = Number(String(value).replace(/[^0-9.\-]/g, ''));
  return isNaN(n) ? null : n;
}

function enp_norm_(value) {
  return String(value == null ? '' : value).trim();
}

function enp_normUpper_(value) {
  return enp_norm_(value).toUpperCase();
}

function enp_indexByHeader_(headers) {
  const map = {};
  (headers || []).forEach((h, i) => {
    const key = String(h || '').trim();
    if (!key) return;
    map[key] = i;
  });
  return map;
}

function enp_requireCols_(colMap, requiredHeaders) {
  const missing = requiredHeaders.filter(h => colMap[h] == null);
  if (missing.length) {
    throw new Error('Missing required columns: ' + missing.join(', '));
  }
}

function enp_getSelectedRowNumbers_(sh) {
  const rng = sh.getActiveRange();
  if (!rng) throw new Error('Select one or more data rows first.');

  const start = Math.max(2, rng.getRow());
  const end = Math.max(2, rng.getRow() + rng.getNumRows() - 1);

  const rows = [];
  for (let r = start; r <= end; r++) rows.push(r);

  if (!rows.length) throw new Error('No valid data rows selected.');
  return rows;
}

function enp_ensureHeaders_(sh, wantedHeaders) {
  const lastCol = Math.max(1, sh.getLastColumn());
  const existing = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(h => String(h || '').trim());
  const existingNonBlank = existing.filter(Boolean);

  if (!existingNonBlank.length) {
    sh.getRange(1, 1, 1, wantedHeaders.length)
      .setValues([wantedHeaders])
      .setFontWeight('bold');
    sh.setFrozenRows(1);
    return;
  }

  const col = enp_indexByHeader_(existing);
  let writeCol = existing.length;

  wantedHeaders.forEach(h => {
    if (!h) return;
    if (col[h] == null) {
      writeCol += 1;
      sh.getRange(1, writeCol).setValue(h).setFontWeight('bold');
      col[h] = writeCol - 1;
    }
  });

  sh.setFrozenRows(1);
}

function enp_makeJobKey_(soId, lineId, stableText) {
  const token = String(stableText || '').toUpperCase().replace(/\s+/g, ' ').trim();
  const digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    token,
    Utilities.Charset.UTF_8
  );
  const shortHash = Utilities.base64EncodeWebSafe(digest).slice(0, 12);
  return 'SO:' + soId + '|LINE:' + (lineId || '') + '|H:' + shortHash;
}
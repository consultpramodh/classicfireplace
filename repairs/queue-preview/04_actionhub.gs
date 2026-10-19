/************************************************************
 * APPS SCRIPT — 04_actionhub.gs
 * ENTERNEWPART — ACTION HUB QUEUE + RUNNER
 *
 * PURPOSE
 * ----------------------------------------------------------
 * Central queue system for Enternewpart processing.
 *
 * FLOW
 * ----------------------------------------------------------
 * 1) Queue eligible rows from source sheets
 * 2) Store them in ActionHub
 * 3) Run pending jobs in small batches
 * 4) Create missing items if needed
 * 5) Replace matching placeholder SO lines
 * 6) Write status back to source sheet rows
 *
 * DEPENDS ON
 * ----------------------------------------------------------
 * 01_config_menu.gs
 * 02_striven_core.gs
 * 03_enternewpart_sync_and_actions.gs
 ************************************************************/


/* =========================================================
 * APPS SCRIPT — PUBLIC ENTRY POINTS
 * ========================================================= */

function enp_queueAllPending() {
  const ss = SpreadsheetApp.getActive();
  let added = 0;

  const approved = ss.getSheetByName(ENP.SHEETS.APPROVED);
  if (approved) added += enp_actionHubQueueFromSheet_(approved);

  const quoted = ss.getSheetByName(ENP.SHEETS.QUOTED);
  if (quoted) added += enp_actionHubQueueFromSheet_(quoted);

  ss.toast('Queued rows: ' + added, 'Enternewpart', 5);
}

function enp_actionHubRunPendingBatch_(batchSize) {
  const sh = enp_getOrCreateActionHubSheet_();
  const grid = sh.getDataRange().getValues();
  if (grid.length < 2) return 0;

  const headers = grid[0].map(enp_norm_);
  const col = enp_indexByHeader_(headers);
  enp_requireCols_(col, ENP.HUB.HEADERS);

  const now = new Date();
  const limit = Math.max(1, Number(batchSize || ENP.HUB.RUNNER_BATCH_SIZE || 25));

  const candidates = [];
  for (let r = 1; r < grid.length; r++) {
    const row = grid[r];
    if (!enp_actionHubIsRunnableRow_(row, col, now)) continue;
    candidates.push({ sheetRow: r + 1, row: row });
    if (candidates.length >= limit) break;
  }

  let ran = 0;
  candidates.forEach(job => {
    enp_actionHubRunOneJob_(sh, headers, col, job.sheetRow, job.row);
    ran++;
  });

  SpreadsheetApp.getActive().toast(
    'ActionHub batch complete — processed: ' + ran,
    'Enternewpart',
    5
  );

  return ran;
}


/* =========================================================
 * APPS SCRIPT — QUEUE BUILD
 * ========================================================= */

function enp_actionHubQueueFromSheet_(sourceSheet) {
  const ctx = enp_getSheetContext_(sourceSheet);
  enp_ensureActionColumns_(sourceSheet, ctx);

  const sourceGrid = sourceSheet.getDataRange().getValues();
  if (sourceGrid.length < 2) return 0;

  const sourceHeaders = sourceGrid[0].map(enp_norm_);
  const sourceCol = enp_indexByHeader_(sourceHeaders);

  enp_requireCols_(sourceCol, [
    'SalesOrderSalesOrderId',
    'SalesOrderNumber',
    'ItemDescription',
    'ItemNumber',
    'Quantity',
    'LastAction',
    'LastError',
    'LastUpdated'
  ]);

  if (sourceSheet.getName() === ENP.SHEETS.QUOTED) {
    enp_requireCols_(sourceCol, ['SendToActions']);
  }

  const hubSheet = enp_getOrCreateActionHubSheet_();
  const hubGrid = hubSheet.getDataRange().getValues();
  const hubHeaders = hubGrid.length ? hubGrid[0].map(enp_norm_) : ENP.HUB.HEADERS.slice();
  const hubCol = enp_indexByHeader_(hubHeaders);

  const existingJobKeys = {};
  for (let i = 1; i < hubGrid.length; i++) {
    const key = enp_norm_(hubGrid[i][hubCol['JobKey']]);
    if (key) existingJobKeys[key] = true;
  }

  const itemIndex = enp_buildItemIndex_();
  const appendRows = [];
  let added = 0;

  for (let r = 1; r < sourceGrid.length; r++) {
    const row = sourceGrid[r];
    const sourceRowNum = r + 1;

    if (!enp_sourceRowShouldQueue_(sourceSheet, row, sourceCol)) continue;

    const parsed = enp_parseDescription_(row[sourceCol['ItemDescription']]);
    const soId = enp_num_(row[sourceCol['SalesOrderSalesOrderId']]);
    const soNumber = enp_norm_(row[sourceCol['SalesOrderNumber']]);
    const qty = enp_num_(row[sourceCol['Quantity']]);
    const rawDescription = enp_norm_(row[sourceCol['ItemDescription']]);

    if (!soId) continue;
    if (!parsed.itemNumber) continue;

    const existingNewItemId =
      sourceCol['NewItemId'] != null ? enp_num_(row[sourceCol['NewItemId']]) : null;

    const lookedUpItemId = enp_lookupItemId_(parsed.itemNumber, itemIndex);
    const candidateItemId = existingNewItemId || lookedUpItemId || '';

    const jobKey = enp_makeJobKey_(soId, '', [
      sourceSheet.getName(),
      sourceRowNum,
      parsed.itemNumber,
      qty,
      rawDescription
    ].join('|'));

    if (existingJobKeys[jobKey]) continue;

    appendRows.push(enp_actionHubBuildRow_({
      soId: soId,
      soNumber: soNumber,
      lineId: '',
      rawDescription: rawDescription,
      parsedItemNumber: parsed.itemNumber,
      parsedItemName: parsed.name,
      parsedPrice: parsed.price,
      qty: qty,
      newItemId: candidateItemId,
      state: ENP.HUB.STATE_PENDING,
      jobKey: jobKey,
      attempts: 0,
      nextRunAt: '',
      lastRunAt: '',
      lastError: '',
      sourceSheet: sourceSheet.getName(),
      sourceRow: sourceRowNum
    }));

    existingJobKeys[jobKey] = true;
    added++;
  }

  if (appendRows.length) {
    hubSheet
      .getRange(hubSheet.getLastRow() + 1, 1, appendRows.length, ENP.HUB.HEADERS.length)
      .setValues(appendRows);
  }

  return added;
}

function enp_sourceRowShouldQueue_(sourceSheet, row, col) {
  const placeholder = enp_normUpper_(row[col['ItemNumber']]);
  const action = enp_normUpper_(row[col['LastAction']]);
  const newItemId = col['NewItemId'] != null ? enp_num_(row[col['NewItemId']]) : null;

  if (sourceSheet.getName() === ENP.SHEETS.QUOTED) {
    const sendToActions = enp_normUpper_(row[col['SendToActions']]);
    if (sendToActions !== 'Y' && sendToActions !== 'YES' && sendToActions !== 'TRUE') {
      return false;
    }
  }

  if (placeholder !== enp_normUpper_(ENP.VALUES.PLACEHOLDER_ITEMNUMBER)) {
    return false;
  }

  if (action === 'DONE' || action.indexOf('REPLACED') >= 0) {
    return false;
  }

  if (newItemId && action.indexOf('REPLACED') >= 0) {
    return false;
  }

  return true;
}

function enp_actionHubBuildRow_(obj) {
  const keys = { SOId: 'soId', SONumber: 'soNumber' };
  return ENP.HUB.HEADERS.map(h => {
    const key = keys[h] || h.charAt(0).toLowerCase() + h.slice(1);
    return obj[key] != null ? obj[key] : (obj[h] != null ? obj[h] : '');
  });
}

/* =========================================================
 * APPS SCRIPT — JOB RUNNER
 * ========================================================= */

function enp_actionHubRunOneJob_(hubSheet, hubHeaders, hubCol, hubSheetRow, hubRow) {
  const lock = LockService.getDocumentLock();
  lock.waitLock(30000);

  try {
    const now = new Date();

    // Re-read after taking the lock: another execution may have finished this job.
    hubRow = hubSheet.getRange(hubSheetRow, 1, 1, hubRow.length).getValues()[0];
    if (!enp_actionHubIsRunnableRow_(hubRow, hubCol, now)) return;
    enp_actionHubMarkRunning_(hubSheet, hubCol, hubSheetRow, hubRow, now);

    const job = enp_actionHubRowToObject_(hubRow, hubCol);
    const sourceSheet = SpreadsheetApp.getActive().getSheetByName(job.SourceSheet);

    if (!sourceSheet) {
      throw new Error('Missing source sheet: ' + job.SourceSheet);
    }

    const sourceBundle = enp_getSourceRowBundle_(sourceSheet, job.SourceRow);
    const sourceRow = sourceBundle.row;
    const sourceCol = sourceBundle.col;
    enp_actionHubAssertSource_(job, sourceRow, sourceCol);

    let newItemId = enp_num_(job.NewItemId) ||
      (sourceCol['NewItemId'] != null ? enp_num_(sourceRow[sourceCol['NewItemId']]) : null);

    if (!newItemId) {
      const createResult = enp_actionHubEnsureItemCreated_(sourceSheet, sourceRow, sourceCol);
      newItemId = createResult.newItemId;
      job.NewItemId = newItemId;

      sourceBundle.row = createResult.sourceRow;
      enp_writeWholeSourceRow_(sourceSheet, sourceBundle.rowNumber, sourceBundle.row);
    }

    if (!newItemId) {
      throw new Error('Item creation did not return NewItemId.');
    }

    enp_actionHubReplaceSalesOrderLine_(job, sourceBundle, newItemId);

    enp_actionHubMarkDone_(hubSheet, hubCol, hubSheetRow, hubRow, now, '');
    enp_actionHubWritebackDone_(sourceSheet, sourceBundle.rowNumber, sourceBundle.row, sourceCol, now);
  } catch (err) {
    enp_actionHubHandleFailure_(hubSheet, hubCol, hubSheetRow, hubRow, err);
    enp_actionHubWritebackFailureSafe_(hubRow, hubCol, err);
  } finally {
    lock.releaseLock();
  }
}

function enp_actionHubEnsureItemCreated_(sourceSheet, sourceRow, sourceCol) {
  const now = new Date();
  const parsed = enp_parseDescription_(sourceRow[sourceCol['ItemDescription']]);
  const itemIndex = enp_buildItemIndex_();

  let newItemId = sourceCol['NewItemId'] != null ? enp_num_(sourceRow[sourceCol['NewItemId']]) : null;
  if (newItemId) {
    return { newItemId: newItemId, sourceRow: sourceRow };
  }

  const existingId = enp_lookupItemId_(parsed.itemNumber, itemIndex);
  if (existingId) {
    enp_writeCreateResultToRow_(sourceRow, sourceCol, {
      newItemId: existingId,
      itemNumber: parsed.itemNumber,
      itemName: parsed.name,
      price: parsed.price,
      cost: sourceCol['NewItemCost'] != null ? enp_num_(sourceRow[sourceCol['NewItemCost']]) : 0,
      action: 'EXISTS',
      error: '',
      updated: now
    });

    return { newItemId: existingId, sourceRow: sourceRow };
  }

  const payload = enp_buildItemPayloadFromSheetRow_(sourceRow, sourceCol);
  const res = enp_createItemInStriven_(payload);
  newItemId = enp_extractItemId_(res);

  if (!newItemId) {
    throw new Error('Create succeeded but Striven returned no item id.');
  }

  enp_writeCreateResultToRow_(sourceRow, sourceCol, {
    newItemId: newItemId,
    itemNumber: payload.ItemNumber || parsed.itemNumber || '',
    itemName: payload.Name || parsed.name || '',
    price: payload.Price,
    cost: payload.Cost,
    action: 'CREATED',
    error: '',
    updated: now
  });

  return { newItemId: newItemId, sourceRow: sourceRow };
}

function enp_actionHubReplaceSalesOrderLine_(job, sourceBundle, newItemId) {
  const sourceRow = sourceBundle.row;
  const sourceCol = sourceBundle.col;

  const soId = enp_num_(job.SOId || sourceRow[sourceCol['SalesOrderSalesOrderId']]);
  const qty = sourceCol['Quantity'] != null ? enp_num_(sourceRow[sourceCol['Quantity']]) : null;
  const rawDescription = enp_norm_(job.RawDescription || sourceRow[sourceCol['ItemDescription']]);

  if (!soId) throw new Error('Missing Sales Order ID.');
  if (!newItemId) throw new Error('Missing NewItemId.');

if (!enp_isStandardDescriptionFormat_(rawDescription)) {
  const salesRepName =
    sourceCol['SalesOrderSalesRepFullName'] != null
      ? enp_norm_(sourceRow[sourceCol['SalesOrderSalesRepFullName']])
      : '';

  const salesRepEmail = enp_getSalesRepEmailByName_(salesRepName);

  enp_sendInvalidDescriptionEmailToSalesRep_({
    recipientEmail: salesRepEmail,
    salesRepName: salesRepName,
    soId: soId,
    soNumber: sourceCol['SalesOrderNumber'] != null ? sourceRow[sourceCol['SalesOrderNumber']] : '',
    description: rawDescription
  });

  throw new Error('ItemDescription is not in standard format.');
}

const parsed = enp_parseDescription_(rawDescription);
if (!parsed.itemNumber || !parsed.name) {
  throw new Error('Could not parse labeled Item Number and Item Name from ItemDescription.');
}

  const so = enp_getSalesOrder_(soId);
  const lineItems = enp_getSalesOrderLineItems_(so);
  if (!lineItems.length) {
    throw new Error('Sales order has no line items.');
  }

  const targetLine = enp_findTargetPlaceholderLine_(lineItems, {
    desiredItemNumber: parsed.itemNumber,
    desiredQty: qty,
    newItemId: newItemId
  });

  if (!targetLine) {
    throw new Error('No matching placeholder line found for SO ' + soId + '.');
  }

  enp_setLineItemItemId_(targetLine, newItemId);

  const oldDesc = String(targetLine.description || targetLine.Description || '');

  Logger.log('PARSED: ' + JSON.stringify(parsed));
  Logger.log('OLD DESCRIPTION: ' + oldDesc);

  const cleanDescription = enp_buildCleanLineDescription_(parsed);
  Logger.log('CLEAN DESCRIPTION: ' + cleanDescription);

  // Always normalize description once we have a valid parsed item
  if (cleanDescription) {
    if ('description' in targetLine) targetLine.description = cleanDescription;
    if ('Description' in targetLine) targetLine.Description = cleanDescription;
  }

  // Only update price when the old line was still clearly a placeholder blob
  if (enp_isPlaceholderDescription_(oldDesc)) {
    if (parsed.price != null && parsed.price > 0) {
      enp_setLineItemPrice_(targetLine, parsed.price);
    }
  }

  const payload = enp_buildSalesOrderUpsertPayload_(so, lineItems);
  enp_strivenFetch_('/v1/sales-orders', {
    method: 'post',
    body: payload
  });

  if (sourceCol['LastAction'] != null) sourceRow[sourceCol['LastAction']] = 'DONE';
  if (sourceCol['LastError'] != null) sourceRow[sourceCol['LastError']] = '';
  if (sourceCol['LastUpdated'] != null) sourceRow[sourceCol['LastUpdated']] = new Date();
}


/* =========================================================
 * APPS SCRIPT — ACTION HUB SHEET HELPERS
 * ========================================================= */

function enp_getOrCreateActionHubSheet_() {
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName(ENP.SHEETS.HUB) || ss.insertSheet(ENP.SHEETS.HUB);

  if (sh.getLastRow() < 1) {
    sh.getRange(1, 1, 1, ENP.HUB.HEADERS.length).setValues([ENP.HUB.HEADERS]);
  } else {
    const actual = sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), ENP.HUB.HEADERS.length))
      .getValues()[0].map(enp_norm_);
    if (actual.length !== ENP.HUB.HEADERS.length ||
        actual.some((h, i) => h !== ENP.HUB.HEADERS[i])) {
      throw new Error('REVIEW_REQUIRED: ActionHub header order is incompatible; reconcile from backup before running.');
    }
    // Check values too: matching labels alone do not prove historical row alignment.
    const rows = sh.getDataRange().getValues().slice(1);
    const col = enp_indexByHeader_(actual);
    rows.forEach((row, i) => {
      if (!row.some(v => v !== '' && v != null)) return;
      const state = enp_normUpper_(row[col.State]);
      const attempts = Number(row[col.Attempts]);
      if (!['PENDING', 'RUNNING', 'DONE', 'FAILED', 'REVIEW'].includes(state) ||
          !Number.isInteger(attempts) || attempts < 0) {
        throw new Error('REVIEW_REQUIRED: ActionHub row ' + (i + 2) + ' has incompatible State/Attempts values.');
      }
    });
  }

  const currentLastCol = Math.max(sh.getLastColumn(), ENP.HUB.HEADERS.length);
  const headers = sh.getRange(1, 1, 1, currentLastCol).getValues()[0].map(enp_norm_);
  const col = enp_indexByHeader_(headers);
  enp_requireCols_(col, ENP.HUB.HEADERS);

  return sh;
}

function enp_actionHubRowToObject_(row, col) {
  const out = {};
  Object.keys(col).forEach(h => out[h] = row[col[h]]);
  return out;
}

function enp_actionHubIsRunnableRow_(row, col, now) {
  const state = enp_normUpper_(row[col['State']]);
  const attempts = Number(row[col['Attempts']] || 0);
  if (!Number.isInteger(attempts) || attempts < 0) return false;
  const nextRunAtVal = row[col['NextRunAt']];

  if (state === ENP.HUB.STATE_FAILED && !/(?:Striven[ :—-]*429\b|HTTP\s*429\b|Striven[ :—-]*5\d\d\b|HTTP\s*5\d\d\b)/i.test(String(row[col['LastError']] || ''))) return false;
  if (state !== ENP.HUB.STATE_PENDING && state !== ENP.HUB.STATE_FAILED) {
    return false;
  }

  if (attempts >= ENP.HUB.RUNNER_MAX_ATTEMPTS) {
    return false;
  }

  if (nextRunAtVal) {
    const nextRunAt = new Date(nextRunAtVal);
    if (isNaN(nextRunAt.getTime()) || nextRunAt.getTime() > now.getTime()) {
      return false;
    }
  }

  return true;
}

function enp_actionHubMarkRunning_(hubSheet, col, hubSheetRow, hubRow, now) {
  if (col['State'] != null) hubRow[col['State']] = ENP.HUB.STATE_RUNNING;
  if (col['LastRunAt'] != null) hubRow[col['LastRunAt']] = now;
  if (col['LastError'] != null) hubRow[col['LastError']] = '';
  hubSheet.getRange(hubSheetRow, 1, 1, hubRow.length).setValues([hubRow]);
}

function enp_actionHubMarkDone_(hubSheet, col, hubSheetRow, hubRow, now, message) {
  if (col['State'] != null) hubRow[col['State']] = ENP.HUB.STATE_DONE;
  if (col['LastRunAt'] != null) hubRow[col['LastRunAt']] = now;
  if (col['NextRunAt'] != null) hubRow[col['NextRunAt']] = '';
  if (col['LastError'] != null) hubRow[col['LastError']] = message || '';
  hubSheet.getRange(hubSheetRow, 1, 1, hubRow.length).setValues([hubRow]);
}

function enp_actionHubHandleFailure_(hubSheet, col, hubSheetRow, hubRow, err) {
  const attempts = Number((col['Attempts'] != null ? hubRow[col['Attempts']] : 0) || 0) + 1;
  const message = String(err && err.message ? err.message : err);
  const retryable = /(?:Striven[ :—-]*429\b|HTTP\s*429\b|Striven[ :—-]*5\d\d\b|HTTP\s*5\d\d\b)/i.test(message);
  const shouldStop = !retryable || attempts >= ENP.HUB.RUNNER_MAX_ATTEMPTS;
  const retryMinutes = Math.min(60, Math.max(5, attempts * 5));
  const nextRun = new Date(Date.now() + retryMinutes * 60 * 1000);

  if (col['Attempts'] != null) hubRow[col['Attempts']] = attempts;
  if (col['State'] != null) hubRow[col['State']] = shouldStop ? 'REVIEW' : ENP.HUB.STATE_PENDING;
  if (col['LastRunAt'] != null) hubRow[col['LastRunAt']] = new Date();
  if (col['NextRunAt'] != null) hubRow[col['NextRunAt']] = shouldStop ? '' : nextRun;
  if (col['LastError'] != null) hubRow[col['LastError']] = message;

  hubSheet.getRange(hubSheetRow, 1, 1, hubRow.length).setValues([hubRow]);
}


/* =========================================================
 * APPS SCRIPT — SOURCE SHEET WRITEBACK
 * ========================================================= */

function enp_getSourceRowBundle_(sourceSheet, rowNumber) {
  const grid = sourceSheet.getDataRange().getValues();
  const headers = grid[0].map(enp_norm_);
  const col = enp_indexByHeader_(headers);

  if (rowNumber < 2 || rowNumber > grid.length) {
    throw new Error('Invalid source row: ' + rowNumber);
  }

  return {
    headers: headers,
    col: col,
    row: grid[rowNumber - 1],
    rowNumber: rowNumber
  };
}

function enp_writeWholeSourceRow_(sourceSheet, rowNumber, row) {
  sourceSheet.getRange(rowNumber, 1, 1, row.length).setValues([row]);
}

function enp_actionHubWritebackDone_(sourceSheet, rowNumber, row, col, now) {
  if (col['LastAction'] != null) row[col['LastAction']] = 'DONE';
  if (col['LastError'] != null) row[col['LastError']] = '';
  if (col['LastUpdated'] != null) row[col['LastUpdated']] = now;
  enp_writeWholeSourceRow_(sourceSheet, rowNumber, row);
}

function enp_actionHubWritebackFailureSafe_(hubRow, hubCol, err) {
  try {
    const sourceSheetName = enp_norm_(hubRow[hubCol['SourceSheet']]);
    const sourceRowNumber = Number(hubRow[hubCol['SourceRow']] || 0);
    if (!sourceSheetName || !sourceRowNumber) return;

    const sourceSheet = SpreadsheetApp.getActive().getSheetByName(sourceSheetName);
    if (!sourceSheet) return;

    const bundle = enp_getSourceRowBundle_(sourceSheet, sourceRowNumber);
    const row = bundle.row;
    const col = bundle.col;
    enp_actionHubAssertSource_(enp_actionHubRowToObject_(hubRow, hubCol), row, col);

    if (col['LastAction'] != null) row[col['LastAction']] = 'FAILED';
    if (col['LastError'] != null) row[col['LastError']] = String(err && err.message ? err.message : err);
    if (col['LastUpdated'] != null) row[col['LastUpdated']] = new Date();

    enp_writeWholeSourceRow_(sourceSheet, sourceRowNumber, row);
  } catch (writeErr) {
    Logger.log('ActionHub writeback failed: ' + writeErr);
  }
}

// Prevent a refreshed report row from being mistaken for the queued source row.
function enp_actionHubAssertSource_(job, row, col) {
  const soId = enp_num_(row[col.SalesOrderSalesOrderId]);
  const qty = enp_num_(row[col.Quantity]);
  const desc = enp_norm_(row[col.ItemDescription]);
  if (!enp_num_(job.SOId) || soId !== enp_num_(job.SOId) ||
      qty !== enp_num_(job.Qty) || desc !== enp_norm_(job.RawDescription)) {
    throw new Error('REVIEW_REQUIRED: queued source row identity changed or is incomplete.');
  }
  const parsed = enp_parseDescription_(desc);
  if (!enp_isStandardDescriptionFormat_(desc) || !parsed.itemNumber || !parsed.name ||
      enp_normUpper_(parsed.itemNumber) !== enp_normUpper_(job.ParsedItemNumber)) {
    throw new Error('REVIEW_REQUIRED: source description does not match queued SKU.');
  }
  if (!enp_sourceRowShouldQueue_({getName: () => job.SourceSheet}, row, col)) {
    throw new Error('REVIEW_REQUIRED: source row is no longer eligible.');
  }
}

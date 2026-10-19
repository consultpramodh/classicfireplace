/************************************************************
 * APPS SCRIPT — 03_enternewpart_sync_and_actions.gs
 * ENTERNEWPART — REPORT SYNC + DIRECT SHEET ACTIONS
 *
 * PURPOSE
 * ----------------------------------------------------------
 * Unified logic for:
 * 1) Sync Approved report to Enternewpart
 * 2) Sync Quoted report to Enternewpart_Quoted
 * 3) Preserve action/result columns during refresh
 * 4) Create items from selected rows
 * 5) Replace sales-order placeholder lines from selected rows
 *
 * DEPENDS ON
 * ----------------------------------------------------------
 * 01_config_menu.gs
 * 02_striven_core.gs
 ************************************************************/


/* =========================================================
 * APPS SCRIPT — PUBLIC ENTRY POINTS
 * ========================================================= */

function enp_syncAllReports() {
  enp_syncItemsReport();
  enp_syncApprovedReport_();
  enp_syncQuotedReport_();

  SpreadsheetApp.getActive().toast(
    'Reports synced: Items, Approved, Quoted',
    'Enternewpart',
    5
  );
}

function enp_createItemsForActiveSheetSelection_(sh) {
  const ss = SpreadsheetApp.getActive();
  const ctx = enp_getSheetContext_(sh);

  enp_ensureActionColumns_(sh, ctx);
  const rows = enp_getSelectedRowNumbers_(sh);

  const data = sh.getDataRange().getValues();
  const headers = data[0].map(enp_norm_);
  const col = enp_indexByHeader_(headers);

  enp_requireCols_(col, [
    'ItemDescription',
    'LastAction',
    'LastError',
    'LastUpdated',
    'NewItemId'
  ]);

  const itemIndex = enp_buildItemIndex_();

  let created = 0;
  let exists = 0;
  let failed = 0;
  let skipped = 0;

  rows.forEach(rowIdx => {
    const row = data[rowIdx - 1];
    const now = new Date();

    try {
      const currentNewId = enp_num_(row[col['NewItemId']]);
      if (currentNewId) {
        skipped++;
        return;
      }

      const payload = enp_buildItemPayloadFromSheetRow_(row, col);
      const desiredNumber = enp_normUpper_(payload.ItemNumber || '');

      if (desiredNumber) {
        const existingId = enp_lookupItemId_(desiredNumber, itemIndex);
        if (existingId) {
          enp_writeCreateResultToRow_(row, col, {
            newItemId: existingId,
            itemNumber: payload.ItemNumber || '',
            itemName: payload.Name || '',
            price: payload.Price,
            cost: payload.Cost,
            action: 'EXISTS',
            error: '',
            updated: now
          });

          exists++;
          sh.getRange(rowIdx, 1, 1, headers.length).setValues([row]);
          return;
        }
      }

      const res = enp_createItemInStriven_(payload);
      const newItemId = enp_extractItemId_(res);
      if (!newItemId) {
        throw new Error('Create succeeded but no item id was returned.');
      }

      if (desiredNumber) {
        itemIndex[desiredNumber] = newItemId;
      }

      enp_writeCreateResultToRow_(row, col, {
        newItemId: newItemId,
        itemNumber: payload.ItemNumber || '',
        itemName: payload.Name || '',
        price: payload.Price,
        cost: payload.Cost,
        action: 'CREATED',
        error: '',
        updated: now
      });

      created++;
    } catch (err) {
      row[col['LastAction']] = 'CREATE FAILED';
      row[col['LastError']] = String(err && err.message ? err.message : err);
      row[col['LastUpdated']] = now;
      failed++;
    }

    sh.getRange(rowIdx, 1, 1, headers.length).setValues([row]);
  });

  ss.toast(
    'Create complete — CREATED=' + created +
    ' EXISTS=' + exists +
    ' FAIL=' + failed +
    ' SKIP=' + skipped,
    'Enternewpart',
    6
  );
}

function enp_replaceLinesForActiveSheetSelection_(sh) {
  const ss = SpreadsheetApp.getActive();
  const ctx = enp_getSheetContext_(sh);

  enp_ensureActionColumns_(sh, ctx);
  const rows = enp_getSelectedRowNumbers_(sh);

  const data = sh.getDataRange().getValues();
  const headers = data[0].map(enp_norm_);
  const col = enp_indexByHeader_(headers);

  enp_requireCols_(col, [
    'SalesOrderSalesOrderId',
    'ItemNumber',
    'ItemDescription',
    'Quantity',
    'NewItemId',
    'LastAction',
    'LastError',
    'LastUpdated'
  ]);

  let done = 0;
  let failed = 0;
  let skipped = 0;

  rows.forEach(rowIdx => {
    const row = data[rowIdx - 1];
    const now = new Date();

    try {
      const soId = enp_num_(row[col['SalesOrderSalesOrderId']]);
      const oldItemNumber = enp_norm_(row[col['ItemNumber']]);
      const rawDescription = enp_norm_(row[col['ItemDescription']]);
      const newItemId = enp_num_(row[col['NewItemId']]);
      const qty = enp_num_(row[col['Quantity']]);


const salesRepName =
  col['SalesOrderSalesRepFullName'] != null
    ? enp_norm_(row[col['SalesOrderSalesRepFullName']])
    : '';

const salesRepEmail = enp_getSalesRepEmailByName_(salesRepName);

if (!enp_isStandardDescriptionFormat_(rawDescription)) {
  enp_sendInvalidDescriptionEmailToSalesRep_({
    recipientEmail: salesRepEmail,
    salesRepName: salesRepName,
    soId: soId,
    soNumber: col['SalesOrderNumber'] != null ? row[col['SalesOrderNumber']] : '',
    description: rawDescription
  });

  throw new Error('ItemDescription is not in standard format.');
}


      if (!soId) throw new Error('Missing SalesOrderSalesOrderId.');
      if (!newItemId) throw new Error('Missing NewItemId. Create item first.');
      if (enp_normUpper_(oldItemNumber) !== enp_normUpper_(ENP.VALUES.PLACEHOLDER_ITEMNUMBER)) {
        skipped++;
        return;
      }

      const parsed = enp_parseDescription_(rawDescription);
      if (!parsed.itemNumber) {
        throw new Error('ItemDescription must contain "Item Number:".');
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
        throw new Error('No matching placeholder line found on SO ' + soId + '.');
      }

      enp_setLineItemItemId_(targetLine, newItemId);

      const oldDesc = String(targetLine.description || targetLine.Description || '');
      if (enp_isPlaceholderDescription_(oldDesc)) {
        Logger.log('PARSED: ' + JSON.stringify(parsed));
Logger.log('CLEAN DESCRIPTION: ' + enp_buildCleanLineDescription_(parsed));
        const cleanDescription = enp_buildCleanLineDescription_(parsed);
        if ('description' in targetLine) targetLine.description = cleanDescription;
        if ('Description' in targetLine) targetLine.Description = cleanDescription;

        if (parsed.price != null && parsed.price > 0) {
          enp_setLineItemPrice_(targetLine, parsed.price);
        }
      }

      const payload = enp_buildSalesOrderUpsertPayload_(so, lineItems);
      enp_strivenFetch_('/v1/sales-orders', {
        method: 'post',
        body: payload
      });

      row[col['LastAction']] = 'REPLACED SO=' + soId;
      row[col['LastError']] = '';
      row[col['LastUpdated']] = now;
      done++;
    } catch (err) {
      row[col['LastAction']] = 'REPLACE FAILED';
      row[col['LastError']] = String(err && err.message ? err.message : err);
      row[col['LastUpdated']] = now;
      failed++;
    }

    sh.getRange(rowIdx, 1, 1, headers.length).setValues([row]);
  });

  ss.toast(
    'Replace complete — OK=' + done +
    ' FAIL=' + failed +
    ' SKIP=' + skipped,
    'Enternewpart',
    6
  );
}


/* =========================================================
 * APPS SCRIPT — REPORT SYNC
 * ========================================================= */

function enp_syncApprovedReport_() {
  const url = enp_getScriptProp_(ENP.PROPS.APPROVED_REPORT_URL, true);
  enp_syncReportToSheet_({
    url: url,
    sheetName: ENP.SHEETS.APPROVED,
    baseHeaders: ENP.APPROVED_HEADERS,
    actionHeaders: ENP.ACTION_HEADERS
  });
}

function enp_syncQuotedReport_() {
  const url = enp_getScriptProp_(ENP.PROPS.QUOTED_REPORT_URL, true);
  enp_syncReportToSheet_({
    url: url,
    sheetName: ENP.SHEETS.QUOTED,
    baseHeaders: ENP.APPROVED_HEADERS,
    actionHeaders: ENP.QUOTED_ACTION_HEADERS
  });
}

function enp_syncReportToSheet_(cfg) {
  const body = enp_fetchReportJson_(cfg.url);
  const rows = enp_extractReportRows_(body);

  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName(cfg.sheetName) || ss.insertSheet(cfg.sheetName);

  const existingGrid = sh.getDataRange().getValues();
  const existingHeaders = existingGrid.length ? existingGrid[0].map(enp_norm_) : [];
  const existingCol = enp_indexByHeader_(existingHeaders);

  const actionStateByKey = {};
  if (existingGrid.length > 1) {
    for (let i = 1; i < existingGrid.length; i++) {
      const row = existingGrid[i];
      const key = enp_makeRowKeyFromSheetRow_(row, existingCol);
      if (!key) continue;

      const state = {};
      (cfg.actionHeaders || []).forEach(h => {
        if (existingCol[h] != null) {
          state[h] = row[existingCol[h]];
        }
      });
      actionStateByKey[key] = state;
    }
  }

  const allHeaders = cfg.baseHeaders.concat(cfg.actionHeaders || []);
  const out = [allHeaders];

  rows.forEach(obj => {
    const rowMap = enp_normalizeReportObject_(obj);
    const rowKey = enp_makeRowKeyFromObject_(rowMap);
    const preserved = actionStateByKey[rowKey] || {};

    const outRow = [];
    cfg.baseHeaders.forEach(h => outRow.push(rowMap[h] != null ? rowMap[h] : ''));
    (cfg.actionHeaders || []).forEach(h => outRow.push(preserved[h] != null ? preserved[h] : ''));

    out.push(outRow);
  });

  sh.clearContents();
  sh.getRange(1, 1, out.length, allHeaders.length).setValues(out);
  sh.getRange(1, 1, 1, allHeaders.length).setFontWeight('bold');
  sh.setFrozenRows(1);
}


/* =========================================================
 * APPS SCRIPT — REPORT HELPERS
 * ========================================================= */

function enp_fetchReportJson_(url) {
  const res = UrlFetchApp.fetch(url, {
    method: 'get',
    muteHttpExceptions: true
  });

  const code = res.getResponseCode();
  const text = res.getContentText();

  if (code !== 200) {
    throw new Error('Report fetch failed: HTTP ' + code + ' — ' + text);
  }

  return JSON.parse(text);
}

function enp_extractReportRows_(body) {
  if (Array.isArray(body)) return body;
  if (Array.isArray(body.rows)) return body.rows;
  if (Array.isArray(body.data)) return body.data;
  if (body.Data && Array.isArray(body.Data)) return body.Data;
  if (body.Results && Array.isArray(body.Results)) return body.Results;
  return [];
}

function enp_normalizeReportObject_(obj) {
  const out = {};
  Object.keys(obj || {}).forEach(k => {
    out[String(k).trim()] = obj[k];
  });
  return out;
}

function enp_makeRowKeyFromObject_(obj) {
  const soId = enp_norm_(obj['SalesOrderSalesOrderId']);
  const itemId = enp_norm_(obj['ItemItemId']);
  const itemNumber = enp_normUpper_(obj['ItemNumber']);
  const qty = enp_norm_(obj['Quantity']);
  const desc = enp_normUpper_(obj['ItemDescription']);
  const price = enp_norm_(obj['Price']);

  if (!soId && !desc) return '';
  return [soId, itemId, itemNumber, qty, price, desc].join('|');
}

function enp_makeRowKeyFromSheetRow_(row, col) {
  if (!row || !col) return '';
  return enp_makeRowKeyFromObject_({
    SalesOrderSalesOrderId: col['SalesOrderSalesOrderId'] != null ? row[col['SalesOrderSalesOrderId']] : '',
    ItemItemId: col['ItemItemId'] != null ? row[col['ItemItemId']] : '',
    ItemNumber: col['ItemNumber'] != null ? row[col['ItemNumber']] : '',
    Quantity: col['Quantity'] != null ? row[col['Quantity']] : '',
    Price: col['Price'] != null ? row[col['Price']] : '',
    ItemDescription: col['ItemDescription'] != null ? row[col['ItemDescription']] : ''
  });
}


/* =========================================================
 * APPS SCRIPT — SHEET CONTEXT + COLUMNS
 * ========================================================= */

function enp_getSheetContext_(sh) {
  const name = sh.getName();

  if (name === ENP.SHEETS.APPROVED) {
    return {
      type: 'approved',
      actionHeaders: ENP.ACTION_HEADERS
    };
  }

  if (name === ENP.SHEETS.QUOTED) {
    return {
      type: 'quoted',
      actionHeaders: ENP.QUOTED_ACTION_HEADERS
    };
  }

  throw new Error('Unsupported sheet: ' + name);
}

function enp_ensureActionColumns_(sh, ctx) {
  enp_ensureHeaders_(sh, ctx.actionHeaders);
}


/* =========================================================
 * APPS SCRIPT — ITEM CREATE HELPERS
 * ========================================================= */

function enp_buildItemPayloadFromSheetRow_(row, col) {
  const props = PropertiesService.getScriptProperties();

  const parsed = enp_parseDescription_(
    col['ItemDescription'] != null ? row[col['ItemDescription']] : ''
  );

  const explicitNumber = col['NewItemNumber'] != null ? enp_norm_(row[col['NewItemNumber']]) : '';
  const explicitName = col['NewItemName'] != null ? enp_norm_(row[col['NewItemName']]) : '';
  const explicitPrice = col['NewItemPrice'] != null ? enp_num_(row[col['NewItemPrice']]) : null;
  const explicitCost = col['NewItemCost'] != null ? enp_num_(row[col['NewItemCost']]) : null;

  const itemNumber = explicitNumber || parsed.itemNumber || '';
  const name = explicitName || parsed.name || '';
  const price = explicitPrice != null ? explicitPrice : (parsed.price != null ? parsed.price : 0);
  const cost = explicitCost != null ? explicitCost : 0;

  if (!itemNumber) {
    throw new Error('Could not derive Item Number from ItemDescription.');
  }

  if (!name) {
    throw new Error('Could not derive Item Name from ItemDescription.');
  }

  if (enp_normUpper_(itemNumber) === enp_normUpper_(ENP.VALUES.PLACEHOLDER_ITEMNUMBER)) {
    throw new Error('Item number is still the placeholder ENTERNEWPART.');
  }

  const typeId =
    enp_num_(props.getProperty(ENP.PROPS.DEFAULT_ITEMTYPE_ID)) ||
    enp_num_(props.getProperty('ENTERNEWPART_DEFAULT_ITEM_TYPE_ID'));

  if (!typeId) {
    throw new Error('Missing default item type id in Script Properties.');
  }

  const payload = {
    Id: 0,
    ItemNumber: itemNumber,
    Name: name,
    Description: name,
    Price: price,
    Cost: cost,
    Active: true,
    Taxable: true,
    ItemType: { Id: typeId }
  };

  const incomeId = enp_num_(props.getProperty(ENP.PROPS.DEFAULT_INCOME_GL_ID));
  const inventoryId = enp_num_(props.getProperty(ENP.PROPS.DEFAULT_INVENTORY_GL_ID));
  const cogsId = enp_num_(props.getProperty(ENP.PROPS.DEFAULT_COGS_GL_ID));
  const locationId = enp_num_(props.getProperty(ENP.PROPS.DEFAULT_LOCATION_ID));

  if (incomeId) payload.IncomeGLAccount = { Id: incomeId };
  if (inventoryId) payload.InventoryAssetGLAccount = { Id: inventoryId };
  if (cogsId) payload.COGSGLAccount = { Id: cogsId };
  if (locationId) payload.DefaultInventoryLocation = { Id: locationId };

  return payload;
}

function enp_extractItemId_(res) {
  if (!res) return null;
  if (typeof res === 'number') return res;
  if (res.Id) return res.Id;
  if (res.id) return res.id;
  if (res.Data && typeof res.Data === 'object') {
    if (res.Data.Id) return res.Data.Id;
    if (res.Data.id) return res.Data.id;
  }
  return null;
}

function enp_writeCreateResultToRow_(row, col, result) {
  if (col['NewItemId'] != null) row[col['NewItemId']] = result.newItemId || '';
  if (col['NewItemNumber'] != null) row[col['NewItemNumber']] = result.itemNumber || '';
  if (col['NewItemName'] != null) row[col['NewItemName']] = result.itemName || '';
  if (col['NewItemPrice'] != null) row[col['NewItemPrice']] = result.price != null ? result.price : '';
  if (col['NewItemCost'] != null) row[col['NewItemCost']] = result.cost != null ? result.cost : '';
  if (col['LastAction'] != null) row[col['LastAction']] = result.action || '';
  if (col['LastError'] != null) row[col['LastError']] = result.error || '';
  if (col['LastUpdated'] != null) row[col['LastUpdated']] = result.updated || '';
}


/* =========================================================
 * APPS SCRIPT — SALES ORDER REPLACE HELPERS
 * ========================================================= */

function enp_getSalesOrderLineItems_(so) {
  const c =
    so.lineItems ||
    so.LineItems ||
    (so.Data && (so.Data.lineItems || so.Data.LineItems)) ||
    [];
  return Array.isArray(c) ? c : [];
}

function enp_findTargetPlaceholderLine_(lineItems, opts) {
  const desiredToken = enp_tokenize_(opts.desiredItemNumber || '');
  const desiredQty = opts.desiredQty;
  const newItemId = enp_num_(opts.newItemId);

  const matches = lineItems.filter(li => {
    const itemId = enp_num_(li && li.item && li.item.id) ||
      enp_num_(li && li.Item && li.Item.Id);

    if (itemId !== ENP.VALUES.PLACEHOLDER_ITEM_ID && itemId !== newItemId) {
      return false;
    }

    const liQty =
      enp_num_(li.qty) ||
      enp_num_(li.Qty) ||
      enp_num_(li.quantity) ||
      enp_num_(li.Quantity);

    if (desiredQty != null && liQty != null && desiredQty !== liQty) {
      return false;
    }

    const desc = String(li.description || li.Description || '');
    const descToken = enp_tokenize_(desc);
    return desiredToken && descToken.indexOf(desiredToken) >= 0;
  });

  if (matches.length === 1) return matches[0];
  if (matches.length > 1) {
    throw new Error('Ambiguous line match. More than one placeholder line matches.');
  }
  return null;
}

function enp_isPlaceholderDescription_(desc) {
  const t = enp_normUpper_(desc);
  return t.indexOf('ITEM NUMBER') >= 0 && t.indexOf('ITEM NAME') >= 0;
}

function enp_buildCleanLineDescription_(parsed) {
  const name = enp_norm_(parsed && parsed.name);
  const itemNumber = enp_norm_(parsed && parsed.itemNumber);

  if (name && itemNumber) {
    return name + ' (' + itemNumber + ')';
  }

  if (name) return name;

  if (itemNumber) return '(' + itemNumber + ')';

  return '';
}

function enp_setLineItemItemId_(li, newItemId) {
  if (li.item && typeof li.item === 'object') {
    li.item.id = newItemId;
    if (li.item.Id != null) li.item.Id = newItemId;
  }
  if (li.Item && typeof li.Item === 'object') {
    li.Item.Id = newItemId;
    if (li.Item.id != null) li.Item.id = newItemId;
  }
}

function enp_setLineItemPrice_(li, price) {
  if ('price' in li) li.price = price;
  if ('Price' in li) li.Price = price;
  if ('unitPrice' in li) li.unitPrice = price;
  if ('UnitPrice' in li) li.UnitPrice = price;
}

function enp_buildSalesOrderUpsertPayload_(so, lineItems) {
  return {
    id: so.id || so.Id || 0,
    Id: so.Id || so.id || 0,
    orderNumber: so.orderNumber || so.OrderNumber || '',
    OrderNumber: so.OrderNumber || so.orderNumber || '',
    customer: so.customer || so.Customer || null,
    Customer: so.Customer || so.customer || null,
    orderDate: so.orderDate || so.OrderDate || null,
    OrderDate: so.OrderDate || so.orderDate || null,
    status: so.status || so.Status || null,
    Status: so.Status || so.status || null,
    salesRep: so.salesRep || so.SalesRep || null,
    SalesRep: so.SalesRep || so.salesRep || null,
    shipToLocation: so.shipToLocation || so.ShipToLocation || null,
    ShipToLocation: so.ShipToLocation || so.shipToLocation || null,
    billToLocation: so.billToLocation || so.BillToLocation || null,
    BillToLocation: so.BillToLocation || so.billToLocation || null,
    customerPONumber: so.customerPONumber || so.CustomerPONumber || '',
    CustomerPONumber: so.CustomerPONumber || so.customerPONumber || '',
    lineItems: lineItems,
    LineItems: lineItems
  };
}

function enp_tokenize_(value) {
  return enp_normUpper_(value).replace(/\s+/g, ' ');
}
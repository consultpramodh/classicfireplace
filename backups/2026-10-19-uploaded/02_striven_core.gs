/************************************************************
 * APPS SCRIPT — 02_striven_core.gs
 * ENTERNEWPART — STRIVEN CORE + UTILITIES
 *
 * PURPOSE
 * ----------------------------------------------------------
 * Single shared engine for:
 * - OAuth token management
 * - HTTP requests to Striven
 * - Items report sync
 * - Item description parsing
 * - Shared utilities used by all modules
 *
 * NOTHING ELSE should implement Striven auth or fetch logic.
 ************************************************************/


/* =========================================================
 * APPS SCRIPT — OAUTH TOKEN
 * ========================================================= */

function enp_getStrivenHeaders_() {
  const props = PropertiesService.getScriptProperties();

  const baseUrl = enp_getScriptProp_(ENP.PROPS.BASE_URL, true);
  const clientId = enp_getScriptProp_(ENP.PROPS.CLIENT_ID, true);
  const clientSecret = enp_getScriptProp_(ENP.PROPS.CLIENT_SECRET, true);

  let token = props.getProperty(ENP.PROPS.TOKEN);
  const expires = Number(props.getProperty(ENP.PROPS.TOKEN_EXPIRES) || 0);

  if (!token || Date.now() > expires) {
    const res = UrlFetchApp.fetch(baseUrl + '/oauth2/token', {
      method: 'post',
      payload: {
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret
      },
      muteHttpExceptions: true
    });

    const code = res.getResponseCode();
    const text = res.getContentText();

    if (code !== 200) {
      throw new Error('Token request failed: ' + code + ' — ' + text);
    }

    const body = JSON.parse(text);

    token = body.access_token;
    const ttl = Number(body.expires_in || 3600);

    props.setProperty(ENP.PROPS.TOKEN, token);
    props.setProperty(
      ENP.PROPS.TOKEN_EXPIRES,
      String(Date.now() + ttl * 1000 - 60000)
    );
  }

  return {
    Authorization: 'Bearer ' + token,
    'Content-Type': 'application/json'
  };
}


/* =========================================================
 * APPS SCRIPT — HTTP WRAPPER
 * ========================================================= */

function enp_strivenFetch_(path, options) {
  const baseUrl = enp_getScriptProp_(ENP.PROPS.BASE_URL, true);

  const url = path.startsWith('http')
    ? path
    : baseUrl.replace(/\/$/, '') + '/' + path.replace(/^\//, '');

  const headers = enp_getStrivenHeaders_();

  const res = UrlFetchApp.fetch(url, {
    method: options.method || 'get',
    headers: headers,
    payload: options.body ? JSON.stringify(options.body) : null,
    muteHttpExceptions: true
  });

  const code = res.getResponseCode();
  const text = res.getContentText();

  if (code < 200 || code >= 300) {
    throw new Error('Striven ' + code + ' — ' + text);
  }

  return text ? JSON.parse(text) : null;
}


/* =========================================================
 * APPS SCRIPT — ITEMS REPORT SYNC
 * ========================================================= */

function enp_syncItemsReport() {
  const url = enp_getScriptProp_(ENP.PROPS.ITEMS_REPORT_URL, true);

  const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  const code = res.getResponseCode();
  const text = res.getContentText();

  if (code !== 200) {
    throw new Error('Items report error: ' + code);
  }

  const body = JSON.parse(text);
  const rows = body.rows || body.data || [];

  if (!rows.length) return;

  const headers = Object.keys(rows[0]);

  const ss = SpreadsheetApp.getActive();
  const sh =
    ss.getSheetByName(ENP.SHEETS.ITEMS) ||
    ss.insertSheet(ENP.SHEETS.ITEMS);

  sh.clear();

  sh.getRange(1, 1, 1, headers.length)
    .setValues([headers])
    .setFontWeight('bold');

  const values = rows.map(r => headers.map(h => r[h]));

  sh.getRange(2, 1, values.length, headers.length)
    .setValues(values);

  sh.setFrozenRows(1);
}


/* =========================================================
 * APPS SCRIPT — DESCRIPTION PARSER
 * ========================================================= */

function enp_parseDescription_(text) {
  const raw = String(text == null ? '' : text)
    .replace(/\r/g, '')
    .trim();

  const normalized = raw.replace(/[ \t]+/g, ' ');

  const itemNumberMatch = normalized.match(/Item\s*Number\s*:\s*(.+?)(?=\s+Item\s*Name\s*:|\s+Price\s*:|$)/i);
  const itemNameMatch   = normalized.match(/Item\s*Name\s*:\s*(.+?)(?=\s+Price\s*:|$)/i);
  const priceMatch      = normalized.match(/Price\s*:\s*\$?\s*([0-9]+(?:\.[0-9]{1,2})?)/i);

  const itemNumber = itemNumberMatch ? String(itemNumberMatch[1]).trim() : '';
  const name = itemNameMatch ? String(itemNameMatch[1]).trim() : '';
  const price = priceMatch ? Number(priceMatch[1]) : null;

  return {
    raw: raw,
    itemNumber: itemNumber,
    name: name,
    price: price
  };
}

/************************************************************
 * APPS SCRIPT — INVALID DESCRIPTION EMAIL HELPERS
 ************************************************************/

function enp_isStandardDescriptionFormat_(text) {
  const raw = String(text == null ? '' : text).replace(/\r/g, '').trim();

  const hasItemNumber = /Item\s*Number\s*:\s*.+/i.test(raw);
  const hasItemName   = /Item\s*Name\s*:\s*.+/i.test(raw);
  const hasPrice      = /Price\s*:\s*\$?\s*[0-9]+(?:\.[0-9]{1,2})?/i.test(raw);

  return hasItemNumber && hasItemName && hasPrice;
}

function enp_getSalesRepEmailByName_(fullName) {
  const map = {
    'Babz Boehm': 'babz@classicfireplace.ca',
    'Bruce Gowanlock': 'bruce@classicfireplace.ca',
    'Thang Tran': 'thang@classicfireplace.ca',
    'John Hoang': 'john@classicfireplace.ca',
    'Irina Tyrina': 'irina@classicfireplace.ca',
    'Joshua Malcolm': 'Josh@classicfireplace.ca',
    'Karen Genis': 'karen@classicfireplace.ca',
    'Spencer Bambek': 'spencer@classicfireplace.ca',
    'Adam Stokes': 'adam@classicfireplace.ca',
    'Edward McLennon': 'edward@classicfireplace.ca',
    'Colleen Trevor': 'colleen@classicfireplace.ca',
    'Classic Fireplace': 'info@classicfireplace.ca',
    'Terry Ryan': 'terry@classicfireplace.ca',
    'Karen Goldman': 'service@classicfireplace.ca',
    'Travis Mason': 'communitygas@gmail.com',
    'Chris Olomojobi': 'roccenterprises@gmail.com',
    'Steve Trevor': 'steve@classicfireplace.ca',
    'Matthew McLean': 'matthew@classicfireplace.ca',
    'Stephen Foley': 'Stephen@classicfireplace.ca',
    'Trevor Burke': 'trevor@classicfireplace.ca',
    'Pramodh Kumar': 'pramodh@classicfireplace.ca',
    'Matthew Thompson': 'matt@classicfireplace.ca',
    'Warren Jennings': 'warren@classicfireplace.ca'
  };

  const key = enp_norm_(fullName);
  return map[key] || '';
}

function enp_sendInvalidDescriptionEmailToSalesRep_(info) {
  const salesRepName = enp_norm_(info && info.salesRepName) || 'Sales Rep';
  const intendedRecipient = enp_norm_(info && info.recipientEmail);
  const soNumber = enp_norm_(info && info.soNumber) || enp_norm_(info && info.soId) || 'Unknown';
  const description = String(info && info.description != null ? info.description : '').trim();

  const testMode = !!(ENP.EMAIL && ENP.EMAIL.INVALID_DESC_ALERT_TEST_MODE);
  const testRecipient = enp_norm_(ENP.EMAIL && ENP.EMAIL.INVALID_DESC_ALERT_TEST_EMAIL);

  const finalRecipient = testMode ? testRecipient : intendedRecipient;
  if (!finalRecipient) return;

  const subject = 'ENTERNEWPART details are not in standard format ' + soNumber;

let body =
  'Hi ' + salesRepName + ',\n\n' +
  'The new item details for Sales Order ' + soNumber + ' could not be processed.\n\n' +
  'Please enter the new item details in the Standard format:\n\n' +
  'Item Number: ####\n' +
  'Item Name: ####\n' +
  'Price: $####\n\n' +
  'Thank you.\n';

  if (testMode) {
    body =
      '[TEST MODE — email not sent to sales rep]\n' +
      'Intended recipient: ' + (intendedRecipient || '[missing]') + '\n\n' +
      body;
  }

  MailApp.sendEmail({
    to: finalRecipient,
    subject: subject,
    body: body
  });
  Logger.log('Final recipient: ' + finalRecipient);
}



/************************************************************
 * APPS SCRIPT — TEST INVALID DESCRIPTION EMAIL
 ************************************************************/

function enp_testInvalidDescriptionEmail() {
  const testSalesRepName = 'John Hoang';
  const testEmail = enp_getSalesRepEmailByName_(testSalesRepName);

  const badDescription =
    '128419 Glass Ceramic Left F600 (PIC) $204';

  enp_sendInvalidDescriptionEmailToSalesRep_({
    recipientEmail: testEmail,
    salesRepName: testSalesRepName,
    soId: 'TEST-SO-001',
    soNumber: 'TEST-SO-001',
    description: badDescription
  });

  SpreadsheetApp.getActive().toast(
    'Test email triggered (check inbox)',
    'Enternewpart',
    5
  );
}

/* =========================================================
 * APPS SCRIPT — ITEM LOOKUP HELPERS
 * ========================================================= */

function enp_buildItemIndex_() {
  const sh = SpreadsheetApp.getActive().getSheetByName(ENP.SHEETS.ITEMS);
  if (!sh) return {};

  const data = sh.getDataRange().getValues();
  if (data.length < 2) return {};

  const headers = data[0];
  const col = enp_indexByHeader_(headers);

  const numberCol =
    col.ItemNumber ?? col.itemNumber ?? col.Number ?? col.SKU;
  const idCol = col.Id ?? col.id;

  if (numberCol == null || idCol == null) return {};

  const index = {};

  for (let i = 1; i < data.length; i++) {
    const num = enp_normUpper_(data[i][numberCol]);
    const id = enp_num_(data[i][idCol]);
    if (num && id) index[num] = id;
  }

  return index;
}

function enp_lookupItemId_(itemNumber, index) {
  if (!itemNumber) return null;
  return index[enp_normUpper_(itemNumber)] || null;
}


/* =========================================================
 * APPS SCRIPT — ITEM CREATE
 * ========================================================= */

function enp_createItemInStriven_(payload) {
  return enp_strivenFetch_('/v1/items', {
    method: 'post',
    body: payload
  });
}


/* =========================================================
 * APPS SCRIPT — SALES ORDER UPDATE
 * ========================================================= */

function enp_getSalesOrder_(id) {
  return enp_strivenFetch_('/v1/sales-orders/' + id, {
    method: 'get'
  });
}

function enp_updateSalesOrder_(id, body) {
  return enp_strivenFetch_('/v1/sales-orders/' + id, {
    method: 'put',
    body: body
  });
}











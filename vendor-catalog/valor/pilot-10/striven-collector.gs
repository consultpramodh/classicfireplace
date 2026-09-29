/**
 * Valor 10-fireplace Striven read-only collector.
 *
 * Purpose:
 *   1) Read the 10 resolved Striven Item IDs.
 *   2) GET /v1/items/{id}
 *   3) GET /v1/items/{id}/images
 *   4) Return a structured object for review/import planning.
 *
 * Safety:
 *   - NO POST/PATCH/PUT/DELETE calls.
 *   - NO Striven writes.
 *   - Credentials must exist in Apps Script Script Properties:
 *       CLIENT_ID
 *       CLIENT_SECRET
 */

const VALOR_PILOT_10_ITEMS = Object.freeze([
  { itemNumber: '200AN',  itemId: 39799 },
  { itemNumber: '530VN',  itemId: 42895 },
  { itemNumber: '534VN',  itemId: 41479 },
  { itemNumber: '1000MN', itemId: 41622 },
  { itemNumber: '1100MN', itemId: 37548 },
  { itemNumber: '1400MN', itemId: 36083 },
  { itemNumber: '1500KN', itemId: 36045 },
  { itemNumber: '1600KN', itemId: 24098 },
  { itemNumber: '1700KN', itemId: 24111 },
  { itemNumber: '1800KN', itemId: 36046 }
]);

function valorPilot10_collectFromStriven() {
  const token = valorPilot10_getAccessToken_();

  const results = VALOR_PILOT_10_ITEMS.map(function(target) {
    const itemUrl =
      'https://api.striven.com/v1/items/' +
      encodeURIComponent(target.itemId);

    const imagesUrl =
      itemUrl + '/images';

    const item = valorPilot10_getJson_(itemUrl, token);
    const images = valorPilot10_getJson_(imagesUrl, token);

    const actualItemNumber = String(item && item.ItemNumber || '').trim();

    if (actualItemNumber !== target.itemNumber) {
      throw new Error(
        'Item ID mismatch. Expected ' +
        target.itemNumber +
        ' at Striven Item ID ' +
        target.itemId +
        ', but API returned "' +
        actualItemNumber +
        '".'
      );
    }

    return {
      requested: target,
      item: item,
      images: images,
      summary: valorPilot10_summarizeItem_(item, images)
    };
  });

  const output = {
    collectedAt: new Date().toISOString(),
    source: 'Striven API',
    mode: 'READ_ONLY',
    itemCount: results.length,
    apiCalls: results.length * 2 + 1,
    results: results
  };

  Logger.log(JSON.stringify(output, null, 2));
  return output;
}

function valorPilot10_summarizeItem_(item, imagesPayload) {
  item = item || {};
  imagesPayload = imagesPayload || {};

  const images = Array.isArray(imagesPayload.Data)
    ? imagesPayload.Data
    : [];

  return {
    Id: item.Id,
    ItemNumber: item.ItemNumber,
    Name: item.Name,

    ItemType: valorPilot10_ref_(item.ItemType),
    Category: valorPilot10_ref_(item.Category),
    Division: valorPilot10_ref_(item.Division),

    PreferredVendor: valorPilot10_vendorRef_(item.PreferredVendor),
    Manufacturer: valorPilot10_vendorRef_(item.Manufacturer),
    ManufacturePartNumber: item.ManufacturePartNumber || '',

    Description: item.Description || '',
    InternalNotes: item.InternalNotes || null,

    Price: item.Price,
    Cost: item.Cost,
    Taxable: item.Taxable,
    Weight: item.Weight,

    IsShippingRequired: item.IsShippingRequired,
    ShippingPrice: item.ShippingPrice,
    ShippingPerc: item.ShippingPerc,

    DefaultInventoryLocation:
      valorPilot10_ref_(item.DefaultInventoryLocation),

    ReorderPoint: item.ReorderPoint,
    ReorderAmount: item.ReorderAmount,
    QtyOnHand: item.QtyOnHand,
    QtyAvailable: item.QtyAvailable,

    BarcodeValue: item.BarcodeValue || '',
    MaxQuantity: item.MaxQuantity,

    CustomFields: Array.isArray(item.CustomFields)
      ? item.CustomFields
      : [],

    Active: item.Active,
    DateCreated: item.DateCreated || '',
    CreatedBy: valorPilot10_ref_(item.CreatedBy),
    LastUpdatedDate: item.LastUpdatedDate || '',
    LastUpdatedBy: valorPilot10_ref_(item.LastUpdatedBy),

    ImageCount:
      Number(imagesPayload.TotalCount != null
        ? imagesPayload.TotalCount
        : images.length),

    Images: images
  };
}

function valorPilot10_ref_(value) {
  if (!value || typeof value !== 'object') return null;
  return {
    Id: value.Id != null ? value.Id : null,
    Name: value.Name != null ? value.Name : ''
  };
}

function valorPilot10_vendorRef_(value) {
  if (!value || typeof value !== 'object') return null;
  return {
    Id: value.Id != null ? value.Id : null,
    Number: value.Number != null ? value.Number : '',
    Name: value.Name != null ? value.Name : ''
  };
}

function valorPilot10_getJson_(url, token) {
  const response = UrlFetchApp.fetch(url, {
    method: 'get',
    headers: {
      Authorization: 'Bearer ' + token,
      Accept: 'application/json'
    },
    muteHttpExceptions: true
  });

  const code = response.getResponseCode();
  const text = response.getContentText();

  if (code < 200 || code >= 300) {
    throw new Error(
      'Striven GET failed HTTP ' +
      code +
      ' for ' +
      url +
      ': ' +
      String(text || '').slice(0, 500)
    );
  }

  try {
    return text ? JSON.parse(text) : null;
  } catch (err) {
    throw new Error(
      'Striven GET returned non-JSON content for ' + url + '.'
    );
  }
}

function valorPilot10_getAccessToken_() {
  const props = PropertiesService.getScriptProperties();
  const clientId = String(props.getProperty('CLIENT_ID') || '').trim();
  const clientSecret =
    String(props.getProperty('CLIENT_SECRET') || '').trim();

  if (!clientId || !clientSecret) {
    throw new Error(
      'Missing CLIENT_ID or CLIENT_SECRET in Apps Script Script Properties.'
    );
  }

  const tokenKey = 'VALOR_PILOT_STRIVEN_ACCESS_TOKEN';
  const expiryKey = 'VALOR_PILOT_STRIVEN_ACCESS_TOKEN_EXPIRES_AT_MS';

  const cachedToken = String(props.getProperty(tokenKey) || '');
  const expiryMs = Number(props.getProperty(expiryKey) || 0);
  const now = Date.now();

  if (cachedToken && expiryMs > now + 5 * 60 * 1000) {
    return cachedToken;
  }

  const basic =
    Utilities.base64Encode(clientId + ':' + clientSecret);

  const response = UrlFetchApp.fetch(
    'https://api.striven.com/accesstoken',
    {
      method: 'post',
      headers: {
        Authorization: 'Basic ' + basic,
        Accept: 'application/json'
      },
      payload: {
        grant_type: 'client_credentials',
        ClientId: clientId
      },
      muteHttpExceptions: true
    }
  );

  const code = response.getResponseCode();
  const text = response.getContentText();

  if (code < 200 || code >= 300) {
    throw new Error(
      'Striven OAuth failed HTTP ' +
      code +
      ': ' +
      String(text || '').slice(0, 500)
    );
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new Error('Striven OAuth returned non-JSON content.');
  }

  if (!parsed || !parsed.access_token) {
    throw new Error(
      'Striven OAuth response did not contain access_token.'
    );
  }

  const expiresIn = Number(parsed.expires_in || 3600);

  props.setProperties({
    [tokenKey]: String(parsed.access_token),
    [expiryKey]: String(now + expiresIn * 1000)
  }, false);

  return String(parsed.access_token);
}

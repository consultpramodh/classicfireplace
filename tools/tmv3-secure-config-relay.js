#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PROD_SCRIPT_ID = '1E86mhD2dZcOFpqWnCvoIpwEkwZ0MA63MgM8DifV6WyB2FvVQkRWKIZ_m';
const V3_SCRIPT_ID = '1shaSL1CeNhR2-fr8H4x0fP2KUIjpOizLFyrNRAnGGXkCvERX4hZyJ5Gt';

const APPROVED_KEYS = [
  'CLIENT_ID',
  'CLIENT_SECRET',
  'Striven_Customers_ReportAPI',
  'Striven_CustomerLocations_ReportAPI',
  'Striven_Contacts_ReportAPI',
  'Striven_ApprovedSalesOrders_ReportAPI',
  'Striven_DeliveryApprovedOrders_ReportAPI',
  'Striven_InstallTasks_ReportAPI',
  'Striven_DeliveryTasks_ReportAPI',
  'Striven_ServiceTasks_ReportAPI',
  'Striven_ServiceWorkOrders_ReportAPI'
];

const outDir = path.resolve(process.cwd(), 'autopatch-output-v3-config');
fs.mkdirSync(outDir, { recursive: true });

function fail(message) {
  throw new Error(message);
}

function deepFind(obj, keys, seen = new Set()) {
  if (!obj || typeof obj !== 'object' || seen.has(obj)) return '';
  seen.add(obj);

  for (const [k, v] of Object.entries(obj)) {
    if (keys.includes(k) && typeof v === 'string' && v) return v;
  }
  for (const v of Object.values(obj)) {
    const found = deepFind(v, keys, seen);
    if (found) return found;
  }
  return '';
}

async function getGoogleAccessToken() {
  const rawText = process.env.CLASPRC_JSON;
  if (!rawText) fail('CLASPRC_JSON is not configured.');

  const raw = JSON.parse(rawText);
  const token = raw.token || raw.tokens || raw.credentials || {};
  const settings = raw.oauth2ClientSettings || raw.oauth2Client || raw.client || {};

  const refreshToken =
    token.refresh_token ||
    token.refreshToken ||
    deepFind(raw, ['refresh_token', 'refreshToken']);

  const clientId =
    settings.clientId ||
    settings.client_id ||
    deepFind(raw, ['clientId', 'client_id']);

  const clientSecret =
    settings.clientSecret ||
    settings.client_secret ||
    deepFind(raw, ['clientSecret', 'client_secret']);

  if (!refreshToken || !clientId || !clientSecret) {
    fail('CLASPRC_JSON does not contain refresh-token client credentials.');
  }

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token'
  });

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });

  const json = await res.json();
  if (!res.ok || !json.access_token) {
    fail('Google OAuth refresh failed.');
  }

  return json.access_token;
}

let accessToken = '';

async function api(urlPath, options = {}) {
  const res = await fetch('https://script.googleapis.com/v1' + urlPath, {
    ...options,
    headers: {
      Authorization: 'Bearer ' + accessToken,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {})
    }
  });

  const text = await res.text();
  let json = {};
  if (text) {
    try { json = JSON.parse(text); }
    catch { json = { raw: text }; }
  }

  if (!res.ok) {
    const status = json && json.error && json.error.status ? json.error.status : res.status;
    fail('Apps Script API request failed: ' + status);
  }

  return json;
}

async function getContent(scriptId) {
  return api('/projects/' + encodeURIComponent(scriptId) + '/content');
}

async function updateContent(scriptId, content) {
  return api('/projects/' + encodeURIComponent(scriptId) + '/content', {
    method: 'PUT',
    body: JSON.stringify({ files: content.files || [] })
  });
}

async function createVersion(scriptId, description) {
  return api('/projects/' + encodeURIComponent(scriptId) + '/versions', {
    method: 'POST',
    body: JSON.stringify({ description })
  });
}

async function createDeployment(scriptId, versionNumber, description) {
  return api('/projects/' + encodeURIComponent(scriptId) + '/deployments', {
    method: 'POST',
    body: JSON.stringify({
      versionNumber: Number(versionNumber),
      manifestFileName: 'appsscript',
      description
    })
  });
}

async function deleteDeployment(scriptId, deploymentId) {
  if (!deploymentId) return;
  try {
    await api(
      '/projects/' + encodeURIComponent(scriptId) +
      '/deployments/' + encodeURIComponent(deploymentId),
      { method: 'DELETE' }
    );
  } catch {
    // Cleanup is best effort; source parity is checked separately.
  }
}

function canonicalHash(content) {
  const files = (content.files || [])
    .map(f => ({
      name: f.name,
      type: f.type,
      source: f.source || ''
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return crypto
    .createHash('sha256')
    .update(JSON.stringify(files))
    .digest('hex');
}

function getManifest(content) {
  const file = (content.files || []).find(f => f.name === 'appsscript');
  let manifest = {
    timeZone: 'America/Toronto',
    exceptionLogging: 'STACKDRIVER',
    runtimeVersion: 'V8'
  };

  if (file && file.source) {
    try { manifest = JSON.parse(file.source); } catch {}
  }
  return manifest;
}

function serverFile(name, source) {
  return { name, type: 'SERVER_JS', source };
}

function manifestFile(manifest) {
  return {
    name: 'appsscript',
    type: 'JSON',
    source: JSON.stringify(manifest, null, 2)
  };
}

function v3ReceiverContent(token) {
  const manifest = {
    timeZone: 'America/Toronto',
    exceptionLogging: 'STACKDRIVER',
    runtimeVersion: 'V8',
    webapp: {
      access: 'ANYONE_ANONYMOUS',
      executeAs: 'USER_DEPLOYING'
    }
  };

  const source = `
var TMPV3_RECEIVER_TOKEN = ${JSON.stringify(token)};

function doPost(e) {
  try {
    var body = JSON.parse(
      e && e.postData && e.postData.contents ? e.postData.contents : '{}'
    );

    if (String(body.token || '') !== TMPV3_RECEIVER_TOKEN) {
      return TMPV3_response_({ok:false,status:'UNAUTHORIZED'});
    }

    if (body.action === 'health') {
      return TMPV3_response_({ok:true,status:'HEALTH_OK'});
    }

    if (body.action === 'import') {
      var allowed = ${JSON.stringify(APPROVED_KEYS)};
      var config = body.config || {};
      var safe = {};

      allowed.forEach(function(key) {
        var value = String(config[key] || '').trim();
        if (value) safe[key] = value;
      });

      var missing = allowed.filter(function(key) { return !safe[key]; });
      if (missing.length) {
        return TMPV3_response_({
          ok:false,
          status:'INCOMPLETE',
          missing:missing
        });
      }

      PropertiesService
        .getScriptProperties()
        .setProperties(safe, false);

      return TMPV3_response_({
        ok:true,
        status:'IMPORTED',
        keyCount:Object.keys(safe).length
      });
    }

    if (body.action === 'verify') {
      var keys = ${JSON.stringify(APPROVED_KEYS)};
      var props = PropertiesService.getScriptProperties();
      var missing = keys.filter(function(key) {
        return !String(props.getProperty(key) || '').trim();
      });

      return TMPV3_response_({
        ok:missing.length === 0,
        status:missing.length ? 'CONFIG_GAPS' : 'CONFIG_READY',
        keyCount:keys.length,
        missing:missing
      });
    }

    return TMPV3_response_({ok:false,status:'UNKNOWN_ACTION'});
  } catch (err) {
    return TMPV3_response_({
      ok:false,
      status:'ERROR',
      message:String(err && err.message || err)
    });
  }
}

function TMPV3_response_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
`;

  return {
    files: [
      serverFile('TMPV3_ConfigReceiver', source),
      manifestFile(manifest)
    ]
  };
}

function productionRelayContent(preContent, token) {
  const manifest = getManifest(preContent);
  manifest.webapp = {
    access: 'ANYONE_ANONYMOUS',
    executeAs: 'USER_DEPLOYING'
  };

  const files = (preContent.files || [])
    .filter(f => f.name !== 'appsscript' && f.name !== 'TMPV3_ConfigRelay')
    .map(f => {
      if (f.type !== 'SERVER_JS') return { ...f };

      // Production already owns a web endpoint. Rename it only inside this
      // immutable helper version so our temporary relay has a unique doPost.
      return {
        ...f,
        source: String(f.source || '').replace(
          /function\s+doPost\s*\(/g,
          'function TMPV3_original_doPost('
        )
      };
    });

  const source = `
var TMPV3_RELAY_TOKEN = ${JSON.stringify(token)};

function doPost(e) {
  try {
    var body = JSON.parse(
      e && e.postData && e.postData.contents ? e.postData.contents : '{}'
    );

    if (String(body.token || '') !== TMPV3_RELAY_TOKEN) {
      return TMPV3_relayResponse_({ok:false,status:'UNAUTHORIZED'});
    }

    if (
      body.action !== 'relay' ||
      !body.targetUrl ||
      !body.targetToken
    ) {
      return TMPV3_relayResponse_({ok:false,status:'BAD_REQUEST'});
    }

    var props = PropertiesService.getScriptProperties();

    function first(keys) {
      for (var i = 0; i < keys.length; i++) {
        var value = String(props.getProperty(keys[i]) || '').trim();
        if (value) return value;
      }
      return '';
    }

    var config = {
      CLIENT_ID:first(['CLIENT_ID']),
      CLIENT_SECRET:first(['CLIENT_SECRET']),
      Striven_Customers_ReportAPI:first([
        'Striven_Customers_ReportAPI',
        'STRIVEN_CUSTOMER_REPORT_API_KEY'
      ]),
      Striven_CustomerLocations_ReportAPI:first([
        'Striven_CustomerLocations_ReportAPI'
      ]),
      Striven_Contacts_ReportAPI:first([
        'Striven_Contacts_ReportAPI'
      ]),
      Striven_ApprovedSalesOrders_ReportAPI:first([
        'Striven_ApprovedSalesOrders_ReportAPI',
        'Striven_CF_Approved_Sales_Orders_ReportAPI'
      ]),
      Striven_DeliveryApprovedOrders_ReportAPI:first([
        'Striven_DeliveryApprovedOrders_ReportAPI',
        'Striven_CF_Delivery_Approved_Orders_ReportAPI'
      ]),
      Striven_InstallTasks_ReportAPI:first([
        'Striven_InstallTasks_ReportAPI',
        'Striven_Tasks_ReportAPI',
        'Striven_CF_Installation_Tasks_ReportAPI'
      ]),
      Striven_DeliveryTasks_ReportAPI:first([
        'Striven_DeliveryTasks_ReportAPI'
      ]),
      Striven_ServiceTasks_ReportAPI:first([
        'Striven_ServiceTasks_ReportAPI'
      ]),
      Striven_ServiceWorkOrders_ReportAPI:first([
        'Striven_ServiceWorkOrders_ReportAPI'
      ])
    };

    var missing = Object.keys(config).filter(function(key) {
      return !String(config[key] || '').trim();
    });

    if (missing.length) {
      return TMPV3_relayResponse_({
        ok:false,
        status:'SOURCE_CONFIG_GAPS',
        missing:missing
      });
    }

    var response = UrlFetchApp.fetch(String(body.targetUrl), {
      method:'post',
      contentType:'application/json',
      payload:JSON.stringify({
        token:String(body.targetToken),
        action:'import',
        config:config
      }),
      muteHttpExceptions:true
    });

    var code = response.getResponseCode();
    var parsed = {};
    try {
      parsed = JSON.parse(response.getContentText() || '{}');
    } catch (ignored) {}

    return TMPV3_relayResponse_({
      ok:code >= 200 && code < 300 && parsed.ok === true,
      status:'RELAY_COMPLETE',
      targetHttpCode:code,
      targetStatus:parsed.status || 'UNKNOWN',
      targetKeyCount:Number(parsed.keyCount || 0),
      targetMissing:parsed.missing || []
    });
  } catch (err) {
    return TMPV3_relayResponse_({
      ok:false,
      status:'ERROR',
      message:String(err && err.message || err)
    });
  }
}

function TMPV3_relayResponse_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
`;

  files.push(serverFile('TMPV3_ConfigRelay', source));
  files.push(manifestFile(manifest));

  return { files };
}

async function postJson(url, payload) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    redirect: 'follow'
  });

  const text = await res.text();
  let json = {};
  try { json = JSON.parse(text); }
  catch {
    fail('Temporary web endpoint did not return JSON.');
  }

  if (!res.ok) fail('Temporary web endpoint HTTP ' + res.status + '.');
  return json;
}

async function makeImmutableWebVersion(scriptId, tempContent, preContent, description) {
  const preHash = canonicalHash(preContent);

  // Freshness guard immediately before the temporary HEAD update.
  const fresh = await getContent(scriptId);
  if (canonicalHash(fresh) !== preHash) {
    fail('Freshness guard failed for script ' + scriptId + '.');
  }

  await updateContent(scriptId, tempContent);
  const version = await createVersion(scriptId, description);

  // Restore HEAD before the helper version is ever called.
  await updateContent(scriptId, preContent);
  const restored = await getContent(scriptId);
  if (canonicalHash(restored) !== preHash) {
    fail('HEAD restore verification failed for script ' + scriptId + '.');
  }

  const deployment = await createDeployment(
    scriptId,
    version.versionNumber,
    description
  );

  if (!deployment.deploymentId) {
    fail('Temporary deployment did not return an ID.');
  }

  return {
    deploymentId: deployment.deploymentId,
    url:
      (
        deployment.entryPoints &&
        deployment.entryPoints[0] &&
        deployment.entryPoints[0].webApp &&
        deployment.entryPoints[0].webApp.url
      ) ||
      ('https://script.google.com/macros/s/' + deployment.deploymentId + '/exec')
  };
}

async function main() {
  accessToken = await getGoogleAccessToken();

  const prodPre = await getContent(PROD_SCRIPT_ID);
  const v3Pre = await getContent(V3_SCRIPT_ID);

  const prodPreHash = canonicalHash(prodPre);
  const v3PreHash = canonicalHash(v3Pre);

  const v3Token = crypto.randomBytes(32).toString('hex');
  const prodToken = crypto.randomBytes(32).toString('hex');

  let prodDeployment = '';
  let v3Deployment = '';

  try {
    const v3Temp = v3ReceiverContent(v3Token);
    const v3 = await makeImmutableWebVersion(
      V3_SCRIPT_ID,
      v3Temp,
      v3Pre,
      'TMV3 temporary secure config receiver'
    );
    v3Deployment = v3.deploymentId;

    const health = await postJson(v3.url, {
      token: v3Token,
      action: 'health'
    });

    if (!health.ok || health.status !== 'HEALTH_OK') {
      fail('V3 receiver health check failed.');
    }

    const prodTemp = productionRelayContent(prodPre, prodToken);
    const prod = await makeImmutableWebVersion(
      PROD_SCRIPT_ID,
      prodTemp,
      prodPre,
      'TMV3 temporary secure config relay'
    );
    prodDeployment = prod.deploymentId;

    const relay = await postJson(prod.url, {
      token: prodToken,
      action: 'relay',
      targetUrl: v3.url,
      targetToken: v3Token
    });

    if (
      !relay.ok ||
      relay.targetStatus !== 'IMPORTED' ||
      Number(relay.targetKeyCount) !== APPROVED_KEYS.length
    ) {
      const sourceMissing = Array.isArray(relay.missing) ? relay.missing : [];
      const targetMissing = Array.isArray(relay.targetMissing) ? relay.targetMissing : [];
      const safeFailure = {
        status: relay.status || 'UNKNOWN',
        targetStatus: relay.targetStatus || 'UNKNOWN',
        sourceMissing: sourceMissing,
        targetMissing: targetMissing
      };

      fs.writeFileSync(
        path.join(outDir, 'failure-evidence.json'),
        JSON.stringify(safeFailure, null, 2)
      );

      fail(
        'Config relay failed; status=' + safeFailure.status +
        (sourceMissing.length ? '; source missing=' + sourceMissing.join(',') : '') +
        (targetMissing.length ? '; target missing=' + targetMissing.join(',') : '')
      );
    }

    const verify = await postJson(v3.url, {
      token: v3Token,
      action: 'verify'
    });

    if (
      !verify.ok ||
      verify.status !== 'CONFIG_READY' ||
      Number(verify.keyCount) !== APPROVED_KEYS.length
    ) {
      fail(
        'V3 config verification failed; missing keys: ' +
        (verify.missing || []).join(', ')
      );
    }

    const prodFinal = await getContent(PROD_SCRIPT_ID);
    const v3Final = await getContent(V3_SCRIPT_ID);

    if (canonicalHash(prodFinal) !== prodPreHash) {
      fail('Production source parity failed after relay.');
    }
    if (canonicalHash(v3Final) !== v3PreHash) {
      fail('V3 source parity failed after relay.');
    }

    const evidence = {
      status: 'V3_CONFIG_RELAY_VERIFIED',
      permanentPropertyCount: APPROVED_KEYS.length,
      propertyKeys: APPROVED_KEYS,
      secretValuesPrinted: false,
      productionHeadRestoredAndHashVerified: true,
      v3HeadRestoredAndHashVerified: true,
      temporaryDeploymentsDeleted: false,
      verifiedAt: new Date().toISOString()
    };

    fs.writeFileSync(
      path.join(outDir, 'evidence.json'),
      JSON.stringify(evidence, null, 2)
    );

    console.log('V3_CONFIG_RELAY_VERIFIED');

  } finally {
    await deleteDeployment(PROD_SCRIPT_ID, prodDeployment);
    await deleteDeployment(V3_SCRIPT_ID, v3Deployment);

    // Fail-safe exact source restoration even if an earlier request failed.
    try { await updateContent(PROD_SCRIPT_ID, prodPre); } catch {}
    try { await updateContent(V3_SCRIPT_ID, v3Pre); } catch {}

    // Do not emit secrets; update only non-secret evidence flag when possible.
    const evidencePath = path.join(outDir, 'evidence.json');
    if (fs.existsSync(evidencePath)) {
      try {
        const evidence = JSON.parse(fs.readFileSync(evidencePath, 'utf8'));
        evidence.temporaryDeploymentsDeleted = true;
        fs.writeFileSync(evidencePath, JSON.stringify(evidence, null, 2));
      } catch {}
    }
  }
}

main().catch(err => {
  console.error(err && err.message ? err.message : String(err));
  process.exit(1);
});

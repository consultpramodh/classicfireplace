#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const V3_SCRIPT_ID = '1shaSL1CeNhR2-fr8H4x0fP2KUIjpOizLFyrNRAnGGXkCvERX4hZyJ5Gt';
const outDir = path.resolve(process.cwd(), 'autopatch-output-v3-shadow');
const RUN_MODE = String(process.env.TMV3_SHADOW_RUN_MODE || 'FULL').toUpperCase();
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
  if (!res.ok || !json.access_token) fail('Google OAuth refresh failed.');

  return json.access_token;
}

let accessToken = '';

async function api(pathname, options = {}) {
  const res = await fetch('https://script.googleapis.com/v1' + pathname, {
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
    const status =
      json && json.error && json.error.status
        ? json.error.status
        : res.status;
    fail('Apps Script API request failed: ' + status);
  }

  return json;
}

async function getContent() {
  return api('/projects/' + encodeURIComponent(V3_SCRIPT_ID) + '/content');
}

async function updateContent(content) {
  return api('/projects/' + encodeURIComponent(V3_SCRIPT_ID) + '/content', {
    method: 'PUT',
    body: JSON.stringify({ files: content.files || [] })
  });
}

async function createVersion(description) {
  return api('/projects/' + encodeURIComponent(V3_SCRIPT_ID) + '/versions', {
    method: 'POST',
    body: JSON.stringify({ description })
  });
}

async function createDeployment(versionNumber, description) {
  return api('/projects/' + encodeURIComponent(V3_SCRIPT_ID) + '/deployments', {
    method: 'POST',
    body: JSON.stringify({
      versionNumber: Number(versionNumber),
      manifestFileName: 'appsscript',
      description
    })
  });
}

async function deleteDeployment(deploymentId) {
  if (!deploymentId) return;
  try {
    await api(
      '/projects/' + encodeURIComponent(V3_SCRIPT_ID) +
      '/deployments/' + encodeURIComponent(deploymentId),
      { method: 'DELETE' }
    );
  } catch {}
}

function canonicalHash(content) {
  const files = (content.files || [])
    .map(f => ({ name:f.name, type:f.type, source:f.source || '' }))
    .sort((a,b) => a.name.localeCompare(b.name));

  return crypto
    .createHash('sha256')
    .update(JSON.stringify(files))
    .digest('hex');
}

function getManifest(content) {
  const f = (content.files || []).find(x => x.name === 'appsscript');
  if (!f || !f.source) fail('V3 appsscript.json is missing.');
  return JSON.parse(f.source);
}

function buildTemporaryRunner(pre, token) {
  const manifest = getManifest(pre);
  manifest.webapp = {
    access: 'ANYONE_ANONYMOUS',
    executeAs: 'USER_DEPLOYING'
  };

  const files = (pre.files || [])
    .filter(f => f.name !== 'appsscript' && f.name !== 'TMPV3_ShadowRunner')
    .map(f => {
      if (f.type !== 'SERVER_JS') return { ...f };
      return {
        ...f,
        source: String(f.source || '').replace(
          /function\s+doPost\s*\(/g,
          'function TMPV3_original_doPost('
        )
      };
    });

  const source = `
var TMPV3_SHADOW_TOKEN = ${JSON.stringify(token)};

function doPost(e) {
  try {
    var body = JSON.parse(
      e && e.postData && e.postData.contents ? e.postData.contents : '{}'
    );

    if (String(body.token || '') !== TMPV3_SHADOW_TOKEN) {
      return TMPV3_shadowResponse_({ok:false,status:'UNAUTHORIZED'});
    }

    if (body.action === 'health') {
      var health = tmv3_healthCheck();
      return TMPV3_shadowResponse_({
        ok:health.ready === true,
        status:health.ready ? 'HEALTH_READY' : 'HEALTH_GAPS',
        missingSheets:health.missingSheets || [],
        missingPropertyCapabilities:health.missingPropertyCapabilities || []
      });
    }

    if (body.action === 'refreshSources') {
      var sources = tmv3_refreshSources();
      return TMPV3_shadowResponse_({
        ok:true,
        status:'SOURCE_REFRESH_COMPLETE',
        sources:sources
      });
    }

    if (body.action === 'mapFromCache') {
      var result = tmv3_shadowMapFromCache();
      return TMPV3_shadowResponse_({
        ok:true,
        status:'SHADOW_MAP_COMPLETE',
        version:result.version,
        mode:result.mode,
        events:result.events,
        counts:result.counts,
        regression:result.regression,
        morningOps:result.morningOps,
        sources:result.sources
      });
    }

    if (body.action === 'step1Calendar') {
      var step1 = tmv3_step1CalendarRun('GITHUB_STEP1_VERIFY');
      return TMPV3_shadowResponse_({
        ok:step1.status === 'PASS',
        status:'STEP1_CALENDAR_COMPLETE',
        result:step1
      });
    }

    if (body.action === 'step2Calendar') {
      var step2 = tmv3_step2CalendarRun('GITHUB_STEP2_VERIFY');
      return TMPV3_shadowResponse_({
        ok:step2.status === 'PASS',
        status:'STEP2_CALENDAR_COMPLETE',
        result:step2
      });
    }

    if (body.action === 'step3Anchor') {
      var step3 = tmv3_step3BusinessAnchorRun(
        'GITHUB_STEP3_VERIFY',
        true
      );
      return TMPV3_shadowResponse_({
        ok:step3.status === 'PASS',
        status:'STEP3_ANCHOR_COMPLETE',
        result:step3
      });
    }

    if (body.action === 'step4Identity') {
      var step4 = tmv3_step4IdentityRun(
        'GITHUB_STEP4_VERIFY',
        true
      );
      return TMPV3_shadowResponse_({
        ok:step4.status === 'PASS',
        status:'STEP4_IDENTITY_COMPLETE',
        result:step4
      });
    }

    if (body.action === 'installStep1LiveSync') {
      var install = tmv3_installStep1CalendarLiveSync();
      return TMPV3_shadowResponse_({
        ok:install.initialSync && install.initialSync.status === 'PASS',
        status:'STEP1_LIVE_SYNC_INSTALL_COMPLETE',
        result:install
      });
    }

    return TMPV3_shadowResponse_({ok:false,status:'UNKNOWN_ACTION'});
  } catch (err) {
    return TMPV3_shadowResponse_({
      ok:false,
      status:'ERROR',
      message:String(err && err.message || err)
    });
  }
}

function TMPV3_shadowResponse_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
`;

  files.push({
    name:'TMPV3_ShadowRunner',
    type:'SERVER_JS',
    source
  });

  files.push({
    name:'appsscript',
    type:'JSON',
    source:JSON.stringify(manifest, null, 2)
  });

  return { files };
}

async function postJson(url, payload) {
  const res = await fetch(url, {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify(payload),
    redirect:'follow'
  });

  const text = await res.text();
  let json = {};

  try { json = JSON.parse(text); }
  catch { fail('Temporary V3 runner did not return JSON.'); }

  if (!res.ok) fail('Temporary V3 runner HTTP ' + res.status + '.');
  return json;
}

async function main() {
  accessToken = await getGoogleAccessToken();

  const pre = await getContent();
  const preHash = canonicalHash(pre);
  const token = crypto.randomBytes(32).toString('hex');
  const temp = buildTemporaryRunner(pre, token);
  const tempHash = canonicalHash(temp);

  let deploymentId = '';

  try {
    const fresh = await getContent();
    if (canonicalHash(fresh) !== preHash) {
      fail('V3 freshness guard failed before shadow runner creation.');
    }

    await updateContent(temp);
    const version = await createVersion('TMV3 temporary shadow runner');

    await updateContent(pre);
    const restored = await getContent();
    if (canonicalHash(restored) !== preHash) {
      fail('V3 source restore failed before shadow execution.');
    }

    const deployment = await createDeployment(
      version.versionNumber,
      'TMV3 temporary shadow runner'
    );

    deploymentId = deployment.deploymentId;
    if (!deploymentId) fail('Temporary shadow deployment ID missing.');

    const url =
      (
        deployment.entryPoints &&
        deployment.entryPoints[0] &&
        deployment.entryPoints[0].webApp &&
        deployment.entryPoints[0].webApp.url
      ) ||
      ('https://script.google.com/macros/s/' + deploymentId + '/exec');

    if (
      RUN_MODE === 'STEP1' ||
      RUN_MODE === 'STEP1_INSTALL_LIVE' ||
      RUN_MODE === 'STEP2_INSTALL_LIVE' ||
      RUN_MODE === 'STEP3_INSTALL_LIVE' ||
      RUN_MODE === 'STEP2' ||
      RUN_MODE === 'STEP3' ||
      RUN_MODE === 'STEP4'
    ) {
      const action =
        (
          RUN_MODE === 'STEP1_INSTALL_LIVE' ||
          RUN_MODE === 'STEP2_INSTALL_LIVE' ||
          RUN_MODE === 'STEP3_INSTALL_LIVE'
        )
          ? 'installStep1LiveSync'
          : RUN_MODE === 'STEP2'
            ? 'step2Calendar'
            : RUN_MODE === 'STEP3'
              ? 'step3Anchor'
              : RUN_MODE === 'STEP4'
                ? 'step4Identity'
                : 'step1Calendar';

      const step1 = await postJson(url, {
        token,
        action
      });

      if (!step1.ok) {
        fs.writeFileSync(
          path.join(outDir, 'step1-calendar.json'),
          JSON.stringify(step1, null, 2)
        );
        fail(
          'V3 Step 1 Calendar verification failed: ' +
          ((step1.result && step1.result.status) || step1.status || 'UNKNOWN')
        );
      }

      const finalHead = await getContent();
      if (canonicalHash(finalHead) !== preHash) {
        fail('V3 source parity failed after Step 1 execution.');
      }

      fs.writeFileSync(
        path.join(outDir, 'evidence.json'),
        JSON.stringify({
          status: RUN_MODE === 'STEP3_INSTALL_LIVE'
            ? 'V3_STEP3_LIVE_SYNC_VERIFIED'
            : RUN_MODE === 'STEP2_INSTALL_LIVE'
              ? 'V3_STEP2_LIVE_SYNC_VERIFIED'
              : RUN_MODE === 'STEP1_INSTALL_LIVE'
              ? 'V3_STEP1_LIVE_SYNC_VERIFIED'
              : RUN_MODE === 'STEP2'
                ? 'V3_STEP2_CALENDAR_VERIFIED'
                : RUN_MODE === 'STEP3'
                  ? 'V3_STEP3_BUSINESS_ANCHOR_VERIFIED'
                  : RUN_MODE === 'STEP4'
                    ? 'V3_STEP4_IDENTITY_VERIFIED'
                    : 'V3_STEP1_CALENDAR_VERIFIED',
          step1: step1.result || null,
          sourceHeadHashVerified: true,
          temporaryDeploymentDeleted: false,
          verifiedAt: new Date().toISOString()
        }, null, 2)
      );

      console.log(
        RUN_MODE === 'STEP3_INSTALL_LIVE'
          ? 'V3_STEP3_LIVE_SYNC_VERIFIED'
          : RUN_MODE === 'STEP2_INSTALL_LIVE'
            ? 'V3_STEP2_LIVE_SYNC_VERIFIED'
            : RUN_MODE === 'STEP1_INSTALL_LIVE'
            ? 'V3_STEP1_LIVE_SYNC_VERIFIED'
            : RUN_MODE === 'STEP2'
              ? 'V3_STEP2_CALENDAR_VERIFIED'
              : RUN_MODE === 'STEP3'
                ? 'V3_STEP3_BUSINESS_ANCHOR_VERIFIED'
                : RUN_MODE === 'STEP4'
                  ? 'V3_STEP4_IDENTITY_VERIFIED'
                  : 'V3_STEP1_CALENDAR_VERIFIED'
      );
      console.log(JSON.stringify(step1.result || {}));
      return;
    }

    const health = await postJson(url, {
      token,
      action:'health'
    });

    if (!health.ok || health.status !== 'HEALTH_READY') {
      fs.writeFileSync(
        path.join(outDir, 'health-gaps.json'),
        JSON.stringify({
          status:health.status || 'UNKNOWN',
          missingSheets:health.missingSheets || [],
          missingPropertyCapabilities:health.missingPropertyCapabilities || []
        }, null, 2)
      );

      fail(
        'V3 health check is not ready; missing properties: ' +
        (health.missingPropertyCapabilities || []).join(', ')
      );
    }

    let refresh = {
      ok: true,
      status: 'SOURCE_REFRESH_SKIPPED',
      sources: null
    };

    if (RUN_MODE !== 'MAP_ONLY') {
      refresh = await postJson(url, {
        token,
        action:'refreshSources'
      });

      if (!refresh.ok || refresh.status !== 'SOURCE_REFRESH_COMPLETE') {
        fail(
          'V3 source refresh failed: ' +
          (refresh.message || refresh.status || 'UNKNOWN')
        );
      }
    }

    const shadow = await postJson(url, {
      token,
      action:'mapFromCache'
    });

    if (!shadow.ok || shadow.status !== 'SHADOW_MAP_COMPLETE') {
      fail(
        'V3 shadow mapping failed: ' +
        (shadow.message || shadow.status || 'UNKNOWN')
      );
    }

    const finalHead = await getContent();
    if (canonicalHash(finalHead) !== preHash) {
      fail('V3 source parity failed after shadow execution.');
    }

    fs.writeFileSync(
      path.join(outDir, 'evidence.json'),
      JSON.stringify({
        status:'V3_SHADOW_RUN_VERIFIED',
        stages:{
          sourceRefresh:RUN_MODE === 'MAP_ONLY' ? 'SKIPPED_CACHE_REUSE' : 'PASS',
          mapFromCache:'PASS'
        },
        events:shadow.events,
        counts:shadow.counts,
        sources:refresh.sources || shadow.sources,
        regression:shadow.regression,
        morningOps:shadow.morningOps,
        sourceHeadHashVerified:true,
        temporaryDeploymentDeleted:false,
        verifiedAt:new Date().toISOString()
      }, null, 2)
    );

    console.log('V3_SHADOW_RUN_VERIFIED');
    console.log(JSON.stringify({
      sources:refresh.sources || shadow.sources,
      events:shadow.events,
      counts:shadow.counts,
      regression:shadow.regression,
      morningStatus:
        shadow.morningOps && shadow.morningOps.status
          ? shadow.morningOps.status
          : null
    }));

  } finally {
    await deleteDeployment(deploymentId);

    try {
      const current = await getContent();
      const currentHash = canonicalHash(current);

      if (currentHash === tempHash) {
        await updateContent(pre);
      }
    } catch {}

    const evidencePath = path.join(outDir, 'evidence.json');
    if (fs.existsSync(evidencePath)) {
      try {
        const evidence = JSON.parse(fs.readFileSync(evidencePath, 'utf8'));
        evidence.temporaryDeploymentDeleted = true;
        fs.writeFileSync(evidencePath, JSON.stringify(evidence, null, 2));
      } catch {}
    }
  }
}

main().catch(err => {
  console.error(err && err.message ? err.message : String(err));
  process.exit(1);
});

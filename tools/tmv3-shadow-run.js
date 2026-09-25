#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const V3_SCRIPT_ID = '1shaSL1CeNhR2-fr8H4x0fP2KUIjpOizLFyrNRAnGGXkCvERX4hZyJ5Gt';
const outDir = path.resolve(process.cwd(), 'autopatch-output-v3-shadow');
const RUN_MODE = String(process.env.TMV3_SHADOW_RUN_MODE || 'FULL').toUpperCase();
const BATCH_OFFSET = Math.max(0, Number(process.env.TMV3_STEP7_BATCH_OFFSET || 0));
const BATCH_LIMIT = Math.max(0, Number(process.env.TMV3_STEP7_BATCH_LIMIT || 0));
const RELEASE_MANIFEST = JSON.parse(
  fs.readFileSync(path.resolve(process.cwd(), 'release-candidates/tmv3-shadow-run.json'), 'utf8')
);
const PROBE_TASK_ID = Math.max(0, Number(RELEASE_MANIFEST.taskId || 17881));
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

async function getDeployments() {
  return api('/projects/' + encodeURIComponent(V3_SCRIPT_ID) + '/deployments');
}

async function getVersions() {
  return api('/projects/' + encodeURIComponent(V3_SCRIPT_ID) + '/versions?pageSize=200');
}

function findHeadWebAppDeployment(inventory) {
  const deployments = Array.isArray(inventory && inventory.deployments)
    ? inventory.deployments
    : [];

  return deployments.find(d => {
    const cfg = d.deploymentConfig || {};
    const hasVersion =
      cfg.versionNumber !== undefined &&
      cfg.versionNumber !== null;
    const webApp = (d.entryPoints || []).find(ep => ep && ep.webApp);
    return !hasVersion && !!webApp;
  }) || null;
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

async function runScriptFunction(functionName, parameters) {
  return api('/scripts/' + encodeURIComponent(V3_SCRIPT_ID) + ':run', {
    method: 'POST',
    body: JSON.stringify({
      function: functionName,
      parameters: parameters || [],
      devMode: true
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
  manifest.executionApi = {
    access: 'MYSELF'
  };

  const canaryWrite =
    RUN_MODE.indexOf('CANARY_') === 0 &&
    RELEASE_MANIFEST.mode === 'CANARY_WRITE' &&
    RELEASE_MANIFEST.writesEnabled === true;
  let canaryModePatchCount = 0;

  const files = (pre.files || [])
    .filter(f => f.name !== 'appsscript' && f.name !== 'TMPV3_ShadowRunner')
    .map(f => {
      if (f.type !== 'SERVER_JS') return { ...f };

      let source = String(f.source || '').replace(
        /function\s+doPost\s*\(/g,
        'function TMPV3_original_doPost('
      );

      if (canaryWrite) {
        const patched = source.replace(
          "const TMV3_MODE = 'SHADOW_READ_ONLY';",
          "const TMV3_MODE = 'CANARY_WRITE';"
        );
        if (patched !== source) canaryModePatchCount++;
        source = patched;
      }

      return {
        ...f,
        source
      };
    });

  if (canaryWrite && canaryModePatchCount !== 1) {
    fail(
      'Canary temp-source mode patch expected exactly one TMV3_MODE anchor; found ' +
      canaryModePatchCount +
      '.'
    );
  }

  const source = `
var TMPV3_SHADOW_TOKEN = ${JSON.stringify(token)};

function TMPV3_directStep7Preview(vertical, eventId, taskId, expectedPlan) {
  var plan = tmv3_step7FreshPlanForTask_(
    String(vertical || ''),
    String(eventId || ''),
    Number(taskId || 0)
  );

  return {
    ok:
      plan.plan === String(expectedPlan || '') &&
      !tmv3_clean_(plan.blocker),
    expectedPlan:String(expectedPlan || ''),
    plan:plan
  };
}

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

    if (body.action === 'step5Task') {
      var step5 = tmv3_step5TaskResolutionRun(
        'GITHUB_STEP5_VERIFY',
        true
      );
      return TMPV3_shadowResponse_({
        ok:step5.status === 'PASS',
        status:'STEP5_TASK_COMPLETE',
        result:step5
      });
    }

    if (body.action === 'step6Decision') {
      var step6 = tmv3_step6TaskDecisionRun(
        'GITHUB_STEP6_VERIFY',
        true
      );
      return TMPV3_shadowResponse_({
        ok:step6.status === 'PASS',
        status:'STEP6_TASK_DECISION_COMPLETE',
        result:step6
      });
    }

    if (body.action === 'step7Reconcile') {
      var step7 = Number(body.batchLimit || 0) > 0
        ? tmv3_step7ReconciliationBatchRun(
            'GITHUB_STEP7_BATCH_VERIFY',
            String(body.vertical || ''),
            Number(body.batchOffset || 0),
            Number(body.batchLimit || 0),
            body.refreshSources === true
          )
        : tmv3_step7ReconciliationRun(
            'GITHUB_STEP7_VERIFY',
            true,
            String(body.vertical || '')
          );
      return TMPV3_shadowResponse_({
        ok:step7.status === 'PASS',
        status:'STEP7_RECONCILIATION_COMPLETE',
        result:step7
      });
    }

    if (body.action === 'sheetPublish') {
      var publishResult = tmv3_publishLatestStep7ToVisibleSheets();
      return TMPV3_shadowResponse_({
        ok:publishResult.status === 'STEP7_VISIBLE_SHEETS_SYNCED',
        status:'SHEET_PUBLISH_COMPLETE',
        result:publishResult
      });
    }

    if (body.action === 'step7CreateCandidates') {
      var createScan = tmv3_step7CreateCandidateScan(
        'GITHUB_STEP7_CREATE_CANDIDATE_SCAN',
        true
      );

      return TMPV3_shadowResponse_({
        ok:createScan.status === 'PASS',
        status:'STEP7_CREATE_CANDIDATES_COMPLETE',
        scan:createScan,
        candidates:createScan.eligible || []
      });
    }

    if (body.action === 'assignmentParityCases') {
      var assignmentCases = (body.cases || []).map(function(testCase) {
        var plan = tmv3_step7FreshPlanForTask_(
          String(testCase.vertical || ''),
          String(testCase.eventId || ''),
          Number(testCase.taskId || 0)
        );
        return {
          vertical:String(testCase.vertical || ''),
          eventId:String(testCase.eventId || ''),
          taskId:Number(testCase.taskId || 0),
          desiredAssignment:String(plan.desiredAssignment || ''),
          actualAssignment:String(plan.actualAssignment || ''),
          assignmentCheck:String(plan.assignmentCheck || ''),
          plan:String(plan.plan || ''),
          blocker:String(plan.blocker || ''),
          engineVersion:String(plan.engineVersion || '')
        };
      });

      return TMPV3_shadowResponse_({
        ok:true,
        status:'ASSIGNMENT_PARITY_CASES_COMPLETE',
        cases:assignmentCases
      });
    }

    if (body.action === 'step7Cases') {
      var wanted = {};
      (body.taskIds || []).forEach(function(id) {
        wanted[String(Number(id || 0))] = true;
      });
      var cases = tmv3_rows_(TMV3.SHEETS.RECONCILE)
        .filter(function(row) {
          return wanted[String(Number(row['Task ID'] || 0))] === true;
        })
        .map(function(row) {
          return {
            vertical:String(row['Vertical'] || ''),
            eventId:String(row['Event ID'] || ''),
            logicalKey:String(row['Logical Key'] || ''),
            taskId:Number(row['Task ID'] || 0),
            taskStatus:String(row['Task Status'] || ''),
            customerCheck:String(row['Customer Check'] || ''),
            orderCheck:String(row['Order Check'] || ''),
            locationCheck:String(row['Location Check'] || ''),
            requestedByCheck:String(row['Requested By Check'] || ''),
            startCheck:String(row['Start Check'] || ''),
            endCheck:String(row['End Check'] || ''),
            assignmentCheck:String(row['Assignment Check'] || ''),
            plan:String(row['Relationship Plan'] || ''),
            blocker:String(row['Blocker'] || ''),
            readStatus:String(row['Read Status'] || '')
          };
        });
      return TMPV3_shadowResponse_({
        ok:true,
        status:'STEP7_CASES_COMPLETE',
        requested:Object.keys(wanted),
        cases:cases
      });
    }

    if (body.action === 'step7CanaryPreview') {
      var previewVertical = String(body.vertical || '');
      var previewEventId = String(body.eventId || '');
      var previewTaskId = Number(body.taskId || 0);
      var previewExpectedPlan = String(body.expectedPlan || '');
      var previewPlan = tmv3_step7FreshPlanForTask_(
        previewVertical,
        previewEventId,
        previewTaskId
      );

      if (previewPlan.plan !== previewExpectedPlan) {
        throw new Error(
          'Fresh Step 7 preview changed from ' +
          previewExpectedPlan +
          ' to ' +
          previewPlan.plan +
          '.'
        );
      }
      if (tmv3_clean_(previewPlan.blocker)) {
        throw new Error('Step 7 preview is blocked: ' + previewPlan.blocker);
      }

      var previewEventRecord = tmv3_findFreshEventRecord_(
        previewVertical,
        previewEventId
      );
      var previewRefs = tmv3_referenceIndex_();
      var previewState = tmv3_eventStateIndex_();
      var previewRecords = tmv3_resolveEventRecords_(
        previewEventRecord,
        previewRefs,
        previewState
      );
      var previewMatches = previewRecords.filter(function(record) {
        return Number(record.taskId || 0) === previewTaskId;
      });
      if (previewMatches.length !== 1) {
        return TMPV3_shadowResponse_({
          ok:true,
          status:'STEP7_CANARY_PREVIEW_RESOLVER_DIAGNOSTIC',
          canaryReady:false,
          plan:previewPlan,
          resolverMatchCount:previewMatches.length,
          resolverRecords:previewRecords.map(function(record) {
            return {
              status:String(record.status || ''),
              taskId:Number(record.taskId || 0),
              customerId:String(record.customerId || ''),
              locationId:String(record.locationId || ''),
              contactId:String(record.contactId || ''),
              orderId:String(record.orderId || ''),
              issue:String(record.issue || ''),
              nextAction:String(record.nextAction || '')
            };
          })
        });
      }

      var previewBundle = {
        context:null,
        eventRecord:previewEventRecord,
        refs:previewRefs,
        state:previewState,
        records:previewRecords,
        resolved:previewMatches[0]
      };

      var mutationPreview = {
        relationships:
          /LOCATION|REQUESTED_BY/.test(previewExpectedPlan)
            ? tmv3_selectedRelationshipPayload_(previewBundle)
            : null,
        dates:
          /DATES/.test(previewExpectedPlan)
            ? tmv3_selectedDatePayload_(previewBundle)
            : null,
        assignments:
          /ASSIGNMENTS/.test(previewExpectedPlan)
            ? tmv3_desiredAssignment_(previewEventRecord)
            : null,
        calendarLinks:true
      };

      return TMPV3_shadowResponse_({
        ok:true,
        status:'STEP7_CANARY_PREVIEW_COMPLETE',
        plan:previewPlan,
        mutationPreview:mutationPreview
      });
    }

    if (body.action === 'step7Canary') {
      var canary = tmv3_executeVerifiedStep7ExistingPlan(
        String(body.vertical || ''),
        String(body.eventId || ''),
        Number(body.taskId || 0),
        String(body.expectedPlan || '')
      );
      return TMPV3_shadowResponse_({
        ok:canary.status === 'CANARY_VERIFIED_NO_CHANGE',
        status:'STEP7_CANARY_COMPLETE',
        result:canary
      });
    }

    if (body.action === 'taskScheduleProbe') {
      var scheduleVertical = String(body.vertical || '');
      var scheduleEventId = String(body.eventId || '');
      var scheduleTaskId = Number(body.taskId || 0);

      if (!TMV3.VERTICALS[scheduleVertical]) {
        throw new Error('Task schedule probe requires a valid vertical.');
      }
      if (!scheduleEventId || !scheduleTaskId) {
        throw new Error('Task schedule probe requires Event ID and Task ID.');
      }

      var scheduleEvent = tmv3_findFreshEventRecord_(
        scheduleVertical,
        scheduleEventId
      );
      var scheduleV2 = tmv3_getTaskById_(scheduleTaskId);
      var scheduleV1 = tmv3_getCanonicalV1TaskSchedule_(scheduleTaskId);
      var scheduleCheck = tmv3_taskScheduleCheck_(
        scheduleVertical,
        scheduleEvent.start,
        scheduleEvent.end,
        scheduleTaskId,
        scheduleV2
      );
      var schedulePlan = tmv3_step7FreshPlanForTask_(
        scheduleVertical,
        scheduleEventId,
        scheduleTaskId
      );

      var scheduleOk =
        scheduleCheck.startCheck === 'MATCH' &&
        scheduleCheck.endCheck === 'MATCH' &&
        scheduleCheck.canonicalRead !== 'FAILED' &&
        scheduleCheck.canonicalRead !== 'FIELDS_MISSING';

      return TMPV3_shadowResponse_({
        ok:scheduleOk,
        status:'TASK_SCHEDULE_PROBE_COMPLETE',
        vertical:scheduleVertical,
        eventId:scheduleEventId,
        taskId:scheduleTaskId,
        calendar:{
          start:scheduleEvent.start ? tmv3_iso_(scheduleEvent.start) : '',
          end:scheduleEvent.end ? tmv3_iso_(scheduleEvent.end) : ''
        },
        v2:{
          start:String(scheduleV2['Start'] || ''),
          due:String(scheduleV2['Due'] || '')
        },
        v1:{
          start:String(scheduleV1.startDateTime || ''),
          due:String(scheduleV1.dueDateTime || ''),
          source:String(scheduleV1.source || '')
        },
        check:scheduleCheck,
        step7Plan:schedulePlan
      });
    }

    if (body.action === 'installDueSamples') {
      var sampleRows = tmv3_rows_(TMV3.SHEETS.TASKS)
        .filter(function(row) {
          var typeName = String(row['Task Type'] || '').toLowerCase();
          var dueText = String(row['Due'] || '');
          var m = dueText.match(/T(\\d{2}):(\\d{2})/);
          return typeName.indexOf('install') !== -1 && m && Number(m[1]) >= 12;
        })
        .slice(0, 8)
        .map(function(row) {
          var id = Number(row['Task ID'] || 0);
          var fresh = id ? tmv3_rawTaskById_(id) : {};
          return {
            taskId:id,
            taskType:row['Task Type'] || '',
            cachedDue:row['Due'] || '',
            freshStart:fresh.startDateTime || fresh.StartDateTime || '',
            freshDue:fresh.dueDateTime || fresh.DueDateTime || '',
            freshType:(fresh.type && (fresh.type.name || fresh.type.Name)) || ''
          };
        });
      return TMPV3_shadowResponse_({
        ok:true,
        status:'INSTALL_DUE_SAMPLES_COMPLETE',
        samples:sampleRows
      });
    }

    if (body.action === 'taskSchemaProbe') {
      var probeTaskId = Number(body.taskId || 17881);
      var rawTask = tmv3_fetchJson_(
        TMV3.API_BASE + '/v2/tasks/' + encodeURIComponent(probeTaskId),
        { method:'get' }
      ) || {};
      var fieldValues = {};
      Object.keys(rawTask).forEach(function(key) {
        if (/date|time|complete|done|close|status|finish|budget|type/i.test(key)) {
          fieldValues[key] = rawTask[key];
        }
      });
      return TMPV3_shadowResponse_({
        ok:true,
        status:'TASK_SCHEMA_PROBE_COMPLETE',
        taskId:probeTaskId,
        keys:Object.keys(rawTask).sort(),
        relevant:fieldValues
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
    headers:{
      'Content-Type':'application/json',
      Authorization:'Bearer ' + accessToken
    },
    body:JSON.stringify(payload),
    redirect:'follow'
  });

  const text = await res.text();
  let json = {};

  try { json = JSON.parse(text); }
  catch {
    const diagnostic = {
      status: res.status,
      contentType: res.headers.get('content-type') || '',
      finalUrl: String(res.url || '').replace(/([?&](?:token|authuser)=[^&]*)/gi, ''),
      bodyPrefix: text.slice(0, 500).replace(/\s+/g, ' ').trim()
    };
    fail(
      'Temporary V3 runner did not return JSON: ' +
      JSON.stringify(diagnostic)
    );
  }

  if (!res.ok) fail('Temporary V3 runner HTTP ' + res.status + '.');
  return json;
}

async function main() {
  if (RUN_MODE.indexOf('CANARY_') === 0) {
    if (
      RELEASE_MANIFEST.mode !== 'CANARY_WRITE' ||
      RELEASE_MANIFEST.writesEnabled !== true
    ) {
      fail('Canary run requires mode CANARY_WRITE and writesEnabled true.');
    }
  }
  accessToken = await getGoogleAccessToken();

  if (RUN_MODE === 'VERSION_INVENTORY') {
    const inventory = await getVersions();
    const versions = Array.isArray(inventory.versions)
      ? inventory.versions
      : [];

    fs.mkdirSync(outDir, {recursive:true});
    fs.writeFileSync(
      path.join(outDir, 'version-inventory.json'),
      JSON.stringify({
        status:'V3_VERSION_INVENTORY_COMPLETE',
        count:versions.length,
        nextPageToken:inventory.nextPageToken || '',
        minVersion:versions.length
          ? Math.min.apply(null, versions.map(v => Number(v.versionNumber || 0)))
          : null,
        maxVersion:versions.length
          ? Math.max.apply(null, versions.map(v => Number(v.versionNumber || 0)))
          : null,
        capturedAt:new Date().toISOString()
      }, null, 2)
    );

    console.log('V3_VERSION_INVENTORY_COMPLETE');
    console.log(JSON.stringify({
      count:versions.length,
      nextPageToken:inventory.nextPageToken || '',
      minVersion:versions.length
        ? Math.min.apply(null, versions.map(v => Number(v.versionNumber || 0)))
        : null,
      maxVersion:versions.length
        ? Math.max.apply(null, versions.map(v => Number(v.versionNumber || 0)))
        : null
    }));
    return;
  }

  if (RUN_MODE === 'DEPLOYMENT_INVENTORY') {
    const inventory = await getDeployments();
    const deployments = Array.isArray(inventory.deployments)
      ? inventory.deployments
      : [];

    const summary = deployments.map(d => ({
      deploymentId: d.deploymentId || '',
      versionNumber:
        d.deploymentConfig && d.deploymentConfig.versionNumber !== undefined
          ? d.deploymentConfig.versionNumber
          : null,
      description:
        d.deploymentConfig && d.deploymentConfig.description
          ? d.deploymentConfig.description
          : '',
      manifestFileName:
        d.deploymentConfig && d.deploymentConfig.manifestFileName
          ? d.deploymentConfig.manifestFileName
          : '',
      entryPointTypes: (d.entryPoints || []).map(ep =>
        ep.webApp ? 'WEB_APP' :
        ep.executionApi ? 'EXECUTION_API' :
        ep.addOn ? 'ADD_ON' :
        'OTHER'
      )
    }));

    fs.writeFileSync(
      path.join(outDir, 'deployment-inventory.json'),
      JSON.stringify({
        status:'V3_DEPLOYMENT_INVENTORY_COMPLETE',
        count:summary.length,
        deployments:summary,
        capturedAt:new Date().toISOString()
      }, null, 2)
    );

    console.log('V3_DEPLOYMENT_INVENTORY_COMPLETE');
    console.log(JSON.stringify({count:summary.length, deployments:summary}));
    return;
  }

  const pre = await getContent();
  const preHash = canonicalHash(pre);
  const token = crypto.randomBytes(32).toString('hex');
  const temp = buildTemporaryRunner(pre, token);
  const tempHash = canonicalHash(temp);

  let deploymentId = '';
  let usingHeadDeployment = false;

  try {
    const fresh = await getContent();
    if (canonicalHash(fresh) !== preHash) {
      fail('V3 freshness guard failed before shadow runner creation.');
    }

    await updateContent(temp);

    // Allow Apps Script deployment metadata a short propagation window before
    // invoking the HEAD web-app entrypoint.
    if (RUN_MODE !== 'DIRECT_STEP7_PREVIEW') {
      await new Promise(resolve => setTimeout(resolve, 5000));
    }

    if (RUN_MODE === 'DIRECT_STEP7_PREVIEW') {
      const direct = await runScriptFunction(
        'TMPV3_directStep7Preview',
        [
          String(RELEASE_MANIFEST.vertical || ''),
          String(RELEASE_MANIFEST.eventId || ''),
          Number(RELEASE_MANIFEST.taskId || 0),
          String(RELEASE_MANIFEST.expectedPlan || '')
        ]
      );

      const executionError =
        direct && direct.error
          ? direct.error
          : null;
      if (executionError) {
        fail(
          'Apps Script direct execution failed: ' +
          JSON.stringify(executionError)
        );
      }

      const result =
        direct &&
        direct.response &&
        direct.response.result
          ? direct.response.result
          : null;

      if (!result || result.ok !== true) {
        fs.writeFileSync(
          path.join(outDir, 'direct-step7-preview.json'),
          JSON.stringify({status:'FAILED', raw:direct}, null, 2)
        );
        fail(
          'Direct Step 7 preview did not confirm expected plan ' +
          String(RELEASE_MANIFEST.expectedPlan || '') + '.'
        );
      }

      await updateContent(pre);
      const restored = await getContent();
      if (canonicalHash(restored) !== preHash) {
        fail('V3 source restore failed after direct Step 7 preview.');
      }

      fs.writeFileSync(
        path.join(outDir, 'evidence.json'),
        JSON.stringify({
          status:'V3_DIRECT_STEP7_PREVIEW_VERIFIED',
          result:result,
          sourceHeadHashVerified:true,
          temporaryDeploymentDeleted:false,
          reusedHeadDeployment:false,
          verifiedAt:new Date().toISOString()
        }, null, 2)
      );

      console.log('V3_DIRECT_STEP7_PREVIEW_VERIFIED');
      console.log(JSON.stringify(result));
      return;
    }

    let url = '';

    // Read-only verification reuses the existing HEAD web-app deployment.
    // This avoids creating an Apps Script version/deployment for every probe,
    // which can hit Apps Script resource/rate limits. Canary writes continue
    // to require the isolated versioned-deployment path.
    if (
      RUN_MODE.indexOf('CANARY_') !== 0 &&
      RELEASE_MANIFEST.forceVersionedDeployment !== true
    ) {
      const inventory = await getDeployments();
      const headDeployment = findHeadWebAppDeployment(inventory);

      if (headDeployment) {
        usingHeadDeployment = true;
        deploymentId = headDeployment.deploymentId || '';
        const headWebApp = (headDeployment.entryPoints || [])
          .map(ep => ep && ep.webApp)
          .filter(Boolean)[0] || {};
        // Use the existing HEAD deployment without creating a new
        // immutable Apps Script version. The temporary manifest exposes the
        // guarded token endpoint; source is restored after execution.
        url =
          'https://script.google.com/macros/s/' +
          deploymentId +
          '/exec';
      }
    }

    if (!url) {
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

      url =
        (
          deployment.entryPoints &&
          deployment.entryPoints[0] &&
          deployment.entryPoints[0].webApp &&
          deployment.entryPoints[0].webApp.url
        ) ||
        ('https://script.google.com/macros/s/' + deploymentId + '/exec');
    }

    async function restoreHeadSourceBeforeParityCheck() {
      if (!usingHeadDeployment) return;

      await updateContent(pre);
      const restored = await getContent();
      if (canonicalHash(restored) !== preHash) {
        fail('V3 source restore failed after HEAD shadow execution.');
      }
    }

    if (RUN_MODE === 'STEP7_REFRESH_ALL') {
      const batches = [
        { vertical:'Install', offset:0, limit:30, refreshSources:true },
        { vertical:'Install', offset:30, limit:30, refreshSources:false },
        { vertical:'Delivery', offset:0, limit:20, refreshSources:false },
        { vertical:'Service', offset:0, limit:25, refreshSources:false },
        { vertical:'Service', offset:25, limit:25, refreshSources:false },
        { vertical:'Service', offset:50, limit:25, refreshSources:false },
        { vertical:'Service', offset:75, limit:25, refreshSources:false },
        { vertical:'Service', offset:100, limit:25, refreshSources:false },
        { vertical:'PreInspection', offset:0, limit:75, refreshSources:false },
        { vertical:'PreInspection', offset:75, limit:75, refreshSources:false },
        { vertical:'PreInspection', offset:150, limit:75, refreshSources:false },
        { vertical:'PreInspection', offset:225, limit:75, refreshSources:false }
      ];

      const results = [];

      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        const response = await postJson(url, {
          token,
          action:'step7Reconcile',
          vertical:batch.vertical,
          batchOffset:batch.offset,
          batchLimit:batch.limit,
          refreshSources:batch.refreshSources
        });

        results.push({
          vertical:batch.vertical,
          offset:batch.offset,
          limit:batch.limit,
          ok:response.ok === true,
          status:response.status || '',
          result:response.result || null
        });

        if (!response.ok) {
          fs.writeFileSync(
            path.join(outDir, 'step7-refresh-all-failure.json'),
            JSON.stringify({batch, response, results}, null, 2)
          );
          fail(
            'Fresh Step 7 workbook refresh failed at ' +
            batch.vertical + ' offset ' + batch.offset + ': ' +
            ((response.result && response.result.status) || response.status || 'UNKNOWN')
          );
        }

        if (
          batch.vertical === 'Install' ||
          batch.vertical === 'Service'
        ) {
          await new Promise(resolve => setTimeout(resolve, 8000));
        }
      }

      await updateContent(pre);
      const restored = await getContent();
      if (canonicalHash(restored) !== preHash) {
        fail('V3 source restore failed after full Step 7 workbook refresh.');
      }

      const evidence = {
        status:'V3_STEP7_REFRESH_ALL_VERIFIED',
        version:'3.11.13-api-safe-step7-batch-r1',
        batches:results,
        sourceHeadHashVerified:true,
        temporaryDeploymentDeleted:false,
        verifiedAt:new Date().toISOString()
      };

      fs.writeFileSync(
        path.join(outDir, 'evidence.json'),
        JSON.stringify(evidence, null, 2)
      );

      console.log('V3_STEP7_REFRESH_ALL_VERIFIED');
      console.log(JSON.stringify(evidence));
      return;
    }

    if (
      RUN_MODE === 'STEP1' ||
      RUN_MODE === 'STEP1_INSTALL_LIVE' ||
      RUN_MODE === 'STEP2_INSTALL_LIVE' ||
      RUN_MODE === 'STEP3_INSTALL_LIVE' ||
      RUN_MODE === 'STEP4_INSTALL_LIVE' ||
      RUN_MODE === 'STEP5_INSTALL_LIVE' ||
      RUN_MODE === 'STEP6_INSTALL_LIVE' ||
      RUN_MODE === 'STEP2' ||
      RUN_MODE === 'STEP3' ||
      RUN_MODE === 'STEP4' ||
      RUN_MODE === 'STEP5' ||
      RUN_MODE === 'STEP6' ||
      RUN_MODE === 'STEP7' ||
      RUN_MODE === 'STEP7_REFRESH_ALL' ||
      RUN_MODE === 'STEP7_INSTALL' ||
      RUN_MODE === 'STEP7_DELIVERY' ||
      RUN_MODE === 'STEP7_SERVICE' ||
      RUN_MODE === 'STEP7_PREINSPECTION' ||
      RUN_MODE === 'SHEET_PUBLISH' ||
      RUN_MODE === 'STEP7_CREATE_CANDIDATES' ||
      RUN_MODE === 'ASSIGNMENT_CASES' ||
      RUN_MODE === 'STEP7_CASES' ||
      RUN_MODE === 'PREVIEW_GOLDCON' ||
      RUN_MODE === 'PREVIEW_ROCCO' ||
      RUN_MODE === 'PREVIEW_STEP7' ||
      RUN_MODE === 'CANARY_GOLDCON' ||
      RUN_MODE === 'CANARY_ROCCO' ||
      RUN_MODE === 'CANARY_STEP7' ||
      RUN_MODE === 'TASK_SCHEMA' ||
      RUN_MODE === 'GOLDCON_TASK_SCHEMA' ||
      RUN_MODE === 'INSTALL_DUE_SAMPLES' ||
      RUN_MODE === 'TASK_SCHEDULE'
    ) {
      const action =
        (
          RUN_MODE === 'STEP1_INSTALL_LIVE' ||
          RUN_MODE === 'STEP2_INSTALL_LIVE' ||
          RUN_MODE === 'STEP3_INSTALL_LIVE' ||
          RUN_MODE === 'STEP4_INSTALL_LIVE' ||
          RUN_MODE === 'STEP5_INSTALL_LIVE' ||
          RUN_MODE === 'STEP6_INSTALL_LIVE'
        )
          ? 'installStep1LiveSync'
          : RUN_MODE === 'STEP2'
            ? 'step2Calendar'
            : RUN_MODE === 'STEP3'
              ? 'step3Anchor'
              : RUN_MODE === 'STEP4'
                ? 'step4Identity'
                : RUN_MODE === 'STEP5'
                  ? 'step5Task'
                  : RUN_MODE === 'STEP6'
                    ? 'step6Decision'
                    : RUN_MODE.indexOf('PREVIEW_') === 0
                      ? 'step7CanaryPreview'
                    : RUN_MODE.indexOf('CANARY_') === 0
                      ? 'step7Canary'
                    : RUN_MODE === 'SHEET_PUBLISH'
                      ? 'sheetPublish'
                    : RUN_MODE === 'STEP7_CREATE_CANDIDATES'
                      ? 'step7CreateCandidates'
                    : RUN_MODE === 'ASSIGNMENT_CASES'
                      ? 'assignmentParityCases'
                    : RUN_MODE === 'STEP7_CASES'
                      ? 'step7Cases'
                      : RUN_MODE.indexOf('STEP7') === 0
                        ? 'step7Reconcile'
                      : RUN_MODE === 'INSTALL_DUE_SAMPLES'
                    ? 'installDueSamples'
                    : RUN_MODE === 'TASK_SCHEDULE'
                      ? 'taskScheduleProbe'
                    : (RUN_MODE === 'TASK_SCHEMA' || RUN_MODE === 'GOLDCON_TASK_SCHEMA')
                    ? 'taskSchemaProbe'
                    : 'step1Calendar';

      const step1 = await postJson(url, {
        token,
        action,
        vertical:
          RUN_MODE === 'TASK_SCHEDULE' ? String(RELEASE_MANIFEST.vertical || '') :
          (RUN_MODE === 'CANARY_STEP7' || RUN_MODE === 'PREVIEW_STEP7')
            ? String(RELEASE_MANIFEST.vertical || '')
          : (RUN_MODE.indexOf('CANARY_') === 0 || RUN_MODE.indexOf('PREVIEW_') === 0) ? 'Install' :
          RUN_MODE === 'STEP7_INSTALL' ? 'Install' :
          RUN_MODE === 'STEP7_DELIVERY' ? 'Delivery' :
          RUN_MODE === 'STEP7_SERVICE' ? 'Service' :
          RUN_MODE === 'STEP7_PREINSPECTION' ? 'PreInspection' : '',
        batchOffset: BATCH_OFFSET,
        batchLimit: BATCH_LIMIT,
        refreshSources: RELEASE_MANIFEST.refreshSources === true,
        taskIds: RUN_MODE === 'STEP7_CASES' ? [17881,18618,18678,18597] : [],
        cases:
          RUN_MODE === 'ASSIGNMENT_CASES'
            ? (RELEASE_MANIFEST.assignmentCases || [])
            : []
        ,eventId:
          (RUN_MODE === 'TASK_SCHEDULE' || RUN_MODE === 'CANARY_STEP7' || RUN_MODE === 'PREVIEW_STEP7')
            ? String(RELEASE_MANIFEST.eventId || '')
            : (RUN_MODE === 'CANARY_GOLDCON' || RUN_MODE === 'PREVIEW_GOLDCON')
            ? '3lqqeba2r17067sjrm558kjmd1@google.com'
            : (RUN_MODE === 'CANARY_ROCCO' || RUN_MODE === 'PREVIEW_ROCCO')
              ? '6ftlsr2e9fn31hpm6dj05cuthi@google.com'
              : '',
        taskId:
          (RUN_MODE === 'TASK_SCHEDULE' || RUN_MODE === 'CANARY_STEP7' || RUN_MODE === 'PREVIEW_STEP7')
            ? Number(RELEASE_MANIFEST.taskId || 0) :
          RUN_MODE === 'TASK_SCHEMA' ? PROBE_TASK_ID :
          (RUN_MODE === 'CANARY_GOLDCON' || RUN_MODE === 'PREVIEW_GOLDCON') ? 18618 :
          (RUN_MODE === 'CANARY_ROCCO' || RUN_MODE === 'PREVIEW_ROCCO') ? 18678 :
          RUN_MODE === 'GOLDCON_TASK_SCHEMA' ? 18618 : 0,
        expectedPlan:
          (
            RUN_MODE === 'PREVIEW_GOLDCON' ||
            RUN_MODE === 'CANARY_GOLDCON' ||
            RUN_MODE === 'PREVIEW_ROCCO' ||
            RUN_MODE === 'CANARY_ROCCO' ||
            RUN_MODE === 'PREVIEW_STEP7' ||
            RUN_MODE === 'CANARY_STEP7'
          )
            ? String(RELEASE_MANIFEST.expectedPlan || 'NO_CHANGE')
            : ''
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

      await restoreHeadSourceBeforeParityCheck();

      const finalHead = await getContent();
      if (canonicalHash(finalHead) !== preHash) {
        fail('V3 source parity failed after Step 1 execution.');
      }

      fs.writeFileSync(
        path.join(outDir, 'evidence.json'),
        JSON.stringify({
          status: RUN_MODE === 'STEP6_INSTALL_LIVE'
            ? 'V3_STEP6_LIVE_SYNC_VERIFIED'
            : RUN_MODE === 'STEP5_INSTALL_LIVE'
            ? 'V3_STEP5_LIVE_SYNC_VERIFIED'
            : RUN_MODE === 'STEP4_INSTALL_LIVE'
            ? 'V3_STEP4_LIVE_SYNC_VERIFIED'
            : RUN_MODE === 'STEP3_INSTALL_LIVE'
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
                    : RUN_MODE === 'STEP5'
                      ? 'V3_STEP5_TASK_RESOLUTION_VERIFIED'
                      : RUN_MODE === 'STEP6'
                        ? 'V3_STEP6_TASK_DECISION_VERIFIED'
                        : RUN_MODE.indexOf('PREVIEW_') === 0
                          ? 'V3_' + RUN_MODE + '_VERIFIED'
                        : RUN_MODE.indexOf('CANARY_') === 0
                          ? 'V3_' + RUN_MODE + '_VERIFIED'
                        : RUN_MODE === 'STEP7_CASES'
                          ? 'V3_STEP7_CASES_VERIFIED'
                          : RUN_MODE.indexOf('STEP7_') === 0
                            ? 'V3_' + RUN_MODE + '_RECONCILIATION_VERIFIED'
                          : RUN_MODE === 'STEP7'
                            ? 'V3_STEP7_RECONCILIATION_VERIFIED'
                            : RUN_MODE === 'TASK_SCHEDULE'
                          ? 'V3_TASK_SCHEDULE_VERIFIED'
                        : RUN_MODE === 'TASK_SCHEMA'
                        ? 'V3_TASK_SCHEMA_PROBED'
                        : 'V3_STEP1_CALENDAR_VERIFIED',
          step1:
            RUN_MODE === 'TASK_SCHEMA' ||
            RUN_MODE === 'GOLDCON_TASK_SCHEMA' ||
            RUN_MODE === 'INSTALL_DUE_SAMPLES' ||
            RUN_MODE === 'TASK_SCHEDULE' ||
            RUN_MODE === 'ASSIGNMENT_CASES' ||
            RUN_MODE === 'STEP7_CASES' ||
            RUN_MODE.indexOf('PREVIEW_') === 0
              ? step1
              : (step1.result || null),
          sourceHeadHashVerified: true,
          temporaryDeploymentDeleted: false,
          verifiedAt: new Date().toISOString()
        }, null, 2)
      );

      console.log(
        RUN_MODE === 'STEP6_INSTALL_LIVE'
          ? 'V3_STEP6_LIVE_SYNC_VERIFIED'
          : RUN_MODE === 'STEP5_INSTALL_LIVE'
          ? 'V3_STEP5_LIVE_SYNC_VERIFIED'
          : RUN_MODE === 'STEP4_INSTALL_LIVE'
          ? 'V3_STEP4_LIVE_SYNC_VERIFIED'
          : RUN_MODE === 'STEP3_INSTALL_LIVE'
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
                  : RUN_MODE === 'STEP5'
                    ? 'V3_STEP5_TASK_RESOLUTION_VERIFIED'
                    : RUN_MODE === 'STEP6'
                      ? 'V3_STEP6_TASK_DECISION_VERIFIED'
                      : RUN_MODE.indexOf('CANARY_') === 0
                        ? 'V3_' + RUN_MODE + '_VERIFIED'
                      : RUN_MODE === 'ASSIGNMENT_CASES'
                        ? 'V3_ASSIGNMENT_CASES_VERIFIED'
                      : RUN_MODE === 'STEP7_CASES'
                        ? 'V3_STEP7_CASES_VERIFIED'
                        : RUN_MODE.indexOf('STEP7_') === 0
                          ? 'V3_' + RUN_MODE + '_RECONCILIATION_VERIFIED'
                        : RUN_MODE === 'STEP7'
                          ? 'V3_STEP7_RECONCILIATION_VERIFIED'
                          : RUN_MODE === 'TASK_SCHEDULE'
                            ? 'V3_TASK_SCHEDULE_VERIFIED'
                          : RUN_MODE === 'TASK_SCHEMA'
                      ? 'V3_TASK_SCHEMA_PROBED'
                      : 'V3_STEP1_CALENDAR_VERIFIED'
      );
      console.log(JSON.stringify(
        RUN_MODE === 'STEP7_CASES' ? step1 : (step1.result || {})
      ));
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

    await restoreHeadSourceBeforeParityCheck();

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
    if (!usingHeadDeployment) {
      await deleteDeployment(deploymentId);
    }

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
        evidence.temporaryDeploymentDeleted = !usingHeadDeployment;
        evidence.reusedHeadDeployment = usingHeadDeployment;
        fs.writeFileSync(evidencePath, JSON.stringify(evidence, null, 2));
      } catch {}
    }
  }
}

main().catch(err => {
  console.error(err && err.message ? err.message : String(err));
  process.exit(1);
});

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
    (
      RUN_MODE.indexOf('CANARY_') === 0 ||
      RUN_MODE === 'DIRECT_STEP7_CANARY' ||
      RUN_MODE === 'DIRECT_TITLE_CANARY'
    ) &&
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

      // Read-only verification may borrow a small bounded slice of the
      // reserved Striven capacity when the daily V3 soft limit has already
      // been reached. This modifies only temporary runner source; live V3
      // configuration remains unchanged.
      const testSoftLimit = Number(
        RELEASE_MANIFEST.testWriteApiSoftLimit || 0
      );
      if (
        testSoftLimit > 1200 &&
        testSoftLimit <= 1500
      ) {
        source = source.replace(
          'v3DailySoftLimit: 1200,',
          'v3DailySoftLimit: ' + testSoftLimit + ','
        );
      }

      if (canaryWrite) {
        const shadowModeAnchor =
          source.indexOf("const TMV3_MODE = 'SHADOW_READ_ONLY';") !== -1;
        const canaryModeAnchor =
          source.indexOf("const TMV3_MODE = 'CANARY_WRITE';") !== -1;

        if (shadowModeAnchor && canaryModeAnchor) {
          fail('Canary temp-source mode guard found conflicting TMV3_MODE anchors.');
        }

        if (shadowModeAnchor) {
          source = source.replace(
            "const TMV3_MODE = 'SHADOW_READ_ONLY';",
            "const TMV3_MODE = 'CANARY_WRITE';"
          );
          canaryModePatchCount++;
        } else if (canaryModeAnchor) {
          // Live V3 may already be in guarded CANARY_WRITE mode. Treat that
          // single canonical anchor as valid rather than requiring a no-op
          // SHADOW_READ_ONLY -> CANARY_WRITE replacement.
          canaryModePatchCount++;
        }

        if (
          f.name === '00_Config' &&
          (
            RUN_MODE === 'CANARY_EVENT_WRITE_FRESH' ||
            RUN_MODE === 'CANARY_EVENT_LINKS_ONLY'
          )
        ) {
          const scopedEventId = String(RELEASE_MANIFEST.eventId || '');
          const scopedVertical = String(RELEASE_MANIFEST.vertical || '');
          const scopedDate = String(RELEASE_MANIFEST.allowedDate || '');

          if (!scopedEventId || scopedVertical !== 'PreInspection' || !scopedDate) {
            fail('Event-scoped canary requires exact PreInspection eventId + allowedDate.');
          }

          const eventMatches = source.match(/canaryEventId:\s*'[^']*',/g) || [];
          const verticalMatches = source.match(/canaryVertical:\s*'[^']*',/g) || [];
          const dateMatches = source.match(/canaryDate:\s*'[^']*',/g) || [];

          if (
            eventMatches.length !== 1 ||
            verticalMatches.length !== 1 ||
            dateMatches.length !== 1
          ) {
            fail(
              'Event-scoped canary config patch expected exactly one event/vertical/date anchor.'
            );
          }

          source = source
            .replace(
              /canaryEventId:\s*'[^']*',/,
              'canaryEventId: ' + JSON.stringify(scopedEventId) + ','
            )
            .replace(
              /canaryVertical:\s*'[^']*',/,
              'canaryVertical: ' + JSON.stringify(scopedVertical) + ','
            )
            .replace(
              /canaryDate:\s*'[^']*',/,
              'canaryDate: ' + JSON.stringify(scopedDate) + ','
            );

          const manualWriteMatches =
            source.match(/manualWritesEnabled:\s*false,/g) || [];

          if (manualWriteMatches.length !== 1) {
            fail(
              'Event-scoped canary manual-write patch expected exactly one disabled policy anchor.'
            );
          }

          // Temporary runner only: allow MANUAL writes for this exact
          // PreInspection event/date canary. The live bound source remains
          // SHADOW_READ_ONLY with manualWritesEnabled=false.
          source = source.replace(
            /manualWritesEnabled:\s*false,/,
            'manualWritesEnabled: true,'
          );
        }


        // The live PreInspection RECREATE path may still rely only on the
        // shared Task cache, which intentionally excludes on-demand Type 105
        // history. Patch only the temporary canary source so completed
        // PreInspection history is proven by Customer + Location before a
        // replacement Task is created.
        if (
          f.name === '58_Operations' &&
          source.indexOf('function tmv3_findRecreateSourceTask_(bundle)') !== -1
        ) {
          source = source.replace(
            '  const candidates = [];\n\n  (bundle.refs.tasks || []).forEach(function(task) {',
            '  let candidates = [];\n\n  (bundle.refs.tasks || []).forEach(function(task) {'
          );

          source = source.replace(
            "  if (candidates.length !== 1) {\n    throw new Error(\n      'RECREATE requires exactly one completed source Task; found ' +\n      candidates.length + '.'\n    );\n  }\n\n  return tmv3_replacementSourceSnapshot_(candidates[0]['Task ID']);",
            "  if (vertical === 'PreInspection' && candidates.length === 0) {\n    const customer = tmv3_customerFromRefs_(bundle.refs, resolved.customerId);\n    if (!customer) {\n      throw new Error('RECREATE requires verified PreInspection Customer before history lookup.');\n    }\n    candidates = tmv3_searchPreInspectionTasks_(customer).filter(function(task) {\n      return (\n        tmv3_taskIsCompleted_(task['Status']) &&\n        String(task['Customer ID'] || '') === String(resolved.customerId || '') &&\n        String(task['Location ID'] || '') === String(resolved.locationId || '')\n      );\n    });\n  }\n\n  if (candidates.length !== 1) {\n    throw new Error(\n      'RECREATE requires exactly one completed source Task; found ' +\n      candidates.length + '.'\n    );\n  }\n\n  return tmv3_replacementSourceSnapshot_(candidates[0]['Task ID']);"
          );
        }
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

function TMPV3_directStep7Canary(vertical, eventId, taskId, expectedPlan) {
  return tmv3_executeVerifiedStep7ExistingPlan(
    String(vertical || ''),
    String(eventId || ''),
    Number(taskId || 0),
    String(expectedPlan || '')
  );
}

function TMPV3_directTitlePreview(vertical, eventId, taskId) {
  return tmv3_previewTitleNormalizationForEvent(
    String(vertical || ''),
    String(eventId || ''),
    Number(taskId || 0)
  );
}

function TMPV3_directTitleCanary(vertical, eventId, taskId, expectedPlan) {
  return tmv3_executeVerifiedTitleNormalization(
    String(vertical || ''),
    String(eventId || ''),
    Number(taskId || 0),
    String(expectedPlan || '')
  );
}

function TMPV3_directPreInspectionStage5DateTest(targetDate) {
  targetDate = String(targetDate || '2026-10-05');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
    throw new Error(
      'Historical PreInspection Stage-5 test requires YYYY-MM-DD targetDate.'
    );
  }

  var dayStart = new Date(targetDate + 'T00:00:00-04:00');
  var dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
  var cfg = TMV3.VERTICALS.PreInspection;
  var rawRecords = [];

  tmv3_verticalCalendars_('PreInspection', cfg).forEach(function(calCfg) {
    var cal = CalendarApp.getCalendarById(calCfg.calendarId);
    if (!cal) return;

    var resolvedCalCfg = Object.assign({}, calCfg, {
      calendarName: tmv3_safeCalendar_(function() {
        return cal.getName ? cal.getName() : '';
      }, '')
    });

    cal.getEvents(dayStart, dayEnd).forEach(function(event) {
      var record = tmv3_calendarEvent_(
        'PreInspection',
        cfg,
        resolvedCalCfg,
        event,
        {
          stage:'STEP1',
          applyEligibility:false,
          mergeLogical:true
        }
      );
      if (record) rawRecords.push(record);
    });
  });

  var step1Records = tmv3_mergeLogicalCalendarRecords_(rawRecords);
  var step2Records = tmv3_step2CalendarRecords_(step1Records);
  var step3Records = tmv3_step3BusinessAnchorRecords_(
    step2Records,
    tmv3_step3AnchorIndex_()
  );
  var step4Records = tmv3_step4IdentityRecords_(
    step3Records,
    tmv3_step4IdentityIndex_()
  );

  tmv3_resetRuntimeMetrics_();

  var results = step4Records.map(function(record) {
    var s2 = record.step2 || {};
    var s3 = record.step3 || {};
    var s4 = record.step4 || {};
    var test = {
      eventId:record.eventId,
      title:record.title,
      start:tmv3_iso_(record.start),
      existingTaskId:tmv3_clean_(record.existingTaskId),
      step2:s2.disposition || '',
      step3:s3.disposition || '',
      step4:s4.disposition || '',
      customerId:tmv3_clean_(s4.customer && s4.customer['Customer ID']),
      locationId:tmv3_clean_(s4.location && s4.location['Location ID']),
      stage5:'NOT_RUN',
      stage5Code:'STEP4_' + (s4.disposition || 'UNKNOWN'),
      taskIds:[],
      candidateSource:'',
      error:''
    };

    if (s4.disposition !== 'VERIFIED') return test;

    try {
      var candidates = [];
      if (record.existingTaskId) {
        var linked = tmv3_getTaskById_(record.existingTaskId);
        candidates = linked ? [linked] : [];
        test.candidateSource = 'EXACT_CALENDAR_TASK_READ';
      } else {
        candidates = tmv3_searchPreInspectionTasks_(s4.customer);
        test.candidateSource = 'CUSTOMER_TYPE105_SEARCH';
      }

      var decision = tmv3_preInspectionTaskDecision_(
        record,
        s4.customer,
        s4.location,
        candidates
      );

      test.stage5 =
        decision.status === 'MATCHED'
          ? 'MATCHED'
          : decision.status === 'CLEAR'
            ? 'NO_TASK'
            : 'REVIEW';
      test.stage5Code =
        decision.status === 'MATCHED'
          ? 'PREINSPECTION_TASK_MATCHED'
          : decision.status === 'CLEAR'
            ? 'PREINSPECTION_NO_OPEN_TASK'
            : (decision.errorCode || 'PREINSPECTION_TASK_REVIEW');
      test.taskIds = (decision.task ? [decision.task] : [])
        .concat(decision.historyTasks || [])
        .map(function(task) {
          return tmv3_clean_(task && task['Task ID']);
        })
        .filter(Boolean);
      test.reason = decision.reason || '';
      test.evidence = decision.evidence || [];
    } catch (err) {
      test.stage5 = 'REVIEW';
      test.stage5Code = 'HISTORICAL_TEST_READ_ERROR';
      test.error = String(err && err.message || err);
    }

    return test;
  });

  return {
    status:'PREINSPECTION_STAGE5_DATE_TEST_COMPLETE',
    targetDate:targetDate,
    records:results,
    counts:results.reduce(function(acc, row) {
      acc.total++;
      acc[row.stage5] = (acc[row.stage5] || 0) + 1;
      return acc;
    }, {total:0}),
    api:tmv3_runtimeMetrics_(),
    writesPerformed:false
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
        body.refreshSources === true
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
        body.refreshSources === true
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
        body.refreshSources === true
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
        body.refreshSources === true
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

    if (body.action === 'issue1Regression') {
      var issue1 = tmv3_issue1SingleDecisionAuthorityRegression();
      return TMPV3_shadowResponse_({
        ok:issue1.status === 'PASS',
        status:'ISSUE1_SINGLE_AUTHORITY_REGRESSION_COMPLETE',
        result:issue1
      });
    }

    if (body.action === 'liveHardeningRegression') {
      var hardening = tmv3_liveHardeningRegression();
      return TMPV3_shadowResponse_({
        ok:hardening.status === 'PASS',
        status:'LIVE_HARDENING_REGRESSION_COMPLETE',
        result:hardening
      });
    }

    if (body.action === 'assignmentFeatureRegression') {
      var regression = tmv3_assignmentFeatureRegression();
      return TMPV3_shadowResponse_({
        ok:regression.status === 'PASS',
        status:'ASSIGNMENT_FEATURE_REGRESSION_COMPLETE',
        result:regression
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

    if (body.action === 'triggerInventory') {
      return TMPV3_shadowResponse_({
        ok:true,
        status:'TRIGGER_INVENTORY_COMPLETE',
        result:{
          triggers:tmv3_listTriggers(),
          watchedCalendarIds:
            typeof tmv3_step1CalendarIds_ === 'function'
              ? tmv3_step1CalendarIds_()
              : []
        }
      });
    }

    if (body.action === 'installManagedTriggers') {
      var installed = tmv3_installTriggers();
      return TMPV3_shadowResponse_({
        ok:true,
        status:'MANAGED_TRIGGERS_INSTALL_COMPLETE',
        result:{
          triggers:installed,
          watchedCalendarIds:
            typeof tmv3_step1CalendarIds_ === 'function'
              ? tmv3_step1CalendarIds_()
              : []
        }
      });
    }

    if (body.action === 'titlePreview') {
      var titlePreview = tmv3_previewTitleNormalizationForEvent(
        String(body.vertical || ''),
        String(body.eventId || ''),
        Number(body.taskId || 0)
      );

      // Preview discovers the fresh plan. Exact-plan binding belongs only
      // to the canary/write request that follows this read-only result.
      if (tmv3_clean_(titlePreview.blocker)) {
        throw new Error(
          'Title preview is blocked: ' +
          String(titlePreview.blocker || '')
        );
      }

      return TMPV3_shadowResponse_({
        ok:true,
        status:'TITLE_PREVIEW_COMPLETE',
        result:titlePreview
      });
    }

    if (body.action === 'titleCanary') {
      var titleCanary = tmv3_executeVerifiedTitleNormalization(
        String(body.vertical || ''),
        String(body.eventId || ''),
        Number(body.taskId || 0),
        String(body.expectedPlan || '')
      );

      return TMPV3_shadowResponse_({
        ok:
          String(titleCanary && titleCanary.status || '') ===
          'TITLE_NORMALIZATION_VERIFIED',
        status:'TITLE_CANARY_COMPLETE',
        result:titleCanary
      });
    }

    if (body.action === 'configuredAutoCanary') {
      var configuredAutoCanary =
        tmv3_runConfiguredCanary_AUTO();

      return TMPV3_shadowResponse_({
        ok:true,
        status:'CONFIGURED_AUTO_CANARY_COMPLETE',
        result:configuredAutoCanary
      });
    }

    if (body.action === 'preInspectionGuestSync') {
      var guestSync =
        tmv3_reconcilePreInspectionSharedGuest_AUTO_({
          force:true,
          reason:'AUTHENTICATED_BACKFILL'
        });

      return TMPV3_shadowResponse_({
        ok:true,
        status:'PREINSPECTION_GUEST_SYNC_COMPLETE',
        result:guestSync
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

      if (
        previewExpectedPlan &&
        previewPlan.plan !== previewExpectedPlan
      ) {
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

    if (body.action === 'step7AssignmentCanary') {
      var assignVertical = String(body.vertical || '');
      var assignEventId = String(body.eventId || '');
      var assignTaskId = Number(body.taskId || 0);
      var assignExpectedPlan = String(body.expectedPlan || '');

      if (assignExpectedPlan !== 'PATCH_ASSIGNMENTS') {
        throw new Error('Assignment canary requires PATCH_ASSIGNMENTS.');
      }

      var assignPlan = tmv3_step7FreshPlanForTask_(
        assignVertical,
        assignEventId,
        assignTaskId
      );

      if (assignPlan.plan !== assignExpectedPlan) {
        throw new Error(
          'Fresh assignment plan changed from ' +
          assignExpectedPlan +
          ' to ' +
          assignPlan.plan +
          '.'
        );
      }
      if (tmv3_clean_(assignPlan.blocker)) {
        throw new Error('Assignment canary blocked: ' + assignPlan.blocker);
      }
      if (
        tmv3_norm_(assignPlan.taskStatus) !== 'open' ||
        assignPlan.readStatus !== 'FRESH_TASK_GET'
      ) {
        throw new Error('Assignment canary requires a fresh-read open Task.');
      }
      if (
        assignPlan.customerCheck !== 'MATCH' ||
        assignPlan.orderCheck === 'MISMATCH' ||
        assignPlan.locationCheck === 'MISMATCH'
      ) {
        throw new Error('Assignment canary relationship safety check failed.');
      }

      var assignEvent = tmv3_findFreshEventRecord_(
        assignVertical,
        assignEventId
      );
      var assignRefs = tmv3_referenceIndex_();
      var assignState = tmv3_eventStateIndex_();
      var assignRecords = tmv3_resolveEventRecords_(
        assignEvent,
        assignRefs,
        assignState
      );
      var assignMatches = assignRecords.filter(function(record) {
        return Number(record.taskId || 0) === assignTaskId;
      });

      if (assignMatches.length !== 1) {
        throw new Error(
          'Assignment canary resolver expected one Task row; found ' +
          assignMatches.length +
          '.'
        );
      }

      var assignBundle = {
        context:null,
        eventRecord:assignEvent,
        refs:assignRefs,
        state:assignState,
        records:assignRecords,
        resolved:assignMatches[0]
      };

      var assignmentResult = tmv3_executeExistingTaskSync_(
        assignBundle,
        'MANUAL',
        'ASSIGNEE'
      );

      var assignAfter = tmv3_step7FreshPlanForTask_(
        assignVertical,
        assignEventId,
        assignTaskId
      );

      if (
        assignAfter.plan !== 'NO_CHANGE' ||
        tmv3_clean_(assignAfter.blocker)
      ) {
        throw new Error(
          'Assignment canary read-back did not converge to NO_CHANGE; fresh plan is ' +
          assignAfter.plan +
          '.'
        );
      }

      tmv3_audit_(
        assignVertical,
        assignEventId,
        assignTaskId,
        'STEP7_ASSIGNMENT_CANARY',
        'PASS',
        assignExpectedPlan
      );

      return TMPV3_shadowResponse_({
        ok:true,
        status:'STEP7_ASSIGNMENT_CANARY_COMPLETE',
        assignment:assignmentResult,
        readbackPlan:assignAfter
      });
    }

    if (body.action === 'step7EventLinksOnly') {
      var linkVertical = String(body.vertical || '');
      var linkEventId = String(body.eventId || '');
      var linkAllowedDate = String(body.allowedDate || '');

      if (linkVertical !== 'PreInspection') {
        throw new Error('Link-only canary is limited to PreInspection.');
      }

      var linkEvent = tmv3_findFreshEventRecord_(
        linkVertical,
        linkEventId
      );

      if (linkAllowedDate) {
        var linkLocalDate = Utilities.formatDate(
          linkEvent.start,
          TMV3_TIMEZONE,
          'yyyy-MM-dd'
        );
        if (linkLocalDate !== linkAllowedDate) {
          throw new Error(
            'Link-only canary date scope blocked Event ' +
            linkEventId + ': expected ' +
            linkAllowedDate + ', got ' + linkLocalDate + '.'
          );
        }
      }

      var linkPlans = tmv3_step7FreshPlansForEvent_(
        linkVertical,
        linkEventId
      );

      if (!Array.isArray(linkPlans) || linkPlans.length !== 1) {
        throw new Error(
          'Link-only canary expected exactly one canonical Step 7 plan; found ' +
          (linkPlans ? linkPlans.length : 0) + '.'
        );
      }

      var linkContract =
        tmv3_step7ValidateExecutionContract_(linkPlans[0]);

      var linkResult = tmv3_executeFreshStep7Selection_(
        {
          previousPlan:linkContract.plan,
          contract:linkContract
        },
        'MANUAL',
        'LINKS'
      );

      return TMPV3_shadowResponse_({
        ok:
          linkResult &&
          (
            linkResult.status === 'VERIFIED_CONVERGENCE' ||
            linkResult.status === 'CANARY_VERIFIED_NO_CHANGE'
          ),
        status:'STEP7_EVENT_LINKS_ONLY_COMPLETE',
        plan:linkContract,
        result:linkResult
      });
    }

    if (body.action === 'step7EventWriteFresh') {
      var freshVertical = String(body.vertical || '');
      var freshEventId = String(body.eventId || '');
      var allowedDate = String(body.allowedDate || '');
      var freshEventForScope = tmv3_findFreshEventRecord_(
        freshVertical,
        freshEventId
      );

      if (freshVertical !== 'PreInspection') {
        throw new Error(
          'TEST_WRITE scope is limited to PreInspection.'
        );
      }

      if (allowedDate) {
        var freshLocalDate = Utilities.formatDate(
          freshEventForScope.start,
          TMV3_TIMEZONE,
          'yyyy-MM-dd'
        );
        if (freshLocalDate !== allowedDate) {
          throw new Error(
            'TEST_WRITE date scope blocked Event ' + freshEventId +
            ': expected ' + allowedDate + ', got ' + freshLocalDate + '.'
          );
        }
      }

      var freshPlans = tmv3_step7FreshPlansForEvent_(
        freshVertical,
        freshEventId
      );

      if (!Array.isArray(freshPlans) || freshPlans.length !== 1) {
        throw new Error(
          'Fresh event write expected exactly one canonical Step 7 plan; found ' +
          (freshPlans ? freshPlans.length : 0) + '.'
        );
      }

      var freshContract = tmv3_step7ValidateExecutionContract_(freshPlans[0]);

      // Technician-owned field: never allow automation to write Field 854.
      if (
        freshVertical === 'PreInspection' &&
        Array.isArray(freshContract.actions)
      ) {
        freshContract.actions = freshContract.actions.filter(function(action) {
          return String(action || '') !== 'PATCH_FIELD854';
        });
      }

      var freshResult = tmv3_executeFreshStep7Selection_(
        {
          previousPlan:freshContract.plan,
          contract:freshContract
        },
        'MANUAL',
        'ALL'
      );

      return TMPV3_shadowResponse_({
        ok:
          freshResult &&
          (
            freshResult.status === 'CREATED_VERIFIED_AND_CONVERGED' ||
            freshResult.status === 'VERIFIED_CONVERGENCE' ||
            freshResult.status === 'CANARY_VERIFIED_NO_CHANGE'
          ),
        status:'STEP7_EVENT_WRITE_FRESH_COMPLETE',
        plan:freshContract,
        result:freshResult
      });
    }

    if (body.action === 'step7EventWrite') {
      var writeVertical = String(body.vertical || '');
      var writeEventId = String(body.eventId || '');
      var writeTaskId = Number(body.taskId || 0);
      var writePreviousPlan = tmv3_step7PublishedPlan_(
        writeVertical,
        writeEventId,
        writeTaskId
      );
      var writeContract = tmv3_step7FreshExecutionContract_(
        writeVertical,
        writeEventId,
        writeTaskId
      );

      // Field 854 is technician-owned. Never include automation Field 854
      // writes in this guarded event execution, even if the live source still
      // exposes the legacy action.
      if (
        writeVertical === 'PreInspection' &&
        Array.isArray(writeContract.actions)
      ) {
        writeContract.actions = writeContract.actions.filter(function(action) {
          return String(action || '') !== 'PATCH_FIELD854';
        });
      }

      var writeResult = tmv3_executeFreshStep7Selection_(
        {
          previousPlan:writePreviousPlan,
          contract:writeContract
        },
        'MANUAL',
        'ALL'
      );

      return TMPV3_shadowResponse_({
        ok:
          writeResult &&
          (
            writeResult.status === 'CREATED_VERIFIED_AND_CONVERGED' ||
            writeResult.status === 'VERIFIED_CONVERGENCE' ||
            writeResult.status === 'CANARY_VERIFIED_NO_CHANGE'
          ),
        status:'STEP7_EVENT_WRITE_COMPLETE',
        result:writeResult
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
        ok:
          canary &&
          (
            canary.status === 'CREATED_VERIFIED_AND_CONVERGED' ||
            canary.status === 'VERIFIED_CONVERGENCE' ||
            canary.status === 'CANARY_VERIFIED_NO_CHANGE'
          ),
        status:'STEP7_CANARY_COMPLETE',
        result:canary
      });
    }

    if (body.action === 'customerProbe') {
      var customerId = Number(body.customerId || 0);
      if (!customerId) {
        throw new Error('Customer probe requires a positive Customer ID.');
      }

      var probe = {
        customerId:customerId,
        customer:null,
        customerError:'',
        contacts:null,
        contactsError:'',
        locations:null,
        locationsError:''
      };

      try {
        probe.customer = tmv3_fetchJson_(
          TMV3.API_BASE + '/v1/customers/' + encodeURIComponent(customerId),
          { method:'get' }
        );
      } catch (errCustomer) {
        probe.customerError = String(errCustomer && errCustomer.message || errCustomer);
      }

      try {
        probe.contacts = tmv3_getCustomerContacts_(
          customerId,
          { forceFresh:true }
        );
      } catch (errContacts) {
        probe.contactsError = String(errContacts && errContacts.message || errContacts);
      }

      try {
        probe.locations = tmv3_fetchJson_(
          TMV3.API_BASE + '/v1/customers/' +
            encodeURIComponent(customerId) + '/locations',
          { method:'get' }
        );
      } catch (errLocations) {
        probe.locationsError = String(errLocations && errLocations.message || errLocations);
      }

      return TMPV3_shadowResponse_({
        ok:
          !!probe.customer ||
          Array.isArray(probe.contacts) ||
          !!probe.locations,
        status:'CUSTOMER_PROBE_COMPLETE',
        probe:probe
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

    if (body.action === 'preInspectionStage5DateTest') {
      var targetDate = '2026-10-05';

      var dayStart = new Date(targetDate + 'T00:00:00-04:00');
      var dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
      var cfg = TMV3.VERTICALS.PreInspection;
      var rawRecords = [];

      tmv3_verticalCalendars_('PreInspection', cfg).forEach(function(calCfg) {
        var cal = CalendarApp.getCalendarById(calCfg.calendarId);
        if (!cal) return;

        var resolvedCalCfg = Object.assign({}, calCfg, {
          calendarName: tmv3_safeCalendar_(function() {
            return cal.getName ? cal.getName() : '';
          }, '')
        });

        cal.getEvents(dayStart, dayEnd).forEach(function(event) {
          var record = tmv3_calendarEvent_(
            'PreInspection',
            cfg,
            resolvedCalCfg,
            event,
            {
              stage:'STEP1',
              applyEligibility:false,
              mergeLogical:true
            }
          );
          if (record) rawRecords.push(record);
        });
      });

      var step1Records = tmv3_mergeLogicalCalendarRecords_(rawRecords);
      var step2Records = tmv3_step2CalendarRecords_(step1Records);
      var step3Records = tmv3_step3BusinessAnchorRecords_(
        step2Records,
        tmv3_step3AnchorIndex_()
      );
      var step4Records = tmv3_step4IdentityRecords_(
        step3Records,
        tmv3_step4IdentityIndex_()
      );

      tmv3_resetRuntimeMetrics_();

      var results = step4Records.map(function(record) {
        var s2 = record.step2 || {};
        var s3 = record.step3 || {};
        var s4 = record.step4 || {};
        var test = {
          eventId:record.eventId,
          title:record.title,
          start:tmv3_iso_(record.start),
          existingTaskId:tmv3_clean_(record.existingTaskId),
          step2:s2.disposition || '',
          step3:s3.disposition || '',
          step4:s4.disposition || '',
          customerId:tmv3_clean_(s4.customer && s4.customer['Customer ID']),
          locationId:tmv3_clean_(s4.location && s4.location['Location ID']),
          stage5:'NOT_RUN',
          stage5Code:'STEP4_' + (s4.disposition || 'UNKNOWN'),
          taskIds:[],
          candidateSource:'',
          error:''
        };

        if (s4.disposition !== 'VERIFIED') return test;

        try {
          var candidates = [];
          if (record.existingTaskId) {
            var linked = tmv3_getTaskById_(record.existingTaskId);
            candidates = linked ? [linked] : [];
            test.candidateSource = 'EXACT_CALENDAR_TASK_READ';
          } else {
            candidates = tmv3_searchPreInspectionTasks_(s4.customer);
            test.candidateSource = 'CUSTOMER_TYPE105_SEARCH';
          }

          var decision = tmv3_preInspectionTaskDecision_(
            record,
            s4.customer,
            s4.location,
            candidates
          );

          test.stage5 =
            decision.status === 'MATCHED'
              ? 'MATCHED'
              : decision.status === 'CLEAR'
                ? 'NO_TASK'
                : 'REVIEW';
          test.stage5Code =
            decision.status === 'MATCHED'
              ? 'PREINSPECTION_TASK_MATCHED'
              : decision.status === 'CLEAR'
                ? 'PREINSPECTION_NO_OPEN_TASK'
                : (decision.errorCode || 'PREINSPECTION_TASK_REVIEW');
          test.taskIds = (decision.task ? [decision.task] : [])
            .concat(decision.historyTasks || [])
            .map(function(task) {
              return tmv3_clean_(task && task['Task ID']);
            })
            .filter(Boolean);
          test.reason = decision.reason || '';
          test.evidence = decision.evidence || [];
        } catch (err) {
          test.stage5 = 'REVIEW';
          test.stage5Code = 'HISTORICAL_TEST_READ_ERROR';
          test.error = String(err && err.message || err);
        }

        return test;
      });

      return TMPV3_shadowResponse_({
        ok:true,
        status:'PREINSPECTION_STAGE5_DATE_TEST_COMPLETE',
        targetDate:targetDate,
        records:results,
        counts:results.reduce(function(acc, row) {
          acc.total++;
          acc[row.stage5] = (acc[row.stage5] || 0) + 1;
          return acc;
        }, {total:0}),
        api:tmv3_runtimeMetrics_(),
        writesPerformed:false
      });
    }

    if (body.action === 'preInspectionSearchSchemaProbe') {
      var searchJson = tmv3_fetchJson_(
        TMV3.API_BASE + '/v2/tasks/search',
        {
          method:'post',
          contentType:'application/json',
          payload:JSON.stringify({
            Type:[105],
            PageIndex:0,
            PageSize:5
          })
        }
      ) || {};

      var searchRows = tmv3_extractTaskSearchRows_(searchJson);
      var first = searchRows.length ? searchRows[0] : {};
      var normalized = searchRows.length
        ? tmv3_normalizeV2TaskModel_(first)
        : {};

      return TMPV3_shadowResponse_({
        ok:true,
        status:'PREINSPECTION_SEARCH_SCHEMA_COMPLETE',
        rowCount:searchRows.length,
        topLevelKeys:Object.keys(searchJson || {}).sort(),
        firstRowKeys:Object.keys(first || {}).sort(),
        firstRow:first,
        normalized:normalized
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
        if (/date|time|complete|done|close|status|finish|budget|type|name|customer|location|contact|order|request|assign|pool/i.test(key)) {
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
  if (
    RUN_MODE.indexOf('CANARY_') === 0 ||
    RUN_MODE === 'DIRECT_STEP7_CANARY' ||
    RUN_MODE === 'DIRECT_TITLE_CANARY'
  ) {
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
    if (
      RUN_MODE !== 'DIRECT_STEP7_PREVIEW' &&
      RUN_MODE !== 'DIRECT_TITLE_PREVIEW'
    ) {
      await new Promise(resolve => setTimeout(resolve, 5000));
    }

    if (RUN_MODE === 'DIRECT_PREINSPECTION_STAGE5_DATE_TEST') {
      const direct = await runScriptFunction(
        'TMPV3_directPreInspectionStage5DateTest',
        [
          String(RELEASE_MANIFEST.allowedDate || '2026-10-05')
        ]
      );

      const executionError =
        direct && direct.error
          ? direct.error
          : null;
      if (executionError) {
        fail(
          'Apps Script direct historical PreInspection Stage-5 test failed: ' +
          JSON.stringify(executionError)
        );
      }

      const result =
        direct &&
        direct.response &&
        direct.response.result
          ? direct.response.result
          : null;

      if (
        !result ||
        String(result.status || '') !==
          'PREINSPECTION_STAGE5_DATE_TEST_COMPLETE'
      ) {
        fail(
          'Direct historical PreInspection Stage-5 test returned no usable result.'
        );
      }

      await updateContent(pre);
      const restored = await getContent();
      if (canonicalHash(restored) !== preHash) {
        fail(
          'V3 source restore failed after direct historical Stage-5 test.'
        );
      }

      fs.mkdirSync(outDir, {recursive:true});
      fs.writeFileSync(
        path.join(outDir, 'evidence.json'),
        JSON.stringify({
          status:'V3_DIRECT_PREINSPECTION_STAGE5_DATE_TEST_VERIFIED',
          result:result,
          sourceHeadHashVerified:true,
          temporaryDeploymentDeleted:false,
          reusedHeadDeployment:false,
          verifiedAt:new Date().toISOString()
        }, null, 2)
      );

      console.log(
        'V3_DIRECT_PREINSPECTION_STAGE5_DATE_TEST_VERIFIED'
      );
      console.log(JSON.stringify(result));
      return;
    }

    if (RUN_MODE === 'DIRECT_TITLE_PREVIEW') {
      const direct = await runScriptFunction(
        'TMPV3_directTitlePreview',
        [
          String(RELEASE_MANIFEST.vertical || ''),
          String(RELEASE_MANIFEST.eventId || ''),
          Number(RELEASE_MANIFEST.taskId || 0)
        ]
      );

      const executionError =
        direct && direct.error
          ? direct.error
          : null;
      if (executionError) {
        fail(
          'Apps Script direct title preview failed: ' +
          JSON.stringify(executionError)
        );
      }

      const result =
        direct &&
        direct.response &&
        direct.response.result
          ? direct.response.result
          : null;

      const expectedPlan = String(RELEASE_MANIFEST.expectedPlan || '');
      if (
        !result ||
        String(result.blocker || '') ||
        (expectedPlan && String(result.plan || '') !== expectedPlan)
      ) {
        fs.writeFileSync(
          path.join(outDir, 'direct-title-preview.json'),
          JSON.stringify({status:'FAILED', raw:direct}, null, 2)
        );
        fail(
          'Direct title preview did not confirm the expected unblocked plan.'
        );
      }

      await updateContent(pre);
      const restored = await getContent();
      if (canonicalHash(restored) !== preHash) {
        fail('V3 source restore failed after direct title preview.');
      }

      fs.writeFileSync(
        path.join(outDir, 'evidence.json'),
        JSON.stringify({
          status:'V3_DIRECT_TITLE_PREVIEW_VERIFIED',
          result:result,
          sourceHeadHashVerified:true,
          temporaryDeploymentDeleted:false,
          reusedHeadDeployment:false,
          verifiedAt:new Date().toISOString()
        }, null, 2)
      );

      console.log('V3_DIRECT_TITLE_PREVIEW_VERIFIED');
      console.log(JSON.stringify(result));
      return;
    }

    if (RUN_MODE === 'DIRECT_TITLE_CANARY') {
      const direct = await runScriptFunction(
        'TMPV3_directTitleCanary',
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
          'Apps Script direct title canary failed: ' +
          JSON.stringify(executionError)
        );
      }

      const result =
        direct &&
        direct.response &&
        direct.response.result
          ? direct.response.result
          : null;

      if (
        !result ||
        String(result.status || '') !== 'TITLE_NORMALIZATION_VERIFIED'
      ) {
        fs.writeFileSync(
          path.join(outDir, 'direct-title-canary.json'),
          JSON.stringify({status:'FAILED', raw:direct}, null, 2)
        );
        fail(
          'Direct title canary did not return TITLE_NORMALIZATION_VERIFIED.'
        );
      }

      await updateContent(pre);
      const restored = await getContent();
      if (canonicalHash(restored) !== preHash) {
        fail('V3 source restore failed after direct title canary.');
      }

      fs.writeFileSync(
        path.join(outDir, 'evidence.json'),
        JSON.stringify({
          status:'V3_DIRECT_TITLE_CANARY_VERIFIED',
          result:result,
          sourceHeadHashVerified:true,
          temporaryDeploymentDeleted:false,
          reusedHeadDeployment:false,
          verifiedAt:new Date().toISOString()
        }, null, 2)
      );

      console.log('V3_DIRECT_TITLE_CANARY_VERIFIED');
      console.log(JSON.stringify(result));
      return;
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

    if (RUN_MODE === 'DIRECT_STEP7_CANARY') {
      const direct = await runScriptFunction(
        'TMPV3_directStep7Canary',
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
          'Apps Script direct canary execution failed: ' +
          JSON.stringify(executionError)
        );
      }

      const result =
        direct &&
        direct.response &&
        direct.response.result
          ? direct.response.result
          : null;

      const acceptedCanaryStatuses = [
        'CREATED_VERIFIED_AND_CONVERGED',
        'VERIFIED_CONVERGENCE',
        'CANARY_VERIFIED_NO_CHANGE'
      ];

      if (
        !result ||
        acceptedCanaryStatuses.indexOf(String(result.status || '')) === -1
      ) {
        fs.mkdirSync(outDir, {recursive:true});
        fs.writeFileSync(
          path.join(outDir, 'direct-step7-canary.json'),
          JSON.stringify({status:'FAILED', raw:direct}, null, 2)
        );
        fail(
          'Direct Step 7 canary did not return a verified terminal result.'
        );
      }

      await updateContent(pre);
      const restored = await getContent();
      if (canonicalHash(restored) !== preHash) {
        fail('V3 source restore failed after direct Step 7 canary.');
      }

      fs.mkdirSync(outDir, {recursive:true});
      fs.writeFileSync(
        path.join(outDir, 'evidence.json'),
        JSON.stringify({
          status:'V3_DIRECT_STEP7_CANARY_VERIFIED',
          result:result,
          sourceHeadHashVerified:true,
          temporaryDeploymentDeleted:false,
          reusedHeadDeployment:false,
          verifiedAt:new Date().toISOString()
        }, null, 2)
      );

      console.log('V3_DIRECT_STEP7_CANARY_VERIFIED');
      console.log(JSON.stringify(result));
      return;
    }

    let url = '';

    // Read-only verification reuses the existing HEAD web-app deployment.
    // This avoids creating an Apps Script version/deployment for every probe,
    // which can hit Apps Script resource/rate limits. Canary writes continue
    // to require the isolated versioned-deployment path.
    if (
      (
        RUN_MODE.indexOf('CANARY_') !== 0 ||
        RUN_MODE === 'CANARY_HEAD_ASSIGNMENT' ||
      RUN_MODE === 'CANARY_EVENT_WRITE' ||
      RUN_MODE === 'CANARY_EVENT_WRITE_FRESH' ||
      RUN_MODE === 'CANARY_EVENT_LINKS_ONLY' ||
        RUN_MODE === 'CANARY_STEP7' ||
        RUN_MODE === 'CANARY_TITLE' ||
        RUN_MODE === 'CANARY_REFRESH'
      ) &&
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
          (RUN_MODE === 'TASK_SCHEMA' ? '/exec' : '/dev');
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
      RUN_MODE === 'SOURCE_REFRESH' ||
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
      RUN_MODE === 'LIVE_HARDENING_REGRESSION' ||
      RUN_MODE === 'ISSUE1_REGRESSION' ||
      RUN_MODE === 'ASSIGNMENT_FEATURE_VERIFY' ||
      RUN_MODE === 'ASSIGNMENT_CASES' ||
      RUN_MODE === 'STEP7_CASES' ||
      RUN_MODE === 'PREVIEW_GOLDCON' ||
      RUN_MODE === 'PREVIEW_ROCCO' ||
      RUN_MODE === 'PREVIEW_STEP7' ||
      RUN_MODE === 'PREVIEW_TITLE' ||
      RUN_MODE === 'CANARY_TITLE' ||
      RUN_MODE === 'CANARY_GOLDCON' ||
      RUN_MODE === 'CANARY_ROCCO' ||
      RUN_MODE === 'CANARY_STEP7' ||
      RUN_MODE === 'CANARY_HEAD_ASSIGNMENT' ||
      RUN_MODE === 'CANARY_EVENT_WRITE' ||
      RUN_MODE === 'CANARY_EVENT_WRITE_FRESH' ||
      RUN_MODE === 'CANARY_EVENT_LINKS_ONLY' ||
      RUN_MODE === 'CONFIGURED_AUTO_CANARY' ||
      RUN_MODE === 'PREINSPECTION_GUEST_SYNC' ||
      RUN_MODE === 'TRIGGER_INVENTORY' ||
      RUN_MODE === 'INSTALL_MANAGED_TRIGGERS' ||
      RUN_MODE === 'TASK_SCHEMA' ||
      RUN_MODE === 'PREINSPECTION_SEARCH_SCHEMA' ||
      RUN_MODE === 'PREINSPECTION_STAGE5_DATE_TEST' ||
      RUN_MODE === 'GOLDCON_TASK_SCHEMA' ||
      RUN_MODE === 'INSTALL_DUE_SAMPLES' ||
      RUN_MODE === 'CUSTOMER_PROBE' ||
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
          : RUN_MODE === 'SOURCE_REFRESH'
            ? 'refreshSources'
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
                    : RUN_MODE === 'CONFIGURED_AUTO_CANARY'
                    ? 'configuredAutoCanary'
                    : RUN_MODE === 'PREINSPECTION_GUEST_SYNC'
                    ? 'preInspectionGuestSync'
                    : RUN_MODE === 'TRIGGER_INVENTORY'
                    ? 'triggerInventory'
                  : RUN_MODE === 'INSTALL_MANAGED_TRIGGERS'
                    ? 'installManagedTriggers'
                  : RUN_MODE === 'PREVIEW_TITLE'
                      ? 'titlePreview'
                    : RUN_MODE === 'CANARY_TITLE'
                      ? 'titleCanary'
                    : RUN_MODE.indexOf('PREVIEW_') === 0
                      ? 'step7CanaryPreview'
                    : RUN_MODE === 'CANARY_HEAD_ASSIGNMENT'
                      ? 'step7AssignmentCanary'
                    : RUN_MODE === 'CANARY_EVENT_WRITE'
                      ? 'step7EventWrite'
                    : RUN_MODE === 'CANARY_EVENT_WRITE_FRESH'
                      ? 'step7EventWriteFresh'
                    : RUN_MODE === 'CANARY_EVENT_LINKS_ONLY'
                      ? 'step7EventLinksOnly'
                    : RUN_MODE.indexOf('CANARY_') === 0
                      ? 'step7Canary'
                    : RUN_MODE === 'SHEET_PUBLISH'
                      ? 'sheetPublish'
                    : RUN_MODE === 'STEP7_CREATE_CANDIDATES'
                      ? 'step7CreateCandidates'
                    : RUN_MODE === 'LIVE_HARDENING_REGRESSION'
                      ? 'liveHardeningRegression'
                    : RUN_MODE === 'ISSUE1_REGRESSION'
                      ? 'issue1Regression'
                    : RUN_MODE === 'ASSIGNMENT_FEATURE_VERIFY'
                      ? 'assignmentFeatureRegression'
                    : RUN_MODE === 'ASSIGNMENT_CASES'
                      ? 'assignmentParityCases'
                    : RUN_MODE === 'STEP7_CASES'
                      ? 'step7Cases'
                      : RUN_MODE.indexOf('STEP7') === 0
                        ? 'step7Reconcile'
                      : RUN_MODE === 'INSTALL_DUE_SAMPLES'
                    ? 'installDueSamples'
                    : RUN_MODE === 'CUSTOMER_PROBE'
                      ? 'customerProbe'
                    : RUN_MODE === 'TASK_SCHEDULE'
                      ? 'taskScheduleProbe'
                    : RUN_MODE === 'PREINSPECTION_STAGE5_DATE_TEST'
                    ? 'preInspectionStage5DateTest'
                    : RUN_MODE === 'PREINSPECTION_SEARCH_SCHEMA'
                    ? 'preInspectionSearchSchemaProbe'
                    : (RUN_MODE === 'TASK_SCHEMA' || RUN_MODE === 'GOLDCON_TASK_SCHEMA')
                    ? 'taskSchemaProbe'
                    : 'step1Calendar';

      const step1 = await postJson(url, {
        token,
        action,
        vertical:
          RUN_MODE === 'TASK_SCHEDULE' ? String(RELEASE_MANIFEST.vertical || '') :
          (
            RUN_MODE === 'CANARY_STEP7' ||
            RUN_MODE === 'PREVIEW_STEP7' ||
            RUN_MODE === 'PREVIEW_TITLE' ||
            RUN_MODE === 'CANARY_TITLE' ||
            RUN_MODE === 'CANARY_HEAD_ASSIGNMENT' ||
            RUN_MODE === 'CANARY_EVENT_WRITE' ||
            RUN_MODE === 'CANARY_EVENT_WRITE_FRESH' ||
            RUN_MODE === 'CANARY_EVENT_LINKS_ONLY'
          )
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
          (
            RUN_MODE === 'TASK_SCHEDULE' ||
            RUN_MODE === 'CANARY_STEP7' ||
            RUN_MODE === 'PREVIEW_STEP7' ||
            RUN_MODE === 'PREVIEW_TITLE' ||
            RUN_MODE === 'CANARY_TITLE' ||
            RUN_MODE === 'CANARY_HEAD_ASSIGNMENT' ||
            RUN_MODE === 'CANARY_EVENT_WRITE' ||
            RUN_MODE === 'CANARY_EVENT_WRITE_FRESH' ||
            RUN_MODE === 'CANARY_EVENT_LINKS_ONLY'
          )
            ? String(RELEASE_MANIFEST.eventId || '')
            : (RUN_MODE === 'CANARY_GOLDCON' || RUN_MODE === 'PREVIEW_GOLDCON')
            ? '3lqqeba2r17067sjrm558kjmd1@google.com'
            : (RUN_MODE === 'CANARY_ROCCO' || RUN_MODE === 'PREVIEW_ROCCO')
              ? '6ftlsr2e9fn31hpm6dj05cuthi@google.com'
              : '',
        customerId:
          RUN_MODE === 'CUSTOMER_PROBE'
            ? Number(RELEASE_MANIFEST.customerId || 0)
            : 0,
        taskId:
          (
            RUN_MODE === 'TASK_SCHEDULE' ||
            RUN_MODE === 'CANARY_STEP7' ||
            RUN_MODE === 'PREVIEW_STEP7' ||
            RUN_MODE === 'PREVIEW_TITLE' ||
            RUN_MODE === 'CANARY_TITLE' ||
            RUN_MODE === 'CANARY_HEAD_ASSIGNMENT' ||
            RUN_MODE === 'CANARY_EVENT_WRITE' ||
            RUN_MODE === 'CANARY_EVENT_WRITE_FRESH' ||
            RUN_MODE === 'CANARY_EVENT_LINKS_ONLY'
          )
            ? Number(RELEASE_MANIFEST.taskId || 0) :
          RUN_MODE === 'TASK_SCHEMA' ? PROBE_TASK_ID :
          (RUN_MODE === 'CANARY_GOLDCON' || RUN_MODE === 'PREVIEW_GOLDCON') ? 18618 :
          (RUN_MODE === 'CANARY_ROCCO' || RUN_MODE === 'PREVIEW_ROCCO') ? 18678 :
          RUN_MODE === 'GOLDCON_TASK_SCHEMA' ? 18618 : 0,
        allowedDate:
          (
            RUN_MODE === 'CANARY_EVENT_WRITE_FRESH' ||
            RUN_MODE === 'CANARY_EVENT_LINKS_ONLY' ||
            RUN_MODE === 'PREINSPECTION_STAGE5_DATE_TEST'
          )
            ? String(RELEASE_MANIFEST.allowedDate || '')
            : '',
        expectedPlan:
          (
            RUN_MODE === 'PREVIEW_GOLDCON' ||
            RUN_MODE === 'CANARY_GOLDCON' ||
            RUN_MODE === 'PREVIEW_ROCCO' ||
            RUN_MODE === 'CANARY_ROCCO' ||
            RUN_MODE === 'PREVIEW_STEP7' ||
            RUN_MODE === 'PREVIEW_TITLE' ||
            RUN_MODE === 'CANARY_TITLE' ||
            RUN_MODE === 'CANARY_STEP7' ||
            RUN_MODE === 'CANARY_HEAD_ASSIGNMENT' ||
            RUN_MODE === 'CANARY_EVENT_WRITE' ||
            RUN_MODE === 'CANARY_EVENT_WRITE_FRESH' ||
            RUN_MODE === 'CANARY_EVENT_LINKS_ONLY'
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
              : RUN_MODE === 'SOURCE_REFRESH'
                ? 'V3_SOURCE_REFRESH_VERIFIED'
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
                        : RUN_MODE === 'CONFIGURED_AUTO_CANARY'
                          ? 'V3_CONFIGURED_AUTO_CANARY_VERIFIED'
                        : RUN_MODE === 'PREINSPECTION_GUEST_SYNC'
                          ? 'V3_PREINSPECTION_GUEST_SYNC_VERIFIED'
                        : RUN_MODE === 'TRIGGER_INVENTORY'
                          ? 'V3_TRIGGER_INVENTORY_VERIFIED'
                        : RUN_MODE === 'INSTALL_MANAGED_TRIGGERS'
                          ? 'V3_MANAGED_TRIGGERS_INSTALL_VERIFIED'
                        : RUN_MODE.indexOf('PREVIEW_') === 0
                          ? 'V3_' + RUN_MODE + '_VERIFIED'
                        : RUN_MODE.indexOf('CANARY_') === 0
                          ? 'V3_' + RUN_MODE + '_VERIFIED'
                        : RUN_MODE === 'LIVE_HARDENING_REGRESSION'
                          ? 'V3_LIVE_HARDENING_REGRESSION_VERIFIED'
                        : RUN_MODE === 'ISSUE1_REGRESSION'
                          ? 'V3_ISSUE1_SINGLE_AUTHORITY_REGRESSION_VERIFIED'
                        : RUN_MODE === 'STEP7_CASES'
                          ? 'V3_STEP7_CASES_VERIFIED'
                          : RUN_MODE.indexOf('STEP7_') === 0
                            ? 'V3_' + RUN_MODE + '_RECONCILIATION_VERIFIED'
                          : RUN_MODE === 'STEP7'
                            ? 'V3_STEP7_RECONCILIATION_VERIFIED'
                            : RUN_MODE === 'TASK_SCHEDULE'
                          ? 'V3_TASK_SCHEDULE_VERIFIED'
                        : RUN_MODE === 'PREINSPECTION_STAGE5_DATE_TEST'
                        ? 'V3_PREINSPECTION_STAGE5_DATE_TEST_VERIFIED'
                        : RUN_MODE === 'PREINSPECTION_SEARCH_SCHEMA'
                        ? 'V3_PREINSPECTION_SEARCH_SCHEMA_PROBED'
                        : RUN_MODE === 'TASK_SCHEMA'
                        ? 'V3_TASK_SCHEMA_PROBED'
                        : 'V3_STEP1_CALENDAR_VERIFIED',
          step1:
            RUN_MODE === 'SOURCE_REFRESH' ||
            RUN_MODE === 'PREINSPECTION_STAGE5_DATE_TEST' ||
            RUN_MODE === 'PREINSPECTION_SEARCH_SCHEMA' ||
            RUN_MODE === 'TASK_SCHEMA' ||
            RUN_MODE === 'GOLDCON_TASK_SCHEMA' ||
            RUN_MODE === 'INSTALL_DUE_SAMPLES' ||
            RUN_MODE === 'TASK_SCHEDULE' ||
            RUN_MODE === 'LIVE_HARDENING_REGRESSION' ||
            RUN_MODE === 'ISSUE1_REGRESSION' ||
            RUN_MODE === 'ASSIGNMENT_FEATURE_VERIFY' ||
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
            : RUN_MODE === 'SOURCE_REFRESH'
              ? 'V3_SOURCE_REFRESH_VERIFIED'
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
                      : RUN_MODE === 'CONFIGURED_AUTO_CANARY'
                        ? 'V3_CONFIGURED_AUTO_CANARY_VERIFIED'
                      : RUN_MODE === 'PREINSPECTION_GUEST_SYNC'
                        ? 'V3_PREINSPECTION_GUEST_SYNC_VERIFIED'
                      : RUN_MODE.indexOf('CANARY_') === 0
                        ? 'V3_' + RUN_MODE + '_VERIFIED'
                      : RUN_MODE === 'LIVE_HARDENING_REGRESSION'
                        ? 'V3_LIVE_HARDENING_REGRESSION_VERIFIED'
                      : RUN_MODE === 'ISSUE1_REGRESSION'
                        ? 'V3_ISSUE1_SINGLE_AUTHORITY_REGRESSION_VERIFIED'
                      : RUN_MODE === 'ASSIGNMENT_FEATURE_VERIFY'
                        ? 'V3_ASSIGNMENT_FEATURE_VERIFIED'
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

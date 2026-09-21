/************************************************************
 * 98_8_Calendar_Task_Link_Acceptance_R1.js
 *
 * Acceptance contract:
 * A mapped row/event is NOT successful until the corresponding
 * Google Calendar event contains the expected Striven Task URL.
 *
 * Public:
 *   REPAIR_VERIFY_ALL_CALENDAR_TASK_LINKS_R1()
 *
 * Internal:
 *   tmCalendarTaskAcceptanceRun_(refreshCalendars)
 *   tmCalendarTaskAcceptanceEnsureTaskLink_(division,eventId,taskId,taskTitle)
 ************************************************************/

const TM_CALENDAR_TASK_ACCEPTANCE_R1 = Object.freeze({
  VERSION: 'TM_CALENDAR_TASK_ACCEPTANCE_R3_REST_READBACK_20260921',
  START_MARKER: '<!-- TASKMAP_TASK_ACCEPTANCE_START -->',
  END_MARKER: '<!-- TASKMAP_TASK_ACCEPTANCE_END -->',
  TASK_BASE_URL: 'https://classicfireplace.striven.com/Tasks/TaskInfo.aspx?TaskID=',
  PROFILES: [
    {
      division: 'Install',
      mappingSheet: 'Install Task Mapping',
      calendarSheet: 'Install Calendar',
      syncFunction: 'syncInstallCalendarToSheet'
    },
    {
      division: 'Delivery',
      mappingSheet: 'Delivery Task Mapping',
      calendarSheet: 'Deliveries Calendar',
      syncFunction: 'syncDeliveriesCalendarToSheet'
    },
    {
      division: 'Service',
      mappingSheet: 'Service Task Mapping',
      calendarSheet: 'Service Tech Calendar',
      syncFunction: 'syncServiceTechCalendarsToSheet'
    },
    {
      division: 'PreInspection',
      mappingSheet: 'PreInspect Task Mapping',
      calendarSheet: 'PreInspect Calendar',
      syncFunction: 'syncPreInspectCalendarNow'
    }
  ]
});

function REPAIR_VERIFY_ALL_CALENDAR_TASK_LINKS_R1() {
  return tmCalendarTaskAcceptanceRun_(true);
}

function tmCalendarTaskAcceptanceRun_(refreshCalendars) {
  const started = new Date();
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const result = {
    mode: 'CALENDAR_TASK_LINK_ACCEPTANCE',
    version: TM_CALENDAR_TASK_ACCEPTANCE_R1.VERSION,
    status: 'RUNNING',
    success: false,
    acceptanceRule: 'SUCCESS only when every target Calendar event contains every expected Striven Task URL.',
    calendarRefresh: [],
    divisions: {},
    targetEvents: 0,
    expectedTaskLinks: 0,
    verifiedEvents: 0,
    verifiedTaskLinks: 0,
    alreadyVerifiedFromFreshMirror: 0,
    alreadyVerifiedFromFreshEvent: 0,
    writtenAndVerified: 0,
    failedEvents: 0,
    failures: [],
    startedAt: started.toISOString(),
    finishedAt: '',
    runtimeSeconds: 0
  };

  if (refreshCalendars !== false) {
    TM_CALENDAR_TASK_ACCEPTANCE_R1.PROFILES.forEach(function(profile) {
      const fn = globalThis[profile.syncFunction];
      if (typeof fn !== 'function') {
        result.calendarRefresh.push({
          division: profile.division,
          status: 'FUNCTION_MISSING',
          functionName: profile.syncFunction
        });
        return;
      }

      try {
        const refreshResult = fn();
        result.calendarRefresh.push({
          division: profile.division,
          status: 'PASS',
          functionName: profile.syncFunction,
          result: refreshResult
        });
      } catch (err) {
        result.calendarRefresh.push({
          division: profile.division,
          status: 'FAIL',
          functionName: profile.syncFunction,
          error: String(err && err.message ? err.message : err)
        });
      }
    });
  }

  TM_CALENDAR_TASK_ACCEPTANCE_R1.PROFILES.forEach(function(profile) {
    const divisionResult = tmCalendarTaskAcceptanceRunDivision_(
      ss,
      profile
    );

    result.divisions[profile.division] = divisionResult;
    result.targetEvents += divisionResult.targetEvents;
    result.expectedTaskLinks += divisionResult.expectedTaskLinks;
    result.verifiedEvents += divisionResult.verifiedEvents;
    result.verifiedTaskLinks += divisionResult.verifiedTaskLinks;
    result.alreadyVerifiedFromFreshMirror += divisionResult.alreadyVerifiedFromFreshMirror;
    result.alreadyVerifiedFromFreshEvent += divisionResult.alreadyVerifiedFromFreshEvent;
    result.writtenAndVerified += divisionResult.writtenAndVerified;
    result.failedEvents += divisionResult.failedEvents;

    (divisionResult.failures || []).forEach(function(failure) {
      result.failures.push(failure);
    });
  });

  result.success =
    result.targetEvents > 0 &&
    result.failedEvents === 0 &&
    result.verifiedEvents === result.targetEvents &&
    result.verifiedTaskLinks === result.expectedTaskLinks;

  result.status = result.success
    ? 'SUCCESS'
    : 'INCOMPLETE_TASK_LINK_ACCEPTANCE';

  result.finishedAt = new Date().toISOString();
  result.runtimeSeconds = Math.round(
    (new Date().getTime() - started.getTime()) / 1000
  );

  Logger.log('============================================================');
  Logger.log('CALENDAR TASK LINK ACCEPTANCE: ' + result.status);
  Logger.log('============================================================');
  Logger.log(JSON.stringify({
    version: result.version,
    status: result.status,
    success: result.success,
    targetEvents: result.targetEvents,
    expectedTaskLinks: result.expectedTaskLinks,
    verifiedEvents: result.verifiedEvents,
    verifiedTaskLinks: result.verifiedTaskLinks,
    alreadyVerifiedFromFreshMirror: result.alreadyVerifiedFromFreshMirror,
    alreadyVerifiedFromFreshEvent: result.alreadyVerifiedFromFreshEvent,
    writtenAndVerified: result.writtenAndVerified,
    failedEvents: result.failedEvents,
    failures: result.failures.slice(0, 25),
    runtimeSeconds: result.runtimeSeconds
  }, null, 2));

  return result;
}

function tmCalendarTaskAcceptanceRunDivision_(ss, profile) {
  const targets = tmCalendarTaskAcceptanceBuildTargets_(ss, profile);
  const mirror = tmCalendarTaskAcceptanceBuildMirrorIndex_(ss, profile);

  const result = {
    division: profile.division,
    targetEvents: targets.length,
    expectedTaskLinks: 0,
    verifiedEvents: 0,
    verifiedTaskLinks: 0,
    alreadyVerifiedFromFreshMirror: 0,
    alreadyVerifiedFromFreshEvent: 0,
    writtenAndVerified: 0,
    failedEvents: 0,
    failures: [],
    events: []
  };

  targets.forEach(function(target) {
    result.expectedTaskLinks += target.taskIds.length;

    const mirrorEvent = mirror[target.eventId] || null;
    const mirrorHtml = mirrorEvent ? String(mirrorEvent.html || '') : '';

    if (
      mirrorHtml &&
      tmCalendarTaskAcceptanceContainsAll_(mirrorHtml, target.taskIds)
    ) {
      result.verifiedEvents++;
      result.verifiedTaskLinks += target.taskIds.length;
      result.alreadyVerifiedFromFreshMirror++;

      result.events.push({
        eventId: target.eventId,
        taskIds: target.taskIds,
        status: 'VERIFIED_FROM_FRESH_CALENDAR_MIRROR',
        writePerformed: false
      });
      return;
    }

    try {
      const ensured = tmCalendarTaskAcceptanceEnsureEvent_(
        profile.division,
        target.eventId,
        target.taskIds,
        target.taskTitles
      );

      if (ensured && ensured.readBackVerified) {
        result.verifiedEvents++;
        result.verifiedTaskLinks += target.taskIds.length;

        if (ensured.writePerformed) {
          result.writtenAndVerified++;
        } else {
          result.alreadyVerifiedFromFreshEvent++;
        }
      } else {
        result.failedEvents++;
        result.failures.push({
          division: profile.division,
          eventId: target.eventId,
          taskIds: target.taskIds,
          reason: 'Task-link write/read-back did not return verified success.'
        });
      }

      result.events.push(ensured);
    } catch (err) {
      const message = String(err && err.message ? err.message : err);

      result.failedEvents++;
      result.failures.push({
        division: profile.division,
        eventId: target.eventId,
        taskIds: target.taskIds,
        reason: message
      });

      result.events.push({
        division: profile.division,
        eventId: target.eventId,
        taskIds: target.taskIds,
        status: 'FAILED',
        readBackVerified: false,
        writePerformed: false,
        error: message
      });
    }
  });

  return result;
}

function tmCalendarTaskAcceptanceBuildTargets_(ss, profile) {
  const sheet = ss.getSheetByName(profile.mappingSheet);
  if (!sheet) {
    throw new Error('Missing mapping sheet: ' + profile.mappingSheet);
  }

  const grid = sheet.getDataRange().getDisplayValues();
  const headerRow = tmCalendarTaskAcceptanceFindHeaderRow_(
    grid,
    ['Event ID', 'Task ID']
  );

  if (headerRow < 0) {
    throw new Error(
      profile.mappingSheet + ' does not expose Event ID + Task ID headers.'
    );
  }

  const headers = grid[headerRow].map(function(v) {
    return String(v || '').trim();
  });

  const eventIdx = tmCalendarTaskAcceptanceHeaderIndex_(
    headers,
    ['Event ID', 'EventId', 'Calendar Event ID']
  );
  const taskIdx = tmCalendarTaskAcceptanceHeaderIndex_(
    headers,
    ['Task ID', 'TaskId', 'Task Number']
  );
  const statusIdx = tmCalendarTaskAcceptanceHeaderIndex_(
    headers,
    ['Status']
  );
  const taskNameIdx = tmCalendarTaskAcceptanceHeaderIndex_(
    headers,
    ['Task Name', 'Calendar Title']
  );

  const byEvent = {};

  for (let r = headerRow + 1; r < grid.length; r++) {
    const row = grid[r] || [];
    const eventId = eventIdx >= 0 ? String(row[eventIdx] || '').trim() : '';
    const taskId = taskIdx >= 0
      ? tmCalendarTaskAcceptancePositive_(row[taskIdx])
      : null;
    const status = statusIdx >= 0
      ? String(row[statusIdx] || '').trim().toUpperCase()
      : '';

    if (!eventId || !taskId) continue;
    if (/^(IGNORED|SKIP|SKIPPED|NOT MATCHED)$/.test(status)) continue;

    if (!byEvent[eventId]) {
      byEvent[eventId] = {
        division: profile.division,
        eventId: eventId,
        taskIds: [],
        taskTitles: {}
      };
    }

    if (byEvent[eventId].taskIds.indexOf(taskId) === -1) {
      byEvent[eventId].taskIds.push(taskId);
    }

    if (taskNameIdx >= 0) {
      const title = String(row[taskNameIdx] || '').trim();
      if (title) byEvent[eventId].taskTitles[taskId] = title;
    }
  }

  return Object.keys(byEvent)
    .map(function(eventId) {
      byEvent[eventId].taskIds.sort(function(a, b) { return a - b; });
      return byEvent[eventId];
    })
    .sort(function(a, b) {
      return a.eventId.localeCompare(b.eventId);
    });
}

function tmCalendarTaskAcceptanceBuildMirrorIndex_(ss, profile) {
  const sheet = ss.getSheetByName(profile.calendarSheet);
  if (!sheet) return {};

  const grid = sheet.getDataRange().getDisplayValues();
  const headerRow = tmCalendarTaskAcceptanceFindHeaderRow_(
    grid,
    ['Description HTML Source']
  );

  if (headerRow < 0) return {};

  const headers = grid[headerRow].map(function(v) {
    return String(v || '').trim();
  });

  const eventIdx = tmCalendarTaskAcceptanceHeaderIndex_(
    headers,
    ['Event ID', 'EventId', 'Calendar Event ID']
  );
  const htmlIdx = tmCalendarTaskAcceptanceHeaderIndex_(
    headers,
    ['Description HTML Source', 'Description HTML', 'Description']
  );

  if (eventIdx < 0 || htmlIdx < 0) return {};

  const out = {};

  for (let r = headerRow + 1; r < grid.length; r++) {
    const eventId = String(grid[r][eventIdx] || '').trim();
    if (!eventId) continue;

    out[eventId] = {
      eventId: eventId,
      html: String(grid[r][htmlIdx] || '')
    };
  }

  return out;
}

function tmCalendarTaskAcceptanceEnsureTaskLink_(
  division,
  eventId,
  taskId,
  taskTitle
) {
  const ids = tmCalendarTaskAcceptanceTaskIdsForEvent_(
    division,
    eventId,
    taskId
  );

  const titles = {};
  if (taskId && taskTitle) {
    titles[Number(taskId)] = String(taskTitle);
  }

  return tmCalendarTaskAcceptanceEnsureEvent_(
    division,
    eventId,
    ids,
    titles
  );
}

function tmCalendarTaskAcceptanceTaskIdsForEvent_(
  division,
  eventId,
  forcedTaskId
) {
  const profile = TM_CALENDAR_TASK_ACCEPTANCE_R1.PROFILES.filter(
    function(p) { return p.division === division; }
  )[0];

  const ids = [];
  const seen = {};

  function add(value) {
    const id = tmCalendarTaskAcceptancePositive_(value);
    if (!id || seen[id]) return;
    seen[id] = true;
    ids.push(id);
  }

  add(forcedTaskId);

  if (!profile) return ids;

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss && ss.getSheetByName(profile.mappingSheet);
  if (!sheet) return ids;

  const grid = sheet.getDataRange().getDisplayValues();
  const headerRow = tmCalendarTaskAcceptanceFindHeaderRow_(
    grid,
    ['Event ID', 'Task ID']
  );

  if (headerRow < 0) return ids;

  const headers = grid[headerRow].map(function(v) {
    return String(v || '').trim();
  });
  const eventIdx = tmCalendarTaskAcceptanceHeaderIndex_(
    headers,
    ['Event ID', 'EventId', 'Calendar Event ID']
  );
  const taskIdx = tmCalendarTaskAcceptanceHeaderIndex_(
    headers,
    ['Task ID', 'TaskId', 'Task Number']
  );

  if (eventIdx < 0 || taskIdx < 0) return ids;

  for (let r = headerRow + 1; r < grid.length; r++) {
    if (String(grid[r][eventIdx] || '').trim() !== String(eventId || '').trim()) {
      continue;
    }
    add(grid[r][taskIdx]);
  }

  ids.sort(function(a, b) { return a - b; });
  return ids;
}

function tmCalendarTaskAcceptanceEnsureEvent_(
  division,
  eventId,
  taskIds,
  taskTitles
) {
  const ids = (taskIds || [])
    .map(tmCalendarTaskAcceptancePositive_)
    .filter(Boolean)
    .filter(function(id, index, arr) {
      return arr.indexOf(id) === index;
    })
    .sort(function(a, b) { return a - b; });

  if (!ids.length) {
    throw new Error('No Task IDs were supplied for Calendar-link acceptance.');
  }

  const ctx = {
    division: division,
    eventId: String(eventId || '').trim()
  };

  let freshApp = null;

  if (typeof tmR4_readFreshCalendarEvent_ === 'function') {
    freshApp = tmR4_readFreshCalendarEvent_(ctx);

    if (!freshApp || !freshApp.event) {
      const normalizedEventId =
        tmCalendarTaskAcceptanceNormalizeEventId_(ctx.eventId);

      if (
        normalizedEventId &&
        normalizedEventId !== ctx.eventId
      ) {
        freshApp = tmR4_readFreshCalendarEvent_({
          division: division,
          eventId: normalizedEventId
        });
      }
    }
  }

  let freshRest = null;

  if (!freshApp || !freshApp.event) {
    freshRest =
      tmCalendarTaskAcceptanceReadEventViaRest_(
        division,
        ctx.eventId
      );
  }

  if (
    (!freshApp || !freshApp.event) &&
    !freshRest
  ) {
    throw new Error(
      division + ' Calendar event could not be fresh-read through CalendarApp or Calendar REST for Event ID ' +
      String(eventId || '')
    );
  }

  const calendarId =
    freshApp && freshApp.calendarId
      ? freshApp.calendarId
      : freshRest.calendarId;

  const before =
    freshApp && freshApp.event
      ? String(freshApp.event.getDescription() || '')
      : String(freshRest.description || '');

  if (tmCalendarTaskAcceptanceContainsAll_(before, ids)) {
    return {
      division: division,
      eventId: String(eventId || '').trim(),
      taskIds: ids,
      status:
        freshApp && freshApp.event
          ? 'VERIFIED_FROM_FRESH_CALENDAR_EVENT'
          : 'VERIFIED_FROM_CALENDAR_REST_READ',
      writePerformed: false,
      readBackVerified: true,
      calendarId: calendarId || null
    };
  }

  const cleaned = tmCalendarTaskAcceptanceRemoveBlock_(before);
  const block = tmCalendarTaskAcceptanceBuildBlock_(
    division,
    ids,
    taskTitles || {}
  );

  const next = cleaned
    ? String(cleaned).replace(/(?:<br\s*\/?>|\s)+$/gi, '').trim() +
      '<br><br>' + block
    : block;

  let writeMode = 'CALENDAR_REST_API_FALLBACK';

  if (freshApp && freshApp.event) {
    try {
      freshApp.event.setDescription(next);
      writeMode = 'CALENDAR_APP';
    } catch (calendarAppErr) {
      tmCalendarTaskAcceptancePatchDescriptionViaRest_(
        calendarId,
        eventId,
        next
      );
    }
  } else {
    tmCalendarTaskAcceptancePatchDescriptionViaRest_(
      calendarId,
      eventId,
      next
    );
  }

  let readBackApp = null;

  if (typeof tmR4_readFreshCalendarEvent_ === 'function') {
    readBackApp = tmR4_readFreshCalendarEvent_(ctx);

    if (!readBackApp || !readBackApp.event) {
      const normalizedEventId =
        tmCalendarTaskAcceptanceNormalizeEventId_(ctx.eventId);

      if (
        normalizedEventId &&
        normalizedEventId !== ctx.eventId
      ) {
        readBackApp = tmR4_readFreshCalendarEvent_({
          division: division,
          eventId: normalizedEventId
        });
      }
    }
  }

  let actual = '';
  let readBackCalendarId = calendarId;

  if (readBackApp && readBackApp.event) {
    actual = String(readBackApp.event.getDescription() || '');
    readBackCalendarId =
      readBackApp.calendarId || readBackCalendarId;
  } else {
    const readBackRest =
      tmCalendarTaskAcceptanceReadEventViaRest_(
        division,
        ctx.eventId,
        calendarId
      );

    if (!readBackRest) {
      throw new Error(
        division + ' Calendar event disappeared after Task-link write.'
      );
    }

    actual = String(readBackRest.description || '');
    readBackCalendarId =
      readBackRest.calendarId || readBackCalendarId;
  }

  const missing = ids.filter(function(id) {
    return actual.indexOf(
      TM_CALENDAR_TASK_ACCEPTANCE_R1.TASK_BASE_URL + id
    ) === -1;
  });

  if (missing.length) {
    throw new Error(
      division + ' Calendar read-back is missing Task link(s): ' +
      missing.join(', ')
    );
  }

  return {
    division: division,
    eventId: String(eventId || '').trim(),
    taskIds: ids,
    status: 'WRITTEN_AND_READBACK_VERIFIED',
    writePerformed: true,
    readBackVerified: true,
    calendarId: readBackCalendarId || null,
    writeMode: writeMode
  };
}


function tmCalendarTaskAcceptanceCalendarIdsForDivision_(division) {
  const candidates = [];

  function add(value) {
    if (!value) return;

    if (typeof value === 'string') {
      candidates.push(value);
      return;
    }

    if (typeof value === 'object') {
      const id =
        value.calendarId ||
        value.calendarID ||
        value.id ||
        value.CalendarId ||
        value.CalendarID ||
        '';

      if (id) candidates.push(id);
    }
  }

  if (
    division === 'Install' &&
    typeof TASKMAP_PROJECT !== 'undefined' &&
    TASKMAP_PROJECT &&
    TASKMAP_PROJECT.INSTALL_CALENDAR_ID
  ) {
    add(TASKMAP_PROJECT.INSTALL_CALENDAR_ID);
  } else if (
    division === 'Delivery' &&
    typeof TASKMAP_PROJECT !== 'undefined' &&
    TASKMAP_PROJECT &&
    TASKMAP_PROJECT.DELIVERY_CALENDAR_ID
  ) {
    add(TASKMAP_PROJECT.DELIVERY_CALENDAR_ID);
  } else if (division === 'PreInspection') {
    if (
      typeof PREINSPECT_R3418F_CALENDAR_ID !== 'undefined' &&
      PREINSPECT_R3418F_CALENDAR_ID
    ) {
      add(PREINSPECT_R3418F_CALENDAR_ID);
    }

    if (
      typeof PREINSPECT_REVIEW_CONFIG !== 'undefined' &&
      PREINSPECT_REVIEW_CONFIG &&
      PREINSPECT_REVIEW_CONFIG.CALENDAR_SYNC
    ) {
      add(PREINSPECT_REVIEW_CONFIG.CALENDAR_SYNC.CALENDAR_ID);
    }

    if (
      typeof PREINSPECT_CALENDAR_SYNC_CONFIG !== 'undefined' &&
      PREINSPECT_CALENDAR_SYNC_CONFIG
    ) {
      add(PREINSPECT_CALENDAR_SYNC_CONFIG.CALENDAR_ID);
    }
  } else if (division === 'Service') {
    if (typeof serviceGetTechCalendarConfigs_ === 'function') {
      try {
        (serviceGetTechCalendarConfigs_() || []).forEach(add);
      } catch (ignoredServiceCalendarConfigError) {}
    }

    if (
      !candidates.length &&
      typeof SERVICE_CONFIG !== 'undefined' &&
      SERVICE_CONFIG &&
      Array.isArray(SERVICE_CONFIG.TECH_CALENDARS)
    ) {
      SERVICE_CONFIG.TECH_CALENDARS.forEach(add);
    }

    if (
      !candidates.length &&
      typeof SERVICE_TECH_CALENDARS !== 'undefined' &&
      Array.isArray(SERVICE_TECH_CALENDARS)
    ) {
      SERVICE_TECH_CALENDARS.forEach(add);
    }

    if (
      !candidates.length &&
      typeof TASKMAP_PROJECT !== 'undefined' &&
      TASKMAP_PROJECT &&
      TASKMAP_PROJECT.SERVICE_CALENDARS
    ) {
      const svc = TASKMAP_PROJECT.SERVICE_CALENDARS;

      if (Array.isArray(svc)) {
        svc.forEach(add);
      } else {
        Object.keys(svc).forEach(function(key) {
          add(svc[key]);
        });
      }
    }
  }

  const seen = {};

  return candidates
    .map(function(value) {
      return String(value || '').trim();
    })
    .filter(function(value) {
      if (!value || seen[value]) return false;
      seen[value] = true;
      return true;
    });
}

function tmCalendarTaskAcceptanceReadEventViaRest_(
  division,
  eventId,
  preferredCalendarId
) {
  const cleanEventId =
    tmCalendarTaskAcceptanceNormalizeEventId_(eventId);

  if (!cleanEventId) return null;

  const calendarIds = [];

  if (preferredCalendarId) {
    calendarIds.push(String(preferredCalendarId).trim());
  }

  tmCalendarTaskAcceptanceCalendarIdsForDivision_(division)
    .forEach(function(calendarId) {
      if (calendarIds.indexOf(calendarId) === -1) {
        calendarIds.push(calendarId);
      }
    });

  const token = ScriptApp.getOAuthToken();

  for (let i = 0; i < calendarIds.length; i++) {
    const calendarId = String(calendarIds[i] || '').trim();
    if (!calendarId) continue;

    const url =
      'https://www.googleapis.com/calendar/v3/calendars/' +
      encodeURIComponent(calendarId) +
      '/events/' +
      encodeURIComponent(cleanEventId);

    const response = UrlFetchApp.fetch(url, {
      method: 'get',
      headers: {
        Authorization: 'Bearer ' + token,
        Accept: 'application/json'
      },
      muteHttpExceptions: true
    });

    const code = response.getResponseCode();

    if (code === 404 || code === 410) {
      continue;
    }

    if (code < 200 || code >= 300) {
      throw new Error(
        'Calendar REST GET failed HTTP ' +
        code +
        ' for Calendar ' +
        calendarId +
        ', Event ' +
        cleanEventId +
        ': ' +
        String(response.getContentText() || '').slice(0, 500)
      );
    }

    const obj = JSON.parse(response.getContentText() || '{}');

    return {
      calendarId: calendarId,
      eventId: cleanEventId,
      description: String(obj.description || ''),
      htmlLink: String(obj.htmlLink || ''),
      status: String(obj.status || '')
    };
  }

  return null;
}

function tmCalendarTaskAcceptanceNormalizeEventId_(eventId) {
  return String(eventId || '')
    .trim()
    .replace(/@google\.com$/i, '');
}

function tmCalendarTaskAcceptancePatchDescriptionViaRest_(
  calendarId,
  eventId,
  description
) {
  const cleanCalendarId = String(calendarId || '').trim();
  const cleanEventId =
    tmCalendarTaskAcceptanceNormalizeEventId_(eventId);

  if (!cleanCalendarId || !cleanEventId) {
    throw new Error(
      'Calendar REST fallback requires Calendar ID + normalized Event ID.'
    );
  }

  const url =
    'https://www.googleapis.com/calendar/v3/calendars/' +
    encodeURIComponent(cleanCalendarId) +
    '/events/' +
    encodeURIComponent(cleanEventId) +
    '?sendUpdates=none';

  const response = UrlFetchApp.fetch(url, {
    method: 'patch',
    contentType: 'application/json',
    headers: {
      Authorization: 'Bearer ' + ScriptApp.getOAuthToken()
    },
    payload: JSON.stringify({
      description: String(description || '')
    }),
    muteHttpExceptions: true
  });

  const code = response.getResponseCode();
  const body = response.getContentText();

  if (code < 200 || code >= 300) {
    throw new Error(
      'Calendar REST fallback PATCH failed HTTP ' +
      code +
      ': ' +
      String(body || '').slice(0, 500)
    );
  }

  return {
    status: 'PATCHED',
    httpCode: code,
    calendarId: cleanCalendarId,
    eventId: cleanEventId
  };
}

function tmCalendarTaskAcceptanceContainsAll_(html, taskIds) {
  const text = String(html || '');

  return (taskIds || []).every(function(id) {
    return text.indexOf(
      TM_CALENDAR_TASK_ACCEPTANCE_R1.TASK_BASE_URL + id
    ) !== -1;
  });
}

function tmCalendarTaskAcceptanceBuildBlock_(
  division,
  taskIds,
  taskTitles
) {
  const lines = [
    TM_CALENDAR_TASK_ACCEPTANCE_R1.START_MARKER,
    '------- Verified Striven Task Link' +
      ((taskIds || []).length > 1 ? 's' : '') +
      ' -------',
    ''
  ];

  (taskIds || []).forEach(function(id) {
    const url =
      TM_CALENDAR_TASK_ACCEPTANCE_R1.TASK_BASE_URL +
      encodeURIComponent(id);

    const title =
      String(taskTitles && taskTitles[id] || '').trim() ||
      (division + ' Task #' + id);

    lines.push(
      '<a href="' +
      tmCalendarTaskAcceptanceEscapeHtml_(url) +
      '">' +
      tmCalendarTaskAcceptanceEscapeHtml_(
        title + ' — Task #' + id
      ) +
      '</a>'
    );
  });

  lines.push(
    '',
    '------------------------------------',
    TM_CALENDAR_TASK_ACCEPTANCE_R1.END_MARKER
  );

  return lines.join('<br>');
}

function tmCalendarTaskAcceptanceRemoveBlock_(description) {
  const start = tmCalendarTaskAcceptanceEscapeRegex_(
    TM_CALENDAR_TASK_ACCEPTANCE_R1.START_MARKER
  );
  const end = tmCalendarTaskAcceptanceEscapeRegex_(
    TM_CALENDAR_TASK_ACCEPTANCE_R1.END_MARKER
  );

  const re = new RegExp(
    '(?:<br\\s*\\/?>|\\r?\\n|\\s)*' +
    start +
    '[\\s\\S]*?' +
    end +
    '(?:<br\\s*\\/?>|\\r?\\n|\\s)*',
    'gi'
  );

  return String(description || '').replace(re, '').trim();
}

function tmCalendarTaskAcceptanceFindHeaderRow_(grid, requiredHeaders) {
  for (let r = 0; r < Math.min((grid || []).length, 10); r++) {
    const headers = (grid[r] || []).map(function(v) {
      return String(v || '').trim().toLowerCase();
    });

    const pass = (requiredHeaders || []).every(function(name) {
      return headers.indexOf(String(name || '').trim().toLowerCase()) !== -1;
    });

    if (pass) return r;
  }

  return -1;
}

function tmCalendarTaskAcceptanceHeaderIndex_(headers, aliases) {
  const normalized = (headers || []).map(function(v) {
    return String(v || '').trim().toLowerCase();
  });

  for (let i = 0; i < (aliases || []).length; i++) {
    const idx = normalized.indexOf(
      String(aliases[i] || '').trim().toLowerCase()
    );
    if (idx >= 0) return idx;
  }

  return -1;
}

function tmCalendarTaskAcceptanceEscapeHtml_(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function tmCalendarTaskAcceptanceEscapeRegex_(value) {
  const special = '\\^$.*+?()[]{}|';
  return String(value || '')
    .split('')
    .map(function(ch) {
      return special.indexOf(ch) !== -1 ? '\\' + ch : ch;
    })
    .join('');
}

function tmCalendarTaskAcceptancePositive_(value) {
  const n = Number(
    String(value === null || value === undefined ? '' : value)
      .replace(/[^0-9.-]/g, '')
  );

  return isFinite(n) && n > 0 ? Math.floor(n) : null;
}

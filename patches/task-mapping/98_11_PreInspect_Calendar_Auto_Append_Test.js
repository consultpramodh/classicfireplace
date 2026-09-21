/************************************************************
 * 98_11_PreInspect_Calendar_Auto_Append_Test.js
 *
 * PUBLIC:
 *   TEST_PREINSPECT_CALENDAR_AUTO_APPEND_R1()
 *
 * Controlled regression:
 * 1. Pick the first MATCHED PreInspect row with Event ID + Task ID.
 * 2. Backup the exact live Calendar description.
 * 3. Remove only the managed PreInspection Task-link footer.
 * 4. Prove the Task URL is absent.
 * 5. Run the normal PreInspection mirror + hyperlink sync path.
 * 6. Fresh-read Calendar through REST and prove the Task URL returned.
 * 7. Restore the exact original description in finally.
 *
 * Net effect after completion: no permanent Calendar description change.
 ************************************************************/

function TEST_PREINSPECT_CALENDAR_AUTO_APPEND_R1() {
  const started = new Date();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss && ss.getSheetByName('PreInspect Task Mapping');

  if (!sheet) {
    throw new Error('Missing PreInspect Task Mapping sheet.');
  }

  const values = sheet.getDataRange().getDisplayValues();
  if (values.length < 2) {
    throw new Error('PreInspect Task Mapping has no data rows.');
  }

  const headers = values[0].map(function(v) {
    return String(v || '').trim();
  });

  function idx(name) {
    return headers.indexOf(name);
  }

  const statusIdx = idx('Status');
  const taskIdx = idx('Task ID');
  const eventIdx = idx('Event ID');
  const titleIdx = idx('Calendar Title');

  if (statusIdx < 0 || taskIdx < 0 || eventIdx < 0) {
    throw new Error(
      'PreInspect Task Mapping is missing Status / Task ID / Event ID.'
    );
  }

  let target = null;

  for (let r = 1; r < values.length; r++) {
    const row = values[r] || [];
    const status = String(row[statusIdx] || '').trim().toUpperCase();
    const taskId = Number(row[taskIdx] || 0);
    const eventId = String(row[eventIdx] || '').trim();

    if (
      status === 'MATCHED' &&
      taskId > 0 &&
      eventId
    ) {
      target = {
        mappingRow: r + 1,
        status: status,
        taskId: taskId,
        eventId: eventId,
        title:
          titleIdx >= 0
            ? String(row[titleIdx] || '').trim()
            : ''
      };
      break;
    }
  }

  if (!target) {
    throw new Error(
      'No MATCHED PreInspection row with Event ID + Task ID is available.'
    );
  }

  if (
    typeof tmCalendarTaskAcceptanceReadEventViaRest_ !== 'function' ||
    typeof tmCalendarTaskAcceptancePatchDescriptionViaRest_ !== 'function'
  ) {
    throw new Error(
      'Calendar REST acceptance helpers are unavailable.'
    );
  }

  if (typeof preinspectR3415SyncMirrorAndHyperlinks_ !== 'function') {
    throw new Error(
      'Normal PreInspection mirror + hyperlink sync function is unavailable.'
    );
  }

  const calendarIds =
    typeof tmCalendarTaskAcceptanceCalendarIdsForDivision_ === 'function'
      ? tmCalendarTaskAcceptanceCalendarIdsForDivision_('PreInspection')
      : [];

  const calendarId =
    calendarIds && calendarIds.length
      ? String(calendarIds[0] || '').trim()
      : '';

  if (!calendarId) {
    throw new Error('PreInspection Calendar ID could not be resolved.');
  }

  const taskUrl =
    'https://classicfireplace.striven.com/Tasks/TaskInfo.aspx?TaskID=' +
    target.taskId;

  const before = tmCalendarTaskAcceptanceReadEventViaRest_(
    'PreInspection',
    target.eventId,
    calendarId
  );

  if (!before) {
    throw new Error(
      'Could not REST-read target PreInspection Calendar event.'
    );
  }

  const originalDescription = String(before.description || '');

  if (originalDescription.indexOf(taskUrl) === -1) {
    throw new Error(
      'Precondition failed: target Calendar event does not currently contain ' +
      taskUrl
    );
  }

  let strippedDescription = originalDescription;

  if (typeof preinspectR3414RemoveManagedTaskFooterOnly_ === 'function') {
    strippedDescription =
      preinspectR3414RemoveManagedTaskFooterOnly_(
        originalDescription
      );
  }

  // Fallback for legacy/generated footer shapes.
  if (strippedDescription.indexOf(taskUrl) !== -1) {
    strippedDescription = originalDescription.replace(
      /(?:<br\s*\/?>|\r?\n|\s){0,3}-{5,}\s*Pre-Inspection Task Link\s*-{5,}[\s\S]*?TaskInfo\.aspx\?TaskID=\d+[\s\S]*?-{5,}\s*$/gi,
      ''
    ).trim();
  }

  if (strippedDescription.indexOf(taskUrl) !== -1) {
    throw new Error(
      'Test setup could not safely remove only the managed PreInspection Task-link footer.'
    );
  }

  const result = {
    mode: 'PREINSPECT_CALENDAR_AUTO_APPEND_REGRESSION',
    version: 'TM_PREINSPECT_CALENDAR_AUTO_APPEND_TEST_R1_20260921',
    status: 'RUNNING',
    pass: false,
    mappingRow: target.mappingRow,
    eventId: target.eventId,
    taskId: target.taskId,
    title: target.title,
    taskUrl: taskUrl,
    setup: {},
    sync: null,
    verification: {},
    cleanup: {},
    startedAt: started.toISOString(),
    finishedAt: '',
    runtimeSeconds: 0
  };

  try {
    tmCalendarTaskAcceptancePatchDescriptionViaRest_(
      calendarId,
      target.eventId,
      strippedDescription
    );

    const afterRemoval =
      tmCalendarTaskAcceptanceReadEventViaRest_(
        'PreInspection',
        target.eventId,
        calendarId
      );

    result.setup = {
      taskLinkRemoved:
        !!(
          afterRemoval &&
          String(afterRemoval.description || '').indexOf(taskUrl) === -1
        )
    };

    if (!result.setup.taskLinkRemoved) {
      throw new Error(
        'Controlled setup failed: Task link remained after footer removal.'
      );
    }

    result.sync =
      preinspectR3415SyncMirrorAndHyperlinks_(
        'AUTO_APPEND_REGRESSION_TEST'
      );

    const afterSync =
      tmCalendarTaskAcceptanceReadEventViaRest_(
        'PreInspection',
        target.eventId,
        calendarId
      );

    const restoredDescription =
      afterSync ? String(afterSync.description || '') : '';

    result.verification = {
      taskLinkRestored:
        restoredDescription.indexOf(taskUrl) !== -1,
      calendarEventReadBack: !!afterSync,
      syncReportedCalendarWrite:
        !!(
          result.sync &&
          result.sync.calendarWritesPerformed
        ),
      hyperlinkPass:
        result.sync && result.sync.hyperlinks
          ? result.sync.hyperlinks.calendarEventTaskLinks || null
          : null
    };

    result.pass =
      result.setup.taskLinkRemoved === true &&
      result.verification.calendarEventReadBack === true &&
      result.verification.taskLinkRestored === true;

    result.status = result.pass
      ? 'PASS'
      : 'FAIL';

    if (!result.pass) {
      throw new Error(
        'Automatic PreInspection Calendar Task-link append was not proven.'
      );
    }
  } finally {
    try {
      const current =
        tmCalendarTaskAcceptanceReadEventViaRest_(
          'PreInspection',
          target.eventId,
          calendarId
        );

      const currentDescription =
        current ? String(current.description || '') : '';

      if (currentDescription !== originalDescription) {
        tmCalendarTaskAcceptancePatchDescriptionViaRest_(
          calendarId,
          target.eventId,
          originalDescription
        );
      }

      const restored =
        tmCalendarTaskAcceptanceReadEventViaRest_(
          'PreInspection',
          target.eventId,
          calendarId
        );

      result.cleanup = {
        originalDescriptionRestored:
          !!(
            restored &&
            String(restored.description || '') === originalDescription
          )
      };
    } catch (cleanupErr) {
      result.cleanup = {
        originalDescriptionRestored: false,
        error: String(
          cleanupErr && cleanupErr.message
            ? cleanupErr.message
            : cleanupErr
        )
      };
    }

    result.finishedAt = new Date().toISOString();
    result.runtimeSeconds = Math.round(
      (new Date().getTime() - started.getTime()) / 1000
    );

    Logger.log('============================================================');
    Logger.log(
      'PREINSPECT CALENDAR AUTO-APPEND TEST: ' +
      (result.pass ? 'PASS' : 'FAIL')
    );
    Logger.log('============================================================');
    Logger.log(JSON.stringify(result, null, 2));
  }

  return result;
}

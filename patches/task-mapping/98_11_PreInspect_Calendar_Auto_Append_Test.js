/************************************************************
 * 98_11_PreInspect_Calendar_Auto_Append_Test.js
 *
 * PUBLIC:
 *   TEST_PREINSPECT_CALENDAR_AUTO_APPEND_R1()
 *   TEST_PREINSPECT_DUAL_CALENDAR_AUTO_APPEND_R1()
 *
 * Runtime verification for the normal PreInspection sync path.
 * No Calendar REST API required.
 *
 * PASS requires every resolved PreInspection Task to be present
 * in BOTH:
 *   - CF PreInspects shared/group calendar
 *   - Stephen calendar
 ************************************************************/

function TEST_PREINSPECT_CALENDAR_AUTO_APPEND_R1() {
  return TEST_PREINSPECT_DUAL_CALENDAR_AUTO_APPEND_R1();
}

function TEST_PREINSPECT_DUAL_CALENDAR_AUTO_APPEND_R1() {
  const started = new Date();

  if (typeof preinspectR3415SyncMirrorAndHyperlinks_ !== 'function') {
    throw new Error(
      'Normal PreInspection mirror + hyperlink sync function is unavailable.'
    );
  }

  if (typeof tmPreInspectEnsureDualCalendarTaskLink_ !== 'function') {
    throw new Error(
      'PreInspection dual-calendar Task-link helper is unavailable.'
    );
  }

  const sync =
    preinspectR3415SyncMirrorAndHyperlinks_(
      'DUAL_CALENDAR_AUTO_APPEND_TEST'
    );

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet =
    ss && ss.getSheetByName('PreInspect Task Mapping');

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

  const statusIdx = headers.indexOf('Status');
  const taskIdx = headers.indexOf('Task ID');
  const eventIdx = headers.indexOf('Event ID');
  const titleIdx = headers.indexOf('Calendar Title');

  if (statusIdx < 0 || taskIdx < 0 || eventIdx < 0) {
    throw new Error(
      'PreInspect Task Mapping is missing Status / Task ID / Event ID.'
    );
  }

  const result = {
    mode: 'PREINSPECT_DUAL_CALENDAR_AUTO_APPEND_TEST',
    version: 'TM_PREINSPECT_DUAL_CALENDAR_AUTO_APPEND_TEST_R1_20260921',
    status: 'RUNNING',
    pass: false,
    sync: sync,
    checked: 0,
    verifiedBoth: 0,
    writesPerformed: 0,
    failures: [],
    rows: [],
    startedAt: started.toISOString(),
    finishedAt: '',
    runtimeSeconds: 0
  };

  for (let r = 1; r < values.length; r++) {
    const row = values[r] || [];
    const status =
      String(row[statusIdx] || '').trim().toUpperCase();
    const taskId = Number(row[taskIdx] || 0);
    const eventId = String(row[eventIdx] || '').trim();

    if (
      !(taskId > 0) ||
      !eventId ||
      status === 'SKIP' ||
      status === 'SKIPPED' ||
      status === 'NOT MATCHED'
    ) {
      continue;
    }

    result.checked++;

    const taskTitle =
      titleIdx >= 0
        ? String(row[titleIdx] || '').trim()
        : '';

    try {
      const dual =
        tmPreInspectEnsureDualCalendarTaskLink_(
          eventId,
          taskId,
          taskTitle
        );

      if (dual && dual.readBackVerified === true) {
        result.verifiedBoth++;

        if (dual.writePerformed) {
          result.writesPerformed++;
        }
      } else {
        result.failures.push({
          mappingRow: r + 1,
          eventId: eventId,
          taskId: taskId,
          reason:
            'Dual Calendar helper did not return readBackVerified=true.',
          result: dual || null
        });
      }

      result.rows.push({
        mappingRow: r + 1,
        eventId: eventId,
        taskId: taskId,
        status:
          dual && dual.status
            ? dual.status
            : 'UNKNOWN',
        group:
          dual && dual.group
            ? dual.group.status
            : '',
        stephen:
          dual && dual.stephen
            ? dual.stephen.status
            : '',
        writePerformed:
          !!(dual && dual.writePerformed),
        readBackVerified:
          !!(dual && dual.readBackVerified)
      });
    } catch (err) {
      const message = String(
        err && err.message ? err.message : err
      );

      result.failures.push({
        mappingRow: r + 1,
        eventId: eventId,
        taskId: taskId,
        reason: message
      });

      result.rows.push({
        mappingRow: r + 1,
        eventId: eventId,
        taskId: taskId,
        status: 'FAILED',
        group: '',
        stephen: '',
        writePerformed: false,
        readBackVerified: false,
        error: message
      });
    }
  }

  result.pass =
    result.checked > 0 &&
    result.failures.length === 0 &&
    result.verifiedBoth === result.checked;

  result.status =
    result.pass
      ? 'PASS'
      : 'FAIL';

  result.finishedAt = new Date().toISOString();
  result.runtimeSeconds = Math.round(
    (new Date().getTime() - started.getTime()) / 1000
  );

  Logger.log('============================================================');
  Logger.log(
    'PREINSPECT DUAL CALENDAR AUTO-APPEND TEST: ' +
    result.status
  );
  Logger.log('============================================================');
  Logger.log(JSON.stringify(result, null, 2));

  return result;
}

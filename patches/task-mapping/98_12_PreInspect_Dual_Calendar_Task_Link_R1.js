/************************************************************
 * 98_12_PreInspect_Dual_Calendar_Task_Link_R1.js
 *
 * PreInspection Task-link transport:
 * - CF PreInspects shared/group calendar
 * - Stephen calendar
 *
 * Same Event ID is resolved independently in both calendars.
 * Descriptions are preserved independently.
 * No Google Calendar REST API dependency.
 ************************************************************/

const TM_PREINSPECT_DUAL_CALENDAR_R1 = Object.freeze({
  VERSION: 'TM_PREINSPECT_DUAL_CALENDAR_R1_20260921',
  GROUP_CALENDAR_ID:
    'c_3088a3989f3eb809957ed5c40137a7111a0ac97f68c29b40c144028cb14320dc@group.calendar.google.com',
  STEPHEN_CALENDAR_ID:
    'classicfireplace.ca_c20qcqfhvjbv784asn9pvuiaf4@group.calendar.google.com',
  LOOKBACK_DAYS: 2,
  LOOKAHEAD_DAYS: 60
});

function tmPreInspectEnsureDualCalendarTaskLink_(
  eventId,
  taskId,
  taskTitle
) {
  const group = tmPreInspectEnsureCalendarTaskLinkOne_(
    TM_PREINSPECT_DUAL_CALENDAR_R1.GROUP_CALENDAR_ID,
    eventId,
    taskId,
    taskTitle,
    'GROUP'
  );

  const stephen = tmPreInspectEnsureCalendarTaskLinkOne_(
    TM_PREINSPECT_DUAL_CALENDAR_R1.STEPHEN_CALENDAR_ID,
    eventId,
    taskId,
    taskTitle,
    'STEPHEN'
  );

  const readBackVerified =
    !!(
      group &&
      group.readBackVerified === true &&
      stephen &&
      stephen.readBackVerified === true
    );

  return {
    mode: 'PREINSPECT_DUAL_CALENDAR_TASK_LINK',
    version: TM_PREINSPECT_DUAL_CALENDAR_R1.VERSION,
    status: readBackVerified
      ? 'VERIFIED_BOTH_CALENDARS'
      : 'FAILED_DUAL_CALENDAR_VERIFICATION',
    eventId: String(eventId || '').trim(),
    taskId: Number(taskId || 0) || null,
    writePerformed:
      !!(
        (group && group.writePerformed) ||
        (stephen && stephen.writePerformed)
      ),
    readBackVerified: readBackVerified,
    group: group,
    stephen: stephen
  };
}

function tmPreInspectEnsureCalendarTaskLinkOne_(
  calendarId,
  eventId,
  taskId,
  taskTitle,
  label
) {
  const cleanTaskId = Number(taskId || 0);
  const cleanEventId = String(eventId || '').trim();

  if (!(cleanTaskId > 0)) {
    throw new Error(
      'PreInspection dual-calendar Task-link write requires Task ID.'
    );
  }

  if (!cleanEventId) {
    throw new Error(
      'PreInspection dual-calendar Task-link write requires Event ID.'
    );
  }

  const found = tmPreInspectFindCalendarEventById_(
    calendarId,
    cleanEventId
  );

  if (!found || !found.event) {
    throw new Error(
      'PreInspection ' + label +
      ' Calendar event not found for Event ID ' +
      cleanEventId
    );
  }

  const taskUrl =
    'https://classicfireplace.striven.com/Tasks/TaskInfo.aspx?TaskID=' +
    cleanTaskId;

  const original = String(found.event.getDescription() || '');

  if (original.indexOf(taskUrl) !== -1) {
    return {
      calendar: label,
      calendarId: calendarId,
      eventId: cleanEventId,
      taskId: cleanTaskId,
      status: 'ALREADY_VERIFIED',
      writePerformed: false,
      readBackVerified: true
    };
  }

  let authored = original;

  if (typeof preinspectR3414RemoveManagedTaskFooterOnly_ === 'function') {
    authored = preinspectR3414RemoveManagedTaskFooterOnly_(original);
  }

  const title = String(
    taskTitle ||
    ('Pre-Inspection Task #' + cleanTaskId)
  ).trim();

  const safeTitle =
    typeof preinspectR3412HtmlEscape_ === 'function'
      ? preinspectR3412HtmlEscape_(title)
      : title;

  const safeUrl =
    typeof preinspectR3412HtmlEscape_ === 'function'
      ? preinspectR3412HtmlEscape_(taskUrl)
      : taskUrl;

  const block = [
    '<!-- PREINSPECT_STRIVEN_TASK_LINK_START -->',
    '<br>------- Pre-Inspection Task Link -------',
    '<br><br><a href="' + safeUrl + '">' + safeTitle + '</a>',
    '<br><br>------------------------------------',
    '<br><!-- PREINSPECT_STRIVEN_TASK_LINK_END -->'
  ].join('');

  const next =
    typeof preinspectR3414AppendManagedFooter_ === 'function'
      ? preinspectR3414AppendManagedFooter_(authored, block)
      : (
          authored
            ? authored + '<br><br>' + block
            : block
        );

  found.event.setDescription(next);

  const readBack = tmPreInspectFindCalendarEventById_(
    calendarId,
    cleanEventId
  );

  if (!readBack || !readBack.event) {
    throw new Error(
      'PreInspection ' + label +
      ' Calendar event disappeared after Task-link write.'
    );
  }

  const actual = String(readBack.event.getDescription() || '');

  if (actual.indexOf(taskUrl) === -1) {
    throw new Error(
      'PreInspection ' + label +
      ' Calendar Task-link read-back failed for Task ' +
      cleanTaskId
    );
  }

  return {
    calendar: label,
    calendarId: calendarId,
    eventId: cleanEventId,
    taskId: cleanTaskId,
    status: 'WRITTEN_AND_VERIFIED',
    writePerformed: true,
    readBackVerified: true
  };
}

function tmPreInspectFindCalendarEventById_(calendarId, eventId) {
  const calendar = CalendarApp.getCalendarById(
    String(calendarId || '').trim()
  );

  if (!calendar) return null;

  const raw = String(eventId || '').trim();
  const normalized = raw.replace(/@google\.com$/i, '');

  const directCandidates = tmPreInspectUniqueStrings_([
    raw,
    normalized,
    normalized ? normalized + '@google.com' : ''
  ]);

  for (let i = 0; i < directCandidates.length; i++) {
    try {
      const direct = calendar.getEventById(directCandidates[i]);
      if (direct) {
        return {
          calendarId: calendarId,
          event: direct,
          match: 'DIRECT'
        };
      }
    } catch (ignoredDirectError) {}
  }

  const start = new Date();
  start.setDate(
    start.getDate() -
    Number(TM_PREINSPECT_DUAL_CALENDAR_R1.LOOKBACK_DAYS || 2)
  );
  start.setHours(0, 0, 0, 0);

  const end = new Date();
  end.setDate(
    end.getDate() +
    Number(TM_PREINSPECT_DUAL_CALENDAR_R1.LOOKAHEAD_DAYS || 60)
  );
  end.setHours(23, 59, 59, 999);

  const events = calendar.getEvents(start, end);

  for (let e = 0; e < events.length; e++) {
    const foundRaw = String(events[e].getId() || '').trim();
    const foundNormalized =
      foundRaw.replace(/@google\.com$/i, '');

    if (
      foundRaw === raw ||
      foundRaw === normalized ||
      foundNormalized === raw ||
      foundNormalized === normalized
    ) {
      return {
        calendarId: calendarId,
        event: events[e],
        match: 'BOUNDED_SCAN'
      };
    }
  }

  return null;
}

function tmPreInspectUniqueStrings_(values) {
  const seen = {};

  return (values || [])
    .map(function(value) {
      return String(value || '').trim();
    })
    .filter(function(value) {
      if (!value || seen[value]) return false;
      seen[value] = true;
      return true;
    });
}

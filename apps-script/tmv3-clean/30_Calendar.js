function tmv3_calendarRecords_() {
  tmv3_assertShadow_();
  const out = [];

  Object.keys(TMV3.VERTICALS).forEach(function(vertical) {
    const cfg = TMV3.VERTICALS[vertical];
    const calendars = tmv3_verticalCalendars_(vertical, cfg);

    const start = new Date();
    start.setDate(start.getDate() - Number(cfg.lookbackDays || 0));
    start.setHours(0,0,0,0);

    const end = new Date();
    end.setDate(end.getDate() + Number(cfg.lookaheadDays || 365));
    end.setHours(23,59,59,999);

    calendars.forEach(function(calCfg) {
      const cal = CalendarApp.getCalendarById(calCfg.calendarId);

      if (!cal) {
        tmv3_audit_(
          vertical,
          '',
          '',
          'CALENDAR_ACCESS',
          'BLOCKED',
          'Calendar unavailable: ' + calCfg.calendarId
        );
        return;
      }

      cal.getEvents(start, end).forEach(function(event) {
        const record = tmv3_calendarEvent_(
          vertical,
          cfg,
          calCfg,
          event
        );

        if (record) out.push(record);
      });
    });
  });

  return out;
}

function tmv3_verticalCalendars_(vertical, cfg) {
  if (vertical === 'Service') {
    return cfg.calendars.slice();
  }

  if (vertical === 'PreInspection') {
    return [
      {
        calendarId: cfg.primaryCalendarId,
        role: 'PRIMARY'
      }
    ].concat(
      (cfg.secondaryCalendarIds || []).map(function(id) {
        return {
          calendarId: id,
          role: 'SECONDARY'
        };
      })
    );
  }

  return (cfg.calendarIds || []).map(function(id) {
    return {
      calendarId: id
    };
  });
}

function tmv3_calendarEvent_(vertical, cfg, calCfg, event) {
  const title = tmv3_clean_(event.getTitle());
  const rawDescription = tmv3_clean_(event.getDescription());
  const location = tmv3_clean_(event.getLocation());

  const organizer = tmv3_safeCalendar_(
    function() {
      return event.getCreators().join(',');
    },
    ''
  );

  const guests = tmv3_safeCalendar_(
    function() {
      return event
        .getGuestList()
        .map(function(g) {
          return g.getEmail();
        })
        .join(',');
    },
    ''
  );

  const isAllDay = event.isAllDayEvent();

  if (
    tmv3_shouldIgnoreEvent_(
      vertical,
      title,
      rawDescription,
      isAllDay,
      organizer
    )
  ) {
    return null;
  }

  const start = event.getStartTime();
  const end = event.getEndTime();
  const eventId = event.getId();

  const links = tmv3_extractLinks_(rawDescription);

  const orderNumber =
    tmv3_extractOrderNumber_(
      [
        title,
        rawDescription,
        location
      ].join(' ')
    );

  const customerNumber =
    tmv3_extractCustomerNumber_(
      title +
      ' ' +
      rawDescription
    );

  const phone =
    tmv3_extractPhone_(
      title +
      ' ' +
      rawDescription +
      ' ' +
      location
    );

  const fingerprint =
    tmv3_hash_(
      [
        vertical,
        calCfg.calendarId,
        eventId,
        title,
        location,
        tmv3_iso_(start),
        tmv3_iso_(end),
        rawDescription
      ].join('|')
    );

  return {
    vertical: vertical,
    calendarId: calCfg.calendarId,
    calendarRole: calCfg.role || '',
    technician: calCfg.technician || '',
    technicianEmployeeId: calCfg.employeeId || '',
    eventId: eventId,
    title: title,
    description: rawDescription,
    location: location,
    start: start,
    end: end,
    organizer: organizer,
    guests: guests,
    orderNumber: orderNumber,
    customerNumber: customerNumber,
    phone: phone,
    existingTaskId: links.taskId,
    existingTaskUrl: links.taskUrl,
    existingOrderId: links.orderId,
    existingOrderUrl: links.orderUrl,
    fingerprint: fingerprint,
    calendarUpdatedAt:
      tmv3_safeCalendar_(
        function() {
          return tmv3_iso_(
            event.getLastUpdated()
          );
        },
        ''
      )
  };
}

function tmv3_shouldIgnoreEvent_(
  vertical,
  title,
  description,
  isAllDay,
  organizer
) {
  const t = tmv3_norm_(title);

  if (isAllDay) return true;

  if (
    vertical !== 'PreInspection' &&
    organizer &&
    organizer.indexOf(TMV3.DOMAIN) === -1
  ) {
    return true;
  }

  if (
    /\b(off|vacation|pto|sick|holiday|unavailable|blocked|personal)\b/i
      .test(t)
  ) {
    return true;
  }

  if (
    vertical === 'Install' &&
    /\bcrane job\b/i.test(t)
  ) {
    return true;
  }

  if (
    vertical === 'Service' &&
    /\b(admin|meeting|lunch|training|warehouse|pickup|pick up)\b/i
      .test(t)
  ) {
    return true;
  }

  return false;
}

function tmv3_extractLinks_(html) {
  const text = tmv3_clean_(html);
  const hrefs = [];
  const rx =
    /href=["']([^"']+)["']/gi;

  let m;

  while (
    (m = rx.exec(text)) !== null
  ) {
    hrefs.push(m[1]);
  }

  const rawUrls =
    text.match(
      /https?:\/\/[^\s<>"]+/gi
    ) ||
    [];

  const urls =
    tmv3_unique_(
      hrefs.concat(rawUrls)
    );

  let taskUrl = '';
  let taskId = '';
  let orderUrl = '';
  let orderId = '';

  urls.forEach(function(url) {
    let mm =
      String(url)
        .match(
          /TaskInfo\.aspx\?TaskID=(\d+)/i
        );

    if (
      mm &&
      !taskUrl
    ) {
      taskUrl = url;
      taskId = mm[1];
    }

    mm =
      String(url)
        .match(
          /\/sales-orders\/(\d+)/i
        );

    if (
      mm &&
      !orderUrl
    ) {
      orderUrl = url;
      orderId = mm[1];
    }
  });

  return {
    taskUrl: taskUrl,
    taskId: taskId,
    orderUrl: orderUrl,
    orderId: orderId
  };
}

function tmv3_extractOrderNumber_(text) {
  const s =
    tmv3_clean_(text);

  const labelled =
    s.match(
      /(?:SO|Sales\s*Order|Work\s*Order|Service\s*Order)\s*(?:#|No\.?|Number)?\s*[:\-]?\s*(\d{4,8})/i
    );

  return labelled
    ? labelled[1]
    : '';
}

function tmv3_extractCustomerNumber_(text) {
  const s =
    tmv3_clean_(text);

  const m =
    s.match(
      /(?:Customer|Cust(?:omer)?\s*#?)\s*(?:#|No\.?|Number)?\s*[:\-]?\s*(\d{3,8})/i
    );

  if (m) {
    return m[1];
  }

  const leading =
    s.match(
      /^\s*#?(\d{4,8})\s*[-–—]/
    );

  return leading
    ? leading[1]
    : '';
}

function tmv3_extractPhone_(text) {
  const m =
    tmv3_clean_(text)
      .match(
        /(?:\+?1[\s.\-]?)?\(?([2-9]\d{2})\)?[\s.\-]?([2-9]\d{2})[\s.\-]?(\d{4})/
      );

  return m
    ? (
      m[1] +
      m[2] +
      m[3]
    )
    : '';
}

function tmv3_safeCalendar_(
  fn,
  fallback
) {
  try {
    return fn();
  } catch (err) {
    return fallback;
  }
}

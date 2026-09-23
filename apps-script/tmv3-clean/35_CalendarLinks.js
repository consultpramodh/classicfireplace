/************************************************************
 * TM V3 — SINGLE MANAGED CALENDAR LINK ENGINE
 ************************************************************/

const TMV3_LINK_BLOCK_START = '<!-- TMV3_STRIVEN_LINKS_START -->';
const TMV3_LINK_BLOCK_END = '<!-- TMV3_STRIVEN_LINKS_END -->';

function tmv3_buildCalendarLinkPlan_(eventRecord, resolved) {
  const cfg = TMV3.VERTICALS[eventRecord.vertical];
  const links = [];

  if (eventRecord.vertical === 'PreInspection') {
    if (!resolved.customerId) {
      throw new Error('PreInspection Calendar links require Customer ID.');
    }

    links.push({
      key: 'CUSTOMER_SALES_ORDERS_PAGE',
      label:
        'View Sales Orders – ' +
        (resolved.customer || 'Customer') +
        ' (#' + resolved.customerId + ')',
      url:
        TMV3.CUSTOMER_ORDERS_PAGE_BASE +
        encodeURIComponent(resolved.customerId)
    });
  } else if (cfg.calendarOrderLinkRequired) {
    if (!resolved.orderId) {
      throw new Error(cfg.orderLabel + ' Calendar link requires internal Order ID.');
    }

    links.push({
      key: 'ORDER',
      label:
        cfg.orderLabel +
        (resolved.order ? ' – ' + resolved.order : ''),
      url:
        TMV3.ORDER_URL_BASE +
        encodeURIComponent(resolved.orderId)
    });
  }

  if (cfg.calendarTaskLinkRequired) {
    if (!resolved.taskId) {
      throw new Error('Calendar Task link requires verified Task ID.');
    }

    links.push({
      key: 'TASK',
      label:
        'Task #' +
        resolved.taskId +
        (resolved.task ? ' – ' + resolved.task : ''),
      url:
        TMV3.TASK_URL_BASE +
        encodeURIComponent(resolved.taskId)
    });
  }

  return {
    vertical: eventRecord.vertical,
    eventId: eventRecord.eventId,
    calendarIds: tmv3_requiredCalendarCopies_(eventRecord.vertical),
    links: links
  };
}

function tmv3_requiredCalendarCopies_(vertical) {
  const cfg = TMV3.VERTICALS[vertical];

  if (vertical === 'Service') {
    return (cfg.calendars || []).map(function(x) {
      return x.calendarId;
    });
  }

  if (vertical === 'PreInspection') {
    return [cfg.primaryCalendarId].concat(cfg.secondaryCalendarIds || []);
  }

  return (cfg.calendarIds || []).slice();
}

function tmv3_managedCalendarDescription_(existingDescription, plan) {
  const authored = tmv3_stripV3ManagedBlock_(existingDescription);

  const lines = [
    TMV3_LINK_BLOCK_START,
    '────────── STRIVEN LINKS ──────────'
  ];

  (plan.links || []).forEach(function(link) {
    lines.push(link.label);
    lines.push(link.url);
  });

  lines.push('──────────────────────────────────');
  lines.push(TMV3_LINK_BLOCK_END);

  return (
    authored
      ? authored.replace(/\s+$/, '') + '\n\n'
      : ''
  ) + lines.join('\n');
}

function tmv3_stripV3ManagedBlock_(description) {
  const raw = String(description || '');
  const escapedStart = tmv3_regexEscape_(TMV3_LINK_BLOCK_START);
  const escapedEnd = tmv3_regexEscape_(TMV3_LINK_BLOCK_END);
  const rx = new RegExp(escapedStart + '[\\s\\S]*?' + escapedEnd, 'g');
  return raw.replace(rx, '').replace(/\s+$/, '');
}

function tmv3_regexEscape_(value) {
  return String(value || '').replace(/[.*+?^\$\{\}()|[\]\\]/g, '\\$&');
}

function tmv3_findEventCopies_(eventId, calendarIds) {
  const copies = [];

  (calendarIds || []).forEach(function(calendarId) {
    const calendar = CalendarApp.getCalendarById(calendarId);
    if (!calendar) return;

    const event = calendar.getEventById(eventId);
    if (!event) return;

    copies.push({
      calendarId: calendarId,
      calendarName: calendar.getName(),
      event: event
    });
  });

  return copies;
}

function tmv3_previewCalendarLinks_(eventRecord, resolved) {
  return {
    mode: TMV3.MODE,
    writeAllowed: tmv3_writesEnabled_(),
    plan: tmv3_buildCalendarLinkPlan_(eventRecord, resolved)
  };
}

function tmv3_writeCalendarLinks_(eventRecord, resolved) {
  tmv3_assertBusinessWritesEnabled_();

  const plan = tmv3_buildCalendarLinkPlan_(eventRecord, resolved);
  const copies = tmv3_findEventCopies_(plan.eventId, plan.calendarIds);

  if (!copies.length) {
    throw new Error('No Calendar copy found for Event ID ' + plan.eventId + '.');
  }

  const results = [];

  copies.forEach(function(copy) {
    const before = String(copy.event.getDescription() || '');
    const desired = tmv3_managedCalendarDescription_(before, plan);

    if (before !== desired) {
      copy.event.setDescription(desired);
    }

    const after = String(copy.event.getDescription() || '');
    const missing = (plan.links || []).filter(function(link) {
      return after.indexOf(link.url) === -1;
    });

    if (missing.length) {
      throw new Error(
        'Calendar read-back failed for ' +
        copy.calendarName +
        ': missing ' +
        missing.map(function(x) { return x.key; }).join(', ')
      );
    }

    results.push({
      calendarId: copy.calendarId,
      calendarName: copy.calendarName,
      status:
        before === desired
          ? 'ALREADY_CORRECT'
          : 'WRITTEN_AND_VERIFIED'
    });
  });

  return {
    status: 'CALENDAR_LINKS_VERIFIED',
    eventId: plan.eventId,
    copies: results,
    links: plan.links
  };
}

/************************************************************
 * TM V3 — SINGLE MANAGED CALENDAR LINK ENGINE
 ************************************************************/

const TMV3_LINK_BLOCK_START = '<!-- TMV3_STRIVEN_LINKS_START -->';
const TMV3_LINK_BLOCK_END = '<!-- TMV3_STRIVEN_LINKS_END -->';

function tmv3_buildCalendarLinkPlan_(eventRecord, resolved) {
  const cfg = TMV3.VERTICALS[eventRecord.vertical];
  const records = Array.isArray(resolved) ? resolved : [resolved];
  const links = [];

  const first = records[0] || {};

  if (eventRecord.vertical === 'PreInspection') {
    if (!first.customerId) {
      throw new Error('PreInspection Calendar links require Customer ID.');
    }

    links.push({
      key: 'CUSTOMER_SALES_ORDERS_PAGE',
      label:
        'View Sales Orders – ' +
        (first.customer || 'Customer') +
        ' (#' + first.customerId + ')',
      url:
        TMV3.CUSTOMER_ORDERS_PAGE_BASE +
        encodeURIComponent(first.customerId)
    });
  } else if (cfg.calendarOrderLinkRequired) {
    if (!first.orderId) {
      throw new Error(cfg.orderLabel + ' Calendar link requires internal Order ID.');
    }

    links.push({
      key: 'ORDER',
      label:
        cfg.orderLabel +
        (first.order ? ' – ' + first.order : ''),
      url:
        TMV3.ORDER_URL_BASE +
        encodeURIComponent(first.orderId)
    });
  }

  const taskSeen = {};

  if (cfg.calendarTaskLinkRequired) {
    records.forEach(function(record) {
      if (!record || !record.taskId) {
        throw new Error('Calendar Task link requires verified Task ID for every mapped task.');
      }

      const taskId = String(record.taskId);
      if (taskSeen[taskId]) return;
      taskSeen[taskId] = true;

      links.push({
        key:
          record.serviceFireplaceNumber
            ? 'TASK_FP_' + record.serviceFireplaceNumber
            : 'TASK_' + taskId,
        label:
          (
            record.serviceFireplaceNumber
              ? 'FP#' + record.serviceFireplaceNumber + ' – '
              : ''
          ) +
          'Task #' +
          taskId +
          (record.task ? ' – ' + record.task : ''),
        url:
          TMV3.TASK_URL_BASE +
          encodeURIComponent(taskId)
      });
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
  const authored = tmv3_stripManagedLinkBlocks_(existingDescription);

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

function tmv3_stripManagedLinkBlocks_(description) {
  let text = tmv3_stripV3ManagedBlock_(description);

  // Older comment-managed PreInspection footer.
  text = text.replace(
    /<!--\s*PREINSPECT_STRIVEN_TASK_LINK_START\s*-->[\s\S]*?<!--\s*PREINSPECT_STRIVEN_TASK_LINK_END\s*-->/gi,
    ''
  );

  // Known automation-owned dashed link blocks from the old engine.
  const legacyHeadings = [
    'Install Striven Task Link',
    'Delivery Striven Links',
    'Service Striven Links',
    'Delivery Task Link',
    'Pre-Inspection Task Link',
    'Pre Inspection Task Link'
  ];

  legacyHeadings.forEach(function(heading) {
    const rx = new RegExp(
      '(?:\\r?\\n|\\s)*-{5,}\\s*' +
      tmv3_regexEscape_(heading) +
      '\\s*-{5,}[\\s\\S]*?-{10,}',
      'gi'
    );
    text = text.replace(rx, '');
  });

  return text
    .replace(/(?:\r?\n\s*){3,}/g, '\n\n')
    .replace(/^\s+|\s+$/g, '');
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
  return tmv3_writeCalendarLinksForEvent_(eventRecord, [resolved]);
}


function tmv3_writeCalendarLinksForEvent_(eventRecord, resolvedRecords) {
  tmv3_assertBusinessWritesEnabled_();

  const records = Array.isArray(resolvedRecords)
    ? resolvedRecords
    : [resolvedRecords];

  const plan = tmv3_buildCalendarLinkPlan_(eventRecord, records);
  const copies = tmv3_findEventCopies_(plan.eventId, plan.calendarIds);

  if (!copies.length) {
    throw new Error('No Calendar copy found for Event ID ' + plan.eventId + '.');
  }

  const results = [];

  copies.forEach(function(copy) {
    const before = String(copy.event.getDescription() || '');
    const desired = tmv3_managedCalendarDescription_(before, plan);

    if (before !== desired) copy.event.setDescription(desired);

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
      status: before === desired ? 'ALREADY_CORRECT' : 'WRITTEN_AND_VERIFIED'
    });
  });

  return {
    status: 'CALENDAR_LINKS_VERIFIED',
    eventId: plan.eventId,
    copies: results,
    links: plan.links
  };
}

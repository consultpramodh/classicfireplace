/************************************************************
 * TM V3 — SINGLE MANAGED CALENDAR LINK ENGINE
 ************************************************************/

const TMV3_LINK_BLOCK_START = '<!-- TMV3_STRIVEN_LINKS_START -->';
const TMV3_LINK_BLOCK_END = '<!-- TMV3_STRIVEN_LINKS_END -->';
const TMV3_FINAL_LINK_HEADING = '-----Striven Links-----';

function tmv3_buildCalendarLinkPlan_(eventRecord, resolved) {
  const cfg = TMV3.VERTICALS[eventRecord.vertical];
  const records = Array.isArray(resolved) ? resolved : [resolved];
  const links = [];

  const first = records[0] || {};

  if (eventRecord.vertical === 'PreInspection') {
    if (!first.customerId) {
      throw new Error('PreInspection Calendar links require Customer ID.');
    }

    const customer = eventRecord.step4 && eventRecord.step4.customer || null;
    const customerName = tmv3_clean_(
      first.customer ||
      (customer && customer['Name']) ||
      eventRecord.calendarCustomerName ||
      tmv3_preInspectionCalendarCustomerName_(
        eventRecord.title || '',
        eventRecord.customerNumber || ''
      )
    );
    const customerNumber = tmv3_clean_(
      (customer && customer['Customer Number']) ||
      eventRecord.customerNumber ||
      tmv3_extractCustomerNumberForVertical_(
        'PreInspection',
        eventRecord.title || ''
      )
    );
    const phone = tmv3_titlePhoneDisplay_(
      eventRecord.phone ||
      (customer && customer['Primary Phone']) ||
      ''
    );

    if (!customerName || !customerNumber || !phone) {
      throw new Error(
        'PreInspection Calendar links require verified Customer Name, Customer Number and Phone.'
      );
    }

    links.push({
      key:'CUSTOMER_SALES_ORDERS_PAGE',
      label:
        'View Sales Orders – ' +
        customerName +
        ' (#' + customerNumber + ')',
      url:
        TMV3.CUSTOMER_ORDERS_PAGE_BASE +
        encodeURIComponent(first.customerId)
    });

    eventRecord.__tmv3PreInspectionLinkIdentity = {
      customerName:customerName,
      customerNumber:customerNumber,
      phone:phone
    };
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

      let label = '';

      if (eventRecord.vertical === 'PreInspection') {
        const desiredTaskName = tmv3_desiredTaskName_(eventRecord, {});
        const taskName =
          desiredTaskName &&
          desiredTaskName.status === 'READY'
            ? tmv3_clean_(desiredTaskName.value)
            : tmv3_clean_(record.task);

        if (!taskName) {
          throw new Error(
            'PreInspection Calendar Task link requires a verified Task Name.'
          );
        }

        label = 'Task #' + taskId + ' – ' + taskName;
      } else {
        label =
          (
            record.serviceFireplaceNumber
              ? 'FP#' + record.serviceFireplaceNumber + ' – '
              : ''
          ) +
          'Task #' +
          taskId +
          (record.task ? ' – ' + record.task : '');
      }

      links.push({
        key:
          record.serviceFireplaceNumber
            ? 'TASK_FP_' + record.serviceFireplaceNumber
            : 'TASK_' + taskId,
        label:label,
        url:
          TMV3.TASK_URL_BASE +
          encodeURIComponent(taskId)
      });
    });
  }

  const preIdentity =
    eventRecord.__tmv3PreInspectionLinkIdentity || null;
  try { delete eventRecord.__tmv3PreInspectionLinkIdentity; } catch (ignored) {}

  return {
    vertical: eventRecord.vertical,
    eventId: eventRecord.eventId,
    occurrenceStart: eventRecord.start ? tmv3_iso_(eventRecord.start) : '',
    calendarIds: tmv3_requiredCalendarCopiesForEvent_(eventRecord),
    currentTitle:tmv3_clean_(eventRecord.title),
    customerName:preIdentity ? preIdentity.customerName : '',
    customerNumber:preIdentity ? preIdentity.customerNumber : '',
    phone:preIdentity ? preIdentity.phone : '',
    links: links
  };
}

function tmv3_requiredCalendarCopiesForEvent_(eventRecord) {
  const record = eventRecord || {};
  const vertical = tmv3_clean_(record.vertical);
  const sourceIds = tmv3_unique_(
    []
      .concat(record.sourceCalendarIds || [])
      .concat(record.calendarId || [])
      .map(tmv3_clean_)
      .filter(Boolean)
  );

  if (vertical === 'PreInspection') {
    const cfg = TMV3.VERTICALS.PreInspection || {};
    const primaryId = tmv3_clean_(cfg.primaryCalendarId);
    const secondaryIds = (cfg.secondaryCalendarIds || [])
      .map(tmv3_clean_)
      .filter(Boolean);

    // CF Preinspects remains the sole intake authority, but presentation
    // state must converge on every configured PreInspection Calendar copy.
    return tmv3_unique_(
      [primaryId].concat(secondaryIds).filter(Boolean)
    );
  }

  if (sourceIds.length) return sourceIds;
  return tmv3_requiredCalendarCopies_(vertical);
}

function tmv3_requiredCalendarCopies_(vertical) {
  const cfg = TMV3.VERTICALS[vertical];

  if (vertical === 'Service') {
    return [];
  }

  if (vertical === 'PreInspection') {
    return tmv3_unique_(
      [cfg.primaryCalendarId]
        .concat(cfg.secondaryCalendarIds || [])
        .map(tmv3_clean_)
        .filter(Boolean)
    );
  }

  return (cfg.calendarIds || []).slice();
}

function tmv3_calendarHtmlEscape_(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function tmv3_calendarHtmlText_(value) {
  return tmv3_calendarHtmlEscape_(value)
    .replace(/\r\n?/g, '\n')
    .replace(/\n/g, '<br>');
}

function tmv3_managedCalendarDescription_(existingDescription, plan) {
  const authored = plan && plan.vertical === 'PreInspection'
    ? tmv3_preInspectionCalendarNotesText_(
        existingDescription,
        plan
      )
    : tmv3_stripManagedLinkBlocks_(existingDescription);

  const linkLines = (plan.links || []).map(function(link) {
    return '[' +
      tmv3_calendarMarkdownLabel_(link.label) +
      '](' +
      String(link.url || '') +
      ')';
  });

  const managed =
    TMV3_FINAL_LINK_HEADING +
    (linkLines.length ? '  \n' + linkLines.join('  \n') : '');

  return (
    authored
      ? authored.replace(/\s+$/, '') + '\n\n'
      : ''
  ) + managed;
}



function tmv3_preInspectionCalendarLinkSourcePresent_(description, link) {
  const before = String(description || '').replace(/\s+/g, '');
  const source =
    '[' +
    tmv3_calendarMarkdownLabel_(link && link.label || '') +
    '](' +
    String(link && link.url || '') +
    ')';
  return before.indexOf(source.replace(/\s+/g, '')) !== -1;
}

function tmv3_preInspectionClickableManagedDescription_(existingDescription, plan) {
  const before = String(existingDescription || '');
  const links = (plan && plan.links) || [];

  const allWorkingLinksPresent = links.every(function(link) {
    return tmv3_preInspectionCalendarLinkSourcePresent_(before, link);
  });

  const hasEscapedHtml =
    /&lt;\/?(?:p|a|br)\b/i.test(before) ||
    /<\/?(?:p|a|br)\b/i.test(before);

  if (allWorkingLinksPresent && !hasEscapedHtml) {
    return {
      description:before,
      status:'PRESERVED_EXISTING_WORKING_LINK_BLOCK',
      changed:false
    };
  }

  const authored = tmv3_preInspectionCalendarNotesText_(before, plan);

  const managed =
    '**\\' + TMV3_FINAL_LINK_HEADING + '**' +
    (links.length
      ? '\n\n' +
        links.map(function(link) {
          return '[' +
            tmv3_calendarMarkdownLabel_(link.label) +
            '](' +
            String(link.url || '') +
            ')';
        }).join('\n\n')
      : '');

  const description =
    (authored
      ? authored.replace(/\s+$/, '') + '\n\n'
      : '') +
    managed +
    '\n\n';

  return {
    description:description,
    status:'RESTORED_PROVEN_GOOGLE_CALENDAR_LINK_PATTERN',
    changed:description !== before
  };
}

function tmv3_preInspectionTitleVariants_(plan) {
  plan = plan || {};
  const number = tmv3_clean_(plan.customerNumber);
  const name = tmv3_clean_(plan.customerName);
  const phone = tmv3_clean_(plan.phone);
  const current = tmv3_clean_(plan.currentTitle);
  const variants = [current];

  if (number && name && phone) {
    variants.push(number + ' - ' + name + ' - ' + phone);
    variants.push('C#' + number + ' - ' + name + ' - ' + phone);
    variants.push('Cust#' + number + ' - ' + name + ' - ' + phone);
  }

  return tmv3_unique_(variants.map(tmv3_clean_).filter(Boolean));
}

function tmv3_stripPreInspectionPreservedTitle_(value, plan) {
  let text = tmv3_decodeCalendarHtmlEntities_(
    String(value || '')
  );

  tmv3_preInspectionTitleVariants_(plan).forEach(function(title) {
    const esc = tmv3_regexEscape_(title);
    text = text.replace(
      new RegExp(
        '^\\s*(?:<p[^>]*>\\s*)?' +
        esc +
        '\\s*(?:<\\/p>)?\\s*(?:(?:<br\\s*\\/?>|\\r?\\n)\\s*){0,2}',
        'i'
      ),
      ''
    );
  });

  return text.replace(/^\s+/, '');
}

function tmv3_normalizePreInspectionAuthoredWraps_(value) {
  let text = tmv3_decodeCalendarHtmlEntities_(
    String(value || '')
  )
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\s*\/p\s*>/gi, '\n\n')
    .replace(/<\s*p[^>]*>/gi, '')
    .replace(/<\s*b\s*>/gi, '**')
    .replace(/<\s*\/b\s*>/gi, '**')
    .replace(/<[^>]+>/g, '')
    .replace(/\r\n?/g, '\n')
    .replace(/ {2,}\n/g, '\n\n')
    .trim();

  const marker = '__TMV3_PARAGRAPH_BREAK__';

  text = text
    .replace(/\n\s*\n+/g, marker)
    .replace(/[ \t]*\n[ \t]*/g, ' ')
    .replace(new RegExp(marker, 'g'), '\n\n')
    .replace(
      /(^|\n\n)\s*(?:\*\*)?Sales Order:(?:\*\*)?\s*/ig,
      function(match, prefix) { return prefix || ''; }
    )
    .replace(
      /(^|\n\n)\s*(?:\*\*)?Notes:(?:\*\*)?\s*/ig,
      function(match, prefix) { return prefix || ''; }
    )
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return text;
}

function tmv3_preInspectionCalendarNotesText_(description, plan) {
  let authored = tmv3_stripManagedLinkBlocks_(description || '');

  // The exact previous Calendar title is intentional business history.
  // Preserve it as the first Description line when title normalization
  // placed it there. Only presentation-only headings are removed.
  authored = tmv3_normalizePreInspectionAuthoredWraps_(authored);

  if (!authored) return '';

  authored = authored
    .replace(
      /(^|\n\n)\s*(?:\*\*)?Sales Order:(?:\*\*)?\s*/ig,
      function(match, prefix) { return prefix || ''; }
    )
    .replace(
      /(^|\n\n)\s*(?:\*\*)?Notes:(?:\*\*)?\s*/ig,
      function(match, prefix) { return prefix || ''; }
    );

  return authored.replace(/\n{3,}/g, '\n\n').trim();
}

function tmv3_calendarMarkdownLabel_(value) {
  return String(value == null ? '' : value)
    .replace(/\\/g, '\\\\')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]');
}


function tmv3_managedCalendarBlockStart_(value) {
  const text = String(value || '');
  const patterns = [
    /(?:<b>\s*)?(?:\*\*\s*)?\\?-{5}\s*Striven\s+Links\s*-{5}(?:\s*\*\*)?(?:\s*<\/b>)?/i,
    /(?:<b>\s*)?(?:\*\*\s*)?Striven\s+Links(?:\s*\*\*)?(?:\s*<\/b>)?/i,
    /-{5,}\s*Pre-Inspection Task Link\s*-{5,}/i,
    /-{5,}\s*Pre Inspection Task Link\s*-{5,}/i,
    /-{5,}\s*Install Striven Task Link\s*-{5,}/i,
    /-{5,}\s*Delivery Striven\s+Links\s*-{5,}/i,
    /-{5,}\s*Service Striven\s+Links\s*-{5,}/i,
    /-{5,}\s*Delivery Task Link\s*-{5,}/i
  ];

  let best = -1;

  patterns.forEach(function(pattern) {
    const match = pattern.exec(text);
    if (!match) return;
    if (best === -1 || match.index < best) best = match.index;
  });

  return best;
}

function tmv3_stripManagedLinkBlocks_(description) {
  let text = tmv3_stripV3ManagedBlock_(description);

  text = text.replace(
    /<!--\s*PREINSPECT_STRIVEN_TASK_LINK_START\s*-->[\s\S]*?<!--\s*PREINSPECT_STRIVEN_TASK_LINK_END\s*-->/gi,
    ''
  );

  const managedStart = tmv3_managedCalendarBlockStart_(text);
  if (managedStart >= 0) {
    text = text.slice(0, managedStart);
  }

  return text
    .replace(/(?:<br\s*\/?>\s*){3,}/gi, '<br><br>')
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

function tmv3_findEventCopies_(eventId, calendarIds, occurrenceStart) {
  const copies = [];
  const target = occurrenceStart ? new Date(occurrenceStart) : null;

  (calendarIds || []).forEach(function(calendarId) {
    const calendar = CalendarApp.getCalendarById(calendarId);
    if (!calendar) return;

    const event = tmv3_findCalendarOccurrence_(
      calendar,
      eventId,
      target
    );

    if (!event) return;

    copies.push({
      calendarId: calendarId,
      calendarName: calendar.getName(),
      event: event
    });
  });

  return copies;
}

function tmv3_findCalendarOccurrence_(calendar, eventId, targetStart) {
  const direct = calendar.getEventById(eventId);

  if (!targetStart) return direct || null;

  if (
    direct &&
    Math.abs(direct.getStartTime().getTime() - targetStart.getTime()) < 1000
  ) {
    return direct;
  }

  const from = new Date(targetStart.getTime() - 60000);
  const to = new Date(targetStart.getTime() + 60000);

  const matches = calendar.getEvents(from, to).filter(function(event) {
    return (
      String(event.getId()) === String(eventId) &&
      Math.abs(event.getStartTime().getTime() - targetStart.getTime()) < 1000
    );
  });

  if (matches.length > 1) {
    throw new Error(
      'Calendar occurrence lookup is ambiguous for Event ID ' +
      eventId +
      ' at ' +
      targetStart.toISOString() +
      '.'
    );
  }

  return matches.length === 1 ? matches[0] : null;
}

function tmv3_previewCalendarLinks_(eventRecord, resolved) {
  return {
    mode: TMV3.MODE,
    writeAllowed: tmv3_writesEnabled_(),
    plan: tmv3_buildCalendarLinkPlan_(eventRecord, resolved)
  };
}

function tmv3_assertLegacyCalendarMutationDisabled_(helperName) {
  throw new Error(
    'STEP7_AUTHORITY_REQUIRED: legacy direct Calendar mutation helper ' +
    String(helperName || 'UNKNOWN') +
    ' is disabled. Use the Step 7 executor (for example tmv3_fixSelectedCalendarLinks).'
  );
}

function tmv3_writeCalendarLinks_(eventRecord, resolved) {
  tmv3_assertLegacyCalendarMutationDisabled_('tmv3_writeCalendarLinks_');
  return tmv3_writeCalendarLinksForEvent_(eventRecord, [resolved]);
}


function tmv3_writeCalendarLinksForEvent_(eventRecord, resolvedRecords) {
  tmv3_assertLegacyCalendarMutationDisabled_('tmv3_writeCalendarLinksForEvent_');
  tmv3_assertBusinessWritesEnabled_();

  const records = Array.isArray(resolvedRecords)
    ? resolvedRecords
    : [resolvedRecords];

  const plan = tmv3_buildCalendarLinkPlan_(eventRecord, records);
  const copies = tmv3_findEventCopies_(
    plan.eventId,
    plan.calendarIds,
    plan.occurrenceStart
  );

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

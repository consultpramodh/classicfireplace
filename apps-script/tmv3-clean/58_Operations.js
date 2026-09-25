/************************************************************
 * TM V3 — FEATURE PARITY OPERATIONS
 *
 * Purpose:
 * - Restore the proven operational "hands" from the original
 *   Task Mapping system behind the cleaner V3 resolver/UI.
 * - Manual actions always fresh-read Calendar + Striven first.
 * - Scheduled external writes remain independently gated.
 * - CREATE outcomes are never blindly retried.
 ************************************************************/

function tmv3_operationPolicy_() {
  return TMV3.OPERATIONS || {};
}

function tmv3_operationWritesEnabled_(scope) {
  const policy = tmv3_operationPolicy_();
  const mode = tmv3_norm_(scope || '');
  const externalWriteMode =
    TMV3.MODE === 'CANARY_WRITE' ||
    TMV3.MODE === 'PRODUCTION_WRITE';

  // A policy flag may narrow an authorized write mode, but it must never
  // elevate SHADOW_READ_ONLY into a write-capable mode.
  if (!externalWriteMode) return false;

  if (mode === 'manual') {
    return policy.manualWritesEnabled === true;
  }

  if (mode === 'auto') {
    return policy.automationWritesEnabled === true;
  }

  return false;
}

function tmv3_assertOperationWrite_(scope) {
  if (!tmv3_operationWritesEnabled_(scope)) {
    throw new Error(
      'TM V3 ' + String(scope || 'UNKNOWN') +
      ' external write is gated by configuration.'
    );
  }
}

function tmv3_selectedContext_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getActiveSheet();
  const range = sh && sh.getActiveRange();

  if (!sh || !range) {
    throw new Error('Select an appointment row first.');
  }

  const sheetName = sh.getName();
  let headerRow = 1;
  let vertical = '';

  if (sheetName === TMV3.SHEETS.MORNING) {
    headerRow = 16;
  } else {
    Object.keys(TMV3.VERTICALS).some(function(key) {
      if (TMV3.VERTICALS[key].sheet === sheetName) {
        vertical = key;
        return true;
      }
      return false;
    });
  }

  const rowNumber = range.getRow();
  if (rowNumber <= headerRow) {
    throw new Error('Select a data row, not a header.');
  }

  const lastColumn = sh.getLastColumn();
  const headers = sh.getRange(headerRow, 1, 1, lastColumn).getValues()[0]
    .map(tmv3_clean_);
  const values = sh.getRange(rowNumber, 1, 1, lastColumn).getValues()[0];
  const row = {};

  headers.forEach(function(header, i) {
    if (header) row[header] = values[i];
  });

  if (!vertical) {
    vertical = tmv3_clean_(row['Vertical']);
  }

  if (!TMV3.VERTICALS[vertical]) {
    throw new Error(
      'Selected row does not identify Install, Delivery, Service, or PreInspection.'
    );
  }

  const eventId = tmv3_clean_(row['Event ID']);
  if (!eventId) {
    throw new Error('Selected row has no Event ID. Refresh V3 mapping first.');
  }

  return {
    spreadsheet: ss,
    sheet: sh,
    sheetName: sheetName,
    headerRow: headerRow,
    rowNumber: rowNumber,
    headers: headers,
    row: row,
    vertical: vertical,
    eventId: eventId,
    taskHint: tmv3_clean_(row['Task']),
    status: tmv3_clean_(row['Status']).toUpperCase()
  };
}

function tmv3_taskIdHintFromText_(text) {
  const raw = tmv3_clean_(text);
  if (!raw) return '';

  let m = raw.match(/\bTask\s*#?\s*(\d+)\b/i);
  if (m) return m[1];

  m = raw.match(/^\s*(\d{3,})\b/);
  return m ? m[1] : '';
}

function tmv3_findCalendarEventById_(calendarId, eventId) {
  const calendar = CalendarApp.getCalendarById(tmv3_clean_(calendarId));
  if (!calendar) return null;

  const raw = tmv3_clean_(eventId);
  const normalized = raw.replace(/@google\.com$/i, '');
  const candidates = tmv3_unique_([
    raw,
    normalized,
    normalized ? normalized + '@google.com' : ''
  ]);

  for (let i = 0; i < candidates.length; i++) {
    try {
      const event = calendar.getEventById(candidates[i]);
      if (event) {
        return { calendar: calendar, event: event, match: 'DIRECT' };
      }
    } catch (ignored) {}
  }

  return null;
}

function tmv3_findFreshEventRecord_(vertical, eventId) {
  const cfg = TMV3.VERTICALS[vertical];
  const calendars = tmv3_verticalCalendars_(vertical, cfg);

  for (let i = 0; i < calendars.length; i++) {
    const calCfg = calendars[i];
    const found = tmv3_findCalendarEventById_(calCfg.calendarId, eventId);
    if (!found || !found.event) continue;

    const record = tmv3_calendarEvent_(vertical, cfg, calCfg, found.event);
    if (record) return record;
  }

  throw new Error(
    vertical + ' Calendar event not found for Event ID ' + eventId + '.'
  );
}

function tmv3_freshSelectedResolution_() {
  const context = tmv3_selectedContext_();
  const eventRecord = tmv3_findFreshEventRecord_(context.vertical, context.eventId);
  const refs = tmv3_referenceIndex_();
  const state = tmv3_eventStateIndex_();
  const records = tmv3_resolveEventRecords_(eventRecord, refs, state);

  if (!records.length) {
    throw new Error('Fresh V3 resolution returned no appointment record.');
  }

  let selected = null;
  const taskHintId = tmv3_taskIdHintFromText_(context.taskHint);

  if (taskHintId) {
    const matches = records.filter(function(record) {
      return String(record.taskId || '') === String(taskHintId);
    });
    if (matches.length === 1) selected = matches[0];
  }

  if (!selected && context.taskHint) {
    const normalizedHint = tmv3_norm_(context.taskHint);
    const matches = records.filter(function(record) {
      return normalizedHint && tmv3_norm_(record.task).indexOf(normalizedHint) !== -1;
    });
    if (matches.length === 1) selected = matches[0];
  }

  if (!selected && records.length === 1) selected = records[0];

  if (!selected) {
    throw new Error(
      'Selected Calendar event currently maps to ' + records.length +
      ' V3 records. Select the exact task row and refresh if needed.'
    );
  }

  return {
    context: context,
    eventRecord: eventRecord,
    refs: refs,
    state: state,
    records: records,
    resolved: selected
  };
}

function tmv3_assertResolvedRecordWritable_(resolved, options) {
  options = options || {};
  const status = tmv3_clean_(resolved && resolved.status).toUpperCase();

  if (!resolved) throw new Error('Resolved appointment is required.');

  if (['REVIEW','BLOCKED','IGNORED','NOT MATCHED'].indexOf(status) !== -1) {
    throw new Error(
      'Write blocked because fresh V3 status is ' + status + '. ' +
      tmv3_clean_(resolved.issue)
    );
  }

  if (options.requireTask && !resolved.taskId) {
    throw new Error('Write requires an existing verified Task ID.');
  }

  return true;
}

function tmv3_rawTaskById_(taskId) {
  const id = Number(taskId || 0);
  if (!id) throw new Error('Positive Task ID is required.');

  return tmv3_fetchJson_(
    TMV3.API_BASE + '/v2/tasks/' + encodeURIComponent(id),
    { method: 'get' }
  ) || {};
}

function tmv3_taskAssignmentsFromRaw_(raw) {
  raw = raw || {};
  const arrays = [
    raw.assignments, raw.Assignments, raw.assignedTo, raw.AssignedTo,
    raw.assignedUsers, raw.AssignedUsers, raw.assignees, raw.Assignees
  ];
  const output = [];

  arrays.forEach(function(source) {
    if (!source) return;
    const items = Array.isArray(source) ? source : [source];

    items.forEach(function(item) {
      if (!item || typeof item !== 'object') return;
      const id = Number(
        item.Id || item.id ||
        item.EmployeeId || item.employeeId || item.EmployeeID || item.employeeID ||
        item.PoolId || item.poolId || item.PoolID || item.poolID || 0
      );
      if (!id) return;

      const rawType = tmv3_norm_(
        item.Type || item.type || item.AssignmentType || item.assignmentType ||
        item.EntityType || item.entityType || ''
      );
      const name = tmv3_clean_(
        item.Name || item.name || item.DisplayName || item.displayName || ''
      );
      const looksLikePool =
        rawType === 'pool' || rawType === 'queue' ||
        tmv3_norm_(name) === 'to be assigned' ||
        tmv3_norm_(name) === 'pre-inspection pool' ||
        Number(item.PoolId || item.poolId || 0) > 0 ||
        id === 4 || id === 8;

      const key = (looksLikePool ? 'pool' : 'employee') + '|' + id;
      if (output.some(function(existing) { return existing.__key === key; })) return;
      output.push({
        id: id,
        type: looksLikePool ? 'pool' : 'employee',
        name: name,
        __key: key
      });
    });
  });

  return output.map(function(item) {
    return { id: item.id, type: item.type, name: item.name };
  });
}

function tmv3_upsertTaskCacheRow_(task) {
  if (!task || !task['Task ID']) return;

  const sh = tmv3_sheet_(TMV3.SHEETS.TASKS);
  const headers = [
    'Task ID','Task Number','Task Type ID','Task Type','Status','Name',
    'Customer ID','Location ID','Contact ID','Order ID','Start','Due',
    'Assignees','Pools','URL','Fingerprint'
  ];

  const row = headers.map(function(header) {
    return task[header] === undefined ? '' : task[header];
  });

  if (sh.getLastRow() < 1 || sh.getLastColumn() < headers.length) {
    tmv3_replaceRows_(TMV3.SHEETS.TASKS, headers, [row]);
    return;
  }

  const currentHeaders = sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0].map(tmv3_clean_);
  const idCol = currentHeaders.indexOf('Task ID') + 1;
  if (!idCol) {
    tmv3_replaceRows_(TMV3.SHEETS.TASKS, headers, [row]);
    return;
  }

  let targetRow = 0;
  if (sh.getLastRow() >= 2) {
    const ids = sh.getRange(2,idCol,sh.getLastRow()-1,1).getValues();
    for (let i = 0; i < ids.length; i++) {
      if (String(ids[i][0] || '') === String(task['Task ID'])) {
        targetRow = i + 2;
        break;
      }
    }
  }

  if (!targetRow) targetRow = sh.getLastRow() + 1;
  sh.getRange(targetRow,1,1,headers.length).setValues([row]);
}

function tmv3_operationPatchTask_(taskId, payload, scope) {
  tmv3_assertOperationWrite_(scope);
  const id = Number(taskId || 0);
  if (!id) throw new Error('Task ID is required.');

  const safe = tmv3_safeTaskPatchPayload_(payload || {}, id);
  if (Object.keys(safe).length <= 1) {
    return {
      status: 'NOT_NEEDED',
      taskId: id,
      payload: safe,
      readback: tmv3_getTaskById_(id)
    };
  }

  tmv3_fetchJson_(
    TMV3.API_BASE + '/v2/tasks/' + encodeURIComponent(id),
    {
      method: 'patch',
      contentType: 'application/json',
      payload: JSON.stringify(safe)
    }
  );

  const readback = tmv3_getTaskById_(id);
  tmv3_upsertTaskCacheRow_(readback);
  return {
    status: 'PATCHED_AND_READ_BACK',
    taskId: id,
    payload: safe,
    readback: readback
  };
}

function tmv3_operationAssignmentRequest_(taskId, assignment, method, scope) {
  tmv3_assertOperationWrite_(scope);

  return tmv3_fetchJson_(
    TMV3.API_BASE + '/v2/tasks/' + encodeURIComponent(Number(taskId)) + '/assignments',
    {
      method: method,
      contentType: 'application/json',
      payload: JSON.stringify({
        Id: Number(assignment.id),
        Name: assignment.name || '',
        Type: assignment.type || 'employee'
      })
    }
  );
}

function tmv3_reconcileTaskAssignments_(eventRecord, taskId, scope, options) {
  options = options || {};
  tmv3_assertOperationWrite_(scope);

  const desired = tmv3_desiredAssignment_(eventRecord);
  const raw = tmv3_rawTaskById_(taskId);
  let current = tmv3_taskAssignmentsFromRaw_(raw);
  const added = [];
  const removed = [];

  function has(type, id) {
    return current.some(function(item) {
      return item.type === type && Number(item.id) === Number(id);
    });
  }

  (desired.employeeIds || []).forEach(function(id) {
    if (has('employee', id)) return;
    const assignment = {
      id: Number(id),
      type: 'employee',
      name: tmv3_employeeNameById_(id)
    };
    tmv3_operationAssignmentRequest_(taskId, assignment, 'post', scope);
    added.push(assignment);
    current.push(assignment);
  });

  (desired.poolIds || []).forEach(function(id) {
    if (has('pool', id)) return;
    const cfg = TMV3.VERTICALS[eventRecord.vertical];
    const assignment = {
      id: Number(id),
      type: 'pool',
      name: cfg.defaultPoolName || ''
    };
    tmv3_operationAssignmentRequest_(taskId, assignment, 'post', scope);
    added.push(assignment);
    current.push(assignment);
  });

  // Original Delivery/Service rule: only remove To Be Assigned after the
  // intended employee has been successfully established.
  if (
    (eventRecord.vertical === 'Delivery' || eventRecord.vertical === 'Service') &&
    (desired.employeeIds || []).length &&
    has('pool', 4)
  ) {
    const assignment = { id: 4, type: 'pool', name: 'To Be Assigned' };
    tmv3_operationAssignmentRequest_(taskId, assignment, 'delete', scope);
    removed.push(assignment);
    current = current.filter(function(item) {
      return !(item.type === 'pool' && Number(item.id) === 4);
    });
  }

  // Service calendars have one authoritative technician. Remove only known
  // Service technicians that conflict with the current Calendar technician.
  if (eventRecord.vertical === 'Service' && (desired.employeeIds || []).length) {
    const serviceIds = [26, 38, 39];
    const desiredIds = desired.employeeIds.map(Number);
    current.slice().forEach(function(item) {
      if (
        item.type === 'employee' &&
        serviceIds.indexOf(Number(item.id)) !== -1 &&
        desiredIds.indexOf(Number(item.id)) === -1
      ) {
        tmv3_operationAssignmentRequest_(taskId, item, 'delete', scope);
        removed.push(item);
        current = current.filter(function(x) {
          return !(x.type === 'employee' && Number(x.id) === Number(item.id));
        });
      }
    });
  }

  // Delivery uses the two known delivery assignees. Do not remove any other
  // manually assigned employee outside that proven set.
  if (eventRecord.vertical === 'Delivery' && (desired.employeeIds || []).length) {
    const deliveryIds = [18, 26];
    const desiredIds = desired.employeeIds.map(Number);
    current.slice().forEach(function(item) {
      if (
        item.type === 'employee' &&
        deliveryIds.indexOf(Number(item.id)) !== -1 &&
        desiredIds.indexOf(Number(item.id)) === -1
      ) {
        tmv3_operationAssignmentRequest_(taskId, item, 'delete', scope);
        removed.push(item);
        current = current.filter(function(x) {
          return !(x.type === 'employee' && Number(x.id) === Number(item.id));
        });
      }
    });
  }

  if (eventRecord.vertical === 'PreInspection') {
    // Pool 8 is mandatory. New tasks must not inherit the historical legacy
    // employees 6/20 from old templates.
    if (options.newTask === true) {
      [6, 20].forEach(function(id) {
        const found = current.filter(function(item) {
          return item.type === 'employee' && Number(item.id) === Number(id);
        });
        found.forEach(function(item) {
          tmv3_operationAssignmentRequest_(taskId, item, 'delete', scope);
          removed.push(item);
        });
      });
    }

    if (has('pool', 4)) {
      const wrongPool = { id: 4, type: 'pool', name: 'To Be Assigned' };
      tmv3_operationAssignmentRequest_(taskId, wrongPool, 'delete', scope);
      removed.push(wrongPool);
    }
  }

  const afterRaw = tmv3_rawTaskById_(taskId);
  const after = tmv3_taskAssignmentsFromRaw_(afterRaw);
  tmv3_upsertTaskCacheRow_(tmv3_normalizeV2TaskModel_(afterRaw));

  (desired.employeeIds || []).forEach(function(id) {
    if (!after.some(function(item) {
      return item.type === 'employee' && Number(item.id) === Number(id);
    })) {
      throw new Error('Assignment read-back failed for employee ' + id + '.');
    }
  });

  (desired.poolIds || []).forEach(function(id) {
    if (!after.some(function(item) {
      return item.type === 'pool' && Number(item.id) === Number(id);
    })) {
      throw new Error('Assignment read-back failed for pool ' + id + '.');
    }
  });

  return {
    status: added.length || removed.length ? 'RECONCILED' : 'NOT_NEEDED',
    taskId: Number(taskId),
    desired: desired,
    added: added,
    removed: removed,
    after: after
  };
}

function tmv3_assertResolvedOwnership_(bundle) {
  const resolved = bundle.resolved;
  const refs = bundle.refs;
  const customerId = tmv3_clean_(resolved.customerId);
  const locationId = tmv3_clean_(resolved.locationId);
  const orderId = tmv3_clean_(resolved.orderId);
  const contactId = tmv3_clean_(resolved.contactId);

  if (!customerId) throw new Error('Resolved Customer ID is missing.');

  if (locationId) {
    const owned = (refs.locationsByCustomer[customerId] || []).some(function(row) {
      return tmv3_clean_(row['Location ID']) === locationId;
    });
    if (!owned) {
      throw new Error(
        'Location ' + locationId + ' is not proven to belong to Customer ' + customerId + '.'
      );
    }
  }

  if (orderId) {
    const order = refs.orderById[orderId];
    if (!order || tmv3_clean_(order['Customer ID']) !== customerId) {
      throw new Error(
        'Order / Work Order ' + orderId + ' is not proven to belong to Customer ' + customerId + '.'
      );
    }
  }

  if (contactId && bundle.eventRecord.vertical !== 'PreInspection') {
    const contact = tmv3_getContactById_(contactId, customerId);
    if (!contact.__ownershipVerified) {
      throw new Error(
        'Contact ' + contactId + ' ownership could not be proven for Customer ' + customerId + '.'
      );
    }
  }

  return true;
}

function tmv3_selectedDatePayload_(bundle) {
  return {
    Id: Number(bundle.resolved.taskId),
    StartDateTime: tmv3_strivenTaskDateTime_(bundle.eventRecord.start),
    DueDateTime: tmv3_strivenTaskDateTime_(bundle.eventRecord.end)
  };
}

function tmv3_selectedRelationshipPayload_(bundle) {
  tmv3_assertResolvedOwnership_(bundle);

  const resolved = bundle.resolved;
  const vertical = bundle.eventRecord.vertical;
  const cfg = TMV3.VERTICALS[vertical];
  const payload = { Id: Number(resolved.taskId) };

  if (resolved.locationId) {
    payload.Location = { Id: Number(resolved.locationId) };
  }

  if (cfg.orderRequired && resolved.orderId) {
    payload.SalesOrder = { Id: Number(resolved.orderId) };
  }

  if (vertical === 'PreInspection') {
    const requestedBy = tmv3_resolveOrganizerEmployee_(bundle.eventRecord);
    if (requestedBy.status !== 'MATCHED') {
      throw new Error(requestedBy.reason || 'Requested By employee is unresolved.');
    }
    payload.RequestedBy = {
      Id: Number(requestedBy.employee.id),
      Name: requestedBy.employee.name || '',
      Type: 'employee'
    };
  } else if (resolved.contactId) {
    payload.RequestedBy = {
      Id: Number(resolved.contactId),
      Type: 'contact'
    };
  }

  return payload;
}

function tmv3_verifyTaskPatch_(bundle, readback, mode) {
  const issues = [];
  const resolved = bundle.resolved;
  const eventRecord = bundle.eventRecord;
  const cfg = TMV3.VERTICALS[eventRecord.vertical];

  let scheduleVerification = null;
  if (mode === 'DATES' || mode === 'ALL') {
    scheduleVerification = tmv3_taskScheduleCheck_(
      eventRecord.vertical,
      eventRecord.start,
      eventRecord.end,
      resolved.taskId,
      readback
    );

    if (scheduleVerification.startCheck !== 'MATCH') {
      issues.push(
        scheduleVerification.startCheck === 'CANONICAL_READ_FAILED'
          ? 'Start date/time canonical v1 read-back unavailable'
          : 'Start date/time read-back mismatch'
      );
    }

    if (scheduleVerification.endCheck !== 'MATCH') {
      issues.push(
        scheduleVerification.endCheck === 'CANONICAL_READ_FAILED'
          ? 'Due date/time canonical v1 read-back unavailable'
          : (
              tmv3_taskDueDateOnly_(eventRecord.vertical, readback)
                ? 'Due date read-back mismatch'
                : 'Due date/time read-back mismatch'
            )
      );
    }
  }

  if (mode === 'RELATIONSHIPS' || mode === 'ALL') {
    if (
      resolved.locationId &&
      String(readback['Location ID'] || '') !== String(resolved.locationId)
    ) {
      issues.push('Location read-back mismatch');
    }

    if (
      cfg.orderRequired && resolved.orderId &&
      String(readback['Order ID'] || '') !== String(resolved.orderId)
    ) {
      issues.push(cfg.orderLabel + ' read-back mismatch');
    }

    if (
      eventRecord.vertical !== 'PreInspection' && resolved.contactId &&
      String(readback['Contact ID'] || '') !== String(resolved.contactId)
    ) {
      issues.push('Requested By / Contact read-back mismatch');
    }

    if (eventRecord.vertical === 'PreInspection' && readback['Order ID']) {
      issues.push('PreInspection Task unexpectedly has a Sales Order');
    }
  }

  if (issues.length) {
    throw new Error('Task PATCH verification failed: ' + issues.join('; '));
  }

  return {
    status: 'VERIFIED',
    taskId: Number(resolved.taskId),
    mode: mode,
    readback: readback,
    scheduleVerification: scheduleVerification
  };
}

function tmv3_stripAuthoredCalendarNotes_(description) {
  return tmv3_stripManagedLinkBlocks_(description || '')
    .replace(/<!--\s*PREINSPECT_STRIVEN_TASK_LINK_START\s*-->[\s\S]*?<!--\s*PREINSPECT_STRIVEN_TASK_LINK_END\s*-->/gi, '')
    .replace(/(?:\r?\n\s*){3,}/g, '\n\n')
    .trim();
}

function tmv3_infoCustomFieldsRaw_(raw) {
  const direct = raw && (raw.infoCustomFields || raw.InfoCustomFields);
  return Array.isArray(direct) ? direct : [];
}

function tmv3_fieldId_(field) {
  return Number(tmv3_first_(field || {}, ['id','Id','customFieldId','CustomFieldId']) || 0);
}

function tmv3_fieldValue_(field) {
  if (!field) return null;
  if (field.value !== undefined) return field.value;
  if (field.Value !== undefined) return field.Value;
  if (field.valueText !== undefined) return field.valueText;
  if (field.ValueText !== undefined) return field.ValueText;
  return null;
}

function tmv3_setExistingFieldValue_(field, value) {
  if (Object.prototype.hasOwnProperty.call(field, 'value')) field.value = value;
  else if (Object.prototype.hasOwnProperty.call(field, 'Value')) field.Value = value;
  else field.Value = value;

  if (Object.prototype.hasOwnProperty.call(field, 'valueText')) field.valueText = null;
  if (Object.prototype.hasOwnProperty.call(field, 'ValueText')) field.ValueText = null;
}

function tmv3_pushPreInspectionField854_(bundle, scope) {
  tmv3_assertOperationWrite_(scope);
  if (bundle.eventRecord.vertical !== 'PreInspection') {
    throw new Error('Field 854 is only valid for PreInspection.');
  }

  tmv3_assertResolvedRecordWritable_(bundle.resolved, { requireTask: true });
  const taskId = Number(bundle.resolved.taskId);
  const desired = tmv3_stripAuthoredCalendarNotes_(bundle.eventRecord.description);

  if (!desired) {
    return {
      status: 'NOT_NEEDED',
      taskId: taskId,
      reason: 'Calendar has no authored Install Notes to push.'
    };
  }

  const beforeRaw = tmv3_rawTaskById_(taskId);
  const beforeFields = tmv3_infoCustomFieldsRaw_(beforeRaw);
  const beforeTarget = beforeFields.filter(function(field) {
    return tmv3_fieldId_(field) === 854;
  });

  if (beforeTarget.length !== 1) {
    throw new Error(
      'Field 854 write blocked: expected one existing Field 854, found ' +
      beforeTarget.length + '.'
    );
  }

  const beforeNon854 = {};
  beforeFields.forEach(function(field) {
    const id = tmv3_fieldId_(field);
    if (id && id !== 854) beforeNon854[id] = JSON.stringify(tmv3_fieldValue_(field));
  });

  const merged = JSON.parse(JSON.stringify(beforeFields));
  const target = merged.filter(function(field) {
    return tmv3_fieldId_(field) === 854;
  })[0];
  tmv3_setExistingFieldValue_(target, desired);

  tmv3_fetchJson_(
    TMV3.API_BASE + '/v2/tasks/' + encodeURIComponent(taskId),
    {
      method: 'patch',
      contentType: 'application/json',
      payload: JSON.stringify({ Id: taskId, InfoCustomFields: merged })
    }
  );

  const afterRaw = tmv3_rawTaskById_(taskId);
  const afterFields = tmv3_infoCustomFieldsRaw_(afterRaw);
  const afterTarget = afterFields.filter(function(field) {
    return tmv3_fieldId_(field) === 854;
  });

  if (afterTarget.length !== 1) {
    throw new Error('Field 854 read-back failed: target field missing after PATCH.');
  }

  const actual = tmv3_clean_(tmv3_fieldValue_(afterTarget[0]));
  if (actual !== tmv3_clean_(desired)) {
    throw new Error('Field 854 read-back failed: value differs from Calendar notes.');
  }

  afterFields.forEach(function(field) {
    const id = tmv3_fieldId_(field);
    if (!id || id === 854) return;
    if (!Object.prototype.hasOwnProperty.call(beforeNon854, id)) {
      throw new Error('Field 854 PATCH added unexpected custom field ' + id + '.');
    }
    if (beforeNon854[id] !== JSON.stringify(tmv3_fieldValue_(field))) {
      throw new Error('Field 854 PATCH changed non-854 custom field ' + id + '.');
    }
  });

  if (Object.keys(beforeNon854).length !== afterFields.filter(function(field) {
    const id = tmv3_fieldId_(field);
    return id && id !== 854;
  }).length) {
    throw new Error('Field 854 PATCH changed the non-854 field set.');
  }

  return {
    status: 'FIELD_854_VERIFIED',
    taskId: taskId,
    fieldId: 854,
    non854FieldsPreserved: true
  };
}

function tmv3_findEventCopyRobust_(calendarId, eventId) {
  const direct = tmv3_findCalendarEventById_(calendarId, eventId);
  if (direct) return direct;

  const calendar = CalendarApp.getCalendarById(calendarId);
  if (!calendar) return null;

  const raw = tmv3_clean_(eventId);
  const normalized = raw.replace(/@google\.com$/i, '');
  const start = new Date();
  start.setDate(start.getDate() - 3);
  start.setHours(0,0,0,0);
  const end = new Date();
  end.setDate(end.getDate() + 365);
  end.setHours(23,59,59,999);
  const events = calendar.getEvents(start, end);

  for (let i = 0; i < events.length; i++) {
    const foundRaw = tmv3_clean_(events[i].getId());
    const foundNormalized = foundRaw.replace(/@google\.com$/i, '');
    if (
      foundRaw === raw ||
      foundRaw === normalized ||
      foundNormalized === raw ||
      foundNormalized === normalized
    ) {
      return { calendar: calendar, event: events[i], match: 'BOUNDED_SCAN' };
    }
  }

  return null;
}

function tmv3_operationWriteCalendarLinks_(bundle, scope) {
  tmv3_assertOperationWrite_(scope);

  const eventRecord = bundle.eventRecord;
  const records = bundle.records || [bundle.resolved];
  records.forEach(function(record) {
    tmv3_assertResolvedRecordWritable_(record, { requireTask: true });
  });

  const plan = tmv3_buildCalendarLinkPlan_(eventRecord, records);
  const copies = [];

  (plan.calendarIds || []).forEach(function(calendarId) {
    const found = tmv3_findEventCopyRobust_(calendarId, plan.eventId);
    if (found && found.event) {
      copies.push({
        calendarId: calendarId,
        calendarName: found.calendar.getName(),
        event: found.event
      });
    }
  });

  if (!copies.length) {
    throw new Error('No Calendar copy found for Event ID ' + plan.eventId + '.');
  }

  if (
    eventRecord.vertical === 'PreInspection' &&
    copies.length !== (plan.calendarIds || []).length
  ) {
    throw new Error(
      'PreInspection Calendar link blocked: expected ' +
      (plan.calendarIds || []).length + ' Calendar copies, found ' + copies.length + '.'
    );
  }

  const results = [];
  copies.forEach(function(copy) {
    const before = String(copy.event.getDescription() || '');
    const desired = tmv3_managedCalendarDescription_(before, plan);
    if (before !== desired) copy.event.setDescription(desired);

    const readBackFound = tmv3_findEventCopyRobust_(copy.calendarId, plan.eventId);
    if (!readBackFound || !readBackFound.event) {
      throw new Error('Calendar copy disappeared during link read-back.');
    }

    const after = String(readBackFound.event.getDescription() || '');
    const missing = (plan.links || []).filter(function(link) {
      return after.indexOf(link.url) === -1;
    });
    if (missing.length) {
      throw new Error(
        'Calendar link read-back failed on ' + copy.calendarName +
        ': missing ' + missing.map(function(item) { return item.key; }).join(', ')
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
    vertical: eventRecord.vertical,
    eventId: plan.eventId,
    copies: results,
    links: plan.links
  };
}

function tmv3_replacementSourceSnapshot_(taskId) {
  const raw = tmv3_rawTaskById_(taskId);
  const assignments = tmv3_taskAssignmentsFromRaw_(raw);
  const type = raw.type || raw.Type || null;
  const priority = raw.priority || raw.Priority || null;
  const customer = raw.customer || raw.Customer || null;
  const location = raw.location || raw.Location || null;
  const salesOrder = raw.salesOrder || raw.SalesOrder || null;
  const requestedBy = raw.requestedBy || raw.RequestedBy || null;

  return {
    sourceTaskId: Number(raw.id || raw.Id || taskId),
    status: tmv3_clean_((raw.status || raw.Status || {}).name || (raw.status || raw.Status || {}).Name),
    title: tmv3_clean_(raw.title || raw.Title || raw.name || raw.Name),
    description: String(raw.description || raw.Description || ''),
    budget: Number(raw.budget !== undefined ? raw.budget : (raw.Budget || 0)),
    type: type ? {
      id: Number(type.id || type.Id || 0),
      name: tmv3_clean_(type.name || type.Name)
    } : null,
    priority: priority ? {
      id: Number(priority.id || priority.Id || 0),
      name: tmv3_clean_(priority.name || priority.Name)
    } : null,
    customer: customer ? {
      id: Number(customer.id || customer.Id || 0),
      number: tmv3_clean_(customer.number || customer.Number),
      name: tmv3_clean_(customer.name || customer.Name)
    } : null,
    location: location ? {
      id: Number(location.id || location.Id || 0),
      name: tmv3_clean_(location.name || location.Name)
    } : null,
    salesOrder: salesOrder ? {
      id: Number(salesOrder.id || salesOrder.Id || 0),
      number: tmv3_clean_(salesOrder.number || salesOrder.Number),
      name: tmv3_clean_(salesOrder.name || salesOrder.Name)
    } : null,
    requestedBy: requestedBy ? {
      id: Number(requestedBy.id || requestedBy.Id || 0),
      name: tmv3_clean_(requestedBy.name || requestedBy.Name),
      type: tmv3_clean_(requestedBy.type || requestedBy.Type) || 'contact'
    } : null,
    startDateTime: raw.startDateTime || raw.StartDateTime || '',
    dueDateTime: raw.dueDateTime || raw.DueDateTime || '',
    employeeAssignmentIds: assignments.filter(function(a) {
      return a.type === 'employee';
    }).map(function(a) { return Number(a.id); }),
    poolAssignmentIds: assignments.filter(function(a) {
      return a.type === 'pool';
    }).map(function(a) { return Number(a.id); }),
    infoCustomFields: JSON.parse(JSON.stringify(tmv3_infoCustomFieldsRaw_(raw))),
    useSubContractor: raw.useSubContractor === true || raw.UseSubContractor === true,
    rawTask: raw
  };
}

function tmv3_safeCreateInfoCustomFields_(sourceFields, calendarNotes) {
  const output = [];

  (sourceFields || []).forEach(function(field) {
    const id = tmv3_fieldId_(field);
    const name = tmv3_clean_(tmv3_first_(field, ['name','Name']));
    if (!id || id === 834 || id === 732) return;
    if (/\bstatus\b|\bcompleted?\b|\bcompletion\b|\bdone\b|\boutcome\b|\bresult\b/i.test(name)) return;

    const value = tmv3_fieldValue_(field);
    if (value === null || value === undefined || value === '') return;
    output.push(JSON.parse(JSON.stringify(field)));
  });

  const notes = String(calendarNotes || '').trim();
  if (notes) {
    output.push({
      Id: 834,
      Name: 'Notes from Google Calendar',
      Value: notes,
      ValueText: null
    });
  }

  return output;
}

function tmv3_buildReplacementCreatePayload_(source, request) {
  if (!source || !source.type || !source.type.id) {
    throw new Error('CREATE source has no Task Type.');
  }
  if (!source.title) {
    throw new Error('CREATE source has no Task title.');
  }

  const payload = {
    Title: source.title,
    Type: {
      Id: Number(source.type.id),
      Name: source.type.name || ''
    },
    Description: source.description || '',
    Budget: Number(source.budget || 0),
    StartDateTime: request.startDateTime,
    DueDateTime: request.dueDateTime,
    UseSubContractor: source.useSubContractor === true
  };

  if (source.priority && source.priority.id) {
    payload.Priority = {
      Id: Number(source.priority.id),
      Name: source.priority.name || ''
    };
  }

  if (source.customer && source.customer.id) {
    payload.Customer = {
      Id: Number(source.customer.id),
      Number: source.customer.number || '',
      Name: source.customer.name || ''
    };
  }

  if (source.location && source.location.id) {
    payload.Location = {
      Id: Number(source.location.id),
      Name: source.location.name || ''
    };
  }

  if (source.salesOrder && source.salesOrder.id) {
    payload.SalesOrder = {
      Id: Number(source.salesOrder.id),
      Number: source.salesOrder.number || '',
      Name: source.salesOrder.name || ''
    };
  }

  if (source.requestedBy && source.requestedBy.id) {
    payload.RequestedBy = {
      Id: Number(source.requestedBy.id),
      Name: source.requestedBy.name || '',
      Type: source.requestedBy.type || 'contact'
    };
  }

  const fields = tmv3_safeCreateInfoCustomFields_(
    source.infoCustomFields || [],
    request.calendarNotes
  );
  if (fields.length) payload.InfoCustomFields = fields;

  return payload;
}

function tmv3_extractCreatedTaskId_(json) {
  if (typeof json === 'number' && json > 0) return Number(json);
  if (typeof json === 'string' && /^\d+$/.test(json.trim())) return Number(json.trim());
  if (!json || typeof json !== 'object') return null;

  const candidates = [
    json.id, json.Id, json.taskId, json.TaskId, json.TaskID,
    json.data && json.data.id,
    json.data && json.data.Id,
    json.task && json.task.id,
    json.task && json.task.Id
  ];

  for (let i = 0; i < candidates.length; i++) {
    const id = Number(candidates[i]);
    if (Number.isFinite(id) && id > 0) return id;
  }

  return null;
}

function tmv3_customerFromRefs_(refs, customerId) {
  return refs.customerById[String(customerId)] || null;
}

function tmv3_locationFromRefs_(refs, customerId, locationId) {
  const matches = (refs.locationsByCustomer[String(customerId)] || []).filter(function(row) {
    return String(row['Location ID'] || '') === String(locationId || '');
  });
  return matches.length === 1 ? matches[0] : null;
}

function tmv3_createTaskTitle_(bundle, action, source) {
  const eventRecord = bundle.eventRecord;
  const resolved = bundle.resolved;
  const customer = tmv3_customerFromRefs_(bundle.refs, resolved.customerId) || {};
  const customerName = tmv3_clean_(customer['Name'] || resolved.customer);
  const phone = tmv3_phone10_(eventRecord.phone || customer['Primary Phone']);

  if (eventRecord.vertical === 'PreInspection') {
    if (!customerName || !phone) {
      throw new Error('PreInspection CREATE requires verified Customer name and phone.');
    }
    return 'Preinspect – ' + customerName + ' – ' +
      '(' + phone.slice(0,3) + ') ' + phone.slice(3,6) + '-' + phone.slice(6);
  }

  if (action === 'RECREATE' && source && source.title) {
    return source.title;
  }

  if (eventRecord.vertical === 'Install') {
    const parts = [];
    if (eventRecord.orderNumber) parts.push('SO#' + eventRecord.orderNumber);
    if (customerName) parts.push(customerName);
    if (phone) parts.push(phone);
    if (parts.length) return parts.join(' - ');
  }

  return tmv3_clean_(eventRecord.title) ||
    [eventRecord.vertical, customerName, phone].filter(Boolean).join(' - ');
}

function tmv3_serviceTaskTypeForOrder_(orderId) {
  const rows = tmv3_reportRows_(TMV3.PROPERTIES.SERVICE_WORK_ORDERS);
  const target = String(orderId || '');

  for (let i = 0; i < rows.length; i++) {
    const id = tmv3_clean_(tmv3_first_(rows[i], [
      'WorkOrderId','Work Order ID','WorkOrder ID','SalesOrderId','OrderId','Id'
    ]));
    if (id !== target) continue;
    return tmv3_clean_(tmv3_first_(rows[i], [
      'CategoryName','Category Name','Category'
    ]));
  }

  return '';
}

function tmv3_findCreateTemplateTask_(bundle) {
  const vertical = bundle.eventRecord.vertical;
  const cfg = TMV3.VERTICALS[vertical];

  if (vertical === 'PreInspection') {
    const source = tmv3_replacementSourceSnapshot_(11138);
    if (!source.type || Number(source.type.id) !== 105) {
      throw new Error('PreInspection Template Task 11138 is no longer Task Type 105.');
    }
    return source;
  }

  let desiredType = '';
  if (vertical === 'Delivery') desiredType = 'BBQ Delivery';
  if (vertical === 'Service') {
    desiredType = tmv3_serviceTaskTypeForOrder_(bundle.resolved.orderId);
    if (!desiredType) {
      throw new Error(
        'Service CREATE blocked: Work Order Category / Task Type could not be proven.'
      );
    }
  }

  const candidates = (bundle.refs.tasks || []).filter(function(task) {
    if (!tmv3_taskFitsVertical_(task, vertical, cfg)) return false;
    if (
      desiredType &&
      tmv3_norm_(task['Task Type']) !== tmv3_norm_(desiredType)
    ) return false;
    return !!tmv3_clean_(task['Task ID']);
  });

  candidates.sort(function(a, b) {
    const ao = tmv3_taskIsOpen_(a['Status']) ? 1 : 0;
    const bo = tmv3_taskIsOpen_(b['Status']) ? 1 : 0;
    if (ao !== bo) return bo - ao;
    return Number(a['Task ID'] || 0) - Number(b['Task ID'] || 0);
  });

  if (!candidates.length) {
    throw new Error(
      vertical + ' CREATE blocked: no proven structural Task template is available.'
    );
  }

  return tmv3_replacementSourceSnapshot_(candidates[0]['Task ID']);
}

function tmv3_findRecreateSourceTask_(bundle) {
  const resolved = bundle.resolved;
  const vertical = bundle.eventRecord.vertical;
  const cfg = TMV3.VERTICALS[vertical];
  const candidates = [];

  (bundle.refs.tasks || []).forEach(function(task) {
    if (!tmv3_taskFitsVertical_(task, vertical, cfg)) return;
    if (!tmv3_taskIsCompleted_(task['Status'])) return;

    if (
      resolved.orderId &&
      String(task['Order ID'] || '') === String(resolved.orderId)
    ) {
      candidates.push(task);
      return;
    }

    if (
      !resolved.orderId &&
      resolved.customerId &&
      String(task['Customer ID'] || '') === String(resolved.customerId) &&
      String(task['Location ID'] || '') === String(resolved.locationId || '')
    ) {
      candidates.push(task);
    }
  });

  if (candidates.length !== 1) {
    throw new Error(
      'RECREATE requires exactly one completed source Task; found ' +
      candidates.length + '.'
    );
  }

  return tmv3_replacementSourceSnapshot_(candidates[0]['Task ID']);
}

function tmv3_buildCreateSource_(bundle, action) {
  tmv3_assertResolvedOwnership_(bundle);

  const resolved = bundle.resolved;
  const eventRecord = bundle.eventRecord;
  const customer = tmv3_customerFromRefs_(bundle.refs, resolved.customerId);
  const location = tmv3_locationFromRefs_(bundle.refs, resolved.customerId, resolved.locationId);
  const order = resolved.orderId ? bundle.refs.orderById[String(resolved.orderId)] : null;

  if (!customer || !location) {
    throw new Error('CREATE requires verified Customer and customer-owned Location.');
  }

  const base = action === 'RECREATE'
    ? tmv3_findRecreateSourceTask_(bundle)
    : tmv3_findCreateTemplateTask_(bundle);

  let requestedBy = null;
  if (eventRecord.vertical === 'PreInspection') {
    const employee = tmv3_resolveOrganizerEmployee_(eventRecord);
    if (employee.status !== 'MATCHED') {
      throw new Error(employee.reason || 'PreInspection Requested By unresolved.');
    }
    requestedBy = {
      id: Number(employee.employee.id),
      name: employee.employee.name || '',
      type: 'employee'
    };
  } else if (resolved.contactId) {
    requestedBy = {
      id: Number(resolved.contactId),
      name: '',
      type: 'contact'
    };
  }

  return {
    sourceTaskId: base.sourceTaskId,
    title: tmv3_createTaskTitle_(bundle, action, base),
    description:
      eventRecord.vertical === 'PreInspection'
        ? ''
        : (action === 'RECREATE' ? base.description : tmv3_stripAuthoredCalendarNotes_(eventRecord.description)),
    budget: Number(base.budget || 0),
    type: base.type,
    priority: base.priority,
    customer: {
      id: Number(resolved.customerId),
      number: tmv3_clean_(customer['Customer Number']),
      name: tmv3_clean_(customer['Name'])
    },
    location: {
      id: Number(resolved.locationId),
      name: [location['Address 1'], location['City']].map(tmv3_clean_).filter(Boolean).join(', ')
    },
    salesOrder:
      eventRecord.vertical === 'PreInspection'
        ? null
        : (order ? {
            id: Number(resolved.orderId),
            number: tmv3_clean_(order['Order Number']),
            name: tmv3_clean_(order['Name'])
          } : null),
    requestedBy: requestedBy,
    useSubContractor: base.useSubContractor === true,
    infoCustomFields:
      eventRecord.vertical === 'PreInspection'
        ? []
        : (action === 'RECREATE' ? base.infoCustomFields : [])
  };
}


function tmv3_existingPersistedTaskForEvent_(vertical, eventId) {
  const rows = tmv3_rows_(TMV3.SHEETS.STATE).filter(function(row) {
    return (
      tmv3_clean_(row['Vertical']) === tmv3_clean_(vertical) &&
      tmv3_clean_(row['Event ID']) === tmv3_clean_(eventId) &&
      !!tmv3_clean_(row['Task ID'])
    );
  });

  for (let i = 0; i < rows.length; i++) {
    const taskId = Number(rows[i]['Task ID'] || 0);
    if (!taskId) continue;
    try {
      const task = tmv3_getTaskById_(taskId);
      if (task && task['Task ID']) {
        return { taskId: taskId, task: task, state: rows[i] };
      }
    } catch (ignored) {}
  }

  return null;
}

function tmv3_persistCreatedTaskIdState_(bundle, taskId) {
  tmv3_upsertState_([{
    vertical: bundle.eventRecord.vertical,
    eventId: bundle.eventRecord.eventId,
    calendarId: bundle.eventRecord.calendarId,
    customerId: bundle.resolved.customerId,
    locationId: bundle.resolved.locationId,
    contactId: bundle.resolved.contactId,
    orderId: bundle.resolved.orderId,
    taskId: Number(taskId),
    fingerprint: bundle.eventRecord.fingerprint,
    calendarUpdatedAt: bundle.eventRecord.calendarUpdatedAt,
    status: 'READY',
    nextAction: 'VERIFY CREATED TASK',
    errorCode: '',
    lastVerified: ''
  }]);
}

function tmv3_createOrRecreateFromBundle_(bundle, scope) {
  tmv3_assertOperationWrite_(scope);
  const status = tmv3_clean_(bundle.resolved.status).toUpperCase();

  if (status !== 'READY CREATE' && status !== 'READY RECREATE') {
    throw new Error(
      'CREATE / RECREATE blocked. Fresh V3 status is ' + status + '.'
    );
  }

  if (bundle.resolved.taskId) {
    throw new Error('CREATE blocked because a Task ID is already resolved.');
  }

  if ((bundle.records || []).some(function(record) { return !!record.taskId; })) {
    throw new Error('CREATE blocked because another mapped Task already exists for this event.');
  }

  const persisted = tmv3_existingPersistedTaskForEvent_(
    bundle.eventRecord.vertical,
    bundle.eventRecord.eventId
  );
  if (persisted) {
    throw new Error(
      'CREATE blocked: V3 previously persisted Task ' + persisted.taskId +
      ' for this Calendar event. Reconcile that Task first.'
    );
  }

  const action = status === 'READY RECREATE' ? 'RECREATE' : 'CREATE';
  const source = tmv3_buildCreateSource_(bundle, action);
  const request = {
    startDateTime: tmv3_strivenTaskDateTime_(bundle.eventRecord.start),
    dueDateTime: tmv3_strivenTaskDateTime_(bundle.eventRecord.end),
    calendarNotes:
      bundle.eventRecord.vertical === 'PreInspection'
        ? null
        : tmv3_stripAuthoredCalendarNotes_(bundle.eventRecord.description)
  };
  const payload = tmv3_buildReplacementCreatePayload_(source, request);

  if (bundle.eventRecord.vertical === 'PreInspection') {
    delete payload.SalesOrder;
    delete payload.SalesOrderId;
    delete payload.SalesOrderID;
    delete payload.SOId;
    payload.Description = '';
    delete payload.InfoCustomFields;
  }

  let json;
  let newTaskId = 0;

  try {
    json = tmv3_fetchJson_(
      TMV3.API_BASE + '/v2/tasks',
      {
        method: 'post',
        contentType: 'application/json',
        payload: JSON.stringify(payload)
      }
    );
    newTaskId = Number(tmv3_extractCreatedTaskId_(json) || 0);
    if (!newTaskId) {
      throw new Error('POST succeeded but created Task ID could not be extracted.');
    }
  } catch (err) {
    tmv3_audit_(
      bundle.eventRecord.vertical,
      bundle.eventRecord.eventId,
      '',
      action + '_TASK',
      'CREATE UNCERTAIN',
      'Do not retry blindly. ' + String(err && err.message || err)
    );
    throw new Error(
      'CREATE UNCERTAIN. Do not retry blindly. Reconcile Striven first. ' +
      String(err && err.message || err)
    );
  }

  // Persist the created ID to durable V3 state immediately. From this point,
  // this execution never POSTs another Task.
  tmv3_persistCreatedTaskIdState_(bundle, newTaskId);
  tmv3_audit_(
    bundle.eventRecord.vertical,
    bundle.eventRecord.eventId,
    newTaskId,
    action + '_TASK_ID_PERSISTED',
    'PASS',
    'Task ID persisted immediately after POST in TM State.'
  );

  const createdResolved = Object.assign({}, bundle.resolved, {
    taskId: newTaskId,
    task: String(newTaskId),
    status: 'READY'
  });

  const assignment = tmv3_reconcileTaskAssignments_(
    bundle.eventRecord,
    newTaskId,
    scope,
    { newTask: true }
  );

  let field854 = null;
  if (bundle.eventRecord.vertical === 'PreInspection') {
    const fieldBundle = Object.assign({}, bundle, { resolved: createdResolved });
    field854 = tmv3_pushPreInspectionField854_(fieldBundle, scope);
  }

  const readback = tmv3_getTaskById_(newTaskId);
  tmv3_upsertTaskCacheRow_(readback);
  if (!tmv3_taskIsOpen_(readback['Status'])) {
    throw new Error('Created Task read-back is not OPEN. Task ID ' + newTaskId + '.');
  }
  if (String(readback['Customer ID'] || '') !== String(bundle.resolved.customerId)) {
    throw new Error('Created Task Customer read-back mismatch.');
  }
  if (String(readback['Location ID'] || '') !== String(bundle.resolved.locationId)) {
    throw new Error('Created Task Location read-back mismatch.');
  }
  if (
    bundle.eventRecord.vertical === 'PreInspection' &&
    (Number(readback['Task Type ID'] || 0) !== 105 || readback['Order ID'])
  ) {
    throw new Error('Created PreInspection Task violated Type 105 / no-SO invariant.');
  }

  const linkRecords = [Object.assign({}, createdResolved, {
    task: newTaskId + ' - ' + tmv3_clean_(readback['Name'])
  })];
  const linkBundle = Object.assign({}, bundle, {
    resolved: linkRecords[0],
    records: linkRecords
  });
  const calendarLinks = tmv3_operationWriteCalendarLinks_(linkBundle, scope);

  tmv3_audit_(
    bundle.eventRecord.vertical,
    bundle.eventRecord.eventId,
    newTaskId,
    action + '_TASK',
    'PASS',
    JSON.stringify({ assignment: assignment, field854: field854, calendarLinks: calendarLinks })
  );

  return {
    status: 'CREATED_VERIFIED_AND_CALENDAR_LINKED',
    action: action,
    taskId: newTaskId,
    assignment: assignment,
    field854: field854,
    calendarLinks: calendarLinks,
    readback: readback
  };
}

function tmv3_executeExistingTaskSync_(bundle, scope, mode) {
  tmv3_assertResolvedRecordWritable_(bundle.resolved, { requireTask: true });
  tmv3_assertResolvedOwnership_(bundle);

  const taskId = Number(bundle.resolved.taskId);
  const before = tmv3_getTaskById_(taskId);

  if (
    before['Customer ID'] &&
    String(before['Customer ID']) !== String(bundle.resolved.customerId)
  ) {
    throw new Error('Current Task Customer conflicts with fresh V3 Customer.');
  }

  let patch = null;
  let assignment = null;
  let calendarLinks = null;
  let field854 = null;

  if (mode === 'DATES') {
    patch = tmv3_operationPatchTask_(taskId, tmv3_selectedDatePayload_(bundle), scope);
    tmv3_verifyTaskPatch_(bundle, patch.readback, 'DATES');
  } else if (mode === 'RELATIONSHIPS') {
    patch = tmv3_operationPatchTask_(taskId, tmv3_selectedRelationshipPayload_(bundle), scope);
    tmv3_verifyTaskPatch_(bundle, patch.readback, 'RELATIONSHIPS');
  } else if (mode === 'ASSIGNEE') {
    assignment = tmv3_reconcileTaskAssignments_(bundle.eventRecord, taskId, scope, {});
  } else if (mode === 'LINKS') {
    calendarLinks = tmv3_operationWriteCalendarLinks_(bundle, scope);
  } else if (mode === 'FIELD854') {
    field854 = tmv3_pushPreInspectionField854_(bundle, scope);
  } else if (mode === 'ALL') {
    const payload = Object.assign(
      {},
      tmv3_selectedDatePayload_(bundle),
      tmv3_selectedRelationshipPayload_(bundle)
    );
    patch = tmv3_operationPatchTask_(taskId, payload, scope);
    tmv3_verifyTaskPatch_(bundle, patch.readback, 'ALL');
    assignment = tmv3_reconcileTaskAssignments_(bundle.eventRecord, taskId, scope, {});
    if (bundle.eventRecord.vertical === 'PreInspection') {
      field854 = tmv3_pushPreInspectionField854_(bundle, scope);
    }
    calendarLinks = tmv3_operationWriteCalendarLinks_(bundle, scope);
  } else {
    throw new Error('Unsupported selected sync mode: ' + mode);
  }

  tmv3_audit_(
    bundle.eventRecord.vertical,
    bundle.eventRecord.eventId,
    taskId,
    'MANUAL_' + mode,
    'PASS',
    JSON.stringify({
      patch: patch && patch.status,
      assignment: assignment && assignment.status,
      field854: field854 && field854.status,
      calendarLinks: calendarLinks && calendarLinks.status
    })
  );

  return {
    status: 'VERIFIED',
    mode: mode,
    vertical: bundle.eventRecord.vertical,
    eventId: bundle.eventRecord.eventId,
    taskId: taskId,
    patch: patch,
    assignment: assignment,
    field854: field854,
    calendarLinks: calendarLinks
  };
}

function tmv3_refreshOperatorAfterManual_() {
  try {
    return tmv3_shadowMapFromCache();
  } catch (err) {
    tmv3_audit_('SYSTEM','','','POST_MANUAL_MAP_REFRESH','ATTENTION',String(err && err.message || err));
    return { status: 'REFRESH_ATTENTION', error: String(err && err.message || err) };
  }
}

function tmv3_executeVerifiedStep7ExistingPlan(
  vertical,
  eventId,
  taskId,
  expectedPlan
) {
  tmv3_assertOperationWrite_('MANUAL');

  const wantedVertical = tmv3_clean_(vertical);
  const wantedEventId = tmv3_clean_(eventId);
  const wantedTaskId = Number(taskId || 0);
  const wantedPlan = tmv3_clean_(expectedPlan);
  const allowed = [
    'PATCH_DATES',
    'PATCH_LOCATION',
    'PATCH_REQUESTED_BY',
    'PATCH_ASSIGNMENTS'
  ];

  if (!wantedTaskId || !wantedPlan) {
    throw new Error('Canary executor requires an exact Task ID and expected plan.');
  }
  if (
    wantedPlan !== 'NO_CHANGE' &&
    (
      wantedPlan.indexOf('PATCH_') !== 0 ||
      !allowed.some(function(prefix) { return wantedPlan.indexOf(prefix) !== -1; })
    )
  ) {
    throw new Error('Unsupported Step 7 canary plan: ' + wantedPlan + '.');
  }

  const plan = tmv3_step7FreshPlanForTask_(
    wantedVertical,
    wantedEventId,
    wantedTaskId
  );
  if (plan.plan !== wantedPlan) {
    throw new Error('Fresh Step 7 plan changed from ' + wantedPlan + ' to ' + plan.plan + '.');
  }
  if (tmv3_clean_(plan.blocker)) {
    throw new Error('Step 7 plan is blocked: ' + plan.blocker);
  }
  if (tmv3_norm_(plan.taskStatus) !== 'open' || plan.readStatus !== 'FRESH_TASK_GET') {
    throw new Error('Step 7 Task is not a fresh-read open Task.');
  }
  if (plan.customerCheck !== 'MATCH' || plan.orderCheck === 'MISMATCH' || plan.locationCheck === 'MISMATCH') {
    throw new Error('Step 7 relationship safety check failed.');
  }

  const eventRecord = tmv3_findFreshEventRecord_(wantedVertical, wantedEventId);
  const refs = tmv3_referenceIndex_();
  const state = tmv3_eventStateIndex_();
  const records = tmv3_resolveEventRecords_(eventRecord, refs, state);
  const matches = records.filter(function(record) {
    return Number(record.taskId || 0) === wantedTaskId;
  });
  if (matches.length !== 1) {
    throw new Error('Fresh resolver did not return exactly one matching Task row.');
  }

  const bundle = {
    context:null,
    eventRecord:eventRecord,
    refs:refs,
    state:state,
    records:records,
    resolved:matches[0]
  };
  const result = {
    status:'CANARY_EXECUTED',
    vertical:wantedVertical,
    eventId:wantedEventId,
    taskId:wantedTaskId,
    plan:wantedPlan,
    relationships:null,
    dates:null,
    assignments:null,
    calendarLinks:null
  };

  // NO_CHANGE is an allowed links-only canary: it proves the Task is already
  // correct while still repairing/verifying the managed Calendar backlink.
  if (/LOCATION|REQUESTED_BY/.test(wantedPlan)) {
    result.relationships = tmv3_executeExistingTaskSync_(bundle, 'MANUAL', 'RELATIONSHIPS');
  }
  if (/DATES/.test(wantedPlan)) {
    result.dates = tmv3_executeExistingTaskSync_(bundle, 'MANUAL', 'DATES');
  }
  if (/ASSIGNMENTS/.test(wantedPlan)) {
    result.assignments = tmv3_executeExistingTaskSync_(bundle, 'MANUAL', 'ASSIGNEE');
  }
  result.calendarLinks = tmv3_executeExistingTaskSync_(bundle, 'MANUAL', 'LINKS');

  const after = tmv3_step7FreshPlanForTask_(wantedVertical, wantedEventId, wantedTaskId);
  if (after.plan !== 'NO_CHANGE' || tmv3_clean_(after.blocker)) {
    throw new Error('Canary read-back did not converge to NO_CHANGE; fresh plan is ' + after.plan + '.');
  }
  result.status = 'CANARY_VERIFIED_NO_CHANGE';
  result.readbackPlan = after;
  tmv3_audit_(wantedVertical, wantedEventId, wantedTaskId, 'STEP7_CANARY', 'PASS', wantedPlan);
  return result;
}

function tmv3_previewSelectedAction() {
  const bundle = tmv3_freshSelectedResolution_();
  const preview = tmv3_previewTaskMutation_(bundle.eventRecord, bundle.resolved, bundle.refs);
  const output = {
    mode: 'READ_ONLY',
    vertical: bundle.eventRecord.vertical,
    eventId: bundle.eventRecord.eventId,
    status: bundle.resolved.status,
    dataChecklist: bundle.resolved.dataChecklist,
    issue: bundle.resolved.issue,
    nextAction: bundle.resolved.nextAction,
    mutationPreview: preview,
    manualWritesEnabled: tmv3_operationWritesEnabled_('MANUAL'),
    automationWritesEnabled: tmv3_operationWritesEnabled_('AUTO')
  };
  Logger.log(JSON.stringify(output, null, 2));
  return output;
}

function tmv3_syncSelectedAppointment() {
  const bundle = tmv3_freshSelectedResolution_();
  const status = tmv3_clean_(bundle.resolved.status).toUpperCase();
  const result =
    status === 'READY CREATE' || status === 'READY RECREATE'
      ? tmv3_createOrRecreateFromBundle_(bundle, 'MANUAL')
      : tmv3_executeExistingTaskSync_(bundle, 'MANUAL', 'ALL');
  tmv3_refreshOperatorAfterManual_();
  return result;
}

function tmv3_pushSelectedDates() {
  const bundle = tmv3_freshSelectedResolution_();
  const result = tmv3_executeExistingTaskSync_(bundle, 'MANUAL', 'DATES');
  tmv3_refreshOperatorAfterManual_();
  return result;
}

function tmv3_pushSelectedRelationships() {
  const bundle = tmv3_freshSelectedResolution_();
  const result = tmv3_executeExistingTaskSync_(bundle, 'MANUAL', 'RELATIONSHIPS');
  tmv3_refreshOperatorAfterManual_();
  return result;
}

function tmv3_reconcileSelectedAssignee() {
  const bundle = tmv3_freshSelectedResolution_();
  const result = tmv3_executeExistingTaskSync_(bundle, 'MANUAL', 'ASSIGNEE');
  tmv3_refreshOperatorAfterManual_();
  return result;
}

function tmv3_fixSelectedCalendarLinks() {
  const bundle = tmv3_freshSelectedResolution_();
  const result = tmv3_executeExistingTaskSync_(bundle, 'MANUAL', 'LINKS');
  tmv3_refreshOperatorAfterManual_();
  return result;
}

function tmv3_createOrRecreateSelectedTask() {
  const bundle = tmv3_freshSelectedResolution_();
  const result = tmv3_createOrRecreateFromBundle_(bundle, 'MANUAL');
  tmv3_refreshOperatorAfterManual_();
  return result;
}

function tmv3_pushSelectedPreInspectionInstallNotes() {
  const bundle = tmv3_freshSelectedResolution_();
  const result = tmv3_executeExistingTaskSync_(bundle, 'MANUAL', 'FIELD854');
  tmv3_refreshOperatorAfterManual_();
  return result;
}

function tmv3_runSafeReadyRows_(scope) {
  const policy = tmv3_operationPolicy_();
  const maxWrites = Number(policy.autoMaxWritesPerRun || 10);
  const isAuto = tmv3_norm_(scope) === 'auto';

  if (isAuto && !tmv3_operationWritesEnabled_('AUTO')) {
    tmv3_audit_('SYSTEM','','','AUTO_WRITE_CYCLE','GATED','Scheduled external writes remain disabled.');
    return { status: 'AUTO_WRITES_GATED', writes: 0 };
  }

  tmv3_assertOperationWrite_(scope);
  const events = tmv3_calendarRecords_();
  const refs = tmv3_referenceIndex_();
  const state = tmv3_eventStateIndex_();
  const results = [];

  for (let i = 0; i < events.length && results.length < maxWrites; i++) {
    const eventRecord = events[i];
    const records = tmv3_resolveEventRecords_(eventRecord, refs, state);

    for (let j = 0; j < records.length && results.length < maxWrites; j++) {
      const resolved = records[j];
      const status = tmv3_clean_(resolved.status).toUpperCase();
      if (['READY','READY CREATE','READY RECREATE'].indexOf(status) === -1) continue;

      const bundle = {
        context: null,
        eventRecord: eventRecord,
        refs: refs,
        state: state,
        records: records,
        resolved: resolved
      };

      try {
        const one =
          status === 'READY CREATE' || status === 'READY RECREATE'
            ? tmv3_createOrRecreateFromBundle_(bundle, scope)
            : tmv3_executeExistingTaskSync_(bundle, scope, 'ALL');
        results.push({
          vertical: eventRecord.vertical,
          eventId: eventRecord.eventId,
          taskId: one.taskId || resolved.taskId || '',
          status: 'PASS'
        });
      } catch (err) {
        tmv3_audit_(
          eventRecord.vertical,
          eventRecord.eventId,
          resolved.taskId || '',
          'SAFE_READY_ROW',
          'ATTENTION',
          String(err && err.message || err)
        );
        results.push({
          vertical: eventRecord.vertical,
          eventId: eventRecord.eventId,
          taskId: resolved.taskId || '',
          status: 'ATTENTION',
          error: String(err && err.message || err)
        });
      }
    }
  }

  tmv3_shadowMapFromCache();

  return {
    status: 'COMPLETE',
    scope: scope,
    writes: results.filter(function(item) { return item.status === 'PASS'; }).length,
    attempts: results.length,
    results: results
  };
}

function tmv3_runSafeReadyRows_MANUAL() {
  return tmv3_runSafeReadyRows_('MANUAL');
}

function tmv3_runSafeReadyRows_AUTO() {
  return tmv3_runSafeReadyRows_('AUTO');
}

function tmv3_emailListFromEvent_(eventRecord) {
  const source = [
    eventRecord.organizer,
    eventRecord.guests,
    tmv3_stripAuthoredCalendarNotes_(eventRecord.description)
  ].join(' ');

  return tmv3_unique_(
    tmv3_extractEmails_(source)
      .filter(function(email) { return !!email; })
  );
}

function tmv3_businessDaysUntil_(date) {
  const target = new Date(date);
  if (isNaN(target.getTime())) return null;
  target.setHours(0,0,0,0);

  const today = new Date();
  today.setHours(0,0,0,0);
  if (target < today) return -1;

  let count = 0;
  const cursor = new Date(today);
  while (cursor < target && count <= 10) {
    cursor.setDate(cursor.getDate() + 1);
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) count++;
  }
  return count;
}

function tmv3_installReminderAlreadySentToday_(eventId) {
  const key = 'TMV3_INSTALL_SO_REMINDER_' + tmv3_hash_([
    eventId,
    tmv3_date_(new Date())
  ].join('|'));
  return PropertiesService.getScriptProperties().getProperty(key) || '';
}

function tmv3_markInstallReminderSent_(eventId) {
  const key = 'TMV3_INSTALL_SO_REMINDER_' + tmv3_hash_([
    eventId,
    tmv3_date_(new Date())
  ].join('|'));
  PropertiesService.getScriptProperties().setProperty(key, tmv3_iso_(new Date()));
}

function tmv3_sendInstallMissingSoReminders_(scope) {
  const policy = tmv3_operationPolicy_();
  if (policy.installRemindersEnabled !== true) {
    return { status: 'REMINDERS_GATED', checked: 0, sent: 0 };
  }

  const today = new Date();
  if (today.getDay() === 0 || today.getDay() === 6) {
    return { status: 'WEEKEND', checked: 0, sent: 0 };
  }

  const cfg = TMV3.VERTICALS.Install;
  const cal = CalendarApp.getCalendarById(cfg.calendarIds[0]);
  if (!cal) throw new Error('Install Calendar is unavailable.');

  const start = new Date();
  start.setHours(0,0,0,0);
  const end = new Date();
  end.setDate(end.getDate() + 7);
  end.setHours(23,59,59,999);

  let checked = 0;
  let sent = 0;
  let skipped = 0;
  let errors = 0;

  cal.getEvents(start, end).forEach(function(event) {
    const record = tmv3_calendarEvent_(
      'Install',
      cfg,
      { calendarId: cfg.calendarIds[0] },
      event
    );
    if (!record) return;
    checked++;

    if (record.orderNumber || record.existingOrderId) {
      skipped++;
      return;
    }

    const businessDays = tmv3_businessDaysUntil_(record.start);
    if (businessDays === null || businessDays < 0 || businessDays > 3) {
      skipped++;
      return;
    }

    if (tmv3_installReminderAlreadySentToday_(record.eventId)) {
      skipped++;
      return;
    }

    const recipients = tmv3_emailListFromEvent_(record);
    if (!recipients.length) {
      skipped++;
      tmv3_audit_('Install',record.eventId,'','MISSING_SO_REMINDER','ATTENTION','No valid recipient found.');
      return;
    }

    const when = tmv3_date_(record.start) + ' ' + tmv3_time_(record.start) +
      '–' + tmv3_time_(record.end);
    const subject = 'ACTION REQUIRED: Sales Order # missing from install event';
    const textBody =
      'ACTION REQUIRED\n\n' +
      'The install calendar event below is missing the Sales Order #.\n\n' +
      'Event: ' + (record.title || '(no title)') + '\n' +
      'When: ' + when + '\n' +
      'Where: ' + (record.location || 'n/a') + '\n\n' +
      'Next step: Add the correct Sales Order # to the Calendar Event.';

    try {
      MailApp.sendEmail({
        to: recipients.join(','),
        subject: subject,
        body: textBody
      });
      tmv3_markInstallReminderSent_(record.eventId);
      sent++;
      tmv3_audit_('Install',record.eventId,'','MISSING_SO_REMINDER','PASS','Sent to ' + recipients.join(','));
    } catch (err) {
      errors++;
      tmv3_audit_('Install',record.eventId,'','MISSING_SO_REMINDER','ATTENTION',String(err && err.message || err));
    }
  });

  return {
    status: errors ? 'COMPLETE_WITH_ERRORS' : 'COMPLETE',
    scope: scope,
    checked: checked,
    sent: sent,
    skipped: skipped,
    errors: errors
  };
}

function tmv3_sendInstallMissingSoRemindersNow() {
  return tmv3_sendInstallMissingSoReminders_('MANUAL');
}

function tmv3_runCalendarLinksForReady_AUTO() {
  if (!tmv3_operationWritesEnabled_('AUTO')) {
    tmv3_audit_('SYSTEM','','','AUTO_CALENDAR_LINK_CYCLE','GATED','Scheduled Calendar writes remain disabled.');
    return { status: 'AUTO_WRITES_GATED', writes: 0 };
  }

  const events = tmv3_calendarRecords_();
  const refs = tmv3_referenceIndex_();
  const state = tmv3_eventStateIndex_();
  const results = [];
  const limit = Number((tmv3_operationPolicy_().autoMaxWritesPerRun) || 10);

  for (let i = 0; i < events.length && results.length < limit; i++) {
    const eventRecord = events[i];
    const records = tmv3_resolveEventRecords_(eventRecord, refs, state);
    if (!records.length) continue;

    const eligible = records.every(function(record) {
      const status = tmv3_clean_(record.status).toUpperCase();
      return !!record.taskId && ['MATCHED','READY'].indexOf(status) !== -1;
    });
    if (!eligible) continue;

    const needsLink = records.some(function(record) {
      return /Calendar (?:Task |Sales Orders page )?link missing|LINKS\s*[△✕]/i.test(
        tmv3_clean_(record.issue) + ' ' + tmv3_clean_(record.verification)
      );
    });
    if (!needsLink) continue;

    try {
      const bundle = {
        eventRecord: eventRecord,
        records: records,
        resolved: records[0],
        refs: refs,
        state: state
      };
      const write = tmv3_operationWriteCalendarLinks_(bundle, 'AUTO');
      results.push({ eventId: eventRecord.eventId, vertical: eventRecord.vertical, status: write.status });
    } catch (err) {
      tmv3_audit_(eventRecord.vertical,eventRecord.eventId,'','AUTO_CALENDAR_LINK','ATTENTION',String(err && err.message || err));
      results.push({ eventId: eventRecord.eventId, vertical: eventRecord.vertical, status: 'ATTENTION', error: String(err && err.message || err) });
    }
  }

  return { status: 'COMPLETE', writes: results.length, results: results };
}

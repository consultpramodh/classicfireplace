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
  tmv3_assertHardRules_();

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

function tmv3_step7PublishedPlan_(vertical, eventId, taskId) {
  const rows = tmv3_rows_(TMV3.SHEETS.RECONCILE);
  const wantedTaskId = Number(taskId || 0);
  const matches = rows.filter(function(row) {
    if (
      tmv3_clean_(row['Vertical']) !== tmv3_clean_(vertical) ||
      tmv3_clean_(row['Event ID']) !== tmv3_clean_(eventId)
    ) return false;

    const rowTaskId = Number(row['Task ID'] || 0);
    return wantedTaskId ? rowTaskId === wantedTaskId : rowTaskId === 0;
  });

  return matches.length === 1
    ? tmv3_clean_(matches[0]['Relationship Plan'])
    : '';
}

function tmv3_step7FreshSelectedContract_() {
  const context = tmv3_selectedContext_();
  const taskId = Number(tmv3_taskIdHintFromText_(context.taskHint) || 0);
  const previousPlan = tmv3_step7PublishedPlan_(
    context.vertical,
    context.eventId,
    taskId
  );
  const contract = tmv3_step7FreshExecutionContract_(
    context.vertical,
    context.eventId,
    taskId
  );

  return {
    context:context,
    previousPlan:previousPlan,
    contract:contract
  };
}

function tmv3_step7PlanChangedResult_(selection) {
  const previous = tmv3_clean_(
    selection && selection.previousPlan
  );
  const fresh = tmv3_clean_(
    selection &&
    selection.contract &&
    selection.contract.plan
  );

  if (!previous) {
    return {
      status:'PLAN_CHANGED_NO_WRITE',
      previousPlan:'',
      freshPlan:fresh,
      reason:
        'No previously published Step 7 plan exists for this exact Event/Task row. ' +
        'Refresh V3 before execution.',
      vertical:selection.contract.vertical,
      eventId:selection.contract.eventId,
      taskId:selection.contract.taskId || ''
    };
  }

  if (previous === fresh) return null;

  return {
    status:'PLAN_CHANGED_NO_WRITE',
    previousPlan:previous,
    freshPlan:fresh,
    reason:
      'The canonical Step 7 plan changed after the operator view was published. ' +
      'Refresh and review the new plan before execution.',
    vertical:selection.contract.vertical,
    eventId:selection.contract.eventId,
    taskId:selection.contract.taskId || ''
  };
}

function tmv3_step7BundleFromContract_(contract) {
  contract = tmv3_step7ValidateExecutionContract_(contract);
  const eventRecord = tmv3_findFreshEventRecord_(
    contract.vertical,
    contract.eventId
  );

  if (
    contract.calendarId &&
    tmv3_clean_(eventRecord.calendarId) !==
      tmv3_clean_(contract.calendarId)
  ) {
    throw new Error(
      'PLAN_CHANGED_NO_WRITE: Calendar ID changed after Step 7 planning.'
    );
  }

  if (
    contract.inputFingerprint &&
    tmv3_clean_(eventRecord.fingerprint) !==
      tmv3_clean_(contract.inputFingerprint)
  ) {
    throw new Error(
      'PLAN_CHANGED_NO_WRITE: Calendar event changed after Step 7 planning.'
    );
  }

  const resolved = {
    taskId:Number(contract.taskId || 0) || '',
    task:contract.taskId ? String(contract.taskId) : '',
    customerId:tmv3_clean_(contract.expectedCustomerId),
    locationId:tmv3_clean_(contract.expectedLocationId),
    contactId:
      tmv3_norm_(contract.expectedRequestedByType) === 'contact'
        ? tmv3_clean_(contract.expectedRequestedById)
        : '',
    orderId:tmv3_clean_(contract.expectedOrderId),
    status:contract.taskId
      ? 'READY'
      : (
          contract.actions.indexOf(TMV3_STEP7_ACTION.RECREATE_TASK) !== -1
            ? 'READY RECREATE'
            : 'READY CREATE'
        )
  };

  return {
    context:null,
    eventRecord:eventRecord,
    refs:tmv3_referenceIndex_(),
    state:tmv3_eventStateIndex_(),
    records:[resolved],
    resolved:resolved,
    contract:contract
  };
}

function tmv3_step7FreshLocationOwnership_(contract) {
  const locationId = tmv3_clean_(
    contract.expectedLocationId
  );
  const customerId = tmv3_clean_(
    contract.expectedCustomerId
  );

  if (!locationId) return { status:'N/A' };

  // The Customer-number map is also freshly read from Striven so a stale
  // Source Customers sheet cannot manufacture Location ownership.
  const customerNumberToId = {};

  tmv3_reportRows_(TMV3.PROPERTIES.CUSTOMERS)
    .map(tmv3_normalizeCustomer_)
    .forEach(function(row) {
      const number = tmv3_clean_(row[1]);
      const id = tmv3_clean_(row[0]);
      if (number && id) customerNumberToId[number] = id;
    });

  const matches = tmv3_reportRows_(
    TMV3.PROPERTIES.LOCATIONS
  )
    .map(function(row) {
      return tmv3_normalizeLocation_(
        row,
        customerNumberToId
      );
    })
    .filter(function(row) {
      return tmv3_clean_(row[0]) === locationId;
    });

  if (matches.length !== 1) {
    throw new Error(
      'Fresh Location ownership verification expected one Location ' +
      locationId + '; found ' + matches.length + '.'
    );
  }

  if (tmv3_clean_(matches[0][1]) !== customerId) {
    throw new Error(
      'Fresh Location ownership mismatch: Location ' +
      locationId + ' does not belong to Customer ' +
      customerId + '.'
    );
  }

  return {
    status:'VERIFIED',
    locationId:locationId,
    customerId:customerId
  };
}

function tmv3_step7FreshOrderOwnership_(contract) {
  const orderId = tmv3_clean_(contract.expectedOrderId);
  const customerId = tmv3_clean_(contract.expectedCustomerId);
  if (!orderId || contract.vertical === 'PreInspection') {
    return { status:'N/A' };
  }

  let rows = [];
  if (contract.vertical === 'Service') {
    rows = tmv3_reportRows_(TMV3.PROPERTIES.SERVICE_WORK_ORDERS)
      .map(function(row) {
        return tmv3_normalizeOrder_(row, 'WORK_ORDER');
      });
  } else if (contract.vertical === 'Delivery') {
    rows = tmv3_reportRows_(TMV3.PROPERTIES.APPROVED_ORDERS)
      .map(function(row) {
        return tmv3_normalizeOrder_(row, 'SALES_ORDER');
      })
      .concat(
        tmv3_reportRows_(TMV3.PROPERTIES.DELIVERY_APPROVED_ORDERS)
          .map(function(row) {
            return tmv3_normalizeOrder_(row, 'DELIVERY_APPROVED');
          })
      );
  } else {
    rows = tmv3_reportRows_(TMV3.PROPERTIES.APPROVED_ORDERS)
      .map(function(row) {
        return tmv3_normalizeOrder_(row, 'SALES_ORDER');
      });
  }

  const matches = rows.filter(function(row) {
    return tmv3_clean_(row[0]) === orderId;
  });

  if (!matches.length) {
    throw new Error(
      'Fresh Order / Work Order ownership verification could not find ID ' +
      orderId + '.'
    );
  }

  if (!matches.some(function(row) {
    return tmv3_clean_(row[2]) === customerId;
  })) {
    throw new Error(
      'Fresh Order / Work Order ownership mismatch for ID ' +
      orderId + ' and Customer ' + customerId + '.'
    );
  }

  return {
    status:'VERIFIED',
    orderId:orderId,
    customerId:customerId
  };
}

function tmv3_step7FreshCriticalOwnership_(contract, eventRecord) {
  contract = tmv3_step7ValidateExecutionContract_(contract);

  if (!tmv3_clean_(contract.expectedCustomerId)) {
    throw new Error(
      'Step 7 contract is missing the resolved Customer ID.'
    );
  }

  let task = null;
  if (contract.taskId) {
    const raw = tmv3_rawTaskById_(contract.taskId);
    task = tmv3_normalizeV2TaskModel_(raw || {});

    if (!tmv3_taskIsOpen_(task['Status'])) {
      throw new Error('Fresh Task state is no longer OPEN.');
    }

    if (
      tmv3_clean_(task['Customer ID']) !==
      tmv3_clean_(contract.expectedCustomerId)
    ) {
      throw new Error(
        'Fresh Task Customer no longer matches the canonical Step 7 Customer.'
      );
    }
  } else {
    const customers = tmv3_reportRows_(TMV3.PROPERTIES.CUSTOMERS)
      .map(tmv3_normalizeCustomer_)
      .filter(function(row) {
        return tmv3_clean_(row[0]) ===
          tmv3_clean_(contract.expectedCustomerId);
      });

    if (customers.length !== 1) {
      throw new Error(
        'Fresh Customer existence verification expected one Customer ' +
        contract.expectedCustomerId + '; found ' +
        customers.length + '.'
      );
    }
  }

  const location = tmv3_step7FreshLocationOwnership_(contract);
  const order = tmv3_step7FreshOrderOwnership_(contract);

  let requestedBy = { status:'N/A' };

  if (tmv3_norm_(contract.expectedRequestedByType) === 'contact') {
    const contact = tmv3_getContactById_(
      contract.expectedRequestedById,
      contract.expectedCustomerId
    );

    if (!contact.__ownershipVerified) {
      throw new Error(
        'Fresh Requested By Contact ownership could not be proven for Customer ' +
        contract.expectedCustomerId + '.'
      );
    }

    requestedBy = {
      status:'VERIFIED',
      type:'contact',
      id:contract.expectedRequestedById
    };
  } else if (
    contract.vertical === 'PreInspection' &&
    tmv3_norm_(contract.expectedRequestedByType) === 'employee'
  ) {
    const organizer = tmv3_resolveOrganizerEmployee_(eventRecord);

    if (
      !organizer ||
      organizer.status !== 'MATCHED' ||
      Number(organizer.employee && organizer.employee.id || 0) !==
        Number(contract.expectedRequestedById || 0)
    ) {
      throw new Error(
        'Fresh PreInspection organizer Employee no longer matches ' +
        'the canonical Requested By.'
      );
    }

    requestedBy = {
      status:'VERIFIED',
      type:'employee',
      id:contract.expectedRequestedById
    };
  }

  return {
    task:task,
    location:location,
    order:order,
    requestedBy:requestedBy
  };
}

function tmv3_step7DatePayload_(contract) {
  return {
    Id:Number(contract.taskId),
    StartDateTime:tmv3_strivenTaskDateTime_(
      new Date(contract.expectedStart)
    ),
    DueDateTime:tmv3_strivenTaskDateTime_(
      new Date(contract.expectedDue)
    )
  };
}

function tmv3_step7RelationshipPayload_(contract) {
  const payload = { Id:Number(contract.taskId) };
  const actions = contract.actions || [];

  if (actions.indexOf(TMV3_STEP7_ACTION.PATCH_LOCATION) !== -1) {
    payload.Location = { Id:Number(contract.expectedLocationId) };
  }

  if (actions.indexOf(TMV3_STEP7_ACTION.PATCH_ORDER) !== -1) {
    payload.SalesOrder = { Id:Number(contract.expectedOrderId) };
  }

  if (
    actions.indexOf(TMV3_STEP7_ACTION.PATCH_REQUESTED_BY) !== -1
  ) {
    payload.RequestedBy = {
      Id:Number(contract.expectedRequestedById),
      Type:tmv3_clean_(contract.expectedRequestedByType)
    };
  }

  return payload;
}

function tmv3_step7DesiredAssignmentFromContract_(contract) {
  return {
    employeeIds:
      (contract.desiredAssignmentEmployeeIds || []).map(Number),
    poolIds:
      (contract.desiredAssignmentPoolIds || []).map(Number)
  };
}

function tmv3_step7ActionsForMode_(contract, mode) {
  const actions = (contract.actions || []).slice();
  const map = {
    DATES:[TMV3_STEP7_ACTION.PATCH_DATES],
    RELATIONSHIPS:[
      TMV3_STEP7_ACTION.CREATE_LOCATION,
      TMV3_STEP7_ACTION.PATCH_LOCATION,
      TMV3_STEP7_ACTION.PATCH_ORDER,
      TMV3_STEP7_ACTION.PATCH_REQUESTED_BY
    ],
    ASSIGNEE:[TMV3_STEP7_ACTION.PATCH_ASSIGNMENTS],
    LINKS:[TMV3_STEP7_ACTION.VERIFY_CALENDAR_LINKS],
    TITLE:[
      TMV3_STEP7_ACTION.PATCH_CALENDAR_TITLE,
      TMV3_STEP7_ACTION.PATCH_TASK_NAME
    ]
  };

  if (mode === 'ALL') return actions;

  const allowed = map[mode];
  if (!allowed) {
    throw new Error(
      'Unsupported Step 7 execution mode: ' + mode + '.'
    );
  }

  return actions.filter(function(action) {
    return allowed.indexOf(action) !== -1;
  });
}

function tmv3_executeFreshStep7Selection_(selection, scope, mode) {
  const changed = tmv3_step7PlanChangedResult_(selection);
  if (changed) {
    tmv3_audit_(
      changed.vertical || 'SYSTEM',
      changed.eventId || '',
      changed.taskId || '',
      'STEP7_PLAN_GUARD',
      'NO_WRITE',
      JSON.stringify(changed)
    );
    return changed;
  }

  let contract = tmv3_step7ValidateExecutionContract_(
    selection.contract
  );

  if (tmv3_clean_(contract.blocker)) {
    return {
      status:'BLOCKED_NO_WRITE',
      blocker:contract.blocker,
      vertical:contract.vertical,
      eventId:contract.eventId,
      taskId:contract.taskId || '',
      plan:contract.plan
    };
  }

  let bundle = tmv3_step7BundleFromContract_(contract);

  if (
    TMV3.MODE === 'CANARY_WRITE' &&
    !tmv3_canaryWriteEventAllowed_(bundle.eventRecord)
  ) {
    throw new Error(
      'CANARY_WRITE blocked: this Step 7 contract is not the authorized canary event.'
    );
  }

  tmv3_step7FreshCriticalOwnership_(
    contract,
    bundle.eventRecord
  );

  const requestedActions = tmv3_step7ActionsForMode_(
    contract,
    mode || 'ALL'
  );

  if (
    requestedActions.indexOf(TMV3_STEP7_ACTION.CREATE_LOCATION) !== -1
  ) {
    const locationResult = tmv3_ensureStep7Location_(
      bundle,
      scope,
      contract
    );

    bundle = locationResult.bundle;
    contract = locationResult.contract;

    tmv3_step7FreshCriticalOwnership_(
      contract,
      bundle.eventRecord
    );
  }

  const createAction =
    contract.actions.indexOf(TMV3_STEP7_ACTION.CREATE_TASK) !== -1 ||
    contract.actions.indexOf(TMV3_STEP7_ACTION.RECREATE_TASK) !== -1;

  return createAction
    ? tmv3_createOrRecreateFromBundle_(
        bundle,
        scope,
        contract
      )
    : tmv3_executeExistingTaskSync_(
        bundle,
        scope,
        mode || 'ALL',
        contract
      );
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

  const desired = options.desiredAssignment || tmv3_desiredAssignment_(eventRecord);
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

  // Legacy parity: Install / Delivery / Service employee assignment
  // writes are additive. Preserve existing employee assignments.
  // Delivery / Service remove only Pool 4 (To Be Assigned), and only
  // after the intended employee has been established above.

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


/************************************************************
 * TM V3 — TITLE NORMALIZATION WRITE PRIMITIVES
 *
 * These helpers are deliberately narrow:
 * - Calendar mutation: title plus exact legacy-title prepend only.
 * - Task mutation: Title field only.
 * - No generic description cleanup is called.
 * - No caller is authorized unless the canonical Step 7 contract
 *   explicitly exposes the corresponding title action.
 ************************************************************/

function tmv3_titleDescriptionPlan_(currentTitle, desiredTitle, rawDescription, options) {
  options = options || {};
  const oldTitle = tmv3_clean_(currentTitle);
  const newTitle = tmv3_clean_(desiredTitle);
  const before = String(rawDescription === undefined || rawDescription === null ? '' : rawDescription);

  if (!oldTitle) {
    return {
      status:'BLOCKED',
      reason:'Current Calendar title is blank; legacy title cannot be preserved.',
      currentTitle:oldTitle,
      desiredTitle:newTitle,
      before:before,
      after:before,
      titleChange:false,
      descriptionChange:false,
      alreadyPreserved:false
    };
  }

  if (!newTitle) {
    return {
      status:'BLOCKED',
      reason:'Desired Calendar title is blank.',
      currentTitle:oldTitle,
      desiredTitle:newTitle,
      before:before,
      after:before,
      titleChange:false,
      descriptionChange:false,
      alreadyPreserved:false
    };
  }

  if (oldTitle === newTitle) {
    return {
      status:'NO_CHANGE',
      reason:'',
      currentTitle:oldTitle,
      desiredTitle:newTitle,
      before:before,
      after:before,
      titleChange:false,
      descriptionChange:false,
      alreadyPreserved:false
    };
  }

  const preserveOldTitle = options.preserveOldTitle !== false;
  const prefix = oldTitle + '\n\n';
  const alreadyPreserved =
    preserveOldTitle &&
    (
      before === oldTitle ||
      before.indexOf(prefix) === 0
    );
  const after =
    !preserveOldTitle
      ? before
      : (
          alreadyPreserved
            ? before
            : (
                before
                  ? prefix + before
                  : oldTitle
              )
        );

  return {
    status:'READY',
    reason:'',
    currentTitle:oldTitle,
    desiredTitle:newTitle,
    before:before,
    after:after,
    titleChange:true,
    descriptionChange:after !== before,
    alreadyPreserved:alreadyPreserved
  };
}

function tmv3_assertTitleNormalizationWriteAuthorized_(contract, action, scope) {
  tmv3_assertOperationWrite_(scope);
  tmv3_step7ValidateExecutionContract_(contract);

  if (tmv3_clean_(contract.blocker)) {
    throw new Error(
      'Title normalization blocked by Step 7: ' +
      contract.blocker
    );
  }

  if ((contract.actions || []).indexOf(action) === -1) {
    throw new Error(
      'Step 7 did not authorize title action ' + action + '.'
    );
  }

  if (
    action === 'PATCH_TASK_NAME' &&
    !tmv3_taskNameNormalizationStatusAllowed_(contract.taskStatus)
  ) {
    throw new Error(
      'Task Name normalization is authorized only for the canonical OPEN Task.'
    );
  }
}

function tmv3_titleNormalizationCalendarIds_(eventRecord) {
  return tmv3_requiredCalendarCopiesForEvent_(
    eventRecord || {}
  );
}

function tmv3_titleMissingRequiredCalendarIds_(requiredIds, copies) {
  const found = {};
  (copies || []).forEach(function(copy) {
    const id = tmv3_clean_(copy && copy.calendarId);
    if (id) found[id] = true;
  });

  return (requiredIds || []).map(tmv3_clean_).filter(function(id) {
    return id && !found[id];
  });
}

function tmv3_titleCalendarProtectedSnapshot_(event) {
  const guestEmails = [];
  const creatorEmails = [];

  try {
    (event.getGuestList ? event.getGuestList(true) : []).forEach(function(guest) {
      const email = tmv3_normEmail_(guest && guest.getEmail ? guest.getEmail() : '');
      if (email) guestEmails.push(email);
    });
  } catch (ignored) {}

  try {
    (event.getCreators ? event.getCreators() : []).forEach(function(email) {
      const clean = tmv3_normEmail_(email);
      if (clean) creatorEmails.push(clean);
    });
  } catch (ignored) {}

  return {
    start:event && event.getStartTime ? event.getStartTime().getTime() : null,
    end:event && event.getEndTime ? event.getEndTime().getTime() : null,
    allDay:event && event.isAllDayEvent ? event.isAllDayEvent() === true : null,
    location:String(event && event.getLocation ? event.getLocation() || '' : ''),
    guests:guestEmails.sort(),
    creators:creatorEmails.sort()
  };
}

function tmv3_titleTaskProtectedSnapshot_(task) {
  task = task || {};

  function sortedCsv(value) {
    return tmv3_clean_(value)
      .split(',')
      .map(tmv3_clean_)
      .filter(Boolean)
      .sort();
  }

  return {
    taskId:tmv3_clean_(task['Task ID']),
    taskNumber:tmv3_clean_(task['Task Number']),
    taskTypeId:tmv3_clean_(task['Task Type ID']),
    taskType:tmv3_clean_(task['Task Type']),
    status:tmv3_clean_(task['Status']),
    customerId:tmv3_clean_(task['Customer ID']),
    locationId:tmv3_clean_(task['Location ID']),
    contactId:tmv3_clean_(task['Contact ID']),
    orderId:tmv3_clean_(task['Order ID']),
    start:tmv3_clean_(task['Start']),
    due:tmv3_clean_(task['Due']),
    assignees:sortedCsv(task['Assignees']),
    pools:sortedCsv(task['Pools'])
  };
}

function tmv3_assertTitleProtectedSnapshotUnchanged_(before, after, label) {
  const beforeJson = JSON.stringify(before || {});
  const afterJson = JSON.stringify(after || {});

  if (beforeJson !== afterJson) {
    throw new Error(
      label + ' unrelated-field read-back mismatch. Before=' +
      beforeJson + ' After=' + afterJson
    );
  }

  return true;
}

function tmv3_operationNormalizeCalendarTitle_(bundle, contract, scope) {
  tmv3_assertTitleNormalizationWriteAuthorized_(
    contract,
    'PATCH_CALENDAR_TITLE',
    scope
  );

  const eventRecord = bundle && bundle.eventRecord;
  if (!eventRecord) throw new Error('Calendar title normalization requires an Event record.');

  const desired = tmv3_clean_(contract.desiredCalendarTitle);
  if (!desired) throw new Error('Step 7 contract has no desired Calendar title.');

  const ids = tmv3_titleNormalizationCalendarIds_(eventRecord);
  if (!ids.length) throw new Error('No Calendar ID is available for title normalization.');

  const copies = [];
  ids.forEach(function(calendarId) {
    const found = tmv3_findEventCopyRobust_(calendarId, contract.eventId);
    if (found && found.event) {
      copies.push({
        calendarId:calendarId,
        event:found.event,
        protectedBefore:tmv3_titleCalendarProtectedSnapshot_(found.event),
        beforeTitle:String(found.event.getTitle() || ''),
        beforeDescription:String(found.event.getDescription() || '')
      });
    }
  });

  const missing = tmv3_titleMissingRequiredCalendarIds_(ids, copies);
  if (missing.length) {
    throw new Error(
      'Required Calendar event copy/copies were not found: ' +
      missing.join(', ') +
      '. No Calendar title write was performed.'
    );
  }

  let authoritativePreInspectionPlan = null;
  if (eventRecord.vertical === 'PreInspection') {
    const cfg = TMV3.VERTICALS.PreInspection || {};
    const primaryId = tmv3_clean_(cfg.primaryCalendarId);
    const authoritativeCopy = copies.filter(function(copy) {
      return tmv3_clean_(copy.calendarId) === primaryId;
    })[0];

    if (!authoritativeCopy) {
      throw new Error(
        'Authoritative CF Preinspects copy is required before title normalization.'
      );
    }

    authoritativePreInspectionPlan = tmv3_titleDescriptionPlan_(
      authoritativeCopy.beforeTitle,
      desired,
      authoritativeCopy.beforeDescription,
      { preserveOldTitle:true }
    );

    if (authoritativePreInspectionPlan.status === 'BLOCKED') {
      throw new Error(
        'Authoritative Calendar title preflight blocked: ' +
        authoritativePreInspectionPlan.reason
      );
    }
  }

  copies.forEach(function(copy) {
    if (eventRecord.vertical === 'PreInspection') {
      copy.plan = {
        status:'READY',
        reason:'',
        currentTitle:copy.beforeTitle,
        desiredTitle:desired,
        before:copy.beforeDescription,
        after:authoritativePreInspectionPlan.after,
        titleChange:tmv3_clean_(copy.beforeTitle) !== desired,
        descriptionChange:
          copy.beforeDescription !== authoritativePreInspectionPlan.after,
        alreadyPreserved:
          copy.beforeDescription === authoritativePreInspectionPlan.after
      };
    } else {
      copy.plan = tmv3_titleDescriptionPlan_(
        copy.beforeTitle,
        desired,
        copy.beforeDescription,
        { preserveOldTitle:true }
      );
    }

    if (copy.plan.status === 'BLOCKED') {
      throw new Error(
        'Calendar title preflight blocked on ' +
        copy.calendarId + ': ' +
        copy.plan.reason
      );
    }
  });

  const results = [];

  copies.forEach(function(copy) {
    const plan = copy.plan;

    if (plan.descriptionChange) {
      copy.event.setDescription(plan.after);
    }

    if (plan.titleChange) {
      copy.event.setTitle(desired);
    }

    const readbackFound = tmv3_findEventCopyRobust_(
      copy.calendarId,
      contract.eventId
    );
    if (!readbackFound || !readbackFound.event) {
      throw new Error('Calendar event disappeared during title read-back.');
    }

    const afterTitle = String(readbackFound.event.getTitle() || '');
    const afterDescription = String(readbackFound.event.getDescription() || '');
    const protectedAfter =
      tmv3_titleCalendarProtectedSnapshot_(readbackFound.event);

    if (tmv3_clean_(afterTitle) !== desired) {
      throw new Error(
        'Calendar title read-back mismatch on ' + copy.calendarId + '.'
      );
    }

    if (afterDescription !== plan.after) {
      throw new Error(
        'Calendar description preservation read-back mismatch on ' +
        copy.calendarId + '.'
      );
    }

    tmv3_assertTitleProtectedSnapshotUnchanged_(
      copy.protectedBefore,
      protectedAfter,
      'Calendar ' + copy.calendarId
    );

    if (plan.titleChange || plan.descriptionChange) {
      tmv3_recordTitleMigrationState_(
        eventRecord.vertical,
        contract.eventId,
        copy.calendarId,
        plan.currentTitle,
        desired
      );
    }

    results.push({
      calendarId:copy.calendarId,
      status:
        !plan.titleChange && !plan.descriptionChange
          ? 'ALREADY_CORRECT'
          : 'WRITTEN_AND_VERIFIED',
      writePerformed:plan.titleChange || plan.descriptionChange,
      oldTitle:plan.currentTitle,
      newTitle:desired,
      descriptionChanged:plan.descriptionChange,
      oldDescriptionLength:copy.beforeDescription.length,
      newDescriptionLength:afterDescription.length,
      oldDescriptionHash:tmv3_hash_(copy.beforeDescription),
      newDescriptionHash:tmv3_hash_(afterDescription),
      unrelatedFieldsVerified:true
    });
  });

  const parity =
    eventRecord.vertical === 'PreInspection'
      ? tmv3_reconcilePreInspectionCalendarParity_(
          eventRecord,
          scope
        )
      : null;

  return {
    status:'CALENDAR_TITLE_VERIFIED',
    vertical:eventRecord.vertical,
    eventId:contract.eventId,
    desiredCalendarTitle:desired,
    requiredCalendarIds:ids,
    copies:results,
    parity:parity
  };
}

function tmv3_operationNormalizeTaskName_(taskId, desiredTaskName, contract, scope) {
  tmv3_assertTitleNormalizationWriteAuthorized_(
    contract,
    'PATCH_TASK_NAME',
    scope
  );

  const id = Number(taskId || 0);
  const desired = tmv3_clean_(desiredTaskName);

  if (!id || !desired) {
    throw new Error('Task Name normalization requires Task ID and desired Task Name.');
  }

  const before = tmv3_getTaskById_(id);
  const beforeName = tmv3_clean_(before && before['Name']);
  const protectedBefore = tmv3_titleTaskProtectedSnapshot_(before);

  if (beforeName === desired) {
    return {
      status:'ALREADY_CORRECT',
      taskId:id,
      beforeName:beforeName,
      afterName:beforeName,
      unrelatedFieldsVerified:true
    };
  }

  const patch = tmv3_operationPatchTask_(
    id,
    { Title:desired },
    scope
  );

  const after = tmv3_getTaskById_(id);
  const afterName = tmv3_clean_(after && after['Name']);
  const protectedAfter = tmv3_titleTaskProtectedSnapshot_(after);

  if (afterName !== desired) {
    throw new Error('Task Name read-back mismatch for Task ' + id + '.');
  }

  tmv3_assertTitleProtectedSnapshotUnchanged_(
    protectedBefore,
    protectedAfter,
    'Task ' + id
  );

  return {
    status:'TASK_NAME_WRITTEN_AND_VERIFIED',
    taskId:id,
    beforeName:beforeName,
    afterName:afterName,
    patchStatus:patch && patch.status,
    unrelatedFieldsVerified:true
  };
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

function tmv3_ensurePreInspectionMirror_(eventRecord, scope) {
  if (
    !eventRecord ||
    eventRecord.vertical !== 'PreInspection'
  ) {
    return { status:'NOT_NEEDED', writePerformed:false };
  }

  tmv3_assertOperationWrite_(scope);

  const cfg = TMV3.VERTICALS.PreInspection || {};
  const primaryId = tmv3_clean_(cfg.primaryCalendarId);
  const stephenEmail = tmv3_normEmail_(
    cfg.secondaryOwnerEmail ||
    'stephen@classicfireplace.ca'
  );

  if (!primaryId || !stephenEmail) {
    throw new Error(
      'PreInspection primary Calendar or Stephen guest email is not configured.'
    );
  }

  const primaryCopy = tmv3_findEventCopyRobust_(
    primaryId,
    eventRecord.eventId
  );

  if (!primaryCopy || !primaryCopy.event) {
    throw new Error(
      'Authoritative CF Preinspects event could not be found for Event ' +
      eventRecord.eventId + '.'
    );
  }

  function guestEmails(event) {
    return (event.getGuestList ? event.getGuestList(true) : [])
      .map(function(guest) {
        return tmv3_normEmail_(
          guest && guest.getEmail ? guest.getEmail() : ''
        );
      })
      .filter(Boolean);
  }

  if (
    guestEmails(primaryCopy.event).indexOf(
      stephenEmail
    ) !== -1
  ) {
    return {
      status:'STEPHEN_ALREADY_PRESENT',
      writePerformed:false,
      primaryCalendarId:primaryId,
      stephenEmail:stephenEmail
    };
  }

  primaryCopy.event.addGuest(stephenEmail);

  const readback = tmv3_findEventCopyRobust_(
    primaryId,
    eventRecord.eventId
  );

  if (
    !readback ||
    !readback.event ||
    guestEmails(readback.event).indexOf(
      stephenEmail
    ) === -1
  ) {
    throw new Error(
      'PreInspection Stephen guest read-back failed for Event ' +
      eventRecord.eventId + '.'
    );
  }

  return {
    status:'STEPHEN_GUEST_WRITTEN_AND_VERIFIED',
    writePerformed:true,
    primaryCalendarId:primaryId,
    stephenEmail:stephenEmail
  };
}


function tmv3_preInspectionCalendarBusinessSnapshot_(event) {
  if (!event) throw new Error('PreInspection Calendar snapshot requires an event.');

  const participants = {};
  try {
    (event.getCreators ? event.getCreators() : []).forEach(function(email) {
      const clean = tmv3_normEmail_(email);
      if (clean) participants[clean] = true;
    });
  } catch (ignored) {}
  try {
    (event.getGuestList ? event.getGuestList(true) : []).forEach(function(guest) {
      const clean = tmv3_normEmail_(
        guest && guest.getEmail ? guest.getEmail() : ''
      );
      if (clean) participants[clean] = true;
    });
  } catch (ignored) {}

  const stephen = tmv3_normEmail_(
    (TMV3.VERTICALS.PreInspection || {}).secondaryOwnerEmail ||
    'stephen@classicfireplace.ca'
  );

  return {
    title:String(event.getTitle ? event.getTitle() || '' : ''),
    description:String(event.getDescription ? event.getDescription() || '' : ''),
    location:String(event.getLocation ? event.getLocation() || '' : ''),
    start:event.getStartTime ? event.getStartTime().getTime() : null,
    end:event.getEndTime ? event.getEndTime().getTime() : null,
    allDay:event.isAllDayEvent ? event.isAllDayEvent() === true : false,
    requiredStephenPresent:!!participants[stephen]
  };
}

function tmv3_preInspectionCalendarParityEqual_(expected, actual) {
  expected = expected || {};
  actual = actual || {};
  return (
    expected.title === actual.title &&
    expected.description === actual.description &&
    expected.location === actual.location &&
    expected.start === actual.start &&
    expected.end === actual.end &&
    expected.allDay === actual.allDay &&
    expected.requiredStephenPresent === actual.requiredStephenPresent
  );
}

function tmv3_reconcilePreInspectionCalendarParity_(eventRecord, scope) {
  if (!eventRecord || eventRecord.vertical !== 'PreInspection') {
    return { status:'NOT_NEEDED', copies:[] };
  }

  tmv3_assertOperationWrite_(scope);

  const cfg = TMV3.VERTICALS.PreInspection || {};
  const primaryId = tmv3_clean_(cfg.primaryCalendarId);
  const ids = tmv3_requiredCalendarCopiesForEvent_(eventRecord);

  if (!primaryId || !ids.length) {
    throw new Error('PreInspection Calendar parity configuration is incomplete.');
  }

  const primaryFound = tmv3_findEventCopyRobust_(
    primaryId,
    eventRecord.eventId
  );
  if (!primaryFound || !primaryFound.event) {
    throw new Error(
      'Authoritative CF Preinspects copy is missing; parity cannot be reconciled.'
    );
  }

  const authority = tmv3_preInspectionCalendarBusinessSnapshot_(
    primaryFound.event
  );
  if (authority.allDay) {
    throw new Error(
      'PreInspection parity refuses to normalize an all-day authoritative event.'
    );
  }

  const results = [];

  ids.forEach(function(calendarId) {
    const found = tmv3_findEventCopyRobust_(
      calendarId,
      eventRecord.eventId
    );
    if (!found || !found.event) {
      throw new Error(
        'Required PreInspection Calendar copy is missing: ' + calendarId
      );
    }

    const event = found.event;
    let before = tmv3_preInspectionCalendarBusinessSnapshot_(event);
    let writePerformed = false;

    if (before.title !== authority.title) {
      event.setTitle(authority.title);
      writePerformed = true;
    }
    if (before.description !== authority.description) {
      event.setDescription(authority.description);
      writePerformed = true;
    }
    if (before.location !== authority.location) {
      event.setLocation(authority.location);
      writePerformed = true;
    }
    if (
      before.start !== authority.start ||
      before.end !== authority.end ||
      before.allDay !== authority.allDay
    ) {
      if (before.allDay || authority.allDay) {
        throw new Error(
          'PreInspection parity will not convert between all-day and timed events.'
        );
      }
      event.setTime(
        new Date(authority.start),
        new Date(authority.end)
      );
      writePerformed = true;
    }

    if (
      authority.requiredStephenPresent &&
      !before.requiredStephenPresent
    ) {
      event.addGuest(
        tmv3_normEmail_(
          cfg.secondaryOwnerEmail ||
          'stephen@classicfireplace.ca'
        )
      );
      writePerformed = true;
    }

    const readbackFound = tmv3_findEventCopyRobust_(
      calendarId,
      eventRecord.eventId
    );
    if (!readbackFound || !readbackFound.event) {
      throw new Error(
        'Required PreInspection Calendar copy disappeared during parity read-back.'
      );
    }

    const after = tmv3_preInspectionCalendarBusinessSnapshot_(
      readbackFound.event
    );

    if (!tmv3_preInspectionCalendarParityEqual_(authority, after)) {
      throw new Error(
        'PreInspection cross-calendar parity read-back failed on ' +
        calendarId +
        '. Expected=' + JSON.stringify(authority) +
        ' Actual=' + JSON.stringify(after)
      );
    }

    results.push({
      calendarId:calendarId,
      status:writePerformed ? 'WRITTEN_AND_VERIFIED' : 'ALREADY_MATCHED',
      businessState:after
    });
  });

  return {
    status:'FULL_BUSINESS_VISIBLE_PARITY_VERIFIED',
    authoritativeCalendarId:primaryId,
    eventId:eventRecord.eventId,
    copies:results
  };
}

function tmv3_operationWriteCalendarLinks_(bundle, scope) {
  tmv3_assertOperationWrite_(scope);

  const eventRecord = bundle.eventRecord;
  const mirror = tmv3_ensurePreInspectionMirror_(
    eventRecord,
    scope
  );
  const records = (bundle.records || [bundle.resolved]).map(function(record) {
    return Object.assign({}, record || {});
  });

  records.forEach(function(record) {
    tmv3_assertResolvedRecordWritable_(record, { requireTask: true });
  });

  if (
    eventRecord.vertical === 'PreInspection' &&
    bundle.contract &&
    tmv3_clean_(bundle.contract.desiredTaskName)
  ) {
    const expectedTaskId = tmv3_clean_(bundle.contract.taskId);
    records.forEach(function(record) {
      const recordTaskId = tmv3_clean_(record.taskId);
      if (
        !expectedTaskId ||
        recordTaskId === expectedTaskId
      ) {
        record.task = tmv3_clean_(bundle.contract.desiredTaskName);
      }
    });
  }

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

  const missingCalendarCopies = (plan.calendarIds || []).filter(function(calendarId) {
    return !copies.some(function(copy) {
      return tmv3_clean_(copy.calendarId) === tmv3_clean_(calendarId);
    });
  });

  if (
    eventRecord.vertical === 'PreInspection' &&
    missingCalendarCopies.length
  ) {
    throw new Error(
      'Required PreInspection Calendar copy/copies were not found: ' +
      missingCalendarCopies.join(', ') +
      '. No Calendar link write was performed.'
    );
  }

  // Non-PreInspection verticals may legitimately exist on only one configured source
  // Calendar. Patch every copy that actually exists and verify it.
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

  const parity =
    eventRecord.vertical === 'PreInspection'
      ? tmv3_reconcilePreInspectionCalendarParity_(
          eventRecord,
          scope
        )
      : null;

  return {
    status: 'CALENDAR_LINKS_VERIFIED',
    vertical: eventRecord.vertical,
    eventId: plan.eventId,
    copies: results,
    links: plan.links,
    missingCalendarCopies: missingCalendarCopies,
    attention: missingCalendarCopies.length
      ? 'Some actual Calendar copies were not present; existing copies were updated and verified.'
      : '',
    mirror: mirror,
    parity: parity
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
  const eventRecord = bundle && bundle.eventRecord;
  const resolved = bundle && bundle.resolved || {};
  const refs = bundle && bundle.refs || {};
  const contract = bundle && bundle.contract || {};

  if (!eventRecord) {
    throw new Error('Task title construction requires an Event record.');
  }

  // CREATE execution starts from the raw Calendar event, while the canonical
  // title builder intentionally requires Step 3 + Step 4 verified identity.
  // Rehydrate only that verified title context from the already-authorized
  // Step 7 relationship. Do not infer or guess identity from Calendar text.
  tmv3_assertResolvedOwnership_(bundle);

  if (
    tmv3_clean_(contract.expectedCustomerId) &&
    tmv3_clean_(contract.expectedCustomerId) !==
      tmv3_clean_(resolved.customerId)
  ) {
    throw new Error(
      'CREATE title context Customer no longer matches the Step 7 contract.'
    );
  }

  if (
    tmv3_clean_(contract.expectedLocationId) &&
    tmv3_clean_(contract.expectedLocationId) !==
      tmv3_clean_(resolved.locationId)
  ) {
    throw new Error(
      'CREATE title context Location no longer matches the Step 7 contract.'
    );
  }

  const customer = tmv3_customerFromRefs_(
    refs,
    resolved.customerId
  );
  const location = tmv3_locationFromRefs_(
    refs,
    resolved.customerId,
    resolved.locationId
  );

  if (!customer || !location) {
    throw new Error(
      'CREATE title context requires the verified Customer and customer-owned Location.'
    );
  }

  const verifiedRecord = Object.assign(
    {},
    eventRecord,
    {
      step3:{
        disposition:'VERIFIED',
        anchor:{
          customerNumber:tmv3_clean_(customer['Customer Number']),
          orderNumber:tmv3_clean_(eventRecord.orderNumber)
        }
      },
      step4:{
        disposition:'VERIFIED',
        customer:customer,
        location:location
      }
    }
  );

  const desired = tmv3_desiredTaskName_(
    verifiedRecord,
    {
      sourceTaskTitle:
        source && source.title
          ? source.title
          : ''
    }
  );

  if (desired.status !== 'READY' || !tmv3_clean_(desired.value)) {
    throw new Error(
      desired.reason ||
      'Canonical Task Name could not be built from verified evidence.'
    );
  }

  return desired.value;
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
  let candidates = [];

  (bundle.refs.tasks || []).forEach(function(task) {
    if (!tmv3_taskFitsVertical_(task, vertical, cfg)) return;
    if (!tmv3_step6IsFulfilledStatus_(task['Status'])) return;

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

  // PreInspection tasks are intentionally resolved on demand and are not
  // guaranteed to exist in the shared Source Tasks cache. For RECREATE, use
  // the same Customer-scoped Type 105 search as Step 5 so completed history
  // can be proven without weakening the duplicate guard.
  if (vertical === 'PreInspection' && candidates.length === 0) {
    const customer = tmv3_customerFromRefs_(bundle.refs, resolved.customerId);
    if (!customer) {
      throw new Error(
        'RECREATE requires verified PreInspection Customer before history lookup.'
      );
    }

    candidates = tmv3_searchPreInspectionTasks_(customer).filter(function(task) {
      return (
        tmv3_step6IsFulfilledStatus_(task['Status']) &&
        String(task['Customer ID'] || '') === String(resolved.customerId || '') &&
        String(task['Location ID'] || '') === String(resolved.locationId || '')
      );
    });
  }

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


function tmv3_enforcePreInspectionCreatePayloadHardRules_(payload) {
  payload = payload || {};

  delete payload.SalesOrder;
  delete payload.SalesOrderId;
  delete payload.SalesOrderID;
  delete payload.SOId;
  delete payload.InfoCustomFields;
  payload.Description = '';

  return payload;
}

function tmv3_assertPreInspectionCreatePayloadHardRules_(payload) {
  const errors = [];
  const type = payload && payload.Type || {};
  const description = String(payload && payload.Description || '');
  const hasOrder = !!(
    payload &&
    (
      payload.SalesOrder ||
      payload.SalesOrderId ||
      payload.SalesOrderID ||
      payload.SOId
    )
  );
  const hasCustomFields = !!(
    payload &&
    Array.isArray(payload.InfoCustomFields) &&
    payload.InfoCustomFields.length
  );

  if (Number(type.Id || type.id || 0) !== 105) {
    errors.push('Task Type must be 105.');
  }
  if (hasOrder) {
    errors.push('Sales Order attachment is forbidden.');
  }
  if (description !== '') {
    errors.push('Task Description must be blank at CREATE.');
  }
  if (hasCustomFields) {
    errors.push('PreInspection CREATE must not prefill InfoCustomFields, including Field 854.');
  }

  if (errors.length) {
    throw new Error(
      'PREINSPECTION HARD RULE VIOLATION: ' +
      errors.join(' | ')
    );
  }

  return true;
}

function tmv3_durableWriteGuardKey_(kind, identity) {
  return (
    'TMV3_' +
    tmv3_clean_(kind).toUpperCase().replace(/[^A-Z0-9_]/g, '_') +
    '_' +
    tmv3_hash_(tmv3_clean_(identity))
  );
}

function tmv3_readDurableWriteGuard_(key) {
  const raw = PropertiesService.getScriptProperties().getProperty(key);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object'
      ? parsed
      : { state:'CORRUPT', raw:raw };
  } catch (err) {
    return {
      state:'CORRUPT',
      raw:raw,
      error:String(err && err.message || err)
    };
  }
}

function tmv3_writeDurableWriteGuard_(key, state, data) {
  const value = Object.assign(
    {},
    data || {},
    {
      state:tmv3_clean_(state),
      guardKey:key,
      engineVersion:TMV3.VERSION,
      updatedAt:tmv3_now_()
    }
  );

  PropertiesService.getScriptProperties().setProperty(
    key,
    JSON.stringify(value)
  );

  return value;
}

function tmv3_createGuardStateBlocksRetry_(guard) {
  if (!guard) return false;
  return tmv3_clean_(guard.state).toUpperCase() !== 'CLEARED';
}

function tmv3_taskCreateGuardKey_(contract) {
  const operation =
    (contract.actions || []).indexOf(
      TMV3_STEP7_ACTION.RECREATE_TASK
    ) !== -1
      ? 'RECREATE_TASK'
      : 'CREATE_TASK';

  return tmv3_durableWriteGuardKey_(
    'TASK_CREATE_GUARD',
    [
      contract.vertical,
      contract.eventId,
      operation,
      (contract.sourceTaskIdList || []).slice().sort().join(',')
    ].join('|')
  );
}

function tmv3_locationCreateGuardKey_(contract) {
  return tmv3_durableWriteGuardKey_(
    'LOCATION_CREATE_GUARD',
    [
      contract.vertical,
      contract.eventId,
      contract.expectedCustomerId,
      tmv3_normalizeAddress_(contract.expectedLocationAddress)
    ].join('|')
  );
}

function tmv3_parseCanadianCustomerLocation_(address, customerId) {
  const raw = tmv3_clean_(address);
  const customer = Number(customerId || 0);

  if (!raw || !customer) {
    throw new Error(
      'Customer Location creation requires verified Customer ID and Calendar address.'
    );
  }

  const upper = raw.toUpperCase();
  const postalMatch = upper.match(/\b([A-Z]\d[A-Z])\s?(\d[A-Z]\d)\b/);
  const provinceMatch = upper.match(
    /\b(ON|QC|BC|AB|MB|SK|NS|NB|NL|PE|NT|NU|YT)\b/
  );

  const parts = raw
    .split(',')
    .map(tmv3_clean_)
    .filter(Boolean);

  let provinceIndex = -1;

  for (let i = 0; i < parts.length; i++) {
    if (
      /\b(ON|QC|BC|AB|MB|SK|NS|NB|NL|PE|NT|NU|YT)\b/i.test(parts[i]) ||
      /\b[A-Z]\d[A-Z]\s?\d[A-Z]\d\b/i.test(parts[i])
    ) {
      provinceIndex = i;
      break;
    }
  }

  if (
    !postalMatch ||
    !provinceMatch ||
    provinceIndex < 2
  ) {
    throw new Error(
      'Customer Location creation requires a complete Canadian address with street, city, province and postal code. Address was: ' +
      raw
    );
  }

  const street = tmv3_clean_(parts[0]);
  const city = tmv3_clean_(parts[provinceIndex - 1]);

  if (!street || !city) {
    throw new Error(
      'Customer Location creation could not deterministically separate street and city from: ' +
      raw
    );
  }

  return {
    CustomerId:customer,
    Name:raw,
    Address1:street,
    City:city,
    State:provinceMatch[1],
    PostalCode:postalMatch[1] + ' ' + postalMatch[2],
    Country:'Canada',
    IsActive:true
  };
}

function tmv3_normalizedLocationObject_(normalized) {
  const row = normalized || [];

  return {
    'Location ID':tmv3_clean_(row[0]),
    'Customer ID':tmv3_clean_(row[1]),
    'Address 1':tmv3_clean_(row[2]),
    'Address 2':tmv3_clean_(row[3]),
    'City':tmv3_clean_(row[4]),
    'Province':tmv3_clean_(row[5]),
    'Postal Code':tmv3_clean_(row[6]),
    'Phone':tmv3_clean_(row[7]),
    'Fingerprint':tmv3_clean_(row[8])
  };
}

function tmv3_freshCustomerLocationCandidates_(bundle, customerId, address) {
  const customerNumberToId = {};

  (bundle.refs.customers || []).forEach(function(customer) {
    const number = tmv3_clean_(customer['Customer Number']);
    const id = tmv3_clean_(customer['Customer ID']);

    if (number && id) {
      customerNumberToId[number] = id;
    }
  });

  const target = tmv3_addressParts_(address);
  const exactKey = tmv3_normalizeAddress_(address);

  const owned = tmv3_reportRows_(TMV3.PROPERTIES.LOCATIONS)
    .map(function(raw) {
      return tmv3_normalizedLocationObject_(
        tmv3_normalizeLocation_(raw, customerNumberToId)
      );
    })
    .filter(function(location) {
      return (
        tmv3_clean_(location['Location ID']) &&
        tmv3_clean_(location['Customer ID']) === tmv3_clean_(customerId)
      );
    });

  const exact = owned.filter(function(location) {
    return (
      tmv3_normalizeAddress_(tmv3_locationFullAddress_(location)) ===
      exactKey
    );
  });

  const matches = exact.length
    ? exact
    : owned.filter(function(location) {
        return tmv3_addressStrongMatch_(
          target,
          tmv3_addressParts_(
            tmv3_locationFullAddress_(location)
          )
        );
      });

  return {
    owned:owned,
    matches:matches
  };
}

function tmv3_extractCreatedLocationId_(json) {
  if (typeof json === 'number' && json > 0) {
    return Number(json);
  }

  if (typeof json === 'string' && /^\d+$/.test(json.trim())) {
    return Number(json.trim());
  }

  if (!json || typeof json !== 'object') {
    return 0;
  }

  const candidates = [
    json.id,
    json.Id,
    json.locationId,
    json.LocationId,
    json.LocationID,
    json.customerLocationId,
    json.CustomerLocationId,
    json.data && json.data.id,
    json.data && json.data.Id,
    json.location && json.location.id,
    json.location && json.location.Id
  ];

  for (let i = 0; i < candidates.length; i++) {
    const id = Number(candidates[i]);

    if (Number.isFinite(id) && id > 0) {
      return id;
    }
  }

  return 0;
}

function tmv3_upsertLocationCacheObject_(location) {
  const id = tmv3_clean_(location && location['Location ID']);

  if (!id) {
    throw new Error('Location cache upsert requires Location ID.');
  }

  const sh = tmv3_sheet_(TMV3.SHEETS.LOCATIONS);
  const headers = [
    'Location ID','Customer ID','Address 1','Address 2','City',
    'Province','Postal Code','Phone','Fingerprint'
  ];
  const row = headers.map(function(header) {
    return location[header] === undefined
      ? ''
      : location[header];
  });

  const lastRow = sh.getLastRow();
  let targetRow = 0;

  if (lastRow > 1) {
    const ids = sh.getRange(
      2,
      1,
      lastRow - 1,
      1
    ).getValues();

    for (let i = 0; i < ids.length; i++) {
      if (tmv3_clean_(ids[i][0]) === id) {
        targetRow = i + 2;
        break;
      }
    }
  }

  if (targetRow) {
    sh.getRange(
      targetRow,
      1,
      1,
      row.length
    ).setValues([row]);
  } else {
    sh.getRange(
      Math.max(2, lastRow + 1),
      1,
      1,
      row.length
    ).setValues([row]);
  }

  return location;
}

function tmv3_locationResultFromVerified_(
  bundle,
  contract,
  location,
  guardKey
) {
  tmv3_upsertLocationCacheObject_(location);

  const locationId = tmv3_clean_(
    location['Location ID']
  );

  const updatedContract = Object.assign(
    {},
    contract,
    {
      expectedLocationId:locationId,
      locationStatus:'MATCHED',
      actions:(contract.actions || []).filter(function(action) {
        return action !== TMV3_STEP7_ACTION.CREATE_LOCATION;
      })
    }
  );

  const updatedBundle = tmv3_step7BundleFromContract_(
    updatedContract
  );

  return {
    status:'LOCATION_VERIFIED',
    locationId:locationId,
    guardKey:guardKey,
    location:location,
    contract:updatedContract,
    bundle:updatedBundle
  };
}

function tmv3_ensureStep7LocationUnlocked_(
  bundle,
  scope,
  contract
) {
  tmv3_assertOperationWrite_(scope);
  contract = tmv3_step7ValidateExecutionContract_(contract);

  if (
    (contract.actions || []).indexOf(
      TMV3_STEP7_ACTION.CREATE_LOCATION
    ) === -1
  ) {
    return {
      status:'LOCATION_NOT_REQUIRED',
      contract:contract,
      bundle:bundle
    };
  }

  if (contract.vertical !== 'PreInspection') {
    throw new Error(
      'CREATE_LOCATION is currently authorized only for PreInspection. ' +
      contract.vertical +
      ' requires explicit relationship review to avoid duplicating an Order-linked Location.'
    );
  }

  const payload = tmv3_parseCanadianCustomerLocation_(
    contract.expectedLocationAddress,
    contract.expectedCustomerId
  );

  const guardKey = tmv3_locationCreateGuardKey_(contract);
  const guard = tmv3_readDurableWriteGuard_(guardKey);

  const preflight = tmv3_freshCustomerLocationCandidates_(
    bundle,
    contract.expectedCustomerId,
    contract.expectedLocationAddress
  );

  if (preflight.matches.length > 1) {
    throw new Error(
      'CREATE_LOCATION blocked: multiple Customer-owned Locations match the Calendar address.'
    );
  }

  if (guard) {
    const knownId = Number(guard.locationId || 0);

    if (knownId) {
      const known = preflight.owned.filter(function(location) {
        return Number(location['Location ID'] || 0) === knownId;
      });

      if (
        known.length === 1 &&
        tmv3_addressStrongMatch_(
          tmv3_addressParts_(contract.expectedLocationAddress),
          tmv3_addressParts_(
            tmv3_locationFullAddress_(known[0])
          )
        )
      ) {
        tmv3_writeDurableWriteGuard_(
          guardKey,
          'VERIFIED',
          Object.assign({}, guard, {
            locationId:knownId,
            customerId:contract.expectedCustomerId,
            address:contract.expectedLocationAddress
          })
        );

        return tmv3_locationResultFromVerified_(
          bundle,
          contract,
          known[0],
          guardKey
        );
      }

      throw new Error(
        'CREATE_LOCATION blocked: Location ' +
        knownId +
        ' was previously captured but fresh Striven Location data cannot verify it yet. Reconcile before retry.'
      );
    }

    if (preflight.matches.length === 1) {
      const recoveredId = Number(
        preflight.matches[0]['Location ID'] || 0
      );

      tmv3_writeDurableWriteGuard_(
        guardKey,
        'VERIFIED',
        Object.assign({}, guard, {
          locationId:recoveredId,
          customerId:contract.expectedCustomerId,
          address:contract.expectedLocationAddress,
          reconciledFrom:'FRESH_LOCATION_REPORT'
        })
      );

      return tmv3_locationResultFromVerified_(
        bundle,
        contract,
        preflight.matches[0],
        guardKey
      );
    }

    throw new Error(
      'CREATE_LOCATION blocked: a previous Location write attempt is ' +
      tmv3_clean_(guard.state || 'UNCERTAIN') +
      ' and no unique fresh Location can yet be reconciled. No second POST is allowed.'
    );
  }

  if (preflight.matches.length === 1) {
    const existingId = Number(
      preflight.matches[0]['Location ID'] || 0
    );

    tmv3_writeDurableWriteGuard_(
      guardKey,
      'VERIFIED',
      {
        vertical:contract.vertical,
        eventId:contract.eventId,
        customerId:contract.expectedCustomerId,
        address:contract.expectedLocationAddress,
        locationId:existingId,
        reconciledFrom:'PREEXISTING_FRESH_LOCATION'
      }
    );

    return tmv3_locationResultFromVerified_(
      bundle,
      contract,
      preflight.matches[0],
      guardKey
    );
  }

  tmv3_writeDurableWriteGuard_(
    guardKey,
    'ATTEMPT_STARTED',
    {
      vertical:contract.vertical,
      eventId:contract.eventId,
      customerId:contract.expectedCustomerId,
      address:contract.expectedLocationAddress
    }
  );

  let response;
  let locationId = 0;

  try {
    response = tmv3_fetchJson_(
      TMV3.API_BASE +
        '/v1/customers/' +
        encodeURIComponent(
          Number(contract.expectedCustomerId)
        ) +
        '/location',
      {
        method:'post',
        contentType:'application/json',
        payload:JSON.stringify(payload)
      }
    );

    locationId = tmv3_extractCreatedLocationId_(response);

    if (!locationId) {
      throw new Error(
        'Location POST returned success but no durable Location ID was extracted.'
      );
    }
  } catch (err) {
    tmv3_writeDurableWriteGuard_(
      guardKey,
      'UNCERTAIN',
      {
        vertical:contract.vertical,
        eventId:contract.eventId,
        customerId:contract.expectedCustomerId,
        address:contract.expectedLocationAddress,
        error:String(err && err.message || err)
      }
    );

    tmv3_audit_(
      contract.vertical,
      contract.eventId,
      contract.taskId || '',
      'CREATE_LOCATION',
      'CREATE UNCERTAIN',
      'No retry is authorized until the Customer Location is reconciled. ' +
        String(err && err.message || err)
    );

    throw new Error(
      'CREATE LOCATION UNCERTAIN. Do not retry blindly. Reconcile Striven first. ' +
      String(err && err.message || err)
    );
  }

  tmv3_writeDurableWriteGuard_(
    guardKey,
    'ID_CAPTURED',
    {
      vertical:contract.vertical,
      eventId:contract.eventId,
      customerId:contract.expectedCustomerId,
      address:contract.expectedLocationAddress,
      locationId:locationId
    }
  );

  const readback = tmv3_freshCustomerLocationCandidates_(
    bundle,
    contract.expectedCustomerId,
    contract.expectedLocationAddress
  );

  const verified = readback.owned.filter(function(location) {
    return (
      Number(location['Location ID'] || 0) ===
      Number(locationId)
    );
  });

  if (verified.length !== 1) {
    throw new Error(
      'Location ' +
      locationId +
      ' was created and captured, but fresh Location report read-back has not converged. No Task write is authorized yet.'
    );
  }

  if (
    !tmv3_addressStrongMatch_(
      tmv3_addressParts_(contract.expectedLocationAddress),
      tmv3_addressParts_(
        tmv3_locationFullAddress_(verified[0])
      )
    )
  ) {
    throw new Error(
      'Created Location read-back address does not match the verified Calendar job-site address.'
    );
  }

  tmv3_writeDurableWriteGuard_(
    guardKey,
    'VERIFIED',
    {
      vertical:contract.vertical,
      eventId:contract.eventId,
      customerId:contract.expectedCustomerId,
      address:contract.expectedLocationAddress,
      locationId:locationId
    }
  );

  tmv3_audit_(
    contract.vertical,
    contract.eventId,
    contract.taskId || '',
    'CREATE_LOCATION',
    'PASS',
    JSON.stringify({
      locationId:locationId,
      customerId:contract.expectedCustomerId,
      readback:'FRESH_LOCATION_REPORT'
    })
  );

  return tmv3_locationResultFromVerified_(
    bundle,
    contract,
    verified[0],
    guardKey
  );
}

function tmv3_ensureStep7Location_(
  bundle,
  scope,
  contract
) {
  const lock = LockService.getScriptLock();

  if (!lock.tryLock(30000)) {
    throw new Error(
      'CREATE_LOCATION blocked because another V3 write is already in progress.'
    );
  }

  try {
    return tmv3_ensureStep7LocationUnlocked_(
      bundle,
      scope,
      contract
    );
  } finally {
    lock.releaseLock();
  }
}

function tmv3_existingPersistedTaskForEvent_(
  vertical,
  eventId,
  options
) {
  options = options || {};

  const sourceRows = Array.isArray(options.rows)
    ? options.rows
    : tmv3_rows_(TMV3.SHEETS.STATE);

  const rows = sourceRows.filter(function(row) {
    return (
      tmv3_clean_(row['Vertical']) === tmv3_clean_(vertical) &&
      tmv3_clean_(row['Event ID']) === tmv3_clean_(eventId) &&
      !!tmv3_clean_(row['Task ID'])
    );
  });

  const taskIds = tmv3_unique_(
    rows.map(function(row) {
      return tmv3_clean_(row['Task ID']);
    }).filter(Boolean)
  );

  if (!taskIds.length) {
    return {
      status:'NONE',
      taskIds:[],
      taskId:0,
      task:null,
      state:null
    };
  }

  if (taskIds.length > 1) {
    return {
      status:'MULTIPLE_KNOWN',
      taskIds:taskIds,
      taskId:0,
      task:null,
      state:null,
      reason:
        'Multiple persisted Task IDs exist for this Calendar event: ' +
        taskIds.join(', ') +
        '.'
    };
  }

  const taskId = Number(taskIds[0] || 0);
  const state = rows.filter(function(row) {
    return Number(row['Task ID'] || 0) === taskId;
  })[0] || null;

  const readTask =
    typeof options.readTask === 'function'
      ? options.readTask
      : tmv3_getTaskById_;

  try {
    const task = readTask(taskId);

    if (!task || !tmv3_clean_(task['Task ID'])) {
      return {
        status:'KNOWN_READ_FAILED',
        taskIds:taskIds,
        taskId:taskId,
        task:null,
        state:state,
        reason:
          'Persisted Task ' +
          taskId +
          ' did not return an authoritative Task record.'
      };
    }

    return {
      status:'FOUND_VERIFIED',
      taskIds:taskIds,
      taskId:taskId,
      task:task,
      state:state
    };
  } catch (err) {
    return {
      status:'KNOWN_READ_FAILED',
      taskIds:taskIds,
      taskId:taskId,
      task:null,
      state:state,
      reason:
        'Persisted Task ' +
        taskId +
        ' could not be freshly read: ' +
        String(err && err.message || err)
    };
  }
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

function tmv3_createOrRecreateFromBundle_(bundle, scope, contract) {
  const lock = LockService.getScriptLock();

  if (!lock.tryLock(30000)) {
    throw new Error(
      'CREATE / RECREATE blocked because another V3 write is already in progress.'
    );
  }

  try {
    return tmv3_createOrRecreateFromBundleUnlocked_(
      bundle,
      scope,
      contract
    );
  } finally {
    lock.releaseLock();
  }
}

function tmv3_createOrRecreateFromBundleUnlocked_(
  bundle,
  scope,
  contract
) {
  contract = tmv3_step7ValidateExecutionContract_(contract);
  tmv3_assertOperationWrite_(scope);

  if (tmv3_clean_(contract.blocker)) {
    throw new Error(
      'CREATE / RECREATE blocked by Step 7: ' + contract.blocker
    );
  }

  if (
    contract.actions.indexOf(TMV3_STEP7_ACTION.CREATE_LOCATION) !== -1
  ) {
    throw new Error(
      'CREATE / RECREATE ordering error: Customer Location must be freshly verified before Task POST.'
    );
  }

  const isRecreate =
    contract.actions.indexOf(TMV3_STEP7_ACTION.RECREATE_TASK) !== -1;
  const isCreate =
    contract.actions.indexOf(TMV3_STEP7_ACTION.CREATE_TASK) !== -1;

  if (!isCreate && !isRecreate) {
    throw new Error(
      'Step 7 contract does not authorize CREATE / RECREATE.'
    );
  }

  if (bundle.resolved.taskId) {
    throw new Error(
      'CREATE blocked because a Task ID is already resolved.'
    );
  }

  if (
    isCreate &&
    (contract.sourceTaskIdList || []).length
  ) {
    throw new Error(
      'CREATE blocked because Step 7 still exposes existing source Task IDs: ' +
      contract.sourceTaskIdList.join(',') + '.'
    );
  }

  const persisted = tmv3_existingPersistedTaskForEvent_(
    contract.vertical,
    contract.eventId
  );

  if (persisted.status === 'KNOWN_READ_FAILED') {
    throw new Error(
      'CREATE blocked: ' +
      persisted.reason +
      ' A failed read is not evidence that the Task does not exist.'
    );
  }

  if (persisted.status === 'MULTIPLE_KNOWN') {
    throw new Error(
      'CREATE blocked: ' +
      persisted.reason +
      ' Reconcile the event before any new Task POST.'
    );
  }

  if (persisted.status === 'FOUND_VERIFIED') {
    const sourceIds = (contract.sourceTaskIdList || [])
      .map(String);

    const authorizedRecreateSource =
      isRecreate &&
      sourceIds.length === 1 &&
      sourceIds[0] === String(persisted.taskId) &&
      tmv3_taskIsCompleted_(persisted.task['Status']);

    if (!authorizedRecreateSource) {
      throw new Error(
        'CREATE blocked: V3 previously persisted Task ' +
        persisted.taskId +
        ' for this Calendar event. Reconcile that Task first.'
      );
    }
  }

  const taskGuardKey = tmv3_taskCreateGuardKey_(contract);
  const priorGuard = tmv3_readDurableWriteGuard_(
    taskGuardKey
  );

  if (tmv3_createGuardStateBlocksRetry_(priorGuard)) {
    const priorTaskId = Number(
      priorGuard.taskId || 0
    );

    if (priorTaskId) {
      try {
        const priorTask = tmv3_getTaskById_(
          priorTaskId
        );

        throw new Error(
          'CREATE blocked: durable guard already captured Task ' +
          priorTaskId +
          ' (' +
          tmv3_clean_(priorTask['Status']) +
          '). Reconcile that Task instead of POSTing again.'
        );
      } catch (err) {
        if (
          String(err && err.message || err).indexOf(
            'durable guard already captured Task'
          ) !== -1
        ) {
          throw err;
        }

        throw new Error(
          'CREATE blocked: durable guard captured Task ' +
          priorTaskId +
          ' but the fresh read failed. No second POST is allowed. ' +
          String(err && err.message || err)
        );
      }
    }

    throw new Error(
      'CREATE blocked: prior write guard is ' +
      tmv3_clean_(priorGuard.state || 'UNCERTAIN') +
      '. Reconcile Striven before any retry.'
    );
  }

  const action = isRecreate ? 'RECREATE' : 'CREATE';
  const source = tmv3_buildCreateSource_(bundle, action);
  const request = {
    startDateTime:tmv3_strivenTaskDateTime_(
      new Date(contract.expectedStart)
    ),
    dueDateTime:tmv3_strivenTaskDateTime_(
      new Date(contract.expectedDue)
    ),
    calendarNotes:
      contract.vertical === 'PreInspection'
        ? null
        : tmv3_stripAuthoredCalendarNotes_(
            bundle.eventRecord.description
          )
  };
  const payload = tmv3_buildReplacementCreatePayload_(
    source,
    request
  );

  if (contract.vertical === 'PreInspection') {
    tmv3_enforcePreInspectionCreatePayloadHardRules_(payload);
    tmv3_assertPreInspectionCreatePayloadHardRules_(payload);
  }

  let json;
  let newTaskId = 0;

  tmv3_writeDurableWriteGuard_(
    taskGuardKey,
    'ATTEMPT_STARTED',
    {
      vertical:contract.vertical,
      eventId:contract.eventId,
      action:action,
      sourceTaskIds:(contract.sourceTaskIdList || []).slice()
    }
  );

  try {
    json = tmv3_fetchJson_(
      TMV3.API_BASE + '/v2/tasks',
      {
        method:'post',
        contentType:'application/json',
        payload:JSON.stringify(payload)
      }
    );
    newTaskId = Number(
      tmv3_extractCreatedTaskId_(json) || 0
    );

    if (!newTaskId) {
      throw new Error(
        'POST succeeded but created Task ID could not be extracted.'
      );
    }
  } catch (err) {
    tmv3_writeDurableWriteGuard_(
      taskGuardKey,
      'UNCERTAIN',
      {
        vertical:contract.vertical,
        eventId:contract.eventId,
        action:action,
        sourceTaskIds:(contract.sourceTaskIdList || []).slice(),
        error:String(err && err.message || err)
      }
    );

    tmv3_audit_(
      contract.vertical,
      contract.eventId,
      '',
      action + '_TASK',
      'CREATE UNCERTAIN',
      'Do not retry blindly. ' +
        String(err && err.message || err)
    );

    throw new Error(
      'CREATE UNCERTAIN. Do not retry blindly. ' +
      'Reconcile Striven first. ' +
      String(err && err.message || err)
    );
  }

  tmv3_writeDurableWriteGuard_(
    taskGuardKey,
    'ID_CAPTURED',
    {
      vertical:contract.vertical,
      eventId:contract.eventId,
      action:action,
      sourceTaskIds:(contract.sourceTaskIdList || []).slice(),
      taskId:newTaskId
    }
  );

  tmv3_persistCreatedTaskIdState_(
    bundle,
    newTaskId
  );

  const createdResolved = Object.assign(
    {},
    bundle.resolved,
    {
      taskId:newTaskId,
      task:String(newTaskId),
      status:'READY'
    }
  );

  const createdBundle = Object.assign({}, bundle, {
    resolved:createdResolved,
    records:[createdResolved]
  });

  let assignment = null;
  if (
    contract.actions.indexOf(
      TMV3_STEP7_ACTION.PATCH_ASSIGNMENTS
    ) !== -1
  ) {
    assignment = tmv3_reconcileTaskAssignments_(
      bundle.eventRecord,
      newTaskId,
      scope,
      {
        newTask:true,
        desiredAssignment:
          tmv3_step7DesiredAssignmentFromContract_(contract)
      }
    );
  }

  const readback = tmv3_getTaskById_(newTaskId);
  tmv3_upsertTaskCacheRow_(readback);

  if (!tmv3_taskIsOpen_(readback['Status'])) {
    throw new Error(
      'Created Task read-back is not OPEN. Task ID ' +
      newTaskId + '.'
    );
  }

  if (
    String(readback['Customer ID'] || '') !==
    String(contract.expectedCustomerId)
  ) {
    throw new Error(
      'Created Task Customer read-back mismatch.'
    );
  }

  if (
    String(readback['Location ID'] || '') !==
    String(contract.expectedLocationId)
  ) {
    throw new Error(
      'Created Task Location read-back mismatch.'
    );
  }

  if (
    contract.vertical === 'PreInspection' &&
    (
      Number(readback['Task Type ID'] || 0) !== 105 ||
      readback['Order ID']
    )
  ) {
    throw new Error(
      'Created PreInspection Task violated Type 105 / no-SO invariant.'
    );
  }

  let calendarLinks = null;
  if (
    contract.actions.indexOf(
      TMV3_STEP7_ACTION.VERIFY_CALENDAR_LINKS
    ) !== -1
  ) {
    calendarLinks = tmv3_operationWriteCalendarLinks_(
      createdBundle,
      scope
    );
  }

  let calendarTitle = null;
  if (
    contract.actions.indexOf(
      TMV3_STEP7_ACTION.PATCH_CALENDAR_TITLE
    ) !== -1
  ) {
    calendarTitle = tmv3_operationNormalizeCalendarTitle_(
      createdBundle,
      contract,
      scope
    );
  }

  const after = tmv3_step7FreshExecutionContract_(
    contract.vertical,
    contract.eventId,
    newTaskId
  );

  if (
    after.plan !== 'NO_CHANGE' ||
    tmv3_clean_(after.blocker)
  ) {
    tmv3_audit_(
      contract.vertical,
      contract.eventId,
      newTaskId,
      action + '_TASK',
      'ATTENTION',
      JSON.stringify({
        expectedTerminalPlan:'NO_CHANGE',
        freshPlan:after.plan,
        blocker:after.blocker || '',
        createdTaskId:newTaskId
      })
    );
    throw new Error(
      'CREATE read-back did not converge to Step 7 NO_CHANGE; ' +
      'fresh plan is ' + after.plan + '.'
    );
  }

  tmv3_writeDurableWriteGuard_(
    taskGuardKey,
    'VERIFIED',
    {
      vertical:contract.vertical,
      eventId:contract.eventId,
      action:action,
      sourceTaskIds:(contract.sourceTaskIdList || []).slice(),
      taskId:newTaskId,
      terminalPlan:after.plan
    }
  );

  tmv3_audit_(
    contract.vertical,
    contract.eventId,
    newTaskId,
    action + '_TASK',
    'PASS',
    JSON.stringify({
      assignment:assignment,
      calendarLinks:calendarLinks,
      calendarTitle:calendarTitle
    })
  );

  return {
    status:'CREATED_VERIFIED_AND_CONVERGED',
    action:action,
    taskId:newTaskId,
    assignment:assignment,
    calendarLinks:calendarLinks,
    calendarTitle:calendarTitle,
    readback:readback,
    readbackPlan:after
  };
}

function tmv3_executeExistingTaskSync_(
  bundle,
  scope,
  mode,
  contract
) {
  contract = tmv3_step7ValidateExecutionContract_(contract);
  tmv3_assertOperationWrite_(scope);

  if (!contract.taskId) {
    throw new Error(
      'Existing Task execution requires a Step 7 Task ID.'
    );
  }

  if (tmv3_clean_(contract.blocker)) {
    throw new Error(
      'Existing Task execution blocked by Step 7: ' +
      contract.blocker
    );
  }

  const actions = tmv3_step7ActionsForMode_(
    contract,
    mode || 'ALL'
  );

  const taskId = Number(contract.taskId);
  let patch = null;
  let assignment = null;
  let calendarLinks = null;
  let calendarTitle = null;
  let taskName = null;

  const relationshipActions = [
    TMV3_STEP7_ACTION.PATCH_LOCATION,
    TMV3_STEP7_ACTION.PATCH_ORDER,
    TMV3_STEP7_ACTION.PATCH_REQUESTED_BY
  ];

  if (relationshipActions.some(function(action) {
    return actions.indexOf(action) !== -1;
  })) {
    patch = tmv3_operationPatchTask_(
      taskId,
      tmv3_step7RelationshipPayload_(contract),
      scope
    );
  }

  if (
    actions.indexOf(TMV3_STEP7_ACTION.PATCH_DATES) !== -1
  ) {
    const datePatch = tmv3_operationPatchTask_(
      taskId,
      tmv3_step7DatePayload_(contract),
      scope
    );
    patch = patch || datePatch;
  }

  if (
    actions.indexOf(
      TMV3_STEP7_ACTION.PATCH_ASSIGNMENTS
    ) !== -1
  ) {
    assignment = tmv3_reconcileTaskAssignments_(
      bundle.eventRecord,
      taskId,
      scope,
      {
        desiredAssignment:
          tmv3_step7DesiredAssignmentFromContract_(contract)
      }
    );
  }

  if (
    actions.indexOf(
      TMV3_STEP7_ACTION.VERIFY_CALENDAR_LINKS
    ) !== -1
  ) {
    calendarLinks = tmv3_operationWriteCalendarLinks_(
      bundle,
      scope
    );
  }

  // Title mutation is intentionally last among existing-record mutations.
  // Within the title pair, Calendar is always written and verified first,
  // then the canonical OPEN Task Name is patched independently.
  if (
    actions.indexOf(
      TMV3_STEP7_ACTION.PATCH_CALENDAR_TITLE
    ) !== -1
  ) {
    calendarTitle = tmv3_operationNormalizeCalendarTitle_(
      bundle,
      contract,
      scope
    );
  }

  if (
    actions.indexOf(
      TMV3_STEP7_ACTION.PATCH_TASK_NAME
    ) !== -1
  ) {
    try {
      taskName = tmv3_operationNormalizeTaskName_(
        taskId,
        contract.desiredTaskName,
        contract,
        scope
      );
    } catch (err) {
      const afterFailure = tmv3_step7FreshExecutionContract_(
        contract.vertical,
        contract.eventId,
        taskId
      );

      const calendarWasWritten = !!(
        calendarTitle &&
        (calendarTitle.copies || []).some(function(copy) {
          return copy && copy.writePerformed === true;
        })
      );

      const partial = {
        status:
          calendarWasWritten
            ? 'PARTIAL_RECONCILIATION_REQUIRED'
            : 'TASK_NAME_WRITE_FAILED_NO_CALENDAR_MUTATION',
        vertical:contract.vertical,
        eventId:contract.eventId,
        taskId:taskId,
        failedAction:TMV3_STEP7_ACTION.PATCH_TASK_NAME,
        error:String(err && err.message || err),
        calendarTitle:calendarTitle,
        freshPlan:afterFailure.plan,
        freshActions:(afterFailure.actions || []).slice(),
        readback:afterFailure
      };

      tmv3_audit_(
        contract.vertical,
        contract.eventId,
        taskId,
        'STEP7_TITLE',
        calendarWasWritten ? 'PARTIAL' : 'ATTENTION',
        JSON.stringify(partial)
      );

      return partial;
    }
  }

  const after = tmv3_step7FreshExecutionContract_(
    contract.vertical,
    contract.eventId,
    taskId
  );

  const fullExecution = (mode || 'ALL') === 'ALL';
  const titleExecution = (mode || 'ALL') === 'TITLE';
  const titleActionsRemaining = (after.actions || []).filter(function(action) {
    return [
      TMV3_STEP7_ACTION.PATCH_CALENDAR_TITLE,
      TMV3_STEP7_ACTION.PATCH_TASK_NAME
    ].indexOf(action) !== -1;
  });

  if (
    fullExecution &&
    (
      after.plan !== 'NO_CHANGE' ||
      tmv3_clean_(after.blocker)
    )
  ) {
    tmv3_audit_(
      contract.vertical,
      contract.eventId,
      taskId,
      'STEP7_' + String(mode || 'ALL'),
      'ATTENTION',
      JSON.stringify({
        expectedTerminalPlan:'NO_CHANGE',
        freshPlan:after.plan,
        blocker:after.blocker || '',
        executedActions:actions
      })
    );
    throw new Error(
      'Step 7 read-back did not converge to NO_CHANGE; ' +
      'fresh plan is ' + after.plan + '.'
    );
  }

  if (
    titleExecution &&
    (
      titleActionsRemaining.length ||
      tmv3_clean_(after.calendarTitleBlocker) ||
      tmv3_clean_(after.taskNameBlocker)
    )
  ) {
    const detail = {
      expectedTerminalTitleActions:[],
      freshPlan:after.plan,
      remainingTitleActions:titleActionsRemaining,
      calendarTitleCheck:after.calendarTitleCheck || '',
      taskNameCheck:after.taskNameCheck || '',
      calendarTitleBlocker:after.calendarTitleBlocker || '',
      taskNameBlocker:after.taskNameBlocker || ''
    };

    tmv3_audit_(
      contract.vertical,
      contract.eventId,
      taskId,
      'STEP7_TITLE',
      'ATTENTION',
      JSON.stringify(detail)
    );

    throw new Error(
      'Title read-back did not converge; remaining title actions: ' +
      titleActionsRemaining.join(',') + '.'
    );
  }

  tmv3_audit_(
    contract.vertical,
    contract.eventId,
    taskId,
    'STEP7_' + String(mode || 'ALL'),
    'PASS',
    JSON.stringify({
      plan:contract.plan,
      actions:actions,
      patch:patch && patch.status,
      assignment:assignment && assignment.status,
      calendarLinks:calendarLinks && calendarLinks.status,
      calendarTitle:calendarTitle && calendarTitle.status,
      taskName:taskName && taskName.status,
      calendarTitleCheck:after.calendarTitleCheck || '',
      taskNameCheck:after.taskNameCheck || '',
      readbackPlan:after.plan
    })
  );

  return {
    status:
      fullExecution
        ? 'VERIFIED_CONVERGENCE'
        : (
            titleExecution
              ? 'TITLE_NORMALIZATION_VERIFIED'
              : 'VERIFIED_PARTIAL'
          ),
    mode:mode || 'ALL',
    vertical:contract.vertical,
    eventId:contract.eventId,
    taskId:taskId,
    plan:contract.plan,
    actions:actions,
    patch:patch,
    assignment:assignment,
    calendarLinks:calendarLinks,
    calendarTitle:calendarTitle,
    taskName:taskName,
    readbackPlan:after
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
  const contract = tmv3_step7FreshExecutionContract_(
    vertical,
    eventId,
    taskId
  );

  const previousPlan = tmv3_clean_(expectedPlan);

  if (previousPlan && previousPlan !== contract.plan) {
    const changed = {
      status:'PLAN_CHANGED_NO_WRITE',
      previousPlan:previousPlan,
      freshPlan:contract.plan,
      reason:
        'Fresh canonical Step 7 plan differs from the expected plan.',
      eventId:contract.eventId,
      taskId:contract.taskId
    };
    tmv3_audit_(
      contract.vertical,
      contract.eventId,
      contract.taskId || '',
      'STEP7_PLAN_GUARD',
      'NO_WRITE',
      JSON.stringify(changed)
    );
    return changed;
  }

  return tmv3_executeFreshStep7Selection_(
    {
      previousPlan:previousPlan,
      contract:contract
    },
    'MANUAL',
    'ALL'
  );
}



function tmv3_previewTitleNormalizationForEvent(
  vertical,
  eventId,
  taskId
) {
  const contract = tmv3_step7FreshExecutionContract_(
    vertical,
    eventId,
    taskId
  );

  const result = {
    mode:'READ_ONLY',
    authority:'FRESH_STEP7_CANONICAL_CONTRACT',
    vertical:contract.vertical,
    eventId:contract.eventId,
    taskId:contract.taskId || '',
    plan:contract.plan,
    blocker:contract.blocker || '',
    actions:(contract.actions || []).slice(),
    titleNormalization:tmv3_titleNormalizationPreview_(contract),
    manualWritesEnabled:tmv3_operationWritesEnabled_('MANUAL'),
    automationWritesEnabled:tmv3_operationWritesEnabled_('AUTO')
  };

  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

function tmv3_executeVerifiedTitleNormalization(
  vertical,
  eventId,
  taskId,
  expectedPlan
) {
  const expected = tmv3_clean_(expectedPlan);
  if (!expected) {
    throw new Error(
      'Title normalization execution requires the exact plan returned by the prior read-only preview.'
    );
  }

  const contract = tmv3_step7FreshExecutionContract_(
    vertical,
    eventId,
    taskId
  );

  const titleActions = tmv3_step7ActionsForMode_(
    contract,
    'TITLE'
  );

  if (expected !== tmv3_clean_(contract.plan)) {
    return {
      status:'PLAN_CHANGED_NO_WRITE',
      previousPlan:expected,
      freshPlan:contract.plan,
      vertical:contract.vertical,
      eventId:contract.eventId,
      taskId:contract.taskId || ''
    };
  }

  if (tmv3_clean_(contract.blocker)) {
    return {
      status:'BLOCKED_NO_WRITE',
      blocker:contract.blocker,
      vertical:contract.vertical,
      eventId:contract.eventId,
      taskId:contract.taskId || '',
      plan:contract.plan
    };
  }

  if (!titleActions.length) {
    return {
      status:'NO_TITLE_CHANGE_REQUIRED',
      vertical:contract.vertical,
      eventId:contract.eventId,
      taskId:contract.taskId || '',
      plan:contract.plan,
      calendarTitleCheck:contract.calendarTitleCheck || '',
      taskNameCheck:contract.taskNameCheck || ''
    };
  }

  return tmv3_executeFreshStep7Selection_(
    {
      previousPlan:expected,
      contract:contract
    },
    'MANUAL',
    'TITLE'
  );
}

function tmv3_titleNormalizationPreview_(contract) {
  contract = tmv3_step7ValidateExecutionContract_(contract);

  const bundle = tmv3_step7BundleFromContract_(contract);
  const customer = tmv3_customerFromRefs_(
    bundle.refs,
    contract.expectedCustomerId
  );
  const location = tmv3_locationFromRefs_(
    bundle.refs,
    contract.expectedCustomerId,
    contract.expectedLocationId
  );
  const order = contract.expectedOrderId
    ? bundle.refs.orderById[String(contract.expectedOrderId)] || null
    : null;

  const previewRecord = Object.assign(
    {},
    bundle.eventRecord,
    {
      step3:{
        disposition:'VERIFIED',
        anchor:{
          orderId:contract.expectedOrderId || '',
          orderNumber:tmv3_clean_(order && order['Order Number']),
          customerNumber:tmv3_clean_(customer && customer['Customer Number'])
        }
      },
      step4:{
        disposition:
          customer && location
            ? 'VERIFIED'
            : 'NOT_VERIFIED',
        customer:customer || null,
        location:location || null
      }
    }
  );

  const desiredCalendar = tmv3_desiredCalendarTitle_(previewRecord);

  let currentTaskName = '';
  let currentTaskReadStatus = contract.taskId
    ? 'NOT_READ'
    : 'NO_TASK';

  if (contract.taskId) {
    try {
      const task = tmv3_getTaskById_(contract.taskId);
      currentTaskName = tmv3_clean_(task && task['Name']);
      currentTaskReadStatus = 'FRESH_TASK_GET';
    } catch (err) {
      currentTaskReadStatus =
        'TASK_READ_FAILED: ' +
        String(err && err.message || err);
    }
  }

  const desiredTask = tmv3_desiredTaskName_(
    previewRecord,
    { sourceTaskTitle:currentTaskName }
  );

  const currentCalendarTitle = tmv3_clean_(
    bundle.eventRecord && bundle.eventRecord.title
  );
  const rawDescription = String(
    bundle.eventRecord &&
    (
      bundle.eventRecord.rawDescription !== undefined
        ? bundle.eventRecord.rawDescription
        : bundle.eventRecord.description
    ) || ''
  );

  const descriptionPlan =
    desiredCalendar.status === 'READY'
      ? tmv3_titleDescriptionPlan_(
          currentCalendarTitle,
          desiredCalendar.value,
          rawDescription,
          {
            preserveOldTitle:
              previewRecord.vertical !== 'PreInspection'
          }
        )
      : {
          status:'NOT_PLANNED',
          before:rawDescription,
          after:rawDescription,
          titleChange:false,
          descriptionChange:false,
          alreadyPreserved:false,
          reason:desiredCalendar.reason || ''
        };

  return {
    jev:'JEV NOT USED — DETERMINISTIC',
    calendar:{
      currentTitle:currentCalendarTitle,
      desiredTitle:desiredCalendar.value || '',
      desiredStatus:desiredCalendar.status,
      desiredSource:desiredCalendar.source || '',
      check:
        desiredCalendar.status === 'READY'
          ? (
              currentCalendarTitle === tmv3_clean_(desiredCalendar.value)
                ? 'MATCH'
                : 'MISMATCH'
            )
          : desiredCalendar.status,
      blocker:
        desiredCalendar.status === 'BLOCKED'
          ? desiredCalendar.reason
          : '',
      description:{
        preservationStatus:descriptionPlan.status,
        action:
          descriptionPlan.descriptionChange
            ? 'PREPEND_OLD_TITLE_PLUS_ONE_BLANK_LINE'
            : 'NO_DESCRIPTION_CHANGE',
        alreadyPreserved:descriptionPlan.alreadyPreserved === true,
        currentLength:rawDescription.length,
        proposedLength:String(descriptionPlan.after || '').length,
        currentHash:tmv3_hash_(rawDescription),
        proposedHash:tmv3_hash_(String(descriptionPlan.after || ''))
      }
    },
    task:{
      taskId:contract.taskId || '',
      taskStatus:contract.taskStatus || '',
      currentName:currentTaskName,
      currentReadStatus:currentTaskReadStatus,
      desiredName:desiredTask.value || '',
      desiredStatus:desiredTask.status,
      desiredSource:desiredTask.source || '',
      check:
        !contract.taskId
          ? 'CREATE_USES_CANONICAL_NAME'
          : (
              desiredTask.status === 'READY'
                ? (
                    currentTaskName === tmv3_clean_(desiredTask.value)
                      ? 'MATCH'
                      : 'MISMATCH'
                  )
                : desiredTask.status
            ),
      blocker:
        desiredTask.status === 'BLOCKED'
          ? desiredTask.reason
          : ''
    },
    identitySources:{
      customerId:contract.expectedCustomerId || '',
      locationId:contract.expectedLocationId || '',
      orderId:contract.expectedOrderId || '',
      customerName:tmv3_clean_(customer && customer['Name']),
      customerNumber:tmv3_clean_(customer && customer['Customer Number']),
      locationAddress:tmv3_titleLocationDisplay_(location),
      authority:'STEP7_VERIFIED_IDS + CURRENT_SOURCE_TABLES'
    }
  };
}

function tmv3_previewSelectedAction() {
  const selection = tmv3_step7FreshSelectedContract_();
  const contract = tmv3_step7ValidateExecutionContract_(
    selection.contract
  );
  const publishedPlan = tmv3_clean_(selection.previousPlan);
  const planChanged =
    !publishedPlan ||
    publishedPlan !== tmv3_clean_(contract.plan);
  const locationCreatePending =
    (contract.actions || []).indexOf(
      TMV3_STEP7_ACTION.CREATE_LOCATION
    ) !== -1;

  const locationCreateSupported =
    !locationCreatePending ||
    (
      contract.vertical === 'PreInspection' &&
      !!tmv3_clean_(contract.expectedLocationAddress)
    );

  const titleNormalization =
    tmv3_titleNormalizationPreview_(contract);

  const output = {
    mode:'READ_ONLY',
    authority:'STEP7_CANONICAL_CONTRACT',
    vertical:contract.vertical,
    eventId:contract.eventId,
    taskId:contract.taskId || '',
    publishedPlan:publishedPlan,
    plan:contract.plan,
    planChanged:planChanged,
    blocker:contract.blocker || '',
    actions:(contract.actions || []).slice(),
    identifiers:{
      customerId:contract.expectedCustomerId || '',
      locationId:contract.expectedLocationId || '',
      orderId:contract.expectedOrderId || '',
      requestedById:contract.expectedRequestedById || '',
      requestedByType:contract.expectedRequestedByType || ''
    },
    schedule:{
      start:contract.expectedStart || '',
      due:contract.expectedDue || ''
    },
    desiredAssignment:{
      employeeIds:(contract.desiredAssignmentEmployeeIds || []).slice(),
      poolIds:(contract.desiredAssignmentPoolIds || []).slice()
    },
    titleNormalization:titleNormalization,
    mutationPreview:{
      authorizedByPlan:
        !planChanged &&
        !tmv3_clean_(contract.blocker) &&
        (contract.actions || []).length > 0 &&
        locationCreateSupported,
      externalWriteCurrentlyEnabled:
        tmv3_operationWritesEnabled_('MANUAL'),
      locationCreatePending:locationCreatePending,
      locationCreateSupported:locationCreateSupported,
      expectedLocationAddress:contract.expectedLocationAddress || '',
      expectedTerminalPlan:'NO_CHANGE'
    },
    manualWritesEnabled:tmv3_operationWritesEnabled_('MANUAL'),
    automationWritesEnabled:tmv3_operationWritesEnabled_('AUTO')
  };
  Logger.log(JSON.stringify(output, null, 2));
  return output;
}

function tmv3_syncSelectedAppointment() {
  const selection = tmv3_step7FreshSelectedContract_();
  const result = tmv3_executeFreshStep7Selection_(
    selection,
    'MANUAL',
    'ALL'
  );
  tmv3_refreshOperatorAfterManual_();
  return result;
}

function tmv3_pushSelectedDates() {
  const selection = tmv3_step7FreshSelectedContract_();
  const result = tmv3_executeFreshStep7Selection_(
    selection,
    'MANUAL',
    'DATES'
  );
  tmv3_refreshOperatorAfterManual_();
  return result;
}

function tmv3_pushSelectedRelationships() {
  const selection = tmv3_step7FreshSelectedContract_();
  const result = tmv3_executeFreshStep7Selection_(
    selection,
    'MANUAL',
    'RELATIONSHIPS'
  );
  tmv3_refreshOperatorAfterManual_();
  return result;
}

function tmv3_reconcileSelectedAssignee() {
  const selection = tmv3_step7FreshSelectedContract_();
  const result = tmv3_executeFreshStep7Selection_(
    selection,
    'MANUAL',
    'ASSIGNEE'
  );
  tmv3_refreshOperatorAfterManual_();
  return result;
}

function tmv3_fixSelectedCalendarLinks() {
  const selection = tmv3_step7FreshSelectedContract_();
  const result = tmv3_executeFreshStep7Selection_(
    selection,
    'MANUAL',
    'LINKS'
  );
  tmv3_refreshOperatorAfterManual_();
  return result;
}

function tmv3_createOrRecreateSelectedTask() {
  const selection = tmv3_step7FreshSelectedContract_();
  const contract = selection.contract;
  const isCreate =
    contract.actions.indexOf(
      TMV3_STEP7_ACTION.CREATE_TASK
    ) !== -1 ||
    contract.actions.indexOf(
      TMV3_STEP7_ACTION.RECREATE_TASK
    ) !== -1;

  if (!isCreate) {
    const notAuthorized = {
      status:'STEP7_ACTION_NOT_AUTHORIZED_NO_WRITE',
      plan:contract.plan,
      eventId:contract.eventId,
      taskId:contract.taskId || '',
      reason:
        'Fresh Step 7 does not authorize CREATE / RECREATE for this row.'
    };
    tmv3_audit_(
      contract.vertical,
      contract.eventId,
      contract.taskId || '',
      'STEP7_CREATE_GUARD',
      'NO_WRITE',
      JSON.stringify(notAuthorized)
    );
    return notAuthorized;
  }

  const result = tmv3_executeFreshStep7Selection_(
    selection,
    'MANUAL',
    'ALL'
  );
  tmv3_refreshOperatorAfterManual_();
  return result;
}

function tmv3_canaryWriteEventAllowed_(eventRecord) {
  const policy = tmv3_operationPolicy_();

  if (TMV3.MODE !== 'CANARY_WRITE') return true;

  const eventId = tmv3_clean_(policy.canaryEventId);
  const vertical = tmv3_clean_(policy.canaryVertical);
  const allowedDate = tmv3_clean_(policy.canaryDate);
  const eventStart = eventRecord && eventRecord.start
    ? new Date(eventRecord.start)
    : null;
  const eventDate =
    eventStart && !isNaN(eventStart.getTime())
      ? Utilities.formatDate(
          eventStart,
          TMV3_TIMEZONE,
          'yyyy-MM-dd'
        )
      : '';

  if (!eventId || !allowedDate) return false;

  return (
    tmv3_clean_(eventRecord && eventRecord.eventId) === eventId &&
    (!vertical || tmv3_clean_(eventRecord && eventRecord.vertical) === vertical) &&
    eventDate === allowedDate
  );
}

function tmv3_runSafeReadyRows_(scope) {
  const policy = tmv3_operationPolicy_();
  const maxWrites = Number(policy.autoMaxWritesPerRun || 10);
  const isAuto = tmv3_norm_(scope) === 'auto';

  if (isAuto && !tmv3_operationWritesEnabled_('AUTO')) {
    tmv3_audit_(
      'SYSTEM','','','AUTO_WRITE_CYCLE','GATED',
      'Scheduled external writes remain disabled.'
    );
    return {
      status:'AUTO_WRITES_GATED',
      writes:0
    };
  }

  const events = tmv3_calendarRecords_().filter(function(eventRecord) {
    return tmv3_canaryWriteEventAllowed_(eventRecord);
  });
  const results = [];

  for (
    let i = 0;
    i < events.length && results.length < maxWrites;
    i++
  ) {
    const eventRecord = events[i];
    let contracts = [];

    try {
      contracts = tmv3_step7FreshPlansForEvent_(
        eventRecord.vertical,
        eventRecord.eventId
      ).filter(function(contract) {
        return (
          !tmv3_clean_(contract.blocker) &&
          (contract.actions || []).length > 0
        );
      });
    } catch (err) {
      results.push({
        vertical:eventRecord.vertical,
        eventId:eventRecord.eventId,
        status:'ATTENTION',
        error:String(err && err.message || err)
      });
      continue;
    }

    for (
      let j = 0;
      j < contracts.length && results.length < maxWrites;
      j++
    ) {
      const contract = contracts[j];

      try {
        const one = tmv3_executeFreshStep7Selection_(
          {
            previousPlan:contract.plan,
            contract:contract
          },
          scope,
          'ALL'
        );

        results.push({
          vertical:contract.vertical,
          eventId:contract.eventId,
          taskId:one.taskId || contract.taskId || '',
          status:one.status
        });
      } catch (err) {
        tmv3_audit_(
          contract.vertical,
          contract.eventId,
          contract.taskId || '',
          'SAFE_READY_ROW',
          'ATTENTION',
          String(err && err.message || err)
        );

        results.push({
          vertical:contract.vertical,
          eventId:contract.eventId,
          taskId:contract.taskId || '',
          status:'ATTENTION',
          error:String(err && err.message || err)
        });
      }
    }
  }

  tmv3_shadowMapFromCache();

  return {
    status:'COMPLETE',
    scope:scope,
    writes:results.filter(function(item) {
      return /VERIFIED|CREATED/.test(
        String(item.status || '')
      );
    }).length,
    attempts:results.length,
    results:results
  };
}

function tmv3_runSafeReadyRows_MANUAL() {
  return tmv3_runSafeReadyRows_('MANUAL');
}

function tmv3_configuredCanaryContractDecision_(contract, policy) {
  contract = tmv3_step7ValidateExecutionContract_(contract);
  policy = policy || {};

  const expectedCustomerId = tmv3_clean_(
    policy.canaryExpectedCustomerId
  );
  const expectedLocationId = tmv3_clean_(
    policy.canaryExpectedLocationId
  );
  const expectedAction = tmv3_clean_(
    policy.canaryExpectedAction
  );
  const actualCustomerId = tmv3_clean_(
    contract.expectedCustomerId
  );
  const actualLocationId = tmv3_clean_(
    contract.expectedLocationId
  );
  const actions = Array.isArray(contract.actions)
    ? contract.actions.slice()
    : [];
  const taskId = Number(contract.taskId || 0);

  if (actualCustomerId !== expectedCustomerId) {
    throw new Error(
      'Configured canary Customer mismatch. Expected ' +
      expectedCustomerId + ', fresh Step 7 resolved ' +
      actualCustomerId + '.'
    );
  }

  if (actualLocationId !== expectedLocationId) {
    throw new Error(
      'Configured canary Location mismatch. Expected ' +
      expectedLocationId + ', fresh Step 7 resolved ' +
      actualLocationId + '.'
    );
  }

  if (!actions.length) {
    return {
      status:'CONVERGED_NO_CHANGE',
      execute:false,
      taskId:taskId || '',
      actions:actions
    };
  }

  if (taskId) {
    if (
      actions.indexOf(TMV3_STEP7_ACTION.CREATE_TASK) !== -1 ||
      actions.indexOf(TMV3_STEP7_ACTION.RECREATE_TASK) !== -1
    ) {
      throw new Error(
        'Configured canary duplicate protection stopped CREATE/RECREATE because fresh Step 7 already resolved Task ' +
        taskId + '.'
      );
    }

    return {
      status:'RECONCILE_EXISTING_TASK',
      execute:true,
      taskId:taskId,
      actions:actions
    };
  }

  if (actions.indexOf(expectedAction) === -1) {
    throw new Error(
      'Configured canary expected initial action ' +
      expectedAction + ' is not authorized by fresh Step 7. Fresh plan: ' +
      contract.plan + '.'
    );
  }

  return {
    status:'EXECUTE_INITIAL_CANARY',
    execute:true,
    taskId:'',
    actions:actions
  };
}

function tmv3_runConfiguredCanary_(scope) {
  const normalizedScope = tmv3_norm_(scope || '');

  if (normalizedScope !== 'manual' && normalizedScope !== 'auto') {
    throw new Error(
      'Configured canary scope must be MANUAL or AUTO.'
    );
  }

  tmv3_assertOperationWrite_(scope);

  if (TMV3.MODE !== 'CANARY_WRITE') {
    throw new Error(
      'Configured canary runner is available only in CANARY_WRITE mode.'
    );
  }

  TMV3_CANARY_API_ALLOWANCE_ACTIVE = true;

  try {
    return tmv3_runConfiguredCanaryWithAllowance_(scope);
  } finally {
    TMV3_CANARY_API_ALLOWANCE_ACTIVE = false;
  }
}

function tmv3_runConfiguredCanary_MANUAL() {
  return tmv3_runConfiguredCanary_('MANUAL');
}

function tmv3_runConfiguredCanary_AUTO() {
  return tmv3_runConfiguredCanary_('AUTO');
}

function tmv3_runConfiguredCanaryWithAllowance_(scope) {
  const policy = tmv3_operationPolicy_();
  const vertical = tmv3_clean_(policy.canaryVertical);
  const eventId = tmv3_clean_(policy.canaryEventId);
  const expectedCustomerId = tmv3_clean_(
    policy.canaryExpectedCustomerId
  );
  const expectedLocationId = tmv3_clean_(
    policy.canaryExpectedLocationId
  );
  const expectedAction = tmv3_clean_(
    policy.canaryExpectedAction
  );

  if (
    !TMV3.VERTICALS[vertical] ||
    !eventId ||
    !expectedCustomerId ||
    !expectedLocationId ||
    !expectedAction
  ) {
    throw new Error(
      'Configured canary is incomplete. Vertical, Event ID, Customer ID, Location ID and expected action are required.'
    );
  }

  const eventRecord = tmv3_findFreshEventRecord_(
    vertical,
    eventId
  );

  if (!tmv3_canaryWriteEventAllowed_(eventRecord)) {
    throw new Error(
      'Configured canary event/date/vertical guard rejected the fresh Calendar event.'
    );
  }

  const plans = tmv3_step7FreshPlansForEvent_(
    vertical,
    eventId
  );
  const eligible = plans.filter(function(contract) {
    return !tmv3_clean_(contract.blocker);
  });

  if (eligible.length !== 1) {
    throw new Error(
      'Configured canary requires exactly one unblocked fresh Step 7 contract; found ' +
      eligible.length + '.'
    );
  }

  const contract = tmv3_step7ValidateExecutionContract_(
    eligible[0]
  );
  const decision = tmv3_configuredCanaryContractDecision_(
    contract,
    policy
  );

  tmv3_audit_(
    vertical,
    eventId,
    contract.taskId || '',
    'CONFIGURED_CANARY_GUARD',
    'PASS',
    JSON.stringify({
      scope:tmv3_clean_(scope),
      plan:contract.plan,
      expectedCustomerId:expectedCustomerId,
      expectedLocationId:expectedLocationId,
      expectedAction:expectedAction,
      decision:decision.status,
      actions:decision.actions
    })
  );

  if (!decision.execute) {
    return {
      status:'CONVERGED_NO_CHANGE',
      scope:tmv3_clean_(scope),
      vertical:vertical,
      eventId:eventId,
      taskId:decision.taskId || '',
      writes:0,
      attempts:1
    };
  }

  return tmv3_executeFreshStep7Selection_(
    {
      previousPlan:contract.plan,
      contract:contract
    },
    scope,
    'ALL'
  );
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
    tmv3_audit_(
      'SYSTEM','','','AUTO_CALENDAR_LINK_CYCLE','GATED',
      'Scheduled Calendar writes remain disabled.'
    );
    return {
      status:'AUTO_WRITES_GATED',
      writes:0
    };
  }

  const events = tmv3_calendarRecords_().filter(function(eventRecord) {
    return tmv3_canaryWriteEventAllowed_(eventRecord);
  });
  const results = [];
  const limit = Number(
    tmv3_operationPolicy_().autoMaxWritesPerRun || 10
  );

  for (
    let i = 0;
    i < events.length && results.length < limit;
    i++
  ) {
    const eventRecord = events[i];
    let contracts = [];

    try {
      contracts = tmv3_step7FreshPlansForEvent_(
        eventRecord.vertical,
        eventRecord.eventId
      ).filter(function(contract) {
        return (
          !tmv3_clean_(contract.blocker) &&
          Number(contract.taskId || 0) > 0 &&
          (contract.actions || []).indexOf(
            TMV3_STEP7_ACTION.VERIFY_CALENDAR_LINKS
          ) !== -1
        );
      });
    } catch (err) {
      results.push({
        eventId:eventRecord.eventId,
        vertical:eventRecord.vertical,
        status:'ATTENTION',
        error:String(err && err.message || err)
      });
      continue;
    }

    for (
      let j = 0;
      j < contracts.length && results.length < limit;
      j++
    ) {
      const contract = contracts[j];

      try {
        const write = tmv3_executeFreshStep7Selection_(
          {
            previousPlan:contract.plan,
            contract:contract
          },
          'AUTO',
          'LINKS'
        );

        results.push({
          eventId:contract.eventId,
          vertical:contract.vertical,
          taskId:contract.taskId,
          status:write.status
        });
      } catch (err) {
        tmv3_audit_(
          contract.vertical,
          contract.eventId,
          contract.taskId || '',
          'AUTO_CALENDAR_LINK',
          'ATTENTION',
          String(err && err.message || err)
        );

        results.push({
          eventId:contract.eventId,
          vertical:contract.vertical,
          taskId:contract.taskId || '',
          status:'ATTENTION',
          error:String(err && err.message || err)
        });
      }
    }
  }

  return {
    status:'COMPLETE',
    writes:results.length,
    results:results
  };
}



/************************************************************
 * TM V3 — PRE-INSPECTION MISSING-DETAIL NOTIFICATION PREVIEW
 *
 * Current policy:
 * - Missing-data checks only. Formatting differences alone never notify.
 * - At least one Sales Order reference anywhere in the event is sufficient.
 * - Recipient is the Calendar event creator, not the Calendar owner.
 * - EMAIL DELIVERY IS INTENTIONALLY DISABLED. These functions only build
 *   preview data / HTML for verification.
 ************************************************************/

function tmv3_preInspectionGuestEmails_(eventRecord) {
  return tmv3_unique_(
    String(eventRecord && eventRecord.guests || '')
      .split(',')
      .map(function(value) { return tmv3_norm_(value); })
      .filter(Boolean)
  );
}

function tmv3_preInspectionHasSalesOrderReference_(eventRecord) {
  const record = eventRecord || {};
  if (tmv3_clean_(record.orderNumber)) return true;

  const haystack = [
    record.title || '',
    record.descriptionClean || '',
    record.rawDescription || '',
    record.location || ''
  ].join(' ');

  // Accept labelled SO / Sales Order / Order references, including compact
  // slash notation such as SO#5853/67/80/85. We only care that the event
  // carries at least one Sales Order reference; no specific formatting is
  // required.
  return /\b(?:SO|S\/O|Sales\s*Order|Order)\s*(?:#|No\.?|Number)?\s*[:\-]?\s*\d{4,8}(?:\s*\/\s*\d{2,8})*/i.test(
    String(haystack || '')
  );
}

function tmv3_preInspectionCreatorEmail_(eventRecord) {
  const sources = []
    .concat(eventRecord && eventRecord.sourceCreators || [])
    .concat(String(eventRecord && eventRecord.creator || '').split(','))
    .map(function(value) { return tmv3_clean_(value).toLowerCase(); })
    .filter(Boolean);

  const company = sources.filter(function(email) {
    return /@classicfireplace\.ca$/i.test(email);
  });

  return (company[0] || sources[0] || '');
}

function tmv3_preInspectionCreatorFirstName_(email) {
  const local = tmv3_clean_(email).split('@')[0] || '';
  if (!local) return 'there';

  const token = local
    .split(/[._\-]+/)
    .filter(Boolean)[0] || '';

  return token
    ? token.charAt(0).toUpperCase() + token.slice(1).toLowerCase()
    : 'there';
}

function tmv3_preInspectionMissingDetailAssessment_(eventRecord) {
  const record = eventRecord || {};
  const cfg = TMV3.VERTICALS.PreInspection;
  const title = tmv3_clean_(record.title);

  const titleCustomerNumber =
    tmv3_extractCustomerNumberForVertical_('PreInspection', title);
  const titlePhone = tmv3_extractPhone_(title);
  const titleCustomerName =
    tmv3_preInspectionCalendarCustomerName_(title, titleCustomerNumber);

  const guests = tmv3_preInspectionGuestEmails_(record);
  const requiredStephen = tmv3_norm_(
    cfg.secondaryOwnerEmail || 'stephen@classicfireplace.ca'
  );
  const requiredPreInspects = tmv3_norm_(cfg.primaryCalendarId || '');

  const missing = [];

  if (!titleCustomerNumber) {
    missing.push({
      code:'CUSTOMER_NUMBER',
      field:'Title',
      message:'Customer # is missing from the title'
    });
  }

  if (!titleCustomerName) {
    missing.push({
      code:'CUSTOMER_NAME',
      field:'Title',
      message:'Customer Name is missing from the title'
    });
  }

  if (!titlePhone) {
    missing.push({
      code:'PHONE',
      field:'Title',
      message:'Phone number is missing from the title'
    });
  }

  if (!tmv3_clean_(record.location)) {
    missing.push({
      code:'LOCATION',
      field:'Location',
      message:'Job-site address is missing from the event'
    });
  }

  if (!tmv3_preInspectionHasSalesOrderReference_(record)) {
    missing.push({
      code:'SALES_ORDER',
      field:'Description',
      message:'At least one Sales Order # is missing from the event'
    });
  }

  if (requiredStephen && guests.indexOf(requiredStephen) === -1) {
    missing.push({
      code:'STEPHEN_GUEST',
      field:'Guests',
      message:'Stephen Foley is missing as a guest — please add him to the event'
    });
  }

  if (requiredPreInspects && guests.indexOf(requiredPreInspects) === -1) {
    missing.push({
      code:'CF_PREINSPECTS_GUEST',
      field:'Guests',
      message:'CF Preinspects is missing as a guest — please add it to the event'
    });
  }

  return {
    eventId: record.eventId || '',
    title: title,
    creatorEmail: tmv3_preInspectionCreatorEmail_(record),
    missing: missing,
    shouldNotify: missing.length > 0
  };
}

function tmv3_preInspectionHtmlEscape_(value) {
  return String(value === null || value === undefined ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function tmv3_preInspectionDisplayGuests_(eventRecord) {
  const guests = tmv3_preInspectionGuestEmails_(eventRecord);
  if (!guests.length) return 'No guests added';

  return guests.map(function(email) {
    if (email === tmv3_norm_(TMV3.VERTICALS.PreInspection.secondaryOwnerEmail)) {
      return 'Stephen Foley';
    }
    if (email === tmv3_norm_(TMV3.VERTICALS.PreInspection.primaryCalendarId)) {
      return 'CF Preinspects';
    }
    return email;
  }).join('<br>');
}

function tmv3_preInspectionMissingFields_(assessment) {
  const fields = {};
  (assessment.missing || []).forEach(function(item) {
    fields[item.field] = true;
  });
  return fields;
}

function tmv3_preInspectionComparisonRowsHtml_(eventRecord, assessment) {
  const fields = tmv3_preInspectionMissingFields_(assessment);
  const rows = [];

  if (fields.Title) {
    rows.push(
      '<tr>' +
        '<td valign="top" style="background:#f7f7f7;padding:12px;font-weight:700;border-right:1px solid #dddddd;border-bottom:1px solid #dddddd;">Title</td>' +
        '<td valign="top" style="padding:12px;color:#a1262b;border-right:1px solid #dddddd;border-bottom:1px solid #dddddd;">' +
          tmv3_preInspectionHtmlEscape_(eventRecord.title || '—') +
        '</td>' +
        '<td valign="top" style="padding:12px;color:#2f6b36;border-bottom:1px solid #dddddd;">Customer # - Customer Name - Phone Number</td>' +
      '</tr>'
    );
  }

  if (fields.Description) {
    rows.push(
      '<tr>' +
        '<td valign="top" style="background:#f7f7f7;padding:12px;font-weight:700;border-right:1px solid #dddddd;border-bottom:1px solid #dddddd;">Description</td>' +
        '<td valign="top" style="padding:12px;color:#a1262b;border-right:1px solid #dddddd;border-bottom:1px solid #dddddd;">' +
          tmv3_preInspectionHtmlEscape_(
            eventRecord.descriptionClean || eventRecord.rawDescription || 'No description'
          ) +
        '</td>' +
        '<td valign="top" style="padding:12px;color:#2f6b36;border-bottom:1px solid #dddddd;"><strong>Sales Order #:</strong> SO#<br><strong>Notes:</strong> Notes about the Pre-Inspection</td>' +
      '</tr>'
    );
  }

  if (fields.Location) {
    rows.push(
      '<tr>' +
        '<td valign="top" style="background:#f7f7f7;padding:12px;font-weight:700;border-right:1px solid #dddddd;border-bottom:1px solid #dddddd;">Location</td>' +
        '<td valign="top" style="padding:12px;color:#a1262b;border-right:1px solid #dddddd;border-bottom:1px solid #dddddd;">' +
          tmv3_preInspectionHtmlEscape_(eventRecord.location || 'No location entered') +
        '</td>' +
        '<td valign="top" style="padding:12px;color:#2f6b36;border-bottom:1px solid #dddddd;">Full job-site address</td>' +
      '</tr>'
    );
  }

  if (fields.Guests) {
    rows.push(
      '<tr>' +
        '<td valign="top" style="background:#f7f7f7;padding:12px;font-weight:700;border-right:1px solid #dddddd;">Guests</td>' +
        '<td valign="top" style="padding:12px;color:#a1262b;border-right:1px solid #dddddd;">' +
          tmv3_preInspectionDisplayGuests_(eventRecord) +
        '</td>' +
        '<td valign="top" style="padding:12px;color:#2f6b36;">Stephen Foley<br>CF Preinspects</td>' +
      '</tr>'
    );
  }

  return rows.join('');
}

function tmv3_preInspectionNotificationCc_() {
  return [
    'jay@classicfireplace.ca',
    'thang@classicfireplace.ca'
  ];
}

function tmv3_preInspectionMissingDetailEmailPreview_(eventRecord) {
  const assessment = tmv3_preInspectionMissingDetailAssessment_(eventRecord);
  if (!assessment.shouldNotify) return null;

  const creatorEmail = assessment.creatorEmail;
  const firstName = tmv3_preInspectionCreatorFirstName_(creatorEmail);
  const missingItemsHtml = assessment.missing.map(function(item) {
    return '<div>❌ ' + tmv3_preInspectionHtmlEscape_(item.message) + '</div>';
  }).join('');

  const when =
    Utilities.formatDate(eventRecord.start, TMV3_TIMEZONE, 'MMM d, yyyy') +
    ' · ' +
    Utilities.formatDate(eventRecord.start, TMV3_TIMEZONE, 'h:mm a') +
    ' – ' +
    Utilities.formatDate(eventRecord.end, TMV3_TIMEZONE, 'h:mm a');

  const html =
    '<!doctype html><html lang="en"><body style="margin:0;padding:0;background:#f4f3f1;font-family:Arial,Helvetica,sans-serif;color:#222;">' +
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr><td align="center" style="padding:20px 12px;">' +
    '<table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px;background:#ffffff;">' +
    '<tr><td style="background:#202020;border-top:4px solid #b42b2f;padding:18px 24px;">' +
      '<div style="font-size:18px;font-weight:700;color:#ffffff;">Pre-Inspection Update Required</div>' +
      '<div style="font-size:12px;color:#aaaaaa;margin-top:3px;">Classic Fireplace &amp; BBQ Store</div>' +
    '</td></tr>' +
    '<tr><td style="padding:20px 24px 12px;">' +
      '<div style="font-size:14px;line-height:21px;">Hi <strong>' + tmv3_preInspectionHtmlEscape_(firstName) + '</strong>,</div>' +
      '<div style="font-size:14px;line-height:21px;margin-top:8px;">This appointment is missing required Pre-Inspection details. Please update the items below.</div>' +
      '<div style="margin-top:12px;background:#fff5f5;border-left:4px solid #b42b2f;padding:11px 13px;font-size:13px;line-height:22px;color:#8f2024;">' +
        missingItemsHtml +
      '</div>' +
    '</td></tr>' +
    '<tr><td style="padding:0 24px 14px;"><table width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f6f5f3;border:1px solid #e2e0dc;"><tr><td style="padding:12px 14px;">' +
      '<div style="font-size:15px;font-weight:700;">' + tmv3_preInspectionHtmlEscape_(eventRecord.title || '(Untitled event)') + '</div>' +
      '<div style="font-size:12px;color:#666;margin-top:4px;">' + tmv3_preInspectionHtmlEscape_(when) + '</div>' +
      (eventRecord.location ? '<div style="font-size:12px;color:#666;margin-top:4px;">' + tmv3_preInspectionHtmlEscape_(eventRecord.location) + '</div>' : '') +
    '</td></tr></table></td></tr>' +
    '<tr><td style="padding:0 24px 20px;"><table width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;border:1px solid #dddddd;font-size:13px;">' +
      '<tr>' +
        '<td width="18%" style="background:#f3f3f3;padding:10px 12px;border-right:1px solid #dddddd;border-bottom:1px solid #dddddd;"></td>' +
        '<td width="41%" style="background:#fff1f1;color:#9b1c1f;font-weight:700;padding:10px 12px;border-right:1px solid #dddddd;border-bottom:1px solid #dddddd;">What it is now</td>' +
        '<td width="41%" style="background:#f1f8f1;color:#28632f;font-weight:700;padding:10px 12px;border-bottom:1px solid #dddddd;">What it should be</td>' +
      '</tr>' +
      tmv3_preInspectionComparisonRowsHtml_(eventRecord, assessment) +
    '</table></td></tr>' +
    '<tr><td style="padding:0 24px 22px;"><div style="font-size:14px;">Thank you.</div></td></tr>' +
    '<tr><td style="background:#202020;padding:12px 24px;text-align:center;"><div style="font-size:12px;font-weight:700;color:#ffffff;">Classic Fireplace &amp; BBQ Store</div></td></tr>' +
    '</table></td></tr></table></body></html>';

  return {
    eventId: eventRecord.eventId || '',
    recipient: creatorEmail,
    cc: tmv3_preInspectionNotificationCc_(),
    subject: 'Pre-Inspection Update Required',
    missing: assessment.missing,
    htmlBody: html,
    emailDeliveryEnabled: false,
    approvalRequiredBeforeSend: true
  };
}

function tmv3_preInspectionMissingDetailPreviewFromRecords_(records) {
  const preInspection = (records || []).filter(function(record) {
    return record && record.vertical === 'PreInspection';
  });

  const previews = preInspection
    .map(tmv3_preInspectionMissingDetailEmailPreview_)
    .filter(Boolean);

  return {
    status:'PREVIEW_ONLY_NO_EMAILS',
    checked:preInspection.length,
    wouldNotify:previews.length,
    previews:previews
  };
}

function tmv3_previewPreInspectionMissingDetailEmails() {
  const result = tmv3_preInspectionMissingDetailPreviewFromRecords_(
    tmv3_step1CalendarRecords_()
  );

  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

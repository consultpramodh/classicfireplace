/************************************************************
 * TM V3 — GUARDED WRITE ENGINE
 ************************************************************/

function tmv3_writesEnabled_() {
  return TMV3.MODE === 'CANARY_WRITE' || TMV3.MODE === 'PRODUCTION_WRITE';
}

function tmv3_assertBusinessWritesEnabled_() {
  if (!tmv3_writesEnabled_()) {
    throw new Error('TM V3 external write blocked. Current mode: ' + TMV3.MODE);
  }
}

function tmv3_buildTaskPatchPayload_(eventRecord, resolved, currentTask) {
  if (!eventRecord || !resolved || !currentTask) {
    throw new Error('Event, resolved identity and current Task are required.');
  }

  const cfg = TMV3.VERTICALS[eventRecord.vertical];
  const payload = {
    Id: Number(currentTask['Task ID']),
    StartDateTime: tmv3_iso_(eventRecord.start),
    DueDateTime: tmv3_iso_(eventRecord.end)
  };

  const locationId = Number(resolved.locationId || 0);
  const orderId = Number(resolved.orderId || 0);
  const contactId = Number(resolved.contactId || 0);

  if (locationId) payload.Location = { Id: locationId };

  if (cfg.orderRequired && orderId) {
    payload.SalesOrder = { Id: orderId };
  }

  if (eventRecord.vertical !== 'PreInspection' && contactId) {
    payload.RequestedBy = { Id: contactId, Type: 'contact' };
  }

  if (eventRecord.vertical === 'PreInspection') {
    delete payload.SalesOrder;

    const requestedBy = tmv3_resolveOrganizerEmployee_(eventRecord);
    if (requestedBy.status !== 'MATCHED') {
      throw new Error(requestedBy.reason || 'PreInspection Requested By unresolved.');
    }

    payload.RequestedBy = {
      Id: Number(requestedBy.employee.id),
      Name: requestedBy.employee.name || '',
      Type: 'employee'
    };
  }

  return payload;
}

function tmv3_buildAssignmentPlan_(eventRecord, currentTask) {
  const desired = tmv3_desiredAssignment_(eventRecord);
  const currentAssigneeText = tmv3_norm_(currentTask && currentTask['Assignees']);
  const currentPoolText = tmv3_norm_(currentTask && currentTask['Pools']);

  const addEmployeeIds = (desired.employeeIds || []).filter(function(id) {
    const name = tmv3_employeeNameById_(id);
    return (
      currentAssigneeText.indexOf(String(id)) === -1 &&
      (!name || currentAssigneeText.indexOf(tmv3_norm_(name)) === -1)
    );
  });

  const addPoolIds = (desired.poolIds || []).filter(function(id) {
    const cfg = TMV3.VERTICALS[eventRecord.vertical];
    const poolName = cfg.defaultPoolName || '';
    return (
      currentPoolText.indexOf(String(id)) === -1 &&
      (!poolName || currentPoolText.indexOf(tmv3_norm_(poolName)) === -1)
    );
  });

  return {
    addEmployeeIds: addEmployeeIds,
    addPoolIds: addPoolIds,
    desiredEmployeeIds: desired.employeeIds || [],
    desiredPoolIds: desired.poolIds || []
  };
}

function tmv3_employeeNameById_(employeeId) {
  const id = Number(employeeId || 0);
  const known = {
    1: 'Jay Scott',
    6: 'Pramodh',
    9: 'Thang',
    15: 'Stephen Foley',
    18: 'John Hoang',
    20: 'Spencer',
    26: 'Matthew Thompson',
    38: 'Travis Mason',
    39: 'Chris Olomojobi'
  };
  return known[id] || '';
}

function tmv3_safeTaskPatchPayload_(payload, taskId) {
  const allowed = {
    Id: true,
    StartDateTime: true,
    DueDateTime: true,
    SalesOrder: true,
    Location: true,
    RequestedBy: true,
    Title: true,
    Description: true
  };

  const safe = { Id: Number(taskId) };

  Object.keys(payload || {}).forEach(function(key) {
    if (!allowed[key]) {
      throw new Error('Blocked unknown Task PATCH field: ' + key);
    }
    if (key === 'Id') return;
    const value = payload[key];
    if (value === undefined || value === null || value === '') return;
    safe[key] = value;
  });

  return safe;
}

function tmv3_patchTaskById_(taskId, payload) {
  tmv3_assertBusinessWritesEnabled_();

  const id = Number(taskId || 0);
  if (!id) throw new Error('Task ID is required.');

  const safe = tmv3_safeTaskPatchPayload_(payload, id);
  if (Object.keys(safe).length <= 1) {
    return { status: 'NOT_NEEDED', taskId: id, payload: safe };
  }

  tmv3_fetchJson_(
    TMV3.API_BASE + '/v2/tasks/' + encodeURIComponent(id),
    {
      method: 'patch',
      contentType: 'application/json',
      payload: JSON.stringify(safe)
    }
  );

  return {
    status: 'PATCHED_READBACK_REQUIRED',
    taskId: id,
    payload: safe,
    readback: tmv3_getTaskById_(id)
  };
}

function tmv3_addAssignment_(taskId, id, type, name) {
  tmv3_assertBusinessWritesEnabled_();

  return tmv3_fetchJson_(
    TMV3.API_BASE + '/v2/tasks/' + encodeURIComponent(Number(taskId)) + '/assignments',
    {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({
        Id: Number(id),
        Name: name || '',
        Type: type
      })
    }
  );
}

function tmv3_applyAssignmentPlan_(taskId, plan) {
  tmv3_assertBusinessWritesEnabled_();

  const results = [];

  (plan.addEmployeeIds || []).forEach(function(id) {
    results.push({
      type: 'employee',
      id: Number(id),
      response: tmv3_addAssignment_(taskId, id, 'employee', tmv3_employeeNameById_(id))
    });
  });

  (plan.addPoolIds || []).forEach(function(id) {
    const poolName = Number(id) === 8
      ? 'Pre-Inspection Pool'
      : (Number(id) === 4 ? 'To Be Assigned' : '');

    results.push({
      type: 'pool',
      id: Number(id),
      response: tmv3_addAssignment_(taskId, id, 'pool', poolName)
    });
  });

  return results;
}

function tmv3_previewTaskMutation_(eventRecord, resolved, refs) {
  if (!resolved || !resolved.status) {
    throw new Error('Resolved record is required.');
  }

  if (['REVIEW','BLOCKED','IGNORED'].indexOf(resolved.status) !== -1) {
    return {
      allowed: false,
      action: 'NONE',
      reason: resolved.issue || resolved.status
    };
  }

  if (resolved.status === 'MATCHED') {
    return {
      allowed: true,
      action: 'NONE',
      reason: 'Already verified.'
    };
  }

  if (resolved.taskId) {
    const currentTask = refs.taskById[String(resolved.taskId)] ||
      tmv3_getTaskById_(resolved.taskId);

    return {
      allowed: true,
      action: 'PATCH_TASK',
      taskId: Number(resolved.taskId),
      payload: tmv3_buildTaskPatchPayload_(eventRecord, resolved, currentTask),
      assignments: tmv3_buildAssignmentPlan_(eventRecord, currentTask),
      calendarLinksAfterTaskVerification: true
    };
  }

  if (eventRecord.vertical === 'PreInspection' && resolved.status === 'READY CREATE') {
    const requestedBy = tmv3_resolveOrganizerEmployee_(eventRecord);

    if (requestedBy.status !== 'MATCHED') {
      return {
        allowed: false,
        action: 'NONE',
        reason: requestedBy.reason
      };
    }

    return {
      allowed: true,
      action: 'CREATE_PREINSPECTION_TASK',
      sourceTemplateTaskId: 11138,
      invariant: {
        taskTypeId: 105,
        salesOrderAttached: false,
        description: '',
        field854: 'NO_WRITE',
        technicianFields: 'DO_NOT_PREFILL'
      },
      event: {
        startDateTime: tmv3_iso_(eventRecord.start),
        dueDateTime: tmv3_iso_(eventRecord.end)
      },
      customerId: Number(resolved.customerId),
      locationId: Number(resolved.locationId),
      requestedBy: {
        Id: Number(requestedBy.employee.id),
        Name: requestedBy.employee.name || '',
        Type: 'employee'
      },
      assignments: tmv3_desiredAssignment_(eventRecord),
      calendarLinksAfterTaskVerification: true
    };
  }

  return {
    allowed: false,
    action: resolved.status === 'READY RECREATE'
      ? 'RECREATE_PENDING_SOURCE_TEMPLATE'
      : 'CREATE_PENDING_VERTICAL_TEMPLATE',
    reason: 'CREATE source template is not yet proven for this vertical. Write remains blocked.'
  };
}

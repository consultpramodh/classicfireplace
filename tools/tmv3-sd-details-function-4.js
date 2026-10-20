function tmv3_reconcileTaskAssignments_(eventRecord, taskId, scope, options) {
  options = options || {};
  tmv3_assertOperationWrite_(scope, 'TASK_DETAIL_ASSIGNMENT');

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

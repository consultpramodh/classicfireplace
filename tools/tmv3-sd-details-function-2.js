function tmv3_operationPatchTask_(taskId, payload, scope) {
  tmv3_assertOperationWrite_(scope, 'TASK_RELATIONSHIP_PATCH');
  const id = Number(taskId || 0);
  if (!id) throw new Error('Task ID is required.');
  const normalizedScope = tmv3_norm_(scope);
  if (normalizedScope === 'taskfirstproduction' || normalizedScope === 'taskfirstcanary19083') {
    const allowed = ['Id','SalesOrder','RequestedBy','Location'];
    if (!Number.isSafeInteger(id) || id <= 0 || Number((payload || {}).Id) !== id ||
        Object.keys(payload || {}).some(function(key) { return allowed.indexOf(key) < 0; }) ||
        (normalizedScope === 'taskfirstcanary19083' && id !== Number(TMV3.OPERATIONS.taskFirstCanaryTaskId))) {
      throw new Error('RELATIONSHIP_ONLY_SCOPE: Exact Task ID and relationship-only payload required.');
    }
    if (normalizedScope === 'taskfirstcanary19083' && (
        Boolean(payload.Location) ||
        (payload.SalesOrder && Number(payload.SalesOrder.Id) !== Number(TMV3.OPERATIONS.taskFirstCanaryExpectedOrderId)) ||
        (payload.RequestedBy && (Number(payload.RequestedBy.Id) !== Number(TMV3.OPERATIONS.taskFirstCanaryExpectedContactId) ||
          payload.RequestedBy.Type !== 'contact')))) {
      throw new Error('RELATIONSHIP_ONLY_SCOPE: Canary payload differs from the exact approved tuple.');
    }
  }

  if (normalizedScope === 'servicedeliverydetails') {
    const context = tmv3_taskFirstProductionCycle_.detailContext;
    const allowed = ['Id','SalesOrder','RequestedBy','Location','StartDateTime','DueDateTime'];
    if (!context || Number(context.taskId) !== id ||
        Number((payload || {}).Id) !== id ||
        Object.keys(payload || {}).some(function(k){return allowed.indexOf(k)<0;}) ||
        JSON.stringify(payload) !== JSON.stringify(context.payload)) {
      throw new Error('TASK_DETAILS_PAYLOAD_OUTSIDE_FRESH_CONTRACT');
    }
  }

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

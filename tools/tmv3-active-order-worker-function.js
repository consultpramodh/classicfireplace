function tmv3_taskFirstProductionCycle_() {
  const policy = tmv3_operationPolicy_();
  if (!tmv3_operationWritesEnabled_('taskfirstproduction')) {
    return {status:'TASK_FIRST_PRODUCTION_GATED',writes:0};
  }

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return {status:'LOCK_BUSY',writes:0};

  try {
    const props = PropertiesService.getScriptProperties();
    const lastKey = 'TMV3_TASK_FIRST_PRODUCTION_LAST_ATTEMPT_MS';
    const cursorKey = 'TMV3_TASK_FIRST_PRODUCTION_CURSOR';
    const last = Number(props.getProperty(lastKey) || 0);
    const now = Date.now();
    const interval = Math.max(60,
      Number(policy.taskFirstProductionIntervalMinutes || 60)) * 60000;
    if (last && now - last < interval) {
      return {status:'THROTTLED',writes:0};
    }

    // Read cached business anchors at zero Striven API cost.
    const orderMap = {};
    tmv3_rows_(TMV3.SHEETS.ORDERS).forEach(function(row) {
      const number = tmv3_clean_(row['Order Number']);
      const id = tmv3_clean_(row['Order ID']);
      if (!number || !/^[1-9]\d*$/.test(id)) return;
      if (!orderMap[number]) orderMap[number] = [];
      orderMap[number].push(row);
    });
    const candidates = tmv3_rows_(TMV3.SHEETS.TASKS)
      .filter(function(row) {
        const type = tmv3_norm_(row['Task Type']);
        const status = tmv3_norm_(row['Status']);
        return status === 'open' &&
          (type.indexOf('service') !== -1 || type.indexOf('delivery') !== -1) &&
          // SO 586061 / 27795 was explicitly identified as canceled by the operator.
          !/\bSO\s*#\s*586061\b/i.test(tmv3_clean_(row['Name'])) &&
          Number.isSafeInteger(Number(row['Task ID'])) && Number(row['Task ID']) > 0 &&
          (!tmv3_clean_(row['Order ID']) || !tmv3_clean_(row['Contact ID'])) &&
          /\bSO\s*#\s*\d{4,9}\b/i.test(tmv3_clean_(row['Name']));
      })
      .sort(function(a,b) {
        return Number(b['Task ID'] || 0)-Number(a['Task ID'] || 0);
      });
    if (!candidates.length) {
      props.setProperty(lastKey,String(now));
      return {status:'NO_CACHED_CANDIDATES',writes:0};
    }
    let cursor = Number(props.getProperty(cursorKey) || 0);
    if (!Number.isSafeInteger(cursor) || cursor < 0) cursor = 0;
    cursor = cursor % candidates.length;
    const source = candidates[cursor];
    props.setProperty(cursorKey,String((cursor + 1) % candidates.length));
    // Throttle even after failure; repeated exceptions must not burn API calls.
    props.setProperty(lastKey,String(now));

    const taskId = Number(source['Task ID']);
    const title = tmv3_clean_(source['Name']);
    const marker = title.match(/\bSO\s*#\s*(\d{4,9})\b/i);
    const vertical = tmv3_norm_(source['Task Type']).indexOf('delivery') !== -1
      ? 'Delivery' : 'Service';
    const match = marker ? (orderMap[marker[1]] || []).filter(function(order) {
      return tmv3_step3OrderMatchesVertical_(order, vertical);
    }) : [];
    if (match.length !== 1) {
      const reason = match.length ? 'AMBIGUOUS_WORK_ORDER' : 'WORK_ORDER_NOT_IN_CACHE';
      tmv3_audit_(vertical,'',String(taskId),'TASK_FIRST_AUTO','REVIEW',reason);
      return {status:'REVIEW',taskId:taskId,reason:reason,writes:0};
    }

    let repairStarted = false;
    try {
      const live = tmv3_rawTaskById_(taskId);
      const normalized = tmv3_normalizeV2TaskModel_(live);
      const liveCustomerId = tmv3_clean_(normalized['Customer ID']);
      const liveOrderId = tmv3_clean_(normalized['Order ID']);
      const liveType = tmv3_norm_(normalized['Task Type']);
      if (tmv3_clean_(normalized['Task ID']) !== String(taskId) ||
          (vertical === 'Service' && liveType.indexOf('service') < 0) ||
          (vertical === 'Delivery' && liveType.indexOf('deliver') < 0) ||
          !tmv3_taskIsOpen_(normalized['Status']) ||
          !/^[1-9]\d*$/.test(liveCustomerId)) {
        return {status:'REVIEW_TASK_STATUS_OR_CUSTOMER',taskId:taskId,writes:0};
      }
      // Persist the fresh GET locally so report omissions do not cause
      // repeated per-task reads on already-correct relationships.
      tmv3_upsertTaskCacheRow_(normalized);

      // A live relationship that appeared since cache refresh takes priority.
      if (liveOrderId && liveOrderId !== tmv3_clean_(match[0]['Order ID'])) {
        return {status:'REVIEW_EXISTING_ORDER_CONFLICT',taskId:taskId,writes:0};
      }

      // Work Order identity must be independently proven from Striven, never
      // inferred solely from the task name or stale Source Orders cache.
      const id = Number(match[0]['Order ID']);
      let proof;
      try {
        proof = tmv3_taskFirstFreshOrderOwnershipById_(id,liveCustomerId,title);
      } catch (err) {
        const reason = String(err && err.message || err);
        tmv3_audit_(vertical,'',String(taskId),'TASK_FIRST_AUTO','REVIEW',reason);
        return {status:'REVIEW_ORDER_NOT_VERIFIED_ACTIVE',taskId:taskId,writes:0,reason:reason,requiresReadback:false,writeOutcome:'NOT_ATTEMPTED'};
      }
      const contactId = proof.contactId;
      // Missing/conflicting Contact remains REVIEW in the guarded writer;
      // it must not prevent an independently safe Order relationship repair.

      // Keep an existing location; do not invent or update location fields.
      repairStarted = true;
      const result = tmv3_repairExistingTaskRelationships(
        taskId,vertical,
        {customerId:liveCustomerId,orderId:String(id),
          contactId:contactId,locationId:''},
        'TASK_FIRST_PRODUCTION'
      );
      tmv3_audit_(vertical,'',String(taskId),'TASK_FIRST_AUTO',
        (result.status === 'PATCHED_AND_VERIFIED' || result.status === 'NO_CHANGE_VERIFIED')
          ? 'PASS' : 'REVIEW',JSON.stringify(result));
      return result;
    } catch(err) {
      const message = String(err && err.message || err);
      tmv3_audit_(vertical,'',String(taskId),'TASK_FIRST_AUTO','ATTENTION',message);
      return {
        status:'ATTENTION',taskId:taskId,error:message,
        writes:repairStarted ? null : 0,
        writeOutcome:repairStarted ? 'UNKNOWN_RECONCILE_BEFORE_RETRY' : 'NOT_ATTEMPTED',
        requiresReadback:repairStarted
      };
    }
  } finally {
    lock.releaseLock();
  }
}

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

    let detailWriteStarted=false;
    // The existing native timer owns both lanes and their shared one-hour budget.
    // Calendar-backed existing Tasks get full safe details; unscheduled Tasks
    // continue through the relationship-only fallback below.
    function detailActions(plan) {
      return (plan.actions || []).filter(function(action) {
        return ['PATCH_LOCATION','PATCH_ORDER','PATCH_REQUESTED_BY',
          'PATCH_DATES','PATCH_ASSIGNMENTS'].indexOf(action) >= 0;
      });
    }
    function executeDetails(plan, record, guardKey) {
      plan = tmv3_step7ValidateExecutionContract_(plan);
      if (['Service','Delivery'].indexOf(plan.vertical)<0 || !plan.taskId || plan.blocker ||
          (plan.actions || []).some(function(a){return /CREATE|RECREATE/.test(a);})) {
        throw new Error('EXISTING_SERVICE_DELIVERY_DETAILS_ONLY');
      }
      if (!/^[1-9]\d*$/.test(String(plan.expectedOrderId || '')) ||
          !/^[1-9]\d*$/.test(String(plan.expectedLocationId || '')) ||
          !/^[1-9]\d*$/.test(String(plan.expectedRequestedById || '')) ||
          tmv3_norm_(plan.expectedRequestedByType)!=='contact' ||
          !/^\d+$/.test(String(record.orderNumber || ''))) {
        throw new Error('TASK_DETAILS_REQUIRED_RELATIONSHIPS_UNRESOLVED');
      }
      tmv3_taskFirstFreshOrderOwnershipById_(plan.expectedOrderId,
        plan.expectedCustomerId,'SO#'+record.orderNumber);
      tmv3_step7FreshLocationOwnership_(plan);
      const contact=tmv3_getContactById_(plan.expectedRequestedById,plan.expectedCustomerId);
      if (!contact || contact.__ownershipVerified!==true) throw new Error('TASK_DETAILS_CONTACT_OWNERSHIP');
      const beforeRaw=tmv3_rawTaskById_(plan.taskId);
      const before=tmv3_normalizeV2TaskModel_(beforeRaw);
      const requested=tmv3_step7RequestedByFromRaw_(beforeRaw);
      if (String(before['Task ID'])!==String(plan.taskId) ||
          !tmv3_taskIsOpen_(before['Status']) ||
          tmv3_clean_(before['Customer ID'])!==String(plan.expectedCustomerId) ||
          (plan.vertical==='Service' && tmv3_norm_(before['Task Type']).indexOf('service')<0) ||
          (plan.vertical==='Delivery' && tmv3_norm_(before['Task Type']).indexOf('deliver')<0)) {
        throw new Error('TASK_DETAILS_TASK_IDENTITY_CHANGED');
      }
      [['Order ID',plan.expectedOrderId],['Location ID',plan.expectedLocationId]].forEach(function(pair){
        if (tmv3_clean_(before[pair[0]]) && tmv3_clean_(before[pair[0]])!==String(pair[1])) {
          throw new Error('TASK_DETAILS_EXISTING_RELATIONSHIP_CONFLICT');
        }
      });
      if (tmv3_clean_(requested.id) && (tmv3_clean_(requested.id)!==String(plan.expectedRequestedById) ||
          tmv3_norm_(requested.type)!=='contact')) throw new Error('TASK_DETAILS_REQUESTED_BY_CONFLICT');
      const actions=detailActions(plan);
      const scoped=Object.assign({},plan,{actions:actions});
      const payload=tmv3_step7RelationshipPayload_(scoped);
      if (actions.indexOf('PATCH_DATES')>=0) {
        const start=new Date(plan.expectedStart),due=new Date(plan.expectedDue);
        if (!Number.isFinite(start.getTime()) || !Number.isFinite(due.getTime()) || due<=start ||
            !tmv3_sameMinute_(start,record.start) || !tmv3_sameMinute_(due,record.end)) {
          throw new Error('TASK_DETAILS_CALENDAR_DATES_UNVERIFIED');
        }
        Object.assign(payload,tmv3_step7DatePayload_(scoped));
      }
      const desired=tmv3_step7DesiredAssignmentFromContract_(plan);
      const freshRecord=tmv3_findFreshEventRecord_(plan.vertical,plan.eventId);
      if (!record.fingerprint || freshRecord.fingerprint!==record.fingerprint) {
        throw new Error('TASK_DETAILS_CALENDAR_CHANGED_NO_WRITE');
      }
      const assignmentsBefore=tmv3_taskAssignmentsFromRaw_(beforeRaw);
      props.setProperty(guardKey,JSON.stringify({state:'INTENT',taskId:plan.taskId,
        fingerprint:record.fingerprint,at:now}));
      tmv3_taskFirstProductionCycle_.detailContext={vertical:plan.vertical,
        taskId:Number(plan.taskId),payload:payload,desiredAssignment:desired};
      try {
        if (Object.keys(payload).length>1) {detailWriteStarted=true;tmv3_operationPatchTask_(plan.taskId,payload,'SERVICEDELIVERYDETAILS');}
        if (actions.indexOf('PATCH_ASSIGNMENTS')>=0) {
          detailWriteStarted=true;
          tmv3_reconcileTaskAssignments_(record,plan.taskId,'SERVICEDELIVERYDETAILS',{desiredAssignment:desired});
        }
        const afterRaw=tmv3_rawTaskById_(plan.taskId);
        const after=tmv3_normalizeV2TaskModel_(afterRaw);
        const assignmentsAfter=tmv3_taskAssignmentsFromRaw_(afterRaw);
        if (String(after['Task ID'])!==String(plan.taskId) ||
            tmv3_clean_(after['Customer ID'])!==String(plan.expectedCustomerId) ||
            after['Task Type']!==before['Task Type'] || after['Status']!==before['Status'] ||
            after['Name']!==before['Name'] ||
            JSON.stringify(afterRaw.description || afterRaw.Description || '')!==
              JSON.stringify(beforeRaw.description || beforeRaw.Description || '') ||
            !assignmentsBefore.filter(function(a){return !(a.type==='pool' && Number(a.id)===4 && desired.employeeIds.length);})
              .every(function(a){return assignmentsAfter.some(function(b){return a.type===b.type && Number(a.id)===Number(b.id);});})) {
          throw new Error('TASK_DETAILS_UNRELATED_FIELDS_READBACK_MISMATCH');
        }
        const afterPlan=tmv3_step7FreshExecutionContract_(plan.vertical,plan.eventId,plan.taskId);
        if (afterPlan.blocker || detailActions(afterPlan).length ||
            String(afterPlan.expectedOrderId)!==String(plan.expectedOrderId) ||
            String(afterPlan.expectedLocationId)!==String(plan.expectedLocationId) ||
            String(afterPlan.expectedRequestedById)!==String(plan.expectedRequestedById) ||
            String(afterPlan.expectedStart)!==String(plan.expectedStart) ||
            String(afterPlan.expectedDue)!==String(plan.expectedDue)) {
          throw new Error('TASK_DETAILS_FRESH_PLAN_READBACK_NOT_VERIFIED');
        }
        props.setProperty(guardKey,JSON.stringify({state:'VERIFIED',taskId:plan.taskId,
          fingerprint:record.fingerprint,at:Date.now()}));
        tmv3_upsertTaskCacheRow_(after);
        return {status:'TASK_DETAILS_PATCHED_AND_VERIFIED',taskId:plan.taskId,
          vertical:plan.vertical,eventId:plan.eventId,actions:actions,writes:1,readbackVerified:true};
      } finally {delete tmv3_taskFirstProductionCycle_.detailContext;}
    }
    function detailCycle() {
    const eventQueues=['Service','Delivery'].map(function(vertical){
      const cfg=TMV3.VERTICALS && TMV3.VERTICALS[vertical];
      return cfg ? tmv3_rows_(cfg.sheet).filter(function(row){return !!tmv3_clean_(row['Event ID']);})
        .map(function(row){return {vertical:vertical,eventId:tmv3_clean_(row['Event ID'])};}) : [];
    });
    const detailEvents=[],seenEvents={};
    for(let q=0;q<Math.max(eventQueues[0].length,eventQueues[1].length);q++) {
      eventQueues.forEach(function(queue){
        const event=queue[q];if(!event)return;
        const key=event.vertical+'|'+event.eventId;
        if(!seenEvents[key]){seenEvents[key]=true;detailEvents.push(event);}
      });
    }
    const detailCursorKey='TMV3_SD_DETAILS_EVENT_CURSOR';
    let detailCursor=Number(props.getProperty(detailCursorKey)||0);
    if(!Number.isSafeInteger(detailCursor)||detailCursor<0)detailCursor=0;
    for(let j=0;j<Math.min(4,detailEvents.length);j++) {
      const item=detailEvents[(detailCursor+j)%detailEvents.length];
      props.setProperty(detailCursorKey,String((detailCursor+j+1)%detailEvents.length));
      try {
        const record=tmv3_findFreshEventRecord_(item.vertical,item.eventId);
        if(String(record.orderNumber)==='586061')continue;
        const plans=tmv3_step7FreshPlansForEvent_(item.vertical,item.eventId);
        for(let k=0;k<plans.length;k++) {
          const plan=plans[k];
          if(!plan.taskId || plan.blocker || (plan.actions||[]).some(function(a){return /CREATE|RECREATE/.test(a);}))continue;
          const guardKey='TMV3_SD_DETAILS_'+tmv3_hash_(item.vertical+'|'+item.eventId+'|'+plan.taskId);
          const guard=JSON.parse(props.getProperty(guardKey)||'null');
          if(!detailActions(plan).length) {
            if(guard && guard.state==='INTENT')props.setProperty(guardKey,JSON.stringify({state:'VERIFIED_AFTER_RECONCILIATION',taskId:plan.taskId,at:now}));
            continue;
          }
          if(guard && guard.state==='INTENT') {
            tmv3_audit_(item.vertical,item.eventId,String(plan.taskId),'TASK_DETAILS_AUTO','REVIEW','UNCERTAIN_PRIOR_WRITE_RECONCILE_BEFORE_RETRY');
            continue;
          }
          props.setProperty(lastKey,String(now));
          const result=executeDetails(plan,record,guardKey);
          tmv3_audit_(item.vertical,item.eventId,String(plan.taskId),'TASK_DETAILS_AUTO','PASS',JSON.stringify(result));
          return result;
        }
      } catch(err) {
        tmv3_audit_(item.vertical,item.eventId,'','TASK_DETAILS_AUTO',detailWriteStarted?'ATTENTION':'REVIEW',String(err && err.message || err));
        // Once an event transaction was reserved, do not spend another write slot.
        if(Number(props.getProperty(lastKey)||0)===now)return {status:'TASK_DETAILS_ATTENTION',writes:detailWriteStarted?null:0,requiresReadback:detailWriteStarted};
      }
    }

      return null;
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
    const unlinked=candidates.filter(function(row){return !tmv3_clean_(row['Order ID']);});
    if (unlinked.length) candidates.splice(0,candidates.length,...unlinked);
    else {const details=detailCycle();if(details)return details;}
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
    const titleOrder = tmv3_taskFirstTitleOrderNumber_(title);
    if (titleOrder.status !== 'UNIQUE') {
      tmv3_audit_('SYSTEM','',String(taskId),'TASK_FIRST_AUTO','REVIEW','TASK_TITLE_SO_'+titleOrder.status);
      return {status:'REVIEW_TASK_TITLE_SO',taskId:taskId,writes:0};
    }
    const vertical = tmv3_norm_(source['Task Type']).indexOf('delivery') !== -1
      ? 'Delivery' : 'Service';
    const match = (orderMap[titleOrder.number] || []).filter(function(order) {
      return tmv3_step3OrderMatchesVertical_(order, vertical);
    }).filter(function(order,index,all){return all.findIndex(function(other){
      return tmv3_clean_(other['Order ID'])===tmv3_clean_(order['Order ID']);
    })===index;});
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
      const freshTitleOrder=tmv3_taskFirstTitleOrderNumber_(normalized['Name']);
      if (freshTitleOrder.status!=='UNIQUE' || freshTitleOrder.number!==titleOrder.number) {
        return {status:'REVIEW_TASK_TITLE_CHANGED',taskId:taskId,writes:0};
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
        proof = tmv3_taskFirstFreshOrderOwnershipById_(id,liveCustomerId,normalized['Name']);
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

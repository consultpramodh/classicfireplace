function tmv3_repairExistingTaskRelationships(taskId, vertical, expected, permission) {
  const id = Number(taskId);
  const kind = tmv3_clean_(vertical);
  expected = expected || {};
  if (!Number.isSafeInteger(id) || id <= 0 ||
      (kind !== 'Service' && kind !== 'Delivery')) {
    throw new Error('Only positive existing Service/Delivery Task IDs are permitted.');
  }
  const scope = permission === 'TASK_FIRST_PRODUCTION'
    ? 'taskfirstproduction'
    : (permission === 'TASK_FIRST_CANARY' &&
      id === Number(TMV3.OPERATIONS.taskFirstCanaryTaskId)
      ? 'taskfirstcanary19083' : 'manual');
  tmv3_assertOperationWrite_(scope, 'TASK_RELATIONSHIP_REPAIR');

  const customerId = tmv3_clean_(expected.customerId);
  const orderId = tmv3_clean_(expected.orderId);
  const locationId = tmv3_clean_(expected.locationId);
  const contactId = tmv3_clean_(expected.contactId);
  if (scope === 'taskfirstcanary19083' && (
    customerId !== String(TMV3.OPERATIONS.taskFirstCanaryExpectedCustomerId) ||
    orderId !== String(TMV3.OPERATIONS.taskFirstCanaryExpectedOrderId) ||
    contactId !== String(TMV3.OPERATIONS.taskFirstCanaryExpectedContactId) ||
    locationId
  )) throw new Error('Canary relationship IDs are not the approved exact tuple.');

  const validId = function(v) { return /^[1-9]\d*$/.test(v); };
  if (!validId(customerId) ||
      [orderId, locationId, contactId].some(function(v) {
        return Boolean(v) && !validId(v);
      }) || !(orderId || locationId || contactId)) {
    throw new Error('Verified Customer ID and at least one valid relationship ID are required.');
  }

  const source = tmv3_rows_(TMV3.SHEETS.TASKS).filter(function(row) {
    return Number(row['Task ID']) === id;
  });
  if (source.length !== 1 ||
      (kind === 'Service' && tmv3_norm_(source[0]['Task Type']).indexOf('service') < 0) ||
      (kind === 'Delivery' && tmv3_norm_(source[0]['Task Type']).indexOf('deliver') < 0)) {
    throw new Error('Source Tasks does not show exactly one correct-vertical Task.');
  }

  const beforeRaw = tmv3_rawTaskById_(id);
  const before = tmv3_normalizeV2TaskModel_(beforeRaw);
  const beforeBy = tmv3_step7RequestedByFromRaw_(beforeRaw);
  const beforeType = tmv3_norm_(before['Task Type']);
  if (tmv3_clean_(before['Task ID']) !== String(id) ||
      (kind === 'Service' && beforeType.indexOf('service') < 0) ||
      (kind === 'Delivery' && beforeType.indexOf('deliver') < 0) ||
      !tmv3_taskIsOpen_(before['Status']) ||
      tmv3_clean_(before['Customer ID']) !== customerId) {
    throw new Error('Task is not OPEN or Task Customer is unverified/mismatched.');
  }

  const fields = [
    {label:'ORDER', id:orderId, actual:tmv3_clean_(before['Order ID'])},
    {label:'LOCATION', id:locationId, actual:tmv3_clean_(before['Location ID'])},
    {label:'REQUESTED_BY', id:contactId, actual:tmv3_clean_(beforeBy.id)}
  ];
  const review = [];
  const changes = [];
  fields.forEach(function(field) {
    if (!field.id) {
      review.push(field.label + (field.actual
        ? '_EXPECTED_ID_UNRESOLVED' : '_UNRESOLVED'));
      return; // Presence alone does not verify identity or ownership.
    }
    if (field.actual && field.actual !== field.id) {
      review.push(field.label + '_CONFLICT');
      return;
    }
    if (field.label === 'REQUESTED_BY' && field.actual &&
        tmv3_norm_(beforeBy.type) !== 'contact') {
      review.push('REQUESTED_BY_TYPE_CONFLICT');
      return;
    }
    try {
      if (field.label === 'ORDER') {
        tmv3_taskFirstFreshOrderOwnershipById_(
          field.id,customerId,tmv3_clean_(before['Name'])
        );
      } else if (field.label === 'LOCATION') {
        tmv3_step7FreshLocationOwnership_({
          expectedLocationId:field.id,expectedCustomerId:customerId
        });
      } else {
        const c = tmv3_getContactById_(field.id,customerId);
        if (!c || c.__ownershipVerified !== true) {
          throw new Error('Contact ownership unverified');
        }
      }
      if (!field.actual) changes.push(field);
    } catch (err) {
      if (field.label === 'ORDER' &&
          String(err && err.message || err).indexOf('ORDER_NOT_VERIFIED_ACTIVE') !== -1) {
        throw err; // Contact inferred from this Order must not bypass its lifecycle guard.
      }
      review.push(field.label + '_OWNERSHIP_NOT_VERIFIED');
    }
  });
  if (!changes.length) {
    const complete = !review.length &&
      Boolean(orderId) && Boolean(contactId) && Boolean(locationId) &&
      fields.filter(function(field) { return Boolean(field.id); })
        .every(function(field) { return field.actual === field.id; });
    const result = {
      status:complete ? 'NO_CHANGE_VERIFIED' : 'REVIEW_NO_SAFE_PATCH',
      taskId:id,vertical:kind,writes:0,review:review
    };
    tmv3_audit_(kind,'',String(id),'TASK_FIRST_RELATIONSHIP_VERIFY',
      complete ? 'PASS' : 'REVIEW',JSON.stringify(result));
    return result;
  }

  const payload = {Id:id};
  changes.forEach(function(field) {
    if (field.label === 'ORDER') payload.SalesOrder = {Id:Number(field.id)};
    if (field.label === 'LOCATION') payload.Location = {Id:Number(field.id)};
    if (field.label === 'REQUESTED_BY') {
      payload.RequestedBy = {Id:Number(field.id),Type:'contact'};
    }
  });

  // Guard against concurrent task changes; no blind overwrite or POST.
  const nowRaw = tmv3_rawTaskById_(id);
  const now = tmv3_normalizeV2TaskModel_(nowRaw);
  const nowBy = tmv3_step7RequestedByFromRaw_(nowRaw);
  if (tmv3_clean_(now['Task ID']) !== String(id) ||
      tmv3_clean_(now['Task Type']) !== tmv3_clean_(before['Task Type']) ||
      !tmv3_taskIsOpen_(now['Status']) ||
      tmv3_clean_(now['Customer ID']) !== customerId ||
      tmv3_clean_(now['Order ID']) !== tmv3_clean_(before['Order ID']) ||
      tmv3_clean_(now['Location ID']) !== tmv3_clean_(before['Location ID']) ||
      tmv3_clean_(nowBy.id) !== tmv3_clean_(beforeBy.id) ||
      tmv3_norm_(nowBy.type) !== tmv3_norm_(beforeBy.type)) {
    throw new Error('Task changed after ownership verification. No mutation.');
  }

  tmv3_operationPatchTask_(id,payload,scope);
  const afterRaw = tmv3_rawTaskById_(id);
  const after = tmv3_normalizeV2TaskModel_(afterRaw);
  const afterBy = tmv3_step7RequestedByFromRaw_(afterRaw);
  const verified = changes.every(function(field) {
    if (field.label === 'ORDER') {
      return tmv3_clean_(after['Order ID']) === field.id;
    }
    if (field.label === 'LOCATION') {
      return tmv3_clean_(after['Location ID']) === field.id;
    }
    return tmv3_clean_(afterBy.id) === field.id &&
      tmv3_norm_(afterBy.type) === 'contact';
  }) && fields.filter(function(field) {
    return !changes.some(function(change) { return change.label === field.label; });
  }).every(function(field) {
    const actual = field.label === 'ORDER' ? after['Order ID']
      : field.label === 'LOCATION' ? after['Location ID'] : afterBy.id;
    return tmv3_clean_(actual) === field.actual &&
      (field.label !== 'REQUESTED_BY' ||
        tmv3_norm_(afterBy.type) === tmv3_norm_(beforeBy.type));
  }) && tmv3_clean_(after['Customer ID']) === customerId &&
    tmv3_clean_(after['Task ID']) === String(id) &&
    tmv3_clean_(after['Task Type']) === tmv3_clean_(before['Task Type']) &&
    tmv3_clean_(after['Status']) === tmv3_clean_(before['Status']);
  const result = {
    status:verified ? (review.length ? 'PARTIAL_PATCH_VERIFIED' : 'PATCHED_AND_VERIFIED')
      : 'READBACK_MISMATCH',
    taskId:id,vertical:kind,writes:1,
    patchedFields:changes.map(function(c) {return c.label;}),
    review:review,readbackVerified:verified
  };
  tmv3_audit_(kind,'',String(id),'TASK_FIRST_RELATIONSHIP_PATCH',
    verified ? (review.length ? 'REVIEW' : 'PASS') : 'REVIEW',
    JSON.stringify(result));
  if (!verified) {
    throw new Error('Task-first PATCH read-back failed; do not blindly retry.');
  }
  return result;
}


/** One authoritative GET instead of downloading the entire Work Order report.
 * The order ID, customer ownership and SO number must all agree.
 */
function tmv3_taskFirstFreshOrderOwnershipById_(orderId, customerId, taskName) {
  const id = Number(orderId);
  const cid = tmv3_clean_(customerId);
  if (!Number.isSafeInteger(id) || id <= 0 || !/^[1-9]\d*$/.test(cid)) {
    throw new Error('Invalid task-first Order ownership target.');
  }
  const order = tmv3_fetchJson_(
    TMV3.API_BASE + '/v1/sales-orders/' + encodeURIComponent(id),
    {method:'get'}
  ) || {};
  const fetchedId = tmv3_clean_(tmv3_first_(order,['id','Id']));
  const customer = order.customer || order.Customer || {};
  const fetchedCustomerId = tmv3_clean_(tmv3_first_(customer,['id','Id']));
  const orderNumber = tmv3_clean_(tmv3_first_(order,
    ['orderNumber','OrderNumber','number','Number']));
  // Striven official Order Status IDs: Approved=22, In Progress=25.
  // Only fresh active-order evidence authorizes new relationships.
  const rawStatus = order.status !== undefined ? order.status : order.Status;
  const statusObject = rawStatus && typeof rawStatus === 'object' ? rawStatus : {};
  const statusId = tmv3_clean_(tmv3_first_(statusObject,['id','Id']) ||
    tmv3_first_(order,['statusId','StatusId']) ||
    (/^\d+$/.test(String(rawStatus)) ? rawStatus : ''));
  const statusName = tmv3_norm_(tmv3_first_(statusObject,['name','Name']) ||
    tmv3_first_(order,['statusName','StatusName']) ||
    (typeof rawStatus === 'string' ? rawStatus : ''));
  const known = {'18':'incomplete','19':'quoted','20':'pending approval',
    '21':'declined','22':'approved','23':'canceled','24':'lost','25':'in progress','27':'completed'};
  const normalizedName = statusName === 'cancelled' ? 'canceled' : statusName;
  const statusFromId = known[statusId] || '';
  if ((statusId && !statusFromId) ||
      (statusFromId && normalizedName && statusFromId !== normalizedName) ||
      ['approved','in progress'].indexOf(statusFromId || normalizedName) < 0) {
    throw new Error('ORDER_NOT_VERIFIED_ACTIVE: canceled, closed, unapproved, unknown or conflicting Order status.');
  }
  const nameMarker = tmv3_clean_(taskName)
    .match(/\bSO\s*#\s*(\d+)\b/i);
  if (fetchedId !== String(id) || fetchedCustomerId !== cid ||
      !nameMarker || !orderNumber || nameMarker[1] !== orderNumber) {
    throw new Error('Order ID, Customer ownership or Task SO number disagrees with fresh Striven Order.');
  }
  const contact = order.contact || order.Contact || {};
  const contactId = tmv3_clean_(tmv3_first_(contact,['id','Id']));
  return {verified:true,orderId:String(id),orderNumber:orderNumber,customerId:cid,
    status:statusFromId || normalizedName,contactId:/^[1-9]\d*$/.test(contactId) ? contactId : ''};
}


// Google Apps Script: one complete, customer-scoped read instead of the whole Location report.
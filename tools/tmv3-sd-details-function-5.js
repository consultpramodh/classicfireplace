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
    (typeof rawStatus === 'string' && !/^\d+$/.test(rawStatus) ? rawStatus : ''));
  const known = {'18':'incomplete','19':'quoted','20':'pending approval',
    '21':'declined','22':'approved','23':'canceled','24':'lost','25':'in progress','27':'completed'};
  const normalizedName = statusName === 'cancelled' ? 'canceled' : statusName;
  const statusFromId = known[statusId] || '';
  if ((statusId && !statusFromId) ||
      (statusFromId && normalizedName && statusFromId !== normalizedName) ||
      ['approved','in progress'].indexOf(statusFromId || normalizedName) < 0) {
    throw new Error('ORDER_NOT_VERIFIED_ACTIVE: canceled, closed, unapproved, unknown or conflicting Order status.');
  }
  const titleOrder = tmv3_taskFirstTitleOrderNumber_(taskName);
  if (fetchedId !== String(id) || fetchedCustomerId !== cid ||
      titleOrder.status !== 'UNIQUE' || !orderNumber || titleOrder.number !== orderNumber) {
    throw new Error('Order ID, Customer ownership or Task SO number disagrees with fresh Striven Order.');
  }
  const contact = order.contact || order.Contact || {};
  const contactId = tmv3_clean_(tmv3_first_(contact,['id','Id']));
  return {verified:true,orderId:String(id),orderNumber:orderNumber,customerId:cid,
    status:statusFromId || normalizedName,contactId:/^[1-9]\d*$/.test(contactId) ? contactId : ''};
}


// Google Apps Script: Task title is the Order-number key, never the Customer key.
function tmv3_taskFirstTitleOrderNumber_(title) {
  const text=String(title || '').replace(/https?:\/\/\S+/gi,' ');
  const pattern=/\bSO\s*#\s*(\d{4,9}(?!\d)(?:\s*(?:[/&,]|\band\b)\s*(?:SO\s*#\s*)?\d{4,9}(?!\d))*)/gi;
  const values=[];let match;
  while((match=pattern.exec(text))!==null) {
    (match[1].match(/\d{4,9}/g)||[]).forEach(function(n){if(values.indexOf(n)<0)values.push(n);});
  }
  return {status:values.length===1?'UNIQUE':values.length?'AMBIGUOUS':'MISSING',
    number:values.length===1?values[0]:'',numbers:values};
}

// Google Apps Script: one complete, customer-scoped read instead of the whole Location report.
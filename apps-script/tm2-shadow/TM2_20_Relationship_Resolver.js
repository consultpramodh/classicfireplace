function tm2_extractIdentityFromRow_(headers, row) {
  const map = tm2_headerMap_(headers);
  return {
    eventId: tm2_clean_(tm2_pick_(row, map, ['Event ID', 'Calendar Event ID', 'EventId'])),
    customerNumber: tm2_clean_(tm2_pick_(row, map, ['Customer Number', 'Customer #', 'CustomerNumber'])),
    customerId: tm2_clean_(tm2_pick_(row, map, ['Customer ID', 'CustomerId', 'Hidden CustomerId'])),
    salesOrderNumber: tm2_clean_(tm2_pick_(row, map, ['Sales Order #', 'Sales Order Number', 'SO #', 'SO Number'])),
    salesOrderId: tm2_clean_(tm2_pick_(row, map, ['Sales Order ID', 'SalesOrderId', 'Hidden SalesOrderId', 'Task SalesOrderId(s)'])),
    locationId: tm2_clean_(tm2_pick_(row, map, ['Location ID', 'LocationId', 'Hidden LocationId'])),
    contactId: tm2_clean_(tm2_pick_(row, map, ['Contact ID', 'ContactId', 'Hidden ContactId'])),
    taskId: tm2_clean_(tm2_pick_(row, map, ['Task ID', 'Task Id', 'TaskId', 'Task Id(s)'])),
    taskStatus: tm2_clean_(tm2_pick_(row, map, ['Task Status', 'TaskStatus', 'Task Status(es)'])),
    mappingStatus: tm2_clean_(tm2_pick_(row, map, ['Mapping Status', 'Status'])),
    push: tm2_clean_(tm2_pick_(row, map, ['Push', 'Push?', 'Push To Striven']))
  };
}

function tm2_relationshipEvidence_(identity) {
  return {
    hasEvent: !!identity.eventId,
    hasCustomerAnchor: !!(identity.customerNumber || identity.customerId),
    hasSalesOrderAnchor: !!(identity.salesOrderNumber || identity.salesOrderId),
    hasLocation: !!identity.locationId,
    hasContact: !!identity.contactId,
    hasTask: !!identity.taskId
  };
}

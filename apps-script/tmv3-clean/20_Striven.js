function tmv3_token_() {
  const cache = CacheService.getScriptCache();
  const cached = tmv3_clean_(cache.get('TMV3_STRIVEN_TOKEN'));
  if (cached) return cached;

  const clientId = tmv3_property_(TMV3.PROPERTIES.CLIENT_ID, true);
  const clientSecret = tmv3_property_(TMV3.PROPERTIES.CLIENT_SECRET, true);

  const response = UrlFetchApp.fetch(TMV3.API_BASE + '/accesstoken', {
    method: 'post',
    payload: {
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
      scope: 'api'
    },
    contentType: 'application/x-www-form-urlencoded',
    muteHttpExceptions: true
  });

  const code = response.getResponseCode();
  if (code < 200 || code >= 300) {
    throw new Error('Striven authentication failed HTTP ' + code + '.');
  }

  const body = JSON.parse(response.getContentText() || '{}');
  const token = tmv3_clean_(body.access_token);

  if (!token) {
    throw new Error('Striven authentication returned no access_token.');
  }

  const ttl = Math.max(
    60,
    Math.min(Number(body.expires_in || 3600) - 300, 3300)
  );

  cache.put('TMV3_STRIVEN_TOKEN', token, ttl);
  return token;
}

function tmv3_fetchJson_(url, options) {
  const opts = options || {};
  opts.muteHttpExceptions = true;
  opts.headers = Object.assign({
    Authorization: 'Bearer ' + tmv3_token_(),
    Accept: 'application/json'
  }, opts.headers || {});

  const response = UrlFetchApp.fetch(url, opts);
  const code = response.getResponseCode();
  const text = response.getContentText();

  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch (err) {}

  if (code < 200 || code >= 300) {
    throw new Error(
      'Striven request failed HTTP ' +
      code +
      ': ' +
      text.slice(0, 600)
    );
  }

  return json;
}

function tmv3_reportRows_(propertyAliases) {
  const baseUrl = tmv3_property_(propertyAliases, true);
  const all = [];

  for (let pageIndex = 0; pageIndex < TMV3.MAX_PAGES; pageIndex++) {
    const sep = baseUrl.indexOf('?') === -1 ? '?' : '&';
    const url =
      baseUrl +
      sep +
      'PageIndex=' +
      pageIndex +
      '&PageSize=' +
      TMV3.PAGE_SIZE;

    const json = tmv3_fetchJson_(url, { method: 'get' });
    const rows = tmv3_extractReportRows_(json);

    if (!rows.length) break;

    Array.prototype.push.apply(all, rows);

    if (rows.length < TMV3.PAGE_SIZE) break;
  }

  return all;
}

function tmv3_extractReportRows_(json) {
  if (!json) return [];
  if (Array.isArray(json)) return json;

  const keys = ['data','Data','rows','Rows','Items','items'];

  for (let i = 0; i < keys.length; i++) {
    if (Array.isArray(json[keys[i]])) {
      return json[keys[i]];
    }
  }

  return [];
}

function tmv3_refreshSources() {
  tmv3_assertShadow_();

  const customers =
    tmv3_reportRows_(TMV3.PROPERTIES.CUSTOMERS)
      .map(tmv3_normalizeCustomer_);

  const customerNumberToId = {};
  customers.forEach(function(r) {
    if (tmv3_clean_(r[1]) && tmv3_clean_(r[0])) {
      customerNumberToId[tmv3_clean_(r[1])] = tmv3_clean_(r[0]);
    }
  });

  const locations =
    tmv3_reportRows_(TMV3.PROPERTIES.LOCATIONS)
      .map(function(r) {
        return tmv3_normalizeLocation_(r, customerNumberToId);
      });

  const contacts =
    tmv3_reportRows_(TMV3.PROPERTIES.CONTACTS)
      .map(tmv3_normalizeContact_);

  const approved =
    tmv3_reportRows_(TMV3.PROPERTIES.APPROVED_ORDERS)
      .map(function(r) {
        return tmv3_normalizeOrder_(r, 'SALES_ORDER');
      });

  const deliveryApproved =
    tmv3_reportRows_(TMV3.PROPERTIES.DELIVERY_APPROVED_ORDERS)
      .map(function(r) {
        return tmv3_normalizeOrder_(r, 'DELIVERY_APPROVED');
      });

  const serviceOrders =
    tmv3_reportRows_(TMV3.PROPERTIES.SERVICE_WORK_ORDERS)
      .map(function(r) {
        return tmv3_normalizeOrder_(r, 'WORK_ORDER');
      });

  const orders = tmv3_mergeOrderRows_(
    approved.concat(deliveryApproved, serviceOrders)
  );

  const orderIdByNumber = {};
  orders.forEach(function(r) {
    if (tmv3_clean_(r[1]) && tmv3_clean_(r[0])) {
      orderIdByNumber[tmv3_clean_(r[1])] = tmv3_clean_(r[0]);
    }
  });

  const installTasks =
    tmv3_reportRows_(TMV3.PROPERTIES.INSTALL_TASKS)
      .map(function(r) {
        return tmv3_normalizeTask_(r, 'Install', orderIdByNumber);
      });

  const deliveryTasks =
    tmv3_reportRows_(TMV3.PROPERTIES.DELIVERY_TASKS)
      .map(function(r) {
        return tmv3_normalizeTask_(r, 'Delivery', orderIdByNumber);
      });

  const serviceTasks =
    tmv3_reportRows_(TMV3.PROPERTIES.SERVICE_TASKS)
      .map(function(r) {
        return tmv3_normalizeTask_(r, 'Service', orderIdByNumber);
      });

  const tasks = tmv3_dedupeObjects_(
    installTasks.concat(deliveryTasks, serviceTasks),
    function(r) {
      return r[0];
    }
  );

  tmv3_replaceRows_(
    TMV3.SHEETS.CUSTOMERS,
    [
      'Customer ID',
      'Customer Number',
      'Name',
      'Primary Phone',
      'Primary Email',
      'Fingerprint'
    ],
    customers
  );

  tmv3_replaceRows_(
    TMV3.SHEETS.LOCATIONS,
    [
      'Location ID',
      'Customer ID',
      'Address 1',
      'Address 2',
      'City',
      'Province',
      'Postal Code',
      'Phone',
      'Fingerprint'
    ],
    locations
  );

  tmv3_replaceRows_(
    TMV3.SHEETS.CONTACTS,
    [
      'Contact ID',
      'Customer ID',
      'Name',
      'Phone',
      'Email',
      'Fingerprint'
    ],
    contacts
  );

  tmv3_replaceRows_(
    TMV3.SHEETS.ORDERS,
    [
      'Order ID',
      'Order Number',
      'Customer ID',
      'Location ID',
      'Contact ID',
      'Status',
      'Name',
      'Order Type',
      'URL',
      'Fingerprint'
    ],
    orders
  );

  tmv3_replaceRows_(
    TMV3.SHEETS.TASKS,
    [
      'Task ID',
      'Task Number',
      'Task Type ID',
      'Task Type',
      'Status',
      'Name',
      'Customer ID',
      'Location ID',
      'Contact ID',
      'Order ID',
      'Start',
      'Due',
      'Assignees',
      'Pools',
      'URL',
      'Fingerprint'
    ],
    tasks
  );

  tmv3_audit_(
    'SYSTEM',
    '',
    '',
    'REFRESH_SOURCES',
    'PASS',
    'Customers ' +
      customers.length +
      '; Locations ' +
      locations.length +
      '; Contacts ' +
      contacts.length +
      '; Orders ' +
      orders.length +
      '; Tasks ' +
      tasks.length
  );

  return {
    customers: customers.length,
    locations: locations.length,
    contacts: contacts.length,
    orders: orders.length,
    tasks: tasks.length
  };
}

function tmv3_normalizeCustomer_(r) {
  const id =
    tmv3_first_(r, [
      'CustomerId',
      'Customer ID',
      'CustomerCustomerId',
      'Id',
      'AccountId',
      'Account ID'
    ]);

  const no =
    tmv3_first_(r, [
      'CustomerNumber',
      'Customer Number',
      'AccountNumber',
      'Account Number',
      'Customer #'
    ]);

  const name =
    tmv3_first_(r, [
      'CustomerName',
      'Customer Name',
      'FullName',
      'Name',
      'AccountName',
      'Account Name'
    ]);

  const phone =
    tmv3_first_(r, [
      'Phone',
      'Phone Number',
      'PrimaryPhone',
      'Primary Phone',
      'Mobile'
    ]);

  const email =
    tmv3_first_(r, [
      'Email',
      'Email Address',
      'PrimaryEmail',
      'Primary Email'
    ]);

  return [
    id,
    no,
    name,
    phone,
    email,
    tmv3_hash_([id,no,name,phone,email].join('|'))
  ];
}

function tmv3_normalizeLocation_(r, customerNumberToId) {
  const id =
    tmv3_first_(r, [
      'LocationId',
      'Location ID',
      'Id'
    ]);

  let customerId =
    tmv3_first_(r, [
      'CustomerId',
      'Customer ID',
      'CustomerCustomerId',
      'AccountId',
      'Account ID'
    ]);

  if (!customerId) {
    const customerNumber = tmv3_first_(r, ['CustomerNumber','Customer Number','Customer #']);
    customerId = customerNumberToId && customerNumber
      ? (customerNumberToId[tmv3_clean_(customerNumber)] || '')
      : '';
  }

  const a1 =
    tmv3_first_(r, [
      'Address1',
      'Address 1',
      'AddressFullAddress',
      'FullAddress',
      'Street',
      'Street1',
      'Street 1'
    ]);

  const a2 =
    tmv3_first_(r, [
      'Address2',
      'Address 2',
      'Street2',
      'Street 2'
    ]);

  const city = tmv3_first_(r, ['City']);
  const province = tmv3_first_(r, ['State','Province','State/Province']);
  const postal = tmv3_first_(r, ['PostalCode','Postal Code','AddressZip','Zip','ZIP']);
  const phone = tmv3_first_(r, ['Phone','Phone Number']);

  return [
    id,
    customerId,
    a1,
    a2,
    city,
    province,
    postal,
    phone,
    tmv3_hash_(
      [
        id,
        customerId,
        a1,
        a2,
        city,
        province,
        postal,
        phone
      ].join('|')
    )
  ];
}

function tmv3_normalizeContact_(r) {
  const id =
    tmv3_first_(r, [
      'ContactId',
      'Contact ID',
      'Id'
    ]);

  const customerId =
    tmv3_first_(r, [
      'CustomerId',
      'Customer ID',
      'CustomerCustomerId',
      'AccountId',
      'Account ID'
    ]);

  const name =
    tmv3_first_(r, [
      'ContactName',
      'Contact Name',
      'Name',
      'FullName',
      'Full Name'
    ]);

  const phone =
    tmv3_first_(r, [
      'Phone',
      'Phone Number',
      'Mobile'
    ]);

  const email =
    tmv3_first_(r, [
      'Email',
      'Email Address'
    ]);

  return [
    id,
    customerId,
    name,
    phone,
    email,
    tmv3_hash_(
      [
        id,
        customerId,
        name,
        phone,
        email
      ].join('|')
    )
  ];
}

function tmv3_normalizeOrder_(r, type) {
  const id =
    tmv3_first_(r, [
      'SalesOrderId',
      'Sales Order ID',
      'SOId',
      'SO ID',
      'OrderId',
      'Order ID',
      'Id'
    ]);

  const no =
    tmv3_first_(r, [
      'SONumber',
      'SO Number',
      'SalesOrderNumber',
      'Sales Order Number',
      'OrderNumber',
      'Order Number',
      'SO #',
      'Service Order Number'
    ]);

  const customerId =
    tmv3_first_(r, [
      'CustomerId',
      'Customer ID',
      'CustomerCustomerId',
      'AccountId',
      'Account ID'
    ]);

  const locationId =
    tmv3_first_(r, [
      'LocationId',
      'Location ID',
      'CustomerAddressAddressId',
      'ShipToAddressAddressId',
      'CustomerAddressId'
    ]);

  const contactId =
    tmv3_first_(r, [
      'ContactId',
      'Contact ID',
      'ContactContactId'
    ]);

  const status =
    tmv3_first_(r, [
      'Status',
      'SOStatus',
      'SalesOrderStatus',
      'Order Status'
    ]);

  const name =
    tmv3_first_(r, [
      'SalesOrderName',
      'Sales Order Name',
      'SOName',
      'OrderName',
      'Order Name',
      'Name',
      'Description'
    ]);

  const url =
    id
      ? TMV3.ORDER_URL_BASE + encodeURIComponent(id)
      : '';

  return [
    id,
    no,
    customerId,
    locationId,
    contactId,
    status,
    name,
    type,
    url,
    tmv3_hash_(
      [
        id,
        no,
        customerId,
        locationId,
        contactId,
        status,
        name,
        type
      ].join('|')
    )
  ];
}

function tmv3_normalizeTask_(r, vertical, orderIdByNumber) {
  const id =
    tmv3_first_(r, [
      'TaskId',
      'Task ID',
      'Id',
      'ServiceTaskId',
      'DeliveryTaskId'
    ]);

  const no =
    tmv3_first_(r, [
      'TaskNumber',
      'Task Number',
      'Task #'
    ]) || id;

  const typeId =
    tmv3_first_(r, [
      'TaskTypeId',
      'Task Type ID',
      'TypeId',
      'Type ID'
    ]);

  const typeName =
    tmv3_first_(r, [
      'TaskType',
      'Task Type',
      'TaskTypeName',
      'Task Type Name',
      'Type'
    ]);

  const status =
    tmv3_first_(r, [
      'TaskStatus',
      'Task Status',
      'Status'
    ]);

  const name =
    tmv3_first_(r, [
      'TaskName',
      'Task Name',
      'Name',
      'Title',
      'Subject'
    ]);

  const customerId =
    tmv3_first_(r, [
      'CustomerId',
      'Customer ID',
      'AccountId',
      'Account ID'
    ]);

  const locationId =
    tmv3_first_(r, [
      'LocationId',
      'Location ID',
      'LocationLocationId',
      'CustomerLocationId'
    ]);

  const contactId =
    tmv3_first_(r, [
      'ContactId',
      'Contact ID'
    ]);

  let orderId =
    tmv3_first_(r, [
      'SalesOrderId',
      'Sales Order ID',
      'SOId',
      'SO ID',
      'OrderId',
      'Order ID'
    ]);

  if (!orderId) {
    const orderNumber = tmv3_first_(r, [
      'SalesOrderNumber',
      'Sales Order Number',
      'SONumber',
      'SO Number',
      'SO #',
      'OrderNumber',
      'Order Number'
    ]);
    if (orderNumber && orderIdByNumber) {
      orderId = orderIdByNumber[tmv3_clean_(orderNumber)] || '';
    }
  }

  const start =
    tmv3_first_(r, [
      'StartDateTime',
      'Start Date Time',
      'StartDate',
      'Start Date',
      'TaskStartDate'
    ]);

  const due =
    tmv3_first_(r, [
      'DueDateTime',
      'Due Date Time',
      'DueDate',
      'Due Date',
      'TaskDueDate'
    ]);

  const assignees =
    tmv3_first_(r, [
      'AssignedTo',
      'Assigned To',
      'Assignees',
      'Employees'
    ]);

  const pools =
    tmv3_first_(r, [
      'Pools',
      'AssignedPools',
      'Assigned Pools',
      'Pool'
    ]);

  const url =
    id
      ? TMV3.TASK_URL_BASE + encodeURIComponent(id)
      : '';

  return [
    id,
    no,
    typeId,
    typeName || vertical,
    status,
    name,
    customerId,
    locationId,
    contactId,
    orderId,
    start,
    due,
    assignees,
    pools,
    url,
    tmv3_hash_(
      [
        id,
        no,
        typeId,
        typeName,
        status,
        name,
        customerId,
        locationId,
        contactId,
        orderId,
        start,
        due,
        assignees,
        pools,
        vertical
      ].join('|')
    )
  ];
}

function tmv3_dedupeObjects_(rows, keyFn) {
  const map = {};

  (rows || []).forEach(function(r) {
    const key = tmv3_clean_(keyFn(r));
    if (key) map[key] = r;
  });

  return Object.keys(map).map(function(k) {
    return map[k];
  });
}


function tmv3_mergeOrderRows_(rows) {
  const map = {};

  (rows || []).forEach(function(r) {
    const key = tmv3_clean_(r[0] || r[1]);
    if (!key) return;

    if (!map[key]) {
      map[key] = r.slice();
      return;
    }

    const existing = map[key];

    // Preserve the richest nonblank relationship data from any approved-order feed.
    [0,1,2,3,4,5,6,8].forEach(function(i) {
      if (!tmv3_clean_(existing[i]) && tmv3_clean_(r[i])) existing[i] = r[i];
    });

    const types = tmv3_unique_(
      tmv3_clean_(existing[7]).split('|').concat(tmv3_clean_(r[7]).split('|'))
    );
    existing[7] = types.join('|');

    existing[9] = tmv3_hash_(existing.slice(0, 9).join('|'));
  });

  return Object.keys(map).map(function(k) { return map[k]; });
}


function tmv3_getTaskById_(taskId) {
  const id = Number(taskId || 0);
  if (!id) throw new Error('A positive Task ID is required.');

  const raw = tmv3_fetchJson_(
    TMV3.API_BASE + '/v2/tasks/' + encodeURIComponent(id),
    { method: 'get' }
  );

  return tmv3_normalizeV2TaskModel_(raw || {});
}

function tmv3_searchPreInspectionTasks_(customer) {
  const customerId = Number(tmv3_clean_(customer && customer['Customer ID']) || 0);
  if (!customerId) throw new Error('PreInspection task search requires Customer ID.');

  const customerPayload = { Id: customerId };
  const customerNumber = tmv3_clean_(customer['Customer Number']);
  const customerName = tmv3_clean_(customer['Name']);
  if (customerNumber) customerPayload.Number = customerNumber;
  if (customerName) customerPayload.Name = customerName;

  const all = [];
  let previousSignature = '';

  for (let pageIndex = 0; pageIndex < 3; pageIndex++) {
    const payload = {
      Customer: customerPayload,
      Type: [105],
      PageIndex: pageIndex,
      PageSize: 100
    };

    const json = tmv3_fetchJson_(
      TMV3.API_BASE + '/v2/tasks/search',
      {
        method: 'post',
        contentType: 'application/json',
        payload: JSON.stringify(payload)
      }
    );

    const rows = tmv3_extractTaskSearchRows_(json);
    const signature = rows.slice(0, 5).map(function(row) {
      return tmv3_clean_(tmv3_first_(row, ['id','Id','taskId','TaskId']));
    }).join('|');

    if (pageIndex > 0 && signature && signature === previousSignature) {
      throw new Error('PreInspection task search pagination repeated a page.');
    }

    previousSignature = signature;
    Array.prototype.push.apply(all, rows);

    if (!rows.length || rows.length < 100) break;
  }

  const ids = tmv3_unique_(all.map(function(row) {
    return tmv3_first_(row, ['id','Id','taskId','TaskId']);
  })).slice(0, 11);

  if (ids.length > 10) {
    throw new Error('More than 10 PreInspection task candidates were returned for Customer + Type 105.');
  }

  return ids.map(function(id) {
    return tmv3_getTaskById_(id);
  }).filter(function(task) {
    return (
      Number(task['Task Type ID'] || 0) === 105 &&
      String(task['Customer ID'] || '') === String(customerId)
    );
  });
}

function tmv3_extractTaskSearchRows_(json) {
  if (!json) return [];
  if (Array.isArray(json)) return json;

  const direct = [
    json.data, json.Data, json.items, json.Items,
    json.results, json.Results, json.tasks, json.Tasks
  ];

  for (let i = 0; i < direct.length; i++) {
    if (Array.isArray(direct[i])) return direct[i];
  }

  const nested = [json.data, json.Data, json.result, json.Result];

  for (let j = 0; j < nested.length; j++) {
    const obj = nested[j];
    if (!obj || typeof obj !== 'object') continue;

    const arrays = [
      obj.items, obj.Items, obj.results, obj.Results,
      obj.tasks, obj.Tasks, obj.rows, obj.Rows, obj.data, obj.Data
    ];

    for (let k = 0; k < arrays.length; k++) {
      if (Array.isArray(arrays[k])) return arrays[k];
    }
  }

  return [];
}

function tmv3_normalizeV2TaskModel_(raw) {
  raw = raw || {};
  const type = raw.type || raw.Type || {};
  const status = raw.status || raw.Status || {};
  const customer = raw.customer || raw.Customer || {};
  const location = raw.location || raw.Location || {};
  const salesOrder = raw.salesOrder || raw.SalesOrder || {};
  const requestedBy = raw.requestedBy || raw.RequestedBy || {};
  const requestedByContact = raw.requestedByContact || raw.RequestedByContact || {};
  const assignments = raw.assignments || raw.Assignments || [];

  const taskId = tmv3_first_(raw, ['id','Id','taskId','TaskId']);
  const taskNumber = tmv3_first_(raw, ['number','Number','taskNumber','TaskNumber']) || taskId;
  const typeId = tmv3_first_(type, ['id','Id']);
  const typeName = tmv3_first_(type, ['name','Name']);
  const statusName = tmv3_first_(status, ['name','Name']);
  const customerId = tmv3_first_(customer, ['id','Id']);
  const locationId = tmv3_first_(location, ['id','Id']);
  const orderId = tmv3_first_(salesOrder, ['id','Id']);
  const requestedById =
    tmv3_first_(requestedBy, ['id','Id']) ||
    tmv3_first_(requestedByContact, ['contactId','ContactId','id','Id']) ||
    tmv3_first_(raw, ['contactId','ContactId','requestedByContactId','RequestedByContactId']);

  const employeeNames = [];
  const poolNames = [];

  (assignments || []).forEach(function(a) {
    const kind = tmv3_norm_(tmv3_first_(a, ['type','Type']));
    const name = tmv3_clean_(tmv3_first_(a, ['name','Name']));
    const id = tmv3_clean_(tmv3_first_(a, ['id','Id']));
    if (kind === 'pool') poolNames.push(name || id);
    else if (name || id) employeeNames.push(name || id);
  });

  const start = tmv3_first_(raw, ['startDateTime','StartDateTime','startDate','StartDate']);
  const due = tmv3_first_(raw, ['dueDateTime','DueDateTime','dueDate','DueDate']);
  const name = tmv3_first_(raw, ['title','Title','name','Name']);

  const row = {
    'Task ID': taskId,
    'Task Number': taskNumber,
    'Task Type ID': typeId,
    'Task Type': typeName,
    'Status': statusName,
    'Name': name,
    'Customer ID': customerId,
    'Location ID': locationId,
    'Contact ID': requestedById,
    'Order ID': orderId,
    'Start': start,
    'Due': due,
    'Assignees': employeeNames.join(', '),
    'Pools': poolNames.join(', '),
    'URL': taskId ? TMV3.TASK_URL_BASE + encodeURIComponent(taskId) : ''
  };

  row.Fingerprint = tmv3_hash_([
    taskId, taskNumber, typeId, typeName, statusName, name, customerId,
    locationId, requestedById, orderId, start, due,
    row.Assignees, row.Pools
  ].join('|'));

  return row;
}


function tmv3_employeeDirectory_() {
  const cache = CacheService.getScriptCache();
  const cacheKey = 'TMV3_EMPLOYEE_DIRECTORY';
  const cached = cache.get(cacheKey);

  if (cached) {
    try { return JSON.parse(cached); } catch (ignored) {}
  }

  const json = tmv3_fetchJson_(
    TMV3.API_BASE + '/v1/employees',
    { method: 'get' }
  );

  const rows = Array.isArray(json)
    ? json
    : (
        (json && (json.Data || json.data || json.Items || json.items)) ||
        []
      );

  const employees = rows.map(function(row) {
    return {
      id: Number(
        row.Id ||
        row.id ||
        row.EmployeeId ||
        row.employeeId ||
        0
      ),
      name: tmv3_clean_(
        row.Name ||
        row.name ||
        row.EmployeeName ||
        row.employeeName
      ),
      email: tmv3_normEmail_(
        row.Email ||
        row.email ||
        row.EmailAddress ||
        row.emailAddress
      )
    };
  }).filter(function(employee) {
    return employee.id > 0 && employee.email;
  });

  try {
    cache.put(cacheKey, JSON.stringify(employees), 21600);
  } catch (ignored) {}

  return employees;
}

function tmv3_resolveOrganizerEmployee_(eventRecord) {
  const emails = tmv3_extractEmails_(eventRecord && eventRecord.organizer);

  if (emails.length !== 1) {
    return {
      status: 'REVIEW',
      errorCode: 'ORGANIZER_EMAIL_NOT_UNIQUE',
      reason:
        'Expected exactly one Calendar organizer email; found ' +
        emails.length +
        '.'
    };
  }

  const organizerEmail = emails[0];
  const matches = tmv3_employeeDirectory_().filter(function(employee) {
    return employee.email === organizerEmail;
  });

  if (matches.length !== 1) {
    return {
      status: 'REVIEW',
      errorCode: 'ORGANIZER_EMPLOYEE_NOT_UNIQUE',
      reason:
        'Calendar organizer ' +
        organizerEmail +
        ' resolved to ' +
        matches.length +
        ' Striven Employees.'
    };
  }

  return {
    status: 'MATCHED',
    employee: matches[0],
    evidence: 'CALENDAR_ORGANIZER_EMAIL_EXACT_EMPLOYEE'
  };
}

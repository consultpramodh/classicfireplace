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

  const locations =
    tmv3_reportRows_(TMV3.PROPERTIES.LOCATIONS)
      .map(tmv3_normalizeLocation_);

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

  const installTasks =
    tmv3_reportRows_(TMV3.PROPERTIES.INSTALL_TASKS)
      .map(function(r) {
        return tmv3_normalizeTask_(r, 'Install');
      });

  const deliveryTasks =
    tmv3_reportRows_(TMV3.PROPERTIES.DELIVERY_TASKS)
      .map(function(r) {
        return tmv3_normalizeTask_(r, 'Delivery');
      });

  const serviceTasks =
    tmv3_reportRows_(TMV3.PROPERTIES.SERVICE_TASKS)
      .map(function(r) {
        return tmv3_normalizeTask_(r, 'Service');
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

function tmv3_normalizeLocation_(r) {
  const id =
    tmv3_first_(r, [
      'LocationId',
      'Location ID',
      'Id'
    ]);

  const customerId =
    tmv3_first_(r, [
      'CustomerId',
      'Customer ID',
      'AccountId',
      'Account ID'
    ]);

  const a1 =
    tmv3_first_(r, [
      'Address1',
      'Address 1',
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
  const postal = tmv3_first_(r, ['PostalCode','Postal Code','Zip','ZIP']);
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
      'AccountId',
      'Account ID'
    ]);

  const locationId =
    tmv3_first_(r, [
      'LocationId',
      'Location ID'
    ]);

  const contactId =
    tmv3_first_(r, [
      'ContactId',
      'Contact ID'
    ]);

  const status =
    tmv3_first_(r, [
      'Status',
      'SalesOrderStatus',
      'Order Status'
    ]);

  const name =
    tmv3_first_(r, [
      'SalesOrderName',
      'Sales Order Name',
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

function tmv3_normalizeTask_(r, vertical) {
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
    ]);

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
      'Location ID'
    ]);

  const contactId =
    tmv3_first_(r, [
      'ContactId',
      'Contact ID'
    ]);

  const orderId =
    tmv3_first_(r, [
      'SalesOrderId',
      'Sales Order ID',
      'SOId',
      'SO ID',
      'OrderId',
      'Order ID'
    ]);

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

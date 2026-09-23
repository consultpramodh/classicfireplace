const TMV3_VERSION = 'TMV3_SHADOW_BOOTSTRAP_R1_20260923';
const TMV3_TARGET_SPREADSHEET_ID = '1AVVcBwGAVRIbvT0xx1tp4UJ92VIjfCRyWzqTRh8VWfI';

const TMV3_MODE = Object.freeze({
  name: 'SHADOW_READ_ONLY',
  writeEnabled: false,
  createRecreateEnabled: false,
  calendarWriteEnabled: false,
  triggerInstallEnabled: false
});

const TMV3_REQUIRED_PROPERTY_SOURCES = Object.freeze({
  CLIENT_ID: ['CLIENT_ID'],
  CLIENT_SECRET: ['CLIENT_SECRET'],
  CUSTOMERS_REPORT: ['Striven_Customers_ReportAPI', 'STRIVEN_CUSTOMER_REPORT_API_KEY'],
  CUSTOMER_LOCATIONS_REPORT: ['Striven_CustomerLocations_ReportAPI'],
  CONTACTS_REPORT: ['Striven_Contacts_ReportAPI'],
  APPROVED_SALES_ORDERS_REPORT: ['Striven_ApprovedSalesOrders_ReportAPI', 'Striven_CF_Approved_Sales_Orders_ReportAPI'],
  INSTALL_TASKS_REPORT: ['Striven_InstallTasks_ReportAPI', 'Striven_Tasks_ReportAPI', 'Striven_CF_Installation_Tasks_ReportAPI'],
  DELIVERY_TASKS_REPORT: ['Striven_DeliveryTasks_ReportAPI'],
  SERVICE_TASKS_REPORT: ['Striven_ServiceTasks_ReportAPI'],
  SERVICE_WORK_ORDERS_REPORT: ['Striven_ServiceWorkOrders_ReportAPI']
});

const TMV3_SHEET_CONTRACT = Object.freeze({
  Install: ['Install Calendar', 'Install Task Mapping'],
  Delivery: ['Deliveries Calendar', 'Delivery Task Mapping'],
  Service: ['Service Tech Calendar', 'Service Task Mapping'],
  PreInspection: ['PreInspect Calendar', 'PreInspect Task Mapping']
});

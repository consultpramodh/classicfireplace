/*
 * 001_ServiceOps_Config.ts
 * Typed source-of-truth extracted from the Apps Script constants supplied for CF ServiceOps.
 */

export const APP = {
  name: "Classic Fireplace ServiceOps",
  timezone: "America/Toronto"
} as const;

export const SHEETS = {
  webForm: "Web Form",
  strivenCustomers: "Striven_Customers",
  strivenCustomerLocations: "Striven_CustomerLocations",
  serviceWorkOrdersReport: "Service Work Orders - Report",
  serviceTasksReport: "Service Tasks",
  opportunityReport: "ServiceOpportunities",
  serviceTechCalendar: "Service Tech Calendar",
  serviceWorkOrdersTracking: "Service Work Orders",
  customerAssetsReport: "Customer Assets",
  serviceTaskMapping: "Service Task Mapping",
  serviceIntakeProfiles: "Service Intake Profiles",
  reviewDashboard: "Review",
  status: "STATUS"
} as const;

export const PIPELINE_STATE = {
  newRow: "NEW_ROW",
  referenceDataReady: "REFERENCE_DATA_READY",
  customerResolved: "CUSTOMER_RESOLVED",
  customerCreated: "CUSTOMER_CREATED",
  customerBlocked: "CUSTOMER_BLOCKED",
  customerHistoryEnriched: "CUSTOMER_HISTORY_ENRICHED",
  serviceIntelligenceReady: "SERVICE_INTELLIGENCE_READY",
  techAndAreaRecommended: "TECH_AND_AREA_RECOMMENDED",
  dateRecommended: "DATE_RECOMMENDED",
  opportunityPending: "OPPORTUNITY_PENDING",
  opportunityCreated: "OPPORTUNITY_CREATED",
  awaitingApproval: "AWAITING_APPROVAL",
  approvedForSwo: "APPROVED_FOR_SWO",
  serviceSalesOrderCreated: "SERVICE_SO_CREATED",
  scheduled: "SCHEDULED",
  taskCompleted: "TASK_COMPLETED",
  learningCaptured: "LEARNING_CAPTURED",
  reviewRequired: "REVIEW_REQUIRED",
  done: "DONE",
  error: "ERROR"
} as const;

export const WEBFORM_HEADERS = {
  timestamp: "Timestamp",
  firstName: "First Name",
  lastName: "Last Name",
  phone: "Phone",
  altPhone: "Alt Phone",
  email: "Email",
  street: "Street",
  city: "City",
  province: "Province",
  postalCode: "Postal Code",
  country: "Country",
  preferredDays: "Preferred Days",
  makeModelAge: "Make/Model/Age",
  details: "Details",
  anythingElse: "Anything Else",
  pipelineState: "Pipeline State",
  pipelineUpdatedAt: "Pipeline Updated At",
  lastError: "Last Error",
  needsReview: "Needs Review",
  strivenStatus: "Striven Status",
  strivenCustomerId: "Striven Customer ID",
  strivenOppId: "Striven Opp ID",
  strivenSoId: "Striven SO ID",
  salesOrderNumber: "Sales Order Number",
  swoNumber: "SWO#"
} as const;

export const TRACKING = {
  serviceTaskMappingHeaders: [
    "Event ID",
    "Tech",
    "Start Date",
    "Start Time",
    "End Date",
    "End Time",
    "Title",
    "Location",
    "SO# (event)",
    "Match Method",
    "TaskId",
    "TaskName",
    "TaskStatus",
    "LocationId",
    "ContactId",
    "Task Start",
    "Task Due",
    "Dates Match?",
    "Row Status",
    "Last Refreshed At",
    "Last Pushed At",
    "Last Pushed Action"
  ]
} as const;

export const STRIVEN = {
  defaultBaseUrl: "https://api.striven.com",
  serviceSalesOrder: {
    orderTypeId: 44938,
    paymentTermId: 13,
    lineItemClassId: 14,
    salesRepId: 51,
    serviceItemId: 41481,
    statusQuotedId: 19,
    customFields: {
      scheduled: 164,
      serviceTech: 794,
      manufacturerModel: 651
    },
    defaultServiceTechId: 502,
    blockStatuses: ["in progress", "completed"]
  },
  customer: {
    statusProspectId: 1,
    statusActiveId: 2,
    typeCustomerId: 1
  },
  serviceTechList49Active: {
    362: "Chris",
    363: "Travis",
    501: "Matt Thompson",
    502: "To be Assigned"
  },
  opportunityCustomFields: {
    preferredDay: 803,
    makeModelAge: 802,
    details: 804,
    anythingElse: 805
  },
  preferredDaysMap: {
    "No Preference": 511,
    Monday: 512,
    Tuesday: 513,
    Wednesday: 514,
    Thursday: 515,
    Friday: 516
  }
} as const;

export const CALENDAR_TECHNICIANS = [
  {
    name: "Chris",
    calendarId: "classicfireplace.ca_a7v0u8dna3egshtknhqofp5at0@group.calendar.google.com",
    color: "#8a2f16"
  },
  {
    name: "Travis",
    calendarId: "classicfireplace.ca_4thp5g3v2anva65u487enscrmo@group.calendar.google.com",
    color: "#0f766e"
  },
  {
    name: "Matt",
    calendarId: "classicfireplace.ca_rdff13tf563csmi15is11u09q8@group.calendar.google.com",
    color: "#a15c13"
  }
] as const;

export const LOOKUP_ALIASES = {
  customerId: ["CustomerId", "Customer ID", "Customer_Id", "CustomerCustomerId", "CustomerNumber", "Customer Number"],
  customerLocationId: ["CustomerLocationId", "Customer Location Id", "Customer Location ID", "LocationId", "Location ID"],
  workOrderId: ["Id", "WorkOrderId", "Work Order Id", "Work Order ID", "WOId", "SOId"],
  salesOrderNumber: ["SONumber", "SO Number", "Sales Order Number", "OrderNumber", "Order Number", "SO#", "SWO#"],
  salesOrderId: ["SalesOrderId", "Sales Order ID", "SOId", "SO ID"],
  invoiceId: ["InvoiceId", "Invoice ID", "InvoiceNumber", "Invoice Number", "Invoice #"],
  invoiceDate: ["InvoiceDate", "Invoice Date", "DateInvoiced", "Date Invoiced"],
  serialNumber: ["SerialNumber", "Serial Number", "Serial #", "Serial"],
  contactId: ["ContactId", "Contact ID", "RequestedById", "Requested By Id"],
  email: ["Email", "PrimaryEmail", "Email Address", "EmailAddress"],
  phone: ["Phone", "PrimaryPhone", "Phone Number", "PhoneNumber", "CustomerPrimaryPhone"],
  altPhone: ["Alt Phone", "SecondaryPhone", "Secondary Phone"],
  street: ["Street", "Address1", "Address", "Full Address", "Address Full", "AddressFullAddress", "CustomerAddressFullAddress"],
  city: ["City", "Town", "AddressCity", "CustomerAddressCity"],
  province: ["Province", "State", "Region"],
  postalCode: ["PostalCode", "Postal Code", "Postal", "Zip", "ZIP", "AddressZip"],
  customerName: ["CustomerName", "Customer Name", "FullName", "Name"],
  customerAssetId: ["AssetId", "Asset ID"],
  assetName: ["AssetName", "Asset Name"],
  manufacturerName: ["ManufacturerName", "Manufacturer Name"],
  modelNumber: ["ModelNumber", "Model Number"],
  datePurchased: ["DatePurchased", "DatePurchased1", "Date Purchased"],
  opportunityStage: ["Stage", "OpportunityStage", "Opportunity Stage", "Status", "OpportunityStatus", "Opportunity Status"]
} as const;

export const REVIEW_FILTERS = [
  "New Intake",
  "Needs Review",
  "Customer Resolved",
  "Opportunity Created",
  "Ready for SO",
  "SO Created",
  "Task Matched",
  "Error"
] as const;

export const OPPORTUNITY_STAGES = {
  newRequest: "New Request",
  approvedForSwo: "Approved for SWO",
  serviceWorkOrderCreated: "Service Work Order Created"
} as const;

export function getEnv() {
  const testMode = process.env.TEST_MODE === "true";
  const demoMode = testMode || process.env.DEMO_MODE !== "false";
  return {
    demoMode,
    testMode,
    readOnly: process.env.SERVICEOPS_READ_ONLY !== "false",
    databaseUrl: process.env.DATABASE_URL || "file:./serviceops.sqlite",
    spreadsheetId: process.env.SPREADSHEET_ID || "",
    strivenBaseUrl: process.env.STRIVEN_BASE_URL || STRIVEN.defaultBaseUrl,
    strivenWebBaseUrl: process.env.STRIVEN_WEB_BASE_URL || "https://classicfireplace.striven.com",
    strivenCustomerUrlTemplate: process.env.STRIVEN_CUSTOMER_URL_TEMPLATE || "/CRM/AccountDashboard.aspx?AccountID={id}",
    strivenOpportunityUrlTemplate: process.env.STRIVEN_OPPORTUNITY_URL_TEMPLATE || "/CRM/Opportunities/OpportunityList.aspx?nav=1&AccountId={id}",
    strivenSalesOrderUrlTemplate: process.env.STRIVEN_SALES_ORDER_URL_TEMPLATE || "/next/crm#/sales-orders/{id}",
    strivenClientId: process.env.STRIVEN_CLIENT_ID || "",
    strivenClientSecret: process.env.STRIVEN_CLIENT_SECRET || "",
    strivenOpportunityTypeId: Number(process.env.STRIVEN_OPPORTUNITY_TYPE_ID || process.env.OPP_TYPE_ID_OVERRIDE || 0),
    strivenOpportunityCategoryIdWebform: Number(process.env.STRIVEN_OPPORTUNITY_CATEGORY_ID_WEBFORM || 0),
    reportCustomers: process.env.STRIVEN_CUSTOMER_REPORT_API_KEY || process.env.STRIVEN_CUSTOMER_REPORT_KEY || process.env.REPORT_CONTACTS_KEY || "",
    reportCustomerLocations: process.env.STRIVEN_REPORT_URL_CUSTOMER_LOCATIONS || process.env.Striven_CustomerLocations_ReportAPI || process.env.REPORT_LOCATIONS_KEY || "",
    reportServiceWorkOrders: process.env.STRIVEN_SERVICE_WO_REPORT_API || process.env.STRIVEN_REPORT_URL_SERVICE_WORK_ORDERS || "",
    reportServiceTasks: process.env.SERVICE_TASKS_REPORT_URL || process.env.STRIVEN_REPORT_URL_SERVICE_TASKS || "",
    reportOpportunities: process.env.STRIVEN_OPPORTUNITY_REPORT_API_KEY || "",
    reportCustomerAssets: process.env.SERVICEOPS_CUSTOMER_ASSETS_REPORT_URL || "",
    reportInvoiceAssetsSerials: process.env.SERVICEOPS_INVOICE_ASSETS_SERIALS_REPORT_URL || "",
    reportInstallationTasks: process.env.SERVICEOPS_INSTALLATION_TASKS_REPORT_URL || "",
    googleClientId: process.env.GOOGLE_CLIENT_ID || "",
    googleClientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
    googleCalendarApiKey: process.env.GOOGLE_CALENDAR_API_KEY || process.env.GOOGLE_MAPS_API_KEY || process.env.MAPS_API_KEY || "",
    googleCalendarTechniciansJson: process.env.GOOGLE_CALENDAR_TECHNICIANS_JSON || "",
    serviceOpsOfficeAddress: process.env.SERVICEOPS_OFFICE_ADDRESS || "1828 Queen St E, Toronto, ON M4L 1G9",
    serviceOpsOfficeAddressesJson: process.env.SERVICEOPS_OFFICE_ADDRESSES_JSON || JSON.stringify([
      { name: "Toronto", address: "1828 Queen St E, Toronto, ON M4L 1G9" },
      { name: "Scarborough", address: "65 Rylander Blvd, Scarborough, ON M1B 5M5" },
      { name: "Whitby", address: "10 Sunray Street Unit 17-18, Whitby, ON L1N 9B5" },
      { name: "Ajax", address: "2 Old Kingston Road, Ajax, ON L1T 2Z7" },
      { name: "Newmarket", address: "93 Main St S, Newmarket, ON L3Y 3Y8" },
      { name: "Warehouse / Service", address: "333 Frankcom Street, Ajax, ON L1S 1R4" }
    ]),
    serviceOpsTechHomeAddressesJson: process.env.SERVICEOPS_TECH_HOME_ADDRESSES_JSON || "",
    openaiApiKey: process.env.OPENAI_API_KEY || ""
  };
}

export function getCalendarTechnicians() {
  const raw = process.env.GOOGLE_CALENDAR_TECHNICIANS_JSON || "";
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as { name?: string; calendarId?: string; color?: string }[];
      const valid = parsed
        .filter((item) => item.name && item.calendarId)
        .map((item, index) => ({
          name: String(item.name),
          calendarId: String(item.calendarId),
          color: item.color ? String(item.color) : CALENDAR_TECHNICIANS[index % CALENDAR_TECHNICIANS.length].color
        }));
      if (valid.length) return valid;
    } catch {
      return CALENDAR_TECHNICIANS.slice();
    }
  }

  return CALENDAR_TECHNICIANS.slice();
}

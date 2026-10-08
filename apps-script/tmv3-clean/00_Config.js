const TMV3_VERSION = '3.11.74-preinspection-order-optional-stage5-r1';
const TMV3_EXECUTION_STAGE = 7;
const TMV3_SPREADSHEET_ID = '1Rxo2t3QjlC7TFWNc3kQ8A2foBAxM0l0VcEtRh4fkU2E';
const TMV3_TIMEZONE = 'America/Toronto';
const TMV3_MODE = 'SHADOW_READ_ONLY';

const TMV3_HARD_RULES = Object.freeze({
  version:'2026-10-08-r11',
  GLOBAL:Object.freeze({
    ambiguityPolicy:'REVIEW_NO_GUESS',
    uncertainCreatePolicy:'RECONCILE_BEFORE_RETRY',
    mutationVerification:'READ_BACK_REQUIRED',
    calendarMutationPolicy:'MANAGED_FIELDS_ONLY',
    newStageFilesPolicy:'DO_NOT_ADD_STEP_8_9_10_FILES',
    taskLifecyclePolicy:'SHARED_STAGE6_HISTORY_GATE',
    singleOpenDecision:'MATCH_EXISTING',
    multipleOpenDecision:'REVIEW',
    serviceMultiOpenException:'UNIQUE_FIREPLACE_MARKERS_ONLY',
    noHistoryDecision:'CREATE_TASK',
    sameDayCompletedDecision:'FULFILLED_NO_RECREATE',
    anyCancelledHistoryDecision:'REVIEW',
    unprovenHistoryDateDecision:'REVIEW',
    futureHistoryDecision:'REVIEW',
    olderFulfilledHistoryDecision:'RECREATE_TASK',
    wrongVerticalTaskDecision:'EVIDENCE_ONLY_NO_EXECUTABLE_MATCH',
    missingPrerequisiteDecision:'BLOCK_OR_REVIEW_BEFORE_TASK_WRITE',
    missingLinkedTaskCacheDecision:'REVIEW_FAIL_CLOSED'
  }),
  Install:Object.freeze({
    orderRequired:true,
    orderLabel:'Sales Order',
    assignmentEvidence:'CALENDAR_TITLE_ONLY',
    aidenAssignment:'IGNORE',
    preserveUnrelatedManualEmployees:true
  }),
  Delivery:Object.freeze({
    orderRequired:true,
    orderLabel:'Sales Order',
    assignmentEvidence:'CALENDAR_TITLE_ONLY',
    defaultPoolId:4,
    preserveUnrelatedManualEmployees:true
  }),
  Service:Object.freeze({
    orderRequired:true,
    orderLabel:'Work Order',
    technicianEvidence:'TECHNICIAN_CALENDAR',
    defaultPoolId:4,
    taskCreationOwner:'STRIVEN_WORKFLOW',
    taskMappingCreatePolicy:'DO_NOT_CREATE_OR_RECREATE',
    removePoolOnlyAfterTechnicianEstablished:true,
    removeOnlyConflictingKnownServiceTechnicians:true
  }),
  PreInspection:Object.freeze({
    orderRequired:false,
    attachOrderToTask:false,
    taskTypeId:105,
    descriptionPolicy:'BLANK_AT_CREATE',
    calendarNotesPolicy:'CALENDAR_ONLY',
    previousCalendarTitlePolicy:'PRESERVE_AS_FIRST_DESCRIPTION_LINE_NO_HEADER',
    descriptionHeaderPolicy:'REMOVE_NOTES_AND_SALES_ORDER_LABELS_PRESERVE_CONTENT',
    calendarCopyParityPolicy:'FULL_BUSINESS_VISIBLE_PARITY_REQUIRED',
    calendarCopyParityFields:'TITLE_DESCRIPTION_LOCATION_START_END_REQUIRED_PARTICIPATION',
    calendarLinksPreservationPolicy:'PRESERVE_EXISTING_CLICKABLE_BLOCK_REPAIR_NONCLICKABLE_OR_MISSING_ONLY',
    calendarTaskLinkLabelPolicy:'TASK_ID_PLUS_ACTUAL_STRIVEN_TASK_NAME',
    field854Policy:'DO_NOT_MANAGE',
    infoCustomFieldsAtCreate:'NONE',
    technicianFieldsPolicy:'DO_NOT_PREFILL',
    defaultPoolId:8,
    requestedBySource:'CALENDAR_CREATOR_ORGANIZER_EMPLOYEE',
    organizerIsAssignee:false,
    calendarTitlePrefix:'',
    noOpenTaskPolicy:'HISTORY_GATE_BEFORE_CREATE',
    noHistoryDecision:'CREATE_TASK',
    sameDayCompletedDecision:'FULFILLED_NO_RECREATE',
    sameDayCancelledDecision:'REVIEW',
    unprovenHistoryDateDecision:'REVIEW',
    futureHistoryDecision:'REVIEW',
    olderHistoryDecision:'RECREATE_TASK',
    missingLinkedTaskCacheDecision:'REVIEW_FAIL_CLOSED'
  })
});

const TMV3 = Object.freeze({
  MODE: TMV3_MODE,
  VERSION: TMV3_VERSION,
  DOMAIN: '@classicfireplace.ca',
  API_BASE: 'https://api.striven.com',
  TASK_URL_BASE: 'https://classicfireplace.striven.com/Tasks/TaskInfo.aspx?TaskID=',
  ORDER_URL_BASE: 'https://classicfireplace.striven.com/next/crm#/sales-orders/',
  CUSTOMER_ORDERS_PAGE_BASE: 'https://classicfireplace.striven.com/next/crm#/sales-orders?accountId=',
  CUSTOMER_DASHBOARD_BASE: 'https://classicfireplace.striven.com/CRM/AccountDashboard.aspx?AccountID=',
  PAGE_SIZE: 10000,
  MAX_PAGES: 50,
  OPERATIONS: Object.freeze({
    manualWritesEnabled: false,
    automationWritesEnabled: false,
    autoMaxWritesPerRun: 1,
    canaryEventId: '2g1s53ho1qf09d19vsep0p3v0h@google.com',
    canaryVertical: 'PreInspection',
    canaryDate: '2026-09-30',
    canaryExpectedCustomerId: '62638',
    canaryExpectedLocationId: '58275',
    canaryExpectedAction: 'CREATE_TASK',
    canaryApiExtraCalls: 50,
    installRemindersEnabled: true,
    preInspectionMissingDetailEmailsEnabled: false,
    preInspectionGuestSyncEnabled: true,
    preInspectionGuestSyncIntervalMinutes: 5,
    preInspectionGuestSyncMaxWrites: 50,
    sourceRefreshMinMinutes: 120,
    masterSourceRefreshMinMinutes: 360,
    customerContactsCacheSeconds: 21600,
    preInspectionTaskSearchPageSize: 100,
    preInspectionTaskSearchMaxPages: 3,
    preInspectionTaskCacheMinMinutes: 360,
    preInspectionTaskHydrationMaxTasks: 60
  }),
  API_BUDGET: Object.freeze({
    planDailyLimit: 5000,
    v3DailySoftLimit: 1200,
    reserveForOtherWorkflows: 3800,
    propertyPrefix: 'TMV3_STRIVEN_API_BUDGET'
  }),
  SHEETS: Object.freeze({
    MORNING: 'Morning Ops',
    OVERVIEW: 'Overview',
    INSTALL: 'Install',
    DELIVERY: 'Delivery',
    SERVICE: 'Service',
    PREINSPECTION: 'PreInspection',
    STATE: 'TM State',
    AUDIT: 'TM Audit',
    RECONCILE: 'TM Reconcile',
    CUSTOMERS: 'Source Customers',
    LOCATIONS: 'Source Locations',
    CONTACTS: 'Source Contacts',
    ORDERS: 'Source Orders',
    TASKS: 'Source Tasks'
  }),
  PROPERTIES: Object.freeze({
    CLIENT_ID: ['CLIENT_ID'],
    CLIENT_SECRET: ['CLIENT_SECRET'],
    CUSTOMERS: ['Striven_Customers_ReportAPI', 'STRIVEN_CUSTOMER_REPORT_API_KEY'],
    LOCATIONS: ['Striven_CustomerLocations_ReportAPI'],
    APPROVED_ORDERS: ['Striven_ApprovedSalesOrders_ReportAPI', 'Striven_CF_Approved_Sales_Orders_ReportAPI'],
    DELIVERY_APPROVED_ORDERS: ['Striven_DeliveryApprovedOrders_ReportAPI', 'Striven_CF_Delivery_Approved_Orders_ReportAPI'],
    INSTALL_TASKS: ['Striven_InstallTasks_ReportAPI', 'Striven_Tasks_ReportAPI', 'Striven_CF_Installation_Tasks_ReportAPI'],
    DELIVERY_TASKS: ['Striven_DeliveryTasks_ReportAPI'],
    SERVICE_TASKS: ['Striven_ServiceTasks_ReportAPI'],
    SERVICE_WORK_ORDERS: ['Striven_ServiceWorkOrders_ReportAPI']
  }),
  VERTICALS: Object.freeze({
    Install: Object.freeze({
      sheet: 'Install',
      orderRequired: true,
      orderLabel: 'Sales Order',
      taskTypeId: null,
      taskTypeNames: ['install', 'installation'],
      calendarIds: ['classicfireplace.ca_vpg05s56lp9f7kaegsiqask34o@group.calendar.google.com'],
      calendarOrderLinkRequired: false,
      calendarTaskLinkRequired: true,
      lookbackDays: 3,
      lookaheadDays: 365,
      businessStartHour: 7,
      businessEndHour: 19,
      assignees: [
        { employeeId: 18, name: 'John Hoang', patterns: ['john', 'john hoang'] },
        { employeeId: 26, name: 'Matthew Thompson', patterns: ['matt', 'matthew', 'matthew thompson'] },
        { employeeId: 1, name: 'Jay Scott', patterns: ['jay', 'jay scott'] },
        { employeeId: 15, name: 'Stephen Foley', patterns: ['sf', 'stephen', 'steven', 'stephen foley', 'steven foley'] },
        { employeeId: 20, name: 'Spencer', patterns: ['spencer'] },
        { employeeId: 9, name: 'Thang', patterns: ['thang'] },
        { employeeId: 6, name: 'Pramodh', patterns: ['pramodh'] },
        { employeeId: null, name: 'Aiden', patterns: ['aiden'], ignoreAssignment: true }
      ]
    }),
    Delivery: Object.freeze({
      sheet: 'Delivery',
      orderRequired: true,
      orderLabel: 'Sales Order',
      taskTypeId: null,
      taskTypeNames: ['delivery'],
      calendarIds: ['classicfireplace.ca_2h90kflud3re121hga9bvsi33o@group.calendar.google.com'],
      calendarOrderLinkRequired: true,
      calendarTaskLinkRequired: true,
      lookbackDays: 0,
      lookaheadDays: 365,
      businessStartHour: 7,
      businessEndHour: 19,
      defaultPoolId: 4,
      defaultPoolName: 'To Be Assigned',
      assignees: [
        { employeeId: 18, name: 'John Hoang', patterns: ['john', 'john hoang'] },
        { employeeId: 1, name: 'Jay Scott', patterns: ['jay', 'jay scott'] },
        { employeeId: 15, name: 'Stephen Foley', patterns: ['sf', 'stephen', 'steven', 'stephen foley', 'steven foley'] },
        { employeeId: 20, name: 'Spencer', patterns: ['spencer'] },
        { employeeId: 9, name: 'Thang', patterns: ['thang'] },
        { employeeId: 6, name: 'Pramodh', patterns: ['pramodh'] },
        { employeeId: 26, name: 'Matthew Thompson', patterns: ['matt', 'matthew', 'matthew thompson'] },
        { employeeId: null, name: 'Aiden', patterns: ['aiden'], ignoreAssignment: true }
      ]
    }),
    Service: Object.freeze({
      sheet: 'Service',
      orderRequired: true,
      orderLabel: 'Work Order',
      taskTypeId: null,
      taskTypeNames: ['service'],
      calendars: [
        { technician: 'Chris', calendarId: 'classicfireplace.ca_a7v0u8dna3egshtknhqofp5at0@group.calendar.google.com', employeeId: 39 },
        { technician: 'Travis', calendarId: 'classicfireplace.ca_4thp5g3v2anva65u487enscrmo@group.calendar.google.com', employeeId: 38 },
        { technician: 'Matt', calendarId: 'classicfireplace.ca_rdff13tf563csmi15is11u09q8@group.calendar.google.com', employeeId: 26 }
      ],
      calendarOrderLinkRequired: true,
      calendarTaskLinkRequired: true,
      lookbackDays: 0,
      lookaheadDays: 365,
      urgentWindowHours: 48,
      businessStartHour: 8,
      businessEndHour: 18,
      defaultPoolId: 4,
      defaultPoolName: 'To Be Assigned'
    }),
    PreInspection: Object.freeze({
      sheet: 'PreInspection',
      orderRequired: false,
      orderLabel: 'Sales Orders Page',
      attachOrderToTask: false,
      taskTypeId: 105,
      taskTypeNames: ['pre inspection', 'pre-inspection', 'preinspection'],
      primaryCalendarId: 'c_3088a3989f3eb809957ed5c40137a7111a0ac97f68c29b40c144028cb14320dc@group.calendar.google.com',
      authoritativeCalendarSource: 'CF Preinspects',
      primarySourceOnly: true,
      secondaryCalendarIds: ['classicfireplace.ca_c20qcqfhvjbv784asn9pvuiaf4@group.calendar.google.com'],
      secondaryOwnerEmail: 'stephen@classicfireplace.ca',
      secondaryIgnoredCreatorEmails: [
        'stephen@classicfireplace.ca'
      ],
      secondaryGuestExcludedCreatorEmails: [
        'stephen@classicfireplace.ca',
        'pramodh@classicfireplace.ca'
      ],
      calendarOrdersPageLinkRequired: true,
      calendarTaskLinkRequired: true,
      lookbackDays: 0,
      lookaheadDays: 365,
      defaultPoolId: 8,
      defaultPoolName: 'Pre-Inspection Pool',
      requestedByFromOrganizer: true,
      descriptionMustBeBlankAtCreate: true,
      calendarNotesPolicy: 'CALENDAR_ONLY',
      previousCalendarTitlePolicy: 'PRESERVE_AS_FIRST_DESCRIPTION_LINE_NO_HEADER',
      descriptionHeaderPolicy: 'REMOVE_NOTES_AND_SALES_ORDER_LABELS_PRESERVE_CONTENT',
      calendarCopyParityPolicy: 'FULL_BUSINESS_VISIBLE_PARITY_REQUIRED',
      calendarCopyParityFields: 'TITLE_DESCRIPTION_LOCATION_START_END_REQUIRED_PARTICIPATION',
      calendarLinksPreservationPolicy: 'PRESERVE_EXISTING_CLICKABLE_BLOCK_REPAIR_NONCLICKABLE_OR_MISSING_ONLY',
      calendarTaskLinkLabelPolicy: 'TASK_ID_PLUS_ACTUAL_STRIVEN_TASK_NAME',
      field854Policy: 'DO_NOT_MANAGE',
      infoCustomFieldsAtCreate: 'NONE',
      technicianFieldsPrefill: false,
      knownInspectors: [
        { employeeId: 15, name: 'Stephen Foley', patterns: ['stephen', 'stephen foley'] }
      ]
    })
  })
});

const TMV3_OPERATOR_VISIBLE_COLUMN_COUNT = 8;

const TMV3_OPERATOR_HEADERS = Object.freeze([
  // Visible operator columns
  'Status','Data','Date','Time','Customer','Task','Issue','Action',

  // Hidden evidence / drill-down columns
  'Calendar Title','Order / Work Order','Location','Task Status','Assigned To',
  'Verification','Calendar Links','Last Verified','Event ID'
]);

// TMV3 parity R1 verification trigger — 2026-09-23

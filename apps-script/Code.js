const SERVICEOPS_WEBAPP_VERSION = "2026-05-11-command-centre-v1";
const SERVICEOPS_DEPLOYED_AT = "2026-05-12T15:38:16-04:00";

const SHEETS = {
  intake: "Web Form",
  customers: "Striven_Customers",
  locations: "Striven_CustomerLocations",
  assets: "Customer Assets",
  opportunities: "ServiceOpportunities",
  workOrders: "Service Work Orders - Report",
  tasks: "Service Tasks",
  techCalendar: "Service Tech Calendar",
  decisions: "ServiceOps_Approval_Log"
};

const TECHNICIAN_CALENDARS = [
  { name: "Chris", calendarId: "classicfireplace.ca_a7v0u8dna3egshtknhqofp5at0@group.calendar.google.com", prop: "SERVICEOPS_CALENDAR_CHRIS_ID", requireClassicOrganizer: true },
  { name: "Travis", calendarId: "classicfireplace.ca_4thp5g3v2anva65u487enscrmo@group.calendar.google.com", prop: "SERVICEOPS_CALENDAR_TRAVIS_ID", requireClassicOrganizer: true },
  { name: "Matt", calendarId: "classicfireplace.ca_rdff13tf563csmi15is11u09q8@group.calendar.google.com", prop: "SERVICEOPS_CALENDAR_MATT_ID", requireClassicOrganizer: false }
];

const CALENDAR = {
  allowedOrganizerDomain: "@classicfireplace.ca",
  restrictedTechnicians: ["Chris", "Travis"],
  defaultPastDays: 0,
  defaultFutureDays: 365
};

const CACHE_RULES = [
  { key: "customers", label: "Customers", maxMinutes: 60, props: ["CUSTOMERS_CACHE_TS", "STRIVEN_CUSTOMERS_CACHE_TS", "REPORT_CONTACTS_CACHE_TS"] },
  { key: "locations", label: "Locations", maxMinutes: 60, props: ["LOCATIONS_CACHE_TS", "STRIVEN_LOCATIONS_CACHE_TS", "REPORT_LOCATIONS_CACHE_TS"] },
  { key: "assets", label: "Customer Assets", maxMinutes: 240, props: ["CUSTOMER_ASSETS_CACHE_TS", "SERVICEOPS_CUSTOMER_ASSETS_CACHE_TS"] },
  { key: "opportunities", label: "Opportunities", maxMinutes: 20, props: ["OPPORTUNITIES_CACHE_TS", "STRIVEN_OPPORTUNITIES_CACHE_TS"] },
  { key: "workOrders", label: "Work Orders", maxMinutes: 20, props: ["WORK_ORDERS_CACHE_TS", "SERVICE_WORK_ORDERS_CACHE_TS"] },
  { key: "tasks", label: "Service Tasks", maxMinutes: 20, props: ["SERVICE_TASKS_CACHE_TS", "TASKS_CACHE_TS"] },
  { key: "techCalendar", label: "Tech Calendars", maxMinutes: 10, props: ["SERVICEOPS_TECH_CALENDAR_CACHE_TS"] }
];

const UI_PAYLOAD_CACHE_SECONDS = 300;
const UI_PAYLOAD_CACHE_VERSION = "v3";
const REQUEST_FIRST_LOAD_LIMIT = 2000;
const KANBAN_REQUEST_LIMIT = 1000;
const KANBAN_OPPORTUNITY_LIMIT = 600;

const REPORT_REFRESH_CONFIG = [
  { key: "customers", sheet: SHEETS.customers, props: ["STRIVEN_CUSTOMER_REPORT_API_KEY", "STRIVEN_CUSTOMER_REPORT_KEY", "REPORT_CONTACTS_KEY"] },
  { key: "locations", sheet: SHEETS.locations, props: ["REPORT_LOCATIONS_KEY", "Striven_CustomerLocations_ReportAPI", "STRIVEN_REPORT_URL_CUSTOMER_LOCATIONS"] },
  { key: "assets", sheet: SHEETS.assets, props: ["SERVICEOPS_CUSTOMER_ASSETS_REPORT_URL"] },
  { key: "opportunities", sheet: SHEETS.opportunities, props: ["STRIVEN_OPPORTUNITY_REPORT_API_KEY"] },
  { key: "workOrders", sheet: SHEETS.workOrders, props: ["STRIVEN_SERVICE_WO_REPORT_API", "STRIVEN_REPORT_URL_SERVICE_WORK_ORDERS"] },
  { key: "tasks", sheet: SHEETS.tasks, props: ["SERVICE_TASKS_REPORT_URL", "STRIVEN_REPORT_URL_SERVICE_TASKS"] }
];

const OPERATIONAL_STATES = {
  NEW: "New",
  NEEDS_REVIEW: "Needs Review",
  WAITING_CUSTOMER: "Waiting on Customer",
  READY_SCHEDULING: "Ready for Scheduling",
  SCHEDULED: "Scheduled",
  IN_PROGRESS: "In Progress",
  COMPLETED: "Completed",
  BLOCKED: "Blocked",
  ESCALATED: "Escalated"
};

const HEALTH_STATES = {
  HEALTHY: "Healthy",
  WAITING: "Waiting",
  AT_RISK: "At Risk",
  BLOCKED: "Blocked",
  ESCALATED: "Escalated"
};

const REQUEST_STAGES = {
  NEW: "New",
  REVIEW: "Review",
  READY: "Ready",
  SCHEDULED: "Scheduled",
  ACTIVE: "Active",
  CLOSED: "Closed"
};

function doGet(event) {
  if (event && event.parameter && event.parameter.debug === "1") {
    return HtmlService
      .createHtmlOutput(renderDebugPage())
      .setTitle("ServiceOps Diagnostics")
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }
  const template = HtmlService.createTemplateFromFile("Index");
  const page = String(event && event.parameter && event.parameter.page || "requests").toLowerCase();
  const selectedId = String(event && event.parameter && (event.parameter.request || event.parameter.card) || "");
  const initialPage = getInitialPageForTemplate_(page, selectedId);
  template.initialPage = initialPage.page;
  template.appUrl = ScriptApp.getService().getUrl();
  template.navRequestsClass = initialPage.page === "requests" ? "active" : "";
  template.navKanbanClass = initialPage.page === "kanban" ? "active" : "";
  template.navIntegrationsClass = initialPage.page === "integrations" ? "active" : "";
  template.navAdminClass = initialPage.page === "admin" ? "active" : "";
  template.initialHeroMarkup = initialPage.hero;
  template.initialStatusMarkup = initialPage.status;
  template.initialMainClass = initialPage.mainClass;
  template.initialMainMarkup = initialPage.main;
  template.initialRequestsJson = initialPage.requestsJson || "[]";
  template.initialKanbanJson = initialPage.kanbanJson || "null";
  return template
    .evaluate()
    .setTitle("Classic ServiceOps Command Centre")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function getInitialPageForTemplate_(page, selectedId) {
  if (page === "kanban") return getInitialKanbanPage_(selectedId);
  if (page === "integrations") return getInitialIntegrationsPage_();
  if (page === "admin") return getInitialAdminPage_();
  return getInitialRequestsPage_(selectedId);
}

function getInitialRequestsPage_(selectedId) {
  const data = getInitialRequestsForTemplate_();
  const subline = data.ok
    ? `Server-rendered ${data.count || 0} cached request summaries in ${data.loadMs || 0}ms.`
    : `Server-rendered fallback: ${data.error || "request data unavailable."}`;
  return {
    page: "requests",
    hero: `
      <!-- HTML SECTION — WEBFORM REQUESTS HEADER -->
      <div class="request-command-header">
        <div>
          <h1>Webform Requests</h1>
          <div class="subline">Live intake queue</div>
          <div class="sync-line">Last refreshed: ${escapeDebugHtml(shortServerTime_(data.generatedAt))} · ${escapeDebugHtml(data.count || 0)} shown · ${escapeDebugHtml(data.loadMs || 0)}ms</div>
        </div>
        <div class="request-command-actions">
          <input id="requestSearch" type="search" placeholder="Search customer, phone, email, city, issue, IDs...">
          <a class="button primary" href="${escapeDebugHtml(pageUrl_("requests"))}">Refresh</a>
          <a class="button" href="${escapeDebugHtml(pageUrl_("requests"))}">Reload</a>
        </div>
      </div>
    `,
    status: renderInitialRequestStatusMarkup_(data),
    mainClass: "request-shell",
    main: renderInitialRequestListMarkup_(data, selectedId),
    requestsJson: escapeScriptJson_(data.rows || [])
  };
}

function escapeScriptJson_(value) {
  return JSON.stringify(value).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
}

function getInitialKanbanPage_(selectedId) {
  let data;
  try {
    data = getKanbanData();
  } catch (error) {
    data = { ok: false, lanes: [], counts: {}, error: error && (error.message || String(error)) };
  }
  const lanes = data.lanes || [];
  const cards = lanes.reduce((acc, lane) => acc.concat(lane.cards || []), []);
  return {
    page: "kanban",
    hero: `
      <div class="kicker">Hybrid ServiceOps Board</div>
      <h1>Kanban</h1>
      <div class="subline">Server-rendered workflow board from Web Form and ServiceOpportunities.</div>
      <div class="toolbar"><input placeholder="Filter customer, opportunity, stage, city, action..."><a class="button" href="${escapeDebugHtml(pageUrl_("kanban"))}">Reload Kanban</a></div>
    `,
    status: [
      `<div class="status-card"><div class="metric-label">Cards</div><div class="metric-value">${escapeDebugHtml(cards.length)}</div><div class="small">visible work items</div></div>`,
      `<div class="status-card"><div class="metric-label">Striven Opps</div><div class="metric-value">${escapeDebugHtml(data.counts && data.counts.opportunities || 0)}</div><div class="small">from ServiceOpportunities</div></div>`,
      `<div class="status-card"><div class="metric-label">Unmatched Opps</div><div class="metric-value">${escapeDebugHtml(data.counts && data.counts.standaloneOpportunities || 0)}</div><div class="small">standalone cards</div></div>`,
      `<div class="status-card"><div class="metric-label">Source</div><div class="metric-value">${escapeDebugHtml(data.source || "sheet")}</div><div class="small">${escapeDebugHtml(data.loadMs ? data.loadMs + "ms" : "server-rendered")}</div></div>`
    ].join(""),
    mainClass: "request-shell",
    main: data.ok === false ? `<div class="empty">Kanban failed to load: ${escapeDebugHtml(data.error || "Unknown error")}</div>` : renderInitialKanbanBoard_(lanes, selectedId),
    kanbanJson: escapeScriptJson_(data)
  };
}

function renderInitialKanbanBoard_(lanes, selectedId) {
  return `<div class="kanban-board">${(lanes || []).map((lane) => `
    <section class="kanban-lane">
      <header><div><strong>${escapeDebugHtml(lane.lane)}</strong><span>${escapeDebugHtml(kanbanLaneHelpServer_(lane.lane))}</span></div><div class="kanban-count">${(lane.cards || []).length}</div></header>
      <div class="kanban-card-list">${(lane.cards || []).length ? lane.cards.map(renderInitialKanbanCard_).join("") : '<div class="kanban-empty">No cards</div>'}</div>
    </section>
  `).join("")}</div>`;
}

function renderInitialKanbanCard_(card) {
  return `<button class="kanban-card" type="button" data-kanban-card-id="${escapeDebugHtml(card.id)}">
    <div class="kanban-card-top"><strong>${card.request ? renderCustomerName_(card.request) : escapeDebugHtml(card.title || "Untitled")}</strong><span class="chip ${card.source === "hybrid" ? "hybrid" : card.source === "opportunity" ? "opportunity" : "intake"}">${escapeDebugHtml(card.source === "hybrid" ? "Request + Opp" : card.source === "opportunity" ? "Striven Opp" : "Request")}</span></div>
    <p>${escapeDebugHtml(card.subtitle || card.nextAction || "")}</p>
    <div class="kanban-card-meta">
      <span><span class="chip ${serverStatusClass_(card.status)}">${escapeDebugHtml(card.status || "Unknown")}</span> ${card.risk ? `<span class="chip ${serverStatusClass_(card.risk)}">Risk: ${escapeDebugHtml(card.risk)}</span>` : ""}</span>
      <span>${escapeDebugHtml(card.opportunityId ? "Opp# " + card.opportunityId : "No opportunity linked")}</span>
      <span>${escapeDebugHtml(card.nextAction || "")}</span>
    </div>
  </button>`;
}

function kanbanLaneHelpServer_(lane) {
  const copy = {
    Review: "Needs operator attention",
    Intake: "New request or missing customer",
    Customer: "Customer ready, no opportunity",
    Opportunity: "Opportunity open or quoted",
    "SWO Gate": "Approved for SWO",
    Scheduling: "SO/SWO or task underway",
    Completed: "Closed, done, or completed"
  };
  return copy[lane] || "Workflow lane";
}

function getInitialAdminPage_() {
  let data;
  try {
    data = getAdminData();
  } catch (error) {
    data = { ok: false, freshness: [], sheetStatus: [], integrationHealth: [], issues: [{ title: error && (error.message || String(error)) }] };
  }
  const freshness = data.freshness || [];
  const sheets = data.sheetStatus || [];
  const integrations = data.integrationHealth || [];
  return {
    page: "admin",
    hero: `
      <div class="kicker">Admin / Config</div>
      <h1>ServiceOps settings</h1>
      <div class="subline">Server-rendered control surface. Script Properties stay server-side.</div>
      <div class="toolbar"><input placeholder="Filter categories, property names, URLs, API keys, limits..."><a class="button" href="${escapeDebugHtml(pageUrl_("admin"))}">Reload Admin</a><a class="button" href="${escapeDebugHtml(debugUrl_())}">Diagnostics</a></div>
    `,
    status: [
      `<div class="status-card"><div class="metric-label">Version</div><div class="metric-value">${escapeDebugHtml(data.version && data.version.tag || "Unknown")}</div><div class="small">${escapeDebugHtml(data.version && data.version.environment || "Production")}</div></div>`,
      `<div class="status-card"><div class="metric-label">Data Freshness</div><div class="metric-value">${freshness.filter((item) => item.status === "Fresh").length}/${freshness.length || 0}</div><div class="small">fresh datasets</div></div>`,
      `<div class="status-card"><div class="metric-label">Sheets</div><div class="metric-value">${sheets.filter((item) => item.status === "Found").length}/${sheets.length || 0}</div><div class="small">required sheets found</div></div>`,
      `<div class="status-card"><div class="metric-label">Mode</div><div class="metric-value">Server</div><div class="small">no client JS required</div></div>`
    ].join(""),
    mainClass: "grid",
    main: `
      <div class="settings-grid">
        <div class="settings-card"><div class="panel-pad"><h3>Issues</h3>${(data.issues || []).length ? (data.issues || []).map((issue) => `<div class="list-row"><strong>${escapeDebugHtml(issue.title || issue.description || String(issue))}</strong></div>`).join("") : '<div class="empty">No admin issues detected.</div>'}</div></div>
      </div>
      <aside class="health-panel">
        ${renderInitialListCard_("Data Freshness", freshness, "label", "status")}
        ${renderInitialListCard_("Sheets", sheets, "name", "status")}
        ${renderInitialListCard_("Integrations", integrations, "name", "status")}
      </aside>
    `
  };
}

function getInitialIntegrationsPage_() {
  let data;
  try {
    data = getAdminData();
  } catch (error) {
    data = { integrationHealth: [{ name: "Diagnostics", status: "Error", message: error && (error.message || String(error)) }] };
  }
  const integrations = data.integrationHealth || [];
  return {
    page: "integrations",
    hero: `
      <div class="kicker">ServiceOps Connections</div>
      <h1>Integrations</h1>
      <div class="subline">Server-rendered integration health and configuration entry points.</div>
      <div class="toolbar"><input placeholder="Filter integrations..."><a class="button" href="${escapeDebugHtml(pageUrl_("integrations"))}">Reload Integrations</a><a class="button" href="${escapeDebugHtml(debugUrl_())}">Diagnostics</a></div>
    `,
    status: [
      `<div class="status-card"><div class="metric-label">Healthy</div><div class="metric-value">${integrations.filter((item) => item.status === "OK").length}</div><div class="small">ready connections</div></div>`,
      `<div class="status-card"><div class="metric-label">Review</div><div class="metric-value">${integrations.filter((item) => item.status !== "OK").length}</div><div class="small">warnings or missing config</div></div>`,
      `<div class="status-card"><div class="metric-label">Writes</div><div class="metric-value">Gated</div><div class="small">server-side secrets</div></div>`,
      `<div class="status-card"><div class="metric-label">Mode</div><div class="metric-value">Server</div><div class="small">no client JS required</div></div>`
    ].join(""),
    mainClass: "request-shell",
    main: `<div class="page-panel"><div class="panel-pad"><div class="list">${integrations.length ? integrations.map((item) => `<div class="list-row"><div><strong>${escapeDebugHtml(item.name)}</strong><div class="small">${escapeDebugHtml(item.message || item.lastSuccessfulCall || "")}</div></div><span class="chip ${serverStatusClass_(item.status)}">${escapeDebugHtml(item.status)}</span></div>`).join("") : '<div class="empty">No integration health data available.</div>'}</div></div></div>`
  };
}

function renderInitialListCard_(title, items, labelKey, statusKey) {
  return `<div class="health-card"><h3>${escapeDebugHtml(title)}</h3><div class="list">${(items || []).length ? items.map((item) => `<div class="list-row"><div><strong>${escapeDebugHtml(item[labelKey] || item.name || item.label || "-")}</strong><div class="small">${escapeDebugHtml(item.message || item.guidance || item.lastChecked || item.lastSuccessfulCall || "")}</div></div><span class="chip ${serverStatusClass_(item[statusKey])}">${escapeDebugHtml(item[statusKey] || "Unknown")}</span></div>`).join("") : '<div class="empty">No data available.</div>'}</div></div>`;
}

function pageUrl_(page) {
  return `${ScriptApp.getService().getUrl()}?page=${encodeURIComponent(page)}`;
}

function debugUrl_() {
  return `${ScriptApp.getService().getUrl()}?debug=1`;
}

function getInitialRequestsForTemplate_() {
  try {
    return getWebformRequestsQueueData();
  } catch (error) {
    return { ok: false, rows: [], count: 0, generatedAt: new Date().toISOString(), source: "server-error", error: error && (error.message || String(error)) };
  }
}

function renderInitialRequestStatusMarkup_(data) {
  const rows = (data && data.rows) || [];
  return renderActionChips_(rows);
}

function renderActionChips_(rows) {
  const now = Date.now();
  const day = 86400000;
  const chips = [
    ["all", "All", rows.length],
    ["needs_customer", "Needs Customer", rows.filter((row) => !row.strivenCustomerId).length],
    ["ready_opportunity", "Ready for Opportunity", rows.filter((row) => row.strivenCustomerId && !row.strivenOppId && !row.lastError).length],
    ["ready_work_order", "Ready for Work Order", rows.filter((row) => row.strivenOppId && !row.strivenSoId && !row.swoNumber && !row.lastError).length],
    ["errors", "Has Errors", rows.filter((row) => row.lastError || row.derivedStatus === "Error").length],
    ["high_risk", "High Risk", rows.filter((row) => row.riskLevel === "High").length],
    ["today", "Today", rows.filter((row) => isWithinDays_(row.sortTime, now, 1)).length],
    ["last7", "Last 7 Days", rows.filter((row) => isWithinDays_(row.sortTime, now, 7)).length]
  ];
  return `<!-- HTML SECTION — ACTION FILTER CHIPS --><div class="action-chip-row">${chips.map(([key, label, count], index) => `<a class="action-chip ${index === 0 ? "active" : ""}" href="${escapeDebugHtml(pageUrl_("requests"))}" data-filter="${escapeDebugHtml(key)}"><span>${escapeDebugHtml(label)}</span><strong>${escapeDebugHtml(count)}</strong></a>`).join("")}</div>`;
}

function isWithinDays_(sortTime, now, days) {
  const stamp = Number(sortTime) || 0;
  if (!stamp) return false;
  return stamp >= now - ((days - 1) * 86400000) && stamp <= now + 86400000;
}

function renderInitialRequestListMarkup_(data, selectedId) {
  if (!data || data.ok === false) {
    return `<div class="request-month-stack"><div class="empty">Requests failed to load: ${escapeDebugHtml(data && data.error || "Unknown error")}</div></div>`;
  }
  const rows = data.rows || [];
  if (!rows.length) return '<div class="request-month-stack"><div class="empty">No requests found.</div></div>';
  const groups = groupRowsForInitialRender_(rows);
  const selected = selectedId ? rows.find((row) => String(row.id) === String(selectedId)) : null;
  const groupsMarkup = groups.filter((group) => group.rows.length).map(renderInitialRequestGroup_).join("");
  return `<div class="${selected ? "detail-layout" : ""}">
    <div class="request-month-stack" id="requestList">${groupsMarkup || renderNoRequestsView_()}</div>
    ${selected ? renderInitialRequestDetailPanel_(selected) : ""}
  </div>`;
}

function renderNoRequestsView_() {
  return '<div class="empty"><strong>No requests match this view.</strong><div class="small">Try All, clear search, or refresh data.</div></div>';
}

function renderInitialRequestGroup_(group) {
  const topStatuses = summarizeInitialStatuses_(group.rows);
  return `
    <details class="request-group" ${group.defaultOpen ? "open" : ""}>
      <summary>
        <div class="request-group-title">
          <strong>${escapeDebugHtml(group.label)}</strong>
          <span>${group.rows.length} request${group.rows.length === 1 ? "" : "s"}</span>
        </div>
        <div class="request-group-stats">${topStatuses}</div>
      </summary>
      <div class="request-table-head">
        <span>Customer</span><span>Request</span><span>Stage</span><span>Linked Records</span><span>Next Action</span>
      </div>
      ${group.rows.map(renderInitialRequestRow_).join("")}
    </details>
  `;
}

// APPS SCRIPT SECTION — WEBFORM REQUESTS API
function getWebformRequestsQueueData() {
  try {
    const cached = getUiPayloadCache("webformRequestsQueue");
    if (cached) return cached;
    const startedAt = Date.now();
    const rows = dedupeWebformRequestViewModels_(getRows(SHEETS.intake, REQUEST_FIRST_LOAD_LIMIT)
      .filter((row) => row && Object.keys(row).length)
      .map((row, index) => buildWebformRequestViewModel_(row, row._rowNumber || index + 1)))
      .sort((a, b) => (b.sortTime || 0) - (a.sortTime || 0));
    return setUiPayloadCache("webformRequestsQueue", {
      ok: true,
      generatedAt: new Date().toISOString(),
      source: "sheet",
      loadMs: Date.now() - startedAt,
      count: rows.length,
      rows
    });
  } catch (error) {
    return failure("Webform request queue failed to load", error);
  }
}

function dedupeWebformRequestViewModels_(rows) {
  const best = {};
  rows.forEach((row) => {
    const key = webformDedupeKey_(row);
    if (!best[key] || compareWebformRequest_(row, best[key]) > 0) best[key] = row;
  });
  return Object.keys(best).map((key) => best[key]);
}

function webformDedupeKey_(row) {
  if (row.requestId) return `id:${normalizeKanbanId(row.requestId)}`;
  if (row.sheetRow) return `row:${row.sheetRow}`;
  return `fallback:${normalizeKanbanId([row.submittedAt, row.email, row.phone, row.street, row.city, row.postalCode].join("|"))}`;
}

function compareWebformRequest_(a, b) {
  const scoreDelta = webformCompletenessScore_(a) - webformCompletenessScore_(b);
  if (scoreDelta) return scoreDelta;
  return (a.sortTime || 0) - (b.sortTime || 0);
}

function webformCompletenessScore_(row) {
  return [
    row.strivenCustomerId,
    row.strivenOppId,
    row.strivenSoId || row.swoNumber,
    row.phone,
    row.email,
    row.street || row.city || row.postalCode,
    row.details
  ].filter(Boolean).length;
}

// APPS SCRIPT SECTION — WEBFORM REQUEST DERIVED STATUS
function buildWebformRequestViewModel_(row, rowNumber) {
  const firstName = firstValue(row, ["First Name", "First"]);
  const lastName = firstValue(row, ["Last Name", "Last"]);
  const fullName = [firstName, lastName].filter(Boolean).join(" ") || firstValue(row, ["Name", "Customer Name"]) || "Unknown customer";
  const submittedAt = firstValue(row, ["Timestamp", "Submitted At", "Created At", "Date"]);
  const details = firstValue(row, ["Details", "Service Details", "Issue", "Description"]);
  const anythingElse = firstValue(row, ["Anything Else", "Notes", "Additional Notes"]);
  const makeModelAge = firstValue(row, ["Make/Model/Age", "Make Model Age", "Fireplace", "Fireplace Details"]);
  const phone = firstValue(row, ["Phone", "Primary Phone", "Phone Number"]);
  const altPhone = firstValue(row, ["Alt Phone", "Alternate Phone", "Alternative Phone"]);
  const email = firstValue(row, ["Email", "Email Address"]);
  const street = firstValue(row, ["Street", "Address", "Street Address"]);
  const city = firstValue(row, ["City"]);
  const province = firstValue(row, ["Province", "State"]);
  const postalCode = firstValue(row, ["Postal Code", "PostalCode", "Zip"]);
  const country = firstValue(row, ["Country"]);
  const preferredDays = firstValue(row, ["Preferred Days", "Preferred Day", "Preference"]);
  const pipelineState = firstValue(row, ["Pipeline State", "Current Stage", "Status", "Match Status"]) || "New Request";
  const needsReview = firstValue(row, ["Needs Review"]);
  const lastError = firstValue(row, ["Last Error", "Error"]);
  const strivenCustomerId = firstValue(row, ["Striven Customer ID", "Customer#", "Customer #", "Customer ID"]);
  const strivenOppId = firstValue(row, ["Striven Opp ID", "Opp#", "Opportunity #", "Opportunity ID", "Striven Opportunity ID"]);
  const strivenSoId = firstValue(row, ["Striven SO ID", "SO#", "Sales Order #", "Sales Order ID"]);
  const salesOrderNumber = firstValue(row, ["Sales Order Number", "Order Number"]);
  const swoNumber = firstValue(row, ["SWO#", "Swo Number", "Service Work Order Number"]);
  const requestId = firstValue(row, ["Request ID", "Webform Row #", "Row ID", "ID"]) || `WF-${rowNumber}`;
  const derived = deriveWebformRequestStatus_({ submittedAt, details, anythingElse, pipelineState, lastError, strivenCustomerId, strivenOppId, strivenSoId, salesOrderNumber, swoNumber });
  const issue = issueLabel({ details, makeModelAge }) || classifyWebformIssue([details, anythingElse, makeModelAge].join(" "));
  const prefix = strivenCustomerId ? `#${strivenCustomerId}` : "#NEW";
  const searchText = [requestId, rowNumber, fullName, phone, altPhone, email, street, city, province, postalCode, issue, details, anythingElse, strivenCustomerId, strivenOppId, strivenSoId, salesOrderNumber, swoNumber].join(" ").toLowerCase();
  return {
    id: requestId,
    requestId,
    sheetRow: rowNumber,
    rowNumber,
    submittedAt,
    sortTime: toDate(submittedAt) || 0,
    firstName,
    lastName,
    fullName,
    customer: `${prefix} - ${fullName}`,
    customerName: fullName,
    customerPrefix: prefix,
    customerPrefixClass: strivenCustomerId ? "configured" : "missing",
    phone,
    altPhone,
    email,
    street,
    city,
    province,
    postalCode,
    country,
    location: [city, province, postalCode].filter(Boolean).join(", "),
    preferredDays,
    makeModelAge: makeModelAge || "Unknown fireplace",
    details: details || "No issue details captured",
    anythingElse,
    pipelineState,
    needsReview,
    lastError,
    strivenCustomerId,
    strivenOppId,
    strivenSoId,
    salesOrderNumber,
    swoNumber,
    customerId: strivenCustomerId,
    opportunityId: strivenOppId,
    salesOrderId: strivenSoId || salesOrderNumber || swoNumber,
    issue,
    derivedStatus: derived.derivedStatus,
    status: derived.derivedStatus,
    riskLevel: derived.riskLevel,
    risk: derived.riskLevel,
    nextAction: derived.nextAction,
    searchText
  };
}

function deriveWebformRequestStatus_(input) {
  const text = [input.details, input.anythingElse, input.pipelineState, input.lastError].join(" ").toLowerCase();
  const ageMs = Date.now() - (toDate(input.submittedAt) || Date.now());
  let riskLevel = "Low";
  if (input.lastError || /gas smell|carbon monoxide|\bco\b|leak|won.?t shut off|sparking/i.test(text)) riskLevel = "High";
  else if (!input.strivenCustomerId && ageMs > 86400000) riskLevel = "Medium";
  if (input.lastError) return { derivedStatus: "Error", riskLevel, nextAction: "Review Error" };
  if (!input.strivenCustomerId) return { derivedStatus: "Needs Customer", riskLevel, nextAction: "Resolve Customer" };
  if (!input.strivenOppId) return { derivedStatus: "Customer Resolved", riskLevel, nextAction: "Create Opportunity" };
  if (!input.strivenSoId && !input.salesOrderNumber && !input.swoNumber) return { derivedStatus: "Opportunity Ready", riskLevel, nextAction: "Create Work Order" };
  return { derivedStatus: "Linked", riskLevel, nextAction: "Open Record" };
}

function renderInitialRequestRow_(row) {
  return `
    <button class="request-row" type="button" data-detail="request" data-payload="${escapeDebugHtml(encodeDetailPayload_(row))}">
      <div><div class="request-customer">${renderCustomerName_(row)}</div><div class="request-meta">${escapeDebugHtml([row.phone, row.email, row.location].filter(Boolean).join(" · "))}</div><div class="request-date">${escapeDebugHtml(formatServerRequestDate_(row))}</div></div>
      <div><div class="request-issue">${escapeDebugHtml(row.issue)}</div><div class="request-note">${escapeDebugHtml(row.details || row.anythingElse || "")}</div></div>
      <div class="stage-stack">${renderStageChips_(row)}</div>
      <div class="record-stack">${renderLinkedRecords_(row)}</div>
      <strong>${escapeDebugHtml(row.nextAction || "Review")}</strong>
    </button>
  `;
}

function renderStageChips_(row) {
  return [
    `<span class="chip ${row.strivenCustomerId ? "configured" : "missing"}">${row.strivenCustomerId ? "Customer OK" : "Needs Customer"}</span>`,
    `<span class="chip ${row.strivenOppId ? "opportunity" : "optional"}">${row.strivenOppId ? "Opportunity" : "No Opp"}</span>`,
    `<span class="chip ${row.strivenSoId || row.swoNumber ? "swo" : "optional"}">${row.strivenSoId || row.swoNumber ? "Work Order" : "No WO"}</span>`
  ].join("");
}

function renderLinkedRecords_(row) {
  return [
    row.strivenCustomerId ? `<span>Customer #${escapeDebugHtml(row.strivenCustomerId)}</span>` : '<span class="muted-record">Customer missing</span>',
    row.strivenOppId ? `<span>Opp #${escapeDebugHtml(row.strivenOppId)}</span>` : '<span class="muted-record">Opp missing</span>',
    row.strivenSoId || row.swoNumber ? `<span>SO/SWO #${escapeDebugHtml(row.swoNumber || row.salesOrderNumber || row.strivenSoId)}</span>` : '<span class="muted-record">WO missing</span>'
  ].join("");
}

function renderCustomerName_(row) {
  const prefix = row.customerPrefix || (row.customerId ? "#" + row.customerId : "#NEW");
  const name = row.customerName || String(row.customer || "").replace(/^#?NEW\s+-\s+|^#?\d+\s+-\s+/, "") || "Unknown customer";
  return `<span class="customer-prefix ${row.customerId ? "known" : "new"}">${escapeDebugHtml(prefix)}</span> ${escapeDebugHtml(name)}`;
}

function encodeDetailPayload_(row) {
  const payload = {
    id: row.id || "",
    customer: row.customerName || row.customer || "Unknown customer",
    customerPrefix: row.customerPrefix || (row.customerId ? "#" + row.customerId : "#NEW"),
    isNewCustomer: !row.customerId,
    submittedAt: formatServerRequestDate_(row),
    issue: row.issue || "Service request",
    details: row.details || "",
    anythingElse: row.anythingElse || "",
    makeModelAge: row.makeModelAge || "",
    preferredDays: row.preferredDays || "",
    phone: row.phone || "",
    altPhone: row.altPhone || "",
    email: row.email || "",
    location: [row.street, row.city, row.province, row.postalCode].filter(Boolean).join("\n") || row.location || "",
    linked: [row.customerId && "Customer #" + row.customerId, row.opportunityId && "Opportunity #" + row.opportunityId, row.salesOrderId && "SO/SWO #" + row.salesOrderId, row.taskId && "Task #" + row.taskId].filter(Boolean).join("\n") || "No linked records yet.",
    status: row.status || "Unknown",
    risk: row.risk || "Low",
    nextAction: row.nextAction || "Review",
    ai: aiSuggestionsForRequest_(row)
  };
  return Utilities.base64EncodeWebSafe(JSON.stringify(payload));
}

function renderInitialRequestDetailPanel_(row) {
  const suggestions = aiSuggestionsForRequest_(row);
  return `<!-- HTML SECTION — REQUEST DETAIL PANEL --><aside class="server-detail-panel">
    <div class="drawer-header">
      <div><div class="kicker">${escapeDebugHtml(row.id || "Webform request")}</div><h2>${renderCustomerName_(row)}</h2><div class="subline">${escapeDebugHtml(formatServerRequestDate_(row))}</div></div>
      <a class="button" href="${escapeDebugHtml(pageUrl_("requests"))}">Close</a>
    </div>
    <div class="drawer-grid">
      <div class="drawer-card wide"><div class="drawer-label">Customer Provided</div><div class="drawer-value"><strong>${escapeDebugHtml(row.issue || "Service request")}</strong>
${escapeDebugHtml([
  row.details && "Details: " + row.details,
  row.anythingElse && "Anything Else: " + row.anythingElse,
  row.makeModelAge && "Fireplace: " + row.makeModelAge,
  row.preferredDays && "Preferred Days: " + row.preferredDays
].filter(Boolean).join("\n"))}</div></div>
      <div class="drawer-card"><div class="drawer-label">Contact</div><div class="drawer-value">${escapeDebugHtml([row.phone && "Phone: " + row.phone, row.altPhone && "Alt: " + row.altPhone, row.email && "Email: " + row.email].filter(Boolean).join("\n") || "No contact captured.")}</div></div>
      <div class="drawer-card"><div class="drawer-label">Location</div><div class="drawer-value">${escapeDebugHtml([row.street, row.city, row.province, row.postalCode].filter(Boolean).join("\n") || row.location || "No address captured.")}</div></div>
      <div class="drawer-card wide"><div class="drawer-label">Linked Records</div><div class="drawer-value">${escapeDebugHtml([row.customerId && "Customer #" + row.customerId, row.opportunityId && "Opportunity #" + row.opportunityId, row.salesOrderId && "SO/SWO #" + row.salesOrderId, row.taskId && "Task #" + row.taskId].filter(Boolean).join("\n") || "No linked records yet.")}</div></div>
      <div class="drawer-card wide"><div class="drawer-label">Suggested Next Action</div><div class="drawer-value"><strong>${escapeDebugHtml(row.nextAction || "Review")}</strong>
${escapeDebugHtml(suggestions.summary || "")}</div></div>
      <div class="drawer-card wide"><div class="drawer-label">Action Buttons</div><div class="detail-actions">${actionButtonsForRequest_(row)}</div></div>
      <div class="drawer-card wide"><div class="drawer-label">Internal Notes / Raw Submission</div><div class="drawer-value">${escapeDebugHtml([row.pipelineState && "Pipeline: " + row.pipelineState, row.lastError && "Error: " + row.lastError, row.anythingElse && "Raw Notes: " + row.anythingElse].filter(Boolean).join("\n") || "No internal notes captured.")}</div></div>
    </div>
    <div class="ai-suggestions">
      <div class="kicker">AI Suggestions</div>
      <h3>${escapeDebugHtml(suggestions.title)}</h3>
      <p>${escapeDebugHtml(suggestions.summary)}</p>
      <div class="list">${suggestions.items.map((item) => `<div class="list-row"><span>${escapeDebugHtml(item)}</span></div>`).join("")}</div>
    </div>
  </aside>`;
}

function actionButtonsForRequest_(row) {
  const buttons = [];
  if (!row.strivenCustomerId && !row.customerId) buttons.push("Match / Create Customer");
  if ((row.strivenCustomerId || row.customerId) && !(row.strivenOppId || row.opportunityId)) buttons.push("Create Opportunity");
  if ((row.strivenOppId || row.opportunityId) && !(row.strivenSoId || row.salesOrderId || row.swoNumber)) buttons.push("Create Work Order");
  if (row.strivenCustomerId || row.customerId) buttons.push("Open Customer");
  if (row.strivenOppId || row.opportunityId) buttons.push("Open Opportunity");
  if (row.strivenSoId || row.salesOrderId || row.swoNumber) buttons.push("Open Work Order");
  if (row.lastError) {
    buttons.push("Copy Error");
    buttons.push("Retry Step");
  }
  return buttons.map((label) => `<button class="button" type="button">${escapeDebugHtml(label)}</button>`).join("") || '<span class="small">No contextual actions available.</span>';
}

function renderInitialKanbanDetailPanel_(card) {
  const request = card.request || {};
  const opportunity = card.opportunity || {};
  const suggestions = aiSuggestionsForRequest_(request.customer ? request : card);
  return `<aside class="server-detail-panel">
    <div class="drawer-header">
      <div><div class="kicker">${escapeDebugHtml(card.source || "Kanban card")}</div><h2>${escapeDebugHtml(card.title || "Untitled card")}</h2><div class="subline">${escapeDebugHtml(card.lane || "")}</div></div>
      <a class="button" href="${escapeDebugHtml(pageUrl_("kanban"))}">Close</a>
    </div>
    <div class="drawer-grid">
      <div class="drawer-card wide"><div class="drawer-label">Customer Provided</div><div class="drawer-value"><strong>${escapeDebugHtml(card.subtitle || request.issue || opportunity.title || "Service request")}</strong>
${escapeDebugHtml([request.details && "Details: " + request.details, request.anythingElse && "Anything Else: " + request.anythingElse, request.makeModelAge && "Fireplace: " + request.makeModelAge].filter(Boolean).join("\n") || "No webform notes linked to this card.")}</div></div>
      <div class="drawer-card"><div class="drawer-label">Status / Risk</div><div class="drawer-value"><span class="chip ${serverStatusClass_(card.status)}">${escapeDebugHtml(card.status || "Unknown")}</span> <span class="chip ${serverStatusClass_(card.risk)}">${escapeDebugHtml(card.risk || "Low")}</span></div></div>
      <div class="drawer-card"><div class="drawer-label">Records</div><div class="drawer-value">${escapeDebugHtml([card.customerId && "Customer #" + card.customerId, card.opportunityId && "Opportunity #" + card.opportunityId, card.salesOrderId && "SO/SWO #" + card.salesOrderId, card.taskId && "Task #" + card.taskId].filter(Boolean).join("\n") || "No linked records yet.")}</div></div>
      <div class="drawer-card wide"><div class="drawer-label">Striven Opportunity</div><div class="drawer-value">${escapeDebugHtml([opportunity.title && "Title: " + opportunity.title, opportunity.stage && "Stage: " + opportunity.stage, opportunity.customerName && "Customer: " + opportunity.customerName].filter(Boolean).join("\n") || "No opportunity details linked.")}</div></div>
    </div>
    <div class="ai-suggestions">
      <div class="kicker">AI Suggestions</div>
      <h3>${escapeDebugHtml(suggestions.title)}</h3>
      <p>${escapeDebugHtml(suggestions.summary)}</p>
      <div class="list">${suggestions.items.map((item) => `<div class="list-row"><span>${escapeDebugHtml(item)}</span></div>`).join("")}</div>
    </div>
  </aside>`;
}

function aiSuggestionsForRequest_(row) {
  const risk = row.risk || "Low";
  const title = risk === "High" ? "Review before action" : row.customerId ? "Continue ServiceOps flow" : "Resolve customer first";
  const items = [];
  if (!row.customerId) items.push("Match or create the Striven customer before creating downstream records.");
  if (!row.opportunityId) items.push("Prepare or link the Striven opportunity once the customer is confirmed.");
  if (/approved for swo/i.test(row.status || row.opportunityStage || "")) items.push("Approved for SWO: verify duplicate/open work-order risk before creating the SWO.");
  if (risk === "High") items.push("High-risk language detected: confirm safety and missing details before scheduling.");
  if (!items.length) items.push(row.nextAction || "Monitor the request and keep records synchronized.");
  return {
    title,
    summary: `Suggested next action: ${row.nextAction || "Review"}. Status is ${row.status || "Unknown"} and risk is ${risk}.`,
    items
  };
}

function groupRowsForInitialRender_(rows) {
  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const yesterdayStart = todayStart - 86400000;
  const sevenStart = todayStart - (6 * 86400000);
  const thirtyStart = todayStart - (29 * 86400000);
  const map = {
    today: { key: "today", label: "Today", defaultOpen: true, sortValue: 9000000000000, rows: [] },
    yesterday: { key: "yesterday", label: "Yesterday", defaultOpen: true, sortValue: 8000000000000, rows: [] },
    last7: { key: "last7", label: "Last 7 Days", defaultOpen: true, sortValue: 7000000000000, rows: [] },
    last30: { key: "last30", label: "Last 30 Days", defaultOpen: false, sortValue: 6000000000000, rows: [] }
  };
  rows.forEach((row) => {
    const stamp = Number(row.sortTime) || Date.parse(row.submittedAt || "") || 0;
    const date = stamp ? new Date(stamp) : null;
    const dayStart = date ? new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime() : 0;
    let key = "unknown";
    let label = "No date captured";
    let defaultOpen = false;
    let sortValue = -1;
    if (date) {
      if (dayStart >= todayStart) { key = "today"; label = "Today"; defaultOpen = true; sortValue = 9000000000000; }
      else if (dayStart >= yesterdayStart) { key = "yesterday"; label = "Yesterday"; defaultOpen = true; sortValue = 8000000000000; }
      else if (dayStart >= sevenStart) { key = "last7"; label = "Last 7 Days"; defaultOpen = true; sortValue = 7000000000000; }
      else if (dayStart >= thirtyStart) { key = "last30"; label = "Last 30 Days"; sortValue = 6000000000000; }
      else { key = `${date.getFullYear()}-${date.getMonth() + 1}`; label = Utilities.formatDate(date, Session.getScriptTimeZone(), "MMMM yyyy"); sortValue = new Date(date.getFullYear(), date.getMonth(), 1).getTime(); }
    }
    if (!map[key]) map[key] = { key, label, defaultOpen, sortValue, rows: [] };
    map[key].rows.push(row);
  });
  return Object.keys(map)
    .map((key) => map[key])
    .sort((a, b) => b.sortValue - a.sortValue)
    .map((group) => ({ ...group, rows: group.rows.sort((a, b) => (Number(b.sortTime) || 0) - (Number(a.sortTime) || 0)) }));
}

function summarizeInitialStatuses_(rows) {
  const high = rows.filter((row) => row.risk === "High").length;
  const needCustomer = rows.filter((row) => !row.customerId).length;
  const statuses = {};
  rows.forEach((row) => { const status = row.status || "New"; statuses[status] = (statuses[status] || 0) + 1; });
  const top = Object.keys(statuses).sort((a, b) => statuses[b] - statuses[a]).slice(0, 3)
    .map((status) => `<span class="chip ${serverStatusClass_(status)}">${escapeDebugHtml(status)} ${statuses[status]}</span>`).join("");
  return `${high ? `<span class="chip missing">High ${high}</span>` : ""}${needCustomer ? `<span class="chip warning">Need Customer ${needCustomer}</span>` : ""}${top || '<span class="chip optional">No statuses</span>'}`;
}

function serverStatusClass_(value) {
  const text = String(value || "").toLowerCase();
  if (/approved for swo|swo gate/.test(text)) return "swo";
  if (/ready|in progress|active|service work order created/.test(text)) return "ready";
  if (/configured|fresh|found|ok|healthy|current|low/.test(text)) return "configured";
  if (/scheduled/.test(text)) return "scheduled";
  if (/completed|closed|done/.test(text)) return "completed";
  if (/review|missing|error|failed|blocked|escalated|high/.test(text)) return "missing";
  if (/stale|warning|waiting|medium|quoted|customer/.test(text)) return "warning";
  if (/opportunity/.test(text)) return "opportunity";
  if (/new|intake/.test(text)) return "intake";
  return "optional";
}

function shortServerTime_(value) {
  const date = new Date(value || "");
  if (Number.isNaN(date.getTime())) return "Now";
  return Utilities.formatDate(date, Session.getScriptTimeZone(), "h:mm a");
}

function formatServerRequestDate_(row) {
  const stamp = Number(row && row.sortTime) || Date.parse(row && row.submittedAt || "") || 0;
  if (!stamp) return row && row.submittedAt || "No submitted date";
  return Utilities.formatDate(new Date(stamp), Session.getScriptTimeZone(), "MMM d, yyyy h:mm a");
}

function renderDebugPage() {
  const startedAt = Date.now();
  const checks = [];
  function check(name, fn) {
    const t0 = Date.now();
    try {
      const value = fn();
      checks.push({ name, ok: true, ms: Date.now() - t0, value });
    } catch (error) {
      checks.push({ name, ok: false, ms: Date.now() - t0, value: error && (error.stack || error.message || String(error)) });
    }
  }
  check("Script", () => ({ id: ScriptApp.getScriptId(), user: Session.getActiveUser().getEmail() || "unknown" }));
  check("Properties", () => {
    const props = PropertiesService.getScriptProperties();
    return {
      hasSpreadsheetId: Boolean(props.getProperty("SPREADSHEET_ID")),
      environment: props.getProperty("SERVICEOPS_ENVIRONMENT") || "Production"
    };
  });
  check("Spreadsheet", () => {
    const ss = getSpreadsheet();
    return { id: ss.getId(), name: ss.getName(), sheets: ss.getSheets().slice(0, 12).map((sheet) => sheet.getName()) };
  });
  check("Web Form small read", () => {
    const rows = getRows(SHEETS.intake, 5);
    return { count: rows.length, firstRowNumber: rows[0] && rows[0]._rowNumber, keys: rows[0] ? Object.keys(rows[0]).slice(0, 12) : [] };
  });
  check("Request summary", () => {
    const data = getWebformRequestsData();
    return { ok: data.ok, count: data.count, source: data.source, loadMs: data.loadMs, error: data.error || "" };
  });
  const rows = checks.map((item) => `
    <tr>
      <td>${escapeDebugHtml(item.name)}</td>
      <td class="${item.ok ? "ok" : "bad"}">${item.ok ? "OK" : "FAIL"}</td>
      <td>${item.ms}ms</td>
      <td><pre>${escapeDebugHtml(JSON.stringify(item.value, null, 2))}</pre></td>
    </tr>
  `).join("");
  return `<!doctype html><html><head><base target="_top"><style>
    body{font-family:Arial,sans-serif;margin:24px;background:#f6f7fb;color:#111827}
    table{border-collapse:collapse;width:100%;background:white}
    th,td{border:1px solid #ddd;padding:10px;text-align:left;vertical-align:top}
    pre{white-space:pre-wrap;margin:0;max-height:280px;overflow:auto}
    .ok{color:#15803d;font-weight:700}.bad{color:#b91c1c;font-weight:700}
  </style></head><body>
    <h1>ServiceOps Diagnostics</h1>
    <p>Total: ${Date.now() - startedAt}ms</p>
    <table><thead><tr><th>Check</th><th>Status</th><th>Time</th><th>Detail</th></tr></thead><tbody>${rows}</tbody></table>
  </body></html>`;
}

function escapeDebugHtml(value) {
  return String(value == null ? "" : value).replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));
}

function getDashboardData() {
  try {
    const calendarEvents = CalendarServiceReadOnly.getCachedOrRefresh();
    const intakeRows = getRows(SHEETS.intake, 2000);
    const requestContext = buildRequestContext({
      customers: getRows(SHEETS.customers, 10000),
      locations: getRows(SHEETS.locations, 10000),
      assets: getRows(SHEETS.assets, 5000),
      opportunities: getRows(SHEETS.opportunities, 5000),
      workOrders: getRows(SHEETS.workOrders, 5000),
      tasks: getRows(SHEETS.tasks, 5000),
      calendarEvents
    });
    const baseCards = intakeRows
      .filter(isActiveIntake)
      .sort((a, b) => toDate(b.Timestamp || b["Submitted At"]) - toDate(a.Timestamp || a["Submitted At"]))
      .map((row, index) => buildFastRequestCard(row, index, requestContext));
    const cards = mergeCalendarEventsIntoCards(baseCards, calendarEvents);
    const attention = cards.filter((card) => card.operationalStage === REQUEST_STAGES.REVIEW || card.visualState.tone === "red");
    const cache = getCacheStatus();
    const today = buildTodayView(cards, cache);

    return {
      ok: true,
      version: SERVICEOPS_WEBAPP_VERSION,
      generatedAt: new Date().toISOString(),
      cache,
      metrics: {
        active: cards.length,
        attention: today.needsActionNow.length,
        ready: today.readyForScheduling.length,
        scheduled: cards.filter((card) => card.operationalStage === REQUEST_STAGES.SCHEDULED).length
      },
      today,
      cards,
      attention
    };
  } catch (error) {
    return failure("Dashboard failed to load", error);
  }
}

function getCardDetails(query) {
  try {
    const context = getLookupContext();
    const match = deterministicLookup(String(query || ""), context);
    const profile = intakeProfile({});
    const summary = buildAssistantSummary(query, match, context);
    return { ok: true, match, summary, intelligence: serviceIntelligence(profile, match, context) };
  } catch (error) {
    return failure("Card details failed", error);
  }
}

function assistantLookup(query) {
  try {
    const text = String(query || "").trim();
    if (!text) return conversationalReply("What would you like me to check? You can paste a phone, email, address, SO/SWO number, or ask about a visible request.");
    if (isGreeting(text)) {
      return conversationalReply("Hi. I can help check customers, appointments, duplicate risk, fireplace history, open work, or the safest next action. Send me a phone number, email, address, SO/SWO number, or click Ask Assistant on a request card.");
    }
    if (!hasLookupSignal(text)) {
      return conversationalReply("I can help with that, but I need one concrete clue first: customer name, phone, email, address, city, or SO/SWO number. If you are looking at a request card, use Ask Assistant on that card and I will pull the context automatically.");
    }

    const context = getLookupContext();
    const match = deterministicLookup(text, context);
    const summary = buildAssistantSummary(text, match, context);
    const ai = maybeOpenAiServiceSummary(text, summary);

    logRecommendation("assistant_lookup", {
      query: text,
      confidence: match.confidence,
      matchType: match.matchType,
      usedAi: Boolean(ai && ai.ok)
    });

    return {
      ok: true,
      query: text,
      match,
      sections: ai && ai.ok ? mergeAiSummary(summary, ai.summary) : summary,
      aiAvailable: Boolean(ai && ai.ok),
      aiNotice: ai && ai.ok ? "AI summary included. Read-only." : "Using cached Striven data only."
    };
  } catch (error) {
    return failure("Assistant lookup failed", error);
  }
}

function getAssistantRuntimeConfig() {
  try {
    const props = PropertiesService.getScriptProperties();
    const streamUrl = props.getProperty("SERVICEOPS_AGENT_STREAM_URL") || "";
    const sharedSecret = props.getProperty("SERVICEOPS_AGENT_SHARED_SECRET") || "";
    return {
      ok: true,
      streamUrl,
      token: streamUrl && sharedSecret ? createServiceOpsAgentToken(sharedSecret) : "",
      hasStreaming: Boolean(streamUrl && sharedSecret),
      fallbackAvailable: Boolean(props.getProperty("OPENAI_API_KEY")),
      generatedAt: new Date().toISOString()
    };
  } catch (error) {
    return failure("Assistant runtime config failed", error);
  }
}

function buildAssistantContext(input) {
  try {
    const payload = input || {};
    const card = payload.card || {};
    const request = card.serviceRequest || {};
    const details = card.detailFields || {};
    const contactText = String(card.contact || "");
    const phone = details.phone || (contactText.match(/\+?\d[\d\s().-]{8,}/) || [""])[0];
    const email = details.email || (contactText.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i) || [""])[0];
    const warnings = (card.risks || []).map((risk) => risk.text || risk.label || String(risk)).filter(Boolean);
    const calendarEvent = card.calendarEvent || card.appointment || (request.appointmentDate ? {
      technician: card.suggestedTech || request.technician || "",
      startDateTime: request.appointmentDate,
      endDateTime: request.appointmentEnd || "",
      creatorEmail: request.creatorEmail || card.creatorEmail || "",
      organizerEmail: request.organizerEmail || card.organizerEmail || "",
      title: request.appointmentTitle || card.issueLabel || "",
      location: details.address || card.location || ""
    } : null);

    return {
      ok: true,
      context: {
        requestId: String(payload.requestId || card.id || request.requestId || ""),
        customerId: request.customerId || details.customerId || "",
        customerDisplay: String(card.customer || details.customer || ""),
        locationDisplay: String(details.address || card.location || card.city || ""),
        applianceDisplay: String(details.fireplaceDetails || card.fireplace || ""),
        issue: String(details.fullNotes || card.issueSummary || card.issueLabel || ""),
        lane: String(payload.lane || request.operationalStage || card.operationalStage || card.status || ""),
        matchConfidence: Number((card.customerResolution && card.customerResolution.confidence) || card.matchConfidence || 0),
        warnings,
        contact: {
          phone: String(phone || ""),
          altPhone: String(details.altPhone || ""),
          email: String(email || "")
        },
        address: {
          street: String(details.street || ""),
          city: String(card.city || details.city || ""),
          province: String(details.province || ""),
          postalCode: String(details.postalCode || "")
        },
        raw: {
          status: card.status || "",
          requestStatus: request.requestStatus || "",
          nextAction: card.nextAction || "",
          submittedAt: card.submittedAt || ""
        },
        candidates: compactAssistantCandidates(card),
        serviceHistory: compactAssistantHistory(card),
        calendarEvent
      }
    };
  } catch (error) {
    return failure("Assistant context build failed", error);
  }
}

function recordOperatorDecision(input) {
  try {
    const decision = input || {};
    const allowed = ["Approve", "Needs Info", "Duplicate", "Reject", "Verify Customer", "Create New Customer", "Send to Review", "Mark Waiting", "Ready for Scheduling", "Approve WO", "Kanban Move"];
    if (allowed.indexOf(decision.action) === -1) {
      return { ok: false, message: "Unsupported decision. No records were changed." };
    }

    appendDecisionLog({
      at: new Date().toISOString(),
      operator: Session.getActiveUser().getEmail() || "Unknown operator",
      requestId: String(decision.requestId || ""),
      customer: String(decision.customer || ""),
      action: decision.action,
      note: String(decision.note || ""),
      result: "Logged only. No Striven write was called."
    });

    return { ok: true, message: decisionMessage(decision.action) };
  } catch (error) {
    return failure("Could not log decision", error);
  }
}

function decisionMessage(action) {
  const messages = {
    "Approve": "Approval noted in ServiceOps. Real Striven writes are still off for this phase.",
    "Approve WO": "Work-order approval noted. The live Striven write remains disabled until the approval gate is turned on.",
    "Needs Info": "Needs-info follow-up noted. No customer or work-order record was changed.",
    "Duplicate": "Duplicate review noted. No records were merged or closed.",
    "Reject": "Rejection noted for operator review. No Striven record was changed.",
    "Verify Customer": "Customer verification noted. No Striven customer was changed.",
    "Create New Customer": "New-customer intent noted. Customer creation is still gated and was not sent to Striven.",
    "Send to Review": "Request moved to review in the local audit trail.",
    "Mark Waiting": "Waiting-on-customer state noted in the local audit trail.",
    "Ready for Scheduling": "Ready-for-scheduling note saved locally. No dispatch or calendar write was made.",
    "Kanban Move": "Board movement saved locally and logged. No Striven workflow state was changed."
  };
  return messages[action] || `${action} noted in ServiceOps. No live write was made.`;
}

function refreshAllData() {
  const result = refreshReportData({ onlyStale: false, installTrigger: true });
  const calendar = CalendarServiceReadOnly.refreshCache();
  result.refreshed = (result.refreshed || []).concat(`tech calendars: ${calendar.events.length}`);
  if (calendar.errors.length) result.errors = (result.errors || []).concat(calendar.errors);
  return result;
}

function refreshStaleData() {
  invalidateUiPayloadCache();
  const result = refreshReportData({ onlyStale: true, installTrigger: true });
  const calendar = CalendarServiceReadOnly.refreshCache();
  result.refreshed = (result.refreshed || []).concat(`tech calendars: ${calendar.events.length}`);
  if (calendar.errors.length) result.errors = (result.errors || []).concat(calendar.errors);
  return result;
}

function refreshStaleDataWithLog() {
  invalidateUiPayloadCache();
  return refreshReportData({ onlyStale: true, installTrigger: true, adminAction: "refresh_stale_data_admin" });
}

function forceFullRefreshWithLog() {
  invalidateUiPayloadCache();
  return refreshReportData({ onlyStale: false, installTrigger: true, adminAction: "force_full_refresh_admin" });
}

function testIntegrationHealth() {
  const props = PropertiesService.getScriptProperties();
  const checks = integrationHealth(props).map((item) => ({
    name: item.name,
    status: item.status,
    message: item.message
  }));
  appendDecisionLog({
    at: new Date().toISOString(),
    operator: Session.getActiveUser().getEmail() || "Admin diagnostics",
    requestId: "",
    customer: "",
    action: "test_integrations",
    note: JSON.stringify(checks).slice(0, 900),
    result: checks.some((item) => item.status === "Error") ? "Integration diagnostics found issues." : "Integration diagnostics completed."
  });
  return { ok: true, checks };
}

function serviceOpsAutoRefresh() {
  refreshReportData({ onlyStale: true, installTrigger: false });
}

function getAdminData() {
  try {
    const props = PropertiesService.getScriptProperties();
    const cache = getCacheStatus();
    const sheetStatus = requiredSheetStatus();
    const propertyGroups = groupedPropertySummary(props);
    const integrations = integrationHealth(props);
    const issues = adminIssues(cache, sheetStatus, propertyGroups, integrations);
    return {
      ok: true,
      version: {
        tag: SERVICEOPS_WEBAPP_VERSION,
        deployedAt: props.getProperty("SERVICEOPS_DEPLOYED_AT") || SERVICEOPS_DEPLOYED_AT,
        environment: props.getProperty("SERVICEOPS_ENVIRONMENT") || "Production",
        latestState: "Current deployment"
      },
      scriptId: ScriptApp.getScriptId(),
      cache,
      freshness: cache.reports.map((item) => ({
        key: item.key,
        label: item.label,
        status: item.state === "Unknown" ? "Error" : item.state,
        ageMinutes: item.ageMinutes,
        maxMinutes: item.maxMinutes,
        lastSync: item.lastSync,
        indicator: item.state === "Fresh" ? "green" : item.state === "Stale" ? "yellow" : "red"
      })),
      sheetStatus,
      propertyGroups,
      integrationHealth: integrations,
      issues
    };
  } catch (error) {
    return failure("Admin data failed", error);
  }
}

function getAdminSettingsCatalog() {
  try {
    const props = PropertiesService.getScriptProperties();
    const groups = adminSettingsDefinition().map((group) => ({
      ...group,
      items: group.items.map((item) => {
        const value = props.getProperty(item.key) || "";
        return {
          ...item,
          configured: Boolean(value),
          value: item.secret ? maskSettingValue(value) : value,
          status: value ? "Configured" : item.required ? "Missing" : "Optional"
        };
      })
    }));
    const missingRequired = groups.flatMap((group) => group.items
      .filter((item) => item.required && !item.configured)
      .map((item) => ({ category: group.name, key: item.key, label: item.label })));
    return {
      ok: true,
      generatedAt: new Date().toISOString(),
      environment: props.getProperty("SERVICEOPS_ENVIRONMENT") || "Production",
      groups,
      missingRequired,
      note: "Values are stored in Apps Script Script Properties. Secret values are masked after save."
    };
  } catch (error) {
    return failure("Admin settings catalog failed", error);
  }
}

function getWebformRequestsData() {
  try {
    return getWebformRequestsQueueData();
  } catch (error) {
    return failure("Webform requests failed to load", error);
  }
}

function getWebformRequestsDataLegacy_() {
  try {
    const cached = getUiPayloadCache("webformRequests");
    if (cached) return cached;
    const startedAt = Date.now();
    const rows = getRows(SHEETS.intake, REQUEST_FIRST_LOAD_LIMIT)
      .filter((row) => row && Object.keys(row).length)
      .map((row, index) => webformRequestSummary(row, index))
      .sort((a, b) => (b.sortTime || 0) - (a.sortTime || 0));
    return setUiPayloadCache("webformRequests", {
      ok: true,
      generatedAt: new Date().toISOString(),
      source: "sheet",
      loadMs: Date.now() - startedAt,
      count: rows.length,
      rows
    });
  } catch (error) {
    return failure("Webform requests failed to load", error);
  }
}

function getKanbanData() {
  try {
    const cached = getUiPayloadCache("kanban");
    if (cached) return cached;
    const startedAt = Date.now();
    const requestRows = getRows(SHEETS.intake, KANBAN_REQUEST_LIMIT)
      .filter((row) => row && Object.keys(row).length)
      .map((row, index) => webformRequestSummary(row, index))
      .sort((a, b) => (b.sortTime || 0) - (a.sortTime || 0));
    const opportunityRows = getRows(SHEETS.opportunities, KANBAN_OPPORTUNITY_LIMIT)
      .filter((row) => row && Object.keys(row).length)
      .map((row, index) => strivenOpportunitySummary(row, index));
    const opportunitiesById = {};
    opportunityRows.forEach((opportunity) => {
      if (opportunity.opportunityId) opportunitiesById[normalizeKanbanId(opportunity.opportunityId)] = opportunity;
    });

    const linkedOpportunityIds = {};
    const requestCards = requestRows.map((request) => {
      const opportunityKey = normalizeKanbanId(request.opportunityId);
      const opportunity = opportunityKey ? opportunitiesById[opportunityKey] : null;
      if (opportunityKey && opportunity) linkedOpportunityIds[opportunityKey] = true;
      return kanbanCardFromRequest(request, opportunity);
    });
    const standaloneOpportunityCards = opportunityRows
      .filter((opportunity) => opportunity.opportunityId && !linkedOpportunityIds[normalizeKanbanId(opportunity.opportunityId)])
      .filter((opportunity) => opportunity.isOpen || opportunity.lane === "Completed")
      .map((opportunity) => kanbanCardFromOpportunity(opportunity));
    const cards = requestCards.concat(standaloneOpportunityCards)
      .sort((a, b) => (b.sortTime || 0) - (a.sortTime || 0));
    const lanes = ["Review", "Intake", "Customer", "Opportunity", "SWO Gate", "Scheduling", "Completed"].map((lane) => ({
      lane,
      cards: cards.filter((card) => card.lane === lane)
    }));
    return setUiPayloadCache("kanban", {
      ok: true,
      generatedAt: new Date().toISOString(),
      source: "sheet",
      loadMs: Date.now() - startedAt,
      counts: {
        requests: requestCards.length,
        opportunities: opportunityRows.length,
        standaloneOpportunities: standaloneOpportunityCards.length,
        totalCards: cards.length
      },
      lanes,
      cards
    });
  } catch (error) {
    return failure("Kanban data failed to load", error);
  }
}

function webformRequestSummary(row, index) {
  const firstName = firstValue(row, ["First Name", "First"]);
  const lastName = firstValue(row, ["Last Name", "Last"]);
  const name = [firstName, lastName].filter(Boolean).join(" ") || firstValue(row, ["Name", "Customer Name"]) || "Unknown customer";
  const timestamp = firstValue(row, ["Timestamp", "Submitted At", "Created At", "Date"]);
  const details = firstValue(row, ["Details", "Service Details", "Issue", "Description"]);
  const anythingElse = firstValue(row, ["Anything Else", "Notes", "Additional Notes"]);
  const makeModelAge = firstValue(row, ["Make/Model/Age", "Make Model Age", "Fireplace", "Fireplace Details"]);
  const phone = firstValue(row, ["Phone", "Primary Phone", "Phone Number"]);
  const altPhone = firstValue(row, ["Alt Phone", "Alternate Phone", "Alternative Phone"]);
  const email = firstValue(row, ["Email", "Email Address"]);
  const street = firstValue(row, ["Street", "Address", "Street Address"]);
  const city = firstValue(row, ["City"]);
  const province = firstValue(row, ["Province", "State"]);
  const postalCode = firstValue(row, ["Postal Code", "PostalCode", "Zip"]);
  const preferredDays = firstValue(row, ["Preferred Days", "Preferred Day", "Preference"]);
  const customerId = firstValue(row, ["Customer#", "Customer #", "Customer ID", "Striven Customer ID"]);
  const opportunityId = firstValue(row, ["Opp#", "Opportunity #", "Opportunity ID", "Striven Opportunity ID"]);
  const salesOrderId = firstValue(row, ["SO#", "Sales Order #", "Sales Order ID", "SWO#"]);
  const taskId = firstValue(row, ["Task#", "Task ID", "Service Task ID"]);
  const status = firstValue(row, ["Current Stage", "Pipeline State", "Status", "Match Status"]) || "New Request";
  const fullText = [details, anythingElse, makeModelAge].join(" ");
  const issue = issueLabel({ details, makeModelAge }) || classifyWebformIssue(fullText);
  const risk = webformRisk(fullText, status);
  const identity = customerId ? `Customer #${customerId}` : "New customer";
  const displayPrefix = customerId ? `#${customerId}` : "#NEW";
  const displayName = `${displayPrefix} - ${name}`;
  return {
    id: firstValue(row, ["Request ID", "Webform Row #", "Row ID", "ID"]) || `WF-${row._rowNumber || index + 1}`,
    rowNumber: row._rowNumber || index + 1,
    submittedAt: timestamp,
    sortTime: toDate(timestamp) || 0,
    customer: displayName,
    customerPrefix: displayPrefix,
    customerPrefixClass: customerId ? "configured" : "missing",
    customerName: name,
    phone,
    altPhone,
    email,
    street,
    city,
    province,
    postalCode,
    location: [city, province, postalCode].filter(Boolean).join(", "),
    preferredDays,
    makeModelAge: makeModelAge || "Unknown fireplace",
    details: details || "No issue details captured",
    anythingElse,
    issue,
    risk,
    status,
    identity,
    customerId,
    opportunityId,
    salesOrderId,
    taskId,
    nextAction: webformNextAction({ customerId, opportunityId, salesOrderId, taskId, status, risk })
  };
}

function strivenOpportunitySummary(row, index) {
  const opportunityId = firstValue(row, ["Opportunity ID", "OpportunityId", "Opp ID", "ID", "Id", "Number"]);
  const stage = firstValue(row, ["Stage", "OpportunityStage", "Opportunity Stage", "Status", "OpportunityStatus", "Opportunity Status"]);
  const title = firstValue(row, ["Opportunity Name", "Name", "Title", "Opportunity", "Description"]) || `Opportunity ${opportunityId || index + 1}`;
  const customerId = firstValue(row, ["Customer ID", "CustomerId", "Customer #", "CustomerNumber"]);
  const customerName = firstValue(row, ["Customer Name", "CustomerName", "Customer", "Account Name", "Name"]);
  const createdAt = firstValue(row, ["Created Date", "Date Created", "Create Date", "Created"]);
  const modifiedAt = firstValue(row, ["Modified Date", "Last Modified", "Updated Date", "Updated"]);
  const closeDate = firstValue(row, ["Close Date", "Closed Date", "Expected Close Date"]);
  const value = firstValue(row, ["Value", "Amount", "Estimated Value", "Opportunity Value", "Total"]);
  const owner = firstValue(row, ["Owner", "Sales Rep", "Assigned To", "Representative"]);
  const stageText = String(stage || "");
  const closed = /closed|completed|lost|done|cancel/i.test(stageText);
  const lane = opportunityLane(stage, { opportunityId, customerId, customerName });
  return {
    id: `OPP-${opportunityId || index + 1}`,
    source: "opportunity",
    opportunityId,
    title,
    customerId,
    customerName,
    stage,
    status: stage || "Unknown",
    createdAt,
    modifiedAt,
    closeDate,
    value,
    owner,
    lane,
    isOpen: !closed,
    sortTime: toDate(modifiedAt) || toDate(createdAt) || toDate(closeDate) || 0,
    raw: row
  };
}

function kanbanCardFromRequest(request, opportunity) {
  const lane = requestKanbanLane(request, opportunity);
  const stage = opportunity ? opportunity.stage : "";
  return {
    id: `REQ-${request.id}`,
    source: opportunity ? "hybrid" : "request",
    lane,
    title: request.customer || "Unknown customer",
    subtitle: request.issue || "Service request",
    customer: request.customer,
    phone: request.phone,
    email: request.email,
    location: request.location,
    submittedAt: request.submittedAt,
    sortTime: request.sortTime || 0,
    status: request.status || "New Request",
    risk: request.risk || "Low",
    nextAction: request.nextAction || "Review",
    request,
    opportunity,
    opportunityId: request.opportunityId || (opportunity && opportunity.opportunityId) || "",
    opportunityStage: stage,
    customerId: request.customerId || (opportunity && opportunity.customerId) || "",
    salesOrderId: request.salesOrderId || "",
    taskId: request.taskId || ""
  };
}

function kanbanCardFromOpportunity(opportunity) {
  return {
    id: `OPP-STANDALONE-${opportunity.opportunityId}`,
    source: "opportunity",
    lane: opportunity.lane,
    title: opportunity.customerName || opportunity.title || `Opportunity ${opportunity.opportunityId}`,
    subtitle: opportunity.title || "Unmatched Striven opportunity",
    customer: opportunity.customerName || "",
    phone: "",
    email: "",
    location: "",
    submittedAt: opportunity.createdAt || opportunity.modifiedAt || opportunity.closeDate || "",
    sortTime: opportunity.sortTime || 0,
    status: opportunity.status || "Unknown",
    risk: opportunity.lane === "Review" ? "Medium" : "Low",
    nextAction: opportunityNextAction(opportunity),
    request: null,
    opportunity,
    opportunityId: opportunity.opportunityId,
    opportunityStage: opportunity.stage,
    customerId: opportunity.customerId,
    salesOrderId: "",
    taskId: ""
  };
}

function requestKanbanLane(request, opportunity) {
  const status = String(request.status || "");
  const stage = String((opportunity && opportunity.stage) || request.status || "");
  if (/review|missing|blocked|error/i.test(status) || request.risk === "High") return "Review";
  if (/done|completed|closed|cancel/i.test(status) || /done|completed|closed|cancel/i.test(stage)) return "Completed";
  if (request.taskId || request.salesOrderId || /scheduled|service work order created/i.test(status) || /service work order created/i.test(stage)) return "Scheduling";
  if (/approved for swo/i.test(stage) || /approved for swo/i.test(status)) return "SWO Gate";
  if (request.opportunityId || opportunity) return "Opportunity";
  if (request.customerId) return "Customer";
  return "Intake";
}

function opportunityLane(stage, identity) {
  const text = String(stage || "");
  if (!identity.opportunityId || (!identity.customerId && !identity.customerName) || !text) return "Review";
  if (/closed|completed|lost|done|cancel|service work order created/i.test(text)) return "Completed";
  if (/approved for swo/i.test(text)) return "SWO Gate";
  return "Opportunity";
}

function opportunityNextAction(opportunity) {
  if (opportunity.lane === "Review") return "Review opportunity data";
  if (opportunity.lane === "SWO Gate") return "Check SWO gate";
  if (opportunity.lane === "Completed") return "No action";
  return "Match to request";
}

function normalizeKanbanId(value) {
  return String(value || "").trim().replace(/[^a-z0-9]/gi, "").toLowerCase();
}

function classifyWebformIssue(text) {
  const source = String(text || "").toLowerCase();
  if (/pilot|ignite|ignit|spark/.test(source)) return "Pilot / ignition";
  if (/fan|noise|sound/.test(source)) return "Fan / noise";
  if (/install|upgrade|replace|screen|glass/.test(source)) return "Install / upgrade";
  if (/clean|service|maintenance|annual/.test(source)) return "Annual service";
  if (/heat|turn on|won't start|will not start/.test(source)) return "No heat";
  return "Service request";
}

function webformRisk(text, status) {
  const source = `${text || ""} ${status || ""}`.toLowerCase();
  if (/gas smell|carbon monoxide|co alarm|blocked|error|duplicate|leak/.test(source)) return "High";
  if (/missing|review|unknown|no issue details|clarification|approval/.test(source)) return "Medium";
  return "Low";
}

function webformNextAction(input) {
  if (!input.customerId) return "Resolve customer";
  if (/review|missing|blocked|error/i.test(input.status || "")) return "Review intake";
  if (!input.opportunityId) return "Prepare opportunity";
  if (!input.salesOrderId) return "Check work order gate";
  if (!input.taskId) return "Map task";
  return "Monitor schedule";
}

function saveAdminSetting(input) {
  try {
    const payload = input || {};
    const key = String(payload.key || "").trim();
    const value = String(payload.value == null ? "" : payload.value).trim();
    const definition = findAdminSettingDefinition(key);
    if (!definition) throw new Error(`Unknown or unsupported setting: ${key}`);
    if (!key || !/^[A-Z0-9_]+$/.test(key)) throw new Error("Invalid setting key.");
    PropertiesService.getScriptProperties().setProperty(key, value);
    const operator = Session.getActiveUser().getEmail() || "Admin";
    appendDecisionLog({
      at: new Date().toISOString(),
      operator,
      requestId: "",
      customer: "",
      action: "admin_setting_saved",
      note: `${definition.category} / ${definition.label} (${key})`,
      result: definition.secret ? "Saved secret value (masked)." : `Saved value: ${maskSettingValue(value)}`
    });
    return {
      ok: true,
      key,
      status: value ? "Configured" : definition.required ? "Missing" : "Optional",
      value: definition.secret ? maskSettingValue(value) : value,
      logged: true
    };
  } catch (error) {
    return failure("Admin setting save failed", error);
  }
}

function getScheduleData() {
  try {
    const rows = getRows(SHEETS.tasks, 500).map((row, index) => ({
      id: firstValue(row, ["Task ID", "ID", "Service Task ID"]) || `task-${index + 1}`,
      title: firstValue(row, ["Task Name", "Name", "Subject"]) || firstValue(row, ["Sales Order Number", "SO Number"]) || "Service task",
      technician: firstValue(row, ["Technician", "Service Tech", "Assigned To", "Service Tech (CF 794)"]) || "Unassigned",
      start: firstValue(row, ["Start", "Start Date", "Scheduled Date", "Date"]) || "",
      status: firstValue(row, ["Status", "Task Status"]) || "Open",
      city: firstValue(row, ["City", "Location City"]) || "",
      so: firstValue(row, ["Sales Order Number", "SO Number", "SWO#", "Order Number"]) || "",
      customer: firstValue(row, ["Customer", "Customer Name", "Name"]) || "",
      phone: firstValue(row, ["Phone", "Primary Phone"]) || "",
      level: firstValue(row, ["Level", "Service Level"]) || "",
      issueLabel: issueLabel({ details: firstValue(row, ["Details", "Description", "Task Name", "Name", "Subject"]) }),
      bucket: scheduleBucket(firstValue(row, ["Start", "Start Date", "Scheduled Date", "Date"]) || "")
    }));
    return { ok: true, rows };
  } catch (error) {
    return failure("Schedule failed to load", error);
  }
}

function getAgentLogData() {
  try {
    return {
      ok: true,
      rows: getRows(SHEETS.decisions, 500).reverse().map((row, index) => {
        const action = firstValue(row, ["Action"]) || "";
        const note = firstValue(row, ["Note"]) || "";
        const result = firstValue(row, ["Result"]) || "";
        const severity = /error|failed|failure/i.test(`${note} ${result}`) ? "Error" : /none|skipped|stale|warning/i.test(`${note} ${result}`) ? "Warning" : "Info";
        return {
        id: `log-${index + 1}`,
        timestamp: firstValue(row, ["At"]) || "",
        at: firstValue(row, ["At"]) || "",
        operator: firstValue(row, ["Operator"]) || "",
        requestId: firstValue(row, ["Request ID"]) || "",
        customer: firstValue(row, ["Customer"]) || "",
        action,
        type: action || "log_entry",
        severity,
        summary: summarizeLog(action, note, result),
        note,
        result,
        details: [note, result].filter(Boolean).join("\n")
      };
      })
    };
  } catch (error) {
    return failure("Agent logs failed to load", error);
  }
}

function adminSettingsDefinition() {
  return [
    {
      name: "Striven",
      description: "CRM/ERP source of truth, report APIs, and future write gates.",
      items: [
        { key: "STRIVEN_BASE_URL", label: "Base URL", type: "url", required: true, secret: false, placeholder: "https://api.striven.com", help: "Primary Striven API base URL." },
        { key: "STRIVEN_CLIENT_ID", label: "Client ID", type: "text", required: true, secret: true, placeholder: "Client ID", help: "OAuth/client credential ID. Rotate if exposed." },
        { key: "STRIVEN_CLIENT_SECRET", label: "Client Secret", type: "password", required: true, secret: true, placeholder: "Client secret", help: "OAuth/client credential secret. Never expose to operators." },
        { key: "STRIVEN_CUSTOMER_REPORT_API_KEY", label: "Customers Report URL/API Key", type: "url", required: true, secret: true, placeholder: "https://api.striven.com/v2/reports/...", help: "Authoritative customer report source." },
        { key: "REPORT_LOCATIONS_KEY", label: "Locations Report URL/API Key", type: "url", required: true, secret: true, placeholder: "https://api.striven.com/v2/reports/...", help: "Authoritative location report source." },
        { key: "SERVICE_TASKS_REPORT_URL", label: "Service Tasks Report URL", type: "url", required: true, secret: true, placeholder: "https://api.striven.com/v2/reports/...", help: "Operational task source of truth." },
        { key: "SERVICEOPS_STRIVEN_WRITE_MODE", label: "Striven Write Mode", type: "select", options: ["disabled", "test", "enabled"], required: true, secret: false, placeholder: "disabled", help: "Keep disabled until gated writes are approved." },
        { key: "SERVICEOPS_STRIVEN_PAGE_SIZE", label: "Report Page Size", type: "number", required: false, secret: false, placeholder: "10000", help: "Used for paginated report pulls." }
      ]
    },
    {
      name: "Google Sheets",
      description: "Working cache, report mirrors, intake source, and audit log.",
      items: [
        { key: "SPREADSHEET_ID", label: "Spreadsheet ID", type: "text", required: true, secret: false, placeholder: "Google Sheet ID", help: "Sheet containing Web Form and Striven cache tabs." },
        { key: "SERVICEOPS_CACHE_SOURCE", label: "Visible Data Source", type: "select", options: ["cache", "demo"], required: false, secret: false, placeholder: "cache", help: "Use cache in production; demo only for fallback." },
        { key: "SERVICEOPS_REFRESH_LOCK_TTL_SECONDS", label: "Refresh Lock TTL Seconds", type: "number", required: false, secret: false, placeholder: "300", help: "Prevents overlapping refresh jobs." },
        { key: "SERVICEOPS_REQUIRED_SHEETS", label: "Required Sheets Override", type: "textarea", required: false, secret: false, placeholder: "Optional comma-separated sheet list", help: "Leave blank to use built-in required sheets." }
      ]
    },
    {
      name: "Google Calendar",
      description: "Read-only technician schedule visibility. Striven Tasks remain operational truth.",
      items: [
        { key: "SERVICEOPS_CALENDAR_CHRIS_ID", label: "Chris Calendar ID", type: "text", required: true, secret: false, placeholder: "calendar id", help: "Explicit configured calendar only." },
        { key: "SERVICEOPS_CALENDAR_TRAVIS_ID", label: "Travis Calendar ID", type: "text", required: true, secret: false, placeholder: "calendar id", help: "Must filter to Classic Fireplace-created/organized events." },
        { key: "SERVICEOPS_CALENDAR_MATT_ID", label: "Matt Calendar ID", type: "text", required: true, secret: false, placeholder: "calendar id", help: "Explicit configured calendar only." },
        { key: "CALENDAR_ALLOWED_ORGANIZER_DOMAIN", label: "Allowed Organizer Domain", type: "text", required: true, secret: false, placeholder: "@classicfireplace.ca", help: "Applied to Chris and Travis contractor calendars." },
        { key: "SERVICEOPS_CALENDAR_PAST_DAYS", label: "Calendar Past Days", type: "number", required: false, secret: false, placeholder: "0", help: "How far back to read calendar events. Default is today only." },
        { key: "SERVICEOPS_CALENDAR_FUTURE_DAYS", label: "Calendar Future Days", type: "number", required: false, secret: false, placeholder: "365", help: "How far ahead to read calendar events." },
        { key: "SERVICEOPS_CALENDAR_REFRESH_MINUTES", label: "Calendar Refresh Minutes", type: "number", required: false, secret: false, placeholder: "10", help: "Calendar should refresh more often than static datasets." }
      ]
    },
    {
      name: "OpenAI / Assistant",
      description: "Recommendation layer only. AI cannot approve, merge, schedule, or write records.",
      items: [
        { key: "OPENAI_API_KEY", label: "OpenAI API Key", type: "password", required: false, secret: true, placeholder: "sk-...", help: "Use a real OpenAI key, not an OpenRouter key." },
        { key: "SERVICEOPS_AI_ENABLED", label: "AI Enabled", type: "select", options: ["false", "true"], required: false, secret: false, placeholder: "false", help: "Turn off for deterministic-only mode." },
        { key: "SERVICEOPS_MODEL_CHEAP", label: "Low-cost Model", type: "text", required: false, secret: false, placeholder: "gpt-4.1-mini", help: "Extraction, summaries, copy." },
        { key: "SERVICEOPS_MODEL_MID", label: "Mid-tier Model", type: "text", required: false, secret: false, placeholder: "gpt-4.1", help: "Matching/review recommendations." },
        { key: "SERVICEOPS_MODEL_STRONG", label: "Strong Model", type: "text", required: false, secret: false, placeholder: "gpt-5.1", help: "Ambiguous identity/scheduling conflicts." },
        { key: "SERVICEOPS_AI_TIMEOUT_MS", label: "AI Timeout MS", type: "number", required: false, secret: false, placeholder: "12000", help: "Fail closed to Needs Review when AI is unavailable." }
      ]
    },
    {
      name: "Technician Rules",
      description: "Skill, capacity, territory, and contractor routing constraints.",
      items: [
        { key: "SERVICEOPS_TECH_SKILL_MATRIX_JSON", label: "Technician Skill Matrix JSON", type: "textarea", required: false, secret: false, placeholder: "{\"Travis\":[\"Jotul\",\"Ortal\",\"General\"],\"Chris\":[\"General\"],\"Matt\":[\"General\"]}", help: "Future dispatch recommendation source." },
        { key: "SERVICEOPS_TECH_MAX_JOBS_PER_DAY", label: "Max Jobs Per Tech / Day", type: "number", required: false, secret: false, placeholder: "5", help: "Operational target before overload warnings." },
        { key: "SERVICEOPS_TRAVIS_COMPLEX_MAX", label: "Travis Complex Max / Day", type: "number", required: false, secret: false, placeholder: "2", help: "Jotul/Ortal complex job cap." },
        { key: "SERVICEOPS_NO_WOOD_SERVICE_TECHS", label: "No Wood Service Techs", type: "text", required: false, secret: false, placeholder: "Travis", help: "Comma-separated list for dispatch guardrails." }
      ]
    },
    {
      name: "Scheduling / Routing",
      description: "Service windows, regions, drive-time, SLA, and stale-work rules.",
      items: [
        { key: "SERVICEOPS_SERVICE_WINDOWS", label: "Service Windows", type: "text", required: false, secret: false, placeholder: "9-12,1-4", help: "Prefer windows over rigid minute scheduling." },
        { key: "GOOGLE_MAPS_API_KEY", label: "Google Maps API Key", type: "password", required: false, secret: true, placeholder: "AIza...", help: "Future routing/drive-time provider." },
        { key: "SERVICEOPS_REGION_MAP_JSON", label: "Postal/City Region Map JSON", type: "textarea", required: false, secret: false, placeholder: "{\"Ajax\":\"Durham\",\"Whitby\":\"Durham\"}", help: "Used for clustering and territory assignment." },
        { key: "SERVICEOPS_DEFAULT_JOB_DURATION_MIN", label: "Default Job Duration Minutes", type: "number", required: false, secret: false, placeholder: "90", help: "Fallback when issue type duration is unknown." },
        { key: "SERVICEOPS_OVERDUE_HOURS", label: "Overdue Hours", type: "number", required: false, secret: false, placeholder: "48", help: "When a request becomes overdue." }
      ]
    },
    {
      name: "Parts / Inventory",
      description: "Parts readiness gate before dispatch.",
      items: [
        { key: "SERVICEOPS_INVENTORY_SOURCE", label: "Inventory Source", type: "select", options: ["none", "striven_report", "sheet"], required: false, secret: false, placeholder: "none", help: "Where parts availability will be checked." },
        { key: "SERVICEOPS_PARTS_REPORT_URL", label: "Parts Report URL", type: "url", required: false, secret: true, placeholder: "https://api.striven.com/v2/reports/...", help: "Optional future parts availability report." },
        { key: "SERVICEOPS_PARTS_GATE_ENABLED", label: "Parts Gate Enabled", type: "select", options: ["false", "true"], required: false, secret: false, placeholder: "false", help: "When true, missing parts can hold dispatch." }
      ]
    },
    {
      name: "Workflow / Notifications / Security",
      description: "Operator roles, safe writes, alerts, and audit behavior.",
      items: [
        { key: "TEST_MODE", label: "Test Mode", type: "select", options: ["true", "false"], required: true, secret: false, placeholder: "true", help: "Keep true while writes are simulated." },
        { key: "SERVICEOPS_OPERATOR_ROLES_JSON", label: "Operator Roles JSON", type: "textarea", required: false, secret: false, placeholder: "{\"dispatcher\":[],\"manager\":[],\"admin\":[]}", help: "Future role gating." },
        { key: "SERVICEOPS_NOTIFICATION_MODE", label: "Notification Mode", type: "select", options: ["off", "ui_only", "email", "sms"], required: false, secret: false, placeholder: "ui_only", help: "Controls future alerts." },
        { key: "TWILIO_SID", label: "Twilio SID", type: "password", required: false, secret: true, placeholder: "AC...", help: "SMS provider credential." },
        { key: "TWILIO_AUTH_TOKEN", label: "Twilio Auth Token", type: "password", required: false, secret: true, placeholder: "token", help: "SMS provider secret." },
        { key: "SERVICEOPS_AUDIT_RETENTION_DAYS", label: "Audit Retention Days", type: "number", required: false, secret: false, placeholder: "365", help: "How long to retain operational logs." }
      ]
    }
  ];
}

function findAdminSettingDefinition(key) {
  const groups = adminSettingsDefinition();
  for (let i = 0; i < groups.length; i += 1) {
    const item = groups[i].items.find((entry) => entry.key === key);
    if (item) return { ...item, category: groups[i].name };
  }
  return null;
}

function maskSettingValue(value) {
  const text = String(value || "");
  if (!text) return "";
  if (text.length <= 8) return "••••";
  return `${text.slice(0, 3)}••••${text.slice(-3)}`;
}

function refreshReportData(options) {
  const input = options || {};
  const props = PropertiesService.getScriptProperties();
  const startedAt = new Date();
  const result = {
    ok: true,
    refreshedAt: startedAt.toISOString(),
    refreshed: [],
    skipped: [],
    errors: [],
    triggerInstalled: false
  };

  if (input.installTrigger) {
    result.triggerInstalled = ensureAutoRefreshTrigger();
  }

  REPORT_REFRESH_CONFIG.forEach((config) => {
    try {
      const rule = CACHE_RULES.find((item) => item.key === config.key);
      if (input.onlyStale && rule && cacheRuleState(rule, props).state === "Fresh") {
        result.skipped.push(`${rule.label} fresh`);
        return;
      }

      const url = firstProperty(props, config.props);
      if (!url) {
        result.skipped.push(`${config.key}: missing report URL`);
        return;
      }

      const rows = fetchReportRowsFromUrl(url);
      writeRowsToSheet(config.sheet, rows);
      markCacheFresh(config.key, props);
      result.refreshed.push(`${config.key}: ${rows.length}`);
    } catch (error) {
      result.ok = false;
      result.errors.push(`${config.key}: ${String(error && error.message ? error.message : error)}`);
    }
  });

  props.setProperty("SERVICEOPS_LAST_GLOBAL_REFRESH", new Date().toISOString());
  appendDecisionLog({
    at: new Date().toISOString(),
    operator: "ServiceOps Refresh",
    requestId: "",
    customer: "",
    action: input.adminAction || (input.onlyStale ? "refresh_stale_data" : "refresh_all_data"),
    note: `Refreshed: ${result.refreshed.join(", ") || "none"}. Skipped: ${result.skipped.join(", ") || "none"}.`,
    result: result.errors.length ? `Errors: ${result.errors.join(" | ")}` : "Refresh completed."
  });
  return result;
}

function fetchReportRowsFromUrl(url) {
  const pageSize = Number(PropertiesService.getScriptProperties().getProperty("SERVICEOPS_REPORT_PAGE_SIZE") || 1000);
  const maxPages = Number(PropertiesService.getScriptProperties().getProperty("SERVICEOPS_REPORT_MAX_PAGES") || 250);
  const rows = [];
  const pageFingerprints = {};

  for (let pageIndex = 0; pageIndex < maxPages; pageIndex += 1) {
    const pageUrl = buildPagedReportUrl(url, pageIndex, pageSize);
    const response = UrlFetchApp.fetch(pageUrl, {
      method: "get",
      muteHttpExceptions: true,
      headers: { Accept: "application/json" }
    });
    const code = response.getResponseCode();
    const text = response.getContentText();
    if (code >= 300) throw new Error(`HTTP ${code} on page ${pageIndex}`);

    let json;
    try {
      json = JSON.parse(text || "[]");
    } catch (error) {
      throw new Error(`Report returned non-JSON data on page ${pageIndex}`);
    }

    const pageRows = extractRowsFromReportJson(json);
    if (!pageRows.length) break;
    const fingerprint = reportPageFingerprint(pageRows);
    if (pageFingerprints[fingerprint]) break;
    pageFingerprints[fingerprint] = true;
    rows.push.apply(rows, pageRows);
    if (pageRows.length < pageSize) break;

    Utilities.sleep(100);
  }

  return rows;
}

function reportPageFingerprint(rows) {
  if (!rows || !rows.length) return "empty";
  const first = rows[0] || {};
  const last = rows[rows.length - 1] || {};
  return [
    rows.length,
    JSON.stringify(first).slice(0, 500),
    JSON.stringify(last).slice(0, 500)
  ].join("|");
}

function buildPagedReportUrl(baseUrl, pageIndex, pageSize) {
  const cleanUrl = String(baseUrl || "")
    .replace(/([?&])PageIndex=[^&]*&?/gi, "$1")
    .replace(/([?&])PageSize=[^&]*&?/gi, "$1")
    .replace(/[?&]$/, "");
  const separator = cleanUrl.indexOf("?") >= 0 ? "&" : "?";
  return `${cleanUrl}${separator}PageIndex=${encodeURIComponent(String(pageIndex))}&PageSize=${encodeURIComponent(String(pageSize))}`;
}

function extractRowsFromReportJson(json) {
  if (Array.isArray(json)) return json.filter((row) => row && typeof row === "object");
  const candidates = ["data", "Data", "rows", "Rows", "items", "Items", "results", "Results", "records", "Records"];
  for (let i = 0; i < candidates.length; i += 1) {
    const value = json && json[candidates[i]];
    if (Array.isArray(value)) return value.filter((row) => row && typeof row === "object");
  }
  if (json && typeof json === "object") return [json];
  return [];
}

function writeRowsToSheet(sheetName, rows) {
  const spreadsheet = getSpreadsheet();
  const sheet = spreadsheet.getSheetByName(sheetName) || spreadsheet.insertSheet(sheetName);
  sheet.clearContents();
  if (!rows.length) {
    sheet.getRange(1, 1).setValue("No rows returned");
    return;
  }
  const headers = Array.from(rows.reduce((set, row) => {
    Object.keys(row || {}).forEach((key) => set.add(key));
    return set;
  }, new Set()));
  const values = [headers].concat(rows.map((row) => headers.map((header) => normalizeSheetValue(row[header]))));
  sheet.getRange(1, 1, values.length, headers.length).setValues(values);
}

function normalizeSheetValue(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value).slice(0, 50000);
  return value;
}

function markCacheFresh(key, props) {
  const rule = CACHE_RULES.find((item) => item.key === key);
  if (!rule) return;
  const now = String(Date.now());
  rule.props.forEach((name) => props.setProperty(name, now));
}

function ensureAutoRefreshTrigger() {
  try {
    const triggers = ScriptApp.getProjectTriggers();
    const exists = triggers.some((trigger) => trigger.getHandlerFunction && trigger.getHandlerFunction() === "serviceOpsAutoRefresh");
    if (exists) return false;
    ScriptApp.newTrigger("serviceOpsAutoRefresh").timeBased().everyMinutes(15).create();
    return true;
  } catch (error) {
    console.log(error);
    return false;
  }
}

function getLookupContext() {
  return {
    customers: getRows(SHEETS.customers, 2500),
    locations: getRows(SHEETS.locations, 2500),
    assets: getRows(SHEETS.assets, 2500),
    opportunities: getRows(SHEETS.opportunities, 1500),
    workOrders: getRows(SHEETS.workOrders, 1500),
    tasks: getRows(SHEETS.tasks, 1500)
  };
}

function buildRequestCard(row, index, context) {
  const profile = intakeProfile(row);
  const match = deterministicLookup([profile.phone, profile.email, profile.address, profile.name].filter(Boolean).join(" "), context);
  const risks = riskFlags(profile, match, context);
  const intelligence = serviceIntelligence(profile, match, context);
  const recommendation = recommendTechAndDate(profile, intelligence, match, context);
  const status = humanStatus(profile, match, risks, recommendation);

  return {
    id: profile.id || `row-${index + 2}`,
    rowNumber: profile.rowNumber,
    customer: profile.name || "Unknown customer",
    contact: [profile.phone, profile.email].filter(Boolean).join(" · ") || "No contact captured",
    city: profile.city || "No city",
    serviceArea: serviceArea(profile),
    issueSummary: profile.details || profile.anythingElse || "No issue details captured",
    customerStatus: match.confidence >= 90 ? "Existing customer likely" : match.confidence >= 65 ? "Possible customer match" : "New or unknown customer",
    fireplace: assetLabel(match, profile),
    suggestedTech: recommendation.tech,
    suggestedDate: recommendation.window,
    riskLevel: riskLevel(risks, intelligence),
    risks,
    status,
    nextAction: nextOperatorAction(status, risks),
    intelligence,
    recommendation,
    admin: {
      rawPipelineState: profile.pipelineState,
      strivenCustomerId: firstValue(match.customer, ["Customer ID", "CustomerId", "customerId", "ID"]),
      opportunityId: firstValue(match.openOpportunity, ["Opportunity ID", "OpportunityId", "ID"]),
      workOrder: firstValue(match.openWorkOrder, ["Sales Order Number", "SO Number", "SWO#", "Order Number"])
    }
  };
}

function buildFastRequestCard(row, index, requestContext) {
  const profile = intakeProfile(row);
  const requestId = permanentRequestId(profile, index);
  const match = weightedRequestMatch(profile, requestContext);
  const risks = fastRiskFlags(profile);
  const intelligence = fastServiceIntelligence(profile);
  const recommendation = fastRecommendation(profile, intelligence);
  const opportunity = opportunitySignal(profile, null);
  const ids = relatedOperationalIds(profile, match, requestContext);
  const calendarMatch = bestCalendarMatch(profile, ids, requestContext.calendarEvents || []);
  if (calendarMatch) {
    ids.appointmentDate = calendarMatch.startDateTime || ids.appointmentDate;
    ids.appointmentEnd = calendarMatch.endDateTime || "";
    ids.calendarEventId = calendarMatch.eventId || "";
    ids.calendarMatchStatus = calendarMatch.matchStatus || "Matched";
    ids.calendarMatchMethod = calendarMatch.matchMethod || "";
    recommendation.tech = calendarMatch.technician || recommendation.tech;
  }
  const state = RequestStateEngine.resolve({ profile, match, risks, intelligence, ids });
  const status = state.operationalStage;
  const customerResolution = customerResolutionFromMatch(match);
  const submittedAt = profile.timestamp || "";
  const risk = riskLevel(risks, intelligence);
  const label = issueLabel(profile);
  const health = operationalHealth(status, risks, submittedAt);
  const events = requestEvents(profile, status, health, risks, intelligence);
  const serviceRequest = {
    requestId,
    customerId: ids.customerId || "",
    opportunityId: ids.opportunityId || "",
    salesOrderId: ids.salesOrderId || "",
    taskId: ids.taskId || "",
    calendarEventId: ids.calendarEventId || "",
    customerDisplay: profile.name || "Unknown customer",
    locationDisplay: locationDisplay(profile),
    applianceDisplay: profile.makeModelAge || "Unknown fireplace",
    operationalStage: state.operationalStage,
    requestStatus: state.requestStatus,
    visualState: state.visualState,
    warnings: state.warnings,
    blockers: state.blockers,
    assignedTech: recommendation.tech,
    appointmentDate: ids.appointmentDate || "",
    appointmentEnd: ids.appointmentEnd || "",
    scheduleSource: ids.calendarEventId ? "Google Calendar read-only" : ids.taskId ? "Service Task" : "",
    calendarMatchStatus: ids.calendarMatchStatus || "",
    calendarMatchMethod: ids.calendarMatchMethod || "",
    matchConfidence: match.score,
    matchStatus: state.matchStatus,
    updatedAt: new Date().toISOString()
  };

  return {
    id: requestId,
    requestId,
    rowNumber: profile.rowNumber,
    submittedAt,
    updatedAt: serviceRequest.updatedAt,
    customer: profile.name || "Unknown customer",
    contact: [profile.phone, profile.email].filter(Boolean).join(" · ") || "No contact captured",
    city: profile.city || "No city",
    serviceArea: serviceArea(profile),
    region: serviceArea(profile),
    issueLabel: label,
    issueSummary: profile.details || profile.anythingElse || "No issue details captured",
    customerStatus: customerResolution.label,
    customerResolution,
    matchStatus: state.matchStatus,
    matchConfidence: match.score,
    matchEvidence: match.evidence,
    fireplace: profile.makeModelAge || "Unknown fireplace",
    ageBand: ageBand(profile.makeModelAge),
    suggestedTech: recommendation.tech,
    suggestedDate: recommendation.window,
    riskLevel: risk,
    risks,
    status,
    operationalState: status,
    operationalStage: state.operationalStage,
    requestStatus: state.requestStatus,
    visualState: state.visualState,
    warnings: state.warnings,
    blockers: state.blockers,
    serviceRequest,
    health,
    nextAction: state.nextAction,
    eventPreview: events,
    opportunity,
    intelligence,
    recommendation,
    sortKeys: {
      submittedAt: toDate(submittedAt) || 0,
      risk: risk === "High" ? 3 : risk === "Medium" ? 2 : 1,
      status,
      health: health.rank,
      city: profile.city || "",
      opportunity: opportunity.score || 0
    },
    detailFields: {
      fullNotes: [profile.details, profile.anythingElse].filter(Boolean).join("\n\n"),
      fireplaceDetails: profile.makeModelAge || "Unknown fireplace",
      preferredDays: profile.preferredDays || "No preference captured",
      address: profile.address || "",
      phone: profile.phone || "",
      altPhone: profile.altPhone || "",
      email: profile.email || "",
      rawPipelineState: profile.pipelineState || ""
    },
    admin: {
      rawPipelineState: profile.pipelineState,
      strivenCustomerId: serviceRequest.customerId,
      opportunityId: serviceRequest.opportunityId,
      workOrder: serviceRequest.salesOrderId,
      taskId: serviceRequest.taskId
    }
  };
}

function buildCustomerIndex(rows) {
  const index = { phone: {}, email: {} };
  (rows || []).forEach((row) => {
    const snapshot = {
      customerNumber: customerNumberFromRow(row),
      customerName: firstValue(row, ["Customer Name", "Name", "Display Name", "Full Name", "Company"]) || "",
      phone: firstValue(row, ["Phone", "Primary Phone", "Phone Number", "Mobile", "Cell", "Contact Phone"]) || "",
      email: firstValue(row, ["Email", "Email Address", "Primary Email", "Contact Email"]) || ""
    };
    addCustomerIndexValue(index.phone, normalizePhone(snapshot.phone), snapshot);
    addCustomerIndexValue(index.email, normalizeEmail(snapshot.email), snapshot);
  });
  return index;
}

function buildRequestContext(sources) {
  const customers = sources.customers || [];
  const locations = sources.locations || [];
  const assets = sources.assets || [];
  const workOrders = sources.workOrders || [];
  const opportunities = sources.opportunities || [];
  const tasks = sources.tasks || [];
  const context = {
    customerIndex: buildCustomerIndex(customers),
    location: {},
    assetByLocation: {},
    workOrderByLocation: {},
    opportunityByCustomer: {},
    taskByOrder: {},
    calendarEvents: sources.calendarEvents || []
  };

  locations.forEach((row) => {
    const key = normalizedLocationKeyFromRow(row);
    if (!key) return;
    if (!context.location[key]) context.location[key] = [];
    context.location[key].push(row);
  });
  assets.forEach((row) => {
    const key = normalizedLocationKeyFromRow(row);
    if (!key) return;
    if (!context.assetByLocation[key]) context.assetByLocation[key] = [];
    context.assetByLocation[key].push(row);
  });
  workOrders.forEach((row) => {
    const key = normalizedLocationKeyFromRow(row);
    if (key) {
      if (!context.workOrderByLocation[key]) context.workOrderByLocation[key] = [];
      context.workOrderByLocation[key].push(row);
    }
  });
  opportunities.forEach((row) => {
    const customerId = firstValue(row, ["Customer ID", "CustomerId", "Customer Number", "Customer #"]);
    if (!customerId) return;
    if (!context.opportunityByCustomer[customerId]) context.opportunityByCustomer[customerId] = [];
    context.opportunityByCustomer[customerId].push(row);
  });
  tasks.forEach((row) => {
    const order = normalizeSo(firstValue(row, ["Sales Order Number", "SO Number", "SWO#", "Order Number"]));
    if (order) context.taskByOrder[order] = row;
  });
  return context;
}

function weightedRequestMatch(profile, context) {
  const evidence = [];
  const conflicts = [];
  let score = 0;
  let bestCustomer = null;
  let bestLocation = null;
  let bestWorkOrder = null;
  let bestAsset = null;
  const locationKey = normalizedLocationKey(profile);
  const streetPostalKey = normalizedStreetPostalKey(profile);

  const locationMatches = locationKey ? (context.location[locationKey] || []) : [];
  if (locationMatches.length) {
    score += 55;
    bestLocation = locationMatches[0];
    evidence.push("Exact location match");
  } else if (streetPostalKey) {
    const partial = Object.keys(context.location).filter((key) => key.indexOf(streetPostalKey) !== -1 || streetPostalKey.indexOf(key) !== -1).slice(0, 3);
    if (partial.length) {
      score += 40;
      bestLocation = context.location[partial[0]][0];
      evidence.push("Street + postal match");
    }
  }

  const workMatches = locationKey ? (context.workOrderByLocation[locationKey] || []) : [];
  if (workMatches.length) {
    score += 70;
    bestWorkOrder = workMatches[0];
    evidence.push("Existing work order at address");
  }

  const assetMatches = locationKey ? (context.assetByLocation[locationKey] || []) : [];
  if (assetMatches.length) {
    score += 60;
    bestAsset = assetMatches[0];
    evidence.push("Existing asset at address");
  }

  const email = normalizeEmail(profile.email);
  const phone = normalizePhone(profile.phone);
  const altPhone = normalizePhone(profile.altPhone);
  const emailMatches = email ? ((context.customerIndex.email[email] || []).map((match) => ({ ...match, matchMethod: "Email" }))) : [];
  const phoneMatches = phone ? ((context.customerIndex.phone[phone] || []).map((match) => ({ ...match, matchMethod: "Phone" }))) : [];
  const altMatches = altPhone ? ((context.customerIndex.phone[altPhone] || []).map((match) => ({ ...match, matchMethod: "Alt phone" }))) : [];

  if (emailMatches.length) { score += 50; evidence.push("Exact email"); }
  if (phoneMatches.length) { score += 45; evidence.push("Exact phone"); }
  if (altMatches.length) { score += 35; evidence.push("Exact alt phone"); }

  const identityMatches = uniqueMatches(emailMatches.concat(phoneMatches, altMatches));
  if (identityMatches.length === 1) {
    bestCustomer = identityMatches[0];
  } else if (identityMatches.length > 1) {
    conflicts.push("Multiple possible customer records");
    bestCustomer = identityMatches[0];
  }

  if (!bestCustomer && profile.name) {
    const target = normalizeName(profile.name);
    const nameCandidate = Object.keys(context.customerIndex.email)
      .flatMap((key) => context.customerIndex.email[key])
      .find((row) => normalizeName(row.customerName) === target);
    if (nameCandidate) {
      score += 15;
      bestCustomer = nameCandidate;
      evidence.push("Name match");
    }
  }

  score = Math.min(100, score);
  return {
    score,
    status: score >= 90 && conflicts.length === 0 ? "MATCHED" : score >= 70 ? "REVIEW" : "NEW",
    evidence,
    conflicts,
    customer: bestCustomer,
    location: bestLocation,
    workOrder: bestWorkOrder,
    asset: bestAsset,
    normalizedLocationKey: locationKey,
    normalizedIdentityKey: normalizedIdentityKey(profile)
  };
}

function uniqueMatches(matches) {
  const seen = {};
  const unique = [];
  matches.forEach((match) => {
    const key = match.customerNumber || match.customerName || `${match.phone}-${match.email}`;
    if (!key || seen[key]) return;
    seen[key] = true;
    unique.push(match);
  });
  return unique;
}

function customerResolutionFromMatch(match) {
  if (match.status === "MATCHED" && match.customer) {
    return {
      status: "Resolved",
      certainty: "Verified",
      label: match.customer.customerNumber ? `Customer #${match.customer.customerNumber}` : "Existing customer",
      customerNumber: match.customer.customerNumber || "",
      customerName: match.customer.customerName || "",
      matchMethod: match.evidence.slice(0, 3).join(" + ") || "Weighted match"
    };
  }
  if (match.status === "REVIEW") {
    return {
      status: "Needs Review",
      certainty: "Needs Review",
      label: match.customer && match.customer.customerNumber ? `Possible customer #${match.customer.customerNumber}` : "Possible customer match",
      customerNumber: "",
      customerName: match.customer ? match.customer.customerName || "" : "",
      matchMethod: match.evidence.slice(0, 3).join(" + ") || "Manual review required"
    };
  }
  return {
    status: "New",
    certainty: "Needs Review",
    label: "New customer candidate",
    customerNumber: "",
    customerName: "",
    matchMethod: "No strong weighted match"
  };
}

const CalendarServiceReadOnly = {
  readTechnicianEvents(start, end) {
    const props = PropertiesService.getScriptProperties();
    const token = ScriptApp.getOAuthToken();
    const errors = [];
    const events = [];
    configuredTechnicianCalendars(props).forEach((tech) => {
      try {
        let pageToken = "";
        do {
          const params = [
            `timeMin=${encodeURIComponent(start.toISOString())}`,
            `timeMax=${encodeURIComponent(end.toISOString())}`,
            "singleEvents=true",
            "orderBy=startTime",
            "maxResults=2500",
            pageToken ? `pageToken=${encodeURIComponent(pageToken)}` : ""
          ].filter(Boolean).join("&");
          const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(tech.calendarId)}/events?${params}`;
          const response = UrlFetchApp.fetch(url, {
            method: "get",
            headers: { Authorization: `Bearer ${token}` },
            muteHttpExceptions: true
          });
          const code = response.getResponseCode();
          const json = JSON.parse(response.getContentText() || "{}");
          if (code >= 300) throw new Error(json.error && json.error.message ? json.error.message : `HTTP ${code}`);
          (json.items || []).forEach((item) => {
            if (item.status === "cancelled") return;
            const normalized = normalizeCalendarEvent(item, tech, props);
            if (!normalized.organizerDomainAllowed) return;
            events.push(normalized);
          });
          pageToken = json.nextPageToken || "";
        } while (pageToken);
      } catch (error) {
        errors.push(`${tech.name}: ${error && error.message ? error.message : error}`);
      }
    });
    return { events, errors };
  },
  getCachedOrRefresh() {
    const cached = readCalendarCacheRows();
    const props = PropertiesService.getScriptProperties();
    const ts = parseTimestamp(props.getProperty("SERVICEOPS_TECH_CALENDAR_CACHE_TS"));
    const fresh = ts && (Date.now() - ts) < 10 * 60000;
    if (fresh && cached.length) return cached;
    const result = this.refreshCache();
    return result.events.length ? result.events : cached;
  },
  refreshCache() {
    const props = PropertiesService.getScriptProperties();
    const start = new Date();
    start.setDate(start.getDate() - calendarPastDays(props));
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setDate(end.getDate() + calendarFutureDays(props));
    end.setHours(23, 59, 59, 999);
    const result = this.readTechnicianEvents(start, end);
    writeCalendarCacheRows(result.events);
    props.setProperty("SERVICEOPS_TECH_CALENDAR_CACHE_TS", String(Date.now()));
    return result;
  },
  createEvent() { throw new Error("CalendarServiceReadOnly does not permit calendar writes."); },
  updateEvent() { throw new Error("CalendarServiceReadOnly does not permit calendar writes."); },
  deleteEvent() { throw new Error("CalendarServiceReadOnly does not permit calendar writes."); },
  patchEvent() { throw new Error("CalendarServiceReadOnly does not permit calendar writes."); },
  moveEvent() { throw new Error("CalendarServiceReadOnly does not permit calendar writes."); }
};

function configuredTechnicianCalendars(props) {
  return TECHNICIAN_CALENDARS.map((tech) => ({
    name: tech.name,
    calendarId: props.getProperty(tech.prop) || tech.calendarId,
    requireClassicOrganizer: tech.requireClassicOrganizer === true
  })).filter((tech) => tech.calendarId);
}

function allowedCalendarOrganizerDomain(props) {
  return String((props && props.getProperty("CALENDAR_ALLOWED_ORGANIZER_DOMAIN")) || CALENDAR.allowedOrganizerDomain || "@classicfireplace.ca").toLowerCase().trim();
}

function calendarPastDays(props) {
  const raw = Number((props && props.getProperty("SERVICEOPS_CALENDAR_PAST_DAYS")) || CALENDAR.defaultPastDays || 0);
  return Number.isFinite(raw) && raw >= 0 ? Math.floor(raw) : 0;
}

function calendarFutureDays(props) {
  const raw = Number((props && props.getProperty("SERVICEOPS_CALENDAR_FUTURE_DAYS")) || CALENDAR.defaultFutureDays || 365);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 365;
}

function isAllowedCalendarOrganizer(email, domain) {
  const normalized = normalizeEmail(email);
  return Boolean(normalized && normalized.endsWith(domain));
}

function normalizeCalendarEvent(item, tech, props) {
  const text = `${item.summary || ""} ${item.description || ""} ${item.location || ""}`;
  const so = extractSalesOrderFromEvent_Service_(item.summary || "", item.description || "");
  const creatorEmail = normalizeEmail(item.creator && item.creator.email);
  const organizerEmail = normalizeEmail(item.organizer && item.organizer.email);
  const domain = allowedCalendarOrganizerDomain(props);
  const classicOrganizer = isAllowedCalendarOrganizer(creatorEmail, domain) || isAllowedCalendarOrganizer(organizerEmail, domain);
  const organizerDomainAllowed = tech.requireClassicOrganizer ? classicOrganizer : true;
  const startValue = (item.start && (item.start.dateTime || item.start.date)) || "";
  const endValue = (item.end && (item.end.dateTime || item.end.date)) || "";
  const allDay = Boolean(item.start && item.start.date && !item.start.dateTime);
  return {
    eventId: item.id || `${tech.name}-${item.summary}`,
    calendarId: tech.calendarId,
    technician: tech.name,
    creatorEmail,
    organizerEmail,
    organizerDomainAllowed,
    startDateTime: startValue,
    endDateTime: endValue,
    startDate: calendarDatePart(startValue),
    startTime: allDay ? "" : calendarTimePart(startValue),
    endDate: calendarDatePart(endValue),
    endTime: allDay ? "" : calendarTimePart(endValue),
    allDay: allDay ? "Yes" : "No",
    title: item.summary || "Calendar event",
    location: item.location || "",
    description: cleanDescription_Service_(item.description || ""),
    organizers: [creatorEmail, organizerEmail].filter(Boolean).filter((email, index, arr) => arr.indexOf(email) === index).join(", "),
    guests: ((item.attendees || []).map((attendee) => normalizeEmail(attendee.email)).filter(Boolean)).join(", "),
    extractedSo: so,
    extractedTask: extractAfterLabel(text, ["task", "task#"]),
    extractedCustomer: extractAfterLabel(text, ["customer", "customer#"]),
    matchStatus: "",
    matchedRequestId: "",
    lastSyncedAt: new Date().toISOString()
  };
}

function calendarDatePart(value) {
  if (!value) return "";
  const date = new Date(value);
  if (isNaN(date.getTime())) return String(value).slice(0, 10);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function calendarTimePart(value) {
  if (!value) return "";
  const date = new Date(value);
  if (isNaN(date.getTime())) return "";
  return new Date(1899, 11, 30, date.getHours(), date.getMinutes(), 0, 0);
}

function extractAfterLabel(text, labels) {
  const source = String(text || "");
  for (let i = 0; i < labels.length; i += 1) {
    const pattern = new RegExp(`${labels[i]}\\s*[:#-]?\\s*(\\d{3,})`, "i");
    const match = source.match(pattern);
    if (match) return match[1];
  }
  return "";
}

function readCalendarCacheRows() {
  return getRows(SHEETS.techCalendar, 10000).map((row) => ({
    eventId: firstValue(row, ["Event ID"]),
    calendarId: firstValue(row, ["Calendar ID"]),
    technician: firstValue(row, ["Technician"]),
    creatorEmail: firstValue(row, ["Creator Email"]),
    organizerEmail: firstValue(row, ["Organizer Email"]),
    organizerDomainAllowed: String(firstValue(row, ["Organizer Domain Allowed"]) || "").toLowerCase() === "true",
    startDateTime: firstValue(row, ["Start DateTime", "Start Date"]),
    endDateTime: firstValue(row, ["End DateTime", "End Date"]),
    startDate: firstValue(row, ["Start Date"]),
    startTime: firstValue(row, ["Start Time"]),
    endDate: firstValue(row, ["End Date"]),
    endTime: firstValue(row, ["End Time"]),
    allDay: firstValue(row, ["All-Day?"]),
    title: firstValue(row, ["Title"]),
    location: firstValue(row, ["Location"]),
    description: firstValue(row, ["Description"]),
    organizers: firstValue(row, ["Organizers"]),
    guests: firstValue(row, ["Guests (emails)"]),
    extractedSo: firstValue(row, ["Extracted SO#", "Sales Order #"]),
    extractedTask: firstValue(row, ["Extracted Task#"]),
    extractedCustomer: firstValue(row, ["Extracted Customer#"]),
    matchStatus: firstValue(row, ["Match Status"]),
    matchedRequestId: firstValue(row, ["Matched Request ID"]),
    lastSyncedAt: firstValue(row, ["Last Synced At"])
  })).filter((event) => event.organizerDomainAllowed === true);
}

function writeCalendarCacheRows(events) {
  const spreadsheet = getSpreadsheet();
  const sheet = spreadsheet.getSheetByName(SHEETS.techCalendar) || spreadsheet.insertSheet(SHEETS.techCalendar);
  const headers = [
    "Event ID",
    "Calendar ID",
    "Technician",
    "Creator Email",
    "Organizer Email",
    "Organizer Domain Allowed",
    "Start DateTime",
    "End DateTime",
    "Start Date",
    "Start Time",
    "End Date",
    "End Time",
    "All-Day?",
    "Title",
    "Location",
    "Description",
    "Organizers",
    "Guests (emails)",
    "Sales Order #",
    "Extracted Task#",
    "Extracted Customer#",
    "Match Status",
    "Matched Request ID",
    "Last Synced At"
  ];
  sheet.clearContents();
  sheet.clearFormats();
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.setFrozenRows(1);
  if (!events.length) return;
  sheet.getRange(2, 1, events.length, headers.length).setValues(events.map((event) => [
    event.eventId,
    event.calendarId,
    event.technician,
    event.creatorEmail,
    event.organizerEmail,
    Boolean(event.organizerDomainAllowed),
    event.startDateTime,
    event.endDateTime,
    event.startDate || calendarDatePart(event.startDateTime),
    event.startTime || calendarTimePart(event.startDateTime),
    event.endDate || calendarDatePart(event.endDateTime),
    event.endTime || calendarTimePart(event.endDateTime),
    event.allDay || "",
    event.title,
    event.location,
    event.description,
    event.organizers || [event.creatorEmail, event.organizerEmail].filter(Boolean).join(", "),
    event.guests || "",
    event.extractedSo,
    event.extractedTask,
    event.extractedCustomer,
    event.matchStatus,
    event.matchedRequestId,
    event.lastSyncedAt
  ]));
  const totalDataRows = events.length;
  ["Title", "Location", "Description", "Organizers", "Guests (emails)"].forEach((name) => {
    const col = headers.indexOf(name) + 1;
    if (col > 0) sheet.getRange(2, col, totalDataRows).setWrap(true);
  });
  const range = sheet.getRange(2, 1, totalDataRows, headers.length);
  const bgs = events.map((event) => new Array(headers.length).fill(event.extractedSo ? null : "#ffe5e5"));
  range.setBackgrounds(bgs);
  if (totalDataRows > 1) {
    sheet.getRange(2, 1, totalDataRows, headers.length).sort([
      { column: headers.indexOf("Start Date") + 1, ascending: true },
      { column: headers.indexOf("Start Time") + 1, ascending: true },
      { column: headers.indexOf("Technician") + 1, ascending: true }
    ]);
  }
}

function syncServiceTechCalendarsToSheet() {
  const result = CalendarServiceReadOnly.refreshCache();
  logRecommendation("service_tech_calendar_sync", {
    kept: result.events.length,
    errors: result.errors || [],
    readOnly: true
  });
  return {
    ok: true,
    kept: result.events.length,
    errors: result.errors || [],
    message: `Service Tech Calendar sync complete. Kept: ${result.events.length}.`
  };
}

function cleanDescription_Service_(html) {
  if (!html) return "";
  return String(html)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<p[^>]*>/gi, "")
    .replace(/<\/?(b|strong|u|em|i)[^>]*>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}

function extractSalesOrderFromEvent_Service_(title, description) {
  const rawText = `${title || ""} ${description || ""}`.trim();
  if (!rawText) return "";
  const phoneRegex = /(?:\+?1[\s\-\.]?)?(?:\(?\d{3}\)?[\s\-\.]?\d{3}[\s\-\.]?\d{4})(?:\s*(?:x|ext\.?)\s*\d+)?/gi;
  const text = rawText.replace(phoneRegex, " ").replace(/\s+/g, " ").trim();
  if (!text) return "";
  let match = text.match(/\b(?:SO|S\/O|Sales\s*Order)\s*[#:\-]?\s*(\d{4,8})(?!\d)/i);
  if (match) return match[1];
  match = text.match(/\b(?!Work\s*Order\b)(?:Order)\s*[#:\-]?\s*(\d{4,8})(?!\d)/i);
  if (match) return match[1];
  match = text.match(/#\s*(\d{4,8})(?!\d)/);
  return match ? match[1] : "";
}

function relatedOperationalIds(profile, match, context) {
  const customerId = match.customer ? match.customer.customerNumber || "" : "";
  const workOrder = match.workOrder || null;
  const salesOrderId = workOrder ? firstValue(workOrder, ["Sales Order ID", "Sales Order Number", "SO Number", "SWO#", "Order Number", "ID"]) : "";
  const task = salesOrderId ? context.taskByOrder[normalizeSo(salesOrderId)] : null;
  const opp = customerId && context.opportunityByCustomer[customerId] ? context.opportunityByCustomer[customerId][0] : null;
  return {
    customerId,
    locationId: match.location ? firstValue(match.location, ["Location ID", "Customer Location ID", "ID"]) : "",
    opportunityId: opp ? firstValue(opp, ["Opportunity ID", "Opp ID", "ID", "Number"]) : "",
    salesOrderId: salesOrderId || "",
    taskId: task ? firstValue(task, ["Task ID", "Service Task ID", "ID"]) : "",
    appointmentDate: task ? firstValue(task, ["Start", "Start Date", "Scheduled Date", "Date"]) : ""
  };
}

function bestCalendarMatch(profile, ids, events) {
  if (!events || !events.length) return null;
  const so = normalizeSo(ids.salesOrderId);
  const phone = normalizePhone(profile.phone);
  const name = normalizeName(profile.name);
  const ranked = events.map((event) => {
    let score = 0;
    let method = "";
    if (so && normalizeSo(event.extractedSo) === so) { score = 100; method = "SO#"; }
    else if (phone && normalizePhone(`${event.title} ${event.description} ${event.location}`).indexOf(phone) !== -1) { score = 88; method = "Phone"; }
    else if (name && normalizeName(`${event.title} ${event.description}`).indexOf(name) !== -1) { score = 76; method = "Customer name"; }
    return { event, score, method };
  }).filter((item) => item.score >= 76).sort((a, b) => b.score - a.score);
  if (!ranked.length) return null;
  return { ...ranked[0].event, matchStatus: ranked[0].score >= 88 ? "In Sync" : "Needs Review", matchMethod: ranked[0].method };
}

function mergeCalendarEventsIntoCards(cards, events) {
  const matchedEventIds = {};
  cards.forEach((card) => {
    const eventId = (card.serviceRequest || {}).calendarEventId;
    if (eventId) matchedEventIds[eventId] = true;
  });
  const placeholders = (events || [])
    .filter((event) => !matchedEventIds[event.eventId])
    .map((event) => unmatchedCalendarCard(event));
  return cards.concat(placeholders).sort((a, b) => (b.sortKeys.submittedAt || 0) - (a.sortKeys.submittedAt || 0));
}

function unmatchedCalendarCard(event) {
  const requestId = `calendar-${event.eventId}`;
  const now = new Date().toISOString();
  const stage = event.startDateTime && isSameTorontoDayServer(event.startDateTime, now) ? REQUEST_STAGES.SCHEDULED : REQUEST_STAGES.SCHEDULED;
  return {
    id: requestId,
    requestId,
    rowNumber: "",
    submittedAt: event.startDateTime || now,
    updatedAt: event.lastSyncedAt || now,
    customer: "Unmatched Calendar Event",
    contact: "",
    city: event.location || "Calendar location missing",
    serviceArea: event.technician || "Unassigned",
    region: event.technician || "Unassigned",
    issueLabel: event.title || "Calendar event",
    issueSummary: event.description || "Read-only technician calendar event. Link to a request if needed.",
    customerStatus: "Calendar only",
    customerResolution: { status: "Needs Review", certainty: "Needs Review", label: "Unmatched Calendar Event", customerNumber: "", customerName: "", matchMethod: "No ServiceRequest match" },
    matchStatus: "REVIEW",
    matchConfidence: 0,
    matchEvidence: ["Calendar event did not match a ServiceRequest"],
    fireplace: "Unknown fireplace",
    ageBand: "",
    suggestedTech: event.technician || "Unassigned",
    suggestedDate: event.startDateTime || "",
    riskLevel: "Medium",
    risks: [{ level: "yellow", text: "Unmatched calendar event." }],
    status: REQUEST_STAGES.SCHEDULED,
    operationalState: REQUEST_STAGES.SCHEDULED,
    operationalStage: REQUEST_STAGES.SCHEDULED,
    requestStatus: "Scheduled",
    visualState: { lane: REQUEST_STAGES.SCHEDULED, label: "Scheduled", tone: "blue", accent: "blue" },
    warnings: ["Calendar event is not linked to a ServiceRequest."],
    blockers: [],
    serviceRequest: {
      requestId,
      customerId: event.extractedCustomer || "",
      opportunityId: "",
      salesOrderId: event.extractedSo || "",
      taskId: event.extractedTask || "",
      calendarEventId: event.eventId,
      customerDisplay: "Unmatched Calendar Event",
      locationDisplay: event.location || "Location missing",
      applianceDisplay: "Unknown fireplace",
      operationalStage: REQUEST_STAGES.SCHEDULED,
      requestStatus: "Scheduled",
      visualState: { lane: REQUEST_STAGES.SCHEDULED, label: "Scheduled", tone: "blue", accent: "blue" },
      warnings: ["Calendar event is read-only and unmatched."],
      blockers: [],
      assignedTech: event.technician || "Unassigned",
      appointmentDate: event.startDateTime || "",
      appointmentEnd: event.endDateTime || "",
      scheduleSource: "Google Calendar read-only",
      calendarMatchStatus: "Unmatched",
      calendarMatchMethod: "No request match",
      matchConfidence: 0,
      matchStatus: "REVIEW",
      updatedAt: event.lastSyncedAt || now,
      readOnlyPlaceholder: true
    },
    health: { label: HEALTH_STATES.AT_RISK, rank: 3, ageHours: 0, reason: "Unmatched calendar event." },
    nextAction: "Review calendar linkage",
    eventPreview: [{ type: "calendar_event_read", label: "Read-only calendar event", at: event.startDateTime || now }],
    opportunity: { flag: false, type: "None", score: 0, estimatedRange: "", owner: "", potential: "None" },
    intelligence: { category: "Calendar event", confidence: 0 },
    recommendation: { tech: event.technician || "Unassigned", backup: "", area: "", window: event.startDateTime || "", reason: "Read from configured technician calendar.", confidence: "Calendar", alternatives: [] },
    sortKeys: { submittedAt: toDate(event.startDateTime) || Date.now(), risk: 2, status: REQUEST_STAGES.SCHEDULED, health: 3, city: event.location || "", opportunity: 0 },
    detailFields: { fullNotes: event.description || "", fireplaceDetails: "Unknown fireplace", preferredDays: "", address: event.location || "", phone: "", altPhone: "", email: "", rawPipelineState: "Unmatched calendar event" },
    admin: { rawPipelineState: "calendar_read_only", strivenCustomerId: event.extractedCustomer || "", opportunityId: "", workOrder: event.extractedSo || "", taskId: event.extractedTask || "" }
  };
}

const RequestStateEngine = {
  resolve({ profile, match, risks, intelligence, ids }) {
    const warnings = [];
    const blockers = [];
    const raw = String(profile.pipelineState || "");
    if (risks.length) warnings.push.apply(warnings, risks.map((risk) => risk.text));
    if (match.conflicts && match.conflicts.length) blockers.push.apply(blockers, match.conflicts);
    if (match.status === "REVIEW") warnings.push("Customer/location match needs operator review.");
    if (match.status === "NEW") warnings.push("No strong existing customer/location match.");

    let stage = REQUEST_STAGES.NEW;
    if (/done|completed|closed|cancel|reject/i.test(raw)) stage = REQUEST_STAGES.CLOSED;
    else if (/in progress|active|started|parts|callback/i.test(raw)) stage = REQUEST_STAGES.ACTIVE;
    else if (/scheduled/i.test(raw) || ids.taskId || ids.appointmentDate) stage = REQUEST_STAGES.SCHEDULED;
    else if (/approved|ready|swo|work order/i.test(raw) || (ids.customerId && (ids.opportunityId || match.status === "MATCHED") && !blockers.length && !risks.length)) stage = REQUEST_STAGES.READY;
    else if (blockers.length || risks.length || match.status === "REVIEW" || intelligence.confidence < 65 || profile.needsReview) stage = REQUEST_STAGES.REVIEW;

    const tone = stage === REQUEST_STAGES.REVIEW ? "yellow"
      : stage === REQUEST_STAGES.SCHEDULED ? "blue"
      : stage === REQUEST_STAGES.ACTIVE ? "green"
      : stage === REQUEST_STAGES.CLOSED ? "gray"
      : stage === REQUEST_STAGES.READY ? "green"
      : "blue";

    return {
      operationalStage: stage,
      matchStatus: match.status,
      requestStatus: requestStatusForStage(stage, match.status, blockers, warnings, raw),
      warnings,
      blockers,
      visualState: {
        lane: stage,
        label: blockers.length ? "Blocked" : stage,
        tone: blockers.length ? "red" : tone,
        accent: blockers.length ? "red" : tone
      },
      nextAction: nextRequestAction(stage, match.status, blockers, warnings)
    };
  }
};

function requestStatusForStage(stage, matchStatus, blockers, warnings, rawState) {
  const raw = String(rawState || "");
  if (/cancel|reject/i.test(raw)) return "Cancelled";
  if (/done|completed|closed/i.test(raw)) return "Completed";
  if (/follow/i.test(raw)) return "Follow-Up Required";
  if (/part/i.test(raw)) return "Waiting Parts";
  if (/in progress|active|started/i.test(raw)) return "In Progress";
  if (/scheduled/i.test(raw)) return "Scheduled";
  if (/waiting|needs info|customer/i.test(raw)) return "Waiting Customer";
  if (/approved/i.test(raw)) return "Approved";
  if (blockers.length || warnings.length || matchStatus === "REVIEW") return "Review Required";
  if (stage === REQUEST_STAGES.READY) return "Approved";
  return matchStatus === "NEW" ? "New Request" : "Contact Attempted";
}

function nextRequestAction(stage, matchStatus, blockers, warnings) {
  if (blockers.length) return "Resolve blocker";
  if (stage === REQUEST_STAGES.NEW) return matchStatus === "NEW" ? "Create or match customer" : "Review request";
  if (stage === REQUEST_STAGES.REVIEW) return warnings.length ? "Review exception" : "Confirm match";
  if (stage === REQUEST_STAGES.READY) return "Schedule request";
  if (stage === REQUEST_STAGES.SCHEDULED) return "Monitor appointment";
  if (stage === REQUEST_STAGES.ACTIVE) return "Track field work";
  if (stage === REQUEST_STAGES.CLOSED) return "No action";
  return "Review request";
}

function addCustomerIndexValue(bucket, key, snapshot) {
  if (!key) return;
  if (!bucket[key]) bucket[key] = [];
  bucket[key].push(snapshot);
}

function customerNumberFromRow(row) {
  return firstValue(row, ["Customer Number", "Customer #", "Customer No", "Customer ID", "CustomerId", "CustomerID", "ID", "Number"]) || "";
}

function resolveCustomerSnapshot(profile, customerIndex) {
  const phoneCandidates = [profile.phone, profile.altPhone]
    .map(normalizePhone)
    .filter(Boolean)
    .flatMap((phone) => ((customerIndex && customerIndex.phone && customerIndex.phone[phone]) || []).map((match) => ({ ...match, matchMethod: "phone" })));
  const emailCandidates = normalizeEmail(profile.email) ? (((customerIndex && customerIndex.email && customerIndex.email[normalizeEmail(profile.email)]) || []).map((match) => ({ ...match, matchMethod: "email" }))) : [];
  const candidates = phoneCandidates.concat(emailCandidates);
  const unique = [];
  const seen = {};
  candidates.forEach((match) => {
    const key = match.customerNumber || match.customerName || `${match.phone}-${match.email}`;
    if (seen[key]) return;
    seen[key] = true;
    unique.push(match);
  });

  if (unique.length === 1) {
    const match = unique[0];
    return {
      status: "Resolved",
      certainty: "Verified",
      label: match.customerNumber ? `Customer #${match.customerNumber}` : "Existing customer",
      customerNumber: match.customerNumber || "",
      customerName: match.customerName || "",
      matchMethod: match.matchMethod === "email" ? "Email match" : "Phone match"
    };
  }

  if (unique.length > 1) {
    return {
      status: "Needs Review",
      certainty: "Needs Review",
      label: "Multiple customer matches",
      customerNumber: "",
      customerName: unique.map((match) => match.customerName || match.customerNumber).filter(Boolean).slice(0, 3).join(", "),
      matchMethod: "Multiple cached matches"
    };
  }

  return {
    status: "New",
    certainty: "Needs Review",
    label: "New customer candidate",
    customerNumber: "",
    customerName: "",
    matchMethod: "No cached phone/email match"
  };
}

function intakeProfile(row) {
  return {
    id: firstValue(row, ["ID", "Request ID", "Webform Row #"]) || String(firstValue(row, ["Timestamp"]) || ""),
    rowNumber: firstValue(row, ["Webform Row #", "Row", "Source Row"]),
    timestamp: firstValue(row, ["Timestamp", "Submitted At", "Created"]),
    firstName: firstValue(row, ["First Name", "FirstName"]),
    lastName: firstValue(row, ["Last Name", "LastName"]),
    name: [firstValue(row, ["First Name", "FirstName"]), firstValue(row, ["Last Name", "LastName"])].filter(Boolean).join(" ") || firstValue(row, ["Customer Name", "Name"]),
    phone: firstValue(row, ["Phone", "Primary Phone", "Phone Number"]),
    altPhone: firstValue(row, ["Alt Phone", "Alternate Phone"]),
    email: firstValue(row, ["Email", "Email Address"]),
    street: firstValue(row, ["Street", "Address", "Address 1"]),
    city: firstValue(row, ["City"]),
    province: firstValue(row, ["Province", "State"]),
    postalCode: firstValue(row, ["Postal Code", "PostalCode", "Zip"]),
    country: firstValue(row, ["Country"]),
    preferredDays: firstValue(row, ["Preferred Days"]),
    makeModelAge: firstValue(row, ["Make/Model/Age", "Make Model Age", "Manufacturer and Model"]),
    details: firstValue(row, ["Details", "Service Details", "Issue"]),
    anythingElse: firstValue(row, ["Anything Else", "Notes"]),
    pipelineState: firstValue(row, ["Pipeline State", "PipelineState", "Status"]),
    needsReview: /yes|true|review/i.test(String(firstValue(row, ["Needs Review"]) || "")),
    address: [firstValue(row, ["Street", "Address", "Address 1"]), firstValue(row, ["City"]), firstValue(row, ["Province", "State"]), firstValue(row, ["Postal Code", "PostalCode", "Zip"])].filter(Boolean).join(", ")
  };
}

function permanentRequestId(profile, index) {
  return firstPresent([profile.id, profile.rowNumber, profile.timestamp ? `WF-${Utilities.base64EncodeWebSafe(String(profile.timestamp)).slice(0, 10)}` : "", `row-${index + 2}`]);
}

function locationDisplay(profile) {
  return [profile.city, profile.province, profile.postalCode].filter(Boolean).join(", ") || profile.address || "Location missing";
}

function normalizedIdentityKey(profile) {
  return [normalizeEmail(profile.email), normalizePhone(profile.phone), normalizePhone(profile.altPhone)].filter(Boolean).join("|");
}

function normalizedLocationKey(profile) {
  return normalizeLocationParts(profile.street || profile.address, profile.city, profile.province, profile.postalCode);
}

function normalizedStreetPostalKey(profile) {
  return normalizeLocationParts(profile.street || profile.address, "", "", profile.postalCode);
}

function normalizedLocationKeyFromRow(row) {
  return normalizeLocationParts(
    firstValue(row, ["Street", "Address", "Address 1", "Location Address", "Service Address"]),
    firstValue(row, ["City", "Location City"]),
    firstValue(row, ["Province", "State"]),
    firstValue(row, ["Postal Code", "PostalCode", "Zip", "Location Postal Code"])
  );
}

function normalizeLocationParts(street, city, province, postal) {
  const normalizedStreet = normalizeStreet(street);
  const normalizedCity = normalizeLooseText(city);
  const normalizedProvince = normalizeLooseText(province);
  const normalizedPostal = normalizePostal(postal);
  return [normalizedStreet, normalizedCity, normalizedProvince, normalizedPostal].filter(Boolean).join("|");
}

function normalizeStreet(value) {
  let text = normalizeLooseText(value);
  if (!text) return "";
  text = text
    .replace(/\b(unit|suite|apt|apartment)\b/g, "#")
    .replace(/\s*#\s*/g, " #")
    .replace(/\broad\b/g, "rd")
    .replace(/\bstreet\b/g, "st")
    .replace(/\bavenue\b/g, "ave")
    .replace(/\bdrive\b/g, "dr")
    .replace(/\bcourt\b/g, "ct")
    .replace(/\bcrescent\b/g, "cres")
    .replace(/\bboulevard\b/g, "blvd")
    .replace(/\blane\b/g, "ln")
    .replace(/\bnorth\b/g, "n")
    .replace(/\bsouth\b/g, "s")
    .replace(/\beast\b/g, "e")
    .replace(/\bwest\b/g, "w")
    .replace(/[.,]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return text;
}

function normalizePostal(value) {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function normalizeLooseText(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9# ]+/g, " ").replace(/\s+/g, " ").trim();
}

function isSameTorontoDayServer(a, b) {
  return torontoDateKeyServer(a) && torontoDateKeyServer(a) === torontoDateKeyServer(b);
}

function torontoDateKeyServer(value) {
  const millis = toDate(value);
  if (!millis) return "";
  return Utilities.formatDate(new Date(millis), "America/Toronto", "yyyy-MM-dd");
}

function deterministicLookup(query, context) {
  const q = String(query || "");
  const phone = normalizePhone(q);
  const email = normalizeEmail(q);
  const so = (q.match(/\b(?:SO|SWO|DEMO)?[-\s]?\d{4,}\b/i) || [""])[0].replace(/\s+/g, "");
  const addressKey = normalizeAddress(q);
  const nameKey = normalizeName(q);

  const byPhone = phone ? findRecord(context.customers, (row) => [firstValue(row, ["Phone", "Primary Phone"]), firstValue(row, ["Alt Phone", "Alternate Phone"])].map(normalizePhone).indexOf(phone) !== -1) : null;
  if (byPhone) return collectMatch("Exact phone", 98, byPhone, context);

  const byEmail = email ? findRecord(context.customers, (row) => normalizeEmail(firstValue(row, ["Email", "Email Address"])) === email) : null;
  if (byEmail) return collectMatch("Exact email", 96, byEmail, context);

  const bySo = so ? findRecord(context.workOrders, (row) => normalizeSo(firstValue(row, ["Sales Order Number", "SO Number", "SWO#", "Order Number"])) === normalizeSo(so)) : null;
  if (bySo) {
    const customer = relatedCustomer(bySo, context);
    return collectMatch("SO/SWO number", 95, customer || bySo, context, bySo);
  }

  const byAddressPostal = addressKey ? findRecord(context.locations, (row) => normalizeAddress([firstValue(row, ["Street", "Address"]), firstValue(row, ["City"]), firstValue(row, ["Postal Code"])].join(" ")) === addressKey) : null;
  if (byAddressPostal) return collectMatch("Address and postal code", 88, relatedCustomer(byAddressPostal, context) || byAddressPostal, context);

  const byName = nameKey && nameKey.length > 3 ? findRecord(context.customers, (row) => normalizeName(firstValue(row, ["Customer Name", "Name", "Display Name"])) === nameKey) : null;
  if (byName) return collectMatch("Customer name", 72, byName, context);

  return collectMatch("No strong match", 35, null, context);
}

function collectMatch(matchType, confidence, customer, context, workOrderOverride) {
  const customerId = firstValue(customer || {}, ["Customer ID", "CustomerId", "customerId", "ID"]);
  const customerName = firstValue(customer || {}, ["Customer Name", "Name", "Display Name"]);
  const locations = customerId ? context.locations.filter((row) => sameId(firstValue(row, ["Customer ID", "CustomerId"]), customerId)).slice(0, 5) : [];
  const assets = customerId ? context.assets.filter((row) => sameId(firstValue(row, ["Customer ID", "CustomerId"]), customerId) || containsText(row, customerName)).slice(0, 5) : [];
  const opportunities = customerId ? context.opportunities.filter((row) => sameId(firstValue(row, ["Customer ID", "CustomerId"]), customerId) || containsText(row, customerName)).slice(0, 5) : [];
  const workOrders = customerId ? context.workOrders.filter((row) => sameId(firstValue(row, ["Customer ID", "CustomerId"]), customerId) || containsText(row, customerName)).slice(0, 6) : [];
  const tasks = customerId ? context.tasks.filter((row) => containsText(row, customerName) || workOrders.some((wo) => containsText(row, firstValue(wo, ["Sales Order Number", "SO Number", "SWO#"])))).slice(0, 6) : [];

  return {
    matchType,
    confidence,
    customer,
    customerName,
    locations,
    assets,
    opportunities,
    openOpportunity: opportunities.find((row) => !/closed|completed|lost|done/i.test(JSON.stringify(row))) || null,
    workOrders,
    openWorkOrder: workOrderOverride || workOrders.find((row) => /open|active|progress|scheduled|hold/i.test(JSON.stringify(row))) || null,
    tasks
  };
}

function buildAssistantSummary(query, match) {
  const sections = {
    recommendedNextStep: match.openWorkOrder ? "Pause before approving. There may already be open work for this customer/location." : match.confidence < 65 ? "I do not have a strong enough match. Send this to Needs Attention or give me a phone/email/address to narrow it down." : "Review the matched record and proceed only if the operator agrees.",
    customerMatch: match.customer ? `${match.matchType} match for ${match.customerName || "customer"} (${match.confidence}% confidence).` : `I could not find a strong customer match for "${query}".`,
    contactInfo: compactRecord(match.customer, ["Phone", "Alt Phone", "Email"]),
    locations: match.locations.map((row) => compactRecord(row, ["Street", "City", "Province", "Postal Code"])).filter(Boolean),
    upcomingAppointments: match.tasks.filter((row) => /open|scheduled|sync/i.test(JSON.stringify(row))).map((row) => compactRecord(row, ["Task Name", "Start", "Technician", "Status", "SO Number"])).filter(Boolean),
    openWorkOrders: match.workOrders.map((row) => compactRecord(row, ["Sales Order Number", "Status", "Created Date", "Technician"])).filter(Boolean).slice(0, 4),
    assetInfo: match.assets.map((row) => compactRecord(row, ["Manufacturer", "Make", "Model", "Serial Number", "Age", "Install Date"])).filter(Boolean),
    previousService: match.tasks.map((row) => compactRecord(row, ["Task Name", "Date", "Technician", "Status"])).filter(Boolean).slice(0, 4),
    openOpportunities: match.opportunities.map((row) => compactRecord(row, ["Opportunity Name", "Stage", "Status", "Created Date"])).filter(Boolean).slice(0, 4),
    confidenceDataGaps: `Confidence ${match.confidence}%. Data gaps: ${dataGaps(match).join(", ") || "none obvious"}.`
  };
  return removeEmptySections(sections);
}

function maybeOpenAiServiceSummary(query, summary) {
  const key = PropertiesService.getScriptProperties().getProperty("OPENAI_API_KEY");
  if (!key) return { ok: false, message: "AI key is not configured." };
  const model = PropertiesService.getScriptProperties().getProperty("OPENAI_MODEL_FAST") || "gpt-5.4-mini";

  try {
    const response = UrlFetchApp.fetch("https://api.openai.com/v1/responses", {
      method: "post",
      contentType: "application/json",
      headers: { Authorization: `Bearer ${key}` },
      muteHttpExceptions: true,
      payload: JSON.stringify({
        model,
        input: [
          { role: "system", content: "You summarize fireplace service operations data. You are read-only and never approve or create records. Return concise plain-English recommendations." },
          { role: "user", content: JSON.stringify({ query, summary }) }
        ],
        max_output_tokens: 450
      })
    });
    const code = response.getResponseCode();
    const body = JSON.parse(response.getContentText() || "{}");
    if (code >= 300) return { ok: false, message: `OpenAI HTTP ${code}` };
    return { ok: true, summary: extractOpenAiText(body) };
  } catch (error) {
    return { ok: false, message: "OpenAI request failed" };
  }
}

function createServiceOpsAgentToken(secret) {
  const timestamp = String(Date.now());
  const signatureBytes = Utilities.computeHmacSha256Signature(timestamp, secret);
  return `${timestamp}.${bytesToHex(signatureBytes)}`;
}

function bytesToHex(bytes) {
  return bytes.map((byte) => {
    const value = byte < 0 ? byte + 256 : byte;
    return (`0${value.toString(16)}`).slice(-2);
  }).join("");
}

function compactAssistantCandidates(card) {
  const resolution = card.customerResolution || {};
  const candidates = resolution.candidates || card.candidates || [];
  if (Array.isArray(candidates) && candidates.length) {
    return candidates.slice(0, 5).map((candidate) => ({
      customerId: candidate.customerId || candidate.id || "",
      name: candidate.name || candidate.customerName || "",
      email: candidate.email || "",
      phone: candidate.phone || "",
      altPhone: candidate.altPhone || "",
      address: candidate.address || candidate.street || "",
      postalCode: candidate.postalCode || "",
      signals: candidate.signals || candidate.matchSignals || []
    }));
  }
  return [{
    customerId: resolution.customerId || "",
    name: resolution.customerName || card.customer || "",
    address: card.location || card.city || "",
    signals: [resolution.matchMethod || resolution.certainty || ""].filter(Boolean)
  }];
}

function compactAssistantHistory(card) {
  const history = []
    .concat(card.eventPreview || [])
    .concat(card.workOrders || [])
    .concat(card.tasks || [])
    .filter(Boolean);
  return history.slice(0, 6).map((item) => {
    if (typeof item === "string") return { note: item };
    const copy = {};
    Object.keys(item).slice(0, 8).forEach((key) => {
      const value = item[key];
      if (value !== undefined && value !== null && String(value).trim() !== "") copy[key] = String(value).slice(0, 180);
    });
    return copy;
  });
}

function serviceIntelligence(profile, match) {
  const text = `${profile.details} ${profile.anythingElse} ${profile.makeModelAge}`.toLowerCase();
  let category = "Standard service";
  let likelyCause = "Needs technician diagnosis";
  let duration = "60-90 min";
  let skill = "General fireplace service";
  let confidence = 62;

  if (/pilot|ignite|spark|flame|light/.test(text)) {
    category = "Ignition issue";
    likelyCause = "Pilot assembly, thermocouple/thermopile, igniter, gas supply, or remote/receiver issue";
    duration = "90 min";
    skill = "Gas fireplace diagnostics";
    confidence = 74;
  } else if (/clean|glass|soot|maintenance|service/.test(text)) {
    category = "Maintenance";
    likelyCause = "Routine cleaning/service, gasket/glass/media check";
    duration = "60 min";
    skill = "Standard service";
    confidence = 78;
  } else if (/fan|blower|noise|rattle/.test(text)) {
    category = "Blower/noise";
    likelyCause = "Blower, bearing, vibration, wiring, or dust buildup";
    duration = "90-120 min";
    skill = "Electrical/blower diagnosis";
    confidence = 70;
  }

  if (match.openWorkOrder) confidence = Math.min(confidence, 55);
  return { category, likelyCause, duration, skill, callbackRisk: match.tasks.length > 2 ? "Medium" : "Low", confidence };
}

function recommendTechAndDate(profile, intelligence) {
  const area = serviceArea(profile);
  const complex = /diagnostic|ignition|blower|complex/i.test(`${intelligence.category} ${intelligence.skill}`);
  const tech = complex ? "Travis" : area === "Durham" ? "Chris" : "Matt";
  const backup = tech === "Travis" ? "Chris" : "Matt";
  const preferred = String(profile.preferredDays || "No Preference").split(/[,;|]/).map((item) => item.trim()).filter(Boolean)[0] || "next available preferred day";
  return {
    tech,
    backup,
    area,
    window: `${preferred}, 10:00 AM - 12:00 PM`,
    reason: `${tech} fits ${intelligence.skill}; area ${area}; respects preferred day where possible.`,
    confidence: intelligence.confidence >= 75 ? "High" : intelligence.confidence >= 60 ? "Medium" : "Low",
    alternatives: [`${backup} on next open ${preferred} window`, "Hold for dispatcher review if route density is poor"]
  };
}

function fastServiceIntelligence(profile) {
  const text = `${profile.details} ${profile.anythingElse} ${profile.makeModelAge}`.toLowerCase();
  if (/pilot|ignite|spark|flame|light/.test(text)) {
    return {
      category: "Ignition issue",
      likelyCause: "Pilot/ignition path likely; confirm with lookup or assistant.",
      duration: "90 min",
      skill: "Gas fireplace diagnostics",
      callbackRisk: "Medium",
      confidence: 70
    };
  }
  if (/clean|glass|soot|maintenance|service/.test(text)) {
    return {
      category: "Maintenance",
      likelyCause: "Cleaning/service visit likely.",
      duration: "60 min",
      skill: "Standard service",
      callbackRisk: "Low",
      confidence: 74
    };
  }
  return {
    category: "Standard service",
    likelyCause: "Needs review; assistant can enrich from cached history.",
    duration: "60-90 min",
    skill: "General fireplace service",
    callbackRisk: "Low",
    confidence: 58
  };
}

function issueLabel(profile) {
  const text = `${profile.details || ""} ${profile.anythingElse || ""}`.toLowerCase();
  if (/no heat|won'?t heat|not heat|cold/.test(text)) return "No heat";
  if (/pilot|ignite|ignit|spark|flame|light/.test(text)) return "Pilot won't light";
  if (/clean|glass|soot|maintenance|service|tune/.test(text)) return "Annual service";
  if (/fan|blower|noise|rattle/.test(text)) return "Fan / noise";
  if (/install|replace|upgrade|screen|tile|insert/.test(text)) return "Install / upgrade";
  if (/remote|battery|switch/.test(text)) return "Remote / switch";
  return "Service request";
}

function ageBand(value) {
  const text = String(value || "");
  const match = text.match(/(\d{1,2})\s*(?:yr|year|years|old)?/i);
  if (!match) return "";
  const years = Number(match[1]);
  if (years >= 20) return "20+ yrs";
  if (years >= 10) return "10-19 yrs";
  if (years >= 5) return "5-9 yrs";
  return "0-4 yrs";
}

function opportunitySignal(profile, existingOpportunity) {
  const text = `${profile.details || ""} ${profile.anythingElse || ""} ${profile.makeModelAge || ""}`.toLowerCase();
  let score = existingOpportunity ? 85 : 0;
  let type = existingOpportunity ? "Existing opportunity" : "None";
  if (/replace|replacement|upgrade|new fireplace|insert|reno|renovation|screen|tile|accessor/.test(text)) {
    score += 45;
    type = /accessor|screen/.test(text) ? "Accessories" : /replace|new fireplace|insert/.test(text) ? "Replacement" : "Upgrade";
  }
  if (/old|20|25|30|built in|builder/.test(text)) score += 20;
  if (/quote|price|cost|estimate/.test(text)) score += 15;
  score = Math.min(100, score);
  return {
    flag: score >= 35 || Boolean(existingOpportunity),
    type,
    score,
    estimatedRange: score >= 70 ? "$2,500+" : score >= 45 ? "$750-$2,500" : score >= 35 ? "$250-$750" : "",
    owner: score >= 35 ? "Sales follow-up" : "",
    potential: score >= 70 ? "High" : score >= 45 ? "Medium" : score >= 35 ? "Low" : "None"
  };
}

function fastRecommendation(profile, intelligence) {
  const area = serviceArea(profile);
  const tech = /diagnostic|ignition|complex/i.test(`${intelligence.category} ${intelligence.skill}`) ? "Travis" : area === "Durham" ? "Chris" : "Matt";
  const preferred = String(profile.preferredDays || "Next available").split(/[,;|]/).map((item) => item.trim()).filter(Boolean)[0] || "Next available";
  return {
    tech,
    backup: tech === "Travis" ? "Chris" : "Matt",
    area,
    window: `${preferred}, next open window`,
    reason: "Fast first-pass recommendation. Use Assistant for cached history enrichment.",
    confidence: intelligence.confidence >= 70 ? "Medium" : "Low",
    alternatives: ["Ask Assistant for deeper match", "Dispatcher review"]
  };
}

function fastRiskFlags(profile) {
  const risks = [];
  if (!profile.phone && !profile.email) risks.push({ level: "yellow", text: "Missing phone/email." });
  if (!profile.street || !profile.city) risks.push({ level: "yellow", text: "Missing service address." });
  if (!profile.details && !profile.anythingElse) risks.push({ level: "yellow", text: "Missing service details." });
  return risks;
}

function fastHumanStatus(profile, risks) {
  if (risks.length) return "Needs Attention";
  if (/done|completed/i.test(profile.pipelineState)) return "Completed";
  if (/scheduled/i.test(profile.pipelineState)) return "Scheduled";
  if (/approved/i.test(profile.pipelineState)) return "Approved";
  return "New Request";
}

function sharedOperationalState(profile, risks, intelligence) {
  const state = String(profile.pipelineState || "");
  if (/escalat/i.test(state)) return OPERATIONAL_STATES.ESCALATED;
  if (/block|error|fail/i.test(state) || risks.some((risk) => risk.level === "red")) return OPERATIONAL_STATES.BLOCKED;
  if (/done|completed|closed/i.test(state)) return OPERATIONAL_STATES.COMPLETED;
  if (/in progress|active|started/i.test(state)) return OPERATIONAL_STATES.IN_PROGRESS;
  if (/scheduled/i.test(state)) return OPERATIONAL_STATES.SCHEDULED;
  if (/waiting|needs info|customer/i.test(state)) return OPERATIONAL_STATES.WAITING_CUSTOMER;
  if (/approved|ready|swo|work order/i.test(state)) return OPERATIONAL_STATES.READY_SCHEDULING;
  if (risks.length || intelligence.confidence < 65 || profile.needsReview) return OPERATIONAL_STATES.NEEDS_REVIEW;
  return OPERATIONAL_STATES.NEW;
}

function operationalHealth(status, risks, submittedAt) {
  const ageHours = submittedAt ? Math.max(0, Math.floor((Date.now() - toDate(submittedAt)) / 3600000)) : null;
  let rank = 1;
  let label = HEALTH_STATES.HEALTHY;
  let reason = "Normal workflow.";
  if (status === OPERATIONAL_STATES.ESCALATED) {
    rank = 5; label = HEALTH_STATES.ESCALATED; reason = "Escalated workflow.";
  } else if (status === OPERATIONAL_STATES.BLOCKED || risks.some((risk) => risk.level === "red")) {
    rank = 4; label = HEALTH_STATES.BLOCKED; reason = "Blocked by a hard operational issue.";
  } else if ((ageHours !== null && ageHours >= 72) || status === OPERATIONAL_STATES.NEEDS_REVIEW || status === REQUEST_STAGES.REVIEW) {
    rank = 3; label = HEALTH_STATES.AT_RISK; reason = ageHours >= 72 ? "Request has aged past 72 hours." : "Requires review before progressing.";
  } else if (status === OPERATIONAL_STATES.WAITING_CUSTOMER || (ageHours !== null && ageHours >= 24)) {
    rank = 2; label = HEALTH_STATES.WAITING; reason = status === OPERATIONAL_STATES.WAITING_CUSTOMER ? "Waiting on customer response." : "Request is over 24 hours old.";
  }
  return { label, rank, ageHours, reason };
}

function requestEvents(profile, status, health, risks, intelligence) {
  const events = [];
  if (profile.timestamp) events.push({ type: "request_created", label: "Request created", at: profile.timestamp });
  if (risks.length) events.push({ type: "workflow_blocked", label: risks[0].text, at: new Date().toISOString() });
  if (intelligence && intelligence.category) events.push({ type: "AI_recommendation_generated", label: intelligence.category, at: new Date().toISOString() });
  events.push({ type: "state_evaluated", label: `${status} · ${health.label}`, at: new Date().toISOString() });
  return events.slice(0, 4);
}

function buildTodayView(cards, cache) {
  const todayStart = new Date().setHours(0,0,0,0);
  const needsActionNow = cards.filter((card) => card.health.rank >= 3 || card.operationalStage === REQUEST_STAGES.REVIEW || card.status === OPERATIONAL_STATES.BLOCKED).slice(0, 12);
  const waitingOnCustomer = cards.filter((card) => card.status === OPERATIONAL_STATES.WAITING_CUSTOMER || /Needs Info|waiting/i.test(card.nextAction || "")).slice(0, 8);
  const overdue = cards.filter((card) => (card.health.ageHours || 0) >= 72).slice(0, 8);
  const todaysAppointments = cards.filter((card) => card.operationalStage === REQUEST_STAGES.SCHEDULED || /today/i.test(card.suggestedDate || "")).slice(0, 8);
  const missingInfo = cards.filter((card) => card.risks && card.risks.length).slice(0, 8);
  const readyForScheduling = cards.filter((card) => card.operationalStage === REQUEST_STAGES.READY).slice(0, 8);
  const newRequests = cards.filter((card) => (card.sortKeys.submittedAt || 0) >= todayStart || card.operationalStage === REQUEST_STAGES.NEW).slice(0, 8);
  const techCounts = cards.reduce((acc, card) => {
    const tech = card.suggestedTech || "Unassigned";
    acc[tech] = (acc[tech] || 0) + 1;
    return acc;
  }, {});
  const technicianPressure = Object.keys(techCounts).sort().map((tech) => ({
    tech,
    count: techCounts[tech],
    state: techCounts[tech] >= 18 ? "Overloaded" : techCounts[tech] >= 10 ? "Busy" : "Available"
  }));
  return {
    generatedAt: new Date().toISOString(),
    syncState: cache.operatorStatus,
    needsActionNow,
    waitingOnCustomer,
    overdue,
    todaysAppointments,
    missingInfo,
    readyForScheduling,
    newRequests,
    technicianPressure,
    aiRecommendations: cards.filter((card) => card.intelligence && card.intelligence.confidence >= 70).slice(0, 6),
    escalations: cards.filter((card) => card.health.label === HEALTH_STATES.ESCALATED || card.health.label === HEALTH_STATES.BLOCKED).slice(0, 6)
  };
}

function humanStatus(profile, match, risks) {
  if (risks.some((risk) => risk.level === "red")) return "Blocked";
  if (risks.length || profile.needsReview || match.confidence < 65) return "Needs Attention";
  if (/done|completed/i.test(profile.pipelineState)) return "Completed";
  if (/scheduled/i.test(profile.pipelineState)) return "Scheduled";
  if (/approved/i.test(profile.pipelineState)) return "Approved";
  if (match.confidence >= 90) return "Ready for Review";
  if (match.confidence >= 65) return "Customer Found";
  return "New Request";
}

function riskFlags(profile, match) {
  const risks = [];
  if (!profile.phone && !profile.email) risks.push({ level: "yellow", text: "Missing phone/email. Use address or manual review." });
  if (!profile.street || !profile.city) risks.push({ level: "yellow", text: "Missing service address." });
  if (match.confidence < 65) risks.push({ level: "yellow", text: "Weak customer match." });
  if (match.openWorkOrder) risks.push({ level: "red", text: "Possible existing open work order. Do not approve until reviewed." });
  if (getCacheStatus().operatorStatus !== "Data is up to date") risks.push({ level: "yellow", text: "Data cache may need refresh." });
  return risks;
}

function riskLevel(risks, intelligence) {
  if (risks.some((risk) => risk.level === "red")) return "High";
  if (risks.length || intelligence.confidence < 65) return "Medium";
  return "Low";
}

function nextOperatorAction(status, risks) {
  if (status === OPERATIONAL_STATES.ESCALATED) return "Escalate to service manager";
  if (status === OPERATIONAL_STATES.BLOCKED) return "Resolve blocker";
  if (status === OPERATIONAL_STATES.NEEDS_REVIEW) return "Review exception";
  if (status === OPERATIONAL_STATES.WAITING_CUSTOMER) return "Follow up with customer";
  if (status === OPERATIONAL_STATES.READY_SCHEDULING) return "Schedule or approve SWO";
  if (status === OPERATIONAL_STATES.SCHEDULED) return "Monitor appointment";
  if (status === OPERATIONAL_STATES.IN_PROGRESS) return "Track technician progress";
  if (status === OPERATIONAL_STATES.COMPLETED) return "Capture learning";
  return risks.length ? "Review before approving" : "Review request";
}

function getCacheStatus() {
  const props = PropertiesService.getScriptProperties();
  const reports = CACHE_RULES.map((rule) => cacheRuleState(rule, props));
  const failed = reports.some((item) => item.state === "Unknown");
  const stale = reports.some((item) => item.state === "Stale");
  return {
    operatorStatus: failed || stale ? "Data needs refresh" : "Data is up to date",
    adminStatus: failed ? "Failed/Unknown" : stale ? "Stale" : "Fresh",
    reports
  };
}

function cacheRuleState(rule, props) {
  const raw = firstPresent(rule.props.map((name) => props.getProperty(name)));
  const ts = parseTimestamp(raw);
  const ageMinutes = ts ? Math.round((Date.now() - ts) / 60000) : null;
  const state = !ts ? "Unknown" : ageMinutes <= rule.maxMinutes ? "Fresh" : "Stale";
  return { key: rule.key, label: rule.label, state, ageMinutes, maxMinutes: rule.maxMinutes, lastSync: ts ? new Date(ts).toISOString() : "" };
}

function getUiPayloadCache(name) {
  try {
    const raw = CacheService.getScriptCache().get(`serviceops-ui-${UI_PAYLOAD_CACHE_VERSION}-${name}`);
    if (!raw) return null;
    const payload = JSON.parse(raw);
    payload.source = "ui-cache";
    payload.cacheHit = true;
    return payload;
  } catch (error) {
    return null;
  }
}

function setUiPayloadCache(name, payload) {
  try {
    const serialized = JSON.stringify(payload);
    if (serialized.length < 95000) {
      CacheService.getScriptCache().put(`serviceops-ui-${UI_PAYLOAD_CACHE_VERSION}-${name}`, serialized, UI_PAYLOAD_CACHE_SECONDS);
    }
  } catch (error) {
    // Cache is an acceleration layer only; never fail the operator surface because it missed.
  }
  return payload;
}

function invalidateUiPayloadCache() {
  try {
    const cache = CacheService.getScriptCache();
    cache.remove("serviceops-ui-webformRequests");
    cache.remove("serviceops-ui-webformRequestsQueue");
    cache.remove("serviceops-ui-kanban");
    cache.remove(`serviceops-ui-${UI_PAYLOAD_CACHE_VERSION}-webformRequests`);
    cache.remove(`serviceops-ui-${UI_PAYLOAD_CACHE_VERSION}-webformRequestsQueue`);
    cache.remove(`serviceops-ui-${UI_PAYLOAD_CACHE_VERSION}-kanban`);
  } catch (error) {
    // Best effort.
  }
}

function getRows(sheetName, limit) {
  const sheet = getSheet(sheetName);
  if (!sheet) return [];
  const lastRow = sheet.getLastRow();
  const lastColumn = sheet.getLastColumn();
  if (lastRow < 2 || lastColumn < 1) return [];

  const headers = sheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0].map((header) => String(header || "").trim());
  const availableRows = lastRow - 1;
  const takeRows = Math.min(limit || availableRows, availableRows);
  const startRow = Math.max(2, lastRow - takeRows + 1);
  const values = sheet.getRange(startRow, 1, takeRows, lastColumn).getDisplayValues();

  const rows = values.map((row, index) => ({ row, rowNumber: startRow + index })).filter(({ row }) => row.some(Boolean)).map(({ row, rowNumber }) => {
    const record = { _rowNumber: rowNumber };
    headers.forEach((header, column) => {
      if (header) record[header] = row[column];
    });
    return record;
  });
  return rows;
}

function getSheet(name) {
  return getSpreadsheet().getSheetByName(name);
}

function getSpreadsheet() {
  const spreadsheetId = PropertiesService.getScriptProperties().getProperty("SPREADSHEET_ID");
  const spreadsheet = spreadsheetId ? SpreadsheetApp.openById(spreadsheetId) : SpreadsheetApp.getActiveSpreadsheet();
  if (!spreadsheet) throw new Error("No spreadsheet is available. Set Script Property SPREADSHEET_ID.");
  return spreadsheet;
}

function appendDecisionLog(row) {
  const spreadsheet = getSpreadsheet();
  const sheet = spreadsheet.getSheetByName(SHEETS.decisions) || spreadsheet.insertSheet(SHEETS.decisions);
  const headers = ["At", "Operator", "Request ID", "Customer", "Action", "Note", "Result"];
  if (sheet.getLastRow() === 0) sheet.appendRow(headers);
  sheet.appendRow([row.at, row.operator, row.requestId, row.customer, row.action, row.note, row.result]);
}

function firstProperty(props, names) {
  return firstPresent(names.map((name) => props.getProperty(name)));
}

function logRecommendation(action, payload) {
  try {
    appendDecisionLog({
      at: new Date().toISOString(),
      operator: "ServiceOps Assistant",
      requestId: "",
      customer: "",
      action,
      note: JSON.stringify(payload).slice(0, 400),
      result: "Recommendation logged. Read-only."
    });
  } catch (error) {
    console.log(error);
  }
}

function isActiveIntake(row) {
  const state = String(firstValue(row, ["Pipeline State", "Status"]) || "");
  return !/done|completed|closed|rejected/i.test(state);
}

function serviceArea(profile) {
  const city = String(profile.city || "").toLowerCase();
  if (/ajax|pickering|whitby|oshawa|clarington|bowmanville/.test(city)) return "Durham";
  if (/mississauga|oakville|burlington|milton/.test(city)) return "West";
  if (/markham|richmond hill|vaughan|newmarket|aurora/.test(city)) return "North";
  if (/scarborough|toronto|etobicoke|york/.test(city)) return "Toronto";
  return profile.city || "Unassigned";
}

function assetLabel(match, profile) {
  const asset = match.assets[0];
  const value = asset ? compactRecord(asset, ["Manufacturer", "Make", "Model", "Serial Number", "Age"]) : profile.makeModelAge;
  return value || "Unknown fireplace";
}

function relatedCustomer(row, context) {
  const id = firstValue(row, ["Customer ID", "CustomerId"]);
  if (!id) return null;
  return context.customers.find((customer) => sameId(firstValue(customer, ["Customer ID", "CustomerId", "ID"]), id)) || null;
}

function dataGaps(match) {
  const gaps = [];
  if (!match.customer) gaps.push("customer not confirmed");
  if (!match.locations.length) gaps.push("location");
  if (!match.assets.length) gaps.push("asset/fireplace");
  if (!match.tasks.length) gaps.push("service history");
  return gaps;
}

function mergeAiSummary(summary, aiText) {
  const copy = JSON.parse(JSON.stringify(summary));
  copy.notesSummary = aiText || copy.notesSummary;
  return copy;
}

function conversationalReply(message) {
  return {
    ok: true,
    conversational: true,
    reply: message,
    aiAvailable: false,
    aiNotice: "No lookup was needed."
  };
}

function isGreeting(text) {
  return /^(hi|hello|hey|good morning|good afternoon|good evening|yo|hiya)[!. ]*$/i.test(String(text || "").trim());
}

function hasLookupSignal(text) {
  const value = String(text || "").trim();
  if (normalizeEmail(value) || normalizePhone(value)) return true;
  if (/\b(?:SO|SWO|DEMO)?[-\s]?\d{4,}\b/i.test(value)) return true;
  if (/\d+\s+[a-z]/i.test(value) && /\b(st|street|rd|road|ave|avenue|dr|drive|cres|court|ct|blvd|lane|ln|way)\b/i.test(value)) return true;
  if (/\b(appointment|scheduled|previous service|duplicate|work order|fireplace|asset|customer|address|phone|email|what should i do|next action)\b/i.test(value) && value.length > 12) return true;
  return value.split(/\s+/).length >= 2 && value.length >= 8;
}

function removeEmptySections(sections) {
  const result = {};
  Object.keys(sections).forEach((key) => {
    const value = sections[key];
    if (Array.isArray(value) && value.length) result[key] = value;
    if (!Array.isArray(value) && String(value || "").trim()) result[key] = value;
  });
  return result;
}

function extractOpenAiText(body) {
  if (body.output_text) return body.output_text;
  const output = body.output || [];
  return output.map((item) => (item.content || []).map((part) => part.text || "").join("")).join("\n").trim();
}

function safePropertySummary() {
  const props = PropertiesService.getScriptProperties().getProperties();
  return Object.keys(props).sort().map((key) => ({
    key,
    configured: Boolean(props[key]),
    secret: /KEY|TOKEN|SECRET|PASSWORD/i.test(key)
  }));
}

function groupedPropertySummary(props) {
  const all = props.getProperties();
  const required = ["SPREADSHEET_ID", "STRIVEN_BASE_URL", "STRIVEN_CLIENT_ID", "STRIVEN_CLIENT_SECRET"];
  const groups = [
    { key: "auth", label: "Authentication & tokens", match: /TOKEN|SECRET|CLIENT|OPENAI|OPENROUTER|TWILIO|MAPS|KEY/i, items: [] },
    { key: "cache", label: "Caching & timestamps", match: /CACHE|TS|EXPIR|LAST|ROW/i, items: [] },
    { key: "reports", label: "Report URLs & keys", match: /REPORT|URL/i, items: [] },
    { key: "flags", label: "Feature flags / misc", match: /.*/, items: [] }
  ];
  Object.keys(all).sort().forEach((name) => {
    const item = {
      name,
      configured: Boolean(all[name]),
      required: required.indexOf(name) !== -1,
      secret: /KEY|TOKEN|SECRET|PASSWORD|CLIENT/i.test(name),
      status: all[name] ? "Configured" : "Missing"
    };
    const group = groups.find((entry) => entry.match.test(name)) || groups[groups.length - 1];
    group.items.push(item);
  });
  required.forEach((name) => {
    if (!Object.prototype.hasOwnProperty.call(all, name)) {
      groups[0].items.push({ name, configured: false, required: true, secret: /SECRET|CLIENT/i.test(name), status: "Missing" });
    }
  });
  return groups.map((group) => ({ key: group.key, label: group.label, items: group.items }));
}

function requiredSheetStatus() {
  const now = new Date().toISOString();
  return Object.keys(SHEETS).map((key) => {
    try {
      const sheet = getSheet(SHEETS[key]);
      return {
        key,
        name: SHEETS[key],
        status: sheet ? "Found" : "Missing",
        lastChecked: now,
        rows: sheet ? Math.max(0, sheet.getLastRow() - 1) : 0,
        guidance: sheet ? "" : `Create or restore sheet "${SHEETS[key]}".`
      };
    } catch (error) {
      return { key, name: SHEETS[key], status: "Permission issue", lastChecked: now, rows: 0, guidance: String(error && error.message ? error.message : error) };
    }
  });
}

function integrationHealth(props) {
  const cache = getCacheStatus();
  const reportMissing = REPORT_REFRESH_CONFIG.filter((config) => !firstProperty(props, config.props)).map((config) => config.key);
  return [
    {
      key: "striven",
      name: "Striven",
      status: props.getProperty("STRIVEN_CLIENT_ID") && props.getProperty("STRIVEN_CLIENT_SECRET") ? "OK" : "Warning",
      lastSuccessfulCall: props.getProperty("SERVICEOPS_LAST_GLOBAL_REFRESH") || "",
      message: "Credentials configured for server-side use."
    },
    {
      key: "reporting",
      name: "Reporting API",
      status: reportMissing.length ? "Warning" : cache.adminStatus === "Fresh" ? "OK" : "Warning",
      lastSuccessfulCall: props.getProperty("SERVICEOPS_LAST_GLOBAL_REFRESH") || "",
      message: reportMissing.length ? `Missing report config: ${reportMissing.join(", ")}` : "Report URLs configured."
    },
    {
      key: "maps",
      name: "Google Maps",
      status: props.getProperty("GOOGLE_MAPS_API_KEY") || props.getProperty("MAPS_API_KEY") ? "OK" : "Warning",
      lastSuccessfulCall: "",
      message: "Used for routing recommendations when enabled."
    },
    {
      key: "twilio",
      name: "Twilio",
      status: props.getProperty("TWILIO_SID") && props.getProperty("TWILIO_AUTH_TOKEN") ? "OK" : "Warning",
      lastSuccessfulCall: "",
      message: "Messaging credentials are optional for this read-only UI."
    }
  ];
}

function adminIssues(cache, sheets, propertyGroups, integrations) {
  const issues = [];
  cache.reports.forEach((item) => {
    if (item.state !== "Fresh") issues.push({ severity: item.state === "Stale" ? "Warning" : "Error", title: `${item.label} data is ${item.state}`, impact: "Command Centre may show incomplete or old records.", nextStep: "Run Refresh stale data." });
  });
  sheets.forEach((sheet) => {
    if (sheet.status !== "Found") issues.push({ severity: "Error", title: `${sheet.name} sheet is ${sheet.status}`, impact: "Related views may be empty or inaccurate.", nextStep: sheet.guidance });
  });
  propertyGroups.forEach((group) => group.items.forEach((item) => {
    if (item.required && !item.configured) issues.push({ severity: "Error", title: `${item.name} is missing`, impact: "A required integration/config value is not available.", nextStep: "Add it in Apps Script Script Properties." });
  }));
  integrations.forEach((integration) => {
    if (integration.status === "Error") issues.push({ severity: "Error", title: `${integration.name} integration error`, impact: integration.message, nextStep: "Open Agent Logs and re-test integrations." });
  });
  return issues;
}

function summarizeLog(action, note, result) {
  const text = `${note || ""} ${result || ""}`.trim();
  if (/Errors?:/i.test(text)) return text.match(/Errors?:[^.]+\.?/i)[0].slice(0, 160);
  if (/Refreshed:/i.test(text)) return text.match(/Refreshed:[\s\S]{0,140}/i)[0].replace(/\s+/g, " ");
  if (action) return `${action}: ${String(result || note || "Logged").slice(0, 120)}`;
  return String(result || note || "Log entry").slice(0, 140);
}

function scheduleBucket(value) {
  const stamp = toDate(value);
  if (!stamp) return "Unscheduled";
  const date = new Date(stamp);
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diff = Math.round((day - start) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff > 1 && diff <= 7) return "This Week";
  return "Later";
}

function firstValue(record, names) {
  if (!record) return "";
  for (let i = 0; i < names.length; i += 1) {
    const direct = record[names[i]];
    if (direct !== undefined && direct !== null && String(direct).trim() !== "") return String(direct).trim();
    const foundKey = Object.keys(record).find((key) => normalizeHeader(key) === normalizeHeader(names[i]));
    if (foundKey && String(record[foundKey] || "").trim() !== "") return String(record[foundKey]).trim();
  }
  return "";
}

function firstPresent(values) {
  return values.find((value) => value !== undefined && value !== null && String(value).trim() !== "") || "";
}

function compactRecord(row, fields) {
  if (!row) return "";
  return fields.map((field) => firstValue(row, [field])).filter(Boolean).join(" · ");
}

function containsText(row, value) {
  return value ? JSON.stringify(row).toLowerCase().indexOf(String(value).toLowerCase()) !== -1 : false;
}

function findRecord(rows, predicate) {
  for (let i = 0; i < rows.length; i += 1) {
    if (predicate(rows[i])) return rows[i];
  }
  return null;
}

function sameId(a, b) {
  return String(a || "").replace(/\D/g, "") === String(b || "").replace(/\D/g, "") && String(a || b || "").replace(/\D/g, "") !== "";
}

function normalizeHeader(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function normalizeEmail(value) {
  const match = String(value || "").toLowerCase().match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/);
  return match ? match[0] : "";
}

function normalizePhone(value) {
  const digits = String(value || "").replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : "";
}

function normalizeSo(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function normalizeAddress(value) {
  return String(value || "").toLowerCase().replace(/\b(ontario|canada|on)\b/g, "").replace(/[^a-z0-9]/g, "");
}

function normalizeName(value) {
  return String(value || "").toLowerCase().replace(/[^a-z]/g, " ").replace(/\s+/g, " ").trim();
}

function toDate(value) {
  const date = new Date(value || "");
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function parseTimestamp(value) {
  if (!value) return 0;
  const number = Number(value);
  if (Number.isFinite(number) && number > 1000000000) return number > 100000000000 ? number : number * 1000;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function failure(message, error) {
  return { ok: false, message, error: String(error && error.message ? error.message : error) };
}

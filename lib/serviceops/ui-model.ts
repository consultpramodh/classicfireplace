import type { IntakeRow, TaskMappingRow } from "@/lib/serviceops/types";
import { assessIntakeComplexity } from "@/lib/serviceops/complexity";
import { dedupeIntakeForms } from "@/lib/serviceops/dedupe";
import { sortRequestsRecentFirst } from "@/lib/serviceops/sorting";

export type OpsView =
  | "intake"
  | "command"
  | "customer-match"
  | "opportunity"
  | "work-orders"
  | "schedule"
  | "review"
  | "agent-logs"
  | "admin"
  | "detail";

export type UiStatus =
  | "new"
  | "reference"
  | "attention"
  | "customer"
  | "history"
  | "intelligence"
  | "techArea"
  | "date"
  | "opportunity"
  | "approval"
  | "approved"
  | "ready"
  | "workOrder"
  | "scheduled"
  | "completed";

export type TimelineEntry = {
  at: string;
  text: string;
};

export type UiRequest = IntakeRow & {
  uiStatus: UiStatus;
  complexityLevel: "L1" | "L2" | "L3";
  complexityLabel: string;
  recommendedTech: "Travis" | "Chris or Matt";
  missingFields: string[];
  nextAction: string;
  nextReason: string;
  reviewReason: string;
  timeline: TimelineEntry[];
};

export type GateCheck = {
  label: string;
  ok: boolean;
  blocker?: boolean;
};

export type LivePayload = {
  rows: IntakeRow[];
  taskRows: TaskMappingRow[];
  source: "demo" | "cache" | "empty";
  refreshedAt?: string;
  stale?: boolean;
  error?: string;
};

export const statusLabels: Record<UiStatus, string> = {
  new: "New Row",
  reference: "Reference Ready",
  attention: "Needs Review",
  customer: "Customer Ready",
  history: "History Enriched",
  intelligence: "Service Intel",
  techArea: "Tech Recommended",
  date: "Date Suggested",
  opportunity: "Opportunity",
  approval: "Awaiting Approval",
  approved: "Approved for SWO",
  ready: "Ready for WO",
  workOrder: "Work Order",
  scheduled: "Scheduled",
  completed: "Completed"
};

export function buildUiRequests(rows: IntakeRow[], now = new Date()): UiRequest[] {
  return sortRequestsRecentFirst(dedupeIntakeForms(rows)).map((row) => decorateRequest(row, now));
}

export function decorateRequest(row: IntakeRow, now = new Date()): UiRequest {
  const complexity = assessIntakeComplexity(row);
  const uiStatus = deriveUiStatus(row);
  const reviewReason = deriveReviewReason(row, complexity.missingFields);
  const next = deriveNextAction(uiStatus, reviewReason);

  return {
    ...row,
    uiStatus,
    complexityLevel: complexity.level,
    complexityLabel: complexity.label,
    recommendedTech: complexity.recommendedTechnician,
    missingFields: complexity.missingFields,
    nextAction: next.action,
    nextReason: next.reason,
    reviewReason,
    timeline: [
      {
        at: row.submittedAt || now.toISOString(),
        text: "Webform intake received."
      }
    ]
  };
}

export function deriveUiStatus(row: IntakeRow): UiStatus {
  const state = `${row.pipelineState || ""} ${row.salesOrderStatus || ""} ${row.cleanServiceTaskStatus || ""}`;
  if (row.needsReview || row.lastError || /ERROR|REVIEW_REQUIRED|CUSTOMER_BLOCKED/i.test(state)) return "attention";
  if (row.taskMatched || /LEARNING_CAPTURED|TASK_COMPLETED|COMPLETED|DONE|IN SYNC/i.test(state)) return "completed";
  if (/TASK_SCHEDULED|SCHEDULED/i.test(state)) return "scheduled";
  if (row.salesOrderNumber || row.strivenSoId || /SERVICE_SO_CREATED/i.test(state)) return "workOrder";
  if (isApprovedForWorkOrder(row) || /APPROVED_FOR_SWO|AWAITING_SWO_APPROVAL/i.test(state)) return "approved";
  if (/AWAITING_APPROVAL/i.test(state)) return "approval";
  if (row.strivenOppId || /OPPORTUNITY_CREATED|OPPORTUNITY_PENDING/i.test(state)) return "opportunity";
  if (/DATE_RECOMMENDED/i.test(state)) return "date";
  if (/TECH_AND_AREA_RECOMMENDED/i.test(state)) return "techArea";
  if (/SERVICE_INTELLIGENCE_READY/i.test(state)) return "intelligence";
  if (/CUSTOMER_HISTORY_ENRICHED/i.test(state)) return "history";
  if (row.strivenCustomerId || /CUSTOMER_RESOLVED|CUSTOMER_CREATED/i.test(state)) return "customer";
  if (/REFERENCE_DATA_READY/i.test(state)) return "reference";
  return "new";
}

export function deriveNextAction(status: UiStatus, reviewReason = "") {
  if (status === "attention") return { action: "Review Issue", reason: reviewReason || "A human decision is required before continuing." };
  if (status === "new") return { action: "Refresh Reference Data", reason: "Confirm Striven cache before identity resolution." };
  if (status === "reference") return { action: "Resolve Customer", reason: "Match by existing ID, email, phone, alt phone, address and postal code, then address and city." };
  if (status === "customer") return { action: "Enrich History", reason: "Pull assets, prior tasks, work orders, callbacks, and open-work risk before creating workflow." };
  if (status === "history") return { action: "Run Service Intelligence", reason: "Classify symptom, likely cause, parts, duration, difficulty, and callback risk." };
  if (status === "intelligence") return { action: "Recommend Tech", reason: "Use deterministic territory/history first; AI supports skill and pattern reasoning." };
  if (status === "techArea") return { action: "Suggest Date", reason: "Use preferred days, availability, route density, duration, and urgency." };
  if (status === "date") return { action: "Create Opportunity", reason: "CRM opportunity carries form details, service intelligence, suggested tech, and suggested date." };
  if (status === "opportunity") return { action: "Send for Approval", reason: "Human approval is required before operational commitment." };
  if (status === "approval") return { action: "Approve for SWO", reason: "Move opportunity to Approved for SWO only after review." };
  if (status === "approved" || status === "ready") return { action: "Create Work Order", reason: "Gate checks decide if the simulated work order can proceed." };
  if (status === "workOrder") return { action: "Schedule Task", reason: "Map service order/task/calendar with recognized tech, valid time, and matching location." };
  if (status === "scheduled") return { action: "Monitor Completion", reason: "Watch task status, notes, completion date, and mapping health." };
  return { action: "View Summary", reason: "No immediate action is required." };
}

export function deriveReviewReason(row: IntakeRow, missingFields = assessIntakeComplexity(row).missingFields) {
  if (row.lastError) return row.lastError;
  if (row.needsReview) return "Request is marked for manual review.";
  if (missingFields.includes("Phone") && missingFields.includes("Email")) return "Missing strong customer identity fields.";
  if (missingFields.includes("Street") || missingFields.includes("City")) return "Missing service location.";
  if (/duplicate/i.test(`${row.pipelineState} ${row.anythingElse}`)) return "Duplicate risk needs review.";
  return "";
}

export function workOrderGate(row: UiRequest | IntakeRow): GateCheck[] {
  return [
    { label: "Customer exists", ok: Boolean(row.strivenCustomerId) || !["new", "reference"].includes(deriveUiStatus(row)) },
    { label: "Location exists", ok: Boolean(row.street && row.city), blocker: true },
    { label: "Opportunity exists", ok: Boolean(row.strivenOppId) || ["approved", "ready", "workOrder", "scheduled", "completed"].includes(deriveUiStatus(row)) },
    { label: "Approved for SWO", ok: isApprovedForWorkOrder(row) || ["approved", "ready", "workOrder", "scheduled", "completed"].includes(deriveUiStatus(row)), blocker: true },
    { label: "No duplicate work order", ok: !row.strivenSoId && !row.salesOrderNumber, blocker: Boolean(row.strivenSoId || row.salesOrderNumber) },
    { label: "No active job exists", ok: !/active work|active job|in-progress/i.test(row.lastError || ""), blocker: /active work|active job|in-progress/i.test(row.lastError || "") }
  ];
}

export function canCreateWorkOrder(row: UiRequest | IntakeRow) {
  return workOrderGate(row).every((check) => check.ok);
}

export function isApprovedForWorkOrder(row: Pick<IntakeRow, "opportunityStage" | "pipelineState">) {
  return /approved for swo|approved_for_swo/i.test(`${row.opportunityStage || ""} ${row.pipelineState || ""}`);
}

export function currentMonthRequests(rows: UiRequest[], now = new Date()) {
  const current = rows.filter((row) => isSameMonth(row.submittedAt, now));
  return sortRequestsRecentFirst(current.length ? current : rows);
}

export function currentMonthTasks(rows: TaskMappingRow[], now = new Date()) {
  const current = rows.filter((row) => isSameMonth(row.start || "", now));
  return (current.length ? current : rows).sort((a, b) => String(a.start || "").localeCompare(String(b.start || "")));
}

export function filterUiRequests(rows: UiRequest[], options: { query?: string; status?: UiStatus | "all"; attentionOnly?: boolean }) {
  const query = String(options.query || "").trim().toLowerCase();
  return sortRequestsRecentFirst(rows.filter((row) => {
    if (options.status && options.status !== "all" && row.uiStatus !== options.status) return false;
    if (options.attentionOnly && row.uiStatus !== "attention") return false;
    if (!query) return true;
    return [
      displayName(row),
      row.phone,
      row.altPhone,
      row.email,
      row.street,
      row.city,
      row.postalCode,
      row.details,
      row.anythingElse,
      row.pipelineState,
      row.nextAction
    ].join(" ").toLowerCase().includes(query);
  }));
}

export function displayName(row: Pick<IntakeRow, "firstName" | "lastName" | "email" | "phone">) {
  return [row.firstName, row.lastName].filter(Boolean).join(" ") || row.email || row.phone || "Unknown Customer";
}

export function requestSummary(row: Pick<IntakeRow, "details" | "anythingElse" | "makeModelAge">) {
  return row.details || row.anythingElse || row.makeModelAge || "Service request needs review.";
}

export function isSameMonth(value: string, now = new Date()) {
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
}

export function nextStatus(status: UiStatus): UiStatus {
  if (status === "new") return "reference";
  if (status === "reference") return "customer";
  if (status === "customer") return "history";
  if (status === "history") return "intelligence";
  if (status === "intelligence") return "techArea";
  if (status === "techArea") return "date";
  if (status === "date") return "opportunity";
  if (status === "opportunity") return "approval";
  if (status === "approval") return "approved";
  if (status === "approved" || status === "ready") return "workOrder";
  if (status === "workOrder") return "scheduled";
  if (status === "scheduled") return "completed";
  if (status === "attention") return "customer";
  return status;
}

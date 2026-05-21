import type { PipelineState, ServiceRequest } from "@/lib/types";

export const pipelineStates: PipelineState[] = [
  "NEW_ROW",
  "REFERENCE_DATA_READY",
  "CUSTOMER_RESOLVED",
  "CUSTOMER_CREATED",
  "CUSTOMER_BLOCKED",
  "CUSTOMER_HISTORY_ENRICHED",
  "SERVICE_INTELLIGENCE_READY",
  "TECH_AND_AREA_RECOMMENDED",
  "DATE_RECOMMENDED",
  "OPPORTUNITY_CREATED",
  "AWAITING_APPROVAL",
  "APPROVED_FOR_SWO",
  "SERVICE_SO_CREATED",
  "SCHEDULED",
  "TASK_COMPLETED",
  "LEARNING_CAPTURED",
  "DONE",
  "REVIEW_REQUIRED",
  "ERROR"
];

export const stateLabels: Record<PipelineState, string> = {
  NEW_ROW: "New row",
  REFERENCE_DATA_READY: "Reference data ready",
  NEW: "New",
  CUSTOMER_RESOLVED: "Customer resolved",
  CUSTOMER_CREATED: "Customer created",
  CUSTOMER_BLOCKED: "Customer blocked",
  CUSTOMER_HISTORY_ENRICHED: "Customer history enriched",
  SERVICE_INTELLIGENCE_READY: "Service intelligence ready",
  TECH_AND_AREA_RECOMMENDED: "Tech and area recommended",
  DATE_RECOMMENDED: "Date recommended",
  OPPORTUNITY_PENDING: "Opportunity pending",
  OPPORTUNITY_CREATED: "Opportunity created",
  AWAITING_APPROVAL: "Awaiting approval",
  APPROVED_FOR_SWO: "Approved for SWO",
  AWAITING_SWO_APPROVAL: "Awaiting SWO approval",
  SERVICE_SO_CREATED: "SWO created",
  SCHEDULED: "Scheduled",
  TASK_SCHEDULED: "Task scheduled",
  TASK_COMPLETED: "Task completed",
  LEARNING_CAPTURED: "Learning captured",
  DONE: "Done",
  COMPLETED: "Completed",
  REVIEW_REQUIRED: "Review required",
  ERROR: "Error"
};

export function evaluateSwoGate(request: ServiceRequest) {
  const checks = [
    { label: "Has customer ID", passed: Boolean(request.striven.customerId) },
    { label: "Has location ID", passed: Boolean(request.striven.locationId) },
    { label: "Has opportunity ID", passed: Boolean(request.striven.opportunityId) },
    { label: "Opportunity stage Approved for SWO", passed: request.striven.opportunityStage === "Approved for SWO" },
    { label: "No duplicate SWO", passed: !request.striven.duplicateSwoRisk && !request.striven.serviceOrderId },
    { label: "No active/in-progress work order", passed: !request.striven.activeWorkOrderExists },
    { label: "Service item price not zero", passed: Number(request.striven.serviceItemPrice ?? 0) > 0 }
  ];

  return {
    checks,
    canCreateSwo: checks.every((check) => check.passed)
  };
}

export function simulateTransition(state: PipelineState, action: string): PipelineState {
  if (action === "refreshReference") return state === "NEW_ROW" || state === "NEW" ? "REFERENCE_DATA_READY" : state;
  if (action === "resolveCustomer") return ["REFERENCE_DATA_READY", "NEW_ROW", "NEW"].includes(state) ? "CUSTOMER_RESOLVED" : state;
  if (action === "enrichHistory") return ["CUSTOMER_RESOLVED", "CUSTOMER_CREATED"].includes(state) ? "CUSTOMER_HISTORY_ENRICHED" : state;
  if (action === "classifyService") return state === "CUSTOMER_HISTORY_ENRICHED" ? "SERVICE_INTELLIGENCE_READY" : state;
  if (action === "recommendTech") return state === "SERVICE_INTELLIGENCE_READY" ? "TECH_AND_AREA_RECOMMENDED" : state;
  if (action === "recommendDate") return state === "TECH_AND_AREA_RECOMMENDED" ? "DATE_RECOMMENDED" : state;
  if (action === "createOpportunity") return state === "DATE_RECOMMENDED" ? "OPPORTUNITY_CREATED" : state;
  if (action === "awaitApproval") return state === "OPPORTUNITY_CREATED" ? "AWAITING_APPROVAL" : state;
  if (action === "approveForSwo") return state === "AWAITING_APPROVAL" ? "APPROVED_FOR_SWO" : state;
  if (action === "createSwo") return state === "APPROVED_FOR_SWO" ? "SERVICE_SO_CREATED" : state;
  if (action === "mapTask") return state === "SERVICE_SO_CREATED" ? "SCHEDULED" : state;
  if (action === "completeTask") return state === "SCHEDULED" ? "TASK_COMPLETED" : state;
  if (action === "captureLearning") return state === "TASK_COMPLETED" ? "LEARNING_CAPTURED" : state;
  if (action === "done") return state === "LEARNING_CAPTURED" ? "DONE" : state;
  if (action === "sendReview") return "REVIEW_REQUIRED";
  return state;
}

export function appendAudit(request: ServiceRequest, action: string, note: string, state?: PipelineState): ServiceRequest {
  return {
    ...request,
    state: state ?? request.state,
    timeline: [
      {
        at: new Date().toISOString(),
        actor: "Prototype operator",
        action,
        note
      },
      ...request.timeline
    ]
  };
}

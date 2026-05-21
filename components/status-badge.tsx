import type { PipelineState } from "@/lib/types";
import { stateLabels } from "@/lib/pipeline";

const toneByStatus: Record<PipelineState, string> = {
  NEW_ROW: "neutral",
  REFERENCE_DATA_READY: "info",
  NEW: "neutral",
  CUSTOMER_RESOLVED: "success",
  CUSTOMER_CREATED: "success",
  CUSTOMER_BLOCKED: "danger",
  CUSTOMER_HISTORY_ENRICHED: "success",
  SERVICE_INTELLIGENCE_READY: "info",
  TECH_AND_AREA_RECOMMENDED: "info",
  DATE_RECOMMENDED: "info",
  OPPORTUNITY_PENDING: "warning",
  OPPORTUNITY_CREATED: "info",
  AWAITING_APPROVAL: "warning",
  APPROVED_FOR_SWO: "success",
  AWAITING_SWO_APPROVAL: "warning",
  SERVICE_SO_CREATED: "success",
  SCHEDULED: "success",
  TASK_SCHEDULED: "success",
  TASK_COMPLETED: "success",
  LEARNING_CAPTURED: "success",
  DONE: "success",
  COMPLETED: "success",
  REVIEW_REQUIRED: "danger",
  ERROR: "danger"
};

export function StatusBadge({ status, value }: { status?: PipelineState; value?: string }) {
  if (!status) return <span className="badge neutral">{value ?? "Unknown"}</span>;
  return <span className={`badge ${toneByStatus[status]}`}>{stateLabels[status]}</span>;
}

export type ServiceOpsAgentTask =
  | "intake_summary"
  | "customer_match"
  | "ambiguous_customer_match"
  | "scheduling_simple"
  | "scheduling_conflict"
  | "work_order_gate";

export type ModelRoute = {
  task: ServiceOpsAgentTask;
  model: string;
  reasoningEffort: "none" | "low" | "medium" | "high" | "xhigh";
  reason: string;
  risk: "low" | "medium" | "high";
};

export function routeServiceOpsModel(task: ServiceOpsAgentTask): ModelRoute {
  const fast = process.env.OPENAI_MODEL_FAST || "gpt-5.4-mini";
  const balanced = process.env.OPENAI_MODEL_BALANCED || "gpt-5.4";
  const strong = process.env.OPENAI_MODEL_STRONG || process.env.OPENAI_SERVICEOPS_MODEL || "gpt-5.5";

  if (task === "intake_summary") {
    return {
      task,
      model: fast,
      reasoningEffort: "none",
      reason: "Low-risk summarization and formatting should use the cheapest fast model.",
      risk: "low"
    };
  }

  if (task === "customer_match" || task === "scheduling_simple") {
    return {
      task,
      model: balanced,
      reasoningEffort: "low",
      reason: "Moderate-risk recommendation that still relies on deterministic business gates.",
      risk: "medium"
    };
  }

  return {
    task,
    model: strong,
    reasoningEffort: task === "work_order_gate" ? "medium" : "high",
    reason: "High-risk ambiguity or CRM-adjacent decision requires strongest available reasoning.",
    risk: "high"
  };
}

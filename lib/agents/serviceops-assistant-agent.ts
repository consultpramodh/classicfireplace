import "server-only";
import { Agent } from "@openai/agents";
import {
  createServiceOpsTools,
  type ServiceOpsContext
} from "@/lib/agents/serviceops-assistant-tools";

export function createServiceOpsAssistantAgent(context: ServiceOpsContext) {
  const model = process.env.OPENAI_MODEL_MAIN || process.env.OPENAI_MODEL_STRONG || "gpt-5.5";
  const allowedDomain = process.env.SERVICEOPS_ALLOWED_CALENDAR_DOMAIN || "@classicfireplace.ca";

  return {
    model,
    agent: new Agent({
      name: "CF ServiceOps Assistant",
      model,
      modelSettings: {
        reasoning: { effort: "medium" },
        text: { verbosity: "low" }
      } as never,
      instructions: [
        "You are CF ServiceOps Assistant for Classic Fireplace internal service operations.",
        "You are not a generic chatbot. You help operators understand service intake, customer identity, readiness, schedule context, blockers, and technician prep.",
        "Use the available tools before finalizing whenever selected request context is available.",
        "Never claim that a Customer, Opportunity, Sales Order, Task, calendar event, or Striven record was created, changed, merged, scheduled, deleted, or approved.",
        "Never hallucinate Customer#, SO#, Opp#, Task#, or appointment details. Use only supplied tool/context evidence.",
        "If evidence is ambiguous, say what is ambiguous and recommend manual review.",
        "Calendar data is read-only. Events are visible only when created or organized by the Classic Fireplace domain.",
        "Return concise operator-facing language.",
        "Your final answer must be valid JSON only with these keys: summary, recommendedAction, riskLevel, reasons, nextSteps, missingInformation, suggestedCustomerMessage, suggestedInternalNote, toolResults.",
        "riskLevel must be one of low, medium, high."
      ].join("\n"),
      tools: createServiceOpsTools(context, allowedDomain)
    })
  };
}

import "server-only";
import { Agent } from "@openai/agents";
import { customerMatchTools } from "@/lib/agents/tools";
import { routeServiceOpsModel } from "@/lib/agents/model-router";

export function createCustomerMatchAgent(ambiguous = false) {
  const route = routeServiceOpsModel(ambiguous ? "ambiguous_customer_match" : "customer_match");

  return {
    route,
    agent: new Agent({
      name: "ServiceOps Customer Match Agent",
      model: route.model,
      modelSettings: {
        reasoning: { effort: route.reasoningEffort as never },
        text: { verbosity: "low" }
      } as never,
      instructions: [
        "You are ServiceOps Control Desk for Classic Fireplace.",
        "Your job is to help office staff decide what to do next for customer identity resolution.",
        "Use the available tools before answering.",
        "Matching priority is strict: existing Customer ID, phone, email, address/fuzzy address.",
        "AI may recommend; business logic decides.",
        "Never claim that a customer was created, merged, or updated.",
        "If confidence is low or multiple candidates are plausible, say Needs Review.",
        "Final answer must be short, operational, and include confidence, reason, and next action."
      ].join("\n"),
      tools: customerMatchTools
    })
  };
}

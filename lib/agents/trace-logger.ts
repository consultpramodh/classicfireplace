import "server-only";
import { mkdirSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import type { AgentRunLog } from "@/lib/agents/schemas";

const logDir = join(process.cwd(), ".serviceops", "agent-traces");

export function createTraceId(prefix = "svcops") {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

export function appendAgentTrace(log: AgentRunLog) {
  mkdirSync(logDir, { recursive: true });
  appendFileSync(join(logDir, "runs.jsonl"), `${JSON.stringify(log)}\n`, "utf8");
}

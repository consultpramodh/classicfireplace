import { createHmac, timingSafeEqual } from "node:crypto";
import { NextRequest } from "next/server";
import { run } from "@openai/agents";
import { z } from "zod";
import { createServiceOpsAssistantAgent } from "@/lib/agents/serviceops-assistant-agent";
import {
  buildDeterministicToolResults,
  fallbackFinalResult,
  finalAssistantResultSchema,
  parseServiceOpsContext,
  type AssistantToolResult
} from "@/lib/agents/serviceops-assistant-tools";

export const runtime = "nodejs";

const streamRequestSchema = z.object({
  message: z.string().min(1),
  requestId: z.string().optional(),
  context: z.unknown().optional(),
  source: z.string().optional()
});

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-ServiceOps-Agent-Token",
  "Access-Control-Max-Age": "86400"
};

export function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export async function POST(request: NextRequest) {
  if (!verifyServiceOpsToken(request)) {
    return Response.json({ error: "Invalid or missing ServiceOps agent token." }, { status: 401, headers: corsHeaders });
  }

  if (!process.env.OPENAI_API_KEY) {
    return Response.json({ error: "OPENAI_API_KEY is not configured." }, { status: 503, headers: corsHeaders });
  }

  const parsed = streamRequestSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return Response.json({ error: "Invalid agent stream request." }, { status: 400, headers: corsHeaders });
  }

  const requestId = parsed.data.requestId || crypto.randomUUID();
  const context = {
    ...parseServiceOpsContext(parsed.data.context),
    requestId: parsed.data.requestId || parseServiceOpsContext(parsed.data.context).requestId
  };
  const modelStartedAt = Date.now();
  const deterministicResults = buildDeterministicToolResults(context, process.env.SERVICEOPS_ALLOWED_CALENDAR_DOMAIN || "@classicfireplace.ca");

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      const toolResults: AssistantToolResult[] = [];
      let sawTextDelta = false;

      try {
        send("tool_progress", { requestId, status: "started", tool: "serviceops_context", message: "Preparing ServiceOps request context." });
        for (const item of deterministicResults) {
          toolResults.push(item);
          send("tool_progress", { requestId, status: "completed", tool: item.tool, result: item.result });
        }

        const { agent, model } = createServiceOpsAssistantAgent(context);
        send("tool_progress", { requestId, status: "started", tool: "ServiceOpsAgent", message: `Running CF ServiceOps Assistant with ${model}.` });

        const result = await run(
          agent,
          JSON.stringify({
            operatorQuestion: parsed.data.message,
            selectedRequestId: parsed.data.requestId || context.requestId || null,
            source: parsed.data.source || "api",
            context,
            precomputedToolResults: toolResults
          }),
          { stream: true, maxTurns: 8 }
        );

        for await (const event of result) {
          if (event.type === "run_item_stream_event") {
            if (event.name === "tool_called") {
              const item = event.item as { rawItem?: { name?: string }; name?: string };
              send("tool_progress", { requestId, status: "started", tool: item.rawItem?.name || item.name || "tool" });
            }
            if (event.name === "tool_output") {
              const item = event.item as { rawItem?: { name?: string; output?: unknown }; output?: unknown };
              const tool = item.rawItem?.name || "tool";
              const output = item.rawItem?.output ?? item.output;
              toolResults.push({ tool, result: output });
              send("tool_progress", { requestId, status: "completed", tool, result: output });
            }
          }

          if (event.type === "raw_model_stream_event") {
            const raw = event.data as { type?: string; delta?: string };
            if (raw.type === "response.output_text.delta" && raw.delta) {
              sawTextDelta = true;
              send("text_delta", { requestId, delta: raw.delta });
            }
          }
        }

        await result.completed;
        const final = normalizeFinalResult(String(result.finalOutput || ""), parsed.data.message, context, toolResults);
        if (!sawTextDelta) {
          send("text_delta", { requestId, delta: final.summary || final.recommendedAction || "ServiceOps review completed." });
        }
        send("final", {
          requestId,
          model,
          latencyMs: Date.now() - modelStartedAt,
          ...final
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "ServiceOps agent failed.";
        send("error", { requestId, error: message });
        send("final", {
          requestId,
          model: process.env.OPENAI_MODEL_MAIN || "gpt-5.5",
          latencyMs: Date.now() - modelStartedAt,
          ...fallbackFinalResult(parsed.data.message, context, toolResults.length ? toolResults : deterministicResults)
        });
      } finally {
        controller.close();
      }
    }
  });

  return new Response(stream, {
    headers: {
      ...corsHeaders,
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive"
    }
  });
}

function normalizeFinalResult(raw: string, message: string, context: ReturnType<typeof parseServiceOpsContext>, toolResults: AssistantToolResult[]) {
  const parsedJson = parseJsonObject(raw);
  const parsed = finalAssistantResultSchema.safeParse(parsedJson);
  if (parsed.success) {
    return {
      ...parsed.data,
      toolResults: parsed.data.toolResults.length ? parsed.data.toolResults : toolResults
    };
  }

  return fallbackFinalResult(message, context, toolResults);
}

function parseJsonObject(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

function verifyServiceOpsToken(request: NextRequest) {
  const secret = process.env.SERVICEOPS_AGENT_SHARED_SECRET;
  if (!secret) return true;

  const token = request.headers.get("x-serviceops-agent-token") || "";
  const [timestamp, signature] = token.split(".");
  const time = Number(timestamp);
  if (!timestamp || !signature || !Number.isFinite(time)) return false;
  if (Math.abs(Date.now() - time) > 5 * 60 * 1000) return false;

  const expected = createHmac("sha256", secret).update(timestamp).digest("hex");
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

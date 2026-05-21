import { NextRequest } from "next/server";
import { run } from "@openai/agents";
import { z } from "zod";
import { createCustomerMatchAgent } from "@/lib/agents/serviceops-agent";
import { appendAgentTrace, createTraceId } from "@/lib/agents/trace-logger";
import { getCurrentIntakeRows } from "@/lib/serviceops/live-data";

export const runtime = "nodejs";

const requestSchema = z.object({
  sourceRow: z.number(),
  workflow: z.literal("customer_match").default("customer_match")
});

export async function POST(request: NextRequest) {
  if (!process.env.OPENAI_API_KEY) {
    return Response.json({ error: "OPENAI_API_KEY is not configured." }, { status: 503 });
  }

  const parsed = requestSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return Response.json({ error: "Invalid agent request." }, { status: 400 });
  }

  const intake = await getCurrentIntakeRows();
  const row = intake.rows.find((item) => item.sourceRow === parsed.data.sourceRow);
  if (!row) {
    return Response.json({ error: `No intake found for source row ${parsed.data.sourceRow}.` }, { status: 404 });
  }

  const traceId = createTraceId("customer-match");
  const started = Date.now();
  const startedAt = new Date(started).toISOString();
  const { agent, route } = createCustomerMatchAgent(Boolean(row.needsReview || row.lastError));

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      const trace = {
        traceId,
        intakeId: row.id,
        sourceRow: row.sourceRow,
        taskType: parsed.data.workflow,
        selectedModel: route.model,
        modelReason: route.reason,
        startedAt,
        toolResults: [] as { tool: string; ok: boolean; summary: string }[]
      };

      try {
        send("agent.started", {
          traceId,
          selectedModel: route.model,
          modelReason: route.reason,
          risk: route.risk
        });

        const result = await run(
          agent,
          `Run the customer identity workflow for sourceRow ${row.sourceRow}. Use tools and give a concise recommendation for office staff.`,
          { stream: true, maxTurns: 6 }
        );

        for await (const event of result) {
          if (event.type === "run_item_stream_event") {
            if (event.name === "tool_called") {
              const item = event.item as { rawItem?: { name?: string }; name?: string };
              send("tool.started", { traceId, tool: item.rawItem?.name || item.name || "tool" });
            }
            if (event.name === "tool_output") {
              const item = event.item as { rawItem?: { name?: string; output?: unknown }; output?: unknown };
              const tool = item.rawItem?.name || "tool";
              const summary = summarizeToolOutput(item.rawItem?.output ?? item.output);
              trace.toolResults.push({ tool, ok: !/error|false/i.test(summary), summary });
              send("tool.completed", { traceId, tool, summary });
            }
          }

          if (event.type === "raw_model_stream_event") {
            const raw = event.data as { type?: string; delta?: string };
            if (raw.type?.includes("delta") && raw.delta) {
              send("text.delta", { traceId, delta: raw.delta });
            }
          }
        }

        await result.completed;
        const finalOutput = String(result.finalOutput || "");
        if (finalOutput) send("agent.completed_text", { traceId, text: finalOutput });

        appendAgentTrace({
          ...trace,
          finishedAt: new Date().toISOString(),
          latencyMs: Date.now() - started,
          selectedAction: "customer_match_recommendation",
          skippedActionReason: finalOutput.includes("Needs Review") ? "Manual review required or recommended." : ""
        });

        send("agent.completed", {
          traceId,
          latencyMs: Date.now() - started,
          finalOutput
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Agent run failed.";
        appendAgentTrace({
          ...trace,
          finishedAt: new Date().toISOString(),
          latencyMs: Date.now() - started,
          selectedAction: "needs_review",
          skippedActionReason: message
        });
        send("agent.error", { traceId, error: message, fallback: "Needs Review" });
      } finally {
        controller.close();
      }
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive"
    }
  });
}

function summarizeToolOutput(value: unknown) {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return text.length > 280 ? `${text.slice(0, 280)}...` : text;
}

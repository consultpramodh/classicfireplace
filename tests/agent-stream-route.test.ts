import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@openai/agents", () => {
  class Agent {
    config: unknown;
    constructor(config: unknown) {
      this.config = config;
    }
  }

  async function run() {
    async function* events() {
      yield {
        type: "raw_model_stream_event",
        data: { type: "response.output_text.delta", delta: "{\"summary\":\"Reviewed\"," }
      };
      yield {
        type: "raw_model_stream_event",
        data: { type: "response.output_text.delta", delta: "\"recommendedAction\":\"Review manually\",\"riskLevel\":\"medium\",\"reasons\":[\"Test\"],\"nextSteps\":[\"Check customer\"],\"missingInformation\":[],\"suggestedCustomerMessage\":\"Please confirm details.\",\"suggestedInternalNote\":\"Internal note.\",\"toolResults\":[]}" }
      };
    }
    const stream = events();
    return Object.assign(stream, {
      completed: Promise.resolve(),
      finalOutput: "{\"summary\":\"Reviewed\",\"recommendedAction\":\"Review manually\",\"riskLevel\":\"medium\",\"reasons\":[\"Test\"],\"nextSteps\":[\"Check customer\"],\"missingInformation\":[],\"suggestedCustomerMessage\":\"Please confirm details.\",\"suggestedInternalNote\":\"Internal note.\",\"toolResults\":[]}"
    });
  }

  function tool(config: unknown) {
    return config;
  }

  return { Agent, run, tool };
});

describe("POST /api/agent/stream", () => {
  it("emits normalized ServiceOps stream events", async () => {
    const oldKey = process.env.OPENAI_API_KEY;
    const oldSecret = process.env.SERVICEOPS_AGENT_SHARED_SECRET;
    process.env.OPENAI_API_KEY = "test-key";
    delete process.env.SERVICEOPS_AGENT_SHARED_SECRET;

    const route = await import("../app/api/agent/stream/route");
    const response = await route.POST(new Request("http://localhost/api/agent/stream", {
      method: "POST",
      body: JSON.stringify({
        message: "Why is this in review?",
        requestId: "REQ-1044",
        context: {
          customerDisplay: "#NEW - Ron Metrick",
          issue: "Annual service",
          lane: "Review Queue",
          contact: { phone: "4165550100" },
          locationDisplay: "Scarborough"
        }
      })
    }) as never);

    const text = await response.text();
    expect(response.status).toBe(200);
    expect(text).toContain("event: tool_progress");
    expect(text).toContain("event: text_delta");
    expect(text).toContain("event: final");

    if (oldKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = oldKey;
    if (oldSecret === undefined) delete process.env.SERVICEOPS_AGENT_SHARED_SECRET;
    else process.env.SERVICEOPS_AGENT_SHARED_SECRET = oldSecret;
  });
});

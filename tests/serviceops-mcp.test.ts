import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

describe("CF ServiceOps MCP", () => {
  it("lists only safe business tools with explicit annotations and output schemas", async () => {
    const { handleServiceOpsMcpRequest } = await import("@/lib/mcp/serviceops-mcp");
    const response = await handleServiceOpsMcpRequest({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list"
    }) as { result: { tools: Array<{ name: string; inputSchema: unknown; outputSchema: unknown; annotations: unknown }> } };

    expect(response.result.tools.map((tool: { name: string }) => tool.name)).toEqual([
      "search_customer",
      "get_customer_summary",
      "get_open_service_requests",
      "get_work_order_summary",
      "get_technician_schedule",
      "create_service_opportunity_from_request"
    ]);
    for (const tool of response.result.tools) {
      expect(tool.inputSchema).toBeTruthy();
      expect(tool.outputSchema).toBeTruthy();
      expect(tool.annotations).toEqual({
        readOnlyHint: tool.name === "create_service_opportunity_from_request" ? false : true,
        openWorldHint: false,
        destructiveHint: false
      });
      expect(tool.name).not.toMatch(/sql|database|secret|admin/i);
    }
  });

  it("returns safe errors for unsupported tools", async () => {
    const { handleServiceOpsMcpRequest } = await import("@/lib/mcp/serviceops-mcp");
    const response = await handleServiceOpsMcpRequest({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: { name: "execute_sql", arguments: { sql: "select * from secrets" } }
    }) as { result: { isError: boolean; structuredContent: { error: string } } };

    expect(response.result.isError).toBe(true);
    expect(response.result.structuredContent.error).toContain("Unknown tool");
  });
});

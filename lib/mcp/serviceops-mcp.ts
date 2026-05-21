import { runServiceOpsMcpTool } from "@/lib/mcp/supabase-serviceops";
import { mcpInputJsonSchemas, mcpOutputJsonSchemas } from "@/lib/mcp/serviceops-schemas";

type JsonRpcRequest = {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
};

type ToolDescriptor = {
  name: string;
  title: string;
  description: string;
  inputSchema: object;
  outputSchema: object;
  annotations: {
    readOnlyHint: boolean;
    openWorldHint: boolean;
    destructiveHint: boolean;
  };
};

const outputSchema = mcpOutputJsonSchemas.okEnvelope;

export const serviceOpsMcpTools: ToolDescriptor[] = [
  {
    name: "search_customer",
    title: "Search Customers",
    description: "Use this when an operator needs to find cached Striven customers by name, email, phone, customer ID, or postal code.",
    inputSchema: mcpInputJsonSchemas.search_customer,
    outputSchema,
    annotations: { readOnlyHint: true, openWorldHint: false, destructiveHint: false }
  },
  {
    name: "get_customer_summary",
    title: "Get Customer Summary",
    description: "Use this when an operator needs a cached customer summary with locations, recent service requests, and recent work orders.",
    inputSchema: mcpInputJsonSchemas.get_customer_summary,
    outputSchema,
    annotations: { readOnlyHint: true, openWorldHint: false, destructiveHint: false }
  },
  {
    name: "get_open_service_requests",
    title: "Get Open Service Requests",
    description: "Use this when an operator needs open cached ServiceOps requests, optionally filtered by customer or status.",
    inputSchema: mcpInputJsonSchemas.get_open_service_requests,
    outputSchema,
    annotations: { readOnlyHint: true, openWorldHint: false, destructiveHint: false }
  },
  {
    name: "get_work_order_summary",
    title: "Get Work Order Summary",
    description: "Use this when an operator needs a cached Striven work order or sales order summary.",
    inputSchema: mcpInputJsonSchemas.get_work_order_summary,
    outputSchema,
    annotations: { readOnlyHint: true, openWorldHint: false, destructiveHint: false }
  },
  {
    name: "get_technician_schedule",
    title: "Get Technician Schedule",
    description: "Use this when an operator needs visible cached technician schedule events for a specific date.",
    inputSchema: mcpInputJsonSchemas.get_technician_schedule,
    outputSchema,
    annotations: { readOnlyHint: true, openWorldHint: false, destructiveHint: false }
  },
  {
    name: "create_service_opportunity_from_request",
    title: "Queue Service Opportunity",
    description: "Use this when an operator has resolved a request and wants to queue a service opportunity request for operator or Apps Script processing. This does not call Striven directly.",
    inputSchema: mcpInputJsonSchemas.create_service_opportunity_from_request,
    outputSchema,
    annotations: { readOnlyHint: false, openWorldHint: false, destructiveHint: false }
  }
];

export async function handleServiceOpsMcpRequest(payload: JsonRpcRequest | JsonRpcRequest[]) {
  if (Array.isArray(payload)) {
    return Promise.all(payload.map((item) => handleOne(item)));
  }
  return handleOne(payload);
}

async function handleOne(request: JsonRpcRequest) {
  const id = request?.id ?? null;
  const method = request?.method || "";

  try {
    if (method === "initialize") {
      return {
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: "2025-06-18",
          capabilities: {
            tools: { listChanged: false }
          },
          serverInfo: {
            name: "cf-serviceops-mcp",
            version: "0.1.0"
          }
        }
      };
    }

    if (method === "notifications/initialized") {
      return { jsonrpc: "2.0", id, result: {} };
    }

    if (method === "ping") {
      return { jsonrpc: "2.0", id, result: {} };
    }

    if (method === "tools/list") {
      return {
        jsonrpc: "2.0",
        id,
        result: {
          tools: serviceOpsMcpTools
        }
      };
    }

    if (method === "tools/call") {
      const name = String(request.params?.name || "");
      const args = request.params?.arguments || {};
      const tool = serviceOpsMcpTools.find((item) => item.name === name);
      if (!tool) {
        return toolError(id, `Unknown tool: ${name || "(missing)"}`);
      }
      const result = await runServiceOpsMcpTool(name, args);
      return {
        jsonrpc: "2.0",
        id,
        result: {
          structuredContent: result,
          content: [
            {
              type: "text",
              text: result.ok ? `ServiceOps tool ${name} completed.` : `ServiceOps tool ${name} failed: ${result.error}`
            }
          ],
          isError: !result.ok
        }
      };
    }

    return {
      jsonrpc: "2.0",
      id,
      error: {
        code: -32601,
        message: `Unsupported MCP method: ${method || "(missing)"}`
      }
    };
  } catch (error) {
    return toolError(id, error instanceof Error ? error.message : "ServiceOps MCP request failed.");
  }
}

function toolError(id: JsonRpcRequest["id"], message: string) {
  return {
    jsonrpc: "2.0",
    id,
    result: {
      structuredContent: { ok: false, error: message },
      content: [{ type: "text", text: message }],
      isError: true
    }
  };
}

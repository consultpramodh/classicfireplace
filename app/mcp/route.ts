import { handleServiceOpsMcpRequest, serviceOpsMcpTools } from "@/lib/mcp/serviceops-mcp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, MCP-Protocol-Version",
  "Access-Control-Max-Age": "86400"
};

export function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export function GET() {
  return Response.json({
    ok: true,
    service: "CF ServiceOps MCP",
    transport: "json-rpc-http",
    tools: serviceOpsMcpTools.map((tool) => tool.name)
  }, { headers: corsHeaders });
}

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null);
  if (!payload) {
    return Response.json({
      jsonrpc: "2.0",
      id: null,
      error: { code: -32700, message: "Invalid JSON body." }
    }, { status: 400, headers: corsHeaders });
  }

  const result = await handleServiceOpsMcpRequest(payload);
  return Response.json(result, {
    headers: {
      ...corsHeaders,
      "Cache-Control": "no-store"
    }
  });
}

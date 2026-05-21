import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  createServiceOpportunityFromRequestInputSchema,
  getCustomerSummaryInputSchema,
  getOpenServiceRequestsInputSchema,
  getTechnicianScheduleInputSchema,
  getWorkOrderSummaryInputSchema,
  searchCustomerInputSchema
} from "@/lib/mcp/serviceops-schemas";
import { normalizePhone10, safeText } from "@/lib/serviceops/normalization";

type ToolAuditInput = {
  toolName: string;
  input: unknown;
  ok: boolean;
  resultSummary: string;
  errorMessage?: string;
  actor?: string;
};

type ServiceOpsToolResult = {
  ok: boolean;
  data?: unknown;
  error?: string;
};

const PUBLIC_RESULT_LIMIT = 25;

let cachedClient: SupabaseClient | null = null;

function getSupabase() {
  if (cachedClient) return cachedClient;
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Supabase server configuration is missing.");
  }

  cachedClient = createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
  return cachedClient;
}

export async function runServiceOpsMcpTool(toolName: string, input: unknown): Promise<ServiceOpsToolResult> {
  try {
    let result: ServiceOpsToolResult;
    if (toolName === "search_customer") result = await searchCustomer(input);
    else if (toolName === "get_customer_summary") result = await getCustomerSummary(input);
    else if (toolName === "get_open_service_requests") result = await getOpenServiceRequests(input);
    else if (toolName === "get_work_order_summary") result = await getWorkOrderSummary(input);
    else if (toolName === "get_technician_schedule") result = await getTechnicianSchedule(input);
    else if (toolName === "create_service_opportunity_from_request") result = await createServiceOpportunityFromRequest(input);
    else result = { ok: false, error: `Unsupported ServiceOps tool: ${toolName}` };

    await writeToolAudit({
      toolName,
      input,
      ok: result.ok,
      resultSummary: summarizeResult(result),
      errorMessage: result.error || ""
    });
    return result;
  } catch (error) {
    const message = safeErrorMessage(error);
    await writeToolAudit({
      toolName,
      input,
      ok: false,
      resultSummary: "Tool failed safely before returning business data.",
      errorMessage: message
    }).catch(() => undefined);
    return { ok: false, error: message };
  }
}

async function searchCustomer(input: unknown): Promise<ServiceOpsToolResult> {
  const parsed = searchCustomerInputSchema.safeParse(input);
  if (!parsed.success) return invalidInput(parsed.error.message);
  const { query, limit } = parsed.data;
  const supabase = getSupabase();
  const normalizedPhone = normalizePhone10(query);
  const text = `%${escapeIlike(query)}%`;

  let request = supabase
    .from("serviceops_customers")
    .select("customer_id, customer_number, display_name, email, phone, alt_phone, street, city, postal_code, updated_at")
    .limit(Math.min(limit, PUBLIC_RESULT_LIMIT));

  if (/^\d+$/.test(query.trim())) {
    request = request.or(`customer_id.eq.${query.trim()},customer_number.ilike.${text},phone.ilike.%${normalizedPhone || query.trim()}%,alt_phone.ilike.%${normalizedPhone || query.trim()}%`);
  } else {
    request = request.or(`display_name.ilike.${text},email.ilike.${text},phone.ilike.%${normalizedPhone || escapeIlike(query)}%,alt_phone.ilike.%${normalizedPhone || escapeIlike(query)}%,postal_code.ilike.${text}`);
  }

  const { data, error } = await request;
  if (error) throw error;
  return {
    ok: true,
    data: {
      query,
      count: data?.length || 0,
      customers: (data || []).map(redactCustomer)
    }
  };
}

async function getCustomerSummary(input: unknown): Promise<ServiceOpsToolResult> {
  const parsed = getCustomerSummaryInputSchema.safeParse(input);
  if (!parsed.success) return invalidInput(parsed.error.message);
  const { customerId } = parsed.data;
  const supabase = getSupabase();

  const [customer, locations, requests, workOrders] = await Promise.all([
    supabase.from("serviceops_customers").select("customer_id, customer_number, display_name, email, phone, alt_phone, street, city, postal_code, updated_at").eq("customer_id", customerId).maybeSingle(),
    supabase.from("serviceops_customer_locations").select("location_id, customer_id, name, street, city, province, postal_code, updated_at").eq("customer_id", customerId).limit(10),
    supabase.from("serviceops_service_requests").select("request_id, source_row, submitted_at, status, pipeline_state, issue, appliance, city, postal_code, striven_customer_id, striven_opportunity_id, striven_sales_order_id").eq("striven_customer_id", customerId).order("submitted_at", { ascending: false }).limit(10),
    supabase.from("serviceops_work_orders").select("work_order_id, sales_order_number, customer_id, status, created_at, scheduled_at, technician, title").eq("customer_id", customerId).order("created_at", { ascending: false }).limit(10)
  ]);

  if (customer.error) throw customer.error;
  if (locations.error) throw locations.error;
  if (requests.error) throw requests.error;
  if (workOrders.error) throw workOrders.error;
  if (!customer.data) return { ok: false, error: "Customer was not found in the ServiceOps cache." };

  return {
    ok: true,
    data: {
      customer: redactCustomer(customer.data),
      locations: locations.data || [],
      recentRequests: requests.data || [],
      recentWorkOrders: workOrders.data || [],
      sourceOfRecord: "Striven remains the system of record; this is a Supabase operational cache."
    }
  };
}

async function getOpenServiceRequests(input: unknown): Promise<ServiceOpsToolResult> {
  const parsed = getOpenServiceRequestsInputSchema.safeParse(input);
  if (!parsed.success) return invalidInput(parsed.error.message);
  const { customerId, status, limit } = parsed.data;
  const supabase = getSupabase();

  let request = supabase
    .from("serviceops_service_requests")
    .select("request_id, source_row, submitted_at, status, pipeline_state, customer_name, striven_customer_id, issue, appliance, city, postal_code, needs_review, last_error, striven_opportunity_id, striven_sales_order_id")
    .is("closed_at", null)
    .order("submitted_at", { ascending: false })
    .limit(Math.min(limit || 10, PUBLIC_RESULT_LIMIT));

  if (customerId) request = request.eq("striven_customer_id", customerId);
  if (status) request = request.ilike("status", `%${escapeIlike(status)}%`);

  const { data, error } = await request;
  if (error) throw error;
  return {
    ok: true,
    data: {
      count: data?.length || 0,
      requests: data || []
    }
  };
}

async function getWorkOrderSummary(input: unknown): Promise<ServiceOpsToolResult> {
  const parsed = getWorkOrderSummaryInputSchema.safeParse(input);
  if (!parsed.success) return invalidInput(parsed.error.message);
  const supabase = getSupabase();

  let request = supabase
    .from("serviceops_work_orders")
    .select("work_order_id, sales_order_number, customer_id, customer_name, status, created_at, scheduled_at, technician, title, location, summary, updated_at")
    .limit(1);

  if (parsed.data.workOrderId) request = request.eq("work_order_id", parsed.data.workOrderId);
  else request = request.eq("sales_order_number", parsed.data.salesOrderNumber);

  const { data, error } = await request;
  if (error) throw error;
  const workOrder = data?.[0];
  if (!workOrder) return { ok: false, error: "Work order was not found in the ServiceOps cache." };
  return {
    ok: true,
    data: {
      workOrder,
      sourceOfRecord: "Striven remains the system of record; this is a cached operational summary."
    }
  };
}

async function getTechnicianSchedule(input: unknown): Promise<ServiceOpsToolResult> {
  const parsed = getTechnicianScheduleInputSchema.safeParse(input);
  if (!parsed.success) return invalidInput(parsed.error.message);
  const { technician, date } = parsed.data;
  const supabase = getSupabase();
  const start = `${date}T00:00:00`;
  const end = `${date}T23:59:59`;

  let request = supabase
    .from("serviceops_technician_schedule")
    .select("event_id, technician, title, location, start_at, end_at, source, visible_to_serviceops, work_order_id, sales_order_number")
    .eq("visible_to_serviceops", true)
    .gte("start_at", start)
    .lte("start_at", end)
    .order("start_at", { ascending: true })
    .limit(PUBLIC_RESULT_LIMIT);

  if (technician) request = request.ilike("technician", `%${escapeIlike(technician)}%`);

  const { data, error } = await request;
  if (error) throw error;
  return {
    ok: true,
    data: {
      date,
      technician: technician || "all",
      events: data || [],
      calendarPolicy: "Only events marked visible_to_serviceops are returned."
    }
  };
}

async function createServiceOpportunityFromRequest(input: unknown): Promise<ServiceOpsToolResult> {
  const parsed = createServiceOpportunityFromRequestInputSchema.safeParse(input);
  if (!parsed.success) return invalidInput(parsed.error.message);
  const { requestId, customerId, operatorNote, dryRun } = parsed.data;
  const supabase = getSupabase();

  const { data: requestRow, error } = await supabase
    .from("serviceops_service_requests")
    .select("request_id, source_row, submitted_at, status, pipeline_state, customer_name, striven_customer_id, issue, appliance, city, postal_code, needs_review, last_error, striven_opportunity_id")
    .eq("request_id", requestId)
    .maybeSingle();

  if (error) throw error;
  if (!requestRow) return { ok: false, error: "Service request was not found in the ServiceOps cache." };
  if (safeText(requestRow.striven_opportunity_id)) {
    return { ok: false, error: "This request already has a Striven opportunity ID in the cache." };
  }
  if (safeText(requestRow.striven_customer_id) && safeText(requestRow.striven_customer_id) !== customerId) {
    return { ok: false, error: "The provided customer ID does not match the cached request customer ID." };
  }
  if (requestRow.needs_review || safeText(requestRow.last_error)) {
    return { ok: false, error: "This request still needs operator review before an opportunity can be queued." };
  }

  const payload = {
    request_id: requestId,
    source_row: requestRow.source_row,
    customer_id: customerId,
    status: dryRun ? "dry_run" : "pending_operator_review",
    operator_note: operatorNote || "",
    payload: {
      customerId,
      issue: requestRow.issue,
      appliance: requestRow.appliance,
      city: requestRow.city,
      postalCode: requestRow.postal_code,
      source: "chatgpt_app_mcp"
    }
  };

  if (dryRun) {
    return {
      ok: true,
      data: {
        queued: false,
        dryRun: true,
        opportunityRequest: payload,
        message: "Validated only. No Supabase queue row was written and Striven was not called."
      }
    };
  }

  const { data, error: insertError } = await supabase
    .from("serviceops_opportunity_requests")
    .insert(payload)
    .select("id, request_id, customer_id, status, created_at")
    .single();
  if (insertError) throw insertError;

  return {
    ok: true,
    data: {
      queued: true,
      opportunityRequest: data,
      message: "Queued for operator/Apps Script processing. Striven was not called by ChatGPT."
    }
  };
}

async function writeToolAudit(input: ToolAuditInput) {
  const supabase = getSupabase();
  await supabase.from("tool_audit_log").insert({
    tool_name: input.toolName,
    actor: input.actor || "chatgpt_app",
    input: redactAuditInput(input.input),
    ok: input.ok,
    result_summary: input.resultSummary.slice(0, 1000),
    error_message: (input.errorMessage || "").slice(0, 1000)
  });
}

function invalidInput(message: string): ServiceOpsToolResult {
  return { ok: false, error: `Invalid input: ${message}` };
}

function safeErrorMessage(error: unknown) {
  const raw = error instanceof Error ? error.message : String(error || "Unknown error");
  if (/SUPABASE_SERVICE_ROLE_KEY|STRIVEN_CLIENT_SECRET|OPENAI_API_KEY|password|secret/i.test(raw)) {
    return "The tool failed because a server-side configuration or upstream service error occurred.";
  }
  return raw.slice(0, 500);
}

function summarizeResult(result: ServiceOpsToolResult) {
  if (!result.ok) return result.error || "Tool returned an error.";
  const text = JSON.stringify(result.data || {});
  return text.length > 1000 ? `${text.slice(0, 997)}...` : text;
}

function redactCustomer(row: Record<string, unknown>) {
  return {
    customerId: row.customer_id,
    customerNumber: row.customer_number,
    displayName: row.display_name,
    email: row.email,
    phone: row.phone,
    altPhone: row.alt_phone,
    street: row.street,
    city: row.city,
    postalCode: row.postal_code,
    updatedAt: row.updated_at
  };
}

function redactAuditInput(input: unknown) {
  if (!input || typeof input !== "object") return input;
  const copy = { ...(input as Record<string, unknown>) };
  for (const key of Object.keys(copy)) {
    if (/secret|token|key|password/i.test(key)) copy[key] = "[REDACTED]";
  }
  return copy;
}

function escapeIlike(value: string) {
  return value.replace(/[%_*]/g, "").trim();
}

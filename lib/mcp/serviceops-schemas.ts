import { z } from "zod";

export const searchCustomerInputSchema = z.object({
  query: z.string().trim().min(2).max(120).describe("Customer name, email, phone, customer ID, or postal code."),
  limit: z.number().int().min(1).max(10).default(5).describe("Maximum number of matching customers to return.")
});

export const getCustomerSummaryInputSchema = z.object({
  customerId: z.string().trim().min(1).max(40).describe("Striven customer ID from cached ServiceOps customer data.")
});

export const getOpenServiceRequestsInputSchema = z.object({
  customerId: z.string().trim().min(1).max(40).optional().describe("Optional Striven customer ID to filter requests."),
  status: z.string().trim().max(80).optional().describe("Optional request status or queue/lane filter."),
  limit: z.number().int().min(1).max(25).default(10).describe("Maximum number of open requests to return.")
});

export const getWorkOrderSummaryInputSchema = z.object({
  workOrderId: z.string().trim().min(1).max(60).optional().describe("Work order or sales order ID."),
  salesOrderNumber: z.string().trim().min(1).max(60).optional().describe("Sales order number such as SO-55091.")
}).refine((value) => value.workOrderId || value.salesOrderNumber, {
  message: "Provide either workOrderId or salesOrderNumber."
});

export const getTechnicianScheduleInputSchema = z.object({
  technician: z.string().trim().max(120).optional().describe("Optional technician name."),
  date: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).describe("Schedule date in YYYY-MM-DD format."),
  includeHidden: z.boolean().default(false).describe("Always false for ChatGPT App calls; hidden calendar events are never returned.")
});

export const createServiceOpportunityFromRequestInputSchema = z.object({
  requestId: z.string().trim().min(1).max(80).describe("Cached ServiceOps request ID."),
  customerId: z.string().trim().min(1).max(40).describe("Resolved Striven customer ID."),
  operatorNote: z.string().trim().max(1000).optional().describe("Operator-reviewed note to attach to the opportunity request."),
  dryRun: z.boolean().default(true).describe("When true, validates readiness and returns the queued opportunity payload without writing.")
});

export const mcpInputJsonSchemas = {
  search_customer: {
    type: "object",
    additionalProperties: false,
    properties: {
      query: { type: "string", minLength: 2, maxLength: 120, description: "Customer name, email, phone, customer ID, or postal code." },
      limit: { type: "integer", minimum: 1, maximum: 10, default: 5 }
    },
    required: ["query"]
  },
  get_customer_summary: {
    type: "object",
    additionalProperties: false,
    properties: {
      customerId: { type: "string", minLength: 1, maxLength: 40 }
    },
    required: ["customerId"]
  },
  get_open_service_requests: {
    type: "object",
    additionalProperties: false,
    properties: {
      customerId: { type: "string", minLength: 1, maxLength: 40 },
      status: { type: "string", maxLength: 80 },
      limit: { type: "integer", minimum: 1, maximum: 25, default: 10 }
    }
  },
  get_work_order_summary: {
    type: "object",
    additionalProperties: false,
    properties: {
      workOrderId: { type: "string", minLength: 1, maxLength: 60 },
      salesOrderNumber: { type: "string", minLength: 1, maxLength: 60 }
    },
    anyOf: [{ required: ["workOrderId"] }, { required: ["salesOrderNumber"] }]
  },
  get_technician_schedule: {
    type: "object",
    additionalProperties: false,
    properties: {
      technician: { type: "string", maxLength: 120 },
      date: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
      includeHidden: { type: "boolean", default: false }
    },
    required: ["date"]
  },
  create_service_opportunity_from_request: {
    type: "object",
    additionalProperties: false,
    properties: {
      requestId: { type: "string", minLength: 1, maxLength: 80 },
      customerId: { type: "string", minLength: 1, maxLength: 40 },
      operatorNote: { type: "string", maxLength: 1000 },
      dryRun: { type: "boolean", default: true }
    },
    required: ["requestId", "customerId"]
  }
} as const;

export const mcpOutputJsonSchemas = {
  okEnvelope: {
    type: "object",
    additionalProperties: true,
    properties: {
      ok: { type: "boolean" },
      data: { type: "object" },
      error: { type: "string" }
    },
    required: ["ok"]
  }
} as const;

import "server-only";
import { tool } from "@openai/agents";
import { z } from "zod";
import { demoCustomers } from "@/lib/data/demo-data";
import { getCachedReportRows } from "@/lib/serviceops/snapshots";
import { getCurrentIntakeRows } from "@/lib/serviceops/live-data";
import { normalizeCustomerReportRows } from "@/lib/striven/reports";
import { getEnv } from "@/lib/config/serviceops-config";
import { recommendCustomerMatch } from "@/lib/agents/customer-match";
import { getCustomerHistory } from "@/lib/serviceops/customer-history";

const sourceRowSchema = z.object({
  sourceRow: z.number().describe("The webform source row number for the intake.")
});

const customerHistorySchema = z.object({
  customerId: z.string().describe("The Striven customer/account ID.")
});

export const extractServiceRequest = tool({
  name: "extractServiceRequest",
  description: "Load one webform intake from the local SQLite/cache source by source row. This is read-only.",
  parameters: sourceRowSchema,
  strict: true,
  timeoutMs: 8000,
  execute: async ({ sourceRow }) => {
    const intake = await getCurrentIntakeRows();
    const row = intake.rows.find((item) => item.sourceRow === sourceRow);
    if (!row) return { ok: false, error: `No intake found for source row ${sourceRow}.` };
    return {
      ok: true,
      intake: {
        id: row.id,
        sourceRow: row.sourceRow,
        submittedAt: row.submittedAt,
        name: [row.firstName, row.lastName].filter(Boolean).join(" "),
        phone: row.phone,
        altPhone: row.altPhone,
        email: row.email,
        address: [row.street, row.city, row.province, row.postalCode].filter(Boolean).join(", "),
        preferredDays: row.preferredDays,
        makeModelAge: row.makeModelAge,
        details: row.details,
        anythingElse: row.anythingElse,
        strivenCustomerId: row.strivenCustomerId,
        needsReview: row.needsReview,
        lastError: row.lastError
      }
    };
  }
});

export const validateIntakeCompleteness = tool({
  name: "validateIntakeCompleteness",
  description: "Check whether the intake has enough identity and service information. Deterministic and read-only.",
  parameters: sourceRowSchema,
  strict: true,
  timeoutMs: 8000,
  execute: async ({ sourceRow }) => {
    const intake = await getCurrentIntakeRows();
    const row = intake.rows.find((item) => item.sourceRow === sourceRow);
    if (!row) return { ok: false, error: `No intake found for source row ${sourceRow}.` };
    const missing = [
      ["Name", [row.firstName, row.lastName].filter(Boolean).join(" ")],
      ["Phone or Email", row.phone || row.email],
      ["Street", row.street],
      ["City", row.city],
      ["Preferred Days", row.preferredDays],
      ["Make/Model/Age", row.makeModelAge],
      ["Details", row.details || row.anythingElse]
    ]
      .filter(([, value]) => !String(value || "").trim())
      .map(([label]) => label);
    return {
      ok: true,
      complete: missing.length === 0,
      missing,
      needsReview: missing.includes("Phone or Email") || missing.includes("Street") || missing.includes("Details")
    };
  }
});

export const matchCustomerCandidates = tool({
  name: "matchCustomerCandidates",
  description: "Find and score customer candidates in strict identity order. AI must not auto-merge uncertain matches. Read-only.",
  parameters: sourceRowSchema,
  strict: true,
  timeoutMs: 12000,
  execute: async ({ sourceRow }) => {
    const intake = await getCurrentIntakeRows();
    const row = intake.rows.find((item) => item.sourceRow === sourceRow);
    if (!row) return { ok: false, error: `No intake found for source row ${sourceRow}.` };

    const customers = getEnv().demoMode
      ? demoCustomers
      : normalizeCustomerReportRows(getCachedReportRows("customers").rows);
    const recommendation = recommendCustomerMatch(row, customers);
    return { ok: true, recommendation };
  }
});

export const scoreCustomerMatchConfidence = tool({
  name: "scoreCustomerMatchConfidence",
  description: "Return final deterministic customer-match confidence and manual-review status for one intake. Read-only.",
  parameters: sourceRowSchema,
  strict: true,
  timeoutMs: 12000,
  execute: async ({ sourceRow }) => {
    const intake = await getCurrentIntakeRows();
    const row = intake.rows.find((item) => item.sourceRow === sourceRow);
    if (!row) return { ok: false, error: `No intake found for source row ${sourceRow}.` };
    const customers = getEnv().demoMode
      ? demoCustomers
      : normalizeCustomerReportRows(getCachedReportRows("customers").rows);
    const recommendation = recommendCustomerMatch(row, customers);
    return {
      ok: true,
      status: recommendation.status,
      confidence: recommendation.confidence,
      selectedCustomerId: recommendation.selectedCustomerId,
      skippedActionReason: recommendation.skippedActionReason,
      nextAction: recommendation.nextAction
    };
  }
});

export const loadCustomerPreviousBusiness = tool({
  name: "loadCustomerPreviousBusiness",
  description: "Load prior invoices, assets, serial numbers, installation tasks, service orders, and asset history from local ServiceOps report snapshots. Read-only.",
  parameters: customerHistorySchema,
  strict: true,
  timeoutMs: 12000,
  execute: async ({ customerId }) => {
    const history = getCustomerHistory({ customerId });
    return {
      ok: true,
      history: {
        ...history,
        invoices: history.invoices.slice(0, 30),
        installationTasks: history.installationTasks.slice(0, 30),
        serviceOrders: history.serviceOrders.slice(0, 30),
        assets: history.assets.slice(0, 30)
      }
    };
  }
});

export const customerMatchTools = [
  extractServiceRequest,
  validateIntakeCompleteness,
  matchCustomerCandidates,
  scoreCustomerMatchConfidence,
  loadCustomerPreviousBusiness
];

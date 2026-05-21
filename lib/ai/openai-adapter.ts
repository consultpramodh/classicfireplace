/*
 * 012_OpenAI_Adapter.ts
 * Server-only Responses API helper. OpenAI is assistive, never source-of-record.
 *
 * Verified from OpenAI docs:
 * - GPT-5.5 works best in the Responses API.
 * - Use reasoning.effort for reasoning models.
 * - Use Structured Outputs with text.format for schema adherence.
 */

import "server-only";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import { getEnv } from "@/lib/config/serviceops-config";
import type { IntakeRow } from "@/lib/serviceops/types";

const IntakeRecommendation = z.object({
  summary: z.string(),
  issueType: z.enum(["clean_service", "repair", "installation_question", "parts", "unknown"]),
  missingInformation: z.array(z.string()),
  reviewNotes: z.string(),
  nextBestAction: z.enum([
    "resolve_customer",
    "create_opportunity",
    "check_opportunity_stage",
    "create_sales_order",
    "rebuild_profile",
    "mark_reviewed",
    "manual_review"
  ]),
  confidence: z.number().min(0).max(1)
});

export type IntakeRecommendation = z.infer<typeof IntakeRecommendation>;

export async function recommendNextAction(row: IntakeRow): Promise<IntakeRecommendation> {
  const env = getEnv();

  if (!env.openaiApiKey) {
    return {
      summary: `${row.firstName} ${row.lastName}`.trim() || "Service intake",
      issueType: "unknown",
      missingInformation: [row.makeModelAge ? "" : "Make/Model/Age"].filter(Boolean),
      reviewNotes: "OpenAI is not configured. Using deterministic fallback.",
      nextBestAction: row.needsReview ? "manual_review" : "check_opportunity_stage",
      confidence: 0.2
    };
  }

  const client = new OpenAI({ apiKey: env.openaiApiKey });
  const reasoningEffort = process.env.OPENAI_SERVICEOPS_REASONING_EFFORT || "low";
  const response = await client.responses.parse({
    model: process.env.OPENAI_SERVICEOPS_MODEL || "gpt-5.5",
    reasoning: { effort: reasoningEffort as never },
    input: [
      {
        role: "system",
        content: "You assist internal fireplace service operations. Return concise, practical JSON that follows the schema."
      },
      {
        role: "user",
        content: JSON.stringify({
          intake: row,
          rules: [
            "Do not treat OpenAI as source of record.",
            "Sales orders require stage Service Work Order Created.",
            "Missing location or identity should become manual review."
          ]
        })
      }
    ],
    text: {
      format: zodTextFormat(IntakeRecommendation, "serviceops_intake_recommendation"),
      verbosity: "low"
    }
  });

  for (const output of response.output) {
    if (output.type !== "message") continue;
    for (const item of output.content) {
      if (item.type === "refusal") {
        throw new Error(`OpenAI refusal: ${item.refusal}`);
      }
      if ("parsed" in item && item.parsed) {
        return item.parsed as IntakeRecommendation;
      }
    }
  }

  throw new Error("OpenAI response did not include a parsed recommendation.");
}

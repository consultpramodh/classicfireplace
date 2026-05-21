import { z } from "zod";

export const CandidateMatchSchema = z.object({
  customerId: z.number(),
  customerNumber: z.string().optional(),
  name: z.string().optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
  altPhone: z.string().optional(),
  street: z.string().optional(),
  city: z.string().optional(),
  postalCode: z.string().optional(),
  score: z.number().min(0).max(100),
  confidence: z.number().min(0).max(1),
  matchSignals: z.array(z.string()),
  riskSignals: z.array(z.string())
});

export const CustomerMatchRecommendationSchema = z.object({
  intakeId: z.string(),
  sourceRow: z.number(),
  status: z.enum(["safe_match", "needs_review", "create_new_candidate"]),
  confidence: z.number().min(0).max(1),
  selectedCustomerId: z.number().nullable(),
  matchReason: z.string(),
  skippedActionReason: z.string(),
  candidates: z.array(CandidateMatchSchema),
  missingIdentityFields: z.array(z.string()),
  assumptions: z.array(z.string()),
  nextAction: z.string(),
  auditSummary: z.string()
});

export type CustomerMatchRecommendation = z.infer<typeof CustomerMatchRecommendationSchema>;
export type CandidateMatch = z.infer<typeof CandidateMatchSchema>;

export const AgentRunLogSchema = z.object({
  traceId: z.string(),
  intakeId: z.string(),
  sourceRow: z.number(),
  taskType: z.string(),
  selectedModel: z.string(),
  modelReason: z.string(),
  startedAt: z.string(),
  finishedAt: z.string().optional(),
  latencyMs: z.number().optional(),
  confidence: z.number().optional(),
  selectedAction: z.string().optional(),
  skippedActionReason: z.string().optional(),
  toolResults: z.array(z.object({
    tool: z.string(),
    ok: z.boolean(),
    summary: z.string()
  })).default([])
});

export type AgentRunLog = z.infer<typeof AgentRunLogSchema>;

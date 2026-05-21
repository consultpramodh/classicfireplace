import { tool } from "@openai/agents";
import { z } from "zod";

export type ServiceOpsContext = {
  requestId?: string;
  customerId?: string | null;
  customerDisplay?: string;
  locationDisplay?: string;
  applianceDisplay?: string;
  issue?: string;
  lane?: string;
  matchConfidence?: number;
  warnings?: string[];
  contact?: {
    phone?: string;
    altPhone?: string;
    email?: string;
  };
  address?: {
    street?: string;
    city?: string;
    province?: string;
    postalCode?: string;
  };
  raw?: Record<string, unknown>;
  candidates?: CustomerCandidate[];
  serviceHistory?: Array<Record<string, unknown>>;
  calendarEvent?: CalendarEventContext;
};

export type CustomerCandidate = {
  customerId?: string | number;
  name?: string;
  email?: string;
  phone?: string;
  altPhone?: string;
  address?: string;
  street?: string;
  postalCode?: string;
  signals?: string[];
  hasExistingWorkOrderAtAddress?: boolean;
  hasExistingAssetAtAddress?: boolean;
};

export type CalendarEventContext = {
  technician?: string;
  startDateTime?: string;
  endDateTime?: string;
  creatorEmail?: string;
  organizerEmail?: string;
  title?: string;
  location?: string;
};

export type AssistantToolResult = {
  tool: string;
  result: unknown;
};

const contextSchema = z.object({
  requestId: z.string().optional(),
  customerId: z.union([z.string(), z.null()]).optional(),
  customerDisplay: z.string().optional(),
  locationDisplay: z.string().optional(),
  applianceDisplay: z.string().optional(),
  issue: z.string().optional(),
  lane: z.string().optional(),
  matchConfidence: z.number().optional(),
  warnings: z.array(z.string()).optional(),
  contact: z.object({
    phone: z.string().optional(),
    altPhone: z.string().optional(),
    email: z.string().optional()
  }).optional(),
  address: z.object({
    street: z.string().optional(),
    city: z.string().optional(),
    province: z.string().optional(),
    postalCode: z.string().optional()
  }).optional(),
  raw: z.record(z.string(), z.unknown()).optional(),
  candidates: z.array(z.object({
    customerId: z.union([z.string(), z.number()]).optional(),
    name: z.string().optional(),
    email: z.string().optional(),
    phone: z.string().optional(),
    altPhone: z.string().optional(),
    address: z.string().optional(),
    street: z.string().optional(),
    postalCode: z.string().optional(),
    signals: z.array(z.string()).optional(),
    hasExistingWorkOrderAtAddress: z.boolean().optional(),
    hasExistingAssetAtAddress: z.boolean().optional()
  })).optional(),
  serviceHistory: z.array(z.record(z.string(), z.unknown())).optional(),
  calendarEvent: z.object({
    technician: z.string().optional(),
    startDateTime: z.string().optional(),
    endDateTime: z.string().optional(),
    creatorEmail: z.string().optional(),
    organizerEmail: z.string().optional(),
    title: z.string().optional(),
    location: z.string().optional()
  }).optional()
});

export const finalAssistantResultSchema = z.object({
  summary: z.string(),
  recommendedAction: z.string(),
  riskLevel: z.enum(["low", "medium", "high"]),
  reasons: z.array(z.string()),
  nextSteps: z.array(z.string()),
  missingInformation: z.array(z.string()),
  suggestedCustomerMessage: z.string(),
  suggestedInternalNote: z.string(),
  toolResults: z.array(z.unknown())
});

export type FinalAssistantResult = z.infer<typeof finalAssistantResultSchema>;

export function extractRequestFactsFromContext(context: ServiceOpsContext) {
  const text = [
    context.issue,
    context.applianceDisplay,
    String(context.raw?.details || ""),
    String(context.raw?.anythingElse || "")
  ].join(" ").toLowerCase();

  const manufacturer = matchFirst(text, ["napoleon", "regency", "valor", "majestic", "heatilator", "heat n glo", "continental"]);
  const urgency = /gas smell|carbon monoxide|co alarm|leak|unsafe|emergency/.test(text)
    ? "high"
    : /no heat|will not light|pilot|ignite|shutdown|flame/.test(text)
      ? "medium"
      : "normal";
  const issueType = /annual|maintenance|clean|service/.test(text)
    ? "maintenance"
    : /pilot|ignite|flame|light/.test(text)
      ? "ignition"
      : /remote|receiver|switch|battery/.test(text)
        ? "controls"
        : /fan|blower|noise|rattle/.test(text)
          ? "blower"
          : "general service";
  const missingFields = missingInformation(context);

  return {
    issueType,
    applianceType: /gas|fireplace|insert|stove/.test(text) ? "gas fireplace" : "unknown",
    manufacturer: manufacturer || "",
    model: extractModel(context.applianceDisplay || text),
    ageRange: extractAgeRange(context.applianceDisplay || text),
    urgency,
    customerIntent: /annual|maintenance|clean/.test(text) ? "routine service" : "diagnosis or service request",
    missingFields
  };
}

export function scoreCustomerMatchFromContext(context: ServiceOpsContext) {
  const candidates = context.candidates?.length ? context.candidates : [{
    customerId: context.customerId || undefined,
    name: context.customerDisplay,
    email: context.contact?.email,
    phone: context.contact?.phone,
    address: context.locationDisplay
  }];

  const scored = candidates.map((candidate) => {
    const matchedSignals: string[] = [];
    const conflictingSignals: string[] = [];
    let score = 0;
    const candidateSignals = candidate.signals || [];

    if (candidateSignals.some((signal) => /exact email/i.test(signal)) || sameEmail(context.contact?.email, candidate.email)) {
      score += 50;
      matchedSignals.push("Exact Email");
    }
    if (candidateSignals.some((signal) => /exact phone|primary phone/i.test(signal)) || samePhone(context.contact?.phone, candidate.phone)) {
      score += 45;
      matchedSignals.push("Exact Phone");
    }
    if (candidateSignals.some((signal) => /alt phone/i.test(signal)) || samePhone(context.contact?.altPhone, candidate.altPhone)) {
      score += 35;
      matchedSignals.push("Exact Alt Phone");
    }
    if (candidateSignals.some((signal) => /exact address/i.test(signal)) || sameAddress(context.locationDisplay, candidate.address || candidate.street)) {
      score += 55;
      matchedSignals.push("Exact Address");
    }
    if (candidateSignals.some((signal) => /street.*postal/i.test(signal)) || streetPostalMatch(context, candidate)) {
      score += 40;
      matchedSignals.push("Street + Postal");
    }
    if (candidateSignals.some((signal) => /name/i.test(signal)) || nameLooksRelated(context.customerDisplay, candidate.name)) {
      score += 15;
      matchedSignals.push("Name Match");
    }
    if (candidate.hasExistingWorkOrderAtAddress) {
      score += 70;
      matchedSignals.push("Existing WO at Address");
    }
    if (candidate.hasExistingAssetAtAddress) {
      score += 60;
      matchedSignals.push("Existing Asset at Address");
    }
    if (context.contact?.email && candidate.email && !sameEmail(context.contact.email, candidate.email)) {
      conflictingSignals.push("Email differs");
    }
    if (context.contact?.phone && candidate.phone && !samePhone(context.contact.phone, candidate.phone)) {
      conflictingSignals.push("Phone differs");
    }

    return {
      ...candidate,
      confidenceScore: Math.min(100, score),
      matchedSignals,
      conflictingSignals
    };
  }).sort((a, b) => b.confidenceScore - a.confidenceScore);

  const top = scored[0];
  const confidenceScore = Math.max(context.matchConfidence || 0, top?.confidenceScore || 0);
  const recommendedResolution = confidenceScore >= 90
    ? "auto-match"
    : confidenceScore >= 70
      ? "review"
      : "create new / unresolved";

  return {
    confidenceScore,
    recommendedResolution,
    matchedSignals: top?.matchedSignals || [],
    conflictingSignals: top?.conflictingSignals || [],
    candidateCustomers: scored.slice(0, 5),
    reason: confidenceScore >= 90
      ? "Strong deterministic evidence supports a match, but operator review is still allowed."
      : confidenceScore >= 70
        ? "Some identity evidence exists, but it is not strong enough for unattended matching."
        : "Weak or missing identity evidence. Never auto-match on this."
  };
}

export function checkRequestReadinessFromContext(context: ServiceOpsContext) {
  const blockers: string[] = [];
  const warnings = [...(context.warnings || [])];

  if (!context.customerId && !/resolved|matched/i.test(context.customerDisplay || "")) blockers.push("customer not resolved");
  if (!context.contact?.phone && !context.contact?.email) blockers.push("valid contact method missing");
  if (!context.locationDisplay && !context.address?.street) blockers.push("service location missing");
  if (!context.issue) blockers.push("issue is not clear enough");
  if (!/gas|fireplace|napoleon|regency|valor|majestic|insert|stove/i.test(`${context.applianceDisplay || ""} ${context.issue || ""}`)) {
    warnings.push("gas fireplace relevance not confirmed");
  }
  if ((context.warnings || []).some((warning) => /duplicate|open work|blocked/i.test(warning))) {
    blockers.push("unresolved blocker or duplicate concern");
  }

  return {
    readinessStatus: blockers.length ? "blocked" : warnings.length ? "needs review" : "ready",
    blockers,
    warnings,
    nextAction: blockers.length ? "Resolve blockers before scheduling." : warnings.length ? "Review warnings, then move forward." : "Move to Ready for Scheduling."
  };
}

export function classifyRequestStatusFromContext(context: ServiceOpsContext) {
  const lane = context.lane || "";
  const text = `${lane} ${(context.raw?.requestStatus as string) || ""} ${(context.raw?.status as string) || ""}`.toLowerCase();
  let requestStatus = "New Request";

  if (/cancel/.test(text)) requestStatus = "Cancelled";
  else if (/complete|closed/.test(text)) requestStatus = "Completed";
  else if (/waiting parts|parts/.test(text)) requestStatus = "Waiting Parts";
  else if (/follow/.test(text)) requestStatus = "Follow-Up Required";
  else if (/progress|today/.test(text)) requestStatus = "In Progress";
  else if (/scheduled/.test(text)) requestStatus = "Scheduled";
  else if (/approved|ready/.test(text)) requestStatus = "Approved";
  else if (/review|blocked|attention|duplicate/.test(text)) requestStatus = "Review Required";
  else if (/waiting customer/.test(text)) requestStatus = "Waiting Customer";
  else if (/contact/.test(text)) requestStatus = "Contact Attempted";

  return {
    requestStatus,
    lane: laneForStatus(requestStatus),
    reason: lane ? `Derived from current lane: ${lane}.` : "Derived from request context and status fields."
  };
}

export function inspectCalendarEventContext(event: CalendarEventContext | undefined, allowedDomain = "@classicfireplace.ca") {
  const creatorEmail = normalizeEmailValue(event?.creatorEmail);
  const organizerEmail = normalizeEmailValue(event?.organizerEmail);
  const isVisible = Boolean(creatorEmail.endsWith(allowedDomain) || organizerEmail.endsWith(allowedDomain));
  return {
    isVisible,
    reason: isVisible ? "Event created or organized by Classic Fireplace domain." : "Event not created or organized by Classic Fireplace domain.",
    technician: event?.technician || "",
    appointmentDate: event?.startDateTime ? event.startDateTime.slice(0, 10) : "",
    appointmentTime: event?.startDateTime ? event.startDateTime.slice(11, 16) : "",
    creatorEmail,
    organizerEmail
  };
}

export function generateOperatorChecklistFromContext(context: ServiceOpsContext) {
  const items = [
    "Confirm customer match",
    "Confirm service address",
    context.contact?.phone || context.contact?.email ? "Confirm preferred contact method" : "Call or email customer once contact is available",
    "Verify appliance is gas",
    context.issue ? "Confirm issue details and urgency" : "Collect issue details",
    "Check duplicate or open work concern",
    "Move to Ready for Scheduling only after blockers are resolved"
  ];
  return { checklist: items };
}

export function draftCustomerCallbackFromContext(context: ServiceOpsContext) {
  const customer = context.customerDisplay || "there";
  const issue = context.issue || "your fireplace service request";
  return {
    message: `Hi ${customer}, this is Classic Fireplace following up on ${issue}. We are reviewing the request details and service address so we can route it correctly. Could you confirm the fireplace make/model, service address, and the best number or email to reach you?`
  };
}

export function draftTechnicianPrepFromContext(context: ServiceOpsContext) {
  return {
    note: [
      `Customer: ${context.customerDisplay || "Unresolved customer"}`,
      `Address: ${context.locationDisplay || "Address not confirmed"}`,
      `Appliance: ${context.applianceDisplay || "Appliance details not confirmed"}`,
      `Issue: ${context.issue || "Issue details not confirmed"}`,
      `Watch-outs: ${(context.warnings || []).join("; ") || "No specific watch-outs in available data"}`,
      context.calendarEvent?.startDateTime ? `Appointment: ${context.calendarEvent.startDateTime} ${context.calendarEvent.technician ? `with ${context.calendarEvent.technician}` : ""}` : "Appointment: not scheduled in available context"
    ].join("\n")
  };
}

export function summarizeServiceHistoryFromContext(context: ServiceOpsContext) {
  const history = context.serviceHistory || [];
  if (!history.length) return { summary: "No prior service history found in available data." };
  return {
    summary: history.slice(0, 5).map((item) => JSON.stringify(item).slice(0, 180)).join("\n")
  };
}

export function buildDeterministicToolResults(context: ServiceOpsContext, allowedDomain = "@classicfireplace.ca"): AssistantToolResult[] {
  return [
    { tool: "extractRequestFacts", result: extractRequestFactsFromContext(context) },
    { tool: "scoreCustomerMatch", result: scoreCustomerMatchFromContext(context) },
    { tool: "checkRequestReadiness", result: checkRequestReadinessFromContext(context) },
    { tool: "classifyRequestStatus", result: classifyRequestStatusFromContext(context) },
    { tool: "inspectCalendarEvent", result: inspectCalendarEventContext(context.calendarEvent, allowedDomain) },
    { tool: "generateOperatorChecklist", result: generateOperatorChecklistFromContext(context) },
    { tool: "draftCustomerCallback", result: draftCustomerCallbackFromContext(context) },
    { tool: "draftTechnicianPrep", result: draftTechnicianPrepFromContext(context) },
    { tool: "summarizeServiceHistory", result: summarizeServiceHistoryFromContext(context) }
  ];
}

export function createServiceOpsTools(context: ServiceOpsContext, allowedDomain = "@classicfireplace.ca") {
  return [
    tool({
      name: "extractRequestFacts",
      description: "Extract structured service request facts from the selected Apps Script webform/card context. Read-only.",
      parameters: z.object({}),
      strict: true,
      execute: async () => extractRequestFactsFromContext(context)
    }),
    tool({
      name: "scoreCustomerMatch",
      description: "Score customer match evidence using Classic Fireplace weighted matching rules. Never creates or updates records.",
      parameters: z.object({}),
      strict: true,
      execute: async () => scoreCustomerMatchFromContext(context)
    }),
    tool({
      name: "checkRequestReadiness",
      description: "Check whether the request can move forward or needs review. Read-only.",
      parameters: z.object({}),
      strict: true,
      execute: async () => checkRequestReadinessFromContext(context)
    }),
    tool({
      name: "classifyRequestStatus",
      description: "Map request facts into an operational status and Kanban lane.",
      parameters: z.object({}),
      strict: true,
      execute: async () => classifyRequestStatusFromContext(context)
    }),
    tool({
      name: "inspectCalendarEvent",
      description: "Inspect whether the selected calendar event is valid for ServiceOps display. Calendar is read-only.",
      parameters: z.object({}),
      strict: true,
      execute: async () => inspectCalendarEventContext(context.calendarEvent, allowedDomain)
    }),
    tool({
      name: "generateOperatorChecklist",
      description: "Generate a concise CSR/dispatcher checklist for the selected request.",
      parameters: z.object({}),
      strict: true,
      execute: async () => generateOperatorChecklistFromContext(context)
    }),
    tool({
      name: "draftCustomerCallback",
      description: "Draft a concise customer-facing callback or email script without promising schedule or pricing.",
      parameters: z.object({}),
      strict: true,
      execute: async () => draftCustomerCallbackFromContext(context)
    }),
    tool({
      name: "draftTechnicianPrep",
      description: "Create technician prep notes from known request, asset, history, and appointment context.",
      parameters: z.object({}),
      strict: true,
      execute: async () => draftTechnicianPrepFromContext(context)
    }),
    tool({
      name: "summarizeServiceHistory",
      description: "Summarize prior service history. If none is available, say so clearly.",
      parameters: z.object({}),
      strict: true,
      execute: async () => summarizeServiceHistoryFromContext(context)
    })
  ];
}

export function parseServiceOpsContext(value: unknown): ServiceOpsContext {
  const parsed = contextSchema.safeParse(value || {});
  return parsed.success ? parsed.data : {};
}

export function fallbackFinalResult(message: string, context: ServiceOpsContext, toolResults: AssistantToolResult[]): FinalAssistantResult {
  const readiness = toolResults.find((item) => item.tool === "checkRequestReadiness")?.result as ReturnType<typeof checkRequestReadinessFromContext> | undefined;
  const match = toolResults.find((item) => item.tool === "scoreCustomerMatch")?.result as ReturnType<typeof scoreCustomerMatchFromContext> | undefined;
  const missing = missingInformation(context);
  const blockers = readiness?.blockers || [];
  return {
    summary: context.issue || message || "Service request context reviewed.",
    recommendedAction: blockers.length ? "Keep in Review Queue until blockers are resolved." : readiness?.nextAction || "Review the request and proceed with the operator checklist.",
    riskLevel: blockers.length ? "high" : (context.warnings?.length || 0) || (match?.confidenceScore || 0) < 70 ? "medium" : "low",
    reasons: [
      ...(blockers.length ? blockers : ["No hard blocker found in available context."]),
      match ? `Customer match recommendation: ${match.recommendedResolution} (${match.confidenceScore}%).` : ""
    ].filter((reason): reason is string => Boolean(reason)),
    nextSteps: (toolResults.find((item) => item.tool === "generateOperatorChecklist")?.result as { checklist?: string[] } | undefined)?.checklist || [],
    missingInformation: missing,
    suggestedCustomerMessage: (toolResults.find((item) => item.tool === "draftCustomerCallback")?.result as { message?: string } | undefined)?.message || "",
    suggestedInternalNote: (toolResults.find((item) => item.tool === "draftTechnicianPrep")?.result as { note?: string } | undefined)?.note || "",
    toolResults
  };
}

function missingInformation(context: ServiceOpsContext) {
  return [
    ["customer", context.customerId || context.customerDisplay],
    ["phone or email", context.contact?.phone || context.contact?.email],
    ["service location", context.locationDisplay || context.address?.street],
    ["appliance make/model", context.applianceDisplay],
    ["issue details", context.issue]
  ].filter(([, value]) => !String(value || "").trim()).map(([label]) => String(label));
}

function laneForStatus(status: string) {
  if (/completed|cancelled/i.test(status)) return "Closed";
  if (/scheduled/i.test(status)) return "Scheduled Ahead";
  if (/progress/i.test(status)) return "Today’s Operations";
  if (/approved/i.test(status)) return "Ready for Scheduling";
  if (/review|waiting|parts|follow/i.test(status)) return "Review Queue";
  return "New Requests";
}

function matchFirst(text: string, values: string[]) {
  return values.find((value) => text.includes(value)) || "";
}

function extractModel(text: string) {
  const match = text.match(/\b[A-Z]{1,5}[- ]?\d{2,5}[A-Z]{0,4}\b/i);
  return match ? match[0] : "";
}

function extractAgeRange(text: string) {
  const match = text.match(/(\d{1,2})\s*(?:\+?\s*)?(?:years?|yrs?|yr|old)/i);
  if (!match) return "";
  const years = Number(match[1]);
  if (years >= 20) return "20+ years";
  if (years >= 10) return "10-19 years";
  if (years >= 5) return "5-9 years";
  return "0-4 years";
}

function normalizeEmailValue(value?: string) {
  return String(value || "").toLowerCase().trim();
}

function normalizePhoneValue(value?: string) {
  const digits = String(value || "").replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : "";
}

function sameEmail(a?: string, b?: string) {
  return Boolean(normalizeEmailValue(a) && normalizeEmailValue(a) === normalizeEmailValue(b));
}

function samePhone(a?: string, b?: string) {
  return Boolean(normalizePhoneValue(a) && normalizePhoneValue(a) === normalizePhoneValue(b));
}

function sameAddress(a?: string, b?: string) {
  const left = String(a || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const right = String(b || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  return Boolean(left && right && (left.includes(right) || right.includes(left)));
}

function streetPostalMatch(context: ServiceOpsContext, candidate: CustomerCandidate) {
  const street = String(context.address?.street || context.locationDisplay || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const candidateStreet = String(candidate.street || candidate.address || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const postal = String(context.address?.postalCode || "").toLowerCase().replace(/\s/g, "");
  const candidatePostal = String(candidate.postalCode || "").toLowerCase().replace(/\s/g, "");
  return Boolean(street && candidateStreet && postal && candidatePostal && street === candidateStreet && postal === candidatePostal);
}

function nameLooksRelated(a?: string, b?: string) {
  const normalize = (value?: string) => String(value || "").toLowerCase().replace(/[^a-z ]/g, " ").split(/\s+/).filter((part) => part.length > 1);
  const left = normalize(a);
  const right = new Set(normalize(b));
  return left.some((part) => right.has(part));
}

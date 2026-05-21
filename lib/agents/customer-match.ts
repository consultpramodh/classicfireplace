import type { CustomerRecord, IntakeRow } from "@/lib/serviceops/types";
import { buildAddressKey, normalizeEmail, normalizePhone10, parseNumericId, safeText } from "@/lib/serviceops/normalization";
import type { CandidateMatch, CustomerMatchRecommendation } from "@/lib/agents/schemas";

export function recommendCustomerMatch(row: IntakeRow, customers: CustomerRecord[]): CustomerMatchRecommendation {
  const missingIdentityFields = missingIdentity(row);
  const candidates = scoreCustomerCandidates(row, customers).slice(0, 8);
  const strong = candidates.filter((candidate) => candidate.confidence >= 0.88);
  const selected = strong[0];
  const conflict = candidates.length > 1 && (
    candidates[1].confidence >= 0.78 ||
    candidates[1].matchSignals.some((signal) => /phone|email/i.test(signal))
  );
  const explicitCustomerId = parseNumericId(row.strivenCustomerId);

  if (explicitCustomerId) {
    return {
      intakeId: row.id,
      sourceRow: row.sourceRow,
      status: "safe_match",
      confidence: 1,
      selectedCustomerId: explicitCustomerId,
      matchReason: "Customer ID already exists on the intake.",
      skippedActionReason: "",
      candidates,
      missingIdentityFields,
      assumptions: [],
      nextAction: "Use existing Customer ID and continue to opportunity readiness.",
      auditSummary: `Existing customer ID ${explicitCustomerId} preserved.`
    };
  }

  if (!candidates.length) {
    return {
      intakeId: row.id,
      sourceRow: row.sourceRow,
      status: missingIdentityFields.length >= 3 ? "needs_review" : "create_new_candidate",
      confidence: 0,
      selectedCustomerId: null,
      matchReason: "No matching customer candidate found by phone, email, or address.",
      skippedActionReason: missingIdentityFields.length >= 3 ? "Insufficient identity data for safe customer creation." : "No existing customer match.",
      candidates,
      missingIdentityFields,
      assumptions: ["No customer should be created until staff confirms the intake is legitimate."],
      nextAction: missingIdentityFields.length >= 3 ? "Request missing identity details." : "Prepare new customer payload for human review.",
      auditSummary: "No deterministic customer match found."
    };
  }

  if (!selected || conflict) {
    return {
      intakeId: row.id,
      sourceRow: row.sourceRow,
      status: "needs_review",
      confidence: candidates[0]?.confidence || 0,
      selectedCustomerId: null,
      matchReason: conflict ? "Multiple plausible customer matches were found." : "Top candidate confidence is below safe-match threshold.",
      skippedActionReason: "Manual approval required for identity conflicts or low confidence.",
      candidates,
      missingIdentityFields,
      assumptions: ["Do not merge or select customers automatically when multiple candidates are plausible."],
      nextAction: "Office staff should compare candidates and choose the correct customer.",
      auditSummary: "Customer matching requires manual review."
    };
  }

  return {
    intakeId: row.id,
    sourceRow: row.sourceRow,
    status: "safe_match",
    confidence: selected.confidence,
    selectedCustomerId: selected.customerId,
    matchReason: selected.matchSignals.join(", "),
    skippedActionReason: "",
    candidates,
    missingIdentityFields,
    assumptions: ["Safe match means recommendation only; Striven updates still require explicit operator action."],
    nextAction: `Review and accept customer ${selected.customerId}, then continue to opportunity preparation.`,
    auditSummary: `Recommended customer ${selected.customerId} with ${Math.round(selected.confidence * 100)}% confidence.`
  };
}

export function scoreCustomerCandidates(row: IntakeRow, customers: CustomerRecord[]): CandidateMatch[] {
  const rowPhone = normalizePhone10(row.phone);
  const rowAltPhone = normalizePhone10(row.altPhone);
  const rowEmail = normalizeEmail(row.email);
  const rowAddressPostal = buildAddressKey(row.street, row.city, row.postalCode);
  const rowAddress = buildAddressKey(row.street, row.city);

  return customers
    .map((customer) => {
      const signals: string[] = [];
      const risks: string[] = [];
      let score = 0;

      const customerPhone = normalizePhone10(customer.phone);
      const customerAltPhone = normalizePhone10(customer.altPhone);
      const customerEmail = normalizeEmail(customer.email);
      const customerAddressPostal = buildAddressKey(customer.street, customer.city, customer.postalCode);
      const customerAddress = buildAddressKey(customer.street, customer.city);

      if (rowPhone && (rowPhone === customerPhone || rowPhone === customerAltPhone)) {
        score += 55;
        signals.push("primary phone match");
      }
      if (rowAltPhone && (rowAltPhone === customerPhone || rowAltPhone === customerAltPhone)) {
        score += 45;
        signals.push("alternate phone match");
      }
      if (rowEmail && rowEmail === customerEmail) {
        score += 40;
        signals.push("email match");
      }
      if (rowAddressPostal !== "||" && rowAddressPostal === customerAddressPostal) {
        score += 35;
        signals.push("address and postal code match");
      } else if (rowAddress !== "|" && rowAddress === customerAddress) {
        score += 22;
        signals.push("address match");
      }

      if (rowEmail && customerEmail && rowEmail !== customerEmail && (rowPhone === customerPhone || rowPhone === customerAltPhone)) {
        risks.push("phone matches but email differs");
      }
      if (rowPhone && customerPhone && rowPhone !== customerPhone && rowEmail === customerEmail) {
        risks.push("email matches but phone differs");
      }

      return {
        customerId: customer.customerId,
        customerNumber: customer.customerNumber,
        name: customer.name,
        email: customer.email,
        phone: customer.phone,
        altPhone: customer.altPhone,
        street: customer.street,
        city: customer.city,
        postalCode: customer.postalCode,
        score: Math.min(100, score),
        confidence: Math.min(1, score / 100),
        matchSignals: signals,
        riskSignals: risks
      };
    })
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => b.score - a.score || a.customerId - b.customerId);
}

function missingIdentity(row: IntakeRow) {
  return [
    ["Phone", row.phone],
    ["Alt Phone", row.altPhone],
    ["Email", row.email],
    ["Street", row.street],
    ["City", row.city],
    ["Postal Code", row.postalCode]
  ]
    .filter(([, value]) => !safeText(value))
    .map(([label]) => label);
}

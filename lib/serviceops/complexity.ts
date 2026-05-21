import type { IntakeRow } from "@/lib/serviceops/types";

export type IntakeComplexity = {
  level: "L1" | "L2" | "L3";
  label: string;
  reason: string;
  recommendedTechnician: "Travis" | "Chris or Matt";
  missingFields: string[];
};

const l1Patterns = [
  /gas smell|smell gas|gas odou?r|leak/i,
  /no heat|won'?t heat|not heating/i,
  /pilot.*won'?t|won'?t.*pilot|pilot.*stay lit/i,
  /flame.*goes out|goes out/i,
  /shut.?off|shuts off/i,
  /valve|thermocouple|thermopile|control module|ignition module/i,
  /error code|beeping|sparking/i
];

const l2Patterns = [
  /ignite|igniter|spark|remote|switch|fan|blower|battery/i,
  /glass|soot|dirty|clean.*glass|maintenance.*issue/i,
  /noise|rattle|smell|odou?r/i,
  /inspection|diagnos/i
];

const l3Patterns = [
  /annual|regular|standard|maintenance|clean(ing)?|service/i
];

export function assessIntakeComplexity(row: IntakeRow): IntakeComplexity {
  const text = [
    row.preferredDays,
    row.makeModelAge,
    row.details,
    row.anythingElse
  ].join(" ");
  const missingFields = requiredMissingFields(row);
  const hasOlderUnit = /\b(1[5-9]|[2-9]\d)\s*(years?|yrs?|yr)\b/i.test(row.makeModelAge || "");

  if (matchesAny(text, l1Patterns) || hasOlderUnit && /not working|won'?t|issue|problem|repair/i.test(text)) {
    return {
      level: "L1",
      label: "Complex",
      reason: hasOlderUnit
        ? "Older unit with a repair-style issue. Route to the expert technician."
        : "Safety or complex diagnostic wording found in the request.",
      recommendedTechnician: "Travis",
      missingFields
    };
  }

  if (matchesAny(text, l2Patterns)) {
    return {
      level: "L2",
      label: "Intermediate",
      reason: "The request appears to need diagnosis or targeted repair, but not expert-only routing.",
      recommendedTechnician: "Chris or Matt",
      missingFields
    };
  }

  if (matchesAny(text, l3Patterns)) {
    return {
      level: "L3",
      label: "Standard Service",
      reason: "The request reads like routine service or cleaning.",
      recommendedTechnician: "Chris or Matt",
      missingFields
    };
  }

  return {
    level: missingFields.includes("Details") || missingFields.includes("Make/Model/Age") ? "L2" : "L3",
    label: missingFields.includes("Details") ? "Needs Clarification" : "Standard Service",
    reason: missingFields.includes("Details")
      ? "Not enough service detail to safely classify as standard."
      : "No complex repair or safety language detected.",
    recommendedTechnician: "Chris or Matt",
    missingFields
  };
}

function matchesAny(value: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(value));
}

function requiredMissingFields(row: IntakeRow) {
  const fields: Array<[string, string]> = [
    ["Timestamp", row.submittedAt],
    ["First Name", row.firstName],
    ["Last Name", row.lastName],
    ["Phone", row.phone],
    ["Email", row.email],
    ["Street", row.street],
    ["City", row.city],
    ["Province", row.province],
    ["Postal Code", row.postalCode],
    ["Preferred Days", row.preferredDays],
    ["Make/Model/Age", row.makeModelAge],
    ["Details", row.details]
  ];

  return fields.filter(([, value]) => !String(value || "").trim()).map(([label]) => label);
}

import type { IntakeRow } from "@/lib/serviceops/types";
import { buildAddressKey, normalizeEmail, normalizePhone10, safeText } from "@/lib/serviceops/normalization";
import { sortRequestsRecentFirst } from "@/lib/serviceops/sorting";

export function dedupeIntakeForms(rows: IntakeRow[]): IntakeRow[] {
  const byKey = new Map<string, IntakeRow>();

  for (const row of sortRequestsRecentFirst(rows)) {
    const key = duplicateFormKey(row);
    if (!key || !byKey.has(key)) {
      byKey.set(key || `unique:${row.id}`, row);
    }
  }

  return sortRequestsRecentFirst([...byKey.values()]);
}

function duplicateFormKey(row: IntakeRow) {
  const contact = normalizeEmail(row.email) || normalizePhone10(row.phone) || normalizePhone10(row.altPhone);
  const name = [row.firstName, row.lastName].map((part) => safeText(part).toLowerCase()).filter(Boolean).join(" ");
  const address = buildAddressKey(row.street, row.city, row.postalCode);
  const service = normalizeServiceText([row.makeModelAge, row.details, row.anythingElse].join(" "));

  if (!service) return "";
  if (contact) return ["contact", contact, address, service].join("|");
  if (name && address) return ["name-address", name, address, service].join("|");
  return "";
}

function normalizeServiceText(value: string) {
  return safeText(value)
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^\w\s]/g, "")
    .trim();
}

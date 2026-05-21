/*
 * 003_Normalization.ts
 * Pure helpers ported from Apps Script intake/profile logic.
 */

export function safeText(value: unknown): string {
  return String(value ?? "").trim();
}

export function normalizeEmail(value: unknown): string {
  return safeText(value).toLowerCase();
}

export function formatEmail(value: unknown): string {
  return normalizeEmail(value);
}

export function normalizePhone10(value: unknown): string {
  const withoutExtension = String(value ?? "").replace(/(?:ext\.?|x)\s*\d{1,6}\b/gi, "");
  const digits = withoutExtension.replace(/\D/g, "");
  if (!digits) return "";
  return digits.length > 10 ? digits.slice(-10) : digits;
}

export function formatPhone(value: unknown): string {
  const raw = String(value ?? "");
  const extension = raw.match(/(?:ext\.?|x)\s*(\d{1,6})\b/i)?.[1] || "";
  const digits = normalizePhone10(raw);
  if (!digits) return safeText(value);
  const formatted = digits.length === 10 ? `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}` : digits;
  return extension ? `${formatted} ext. ${extension}` : formatted;
}

export function normalizeStreet(value: unknown): string {
  return safeText(value)
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[.,#]/g, "")
    .trim();
}

export function normalizeCity(value: unknown): string {
  return safeText(value).toLowerCase().replace(/\s+/g, " ").trim();
}

export function formatName(value: unknown): string {
  return toTitleCase(safeText(value));
}

export function formatStreet(value: unknown): string {
  return toTitleCase(safeText(value).replace(/\s+/g, " "));
}

export function formatCity(value: unknown): string {
  return toTitleCase(normalizeCity(value));
}

export function formatProvince(value: unknown): string {
  const text = safeText(value).toUpperCase();
  return text || "ON";
}

export function normalizePostal(value: unknown): string {
  return safeText(value).toUpperCase().replace(/\s+/g, "").trim();
}

export function formatPostal(value: unknown): string {
  const postal = normalizePostal(value);
  if (/^[A-Z]\d[A-Z]\d[A-Z]\d$/.test(postal)) return `${postal.slice(0, 3)} ${postal.slice(3)}`;
  return postal;
}

export function formatCountry(value: unknown): string {
  const code = normalizeCountryCode(value);
  if (code === "CA") return "Canada";
  if (code === "US") return "United States";
  return safeText(value);
}

export function normalizeCountryCode(value: unknown): string {
  const v = safeText(value).toLowerCase();
  if (!v) return "CA";
  if (v === "canada" || v === "ca") return "CA";
  if (v === "united states" || v === "usa" || v === "us") return "US";
  return safeText(value);
}

export function parseNumericId(value: unknown): number {
  const raw = safeText(value);
  if (!raw) return 0;
  const match = raw.match(/^(\d+)/);
  return match ? Number(match[1]) : 0;
}

export function findValueByAliases(obj: Record<string, unknown>, aliases: readonly string[]): unknown {
  for (const alias of aliases) {
    if (Object.prototype.hasOwnProperty.call(obj, alias) && safeText(obj[alias])) {
      return obj[alias];
    }
  }
  return "";
}

export function buildAddressKey(street: unknown, city: unknown, postal?: unknown): string {
  const parts = [normalizeStreet(street), normalizeCity(city)];
  const pc = normalizePostal(postal);
  if (pc) parts.push(pc);
  return parts.join("|").toLowerCase();
}

export function formatAddressParts(input: { street?: unknown; city?: unknown; province?: unknown; postalCode?: unknown; country?: unknown }): string {
  return [
    formatStreet(input.street),
    formatCity(input.city),
    formatProvince(input.province),
    formatPostal(input.postalCode),
    input.country ? formatCountry(input.country) : ""
  ].filter(Boolean).join(", ");
}

export function toTitleCase(value: string): string {
  return safeText(value).toLowerCase().replace(/\b([a-zÀ-ÿ])([a-zÀ-ÿ'’-]*)/g, (_match, first: string, rest: string) => `${first.toUpperCase()}${rest}`);
}

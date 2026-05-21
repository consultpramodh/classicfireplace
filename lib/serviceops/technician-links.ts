/*
 * 041_Technician_Links.ts
 * Small client-safe helpers for technician profile URLs.
 */

export function technicianSlug(value: string) {
  const slug = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || "technician";
}

export function technicianProfileHref(value: string) {
  return `/technicians/${encodeURIComponent(technicianSlug(value))}`;
}

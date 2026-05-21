import type { IntakeRow } from "@/lib/serviceops/types";

export function sortRequestsRecentFirst<T extends Pick<IntakeRow, "submittedAt" | "sourceRow" | "id">>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const bySubmitted = submittedAtMs(b.submittedAt) - submittedAtMs(a.submittedAt);
    if (bySubmitted !== 0) return bySubmitted;

    const bySourceRow = Number(b.sourceRow || 0) - Number(a.sourceRow || 0);
    if (bySourceRow !== 0) return bySourceRow;

    return String(b.id || "").localeCompare(String(a.id || ""));
  });
}

export function submittedAtMs(value: string) {
  const normalized = String(value || "").trim();
  const isoLike = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (isoLike) {
    const parsed = new Date(
      Number(isoLike[1]),
      Number(isoLike[2]) - 1,
      Number(isoLike[3]),
      Number(isoLike[4]),
      Number(isoLike[5]),
      Number(isoLike[6] || 0)
    );
    if (!Number.isNaN(parsed.getTime())) return parsed.getTime();
  }

  const direct = Date.parse(normalized);
  if (!Number.isNaN(direct)) return direct;

  const match = normalized.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:\s+(.+))?$/);
  if (!match) return 0;

  const month = Number(match[1]) - 1;
  const day = Number(match[2]);
  const year = Number(match[3].length === 2 ? `20${match[3]}` : match[3]);
  const parsed = new Date(year, month, day, ...timeParts(match[4] || ""));
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
}

function timeParts(value: string): [number, number, number, number] {
  if (!value) return [0, 0, 0, 0];
  const parsed = new Date(`2000-01-01 ${value}`);
  if (Number.isNaN(parsed.getTime())) return [0, 0, 0, 0];
  return [parsed.getHours(), parsed.getMinutes(), parsed.getSeconds(), parsed.getMilliseconds()];
}

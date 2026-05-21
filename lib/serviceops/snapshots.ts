/*
 * 034_ServiceOps_Snapshots.ts
 * Fast local snapshot cache for operational pages.
 */

import "server-only";
import {
  getReportRowsForCustomer,
  getReportSnapshot,
  getReportSnapshotMeta,
  getSnapshotMeta,
  replaceCalendarEvents,
  replaceTaskMappingRows,
  replaceWebFormIntakeRows,
  setReportSnapshot
} from "@/lib/db/repository";
import { readTechnicianCalendarEvents } from "@/lib/google/calendar-adapter";
import { readTaskMappingRows, readWebFormRows } from "@/lib/google/sheets-adapter";
import { fetchReportRows, type ReportKey } from "@/lib/striven/reports";

export const SNAPSHOT_TTL_MS = 15 * 60 * 1000;

export const REPORT_KEYS: ReportKey[] = [
  "customers",
  "customerLocations",
  "serviceWorkOrders",
  "serviceTasks",
  "customerAssets",
  "opportunities",
  "invoiceAssetsSerials",
  "installationTasks"
];

export type CachedRows<T> = {
  rows: T[];
  refreshedAt: string;
  stale: boolean;
  error: string;
};

export async function refreshSnapshotCache() {
  const startedAt = new Date().toISOString();
  const result: {
    ok: boolean;
    startedAt: string;
    finishedAt?: string;
    intakeRows: number;
    taskRows: number;
    reports: Record<string, number>;
    errors: Record<string, string>;
    calendarEvents?: number;
  } = {
    ok: true,
    startedAt,
    intakeRows: 0,
    taskRows: 0,
    reports: {},
    errors: {}
  };

  try {
    const intakeRows = await readWebFormRows();
    replaceWebFormIntakeRows(intakeRows);
    result.intakeRows = intakeRows.length;
  } catch (err) {
    result.ok = false;
    result.errors.intakeRows = err instanceof Error ? err.message : String(err);
  }

  try {
    const taskRows = await readTaskMappingRows();
    replaceTaskMappingRows(taskRows);
    result.taskRows = taskRows.length;
  } catch (err) {
    result.ok = false;
    result.errors.taskMappingRows = err instanceof Error ? err.message : String(err);
  }

  try {
    const rangeStart = new Date();
    rangeStart.setDate(rangeStart.getDate() - 14);
    rangeStart.setHours(0, 0, 0, 0);
    const rangeEnd = new Date();
    rangeEnd.setDate(rangeEnd.getDate() + 90);
    rangeEnd.setHours(23, 59, 59, 999);

    const calendar = await readTechnicianCalendarEvents(rangeStart, rangeEnd);
    replaceCalendarEvents(calendar.events);
    result.calendarEvents = calendar.events.length;
    if (calendar.errors.length) {
      result.errors.calendarEvents = calendar.errors.join(" | ");
    }
  } catch (err) {
    result.calendarEvents = 0;
    result.errors.calendarEvents = err instanceof Error ? err.message : String(err);
  }

  const reports = await Promise.allSettled(REPORT_KEYS.map(async (key) => {
    const maxPages = key === "customers" ? 200 : 20;
    const rows = await fetchReportRows(key, 1000, maxPages);
    setReportSnapshot(key, rows);
    return { key, count: rows.length };
  }));

  reports.forEach((entry, index) => {
    const key = REPORT_KEYS[index];
    if (entry.status === "fulfilled") {
      result.reports[entry.value.key] = entry.value.count;
      return;
    }

    result.ok = false;
    result.reports[key] = 0;
    result.errors[key] = entry.reason instanceof Error ? entry.reason.message : String(entry.reason);
    setReportSnapshot(key, [], result.errors[key]);
  });

  result.finishedAt = new Date().toISOString();
  return result;
}

export function getCachedReportRows(key: ReportKey): CachedRows<Record<string, unknown>> {
  const snapshot = getReportSnapshot(key);
  const refreshedAt = snapshot.meta?.refreshedAt || "";
  return {
    rows: snapshot.rows,
    refreshedAt,
    stale: isStale(refreshedAt),
    error: snapshot.meta?.error || ""
  };
}

export function getCachedReportRowsForCustomer(
  key: ReportKey,
  input: {
    customerId?: unknown;
    customerNumber?: unknown;
    email?: unknown;
    phone?: unknown;
    altPhone?: unknown;
  },
  limit = 500
): CachedRows<Record<string, unknown>> {
  const meta = getReportSnapshotMeta(key);
  const refreshedAt = meta?.refreshedAt || "";

  return {
    rows: getReportRowsForCustomer(key, input, limit),
    refreshedAt,
    stale: isStale(refreshedAt),
    error: meta?.error || ""
  };
}

export function isStale(refreshedAt?: string) {
  if (!refreshedAt) return true;
  const time = new Date(refreshedAt).getTime();
  if (!time || Number.isNaN(time)) return true;
  return Date.now() - time > SNAPSHOT_TTL_MS;
}

export function getSnapshotStatus(key: string) {
  const meta = getSnapshotMeta(key);
  return {
    refreshedAt: meta?.refreshedAt || "",
    stale: isStale(meta?.refreshedAt),
    error: meta?.error || ""
  };
}

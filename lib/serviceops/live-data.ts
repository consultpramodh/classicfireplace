/*
 * 031_Live_Data.ts
 * Fast data service for pages. Pages read local snapshots only; refresh
 * actions rebuild snapshots from Google Sheets and Striven.
 */

import "server-only";
import { getEnv } from "@/lib/config/serviceops-config";
import { listAuditLogs, listCalendarEvents, listIntakeRows, listTaskMappingRows } from "@/lib/db/repository";
import type { AuditLogEntry, CalendarEvent, IntakeRow, TaskMappingRow } from "@/lib/serviceops/types";
import { getSnapshotStatus } from "@/lib/serviceops/snapshots";
import { sortRequestsRecentFirst } from "@/lib/serviceops/sorting";
import { dedupeIntakeForms } from "@/lib/serviceops/dedupe";

export type LiveDataResult<T> = {
  rows: T;
  source: "demo" | "cache" | "empty";
  error?: string;
  refreshedAt?: string;
  stale?: boolean;
};

export async function getCurrentIntakeRows(): Promise<LiveDataResult<IntakeRow[]>> {
  if (getEnv().demoMode) return { rows: dedupeIntakeForms(sortRequestsRecentFirst(listIntakeRows())), source: "demo" };

  const rows = dedupeIntakeForms(sortRequestsRecentFirst(listIntakeRows()));
  const status = getSnapshotStatus("intakeRows");

  return {
    rows,
    source: rows.length ? "cache" : "empty",
    refreshedAt: status.refreshedAt,
    stale: status.stale,
    error: rows.length ? status.error : "No local intake snapshot yet. Click Refresh reports to load live data."
  };
}

export async function getCurrentTaskMappingRows(): Promise<LiveDataResult<TaskMappingRow[]>> {
  if (getEnv().demoMode) return { rows: listTaskMappingRows(), source: "demo" };

  const rows = listTaskMappingRows();
  const status = getSnapshotStatus("taskMappingRows");

  return {
    rows,
    source: rows.length ? "cache" : "empty",
    refreshedAt: status.refreshedAt,
    stale: status.stale,
    error: rows.length ? status.error : "No local task snapshot yet. Click Refresh reports to load live data."
  };
}

export async function getCurrentCalendarEvents(): Promise<LiveDataResult<CalendarEvent[]>> {
  if (getEnv().demoMode) return { rows: taskMappingToCalendarEvents(listTaskMappingRows()), source: "demo" };

  const rows = listCalendarEvents();
  const status = getSnapshotStatus("calendarEvents");

  if (rows.length) {
    return {
      rows,
      source: "cache",
      refreshedAt: status.refreshedAt,
      stale: status.stale,
      error: status.error
    };
  }

  const fallback = taskMappingToCalendarEvents(listTaskMappingRows());
  return {
    rows: fallback,
    source: fallback.length ? "cache" : "empty",
    refreshedAt: status.refreshedAt,
    stale: status.stale,
    error: fallback.length
      ? "No Google Calendar snapshot yet. Showing Service Task Mapping schedule as a fallback."
      : "No Google Calendar snapshot yet. Add calendar credentials or make technician calendars public, then click Refresh reports."
  };
}

export function getCurrentAuditRows(): LiveDataResult<AuditLogEntry[]> {
  return { rows: listAuditLogs(), source: "demo" };
}

function taskMappingToCalendarEvents(rows: TaskMappingRow[]): CalendarEvent[] {
  return rows
    .filter((row) => row.start)
    .map((row) => ({
      id: `task-${row.eventId}`,
      technician: row.tech || "Unassigned",
      calendarId: "task-mapping",
      title: row.title || row.taskName || "Service Task",
      location: row.location,
      description: [row.soNumber ? `SO ${row.soNumber}` : "", row.taskName, row.rowStatus].filter(Boolean).join(" · "),
      start: row.start || "",
      end: row.end || row.start || "",
      allDay: false,
      source: "taskMapping" as const
    }));
}

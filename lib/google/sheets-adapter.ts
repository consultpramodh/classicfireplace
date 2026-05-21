/*
 * 011_Google_Sheets_Adapter.ts
 * Server-side Google Sheets read adapter. Uses public CSV export when available.
 * Private workbooks still require OAuth or service-account credentials.
 */

import "server-only";
import { SHEETS, getEnv } from "@/lib/config/serviceops-config";
import { demoIntakeRows } from "@/lib/data/demo-data";
import type { IntakeRow, TaskMappingRow } from "@/lib/serviceops/types";
import { formatCity, formatCountry, formatEmail, formatName, formatPhone, formatPostal, formatProvince, formatStreet, safeText } from "@/lib/serviceops/normalization";

export async function readWebFormRows(): Promise<IntakeRow[]> {
  const env = getEnv();
  if (env.demoMode) return demoIntakeRows;

  const rows = await readSheetObjects(SHEETS.webForm);
  return rows
    .map((row, index) => mapWebFormRow(row, index + 2))
    .sort((a, b) => submittedTime(b.submittedAt) - submittedTime(a.submittedAt));
}

export async function readTaskMappingRows(): Promise<TaskMappingRow[]> {
  const env = getEnv();
  if (env.demoMode) {
    const { demoTaskMapping } = await import("@/lib/data/demo-data");
    return demoTaskMapping;
  }

  const rows = await readSheetObjects(SHEETS.serviceTaskMapping, 2);
  return rows.map((row) => ({
    eventId: safeText(row["Event ID"]),
    tech: safeText(row.Tech),
    start: combineDateTime(row["Start Date"], row["Start Time"]),
    end: combineDateTime(row["End Date"], row["End Time"]),
    title: safeText(row.Title),
    location: safeText(row.Location),
    soNumber: safeText(row["SO# (event)"]),
    matchMethod: safeText(row["Match Method"]),
    taskId: safeText(row.TaskId),
    taskName: safeText(row.TaskName),
    taskStatus: safeText(row.TaskStatus),
    datesMatch: safeText(row["Dates Match?"]) as TaskMappingRow["datesMatch"],
    rowStatus: safeText(row["Row Status"])
  }));
}

function combineDateTime(dateValue: unknown, timeValue: unknown) {
  const dateText = safeText(dateValue);
  const timeText = safeText(timeValue);
  if (!dateText) return "";

  const date = parseSheetDate(dateText);
  if (!date) return dateText;

  const time = parseSheetDate(timeText);
  if (time) {
    date.setHours(time.getHours(), time.getMinutes(), 0, 0);
  }

  return date.toISOString();
}

function parseSheetDate(value: string) {
  if (!value) return null;
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) return parsed;

  const match = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:\s+(.+))?$/);
  if (!match) return null;

  const month = Number(match[1]) - 1;
  const day = Number(match[2]);
  const year = Number(match[3].length === 2 ? `20${match[3]}` : match[3]);
  const parsedDate = new Date(year, month, day);
  return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
}

export async function readSheetObjects(sheetName: string, headerRow = 1): Promise<Record<string, string>[]> {
  const env = getEnv();
  if (!env.spreadsheetId) {
    throw new Error("Missing SPREADSHEET_ID.");
  }

  const url = `https://docs.google.com/spreadsheets/d/${encodeURIComponent(env.spreadsheetId)}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`;
  const response = await fetch(url, { cache: "no-store" });
  const text = await response.text();

  if (!response.ok || /^\s*</.test(text)) {
    throw new Error(
      `Could not read Google Sheet "${sheetName}" with public CSV export. ` +
      "If the workbook is private, provide Google OAuth/service-account credentials."
    );
  }

  const table = parseCsv(text);
  const headerIndex = Math.max(0, headerRow - 1);
  const headers = (table[headerIndex] || []).map((header) => header.trim());
  return table.slice(headerIndex + 1)
    .filter((row) => row.some((cell) => safeText(cell)))
    .map((row) => {
      const obj: Record<string, string> = {};
      headers.forEach((header, index) => {
        if (header) obj[header] = row[index] || "";
      });
      return obj;
    });
}

function mapWebFormRow(row: Record<string, string>, sourceRow: number): IntakeRow {
  const firstName = formatName(row["First Name"]);
  const lastName = formatName(row["Last Name"]);
  const timestamp = safeText(row.Timestamp) || new Date().toISOString();
  return {
    id: `WEBFORM-${sourceRow}-${timestamp}`,
    sourceRow,
    submittedAt: timestamp,
    firstName,
    lastName,
    phone: formatPhone(row.Phone),
    altPhone: formatPhone(row["Alt Phone"]),
    email: formatEmail(row.Email),
    street: formatStreet(row.Street),
    city: formatCity(row.City),
    province: formatProvince(row.Province),
    postalCode: formatPostal(row["Postal Code"]),
    country: formatCountry(row.Country),
    preferredDays: safeText(row["Preferred Days"]),
    makeModelAge: safeText(row["Make/Model/Age"]),
    details: safeText(row.Details),
    anythingElse: safeText(row["Anything Else"]),
    pipelineState: safeText(row["Pipeline State"]) || "NEW_ROW",
    needsReview: /^yes|true|1$/i.test(safeText(row["Needs Review"])),
    lastError: safeText(row["Last Error"]),
    strivenCustomerId: safeText(row["Striven Customer ID"]),
    strivenOppId: safeText(row["Striven Opp ID"]),
    strivenSoId: safeText(row["Striven SO ID"]),
    salesOrderNumber: safeText(row["Sales Order Number"]),
    salesOrderStatus: safeText(row["Sales Order Status"]) || safeText(row["SO Status"]),
    salesOrderCreatedAt: safeText(row["Sales Order Created At"]) || safeText(row["SO Created At"]),
    salesOrderUpdatedAt: safeText(row["Sales Order Updated At"]) || safeText(row["SO Updated At"]),
    salesOrderScheduledAt: safeText(row["Sales Order Scheduled At"]) || safeText(row["Scheduled At"]),
    salesOrderInProgressAt: safeText(row["Sales Order In Progress At"]) || safeText(row["In Progress At"]),
    swoQuotedToInProgress: safeText(row["SWO Quoted To In Progress"]) || safeText(row["Quoted To In Progress"]),
    swoCreatedToScheduled: safeText(row["SWO Created To Scheduled"]) || safeText(row["Created To Scheduled"]),
    serviceAppointmentNote: safeText(row["Service Appointment Note"]) || safeText(row["Appointment Note"]),
    cleanServiceTaskStatus: safeText(row["Clean and Service Task Status"]) || safeText(row["Task Status"]),
    opportunityStage: safeText(row["Opportunity Stage"]) || safeText(row["Opportunity Status"]),
    taskMatched: /^yes|true|1|match$/i.test(safeText(row["Task Matched"]))
  };
}

function submittedTime(value: string) {
  const parsed = new Date(value || "").getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"' && inQuotes && next === '"') {
      cell += '"';
      i++;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(cell);
      cell = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    cell += char;
  }

  row.push(cell);
  rows.push(row);
  return rows;
}

export async function refreshReports() {
  if (getEnv().demoMode) {
    return {
      ok: true,
      mode: "demo",
      reports: ["customers", "customerLocations", "serviceWorkOrders", "serviceTasks", "customerAssets", "opportunities"]
    };
  }

  const { fetchReportRows } = await import("@/lib/striven/reports");
  const keys = ["customers", "customerLocations", "serviceWorkOrders", "serviceTasks", "customerAssets", "opportunities"] as const;
  const reports: Record<string, number> = {};

  for (const key of keys) {
    const rows = await fetchReportRows(key, 5, 1);
    reports[key] = rows.length;
  }

  return { ok: true, mode: "live-readonly-health-check", reports };
}

export async function readWebFormRowsOrDemo() {
  try {
    return await readWebFormRows();
  } catch {
  return demoIntakeRows;
  }
}

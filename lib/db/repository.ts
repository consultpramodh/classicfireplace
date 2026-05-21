/*
 * 007_ServiceOps_Repository.ts
 * SQLite repository for app state and audit logs. Demo mode seeds read-friendly data.
 */

import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";
import { getCalendarTechnicians, getEnv, LOOKUP_ALIASES } from "@/lib/config/serviceops-config";
import { demoAudit, demoIntakeRows, demoTaskMapping } from "@/lib/data/demo-data";
import { findValueByAliases, formatCity, formatCountry, formatEmail, formatName, formatPhone, formatPostal, formatProvince, formatStreet, normalizeEmail, normalizePhone10, safeText } from "@/lib/serviceops/normalization";
import { technicianSlug } from "@/lib/serviceops/technician-links";
import type { AuditLogEntry, CalendarEvent, IntakeRow, TaskMappingRow, TechnicianProfile } from "@/lib/serviceops/types";
import { sortRequestsRecentFirst } from "@/lib/serviceops/sorting";

let db: Database.Database | null = null;

export type SnapshotMeta = {
  key: string;
  refreshedAt: string;
  source: string;
  error: string;
};

function dbPathFromUrl(url: string): string {
  const rawPath = url.startsWith("file:") ? url.slice(5) : url;
  if (process.env.VERCEL && !isAbsolute(rawPath)) {
    return join("/tmp", rawPath.replace(/^\.?[\\/]+/, ""));
  }
  return rawPath;
}

export function getDb() {
  if (!db) {
    const databasePath = dbPathFromUrl(getEnv().databaseUrl);
    mkdirSync(dirname(databasePath), { recursive: true });
    db = new Database(databasePath);
    db.pragma(process.env.VERCEL ? "journal_mode = DELETE" : "journal_mode = WAL");
    migrate(db);
  }
  return db;
}

function migrate(database: Database.Database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS intake_rows (
      id TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS task_mapping_rows (
      event_id TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS calendar_events (
      id TEXT PRIMARY KEY,
      technician TEXT NOT NULL,
      calendar_id TEXT NOT NULL,
      start_at TEXT NOT NULL,
      end_at TEXT NOT NULL,
      data TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_calendar_events_start ON calendar_events (start_at);
    CREATE INDEX IF NOT EXISTS idx_calendar_events_tech ON calendar_events (technician);
    CREATE TABLE IF NOT EXISTS technician_profiles (
      id TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL,
      user TEXT NOT NULL,
      action TEXT NOT NULL,
      source_row INTEGER,
      striven_customer_id TEXT,
      opportunity_id TEXT,
      sales_order_id TEXT,
      task_id TEXT,
      result TEXT NOT NULL,
      error_message TEXT,
      raw_response_preview TEXT
    );
    CREATE TABLE IF NOT EXISTS snapshot_meta (
      key TEXT PRIMARY KEY,
      refreshed_at TEXT NOT NULL,
      source TEXT NOT NULL,
      error TEXT
    );
    CREATE TABLE IF NOT EXISTS report_snapshots (
      key TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      refreshed_at TEXT NOT NULL,
      error TEXT
    );
    CREATE TABLE IF NOT EXISTS report_snapshot_rows (
      report_key TEXT NOT NULL,
      row_index INTEGER NOT NULL,
      customer_id TEXT,
      customer_number TEXT,
      email TEXT,
      phone TEXT,
      alt_phone TEXT,
      data TEXT NOT NULL,
      PRIMARY KEY (report_key, row_index)
    );
    CREATE INDEX IF NOT EXISTS idx_report_rows_customer_id ON report_snapshot_rows (report_key, customer_id);
    CREATE INDEX IF NOT EXISTS idx_report_rows_customer_number ON report_snapshot_rows (report_key, customer_number);
    CREATE INDEX IF NOT EXISTS idx_report_rows_email ON report_snapshot_rows (report_key, email);
    CREATE INDEX IF NOT EXISTS idx_report_rows_phone ON report_snapshot_rows (report_key, phone);
  `);

  seedTechnicianProfiles(database);

  const count = database.prepare("SELECT COUNT(*) as count FROM intake_rows").get() as { count: number };
  if (count.count === 0 && getEnv().demoMode) {
    const insertIntake = database.prepare("INSERT INTO intake_rows (id, data, updated_at) VALUES (?, ?, ?)");
    const now = new Date().toISOString();
    for (const row of demoIntakeRows) insertIntake.run(row.id, JSON.stringify(row), now);

    const insertTask = database.prepare("INSERT INTO task_mapping_rows (event_id, data, updated_at) VALUES (?, ?, ?)");
    for (const row of demoTaskMapping) insertTask.run(row.eventId, JSON.stringify(row), now);

    const insertAudit = database.prepare(`
      INSERT INTO audit_logs (
        timestamp, user, action, source_row, striven_customer_id, opportunity_id, sales_order_id, task_id, result, error_message, raw_response_preview
      ) VALUES (@timestamp, @user, @action, @sourceRow, @strivenCustomerId, @opportunityId, @salesOrderId, @taskId, @result, @errorMessage, @rawResponsePreview)
    `);
    for (const entry of demoAudit) insertAudit.run(entry);
  }
}

function seedTechnicianProfiles(database: Database.Database) {
  const count = database.prepare("SELECT COUNT(*) as count FROM technician_profiles").get() as { count: number };
  if (count.count > 0) return;

  const now = new Date().toISOString();
  const insert = database.prepare("INSERT INTO technician_profiles (id, data, updated_at) VALUES (@id, @data, @updatedAt)");
  getCalendarTechnicians().forEach((tech, index) => {
    const profile: TechnicianProfile = {
      id: technicianSlug(tech.name),
      name: tech.name,
      active: true,
      role: "Service Technician",
      phone: "",
      email: "",
      calendarId: tech.calendarId,
      color: tech.color || defaultTechnicianColor(index),
      homeAddress: "",
      preferredStartAddress: "",
      serviceAreas: [],
      skills: [],
      capacityPerDay: 5,
      notes: "",
      sortOrder: index + 1,
      createdAt: now,
      updatedAt: now
    };
    insert.run({ id: profile.id, data: JSON.stringify(profile), updatedAt: now });
  });
}

function defaultTechnicianColor(index: number) {
  return ["#8a2f16", "#007069", "#1f5f8f", "#9a5b00", "#7c3aed"][index % 5];
}

export function listIntakeRows(): IntakeRow[] {
  const rows = getDb().prepare("SELECT data FROM intake_rows ORDER BY json_extract(data, '$.submittedAt') DESC").all() as { data: string }[];
  return sortRequestsRecentFirst(rows.map((row) => JSON.parse(row.data) as IntakeRow));
}

export function getIntakeRowBySourceRow(sourceRow: number): IntakeRow | null {
  return listIntakeRows().find((row) => row.sourceRow === sourceRow) || null;
}

export function upsertIntakeRow(row: IntakeRow) {
  getDb().prepare(`
    INSERT INTO intake_rows (id, data, updated_at) VALUES (@id, @data, @updatedAt)
    ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at
  `).run({ id: row.id, data: JSON.stringify(row), updatedAt: new Date().toISOString() });
}

export function createManualIntakeRow(input: Partial<IntakeRow> & { channel?: string }): IntakeRow {
  const now = new Date();
  const manualCount = getDb().prepare("SELECT COUNT(*) as count FROM intake_rows WHERE id LIKE 'MANUAL-%'").get() as { count: number };
  const sourceRow = -1 * (manualCount.count + 1);
  const channel = safeText(input.channel) || "Manual";
  const id = `MANUAL-${now.getTime()}`;
  const nameParts = splitName(safeText(input.firstName || input.lastName));

  const row: IntakeRow = {
    id,
    sourceRow,
    submittedAt: now.toISOString(),
    firstName: formatName(input.firstName) || formatName(nameParts.firstName),
    lastName: formatName(input.lastName) || formatName(nameParts.lastName),
    phone: formatPhone(input.phone),
    altPhone: formatPhone(input.altPhone),
    email: formatEmail(input.email),
    street: formatStreet(input.street),
    city: formatCity(input.city),
    province: formatProvince(input.province),
    postalCode: formatPostal(input.postalCode),
    country: formatCountry(input.country),
    preferredDays: safeText(input.preferredDays),
    makeModelAge: safeText(input.makeModelAge) || `${channel} request`,
    details: safeText(input.details),
    anythingElse: safeText(input.anythingElse),
    pipelineState: "NEW_ROW",
    needsReview: false,
    lastError: "",
    strivenCustomerId: "",
    strivenOppId: "",
    strivenSoId: "",
    salesOrderNumber: "",
    salesOrderStatus: "",
    salesOrderCreatedAt: "",
    salesOrderUpdatedAt: "",
    salesOrderScheduledAt: "",
    salesOrderInProgressAt: "",
    swoQuotedToInProgress: "",
    swoCreatedToScheduled: "",
    serviceAppointmentNote: "",
    cleanServiceTaskStatus: "",
    opportunityStage: "",
    taskMatched: false
  };

  upsertIntakeRow(row);
  return row;
}

export function replaceWebFormIntakeRows(rows: IntakeRow[], source = "live") {
  const database = getDb();
  const existingBySourceRow = new Map(
    listIntakeRows()
      .filter((row) => !row.id.startsWith("INTAKE-"))
      .map((row) => [row.sourceRow, row])
  );
  const mergedRows = rows.map((row) => mergeCachedWebFormRow(row, existingBySourceRow.get(row.sourceRow)));
  const now = new Date().toISOString();

  const tx = database.transaction(() => {
    database.prepare("DELETE FROM intake_rows WHERE id LIKE 'WEBFORM-%'").run();
    const insert = database.prepare(`
      INSERT INTO intake_rows (id, data, updated_at) VALUES (@id, @data, @updatedAt)
      ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at
    `);
    for (const row of mergedRows) {
      insert.run({ id: row.id, data: JSON.stringify(row), updatedAt: now });
    }
    upsertSnapshotMeta("intakeRows", { refreshedAt: now, source, error: "" });
  });

  tx();
}

function splitName(value: string) {
  const parts = value.split(/\s+/).filter(Boolean);
  if (!parts.length) return { firstName: "", lastName: "" };
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return { firstName: parts.slice(0, -1).join(" "), lastName: parts[parts.length - 1] };
}

function mergeCachedWebFormRow(sheetRow: IntakeRow, localRow?: IntakeRow): IntakeRow {
  if (!localRow) return sheetRow;

  return {
    ...sheetRow,
    strivenCustomerId: localRow.strivenCustomerId || sheetRow.strivenCustomerId,
    strivenOppId: localRow.strivenOppId || sheetRow.strivenOppId,
    strivenSoId: localRow.strivenSoId || sheetRow.strivenSoId,
    salesOrderNumber: localRow.salesOrderNumber || sheetRow.salesOrderNumber,
    salesOrderStatus: localRow.salesOrderStatus || sheetRow.salesOrderStatus,
    salesOrderCreatedAt: localRow.salesOrderCreatedAt || sheetRow.salesOrderCreatedAt,
    salesOrderUpdatedAt: localRow.salesOrderUpdatedAt || sheetRow.salesOrderUpdatedAt,
    salesOrderScheduledAt: localRow.salesOrderScheduledAt || sheetRow.salesOrderScheduledAt,
    salesOrderInProgressAt: localRow.salesOrderInProgressAt || sheetRow.salesOrderInProgressAt,
    swoQuotedToInProgress: localRow.swoQuotedToInProgress || sheetRow.swoQuotedToInProgress,
    swoCreatedToScheduled: localRow.swoCreatedToScheduled || sheetRow.swoCreatedToScheduled,
    serviceAppointmentNote: localRow.serviceAppointmentNote || sheetRow.serviceAppointmentNote,
    cleanServiceTaskStatus: localRow.cleanServiceTaskStatus || sheetRow.cleanServiceTaskStatus,
    opportunityStage: localRow.opportunityStage || sheetRow.opportunityStage,
    pipelineState: localRow.pipelineState && localRow.pipelineState !== "NEW_ROW" ? localRow.pipelineState : sheetRow.pipelineState,
    needsReview: localRow.needsReview || sheetRow.needsReview,
    lastError: localRow.lastError || sheetRow.lastError,
    taskMatched: localRow.taskMatched || sheetRow.taskMatched
  };
}

export function listTaskMappingRows(): TaskMappingRow[] {
  const rows = getDb().prepare("SELECT data FROM task_mapping_rows ORDER BY updated_at DESC").all() as { data: string }[];
  return rows.map((row) => JSON.parse(row.data) as TaskMappingRow);
}

export function replaceTaskMappingRows(rows: TaskMappingRow[], source = "live") {
  const database = getDb();
  const now = new Date().toISOString();
  const tx = database.transaction(() => {
    database.prepare("DELETE FROM task_mapping_rows").run();
    const insert = database.prepare(`
      INSERT INTO task_mapping_rows (event_id, data, updated_at) VALUES (@eventId, @data, @updatedAt)
      ON CONFLICT(event_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at
    `);
    for (const row of rows) {
      insert.run({ eventId: row.eventId, data: JSON.stringify(row), updatedAt: now });
    }
    upsertSnapshotMeta("taskMappingRows", { refreshedAt: now, source, error: "" });
  });

  tx();
}

export function upsertTaskMappingRow(row: TaskMappingRow, source = "local") {
  const now = new Date().toISOString();
  getDb().prepare(`
    INSERT INTO task_mapping_rows (event_id, data, updated_at) VALUES (@eventId, @data, @updatedAt)
    ON CONFLICT(event_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at
  `).run({ eventId: row.eventId, data: JSON.stringify(row), updatedAt: now });
  upsertSnapshotMeta("taskMappingRows", { refreshedAt: now, source, error: "" });
}

export function listCalendarEvents(): CalendarEvent[] {
  const rows = getDb().prepare("SELECT data FROM calendar_events ORDER BY start_at ASC").all() as { data: string }[];
  return rows.map((row) => JSON.parse(row.data) as CalendarEvent);
}

export function replaceCalendarEvents(rows: CalendarEvent[], source = "google") {
  const database = getDb();
  const now = new Date().toISOString();
  const safeRows = rows || [];

  const tx = database.transaction(() => {
    database.prepare("DELETE FROM calendar_events").run();
    const insert = database.prepare(`
      INSERT INTO calendar_events (id, technician, calendar_id, start_at, end_at, data, updated_at)
      VALUES (@id, @technician, @calendarId, @start, @end, @data, @updatedAt)
      ON CONFLICT(id) DO UPDATE SET
        technician = excluded.technician,
        calendar_id = excluded.calendar_id,
        start_at = excluded.start_at,
        end_at = excluded.end_at,
        data = excluded.data,
        updated_at = excluded.updated_at
    `);

    for (const row of safeRows) {
      insert.run({
        id: row.id,
        technician: row.technician,
        calendarId: row.calendarId,
        start: row.start,
        end: row.end,
        data: JSON.stringify(row),
        updatedAt: now
      });
    }

    upsertSnapshotMeta("calendarEvents", { refreshedAt: now, source, error: "" });
  });

  tx();
}

export function listTechnicianProfiles(): TechnicianProfile[] {
  const rows = getDb().prepare("SELECT data FROM technician_profiles ORDER BY json_extract(data, '$.sortOrder') ASC, json_extract(data, '$.name') ASC").all() as { data: string }[];
  return rows.map((row) => JSON.parse(row.data) as TechnicianProfile);
}

export function getTechnicianProfile(idOrName: string): TechnicianProfile | null {
  const wanted = technicianSlug(idOrName);
  const direct = getDb().prepare("SELECT data FROM technician_profiles WHERE id = ?").get(wanted) as { data: string } | undefined;
  if (direct) return JSON.parse(direct.data) as TechnicianProfile;

  return listTechnicianProfiles().find((profile) => technicianSlug(profile.name) === wanted) || null;
}

export function upsertTechnicianProfile(input: Partial<TechnicianProfile> & { name: string }): TechnicianProfile {
  const database = getDb();
  const now = new Date().toISOString();
  const existing = input.id ? getTechnicianProfile(input.id) : getTechnicianProfile(input.name);
  const profiles = listTechnicianProfiles();
  const id = technicianSlug(input.id || input.name);

  const profile: TechnicianProfile = {
    id,
    name: safeText(input.name),
    active: input.active !== false,
    role: safeText(input.role) || "Service Technician",
    phone: safeText(input.phone),
    email: normalizeEmail(input.email),
    calendarId: safeText(input.calendarId),
    color: safeText(input.color) || defaultTechnicianColor(profiles.length),
    homeAddress: safeText(input.homeAddress),
    preferredStartAddress: safeText(input.preferredStartAddress),
    serviceAreas: normalizeStringList(input.serviceAreas),
    skills: normalizeStringList(input.skills),
    capacityPerDay: Math.max(1, Math.min(10, Number(input.capacityPerDay || existing?.capacityPerDay || 5))),
    notes: safeText(input.notes),
    sortOrder: Number(input.sortOrder || existing?.sortOrder || profiles.length + 1),
    createdAt: existing?.createdAt || now,
    updatedAt: now
  };

  if (!profile.name) {
    throw new Error("Technician name is required.");
  }

  database.prepare(`
    INSERT INTO technician_profiles (id, data, updated_at) VALUES (@id, @data, @updatedAt)
    ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at
  `).run({ id: profile.id, data: JSON.stringify(profile), updatedAt: now });

  return profile;
}

function normalizeStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => safeText(item)).filter(Boolean);
  }

  return String(value || "")
    .split(/[,;\n]+/)
    .map((item) => safeText(item))
    .filter(Boolean);
}

export function addAuditLog(entry: AuditLogEntry) {
  getDb().prepare(`
    INSERT INTO audit_logs (
      timestamp, user, action, source_row, striven_customer_id, opportunity_id, sales_order_id, task_id, result, error_message, raw_response_preview
    ) VALUES (@timestamp, @user, @action, @sourceRow, @strivenCustomerId, @opportunityId, @salesOrderId, @taskId, @result, @errorMessage, @rawResponsePreview)
  `).run(entry);
}

export function listAuditLogs(): AuditLogEntry[] {
  const rows = getDb().prepare(`
    SELECT
      id, timestamp, user, action, source_row as sourceRow, striven_customer_id as strivenCustomerId,
      opportunity_id as opportunityId, sales_order_id as salesOrderId, task_id as taskId,
      result, error_message as errorMessage, raw_response_preview as rawResponsePreview
    FROM audit_logs
    ORDER BY id DESC
    LIMIT 200
  `).all() as AuditLogEntry[];
  return rows;
}

export function upsertSnapshotMeta(key: string, input: Omit<SnapshotMeta, "key">) {
  getDb().prepare(`
    INSERT INTO snapshot_meta (key, refreshed_at, source, error) VALUES (@key, @refreshedAt, @source, @error)
    ON CONFLICT(key) DO UPDATE SET refreshed_at = excluded.refreshed_at, source = excluded.source, error = excluded.error
  `).run({
    key,
    refreshedAt: input.refreshedAt,
    source: input.source,
    error: input.error || ""
  });
}

export function getSnapshotMeta(key: string): SnapshotMeta | null {
  const row = getDb().prepare(`
    SELECT key, refreshed_at as refreshedAt, source, COALESCE(error, '') as error
    FROM snapshot_meta
    WHERE key = ?
  `).get(key) as SnapshotMeta | undefined;

  return row || null;
}

export function setReportSnapshot(key: string, rows: Record<string, unknown>[], error = "") {
  const now = new Date().toISOString();
  const database = getDb();
  const safeRows = rows || [];
  const tx = database.transaction(() => {
    database.prepare(`
      INSERT INTO report_snapshots (key, data, refreshed_at, error) VALUES (@key, @data, @refreshedAt, @error)
      ON CONFLICT(key) DO UPDATE SET data = excluded.data, refreshed_at = excluded.refreshed_at, error = excluded.error
    `).run({
      key,
      data: JSON.stringify(safeRows),
      refreshedAt: now,
      error
    });

    database.prepare("DELETE FROM report_snapshot_rows WHERE report_key = ?").run(key);
    const insertRow = database.prepare(`
      INSERT INTO report_snapshot_rows (
        report_key, row_index, customer_id, customer_number, email, phone, alt_phone, data
      ) VALUES (@reportKey, @rowIndex, @customerId, @customerNumber, @email, @phone, @altPhone, @data)
    `);

    safeRows.forEach((row, rowIndex) => {
      const lookup = buildReportRowLookup(row);
      insertRow.run({
        reportKey: key,
        rowIndex,
        customerId: lookup.customerId,
        customerNumber: lookup.customerNumber,
        email: lookup.email,
        phone: lookup.phone,
        altPhone: lookup.altPhone,
        data: JSON.stringify(row)
      });
    });
  });

  tx();
}

export function getReportSnapshot(key: string): { rows: Record<string, unknown>[]; meta: SnapshotMeta | null } {
  const row = getDb().prepare(`
    SELECT key, data, refreshed_at as refreshedAt, COALESCE(error, '') as error
    FROM report_snapshots
    WHERE key = ?
  `).get(key) as { key: string; data: string; refreshedAt: string; error: string } | undefined;

  if (!row) return { rows: [], meta: null };

  return {
    rows: JSON.parse(row.data || "[]") as Record<string, unknown>[],
    meta: {
      key: row.key,
      refreshedAt: row.refreshedAt,
      source: "cache",
      error: row.error || ""
    }
  };
}

export function getReportSnapshotMeta(key: string): SnapshotMeta | null {
  const row = getDb().prepare(`
    SELECT key, refreshed_at as refreshedAt, 'cache' as source, COALESCE(error, '') as error
    FROM report_snapshots
    WHERE key = ?
  `).get(key) as SnapshotMeta | undefined;

  return row || null;
}

export function getReportRowsForCustomer(key: string, input: {
  customerId?: unknown;
  customerNumber?: unknown;
  email?: unknown;
  phone?: unknown;
  altPhone?: unknown;
}, limit = 500): Record<string, unknown>[] {
  const clauses: string[] = [];
  const params: Record<string, unknown> = { key, limit };
  const customerId = safeText(input.customerId);
  const customerNumber = safeText(input.customerNumber);
  const email = normalizeEmail(input.email);
  const phone = normalizePhone10(input.phone);
  const altPhone = normalizePhone10(input.altPhone);

  if (customerId) {
    clauses.push("customer_id = @customerId");
    params.customerId = customerId;
  }
  if (customerNumber) {
    clauses.push("customer_number = @customerNumber");
    params.customerNumber = customerNumber;
  }
  if (email) {
    clauses.push("email = @email");
    params.email = email;
  }
  if (phone) {
    clauses.push("(phone = @phone OR alt_phone = @phone)");
    params.phone = phone;
  }
  if (altPhone) {
    clauses.push("(phone = @altPhone OR alt_phone = @altPhone)");
    params.altPhone = altPhone;
  }

  if (!clauses.length) return [];

  const rows = getDb().prepare(`
    SELECT data
    FROM report_snapshot_rows
    WHERE report_key = @key AND (${clauses.join(" OR ")})
    ORDER BY row_index DESC
    LIMIT @limit
  `).all(params) as { data: string }[];

  return rows.map((row) => JSON.parse(row.data) as Record<string, unknown>);
}

function buildReportRowLookup(row: Record<string, unknown>) {
  return {
    customerId: safeText(findValueByAliases(row, ["CustomerId", "Customer ID", "Customer_Id", "CustomerCustomerId"])),
    customerNumber: safeText(findValueByAliases(row, ["CustomerNumber", "Customer Number", "Customer No", "Customer #", "Customer"])),
    email: normalizeEmail(findValueByAliases(row, LOOKUP_ALIASES.email)),
    phone: normalizePhone10(findValueByAliases(row, LOOKUP_ALIASES.phone)),
    altPhone: normalizePhone10(findValueByAliases(row, LOOKUP_ALIASES.altPhone))
  };
}

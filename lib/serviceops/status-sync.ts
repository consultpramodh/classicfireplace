/*
 * 041_Status_Sync.ts
 * One-pass enrichment of cached intake rows from live Striven reports.
 */

import "server-only";
import { listIntakeRows, setReportSnapshot, upsertIntakeRow } from "@/lib/db/repository";
import { findValueByAliases, parseNumericId, safeText } from "@/lib/serviceops/normalization";
import { buildServiceLifecycle } from "@/lib/serviceops/lifecycle";
import type { IntakeRow } from "@/lib/serviceops/types";
import { getCachedReportRows } from "@/lib/serviceops/snapshots";
import { fetchReportRows } from "@/lib/striven/reports";

type WorkOrderIndexEntry = {
  soId: string;
  soNumber: string;
  customerNumber: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  scheduledAt: string;
  inProgressAt: string;
};

type CustomerIndexEntry = {
  customerId: string;
  customerNumber: string;
};

type TaskSummary = {
  taskId: string;
  taskName: string;
  status: string;
  assignedTo: string;
  start: string;
  due: string;
  returnTrip: string;
};

export async function syncIntakeStatusesFromStriven() {
  const [customers, workOrders, serviceTasks] = await Promise.all([
    fetchReportRows("customers", 1000, 200),
    fetchReportRows("serviceWorkOrders", 1000, 20),
    fetchReportRows("serviceTasks", 1000, 20)
  ]);

  setReportSnapshot("customers", customers);
  setReportSnapshot("serviceWorkOrders", workOrders);
  setReportSnapshot("serviceTasks", serviceTasks);

  const customerIndex = buildCustomerIndex(customers);
  const workOrderIndex = buildWorkOrderIndex(workOrders);
  const taskIndex = buildTaskIndex(serviceTasks);
  const rows = listIntakeRows();

  let scanned = 0;
  let updated = 0;
  let matchedSalesOrders = 0;
  let matchedTasks = 0;
  const unmatchedRows: number[] = [];

  rows.forEach((row) => {
    scanned++;
    const before = JSON.stringify({
      salesOrderNumber: row.salesOrderNumber,
      strivenSoId: row.strivenSoId,
      salesOrderStatus: row.salesOrderStatus,
      salesOrderCreatedAt: row.salesOrderCreatedAt,
      salesOrderUpdatedAt: row.salesOrderUpdatedAt,
      salesOrderScheduledAt: row.salesOrderScheduledAt,
      salesOrderInProgressAt: row.salesOrderInProgressAt,
      swoQuotedToInProgress: row.swoQuotedToInProgress,
      swoCreatedToScheduled: row.swoCreatedToScheduled,
      serviceAppointmentNote: row.serviceAppointmentNote,
      cleanServiceTaskStatus: row.cleanServiceTaskStatus,
      taskMatched: row.taskMatched
    });

    const match = findWorkOrderForRow(row, workOrderIndex, customerIndex);
    if (match) {
      if (match.soId) row.strivenSoId = match.soId;
      if (match.soNumber) row.salesOrderNumber = match.soNumber;
      row.salesOrderStatus = match.status || "";
      row.salesOrderCreatedAt = match.createdAt || "";
      row.salesOrderUpdatedAt = match.updatedAt || "";
      row.salesOrderScheduledAt = match.scheduledAt || "";
      row.salesOrderInProgressAt = match.inProgressAt || "";
      matchedSalesOrders++;
    } else {
      row.salesOrderStatus = "";
      row.salesOrderCreatedAt = "";
      row.salesOrderUpdatedAt = "";
      row.salesOrderScheduledAt = "";
      row.salesOrderInProgressAt = "";
    }

    const soNumber = normalizeSo(row.salesOrderNumber || match?.soNumber || "");
    const tasks = soNumber ? taskIndex[soNumber] || [] : [];
    row.cleanServiceTaskStatus = tasks.length ? formatTaskSummary(tasks) : "";
    row.taskMatched = tasks.length > 0;
    if (tasks.length) matchedTasks++;
    if (!match && !tasks.length) unmatchedRows.push(row.sourceRow);

    const primaryTask = tasks[0];
    const lifecycle = buildServiceLifecycle(row, primaryTask ? {
      tech: primaryTask.assignedTo,
      start: primaryTask.start || primaryTask.due,
      taskStatus: primaryTask.status,
      rowStatus: primaryTask.status
    } : null);
    row.swoQuotedToInProgress = lifecycle.quotedToInProgress;
    row.swoCreatedToScheduled = lifecycle.createdToScheduled;
    row.serviceAppointmentNote = lifecycle.appointmentNote;

    const after = JSON.stringify({
      salesOrderNumber: row.salesOrderNumber,
      strivenSoId: row.strivenSoId,
      salesOrderStatus: row.salesOrderStatus,
      salesOrderCreatedAt: row.salesOrderCreatedAt,
      salesOrderUpdatedAt: row.salesOrderUpdatedAt,
      salesOrderScheduledAt: row.salesOrderScheduledAt,
      salesOrderInProgressAt: row.salesOrderInProgressAt,
      swoQuotedToInProgress: row.swoQuotedToInProgress,
      swoCreatedToScheduled: row.swoCreatedToScheduled,
      serviceAppointmentNote: row.serviceAppointmentNote,
      cleanServiceTaskStatus: row.cleanServiceTaskStatus,
      taskMatched: row.taskMatched
    });

    if (before !== after) {
      upsertIntakeRow(row);
      updated++;
    }
  });

  return {
    ok: true,
    scanned,
    updated,
    customersRead: customers.length,
    workOrdersRead: workOrders.length,
    serviceTasksRead: serviceTasks.length,
    matchedSalesOrders,
    matchedTasks,
    unmatchedRows: unmatchedRows.slice(0, 50)
  };
}

export function recheckIntakeStatusFromCachedReports(sourceRow: number) {
  const customers = getCachedReportRows("customers").rows;
  const workOrders = getCachedReportRows("serviceWorkOrders").rows;
  const serviceTasks = getCachedReportRows("serviceTasks").rows;

  if (!workOrders.length && !serviceTasks.length) {
    return {
      ok: false,
      sourceRow,
      updated: 0,
      message: "No cached Striven work order/task reports are available. Refresh Live Data first, then re-check."
    };
  }

  const row = listIntakeRows().find((item) => item.sourceRow === sourceRow);
  if (!row) throw new Error(`No intake row found for source row ${sourceRow}.`);

  const customerIndex = buildCustomerIndex(customers);
  const workOrderIndex = buildWorkOrderIndex(workOrders);
  const taskIndex = buildTaskIndex(serviceTasks);
  const before = JSON.stringify(buildStatusFingerprint(row));
  enrichRowFromIndexes(row, workOrderIndex, customerIndex, taskIndex);
  const after = JSON.stringify(buildStatusFingerprint(row));

  if (before !== after) {
    upsertIntakeRow(row);
  }

  return {
    ok: true,
    sourceRow,
    updated: before !== after ? 1 : 0,
    salesOrderNumber: row.salesOrderNumber,
    salesOrderStatus: row.salesOrderStatus,
    taskMatched: row.taskMatched,
    message: before !== after ? "Request re-checked from cached Striven reports." : "Request already matched the cached Striven reports."
  };
}

function buildCustomerIndex(rows: Record<string, unknown>[]) {
  const byAnyId: Record<string, CustomerIndexEntry> = {};

  rows.forEach((row) => {
    const customerId = String(parseNumericId(findValueByAliases(row, ["CustomerCustomerId", "CustomerId", "Customer ID"])) || "");
    const customerNumber = safeText(findValueByAliases(row, ["CustomerNumber", "Customer Number"]));

    const entry = {
      customerId,
      customerNumber: customerNumber || customerId
    };

    [customerId, customerNumber].filter(Boolean).forEach((key) => {
      byAnyId[String(key)] = entry;
    });
  });

  return { byAnyId };
}

function buildWorkOrderIndex(rows: Record<string, unknown>[]) {
  const bySoId: Record<string, WorkOrderIndexEntry> = {};
  const bySoNumber: Record<string, WorkOrderIndexEntry> = {};
  const byCustomerNumber: Record<string, WorkOrderIndexEntry[]> = {};

  rows.forEach((row) => {
    const entry = {
      soId: String(parseNumericId(findValueByAliases(row, ["SOId", "SalesOrderId", "Sales Order ID", "Id"])) || ""),
      soNumber: normalizeSo(findValueByAliases(row, ["SONumber", "SO Number", "Sales Order Number", "OrderNumber", "SO#"])),
      customerNumber: safeText(findValueByAliases(row, ["CustomerNumber", "Customer Number", "Customer"])),
      status: safeText(findValueByAliases(row, ["SOStatus", "SO Status", "Status", "SalesOrderStatus", "OrderStatus"])),
      createdAt: safeText(findValueByAliases(row, ["CreatedOn", "Created On", "CreatedDate", "OrderDate"])),
      updatedAt: safeText(findValueByAliases(row, ["UpdatedOn", "Updated On", "ModifiedOn", "Modified On", "LastModifiedDate", "Last Modified Date"])),
      scheduledAt: safeText(findValueByAliases(row, ["ServiceWorkOrderScheduledDate", "ScheduledDate", "Scheduled Date"])),
      inProgressAt: safeText(findValueByAliases(row, ["InProgressDate", "In Progress Date", "StatusChangedOn", "Status Changed On", "StatusDate", "Status Date"]))
    };

    if (entry.soId) bySoId[entry.soId] = entry;
    if (entry.soNumber) bySoNumber[entry.soNumber] = entry;
    if (entry.customerNumber) {
      if (!byCustomerNumber[entry.customerNumber]) byCustomerNumber[entry.customerNumber] = [];
      byCustomerNumber[entry.customerNumber].push(entry);
    }
  });

  Object.values(byCustomerNumber).forEach((entries) => {
    entries.sort(compareWorkOrdersNewestFirst);
  });

  return { bySoId, bySoNumber, byCustomerNumber };
}

function buildTaskIndex(rows: Record<string, unknown>[]) {
  const index: Record<string, TaskSummary[]> = {};

  rows.forEach((row) => {
    const type = safeText(findValueByAliases(row, ["Type", "TaskType", "Task Type"]));
    const taskName = safeText(findValueByAliases(row, ["TaskName", "Task Name", "Name"]));
    if (!isCleanServiceTask(type, taskName)) return;

    const soNumber = normalizeSo(findValueByAliases(row, ["SONumber", "SO Number", "Sales Order Number", "OrderNumber", "SO#"]) || taskName);
    if (!soNumber) return;

    if (!index[soNumber]) index[soNumber] = [];
    index[soNumber].push({
      taskId: String(parseNumericId(findValueByAliases(row, ["TaskId", "Task ID", "Id"])) || ""),
      taskName,
      status: safeText(findValueByAliases(row, ["Status", "TaskStatus", "Task Status"])),
      assignedTo: safeText(findValueByAliases(row, ["AssignedTo", "Assigned To"])),
      start: safeText(findValueByAliases(row, ["TaskStartDate", "StartDateTime", "Start Date"])),
      due: safeText(findValueByAliases(row, ["DueDate", "DueDateTime", "Due Date"])),
      returnTrip: safeText(findValueByAliases(row, ["ServiceCleanandServiceReturnTripRequired", "ReturnTripRequired", "Return Trip Required"]))
    });
  });

  Object.values(index).forEach((tasks) => {
    tasks.sort((a, b) => taskSortWeight(a.status) - taskSortWeight(b.status));
  });

  return index;
}

function findWorkOrderForRow(row: IntakeRow, index: ReturnType<typeof buildWorkOrderIndex>, customers: ReturnType<typeof buildCustomerIndex>) {
  const byId = String(parseNumericId(row.strivenSoId) || "");
  if (byId && index.bySoId[byId]) return index.bySoId[byId];

  const byNumber = normalizeSo(row.salesOrderNumber);
  if (byNumber && index.bySoNumber[byNumber]) return index.bySoNumber[byNumber];

  const customerKey = String(parseNumericId(row.strivenCustomerId) || "");
  const customerNumber = customers.byAnyId[customerKey]?.customerNumber || customerKey;
  if (customerNumber && index.byCustomerNumber[customerNumber]?.length) {
    return index.byCustomerNumber[customerNumber][0];
  }

  return null;
}

function enrichRowFromIndexes(row: IntakeRow, workOrderIndex: ReturnType<typeof buildWorkOrderIndex>, customerIndex: ReturnType<typeof buildCustomerIndex>, taskIndex: ReturnType<typeof buildTaskIndex>) {
  const match = findWorkOrderForRow(row, workOrderIndex, customerIndex);
  if (match) {
    if (match.soId) row.strivenSoId = match.soId;
    if (match.soNumber) row.salesOrderNumber = match.soNumber;
    row.salesOrderStatus = match.status || "";
    row.salesOrderCreatedAt = match.createdAt || "";
    row.salesOrderUpdatedAt = match.updatedAt || "";
    row.salesOrderScheduledAt = match.scheduledAt || "";
    row.salesOrderInProgressAt = match.inProgressAt || "";
  } else {
    row.salesOrderStatus = "";
    row.salesOrderCreatedAt = "";
    row.salesOrderUpdatedAt = "";
    row.salesOrderScheduledAt = "";
    row.salesOrderInProgressAt = "";
  }

  const soNumber = normalizeSo(row.salesOrderNumber || match?.soNumber || "");
  const tasks = soNumber ? taskIndex[soNumber] || [] : [];
  row.cleanServiceTaskStatus = tasks.length ? formatTaskSummary(tasks) : "";
  row.taskMatched = tasks.length > 0;

  const primaryTask = tasks[0];
  const lifecycle = buildServiceLifecycle(row, primaryTask ? {
    tech: primaryTask.assignedTo,
    start: primaryTask.start || primaryTask.due,
    taskStatus: primaryTask.status,
    rowStatus: primaryTask.status
  } : null);
  row.swoQuotedToInProgress = lifecycle.quotedToInProgress;
  row.swoCreatedToScheduled = lifecycle.createdToScheduled;
  row.serviceAppointmentNote = lifecycle.appointmentNote;
}

function buildStatusFingerprint(row: IntakeRow) {
  return {
    salesOrderNumber: row.salesOrderNumber,
    strivenSoId: row.strivenSoId,
    salesOrderStatus: row.salesOrderStatus,
    salesOrderCreatedAt: row.salesOrderCreatedAt,
    salesOrderUpdatedAt: row.salesOrderUpdatedAt,
    salesOrderScheduledAt: row.salesOrderScheduledAt,
    salesOrderInProgressAt: row.salesOrderInProgressAt,
    swoQuotedToInProgress: row.swoQuotedToInProgress,
    swoCreatedToScheduled: row.swoCreatedToScheduled,
    serviceAppointmentNote: row.serviceAppointmentNote,
    cleanServiceTaskStatus: row.cleanServiceTaskStatus,
    taskMatched: row.taskMatched
  };
}

function compareWorkOrdersNewestFirst(a: WorkOrderIndexEntry, b: WorkOrderIndexEntry) {
  const aTime = parseDateTime(a.createdAt) || parseDateTime(a.scheduledAt) || Number(a.soNumber) || 0;
  const bTime = parseDateTime(b.createdAt) || parseDateTime(b.scheduledAt) || Number(b.soNumber) || 0;
  return bTime - aTime;
}

function parseDateTime(value: unknown) {
  const text = safeText(value);
  if (!text) return 0;
  const parsed = Date.parse(text);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function normalizeSo(value: unknown) {
  const text = safeText(value);
  const match = text.match(/(\d{4,8})/);
  return match ? match[1] : "";
}

function isCleanServiceTask(type: string, taskName: string) {
  const text = `${type} ${taskName}`.toLowerCase();
  return text.includes("clean") && text.includes("service");
}

function taskSortWeight(status: string) {
  const text = status.toLowerCase();
  if (text.includes("open")) return 1;
  if (text.includes("progress")) return 2;
  if (text.includes("scheduled")) return 3;
  if (text.includes("complete") || text.includes("closed")) return 9;
  return 5;
}

function formatTaskSummary(tasks: TaskSummary[]) {
  return tasks.map((task) => {
    const bits = [
      task.taskId ? `#${task.taskId}` : "",
      task.status || "Unknown",
      task.assignedTo,
      task.start ? `Start ${task.start}` : "",
      task.due ? `Due ${task.due}` : "",
      task.returnTrip ? `Return trip: ${task.returnTrip}` : ""
    ].filter(Boolean);

    return bits.join(" · ");
  }).join(" | ");
}

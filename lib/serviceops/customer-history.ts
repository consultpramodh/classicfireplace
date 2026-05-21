/*
 * 041_Customer_History.ts
 * Consolidated previous-business facade for AI and operator views.
 */

import "server-only";
import { LOOKUP_ALIASES } from "@/lib/config/serviceops-config";
import { getCachedReportRows, getCachedReportRowsForCustomer } from "@/lib/serviceops/snapshots";
import { findValueByAliases, normalizePhone10, parseNumericId, safeText } from "@/lib/serviceops/normalization";

export type CustomerHistory = {
  customerId: string;
  generatedAt: string;
  partial: boolean;
  warnings: string[];
  invoices: InvoiceAssetSerialRecord[];
  installationTasks: InstallationTaskRecord[];
  serviceOrders: ServiceOrderHistoryRecord[];
  assets: AssetHistoryRecord[];
};

export type InvoiceAssetSerialRecord = {
  customerId: string;
  customerName: string;
  invoiceId: string;
  invoiceDate: string;
  salesOrderNumber: string;
  assetId: string;
  assetDescription: string;
  serialNumber: string;
  amount: string;
};

export type InstallationTaskRecord = {
  customerId: string;
  customerName: string;
  taskId: string;
  taskName: string;
  taskType: string;
  taskStatus: string;
  salesOrderNumber: string;
  assignedTo: string;
  scheduledAt: string;
  dueAt: string;
};

export type ServiceOrderHistoryRecord = {
  customerId: string;
  salesOrderId: string;
  salesOrderNumber: string;
  status: string;
  createdAt: string;
  scheduledAt: string;
};

export type AssetHistoryRecord = {
  customerId: string;
  assetId: string;
  assetName: string;
  manufacturer: string;
  model: string;
  serialNumber: string;
  purchasedAt: string;
};

export function getCustomerHistory(input: { customerId?: unknown; customerNumber?: unknown; email?: unknown; phone?: unknown; altPhone?: unknown }): CustomerHistory {
  const customerId = String(parseNumericId(input.customerId || input.customerNumber) || safeText(input.customerNumber));
  const criteria = {
    customerId,
    customerNumber: safeText(input.customerNumber || customerId),
    email: safeText(input.email),
    phone: normalizePhone10(input.phone),
    altPhone: normalizePhone10(input.altPhone)
  };

  const invoiceSource = getCachedReportRowsForCustomer("invoiceAssetsSerials", criteria, 80);
  const installationSource = getCachedReportRowsForCustomer("installationTasks", criteria, 80);
  const serviceOrderSource = getCachedReportRowsForCustomer("serviceWorkOrders", criteria, 80);
  const assetSource = getCachedReportRowsForCustomer("customerAssets", criteria, 80);

  const warnings = [
    invoiceSource.error ? `Invoice/asset/serial report unavailable: ${invoiceSource.error}` : "",
    installationSource.error ? `Installation task report unavailable: ${installationSource.error}` : "",
    serviceOrderSource.error ? `Service work order report unavailable: ${serviceOrderSource.error}` : "",
    assetSource.error ? `Customer asset report unavailable: ${assetSource.error}` : "",
    invoiceSource.stale ? "Invoice/asset/serial report cache is stale." : "",
    installationSource.stale ? "Installation task report cache is stale." : ""
  ].filter(Boolean);

  return {
    customerId,
    generatedAt: new Date().toISOString(),
    partial: warnings.length > 0,
    warnings,
    invoices: invoiceSource.rows.map(mapInvoiceAssetSerial).filter(hasAnyValue),
    installationTasks: installationSource.rows.map(mapInstallationTask).filter(hasAnyValue),
    serviceOrders: serviceOrderSource.rows.map(mapServiceOrderHistory).filter(hasAnyValue),
    assets: assetSource.rows.map(mapAssetHistory).filter(hasAnyValue)
  };
}

export function getInvoicesByCustomer(customerId: unknown) {
  return getCustomerHistory({ customerId }).invoices;
}

export function getInstallationHistory(customerId: unknown) {
  return getCustomerHistory({ customerId }).installationTasks;
}

export function getAssetsBySerial(serialNumber: unknown) {
  const serial = safeText(serialNumber).toLowerCase();
  if (!serial) return [];
  return getCachedReportRows("invoiceAssetsSerials").rows
    .map(mapInvoiceAssetSerial)
    .filter((row) => row.serialNumber.toLowerCase() === serial);
}

function mapInvoiceAssetSerial(row: Record<string, unknown>): InvoiceAssetSerialRecord {
  return {
    customerId: idText(findValueByAliases(row, LOOKUP_ALIASES.customerId)),
    customerName: safeText(findValueByAliases(row, LOOKUP_ALIASES.customerName)),
    invoiceId: safeText(findValueByAliases(row, LOOKUP_ALIASES.invoiceId)),
    invoiceDate: safeText(findValueByAliases(row, LOOKUP_ALIASES.invoiceDate)),
    salesOrderNumber: safeText(findValueByAliases(row, LOOKUP_ALIASES.salesOrderNumber)),
    assetId: idText(findValueByAliases(row, LOOKUP_ALIASES.customerAssetId)),
    assetDescription: safeText(findValueByAliases(row, [...LOOKUP_ALIASES.assetName, "Description", "AssetDescription", "Asset Description"])),
    serialNumber: safeText(findValueByAliases(row, LOOKUP_ALIASES.serialNumber)),
    amount: safeText(findValueByAliases(row, ["Amount", "InvoiceAmount", "Invoice Amount", "Total", "InvoiceTotal"]))
  };
}

function mapInstallationTask(row: Record<string, unknown>): InstallationTaskRecord {
  return {
    customerId: idText(findValueByAliases(row, LOOKUP_ALIASES.customerId)),
    customerName: safeText(findValueByAliases(row, LOOKUP_ALIASES.customerName)),
    taskId: idText(findValueByAliases(row, ["TaskId", "Task ID", "Id"])),
    taskName: safeText(findValueByAliases(row, ["TaskName", "Task Name", "Name", "Title"])),
    taskType: safeText(findValueByAliases(row, ["Type", "TaskType", "Task Type"])),
    taskStatus: safeText(findValueByAliases(row, ["Status", "TaskStatus", "Task Status"])),
    salesOrderNumber: safeText(findValueByAliases(row, LOOKUP_ALIASES.salesOrderNumber)),
    assignedTo: safeText(findValueByAliases(row, ["AssignedTo", "Assigned To", "Technician", "Resource"])),
    scheduledAt: safeText(findValueByAliases(row, ["ScheduledDate", "Scheduled Date", "StartDateTime", "Start Date"])),
    dueAt: safeText(findValueByAliases(row, ["DueDate", "DueDateTime", "Due Date"]))
  };
}

function mapServiceOrderHistory(row: Record<string, unknown>): ServiceOrderHistoryRecord {
  return {
    customerId: idText(findValueByAliases(row, LOOKUP_ALIASES.customerId)),
    salesOrderId: idText(findValueByAliases(row, LOOKUP_ALIASES.salesOrderId)),
    salesOrderNumber: safeText(findValueByAliases(row, LOOKUP_ALIASES.salesOrderNumber)),
    status: safeText(findValueByAliases(row, ["Status", "SOStatus", "SO Status", "SalesOrderStatus", "OrderStatus"])),
    createdAt: safeText(findValueByAliases(row, ["CreatedOn", "Created On", "CreatedDate", "OrderDate"])),
    scheduledAt: safeText(findValueByAliases(row, ["ServiceWorkOrderScheduledDate", "ScheduledDate", "Scheduled Date"]))
  };
}

function mapAssetHistory(row: Record<string, unknown>): AssetHistoryRecord {
  return {
    customerId: idText(findValueByAliases(row, LOOKUP_ALIASES.customerId)),
    assetId: idText(findValueByAliases(row, LOOKUP_ALIASES.customerAssetId)),
    assetName: safeText(findValueByAliases(row, LOOKUP_ALIASES.assetName)),
    manufacturer: safeText(findValueByAliases(row, LOOKUP_ALIASES.manufacturerName)),
    model: safeText(findValueByAliases(row, LOOKUP_ALIASES.modelNumber)),
    serialNumber: safeText(findValueByAliases(row, LOOKUP_ALIASES.serialNumber)),
    purchasedAt: safeText(findValueByAliases(row, LOOKUP_ALIASES.datePurchased))
  };
}

function idText(value: unknown) {
  return String(parseNumericId(value) || safeText(value));
}

function hasAnyValue<T extends Record<string, string>>(row: T) {
  return Object.values(row).some((value) => safeText(value));
}

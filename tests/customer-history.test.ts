import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

let tempDir = "";

beforeAll(() => {
  tempDir = mkdtempSync(join(tmpdir(), "serviceops-history-"));
  process.env.DATABASE_URL = `file:${join(tempDir, "history.sqlite")}`;
});

afterAll(() => {
  if (!tempDir) return;
  try {
    rmSync(tempDir, { recursive: true, force: true });
  } catch {
    // better-sqlite3 can briefly hold the handle on Windows after test completion.
  }
});

describe("customer previous business history", () => {
  it("aggregates invoices, serials, installation tasks, service orders, and assets by customer", async () => {
    const { setReportSnapshot } = await import("../lib/db/repository");
    const { getCustomerHistory, getAssetsBySerial } = await import("../lib/serviceops/customer-history");

    setReportSnapshot("invoiceAssetsSerials", [{
      CustomerId: "61383",
      CustomerName: "Randy Vandekerckhove",
      InvoiceNumber: "INV-1001",
      InvoiceDate: "2025-10-15",
      "SO Number": "SO-582869",
      AssetId: "125",
      AssetName: "Vermont Castings",
      "Serial Number": "VC-12345",
      Amount: "499.00"
    }]);
    setReportSnapshot("installationTasks", [{
      CustomerId: "61383",
      CustomerName: "Randy Vandekerckhove",
      TaskId: "16910",
      TaskName: "Installation Follow-up",
      TaskStatus: "Open",
      "SO Number": "SO-582869",
      Technician: "Chris",
      ScheduledDate: "2026-05-22T14:00:00.000Z"
    }]);
    setReportSnapshot("serviceWorkOrders", [{
      CustomerId: "61383",
      SalesOrderId: "24499",
      OrderNumber: "SO-582869",
      Status: "In Progress",
      ScheduledDate: "2026-05-22T14:00:00.000Z"
    }]);
    setReportSnapshot("customerAssets", [{
      CustomerId: "61383",
      AssetId: "125",
      AssetName: "Vermont Castings",
      ManufacturerName: "Vermont Castings",
      ModelNumber: "GDI-30N",
      SerialNumber: "VC-12345"
    }]);

    const history = getCustomerHistory({ customerId: "61383" });

    expect(history.partial).toBe(false);
    expect(history.invoices[0]).toMatchObject({
      customerId: "61383",
      invoiceId: "INV-1001",
      salesOrderNumber: "SO-582869",
      assetId: "125",
      serialNumber: "VC-12345"
    });
    expect(history.installationTasks[0]).toMatchObject({
      taskId: "16910",
      taskStatus: "Open",
      assignedTo: "Chris"
    });
    expect(history.serviceOrders[0]).toMatchObject({
      salesOrderId: "24499",
      status: "In Progress"
    });
    expect(history.assets[0]).toMatchObject({
      assetId: "125",
      model: "GDI-30N"
    });
    expect(getAssetsBySerial("VC-12345")).toHaveLength(1);
  });
});

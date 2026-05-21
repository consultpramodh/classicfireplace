import { NextResponse } from "next/server";
import { addAuditLog, listAuditLogs } from "@/lib/db/repository";

export async function GET() {
  return NextResponse.json({ rows: listAuditLogs() });
}

export async function POST(request: Request) {
  const body = await request.json();
  const issues = Array.isArray(body.issues) ? body.issues.map(String).filter(Boolean) : [];
  const details = String(body.details || "").trim();
  const preview = {
    requestId: String(body.requestId || ""),
    reportedFields: issues,
    details
  };

  addAuditLog({
    timestamp: new Date().toISOString(),
    user: "operator",
    action: "operator_report_issue",
    sourceRow: Number(body.sourceRow || 0) || null,
    strivenCustomerId: String(body.strivenCustomerId || ""),
    opportunityId: String(body.opportunityId || ""),
    salesOrderId: String(body.salesOrderId || ""),
    taskId: String(body.taskId || ""),
    result: issues.length ? issues.join(", ") : "Details entered",
    errorMessage: details,
    rawResponsePreview: JSON.stringify(preview).slice(0, 2000)
  });

  return NextResponse.json({ ok: true, message: "Report saved to audit log." });
}

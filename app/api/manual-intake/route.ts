import { NextRequest, NextResponse } from "next/server";
import { addAuditLog, createManualIntakeRow } from "@/lib/db/repository";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const row = createManualIntakeRow({
      channel: String(body.channel || "Manual"),
      firstName: String(body.customerName || body.firstName || ""),
      phone: String(body.phone || ""),
      email: String(body.email || ""),
      street: String(body.address || body.street || ""),
      city: String(body.city || ""),
      preferredDays: String(body.preferredDays || ""),
      makeModelAge: String(body.requestType || ""),
      details: String(body.details || "")
    });

    addAuditLog({
      timestamp: new Date().toISOString(),
      user: "local-user",
      action: "manual_intake_create",
      sourceRow: row.sourceRow,
      strivenCustomerId: "",
      opportunityId: "",
      salesOrderId: "",
      taskId: "",
      result: "ok",
      errorMessage: "",
      rawResponsePreview: JSON.stringify({ channel: body.channel || "Manual" }).slice(0, 2000)
    });

    return NextResponse.json({ ok: true, row, message: "Request added." });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, message }, { status: 400 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { runServiceOpsAction } from "@/lib/serviceops/actions";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const result = await runServiceOpsAction(String(body.action || ""), body.sourceRow ? Number(body.sourceRow) : undefined, body);
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}

import { NextResponse } from "next/server";
import { getSystemReadiness } from "@/lib/serviceops/system-readiness";

export const runtime = "nodejs";

export function GET() {
  const readiness = getSystemReadiness();
  return NextResponse.json({
    ok: readiness.ok,
    service: "CF ServiceOps",
    readiness,
    openaiConfigured: Boolean(process.env.OPENAI_API_KEY),
    modelMain: process.env.OPENAI_MODEL_MAIN || process.env.OPENAI_MODEL_STRONG || "gpt-5.5",
    modelFast: process.env.OPENAI_MODEL_FAST || "gpt-5.4-mini",
    calendarDomain: readiness.allowedCalendarOrganizerDomain,
    streamingAuthConfigured: Boolean(process.env.SERVICEOPS_AGENT_SHARED_SECRET)
  });
}

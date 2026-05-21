import { NextRequest, NextResponse } from "next/server";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const editableKeys = new Set([
  "STRIVEN_BASE_URL",
  "STRIVEN_CLIENT_ID",
  "STRIVEN_CLIENT_SECRET",
  "STRIVEN_OPPORTUNITY_TYPE_ID",
  "STRIVEN_OPPORTUNITY_CATEGORY_ID_WEBFORM",
  "STRIVEN_MARKETING_CONSENT_CF_ID",
  "SPREADSHEET_ID",
  "TEST_MODE",
  "SERVICEOPS_READ_ONLY",
  "STRIVEN_CUSTOMER_REPORT_API_KEY",
  "Striven_CustomerLocations_ReportAPI",
  "SERVICEOPS_CUSTOMER_ASSETS_REPORT_URL",
  "STRIVEN_SERVICE_WO_REPORT_API",
  "SERVICE_TASKS_REPORT_URL",
  "STRIVEN_OPPORTUNITY_REPORT_API_KEY",
  "CALENDAR_ALLOWED_ORGANIZER_DOMAIN",
  "GOOGLE_CALENDAR_API_KEY",
  "GOOGLE_CALENDAR_TECHNICIANS_JSON",
  "OPENROUTER_API_KEY",
  "OPENAI_API_KEY",
  "GOOGLE_MAPS_API_KEY",
  "TWILIO_SID",
  "TWILIO_AUTH_TOKEN"
]);

const secretKeys = new Set([
  "STRIVEN_CLIENT_ID",
  "STRIVEN_CLIENT_SECRET",
  "STRIVEN_CUSTOMER_REPORT_API_KEY",
  "Striven_CustomerLocations_ReportAPI",
  "SERVICEOPS_CUSTOMER_ASSETS_REPORT_URL",
  "STRIVEN_SERVICE_WO_REPORT_API",
  "SERVICE_TASKS_REPORT_URL",
  "STRIVEN_OPPORTUNITY_REPORT_API_KEY",
  "GOOGLE_CALENDAR_API_KEY",
  "GOOGLE_CALENDAR_TECHNICIANS_JSON",
  "OPENROUTER_API_KEY",
  "OPENAI_API_KEY",
  "GOOGLE_MAPS_API_KEY",
  "TWILIO_SID",
  "TWILIO_AUTH_TOKEN"
]);

const envPath = path.join(process.cwd(), ".env.local");

export async function GET() {
  const env = await readEnvFile();
  const out: Record<string, string | boolean> = {};
  for (const key of editableKeys) {
    if (secretKeys.has(key)) {
      out[`${key}_CONFIGURED`] = Boolean(env[key]);
    } else {
      out[key] = env[key] || "";
    }
  }
  return NextResponse.json(out);
}

export async function POST(request: NextRequest) {
  const input = await request.json() as Record<string, unknown>;
  const env = await readEnvFile();

  for (const key of editableKeys) {
    if (Object.prototype.hasOwnProperty.call(input, key)) {
      const value = String(input[key] || "");
      if (!secretKeys.has(key) || value) {
        env[key] = value;
      }
    }
  }

  await writeEnvFile(env);
  return NextResponse.json({ ok: true, message: "Saved backend config to .env.local. Restart the server for process env changes to apply." });
}

async function readEnvFile() {
  const env: Record<string, string> = {};
  try {
    const text = await readFile(envPath, "utf8");
    for (const line of text.split(/\r?\n/)) {
      const match = line.match(/^([^#=\s]+)=(.*)$/);
      if (match) env[match[1]] = match[2];
    }
  } catch {
  }
  return env;
}

async function writeEnvFile(env: Record<string, string>) {
  const lines = Object.entries(env).map(([key, value]) => `${key}=${value}`);
  await writeFile(envPath, `${lines.join("\n")}\n`, "utf8");
}

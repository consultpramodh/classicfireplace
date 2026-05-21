import { CALENDAR_TECHNICIANS, STRIVEN, getCalendarTechnicians, getEnv } from "@/lib/config/serviceops-config";

export type ReadinessStatus = "ready" | "warning" | "blocked";

export type ReadinessCheck = {
  id: string;
  label: string;
  group: string;
  status: ReadinessStatus;
  required: boolean;
  configured: boolean;
  message: string;
};

export type SystemReadinessReport = {
  ok: boolean;
  status: ReadinessStatus;
  generatedAt: string;
  writeMode: "read-only" | "live-write-enabled";
  allowedCalendarOrganizerDomain: string;
  checks: ReadinessCheck[];
  groups: {
    group: string;
    status: ReadinessStatus;
    ready: number;
    total: number;
  }[];
};

const REQUIRED_REPORTS = [
  ["reportCustomers", "Customers report URL/API key"],
  ["reportCustomerLocations", "Customer locations report URL/API key"],
  ["reportServiceWorkOrders", "Service work orders report URL/API key"],
  ["reportServiceTasks", "Service tasks report URL/API key"],
  ["reportOpportunities", "Opportunities report URL/API key"],
  ["reportCustomerAssets", "Customer assets report URL/API key"]
] as const;

export function getSystemReadiness(): SystemReadinessReport {
  const env = getEnv();
  const allowedDomain = getAllowedCalendarOrganizerDomain();
  const techs = getCalendarTechnicians();
  const checks: ReadinessCheck[] = [
    checkValue("spreadsheetId", "Production spreadsheet ID", "Google Sheets", env.spreadsheetId, true, "SPREADSHEET_ID is required for deployed reads and writes."),
    checkValue("strivenBaseUrl", "Striven base URL", "Striven Auth", env.strivenBaseUrl, true, "STRIVEN_BASE_URL must point to the Striven API."),
    checkValue("strivenClientId", "Striven client ID", "Striven Auth", env.strivenClientId, true, "STRIVEN_CLIENT_ID is required for OAuth."),
    checkValue("strivenClientSecret", "Striven client secret", "Striven Auth", env.strivenClientSecret, true, "STRIVEN_CLIENT_SECRET is required for OAuth."),
    checkNumber("opportunityType", "Opportunity type ID", "Striven Constants", env.strivenOpportunityTypeId, true, "STRIVEN_OPPORTUNITY_TYPE_ID must be configured."),
    checkNumber("opportunityCategory", "Webform opportunity category ID", "Striven Constants", env.strivenOpportunityCategoryIdWebform, true, "STRIVEN_OPPORTUNITY_CATEGORY_ID_WEBFORM must be configured."),
    checkNumber("salesOrderType", "Sales order type ID", "Striven Constants", STRIVEN.serviceSalesOrder.orderTypeId, true, "Service sales order constants are present in code."),
    checkNumber("serviceItem", "Service item ID", "Striven Constants", STRIVEN.serviceSalesOrder.serviceItemId, true, "Service item constant is present in code."),
    checkValue("calendarOrganizer", "Allowed calendar organizer domain", "Technician Calendar", allowedDomain, true, "Only events created by the allowed company domain are operational."),
    {
      id: "calendarTechnicians",
      label: "Technician calendars",
      group: "Technician Calendar",
      status: techs.length >= CALENDAR_TECHNICIANS.length ? "ready" : techs.length ? "warning" : "blocked",
      required: true,
      configured: techs.length > 0,
      message: techs.length
        ? `${techs.length} technician calendar${techs.length === 1 ? "" : "s"} configured.`
        : "No technician calendars are configured."
    },
    {
      id: "writeMode",
      label: "Write mode",
      group: "Operational Safety",
      status: env.readOnly ? "ready" : "warning",
      required: true,
      configured: true,
      message: env.readOnly
        ? "SERVICEOPS_READ_ONLY is enabled; live writes are blocked."
        : "Live writes are enabled. Use only after gates and idempotency are verified."
    },
    checkValue("openai", "OpenAI assistant key", "AI Assistant", env.openaiApiKey, false, "Optional. Assistant remains read-only until workflow gates are verified.")
  ];

  for (const [key, label] of REQUIRED_REPORTS) {
    checks.push(checkValue(key, label, "Striven Reports", String(env[key] || ""), true, `${label} is required for cache refresh and matching.`));
  }

  const groups = summarizeGroups(checks);
  const status = checks.some((check) => check.required && check.status === "blocked")
    ? "blocked"
    : checks.some((check) => check.status === "warning")
      ? "warning"
      : "ready";

  return {
    ok: status !== "blocked",
    status,
    generatedAt: new Date().toISOString(),
    writeMode: env.readOnly ? "read-only" : "live-write-enabled",
    allowedCalendarOrganizerDomain: allowedDomain,
    checks,
    groups
  };
}

function checkValue(id: string, label: string, group: string, value: string, required: boolean, message: string): ReadinessCheck {
  const configured = String(value || "").trim().length > 0;
  return {
    id,
    label,
    group,
    status: configured ? "ready" : required ? "blocked" : "warning",
    required,
    configured,
    message: configured ? "Configured." : message
  };
}

function checkNumber(id: string, label: string, group: string, value: number, required: boolean, message: string): ReadinessCheck {
  const configured = Number.isFinite(value) && value > 0;
  return {
    id,
    label,
    group,
    status: configured ? "ready" : required ? "blocked" : "warning",
    required,
    configured,
    message: configured ? `Configured as ${value}.` : message
  };
}

function summarizeGroups(checks: ReadinessCheck[]) {
  const map = new Map<string, ReadinessCheck[]>();
  for (const check of checks) map.set(check.group, [...(map.get(check.group) || []), check]);
  return [...map.entries()].map(([group, items]) => {
    const status: ReadinessStatus = items.some((item) => item.required && item.status === "blocked")
      ? "blocked"
      : items.some((item) => item.status === "warning")
        ? "warning"
        : "ready";
    return {
      group,
      status,
      ready: items.filter((item) => item.configured).length,
      total: items.length
    };
  });
}

function getAllowedCalendarOrganizerDomain() {
  return (process.env.CALENDAR_ALLOWED_ORGANIZER_DOMAIN || process.env.SERVICEOPS_ALLOWED_CALENDAR_DOMAIN || "@classicfireplace.ca").trim();
}

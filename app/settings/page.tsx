/*
 * 029_Settings_Page.tsx
 */

import { AppFrame } from "@/components/app-frame";
import { PageHeader } from "@/components/page-header";
import { getCalendarTechnicians, getEnv } from "@/lib/config/serviceops-config";

export default function SettingsPage() {
  const env = getEnv();
  const settings = [
    ["Demo Mode", env.demoMode ? "On" : "Off"],
    ["Read Only", env.readOnly ? "On" : "Off"],
    ["Database", env.databaseUrl],
    ["Striven API Base URL", env.strivenBaseUrl],
    ["Striven Web Base URL", env.strivenWebBaseUrl],
    ["Customer URL Template", env.strivenCustomerUrlTemplate],
    ["Opportunity URL Template", env.strivenOpportunityUrlTemplate],
    ["Sales Order URL Template", env.strivenSalesOrderUrlTemplate],
    ["Striven Client ID", env.strivenClientId ? "Configured" : "Missing"],
    ["Striven Client Secret", env.strivenClientSecret ? "Configured" : "Missing"],
    ["Google Client ID", env.googleClientId ? "Configured" : "Missing"],
    ["Google Client Secret", env.googleClientSecret ? "Configured" : "Missing"],
    ["Google Calendar API Key", env.googleCalendarApiKey ? "Configured" : "Missing"],
    ["Technician Calendars", `${getCalendarTechnicians().length} configured`],
    ["OpenAI API Key", env.openaiApiKey ? "Configured" : "Missing"]
  ];

  return (
    <AppFrame>
      <PageHeader title="Settings" description="Runtime configuration and connection readiness. Secrets are never exposed to the browser." />
      <section className="panel">
        <div className="panel-header"><h3>Environment</h3><span className="badge info">Server-side</span></div>
        <div className="settings-list">
          {settings.map(([label, value]) => (
            <div className="kv" key={label}><span>{label}</span><strong>{value}</strong></div>
          ))}
        </div>
      </section>
    </AppFrame>
  );
}

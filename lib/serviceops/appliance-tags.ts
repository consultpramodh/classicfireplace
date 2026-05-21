import type { IntakeRow } from "@/lib/serviceops/types";

export type ApplianceInstallTag = {
  key: "classic_install" | "customer_reported_install" | "install_source_unknown";
  label: string;
  detail: string;
  trackable: boolean;
  installedOn?: string;
  invoiceId?: string;
  invoiceDate?: string;
  assetId?: string;
  assetDescription?: string;
  serialNumber?: string;
};

export type ApplianceHistoryInput = {
  invoices?: {
    invoiceId?: string;
    invoiceDate?: string;
    assetId?: string;
    assetDescription?: string;
    serialNumber?: string;
  }[];
  assets?: {
    assetId?: string;
    assetName?: string;
    manufacturer?: string;
    model?: string;
    serialNumber?: string;
  }[];
};

export function deriveApplianceInstallTag(row: Pick<IntakeRow, "makeModelAge">, history?: ApplianceHistoryInput): ApplianceInstallTag {
  const applianceText = String(row.makeModelAge || "").trim();
  const hasInstallRecord = /\binstalled\b/i.test(applianceText);
  const invoice = findBestInvoiceForAppliance(applianceText, history);

  if (invoice) {
    return {
      key: "classic_install",
      label: "Classic install",
      detail: invoice?.invoiceId ? `Install invoice ${invoice.invoiceId}` : "Install invoice not found in cache",
      trackable: true,
      installedOn: parseInstalledDate(applianceText) || invoice?.invoiceDate,
      invoiceId: invoice?.invoiceId,
      invoiceDate: invoice?.invoiceDate,
      assetId: invoice?.assetId,
      assetDescription: invoice?.assetDescription,
      serialNumber: invoice?.serialNumber
    };
  }

  if (hasInstallRecord) {
    return {
      key: "customer_reported_install",
      label: "Customer-entered install date",
      detail: "Not verified in Classic invoice history",
      trackable: false,
      installedOn: parseInstalledDate(applianceText)
    };
  }

  return {
    key: "install_source_unknown",
    label: "Install source unknown",
    detail: "Track separately from Classic installs",
    trackable: false
  };
}

function findBestInvoiceForAppliance(applianceText: string, history?: ApplianceHistoryInput) {
  const invoices = history?.invoices || [];
  if (!invoices.length) return undefined;

  const normalizedAppliance = normalizeText(applianceText);
  const scored = invoices
    .map((invoice) => {
      const assetText = normalizeText(`${invoice.assetDescription || ""} ${invoice.serialNumber || ""}`);
      const score = scoreTextOverlap(normalizedAppliance, assetText);
      return { invoice, score };
    })
    .sort((a, b) => b.score - a.score);

  return scored[0]?.score > 0 ? scored[0].invoice : invoices[0];
}

function normalizeText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function scoreTextOverlap(left: string, right: string) {
  if (!left || !right) return 0;
  const rightTokens = new Set(right.split(/\s+/).filter((token) => token.length > 2));
  return left.split(/\s+/).filter((token) => token.length > 2 && rightTokens.has(token)).length;
}

function parseInstalledDate(value: string) {
  const match = value.match(/\binstalled\s+([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s*(\d{4})\b/i);
  if (!match) return "";
  const [, monthName, day, year] = match;
  const parsed = new Date(`${monthName} ${day}, ${year}`);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString();
}

import { describe, expect, it } from "vitest";
import { deriveApplianceInstallTag } from "@/lib/serviceops/appliance-tags";

describe("deriveApplianceInstallTag", () => {
  it("marks appliance records with an installation stamp as Classic installs", () => {
    const tag = deriveApplianceInstallTag(
      { makeModelAge: "Valor Horizon 534JN. Installed Aug. 26,2015" },
      { invoices: [{ invoiceId: "INV-1001", invoiceDate: "2025-10-15", assetId: "125", assetDescription: "Valor Horizon 534JN", serialNumber: "VH-55" }] }
    );

    expect(tag).toMatchObject({
      key: "classic_install",
      label: "Classic install",
      trackable: true,
      invoiceId: "INV-1001",
      assetId: "125"
    });
  });

  it("keeps unstamped appliance records in the unknown install-source bucket", () => {
    const tag = deriveApplianceInstallTag({ makeModelAge: "Napoleon B36, 8 years" });

    expect(tag).toMatchObject({
      key: "install_source_unknown",
      label: "Install source unknown",
      trackable: false
    });
  });

  it("does not mark customer-entered install text as a verified Classic install", () => {
    const tag = deriveApplianceInstallTag({ makeModelAge: "Valor Horizon 534JN. Installed Aug. 26,2015" });

    expect(tag).toMatchObject({
      key: "customer_reported_install",
      label: "Customer-entered install date",
      trackable: false
    });
    expect(tag.installedOn).toBeTruthy();
    expect(tag.invoiceId).toBeUndefined();
  });
});

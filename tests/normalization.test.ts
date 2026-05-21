import { describe, expect, it } from "vitest";
import { normalizeEmail, normalizePhone10, normalizePostal, normalizeStreet, parseNumericId } from "../lib/serviceops/normalization";
import { hasUsableIdentity } from "../lib/serviceops/rules";

describe("customer identity normalization", () => {
  it("normalizes email, phone, postal code, street, and numeric IDs", () => {
    expect(normalizeEmail(" DANA@Example.COM ")).toBe("dana@example.com");
    expect(normalizePhone10("+1 (416) 555-0134 ext 9")).toBe("4165550134");
    expect(normalizePostal("m5c 1g8")).toBe("M5C1G8");
    expect(normalizeStreet(" 44 King St. E, #2 ")).toBe("44 king st e 2");
    expect(parseNumericId("61142 - old note")).toBe(61142);
  });

  it("requires at least email, phone, alt phone, or street plus city", () => {
    expect(hasUsableIdentity({ email: "", phone: "", altPhone: "", street: "44 King", city: "" })).toBe(false);
    expect(hasUsableIdentity({ email: "", phone: "", altPhone: "", street: "44 King", city: "Toronto" })).toBe(true);
    expect(hasUsableIdentity({ email: "", phone: "(905) 555-0101", altPhone: "", street: "", city: "" })).toBe(true);
  });
});

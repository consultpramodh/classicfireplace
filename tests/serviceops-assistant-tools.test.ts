import { describe, expect, it } from "vitest";
import {
  checkRequestReadinessFromContext,
  classifyRequestStatusFromContext,
  extractRequestFactsFromContext,
  inspectCalendarEventContext,
  scoreCustomerMatchFromContext
} from "../lib/agents/serviceops-assistant-tools";

describe("CF ServiceOps Assistant tools", () => {
  it("extracts request facts from messy service context", () => {
    const facts = extractRequestFactsFromContext({
      applianceDisplay: "Napoleon IR36GN - 20 yrs",
      issue: "Annual service and pilot will not stay lit",
      contact: { phone: "416-555-0100" },
      locationDisplay: "Scarborough"
    });

    expect(facts.issueType).toBe("maintenance");
    expect(facts.manufacturer).toBe("napoleon");
    expect(facts.model).toBe("IR36GN");
    expect(facts.ageRange).toBe("20+ years");
    expect(facts.urgency).toBe("medium");
  });

  it("uses weighted customer matching thresholds", () => {
    const result = scoreCustomerMatchFromContext({
      customerDisplay: "Ron Metrick",
      locationDisplay: "10 Main St, Scarborough",
      contact: { email: "ron@example.com", phone: "4165550100" },
      candidates: [{
        customerId: 101,
        name: "Ron Metrick",
        email: "ron@example.com",
        phone: "416-555-0100",
        address: "10 Main St, Scarborough"
      }]
    });

    expect(result.confidenceScore).toBeGreaterThanOrEqual(90);
    expect(result.recommendedResolution).toBe("auto-match");
    expect(result.matchedSignals).toContain("Exact Email");
    expect(result.matchedSignals).toContain("Exact Phone");
  });

  it("blocks readiness when identity and location are unresolved", () => {
    const result = checkRequestReadinessFromContext({
      issue: "Annual service",
      warnings: ["possible duplicate"]
    });

    expect(result.readinessStatus).toBe("blocked");
    expect(result.blockers).toContain("customer not resolved");
    expect(result.blockers).toContain("service location missing");
    expect(result.blockers).toContain("unresolved blocker or duplicate concern");
  });

  it("classifies status and lane from operational context", () => {
    const result = classifyRequestStatusFromContext({
      lane: "Review Queue",
      raw: { requestStatus: "Waiting Parts" }
    });

    expect(result.requestStatus).toBe("Waiting Parts");
    expect(result.lane).toBe("Review Queue");
  });

  it("filters calendar events by Classic Fireplace creator or organizer", () => {
    expect(inspectCalendarEventContext({
      creatorEmail: "dispatcher@classicfireplace.ca",
      organizerEmail: "contractor@gmail.com"
    }).isVisible).toBe(true);

    expect(inspectCalendarEventContext({
      creatorEmail: "contractor@gmail.com",
      organizerEmail: "contractor@gmail.com"
    }).isVisible).toBe(false);

    expect(inspectCalendarEventContext({
      creatorEmail: "contractor@gmail.com",
      organizerEmail: "service@classicfireplace.ca"
    }).isVisible).toBe(true);

    expect(inspectCalendarEventContext({
      creatorEmail: "external@example.com",
      organizerEmail: "other@example.com"
    }).reason).toBe("Event not created or organized by Classic Fireplace domain.");
  });
});

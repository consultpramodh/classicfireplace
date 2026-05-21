import type { CalendarEvent, ServiceRequest, StrivenTask } from "@/lib/types";

const baseTimeline = (action: string, note: string) => [
  { at: "2026-05-04T13:20:00.000Z", actor: "Webform", action: "Intake received", note },
  { at: "2026-05-04T13:21:00.000Z", actor: "AI assistant", action, note: "Assistant suggestion only. Human operator remains final decision-maker." }
];

export const demoRequests: ServiceRequest[] = [
  {
    id: "REQ-1001",
    receivedAt: "2026-05-04T13:20:00.000Z",
    state: "NEW",
    customerName: "Ava Bennett",
    email: "ava.bennett@example.com",
    phone: "905-555-0108",
    altPhone: "416-555-0188",
    address: "42 Glenwood Ave",
    city: "Burlington",
    province: "ON",
    postalCode: "L7R 3X5",
    preferredDays: ["Tuesday", "Friday"],
    makeModelAge: "Valor G4, 7 years",
    serviceDetails: "Pilot lights then drops out after several minutes.",
    anythingElse: "Gate code 2149. Please call before arrival.",
    striven: { customerStatusId: 2, serviceItemPrice: 189 },
    ai: { classification: "Gas fireplace service", confidence: 0.91, summary: "Likely thermocouple or pilot assembly issue.", suggestedNextStep: "Resolve customer and location." },
    normalized: { firstName: "Ava", lastName: "Bennett", primaryPhone: "905-555-0108", fullAddress: "42 Glenwood Ave, Burlington, ON L7R 3X5", generatedOpportunityTitle: "Webform: Ava Bennett - Burlington - 905-555-0108" },
    matchCandidates: [{ customerId: 78211, locationId: 9912, name: "Ava Bennett", confidence: 87, reason: "Phone and postal code match historical service record.", contactStatus: "matched", locationStatus: "matched" }],
    reviewIssues: [],
    timeline: baseTimeline("Classified request", "New webform request awaiting customer resolution.")
  },
  {
    id: "REQ-1002",
    receivedAt: "2026-05-04T12:44:00.000Z",
    state: "CUSTOMER_RESOLVED",
    customerName: "Noah Wilson",
    email: "noah.wilson@example.com",
    phone: "289-555-0144",
    altPhone: "905-555-0112",
    address: "19 King St E",
    city: "Hamilton",
    province: "ON",
    postalCode: "L8N 1A1",
    preferredDays: ["Monday"],
    makeModelAge: "Napoleon Vector, 3 years",
    serviceDetails: "Annual maintenance and glass cleaning.",
    anythingElse: "Customer prefers morning.",
    striven: { customerId: 78144, locationId: 8841, customerStatusId: 2, serviceItemPrice: 189 },
    ai: { classification: "Maintenance", confidence: 0.96, summary: "Routine annual service request.", suggestedNextStep: "Create opportunity with webform category 1299." },
    normalized: { firstName: "Noah", lastName: "Wilson", primaryPhone: "289-555-0144", fullAddress: "19 King St E, Hamilton, ON L8N 1A1", generatedOpportunityTitle: "Webform: Noah Wilson - Hamilton - 289-555-0144" },
    matchCandidates: [{ customerId: 78144, locationId: 8841, name: "Noah Wilson", confidence: 98, reason: "Exact email and address match.", contactStatus: "matched", locationStatus: "matched" }],
    reviewIssues: [],
    timeline: baseTimeline("Resolved customer", "Customer and location resolved to active Striven records.")
  },
  {
    id: "REQ-1003",
    receivedAt: "2026-05-04T11:32:00.000Z",
    state: "OPPORTUNITY_CREATED",
    customerName: "Mia Chen",
    email: "mia.chen@example.com",
    phone: "647-555-0190",
    altPhone: "416-555-0101",
    address: "88 Riverbend Rd",
    city: "Oakville",
    province: "ON",
    postalCode: "L6H 4K2",
    preferredDays: ["Wednesday", "Thursday"],
    makeModelAge: "Regency HZ40E, 5 years",
    serviceDetails: "Remote receiver intermittent, fireplace sometimes starts by itself.",
    anythingElse: "Has newborn at home; quiet knock requested.",
    striven: { customerId: 79002, locationId: 9022, opportunityId: 440122, opportunityStage: "Quoted", customerStatusId: 2, serviceItemPrice: 189 },
    ai: { classification: "Control/remote issue", confidence: 0.89, summary: "Opportunity exists but stage is not approved.", suggestedNextStep: "Wait for stage approval before SWO." },
    normalized: { firstName: "Mia", lastName: "Chen", primaryPhone: "647-555-0190", fullAddress: "88 Riverbend Rd, Oakville, ON L6H 4K2", generatedOpportunityTitle: "Webform: Mia Chen - Oakville - 647-555-0190" },
    matchCandidates: [],
    reviewIssues: [],
    timeline: baseTimeline("Created opportunity", "Opportunity type 6 created with custom field checklist completed.")
  },
  {
    id: "REQ-1004",
    receivedAt: "2026-05-04T10:18:00.000Z",
    state: "AWAITING_SWO_APPROVAL",
    customerName: "Oliver Singh",
    email: "oliver.singh@example.com",
    phone: "905-555-0133",
    altPhone: "647-555-0165",
    address: "7 Aspen Grove",
    city: "Mississauga",
    province: "ON",
    postalCode: "L5B 2N4",
    preferredDays: ["No Preference"],
    makeModelAge: "Town & Country TC36, 12 years",
    serviceDetails: "No ignition, fan still runs.",
    anythingElse: "Basement access through side door.",
    striven: { customerId: 77091, locationId: 8304, opportunityId: 440118, opportunityStage: "Approved for SWO", customerStatusId: 2, duplicateSwoRisk: false, activeWorkOrderExists: false, serviceItemPrice: 189 },
    ai: { classification: "No ignition", confidence: 0.93, summary: "All SWO gates appear clear.", suggestedNextStep: "Create service work order." },
    normalized: { firstName: "Oliver", lastName: "Singh", primaryPhone: "905-555-0133", fullAddress: "7 Aspen Grove, Mississauga, ON L5B 2N4", generatedOpportunityTitle: "Webform: Oliver Singh - Mississauga - 905-555-0133" },
    matchCandidates: [],
    reviewIssues: [],
    timeline: baseTimeline("Checked SWO approval", "Opportunity stage is Approved for SWO.")
  },
  {
    id: "REQ-1005",
    receivedAt: "2026-05-03T19:28:00.000Z",
    state: "SERVICE_SO_CREATED",
    customerName: "Sophia Martin",
    email: "sophia.martin@example.com",
    phone: "905-555-0117",
    altPhone: "905-555-0129",
    address: "300 Lakeshore Rd",
    city: "Stoney Creek",
    province: "ON",
    postalCode: "L8E 5H7",
    preferredDays: ["Friday"],
    makeModelAge: "Marquis Bentley, 9 years",
    serviceDetails: "Strong smell when unit first turns on.",
    anythingElse: "Dog will be crated.",
    striven: { customerId: 76522, locationId: 8120, opportunityId: 440101, opportunityStage: "Approved for SWO", serviceOrderId: 55091, serviceOrderNumber: "SO-55091", customerStatusId: 2, serviceItemPrice: 189 },
    ai: { classification: "Odour on startup", confidence: 0.86, summary: "SWO created; task mapping remains.", suggestedNextStep: "Map Striven task to technician calendar event." },
    normalized: { firstName: "Sophia", lastName: "Martin", primaryPhone: "905-555-0117", fullAddress: "300 Lakeshore Rd, Stoney Creek, ON L8E 5H7", generatedOpportunityTitle: "Webform: Sophia Martin - Stoney Creek - 905-555-0117" },
    matchCandidates: [],
    reviewIssues: [],
    timeline: baseTimeline("Created SWO", "Service work order SO-55091 created from approved opportunity.")
  },
  {
    id: "REQ-1006",
    receivedAt: "2026-05-03T16:04:00.000Z",
    state: "TASK_SCHEDULED",
    customerName: "Liam O'Connor",
    email: "liam.oconnor@example.com",
    phone: "416-555-0158",
    altPhone: "647-555-0182",
    address: "121 Garden Path",
    city: "Toronto",
    province: "ON",
    postalCode: "M6S 2L1",
    preferredDays: ["Tuesday"],
    makeModelAge: "Heat & Glo 6000CLX, 4 years",
    serviceDetails: "Annual service, customer reports soot at top of glass.",
    anythingElse: "Parking behind laneway.",
    striven: { customerId: 73990, locationId: 7901, opportunityId: 440077, opportunityStage: "Approved for SWO", serviceOrderId: 55072, serviceOrderNumber: "SO-55072", taskId: 918211, customerStatusId: 2, serviceItemPrice: 189 },
    ai: { classification: "Maintenance with soot", confidence: 0.9, summary: "Task mapped to calendar.", suggestedNextStep: "Monitor completion." },
    normalized: { firstName: "Liam", lastName: "O'Connor", primaryPhone: "416-555-0158", fullAddress: "121 Garden Path, Toronto, ON M6S 2L1", generatedOpportunityTitle: "Webform: Liam O'Connor - Toronto - 416-555-0158" },
    matchCandidates: [],
    reviewIssues: [],
    timeline: baseTimeline("Mapped task", "Calendar event matched to Striven task 918211.")
  },
  {
    id: "REQ-1007",
    receivedAt: "2026-05-03T14:10:00.000Z",
    state: "REVIEW_REQUIRED",
    customerName: "Emma Clarke",
    email: "emma.clarke@example.com",
    phone: "905-555-0199",
    altPhone: "",
    address: "56 Orchard Lane",
    city: "Waterdown",
    province: "ON",
    postalCode: "L0R 2H1",
    preferredDays: ["Thursday"],
    makeModelAge: "Unknown, approx 15 years",
    serviceDetails: "Customer says fireplace has not been serviced in years.",
    anythingElse: "Two possible matches found under same phone.",
    striven: { customerStatusId: 2, serviceItemPrice: 189 },
    ai: { classification: "Ambiguous customer match", confidence: 0.62, summary: "Two matching customer records with different addresses.", suggestedNextStep: "Human review before customer resolution." },
    normalized: { firstName: "Emma", lastName: "Clarke", primaryPhone: "905-555-0199", fullAddress: "56 Orchard Lane, Waterdown, ON L0R 2H1", generatedOpportunityTitle: "Webform: Emma Clarke - Waterdown - 905-555-0199" },
    matchCandidates: [
      { customerId: 70211, locationId: 7550, name: "Emma Clarke", confidence: 72, reason: "Phone matches, address differs by city.", contactStatus: "matched", locationStatus: "needs_review" },
      { customerId: 70288, locationId: 7661, name: "E. Clarke", confidence: 68, reason: "Email similar and postal prefix matches.", contactStatus: "needs_update", locationStatus: "needs_review" }
    ],
    reviewIssues: [{ reason: "AMBIGUOUS_CUSTOMER_MATCH", severity: "high", suggestedAction: "Confirm correct customer/location before continuing.", aiExplanation: "The assistant found multiple plausible Striven customers and should not choose one automatically." }],
    timeline: baseTimeline("Sent to review", "Ambiguous customer match requires operator decision.")
  },
  {
    id: "REQ-1008",
    receivedAt: "2026-05-03T09:45:00.000Z",
    state: "ERROR",
    customerName: "Lucas Ferreira",
    email: "lucas.ferreira@example.com",
    phone: "289-555-0126",
    altPhone: "905-555-0181",
    address: "14 Mill Pond Crt",
    city: "Ancaster",
    province: "ON",
    postalCode: "L9G 3K9",
    preferredDays: ["Monday", "Wednesday"],
    makeModelAge: "Montigo H34DF, 8 years",
    serviceDetails: "Burner lights unevenly and shuts off.",
    anythingElse: "Customer approved service fee by email.",
    striven: { customerId: 75118, locationId: 8012, opportunityId: 440050, opportunityStage: "Approved for SWO", customerStatusId: 2, activeWorkOrderExists: true, duplicateSwoRisk: true, serviceItemPrice: 0 },
    ai: { classification: "Burner issue", confidence: 0.88, summary: "SWO creation blocked by business rules.", suggestedNextStep: "Resolve active work order and zero-price item before retry." },
    normalized: { firstName: "Lucas", lastName: "Ferreira", primaryPhone: "289-555-0126", fullAddress: "14 Mill Pond Crt, Ancaster, ON L9G 3K9", generatedOpportunityTitle: "Webform: Lucas Ferreira - Ancaster - 289-555-0126" },
    matchCandidates: [],
    reviewIssues: [
      { reason: "ACTIVE_WORK_ORDER_EXISTS", severity: "critical", suggestedAction: "Do not create SWO until current work order is closed or cancelled.", aiExplanation: "An active work order appears to exist for this location." },
      { reason: "ZERO_PRICE_SERVICE_ITEM", severity: "high", suggestedAction: "Correct service item pricing before creating the order.", aiExplanation: "The configured service item resolves to zero in the mock gate check." }
    ],
    timeline: baseTimeline("SWO gate failed", "Duplicate SWO risk, active work order, and zero-price service item detected.")
  }
];

export const calendarEvents: CalendarEvent[] = [
  { id: "cal-1", title: "SO-55072 Liam O'Connor", technician: "Chris D.", startsAt: "2026-05-05T13:00:00.000Z", endsAt: "2026-05-05T15:00:00.000Z", address: "121 Garden Path, Toronto" },
  { id: "cal-2", title: "SO-55091 Sophia Martin", technician: "Maya R.", startsAt: "2026-05-08T14:30:00.000Z", endsAt: "2026-05-08T16:30:00.000Z", address: "300 Lakeshore Rd, Stoney Creek" },
  { id: "cal-3", title: "Tentative: Bennett service", technician: "Chris D.", startsAt: "2026-05-08T17:00:00.000Z", endsAt: "2026-05-08T18:30:00.000Z", address: "42 Glenwood Ave, Burlington" }
];

export const strivenTasks: StrivenTask[] = [
  { id: 918211, soNumber: "SO-55072", customerName: "Liam O'Connor", technician: "Chris D.", scheduledAt: "2026-05-05T13:00:00.000Z", matchConfidence: 96, matchMethod: "calendar_overlap" },
  { id: 918290, soNumber: "SO-55091", customerName: "Sophia Martin", technician: "Maya R.", scheduledAt: "2026-05-08T14:30:00.000Z", matchConfidence: 92, matchMethod: "address" },
  { id: 918377, soNumber: "SO-55104", customerName: "Ava Bennett", technician: "Chris D.", scheduledAt: "2026-05-08T17:00:00.000Z", matchConfidence: 78, matchMethod: "phone" }
];

export const configValues = {
  orderTypeId: 44938,
  paymentTermId: 13,
  lineItemClassId: 14,
  salesRepId: 51,
  serviceItemId: 41481,
  statusQuotedId: 19,
  scheduledCustomField: 164,
  serviceTechCustomField: 794,
  manufacturerModelCustomField: 651,
  defaultServiceTechId: 502,
  opportunityTypeId: 6,
  webformCategoryId: 1299,
  customerActiveStatusId: 2
};

export const preferredDaysMap = {
  "No Preference": 511,
  Monday: 512,
  Tuesday: 513,
  Wednesday: 514,
  Thursday: 515,
  Friday: 516
};

export const opportunityCustomFields = {
  "Preferred Days": 803,
  "Make/Model/Age": 802,
  Details: 804,
  "Anything Else": 805
};

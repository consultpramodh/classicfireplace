export type PipelineState =
  | "NEW_ROW"
  | "REFERENCE_DATA_READY"
  | "NEW"
  | "CUSTOMER_RESOLVED"
  | "CUSTOMER_CREATED"
  | "CUSTOMER_BLOCKED"
  | "CUSTOMER_HISTORY_ENRICHED"
  | "SERVICE_INTELLIGENCE_READY"
  | "TECH_AND_AREA_RECOMMENDED"
  | "DATE_RECOMMENDED"
  | "OPPORTUNITY_PENDING"
  | "OPPORTUNITY_CREATED"
  | "AWAITING_APPROVAL"
  | "APPROVED_FOR_SWO"
  | "AWAITING_SWO_APPROVAL"
  | "SERVICE_SO_CREATED"
  | "SCHEDULED"
  | "TASK_SCHEDULED"
  | "TASK_COMPLETED"
  | "LEARNING_CAPTURED"
  | "DONE"
  | "COMPLETED"
  | "REVIEW_REQUIRED"
  | "ERROR";

export type ReviewReason =
  | "MISSING_IDENTITY"
  | "AMBIGUOUS_CUSTOMER_MATCH"
  | "MISSING_LOCATION"
  | "CONTACT_CREATE_FAILED"
  | "LOCATION_CREATE_FAILED"
  | "OPPORTUNITY_CREATE_FAILED"
  | "OPPORTUNITY_STAGE_NOT_APPROVED"
  | "DUPLICATE_SWO_RISK"
  | "ACTIVE_WORK_ORDER_EXISTS"
  | "ZERO_PRICE_SERVICE_ITEM"
  | "STRIVEN_API_ERROR"
  | "NON_JSON_API_RESPONSE"
  | "AI_CLASSIFICATION_LOW_CONFIDENCE";

export type AuditEntry = {
  at: string;
  actor: string;
  action: string;
  note: string;
};

export type MatchCandidate = {
  customerId: number;
  locationId?: number;
  name: string;
  confidence: number;
  reason: string;
  contactStatus: "matched" | "needs_update" | "missing";
  locationStatus: "matched" | "needs_review" | "missing";
};

export type ReviewIssue = {
  reason: ReviewReason;
  severity: "low" | "medium" | "high" | "critical";
  suggestedAction: string;
  aiExplanation: string;
};

export type ServiceRequest = {
  id: string;
  receivedAt: string;
  state: PipelineState;
  customerName: string;
  email: string;
  phone: string;
  altPhone: string;
  address: string;
  city: string;
  province: string;
  postalCode: string;
  preferredDays: string[];
  makeModelAge: string;
  serviceDetails: string;
  anythingElse: string;
  striven: {
    customerId?: number;
    locationId?: number;
    opportunityId?: number;
    opportunityStage?: "New" | "Quoted" | "Approved for SWO" | "Needs Review";
    serviceOrderId?: number;
    serviceOrderNumber?: string;
    taskId?: number;
    customerStatusId?: number;
    activeWorkOrderExists?: boolean;
    duplicateSwoRisk?: boolean;
    serviceItemPrice?: number;
  };
  ai: {
    classification: string;
    confidence: number;
    summary: string;
    suggestedNextStep: string;
  };
  normalized: {
    firstName: string;
    lastName: string;
    primaryPhone: string;
    fullAddress: string;
    generatedOpportunityTitle: string;
  };
  matchCandidates: MatchCandidate[];
  reviewIssues: ReviewIssue[];
  timeline: AuditEntry[];
};

export type CalendarEvent = {
  id: string;
  title: string;
  technician: string;
  startsAt: string;
  endsAt: string;
  address: string;
};

export type StrivenTask = {
  id: number;
  soNumber: string;
  customerName: string;
  technician: string;
  scheduledAt: string;
  matchConfidence: number;
  matchMethod: "phone" | "address" | "calendar_overlap" | "manual";
};

/*
 * 002_ServiceOps_Types.ts
 * Shared domain shapes used by UI, actions, integrations, and tests.
 */

export type IntakeRow = {
  id: string;
  sourceRow: number;
  submittedAt: string;
  firstName: string;
  lastName: string;
  phone: string;
  altPhone: string;
  email: string;
  street: string;
  city: string;
  province: string;
  postalCode: string;
  country: string;
  preferredDays: string;
  makeModelAge: string;
  details: string;
  anythingElse: string;
  pipelineState: string;
  needsReview: boolean;
  lastError: string;
  strivenCustomerId: string;
  strivenOppId: string;
  strivenSoId: string;
  salesOrderNumber: string;
  salesOrderStatus?: string;
  salesOrderCreatedAt?: string;
  salesOrderUpdatedAt?: string;
  salesOrderScheduledAt?: string;
  salesOrderInProgressAt?: string;
  swoQuotedToInProgress?: string;
  swoCreatedToScheduled?: string;
  serviceAppointmentNote?: string;
  cleanServiceTaskStatus?: string;
  opportunityStage: string;
  taskMatched: boolean;
};

export type CustomerRecord = {
  customerId: number;
  customerNumber?: string;
  name?: string;
  email?: string;
  phone?: string;
  altPhone?: string;
  street?: string;
  city?: string;
  postalCode?: string;
  contactId?: number;
};

export type CustomerLocation = {
  id: number;
  customerId: number;
  name?: string;
  street?: string;
  city?: string;
  province?: string;
  postalCode?: string;
  country?: string;
};

export type WorkOrderRecord = {
  id: number;
  customerId: number;
  salesOrderNumber: string;
  status: string;
  createdAt?: string;
};

export type TaskMappingRow = {
  eventId: string;
  tech: string;
  start?: string;
  end?: string;
  title: string;
  location: string;
  soNumber: string;
  matchMethod: string;
  taskId: string;
  taskName: string;
  taskStatus: string;
  datesMatch: "MATCH" | "MISMATCH" | "";
  rowStatus: "No Task" | "Dates Mismatch" | "Missing IDs" | "In Sync" | string;
};

export type CalendarEvent = {
  id: string;
  technician: string;
  calendarId: string;
  title: string;
  location: string;
  description: string;
  start: string;
  end: string;
  allDay: boolean;
  source: "google" | "taskMapping";
};

export type TechnicianProfile = {
  id: string;
  name: string;
  active: boolean;
  role: string;
  phone: string;
  email: string;
  calendarId: string;
  color: string;
  homeAddress: string;
  preferredStartAddress: string;
  serviceAreas: string[];
  skills: string[];
  capacityPerDay: number;
  notes: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type AuditLogEntry = {
  id?: number;
  timestamp: string;
  user: string;
  action: string;
  sourceRow: number | null;
  strivenCustomerId: string;
  opportunityId: string;
  salesOrderId: string;
  taskId: string;
  result: string;
  errorMessage: string;
  rawResponsePreview: string;
};

export type ActionResult = {
  ok: boolean;
  action: string;
  message: string;
  data?: unknown;
  error?: string;
};

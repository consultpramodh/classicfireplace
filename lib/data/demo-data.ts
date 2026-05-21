/*
 * 006_Demo_Data.ts
 * Sample mode keeps the UI useful before live credentials are connected.
 */

import { PIPELINE_STATE } from "@/lib/config/serviceops-config";
import type { AuditLogEntry, CustomerLocation, CustomerRecord, IntakeRow, TaskMappingRow, WorkOrderRecord } from "@/lib/serviceops/types";

export const demoIntakeRows: IntakeRow[] = [
  {
    id: "TEST-ACCOUNT-1-PIPELINE",
    sourceRow: 1,
    submittedAt: "2026-05-21T09:00:00-04:00",
    firstName: "Account",
    lastName: "One",
    phone: "(416) 555-0001",
    altPhone: "",
    email: "account-one@example.com",
    street: "1 Test Account Lane",
    city: "Toronto",
    province: "ON",
    postalCode: "M4L 1G9",
    country: "Canada",
    preferredDays: "No Preference",
    makeModelAge: "Demo fireplace asset",
    details: "Test mode pipeline request for Account #1. Use this row to verify customer, opportunity, sales order, and task data propagation.",
    anythingElse: "Do not send to live Striven.",
    pipelineState: PIPELINE_STATE.customerResolved,
    needsReview: false,
    lastError: "",
    strivenCustomerId: "1",
    strivenOppId: "",
    strivenSoId: "",
    salesOrderNumber: "",
    opportunityStage: "",
    taskMatched: false
  },
  {
    id: "INTAKE-20260428-001",
    sourceRow: 2,
    submittedAt: "2026-04-28T09:14:00-04:00",
    firstName: "Dana",
    lastName: "Morris",
    phone: "(416) 555-0134",
    altPhone: "",
    email: "dana@example.com",
    street: "44 King St E",
    city: "Toronto",
    province: "ON",
    postalCode: "M5C 1G8",
    country: "Canada",
    preferredDays: "Monday, Wednesday",
    makeModelAge: "Napoleon B36, 8 years",
    details: "Annual clean and service. Customer mentioned intermittent pilot issue.",
    anythingElse: "Prefers morning appointments.",
    pipelineState: PIPELINE_STATE.opportunityCreated,
    needsReview: false,
    lastError: "",
    strivenCustomerId: "61142",
    strivenOppId: "1087",
    strivenSoId: "",
    salesOrderNumber: "",
    opportunityStage: "New Request",
    taskMatched: false
  },
  {
    id: "INTAKE-20260428-002",
    sourceRow: 3,
    submittedAt: "2026-04-28T10:02:00-04:00",
    firstName: "Ari",
    lastName: "Khan",
    phone: "905-555-0199",
    altPhone: "905-555-0177",
    email: "",
    street: "18 Mill Rd",
    city: "Ajax",
    province: "ON",
    postalCode: "L1S 2H1",
    country: "Canada",
    preferredDays: "No Preference",
    makeModelAge: "",
    details: "Glass door does not close cleanly.",
    anythingElse: "",
    pipelineState: PIPELINE_STATE.reviewRequired,
    needsReview: true,
    lastError: "Missing Make/Model/Age. Review before SO.",
    strivenCustomerId: "61143",
    strivenOppId: "",
    strivenSoId: "",
    salesOrderNumber: "",
    opportunityStage: "",
    taskMatched: false
  },
  {
    id: "INTAKE-20260428-003",
    sourceRow: 4,
    submittedAt: "2026-04-27T15:22:00-04:00",
    firstName: "Maya",
    lastName: "Chen",
    phone: "6475550155",
    altPhone: "",
    email: "maya@example.com",
    street: "9 Garden Ave",
    city: "Markham",
    province: "ON",
    postalCode: "L3R 1A1",
    country: "Canada",
    preferredDays: "Friday",
    makeModelAge: "Regency insert, 4 years",
    details: "Customer approved creating service work order.",
    anythingElse: "",
    pipelineState: PIPELINE_STATE.opportunityCreated,
    needsReview: false,
    lastError: "",
    strivenCustomerId: "61144",
    strivenOppId: "1088",
    strivenSoId: "",
    salesOrderNumber: "",
    opportunityStage: "Service Work Order Created",
    taskMatched: false
  },
  {
    id: "INTAKE-20260426-004",
    sourceRow: 5,
    submittedAt: "2026-04-26T11:48:00-04:00",
    firstName: "Noah",
    lastName: "Price",
    phone: "4165550101",
    altPhone: "",
    email: "noah@example.com",
    street: "77 Queen St",
    city: "Toronto",
    province: "ON",
    postalCode: "M5H 2N2",
    country: "Canada",
    preferredDays: "Tuesday",
    makeModelAge: "Valor H5",
    details: "Service order already exists and task is matched.",
    anythingElse: "",
    pipelineState: PIPELINE_STATE.serviceSalesOrderCreated,
    needsReview: false,
    lastError: "",
    strivenCustomerId: "61145",
    strivenOppId: "1089",
    strivenSoId: "90051",
    salesOrderNumber: "SO-240155",
    opportunityStage: "Service Work Order Created",
    taskMatched: true
  }
];

export const demoCustomers: CustomerRecord[] = [
  { customerId: 1, customerNumber: "1", name: "Account One", email: "account-one@example.com", phone: "4165550001", street: "1 Test Account Lane", city: "Toronto", postalCode: "M4L1G9", contactId: 1 },
  { customerId: 61142, customerNumber: "C-61142", name: "Dana Morris", email: "dana@example.com", phone: "4165550134", street: "44 King St E", city: "Toronto", postalCode: "M5C1G8", contactId: 701 },
  { customerId: 61143, customerNumber: "C-61143", name: "Ari Khan", phone: "9055550199", altPhone: "9055550177", street: "18 Mill Rd", city: "Ajax", postalCode: "L1S2H1", contactId: 702 },
  { customerId: 61144, customerNumber: "C-61144", name: "Maya Chen", email: "maya@example.com", phone: "6475550155", street: "9 Garden Ave", city: "Markham", postalCode: "L3R1A1", contactId: 703 }
];

export const demoLocations: CustomerLocation[] = [
  { id: 1, customerId: 1, name: "Primary", street: "1 Test Account Lane", city: "Toronto", province: "ON", postalCode: "M4L1G9", country: "CA" },
  { id: 8001, customerId: 61142, street: "44 King St E", city: "Toronto", province: "ON", postalCode: "M5C1G8", country: "CA" },
  { id: 8003, customerId: 61144, street: "9 Garden Ave", city: "Markham", province: "ON", postalCode: "L3R1A1", country: "CA" }
];

export const demoWorkOrders: WorkOrderRecord[] = [
  { id: 90051, customerId: 61145, salesOrderNumber: "SO-240155", status: "In Progress", createdAt: "2026-04-26T12:30:00-04:00" }
];

export const demoTaskMapping: TaskMappingRow[] = [
  { eventId: "evt-1", tech: "Chris", title: "SO-240155 - Noah Price", location: "77 Queen St", soNumber: "240155", matchMethod: "Sales Order (Task SO col)", taskId: "4561", taskName: "Clean and Service SO-240155", taskStatus: "Open", datesMatch: "MATCH", rowStatus: "In Sync" },
  { eventId: "evt-2", tech: "Travis", title: "Maya Chen service", location: "9 Garden Ave", soNumber: "", matchMethod: "None", taskId: "", taskName: "", taskStatus: "", datesMatch: "", rowStatus: "No Task" },
  { eventId: "evt-3", tech: "Matt", title: "SO-240120 reschedule", location: "18 Mill Rd", soNumber: "240120", matchMethod: "Sales Order (from Task Name)", taskId: "4557", taskName: "SO-240120 service", taskStatus: "Open", datesMatch: "MISMATCH", rowStatus: "Dates Mismatch" }
];

export const demoAudit: AuditLogEntry[] = [
  { timestamp: "2026-04-28T10:15:00-04:00", user: "demo", action: "resolve_customer", sourceRow: 2, strivenCustomerId: "61142", opportunityId: "", salesOrderId: "", taskId: "", result: "matched", errorMessage: "", rawResponsePreview: "Matched by email in demo data." },
  { timestamp: "2026-04-28T10:19:00-04:00", user: "demo", action: "create_opportunity", sourceRow: 2, strivenCustomerId: "61142", opportunityId: "1087", salesOrderId: "", taskId: "", result: "created", errorMessage: "", rawResponsePreview: "Preferred days updated after create." }
];

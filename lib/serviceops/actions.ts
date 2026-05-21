/*
 * 013_ServiceOps_Actions.ts
 * Server action orchestration. All Striven-writing actions create audit logs.
 */

import "server-only";
import { getEnv, PIPELINE_STATE } from "@/lib/config/serviceops-config";
import { demoCustomers, demoLocations, demoWorkOrders } from "@/lib/data/demo-data";
import { addAuditLog, getIntakeRowBySourceRow, upsertIntakeRow, upsertTaskMappingRow } from "@/lib/db/repository";
import { getCurrentIntakeRows } from "@/lib/serviceops/live-data";
import { getCachedReportRows, refreshSnapshotCache } from "@/lib/serviceops/snapshots";
import { createCustomerLocation, createCustomerWithDetails, createOpportunity, createSalesOrder, getOpportunity, getServiceItemPrice, updateCustomerProfileFromWebform } from "@/lib/striven/serviceops-adapter";
import type { ActionResult, CustomerLocation, IntakeRow, TaskMappingRow } from "@/lib/serviceops/types";
import { matchCustomer, hasUsableIdentity, canCreateSalesOrder } from "./rules";
import { buildAddressKey, findValueByAliases, normalizeEmail, normalizePhone10, parseNumericId, safeText } from "./normalization";

function audit(row: IntakeRow | null, action: string, result: string, errorMessage = "", rawResponsePreview = "") {
  addAuditLog({
    timestamp: new Date().toISOString(),
    user: "local-user",
    action,
    sourceRow: row?.sourceRow ?? null,
    strivenCustomerId: row?.strivenCustomerId || "",
    opportunityId: row?.strivenOppId || "",
    salesOrderId: row?.strivenSoId || "",
    taskId: "",
    result,
    errorMessage,
    rawResponsePreview: rawResponsePreview.slice(0, 2000)
  });
}

async function getRowOrThrow(sourceRow: number) {
  const live = await getCurrentIntakeRows();
  const row = live.rows.find((item) => item.sourceRow === sourceRow) || getIntakeRowBySourceRow(sourceRow);
  if (!row) throw new Error(`No intake row found for source row ${sourceRow}.`);
  return row;
}

export async function runServiceOpsAction(action: string, sourceRow?: number, input: Record<string, unknown> = {}): Promise<ActionResult> {
  try {
    if (action === "refresh_reports") {
      const result = await refreshSnapshotCache();
      audit(null, action, "ok", "", JSON.stringify(result));
      return {
        ok: result.ok,
        action,
        message: result.ok ? "Snapshots refreshed." : "Snapshots refreshed with some errors.",
        data: result
      };
    }

    if (action === "sync_statuses") {
      const { syncIntakeStatusesFromStriven } = await import("@/lib/serviceops/status-sync");
      const result = await syncIntakeStatusesFromStriven();
      audit(null, action, "ok", "", JSON.stringify(result));
      return {
        ok: true,
        action,
        message: `Synced ${result.updated} rows from Striven statuses.`,
        data: result
      };
    }

    if (action === "create_demo_pipeline_events") {
      const result = await createDemoPipelineEvents(Number(input.accountNumber || 1));
      audit(getIntakeRowBySourceRow(1), action, result.ok ? "ok" : "error", result.ok ? "" : result.message, JSON.stringify(result.data || {}).slice(0, 2000));
      return result;
    }

    if (!sourceRow) throw new Error("sourceRow is required for this action.");
    const row = await getRowOrThrow(sourceRow);

    const result =
      action === "resolve_customer" ? await resolveCustomer(row) :
      action === "create_opportunity" ? await createOpportunityForRow(row) :
      action === "check_opportunity_stage" ? await checkOpportunityStage(row) :
      action === "create_sales_order" ? await createSalesOrderForRow(row) :
      action === "recheck_request" ? await recheckRequest(row) :
      action === "ensure_customer_details" ? await ensureCustomerDetails(row) :
      action === "repair_request" ? await repairRequest(row) :
      action === "report_repair" ? await reportAndRepairRequest(row, input) :
      action === "rebuild_profile" ? await rebuildProfile(row) :
      action === "mark_reviewed" ? await markReviewed(row) :
      null;

    if (!result) throw new Error(`Unknown action: ${action}`);
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const row = sourceRow ? getIntakeRowBySourceRow(sourceRow) : null;
    audit(row, action, "error", message);
    return { ok: false, action, message, error: message };
  }
}

async function resolveCustomer(row: IntakeRow): Promise<ActionResult> {
  if (parseNumericId(row.strivenCustomerId)) {
    const currentState = safeText(row.pipelineState);
    const progressedStates = new Set<string>([
      PIPELINE_STATE.customerCreated,
      PIPELINE_STATE.opportunityPending,
      PIPELINE_STATE.opportunityCreated,
      PIPELINE_STATE.serviceSalesOrderCreated,
      PIPELINE_STATE.done
    ]);

    if (!progressedStates.has(currentState)) {
      row.pipelineState = PIPELINE_STATE.customerResolved;
    }

    if (!row.lastError || /customer|identity|match|mapped/i.test(row.lastError)) {
      row.needsReview = false;
      row.lastError = "";
    }

    upsertIntakeRow(row);
    audit(row, "resolve_customer", "already", "", "Customer already mapped.");
    return { ok: true, action: "resolve_customer", message: "Customer already mapped." };
  }

  if (!hasUsableIdentity(row)) {
    row.needsReview = true;
    row.lastError = "Missing usable identity.";
    row.pipelineState = PIPELINE_STATE.customerBlocked;
    upsertIntakeRow(row);
    audit(row, "resolve_customer", "blocked", row.lastError);
    return { ok: false, action: "resolve_customer", message: row.lastError };
  }

  const referenceCustomers = await getReferenceCustomers();
  const matched = matchCustomer(row, referenceCustomers);
  if (matched.customerId) {
    row.strivenCustomerId = String(matched.customerId);
    row.pipelineState = PIPELINE_STATE.customerResolved;
    row.needsReview = false;
    row.lastError = "";
    upsertIntakeRow(row);
    audit(row, "resolve_customer", "matched", "", `Matched by ${matched.reason}.`);
    return { ok: true, action: "resolve_customer", message: `Matched existing customer by ${matched.reason}.` };
  }

  if (getEnv().readOnly) {
    row.needsReview = true;
    row.lastError = "No customer match found. Live customer creation is disabled in read-only mode.";
    row.pipelineState = PIPELINE_STATE.reviewRequired;
    upsertIntakeRow(row);
    audit(row, "resolve_customer", "review", row.lastError);
    return { ok: false, action: "resolve_customer", message: row.lastError };
  }

  if (getEnv().demoMode) {
    row.needsReview = true;
    row.lastError = "No demo match found.";
    row.pipelineState = PIPELINE_STATE.reviewRequired;
    upsertIntakeRow(row);
    audit(row, "resolve_customer", "review", row.lastError);
    return { ok: false, action: "resolve_customer", message: row.lastError };
  }

  const created = await createCustomerWithDetails(row);
  const id = parseNumericId(created.customer.Id || created.customer.id || created.customer.CustomerId || created.customer.customerId);
  if (!id) throw new Error(`Customer create returned no ID: ${JSON.stringify(created.customer).slice(0, 1000)}`);

  row.strivenCustomerId = String(id);
  row.pipelineState = PIPELINE_STATE.customerCreated;
  row.needsReview = created.warnings.length > 0;
  row.lastError = created.warnings.length ? `Customer created, but details need review: ${created.warnings.join(" | ").slice(0, 800)}` : "";
  upsertIntakeRow(row);
  audit(row, "resolve_customer", "created", "", JSON.stringify(created));
  return {
    ok: true,
    action: "resolve_customer",
    message: created.warnings.length ? "Customer created, but contact/location details need review." : "Customer, contact, and location created.",
    data: created
  };
}

async function createOpportunityForRow(row: IntakeRow): Promise<ActionResult> {
  if (parseNumericId(row.strivenOppId)) {
    audit(row, "create_opportunity", "already", "", "Opportunity already mapped.");
    return { ok: true, action: "create_opportunity", message: "Opportunity already mapped." };
  }

  const customerId = parseNumericId(row.strivenCustomerId);
  if (!customerId) {
    row.pipelineState = PIPELINE_STATE.opportunityPending;
    row.needsReview = true;
    row.lastError = "Resolve customer before creating an opportunity.";
    upsertIntakeRow(row);
    audit(row, "create_opportunity", "blocked", row.lastError);
    return { ok: false, action: "create_opportunity", message: "Resolve customer before creating an opportunity." };
  }

  if (getEnv().demoMode) {
    row.strivenOppId = String(900000 + row.sourceRow);
    row.pipelineState = PIPELINE_STATE.opportunityCreated;
    row.opportunityStage = row.opportunityStage || "New Request";
    row.needsReview = false;
    row.lastError = "";
    upsertIntakeRow(row);
    const context = await resolvePipelineContext(row);
    audit(row, "create_opportunity", "demo-created", "", JSON.stringify({ message: "Simulated opportunity create.", context }).slice(0, 2000));
    return { ok: true, action: "create_opportunity", message: "Demo opportunity created with customer, contact, and location context.", data: context };
  }

  if (getEnv().readOnly) {
    row.pipelineState = PIPELINE_STATE.opportunityPending;
    row.needsReview = true;
    row.lastError = "Read-only mode is on. Opportunity creation was not sent to Striven.";
    upsertIntakeRow(row);
    audit(row, "create_opportunity", "blocked-readonly", row.lastError, "Opportunity write blocked by SERVICEOPS_READ_ONLY.");
    return { ok: false, action: "create_opportunity", message: "Read-only mode is on. Opportunity creation was not sent to Striven." };
  }

  const env = getEnv();
  const oppTypeId = env.strivenOpportunityTypeId;
  const categoryId = env.strivenOpportunityCategoryIdWebform;
  if (!oppTypeId || !categoryId) throw new Error("Missing STRIVEN_OPPORTUNITY_TYPE_ID or STRIVEN_OPPORTUNITY_CATEGORY_ID_WEBFORM.");

  const context = await resolvePipelineContext(row);
  if (!context.locationId) {
    row.needsReview = true;
    row.lastError = "No matching customer location found. Run Repair/Ensure Details before opportunity creation.";
    row.pipelineState = PIPELINE_STATE.reviewRequired;
    upsertIntakeRow(row);
    audit(row, "create_opportunity", "blocked-location", row.lastError, JSON.stringify(context));
    return { ok: false, action: "create_opportunity", message: row.lastError, data: context };
  }

  const created = await createOpportunity(row, { customerId, oppTypeId, oppCategoryId: categoryId, locationId: context.locationId, contactId: context.contactId });
  const id = parseNumericId(created.Id || created.id);
  if (!id) throw new Error(`Opportunity create returned no ID: ${JSON.stringify(created).slice(0, 1000)}`);

  row.strivenOppId = String(id);
  row.pipelineState = PIPELINE_STATE.opportunityCreated;
  row.needsReview = false;
  row.lastError = "";
  upsertIntakeRow(row);
  audit(row, "create_opportunity", "created", "", JSON.stringify(created));
  return { ok: true, action: "create_opportunity", message: "Opportunity created.", data: created };
}

async function checkOpportunityStage(row: IntakeRow): Promise<ActionResult> {
  const oppId = parseNumericId(row.strivenOppId);
  if (!oppId) return { ok: false, action: "check_opportunity_stage", message: "Missing Striven Opp ID." };

  if (getEnv().demoMode) {
    audit(row, "check_opportunity_stage", "demo", "", row.opportunityStage || "No stage in demo row.");
    return { ok: true, action: "check_opportunity_stage", message: `Current stage: ${row.opportunityStage || "Unknown"}` };
  }

  const opp = await getOpportunity(oppId);
  const stage = safeText(opp.Stage || opp.OpportunityStage || opp.Status || opp.OpportunityStatus);
  row.opportunityStage = stage;
  upsertIntakeRow(row);
  audit(row, "check_opportunity_stage", "ok", "", JSON.stringify(opp));
  return { ok: true, action: "check_opportunity_stage", message: `Current stage: ${stage || "Unknown"}`, data: opp };
}

async function createSalesOrderForRow(row: IntakeRow): Promise<ActionResult> {
  const itemPrice = getEnv().demoMode || getEnv().readOnly ? 249 : await getServiceItemPrice();
  const workOrders = await getReferenceWorkOrders();
  const gate = canCreateSalesOrder({ row, workOrders, itemPrice });
  if (!gate.ok) {
    row.needsReview = true;
    row.lastError = gate.reason;
    row.pipelineState = PIPELINE_STATE.reviewRequired;
    upsertIntakeRow(row);
    audit(row, "create_sales_order", "blocked", gate.reason);
    return { ok: false, action: "create_sales_order", message: gate.reason };
  }

  const customerId = parseNumericId(row.strivenCustomerId);
  const context = await resolvePipelineContext(row);
  if (!context.locationId) {
    row.needsReview = true;
    row.lastError = "No matching LocationId found for this customer/service address.";
    row.pipelineState = PIPELINE_STATE.reviewRequired;
    upsertIntakeRow(row);
    audit(row, "create_sales_order", "blocked", row.lastError);
    return { ok: false, action: "create_sales_order", message: row.lastError };
  }

  if (getEnv().demoMode) {
    row.strivenSoId = String(910000 + row.sourceRow);
    row.salesOrderNumber = `TEST-SO-${row.sourceRow}`;
    row.salesOrderStatus = "Quoted";
    row.pipelineState = PIPELINE_STATE.serviceSalesOrderCreated;
    row.needsReview = false;
    row.lastError = "";
    row.cleanServiceTaskStatus = `#${920000 + row.sourceRow} · Open · To be Assigned`;
    row.taskMatched = true;
    upsertIntakeRow(row);
    const task = buildDemoTaskMapping(row, context);
    upsertTaskMappingRow(task, "demo");
    audit(row, "create_sales_order", "demo-created", "", JSON.stringify({ message: "Simulated SO and task create.", context, task }).slice(0, 2000));
    return { ok: true, action: "create_sales_order", message: "Demo sales order and task mapping created with customer/contact/location context.", data: { context, task } };
  }

  if (getEnv().readOnly) {
    audit(row, "create_sales_order", "blocked-readonly", "", "Sales order write blocked by SERVICEOPS_READ_ONLY.");
    return { ok: false, action: "create_sales_order", message: "Read-only mode is on. Sales Order creation was not sent to Striven." };
  }

  const created = await createSalesOrder(row, { customerId, locationId: context.locationId, contactId: context.contactId, itemPrice });
  const id = parseNumericId(created.Id || created.id);
  if (!id) throw new Error(`Sales order create returned no ID: ${JSON.stringify(created).slice(0, 1000)}`);

  row.strivenSoId = String(id);
  row.salesOrderNumber = safeText(created.OrderNumber || created.orderNumber || created.Number || created.number);
  row.pipelineState = PIPELINE_STATE.serviceSalesOrderCreated;
  row.needsReview = false;
  row.lastError = "";
  upsertIntakeRow(row);
  audit(row, "create_sales_order", "created", "", JSON.stringify(created));
  return { ok: true, action: "create_sales_order", message: "Sales order created.", data: created };
}

async function rebuildProfile(row: IntakeRow): Promise<ActionResult> {
  audit(row, "rebuild_profile", "queued", "", "Profile rebuild is local/demo in v1.");
  return { ok: true, action: "rebuild_profile", message: "Profile rebuild queued." };
}

async function resolvePipelineContext(row: IntakeRow) {
  const customerId = parseNumericId(row.strivenCustomerId);
  if (!customerId) return { customerId: 0, locationId: 0, contactId: 0, locationName: "", locationMatch: "missing-customer" };

  const [customers, locations] = await Promise.all([getReferenceCustomers(), getReferenceLocations()]);
  const customer = customers.find((item) => item.customerId === customerId);
  const location = selectServiceLocation(row, locations.filter((item) => item.customerId === customerId));

  return {
    customerId,
    customerNumber: customer?.customerNumber || String(customerId),
    contactId: customer?.contactId || 0,
    locationId: location?.id || 0,
    locationName: location?.name || "Primary",
    locationMatch: location ? buildAddressKey(location.street, location.city, location.postalCode) === buildAddressKey(row.street, row.city, row.postalCode) ? "address" : "customer-default" : "missing"
  };
}

function selectServiceLocation(row: IntakeRow, locations: CustomerLocation[]) {
  if (!locations.length) return undefined;
  const rowKey = buildAddressKey(row.street, row.city, row.postalCode);
  if (rowKey.replace(/\|/g, "")) {
    const exact = locations.find((location) => buildAddressKey(location.street, location.city, location.postalCode) === rowKey);
    if (exact) return exact;
    const cityMatch = locations.find((location) => buildAddressKey(location.street, location.city) === buildAddressKey(row.street, row.city));
    if (cityMatch) return cityMatch;
  }
  return locations.find((location) => /^primary$/i.test(safeText(location.name))) || locations[0];
}

function buildDemoTaskMapping(row: IntakeRow, context: { locationId?: number; contactId?: number }): TaskMappingRow {
  const taskId = String(920000 + row.sourceRow);
  return {
    eventId: `demo-task-${row.sourceRow}`,
    tech: "To be Assigned",
    start: "",
    end: "",
    title: `${row.salesOrderNumber || `TEST-SO-${row.sourceRow}`} - ${[row.firstName, row.lastName].filter(Boolean).join(" ") || `Customer ${row.strivenCustomerId}`}`,
    location: [row.street, row.city, row.province, row.postalCode].filter(Boolean).join(", "),
    soNumber: row.salesOrderNumber || `TEST-SO-${row.sourceRow}`,
    matchMethod: `Demo pipeline context: customer ${row.strivenCustomerId}, location ${context.locationId || "-"}, contact ${context.contactId || "-"}`,
    taskId,
    taskName: `Clean and Service ${row.salesOrderNumber || `TEST-SO-${row.sourceRow}`}`,
    taskStatus: "Open",
    datesMatch: "",
    rowStatus: "No schedule yet"
  };
}

async function createDemoPipelineEvents(accountNumber: number): Promise<ActionResult> {
  if (!getEnv().demoMode) {
    return { ok: false, action: "create_demo_pipeline_events", message: "Test/demo mode is not active." };
  }

  const now = new Date().toISOString();
  const sourceRow = accountNumber === 1 ? 1 : accountNumber;
  const row: IntakeRow = getIntakeRowBySourceRow(sourceRow) || {
    id: `TEST-ACCOUNT-${accountNumber}-PIPELINE`,
    sourceRow,
    submittedAt: now,
    firstName: "Account",
    lastName: String(accountNumber),
    phone: "(416) 555-0001",
    altPhone: "",
    email: `account-${accountNumber}@example.com`,
    street: `${accountNumber} Test Account Lane`,
    city: "Toronto",
    province: "ON",
    postalCode: "M4L 1G9",
    country: "Canada",
    preferredDays: "No Preference",
    makeModelAge: "Demo fireplace asset",
    details: `Test mode pipeline request for Account #${accountNumber}.`,
    anythingElse: "Do not send to live Striven.",
    pipelineState: PIPELINE_STATE.customerResolved,
    needsReview: false,
    lastError: "",
    strivenCustomerId: String(accountNumber),
    strivenOppId: "",
    strivenSoId: "",
    salesOrderNumber: "",
    salesOrderStatus: "",
    opportunityStage: "",
    taskMatched: false
  };

  row.strivenCustomerId = String(accountNumber);
  row.strivenOppId = row.strivenOppId || String(900000 + sourceRow);
  row.opportunityStage = "Approved for SWO";
  row.strivenSoId = row.strivenSoId || String(910000 + sourceRow);
  row.salesOrderNumber = row.salesOrderNumber || `TEST-SO-${sourceRow}`;
  row.salesOrderStatus = row.salesOrderStatus || "Quoted";
  row.pipelineState = PIPELINE_STATE.serviceSalesOrderCreated;
  row.needsReview = false;
  row.lastError = "";
  row.cleanServiceTaskStatus = `#${920000 + sourceRow} · Open · To be Assigned`;
  row.taskMatched = true;
  upsertIntakeRow(row);

  const context = await resolvePipelineContext(row);
  const task = buildDemoTaskMapping(row, context);
  upsertTaskMappingRow(task, "demo");
  audit(row, "create_demo_pipeline_events", "ok", "", JSON.stringify({ context, task }).slice(0, 2000));

  return {
    ok: true,
    action: "create_demo_pipeline_events",
    message: `Test-mode pipeline events created for Account #${accountNumber}.`,
    data: { row, context, task }
  };
}

async function recheckRequest(row: IntakeRow): Promise<ActionResult> {
  const { recheckIntakeStatusFromCachedReports } = await import("@/lib/serviceops/status-sync");
  const result = recheckIntakeStatusFromCachedReports(row.sourceRow);
  const refreshed = getIntakeRowBySourceRow(row.sourceRow) || row;
  if (result.ok && result.updated === 0) {
    refreshed.needsReview = true;
    refreshed.lastError = "Operator re-check requested: cached reports still point to the same records. Verify the customer/contact/location manually or refresh live data first.";
    refreshed.pipelineState = PIPELINE_STATE.reviewRequired;
    upsertIntakeRow(refreshed);
  }

  audit(refreshed, "recheck_request", result.ok ? "ok" : "blocked", result.ok ? "" : result.message, JSON.stringify(result).slice(0, 2000));
  return {
    ok: result.ok,
    action: "recheck_request",
    message: result.ok && result.updated === 0 ? "No different cached match was found. Moved request to Review so the customer/contact/location can be verified manually." : result.message,
    data: result
  };
}

async function ensureCustomerDetails(row: IntakeRow): Promise<ActionResult> {
  const customerId = parseNumericId(row.strivenCustomerId);
  if (!customerId) {
    return { ok: false, action: "ensure_customer_details", message: "Resolve the customer before updating missing contact/location details." };
  }

  if (getEnv().readOnly) {
    audit(row, "ensure_customer_details", "blocked-readonly", "", "Contact/location update blocked by SERVICEOPS_READ_ONLY.");
    return { ok: false, action: "ensure_customer_details", message: "Read-only mode is on. Missing customer details were not written to Striven." };
  }

  if (getEnv().demoMode) {
    audit(row, "ensure_customer_details", "demo", "", "Simulated customer detail update.");
    return { ok: true, action: "ensure_customer_details", message: "Demo customer details checked." };
  }

  const customers = await getReferenceCustomers();
  const locations = await getReferenceLocations();
  const customer = customers.find((item) => item.customerId === customerId);
  const result = {
    contactCreated: 0,
    locationCreated: false,
    skipped: [] as string[],
    warnings: [] as string[]
  };

  if (needsContactUpdate(row, customer)) {
    try {
      const profileResult = await updateCustomerProfileFromWebform(customerId, row);
      if (profileResult.updated) {
        result.contactCreated++;
      } else {
        result.skipped.push(profileResult.message);
      }
    } catch (error) {
      result.warnings.push(`Customer profile update failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  } else {
    result.skipped.push("Cached customer contact already has matching phone/email.");
  }

  const hasMatchingLocation = locations.some((location) => {
    if (location.customerId !== customerId) return false;
    return buildAddressKey(location.street, location.city, location.postalCode) === buildAddressKey(row.street, row.city, row.postalCode);
  });

  if (!hasMatchingLocation && safeText(row.street) && safeText(row.city)) {
    try {
      await createCustomerLocation(customerId, row);
      result.locationCreated = true;
    } catch (error) {
      result.warnings.push(`Location create failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  } else if (hasMatchingLocation) {
    result.skipped.push("Cached customer location already matches the webform address.");
  } else {
    result.skipped.push("No street/city on webform to create a location.");
  }

  row.needsReview = result.warnings.length > 0;
  row.lastError = result.warnings.length ? `Customer details need review: ${result.warnings.join(" | ").slice(0, 800)}` : "";
  upsertIntakeRow(row);
  audit(row, "ensure_customer_details", result.warnings.length ? "warning" : "ok", row.lastError, JSON.stringify(result));

  const changed = result.contactCreated || result.locationCreated;
  return {
    ok: result.warnings.length === 0,
    action: "ensure_customer_details",
    message: changed
      ? `Updated missing customer details: ${result.contactCreated} contact(s), ${result.locationCreated ? 1 : 0} location.`
      : "Customer details already matched the cached contact/location data.",
    data: result
  };
}

async function repairRequest(row: IntakeRow): Promise<ActionResult> {
  const steps: string[] = [];
  const warnings: string[] = [];
  let changed = false;

  if (!parseNumericId(row.strivenCustomerId)) {
    const customerResult = await resolveCustomer(row);
    steps.push(customerResult.message);
    if (!customerResult.ok) warnings.push(customerResult.message);
    row = getIntakeRowBySourceRow(row.sourceRow) || row;
    changed = changed || customerResult.ok;
  }

  if (parseNumericId(row.strivenCustomerId)) {
    const detailResult = await ensureCustomerDetails(row);
    steps.push(detailResult.message);
    if (!detailResult.ok) warnings.push(detailResult.message);
    changed = changed || Boolean((detailResult.data as { contactCreated?: number; locationCreated?: boolean } | undefined)?.contactCreated || (detailResult.data as { locationCreated?: boolean } | undefined)?.locationCreated);
    row = getIntakeRowBySourceRow(row.sourceRow) || row;
  }

  const recheckResult = await recheckRequest(row);
  steps.push(recheckResult.message);
  if (!recheckResult.ok) warnings.push(recheckResult.message);
  changed = changed || Boolean((recheckResult.data as { updated?: number } | undefined)?.updated);

  const repaired = getIntakeRowBySourceRow(row.sourceRow) || row;
  audit(repaired, "repair_request", warnings.length ? "warning" : "ok", warnings.join(" | "), JSON.stringify({ steps, changed }).slice(0, 2000));

  return {
    ok: warnings.length === 0,
    action: "repair_request",
    message: warnings.length
      ? `Repair needs review: ${warnings.join(" | ").slice(0, 600)}`
      : changed
        ? "Repair completed. Customer/status details were updated from the safest available data."
        : "Repair completed. No different cached match was found, so the request was moved to Review for operator verification.",
    data: { steps, changed, warnings }
  };
}

async function reportAndRepairRequest(row: IntakeRow, input: Record<string, unknown>): Promise<ActionResult> {
  const issues = normalizeReportIssues(input.issues);
  const details = safeText(input.details);
  if (!issues.length) {
    return { ok: false, action: "report_repair", message: "Select at least one mapped field to repair." };
  }

  const clearResult = clearReportedMappings(row, issues);
  const cleared = clearResult.row;
  cleared.needsReview = false;
  cleared.lastError = "";
  upsertIntakeRow(cleared);

  audit(cleared, "report_repair_clear", "ok", "", JSON.stringify({
    issues,
    details,
    cleared: clearResult.cleared
  }).slice(0, 2000));

  const steps: string[] = [
    `Cleared ${clearResult.cleared.length ? clearResult.cleared.join(", ") : "selected review markers"}.`
  ];
  const warnings: string[] = [];

  const repairResult = await repairRequest(cleared);
  steps.push(repairResult.message);
  if (!repairResult.ok) warnings.push(repairResult.message);

  let refreshed = getIntakeRowBySourceRow(cleared.sourceRow) || cleared;
  if (shouldRepairOpportunity(issues)) {
    const opportunityResult = recheckOpportunityFromCachedReports(refreshed);
    steps.push(opportunityResult.message);
    if (!opportunityResult.ok) warnings.push(opportunityResult.message);
    refreshed = getIntakeRowBySourceRow(cleared.sourceRow) || refreshed;
  }

  if (warnings.length) {
    refreshed.needsReview = true;
    refreshed.lastError = `Report repair needs review: ${warnings.join(" | ").slice(0, 700)}`;
    upsertIntakeRow(refreshed);
  }

  audit(refreshed, "report_repair", warnings.length ? "warning" : "ok", warnings.join(" | "), JSON.stringify({
    issues,
    details,
    steps
  }).slice(0, 2000));

  return {
    ok: warnings.length === 0,
    action: "report_repair",
    message: warnings.length
      ? `Repair needs review: ${warnings.join(" | ").slice(0, 600)}`
      : "Selected mappings were cleared and re-checked from the freshest available reports.",
    data: { issues, cleared: clearResult.cleared, steps, warnings }
  };
}

function normalizeReportIssues(value: unknown) {
  const list = Array.isArray(value) ? value : [];
  const issues = list.map((item) => safeText(item)).filter(Boolean);
  return issues.includes("Select All") ? reportRepairOptions() : issues;
}

function reportRepairOptions() {
  return [
    "Customer #",
    "Customer name",
    "Phone",
    "Email",
    "Address / location",
    "Opportunity #",
    "Opportunity status",
    "SO #",
    "SO status",
    "Task #",
    "Task status",
    "Schedule / technician",
    "Appliance details",
    "Service request details"
  ];
}

function clearReportedMappings(row: IntakeRow, issues: string[]) {
  const normalized = issues.map((issue) => issue.toLowerCase());
  const includes = (...needles: string[]) => normalized.some((issue) => needles.some((needle) => issue.includes(needle)));
  const cleared: string[] = [];
  const next = { ...row };

  const customerReported = includes("customer", "phone", "email", "address", "location");
  const opportunityReported = customerReported || includes("opportunity");
  const salesOrderReported = opportunityReported || includes("so #", "so status", "sales order");
  const taskReported = salesOrderReported || includes("task", "schedule", "technician");

  if (customerReported) {
    next.strivenCustomerId = "";
    cleared.push("customer");
  }

  if (opportunityReported) {
    next.strivenOppId = "";
    next.opportunityStage = "";
    cleared.push("opportunity");
  }

  if (salesOrderReported) {
    next.strivenSoId = "";
    next.salesOrderNumber = "";
    next.salesOrderStatus = "";
    next.salesOrderCreatedAt = "";
    next.salesOrderUpdatedAt = "";
    next.salesOrderScheduledAt = "";
    next.salesOrderInProgressAt = "";
    next.swoQuotedToInProgress = "";
    next.swoCreatedToScheduled = "";
    cleared.push("sales order");
  }

  if (taskReported) {
    next.cleanServiceTaskStatus = "";
    next.taskMatched = false;
    next.serviceAppointmentNote = "";
    cleared.push("task/schedule");
  }

  next.pipelineState = next.strivenSoId || next.salesOrderNumber
    ? PIPELINE_STATE.serviceSalesOrderCreated
    : next.strivenOppId
      ? shouldCreateSalesOrderFromStageText(next.opportunityStage)
        ? PIPELINE_STATE.approvedForSwo
        : PIPELINE_STATE.opportunityCreated
      : next.strivenCustomerId
        ? PIPELINE_STATE.customerResolved
        : PIPELINE_STATE.newRow;

  return { row: next, cleared: Array.from(new Set(cleared)) };
}

function shouldCreateSalesOrderFromStageText(value: string) {
  return /approved for swo|approved_for_swo/i.test(value);
}

function shouldRepairOpportunity(issues: string[]) {
  return issues.some((issue) => /opportunity|select all/i.test(issue));
}

function recheckOpportunityFromCachedReports(row: IntakeRow): ActionResult {
  const opportunities = getCachedReportRows("opportunities").rows;
  if (!opportunities.length) {
    return {
      ok: false,
      action: "report_repair_opportunity",
      message: "No cached opportunity report is available. Refresh Live Data first, then run Report repair again."
    };
  }

  const customerId = String(parseNumericId(row.strivenCustomerId) || "");
  if (!customerId) {
    return {
      ok: false,
      action: "report_repair_opportunity",
      message: "Customer is not resolved, so opportunity search was held."
    };
  }

  const scored = opportunities.map((candidate) => {
    const opportunityId = String(parseNumericId(findValueByAliases(candidate, ["OpportunityId", "Opportunity ID", "OpportunityID", "Id"])) || "");
    const candidateCustomerId = String(parseNumericId(findValueByAliases(candidate, ["CustomerCustomerId", "CustomerId", "Customer ID", "AccountID", "Account Id"])) || "");
    const title = safeText(findValueByAliases(candidate, ["OpportunityName", "Opportunity Name", "Name", "Title"]));
    const stage = safeText(findValueByAliases(candidate, ["Stage", "OpportunityStage", "Opportunity Stage", "Status", "OpportunityStatus", "Opportunity Status"]));
    const updatedAt = safeText(findValueByAliases(candidate, ["LastUpdatedDate", "Last Updated Date", "ModifiedOn", "Modified On", "DateCreated", "CreatedOn"]));
    const haystack = `${title} ${stage}`.toLowerCase();
    const name = `${row.firstName} ${row.lastName}`.trim().toLowerCase();
    const phone = normalizePhone10(row.phone);
    const city = row.city.toLowerCase();
    let score = candidateCustomerId === customerId ? 50 : 0;
    if (name && haystack.includes(name)) score += 18;
    if (row.lastName && haystack.includes(row.lastName.toLowerCase())) score += 8;
    if (phone && haystack.includes(phone)) score += 8;
    if (city && haystack.includes(city)) score += 6;
    if (/webform|service|fireplace|clean/i.test(haystack)) score += 5;
    return { opportunityId, stage, title, updatedAt, score };
  }).filter((candidate) => candidate.opportunityId && candidate.score >= 50);

  scored.sort((a, b) => b.score - a.score || parseTime(b.updatedAt) - parseTime(a.updatedAt));
  const match = scored[0];
  if (!match) {
    row.needsReview = true;
    row.lastError = "No opportunity match found in cached opportunity report after clearing reported mapping.";
    row.pipelineState = PIPELINE_STATE.reviewRequired;
    upsertIntakeRow(row);
    return {
      ok: false,
      action: "report_repair_opportunity",
      message: row.lastError
    };
  }

  row.strivenOppId = match.opportunityId;
  row.opportunityStage = match.stage;
  row.pipelineState = PIPELINE_STATE.opportunityCreated;
  row.needsReview = false;
  row.lastError = "";
  upsertIntakeRow(row);
  audit(row, "report_repair_opportunity", "matched", "", JSON.stringify(match).slice(0, 1000));
  return {
    ok: true,
    action: "report_repair_opportunity",
    message: `Opportunity re-matched from cached report: #${match.opportunityId}${match.stage ? ` (${match.stage})` : ""}.`,
    data: match
  };
}

function parseTime(value: string) {
  const time = Date.parse(value);
  return Number.isNaN(time) ? 0 : time;
}

function needsContactUpdate(row: IntakeRow, customer?: { email?: string; phone?: string; altPhone?: string; contactId?: number }) {
  const rowEmail = normalizeEmail(row.email);
  const rowPhone = normalizePhone10(row.phone);
  const rowAltPhone = normalizePhone10(row.altPhone);
  const customerEmail = normalizeEmail(customer?.email);
  const customerPhone = normalizePhone10(customer?.phone);
  const customerAltPhone = normalizePhone10(customer?.altPhone);

  if (!customer?.contactId) return Boolean(rowEmail || rowPhone || rowAltPhone);
  if (rowEmail && rowEmail !== customerEmail) return true;
  if (rowPhone && rowPhone !== customerPhone && rowPhone !== customerAltPhone) return true;
  if (rowAltPhone && rowAltPhone !== customerPhone && rowAltPhone !== customerAltPhone) return true;
  return false;
}

async function markReviewed(row: IntakeRow): Promise<ActionResult> {
  row.needsReview = false;
  row.lastError = "";
  upsertIntakeRow(row);
  audit(row, "mark_reviewed", "ok", "", "Marked reviewed.");
  return { ok: true, action: "mark_reviewed", message: "Marked reviewed." };
}

async function getReferenceCustomers() {
  if (getEnv().demoMode) return demoCustomers;
  try {
    const { fetchCustomersReport, normalizeCustomerReportRows } = await import("@/lib/striven/reports");
    const cached = normalizeCustomerReportRows(getCachedReportRows("customers").rows);
    if (cached.length) return cached;
    return await fetchCustomersReport();
  } catch {
    return demoCustomers;
  }
}

async function getReferenceLocations() {
  if (getEnv().demoMode) return demoLocations;
  try {
    const { fetchCustomerLocationsReport, normalizeCustomerLocationReportRows } = await import("@/lib/striven/reports");
    const cached = normalizeCustomerLocationReportRows(getCachedReportRows("customerLocations").rows);
    if (cached.length) return cached;
    return await fetchCustomerLocationsReport();
  } catch {
    return demoLocations;
  }
}

async function getReferenceWorkOrders() {
  if (getEnv().demoMode) return demoWorkOrders;
  try {
    const { fetchServiceWorkOrdersReport, normalizeServiceWorkOrderReportRows } = await import("@/lib/striven/reports");
    const cached = normalizeServiceWorkOrderReportRows(getCachedReportRows("serviceWorkOrders").rows);
    if (cached.length) return cached;
    return await fetchServiceWorkOrdersReport();
  } catch {
    return demoWorkOrders;
  }
}

# Task Mapping Process Contract Matrix

This document defines the business contracts that code reorganization must preserve or intentionally improve. It is the acceptance reference for future refactors.

## Canonical endpoint states

Every workflow execution must end in exactly one durable endpoint state:

| Endpoint | Meaning | Retry behavior |
|---|---|---|
| `VERIFIED_COMPLETE` | Intended external state exists and required read-back proves it | No automatic retry |
| `NO_CHANGE_VERIFIED` | External state already matched desired state | No automatic retry |
| `REVIEW_REQUIRED` | Evidence is ambiguous or a human decision is required | No blind retry |
| `BLOCKED` | A hard prerequisite/guardrail is missing | Retry only after blocker changes |
| `DEFERRED_RETRY` | Correct action is known but intentionally delayed | Retry only when stated condition/time is met |
| `PARTIAL_FAILURE` | Some intended steps succeeded and some failed | Reconcile before retry |
| `UNCERTAIN_WRITE` | A write may have occurred but outcome is unknown | Never repeat CREATE until reconciled |
| `TERMINAL_SKIP` | Intentionally out of scope / no action ever required | No retry |

`READY`, `MATCHED`, `PUSHED`, `WOULD_CREATE`, `WOULD_RECREATE`, and generic `SKIPPED` are intermediate/legacy labels, not business endpoints.

---

# Common cross-workflow guardrails

These apply unless a workflow profile explicitly narrows them further.

## Freshness and concurrency

- Re-read or freshness-check the authoritative Calendar event before a consequential write.
- If event fingerprint materially changed after planning, do not execute stale plan; rebuild/review.
- Prevent overlapping write-capable runs with the existing lock discipline or its proven replacement.

## Relationship integrity

Before a write plan is executable, prove every required relationship, not merely presence of IDs:

- Sales Order belongs to resolved Customer.
- Location belongs to resolved Customer.
- Contact belongs to resolved Customer when Contact is used.
- Employee resolution is exact when Employee identity is required.
- Task belongs to the intended workflow/type/customer/location/context.

If any required relationship is unproven or contradictory: `REVIEW_REQUIRED` or `BLOCKED`.

## Task mutability

- Normal task field PATCH targets only a safe OPEN task.
- DONE/COMPLETED/CLOSED/CANCELLED/ON HOLD tasks are not normal PATCH targets.
- Completed-task replacement is a recovery decision, not a normal update.

## Duplicate prevention

Before CREATE/RECREATE:

- re-check for an eligible OPEN task using the current authoritative identifiers;
- if exactly one valid OPEN task now exists, reuse/reconcile it instead of creating;
- if multiple valid candidates exist, `REVIEW_REQUIRED`;
- uncertain previous POST => reconcile first, never blindly retry.

## Verification

After every material external write:

- read the resulting Striven task/relationship or Calendar description back;
- compare material expected vs actual state;
- only then use `VERIFIED_COMPLETE`.

A transport/API success without required read-back is not a complete business endpoint.

## Calendar mutation policy

Calendar business content is read-only to Task Mapping except for specifically approved, idempotent managed Striven-link/handoff blocks.

Managed Calendar writes must:

- preserve organizer-authored text;
- be idempotent;
- aggregate all links expected for the event before write;
- read back and verify after material update.

---

# INSTALL CONTRACT

## Primary identity/matching

- Exact Sales Order evidence is the strongest normal anchor.
- Customer-only matches cannot independently authorize an automatic task mutation.
- Multiple plausible task matches => `REVIEW_REQUIRED`.
- Prefer the safest valid OPEN Install task when duplicate historical tasks share an SO.

## Normal PATCH guardrails

- Task ID required.
- Task Status must be OPEN.
- Mapping/write intent must be safe/eligible under existing Install rules.
- Date push requires complete Calendar timing and actual difference.
- ID relationship push requires authoritative value and actual difference.
- No changes => `NO_CHANGE_VERIFIED` after sufficient state confirmation.

## Install recovery guardrails

CREATE/RECREATE requires:

- current Calendar appointment still exists and is in scope;
- authoritative SO Number and SalesOrderId;
- resolved CustomerId;
- resolved LocationId belonging to that customer;
- Requested By/contact relationship valid for the resolved customer if used by Install;
- no qualifying OPEN Install task exists at execution time;
- completed source task is a legitimate source for replacement when RECREATE is chosen;
- future/past date rules respected.

If the source task was completed today and policy intentionally waits until a later day, endpoint = `DEFERRED_RETRY`, not terminal skip.

## Install Calendar link

- Exact Event ID and Task ID relationship required.
- One idempotent managed Install Task link.
- Link repair may be allowed for a completed task when event/task relationship is already exact; Striven task OPEN status is not automatically required merely to repair a Calendar link.
- Calendar read-back verification required.

## Install lifecycle endpoints

- Future appointment with correct OPEN task + verified Calendar link => `VERIFIED_COMPLETE` for synchronization cycle.
- Legitimately past/completed Install with no remaining handoff obligation => terminal lifecycle complete.
- Future appointment whose old task is completed => recovery path owns the next action.

---

# DELIVERY CONTRACT

## Primary identity/matching

- Delivery task/SO/customer evidence must resolve uniquely.
- Customer-only or secondary-workflow-only evidence cannot authorize automatic mutation without exact corroboration.
- Ambiguous address/location match => `REVIEW_REQUIRED`.

## Normal PATCH guardrails

- Mapping Status must be safe/READY under current Delivery contract.
- Push intent must be YES where required by current interface.
- Task ID required.
- Task Status OPEN.
- Date push requires complete Calendar start/end and actual difference.
- Relationship push requires authoritative SO/Location/RequestedBy values and ownership validation.

## Assignment guardrails

- To Be Assigned Pool ID 4 is preserved until a valid employee assignment is proven.
- John Hoang => Employee 18.
- Matthew Thompson => Employee 26.
- Aiden currently must not be guessed if employee resolution remains unconfigured/unproven.
- Do not remove the pool unless at least one valid intended employee assignment exists.
- If assignment was required but assignment write/helper fails, endpoint = `PARTIAL_FAILURE`, not `PUSHED`/complete.

## Delivery Calendar link

- Approved managed links must preserve authored text and be idempotent.
- Required applicable SO/Task link set must be verified after write.

## Delivery endpoint

Only use `VERIFIED_COMPLETE` when all applicable components are correct:

`dates + customer/SO/location/requested-by relationships + assignment + managed Calendar links`.

---

# SERVICE CONTRACT

## Primary identity/matching

- Service can represent more than one task on one Calendar event.
- Customer-only matching cannot independently authorize mutation.
- Secondary Delivery-only evidence remains review-only unless exact Service evidence establishes the relationship.

## Multi-fireplace cardinality guardrail

The synchronization unit is **Calendar Event + expected Service task set**, not merely one mapping row.

If event semantics indicate multiple fireplaces/tasks (for example FP#1 / FP#2):

- determine expected task cardinality;
- uniquely match each expected task;
- block/review missing, duplicate, or ambiguous task members;
- aggregate all expected managed task links before one Calendar description write;
- verify the full expected link set afterward.

A later task row must never replace an earlier task's managed link for the same event.

## Normal PATCH guardrails

- READY + Push YES under existing Service interface.
- Task ID required.
- Task Status OPEN.
- Complete Calendar start/end required for date change.
- Calendar technician must resolve to known Service employee before assignment mutation.
- Recent successful push fingerprint may suppress duplicate re-push while reports catch up.

## Technician assignment

- Chris => Employee 39.
- Travis => Employee 38.
- Matt/Matthew => Employee 26.
- To Be Assigned Pool => Pool 4.
- Do not remove the only assignment unless intended employee assignment is confirmed.
- Assignment warnings/errors must affect endpoint status when assignment was required.

## Service endpoint

`VERIFIED_COMPLETE` requires the complete event-level expected task set, correct date/time/technician state for every applicable task, and all expected managed Calendar links present.

---

# PREINSPECTION CONTRACT

## Task profile

- Task Type ID 105.
- Default assigned Pool ID 8.
- Preferred concise title: `Preinspect - Customer Name - (###) ###-####`.

## Customer resolution

Calendar evidence may include:

1. Customer Number
2. exact Sales Order Number
3. normalized phone
4. address similarity

Branches must converge to one verified customer package.

- unique customer required for automatic mutation;
- contradictory/multiple unrelated matches => `REVIEW_REQUIRED`;
- new location creation is permitted only for an already verified customer and only after location payload/ownership rules are proven.

## Requested By — PreInspect-only rule

Authoritative rule:

`Calendar organizer email -> exactly one Striven Employee -> RequestedBy { Id: EmployeeId, Type: 'employee' }`

Guardrails:

- organizer missing => REVIEW;
- zero employee matches => REVIEW;
- multiple employee matches => REVIEW;
- no fallback to customer Contact;
- do not hard-code employee ID when exact organizer-email resolution is available;
- read back and verify Employee ID after write.

This rule applies only to PreInspection. Install/Delivery/Service Requested By logic must not be changed by this contract.

## PreInspect task matching

- Exactly one valid OPEN PreInspection task => reuse/reconcile.
- No valid OPEN task => eligible CREATE only after all required relationships are proven.
- Multiple valid OPEN candidates => `REVIEW_REQUIRED`.
- Do not clone technician-completed state from a DONE task into a new appointment.

## Create/reconcile field guardrails

Desired task state:

- Customer = resolved customer.
- Location = resolved customer location.
- Requested By = resolved organizer Employee.
- Start/Due = Calendar timing.
- Assigned Pool = 8.
- Custom Field 854 Install Notes = Calendar-authored notes only.
- Task Description = blank on CREATE and never populated from Calendar notes.
- Do not prefill technician-completed fields including Difficulty of the Job, Job Risk, Finishing 852, Electrical Work 853, Custom Metal Work 860.
- Sales Order is not attached merely to create/recreate the PreInspection task.

## Missing Customer Number notification

If customer is uniquely verified but Calendar lacks Customer Number:

- continue valid task workflow;
- send one deduplicated, non-blocking notification to the event organizer asking them to add Customer Number;
- record notification state so scheduled runs do not repeatedly email the organizer.

Until this branch is implemented/proven, it remains a known lifecycle gap.

## PreInspect verification/link

- Material Striven writes require read-back verification.
- Maintain one idempotent managed PreInspection Task link in the Calendar description.
- Calendar read-back verifies managed link while preserving authored text.

## Technician completion and downstream handoff

After PreInspection task is DONE:

1. preserve technician-entered results;
2. resolve final Sales Order uniquely;
3. if final SO not yet available => `DEFERRED_RETRY` with reason `AWAITING_FINAL_SO`;
4. find Install task/event using exact SO as primary anchor;
5. verify same customer;
6. require exactly one valid Install target;
7. zero Install target => `DEFERRED_RETRY` (`AWAITING_INSTALL_MATCH`), not terminal failure;
8. multiple/mismatched Install targets => `REVIEW_REQUIRED`;
9. append completed PreInspection Task link immediately below existing Install Task link;
10. read Calendar description back and verify both links;
11. repeat runs must not duplicate link.

Separate intended DONE -> Sales Order Internal Notes handoff remains independently guarded and is not considered production-complete until unique SO resolution, idempotency, and read-back are proven.

## PreInspect lifecycle states

Recommended explicit states:

- `PREINSPECT_ACTIVE_VERIFIED`
- `DONE_AWAITING_FINAL_SO`
- `DONE_INSTALL_MATCH_PENDING`
- `DONE_INSTALL_MATCH_REVIEW`
- `INSTALL_LINK_PENDING`
- `INSTALL_LINK_VERIFIED`
- `SO_NOTES_PENDING` (only if/when this becomes mandatory)
- `PREINSPECT_HANDOFF_COMPLETE`

---

# REPORT/CACHE CONTRACT

- HTTP success alone does not prove a valid report.
- Validate expected response schema before replacing an existing report cache.
- Unexpected response shape must fail refresh and preserve last-known-good data.
- A zero-row result must be distinguishable from schema/transport parsing failure.
- Pagination must prove natural termination; reaching configured max page count while pages remain full must be treated as truncation/blocker, not silent success.
- Large/master datasets should use once-daily or policy-defined TTL unless operational freshness requires more.

Endpoint examples:

- `CACHE_REFRESH_VERIFIED`
- `CACHE_NO_CHANGE_VERIFIED`
- `CACHE_REFRESH_FAILED_KEEP_LAST_GOOD`
- `CACHE_TRUNCATION_BLOCKED`

---

# SCHEDULER/ORCHESTRATION CONTRACT

- One scheduler layer owns time-driven execution policy.
- Workflow functions should not independently create competing scheduling models.
- Refresh/rebuild generation must be known before downstream link mutation uses it.
- If refresh/rebuild fails, link writer may proceed only when it can prove the existing mapping snapshot is valid and sufficiently fresh; otherwise block link mutation.
- Link-only slots should not blindly re-fetch all operational reports when the cache remains inside approved TTL.
- Nested failures must propagate to the parent execution envelope; a parent must not return SUCCESS while a required child mutation returns errors.

## Standard execution envelope

Every orchestrated run should eventually expose:

- workflow/division
- mode
- source freshness/generation
- rows/events evaluated
- decisions planned
- Striven writes attempted/succeeded/failed
- Calendar writes attempted/succeeded/failed
- rows requiring review
- deferred rows and retry conditions
- endpoint counts
- API call count when available
- runtime
- verification status
- code/release version

---

# Migration acceptance rule

A current function/path may be retired only when:

1. all known callers are identified;
2. its business contract is represented in the canonical pipeline;
3. known-good and known-bad test cases produce equivalent or intentionally corrected decisions;
4. write guardrails are at least as strict as before;
5. runtime verification exists for any changed write path;
6. legacy entrypoint has a proven adapter or confirmed zero callers;
7. rollback remains possible.

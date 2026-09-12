# Service Workflow

## Scope

Service is one of the four primary Task Mapping workflows. This document defines the Service business contract that repository/source reorganization must preserve.

**Evidence status:** PROJECT CONTRACT. Exact current 36-file source confirmation is still required before physical source movement.

## Primary identity and matching

- Service may represent more than one task on one Calendar event.
- Customer-only matching cannot independently authorize mutation.
- Secondary Delivery-only evidence remains review-only unless exact Service evidence establishes the relationship.
- Task matching must preserve the intended Service workflow/customer/location/event context.

## Event-level synchronization unit

The synchronization unit is:

`Calendar Event + expected Service task set`

—not merely one mapping row.

For multi-fireplace events such as FP#1 / FP#2:

- determine expected task cardinality;
- uniquely match every expected task;
- REVIEW/BLOCK missing, duplicate, or ambiguous members;
- aggregate all expected managed task links before one Calendar description write;
- verify the full expected link set afterward.

A later mapping row must never overwrite an earlier task link for the same event.

## Normal synchronization

A normal Service PATCH requires:

- READY + Push YES under the existing interface;
- Task ID present;
- Task Status = OPEN;
- complete Calendar start/end for date changes;
- actual expected-vs-current difference before write;
- Calendar technician resolved to a valid Service employee before assignment mutation.

A recent successful push fingerprint may suppress duplicate re-push while report/cache data catches up.

## Technician assignment contract

Known current project rules that refactoring must preserve unless exact live source proves a newer rule:

- Chris → Employee 39.
- Travis → Employee 38.
- Matt/Matthew → Employee 26.
- To Be Assigned → Pool ID 4.
- Do not remove the only valid assignment unless the intended employee assignment is confirmed.
- Assignment warnings/errors must affect final endpoint status when assignment was required.

**Evidence status for employee mappings:** HISTORICAL BASELINE — CURRENT SOURCE CONFIRMATION REQUIRED before code movement.

## Calendar link contract

- Aggregate all expected Service task links for the event before write.
- Preserve organizer-authored Calendar text.
- Managed link write must be idempotent.
- Read Calendar description back after material update.
- Verify the full expected task-link set.

## Endpoint contract

`VERIFIED_COMPLETE` requires:

- complete event-level expected task set;
- correct date/time state for every applicable task;
- correct technician/assignment state for every applicable task;
- all expected managed Calendar task links present and verified.

## Known reorganization risks to preserve/test

- multi-fireplace events are vulnerable to last-task-wins Calendar link overwrite if links are written row-by-row;
- task-set cardinality must be event-level, not row-level;
- assignment failures must propagate to final status;
- recent-push fingerprints must not hide a real failed write;
- exact current trigger/menu/function ownership remains to be inventoried from the live 36-file source.

## Reorganization inventory still required

Before Service source code is moved or consolidated, capture:

- Service files/functions;
- public/menu/trigger entrypoints;
- Service Calendar and Service Data sheets/headers;
- event-to-multiple-task mapping logic;
- Calendar read/write functions;
- Striven task/work-order reports and record-specific API calls;
- technician resolution/assignment helpers;
- recent-push fingerprint state;
- recovery/create/recreate logic;
- compatibility aliases and callers.

# Delivery Workflow

## Scope

Delivery is one of the four primary Task Mapping workflows. This document defines the Delivery business contract that repository/source reorganization must preserve.

**Evidence status:** PROJECT CONTRACT. Exact current 36-file source confirmation is still required before physical source movement.

## Primary identity and matching

- Delivery task/SO/customer evidence must resolve uniquely.
- Customer-only evidence cannot independently authorize automatic mutation.
- Secondary evidence from another workflow cannot authorize Delivery mutation without exact Delivery corroboration.
- Ambiguous address/location matches require `REVIEW_REQUIRED`.

## Normal synchronization

A normal Delivery PATCH requires:

- safe/eligible mapping status under the current Delivery interface;
- Push intent = YES where the current interface requires it;
- Task ID present;
- Task Status = OPEN;
- complete authoritative Calendar timing for date changes;
- actual expected-vs-current difference before write;
- validated SO/Customer/Location/Requested By relationships for relationship changes.

## Relationship integrity

Before mutation, prove:

- Sales Order belongs to the intended Customer;
- Location belongs to that Customer;
- Requested By relationship is valid when used;
- Delivery task belongs to the intended workflow/customer/location/context.

IDs that merely exist are not enough.

## Assignment contract

Known current project rules that refactoring must preserve unless exact live source proves a newer rule:

- To Be Assigned → Pool ID 4.
- John Hoang → Employee 18.
- Matthew Thompson → Employee 26.
- Aiden must not be guessed while employee resolution remains unconfigured/unproven.
- Do not remove Pool 4 unless at least one valid intended employee assignment exists.
- If an assignment is required but the assignment helper/write fails, endpoint = `PARTIAL_FAILURE`, not complete/PUSHED.

**Evidence status for the employee mapping list:** HISTORICAL BASELINE — CURRENT SOURCE CONFIRMATION REQUIRED before code movement.

## Calendar link contract

- Maintain only approved managed SO/Task links for Delivery.
- Preserve organizer-authored Calendar text.
- Writes must be idempotent.
- Read Calendar description back after a material link update.
- Verify the complete applicable link set, not only transport success.

## Endpoint contract

Use `VERIFIED_COMPLETE` only when all applicable Delivery components are correct and verified:

`dates + customer/SO/location/requested-by relationships + assignment + managed Calendar links`.

If one required component fails after another succeeds, use `PARTIAL_FAILURE` and reconcile before retry.

## Known reorganization risks to preserve/test

- assignment helper failure must propagate to final workflow status;
- pool removal must not strand the task without a valid assignment;
- cross-workflow fallback evidence must not become automatic mutation authority;
- duplicate prevention and relationship ownership must be rechecked immediately before CREATE/RECREATE;
- exact current trigger/menu/function ownership remains to be inventoried from the live 36-file source.

## Reorganization inventory still required

Before Delivery source code is moved or consolidated, capture:

- Delivery files/functions;
- public/menu/trigger entrypoints;
- sheets and header expectations;
- Calendar read/write functions;
- Striven reports/API mutations;
- matching/resolution priorities and cross-division fallbacks;
- assignment helpers and employee/pool resolution;
- recovery/create/recreate paths;
- fingerprints/idempotency rules;
- compatibility aliases and callers.

# Task Mapping — Same-Project Shadow Test Plan

## Purpose

Validate rewritten Task Mapping code inside the **existing production Apps Script project and existing spreadsheet** without replacing or deleting the current working implementation.

This plan covers Install, Delivery, Service, PreInspection, and every shared module they depend on.

## Chosen strategy

We are **not** creating a second permanent Apps Script TEST project or duplicate workbook at this stage.

Instead, use a compatibility-preserving **shadow/sidecar migration** inside the current Script ID:

- keep every existing production file and function;
- add rewritten files beside them;
- give all rewritten files/functions unique names so they cannot override current globals;
- do not connect rewritten functions to existing triggers or menus initially;
- run rewritten logic manually in read-only shadow mode first;
- compare rewritten results with current production behavior;
- permit tightly controlled canary writes only after shadow parity passes;
- cut over one workflow at a time only after evidence is sufficient;
- keep the old implementation available for rollback until the new path is proven stable.

## Naming rule

Apps Script files share one global JavaScript namespace. Duplicate global function/variable names are unsafe.

Rewritten source must therefore use a unique prefix. Current convention:

- file prefix: `TM2_`
- function prefix: `tm2_`

Examples:

- `TM2_10_Calendar_Source.js`
- `TM2_20_Relationship_Resolver.js`
- `tm2_buildInstallPlan_()`
- `tm2_runInstallShadowAudit()`

Existing public/menu/trigger functions retain their current names until an intentional cutover.

## Runtime modes

### `SHADOW_READ_ONLY`

Default mode.

- may read the existing spreadsheet, Calendars, reports, and Striven data;
- may calculate mappings, matches, plans, endpoint classifications, and expected writes;
- must not mutate Striven, Calendar business content, production mapping data, triggers, or production configuration;
- records evidence in logs / test evidence rather than adding new workflow sheets or columns.

### `CANARY_WRITE`

Manual-only controlled mode.

Allowed only after the relevant shadow tests pass.

- no time-driven triggers;
- no bulk all-workflow writes;
- explicit workflow + event/row/task context required;
- explicit write-enable gate required;
- duplicate prevention and relationship checks rerun immediately before mutation;
- material writes require read-back verification;
- uncertain CREATE is never blindly retried.

### `CUTOVER_READY`

Evidence state only. It does not automatically switch production routing.

A workflow becomes `CUTOVER_READY` only after shadow parity, canary verification, and regression coverage pass.

## No-trigger rule during shadow testing

Current production triggers continue invoking the current implementation.

Rewritten `tm2_...` entrypoints must not be added to existing time-driven triggers during early testing. Initial execution is manual from the Apps Script editor or an explicitly isolated test runner.

No rewritten `onOpen`, `onEdit`, or other trigger-compatible function may use a legacy public name.

## Existing-sheet testing rule

The existing workbook remains the source of realistic production data.

To keep testing low-friction:

- do not create duplicate production workflow sheets merely for the rewrite;
- do not add permanent test columns to the live mapping sheets;
- use read-only comparison wherever possible;
- use existing diagnostics/logging or external test-evidence records for comparisons;
- canary writes must target only the explicitly selected/approved case.

## Striven and Calendar safety

Because the same project uses live Striven and Calendar context, `CANARY_WRITE` is a real production-data mutation and must be treated accordingly.

Before a canary mutation:

1. fresh Calendar/read source state;
2. exact workflow context;
3. relationship integrity proof;
4. duplicate check;
5. explicit manual write enable;
6. smallest possible changed scope;
7. authoritative read-back after write.

Bulk CREATE/RECREATE remains disabled during early shadow validation.

## Four-workflow acceptance

If a rewritten shared helper is used by multiple workflows, regression evidence must cover every caller workflow:

- Install;
- Delivery;
- Service;
- PreInspection.

A shared-module rewrite is not accepted because one workflow passes.

## Cutover method

Do not replace all production routes at once.

For each workflow:

1. old implementation remains active;
2. new `TM2_` implementation runs in shadow;
3. compare results on known-good and known-bad cases;
4. perform one or more controlled canary cases where required;
5. mark workflow `CUTOVER_READY` only after PASS;
6. introduce a narrow routing flag/adapter at the existing public entrypoint;
7. switch only that workflow to the new path;
8. immediately runtime-verify;
9. revert the routing flag if verification fails;
10. keep legacy implementation until stabilization and explicit retirement review.

## Pre-push distinction

Adding inert `TM2_` files to the same Script ID is technically a source change to the production Apps Script project even while production routing remains unchanged.

Therefore before any new shadow files are pushed:

- exact current live source must be freshly captured;
- old-file hashes/inventory must be recorded;
- new files must pass syntax/static dependency checks;
- new globals must be checked for collisions;
- old files must remain byte-for-byte unchanged unless a separately approved change is required;
- no current trigger/menu entrypoint may point to the new implementation.

After push, re-pull and verify that all legacy files are unchanged and only the intended `TM2_` files were added/updated.

## Current status

Repository shadow-test framework: DEFINED.

Exact current live source capture: PENDING.

`TM2_` rewritten source: NOT YET BUILT FROM CURRENT LIVE SOURCE.

Production routing changes: NONE.

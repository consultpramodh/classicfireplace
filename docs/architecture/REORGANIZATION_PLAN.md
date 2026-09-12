# Task Mapping Reorganization Plan

**Canonical branch:** `task_mapping`

## Objective

Reorganize the entire Task Mapping system—Install, Delivery, Service, and PreInspection—without changing working business behavior until each migrated path has contract parity and targeted verification.

The target is not a rewrite. It is a staged strangler migration from overlapping/legacy ownership to one canonical execution pipeline.

## Four-workflow coverage requirement

The reorganization applies equally to:

1. Install
2. Delivery
3. Service
4. PreInspection

No phase is considered complete if shared code has been reorganized but one or more affected workflows have not been inventoried and regression-checked.

Dedicated workflow contracts live under `docs/workflows/` and shared acceptance rules live in `docs/architecture/PROCESS_CONTRACT_MATRIX.md`.

## Non-negotiable preservation rules

- Keep durable project material inside the single canonical `task_mapping` branch.
- Use folders and immutable commit SHAs for durable backups/history; do not create permanent backup/reorg branches merely to simulate folders.
- Preserve current public/menu/trigger entry points until replacements are proven.
- Preserve existing sheet names, header expectations, Calendar IDs, task-type rules, assignment rules, and approved Calendar write exceptions.
- Preserve workflow-specific differences; do not genericize away Install, Delivery, Service, or PreInspection guardrails.
- Do not delete legacy files/functions merely because they look redundant.
- No production write is considered complete without the required read-back/reconciliation for that operation.
- No uncertain CREATE may be blindly retried.
- REVIEW/BLOCKED states must fail closed.
- Production Apps Script is not modified merely by repository reorganization.

## Canonical pipeline

`SOURCE -> NORMALIZE -> RESOLVE -> MATCH -> CLASSIFY -> PLAN -> EXECUTE -> VERIFY -> LINK/HANDOFF -> ENDPOINT`

Each stage has one responsibility:

1. **SOURCE** — read Calendar/report/cache data.
2. **NORMALIZE** — normalize identifiers, dates, phone/address/text, event shape.
3. **RESOLVE** — resolve authoritative Customer/SO/Location/Contact/Employee relationships.
4. **MATCH** — find candidate existing tasks/events without writing.
5. **CLASSIFY** — determine safe state: matched, create, recreate, review, blocked, skip/defer.
6. **PLAN** — produce a write plan with required guardrails and expected state.
7. **EXECUTE** — perform only approved Striven/Calendar writes.
8. **VERIFY** — authoritative read-back of material writes.
9. **LINK/HANDOFF** — perform approved idempotent downstream Calendar/SO handoffs.
10. **ENDPOINT** — record durable terminal/deferred state.

## Target ownership model

The final logical ownership should converge toward:

- `00_Config` — IDs, sheet names, task types, pools, calendars, limits, flags only.
- `01_Core_Utilities` — generic date/text/sheet/logging helpers only.
- `05_Workflow_Profiles` — Install/Delivery/Service/PreInspect differences and guardrails.
- `10_Calendar_Source` — Calendar reads/normalization only.
- `11_Report_Cache` — Striven report retrieval, schema validation, freshness/TTL, last-known-good protection.
- `20_Relationship_Resolver` — Customer/SO/Location/Contact/Employee relationship resolution.
- `21_Task_Matcher` — task candidate selection; no writes.
- `22_Mapping_Builder` — mapping-sheet projection only.
- `30_Task_Planner` — PATCH/CREATE/RECREATE/REVIEW/NOTHING decisions; no writes.
- `31_Task_Executor` — approved Striven mutations only.
- `32_Task_Recovery` — missing/completed-task recovery using the same resolver/planner/executor.
- `33_Calendar_Link_Service` — approved idempotent Calendar link/handoff writes only.
- `34_Verification` — read-back and expected-vs-actual reconciliation.
- `40_Orchestrator` — sequencing only; no division business rules.
- `41_Scheduler` — sole owner of time-driven scheduling and freshness decisions.
- `90_Diagnostics` — read-only contract/runtime/health checks.
- `91_Compatibility` — legacy public names forwarding to canonical functions during migration.
- `92_Striven_Client` — HTTP/report/task/assignment primitives; no workflow rules.
- `99_Connectivity_Audit` — function, trigger, dependency, and ownership audit.

These are target responsibilities, not an instruction to rename every current file immediately.

## Migration sequence

### Phase 0 — Freeze and inventory

- Preserve project-wide baseline under `backups/2026-09-12/PROJECT_WIDE_REORG_BASELINE.md`.
- Capture exact current Apps Script source when available.
- Build function/file/trigger/sheet/API/write inventory for all four workflows and shared modules.
- Mark every function as CANONICAL, ADAPTER, LEGACY-USED, LEGACY-UNUSED, or UNKNOWN.
- Map every shared function to the workflows that call it.

### Phase 1 — Endpoint and guardrail contracts

- Adopt canonical endpoint states.
- Document Install, Delivery, Service, and PreInspection guardrails.
- Document deferred/retry behavior.
- Require every non-terminal state to have an owner and next transition.

### Phase 2 — Scheduling/report safety

- Establish one scheduler owner.
- Separate refresh/rebuild from link mutation.
- Add report schema validation and last-known-good cache protection.
- Introduce TTL-based report freshness.
- Regression-check scheduler/report changes across every workflow using the shared reports.

### Phase 3 — Relationship resolver

- Centralize Customer/SO/Location/Contact/Employee relationship proof.
- Require cross-entity ownership validation before CREATE/RECREATE/PATCH.
- Preserve each workflow's matching evidence/priority differences.
- Keep PreInspection Requested By organizer->Employee rule isolated in its workflow profile.

### Phase 4 — Planner/executor separation

- Matching/planning becomes pure/read-only.
- Striven writes move behind a single executor.
- Write plans include workflow identity, expected state, guardrails, and verification requirements.
- Regression-check all workflows using shared planner/executor primitives.

### Phase 5 — Recovery isolation

- Recovery reuses the same resolver/planner/executor.
- Replace presence-only ID checks with relationship-integrity checks.
- Represent wait-until-later cases as `DEFERRED_RETRY`, not generic SKIP.
- Preserve workflow-specific recovery rules.

### Phase 6 — Calendar link/handoff service

- Aggregate all expected links per Calendar event before writing.
- Preserve Install and Delivery managed-link rules.
- Support Service multi-fireplace task sets.
- Support PreInspection downstream Install handoff only under its proven contract.
- Decouple Calendar-link repair from Striven task mutability where relationship evidence is exact.
- Read back Calendar descriptions after material writes.

### Phase 7 — Workflow lifecycle completion

- Install: verify normal sync, recovery, and Calendar-link lifecycle.
- Delivery: verify normal sync, assignment, recovery, and Calendar-link lifecycle.
- Service: verify event-level multi-task synchronization, technician assignment, recovery, and complete link sets.
- PreInspection: complete DONE -> final SO -> exact same-customer Install target -> verified PreInspection link handoff; close Field 854/new-location/missing-customer-number/SO-notes proof gaps.

### Phase 8 — Compatibility cleanup

- Convert legacy public functions to thin adapters.
- Remove dynamic candidate/fallback routing only after call graph and contract tests prove safe ownership.
- Delete dead functions/files only after verified zero callers and regression coverage across every affected workflow.

## No-delete rule during early migration

Until exact live-source parity exists and the complete call graph is grounded in the live 36-file source, early reorganization may add documentation, tests, adapters, or canonical modules, but must not delete production functions/files.

The acceptance checklist for workflow coverage is `docs/workflows/WORKFLOW_COVERAGE_MATRIX.md`.

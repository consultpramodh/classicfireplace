# Task Mapping Reorganization Plan

**Branch:** `reorg/task-mapping-architecture-20260911`

## Objective

Reorganize the Task Mapping system without changing working business behavior until each migrated path has contract parity and targeted verification.

The target is not a rewrite. It is a staged strangler migration from overlapping/legacy ownership to one canonical execution pipeline.

## Non-negotiable preservation rules

- Preserve current public/menu/trigger entry points until replacements are proven.
- Preserve existing sheet names, header expectations, Calendar IDs, task-type rules, assignment rules, and approved Calendar write exceptions.
- Do not delete legacy files/functions merely because they look redundant.
- Do not merge division-specific guardrails into a generic rule when the business rules differ.
- No production write is considered complete without the required read-back/reconciliation for that operation.
- No uncertain CREATE may be blindly retried.
- REVIEW/BLOCKED states must fail closed.
- Production Apps Script is not modified by this repository-only architecture phase.

## Canonical pipeline

`SOURCE -> NORMALIZE -> RESOLVE -> MATCH -> CLASSIFY -> PLAN -> EXECUTE -> VERIFY -> LINK/HANDOFF -> ENDPOINT`

Each stage has one responsibility:

1. **SOURCE** — read Calendar/report/cache data.
2. **NORMALIZE** — normalize identifiers, dates, phone/address/text, event shape.
3. **RESOLVE** — resolve authoritative Customer/SO/Location/Contact/Employee relationships.
4. **MATCH** — find candidate existing tasks/events without writing.
5. **CLASSIFY** — determine safe state: matched, create, recreate, review, blocked, skip.
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

- Preserve the pre-reorg branch.
- Capture exact current Apps Script source when available.
- Build function/file/trigger/sheet/API/write inventory.
- Mark every function as CANONICAL, ADAPTER, LEGACY-USED, LEGACY-UNUSED, or UNKNOWN.

### Phase 1 — Endpoint and guardrail contracts

- Adopt canonical endpoint states.
- Document per-division guardrails.
- Document deferred/retry behavior.
- Require every non-terminal state to have an owner and next transition.

### Phase 2 — Scheduling/report safety

- Establish one scheduler owner.
- Separate refresh/rebuild from link mutation.
- Add report schema validation and last-known-good cache protection.
- Introduce TTL-based report freshness.

### Phase 3 — Relationship resolver

- Centralize Customer/SO/Location/Contact/Employee relationship proof.
- Require cross-entity ownership validation before CREATE/RECREATE/PATCH.
- Keep PreInspect Requested By organizer->Employee rule isolated in its workflow profile.

### Phase 4 — Planner/executor separation

- Matching/planning becomes pure/read-only.
- Striven writes move behind a single executor.
- Write plans include expected state and verification requirements.

### Phase 5 — Recovery isolation

- Recovery reuses the same resolver/planner/executor.
- Replace presence-only ID checks with relationship-integrity checks.
- Represent wait-until-later cases as `DEFERRED_RETRY`, not generic SKIP.

### Phase 6 — Calendar link/handoff service

- Aggregate all expected links per Calendar event before writing.
- Support Service multi-fireplace task sets.
- Decouple Calendar-link repair from Striven task mutability where relationship evidence is exact.
- Read back Calendar descriptions after material writes.

### Phase 7 — PreInspect lifecycle completion

- Complete DONE -> final SO -> exact same-customer Install target -> verified PreInspect link handoff.
- Add the separate guarded SO Internal Notes handoff only after its contract is proven.
- Close missing-Customer-Number notification and new-location proof gaps.

### Phase 8 — Compatibility cleanup

- Convert legacy public functions to thin adapters.
- Remove dynamic candidate/fallback routing only after call graph and contract tests prove safe ownership.
- Delete dead functions/files only after verified zero callers and regression coverage.

## No-delete rule during early migration

Until exact live-source parity exists and the call graph is complete, early reorganization commits may add documentation, tests, adapters, or canonical modules, but must not delete production functions/files.

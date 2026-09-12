# Task Mapping — Latest Checkpoint

**Checkpoint date:** 2026-09-12 (America/Toronto)

## Canonical GitHub home

`task_mapping` is the single canonical Task Mapping project branch.

The repository is being organized internally by folders rather than permanent backup/reorg sub-branches.

## Project-wide workflow coverage

The reorganization explicitly covers all four workflow domains:

1. Install
2. Delivery
3. Service
4. PreInspection

Dedicated workflow documentation now exists under:

- `docs/workflows/install/`
- `docs/workflows/delivery/`
- `docs/workflows/service/`
- `docs/workflows/preinspection/`

`docs/workflows/WORKFLOW_COVERAGE_MATRIX.md` is the project-wide checklist preventing one workflow from being treated as representative of the entire system.

## Project-wide backup baseline

A repository/ledger rollback baseline for the entire project is stored at:

`backups/2026-09-12/PROJECT_WIDE_REORG_BASELINE.md`

It captures canonical commit `4754c4011685cce3e7be0a13e86eb2798a7f2e92` before the four-workflow documentation expansion.

The backup covers Install, Delivery, Service, PreInspection, shared architecture, policies, execution/deployment evidence, tools, and history.

This remains a repository/ledger backup—not exact live Apps Script source parity.

## Production Version

Latest recorded production source release:

`R3.4.22 — R30 Requested By Router Fix`

The R3.4.22 business change applies to PreInspection Requested By only; Install, Delivery, and Service Requested By behavior remains unchanged.

## Verified source deployment

R3.4.22 source deployment is recorded as `DEPLOYED_SOURCE_VERIFIED` with a 36-file pre/post pull and POST SHA verification.

## Verified runtime behavior

The repaired production PreInspection R30 route was runtime-verified on all three linked PreInspection tasks for 2026-09-11 and the final read-only audit recorded 3 PASS / 0 FAIL / 0 REVIEW.

The next normal scheduled PreInspection batch still needs a follow-up read-only audit to close the historical scheduled-route regression proof completely.

## GitHub source parity

The repository still does **not** contain the exact current 36-file production Apps Script source under `apps-script/`.

Therefore:

- project ledger parity: current;
- architecture/contracts: current;
- four-workflow documentation coverage: current;
- project-wide rollback baseline: current;
- production Apps Script source parity: **PENDING**.

Do not physically reorganize production code using the August historical snapshot or a reconstructed approximation.

## Reorganization checkpoint

Current durable organization inside `task_mapping`:

- `backups/` — project-wide rollback/backup manifests;
- `docs/architecture/` — common architecture, endpoint contracts, gaps, migration plan;
- `docs/policies/` — API refresh and version/release policy;
- `docs/workflows/install/` — Install contract;
- `docs/workflows/delivery/` — Delivery contract;
- `docs/workflows/service/` — Service contract;
- `docs/workflows/preinspection/` — PreInspection contract, detailed flow, and Requested By policy;
- `executions/` — machine-readable release/runtime evidence;
- `deployment-history/` — human-readable deployment evidence;
- `history/` — release/source historical evidence;
- `tools/` — capture/patch/test/verification utilities;
- `apps-script/` — reserved for exact verified current source once parity is proven.

### Architecture direction

`SOURCE → NORMALIZE → RESOLVE → MATCH → CLASSIFY → PLAN → EXECUTE → VERIFY → LINK/HANDOFF → ENDPOINT`

The migration is compatibility-preserving. Existing public/menu/trigger entrypoints remain until replacements are proven.

## Exact next action

**Capture the exact current 36-file live Apps Script source, screen it for secrets/PII/private operational values, archive it under `apps-script/`, and verify GitHub read-back parity.**

Then build the complete production inventory **for all four workflows and all shared modules**:

- every file;
- every public/private function;
- caller/callee graph;
- menus and trigger entrypoints;
- sheets read/written and header expectations;
- Calendar reads/writes;
- Striven reports/API endpoints and mutations;
- workflow ownership for Install / Delivery / Service / PreInspection;
- relationship/matching rules;
- assignment/requested-by rules;
- create/recreate/recovery rules;
- kill switches/caps/business-hour gates;
- fingerprints/idempotency rules;
- compatibility aliases;
- known-good and known-bad regression cases.

Classify every function as:

`CANONICAL / ADAPTER / LEGACY-USED / LEGACY-UNUSED / UNKNOWN`

Only after that inventory is grounded in the exact live source should physical source reorganization begin.

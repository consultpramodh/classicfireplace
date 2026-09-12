# Task Mapping — Latest Checkpoint

**Checkpoint date:** 2026-09-12 (America/Toronto)

## Canonical GitHub home

`task_mapping` is the single canonical Task Mapping project branch.

The repository is organized internally by folders rather than permanent backup/reorg sub-branches.

## Project-wide workflow coverage

The cleanup/reorganization covers all four workflow domains:

1. Install
2. Delivery
3. Service
4. PreInspection

Dedicated workflow documentation exists under `docs/workflows/`, and the workflow coverage matrix prevents one workflow from being treated as representative of the whole system.

## Project-wide backup baseline

`backups/2026-09-12/PROJECT_WIDE_REORG_BASELINE.md` records the repository/ledger rollback point before the four-workflow cleanup structure was expanded.

This is a project-wide repository backup reference, not exact live Apps Script source parity.

## Production Version

Latest recorded production source release:

`R3.4.22 — R30 Requested By Router Fix`

R3.4.22 is recorded as `DEPLOYED_SOURCE_VERIFIED`. The repaired PreInspection Requested By route was runtime-verified on the three linked PreInspection tasks for 2026-09-11. Install, Delivery, and Service Requested By behavior was not intentionally changed by that release.

## GitHub source parity

The repository still does **not** contain the exact current 36-file production Apps Script source under `apps-script/`.

Therefore:

- project ledger parity: current;
- architecture/contracts: current;
- four-workflow documentation coverage: current;
- project-wide rollback baseline: current;
- repository-side TEST framework: created;
- separate Apps Script TEST environment: **PENDING**;
- production Apps Script source parity: **PENDING**.

Do not physically reorganize production code using the August historical snapshot or a reconstructed approximation.

## TEST environment gate

Before physical source cleanup is promoted to production, establish an isolated TEST environment with:

- separate Apps Script project;
- separate TEST spreadsheet;
- TEST Install Calendar;
- TEST Delivery Calendar;
- TEST Service Calendar;
- TEST PreInspection Calendar;
- separate environment configuration;
- time-driven triggers disabled initially;
- Striven sandbox when available, otherwise explicit allowlist-only TEST writes;
- production spreadsheet/calendar targets rejected when `ENVIRONMENT=TEST`.

Repository-side TEST definitions now live under:

- `docs/testing/TEST_ENVIRONMENT_PLAN.md`
- `config/environments/`
- `tests/install/`
- `tests/delivery/`
- `tests/service/`
- `tests/preinspection/`
- `tests/shared/`
- `test-evidence/`

## Production promotion rule

No reorganized or modified Task Mapping code is pushed to the production Apps Script project until the affected functionality passes the available pre-push TEST gate.

Required sequence:

`fresh source -> isolated TEST candidate -> syntax/dependency checks -> affected workflow regressions -> shared-module caller regressions -> isolated write/read-back checks -> PRE-PUSH GATE PASS -> production push -> immediate source read-back -> targeted runtime verification -> GitHub verified-source sync/read-back`

Any behavior that can only be proven in production remains explicitly `POST_PUSH_RUNTIME_PROOF_REQUIRED`; it is not assumed to pass.

## Architecture direction

`SOURCE → NORMALIZE → RESOLVE → MATCH → CLASSIFY → PLAN → EXECUTE → VERIFY → LINK/HANDOFF → ENDPOINT`

Existing public/menu/trigger entrypoints remain until replacements are proven.

## Exact next action

1. **Capture the exact current 36-file live Apps Script source.**
2. Screen it for secrets/PII/private operational values and archive the safe verified source under `apps-script/`.
3. Create the separate Apps Script TEST project/spreadsheet/calendars and clone the current 36-file source into TEST **unchanged first**.
4. Prove the unchanged TEST clone can run the four workflow regression baselines without touching production targets.
5. Build the complete file/function/caller/trigger/sheet/API/write inventory for Install, Delivery, Service, PreInspection, and shared modules.
6. Only then begin physical source cleanup in TEST.
7. Promote cleanup to production only after the applicable TEST gate passes.

Classify every function during inventory as:

`CANONICAL / ADAPTER / LEGACY-USED / LEGACY-UNUSED / UNKNOWN`

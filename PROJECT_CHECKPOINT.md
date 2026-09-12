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
- same-project shadow TEST strategy: defined;
- rewritten `TM2_` source: **NOT YET BUILT FROM CURRENT LIVE SOURCE**;
- production Apps Script source parity: **PENDING**.

Do not build the rewrite from the August historical snapshot or a reconstructed approximation.

## Same-project shadow TEST strategy

The agreed low-friction approach is to test the rewrite inside the **existing Apps Script Script ID and existing spreadsheet** while preserving all old files/functions.

Rules:

- keep every existing production file/function;
- rewritten files use the `TM2_` prefix;
- rewritten functions use the `tm2_` prefix;
- no duplicate legacy global names;
- current production triggers/menus keep calling the legacy implementation initially;
- rewritten code starts in `SHADOW_READ_ONLY` mode;
- no rewritten time-driven triggers are installed during early testing;
- comparisons use current sheet/Calendar/Striven data without changing workflow sheets;
- controlled canary writes are manual-only and require explicit case/write gates;
- shared-module testing must cover every affected workflow;
- workflow cutover happens one workflow at a time through a narrow routing flag/adapter;
- legacy implementation remains available for rollback until the rewritten path is stable.

Repository-side definitions live under:

- `docs/testing/TEST_ENVIRONMENT_PLAN.md`
- `config/environments/`
- `tests/install/`
- `tests/delivery/`
- `tests/service/`
- `tests/preinspection/`
- `tests/shared/`
- `test-evidence/`

## Important source-push distinction

Adding inert `TM2_` files to the existing Script ID is technically a production-project source change even before routing is switched.

Therefore the first shadow deployment must satisfy this gate:

1. fresh exact live-source capture;
2. legacy file inventory/hashes recorded;
3. new `TM2_` files pass syntax/static dependency checks;
4. global-name collision audit PASS;
5. no existing trigger/menu/public route points to `TM2_`;
6. push adds only the intended `TM2_` files;
7. immediate re-pull confirms every legacy file remains unchanged;
8. only then begin manual `SHADOW_READ_ONLY` execution.

## Functional promotion rule

Rewritten logic does not become the live workflow merely because the files exist in the project.

For each workflow:

`legacy active -> TM2 shadow read-only -> parity/regression checks -> controlled canary when needed -> CUTOVER_READY -> route that workflow only -> immediate runtime verification -> retain legacy rollback`

Any behavior that cannot be proven before cutover remains explicitly unverified; it is not assumed to pass.

## Architecture direction

`SOURCE → NORMALIZE → RESOLVE → MATCH → CLASSIFY → PLAN → EXECUTE → VERIFY → LINK/HANDOFF → ENDPOINT`

Existing public/menu/trigger entrypoints remain until replacements are proven.

## Exact next action

1. **Capture the exact current 36-file live Apps Script source once.**
2. Build the complete file/function/caller/trigger/sheet/API/write inventory for Install, Delivery, Service, PreInspection, and shared modules.
3. Design the `TM2_` rewritten files from that exact current source while leaving legacy files untouched.
4. Run syntax/dependency/global-collision checks before adding any `TM2_` files to the existing Script ID.
5. Add the inert `TM2_` files only; do not redirect menus/triggers.
6. Re-pull and prove all legacy files are unchanged.
7. Run manual `SHADOW_READ_ONLY` regression comparisons on the existing sheet.
8. Introduce controlled canary writes only after read-only parity passes.
9. Cut over one workflow at a time only after that workflow reaches `CUTOVER_READY`.

Classify every function during inventory as:

`CANONICAL / ADAPTER / LEGACY-USED / LEGACY-UNUSED / UNKNOWN`

# Task Mapping — Latest Checkpoint

**Checkpoint date:** 2026-09-12 (America/Toronto)

## Canonical branch

`task_mapping` is the single canonical Task Mapping branch.

## Scope

The cleanup/rewrite covers:

1. Install
2. Delivery
3. Service
4. PreInspection
5. shared scheduler/report/cache/resolution/planning/execution/link/verification modules

## Active production behavior

Latest verified business release remains:

`R3.4.22 — R30 Requested By Router Fix`

The legacy 36-file implementation remains the live routed system. TM2 has not taken over any production workflow.

## Zero-touch AutoPatch status

`CLASPRC_JSON` is configured in GitHub Actions and the first fully automated guarded deployment completed successfully.

GitHub Actions run: `34710451571`

Result:

`DEPLOYED_SHADOW_SOURCE_VERIFIED`

Verified facts:

- PRE live clone contained 36 legacy files;
- freshness clone immediately before push matched PRE;
- 19 new `TM2_` files were added;
- POST live clone contained 55 files;
- all 36 legacy files were hash-identical to PRE;
- all 19 TM2 files were hash-identical to the GitHub candidate;
- no rollback was required;
- workflow job conclusion was SUCCESS.

Evidence is recorded in:

- `executions/tm2-shadow-r0-2026-09-12.json`
- `test-evidence/2026-09-12-tm2-shadow-r0-deployed.md`

The GitHub Actions PRE-source/evidence artifact is ID `10303171560`, SHA-256 `f21cfb049821ff8ccfe9676b576bb766e6d5859b97531458425c0258eb25be2f`.

## Current TM2 state

TM2 R0 is present in the existing Apps Script project but remains inert:

- `SHADOW_READ_ONLY`;
- Striven writes disabled;
- Calendar writes disabled;
- CREATE/RECREATE disabled;
- TM2 trigger installation disabled;
- Install cutover false;
- Delivery cutover false;
- Service cutover false;
- PreInspection cutover false;
- legacy menus/triggers unchanged.

Repository candidate source is under:

`apps-script/tm2-shadow/`

## Runtime verification

`SHADOW_RUNTIME_VERIFIED = PENDING`

The source push/read-back has been proven. The next proof is actual read-only execution of:

- `tm2_connectivityAudit()`
- `tm2_diagnostics()`
- `tm2_shadowRunAll()`

Automating those functions requires remote Apps Script execution support. First determine whether the existing project can use clasp/Apps Script API execution safely without changing its Cloud-project association or requiring a risky production authorization migration.

## Source parity

- TM2 source parity: VERIFIED.
- Legacy PRE source: captured in the Actions artifact.
- Permanent public GitHub archive of the exact 36-file legacy source: PENDING sensitive-content screening.

Do not publish raw legacy source until credentials, Script Properties, private report identifiers/URLs, customer PII, and other operationally sensitive values are screened.

## Exact next action

1. Probe/configure zero-touch read-only TM2 runtime execution without rerouting any legacy workflow.
2. If safe remote execution is available, run `tm2_connectivityAudit()`, `tm2_diagnostics()`, and `tm2_shadowRunAll()` automatically and record the results.
3. Build the complete legacy inventory from the freshly captured PRE source: files, functions, callers/callees, menus, triggers, sheets, Calendar operations, Striven reports/API writes, workflow ownership, relationship rules, assignment rules, recovery rules, guards and fingerprints.
4. Classify every legacy function as `CANONICAL / ADAPTER / LEGACY-USED / LEGACY-UNUSED / UNKNOWN`.
5. Expand TM2 one workflow at a time from scaffolding to behavior-equivalent read-only planning and compare its decisions against the current legacy implementation.
6. Do not enable TM2 writes or workflow cutover until read-only parity and affected-workflow regression checks pass.

## Repository housekeeping

`task_mapping` remains canonical. Temporary `task_mapping_autopatch_stage*` refs created during connector setup are noncanonical and unused; remove them when branch-delete access is available.

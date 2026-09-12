# Task Mapping — Current State

**Last updated:** 2026-09-12 (America/Toronto)

## Canonical GitHub home

`task_mapping` is the **single canonical Task Mapping branch**.

The project covers Install, Delivery, Service, PreInspection, and shared modules.

## Live Apps Script project

- Script ID: `1E86mhD2dZcOFpqWnCvoIpwEkwZ0MA63MgM8DifV6WyB2FvVQkRWKIZ_m`
- Active business release: **R3.4.22 — R30 Requested By Router Fix**.
- Legacy production source before TM2 shadow deployment: **36 files**.
- TM2 shadow files added on 2026-09-12: **19 files**.
- Current remote file count after verified AutoPatch read-back: **55 files**.
- Legacy routing remains active.
- All TM2 cutover flags remain false.

## TM2 Shadow R0 deployment

Status: `DEPLOYED_SHADOW_SOURCE_VERIFIED`

GitHub Actions run `34710451571` used the guarded AutoPatch pipeline and the configured clasp CI credential.

Verified sequence:

- Google clasp CI authorization: PASS;
- fresh PRE clone: 36 legacy files;
- legacy hashes recorded: PASS;
- candidate syntax and TM2-prefix checks: PASS;
- global-name collision check: PASS;
- freshness clone immediately before push: PASS;
- guarded push: PASS;
- POST clone: 55 files;
- all 36 legacy files hash-identical to PRE: PASS;
- all 19 TM2 files hash-identical to candidate: PASS;
- rollback required: NO;
- GitHub Actions job conclusion: SUCCESS.

The AutoPatch run ended with `DEPLOYED_SHADOW_SOURCE_VERIFIED`.

Evidence:

- execution record: `executions/tm2-shadow-r0-2026-09-12.json`;
- human-readable evidence: `test-evidence/2026-09-12-tm2-shadow-r0-deployed.md`;
- Actions artifact ID: `10303171560`;
- artifact SHA-256: `f21cfb049821ff8ccfe9676b576bb766e6d5859b97531458425c0258eb25be2f`.

## TM2 safety state

TM2 R0 is intentionally inert:

- mode: `SHADOW_READ_ONLY`;
- Striven writes: disabled;
- Calendar writes: disabled;
- CREATE/RECREATE: disabled;
- TM2 trigger installation: disabled;
- Install cutover: false;
- Delivery cutover: false;
- Service cutover: false;
- PreInspection cutover: false;
- legacy menus/triggers remain unchanged.

The 19 candidate files are stored in GitHub under `apps-script/tm2-shadow/`.

## Runtime verification state

`SHADOW_RUNTIME_VERIFIED = PENDING`

Source deployment and remote source read-back are proven. The next layer is automatic execution of the read-only TM2 diagnostics/parity functions. Runtime verification must remain separate from source verification until those functions actually execute successfully.

Initial runtime targets:

- `tm2_connectivityAudit()`;
- `tm2_diagnostics()`;
- `tm2_shadowRunAll()`.

Remote execution through clasp/Apps Script requires the script's API-executable / Cloud-project prerequisites to be compatible. Do not change the production Cloud-project association merely to enable remote execution without a dedicated review.

## R3.4.22 business verification remains intact

The production PreInspection Requested By fix remains the latest verified live business behavior. All three linked PreInspection tasks tested on 2026-09-11 resolved Calendar organizer email to the exact Striven Employee and read back `RequestedBy.Type=employee` successfully.

The TM2 shadow deployment did not alter that legacy source or routing.

## GitHub/source parity

- Repository: `consultpramodh/classicfireplace`;
- canonical branch: `task_mapping`;
- repository visibility: public;
- TM2 R0 source parity: verified;
- exact 36-file legacy production source is preserved in the AutoPatch PRE artifact for 30 days, but is **not yet permanently archived under `apps-script/`** because the public-repository sensitive-content review is still required.

Do not publish raw legacy source to the public repository until credentials, Script Properties, report URLs/IDs, customer PII, and private operational values have been screened.

## Architecture direction

`SOURCE → NORMALIZE → RESOLVE → MATCH → CLASSIFY → PLAN → EXECUTE → VERIFY → LINK/HANDOFF → ENDPOINT`

The migration is a compatibility-preserving shadow/strangler migration. Legacy code remains the rollback path until each workflow reaches verified cutover readiness.

## Highest-priority next work

1. Automate/prove read-only TM2 runtime execution without changing live business routing.
2. Use the freshly captured legacy PRE source to build the complete file/function/caller/trigger/sheet/API/write inventory across Install, Delivery, Service, PreInspection, and shared modules.
3. Classify every function as `CANONICAL / ADAPTER / LEGACY-USED / LEGACY-UNUSED / UNKNOWN`.
4. Expand TM2 from R0 scaffolding into behavior-equivalent read-only planners/resolvers one workflow at a time.
5. Compare legacy vs TM2 outcomes on current data.
6. Only after parity passes, enable tightly controlled canary writes and then one-workflow-at-a-time cutover.

## Repository housekeeping note

`task_mapping` remains the only canonical branch. Temporary `task_mapping_autopatch_stage*` refs created while wiring the connector-based setup are noncanonical and are not used by the AutoPatch workflow; they should be deleted when branch-delete access is available.

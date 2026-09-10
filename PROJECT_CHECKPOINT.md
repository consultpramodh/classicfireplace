# Task Mapping — Latest Checkpoint

**Checkpoint date:** 2026-09-10

## Production Version

`PreInspect R3.4.20a` is the latest source release explicitly evidenced as remotely read back from Apps Script in the available release logs. Runtime feature verification is incomplete.

## Deployment

Existing bound Apps Script project. Canonical Apps Script deployment/version ID is currently **UNKNOWN** to the connected tools.

## Active Objective

Make GitHub the durable project ledger; then simplify and stabilize the PreInspection workflow without losing working safeguards.

## Last Verified Outcome

- GitHub connector access to `consultpramodh/classicfireplace` is working.
- `task_mapping` and dated backup branch exist.
- Deployment-history evidence is present on GitHub.
- R3.4.20a execution evidence proves a full 36-file Apps Script POST read-back existed locally after deployment.
- The attempted local GitHub push of that 36-file snapshot failed and did not reach GitHub.

## Current Blocker

The exact current 36-file Apps Script POST source is not accessible through the connected tools, and the public repository cannot safely receive raw historical source containing customer PII/secrets without a content-safety pass.

## Evidence

- R3.4.20a execution: Apps Script remote read-back PASS; GitHub sync FAILED with exit code 128 after password-authentication attempt.
- R3.4.20a targeted Task 18241 schedule test later returned `decision=BLOCK`, `pass=false`; auto feature was subsequently enabled.
- Current GitHub branch inspection confirms the 36 source files are absent.

## Next Exact Action

Capture one fresh authenticated 36-file live Apps Script pull/POST read-back, scan it for secrets/customer PII, then sync the safe exact source to `apps-script/` using the connected GitHub integration and read the branch back to prove parity.

## Fastest Safe Execution Path

`fresh live pull → sensitive-content scan → source inventory/hash manifest → GitHub connector commit → GitHub read-back → record execution → continue PreInspect simplification`

## Deferred

- broad unrelated refactors;
- cosmetic sheet work;
- new PreInspect features beyond the agreed lifecycle until the source/version ledger and scheduler safety are under control.

# Task Mapping — Latest Checkpoint

**Checkpoint date:** 2026-09-10

## Production Version

`PreInspect R3.4.20a` is the latest source release explicitly evidenced as remotely read back from Apps Script in the available release logs. Runtime feature verification is incomplete.

## Deployment

Existing bound Apps Script project. Canonical Apps Script deployment/version ID is currently **UNKNOWN** to the connected tools.

## Active Objective

Complete GitHub production-source parity, then simplify and stabilize the PreInspection workflow without losing working safeguards.

## Last Verified Outcome

- GitHub connector access to `consultpramodh/classicfireplace` is working.
- `task_mapping` and dated backup branch exist.
- Deployment-history evidence is present on GitHub.
- R3.4.20a execution evidence proves a full 36-file Apps Script POST read-back existed locally after deployment and matched the pushed Apps Script source byte-for-byte.
- That execution also created local Git commit `e3b941d`, but its GitHub push failed and the source never reached the remote repository.
- The exact R3.4.20a execution transcript has been recovered from the ChatGPT File Library.
- `tools/capture-live-apps-script.ps1` is now committed on `task_mapping`. It performs a fresh clasp clone, SHA-256 inventory, heuristic sensitive-content scan, and ZIP packaging without attempting GitHub authentication.

## Current Blocker

The exact current 36-file Apps Script source bodies are not accessible through the connected Google Drive/GitHub tools. Bound Apps Script projects are not exposed as ordinary Google Drive files through the current connector. The public repository must not receive raw source until it has been reviewed for credentials/customer PII.

## Evidence

- R3.4.20a execution: Apps Script remote read-back PASS; GitHub sync FAILED with exit code 128 after password-authentication attempt.
- R3.4.20a targeted Task 18241 schedule test later returned `decision=BLOCK`, `pass=false`; auto feature was subsequently enabled.
- Current GitHub branch inspection confirms the 36 production source files are absent.

## Next Exact Action

Run `tools/capture-live-apps-script.ps1` locally against the Task Mapping Apps Script Script ID. Upload the generated `TaskMapping-LIVE-<timestamp>.zip` to the Task Mapping ChatGPT conversation. Then:

1. inspect all captured files for secrets/customer PII;
2. compare the 36-file inventory against the known production inventory;
3. verify hashes and source completeness;
4. commit the safe canonical source to `apps-script/` using the connected GitHub integration;
5. read GitHub back and prove parity;
6. record the successful source-sync execution and update `executions/latest.json`.

## Fastest Safe Execution Path

`fresh live clasp clone → SHA manifest → sensitive-content review → GitHub connector commit → GitHub read-back → parity PASS → continue PreInspect simplification`

## Deferred

- broad unrelated refactors;
- cosmetic sheet work;
- new PreInspect features beyond the agreed lifecycle until the source/version ledger and scheduler safety are under control.

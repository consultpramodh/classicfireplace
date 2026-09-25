# Task Mapping — Latest Checkpoint

**Checkpoint date:** 2026-09-25 (America/Toronto)

## Canonical branch

`task_mapping` is the single canonical Task Mapping branch.

## Active rewrite

- System: **Task Mapping V3**
- Source: `apps-script/tmv3-clean/`
- V3 version: `3.11.14-legacy-assignment-parity-r1`
- Execution stage: `7`
- Bound Script ID: `1shaSL1CeNhR2-fr8H4x0fP2KUIjpOizLFyrNRAnGGXkCvERX4hZyJ5Gt`
- Mode: `SHADOW_READ_ONLY`

## Latest verified checkpoint

**Install Task 16735 assignment mismatch: CLOSED**

Legacy-rule assignment parity was applied and then verified with a single-task canary.

Before:
- desired assignment: `employee:15`
- actual assignment: `employee:41`
- plan: `PATCH_ASSIGNMENTS`

Canary result:
- employee 15 added
- employee 41 preserved
- no unrelated Task mutation

Fresh post-write verification:
- desired: `employee:15`
- actual: `employee:15,employee:41`
- assignment check: `MATCH`
- Step 7 plan: `NO_CHANGE`
- blocker: none

Evidence:
- canary run: `36198082523`
- post-write run: `36198236398`
- evidence file: `test-evidence/2026-09-25-tmv3-task-16735-assignment-canary-verified.md`

## Read-only verification transport

The V3 verifier now reuses the Apps Script HEAD/test deployment through the authenticated `/dev` endpoint.

Verified outcome:

- no new versioned deployment required for read-only probes;
- previous `RESOURCE_EXHAUSTED` deployment path avoided;
- exact pre-run source restored;
- source-head hash parity verified.

## Current safety state

- `SHADOW_READ_ONLY` remains active.
- Automation business writes remain disabled.
- CREATE/RECREATE production use remains gated.
- No broad V3 cutover has occurred.

## Remaining release gates

1. Fix/verify Install Task `18394` assignment.
2. Fix/verify Install Task `18690` assignment.
3. Fix/verify Service Task `18540` assignment.
4. Fresh Step-7 scan and deterministic CREATE candidate selection.
5. Controlled CREATE canary + read-back + Calendar backlink verification.
6. Controlled RECREATE canary.
7. Final four-vertical regression.
8. Controlled production cutover and first scheduled-cycle verification.

## Next exact action

**Fix and verify Install Task `18394` assignment only.**

# TMV3 3.11.25 Hard Rules R1 — Verification Evidence

Date: 2026-09-29 (America/Toronto)

## Purpose

Make settled Task Mapping business rules durable in GitHub and machine-enforced in Apps Script so later changes cannot silently reintroduce retired behavior.

## Source baseline and rollback

- Canonical repository: `consultpramodh/classicfireplace`
- Canonical branch: `task_mapping`
- Pre-change checkpoint: `checkpoint/tmv3-hard-rules-pre-2026-09-29`
- Work branch: `work/tmv3-hard-rules-r1`
- Pull request: #87
- Merge commit: `f7789326e5253401014d6210bb25a007c2ea9478`

## Authoritative rule locations

- Human-readable source: `PROJECT_OPERATING_RULES.md` → **Task Mapping hard business rules**
- Apps Script mirror: `TMV3_HARD_RULES` in `apps-script/tmv3-clean/00_Config.js`
- Runtime fail-closed assertion: `tmv3_assertHardRules_()` in `10_Core.js`

## Field 854 correction

Executable Field 854 management was removed from V3:

- no `PATCH_FIELD854` action
- no Step-7 Field 854 reconciliation state
- no CREATE payload population
- no existing-task Field 854 writer
- no `tmv3_pushPreInspectionField854_`
- no `tmv3_preInspectionField854Payload_`
- no selected-row Field 854 function
- no Field 854 menu entry

Remaining references to Field 854 are negative policy/assertion/regression text stating that it must not be managed.

## PreInspection CREATE invariant

Before POST, the payload is enforced and asserted to have:

- Task Type ID 105
- no Sales Order
- blank Task Description
- no `InfoCustomFields`

Calendar notes remain Calendar-only.

## Static verification

Changed Apps Script files syntax checked successfully:

- `00_Config.js`
- `10_Core.js`
- `46_Step7_Reconciliation.js`
- `50_Verticals.js`
- `58_Operations.js`
- `60_Automation.js`
- `70_Regression.js`

No executable Field 854 planner/writer/menu helper remains.

## Regression

Pure V3 regression result:

- release: `3.11.25-hard-rules-r1`
- cases: **47**
- passed: **47**
- failed: **0**

Explicit passing hard-rule cases include:

- `PREINSPECTION_GUARDRAILS_UNCHANGED`
- `PREINSPECTION_FIELD854_ACTION_REMOVED`
- `PREINSPECTION_HARD_RULE_ASSERTION_PASSES`
- `PREINSPECTION_CREATE_PAYLOAD_ENFORCES_NO_SO_BLANK_DESCRIPTION_NO_CUSTOM_FIELDS`
- `PREINSPECTION_CREATE_EXCLUDES_FIELD854_AND_INCLUDES_CALENDAR_TITLE`

## Bound Apps Script deployment verification

Guarded bootstrap:

- GitHub Actions run: `36621590973`
- conclusion: **SUCCESS**
- release: `TMV3_3_11_25_HARD_RULES_R1`
- evidence status: `CLEAN_V3_SOURCE_VERIFIED`
- bound Script ID: `1shaSL1CeNhR2-fr8H4x0fP2KUIjpOizLFyrNRAnGGXkCvERX4hZyJ5Gt`
- remote file count: **22**
- remote parity: **22/22 verified**
- bootstrap artifact: `task-mapping-v3-clean-36621590973`
- artifact ID: `11058239499`

The bootstrap first verified live PRE source against the expected baseline, pushed only the V3 source, re-cloned the bound Apps Script project, and hash-verified the remote source.

Ledger check:

- run: `36621590979`
- conclusion: **SUCCESS**

## Safety state after deployment

- Execution Stage: 7
- Mode: `SHADOW_READ_ONLY`
- Automatic external writes: disabled
- No production Task write was performed as part of this release.

## Result

**VERIFIED:** settled Task Mapping rules are now represented in the project rules document, mirrored in Apps Script, protected by fail-closed runtime assertions, covered by regression, merged to GitHub, deployed to the bound Apps Script project, and source-parity verified.

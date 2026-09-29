# Task Mapping — Current State

**Last updated:** 2026-09-29 (America/Toronto)

## Canonical project

- Repository: `consultpramodh/classicfireplace`
- Canonical branch: `task_mapping`
- Active rewrite: **Task Mapping V3**
- V3 source: `apps-script/tmv3-clean/`
- Bound V3 Script ID: `1shaSL1CeNhR2-fr8H4x0fP2KUIjpOizLFyrNRAnGGXkCvERX4hZyJ5Gt`
- Spreadsheet ID: `1Rxo2t3QjlC7TFWNc3kQ8A2foBAxM0l0VcEtRh4fkU2E`
- V3 version: `3.11.26-preinspection-c-prefix-r1`
- Hard-rule version: `2026-09-29-r2`
- Execution stage: `7`
- Global mode: `SHADOW_READ_ONLY`
- Automation writes: **disabled**

The four verticals remain Install, Delivery, Service, and PreInspection.

## Mandatory source of truth

Before any Task Mapping code change, read:

1. `PROJECT_OPERATING_RULES.md` — **Task Mapping hard business rules**
2. this current-state file
3. current `task_mapping` source / live parity evidence

The Apps Script mirror is `TMV3_HARD_RULES` in `00_Config.js`. `tmv3_assertHardRules_()` fails closed when implementation/configuration drifts from those rules.

A business-rule change is incomplete unless the same change updates:

- `PROJECT_OPERATING_RULES.md`
- `TMV3_HARD_RULES`
- affected code path(s)
- regression coverage

## Current V3 architecture

`CALENDAR → NORMALIZE/ELIGIBILITY → BUSINESS ANCHOR → IDENTITY → TASK RESOLUTION → TASK DECISION → RECONCILIATION → EXECUTE → READ-BACK VERIFY → CALENDAR LINK VERIFY → COMPLETE`

V3 remains consolidated under the existing module set. **Do not add Step 8/9/10 Apps Script files.**

## Hard rules reinstated — 2026-09-29

### Global

- Ambiguity is `REVIEW`; never guess.
- An uncertain external CREATE is reconciled before any retry.
- Consequential external writes require read-back verification.
- Calendar writes are limited to explicitly managed Task Mapping fields/actions.
- Preserve unrelated working behavior and manual assignments.
- No new Step 8/9/10 Apps Script files.

### Install

- Sales Order required.
- Task link returns to Calendar.
- Assignment evidence comes from Calendar **title only**.
- Calendar description is not assignment evidence.
- Aiden is ignored.
- Preserve unrelated/manual employees.

### Delivery

- Sales Order required.
- Sales Order + Task links return to Calendar.
- Assignment evidence comes from Calendar **title only**.
- Default Pool 4 when applicable.
- Preserve unrelated/manual employees.

### Service

- Operational transaction is the **Work Order**.
- Work Order + Task links return to Calendar.
- Technician comes from the technician Calendar.
- Remove `To Be Assigned` only after the intended technician is established.
- Remove only conflicting known Service technicians; preserve unrelated/manual employees.

### PreInspection

- Sales Order is **not required** for CREATE.
- Never attach a Sales Order to the PreInspection Task at CREATE.
- Task Type is **105 — Pre Inspection**.
- Task Description is **exactly blank at CREATE**.
- Calendar notes remain **Calendar-only**.
- **Field 854 is not managed by Task Mapping.**
- CREATE does not prefill `InfoCustomFields`.
- Technician-completed fields are not prefilled.
- Default assignment is **Pool 8 — Pre-Inspection Pool**.
- Calendar organizer/creator resolves **Requested By** and is not automatically Assigned To.
- Canonical PreInspection Calendar title uses `C#<Customer Number> - <Customer Name> - <Phone>`; legacy `Cust#` remains parse-compatible.
- Primary/shared and Stephen secondary Calendar handling remains supported.
- Managed links/titles are verified on the actual required Calendar copies.

## Field 854 removal — VERIFIED IN SOURCE

Release `3.11.25-hard-rules-r1` removed:

- `PATCH_FIELD854` from Step 7 actions
- Field 854 reconciliation state/planning
- Field 854 CREATE population
- Field 854 existing-task patching
- `tmv3_pushPreInspectionField854_`
- `tmv3_preInspectionField854Payload_`
- manual `tmv3_pushSelectedPreInspectionInstallNotes`
- the **Push PreInspection Install Notes (854)** menu item

The regression suite now asserts that Field 854 is absent from executable automation.

## PreInspection CREATE payload enforcement

Immediately before a PreInspection Task POST, V3 enforces and then asserts:

- Task Type ID = 105
- no Sales Order attachment
- Description = `''`
- no `InfoCustomFields`

A violation throws before the Task POST.

## Verification evidence

### 3.11.25 hard-rules release

- Pre-change checkpoint branch: `checkpoint/tmv3-hard-rules-pre-2026-09-29`
- PR: #87
- Merge commit: `f7789326e5253401014d6210bb25a007c2ea9478`
- Pure regression: **47/47 PASS**
- Apps Script syntax: **PASS** for all changed V3 files
- Guarded bootstrap run: `36621590973` — **SUCCESS**
- Bootstrap evidence: `CLEAN_V3_SOURCE_VERIFIED`
- Remote file parity: **22/22 files**
- Ledger check run: `36621590979` — **SUCCESS**
- Bound project remains `SHADOW_READ_ONLY`
- Evidence file: `test-evidence/2026-09-29-tmv3-hard-rules-r1.md`

## Jane Bisset canary state

Event: `2g1s53ho1qf09d19vsep0p3v0h@google.com`

Resolved evidence before the hard-rule correction:

- Customer: `62638 — Jane & Neil Bisset`
- Location: `58275`
- Contact: `56537`
- Step 6: `CREATE_TASK`
- no open Task found
- canonical Calendar title: `C#62638 - Jane & Neil Bisset - (416) 399-6519`
- canonical Task locality: `16 Brooke Ave, North York`

No Striven Task was created during the previous canary attempt.

The prior Stage-8 canary was returned to Stage 7 / SHADOW because a Calendar update produced no Stage-8 execution/audit entry. Do not resume production writes until managed trigger state is verified.

## Current safety state

- Stage 7
- `SHADOW_READ_ONLY`
- automation external writes disabled
- CREATE/RECREATE production cutover not approved
- hard rules are deployed and source-parity verified

## Exact next action

**Verify/install the managed V3 triggers in the bound Apps Script project, then rerun Jane Bisset as the single PreInspection CREATE canary under the 3.11.26 hard-rule contract.**

The canary must prove:

`Calendar event → Customer → Location → identity evidence → Type 105 CREATE → Requested By → Pool 8 → blank Description → no SO → no InfoCustomFields/Field 854 → Calendar links/title → authoritative read-back → NO_CHANGE`

Only after that single-record path converges should automatic write scope be widened.

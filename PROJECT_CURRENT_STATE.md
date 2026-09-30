# Task Mapping — Current State

**Last updated:** 2026-09-29 (America/Toronto)

## Canonical project

- Repository: `consultpramodh/classicfireplace`
- Canonical branch: `task_mapping`
- Active rewrite: **Task Mapping V3**
- V3 source: `apps-script/tmv3-clean/`
- Bound V3 Script ID: `1shaSL1CeNhR2-fr8H4x0fP2KUIjpOizLFyrNRAnGGXkCvERX4hZyJ5Gt`
- Spreadsheet ID: `1Rxo2t3QjlC7TFWNc3kQ8A2foBAxM0l0VcEtRh4fkU2E`
- V3 version: `3.11.28-calendar-auth-bootstrap-r1`
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

## 3.11.26 PreInspection C# title standard — VERIFIED

- Canonical PreInspection Calendar prefix changed from `Cust#` to `C#`.
- Canonical format: `C#<Customer Number> - <Customer Name> - <Phone>`.
- Legacy `Cust#` remains parse-compatible.
- Hard-rule revision: `2026-09-29-r2`.
- Pure regression: **50/50 PASS**.
- PR: #89.
- Merge commit: `6fd144699cb531735ad230a985d361f7821d24e0`.
- Guarded bootstrap run: `36624855596` — **SUCCESS**.
- PRE source parity verified before push.
- Bound Apps Script remote parity: **22/22 files**.
- Jane Bisset live Calendar read-back verified:
  - title: `C#62638 - Jane & Neil Bisset - (416) 399-6519`
  - original intake title preserved in Calendar description
  - existing note `Wants G4 if possible` preserved
- Evidence: `test-evidence/2026-09-29-tmv3-preinspection-c-prefix-r1.md`.

## 3.11.27 Trigger-install safety + Jane E2E canary attempt

### Trigger installer correction

Release `3.11.27-trigger-install-safety-r1` fixes the managed-trigger installer so it:

- proves Calendar access before deleting existing managed triggers;
- treats Calendar trigger creation failures as FAIL;
- verifies every configured Calendar has a `tmv3_calendarEventUpdated` trigger;
- throws on incomplete installation instead of reporting PASS.

Verification:

- syntax: PASS
- pure regression: **50/50 PASS**
- PR: #90
- merge commit: `7f1224ac6dae9c380bb219dffebbf89d0b88db44`
- guarded bootstrap run: `36626085957` — SUCCESS
- ledger check: `36626085984` — SUCCESS
- bound Apps Script remote source parity verified

### Jane Bisset end-to-end master canary attempt

Canary run: `36625424757`

Scope:

- PreInspection only
- Event `2g1s53ho1qf09d19vsep0p3v0h@google.com`
- allowed date `2026-09-30`
- guarded `CANARY_EVENT_WRITE_FRESH`
- persistent V3 source remained Stage 7 / SHADOW outside the temporary canary runner

Result: **BLOCKED BEFORE STRIVEN CREATE**

Exact blocker:

`The script does not have permission to perform that action. Required permissions: Calendar / Calendar readonly.`

The failure occurred during the fresh Calendar read, before Step 7 could build Jane's live write contract.

Verified consequences:

- no Jane Task was created;
- no Striven POST occurred;
- no Jane Event-ID audit write was produced by the canary;
- no duplicate-create guard was consumed;
- canary manifest was returned to `SHADOW_READ_ONLY`.

### Current managed-trigger inventory

Post-safety-patch inventory run: `36626244899`

Current bound-project triggers:

- `tmv3_dailySourceRefresh` — clock
- `tmv3_scheduledOperations` — five clock triggers
- `tmv3_installReminderCheck` — clock
- `tmv3_calendarReconciliationFallback` — hourly clock
- **0 `tmv3_calendarEventUpdated` Calendar triggers**

Seven Calendar IDs are configured and must be restored.

### Exact blocking action before Jane can continue

Run `tmv3_installTriggers()` once from the bound Apps Script editor under the normal authorized Classic Fireplace Google account and approve the Calendar permission prompt if shown.

Because 3.11.27 is now deployed, that run will preflight Calendar access before deleting anything and will fail if all seven Calendar update triggers are not installed.

After that succeeds:

1. verify 15 total managed triggers (8 clock + 7 Calendar);
2. rerun Jane's guarded end-to-end canary;
3. verify created Type-105 Task, Customer/Location/Requested By, Pool 8, blank Description, no SO, no InfoCustomFields/Field 854, Calendar links/title;
4. rerun Jane and require `NO_CHANGE`.

## 3.11.28 Calendar authorization bootstrap — SOURCE VERIFIED / CONSENT PENDING

Release `3.11.28-calendar-auth-bootstrap-r1` adds an explicit `ScriptApp.requireScopes(...)` gate for Calendar + trigger-management scopes before managed trigger deletion or installation.

Verified recovery evidence:

- PR: #91
- merge commit: `e08d707f9f72357b6407ab39145728faf99c2fb4`
- exact pre-recovery live-drift checkpoint: `facafb7dfe6b137d2ccfc024e3860d0ac97c1604`
- guarded recovery/bootstrap run: `36630610204` — **SUCCESS**
- PRE live source matched the captured drift checkpoint before push
- bound Apps Script remote parity after push: **22/22 files**
- Stage remains **7**
- mode remains **SHADOW_READ_ONLY**
- automation writes remain **disabled**
- Jane/Striven production writes were not executed during this recovery

Runtime authorization remains pending. Refresh the Apps Script editor and run `tmv3_installTriggers()` once interactively. The new authorization gate should request the required Calendar permission before any trigger deletion occurs. After consent succeeds, verify **15 managed triggers total (8 clock + 7 Calendar)** before rerunning Jane.

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

## 3.11.33 Jane canary title-context + bounded API allowance — DEPLOYED

The 2026-09-30 Jane Bisset canary failure was traced to CREATE Task-name construction using the raw Calendar event after Step 7 had already verified Customer/Location. The title builder therefore lost the verified identity context and returned `Customer/Location identity is not fully verified.`

Release sequence:

- `3.11.31-preinspect-create-title-context-r1` — rehydrates Task-name construction from the already-verified Step 7 Customer/Location context; regression `PREINSPECTION_CREATE_EXECUTION_REUSES_VERIFIED_IDENTITY_CONTEXT` added.
- `3.11.32-jane-exact-canary-r1` — adds `tmv3_runConfiguredCanary_MANUAL()`, hard-bound to Jane Event `2g1s53ho1qf09d19vsep0p3v0h@google.com`, Customer `62638`, Location `58275`, date `2026-09-30`, and expected action `CREATE_TASK`.
- `3.11.33-jane-budget-allowance-r1` — permits only that exact manual canary to consume at most 20 additional Striven calls above the V3 1200 soft cap; all other executions retain the 1200 cap; the allowance is cleared in `finally` and never exceeds the 5000 plan limit.

Verification:

- PR #96 merged at `6d68fd2b768e81c276cbd354ba560df4d6069baa`.
- syntax: PASS for `00_Config.js`, `20_Striven.js`, `58_Operations.js`, `70_Regression.js`.
- bounded allowance regression: **4/4 PASS**.
- guarded bootstrap run `36742906454`: **SUCCESS**.
- PRE source parity: **VERIFIED**.
- bound Apps Script remote parity: **22/22 files**.
- ledger run `36742906246`: **SUCCESS**.
- automation writes remain disabled; the only authorized production write path is the exact configured Jane manual canary.

Exact next action: refresh the Apps Script editor and run `tmv3_runConfiguredCanary_MANUAL()` once. Do not run `tmv3_runSafeReadyRows_MANUAL()`. After completion, read back the created Type-105 Task and Jane Calendar event, then run the same configured canary again and require convergence / no duplicate write before returning V3 to `SHADOW_READ_ONLY`.

# Task Mapping — Current State

**Last updated:** 2026-10-07 (America/Toronto)


## 2026-10-07 — PreInspection full Calendar parity contract

- Canonical source release: `3.11.69-preinspection-calendar-parity-r2`.
- Hard-rule mirror: `2026-10-07-r7`.
- Previous PreInspection Calendar title must be preserved as the first Description line with no added heading.
- Presentation-only `Notes:` and `Sales Order:` labels are removed while their underlying content remains.
- Required PreInspection Calendar copies must converge to the authoritative CF Preinspects business-visible state for title, Description, location, start/end, and required Stephen participation; only unavoidable Google system metadata may differ.
- Field 854 remains completely unmanaged.
- General mode remains `SHADOW_READ_ONLY`.

- Guarded deployment run `37679724316`: **SUCCESS** — PRE source verified, bound Apps Script updated, remote re-clone/file/hash parity passed.
- Live hardening regression run `37679868267`: **SUCCESS** — prior-title preservation, presentation-header removal, Service ownership, required-copy targeting, and full business-state parity comparator all passed.

## 2026-10-07 — Canonical decision sync / Field 854 correction

- Canonical release: `3.11.68-canonical-decision-sync-r1`.
- Source/deployment commit: `0fd22df18119caaac0525f8f6186349b67e34e14`.
- Guarded bootstrap run `37672082690`: **SUCCESS** — existing bound Apps Script updated; PRE-source gate passed; remote re-clone/file/hash parity verification completed.
- Hard-rule mirror: `2026-10-07-r6`.
- This release supersedes `3.11.67-preinspection-field854-postcreate-r1`.
- **Field 854 is not managed by Task Mapping.** The 3.11.67 post-create Field 854 synchronization was policy drift and has been removed.
- PreInspection Calendar notes remain on Calendar only.
- PreInspection Task Description remains blank at CREATE and technician-owned afterward.
- PreInspection CREATE sends no `InfoCustomFields`.
- Service Task ownership is explicit: Striven's Work Order workflow creates/recreates Service Tasks; Task Mapping discovers and reconciles them and must not create a substitute Service Task.
- Safe PreInspection Customer Location create/reuse remains implemented but E2E canary verification is still pending.
- Latest Calendar contract now requires **full cross-calendar business-visible parity** across every required PreInspection copy: title, Description, location, start/end, required attendee/guest state, and managed links; only unavoidable Google system metadata may differ.
- Global mode remains `SHADOW_READ_ONLY`; broad production business writes remain disabled.

## 2026-10-07 — PreInspection Monic Calendar format restored and re-audited

- Live V3 source: `3.11.66-preinspection-monic-format-r1`
- Source commit: `09e3e3b06c3dd73e8c56c28b2ac46acf2893f16f`
- Guarded bootstrap run `37630009433`: PASS.
- Live hardening regression run `37630176947`: PASS.
- Monic OLIVER is the golden Calendar presentation pattern:
  - preserve authored notes;
  - blank line before managed block;
  - exactly one `-----Striven Links-----` block;
  - source link syntax `[label](URL)`;
  - full Sales Orders label;
  - full canonical Task label;
  - no literal HTML / `<br>` source formatting;
  - CF Preinspects and Stephen copies converge to the same presentation.
- Oct 5 fresh audit:
  - Shawn KYLE 62731 / Task 18984: both copies aligned.
  - Monic OLIVER 62606 / Task 18759: both copies aligned.
  - Emily RICHARDSON 62683 / Task 18819: both copies aligned.
  - Craig Haid and Paul Bruce 62020 / Task 18949: both copies aligned.
  - David Wong 62205 / Task 17999: both copies aligned.
  - Archer Design & Build 61171: Customer link only; Task remains REVIEW due multiple OPEN PreInspection Tasks.
  - Anitta & Selva Reginold 62744: Customer link only; Task remains unresolved pending safe Location-create contract.
- Oct 7 deterministic cleanup:
  - Helen Huggett 62670 / Task 18836: duplicate legacy block removed; both copies aligned.
  - Janet Refle 45906 / Task 18925: duplicate legacy block removed; both copies aligned.
  - Matt Ellison 62729 / Task 18985: duplicate legacy block removed; both copies aligned.
  - Kathryn & Glenn Duncan 62748 / Task 18986: duplicate legacy block removed; both copies aligned.
- Oct 7 unresolved / review:
  - Barbara Woloszczuk: primary event exists but no verified managed Customer/Task link state yet.
  - Wes & Laura and Aurora Bloom have non-authoritative / incomplete CF Preinspects copies on direct lookup and require identity/event-copy reconciliation.
  - Connie Pains exists on Stephen only; no CF Preinspects event was found.
- Shadow runner remains read-only; previous runner failures were authentication/deployment-path failures, not current source deployment failures.


## 2026-10-06 FOUR-VERTICAL TASK LIFECYCLE — VERIFIED

- Live V3 source: `3.11.62-four-vertical-lifecycle-r1`
- Hard-rule mirror: `2026-10-06-r5`
- Source commit: `3a88696c338112a8df40d207e9c40a49cc276e1c`
- Canonical lifecycle contract: `docs/architecture/PROCESS_CONTRACT_MATRIX.md` (commit `0ec597aad60f018900a423ae493714a144876a7f`)
- Guarded bootstrap run `37511385056`: PASS
  - live PRE source matched the verified `3.11.61` baseline;
  - all V3 source files passed syntax checks;
  - source pushed to the existing bound Apps Script project;
  - remote re-clone/file inventory/hash parity passed.
- Live hardening regression run `37511589075`: PASS.
- Shared lifecycle behavior is verified for Install, Delivery, Service, and PreInspection:
  - exactly one valid OPEN Task -> reuse;
  - multiple OPEN Tasks -> REVIEW, except the existing Service multi-fireplace path requires distinct FP markers;
  - no OPEN Task + no history -> `CREATE_TASK` after prerequisite verification;
  - same-day fulfilled/completed Task -> `FULFILLED_NO_RECREATE`;
  - any applicable cancelled Task history -> REVIEW;
  - undated history -> REVIEW;
  - future history -> REVIEW;
  - only older fulfilled/completed history -> `RECREATE_TASK`;
  - wrong-vertical Tasks cannot become executable matches;
  - cancelled Tasks cannot be used as RECREATE source Tasks.
- V3 remains `SHADOW_READ_ONLY`; this release does not enable general Task/Calendar mutation.


## 2026-10-06 PREINSPECTION NO-OPEN-TASK POLICY — LOCKED

The PreInspection decision contract is now explicit and must be used for every eligible CF Preinspects event:

- **NO OPEN TASK is not automatic permission to CREATE.**
- exactly one valid OPEN Type-105 Task → reuse/reconcile;
- multiple valid OPEN Tasks → REVIEW;
- zero OPEN Tasks + no applicable history → `CREATE_TASK`;
- same-day completed/fulfilled Task → `FULFILLED_NO_RECREATE`;
- same-day cancelled Task → REVIEW;
- historical Task with unproven appointment date → REVIEW;
- historical Task dated after the Calendar event → REVIEW;
- only older historical Task evidence → `RECREATE_TASK`;
- persisted Calendar Task link absent from cache with no safe fallback → REVIEW / fail closed;
- verified Customer with a genuinely missing job-site Location → `CREATE_LOCATION` before `CREATE_TASK`;
- Stage 7 must freshly recheck duplicate/relationship evidence before any CREATE/RECREATE write.

The runtime Stage-6 implementation follows this sequence in `tmv3_step6NoOpenTaskDecision_()`.

Verification is now complete under live release **`3.11.61-preinspection-regression-alignment-r1`**:
- hard-rule version: `2026-10-06-r4`;
- guarded Apps Script bootstrap: **SUCCESS**;
- ledger verification: **SUCCESS**;
- live hardening regression: **PASS**;
- dedicated `preInspectionNoOpenTaskPolicy` regression: **6/6 PASS**;
- verified branches: no history → CREATE, same-day completed → FULFILLED_NO_RECREATE, same-day cancelled → REVIEW, undated history → REVIEW, future history → REVIEW, older history → RECREATE_TASK;
- write flags remain disabled in `SHADOW_READ_ONLY`.

This policy is locked into `PROJECT_OPERATING_RULES.md`, `TMV3_HARD_RULES`, hard-rule assertions, the canonical PreInspection workflow docs, and regression coverage.



## 2026-10-06 PREINSPECTION CALENDAR AUTHORITY — VERIFIED

- **Live version:** `3.11.56-preinspection-primary-stephen-guest-r1`.
- **Authoritative PreInspection source:** **CF Preinspects only**.
- Stephen Calendar is **mirror-only** and cannot introduce an independent PreInspection appointment into Stage 1/2.
- Every CF Preinspects event in the configured operating horizon must include **stephen@classicfireplace.ca** as a required guest.
- Stephen guest reconciliation is a dedicated Calendar-only rule and does **not** depend on Striven business-write enablement.
- Guest reconciliation is idempotent: add Stephen when missing; never remove him; preserve all other guests and event business fields.
- PreInspection Calendar business writes target the authoritative CF Preinspects event only. Calendar-link/title operations also verify Stephen is present.
- Existing-calendar backfill on 2026-10-06:
  - 11 upcoming CF Preinspects events in the current 365-day horizon
  - 11/11 now include `stephen@classicfireplace.ca`
  - other attendees were preserved.
- Guarded Apps Script deployment for source release `5fb225d8b6d5e38ce0a14576d8f92ba031219602` completed successfully with `CLEAN_V3_SOURCE_VERIFIED`.
- Do not reintroduce Stephen Calendar as a business-source calendar. If an appointment exists only on Stephen Calendar, it must be added/moved to CF Preinspects before Task Mapping treats it as authoritative.



## 2026-10-06 FINAL STAGE 4 SWEEP — VERIFIED

- **Live version:** `3.11.54-stage4-deterministic-recovery-r1`.
- Guarded Apps Script bootstrap for source release `fd9d33061aba71b3611d8e89f564f2203be226aa` completed successfully with `CLEAN_V3_SOURCE_VERIFIED`.
- Dedicated cached Stage-4 verification completed at **2026-10-06 09:25:44 America/Toronto** with `STEP4_IDENTITY PASS`.
- Verification used current cached sources and did **not** request another Striven source refresh:
  - Customers: 34,613
  - Locations: 30,441
  - Contacts: deferred to write gate; no routine per-Customer Contact API reads
  - total Calendar records evaluated: 432
- Stage-4 outcomes:
  - VERIFIED: 134
  - IDENTITY_ONLY: 9
  - REVIEW: 51
  - BLOCKED: 0
  - NOT_RUN: 238, all retained from upstream Step-2 disposition rather than a Step-3/4 execution failure
- By vertical:
  - Install: 33 VERIFIED / 3 IDENTITY_ONLY / 7 REVIEW / 2 upstream NOT_RUN
  - Delivery: 6 VERIFIED / 1 IDENTITY_ONLY / 2 REVIEW
  - Service: 84 VERIFIED / 3 IDENTITY_ONLY / 38 REVIEW
  - PreInspection: 11 VERIFIED / 2 IDENTITY_ONLY / 4 REVIEW / 236 upstream NOT_RUN
- Verification invariants all passed:
  - missingDecision = 0
  - verifiedWithoutIdentity = 0
  - nonVerifiedAdvanced = 0
  - missingFromStep4 = 0
  - introducedByStep4 = 0
  - operator row counts match all four verticals
- No Task resolution, Calendar writes, or Striven writes were performed by the final Stage-4 sweep.
- Remaining Stage-4 REVIEW rows are explicit identity-quality outcomes (ambiguous address ownership, multiple Customer-owned Location matches, insufficient corroboration, or no deterministic Customer evidence), not hidden pipeline stops or Contact API failures.
- **Stage 4 is closed for pipeline progression.** Stage 5 work may start from this baseline; REVIEW and IDENTITY_ONLY rows remain correctly gated from unsafe downstream execution.



## 2026-10-05 STAGE 4 REQUEST-RESOLUTION MILESTONE

- **Verified live source:** `3.11.53-stage4-identity-recovery-r1`.
- Live cached mapping completed at 2026-10-05 16:57 America/Toronto with `STEP6_TASK_DECISION PASS`.
- Current operator tabs contain **zero `NOT RUN — STEP 3` rows and zero `NOT RUN — STEP 4` rows** across Install, Delivery, Service, and PreInspection.
- Eligible requests whose SO/WO anchor is unavailable now still receive a Stage-4 identity outcome:
  - deterministic Customer + Customer-owned Location => `IDENTITY_ONLY`;
  - ambiguous/unproven identity => explicit Stage-4 `REVIEW`;
  - `IDENTITY_ONLY` remains barred from Stage 5 until its required business anchor is resolved.
- Routine Stage-4 mapping performs no per-Customer Contact API reads.
- Stage-4 live recovery materially restored Service processing: cached 3.11.53 mapping produced 86 single-task matches, 2 multi-task matches and 1 recreate candidate out of 136 Service rows; remaining rows stop at explicit Stage-4/anchor outcomes rather than the former Contact API-guard failure.
- **Next deterministic Stage-4 refinement:** `3.11.54-stage4-deterministic-recovery-r1` is canonical in GitHub and awaiting guarded Apps Script deployment. It adds stale explicit Customer-number recovery with independent proof, exact-address/same-surname household recovery, cached Task identity recovery, and indexed Location lookup. Ambiguous cases remain REVIEW.
- Do not begin Stage 5 remediation until 3.11.54 is either live-verified or explicitly abandoned/reconciled.



## 2026-10-05 CURRENT AUTOMATION BASELINE

- **Verified live Apps Script source:** `3.11.51-stage3-stage4-cache-first-r1` (source release commit `75c5b27f60cd209d6c3022b6762d60c1f9ebbd75`). Guarded bootstrap completed with PRE source parity, clasp push, remote re-clone, and `CLEAN_V3_SOURCE_VERIFIED`.
- **Canonical GitHub source:** `3.11.52-api-efficient-source-tiering-r1` (source release commit `4f6a1c5d7a7ae671a8a017f0d21f33c3ee7d7573`). Deployment is queued while GitHub Actions runner assignment is delayed.
- **Stage 3 already live in 3.11.51:** business anchors are filtered by vertical transaction type. Install accepts Sales Order evidence; Delivery requires Delivery-approved order evidence; Service requires Work Order evidence; PreInspection uses Sales Order evidence only.
- **Stage 4 already live in 3.11.51:** routine mapping performs no per-Customer Contact API lookup. Contact lookup/corroboration is deferred to the fresh write gate when a mutation actually requires Contact ownership.
- **API-saving source tiering in 3.11.52:** Customer/Location master sources use a 360-minute minimum refresh cadence; Orders/Tasks remain on a 120-minute operational cadence. The V3 daily soft limit remains 1,200.
- **Latest visible operator workbook is not yet proof of 3.11.51/3.11.52 behavior.** Its Overview still shows `3.11.49-preinspection-link-format-r1` because the controlled full refresh was blocked by `TMV3_STRIVEN_API_DAILY_GUARD` at `1200/1200`.
- **Controlled verification:** one FULL refresh/map is queued behind the 3.11.52 deployment with a temporary runner-only soft limit of 1,500. This does not change the live 1,200 soft limit.
- **Measured API cost:** historical TM Audit entries show a full source refresh at about 14 V3 Striven calls. The larger consumption came from repeated per-record reads; routine Stage 4 Contact reads have therefore been removed.
- **Operational diagnosis rule:** use the latest successfully refreshed operator-sheet rows. Older Calendar rows are regression/history evidence only.


## Canonical project

- Repository: `consultpramodh/classicfireplace`
- Canonical branch: `task_mapping`
- Active rewrite: **Task Mapping V3**
- V3 source: `apps-script/tmv3-clean/`
- Bound V3 Script ID: `1shaSL1CeNhR2-fr8H4x0fP2KUIjpOizLFyrNRAnGGXkCvERX4hZyJ5Gt`
- Spreadsheet ID: `1Rxo2t3QjlC7TFWNc3kQ8A2foBAxM0l0VcEtRh4fkU2E`
- V3 version: `3.11.69-preinspection-calendar-parity-r2`
- Hard-rule version: `2026-10-07-r7`
- Execution stage: `7`
- Global mode: `SHADOW_READ_ONLY`
- Automation writes: **disabled**

The four verticals remain Install, Delivery, Service, and PreInspection.

## 2026-10-01 HISTORICAL PreInspection Calendar description standard — SUPERSEDED BY CURRENT_DECISION_REGISTER.md

The visible Calendar description format is frozen. Internal code release numbers may change; this presentation must not change unless the business rule is explicitly changed.

- Human-authored notes are preserved.
- Accidental hard line-wraps are joined into readable paragraphs.
- Existing Sales Order text, when present, remains above Notes.
- Notes heading: `**Notes:**`.
- SUPERSEDED 2026-10-07: preserve the exact previous Calendar title as the first Description line with no added heading.
- Exactly one managed links block appears at the bottom:
  - heading: `**-----Striven Links-----**`
  - blank line after the heading and between links
  - `View Sales Orders – <Customer Name> (#<Customer Number>)`
  - `Task #<Task ID> - Preinspect - <Customer Name> - <Phone>`
- No raw URLs, generic `Customer` labels, numeric-only Task labels, duplicate legacy link blocks, or literal HTML tags.

Verification:
- Live formatter regression run `36928670626` — **SUCCESS**.
- Calendar title/description regression suite: **60 cases PASS**.
- `PREINSPECTION_DESCRIPTION_FORMAT_IS_FROZEN`: PASS.
- `PREINSPECTION_ESCAPED_MARKDOWN_LINK_BLOCK_REPLACED_ONCE`: PASS.
- `PREINSPECTION_SALES_ORDER_AND_NOTES_HEADING_BOUNDARY_PRESERVED`: PASS.
- `PREINSPECTION_DESCRIPTION_CONTAINS_NO_LITERAL_HTML_TAGS`: PASS.
- Current Calendar backfill audit:
  - CF Preinspects: **15/15 customer appointments clean**
  - Stephen Calendar: **15/15 customer appointments clean**
  - shared physical copies: **15**
  - cross-calendar description mismatches: **0**


## 2026-10-01 FINAL PreInspection Calendar title standard

**Canonical format is frozen as: `<Customer Number> - <Customer Name> - <Phone>`.**

- Example: `62689 - Sahand KASHI - (416) 953-7693`
- Do not add `C#`, `Cust#`, `Customer #`, or another label to newly normalized titles.
- Legacy `C#...` and `Cust#...` titles remain parse-compatible only so old appointments continue to resolve safely.
- This is a business-format standard, not a release-specific experiment. Later internal V3 release numbers must not change this visible format unless the user explicitly changes the business rule.
- Sahand Event `6c52vhhs3hgcbp3rhca477bcat` was updated on both CF Preinspects and Stephen's Calendar to the bare-number format with description, links, time, and location preserved.
- Source release: `3.11.41-preinspection-bare-customer-number-r1`
- Hard-rule version: `2026-10-01-r3`
- Source commit: `aea710a883fe0b0e0bb847856fd44a63a02fb706`
- Guarded deployment run: `36921160480` — **SUCCESS**
- Live hardening regression run: `36921281078` — **SUCCESS**
  - canonical bare-number title: PASS
  - legacy `C#` parsing: PASS
  - legacy `Cust#` parsing: PASS
  - hard-rule assertion: PASS
- Verified bootstrap checkpoint run: `36921498527` — **SUCCESS**

**Historical note:** any `C#...` examples below are historical execution evidence from before this explicit rule change; they are not the current canonical format.


## 2026-10-01 PreInspection two-calendar parity correction

- Sahand KASHI Event `6c52vhhs3hgcbp3rhca477bcat` exposed a verification defect:
  - At that time, CF Preinspects had the then-canonical `C#62689...` title and Striven Customer/Task links.
  - Stephen's organizer copy still had the old title and no Striven links.
  - The prior success condition had verified one logical Calendar event without proving every required physical Calendar copy.
- Sahand was corrected directly on Stephen's organizer copy and then re-read from both calendars.
  - CF Preinspects: title + Customer link + Task #18845 link verified.
  - Stephen calendar: title + Customer link + Task #18845 link verified.
  - The two copies now match for the managed title/description content.
- Release `3.11.40-preinspection-copy-parity-r1` changes the completion contract:
  - Stephen-sourced customer PreInspection appointments require both Stephen + CF Preinspects copies.
  - title normalization uses the same required-copy set.
  - missing required PreInspection copies fail closed before Calendar link completion is reported.
  - genuine primary-only CF Preinspects appointments do not invent a Stephen copy.
- Source commit: `2bca35b02769382c967ff8498fb3c73befde1e47`.
- Guarded deployment run: `36919579614` — **SUCCESS**.
- Live hardening regression run: `36919711895` — **SUCCESS**.
  - `PREINSPECTION_STEPHEN_SOURCE_REQUIRES_BOTH_COPIES`: PASS
  - `PREINSPECTION_TITLE_NORMALIZATION_REQUIRES_BOTH_COPIES`: PASS
  - `PREINSPECTION_PRIMARY_ONLY_DOES_NOT_INVENT_SECONDARY_COPY`: PASS
- Bootstrap live checkpoint advanced and verified by run `36919852881` — **SUCCESS**.
- Cross-calendar scan for Sep 30 through Oct 2 found no remaining Sahand-style missing managed information. Four shared events differ only because the CF copy still contains a legacy duplicate `Pre-Inspection Task Link` block; both copies already contain the current managed Customer/Task links.

## 2026-10-01 verified checkpoint

- Active objective completed through the Sahand PreInspection canary and V3 safety relock.
- Sahand KASHI Sep 30 PreInspection:
  - Event ID: `6c52vhhs3hgcbp3rhca477bcat@google.com`
  - Customer: `62689`
  - Location: `58321`
  - Created/read-back Task: `18845`
  - Task Type: `105 — Pre Inspection`
  - Step 7 converged to `NO_CHANGE` after authoritative read-back.
  - Calendar title/link write-back was verified on the required Calendar copy.
  - Evidence run: `36915253338` — **SUCCESS**.
- Release `3.11.39-sahand-verified-relock-r1` deployed to the existing bound Apps Script project in `SHADOW_READ_ONLY`.
  - manual writes: **disabled**
  - automation writes: **disabled**
  - deployment/bootstrap verification run: `36917570298` — **SUCCESS**
  - remote source parity: **22/22 files**
  - bootstrap evidence status: `CLEAN_V3_SOURCE_VERIFIED`
- Live hardening regression run `36917709693` — **SUCCESS**.
  - mode: `SHADOW_READ_ONLY`
  - single Step 7 decision authority: **PASS**
  - persisted Task ID + failed fresh read fails closed: **PASS**
  - title/description normalization regression: **PASS**
  - canary API-budget regression: **PASS**
  - automatic-canary guard regression: **PASS**
  - PreInspection guest-sync regression: **PASS**
- Bootstrap expected-live checkpoint advanced to source commit `4785b5f067e47f4d8e807ebc854973f157a19b98`.
  - verification run: `36918291159` — **SUCCESS**
- Pending closure proof: rerun the full Sep 30 PreInspection Step 7 read-only audit after the V3 daily API budget resets.
  - attempted run: `36917898587`
  - blocked safely by `TMV3_STRIVEN_API_DAILY_GUARD`
  - observed V3 usage: `1416 / 1200`
  - no Striven write was authorized.
  - do **not** bypass the guard or use the prior canary allowance in `SHADOW_READ_ONLY`.
  - the budget counter is keyed to the `America/Toronto` calendar date, so the read-only closure audit is the first next action on the next local date.


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
- Canonical PreInspection Calendar title uses `<Customer Number> - <Customer Name> - <Phone>` with no prefix; legacy `C#` and `Cust#` remain parse-compatible only.
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

## Historical — 3.11.26 PreInspection C# title standard — superseded 2026-10-01

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

Superseded by 3.11.34: the canary is now trigger-driven and requires no operator-run function.

## 3.11.34 automatic Jane canary — DEPLOYED / NON-MANUAL OPERATING MODEL RESTORED

User requirement reaffirmed: **normal Task Mapping operation must not require an operator to run Apps Script functions manually.** Manual menu/editor functions are fallback and diagnostic tools only.

Release `3.11.34-automatic-jane-canary-r1` changes the Stage-7 canary from a manual exception to the managed automation path:

- `automationWritesEnabled:true` is active only while the system remains in `CANARY_WRITE`.
- the exact Jane Bisset canary has both MANUAL and AUTO entrypoints, but production operation uses AUTO;
- existing managed Calendar-change, scheduled-operations, and hourly reconciliation-fallback triggers invoke the exact Stage-7 canary automatically;
- the canary remains hard-bound to Event `2g1s53ho1qf09d19vsep0p3v0h@google.com`, Customer `62638`, Location `58275`, date `2026-09-30`, and the initial `CREATE_TASK` contract;
- after a Task exists, the same automatic path permits only reconciliation/link actions for that verified Task;
- a second CREATE/RECREATE with an existing Task is blocked;
- a clean second pass returns `CONVERGED_NO_CHANGE` with zero writes;
- broad production automation remains gated at Stage 7.

Verification:

- PR #97 merged at `3391cb218386fb3b28e03d53b962821e5aac7392`.
- automatic-canary regression: **9/9 PASS**.
- bounded API regression: **4/4 PASS**.
- syntax: PASS for all changed Apps Script files.
- guarded bootstrap run `36745587462`: **SUCCESS**.
- PRE source parity: **VERIFIED**.
- bound Apps Script remote parity: **22/22 files**.
- no manual function invocation is required for Jane; the next installed Calendar/scheduled/fallback trigger will attempt the canary automatically.

Exact next action: **observe the next automatic trigger result, then verify Jane's created Type-105 Task, Customer/Location/Requested By, Pool 8, blank Description, no SO/InfoCustomFields/Field 854, Calendar backlinks, and subsequent `CONVERGED_NO_CHANGE`. Do not ask the operator to run the canary manually.**

## 3.11.36 PreInspection CF Preinspects guest sync — DEPLOYED

PreInspection Calendar rule clarified 2026-09-30:

- On Stephen's secondary PreInspection calendar, if the Calendar event creator is **not** `stephen@classicfireplace.ca`, the event must include **CF Preinspects** as an additional guest.
- This applies to events created by any other staff member, including Pramodh; only Stephen-created events are excluded.
- Guest reconciliation is idempotent: if CF Preinspects is already present, no write is performed.
- Missing creator fails closed for review; the system does not guess.
- The automatic guest sync runs from the existing scheduled/hourly automation path and is throttled to avoid recursive Calendar-trigger storms.
- The shared guest identity is the configured primary PreInspection calendar ID `c_3088a3989f3eb809957ed5c40137a7111a0ac97f68c29b40c144028cb14320dc@group.calendar.google.com` (display name **CF Preinspects**).
- Logical duplicate copies remain merged by Event ID + occurrence start, so Stephen + CF Preinspects copies represent one inspection record.

Deployment evidence:

- source commit: `099e661c28628de1490c4cc8708231750a3310e6`
- release: `3.11.36-preinspect-guest-sync-r1`
- guarded bootstrap run: `36751661982` — **SUCCESS**
- PRE source parity: **VERIFIED**
- bound Apps Script remote parity: **22/22 files**
- current tracked non-Stephen-created Stephen-calendar inspections were backfilled and read back with CF Preinspects present; Jane was also verified with CF Preinspects present.

Duplication audit after the guest correction found two visible content duplicates only:

1. Jane Bisset — prior `Cust#62638...` title preserved as the first description line duplicates the current canonical Calendar title.
2. Darryl Law & Cindy Hum — a legacy `Pre-Inspection Task Link` block duplicates Task #18534 already present in the current `Striven Links` block.

Do not collapse raw/normalized internal resolver fields merely because they look repetitive; several are intentional evidence/migration fields. Focus deduplication on user-visible Calendar content and duplicate managed link blocks.

## 3.11.37 PreInspection guest filtering — DEPLOYED / BACKFILL COMPLETE

The CF Preinspects guest rule was tightened after operational review:

- CF Preinspects belongs only on actual customer PreInspection appointments on Stephen's calendar.
- If an event matches the established non-customer/blocker classifier (for example Team Meeting, DO NOT BOOK, Day Off, vacation/out-of-office, travel, Newmarket blocker days, etc.), CF Preinspects must be removed if present and must not be re-added.
- Any Stephen-calendar event created by `pramodh@classicfireplace.ca` must not carry CF Preinspects; if present, it is removed.
- Stephen-created events also do not carry CF Preinspects.
- Other creator + legitimate customer PreInspection => CF Preinspects is added/kept idempotently.
- Existing attendees other than CF Preinspects are preserved.

Release: `3.11.37-preinspect-guest-filter-r1` at source commit `4872c5f1409df84c06577e37beb4ef58478a9fc9`.
Guarded deployment run `36756954359`: SUCCESS; source parity 22/22.

Backfill used the authenticated V3 guest reconciler in bounded batches:

- Batch 1 run `36758134576`: scanned 372; removed 50; added 0; deferred 22; errors 0.
- Batch 2 run `36758420473`: scanned 372; removed 22; added 0; deferred 0; errors 0.
- Total unwanted CF Preinspects invitations removed: **72**.

Verified examples after cleanup:

- Jane Bisset legitimate PreInspection retains CF Preinspects.
- Team Meeting / DO NOT BOOK / NEWMARKET DAY blocker occurrences no longer carry CF Preinspects; unrelated existing attendees remain intact.

The earlier 3.11.36 note saying Pramodh-created events receive CF Preinspects is superseded by this rule.

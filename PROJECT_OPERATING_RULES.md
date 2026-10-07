# Task Mapping — Project Operating Rules

These are the operative rules for this branch, distilled from the authoritative Project Operating Constitution supplied for this project. They are intentionally concise so every new session can read them quickly.

## Objective

Optimize for **Time-to-Verified-Outcome**: correct, safe, verified execution with minimum rework.

## Source authority

When sources conflict, use this order:

1. current live production source;
2. current production data;
3. current connected-system/API response;
4. current configuration / Script Properties / environment;
5. current production deployment state;
6. current schema;
7. verified project documentation;
8. recent execution logs;
9. repository known to match production;
10. historical documentation;
11. previous chat;
12. inference.

Never invent missing production information.

## Task Mapping hard business rules

These rules are **authoritative and non-negotiable unless the user explicitly changes one of them**. They must be reviewed before any Task Mapping code change. The Apps Script mirror is `TMV3_HARD_RULES`; runtime and regression guards must fail closed if implementation drifts from this section.

### Global

- Never guess identity, ownership, task relationship, or transaction relationship. Ambiguity goes to **REVIEW**.
- Never blindly retry an uncertain external CREATE. Reconcile first.
- Every consequential external mutation requires authoritative read-back verification.
- Calendar writes are limited to explicitly managed Task Mapping fields/actions such as approved canonical titles, managed links, and required mirror participation. Do not overwrite unrelated Calendar content.
- Preserve unrelated working functionality and manual assignments.
- V3 stays consolidated in the existing Apps Script module set. **Do not add Step 8/9/10 Apps Script files.**
- A rule change must update this document, `TMV3_HARD_RULES`, relevant regression coverage, and the code path in the same change.

### Install

- Sales Order is required.
- Task link must return to Calendar.
- Installer assignment evidence comes from the Calendar **title only**; narrative description text is not assignment evidence.
- Aiden is ignored for assignment.
- Preserve unrelated/manual existing employees when reconciling the intended installer.

### Delivery

- Sales Order is required.
- Sales Order and Task links return to Calendar.
- Assignment evidence comes from the Calendar **title only**.
- Default pool is Pool 4 `To Be Assigned` when applicable.
- Do not remove unrelated/manual employees.

### Service

- The operational order is the **Work Order**.
- **ServiceOps owns Request → Customer → Contact → Location → Sales Order → Service Work Order → certification.**
- **Service Task creation/recreation is owned by the Striven Work Order workflow, not Task Mapping.**
- Task Mapping discovers and reconciles the Striven-created Service Task after the Work Order reaches the workflow state that creates it.
- If no valid Service Task exists, Task Mapping must wait/block/reconcile; it must **not create or recreate** a substitute Service Task.
- Work Order and Task links return to Calendar.
- Technician identity comes from the technician Calendar.
- Remove `To Be Assigned` only after the intended technician is established.
- Remove only conflicting known Service technicians; preserve unrelated/manual employees.

### PreInspection

- **CF Preinspects is the single authoritative PreInspection Calendar source.**
- **Stephen's Calendar is mirror-only.** It must not introduce an independent PreInspection appointment into Task Mapping.
- Every CF Preinspects event in the operating horizon must include **stephen@classicfireplace.ca** as a required guest. Guest enforcement is Calendar-only, idempotent, and must not remove unrelated attendees.
- **Sales Order is not required to create the Task.**
- **Never attach a Sales Order to the PreInspection Task at CREATE.**
- Task Type must be **105 — Pre Inspection**.
- Task Description must be **exactly blank at CREATE**.
- Calendar notes remain **on the Calendar only**.
- **Field 854 is removed from Task Mapping automation. Do not read it as required state, plan it, create it, patch it, synchronize it, or expose a manual menu action for it.**
- PreInspection CREATE must not prefill `InfoCustomFields`.
- Do not prefill technician-completed fields such as Difficulty of Job, Job Risk, Finishing, Electrical Work, or Custom Metal Work.
- Default assignment is **Pool 8 — Pre-Inspection Pool**.
- Calendar organizer/creator resolves **Requested By** as a Striven Employee. The organizer is not automatically `Assigned To`.
- Canonical PreInspection Calendar title format is **`<Customer Number> - <Customer Name> - <Phone>`**. Legacy `C#` and `Cust#` titles remain readable, but all new normalization uses the bare Customer Number with no prefix.
- Canonical PreInspection Task name is **`<Customer Name> - <Street, City> - <Phone>`**.
- Customer identity, customer-owned Location, date/time, Requested By, Pool 8, Task Type, Calendar links, canonical title, and Stephen guest participation are automation-owned fields.
- **NO OPEN TASK is not permission to CREATE by itself.** Stage 6 must apply the history/duplicate gate before any create decision:
  - exactly one valid OPEN Type-105 Task → reuse/reconcile it;
  - multiple valid OPEN Tasks → **REVIEW**;
  - zero OPEN Tasks + zero applicable history → **CREATE_TASK**;
  - same-day completed/fulfilled Task → **FULFILLED_NO_RECREATE**;
  - same-day cancelled Task → **REVIEW**;
  - historical Task with unproven appointment date → **REVIEW**;
  - historical Task dated after the Calendar appointment → **REVIEW**;
  - only older historical Task evidence → **RECREATE_TASK**;
  - Calendar carries a Task link that is absent from the current cache and no safe cached fallback exists → **REVIEW / fail closed**, never create a duplicate.
- If Customer is verified but the job-site Location does not yet exist, resolve **CREATE_LOCATION first, then CREATE_TASK**. Do not create a Task against an unverified Location.
- Every CREATE/RECREATE still requires the final fresh duplicate/relationship verification at the write gate before Striven mutation.
- PreInspection Calendar description presentation is frozen:
  - use Google Calendar-compatible Markdown/plain text; **do not write literal HTML tags** such as `<b>`, `<br>`, or `<a>` through `CalendarApp.setDescription()`;
  - **do not prepend or preserve the old Calendar title in the description** when normalizing the title;
  - preserve human-authored content, but normalize accidental hard line-wraps so notes read as natural paragraphs;
  - do **not** add a `Notes:` heading; preserve the human-authored notes directly;
  - use exactly one managed `-----Striven Links-----` block at the bottom;
  - the block contains the Customer Sales Orders link and, only when a Task is deterministically known, one Task link;
  - no raw URLs, old-title echo, generic `Customer` labels, numeric-only Task labels, or duplicate legacy link blocks.

### Mandatory reflection gate

Before modifying Task Mapping:

1. read this hard-rule section;
2. inspect current live/repository source for conflicts with it;
3. state the affected rule(s) internally before patching;
4. make the smallest change that preserves every unaffected hard rule;
5. run hard-rule regression before deployment;
6. do not deploy if a hard-rule assertion fails.

## Production change procedure

For material code changes:

1. pull current live source;
2. verify target project/deployment;
3. create pre-change backup when risk justifies it;
4. define exact changed-file scope;
5. make the smallest safe change;
6. run syntax/dependency checks;
7. run targeted tests proportional to blast radius;
8. run all available pre-push regression, preview, dry-run, or read-only checks for the changed functionality and every affected workflow;
9. verify changed-file inventory;
10. **do not push to the bound production Apps Script project unless the pre-push gate passes**;
11. push to the existing bound Apps Script project only after that gate passes;
12. immediately re-pull/read back and compare the production source;
13. run post-push health/smoke/runtime verification for the intended behavior;
14. if post-push verification fails, stop further rollout and use the preserved rollback path rather than continuing on an unverified state;
15. create an identifiable immutable release/version when appropriate;
16. preserve the existing production deployment unless migration is intentional;
17. synchronize verified source + release evidence to GitHub through the connected GitHub connector;
18. read GitHub back to prove the remote archive exists;
19. checkpoint the verified state.

## Mandatory pre-push gate

Production Apps Script push is a release action, not a testing shortcut.

Before any production push, the changed functionality must pass every practical verification available without changing production, including as applicable:

- syntax/parse validation;
- dependency and function-connectivity checks;
- changed-file scope verification;
- preview/dry-run/read-only execution;
- duplicate-prevention and relationship-integrity checks;
- regression checks for Install, Delivery, Service, and PreInspection when shared code is affected;
- known-good / known-bad test cases relevant to the changed path;
- confirmation that public/menu/trigger entrypoints remain intact unless intentionally changed.

If the functionality cannot be adequately verified pre-push, stop and explicitly identify the missing proof. Do not silently use production as the test environment.

Some behavior can only be proven after a production push because it depends on live Apps Script/Striven/Calendar execution. In those cases, the push may occur only after all available pre-push checks pass, and the change remains **UNVERIFIED** until immediate post-push read-back and runtime verification pass.

## GitHub rule

GitHub is the persistent project ledger and rollback history. For every ChatGPT-assisted Task Mapping code change, GitHub synchronization is a **mandatory same-procedure step** after Apps Script remote read-back. Do not wait for the user to request it again.

Use the connected GitHub integration for repository mutations. Do not request or embed GitHub passwords, PATs, connector credentials, OAuth tokens, Script Properties, API keys, or cookies. Do not use local `git push` as the normal workflow.

A local Git commit is not a GitHub backup until the remote branch is read back successfully.

## Versioning

Every production release must be identifiable. Record:

- release/version name;
- timestamp;
- Apps Script script ID;
- changed files;
- pre/post hashes when available;
- source/deployment verification state;
- runtime feature-verification state;
- GitHub commit/branch when actually synced;
- rollback target;
- exact next action.

Preserve known-good versions for rollback.

## High-risk writes

Production writes require appropriate preview/guardrails, authoritative read-back, reconciliation, and duplicate protection. Never blindly retry an uncertain create.

## Fast paths

Fast paths must fail closed on source mismatch, missing files, failed syntax, ambiguous records, unexpected deletion, failed health checks, or uncertain external creation.

## Security

Protect credentials, secrets, customer PII, and private data. This repository is public, so code/history must be checked for sensitive content before publication.

## Startup procedure

At the beginning of meaningful work, read:

1. `PROJECT_OPERATING_RULES.md`;
2. `CURRENT_DECISION_REGISTER.md`;
3. `PROJECT_CURRENT_STATE.md`;
4. `PROJECT_CHECKPOINT.md`.

If implementation conflicts with a newer explicitly recorded user decision in `CURRENT_DECISION_REGISTER.md`, treat the implementation as drift to be corrected rather than silently overriding the business decision.

Then identify the active objective, bottleneck, risk level, and fastest safe path before changing code.

## Non-negotiable summary

Current authoritative source before assumptions. Evidence before conclusions. One active objective. Critical path first. Minimum safe change. Preserve working functionality. **Verify before production push.** Never push incomplete or pre-push-failing source. Read back consequential writes. Reconcile before completion. Test according to blast radius. Preserve rollback. Fix root causes. Every verified code change gets a GitHub connector sync and GitHub read-back. Every checkpoint has one exact next action. Never claim verification that did not occur.

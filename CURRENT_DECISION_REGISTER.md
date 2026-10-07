# Task Mapping — Current Decision Register

**Effective:** 2026-10-07 (America/Toronto)  
**Authority:** Latest explicit user decisions for Task Mapping business behavior.  
**Rule:** If older chat, historical code, stale Sheet text, or old checkpoint conflicts with this register, the older item is superseded. Live implementation that conflicts with this register is implementation drift to be corrected.

## Global

- Stage 7 is the sole consequential mutation authority.
- Never guess identity, ownership, task relationship, or transaction relationship; ambiguity => REVIEW.
- Every important ID must be relationship-certified, not merely syntactically valid.
- Current and desired IDs/state stay separate until the external write succeeds and read-back verifies it.
- Never blindly retry uncertain CREATE; reconcile authoritative state first.
- Calendar is authoritative scheduling/input data. Task Mapping may write only explicitly approved managed fields/actions, idempotently and with read-back.
- Keep V3 consolidated; do not add Step 8/9/10 Apps Script files.
- Prefer targeted reads/refreshes over global refreshes; preserve the Striven API budget.

## Install

- Sales Order required.
- Resolve Customer/Location/Contact relationships before mutation.
- Installer evidence comes from Calendar title only.
- Aiden is ignored until explicitly configured.
- Preserve unrelated/manual employees.
- Managed Calendar output: verified Task link.

## Delivery

- Sales Order required.
- Resolve Customer-owned Location and exact Delivery Task.
- Assignment evidence comes from Calendar title only.
- Pool 4 To Be Assigned remains until a valid employee is established.
- Preserve unrelated/manual employees.
- Managed Calendar output: Sales Order + Task links.

## ServiceOps ownership boundary

- ServiceOps owns: Request → Customer → Contact → Location → Sales Order → Service Work Order → certification.
- ServiceOps completion does not require Task Mapping to create a Service Task.
- Striven's Work Order workflow owns Service Task creation/recreation.

## Service Task Mapping

- Task Mapping discovers and reconciles Striven-created Service Tasks.
- If no valid Service Task exists, wait/block/reconcile the Striven workflow; **do not create or recreate a substitute Service Task**.
- Customer-only matching never authorizes mutation.
- Multi-fireplace siblings (FP#1, FP#2, etc.) are valid when uniquely identified; synchronization is event-level and all expected links must be preserved.
- Technician identity comes from Service technician Calendar.
- Pool 4 removal occurs only after intended technician is established.
- Preserve unrelated/manual employees.

## PreInspection

- CF Preinspects is the single authoritative Calendar source.
- Stephen's Calendar is mirror-only; Stephen remains a required guest.
- Canonical Calendar title: `<Customer Number> - <Customer Name> - <Phone>`.
- Canonical Task name: `<Customer Name> - <Street, City> - <Phone>`.
- Task Type: 105 — Pre Inspection.
- Default assignment: Pool 8 — Pre-Inspection Pool.
- Requested By: exact Calendar creator/organizer email → exactly one Striven Employee; no Customer Contact fallback.
- Sales Order may corroborate identity but is not required or attached merely for CREATE/RECREATE.
- Customer-owned Location is required. Reuse one deterministic owned match; safely CREATE_LOCATION before Task CREATE when genuinely missing; ambiguity/wrong owner => REVIEW.
- Task Description: exactly blank at CREATE; technician-owned afterward.
- **Field 854: NOT MANAGED BY TASK MAPPING. Do not read as required state, plan, create, patch, synchronize, verify, block on, or expose a manual action for it.**
- Calendar authored notes remain on Calendar only. Do not copy them to Task Description or Field 854.
- InfoCustomFields at CREATE: none.
- Technician-completed fields (Difficulty, Job Risk, Finishing 852, Electrical 853, Custom Metal 860, etc.) are not prefilled.
- One OPEN valid Task => reuse. Multiple valid OPEN => REVIEW.
- No OPEN does not automatically mean CREATE: apply history/duplicate gate.
- No history => CREATE_TASK; same-day completed => FULFILLED_NO_RECREATE; cancelled/undated/future-conflicting history => REVIEW; only older completed history => RECREATE_TASK.
- Before CREATE/RECREATE, fresh duplicate/relationship verification is mandatory.
- Calendar description preserves human-authored notes and exactly one managed Striven Links block using the approved Monic plain/Markdown source pattern; no literal HTML source.
- Calendar copies/managed state are read back and verified.

## Operator / website

- Website/UI is an operator surface over the same canonical backend engine, not a second resolver.
- Manual and automatic execution consume the same fresh Step 7 contract.
- Show compact business status: Customer, Contact, Location, SO/WO, Task(s), Calendar/link, verification, exact blocker.
- Manual rerun/recheck/repair actions must use canonical guards.

## Data / API

- Broad mapping uses cached/report data where appropriate.
- Live API reads are reserved for write-critical freshness, ownership and verification.
- Routine Stage 4 mapping does not perform per-Customer Contact API reads.
- Customer/Location master-source refresh target: 360 minutes.
- Orders/Tasks operational refresh target: 120 minutes.
- V3 daily Striven API soft limit: 1,200.
- Targeted processing before full refresh.

## Deployment

- Canonical repo: `consultpramodh/classicfireplace`.
- Canonical branch: `task_mapping`.
- Pull live → verify target → preserve PRE source → patch minimum files → syntax/regression → push same bound project → remote re-clone → file/hash parity → runtime verification → checkpoint.
- GitHub synchronization/read-back is mandatory for verified changes.
- General operating mode remains `SHADOW_READ_ONLY` until an explicit cutover decision.

## Explicitly superseded rules

- **Superseded:** Calendar notes → Field 854 automation.
- **Superseded:** Field 854 as a PreInspection acceptance/completion gate.
- **Superseded:** generic shared CREATE/RECREATE permission for Service Task Mapping.
- **Superseded:** Stephen Calendar as an independent PreInspection business-source calendar.
- **Superseded:** PreInspection Requested By = Customer Contact.

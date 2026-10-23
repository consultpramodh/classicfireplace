# Task Mapping — Current Decision Register

**Effective:** 2026-10-13 (America/Toronto)
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
- When a PreInspection Calendar title is normalized, preserve the exact previous title as the first line of the Calendar Description **without adding a heading such as `Original Title:`**. Remove presentation-only headers such as `Notes:` and `Sales Order:` while preserving the actual information that followed them; do not remove legitimate inline data such as `SO#585603`. Then preserve the remaining human-authored notes and exactly one managed Striven Links block using actual clickable Google Calendar hyperlinks. Raw Markdown-style `[label](URL)` text is invalid if Google Calendar renders it literally.
- **Striven Links presentation is frozen:** links must be actual clickable Google Calendar hyperlinks. Existing correct clickable Striven Links blocks must be preserved exactly during unrelated reconciliation. A raw Markdown-style `[label](URL)` display is invalid and must be repaired. Only missing, wrong, or non-clickable links may be changed.
- **Cross-calendar parity is mandatory.** Every required physical copy of the same PreInspection appointment must carry the same business-visible event information after reconciliation: canonical title, Description (including preserved old title when applicable, cleaned authored notes, and one Striven Links block), location, start/end, and required attendee/guest state. Only unavoidable Google system metadata such as organizer ownership, event URLs, IDs, Meet links, response-status mechanics, and per-calendar metadata may differ. Read all required copies back and fail completion if business-visible parity is not proven.

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
- Controlled 2026-10-13 activation uses `PRODUCTION_WRITE` solely for verified existing Service/Delivery Task relationship repair, one candidate per 60-minute interval. This implements the user-authorized fix; it does not enable general manual/automation writes, schedule/assignment/Calendar writes, or CREATE/RECREATE. General four-vertical cutover remains gated.

## Explicitly superseded rules

- **Superseded:** Calendar notes → Field 854 automation.
- **Superseded:** Field 854 as a PreInspection acceptance/completion gate.
- **Superseded:** generic shared CREATE/RECREATE permission for Service Task Mapping.
- **Superseded:** removing the previous PreInspection Calendar title from Description during title normalization.
- **Superseded:** Stephen Calendar as an independent PreInspection business-source calendar.
- **Superseded:** PreInspection Requested By = Customer Contact.


## Automatic Service / Delivery Task details — 2026-10-20

- Service uses Sales Order status In Progress. Install and Delivery use Sales Order status Approved. Do not apply the Service-only In Progress prerequisite to Install or Delivery. Automatically link each existing Service/Delivery Task to the unique SO# in its title; Calendar presence is not required for Order linking.
- The title identifies the Order number only. Fresh Task Customer, exact Order ID/number/owner/status and Contact ownership remain write-critical evidence. Recheck present status; a previously eligible status is not proof against later cancellation.
- Existing native triggers perform routine patches. Do not make the operator run editor/menu functions for normal Task-detail synchronization.
- Calendar-backed dates, customer-owned Location and intended employee/pool assignments use fresh canonical Step 7 evidence under the dedicated existing-Task detail context. Do not enable general manual/automation flags or permit Task creation, Calendar/title edits, technician-note/custom-field changes through this path.
- Preserve manual employees; remove only Pool 4 after intended employees are independently read back. Preserve the shared one-candidate/hour limit until a separately verified capacity change.
- SO 586061 / ID 27795 is operator-confirmed canceled. Do not attach inactive Orders or automatically cancel Task 19198. Recheck lifecycle dynamically; a genuinely reactivated Order can become eligible after fresh proof, without a code blacklist or manual patch. Never invent a replacement Order.


## Explicit one-time Service/Delivery backlog authorization — 2026-10-20

User requested all55 Service and26 Delivery Tasks be patched without the hourly wait. Approved implementation is a fixed81-ID, resumable Order-only queue, independently verified per Task; this supersedes the prior one/hour constraint for that queue only. Ordinary routine capacity, global flags, API brake, Calendar/full-detail gates, Install and PreInspection remain unchanged. Existing Delivery Task Order linkage accepts an exact Sales Order identity without a DELIVERY_APPROVED report row. Missing report identities use the verified official Number/CustomerId search schema, complete-result uniqueness and fresh Order GET proof. Cancelled/inactive Orders, conflicts, missing title SO# and uncertain writes remain held. No completion claim until native per-Task readbacks and the final tally are observed.


## Fixed backlog execution completed — 2026-10-20

All81 targets processed automatically. Final link outcomes68 patched/2 already linked/11 held; no pending or uncertain writes. Hold9 Orders that fail the active condition, Task19064 without SO# and canceled Task19262. Existing19098→27661 is preserved even though that Order is outside new-link eligibility. Fresh cache reconciliation and68 unique native Order-only readbacks agree; the cause of the separately observed cache discrepancy remains unconfirmed. Do not infer a permanent cache-sync fix or broader vertical acceptance from this backfill.

## Sales Order status correction — 2026-10-23

Latest explicit user rule: Service requires In Progress; Install and Delivery require Approved. PreInspection does not require a Sales Order. This supersedes generalized In Progress or either-active-status prerequisites. Fresh ownership and status must be verified by vertical. Existing shared task-first source accepts Approved OR In Progress without vertical discrimination; that is a recorded implementation gap, not the intended policy. No runtime status-gate correction is claimed by this decision update.

## 2026-10-23 — All four verticals authorized

Latest user instruction: continue execution until PreInspection, Service, Delivery and Install are all active. This supersedes earlier PreInspection-only activation limits. Service requires Sales Order status **In Progress**; Install and Delivery require **Approved**; PreInspection retains its optional-SO policy. Service still requires proven Work Order evidence and must never automatically create/recreate a Service Task.

The scoped VERTICALAUTO worker uses the existing Stage 7 executor, fresh identity/ownership/status checks, exact per-event contracts, durable uncertain-write markers, read-back verification and review holds. Targeted Order/Contact/Location evidence refresh must preserve cache schema and reject conflicting ownership. Dedicated hourly trigger plus existing scheduled slots process bounded batches; at most one verified event transaction per vertical per hour. General automation/manual write flags stay false; dedicated PreInspection authorization remains active. Install reminders go only to the verified internal event creator, with durable uncertain-send suppression.

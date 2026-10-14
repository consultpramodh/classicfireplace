# PreInspection automation

Release: 3.11.88-preinspection-business-day-notifications-r1.

## Intake and identity

CF Preinspects is authoritative. Explicit PreInspection appointments on Stephen's calendar are enrolled by adding CF Preinspects and Stephen as guests. The same event UID is retained. A possible separate duplicate is held; task writes wait for the CF copy to appear. Name/phone-only Stephen appointments are not automatically classified as PreInspection. Non-job/all-day appointments are excluded.

Resolve customer number, phone and address/name against cached Striven source data. A conflicting address owner is not an acceptable customer match. A verified customer with a new job-site address uses the existing guarded location-creation path.

## Task and calendar

Type 105; default Pool 8; Requested By is the verified calendar creator/organizer employee. Sales Order is not required or attached at create. Task Description remains blank; no field 854 or technician-completed fields are prefilled.

Use the existing shared lifecycle gate: one open task is reused, multiple open tasks are held, same-day fulfilled history is not recreated, older fulfilled history may recreate, and cancelled/future/unproven history is held. Before create/recreate, query complete live customer-scoped Type 105 history, verify ownership and recompute the plan. Durable guards prohibit a second POST after an uncertain create.

Calendar title: `Customer Number - Customer Name - Phone Number`.
Task name: `Customer Name - Street, City - Phone`.
Preserve the original title and sales-rep wording in the calendar description. Use one blank line between the legacy title and original notes, and one blank line before `-----Striven Links-----`, with clickable named Sales Orders and Task links. Task labels use the verified actual Striven task name. Verify both calendar copies.

## Dynamic missing-details email

Check Customer Number, Sales Order Number and Location from current event contents. Show only fields still missing in the attention list and correction table. Complete location is context only. A missing SO does not block task creation.

First notification is eligible two Monday–Friday business days after original event creation, at the same Toronto wall-clock time. If the appointment is in the same Monday–Sunday calendar week as creation, skip that grace period. Send at the next scheduled check; no weekend emails. Unknown creation timestamps are held. Ontario holidays are not excluded.

Follow-ups are eligible at the first business-day scheduled check at least 24 hours after the previous successful email, at most once per Toronto day. Label subject and heading FOLLOW-UP #1, #2, etc. Stop when details are corrected, the appointment is cancelled or its start time has passed. Re-evaluate current missing fields before dispatch.

To actual event creator; CC Jay and Thang. No owner fallback for unknown/ambiguous creators. Keep the approved charcoal/red styling, red missing text and italic automated-email notice above the greeting. Identify title, date/time and address before the attention list; subject identifies customer, date/time and missing fields. Use the calendar-specific encoded Google Calendar event URL.

Persist timestamp and successful-send count under the existing event notification key. Write SENDING before MailApp and SENT after success. Uncertain sends are held without retries. Legacy SENT markers have no timestamps: migration records the current time and count 1, deferring the next reminder at least 24 hours. Technical failures alert Pramodh separately.

## Triggers, recovery and limits

Daily PreInspection triggers run approximately at 8 AM, 1 PM and 5 PM America/Toronto. The five-minute trigger is removed. Calendar-update, generic scheduled and hourly paths cannot run the PreInspection lane. Manual kicks remain available. Each scheduled slot checks notification deadlines for all authoritative events independently of the task-write cursor. A script lock prevents concurrent transactions. Inspect at most three appointments and attempt one event mutation transaction per run. Rotate the cursor to prevent starvation. Skip unchanged verified events for one hour; calendar edits invalidate the fingerprint. Keep unresolved events in persistent recovery even after their appointment date passes.

PreInspection writes and email delivery have independent production flags. General AUTO and MANUAL writers remain disabled. Other verticals cannot execute under the PreInspection scope. Manual kick: `tmv3_runPreInspectionAutomation`; read-only diagnostics: `tmv3_verifyPreInspectionAutomation`.

## Verification

185 existing hardening cases and 55 base PreInspection cases plus schedule, layout, appointment-link and 18 notification-timing cases pass, along with the deployment's relationship, permission, lifecycle, runner and calendar-layout checks. Live acceptance proves Stephen-to-CF enrollment, creator discovery, identity-conflict hold, approved template delivery to the test recipient and trigger installation. Deployment backs up live source, requires an exact Git baseline match, and re-clones for hash verification; uncertainty triggers rollback.

This specification covers appointment intake, identity, task reconciliation, calendar writeback and notifications. Task completion note transfer and printing are separate workflows.

Production acceptance: automatic processing completed one existing-task reconciliation and sent three missing-details notifications. The creator-directed notification's To/CC/body were read back from Gmail. The original send-once acceptance returned `ALREADY_SENT` with `sent: 0`; this release replaces that policy with timestamped numbered follow-ups. Active configuration and dedicated calendar/clock triggers were verified from the live bound project. Unresolved identity remains held; an uncorroborated address owner is not permission to create a task.

# PreInspection automation

Release: 3.11.83-preinspection-bounded-production-r1.

## Intake and identity

CF Preinspects is authoritative. Explicit PreInspection appointments on Stephen's calendar are enrolled by adding CF Preinspects and Stephen as guests. The same event UID is retained. A possible separate duplicate is held; task writes wait for the CF copy to appear. Name/phone-only Stephen appointments are not automatically classified as PreInspection. Non-job/all-day appointments are excluded.

Resolve customer number, phone and address/name against cached Striven source data. A conflicting address owner is not an acceptable customer match. A verified customer with a new job-site address uses the existing guarded location-creation path.

## Task and calendar

Type 105; default Pool 8; Requested By is the verified calendar creator/organizer employee. Sales Order is not required or attached at create. Task Description remains blank; no field 854 or technician-completed fields are prefilled.

Use the existing shared lifecycle gate: one open task is reused, multiple open tasks are held, same-day fulfilled history is not recreated, older fulfilled history may recreate, and cancelled/future/unproven history is held. Before create/recreate, query complete live customer-scoped Type 105 history, verify ownership and recompute the plan. Durable guards prohibit a second POST after an uncertain create.

Calendar title: `Customer Number - Customer Name - Phone Number`.
Task name: `Customer Name - Street, City - Phone`.
Preserve the original title and sales-rep wording in the calendar description. Use one blank line before `-----Striven Links-----`, with clickable named Sales Orders and Task links. Task labels use the verified actual Striven task name. Verify both calendar copies.

## Dynamic missing-details email

Check Customer Number, Sales Order Number and Location from event contents. Recognize labelled SO references or a standalone six-digit SO number; ignore phones and managed URLs. Show only missing fields in the attention list and correction table. A complete location is appointment context only. Reassess after automated matching/reconciliation. Missing SO notifies but does not block task creation.

To: actual event creator. CC: Jay and Thang. No owner fallback when creator is missing or ambiguous. Greeting uses the recipient's name. Original charcoal/red/green layout; missing text red. Automated-email notice is at the top, before the greeting.

Send once per event UID. Persist SENDING before dispatch; uncertain delivery is held rather than blindly retried. Calendar correction re-enters processing. Technical failures alert Pramodh separately, deduplicated by event/error/day.

## Triggers, recovery and limits

Calendar-update triggers watch CF Preinspects and Stephen. A dedicated five-minute clock trigger provides fallback. The existing scheduled and hourly handlers also enter the lane. A script lock prevents concurrent transactions. Inspect at most three appointments and attempt one event mutation transaction per run. Rotate the cursor to prevent starvation. Skip unchanged verified events for one hour; calendar edits invalidate the fingerprint. Keep unresolved events in persistent recovery even after their appointment date passes.

PreInspection writes and email delivery have independent production flags. General AUTO and MANUAL writers remain disabled. Other verticals cannot execute under the PreInspection scope. Manual kick: `tmv3_runPreInspectionAutomation`; read-only diagnostics: `tmv3_verifyPreInspectionAutomation`.

## Verification

185 existing hardening cases and 45 new PreInspection cases pass, along with the deployment's relationship, permission, lifecycle, runner and calendar-layout checks. Live acceptance proves Stephen-to-CF enrollment, creator discovery, identity-conflict hold, approved template delivery to the test recipient and trigger installation. Deployment backs up live source, requires an exact Git baseline match, and re-clones for hash verification; uncertainty triggers rollback.

This specification covers appointment intake, identity, task reconciliation, calendar writeback and notifications. Task completion note transfer and printing are separate workflows.

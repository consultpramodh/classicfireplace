# PreInspection implementation status — 2026-10-19

Implemented release: `3.11.95-preinspection-date-controls-and-notifications`.

## Implemented and deployed
- Nested Location address payload using country code CA; new Locations named Primary.
- Strict complete Location response handling, including explicit zero-count/null collections.
- Narrow validation-rejection recovery; uncertain writes remain protected.
- Verified optional sales-order Location evidence cached without attaching an order to the Task.
- Type 105 task-cache dates use canonical V1 schedules, without inferred twelve-hour shifts.
- Blocked cycles report ATTENTION; operator selection retains prerequisite and duplicate guards.
- PreInspection task names use customer name, street and city, and phone.
- Optional target-date operator controls preserve today's default behavior and native write guards.
- Notification-only recognition of unformatted customer numbers requires unique cached customer-number evidence corroborated by profile phone or complete name tokens. It does not authorize task writes or change identity matching.
- Missing sales-order reminders explicitly state that the field is optional and task creation can proceed.

All 22 live source files were freshly captured and exactly matched intended release 95. All 22 repository blobs were subsequently compared with the live capture and matched. See live95-readback-sha256.json.

## October 21 acceptance
All eight events passed fresh native read-only reconciliation at 13:50 Toronto on October 19: open tasks, NO_CHANGE plans, no blockers, and MATCH for customer, location, Requested By, start, end, assignment, calendar title, and task name.
Four new tasks and one return-visit task were created through native guarded transactions. Two existing tasks were repaired. The remaining existing task already had recent verified state and passed the final audit.
Each executed transaction returned verified convergence with calendar-link checks. A repeat operator queue check reported all eight recently verified, no exclusions, and zero Striven calls.
The final read-only audit used a budget-counter delta of 14; it made no task writes.
The final operator-view refresh at 13:52 Toronto passed with all eight schedules ALREADY_CACHED_MATCH and no Striven writes. A fresh sheet read then showed all eight October 21 rows as MATCH_EXISTING with the expected task links and schedules.

## Verification
- 185 core regression cases across 13 suites passed on the candidate release.
- 12 notification evidence and assessment cases passed using actual project helpers.
- Three target-date filtering checks passed.
- Five existing selection scenarios passed.
- The corrected assessment was exercised on all eight original October 21 records with checked profile evidence: no missing-customer-number flags; optional sales-order reminders remained for two records.
- Earlier Location, order-evidence, canonical-cache, cycle-status, and completion tests remain in this branch.

## Remaining broader automation gaps
- Automatic Location phone copy: the documented Location write contract exposes no phone field. A one-time supported UI correction is not an automated implementation. October 21 used existing resolved Locations.
- Scheduled queue throughput: three daily slots and one changed event per native cycle remain.
- Completed-history verification can still produce an attention status despite protected fulfilled-history handling.
- Notification formatting still contains repeated appointment summaries; this release corrects evidence and optional wording, not the layout.

PR #127 remains open as draft. Successful October 21 acceptance does not establish full unattended queue throughput.

## Two-week re-audit superseding broader readiness assumptions
Full unattended launch is blocked. Fresh audit of October 12–25: 22 formal events, 16 NO_CHANGE, five completed/protected, one current STEP6 NOT_RUN despite an existing correct task. Five cached afternoon schedules reverted to morning while actual task schedules remained correct. Bulk hydration bypasses canonical schedule handling; refresh can lose verified Location/order evidence and previously linked task rows. The earlier canonical-cache implementation claim is limited to the upsert path.

All eight October 21 events still pass point-in-time reconciliation. Required next acceptance is full master/transaction cache refresh followed by scheduled execution and readback, after fixing cache persistence. Queue continuation, fulfilled-history status and blocked-plan visibility remain unresolved. See [two-week audit](../../../audits/preinspection/2026-10-19-two-week-readiness.md). The audit added only a bounded retrospective helper; no business-logic repair or wider activation occurred.

## User-authorized PreInspection-only live operation — October 19
After reviewing the two-week audit, the user explicitly authorized operating this vertical live while correcting remaining issues. Fresh editor readback shows release 3.11.95, PRODUCTION_WRITE, preInspectionAutomationEnabled=true, no canary event restriction, general automationWritesEnabled=false and manualWritesEnabled=false. The 08:00/13:00/17:00 PreInspection triggers are already installed. No activation flag or trigger rewrite was needed; this lane was already enabled. A PreInspection-only immediate production kick was initiated at 14:46:59 Toronto. Other vertical permissions were not expanded. Existing task-first relationship permissions and unrelated triggers were not changed.

This operational authorization supersedes the audit's hold recommendation; it does not resolve the documented defects or constitute full unattended acceptance. Duplicate, uncertain-write, field-readback and API-budget guards remain in force. The cache-persistence, throughput, history-status and Location-phone issues remain tracked.

Immediate production result: server execution completed in 175.646 seconds, with log completion at 14:49:48 Toronto. Persisted TMV3_PI_LAST_RESULT independently confirms COMPLETE, processed=3, writes=0, notifications=0; all three saved event outcomes are NO_CHANGE with task IDs and blank errors. Detailed output verifies guarded calendar-link convergence but is truncated, so the compact persisted result governs the three-event total. No task mutation was required in this batch; this is not acceptance of all queued events or resolution of the audit defects. Next existing scheduled slot is 17:00 Toronto (near-minute scheduling).

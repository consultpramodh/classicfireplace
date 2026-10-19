# PreInspection implementation status — 2026-10-19

Current implemented release: `3.11.94-preinspection-primary-and-cache-dates`.

## Implemented and deployed
- Nested Location address payload using country code CA and new Location name Primary.
- Strict complete Location response handling, including explicit zero-count/null collections.
- Narrow validation-rejection recovery; uncertain writes remain protected.
- Verified optional sales-order Location evidence cached without attaching an order to the Task.
- Type 105 task-cache dates use canonical V1 schedule, without inferred twelve-hour shifts.
- Blocked cycles report ATTENTION; current-day selection retains prerequisite and duplicate guards.
- PreInspection task names use customer name, street and city, and phone.

All 22 repository source files were compared with the last exact live readback and matched. See live94-readback-sha256.json. This records that readback, not a fresh deployment.

## Verification
Supporting targeted tests cover Location creation, order evidence, canonical cache schedules, cycle status, completion, and current-day selection. Five selection scenarios were rerun successfully before adding the missing public test file.

## Pending — not implemented
- Notification customer-number assessment rejects a bare leading number unless followed by a dash. Missing-detail notices run before task reconciliation. Resolve identity before issuing customer-number alerts; distinguish optional sales-order reminders from blocking requirements. No notification code correction has been deployed.
- Automatic Location phone copy: the documented Location write contract exposes no phone field. A one-time supported UI correction is not an automated implementation.
- Scheduled queue throughput: three daily slots and one changed event per native cycle remain.
- Completed-history verification can still produce an attention status despite protected fulfilled-history handling.

PR #127 remains open for the repair branch. Repository synchronization does not mean these pending items are resolved.

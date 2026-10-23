# PreInspection first cutover — completed-history classification

Scope: first vertical in the user-approved order PreInspection → Service → Delivery → Install.

## Change
Release3.11.98-preinspection-history-classification-r1 changes only00_Config(version) and60_Automation(completion classification and metadata-only pending reconciliation). No status rule, API limit, broad write permission, trigger cadence, Task payload or Calendar writer is changed.

Same-day completed coverage is terminal only when a new canonical contract proves all of: PreInspection vertical, FULFILLED_NO_RECREATE disposition, VERIFY_ONLY_HISTORY_NO_WRITE plan, FRESH_TASK_GET read status, positive Task/Customer IDs, fulfilled Task status, exact Customer match, zero executable actions and actual Task start/due on the appointment day in Toronto. Missing/unknown/canceled/wrong-owner/wrong-day/read-failed evidence remains held. Existing NO_CHANGE/link readback behavior is preserved.

A recognized historical outcome no longer requests optional Order evidence, remains zero-write, clears the pending-review flag and logs FULFILLED_NO_RECREATE instead of a false attention blocker. Genuine identity review remains unchanged.

## Before/after acceptance
Prior sweep:18 eligible appointments scanned,5 pending review. Fresh read-only verification40008133155 confirmed four were already completed coverage and one was unresolved Customer/address corroboration. It consumed11 additional V3 calls (491→502); no business write was invoked.

Verified pre-source hash:64a37d2cf96b9e9b51ad95e362f4a05b58424c061bc6c6daedf1028fbd089ac1.
Verified post-source hash:1dcab7e18cf736c6f1b786c4a0969278382b987c913a10867056a3014ba0ef41.

Native acceptance in40009353614 PASSED: before5, cleared4, remaining1; four FULFILLED_NO_RECREATE results with fresh readbackVerified=true and zero business writes. Source after hash matched exactly. Four lock acquisition attempts were needed; only explicit zero-work LOCK_BUSY responses were retried.

## Tests and limitations
- All21 server files parsed.
- Actual13 core hardening suites:185 cases PASS.
- New history/queue/cycle cases:60 PASS, including wrong owner, wrong vertical, canceled/open/unknown Task, missing/future/previous date, Toronto midnight boundary, multiple plans, failed reads, bounded queue, lock release, true identity hold and no business mutation for completed coverage.
- New classifier executed against the five actual freshly read contracts:four accepted as fulfilled; unresolved identity rejected.
- Existing relationship/active-status, canary scope and link uniqueness suites passed.
- Two older standalone fixture runners failed identically on unchanged production source: notification fixture lacks SpreadsheetApp; production-lane fixture lacks tmv3_preInspectionAutomaticRecovery_. These were not represented as passing. No notification or scheduler production behavior is changed by this release.

## Deployment procedure
Current live source captured → exact two-file candidate and full-project hashes verified → durable PRE artifact uploaded → tests rerun against full actual live-source candidate → same project PUT → full readback → metadata-only native queue reconciliation → final full-source hash.

Attempt40009171138 passed tests and source parity; native returned explicit LOCK_BUSY before work. Exact previous source restored and verified. Retry40009353614 permits bounded retries only for explicit LOCK_BUSY; uncertain responses are never blindly retried. Existing immutable deployment versions/access are preserved; native triggers execute updated HEAD. Version is recorded in source; no Google immutable version creation is claimed.

## Operating scope
PreInspection dedicated processing remains enabled at08:00/13:00/17:00 Toronto, with bounded continuation and existing recovery. The remaining identity exception is deliberately held. Other verticals retain their prior gates and require the corrected SO statuses: Service In Progress; Install/Delivery Approved. PreInspection SO remains optional.

Next vertical: Service, starting with exact In Progress status enforcement, fresh Location resolution and full-field readback acceptance.

## Independent acceptance and operator status

Independent audit40009508257 passed after release: source3.11.98, full hash matched,17 native triggers, no missing handler/configuration/Sheet, source unchanged during audit. API count508; ordinary-scope remaining492;200 calls reserved for PreInspection; quota not exhausted. This is not a newly executed Task-create or email-delivery canary.

Overview status cells B2/B4/B10/D11/B14/B19 updated from stale3.11.81/READ ONLY/TEST_ONLY claims to the verified scoped production state and read back. Only cell values were changed; existing formatting and other cells preserved. Old overall row counts were not relabeled as current verified counts.

GitHub synchronizes the two changed deployed source files and release evidence. Other live/repository drift remains outside this two-file patch; full repository/source parity is not claimed. Native runtime uses current HEAD; existing immutable web/API deployment versions were preserved.

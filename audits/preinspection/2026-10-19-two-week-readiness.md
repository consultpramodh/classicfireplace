# PreInspection two-week readiness audit — 2026-10-19

Decision: do not enable full unattended operation yet.

Scope: October 12–25, 2026, America/Toronto. Fresh native read-only reconciliation covered all 22 formal shared-calendar appointments. All 22 had task links and matching title/time/location on the technician calendar.

| Period | Events | NO_CHANGE | Completed and protected | Blocked |
|---|---:|---:|---:|---:|
| October 12–18 | 7 | 3 | 4 | 0 |
| October 19–25 | 15 | 13 | 1 | 1 |
| Total | 22 | 16 | 5 | 1 |

All eight October 21 appointments passed fresh reconciliation again. This remains point-in-time acceptance, not refresh-persistence or unattended-throughput acceptance.

## Launch blockers and failure modes
1. Cache persistence: five October 19 cached afternoon schedules reverted to morning values. Fresh native task reconciliation still matched the correct actual Striven schedules. Bulk task-source hydration bypasses the canonical V1 schedule helper; TTL reuse retains raw values. The canonical guarantee previously documented applies to the upsert path, not all population paths.
2. Identity/location evidence persistence: an existing October 19 open task remains correct in Striven but is currently blocked in the planner with STEP6 NOT_RUN. Its verified Location/order evidence disappeared from source caches; multiple competing Locations remain. Forced refresh retains only currently verified target customers and can drop previously linked task rows. No duplicate task was observed.
3. Throughput: three daily slots (08:00, 13:00, 17:00), maximum three examined rows per cycle and one changed event per cycle, without automatic continuation. Nominal slot gaps are five, four and fifteen hours. Best-case changed-event capacity is three per day from this lane.
4. History/status: all five completed tasks are correctly protected, but their history blocker makes the completion predicate reject fulfilled history, potentially leaving false ATTENTION/pending state.
5. Recovery visibility: routine discovery begins today with zero lookback. Recorded pending IDs have a recovery path; unrecorded misses and late past-date edits can escape discovery. Ordinary blocked-plan outcomes can set ATTENTION without a failure email; result summaries omit the blocker.
6. Classification: one formal event has installation-related wording and needs a business classification decision despite mechanical MATCH. Seven secondary-only appointments lack enough purpose information to classify. They are possible false negatives, not established missing PreInspections.
7. New Location phone copy remains unimplemented through the documented API contract. Existing-Location cases do not validate this path.

Minor: two completed historical appointments have description parity differences from duplicate legacy link blocks; canonical task links exist on both calendar copies. Three prior-week tasks remain Open and require operational completion review, not automatic closure.

## Verification and controls
- Native audit executions completed for 7 prior-week, 7 October 19 and 8 October 21 appointments. Completed execution status is not business convergence.
- No Striven/calendar business writes or emails were performed by these audit runs. Missing linked tasks were hydrated into the Sheet cache.
- Global API budget counter rose by 45 across the three runs; concurrent activity prevents treating this as isolated exact cost.
- All 22 live source files were captured after the audit and exactly matched intended source, including the bounded retrospective audit helper in 90_Admin.js.
- tools/audit-tmv3-preinspection-cache-defects.js reproduces three current defects using extracted project source: raw V2 schedule propagation, TTL reuse and loss of prior linked rows. These are defect reproductions, not passing correctness tests.
- Notification customer-number recognition fixes remain in place; no false missing-number assessment appeared across the 22 canonical formal events.

## Required acceptance before launch
Fix canonical schedule handling in every cache population path; preserve and revalidate verified identity/location evidence and active linked tasks through refreshes. Then run full master and transaction refresh, scheduled reconciliation and final readback. Add bounded queue continuation, fulfilled-history status handling and visible blocked-plan recovery. Resolve business classification and Location-phone policy before claiming complete coverage.

No business-logic repair or wider automation activation was performed during this audit. PR #127 remains draft. Raw customer records and logs are intentionally excluded from this document.

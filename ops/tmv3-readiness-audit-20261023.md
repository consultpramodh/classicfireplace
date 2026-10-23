# Four-vertical automation readiness — 2026-10-23 14:57 Toronto

## Verification scope and evidence

Read-only production audit Actions40007531294, job120599153699, completed SUCCESS. Executed existing tmv3_listTriggers, tmv3_healthCheck and tmv3_strivenApiBudgetStatus only. No business worker, trigger installer, Apps Script source push or budget reset was invoked in this audit.

Live version3.11.97-preinspection-automatic-recovery-r1; production mode; stage7. Exact source hash64a37d2cf96b9e9b51ad95e362f4a05b58424c061bc6c6daedf1028fbd089ac1 unchanged from prior inspected snapshot.17 installed triggers; every handler exists in live source. Health check reports no missing Sheets or configuration capabilities. Its ready=true covers infrastructure only, not complete operational acceptance.

Read actual active workbook metadata, Overview, current operator row samples and TM Audit rows3900–4279 (380 rows, timestamps Oct21 16:28 through Oct23 14:48). Audit outcomes below are recorded source evidence, not a new independent Striven readback or proof of post-reinstallation scheduled execution. Existing sample links and green checklist cells are not taken as full completion proof.

## Trigger inventory and schedule

Live inventory returned17: six Calendar update triggers, five operational daily triggers, three PreInspection daily triggers, one daily source refresh, one Install reminder and one hourly fallback. Schedule definitions were inspected in unchanged live source; Trigger API inventory alone does not expose configured clock times.

| Vertical | Native schedule participation | Readiness |
|---|---|---|
| Install | One Calendar watcher; shared08:30/11:30/13:30/15:30/17:30 operations; hourly fallback;11:00 reminder | NOT READY for full automatic actions. General Stage7 execution is gated, and reminder returns gated. Approved SO prerequisite must be correctly enforced. |
| Delivery | One Calendar watcher; shared five operations; hourly fallback | PARTIAL. Dedicated existing-Task worker enabled, but full-field and automatic Calendar-link acceptance not established. Approved SO prerequisite not discriminated by shared status helper. Current example operator rows are blocked by missing/wrong transaction-type anchor data. |
| Service | Three technician Calendar watchers; shared five operations; hourly fallback | PARTIAL. Existing native worker makes verified relationship patches; Location resolution remains open on observed cases. Service-only In Progress prerequisite not discriminated by shared status helper. |
| PreInspection | One CF Preinspects watcher;08:00/13:00/17:00 dedicated sweep; bounded continuation and hourly recovery | RUNNING WITH EXCEPTIONS. Real create/link/assignment audit evidence exists, but five pending-review events remained in latest completed sweep. SO optional. |

Shared source refresh near07:00. Clock schedules approximate; timezone America/Toronto. No independent Stephen mirror intake trigger. Dedicated PreInspection schedule policy causes Calendar events to refresh views rather than bypass08/13/17 processing windows.

## Actual runtime findings

- Oct23 Service native audit records three unique Task relationship transactions at09:53,10:55,12:59. Each is PARTIAL_PATCH_VERIFIED with ORDER and REQUESTED_BY, writes1 and readbackVerified=true. All retain LOCATION_EXPECTED_ID_UNRESOLVED. TASK_FIRST_AUTO and TASK_FIRST_RELATIONSHIP_PATCH are two audit entries for the same transaction, not six writes.
- Delivery at08:32: TASK_FIRST_AUTO REVIEW, ORDER_NOT_VERIFIED_ACTIVE. No successful Delivery business write appears in the inspected Oct23 audit slice. This is not proof no write ever occurred outside that slice.
- PreInspection at13:50 and14:28: two CREATE_TASK PASS records, with Calendar link verification, Pool8 assignment and recorded required-copy business parity.
- PreInspection14:29: eligible18, attempted18, remaining0, pendingReview5; sweep status SCANNED_WITH_PENDING_REVIEW. Outer batch COMPLETE is not full-sweep completion. Earlier attention includes Step5 not run; matching/identity/lifecycle review remains necessary.
- Shared13:32 scheduled and13:53 fallback entries prove mapping-path activity today; taskWritesPerformed=false, calendarWritesPerformed=false and reconciliationPerformed=false in those mapping results.
- API budget at14:57: count491, soft limit1200, PreInspection reservation200, remaining509 reported for ordinary scope, exhausted=false. Do not compute1200-491=709 and describe all709 as ordinary availability.

## Critical readiness gaps

1. Correct required SO statuses are Service=In Progress, Install/Delivery=Approved, PreInspection SO optional. Existing tmv3_taskFirstFreshOrderOwnershipById_ accepts Approved OR In Progress without a vertical parameter. Isolated execution of the exact inspected helper with synthetic fresh Order responses accepted both statuses and rejected Canceled. This validates the policy gap, not production data correctness.
2. General automatic Stage7 and automatic Calendar-link writers remain gated. Dedicated PreInspection and existing Service/Delivery permissions are independent; their policy predicates require global automationWritesEnabled=false. Blindly enabling global AUTO can disable those lanes.
3. Scheduled Install reminder is installed but returns CALENDAR_STAGE_GATED at stage<=7.
4. Service/Delivery routine throughput remains one shared candidate per60 minutes; complete fixed-backlog repair does not prove routine capacity or full-field convergence.
5. Overview is stale: it displays3.11.81 and says PreInspection writes are gated / notifications TEST_ONLY, conflicting with actual3.11.97 config and audit. Do not use Overview as a readiness source until corrected.
6. Infrastructure health ready=true is narrower than business readiness. Successful CREATE/STEP7 audit evidence does not certify every event, all notification scenarios, or current live Striven state.

Priority: vertical-specific status gate and tests; scoped Install/general execution and reminder/link completion; Service/Delivery unresolved Location/anchor cases and full-field acceptance; five PreInspection reviews; operator status/version synchronization. Preserve fresh identity/ownership, lifecycle/duplicate, API budget, uncertain-write reconciliation and readback guards.

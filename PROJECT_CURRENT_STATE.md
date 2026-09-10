# Task Mapping — Current State

**Last updated:** 2026-09-10

## Project

Classic Fireplace Task Mapping — Install, Delivery, Service, and PreInspection.

## Production Apps Script

- Script ID: `1E86mhD2dZcOFpqWnCvoIpwEkwZ0MA63MgM8DifV6WyB2FvVQkRWKIZ_m`
- Recent clasp execution evidence shows the live project contains **36 files**.
- Latest source release for which remote Apps Script read-back was explicitly recorded in available evidence: **PreInspect R3.4.20a**.
- R3.4.20a changed only `35_PreInspect_Task_Review.js`.
- R3.4.20a file-35 hash changed from `0410ad7b8f2c13d40a0a957540781b48093ea04a4b49a7fcd8b5ba07297c6828` to `0ce224f2dce9ddabe087caced541628294737070f5d85d436473f752e9848e81`.
- Apps Script POST read-back for that release reported remote source equal to WORK byte-for-byte.

## GitHub state

- Repository: `consultpramodh/classicfireplace`
- Branch: `task_mapping`
- Repository visibility: **public**.
- A dated safety branch exists: `task-mapping-full-backup-20260909`.
- The R3.4.20a package created a local Git commit containing 36 Apps Script files plus execution records, but its `git push` failed because password authentication was attempted. Therefore that local commit **never became a GitHub backup**.
- Current GitHub source parity with production is **NOT VERIFIED**.
- Do not populate `apps-script/` from the August `Code Audit Source`/snapshot and call it current; it predates the live PreInspect files and is incomplete for current production.

## Current PreInspection operating design

Agreed simplified flow:

`Calendar identifiers → Resolve Customer/Location/Contact → Find or create one OPEN PreInspect task → Sync authoritative task fields → Verify → Append task link to Calendar → Technician completes task → final SO attached → find Install event/task by exact SO and same customer → append PreInspection link below Install task link.`

The Calendar identifier resolver starts from one or more of:

- Customer Number;
- Sales Order Number;
- Customer Phone Number;
- Customer Address.

All branches must converge to one verified customer package. If the customer is verified but the Calendar event itself lacks the Customer Number, the intended design is a non-blocking email to the event organizer requesting that the Customer Number be added.

## API/report refresh finding — 2026-09-10

The current Task Mapping source snapshot contains **overlapping scheduled report-refresh layers**:

- five live operational slots at approximately 8:30 AM, 11:30 AM, 1:30 PM, 3:30 PM, and 5:30 PM;
- six additional Refresh/Rebuild + Calendar Link slots at approximately 8:00 AM, 10:00 AM, 12:00 PM, 2:00 PM, 4:00 PM, and 6:00 PM.

At current task/work-order dataset sizes, the live operational slots perform about **40 small-report GETs/day**, while the six extra refresh/rebuild slots add about **24 substantially duplicate report GETs/day**. This is approximately **64 scheduled operational report GETs/day before daily big-data refreshes and row-specific API calls**.

`runDailyBigDataRefresh()` is already guarded to skip when the big datasets were refreshed earlier the same day. Keep that daily guard.

The Striven Central Data Hub `REFRESH_CONTROL` is currently disabled and therefore is not adding a recurring second refresh system. Manual hub evidence shows that large reports can be expensive: Items returned 19,031 rows using 40 API calls and Locations returned 30,178 rows using 61 API calls.

Recommended minimal correction: keep the five operational slots and the once-daily big-data refresh, but stop the six Calendar Link slots from unconditionally re-fetching all operational Striven reports. Those slots should use existing fresh mapping data, or at most rebuild locally without report GETs. See `docs/API_REFRESH_POLICY.md`.

**Status: REVIEWED / NOT YET DEPLOYED.** Do not claim API reduction until the exact current trigger inventory/live 36-file source is captured, the minimal patch is deployed, and post-change API usage is measured.

## Known working/proven areas

Available execution evidence has demonstrated substantial portions of the PreInspect flow, including customer/task matching, new-task creation, Requested By contact writes, Pool 8 assignment, no-Sales-Order creation behavior, task read-back, and Calendar task-link writes.

## Known gaps / risks

1. **GitHub source parity:** current 36-file production source is not present on GitHub.
2. **Scheduler safety:** on 2026-09-09 the targeted `testPreinspectR3420aTask18241ScheduleGate` returned `pass:false` / `BLOCK`, but the PreInspect auto flag was subsequently enabled. Treat unattended PreInspect mutation as not fully verified until corrected.
3. **API/report cadence:** six 2-hour refresh/rebuild slots duplicate report pulls already performed by five operational slots; reduction is recommended but not yet deployed.
4. **Field 854:** historical runtime evidence showed read-back mismatches; final reliable end-to-end behavior remains to be proven after simplification.
5. **New-location creation:** existing-location reuse is proven; the corrected new-location payload path still needs one controlled successful create/read-back proof.
6. **DONE → Install Calendar handoff:** design is agreed and a read-only positive/negative matching dry run was performed, but the actual Calendar mutation has not been implemented or runtime-tested.
7. **DONE → Sales Order Internal Notes:** prior implementation remains preview/read-only; production handoff write is not verified.
8. **Missing Customer Number organizer email:** agreed requirement; not yet implemented.

## Current active objective

Reduce unnecessary report/API refreshes without losing operational freshness, then continue simplifying and stabilizing the PreInspection lifecycle around one deterministic reconciliation path.

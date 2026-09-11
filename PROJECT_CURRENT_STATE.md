# Task Mapping — Current State

**Last updated:** 2026-09-11

## Project

Classic Fireplace Task Mapping — Install, Delivery, Service, and PreInspection.

## Production Apps Script

- Script ID: `1E86mhD2dZcOFpqWnCvoIpwEkwZ0MA63MgM8DifV6WyB2FvVQkRWKIZ_m`
- Recent clasp execution evidence shows the live project contains **36 files**.
- Latest source release for which remote Apps Script read-back was explicitly recorded in available evidence: **PreInspect R3.4.20a**.
- R3.4.20a changed only `35_PreInspect_Task_Review.js`.
- Apps Script POST read-back for that release reported remote source equal to WORK byte-for-byte.

## GitHub state

- Repository: `consultpramodh/classicfireplace`
- Branch: `task_mapping`
- Repository visibility: **public**.
- A dated safety branch exists: `task-mapping-full-backup-20260909`.
- Current GitHub source parity with production is **NOT VERIFIED** because the exact current 36-file source is not yet present under `apps-script/`.
- GitHub is the project ledger and all ChatGPT-assisted source syncs must use the connected GitHub integration, never local password/PAT pushes.

## PreInspection Requested By rule — approved 2026-09-11

The previous customer-contact Requested By behavior is superseded **for PreInspection only**.

New rule:

`Google Calendar organizer email → exact Striven Employee → RequestedBy { Id: EmployeeId, Type: employee }`

- Customer contacts remain available for customer/contact resolution, but they are not PreInspection Requested By.
- Missing organizer, zero employee matches, or multiple employee matches must REVIEW/fail closed.
- No customer-contact fallback.
- New PreInspection creation and existing OPEN PreInspection reconciliation must both use this organizer-employee rule.
- Install, Delivery, and Service Requested By logic is unchanged.

GitHub now contains:

- `docs/PREINSPECTION_REQUESTED_BY_POLICY.md` — canonical requirement;
- `tools/patch-preinspect-requestedby-organizer.js` — fail-closed source patcher;
- `tools/deploy-preinspect-requestedby-organizer.ps1` — fresh pull → patch → syntax check → freshness pull → clasp push → POST read-back → package procedure.

**Deployment status:** PATCH PACKAGE READY / NOT YET EXECUTED AGAINST LIVE APPS SCRIPT. Do not claim production behavior changed until the deployment utility completes and a real PreInspect row verifies the organizer Employee on read-back.

## Current PreInspection operating design

Agreed simplified flow:

`Calendar identifiers + organizer → Resolve Customer/Location/Contact → Resolve organizer Employee → Find or create one OPEN PreInspect task → Sync authoritative task fields → Verify → Append task link to Calendar → Technician completes task → final SO attached → find Install event/task by exact SO and same customer → append PreInspection link below Install task link.`

The Calendar customer resolver starts from one or more of Customer Number, Sales Order Number, Customer Phone Number, and Customer Address. The Calendar organizer is a separate authoritative input for Requested By / sales-rep ownership.

If the customer is verified but the Calendar event lacks the Customer Number, the intended design remains a non-blocking email to the event organizer requesting that the Customer Number be added.

## API/report refresh finding — 2026-09-10

The current Task Mapping source snapshot contains overlapping scheduled report-refresh layers:

- five live operational slots at approximately 8:30 AM, 11:30 AM, 1:30 PM, 3:30 PM, and 5:30 PM;
- six additional Refresh/Rebuild + Calendar Link slots at approximately 8:00 AM, 10:00 AM, 12:00 PM, 2:00 PM, 4:00 PM, and 6:00 PM.

At current task/work-order dataset sizes, the live operational slots perform about **40 small-report GETs/day**, while the six extra refresh/rebuild slots add about **24 substantially duplicate report GETs/day**. This is approximately **64 scheduled operational report GETs/day before daily big-data refreshes and row-specific API calls**.

Recommended minimal correction: keep the five operational slots and once-daily big-data refresh, but stop the six Calendar Link slots from unconditionally re-fetching operational Striven reports. See `docs/API_REFRESH_POLICY.md`.

**API-cadence status: REVIEWED / NOT YET DEPLOYED.**

## Known working/proven areas

Available execution evidence has demonstrated substantial portions of the PreInspect flow, including customer/task matching, new-task creation, historical customer-contact Requested By writes, Pool 8 assignment, no-Sales-Order creation behavior, task read-back, and Calendar task-link writes.

## Known gaps / risks

1. **GitHub source parity:** current 36-file production source is not present on GitHub.
2. **Requested By migration:** organizer→Employee patch is packaged but not yet live/runtime-verified.
3. **Scheduler safety:** the targeted Task 18241 schedule gate previously returned `pass:false` / `BLOCK`, but PreInspect auto was subsequently enabled.
4. **API/report cadence:** six 2-hour refresh/rebuild slots duplicate report pulls already performed by five operational slots; reduction is recommended but not yet deployed.
5. **Field 854:** historical runtime evidence showed read-back mismatches; final reliable end-to-end behavior remains to be proven after simplification.
6. **New-location creation:** corrected new-location payload still needs one controlled successful create/read-back proof.
7. **DONE → Install Calendar handoff:** design and dry-run matching are complete; actual Calendar mutation is not implemented/runtime-tested.
8. **DONE → Sales Order Internal Notes:** prior implementation remains preview/read-only.
9. **Missing Customer Number organizer email:** agreed requirement; not yet implemented.

## Current active objective

Deploy and verify the PreInspection-only Requested By change to Calendar organizer → Striven Employee, archive the verified POST source to GitHub, then continue the API-cadence and PreInspection simplification work.

# Task Mapping — Current State

**Last updated:** 2026-09-11

## Project

Classic Fireplace Task Mapping — Install, Delivery, Service, and PreInspection.

## Production Apps Script

- Script ID: `1E86mhD2dZcOFpqWnCvoIpwEkwZ0MA63MgM8DifV6WyB2FvVQkRWKIZ_m`
- Live project contains **36 files**.
- Latest source release explicitly pushed and POST-read-back verified: **PreInspect R3.4.21c**.
- R3.4.21c changed only:
  - `35_PreInspect_Task_Review.js`
  - `36_PreInspect_Task_Create.js`
- Full 36-file POST source matched the intended WORK source after push.
- Runtime business verification of organizer → Employee Requested By is still pending on one real PreInspection row.

### R3.4.21c verified hashes

- `35_PreInspect_Task_Review.js`
  - PRE: `0ce224f2dce9ddabe087caced541628294737070f5d85d436473f752e9848e81`
  - POST: `ace973c125a621744af388630c7596a72a8951b0cce89324b9ab6c6bdbf8b464`
- `36_PreInspect_Task_Create.js`
  - PRE: `e5d93757a99eb7f6880de30a8721a3b3e99f8ae6b47f69f482be54e20a055a0f`
  - POST: `2dd95a1f2e664ecb8adcc5377be166d27200362f42f115f21c3307f12c45aff0`

## GitHub state

- Repository: `consultpramodh/classicfireplace`
- Branch: `task_mapping`
- Repository visibility: **public**.
- GitHub is the project ledger and ChatGPT-assisted source syncs use the connected GitHub integration, never local password/PAT pushes.
- R3.4.21c deployment evidence is recorded in `executions/2026-09-11-r3.4.21c-deployed.json` and `executions/latest.json`.
- Exact production-source parity under `apps-script/` is still **PENDING** because the verified POST ZIP remains on the local PC and has not yet been uploaded into this conversation for source archival.

## PreInspection Requested By rule — LIVE SOURCE DEPLOYED

The previous customer-contact Requested By behavior is superseded **for PreInspection only**.

New rule:

`Google Calendar organizer email → exact Striven Employee → RequestedBy { Id: EmployeeId, Type: employee }`

- Customer contacts remain available for customer/contact resolution, but are not PreInspection Requested By.
- Missing organizer, zero employee matches, or multiple employee matches must REVIEW / NO WRITE.
- No customer-contact fallback.
- New PreInspection creation and existing OPEN PreInspection reconciliation both use this organizer-employee rule.
- Install, Delivery, and Service Requested By logic is unchanged.

**Source deployment status:** `DEPLOYED_SOURCE_VERIFIED`.

**Runtime behavior status:** `PENDING_REAL_PREINSPECT_ROW`.

## Current PreInspection operating design

`Calendar identifiers + organizer → Resolve Customer/Location/Contact → Resolve organizer Employee → Find or create one OPEN PreInspect task → Sync authoritative task fields → Verify → Append task link to Calendar → Technician completes task → final SO attached → find Install event/task by exact SO and same customer → append PreInspection link below Install task link.`

The Calendar customer resolver starts from one or more of Customer Number, Sales Order Number, Customer Phone Number, and Customer Address. The Calendar organizer is a separate authoritative input for Requested By / sales-rep ownership.

If the customer is verified but the Calendar event lacks the Customer Number, the intended design remains a non-blocking email to the event organizer requesting that the Customer Number be added.

## API/report refresh finding

The current Task Mapping source contains overlapping scheduled report-refresh layers:

- five live operational slots at approximately 8:30 AM, 11:30 AM, 1:30 PM, 3:30 PM, and 5:30 PM;
- six additional Refresh/Rebuild + Calendar Link slots at approximately 8:00 AM, 10:00 AM, 12:00 PM, 2:00 PM, 4:00 PM, and 6:00 PM.

At current task/work-order dataset sizes, the live operational slots perform about **40 small-report GETs/day**, while the six extra refresh/rebuild slots add about **24 substantially duplicate report GETs/day**.

Recommended minimal correction remains: keep the five operational slots and once-daily big-data refresh, but stop the six Calendar Link slots from unconditionally re-fetching operational Striven reports. See `docs/API_REFRESH_POLICY.md`.

**API-cadence status:** REVIEWED / NOT YET DEPLOYED.

## Known gaps / risks

1. **Runtime Requested By proof:** run one real PreInspection and confirm task read-back shows the organizer's Striven Employee.
2. **GitHub source parity:** upload the verified R3.4.21c POST ZIP so the exact 36-file production source can be archived.
3. **Scheduler safety:** the targeted Task 18241 schedule gate previously returned `pass:false` / `BLOCK`, but PreInspect auto was subsequently enabled.
4. **API/report cadence:** six 2-hour refresh/rebuild slots duplicate report pulls already performed by five operational slots; reduction is recommended but not yet deployed.
5. **Field 854:** historical runtime evidence showed read-back mismatches; final reliable end-to-end behavior remains to be proven after simplification.
6. **New-location creation:** corrected new-location payload still needs one controlled successful create/read-back proof.
7. **DONE → Install Calendar handoff:** design and dry-run matching are complete; actual Calendar mutation is not implemented/runtime-tested.
8. **DONE → Sales Order Internal Notes:** prior implementation remains preview/read-only.
9. **Missing Customer Number organizer email:** agreed requirement; not yet implemented.

## Current active objective

Runtime-verify R3.4.21c on one real PreInspection row, archive the verified POST source to GitHub, then continue the API-cadence and PreInspection simplification work.

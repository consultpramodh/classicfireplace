# Task Mapping — Current State

**Last updated:** 2026-09-11 (America/Toronto)

## Project

Classic Fireplace Task Mapping — Install, Delivery, Service, and PreInspection.

`task_mapping` is the single canonical GitHub project branch for current state, architecture, process contracts, execution history, and future source archival.

## Production Apps Script

- Script ID: `1E86mhD2dZcOFpqWnCvoIpwEkwZ0MA63MgM8DifV6WyB2FvVQkRWKIZ_m`
- Live project contains **36 files**.
- Latest recorded source release: **R3.4.22 — R30 Requested By Router Fix**.
- R3.4.22 changed only `35_PreInspect_Task_Review.js` from the immediately preceding release.
- Source deployment status: **DEPLOYED_SOURCE_VERIFIED**.
- Source verification recorded: pre-pull 36 files, post-pull 36 files, freshness guard PASS, syntax check PASS, POST SHA read-back PASS.

## R3.4.22 runtime verification

The actual production R30 Requested By route has been verified live for all three linked PreInspection tasks on 2026-09-11:

- Task 18379 → organizer `spencer@classicfireplace.ca` → Striven Employee 20.
- Task 18241 → organizer `warren@classicfireplace.ca` → Striven Employee 54.
- Task 18362 → organizer `adam@classicfireplace.ca` → Striven Employee 31.

All three writes used `CALENDAR_ORGANIZER_EMAIL_EXACT_EMPLOYEE`, and final Striven read-back returned `RequestedBy.Type=employee` with PASS.

The final read-only audit recorded:

- Calendar events: 7
- Existing linked PreInspection tasks: 3
- PASS: 3
- FAIL: 0
- REVIEW: 0
- Events without existing task: 4

The next normal scheduled PreInspection batch still needs a follow-up read-only audit to close the historical scheduler-regression proof completely.

## Authoritative PreInspection Requested By rule

This rule applies only to PreInspection Task Type 105:

`Google Calendar organizer email → exactly one Striven Employee → RequestedBy { Id: EmployeeId, Type: employee }`

Guardrails:

- organizer missing → REVIEW / no Requested By write;
- zero employee matches → REVIEW;
- multiple employee matches → REVIEW;
- no customer-contact fallback;
- customer Contact may still support customer/contact resolution but is not PreInspection Requested By;
- Install, Delivery, and Service Requested By behavior remains unchanged.

## GitHub/source parity

- Repository: `consultpramodh/classicfireplace`
- Canonical branch: `task_mapping`
- Repository visibility: **public**.
- Exact current 36-file production source is **not yet archived under `apps-script/`**.
- `executions/latest.json` still records `githubSourceParity = PENDING_POST_ZIP_UPLOAD`.

This means the repository is authoritative for project state, contracts, deployment evidence, and architecture, but **must not yet be described as exact production-source parity**.

The older August source snapshot is historical only and must not be promoted as current.

## Reorganization status

The repository reorganization has started inside `task_mapping` without modifying production Apps Script.

Canonical architecture material now lives under `docs/architecture/`:

- `README.md` — architecture index and migration status;
- `REORGANIZATION_PLAN.md` — staged ownership/migration plan;
- `PROCESS_CONTRACT_MATRIX.md` — Install, Delivery, Service, PreInspection, Report/Cache, Scheduler, Calendar and verification contracts;
- `GAP_REGISTER.md` — prioritized failure modes and unresolved proof gaps.

A frozen pre-reorganization ledger baseline is stored under `history/pre-reorg/2026-09-11/`.

### Target pipeline

`SOURCE → NORMALIZE → RESOLVE → MATCH → CLASSIFY → PLAN → EXECUTE → VERIFY → LINK/HANDOFF → ENDPOINT`

The target is a compatibility-preserving strangler migration, not a rewrite.

## Highest-priority known gaps / risks

1. **Exact live-source archive still missing from GitHub.** No physical code reorganization should begin until the current 36-file source is captured and screened.
2. **Recovery relationship integrity.** CREATE/RECREATE planning must prove SO→Customer, Location→Customer, Contact→Customer and other required ownership relationships before mutation; prior runtime failures reached Striven with invalid Contact/Location relationships.
3. **Report cache safety.** Unexpected/empty report shapes must not wipe last-known-good report data; report schema and pagination termination need explicit verification.
4. **Service multi-fireplace Calendar links.** Event-level task-set aggregation must be proven so FP#1/FP#2 links cannot overwrite one another.
5. **Calendar link repair.** Link repair should depend on exact event/task relationship, not blindly on task OPEN status; writes need Calendar read-back verification.
6. **Scheduler ownership.** Five operational slots and six refresh/rebuild+link slots create duplicate API load and race surface; one scheduler/freshness owner is needed.
7. **Deferred recovery semantics.** Wait-until-later cases such as completed-today replacement must be explicit `DEFERRED_RETRY`, not generic SKIP.
8. **PreInspection lifecycle completion.** DONE → final SO → exact Install match → verified PreInspection link handoff is not yet a fully runtime-proven production endpoint.
9. **Field 854 proof.** Historical read-back mismatch remains unresolved unless later authoritative evidence is produced.
10. **New-location creation.** Corrected create payload still needs one controlled successful create/read-back proof.
11. **Missing Customer Number organizer notification.** Agreed non-blocking deduplicated email remains to be implemented/proven.
12. **DONE → Sales Order Internal Notes.** Remains a separate guarded downstream handoff and is not production-complete.

## API/report refresh finding

Current scheduling contains overlapping refresh layers:

- five live operational slots around 8:30, 11:30, 1:30, 3:30 and 5:30;
- six Refresh/Rebuild + Calendar Link slots around 8:00, 10:00, 12:00, 2:00, 4:00 and 6:00.

Prior analysis estimated roughly 40 small operational report GETs/day from the main slots plus roughly 24 substantially duplicate GETs/day from the six additional refresh slots, before daily big-data and record-specific calls.

Recommended direction remains: retain operational cadence initially, introduce report freshness/TTL, and stop link-only activity from blindly re-fetching reports already inside approved freshness windows.

**API-cadence status:** REVIEWED / NOT YET DEPLOYED.

## Current active objective

1. Capture and screen the exact current 36-file production Apps Script source.
2. Archive it safely under `apps-script/` and prove GitHub read-back parity.
3. Build the complete file/function/caller/trigger/sheet/API/write inventory.
4. Classify functions as CANONICAL / ADAPTER / LEGACY-USED / LEGACY-UNUSED / UNKNOWN.
5. Only then begin physical source reorganization, starting with scheduler/report-cache safety and relationship-resolution integrity.

# Task Mapping — API Refresh Policy

**Reviewed:** 2026-09-10

## Goal

Keep Task Mapping operationally fresh without consuming unnecessary Striven API/report calls.

## Current finding

The current scheduled design contains two overlapping refresh layers:

1. **Five live operational slots** around 8:30 AM, 11:30 AM, 1:30 PM, 3:30 PM, and 5:30 PM.
2. **Six Refresh/Rebuild + Calendar Link slots** around 8:00 AM, 10:00 AM, 12:00 PM, 2:00 PM, 4:00 PM, and 6:00 PM.

The six Refresh/Rebuild slots call `runAllDivisionsRefreshRebuildOnly()`. In the current source snapshot that resolves to the unified read-only refresh core and fetches:

- Install Tasks;
- Delivery Tasks;
- Service Tasks;
- Service Work Orders.

That is approximately **4 Striven report GETs per slot × 6 slots = 24 duplicate report GETs/day** at current dataset sizes.

The five live operational slots already refresh those same operational reports. At current dataset sizes they account for approximately **40 report GETs/day** because Install, Delivery, and Service re-fetch task reports after safe pushes.

Therefore the overlapping scheduled operational-report load is approximately **64 report GETs/day before daily big-data reports and before row-specific API reads/writes**.

## Big-data policy

`runDailyBigDataRefresh()` is appropriately guarded to run once per day unless explicitly forced. Keep this daily guard.

Large reference datasets must not be refreshed in every operational slot. Prefer the centralized hub/cached datasets once production cutover is verified.

Current Central Data Hub `REFRESH_CONTROL` rows are disabled, so the hub is not presently adding recurring refresh load. Observed manual hub pulls demonstrate why cadence matters: an Items refresh used 40 API calls for 19,031 rows, and a Locations refresh used 61 API calls for 30,178 rows.

## Recommended production schedule

1. Keep daily big-data refresh once per day.
2. Keep the five operational Task Mapping slots unless runtime evidence shows a lower cadence is sufficient.
3. **Do not perform a full Striven report refresh again in the six 2-hour Calendar Link slots.**
4. Calendar-link slots should use already-refreshed mapping data and perform only the idempotent Calendar-link work, or at most a local sheet rebuild that does not call Striven reports.
5. If a fresh report is required for a specific decision, use a per-report freshness TTL rather than unconditional refresh.

## Target guardrail

A scheduled function should not fetch a Striven report when a verified local copy is still inside its freshness window.

Suggested starting TTLs:

- Install/Delivery/Service task/work-order reports: **90–120 minutes** during business hours.
- Approved Sales Orders: **2–4 hours** unless a workflow requires fresher SO state.
- Customers / Locations / Contacts / Items: **once daily** by default.

TTL values should be adjusted from measured operational need, not guesswork.

## Implementation status

**REVIEWED / NOT YET DEPLOYED.**

Do not claim API reduction until the live 36-file Apps Script source is captured, the exact current trigger inventory is verified, the minimal trigger/refresh patch is deployed, and API-call counts are measured after deployment.

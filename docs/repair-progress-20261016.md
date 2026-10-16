# Four-vertical repair progress — 2026-10-16

This is a repair candidate, not a production completion record. Live Apps Script source and installed trigger access are unavailable. Do not merge/deploy this candidate until refreshed live-source parity, shared regression and the existing deployment procedure pass.

| ID | Issue | Status | Acceptance |
|---|---|---|---|
| API-01 | Tokens unnecessarily capped at 55 minutes | PATCHED / LOCAL TEST PASS / NOT DEPLOYED | Returned lifetime respected; bounded six-hour cache; no caching unknown/short expiry |
| API-02 | Authentication HTTP calls missing from run metrics | PATCHED / LOCAL TEST PASS / NOT DEPLOYED | Token calls counted after budget authorization, before dispatch |
| API-03 | Invalid daily counter can bypass quota comparison | PATCHED / LOCAL TEST PASS / NOT DEPLOYED | Invalid count/limit blocks without overwriting evidence |
| DEP-01 | Partial failed push may bypass rollback | PATCHED / LOCAL TEST PASS / NOT DEPLOYED | Failure restores PRE; remote readback matches complete PRE source; otherwise explicit failure |
| API-04 | Shared counter read/increment/write is not atomic | INVESTIGATING / NOT PATCHED | Verify safe lock reuse under existing pipeline locks; concurrency cannot undercount |
| DEP-02 | Current live HEAD versus repository parity unknown | ACCESS BLOCKED | Fresh source capture, exact inventory and hash comparison |
| TRG-01 | Installed triggers, owners and execution paths unverified | ACCESS BLOCKED | Read-only inventory and execution history; preserve valid existing triggers |
| PI-01 | Location POST rejected for missing Address object | SCHEMA VERIFICATION BLOCKED / NOT PATCHED | Verified API contract; duplicate/persistence reconciliation before retry |
| SRC-01 | Explicit Order/Customer anchors absent from cache | VERIFIED SYMPTOM / ROOT CAUSE PENDING | Prove authoritative presence, filter/pagination/freshness and safe scoped recovery |
| SRC-02 | Service anchor has Sales Order transaction type | VERIFIED BLOCK / CORRECTION PENDING | Find correct Work Order; retain transaction-type guard |
| EXE-01 | Ordinary Stage 7 route only refreshes Stage 6 | VERIFIED / REPAIR PENDING | Bounded canonical reconciliation, no parallel writer |
| FLD-01 | Dates, Location and assignments not covered by relationship-only lane | VERIFIED / REPAIR PENDING | Approved managed fields converge after Calendar match |
| LAT-01 | Per-event end-to-end latency not measured | DESIGN PENDING | Detected/resolved/write/readback timestamps; exact blocker and retry due time |
| UI-01 | Overview, Morning Ops and reconciliation plans stale | VERIFIED / REPAIR PENDING | Current observed stage, data freshness and persisted-field verification distinguished |
| E2E-01 | Four-vertical acceptance incomplete | PENDING PREREQUISITES | One eligible canary per vertical; fresh readback; unchanged rerun has zero mutations |

## Executed local validation

- Token/cache and authentication accounting: 20 tests.
- Daily-budget boundary/corruption handling: 10 scenarios.
- Deployment failure/rollback/readback: 7 simulated scenarios, fake clasp only.
- Existing core hardening: 185 cases across 13 suites.
- Existing PreInspection automation suite completed successfully, including timing, classification, trigger-slot and history/template checks.
- No real credentials, Striven requests or production mutations were used for these tests.

## Limits

- Existing V3 daily soft limit remains 1,200; other workflow usage is not certified by this project-local counter.
- Counter concurrency is unresolved; invalid-state validation does not make increments atomic.
- No arbitrary per-run cap was introduced: a naive cap can interrupt mandatory post-write verification. Reserve write/readback capacity before designing bounded transactions.
- No automatic retry was added for uncertain external writes.
- Business rules and general write flags remain unchanged.
- Production status remains unverified until live access and the deployment/readback gates pass.

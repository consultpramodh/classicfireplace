# Task Mapping Gap Register

This register captures the highest-risk failure modes and incomplete lifecycle endpoints identified during the September 2026 deep-dive audit.

It is not a substitute for runtime proof. Each item should eventually be tied to exact current source and a reproducible test case.

## Severity model

- **P0** — can cause incorrect external mutation, data loss, silent incompleteness, or duplicate/invalid task creation.
- **P1** — can strand work, misreport completion, create repeat/manual workload, or leave a required business handoff unfinished.
- **P2** — structural/scale risk that is not currently proven to be causing production harm but can become material.

---

## P0 — Recovery relationship integrity

### Risk

CREATE/RECREATE planning can pass when required IDs are present even though the IDs do not belong to one another.

### Proven failure examples

- Install recovery attempted a recreate using a Requested By Contact that did not belong to the resolved customer; Striven rejected the write.
- Delivery recovery attempted a create using a Location that did not belong to the resolved customer; Striven rejected the write.

### Required guardrail

Before execution, prove:

- Sales Order belongs to Customer;
- Location belongs to Customer;
- Contact belongs to Customer when used;
- Employee resolution is exact where required;
- task type/workflow/customer/location context is coherent;
- no qualifying OPEN task now exists.

### Endpoint requirement

Relationship-integrity failure => `REVIEW_REQUIRED` or `BLOCKED` before any external mutation.

---

## P0 — Report cache can confuse schema failure with legitimate zero rows

### Risk

A report response with an unexpected structure can be interpreted as an empty result and replace a valid last-known-good sheet/cache with `NoData`.

### Required guardrail

`FETCH -> SCHEMA_VALIDATE -> ROW_COUNT/PLAUSIBILITY -> CACHE_SWAP`

Unexpected response shape must result in:

`CACHE_REFRESH_FAILED_KEEP_LAST_GOOD`

A genuine zero-row report must be distinguishable from a parser/schema failure.

---

## P0 — Report pagination can silently truncate at configured max pages

### Risk

If the final allowed page is still full, the caller cannot safely assume the report ended naturally.

### Required guardrail

Reaching max-page limit while the final page indicates more data => `CACHE_TRUNCATION_BLOCKED` rather than success.

---

## P0 — Service multi-fireplace Calendar link aggregation

### Risk

One Service Calendar event may legitimately correspond to FP#1, FP#2, etc. A row-oriented link writer can overwrite a previous task's managed link when processing another row sharing the same Event ID.

### Required guardrail

Calendar write unit must be:

`Event ID + complete expected task-link set`

Aggregate all links before one write and read the description back afterward.

### Proof status

High-confidence architectural risk from historical source behavior; exact current R3.4.22 source still needs runtime/source confirmation.

---

## P0 — Calendar link stage can run after refresh/rebuild failure

### Risk

A wrapper that records refresh/rebuild failure but continues to the Calendar-link stage can mutate Calendar using stale or partially rebuilt mappings.

### Required guardrail

Calendar link writes require either:

- verified current refresh generation; or
- explicit proof that the previous mapping snapshot is still valid and within freshness policy.

Otherwise => `BLOCKED`.

---

## P0 — Material writes can be labeled complete without authoritative read-back

### Risk

Transport/API success may be treated as business completion even when resulting Striven or Calendar state was not verified.

### Required guardrail

Material write => authoritative read-back => expected-vs-actual comparison => endpoint.

No required read-back => cannot use `VERIFIED_COMPLETE`.

---

## P1 — Deferred work represented as generic SKIP

### Risk

Cases such as "completed today; retry replacement later" are future obligations, not terminal skips.

### Required state

Use `DEFERRED_RETRY` with:

- reason;
- retry condition/time;
- source task ID;
- Event ID;
- next eligible execution condition.

---

## P1 — PreInspection lifecycle has incomplete downstream endpoints

### Intended lifecycle

`ACTIVE VERIFIED -> DONE -> final SO -> exact same-customer Install match -> PreInspect link appended/verified -> optional guarded SO notes handoff -> lifecycle complete`

### Missing/unfinished branches

- DONE while final SO not yet available;
- zero Install matches now but one may appear later;
- multiple Install matches;
- Install link mutation/read-back;
- Sales Order Internal Notes downstream handoff.

### Required explicit states

- `DONE_AWAITING_FINAL_SO`
- `DONE_INSTALL_MATCH_PENDING`
- `DONE_INSTALL_MATCH_REVIEW`
- `INSTALL_LINK_PENDING`
- `INSTALL_LINK_VERIFIED`
- `SO_NOTES_PENDING` if/when mandatory
- `PREINSPECT_HANDOFF_COMPLETE`

---

## P1 — Calendar-link repair tied too tightly to task OPEN status

### Risk

If a valid task becomes DONE before its Calendar link is written/repaired, an OPEN-only link guard can make automatic repair impossible even though Calendar link mutation does not alter the Striven task.

### Required distinction

Task mutability and Calendar-link repair are different safety decisions.

Exact Event ID + exact Task ID + verified relationship may allow idempotent link repair for completed tasks.

---

## P1 — Delivery assignment failure can be underreported

### Risk

If assignment is required but the assignment helper/write is unavailable or fails, the parent row/workflow must not still report a complete push.

### Required endpoint

Required assignment failed/skipped => `PARTIAL_FAILURE`.

---

## P1 — Overlapping scheduler/report-refresh models

### Current condition

- five live operational slots;
- six additional Refresh/Rebuild + Calendar Link slots;
- daily big-data refresh.

### Risk

Duplicate API usage, stale/report race windows, repeated reconsideration, and ambiguous scheduler ownership.

### Required direction

One scheduler owner + explicit TTL/freshness policy + no unconditional report fetch for link-only work.

---

## P1 — Field 854 Install Notes proof gap

### Risk

Historical runtime evidence showed desired Field 854 content but null/mismatched authoritative read-back.

### Required proof

One controlled create/reconcile/read-back proving Calendar-authored notes exist in Field 854 and do not populate Task Description.

---

## P1 — New-location creation proof gap

### Risk

Historical test attempts failed on required address/country payload details.

### Required proof

One controlled same-customer new-location create with authoritative read-back, followed by task create/reconcile using the new Location ID.

---

## P1 — Missing Customer Number organizer notification not complete

### Requirement

If customer is uniquely resolved but Calendar lacks Customer Number:

- task workflow continues;
- organizer receives one deduplicated non-blocking notice;
- repeated scheduled runs do not repeatedly email the organizer.

### Status

Agreed requirement; implementation/runtime proof pending.

---

## P1 — Root project state became stale relative to execution ledger

### Risk

`PROJECT_CURRENT_STATE.md` and `PROJECT_CHECKPOINT.md` previously remained on R3.4.21c after `executions/latest.json` had advanced to R3.4.22 runtime PASS.

### Correction

Canonical root state/checkpoint must be updated whenever a verified release changes the production truth.

This repository reorganization corrects the current stale state and places architecture material inside `task_mapping`.

---

## P2 — Exact current source not archived in GitHub

This is operationally important enough to block broad refactoring even though it is not itself a production runtime failure.

### Current truth

- live Apps Script project: 36 files;
- R3.4.22 source deployment and POST read-back: verified;
- exact current POST source under `apps-script/`: missing;
- repository visibility: public.

### Required next step

Capture exact live source, screen for secrets/PII/private operational data, archive only safe source, then prove GitHub read-back parity.

Until then, do not perform broad physical source reorganization from historical snapshots.

---

## Gap-closure rule

A gap can be marked CLOSED only when the relevant evidence exists:

1. exact current source path identified;
2. guardrail implemented in the actual caller path;
3. syntax/static checks pass;
4. known-good and known-bad regression cases pass;
5. consequential writes are runtime-tested where appropriate;
6. required read-back proves final state;
7. project ledger/current-state/checkpoint are updated.

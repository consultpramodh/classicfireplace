# Task Mapping — Latest Checkpoint

**Checkpoint date:** 2026-10-01 (America/Toronto)

## Canonical branch

`task_mapping` is the single canonical Task Mapping branch.

## Active rewrite

- System: **Task Mapping V3**
- Source: `apps-script/tmv3-clean/`
- V3 version: `3.11.41-preinspection-bare-customer-number-r1`
- Hard-rule version: `2026-10-01-r3`
- Execution stage: `7`
- Bound Script ID: `1shaSL1CeNhR2-fr8H4x0fP2KUIjpOizLFyrNRAnGGXkCvERX4hZyJ5Gt`
- Mode: `SHADOW_READ_ONLY`
- Automation business writes: **disabled**

## Frozen PreInspection format

Canonical Calendar title:

`<Customer Number> - <Customer Name> - <Phone>`

Example:

`62689 - Sahand KASHI - (416) 953-7693`

Rules:

- no `C#`, `Cust#`, or `Customer #` prefix in new canonical output;
- legacy `C#` and `Cust#` remain readable only for backward compatibility;
- Stephen-sourced customer PreInspection appointments require managed title/links verified on both Stephen + CF Preinspects;
- Task Type = 105 — Pre Inspection;
- Task Description exactly blank at CREATE;
- no Sales Order attached at CREATE;
- no InfoCustomFields at CREATE;
- Pool 8 — Pre-Inspection Pool;
- Requested By = Calendar organizer/creator;
- Field 854 is not managed.

## Latest verified evidence

- source commit: `aea710a883fe0b0e0bb847856fd44a63a02fb706`
- deployment run: `36921160480` — **SUCCESS**
- live hardening regression: `36921281078` — **SUCCESS**
- bootstrap checkpoint: `36921498527` — **SUCCESS**
- canonical title regression: `62400 - John Smith - (416) 555-1212` — **PASS**
- legacy `C#` parser — **PASS**
- legacy `Cust#` parser — **PASS**
- hard-rule assertion — **PASS**
- Sahand title read-back on CF Preinspects and Stephen — **VERIFIED**

## Current safety state

- `SHADOW_READ_ONLY` remains active.
- No broad V3 production cutover has occurred.
- Internal release numbers may change for code/rollback purposes; the frozen visible format does not change unless the user explicitly changes the business rule.

## Next exact action

After the V3 daily Striven API budget resets, rerun the pending full Sep 30 PreInspection Step 7 read-only closure audit. Do not bypass the API budget guard.

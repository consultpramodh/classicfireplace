# Task Mapping — Latest Checkpoint

**Checkpoint date:** 2026-09-25 (America/Toronto)

## Canonical branch

`task_mapping` is the single canonical Task Mapping branch.

## Active rewrite

- System: **Task Mapping V3**
- Source: `apps-script/tmv3-clean/`
- V3 version: `3.11.9-assignee-title-only-r1`
- Execution stage: `7`
- Bound Script ID: `1shaSL1CeNhR2-fr8H4x0fP2KUIjpOizLFyrNRAnGGXkCvERX4hZyJ5Gt`
- Mode: `SHADOW_READ_ONLY`

## Latest verified checkpoint

**Task 18678 assignment false-positive: CLOSED**

The earlier `PATCH_ASSIGNMENTS` plan was caused by V3 reading narrative Calendar description text as assignee evidence.

The canonical Install / Delivery rule is now restored:

- assignment names are parsed from Calendar **title only**;
- description notes are ignored for assignment;
- Aiden remains ignored;
- short-token / phrase matching is bounded.

Fresh live Step 7 now returns `NO_CHANGE` for Task `18678`.

Verified fields:

- Customer: `MATCH`
- Order: `MATCH`
- Location: `MATCH`
- Requested By: `MATCH`
- Start: `MATCH`
- End: `MATCH`
- Assignment check: `N/A`
- Blocker: none
- Read status: `FRESH_TASK_GET`

No Striven mutation was executed.

Evidence:

- GitHub Actions run: `36183055729`
- artifact: `10885545480`
- evidence file: `test-evidence/2026-09-25-tmv3-title-only-assignee-verified.md`

## Read-only verification transport

The V3 verifier now reuses the Apps Script HEAD/test deployment through the authenticated `/dev` endpoint.

Verified outcome:

- no new versioned deployment required for read-only probes;
- previous `RESOURCE_EXHAUSTED` deployment path avoided;
- exact pre-run source restored;
- source-head hash parity verified.

## Current safety state

- `SHADOW_READ_ONLY` remains active.
- Automation business writes remain disabled.
- CREATE/RECREATE production use remains gated.
- No broad V3 cutover has occurred.

## Remaining release gates

1. Fresh Step-7 scan and deterministic CREATE candidate selection.
2. Exact CREATE transaction preview and approval.
3. Controlled CREATE canary + Striven read-back + Calendar backlink verification.
4. Controlled RECREATE canary under the same guarded procedure.
5. Final four-vertical regression.
6. Controlled production cutover.
7. Verify first scheduled production cycle.
8. Only then evaluate legacy retirement.

## Next exact action

**Run fresh read-only Step 7 and identify the safest `CREATE_TASK` candidate.**

Before any CREATE write, record:

- vertical and Event ID;
- customer/contact/location identity;
- required order/work-order relationship, if applicable;
- proposed Task type/name/dates/assignment;
- duplicate-task search result;
- durable-state duplicate guard result;
- Calendar backlink plan;
- exact expected read-back.

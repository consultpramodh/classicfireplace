# Task Mapping Architecture Index

This folder is the canonical architecture/reorganization area for the `task_mapping` branch.

## Read in this order

1. `PROCESS_CONTRACT_MATRIX.md` — exact business guardrails, endpoint states, retry behavior, and verification requirements for Install, Delivery, Service, PreInspection, report/cache, and scheduler/orchestration.
2. `GAP_REGISTER.md` — prioritized places where the current system can break or fail to reach a business endpoint.
3. `REORGANIZATION_PLAN.md` — staged migration from overlapping/legacy ownership to one canonical pipeline.

## Canonical pipeline

`SOURCE → NORMALIZE → RESOLVE → MATCH → CLASSIFY → PLAN → EXECUTE → VERIFY → LINK/HANDOFF → ENDPOINT`

## Current phase

### Phase 0 — Freeze and inventory: IN PROGRESS

Completed:

- pre-reorganization repository/ledger baseline recorded under `history/pre-reorg/2026-09-11/`;
- per-workflow process contracts captured;
- canonical endpoint model captured;
- highest-risk failure modes registered;
- current root state/checkpoint updated to R3.4.22.

Still required before physical source moves:

- capture exact current 36-file live Apps Script source;
- screen for secrets/PII/private data;
- archive safe source under `apps-script/`;
- prove GitHub read-back parity;
- build file/function/caller/trigger/sheet/API/write inventory;
- classify each function as CANONICAL / ADAPTER / LEGACY-USED / LEGACY-UNUSED / UNKNOWN.

## Safety boundary

No production Apps Script has been reorganized merely because this repository structure changed.

Until exact source parity and call-graph inventory exist:

- no broad file renames;
- no deletion of legacy functions/files;
- no genericization that erases division-specific guardrails;
- no mutation path may lose read-back verification;
- no uncertain CREATE may be blindly retried.

## Target ownership

The intended final ownership model is documented in `REORGANIZATION_PLAN.md`. The most important consolidation goals are:

- one relationship resolver;
- one task matcher;
- one planner;
- one Striven executor;
- one recovery engine using the same resolver/planner/executor;
- one Calendar-link/handoff service;
- one report cache/freshness layer;
- one scheduler;
- one verification/endpoint system;
- four workflow profiles preserving Install, Delivery, Service, and PreInspection-specific rules.

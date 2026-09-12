# Task Mapping Architecture Index

This folder is the canonical architecture/reorganization area for the Task Mapping project on the single canonical branch:

`task_mapping`

## Workflow scope

Architecture work applies to all four workflow domains:

- Install
- Delivery
- Service
- PreInspection

Workflow-specific rules are documented under `docs/workflows/`; shared architecture and acceptance rules live here.

## Read in this order

1. `PROCESS_CONTRACT_MATRIX.md` — business guardrails, endpoint states, retry behavior, and verification requirements for Install, Delivery, Service, PreInspection, report/cache, and scheduler/orchestration.
2. `GAP_REGISTER.md` — prioritized places where the current system can break or fail to reach a business endpoint.
3. `REORGANIZATION_PLAN.md` — staged project-wide migration from overlapping/legacy ownership to one canonical pipeline.
4. `../workflows/WORKFLOW_COVERAGE_MATRIX.md` — confirms equal workflow coverage and pending live-source inventory work.

## Canonical pipeline

`SOURCE → NORMALIZE → RESOLVE → MATCH → CLASSIFY → PLAN → EXECUTE → VERIFY → LINK/HANDOFF → ENDPOINT`

## Current phase

### Phase 0 — Freeze and inventory: IN PROGRESS

Completed:

- `task_mapping` restored as the single canonical project branch;
- project-wide repository rollback baseline recorded under `backups/2026-09-12/`;
- dedicated workflow documentation created for Install, Delivery, Service, and PreInspection;
- per-workflow process contracts captured;
- canonical endpoint model captured;
- highest-risk failure modes registered;
- root state/checkpoint updated to R3.4.22;
- CI now verifies all four workflow documentation domains.

Still required before physical source moves:

- capture exact current 36-file live Apps Script source;
- screen for secrets/PII/private data;
- archive safe source under `apps-script/`;
- prove GitHub read-back parity;
- build complete file/function/caller/trigger/sheet/API/write inventory across all four workflows and shared modules;
- map shared functions to the workflows that call them;
- classify each function as CANONICAL / ADAPTER / LEGACY-USED / LEGACY-UNUSED / UNKNOWN.

## Safety boundary

No production Apps Script has been reorganized merely because the repository structure changed.

Until exact source parity and call-graph inventory exist:

- no broad production file renames;
- no deletion of legacy production functions/files;
- no genericization that erases workflow-specific guardrails;
- no mutation path may lose read-back verification;
- no uncertain CREATE may be blindly retried;
- shared-module changes require regression consideration for every affected workflow.

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

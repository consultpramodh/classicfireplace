# Task Mapping — Project-Wide Reorganization Baseline

**Captured:** 2026-09-12 (America/Toronto)

## Scope

This baseline covers the **entire Task Mapping project**, not one workflow.

Included workflow domains:

1. Install
2. Delivery
3. Service
4. PreInspection

Included shared project areas:

- root project state/checkpoint/operating rules;
- shared architecture and process contracts;
- execution ledgers;
- deployment history;
- historical source evidence;
- operator tools;
- API/report policies;
- backup manifests;
- future `apps-script/` production-source archive area.

## Frozen repository point

- Canonical branch: `task_mapping`
- Repository commit before four-workflow documentation expansion: `4754c4011685cce3e7be0a13e86eb2798a7f2e92`
- Latest recorded production release at capture: `R3.4.22_R30_REQUESTED_BY_ROUTER_FIX`
- Known live Apps Script project size: 36 files
- Apps Script deployment/source status: `DEPLOYED_SOURCE_VERIFIED`
- Exact current GitHub Apps Script source parity: **PENDING**

## What this backup is

This is a durable GitHub repository/ledger rollback reference for the whole Task Mapping project before the workflow documentation structure is expanded and old documentation paths are cleaned up.

Because Git commits are immutable, the commit SHA above is the authoritative rollback point for the repository state captured here.

## What this backup is not

This is **not** a certified backup of the exact current 36-file live Apps Script source. The exact current source still needs to be captured from the bound Apps Script project, screened for secrets/PII/private operational values, archived safely under `apps-script/`, and read back from GitHub before source parity can be claimed.

## Workflow coverage requirement

No future repository reorganization is considered complete unless all four workflows are represented:

- `docs/workflows/install/`
- `docs/workflows/delivery/`
- `docs/workflows/service/`
- `docs/workflows/preinspection/`

Shared/common behavior belongs in `docs/architecture/` rather than being duplicated inconsistently across workflows.

## Preservation rule

Until exact live-source parity and a complete call/dependency inventory exist:

- preserve all existing production entrypoints;
- preserve Install, Delivery, Service, and PreInspection-specific guardrails;
- do not delete production functions/files merely because repository documentation has been reorganized;
- do not treat historical source snapshots as current production source.

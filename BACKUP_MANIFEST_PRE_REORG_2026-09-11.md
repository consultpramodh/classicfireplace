# Task Mapping Pre-Reorganization Backup Manifest

**Backup date:** 2026-09-11 (America/Toronto)

## Purpose

This branch freezes the Task Mapping project ledger immediately before architecture reorganization work begins.

## Frozen source-ledger point

- Source branch: `task_mapping`
- Source head at backup creation: `3732d857ec4683905e6bbc0123c0a71bde3e31b0`
- Latest recorded production release in the ledger: `R3.4.22_R30_REQUESTED_BY_ROUTER_FIX`
- Apps Script deployment status recorded in `executions/latest.json`: `DEPLOYED_SOURCE_VERIFIED`
- Requested By runtime verification recorded as PASS for the repaired PreInspection R30 route.

## Important limitation

This branch is an immutable **repository/ledger backup**, not yet a proven exact 36-file Apps Script source archive.

At backup creation time, the current repository `apps-script/` directory contains only its README. The latest execution ledger still records `githubSourceParity = PENDING_POST_ZIP_UPLOAD`.

Do not represent this branch as exact production-source parity until the exact current live POST/read-back Apps Script bundle is independently captured, screened for secrets/private data, archived, and read back from GitHub.

## Safety rule for reorganization

No reorganization work should be performed on this backup branch. New architecture work belongs on `reorg/task-mapping-architecture-20260911` or a later dedicated reorganization branch.

Production Apps Script must not be changed merely to make repository structure cleaner. Production changes remain subject to the project guarded deployment procedure: live pull, dependency review, smallest safe patch, targeted tests, freshness pull, push, POST read-back, runtime verification, and GitHub synchronization.

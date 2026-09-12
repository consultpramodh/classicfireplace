# Task Mapping — Workflow Coverage Matrix

This matrix ensures repository reorganization covers the entire Task Mapping project rather than over-documenting one workflow.

| Area | Install | Delivery | Service | PreInspection |
|---|---|---|---|---|
| Dedicated workflow folder | YES | YES | YES | YES |
| Matching/identity contract | YES | YES | YES | YES |
| Normal synchronization guardrails | YES | YES | YES | YES |
| Relationship-integrity rules | YES | YES | YES | YES |
| Recovery / create-recreate considerations | YES | YES | YES | YES |
| Calendar link contract | YES | YES | YES | YES |
| Assignment / Requested By rules | Install-specific relationship rules | Delivery employee/pool rules | Service technician/pool rules | Organizer→Employee rule |
| Endpoint semantics | YES | YES | YES | YES |
| Known gap/risk section | YES | YES | YES | YES |
| Exact live-source ownership inventory | PENDING | PENDING | PENDING | PENDING |
| Exact trigger/menu/caller graph | PENDING | PENDING | PENDING | PENDING |
| GitHub exact source parity | PENDING | PENDING | PENDING | PENDING |

## Shared project-wide layers

The four workflows also depend on shared systems that must be backed up and inventoried once, then mapped to each workflow's callers:

- configuration and shared utilities;
- Calendar source/normalization;
- Striven report/cache layer;
- customer/SO/location/contact/employee relationship resolution;
- task matching and mapping projection;
- task planning/execution/recovery;
- Calendar managed-link/handoff service;
- verification/read-back layer;
- scheduler/trigger ownership;
- diagnostics/connectivity audits;
- Striven API/report client primitives;
- execution ledger, deployment history, and rollback tooling.

## Completion rule for reorganization

A source-reorganization phase is not complete merely because one workflow works.

For every moved/shared module, regression verification must cover all affected workflow domains. If a common helper is used by Install, Delivery, Service, and PreInspection, acceptance requires evidence that all four contracts remain intact or an explicit statement that a workflow is unaffected and why.

## Current limitation

The exact current 36-file Apps Script source is still not archived in GitHub. Therefore the repository has project-wide workflow contracts, but the definitive file/function/caller/trigger ownership map remains pending until the exact live source is captured and screened.

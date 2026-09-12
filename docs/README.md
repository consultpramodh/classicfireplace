# Task Mapping Documentation

The `docs/` folder is organized by purpose so active design, policies, and workflow rules are easy to find.

## Structure

- `architecture/` — target architecture, process contracts, migration plan, and gap register.
- `policies/` — API cadence, versioning, release, and other cross-workflow operating policies.
- `workflows/` — dedicated documentation for **all four workflows**:
  - `workflows/install/`
  - `workflows/delivery/`
  - `workflows/service/`
  - `workflows/preinspection/`
- `workflows/WORKFLOW_COVERAGE_MATRIX.md` — confirms project-wide documentation/inventory coverage and identifies what is still pending from the exact live source.
- `REPOSITORY_STRUCTURE.md` — explains the single-branch repository organization and branch-retirement plan.

## Workflow rule

Install, Delivery, Service, and PreInspection are four equal workflow domains. Shared logic belongs in `architecture/`; workflow-specific rules belong in the corresponding `workflows/<workflow>/` folder.

No source-reorganization phase is complete if only one workflow has been inventoried or regression-checked when shared code can affect the others.

## Source-of-truth rule

Documentation never overrides current verified production source/data. When documents conflict, use the authority order in `PROJECT_OPERATING_RULES.md` and the latest verified execution ledger.

The exact current 36-file Apps Script source is still pending GitHub archival, so file/function/caller/trigger ownership remains provisional until that source is captured and screened.

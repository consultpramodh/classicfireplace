# Task Mapping Documentation

The `docs/` folder is organized by purpose so active design, policies, and workflow rules are easy to find.

## Structure

- `architecture/` — target architecture, process contracts, migration plan, and gap register.
- `policies/` — API cadence, versioning, release, and other cross-workflow operating policies.
- `workflows/preinspection/` — canonical PreInspection business flow and PreInspection-specific rules.
- `REPOSITORY_STRUCTURE.md` — explains the single-branch repository organization and branch-retirement plan.

## Source-of-truth rule

Documentation never overrides current verified production source/data. When documents conflict, use the authority order in `PROJECT_OPERATING_RULES.md` and the latest verified execution ledger.

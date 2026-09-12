# Task Mapping Workflows

This folder documents the four equal workflow domains in the Classic Fireplace Task Mapping project.

## Workflow domains

- `install/` — Install matching, normal synchronization, recovery, Calendar link, and endpoint rules.
- `delivery/` — Delivery matching, synchronization, assignment, Calendar link, and endpoint rules.
- `service/` — Service event/task-set matching, technician assignment, multi-fireplace handling, Calendar links, and endpoint rules.
- `preinspection/` — PreInspection customer resolution, Requested By, creation/reconciliation, technician field ownership, and downstream Install/SO handoffs.

## Shared contract

The authoritative cross-workflow acceptance contract is:

`docs/architecture/PROCESS_CONTRACT_MATRIX.md`

It defines common endpoint states, relationship-integrity rules, duplicate prevention, task mutability, verification, Calendar mutation policy, and per-workflow contracts.

## Evidence status

The workflow documents in this folder are repository contracts and current project knowledge. They do **not** substitute for the exact live 36-file Apps Script source.

Each workflow document must state when a rule is:

- **VERIFIED CURRENT** — directly supported by current runtime/release evidence;
- **PROJECT CONTRACT** — agreed behavior that refactoring must preserve;
- **HISTORICAL BASELINE — CURRENT SOURCE CONFIRMATION REQUIRED** — known from historical source/evidence but must be rechecked against the exact current 36-file source before code movement.

## Reorganization rule

Physical source reorganization must inventory all four workflows before any production file/function deletion or ownership move is accepted.

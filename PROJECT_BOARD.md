# Task Mapping & Field Operations — Project Board

Canonical tracker: issue #23

## Status model

`IDEA` → `GOOD TO HAVE` → `BACKLOG` → `PLANNED` → `IN PROGRESS` → `BLOCKED` → `TESTING / VERIFY` → `READY TO RELEASE` → `LIVE / MONITORING` → `DONE / ARCHIVED`

## Stable / live baseline

| Feature | Status |
|---|---|
| Legacy Install routing/workflow | LIVE / MONITORING |
| Legacy Delivery routing/workflow | LIVE / MONITORING |
| Legacy Service routing/workflow | LIVE / MONITORING |
| PreInspection workflow | LIVE / MONITORING |
| PreInspection Requested By = Calendar organizer / Striven employee | LIVE / MONITORING |
| Guarded GitHub AutoPatch deployment pipeline | LIVE / MONITORING |

## Active work items

| Issue | Feature | Status |
|---|---|---|
| #32 | TM2 shadow runtime verification | TESTING / VERIFY |
| #33 | Automated execution-log collection | IN PROGRESS |
| #34 | Complete legacy dependency inventory | PLANNED |
| #35 | Classify functions by migration role | PLANNED |
| #36 | Build TM2 behavior-equivalent resolvers/planners | PLANNED |
| #37 | Compare legacy vs TM2 outcomes for parity | BACKLOG |
| #38 | Controlled TM2 canary writes | BACKLOG |
| #39 | One-workflow-at-a-time TM2 cutover | BACKLOG |
| #40 | PreInspection completion → correct Sales Order handoff | BACKLOG |
| #41 | Clean up noncanonical branches | GOOD TO HAVE |
| #42 | Unified mapping-health observability dashboard | IDEA |

## Required migration sequence

`#32` → `#34` → `#35` → `#36` → `#37` → `#38` → `#39`

#33 supports the entire sequence by removing manual log collection. #40 is a separate PreInspection business enhancement and must preserve the rule that a PreInspection task does not require a Sales Order at creation.

## Current gate

Do not enable production TM2 writes or cutover routing until runtime verification and legacy-vs-TM2 parity are proven.
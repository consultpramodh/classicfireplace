# Task Mapping & Field Operations — Project Board

Canonical tracker: issue #23

## Status model

`IDEA` → `GOOD TO HAVE` → `BACKLOG` → `PLANNED` → `IN PROGRESS` → `BLOCKED` → `TESTING / VERIFY` → `READY TO RELEASE` → `LIVE / MONITORING` → `DONE / ARCHIVED`

## Features

| Feature | Status |
|---|---|
| Legacy Install routing/workflow | LIVE / MONITORING |
| Legacy Delivery routing/workflow | LIVE / MONITORING |
| Legacy Service routing/workflow | LIVE / MONITORING |
| PreInspection workflow | LIVE / MONITORING |
| PreInspection Requested By = Calendar organizer / Striven employee | LIVE / MONITORING |
| Guarded GitHub AutoPatch deployment pipeline | LIVE / MONITORING |
| TM2 shadow source deployment | TESTING / VERIFY |
| Automated TM2 runtime execution / evidence capture | IN PROGRESS |
| Automated execution-log collection | IN PROGRESS |
| Full legacy dependency inventory | PLANNED |
| Function classification | PLANNED |
| TM2 behavior-equivalent resolvers/planners | PLANNED |
| Legacy-vs-TM2 parity comparison | BACKLOG |
| Controlled canary writes | BACKLOG |
| One-workflow-at-a-time cutover | BACKLOG |
| PreInspection completion → Sales Order handoff/linkage | BACKLOG |
| Temporary/noncanonical branch cleanup | GOOD TO HAVE |
| Unified mapping-health observability dashboard | IDEA |

## Current gate

Do not cut over production routing until TM2 runtime verification and legacy-vs-TM2 parity are proven.
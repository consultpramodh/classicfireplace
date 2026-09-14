# Striven Data Hub & Analytics — Project Board

Canonical tracker: issue #25

## Status model

`IDEA` → `GOOD TO HAVE` → `BACKLOG` → `PLANNED` → `IN PROGRESS` → `BLOCKED` → `TESTING / VERIFY` → `READY TO RELEASE` → `LIVE / MONITORING` → `DONE / ARCHIVED`

## Stable / completed baseline

| Feature | Status |
|---|---|
| Standard Items central dataset / alias layer | LIVE / MONITORING |
| Manual guarded Items refresh | LIVE / MONITORING |
| Napoleon 2026 promotion audit history | DONE / ARCHIVED |

## Active project work

| Issue | Feature | Status |
|---|---|---|
| #46 | Inventory Striven report and API dependencies | IN PROGRESS |
| #47 | Standard Contacts canonical dataset/schema | IN PROGRESS |
| #48 | Analyze API call frequency and duplicate reads | IN PROGRESS |
| #49 | Define central Striven API usage governance | PLANNED |
| #50 | Detect duplicate and near-duplicate bulk reads | PLANNED |
| #51 | Migrate consumers to canonical Hub datasets | BACKLOG |
| #52 | Schedule automated refreshes after frequency validation | BACKLOG |
| #53 | Build canonical operational reconciliation datasets | BACKLOG |
| #54 | API health and call-budget dashboard | GOOD TO HAVE |
| #55 | Automatic source-dependency graph | IDEA |

## Required sequence

`#46 + #48` → `#49 + #50` → `#51` → `#52`

#47 is a parallel canonical-dataset build and must pass the same schema/alias discipline already proven for Items.

## Scope rule

The Hub owns reusable reads, schemas, caching, reconciliation and API-governance logic. Operational writes remain in the owning project.
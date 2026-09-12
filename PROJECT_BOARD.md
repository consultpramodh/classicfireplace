# Striven Data Hub & Analytics — Project Board

Canonical tracker: issue #25

## Status model

`IDEA` → `GOOD TO HAVE` → `BACKLOG` → `PLANNED` → `IN PROGRESS` → `BLOCKED` → `TESTING / VERIFY` → `READY TO RELEASE` → `LIVE / MONITORING` → `DONE / ARCHIVED`

## Features

| Feature | Status |
|---|---|
| Standard Items central dataset / alias layer | LIVE / MONITORING |
| Manual guarded Items refresh | LIVE / MONITORING |
| Inventory all Striven report/API dependencies | IN PROGRESS |
| Standard Contacts dataset/schema | IN PROGRESS |
| API call frequency / duplicate-read analysis | IN PROGRESS |
| Central API usage governance | PLANNED |
| Duplicate and near-duplicate bulk-read detection | PLANNED |
| Consumer migration to canonical datasets | BACKLOG |
| Automated refresh schedules after frequency validation | BACKLOG |
| Operational reconciliation datasets | BACKLOG |
| Napoleon 2026 promotion audit history | DONE / ARCHIVED |
| API-health / call-budget dashboard | GOOD TO HAVE |
| Automatic source-dependency graph | IDEA |

## Scope rule

The Hub owns reusable reads, schemas, caching, reconciliation and API-governance logic. Operational writes stay in the owning project.
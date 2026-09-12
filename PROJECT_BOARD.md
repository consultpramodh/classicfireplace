# Product, Inventory & Commerce Automation — Project Board

Canonical tracker: issue #26

## Status model

`IDEA` → `GOOD TO HAVE` → `BACKLOG` → `PLANNED` → `IN PROGRESS` → `BLOCKED` → `TESTING / VERIFY` → `READY TO RELEASE` → `LIVE / MONITORING` → `DONE / ARCHIVED`

## Features

| Feature | Status |
|---|---|
| ENTERNEWPART existing-item resolver | IN PROGRESS |
| ENTERNEWPART auth hardening / failure handling | IN PROGRESS |
| ENTERNEWPART logging consolidation | IN PROGRESS |
| AI-assisted product field enrichment | PLANNED |
| Vendor / manufacturer / category / serial-rule inference | PLANNED |
| Existing Item ID reuse regression tests | TESTING / VERIFY |
| Catalog and price-list import framework | BACKLOG |
| Traeger inventory feed | BACKLOG |
| Napoleon inventory/product feed | BACKLOG |
| Shopify → Striven Bridge queue/checkpoint workflow | BACKLOG |
| Product-master data quality checks | BACKLOG |
| Vendor-specific QA dashboard | GOOD TO HAVE |
| Shared cross-vendor product master | IDEA |

## Migration rule

This branch is the portfolio/codebase home. Do not alter existing live Apps Script projects merely to fit this structure. Bring each source in only after its exact Script ID, live source, dependencies and deployment state are verified.
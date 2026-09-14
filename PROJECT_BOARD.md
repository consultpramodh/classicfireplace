# Product, Inventory & Commerce Automation — Project Board

Canonical tracker: issue #26

## Status model

`IDEA` → `GOOD TO HAVE` → `BACKLOG` → `PLANNED` → `IN PROGRESS` → `BLOCKED` → `TESTING / VERIFY` → `READY TO RELEASE` → `LIVE / MONITORING` → `DONE / ARCHIVED`

## Active / verification work

| Issue | Feature | Status |
|---|---|---|
| #56 | ENTERNEWPART existing-item resolver | IN PROGRESS |
| #57 | ENTERNEWPART auth hardening and failure handling | IN PROGRESS |
| #58 | Consolidate ENTERNEWPART logging | IN PROGRESS |
| #59 | Existing Item ID reuse regression suite | TESTING / VERIFY |

## Planned enrichment

| Issue | Feature | Status |
|---|---|---|
| #60 | AI-assisted product field enrichment | PLANNED |
| #61 | Vendor/manufacturer/category/serial-rule inference | PLANNED |

## Backlog / expansion

| Issue | Feature | Status |
|---|---|---|
| #62 | Catalog and price-list import framework | BACKLOG |
| #63 | Traeger inventory feed | BACKLOG |
| #64 | Napoleon inventory and product feed | BACKLOG |
| #65 | Shopify to Striven Bridge queue/checkpoint workflow | BACKLOG |
| #66 | Product-master data quality checks | BACKLOG |
| #67 | Vendor-specific product QA dashboard | GOOD TO HAVE |
| #68 | Shared cross-vendor product master | IDEA |

## Required logic order

`#56 resolver correctness + #59 regression proof` before broader enrichment/import automation.

`#61 deterministic business rules` should constrain `#60 AI enrichment`, not the reverse.

## Migration rule

This branch is the portfolio/codebase home. Do not alter existing live Apps Script projects merely to fit this structure. Bring each source in only after its exact Script ID, live source, dependencies and deployment state are verified.
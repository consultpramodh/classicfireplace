# CF ServiceOps — Zero-Touch R1

Branch: `cf-service`

Target bound Apps Script Script ID: `1QZp4NAFeA8LmWBN31ylJYdK4XFepBX1h2lP_APaR-d1lTAC-d8LA9x3g`

This branch is the controlled release lane for the CF ServiceOps zero-touch refactor. The production source remains authoritative. Deployment must use the proven Task Mapping pattern:

`PRE full clasp pull → preserve rollback → patch WORK → syntax/static checks → FRESH pull and PRE parity → full clasp push --force → POST pull and WORK parity → targeted canary`

Zero-touch target:

`Intake → Customer → Location → Contact → Info Sync → History/Asset → Sales Order reconcile/create → authoritative verification → Task reconcile → durable Service Request state → Operator Queue hyperlinks → SCHEDULE SERVICE`

Safety invariants:

- never blindly retry an uncertain remote POST;
- never recreate a durable Customer/Contact/Location/Sales Order;
- preserve write journals/fingerprints and authoritative GET verification;
- `02 Service Requests` remains durable authority;
- technical latency/no-progress must retry or reconcile, not create false human review;
- successful Sales Order creation does not mark the request COMPLETED;
- actual Striven Sales Order status is preserved;
- queue projection must preserve Customer/Contact/Location/Sales Order/Task hyperlinks.

Initial R1 scope is deliberately narrow: transactional cache freshness, Sales Order item-policy defect, false same-state circuit breaker, and obsolete durable-Quoted manual-review normalization. Broader controller consolidation follows only after the R1 canary passes.

## Current updater status

The first downloaded PowerShell build stopped safely at step 1 because the wrapper used PowerShell's reserved automatic `$Args` variable for clasp argument forwarding. No pull, patch, or production push occurred. The updater on this branch now uses `ClaspArgs` explicitly and includes the full PRE/FRESH/POST verification flow.

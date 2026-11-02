# Pre-Inspection branch consolidation

The intended integration branch is `task-mapping-preinspection`. This merge retains its prior head `06db059f39627e8b84dc1c988eae20e26e9e77a8` and incorporates:

- `preinspection-call-reduction-jev-shadow` at `1f1adfaa14189706100b1fcba1b3a745eba415a5`: intake gating and sheet-refresh fairness changes, plus their focused tests.
- `fix/preinspection-targeted-lookup-20261027` at `151537b5ae3a92a41b8f31ad3c94d04442a0821b`: merged history; its targeted lookup is already present in the retained automation source. Conflicting historical backup snapshots were not substituted for newer copies.
- `future-features/preinspection-email-classification` at `10c353572e347123fb1fee02c12ad645cb9dd06b`: the prototype is retained under `future-features/`, parked and not connected to production.

The following branches remain unmerged and available for a separate feature-by-feature conflict review. They contain older, diverged code and release scaffolds which must not replace the current baseline without verification:

- `fix/tmv3-preinspection-full-eligible-sweep-20261021` at `fa0ddacbd11e728c18e3f0b3b4a66ac8d1196e9e`. This branch also contains the ancestry of `fix/preinspection-shared-number-evidence-20261020`, `task_mapping_preinspection_live_20261019`, `task_mapping_fix_preinspect_create_title_context_20260930`, and `checkpoint/tmv3-pre-preinspection-guest-sync-20260930`.
- `fix/tmv3-preinspection-eligible-runner-20261019` at `2d5e45891622f5a5422523f02f9d2b1f329a6027`.

This consolidation retains the current baseline and its limitations. It does not deploy Apps Script, change triggers, send mail, create tasks, resolve requested-by or assignment issues, or establish that all historical variants were functionally reconciled. A subsequent release must separately check current source, user decisions, regression coverage, backup and deployment requirements.

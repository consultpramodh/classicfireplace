# Task Mapping — Project Operating Rules

These are the operative rules for this branch, distilled from the authoritative Project Operating Constitution supplied for this project. They are intentionally concise so every new session can read them quickly.

## Objective

Optimize for **Time-to-Verified-Outcome**: correct, safe, verified execution with minimum rework.

## Source authority

When sources conflict, use this order:

1. current live production source;
2. current production data;
3. current connected-system/API response;
4. current configuration / Script Properties / environment;
5. current production deployment state;
6. current schema;
7. verified project documentation;
8. recent execution logs;
9. repository known to match production;
10. historical documentation;
11. previous chat;
12. inference.

Never invent missing production information.

## Production change procedure

For material code changes:

1. pull current live source;
2. verify target project/deployment;
3. create pre-change backup when risk justifies it;
4. define exact changed-file scope;
5. make the smallest safe change;
6. run syntax/dependency checks;
7. run targeted tests proportional to blast radius;
8. run all available pre-push regression, preview, dry-run, or read-only checks for the changed functionality and every affected workflow;
9. verify changed-file inventory;
10. **do not push to the bound production Apps Script project unless the pre-push gate passes**;
11. push to the existing bound Apps Script project only after that gate passes;
12. immediately re-pull/read back and compare the production source;
13. run post-push health/smoke/runtime verification for the intended behavior;
14. if post-push verification fails, stop further rollout and use the preserved rollback path rather than continuing on an unverified state;
15. create an identifiable immutable release/version when appropriate;
16. preserve the existing production deployment unless migration is intentional;
17. synchronize verified source + release evidence to GitHub through the connected GitHub connector;
18. read GitHub back to prove the remote archive exists;
19. checkpoint the verified state.

## Mandatory pre-push gate

Production Apps Script push is a release action, not a testing shortcut.

Before any production push, the changed functionality must pass every practical verification available without changing production, including as applicable:

- syntax/parse validation;
- dependency and function-connectivity checks;
- changed-file scope verification;
- preview/dry-run/read-only execution;
- duplicate-prevention and relationship-integrity checks;
- regression checks for Install, Delivery, Service, and PreInspection when shared code is affected;
- known-good / known-bad test cases relevant to the changed path;
- confirmation that public/menu/trigger entrypoints remain intact unless intentionally changed.

If the functionality cannot be adequately verified pre-push, stop and explicitly identify the missing proof. Do not silently use production as the test environment.

Some behavior can only be proven after a production push because it depends on live Apps Script/Striven/Calendar execution. In those cases, the push may occur only after all available pre-push checks pass, and the change remains **UNVERIFIED** until immediate post-push read-back and runtime verification pass.

## GitHub rule

GitHub is the persistent project ledger and rollback history. For every ChatGPT-assisted Task Mapping code change, GitHub synchronization is a **mandatory same-procedure step** after Apps Script remote read-back. Do not wait for the user to request it again.

Use the connected GitHub integration for repository mutations. Do not request or embed GitHub passwords, PATs, connector credentials, OAuth tokens, Script Properties, API keys, or cookies. Do not use local `git push` as the normal workflow.

A local Git commit is not a GitHub backup until the remote branch is read back successfully.

## Versioning

Every production release must be identifiable. Record:

- release/version name;
- timestamp;
- Apps Script script ID;
- changed files;
- pre/post hashes when available;
- source/deployment verification state;
- runtime feature-verification state;
- GitHub commit/branch when actually synced;
- rollback target;
- exact next action.

Preserve known-good versions for rollback.

## High-risk writes

Production writes require appropriate preview/guardrails, authoritative read-back, reconciliation, and duplicate protection. Never blindly retry an uncertain create.

## Fast paths

Fast paths must fail closed on source mismatch, missing files, failed syntax, ambiguous records, unexpected deletion, failed health checks, or uncertain external creation.

## Security

Protect credentials, secrets, customer PII, and private data. This repository is public, so code/history must be checked for sensitive content before publication.

## Startup procedure

At the beginning of meaningful work, read:

1. `PROJECT_OPERATING_RULES.md`;
2. `PROJECT_CURRENT_STATE.md`;
3. `PROJECT_CHECKPOINT.md`.

Then identify the active objective, bottleneck, risk level, and fastest safe path before changing code.

## Non-negotiable summary

Current authoritative source before assumptions. Evidence before conclusions. One active objective. Critical path first. Minimum safe change. Preserve working functionality. **Verify before production push.** Never push incomplete or pre-push-failing source. Read back consequential writes. Reconcile before completion. Test according to blast radius. Preserve rollback. Fix root causes. Every verified code change gets a GitHub connector sync and GitHub read-back. Every checkpoint has one exact next action. Never claim verification that did not occur.

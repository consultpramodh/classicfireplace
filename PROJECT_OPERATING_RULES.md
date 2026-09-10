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
8. verify changed-file inventory;
9. push to the existing bound Apps Script project;
10. re-pull and compare when needed;
11. create an identifiable immutable release/version;
12. preserve the existing production deployment unless migration is intentional;
13. health-check;
14. feature-verify the intended outcome;
15. synchronize verified source + release evidence to GitHub through the connected GitHub connector;
16. read GitHub back to prove the remote archive exists;
17. checkpoint the verified state.

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

Current authoritative source before assumptions. Evidence before conclusions. One active objective. Critical path first. Minimum safe change. Preserve working functionality. Never push incomplete source. Read back consequential writes. Reconcile before completion. Test according to blast radius. Preserve rollback. Fix root causes. Every verified code change gets a GitHub connector sync and GitHub read-back. Every checkpoint has one exact next action. Never claim verification that did not occur.

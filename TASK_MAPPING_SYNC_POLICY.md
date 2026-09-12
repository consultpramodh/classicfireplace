# Task Mapping — Verified Execution Sync Policy

The single canonical GitHub branch for verified Classic Fireplace Apps Script Task Mapping work is:

`task_mapping`

All durable project material—including Install, Delivery, Service, PreInspection, shared architecture, backups, execution records, history, and future verified source—belongs inside this branch.

Do not create permanent backup/reorganization branches merely to simulate folders. Use repository folders plus immutable commit SHAs for durable backup/history. Temporary work branches are allowed only when genuinely useful for an isolated change/PR and are disposable after reconciliation.

## Mandatory automated GitHub step

For every ChatGPT-assisted Task Mapping code change, GitHub synchronization is part of the same completion procedure. It is not an optional follow-up and should not require a separate user reminder.

After Apps Script reaches `DEPLOYED_SOURCE_VERIFIED`, ChatGPT must use the already-connected GitHub connector for `consultpramodh/classicfireplace` to synchronize verified source and release metadata to `task_mapping`.

Do not ask the operator for GitHub credentials. Do not run local `git push`, interactive HTTPS authentication, PAT prompts, or password authentication.

## Required execution order

`pull live Apps Script → validate/patch → targeted regression checks → freshness pull → clasp push → POST read-back → verify source → prepare connector handoff → GitHub connector sync → GitHub read-back → update execution record/checkpoint → final status`

A Task Mapping change is not considered fully archived until the GitHub read-back succeeds.

## Project-wide coverage requirement

Every change must be assessed against all affected workflow domains:

- Install;
- Delivery;
- Service;
- PreInspection;
- shared cross-workflow modules.

If a shared helper is changed, regression scope must include every workflow that calls it or explicitly document why a workflow is unaffected.

No project-wide backup/checkpoint may represent only one workflow as if it covered the entire Task Mapping system.

## What gets synchronized

- `apps-script/` — exact verified Apps Script source from the final POST/read-back snapshot when safe to publish.
- `backups/` — project-wide backup manifests and rollback commit references.
- `executions/` — one machine-readable record per verified deployment/release.
- `executions/latest.json` — latest recorded release state.
- `PROJECT_CURRENT_STATE.md` — current production/source truth when materially changed.
- `PROJECT_CHECKPOINT.md` — exact continuation point and next action.
- `docs/architecture/` — common architecture, endpoint, guardrail, and migration contracts.
- `docs/policies/` — shared operating/release/API policies.
- `docs/workflows/` — dedicated Install, Delivery, Service, and PreInspection contracts.
- `deployment-history/` and `history/` — recovered/newly verified release and historical evidence.

Each execution record should include at minimum:

- release/version name;
- execution timestamp;
- Apps Script script ID;
- exact changed-file list;
- pre/post hashes when available;
- Apps Script deployment/source verification status;
- runtime feature-verification status;
- GitHub branch and commit SHA after successful sync;
- rollback target;
- known blockers or safety concerns.

## Authentication rule

1. GitHub writes use the connected ChatGPT GitHub connector.
2. Never request the operator's GitHub username/password/PAT for this workflow.
3. Never attempt to extract, copy, save, or expose the connector credential.
4. Local Apps Script tooling may use the operator's existing Google/clasp authorization, but it must not perform GitHub authentication.
5. A local Git commit is not evidence of a GitHub backup. Only connector write + GitHub read-back counts.

## Safety rules

1. GitHub sync occurs only after Apps Script remote read-back establishes the final source state.
2. Never sync a failed or uncertain Apps Script deployment as current verified source.
3. Never force-push `task_mapping` as part of an automated patch procedure.
4. Fail closed on a stale GitHub base or branch conflict.
5. Never commit credentials, Script Properties, OAuth tokens, API keys, cookies, customer PII, or other secrets/private operational data.
6. Because the repository is public, screen raw source/history before publishing.
7. If exact live source cannot be safely or authoritatively captured, record the gap; do not substitute stale or partial source.
8. Do not delete production functions/files during repository cleanup unless exact live-source parity, caller inventory, and regression evidence justify it.

## Backup policy

Use immutable Git commit SHAs plus manifests under `backups/` as the normal durable rollback record.

A backup manifest must state its scope. Project-wide backup manifests must explicitly include Install, Delivery, Service, PreInspection, and shared modules.

A repository/ledger backup is not automatically an Apps Script source backup. Keep those statuses separate.

## Automation boundary

The connected GitHub connector can automate repository writes from ChatGPT, but it cannot lend its credential to a PowerShell/clasp process running on the operator's PC. Therefore:

- local/Apps Script execution produces or exposes the verified POST source;
- ChatGPT performs the GitHub write automatically through the connector once that verified source is accessible;
- no separate GitHub login or manual push is part of the procedure.

## Completion rule

Before reporting a Task Mapping change complete, report these states separately:

- Apps Script deployment/source verification;
- runtime feature verification;
- GitHub synchronization;
- GitHub read-back/parity;
- affected-workflow regression coverage.

Never collapse these into one generic `PASS` if any stage is incomplete.

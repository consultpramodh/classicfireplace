# Task Mapping — Verified Execution Sync Policy

The canonical GitHub branch for verified Classic Fireplace Apps Script Task Mapping work is:

`task-mapping/main`

Architecture/reorganization work must branch from canonical main under the grouped namespace, for example:

`task-mapping/reorg/...`

Frozen rollback/backups belong under:

`task-mapping/backup/...`

Legacy flat branch refs such as `task_mapping`, `reorg/...`, and `backup/...` are superseded and must not receive new work.

## Mandatory automated GitHub step

For every ChatGPT-assisted Task Mapping code change, GitHub synchronization is part of the same completion procedure. It is not an optional follow-up and should not require a separate user reminder.

After Apps Script reaches `DEPLOYED_SOURCE_VERIFIED`, ChatGPT must use the already-connected GitHub connector for `consultpramodh/classicfireplace` to synchronize the verified source and release metadata to `task-mapping/main`, or to a temporary grouped work branch that is subsequently reconciled into `task-mapping/main`.

Do not ask the operator for GitHub credentials. Do not run local `git push`, interactive HTTPS authentication, PAT prompts, or password authentication.

## Required execution order

`pull live Apps Script → validate/patch → targeted regression checks → freshness pull → clasp push → POST read-back → verify source → prepare connector handoff → GitHub connector sync → GitHub read-back → update execution record/checkpoint → final status`

A Task Mapping change is not considered fully archived until the GitHub read-back succeeds.

## What gets synchronized

- `apps-script/` — exact verified Apps Script source from the final POST/read-back snapshot when safe to publish.
- `executions/` — one machine-readable record per verified deployment/release.
- `executions/latest.json` — latest recorded release state.
- `PROJECT_CURRENT_STATE.md` — current production/source truth when materially changed.
- `PROJECT_CHECKPOINT.md` — exact continuation point and next action.
- `docs/` — stable business/process/architecture documentation when the agreed design changes.
- `deployment-history/` — recovered or newly verified release history.

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
3. Never force-push `task-mapping/main` as part of an automated patch procedure.
4. Fail closed on a stale GitHub base or branch conflict.
5. Never commit credentials, Script Properties, OAuth tokens, API keys, cookies, or other secrets.
6. Because the current repository is public, scan source/history for customer PII and private operational data before publishing raw source.
7. If exact live source cannot be safely or authoritatively captured, record the gap in `PROJECT_CHECKPOINT.md`; do not substitute stale or partial source.

## Branch policy

- `task-mapping/main` is the only canonical current branch.
- Reorganization and risky refactors start from `task-mapping/main` under `task-mapping/reorg/...`.
- Frozen rollback points use `task-mapping/backup/...`.
- A grouped reorg branch must not become authoritative merely because it is newer; canonical status changes only when verified work is reconciled into `task-mapping/main` and read back.
- Legacy flat branch refs are historical aliases only.

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
- GitHub read-back/parity.

Never collapse these into one generic `PASS` if any stage is incomplete.

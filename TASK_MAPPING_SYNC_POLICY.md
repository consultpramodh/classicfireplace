# Task Mapping — Verified Execution Sync Policy

This branch is the source archive for verified Classic Fireplace Apps Script Task Mapping executions.

## Required post-execution GitHub step

Every Task Mapping auto-patch package should, after a successful Apps Script push and byte-for-byte remote read-back, sync the verified remote source to this `task_mapping` branch.

The sync must happen only after the Apps Script deployment has reached `DEPLOYED_SOURCE_VERIFIED`. A failed Apps Script deployment must never be pushed as the current verified source.

## Repository layout

- `apps-script/` — exact Apps Script source from the final post-push `clasp pull` read-back.
- `executions/` — one JSON execution record per verified deployment.
- `executions/latest.json` — metadata for the most recent verified deployment.

Each execution record should include at minimum:

- release/version name;
- execution timestamp;
- Apps Script script ID;
- pre-patch and post-patch hashes for changed files when available;
- exact changed-file list;
- deployment verification status;
- GitHub branch name;
- whether runtime feature verification has been completed.

## Safety rules

1. GitHub sync occurs after Apps Script remote read-back, never before.
2. The source committed under `apps-script/` must come from the final `POST/src` read-back, not from the local working directory alone.
3. If GitHub push fails after Apps Script deployment, report Apps Script as deployed/source-verified but GitHub sync as failed; do not misreport the Apps Script deployment as rolled back.
4. Never force-push `task_mapping` as part of an auto-patch execution.
5. Pull/rebase the branch before pushing and fail closed on an unresolved Git conflict.
6. Do not commit credentials, Script Properties, OAuth tokens, API keys, cookies, or other secrets.

## Current workflow convention

Future Task Mapping patch packages should include the GitHub sync step automatically. The intended execution order is:

`pull live Apps Script → validate/patch → regression checks → freshness pull → clasp push → POST read-back → GitHub sync to task_mapping → final status`

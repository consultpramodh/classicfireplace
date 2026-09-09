# Task Mapping — Verified Execution Sync Policy

This branch is the source archive for verified Classic Fireplace Apps Script Task Mapping executions.

## Required post-execution GitHub step

Every Task Mapping auto-patch package should, after a successful Apps Script push and byte-for-byte remote read-back, prepare the verified POST source for synchronization to this `task_mapping` branch.

The actual GitHub write must use the authenticated ChatGPT GitHub connector for `consultpramodh`, not a local `git push` that asks the operator for a username, password, PAT, or other GitHub credential.

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

## Authentication rule

1. Do not prompt the operator for GitHub credentials as part of a Task Mapping patch package.
2. Do not use GitHub password authentication, interactive HTTPS prompts, locally entered PATs, or embedded GitHub tokens.
3. Do not attempt to extract, copy, save, or expose the ChatGPT GitHub connector credential; connector authentication remains managed by ChatGPT.
4. GitHub repository mutations for this workflow are performed through the already-connected GitHub connector in ChatGPT.
5. The operator should only need to run the local Apps Script patch/verification package; GitHub authentication must not be part of that local execution.

## Safety rules

1. GitHub sync occurs after Apps Script remote read-back, never before.
2. The source committed under `apps-script/` must come from the final `POST/src` read-back, not from the local working directory alone.
3. If GitHub sync fails after Apps Script deployment, report Apps Script as deployed/source-verified but GitHub sync as failed; do not misreport the Apps Script deployment as rolled back.
4. Never force-push `task_mapping` as part of an auto-patch execution.
5. Fail closed on a branch conflict or stale GitHub base; do not overwrite newer branch work.
6. Do not commit credentials, Script Properties, OAuth tokens, API keys, cookies, or other secrets.

## Current workflow convention

Future Task Mapping patch packages should not run `git clone`, `git push`, or any interactive GitHub authentication command. They should finish by producing the exact verified POST source and execution metadata for connector sync.

The intended execution order is:

`pull live Apps Script → validate/patch → regression checks → freshness pull → clasp push → POST read-back → prepare GitHub handoff artifact → ChatGPT GitHub connector sync to task_mapping → final status`

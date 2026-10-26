# Task Mapping — Versioning and Release Standard

GitHub and Google Apps Script solve different problems. Use both.

## GitHub

GitHub is the durable source/history ledger. A GitHub commit records exactly what source/documentation changed and allows comparison or restoration.

## Google Apps Script

Apps Script HEAD is mutable. A numbered Apps Script version is immutable. A deployment points to a version. Deployment/version IDs should be recorded when available, but GitHub remains the easier place to inspect source history.

## Required release sequence

`pull live source → verify target → backup → patch → syntax/dependency tests → targeted runtime/preview tests → push Apps Script → POST read-back/hash parity → create identifiable release/version → update existing deployment when applicable → health/feature verification → GitHub connector sync → GitHub read-back → checkpoint`

## GitHub commit convention

Use release-oriented messages, for example:

`task-mapping: R3.4.21 simplify PreInspect customer resolver`

Do not bundle unrelated changes into the same release commit.

## Execution records

For every production release, write `executions/<release>-<timestamp>.json` and update `executions/latest.json` only after the facts are known.

Recommended fields:

```json
{
  "version": "R3.4.21",
  "timestamp": "ISO-8601",
  "scriptId": "...",
  "appsScriptVersionNumber": null,
  "deploymentId": null,
  "changedFiles": [],
  "preHashes": {},
  "postHashes": {},
  "appsScriptSourceVerified": false,
  "runtimeFeatureVerified": false,
  "githubSyncStatus": "PENDING",
  "githubCommit": null,
  "rollbackTarget": null,
  "nextAction": "..."
}
```

Use `null`/`UNKNOWN` instead of inventing missing IDs.

## Rollback

A release is not fully recoverable unless there is a known-good source state and, when deployment matters, a known-good Apps Script version/deployment target. Preserve both whenever tooling exposes them.

## GitHub verification rule

A local `git commit` or generated handoff artifact is not a successful GitHub sync. After writing through the connected GitHub integration, read the target branch/file back and record the resulting commit SHA.

## Public-repository security

This repository is public. Never commit credentials, tokens, Script Properties values, customer PII, private logs, or source snapshots containing those items. Historical raw archives should be sanitized before publication or stored in an appropriate private repository instead.

## Mandatory Apps Script retention rule

Effective 2026-10-26. Applies to CF Tasks V3 releases in this repository and supersedes the earlier keep-one-version convention.

- Retain at most five saved numbered Apps Script versions per project. Keep the current deployed release and the newest rollback versions within those five slots.
- On every new numbered version, inventory all saved versions and all deployment references, archive every not-yet-backed-up superseded version, verify the durable backup by read-back and source hashes, and remove eligible versions outside the retained set.
- Preserve complete restorable source, manifest, script ID, version number, creation time, hashes, and deployment mapping. Store sensitive source only in an approved private backup destination; a public repository may contain only sanitized material.
- Never delete an unverified backup candidate or a version referenced by any deployment. An older deployment-pinned version takes one of the five slots; do not silently move or remove deployments to make room.
- If more than five deployment-pinned versions exist, or backup/deletion access fails, stop further numbered-version creation and report the exact blocker. Preserve the running system.
- Do not create numbered versions for read-only audits, ordinary checks, individual-event runs, retries, or unchanged source. Use the existing execution mechanism when appropriate.
- Verify the complete post-cleanup inventory. A release is not retention-complete until the saved-version count is at most five and each deleted version has a verified recoverable backup.
- Record the before/after inventory, backup locations and hashes, retained/deleted version numbers, protected deployments, timestamp, and any blocker. Never report cleanup as completed from backup success alone.
- Run this check at each controlled release. A version created outside the controlled release path must be reconciled on the next check; do not claim continuous monitoring unless an actual monitor has been installed and verified.

### Enforcement capability

Google's documented Apps Script Versions REST resource currently exposes create, get, and list, but no delete method:
https://developers.google.com/apps-script/api/reference/rest/v1/projects.versions

Automatic version deletion is not established by this policy file. Use only an authorized supported deletion surface, and report pending cleanup honestly when that surface is unavailable. Do not fabricate a REST delete endpoint or bypass browser access restrictions. The initial 200-version backlog remains pending until independently verified as removed.

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

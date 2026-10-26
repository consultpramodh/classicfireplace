# CF Tasks project instructions

## Apps Script version retention

For every CF Tasks V3 release or saved-version operation, read and follow `docs/policies/VERSIONING_AND_RELEASES.md`.

The user requires a maximum of five saved numbered Apps Script versions per project. Back up superseded versions to a durable approved destination, verify read-back and hashes, protect all deployment-referenced versions, delete eligible excess versions, and verify the final inventory. The current deployed release and deployment-pinned rollback versions count toward the five.

Do not create numbered versions for audits, unchanged source, retries, or individual-event executions. Do not claim automatic pruning is installed, or cleanup completed, without execution evidence. If supported deletion access or verified backups are unavailable, preserve production, stop further numbered-version creation, and state the blocker. Never invent a version-delete API or bypass access restrictions.

This five-version rule supersedes the earlier instruction to retain only one version. Preserve unrelated source, functions, interfaces, records, triggers, and deployment targets.

# Task Mapping Backups

This folder preserves Task Mapping backup manifests and rollback references **inside the canonical `task_mapping` branch**.

## Current contents

- `2026-09-09/PRE_SYNC_MANIFEST.md` — preserves the unique manifest from the historical `task-mapping-full-backup-20260909` branch.
- `2026-09-11/R3.4.22_PRE_REORG_MANIFEST.md` — preserves the pre-reorganization R3.4.22 repository/ledger freeze and rollback commit references.

## Rule

Backups in this folder are metadata/rollback references unless explicitly accompanied by a verified source snapshot. They must not be described as exact production-source parity unless the exact Apps Script source was captured, screened, archived, and read back successfully.

Historical backup branches can be retired after their unique content is confirmed here and their commit SHAs are recorded.

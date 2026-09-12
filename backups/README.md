# Task Mapping Backups

This folder preserves Task Mapping backup manifests and rollback references **inside the canonical `task_mapping` branch**.

Backups apply to the **entire Task Mapping project**: Install, Delivery, Service, PreInspection, plus the shared architecture, execution ledger, tools, policies, and history.

## Current contents

- `2026-09-09/PRE_SYNC_MANIFEST.md` — preserves the unique manifest from the historical `task-mapping-full-backup-20260909` branch.
- `2026-09-11/R3.4.22_PRE_REORG_MANIFEST.md` — preserves the pre-reorganization R3.4.22 repository/ledger freeze and rollback commit references.
- `2026-09-12/PROJECT_WIDE_REORG_BASELINE.md` — project-wide baseline before expanding the workflow documentation/inventory structure; explicitly covers Install, Delivery, Service, and PreInspection.

## Rule

Backups in this folder are metadata/rollback references unless explicitly accompanied by a verified source snapshot. They must not be described as exact production-source parity unless the exact Apps Script source was captured, screened, archived, and read back successfully.

Historical backup branches can be retired after their unique content is confirmed here and their commit SHAs are recorded.

## Workflow coverage rule

A project backup/reorganization checkpoint must never represent only one workflow as if it represented the whole project. Any project-wide baseline must explicitly cover:

- Install;
- Delivery;
- Service;
- PreInspection;
- shared cross-workflow modules and operational infrastructure.

# Task Mapping Repository Structure

## Canonical branch

`task_mapping` is the **single canonical Task Mapping branch**.

All current project state, architecture, workflow rules, execution ledgers, backup manifests, tools, and future verified Apps Script source belong inside this branch.

## Folder map

```text
task_mapping
├── apps-script/                    # exact verified production source only after parity proof
├── backups/                       # backup manifests and rollback references
│   ├── 2026-09-09/
│   └── 2026-09-11/
├── deployment-history/            # human-readable deployment history
├── docs/
│   ├── architecture/              # architecture, contracts, gaps, migration plan
│   ├── policies/                  # API refresh, versioning, release standards
│   └── workflows/
│       └── preinspection/         # PreInspection flow and specific policies
├── executions/                    # machine-readable deployment/runtime ledger
├── history/
│   ├── releases/                  # release-specific historical notes
│   └── source-snapshots/          # historical source evidence; never assumed current
├── tools/                         # capture, patch, test, and verification utilities
├── PROJECT_CURRENT_STATE.md
├── PROJECT_CHECKPOINT.md
├── PROJECT_OPERATING_RULES.md
├── TASK_MAPPING_SYNC_POLICY.md
└── README.md
```

## Branch policy

Do **not** create permanent backup or architecture branches merely to simulate folders. GitHub displays branches as a flat list, so the project is easier to maintain when durable material lives inside `task_mapping`.

Temporary branches may still be used for a genuinely isolated risky change or pull request, but they are disposable work branches and must not become separate project homes.

## Historical branches ready for retirement

After final verification, the following branches are redundant because their unique content/commit references have been preserved inside `task_mapping`:

- `backup/task-mapping-r3.4.22-pre-reorg-20260911`
- `reorg/task-mapping-architecture-20260911`
- `task-mapping/backup/task-mapping-r3.4.22-pre-reorg-20260911`
- `task-mapping/reorg/task-mapping-architecture-20260911`
- `task-mapping/main`
- `task-mapping-full-backup-20260909`

The connected GitHub toolset in this conversation does not expose branch deletion, so deletion must be done through GitHub's branch UI after this repository consolidation is verified.

## Safety rule

Repository reorganization does not authorize production Apps Script mutation. Physical Apps Script refactoring remains blocked until the exact current 36-file live source is captured, screened, archived, and inventoried.

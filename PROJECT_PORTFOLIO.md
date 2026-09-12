# Classic Fireplace — Project Portfolio

This file is the canonical portfolio index. Long-lived project work is grouped into a small number of branches rather than one branch/project per chat.

| Project | Canonical branch | Tracker |
|---|---|---|
| Task Mapping & Field Operations | `task_mapping` | #23 |
| ServiceOps & Customer Service | `cf-serviceops` | #24 |
| Striven Data Hub & Analytics | `striven-central-data-hub` | #25 |
| Product, Inventory & Commerce Automation | `product-inventory-commerce` | #26 |
| Growth, Marketing & Business Development | `growth-marketing` | #27 |

Portfolio tracker: #28

## Standard project status

1. `IDEA` — unvalidated possibility; do not schedule yet.
2. `GOOD TO HAVE` — useful enhancement but not required for the current outcome.
3. `BACKLOG` — accepted work, not yet scheduled.
4. `PLANNED` — scoped and queued.
5. `IN PROGRESS` — active implementation or analysis.
6. `BLOCKED` — cannot proceed until a dependency, decision, access issue or defect clears.
7. `TESTING / VERIFY` — implementation exists; evidence is still required.
8. `READY TO RELEASE` — verification passed; waiting for controlled release/cutover.
9. `LIVE / MONITORING` — production behavior is active and monitored.
10. `DONE / ARCHIVED` — complete historical work retained for reference.

## Operating rules

- Keep existing live Script IDs and deployment boundaries until a verified migration says otherwise.
- A feature stays a subproject unless it has a distinct codebase/deployment lifecycle substantial enough to justify a new canonical branch.
- New chats do not automatically create new GitHub projects.
- Each canonical branch owns its own `PROJECT_BOARD.md`.
- Tracker issues hold portfolio-visible status; branch files hold code-adjacent status.
- `IDEA` and `GOOD TO HAVE` items must not silently enter active work.
- `TESTING / VERIFY` is not the same as `DONE`.

## Noncanonical setup artifact

`project-management-setup-temp` was created during setup and is not a canonical project branch. Delete it when branch-delete access is available; do not place work there.

## Native GitHub Projects

The current ChatGPT GitHub connector does not expose GitHub Projects board creation. Tracker issues plus branch-local project boards are therefore the current source of truth. They are intentionally structured so they can be migrated into native GitHub Projects later without changing the taxonomy.
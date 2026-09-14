# Classic Fireplace — Project Portfolio

This file is the canonical portfolio index. Long-lived work is grouped into a small number of branches rather than one branch/project per chat.

| Project | Canonical branch | Tracker | Work items |
|---|---|---|---|
| Task Mapping & Field Operations | `task_mapping` | #23 | #32–#42 |
| ServiceOps & Customer Service | `cf-serviceops` | #24 | Existing Stage issues #1–#22 plus #43–#45 |
| Striven Data Hub & Analytics | `striven-central-data-hub` | #25 | #46–#55 |
| Product, Inventory & Commerce Automation | `product-inventory-commerce` | #26 | #56–#68 |
| Growth, Marketing & Business Development | `growth-marketing` | #27 | #69–#79 |

Portfolio tracker: #28

Each canonical branch owns a `PROJECT_BOARD.md` that mirrors its tracker and links the feature-level issues.

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
- Tracker issues hold portfolio-visible status; branch `PROJECT_BOARD.md` files hold code-adjacent status.
- Feature issues are the actionable units; parent trackers are indexes, not duplicate task lists.
- `IDEA` and `GOOD TO HAVE` items must not silently enter active work.
- `TESTING / VERIFY` is not the same as `DONE`.
- Cross-project work must have one owning project and explicit handoff boundaries rather than duplicate ownership.

## Native GitHub Projects

ServiceOps already has a native GitHub Project referenced by issue #11.

The current ChatGPT GitHub connector does not expose creation or Project-v2 Status-field mutation for additional native GitHub Projects. For Task Mapping, Data Hub, Product/Inventory and Growth/Marketing, the tracker issue + branch `PROJECT_BOARD.md` + linked feature issues are therefore the current canonical management structure.

## Noncanonical setup artifact

`project-management-setup-temp` is not a canonical project branch. Do not place work there. Delete it only after confirming branch-delete access and that no workflow/reference depends on it.
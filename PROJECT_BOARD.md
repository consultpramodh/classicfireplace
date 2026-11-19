# Customer Statements (AR) — Project Board

Canonical branch: `customer-statements`
Owner scope: custom customer statements generated from Striven data (replaces the built-in Striven statement).
Tracker issue: _not created yet_

Design: [`docs/statement-design.md`](docs/statement-design.md)

| # | Work item | Status | Notes |
|---|---|---|---|
| 1 | Statement content & Striven field map | IN PROGRESS | `docs/statement-design.md` |
| 2 | Read-only data probe (3–5 real customers) | PLANNED | `probe/statement-probe.js`; needs Striven API credentials |
| 3 | Review probe results + layout mock-ups; choose platform | PLANNED | Apps Script + Hub vs. Node service |
| 4 | Ledger + statement builders (open-item, activity, job) | BACKLOG | Pure JS, platform-neutral |
| 5 | Branded HTML template + PDF renderer | BACKLOG | Needs logo, address, phone, HST # |
| 6 | Staff on-demand UI | BACKLOG | Search customer → type/options → preview → PDF |
| 7 | Attach PDF to customer in Striven | GOOD TO HAVE | `POST /v1/customers/{id}/hub/documents` (only write) |
| 8 | Monthly batch email with review step | IDEA | Not in current scope |

## Boundaries
- Reads Striven only (except optional item 7).
- Token flow is reused from **Striven Data Hub & Analytics** (`StrivenCentralDataHub`, `hub_strivenAccessToken_()`); this project does not own the Hub.
- `CF_openbalance` is not used.

## Open inputs
- Company address, phone, HST number; logo file; payment instructions.
- How deposits are recorded in Striven today.
- 3–5 sample customers (one with a deposit, one with credits, one overdue job).

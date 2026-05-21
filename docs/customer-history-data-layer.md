# Customer Previous Business Data Layer

`getCustomerHistory({ customerId })` is the single AI-facing facade for prior customer business. It reads from local ServiceOps report snapshots, not directly from Striven endpoints.

## Inputs

- `customerId`: Striven customer/account ID.
- Optional matching keys: `customerNumber`, `email`, `phone`, `altPhone`.

## Sources

- `invoiceAssetsSerials`: ServiceOps: Invoices to Assets - Serial Numbers.
- `installationTasks`: ServiceOps - CF Installation Tasks.
- `serviceWorkOrders`: existing service work order report.
- `customerAssets`: existing customer asset report.

## Output

- `invoices[]`: customer, invoice, sales order, asset, serial, amount.
- `installationTasks[]`: task ID/name/type/status, SO number, assigned resource, schedule/due dates.
- `serviceOrders[]`: SO ID/number/status and operational dates.
- `assets[]`: asset ID/name/manufacturer/model/serial/purchase date.
- `partial`: true when a source is stale or unavailable.
- `warnings[]`: source-specific cache/report issues.

AI tools should call `loadCustomerPreviousBusiness` or the module facade, never individual Striven report URLs.

# Task Mapping Shadow/Test Controls

The current cleanup strategy uses the **same Apps Script project and same spreadsheet** while keeping the legacy implementation active.

Environment/test controls are centralized here so rewritten workflow code does not scatter ad-hoc `if (TEST)` checks throughout business logic.

## Current strategy

- existing production Script ID remains the project;
- existing production spreadsheet remains the data source;
- existing legacy files/functions/triggers remain active;
- rewritten files are added with the `TM2_` file prefix;
- rewritten functions use the `tm2_` prefix;
- rewritten code starts in `SHADOW_READ_ONLY` mode;
- no rewritten time-driven triggers are installed initially.

## Required control categories

The rewritten framework must centrally resolve:

- migration mode: `SHADOW_READ_ONLY`, `CANARY_WRITE`, or later cutover state;
- current workflow under test;
- write-enabled flag;
- CREATE/RECREATE permission;
- allowed canary Customer IDs when needed;
- allowed canary Sales Order IDs when needed;
- allowed canary Task IDs when needed;
- allowed Event IDs / selected mapping rows when needed;
- trigger-install permission (false during shadow testing);
- logging/evidence destination;
- per-workflow cutover flags once promotion begins.

## Safety rules

1. Default mode is `SHADOW_READ_ONLY`.
2. Shadow mode performs no Striven/Calendar/task mutation.
3. `CANARY_WRITE` requires explicit manual enable plus explicit case context.
4. Missing or ambiguous control configuration fails closed.
5. No legacy public function names may be reused by rewritten code before intentional cutover.
6. No legacy trigger target may be redirected merely by adding rewritten files.
7. Old files remain unchanged during initial shadow deployment.
8. Secrets remain in Script Properties or another approved secret store and are never committed here.
9. Mode and workflow must be visible in every test execution log/evidence record.

`test.example.json` is a non-secret control example only. Do not place credentials, private API values, or customer PII in the public repository.

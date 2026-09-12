# Task Mapping Environment Configuration

Environment-sensitive values must be resolved centrally rather than hard-coded through workflow files.

## Required environments

- `TEST`
- `PRODUCTION`

## Required configuration categories

Each environment must provide or resolve:

- environment name;
- spreadsheet ID;
- Install Calendar ID;
- Delivery Calendar ID;
- Service Calendar ID;
- PreInspection Calendar ID;
- write-enabled flag;
- Striven base/account context when environment-specific;
- approved TEST Customer IDs;
- approved TEST Sales Order IDs;
- approved TEST Task IDs;
- CREATE/RECREATE permission for TEST;
- trigger-install permission;
- logging/evidence destination.

## Safety rules

1. TEST must reject production spreadsheet/calendar IDs.
2. TEST must not perform unrestricted Striven writes.
3. TEST write-capable operations require explicit allowlist validation.
4. Missing or ambiguous environment configuration fails closed.
5. Secrets remain in Script Properties or another approved secret store and are never committed here.
6. Environment selection must be visible in logs and TEST evidence.

`test.example.json` is a non-secret schema/example only. Do not put real credentials or sensitive IDs in the public repository unless they are intentionally public and approved.
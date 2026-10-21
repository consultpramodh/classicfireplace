# V3 execution authorization repair

## Verified diagnosis — 2026-10-21

The CI refresh token can read and deploy the bound Apps Script project. Its granted scopes omit all five scopes in the live V3 manifest. A read-only budget diagnostic returned HTTP 403 in both developer and deployed modes. One credential profile was present. Evidence: https://github.com/consultpramodh/classicfireplace/actions/runs/39653174901

Required execution scopes:

- https://www.googleapis.com/auth/spreadsheets
- https://www.googleapis.com/auth/calendar
- https://www.googleapis.com/auth/script.external_request
- https://www.googleapis.com/auth/script.scriptapp
- https://www.googleapis.com/auth/script.send_mail

## One-time authorization required

1. Read the Google Cloud project number from V3 Apps Script Project Settings. Script ID and spreadsheet ID are different identifiers.
2. Verify the execution OAuth client and V3 use the same standard Google Cloud project, with the Apps Script API enabled. This alignment remains unverified.
3. Use an OAuth client in that project to obtain the owner's consent for all scopes above and the management scopes required by the existing deployment workflow.
4. Replace the existing CLASPRC_JSON GitHub Actions secret through GitHub's secret-management interface. Never commit the credentials or send tokens in chat.
5. Run the existing read-only execution-access diagnostic and require an actual successful budget response before invoking automation.
6. Retry the existing guarded PreInspection runner. Retain the daily API brake and duplicate/write guards.

Source, deployment, and trigger permissions must not be widened to public access to work around this error. No permissions or credentials were changed during diagnosis.

## Documentation

https://developers.google.com/apps-script/api/how-tos/execute

The runner now compares granted scopes with the live manifest and reports GOOGLE_REAUTHORIZATION_REQUIRED before attempting execution when grants are incomplete.

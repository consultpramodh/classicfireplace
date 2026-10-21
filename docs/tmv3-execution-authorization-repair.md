# V3 execution authorization repair

## Verified diagnosis — 2026-10-21

The CI refresh token can read and deploy the bound Apps Script project. Its granted scopes omit all five scopes in the live V3 manifest. A read-only budget diagnostic returned HTTP 403 in both developer and deployed modes. One credential profile was present. Evidence: https://github.com/consultpramodh/classicfireplace/actions/runs/39653174901

Required execution scopes:

- https://www.googleapis.com/auth/spreadsheets
- https://www.googleapis.com/auth/calendar
- https://www.googleapis.com/auth/script.external_request
- https://www.googleapis.com/auth/script.scriptapp
- https://www.googleapis.com/auth/script.send_mail

## Verified target project

- V3 Google Cloud project number supplied by the owner: `499373863884`.
- Apps Script API state on that project: `ENABLED` (Service Usage API returned HTTP 200).
- Current CI credential consumer project: `1072944905499`, identified explicitly in Google's Cloud Resource Manager error response.
- Both execution modes still return HTTP 403; all five execution scopes remain absent.
- Cloud Resource Manager reads were rejected because that API is disabled on the credential's consumer project. This is not evidence that project 499373863884 is inaccessible.
- Google Cloud Console browser access is blocked in this session. No client, permission, token, or repository secret has been changed.

Evidence: https://github.com/consultpramodh/classicfireplace/actions/runs/39654137479

## One-time authorization required

1. Use the verified V3 Cloud project number `499373863884`. Open https://console.cloud.google.com/apis/credentials?project=499373863884 and select/create an OAuth client of type Desktop app in that project. A suitable name is `CF V3 GitHub Execution`. Keep its downloaded JSON private.
2. Verify the execution OAuth client and V3 use the same standard Google Cloud project, with the Apps Script API enabled. The current CI consumer project is different; use the new matching client rather than the existing unrelated client.
3. Use an OAuth client in that project to obtain the owner's consent for all scopes above and the management scopes required by the existing deployment workflow.
4. Replace the existing CLASPRC_JSON GitHub Actions secret through GitHub's secret-management interface. Never commit the credentials or send tokens in chat.
5. Run the existing read-only execution-access diagnostic and require an actual successful budget response before invoking automation.
6. Retry the existing guarded PreInspection runner. Retain the daily API brake and duplicate/write guards.

Source, deployment, and trigger permissions must not be widened to public access to work around this error. No permissions or credentials were changed during diagnosis.

## Documentation

https://developers.google.com/apps-script/api/how-tos/execute

The runner now compares granted scopes with the live manifest and reports GOOGLE_REAUTHORIZATION_REQUIRED before attempting execution when grants are incomplete.

For clasp authorization, follow the first-party clasp run guide: https://github.com/google/clasp/blob/master/docs/run.md . Use project scopes and include the existing clasp management scopes so authorization repair does not break deployments. The downloaded OAuth client JSON alone is not an authorized clasp refresh-token profile.

## Selected client — 2026-10-21

Owner supplied Desktop OAuth client ID:

`499373863884-qb6lcfr1886379383h4mff9gne3g3sko.apps.googleusercontent.com`

Its project-number prefix matches the target project. This records the selected client; it does not prove consent, owner identity, or successful execution. The existing GitHub credential remains unchanged.

The next required step is owner authorization using this client's downloaded JSON kept on the owner's computer. Follow the pinned clasp v3.3.0 run guide at https://github.com/google/clasp/blob/v3.3.0/docs/run.md and authorize all project scopes plus clasp management scopes. Supply only the newly authorized profile to CLASPRC_JSON; do not mix it with the old profile because existing deployment helpers can select the first profile. Never put the client secret, refresh token, or downloaded JSON into chat, repository files, issues, or logs.

Google Cloud Console navigation is blocked by browser host policy in this session, and the GitHub connector cannot edit Actions secrets. These prevent completing consent and secret replacement here. No automation success is claimed until the read-only execution diagnostic succeeds with the replacement credential.

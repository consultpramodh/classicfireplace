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

## One-time local repair helper

Requirements: Node.js 22 or newer, GitHub CLI authenticated as an account allowed to update this repository's Actions secrets, and the downloaded Desktop client JSON on the same computer. Never upload that JSON to the repository or chat.

1. Download `tools/tmv3-authorize-owner.cjs` from branch `task_mapping`.
2. In a local terminal run the following JavaScript / Node.js command, replacing the JSON path with your private downloaded file:

~~~powershell
node ./tmv3-authorize-owner.cjs "C:/Users/YOUR_USER/Downloads/client_secret.json"
~~~

3. Open the printed Google authorization URL on that same computer. Select the Apps Script owner and grant the requested scopes.
4. Wait for PASS and DONE in the terminal. The helper verifies refresh, all scopes, live source reads, deployment inventory, and owner-mode execution of `tmv3_strivenApiBudgetStatus`. Only after those pass does it replace `CLASPRC_JSON` using GitHub CLI stdin.
5. Report the terminal's non-secret result. No task automation is invoked by this helper; the guarded runner remains the next operational step.

The helper uses a loopback listener with state validation and PKCE, requests offline access, and never writes the resulting token to disk or prints it. A failed verification leaves the existing GitHub secret unchanged. GitHub secret replacement errors are reported without credential output. It does not change source, deployment access, task data, or API limits.

Validation performed here: Node syntax check and executed negative-case tests for client mismatch, callback state/path, denied consent, missing refresh token, required scopes and downstream single-profile compatibility. Live owner consent, token exchange, and secret replacement have not been executed here.

OAuth basis: https://developers.google.com/identity/protocols/oauth2/native-app

## Repair verified — October 21, 2026, 2:55–2:56 PM Toronto

GitHub Actions independently verified the replacement secret: one matching-project profile, no missing live manifest scopes, source/deployment reads HTTP 200, and both owner/deployed read-only budget executions HTTP 200. Evidence: https://github.com/consultpramodh/classicfireplace/actions/runs/39657014572

The existing guarded automation was then invoked once. Result: API_BUDGET_WAIT, processed 0, writes 0, notifications 0; daily V3 count 1200/1200, remaining 0. Resume reported NEXT_SCHEDULED_SLOT_AFTER_DAILY_RESET. No budget reset or override was performed. Evidence: https://github.com/consultpramodh/classicfireplace/actions/runs/39657116660

Installed trigger inventory includes exactly one each of tmv3_preInspectionCheck0800, tmv3_preInspectionCheck1300 and tmv3_preInspectionCheck1700, plus scheduled operations, daily source refresh, calendar fallback and calendar-update handlers. The inventory API does not expose clock times or timezone, so this verifies handler presence, not their actual clock configuration. Friday task completion remains unverified.

Earlier sections describing consent as pending are historical diagnosis; the verified results above supersede that status.

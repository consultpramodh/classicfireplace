# Task Mapping — Zero-Touch AutoPatch Automation

## Decision

Use the existing guarded AutoPatch pattern, but execute it in GitHub Actions instead of requiring an operator to run PowerShell locally.

This keeps the current production Apps Script project as the authority while removing the repetitive manual deployment step.

## One-time authorization boundary

Google requires OAuth authorization for a CI runner that manages Apps Script source. The repository therefore needs one GitHub Actions secret named `CLASPRC_JSON`, containing the operator's existing clasp OAuth credential JSON.

Never commit that JSON, paste it into project files, or place it in chat. It belongs only in GitHub Actions Secrets.

After that one-time authorization is configured, the source AutoPatch can run without a local PC or manual clasp command.

## Automatic trigger

The deployment workflow triggers only when this release marker changes on `task_mapping`:

`release-candidates/tm2-autopatch.json`

Ordinary documentation commits, code drafting, and candidate-file edits do not deploy anything by themselves.

## Guarded AutoPatch sequence

1. Checkout `task_mapping`.
2. Load Google clasp OAuth from the GitHub Actions secret.
3. Validate the release manifest.
4. Syntax-check every candidate `TM2_*.js` file.
5. Require all candidate functions to use the `tm2_` prefix.
6. Reject duplicate TM2 global functions.
7. Reject initial-shadow trigger creation, Calendar mutation, and direct network primitives.
8. Fresh-clone the live Apps Script project.
9. Require the expected non-TM2 legacy file count.
10. Hash every legacy file.
11. Check candidate global names against legacy functions.
12. Preserve the PRE clone as workflow evidence.
13. Build WORK from PRE plus only the candidate TM2 files.
14. Fresh-clone again immediately before push and compare legacy hashes.
15. Push WORK to the same Script ID.
16. POST-clone the remote project.
17. Prove every legacy file is unchanged.
18. Prove every candidate TM2 file matches exactly.
19. If verification fails after a push, automatically push PRE back as rollback.
20. Upload PRE source and verification evidence as a GitHub Actions artifact.

## Runtime-test automation

Source AutoPatch and source read-back can be fully automated with clasp OAuth.

Automatically executing `tm2_connectivityAudit()`, `tm2_diagnostics()`, and `tm2_shadowRunAll()` from GitHub requires remote Apps Script execution. The supported Google route is the Apps Script API `scripts.run` / API executable model. That requires the script and caller to use the same standard Google Cloud project.

Do not switch the production Apps Script project to a different Cloud project merely to gain remote test execution without a dedicated migration review, because changing the Cloud project can change authorization behavior and require reauthorization.

Until remote execution is verified for this existing project, keep these states separate:

- `DEPLOYED_SHADOW_SOURCE_VERIFIED` — automated source push/read-back succeeded.
- `SHADOW_RUNTIME_VERIFIED` — TM2 read-only functions actually ran and passed.

The final zero-touch target is to add remote runtime execution after confirming the existing Cloud-project/deployment prerequisites can be satisfied safely.

## Release marker schema

Example only:

```json
{
  "schemaVersion": 1,
  "release": "TM2_SHADOW_R0",
  "scriptId": "<production script id>",
  "sourceDirectory": "apps-script/tm2-shadow",
  "expectedLegacyNonTm2Count": 36,
  "claspVersion": "3.3.0",
  "mode": "SHADOW_READ_ONLY"
}
```

The release marker is intentionally not created until CI authorization exists and the candidate source has passed repository-side checks.

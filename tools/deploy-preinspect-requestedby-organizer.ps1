param(
  [string]$ScriptId = '1E86mhD2dZcOFpqWnCvoIpwEkwZ0MA63MgM8DifV6WyB2FvVQkRWKIZ_m',
  [string]$ClaspVersion = '3.3.0'
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$release = 'R3.4.21a_REQUESTED_BY_ORGANIZER_EMPLOYEE_PACKAGE_FIX'
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$root = Join-Path $env:TEMP ("TaskMapping-$release-$stamp")
$pre = Join-Path $root 'PRE'
$work = Join-Path $root 'WORK'
$fresh = Join-Path $root 'FRESH'
$post = Join-Path $root 'POST'
$rollbackPost = Join-Path $root 'ROLLBACK_POST'
$patcher = Join-Path $PSScriptRoot 'patch_preinspect_requestedby_organizer.js'
$selfTest = Join-Path $PSScriptRoot 'SELF_TEST_R3_4_21.js'
$desktopZip = Join-Path ([Environment]::GetFolderPath('Desktop')) ("TaskMapping-$release-POST-$stamp.zip")
$pushStarted = $false

function Invoke-Clasp([string[]]$ClaspArgs) {
  & npx -y "@google/clasp@$ClaspVersion" @ClaspArgs
  if ($LASTEXITCODE -ne 0) { throw "clasp command failed: $($ClaspArgs -join ' ')" }
}

function Get-SourceManifest([string]$SrcRoot) {
  $items = @{}
  Get-ChildItem -Path $SrcRoot -File -Recurse | Sort-Object FullName | ForEach-Object {
    $rel = $_.FullName.Substring($SrcRoot.Length).TrimStart('\','/') -replace '\\','/'
    $items[$rel] = (Get-FileHash $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
  }
  return $items
}

function Get-DiffKeys($A, $B) {
  $all = @($A.Keys + $B.Keys | Sort-Object -Unique)
  $diff = @()
  foreach ($key in $all) {
    if (-not $A.ContainsKey($key) -or -not $B.ContainsKey($key) -or $A[$key] -ne $B[$key]) {
      $diff += $key
    }
  }
  return $diff
}

function Assert-ManifestsEqual($A, $B, [string]$Label) {
  $diff = Get-DiffKeys $A $B
  if ($diff.Count) { throw "$Label failed. Differing files: $($diff -join ', ')" }
}

function Test-TaskMappingFingerprint([string]$Folder) {
  $src = Join-Path $Folder 'src'
  if (-not (Test-Path $src)) { return $false }
  $files = Get-ChildItem $src -File -Recurse
  if ($files.Count -lt 30) { return $false }
  $names = @($files.Name)
  return (
    ($names -match '^35_PreInspect_Task_Review\.').Count -eq 1 -and
    ($names -match '^36_PreInspect_Task_Create\.').Count -eq 1
  )
}

New-Item -ItemType Directory -Path $root -Force | Out-Null

Write-Host "=== $release ==="
Write-Host '1/10 Verify Node + clasp authorization'
& node --version
if ($LASTEXITCODE -ne 0) { throw 'Node.js is required.' }
Invoke-Clasp @('--version')
Invoke-Clasp @('show-authorized-user','--json')

Write-Host '2/10 Run package self-test'
$selfTestJson = & node $selfTest
if ($LASTEXITCODE -ne 0) { throw 'Package self-test failed.' }
$selfTestJson | Write-Host

Write-Host '3/10 Use configured Task Mapping Script ID'
$resolvedScriptId = [string]$ScriptId
if (-not $resolvedScriptId.Trim()) { throw 'Task Mapping Script ID is blank. No write performed.' }
Write-Host "Script ID: $resolvedScriptId"

Write-Host '4/10 Pull exact live source (PRE)'
New-Item -ItemType Directory -Path $pre -Force | Out-Null
Push-Location $pre
try { Invoke-Clasp @('clone',$resolvedScriptId,'--rootDir','src') } finally { Pop-Location }
if (-not (Test-TaskMappingFingerprint $pre)) {
  throw 'Unified Task Mapping fingerprint failed. No write performed.'
}
$preManifest = Get-SourceManifest (Join-Path $pre 'src')

Write-Host '5/10 Build WORK and apply exactly-two-file PreInspect patch'
Copy-Item -Path $pre -Destination $work -Recurse
$patchResult = & node $patcher (Join-Path $work 'src')
if ($LASTEXITCODE -ne 0) { throw 'Organizer Requested By patcher failed.' }
$patchResult | Write-Host

$workManifest = Get-SourceManifest (Join-Path $work 'src')
$changed = Get-DiffKeys $preManifest $workManifest
$expected = @('35_PreInspect_Task_Review.js','36_PreInspect_Task_Create.js')
$changedLeaf = @($changed | ForEach-Object { Split-Path $_ -Leaf } | Sort-Object)
if (($changedLeaf -join '|') -ne (($expected | Sort-Object) -join '|')) {
  throw "Changed-file guard failed. Expected only $($expected -join ', '); got $($changed -join ', ')"
}

Write-Host '6/10 Syntax-check changed files'
foreach ($leaf in $expected) {
  $file = @(Get-ChildItem -Path (Join-Path $work 'src') -File -Recurse | Where-Object { $_.Name -eq $leaf })
  if ($file.Count -ne 1) { throw "Expected exactly one $leaf in WORK." }
  & node --check $file[0].FullName
  if ($LASTEXITCODE -ne 0) { throw "Syntax check failed: $leaf" }
}

Write-Host '7/10 Freshness pull immediately before push'
New-Item -ItemType Directory -Path $fresh -Force | Out-Null
Push-Location $fresh
try { Invoke-Clasp @('clone',$resolvedScriptId,'--rootDir','src') } finally { Pop-Location }
$freshManifest = Get-SourceManifest (Join-Path $fresh 'src')
Assert-ManifestsEqual $preManifest $freshManifest 'Freshness guard'

try {
  Write-Host '8/10 Push WORK to existing bound Apps Script project'
  $pushStarted = $true
  Push-Location $work
  try { Invoke-Clasp @('push','--force') } finally { Pop-Location }

  Write-Host '9/10 POST pull and full-project SHA verification'
  New-Item -ItemType Directory -Path $post -Force | Out-Null
  Push-Location $post
  try { Invoke-Clasp @('clone',$resolvedScriptId,'--rootDir','src') } finally { Pop-Location }
  $postManifest = Get-SourceManifest (Join-Path $post 'src')
  Assert-ManifestsEqual $workManifest $postManifest 'POST read-back verification'

  $execution = [ordered]@{
    release = $release
    completedAtLocal = (Get-Date).ToString('o')
    scriptId = $resolvedScriptId
    changedFiles = $changed
    appsScriptSourceVerification = 'PASS'
    runtimeFeatureVerification = 'PENDING_REAL_PREINSPECT_ROW'
    githubSync = 'PENDING_CHATGPT_CONNECTOR'
    requestedByRule = 'Calendar organizer email -> exact Striven Employee; Type=employee; no customer-contact fallback'
  }
  $execution | ConvertTo-Json -Depth 6 | Set-Content (Join-Path $post 'execution.json') -Encoding UTF8

  $validation = @"
RELEASE: $release
STATUS: DEPLOYED_SOURCE_VERIFIED
SCRIPT ID: $resolvedScriptId
CHANGED FILES:
$($changed -join "`r`n")

GUARDS PASSED:
- clasp authorization
- package self-test
- unified Task Mapping fingerprint
- PRE source captured
- exactly two allowlisted PreInspect files changed
- syntax check
- fresh source unchanged immediately before push
- POST full-project SHA equals WORK

RUNTIME FEATURE VERIFICATION:
PENDING_REAL_PREINSPECT_ROW

GITHUB:
Use the connected ChatGPT GitHub connector. Do not run local git push.
"@
  $validation | Set-Content (Join-Path $post 'VALIDATION_REPORT.txt') -Encoding UTF8

  Write-Host '10/10 Package verified POST snapshot'
  if (Test-Path $desktopZip) { Remove-Item $desktopZip -Force }
  Compress-Archive -Path (Join-Path $post '*') -DestinationPath $desktopZip -CompressionLevel Optimal

  Write-Host ''
  Write-Host 'DEPLOYED_SOURCE_VERIFIED'
  Write-Host "Changed files: $($changed -join ', ')"
  Write-Host "Verified POST ZIP: $desktopZip"
  Write-Host 'Runtime organizer -> employee verification is still required on one real PreInspect row.'
  Write-Host 'Upload the POST ZIP to ChatGPT for the connected GitHub archive.'
}
catch {
  $originalError = $_
  if ($pushStarted) {
    Write-Warning 'Deployment did not verify. Attempting automatic rollback to PRE.'
    try {
      Push-Location $pre
      try { Invoke-Clasp @('push','--force') } finally { Pop-Location }

      New-Item -ItemType Directory -Path $rollbackPost -Force | Out-Null
      Push-Location $rollbackPost
      try { Invoke-Clasp @('clone',$resolvedScriptId,'--rootDir','src') } finally { Pop-Location }
      $rollbackManifest = Get-SourceManifest (Join-Path $rollbackPost 'src')
      Assert-ManifestsEqual $preManifest $rollbackManifest 'ROLLBACK read-back verification'
      Write-Warning 'ROLLBACK_VERIFIED: live source restored to PRE.'
    }
    catch {
      throw "DEPLOYMENT FAILED: $($originalError.Exception.Message) | ROLLBACK ALSO FAILED: $($_.Exception.Message)"
    }
  }
  throw $originalError
}

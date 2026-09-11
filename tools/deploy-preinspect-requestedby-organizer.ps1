param(
  [string]$ScriptId = '1E86mhD2dZcOFpqWnCvoIpwEkwZ0MA63MgM8DifV6WyB2FvVQkRWKIZ_m',
  [string]$ClaspVersion = '3.3.0'
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$release = 'R3.4.21_REQUESTED_BY_ORGANIZER_EMPLOYEE'
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$root = Join-Path $env:TEMP ("TaskMapping-$release-$stamp")
$pre = Join-Path $root 'PRE'
$work = Join-Path $root 'WORK'
$fresh = Join-Path $root 'FRESH'
$post = Join-Path $root 'POST'
$patcher = Join-Path $PSScriptRoot 'patch-preinspect-requestedby-organizer.js'
$desktopZip = Join-Path ([Environment]::GetFolderPath('Desktop')) ("TaskMapping-$release-POST-$stamp.zip")

function Invoke-Clasp([string[]]$Args) {
  & npx -y "@google/clasp@$ClaspVersion" @Args
  if ($LASTEXITCODE -ne 0) { throw "clasp command failed: $($Args -join ' ')" }
}

function Get-SourceManifest([string]$SrcRoot) {
  $items = @{}
  Get-ChildItem -Path $SrcRoot -File -Recurse | Sort-Object FullName | ForEach-Object {
    $rel = $_.FullName.Substring($SrcRoot.Length).TrimStart('\','/') -replace '\\','/'
    $items[$rel] = (Get-FileHash $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
  }
  return $items
}

function Assert-ManifestsEqual($A, $B, [string]$Label) {
  $all = @($A.Keys + $B.Keys | Sort-Object -Unique)
  $diff = @()
  foreach ($key in $all) {
    if (-not $A.ContainsKey($key) -or -not $B.ContainsKey($key) -or $A[$key] -ne $B[$key]) {
      $diff += $key
    }
  }
  if ($diff.Count) { throw "$Label failed. Differing files: $($diff -join ', ')" }
}

New-Item -ItemType Directory -Path $root -Force | Out-Null

Write-Host "=== $release ==="
Write-Host '1/8 Verify clasp authorization'
Invoke-Clasp @('show-authorized-user','--json')

Write-Host '2/8 Pull exact live source (PRE)'
New-Item -ItemType Directory -Path $pre -Force | Out-Null
Push-Location $pre
try { Invoke-Clasp @('clone',$ScriptId,'--rootDir','src') } finally { Pop-Location }
$preManifest = Get-SourceManifest (Join-Path $pre 'src')
if ($preManifest.Count -lt 30) { throw "Unexpectedly small live project: $($preManifest.Count) source files." }

Write-Host '3/8 Build WORK and apply PreInspect-only patch'
Copy-Item -Path $pre -Destination $work -Recurse
& node $patcher (Join-Path $work 'src')
if ($LASTEXITCODE -ne 0) { throw 'Organizer Requested By patcher failed.' }

$workManifest = Get-SourceManifest (Join-Path $work 'src')
$changed = @()
foreach ($key in @($preManifest.Keys + $workManifest.Keys | Sort-Object -Unique)) {
  if (-not $preManifest.ContainsKey($key) -or -not $workManifest.ContainsKey($key) -or $preManifest[$key] -ne $workManifest[$key]) {
    $changed += $key
  }
}
$expected = @('35_PreInspect_Task_Review.js','36_PreInspect_Task_Create.js')
$changedLeaf = @($changed | ForEach-Object { Split-Path $_ -Leaf } | Sort-Object)
if (($changedLeaf -join '|') -ne (($expected | Sort-Object) -join '|')) {
  throw "Changed-file guard failed. Expected only $($expected -join ', '); got $($changed -join ', ')"
}

Write-Host '4/8 Syntax-check changed files'
foreach ($leaf in $expected) {
  $file = Get-ChildItem -Path (Join-Path $work 'src') -File -Recurse | Where-Object { $_.Name -eq $leaf }
  if ($file.Count -ne 1) { throw "Expected exactly one $leaf in WORK." }
  & node --check $file[0].FullName
  if ($LASTEXITCODE -ne 0) { throw "Syntax check failed: $leaf" }
}

Write-Host '5/8 Freshness pull immediately before push'
New-Item -ItemType Directory -Path $fresh -Force | Out-Null
Push-Location $fresh
try { Invoke-Clasp @('clone',$ScriptId,'--rootDir','src') } finally { Pop-Location }
$freshManifest = Get-SourceManifest (Join-Path $fresh 'src')
Assert-ManifestsEqual $preManifest $freshManifest 'Freshness guard'

Write-Host '6/8 Push WORK to the existing bound Apps Script project'
Push-Location $work
try { Invoke-Clasp @('push','--force') } finally { Pop-Location }

Write-Host '7/8 POST pull and byte-for-byte source verification'
New-Item -ItemType Directory -Path $post -Force | Out-Null
Push-Location $post
try { Invoke-Clasp @('clone',$ScriptId,'--rootDir','src') } finally { Pop-Location }
$postManifest = Get-SourceManifest (Join-Path $post 'src')
Assert-ManifestsEqual $workManifest $postManifest 'POST read-back verification'

Write-Host '8/8 Package verified POST source for connected GitHub sync'
$record = [ordered]@{
  release = $release
  completedAtLocal = (Get-Date).ToString('o')
  scriptId = $ScriptId
  changedFiles = $changed
  appsScriptSourceVerification = 'PASS'
  runtimeFeatureVerification = 'PENDING'
  githubSync = 'PENDING_CHATGPT_CONNECTOR'
  requestedByRule = 'Calendar organizer email -> exact Striven Employee; Type=employee; no customer-contact fallback'
}
$record | ConvertTo-Json -Depth 6 | Set-Content (Join-Path $post 'execution.json') -Encoding UTF8

if (Test-Path $desktopZip) { Remove-Item $desktopZip -Force }
Compress-Archive -Path (Join-Path $post '*') -DestinationPath $desktopZip -CompressionLevel Optimal

Write-Host ''
Write-Host 'DEPLOYED_SOURCE_VERIFIED'
Write-Host "Release: $release"
Write-Host "Changed files: $($changed -join ', ')"
Write-Host "Verified POST ZIP: $desktopZip"
Write-Host 'Production source was read back byte-for-byte. Runtime organizer->employee verification is still required on a real PreInspect row.'
Write-Host 'Upload the POST ZIP to ChatGPT; GitHub sync will use the already-connected GitHub connector. Do NOT run git push locally.'

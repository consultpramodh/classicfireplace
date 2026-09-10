param(
  [Parameter(Mandatory = $true)]
  [string]$ScriptId,

  [string]$ClaspVersion = '3.3.0'
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$root = Join-Path $env:TEMP ("TaskMappingSourceCapture-$stamp")
$src = Join-Path $root 'src'
$manifestPath = Join-Path $root 'capture-manifest.json'
$scanPath = Join-Path $root 'sensitive-scan.txt'
$zipPath = Join-Path ([Environment]::GetFolderPath('Desktop')) ("TaskMapping-LIVE-$stamp.zip")

New-Item -ItemType Directory -Path $root -Force | Out-Null

Write-Host '=== 1/5 Verify clasp authorization ==='
& npx -y "@google/clasp@$ClaspVersion" show-authorized-user --json
if ($LASTEXITCODE -ne 0) { throw 'clasp authorization check failed.' }

Write-Host '=== 2/5 Clone exact live Apps Script HEAD ==='
Push-Location $root
try {
  & npx -y "@google/clasp@$ClaspVersion" clone $ScriptId --rootDir src
  if ($LASTEXITCODE -ne 0) { throw 'clasp clone failed.' }
}
finally {
  Pop-Location
}

if (-not (Test-Path $src)) { throw 'Expected src folder was not created.' }

$files = Get-ChildItem -Path $src -File -Recurse | Sort-Object FullName
if ($files.Count -eq 0) { throw 'No source files were captured.' }

Write-Host '=== 3/5 Build SHA-256 inventory ==='
$items = foreach ($file in $files) {
  $relative = $file.FullName.Substring($src.Length).TrimStart('\','/') -replace '\\','/'
  $hash = (Get-FileHash -Path $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
  [pscustomobject]@{
    path = "src/$relative"
    bytes = $file.Length
    sha256 = $hash
  }
}

$manifest = [ordered]@{
  capturedAtLocal = (Get-Date).ToString('o')
  claspVersion = $ClaspVersion
  sourceFileCount = $items.Count
  source = 'fresh clasp clone of live Apps Script HEAD'
  files = $items
}
$manifest | ConvertTo-Json -Depth 6 | Set-Content -Path $manifestPath -Encoding UTF8

Write-Host '=== 4/5 Produce review-only sensitive-content scan ==='
$patterns = @(
  @{ Name = 'email'; Regex = '[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}' },
  @{ Name = 'phone-like'; Regex = '(?<!\d)(?:\+?1[\s.\-()]*)?(?:\(?\d{3}\)?[\s.\-()]*)\d{3}[\s.\-]*\d{4}(?!\d)' },
  @{ Name = 'openai-key-like'; Regex = '\bsk-[A-Za-z0-9_-]{16,}\b' },
  @{ Name = 'google-api-key-like'; Regex = '\bAIza[0-9A-Za-z_-]{20,}\b' },
  @{ Name = 'private-key-marker'; Regex = '-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----' },
  @{ Name = 'credential-assignment'; Regex = '(?i)\b(?:api[_-]?key|client[_-]?secret|password|access[_-]?token|refresh[_-]?token)\b\s*[:=]\s*["''][^"'']{6,}["'']' }
)

$hits = New-Object System.Collections.Generic.List[string]
foreach ($file in $files) {
  $relative = $file.FullName.Substring($src.Length).TrimStart('\','/') -replace '\\','/'
  $lineNo = 0
  foreach ($line in (Get-Content -Path $file.FullName)) {
    $lineNo++
    foreach ($p in $patterns) {
      if ($line -match $p.Regex) {
        $safeLine = $line
        if ($safeLine.Length -gt 240) { $safeLine = $safeLine.Substring(0,240) + '…' }
        $hits.Add("[$($p.Name)] src/$relative:$lineNo $safeLine")
      }
    }
  }
}

@(
  'REVIEW REQUIRED BEFORE PUBLIC GITHUB SOURCE COMMIT',
  'This scan is heuristic. A zero-hit result is NOT proof that the source contains no sensitive data.',
  "Captured files: $($items.Count)",
  "Possible sensitive-content hits: $($hits.Count)",
  ''
) + $hits | Set-Content -Path $scanPath -Encoding UTF8

Write-Host '=== 5/5 Package source + manifest for ChatGPT review ==='
if (Test-Path $zipPath) { Remove-Item $zipPath -Force }
Compress-Archive -Path $src, $manifestPath, $scanPath -DestinationPath $zipPath -CompressionLevel Optimal

Write-Host ''
Write-Host 'CAPTURE COMPLETE'
Write-Host "Source files: $($items.Count)"
Write-Host "Possible sensitive-content hits: $($hits.Count)"
Write-Host "ZIP: $zipPath"
Write-Host ''
Write-Host 'Next: upload that ZIP to the Task Mapping ChatGPT conversation. Do not push it directly to the public GitHub repository.'

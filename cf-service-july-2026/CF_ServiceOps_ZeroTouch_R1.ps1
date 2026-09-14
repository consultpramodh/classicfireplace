param(
  [string]$ReleaseRoot = 'C:\Users\Pramodh\CF_ServiceOps_Release',
  [string]$ScriptId = '1QZp4NAFeA8LmWBN31ylJYdK4XFepBX1h2lP_APaR-d1lTAC-d8LA9x3g',
  [string]$DeploymentId = 'AKfycbwebnCvczGthe6Z_mvYmukLqFLB-9nk8hjNtNP3lR87CE1m_fEx2d9Bn_vpXMPCLUnPbA'
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$Revision = 'ZERO_TOUCH_R1_20260914'
$Node = 'C:\Program Files\nodejs\node.exe'
$Clasp = Join-Path $ReleaseRoot 'toolkit\node_modules\@google\clasp\build\src\index.js'
$Stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$RunRoot = Join-Path $ReleaseRoot ("zero_touch_release\$Revision-$Stamp")
$Pre = Join-Path $RunRoot 'PRE'
$Work = Join-Path $RunRoot 'WORK'
$Fresh = Join-Path $RunRoot 'FRESH'
$Post = Join-Path $RunRoot 'POST'
$ReportPath = Join-Path $RunRoot 'release-report.json'

function Fail([string]$Message) {
  throw "ZERO_TOUCH_RELEASE_ABORTED | $Message"
}

function Ensure-Dir([string]$Path) {
  if (-not (Test-Path $Path)) { New-Item -ItemType Directory -Path $Path -Force | Out-Null }
}

function Write-ClaspConfig([string]$Dir) {
  Ensure-Dir $Dir
  $cfg = @{ scriptId = $ScriptId; rootDir = '.' } | ConvertTo-Json -Compress
  [System.IO.File]::WriteAllText((Join-Path $Dir '.clasp.json'), $cfg, (New-Object System.Text.UTF8Encoding($false)))
}

function Invoke-Clasp([string[]]$ClaspArgs, [switch]$Capture) {
  if (-not (Test-Path $Node)) { Fail "Node not found at $Node" }
  if (-not (Test-Path $Clasp)) { Fail "Pinned clasp not found at $Clasp" }
  if ($Capture) {
    $out = & $Node $Clasp @ClaspArgs 2>&1
    if ($LASTEXITCODE -ne 0) { Fail ("clasp failed: " + ($out -join "`n")) }
    return ($out -join "`n")
  }
  & $Node $Clasp @ClaspArgs
  if ($LASTEXITCODE -ne 0) { Fail ("clasp failed: " + ($ClaspArgs -join ' ')) }
}

function Pull-Project([string]$Dir) {
  Write-ClaspConfig $Dir
  Invoke-Clasp -ClaspArgs @('pull','--project',$Dir)
}

function Push-Project([string]$Dir) {
  Invoke-Clasp -ClaspArgs @('push','--force','--project',$Dir)
}

function File-HashHex([string]$Path) {
  return (Get-FileHash -Algorithm SHA256 -Path $Path).Hash.ToLowerInvariant()
}

function Project-Inventory([string]$Dir) {
  $base = (Resolve-Path $Dir).Path.TrimEnd('\')
  $rows = @()
  Get-ChildItem -Path $Dir -File -Recurse -Force | Where-Object {
    $_.Name -ne '.clasp.json' -and $_.Name -ne '.claspignore' -and
    @('.js','.gs','.html','.json') -contains $_.Extension.ToLowerInvariant()
  } | Sort-Object FullName | ForEach-Object {
    $rel = $_.FullName.Substring($base.Length).TrimStart('\')
    $rows += [pscustomobject]@{ path=$rel.Replace('\','/'); sha256=(File-HashHex $_.FullName); bytes=$_.Length }
  }
  return $rows
}

function Compare-Inventories($A, $B, [string]$LabelA, [string]$LabelB) {
  $ma = @{}; foreach($r in $A){ $ma[$r.path]=$r.sha256 }
  $mb = @{}; foreach($r in $B){ $mb[$r.path]=$r.sha256 }
  $paths = @($ma.Keys + $mb.Keys | Sort-Object -Unique)
  $diff = @()
  foreach($p in $paths){
    if(-not $ma.ContainsKey($p)){ $diff += "$p missing from $LabelA"; continue }
    if(-not $mb.ContainsKey($p)){ $diff += "$p missing from $LabelB"; continue }
    if($ma[$p] -ne $mb[$p]){ $diff += "$p hash differs" }
  }
  if($diff.Count){ Fail ("$LabelA != $LabelB | " + ($diff -join '; ')) }
}

function Find-Source([string]$Dir, [string]$Stem) {
  $hits = @(Get-ChildItem -Path $Dir -File -Recurse -Force | Where-Object { $_.BaseName -eq $Stem -and @('.js','.gs') -contains $_.Extension.ToLowerInvariant() })
  if($hits.Count -ne 1){ Fail "Expected exactly one $Stem source file in $Dir; found $($hits.Count)" }
  return $hits[0].FullName
}

$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)
$Changed = New-Object System.Collections.Generic.List[string]
$PatchNotes = New-Object System.Collections.Generic.List[string]

function Read-Text([string]$Path){ return [System.IO.File]::ReadAllText($Path) }
function Write-Text([string]$Path,[string]$Text){ [System.IO.File]::WriteAllText($Path,$Text,$Utf8NoBom) }

function Replace-AllLiteral([string]$Path,[string]$Old,[string]$New,[string]$Note,[int]$MinCount=1) {
  $text=Read-Text $Path
  if($text.Contains($New) -and -not $text.Contains($Old)){
    $PatchNotes.Add("ALREADY_PATCHED | $Note") | Out-Null
    return
  }
  $count=0; $pos=0
  while(($i=$text.IndexOf($Old,$pos,[System.StringComparison]::Ordinal)) -ge 0){$count++;$pos=$i+$Old.Length}
  if($count -lt $MinCount){ Fail "Patch anchor missing for $Note in $Path" }
  $text=$text.Replace($Old,$New)
  Write-Text $Path $text
  if(-not $Changed.Contains($Path)){ $Changed.Add($Path) | Out-Null }
  $PatchNotes.Add("PATCHED x$count | $Note") | Out-Null
}

function Replace-FunctionBlock([string]$Path,[string]$StartMarker,[string]$NextMarker,[string]$Replacement,[string]$Note) {
  $text=Read-Text $Path
  if($text.Contains($Replacement.Trim()) -and -not $text.Contains($StartMarker + "`r`n  if")){
    $PatchNotes.Add("ALREADY_PATCHED | $Note") | Out-Null
    return
  }
  $s=$text.IndexOf($StartMarker,[System.StringComparison]::Ordinal)
  if($s -lt 0){ Fail "Function start anchor missing for $Note" }
  $e=$text.IndexOf($NextMarker,$s,[System.StringComparison]::Ordinal)
  if($e -lt 0){ Fail "Function end anchor missing for $Note" }
  $before=$text.Substring(0,$s)
  $after=$text.Substring($e)
  $newText=$before+$Replacement+"`r`n`r`n"+$after
  Write-Text $Path $newText
  if(-not $Changed.Contains($Path)){ $Changed.Add($Path) | Out-Null }
  $PatchNotes.Add("PATCHED | $Note") | Out-Null
}

function Syntax-Check([string]$Path) {
  $tmp = Join-Path $env:TEMP (([System.IO.Path]::GetRandomFileName()) + '.js')
  try {
    Copy-Item $Path $tmp -Force
    $out = & $Node --check $tmp 2>&1
    if($LASTEXITCODE -ne 0){ Fail ("Syntax check failed for $Path | " + ($out -join "`n")) }
  } finally { Remove-Item $tmp -Force -ErrorAction SilentlyContinue }
}

Write-Host '======================================================================'
Write-Host " CF ServiceOps $Revision - ZERO-TOUCH PRODUCTION HARDENING"
Write-Host '======================================================================'
Write-Host "Script ID: $ScriptId"
Write-Host "Release root: $ReleaseRoot"
Write-Host "Run root: $RunRoot"

Ensure-Dir $RunRoot

Write-Host "`n=== 1/9 Verify pinned clasp + Google authorization ==="
$version = Invoke-Clasp -ClaspArgs @('--version') -Capture
Write-Host $version
$auth = Invoke-Clasp -ClaspArgs @('show-authorized-user','--json') -Capture
Write-Host $auth
if($auth -notmatch '"loggedIn"\s*:\s*true'){ Fail 'clasp is not logged in.' }

Write-Host "`n=== 2/9 PRE pull - authoritative live source snapshot ==="
Pull-Project $Pre
$preInv=Project-Inventory $Pre
if($preInv.Count -lt 17){ Fail "Expected at least 17 project files; pulled $($preInv.Count)" }

Write-Host "`n=== 3/9 Build WORK from PRE and apply narrow zero-touch patch ==="
Ensure-Dir $Work
Get-ChildItem -Path $Pre -Force | ForEach-Object { Copy-Item $_.FullName $Work -Recurse -Force }
Write-ClaspConfig $Work

$f30=Find-Source $Work '30_Striven_Data'
$f60=Find-Source $Work '60_Striven_Write'
$f70=Find-Source $Work '70_Workflow_Automation'
$f99=Find-Source $Work '99_Production_Hardening'

Replace-AllLiteral $f30 `
  'var forced=options.forceApiRefresh===true&&options.operatorConfirmed===true;' `
  'var forced=(options.forceApiRefresh===true&&options.operatorConfirmed===true)||options.transactionalReconcile===true;' `
  'Transactional reconciliation can force causal cache refresh' 1

Replace-AllLiteral $f60 '.refreshCustomerData({})' '.refreshCustomerData({transactionalReconcile:true})' 'Request-scoped Customer refresh bypasses broad cache brake' 1
Replace-AllLiteral $f60 '.refreshLocationData({})' '.refreshLocationData({transactionalReconcile:true})' 'Post-write Location reconciliation gets causal refresh' 1
Replace-AllLiteral $f60 '.refreshOperationalData({})' '.refreshOperationalData({transactionalReconcile:true})' 'Sales Order active-work preflight gets causal operational refresh' 1
Replace-AllLiteral $f60 `
  "function campaignName_(r){return upper_(r['Campaign Code'])==='EB2026'?'Early Bird Offer 2026':'Clean and Service';}" `
  "function campaignName_(r){var p=serviceItemPolicy_(r);return p&&p.earlyBird?'Early Bird Offer 2026':'Clean and Service';}" `
  'Campaign name uses the same Early Bird policy as item selection' 1
Replace-AllLiteral $f60 `
  "function selectedItemId_(r){if(upper_(r['Campaign Code'])==='EB2026')return EARLY_BIRD_ITEM_ID;var v=clean_(PropertiesService.getScriptProperties().getProperty(STANDARD_SERVICE_ITEM_PROPERTY));return /^\d+$/.test(v)&&Number(v)>0?Number(v):0;}" `
  "function selectedItemId_(r){return Number(serviceItemPolicy_(r).itemId)||0;}" `
  'Preview fingerprint uses canonical service item policy' 1
Replace-AllLiteral $f60 `
  "if(!item.id)add('STANDARD_SERVICE_ITEM_ID_NOT_CONFIGURED'" `
  "if(!item.itemId)add('STANDARD_SERVICE_ITEM_ID_NOT_CONFIGURED'" `
  'Fix Sales Order validator item.id vs item.itemId defect' 1
Replace-AllLiteral $f60 `
  "'Item '+item.id+' current price could not be resolved." `
  "'Item '+item.itemId+' current price could not be resolved." `
  'Sales Order item-price blocker reports canonical itemId' 1

Replace-AllLiteral $f70 '.refreshCustomerData({})' '.refreshCustomerData({transactionalReconcile:true})' 'Initial request Customer cache refresh is causal' 1
Replace-AllLiteral $f70 '.refreshLocationData({})' '.refreshLocationData({transactionalReconcile:true})' 'Initial request Location cache refresh is causal' 1
Replace-AllLiteral $f70 'if(v5132Unsafe||v5132SameState){' 'if(v5132Unsafe){' 'Disable false v5.13.2 same-state manual-review circuit breaker' 1

$zeroTouchNormalize = @'
function CFH_shouldNormalizeDurableSalesOrder_(row) {
  /* CF_SERVICEOPS_ZERO_TOUCH_R1
   * A durable, verified Sales Order is not itself a human-review condition.
   * Genuine identity/tax/ambiguity failures are still raised by the writer/verifier.
   */
  return false;
}
'@
Replace-FunctionBlock $f99 'function CFH_shouldNormalizeDurableSalesOrder_(row) {' 'function CFH_salesOrderJournal_(row) {' $zeroTouchNormalize 'Disable obsolete durable-Quoted manual-review normalization'
Replace-AllLiteral $f99 "'SALES_ORDER_ALREADY_DURABLE_MANUAL_REVIEW'" "'SALES_ORDER_ALREADY_DURABLE_ZERO_TOUCH'" 'Durable Sales Order guard returns zero-touch status' 1
Replace-AllLiteral $f99 "'SALES_ORDER_CREATED_VERIFIED_MANUAL_REVIEW'" "'SALES_ORDER_CREATED_VERIFIED_ZERO_TOUCH'" 'Verified Sales Order result no longer advertises forced manual review' 1
Replace-AllLiteral $f99 'CF.StrivenData.refreshOperationalData({})' 'CF.StrivenData.refreshOperationalData({transactionalReconcile:true})' 'Idle operational refresh actually refreshes when 18-minute hardening threshold is reached' 1

Write-Host "Changed source files:"
$Changed | ForEach-Object { Write-Host ('  - ' + $_) }
$PatchNotes | ForEach-Object { Write-Host ('  ' + $_) }

Write-Host "`n=== 4/9 Static assertions + syntax checks ==="
$assert30=Read-Text $f30; $assert60=Read-Text $f60; $assert70=Read-Text $f70; $assert99=Read-Text $f99
if($assert30 -notmatch 'transactionalReconcile===true'){ Fail '30_Striven_Data transactional force assertion failed.' }
if($assert60 -match "if\(!item\.id\)add\('STANDARD_SERVICE_ITEM_ID_NOT_CONFIGURED'"){ Fail 'Old item.id validator still present.' }
if($assert60 -notmatch "if\(!item\.itemId\)add\('STANDARD_SERVICE_ITEM_ID_NOT_CONFIGURED'"){ Fail 'New item.itemId validator missing.' }
if($assert70 -match 'if\(v5132Unsafe\|\|v5132SameState\)'){ Fail 'Old v5.13.2 same-state circuit breaker still active.' }
if($assert99 -notmatch 'CF_SERVICEOPS_ZERO_TOUCH_R1'){ Fail '99 hardening zero-touch policy marker missing.' }
foreach($p in $Changed){ Syntax-Check $p }
Write-Host 'STATIC_TEST_PASS'

$workInv=Project-Inventory $Work
$preMap=@{};foreach($r in $preInv){$preMap[$r.path]=$r.sha256}
$workMap=@{};foreach($r in $workInv){$workMap[$r.path]=$r.sha256}
$changedRel=@();foreach($p in ($preMap.Keys + $workMap.Keys | Sort-Object -Unique)){ if((-not $preMap.ContainsKey($p)) -or (-not $workMap.ContainsKey($p)) -or $preMap[$p] -ne $workMap[$p]){$changedRel+=$p}}
$expectedStems=@('30_Striven_Data','60_Striven_Write','70_Workflow_Automation','99_Production_Hardening')
foreach($p in $changedRel){
  $stem=[System.IO.Path]::GetFileNameWithoutExtension($p)
  if($expectedStems -notcontains $stem){ Fail "Unexpected changed file: $p" }
}
if($changedRel.Count -ne 4){ Fail "Expected exactly 4 changed files; found $($changedRel.Count): $($changedRel -join ', ')" }
Write-Host ('Changed-file inventory PASS: ' + ($changedRel -join ', '))

Write-Host "`n=== 5/9 FRESH pull immediately before write ==="
Pull-Project $Fresh
$freshInv=Project-Inventory $Fresh
Compare-Inventories $preInv $freshInv 'PRE' 'FRESH'
Write-Host 'PASS: live HEAD still equals PRE byte-for-byte.'

Write-Host "`n=== 6/9 Push complete WORK project to the same Script ID ==="
Push-Project $Work

Write-Host "`n=== 7/9 POST pull - remote source read-back ==="
Pull-Project $Post
$postInv=Project-Inventory $Post
Compare-Inventories $workInv $postInv 'WORK' 'POST'
Write-Host 'REMOTE_SOURCE_PARITY_PASS'

Write-Host "`n=== 8/9 Production endpoint liveness check ==="
$health = $null
try {
  $url = "https://script.google.com/macros/s/$DeploymentId/exec"
  $health = Invoke-RestMethod -Uri $url -Method Get -TimeoutSec 30
  Write-Host ('Endpoint response: ' + ($health | ConvertTo-Json -Compress -Depth 8))
} catch {
  Write-Warning ('Source is verified live, but endpoint liveness check failed: ' + $_.Exception.Message)
}

Write-Host "`n=== 9/9 Write release report ==="
$report=[ordered]@{
  revision=$Revision
  generatedAt=(Get-Date).ToString('o')
  scriptId=$ScriptId
  deploymentId=$DeploymentId
  runRoot=$RunRoot
  sourceStatus='REMOTE_SOURCE_VERIFIED'
  changedFiles=$changedRel
  patchNotes=@($PatchNotes)
  preInventory=$preInv
  workInventory=$workInv
  postInventory=$postInv
  health=$health
  behaviorTarget=[ordered]@{
    intakeStartsAutomatically=$true
    falseSameStateManualParkDisabled=$true
    transactionalCacheRefreshEnabled=$true
    serviceItemValidatorFixed=$true
    earlyBirdPolicyUnified=$true
    durableQuotedForcedManualReviewDisabled=$true
    successfulSalesOrderNextAction='SCHEDULE SERVICE'
    uncertainRemoteWritePolicy='RECONCILE_NEVER_BLIND_RETRY'
  }
}
[System.IO.File]::WriteAllText($ReportPath,($report|ConvertTo-Json -Depth 12),$Utf8NoBom)

Write-Host "`n======================================================================"
Write-Host ' ZERO-TOUCH R1 SOURCE UPDATE COMPLETE AND REMOTE-VERIFIED'
Write-Host '======================================================================'
Write-Host "Report: $ReportPath"
Write-Host 'The next incoming request is the automatic production canary.'
Write-Host 'Expected successful endpoint: SALES ORDER CREATED -> SCHEDULE SERVICE.'
Write-Host 'No manual rerun button should be required for normal technical continuation.'

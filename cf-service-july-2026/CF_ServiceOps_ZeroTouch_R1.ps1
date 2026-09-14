param(
  [string]$ReleaseRoot='C:\Users\Pramodh\CF_ServiceOps_Release',
  [string]$ScriptId='1QZp4NAFeA8LmWBN31ylJYdK4XFepBX1h2lP_APaR-d1lTAC-d8LA9x3g'
)
$ErrorActionPreference='Stop'; Set-StrictMode -Version Latest
$Node='C:\Program Files\nodejs\node.exe'
$Clasp=Join-Path $ReleaseRoot 'toolkit\node_modules\@google\clasp\build\src\index.js'
$Stamp=Get-Date -Format 'yyyyMMdd-HHmmss'
$Root=Join-Path $ReleaseRoot "zero_touch_release\R1-$Stamp"
$Pre=Join-Path $Root PRE; $Work=Join-Path $Root WORK; $Fresh=Join-Path $Root FRESH; $Post=Join-Path $Root POST
$Utf8=New-Object System.Text.UTF8Encoding($false)
function Fail($m){throw "ZERO_TOUCH_R1_ABORTED | $m"}
function Dir($p){if(-not(Test-Path $p)){New-Item -ItemType Directory -Path $p -Force|Out-Null}}
function Cfg($d){Dir $d; [IO.File]::WriteAllText((Join-Path $d '.clasp.json'),(@{scriptId=$ScriptId;rootDir='.'}|ConvertTo-Json -Compress),$Utf8)}
function Clasp([string[]]$a){if(-not(Test-Path $Node)){Fail "Node missing: $Node"};if(-not(Test-Path $Clasp)){Fail "clasp missing: $Clasp"};& $Node $Clasp @a;if($LASTEXITCODE-ne 0){Fail("clasp failed: "+($a-join' '))}}
function Pull($d){Cfg $d;Clasp @('pull','--project',$d)}
function Push($d){Clasp @('push','--force','--project',$d)}
function Hash($p){(Get-FileHash -Algorithm SHA256 $p).Hash.ToLowerInvariant()}
function Inv($d){$b=(Resolve-Path $d).Path.TrimEnd('\');@(Get-ChildItem $d -File -Recurse -Force|?{$_.Name-ne'.clasp.json'-and $_.Name-ne'.claspignore'-and @('.js','.gs','.html','.json')-contains $_.Extension.ToLowerInvariant()}|Sort FullName|%{[pscustomobject]@{path=$_.FullName.Substring($b.Length).TrimStart('\').Replace('\','/');sha=(Hash $_.FullName)}})}
function Same($a,$b,$la,$lb){$x=@{};$y=@{};foreach($r in $a){$x[$r.path]=$r.sha};foreach($r in $b){$y[$r.path]=$r.sha};$d=@();foreach($p in @($x.Keys+$y.Keys|Sort -Unique)){if(-not$x.ContainsKey($p)-or-not$y.ContainsKey($p)-or$x[$p]-ne$y[$p]){$d+=$p}};if($d.Count){Fail "$la != $lb | $($d-join', ')"}}
function Src($d,$stem){$h=@(Get-ChildItem $d -File -Recurse|?{$_.BaseName-eq$stem-and @('.js','.gs')-contains $_.Extension.ToLowerInvariant()});if($h.Count-ne1){Fail "Expected one $stem, found $($h.Count)"};$h[0].FullName}
function Text($p){[IO.File]::ReadAllText($p)}
function Save($p,$t){[IO.File]::WriteAllText($p,$t,$Utf8)}
function Rep($p,$old,$new,$label){$t=Text $p;if($t.Contains($new)-and-not$t.Contains($old)){return};if(-not$t.Contains($old)){Fail "Missing anchor: $label"};Save $p ($t.Replace($old,$new));Write-Host "PATCHED | $label"}
function Block($p,$start,$next,$replacement,$label){$t=Text $p;$s=$t.IndexOf($start);$e=$t.IndexOf($next,$s);if($s-lt0-or$e-lt0){Fail "Missing function anchors: $label"};Save $p ($t.Substring(0,$s)+$replacement+"`r`n`r`n"+$t.Substring($e));Write-Host "PATCHED | $label"}
function Check($p){$tmp=Join-Path $env:TEMP (([IO.Path]::GetRandomFileName())+'.js');try{Copy-Item $p $tmp -Force;& $Node --check $tmp;if($LASTEXITCODE-ne0){Fail "Syntax failed: $p"}}finally{Remove-Item $tmp -Force -ErrorAction SilentlyContinue}}

Write-Host '=== CF ServiceOps ZERO-TOUCH R1 ==='
Clasp @('--version'); Clasp @('show-authorized-user','--json')
Dir $Root
Write-Host '1. PRE pull'; Pull $Pre; $pre=Inv $Pre
if($pre.Count-lt17){Fail "Expected >=17 project files; got $($pre.Count)"}
Write-Host '2. Build WORK'; Dir $Work; Get-ChildItem $Pre -Force|%{Copy-Item $_.FullName $Work -Recurse -Force}; Cfg $Work
$f30=Src $Work '30_Striven_Data';$f60=Src $Work '60_Striven_Write';$f70=Src $Work '70_Workflow_Automation';$f99=Src $Work '99_Production_Hardening'
Rep $f30 'var forced=options.forceApiRefresh===true&&options.operatorConfirmed===true;' 'var forced=(options.forceApiRefresh===true&&options.operatorConfirmed===true)||options.transactionalReconcile===true;' 'transaction-scoped refresh bypass'
Rep $f60 '.refreshCustomerData({})' '.refreshCustomerData({transactionalReconcile:true})' 'customer causal refresh'
Rep $f60 '.refreshLocationData({})' '.refreshLocationData({transactionalReconcile:true})' 'location causal refresh'
Rep $f60 '.refreshOperationalData({})' '.refreshOperationalData({transactionalReconcile:true})' 'operational causal refresh'
Rep $f60 "function campaignName_(r){return upper_(r['Campaign Code'])==='EB2026'?'Early Bird Offer 2026':'Clean and Service';}" "function campaignName_(r){var p=serviceItemPolicy_(r);return p&&p.earlyBird?'Early Bird Offer 2026':'Clean and Service';}" 'canonical campaign policy'
Rep $f60 "function selectedItemId_(r){if(upper_(r['Campaign Code'])==='EB2026')return EARLY_BIRD_ITEM_ID;var v=clean_(PropertiesService.getScriptProperties().getProperty(STANDARD_SERVICE_ITEM_PROPERTY));return /^\d+$/.test(v)&&Number(v)>0?Number(v):0;}" "function selectedItemId_(r){return Number(serviceItemPolicy_(r).itemId)||0;}" 'canonical item policy'
Rep $f60 "if(!item.id)add('STANDARD_SERVICE_ITEM_ID_NOT_CONFIGURED'" "if(!item.itemId)add('STANDARD_SERVICE_ITEM_ID_NOT_CONFIGURED'" 'item.id -> item.itemId validator'
Rep $f60 "'Item '+item.id+' current price could not be resolved." "'Item '+item.itemId+' current price could not be resolved." 'itemId error text'
Rep $f70 '.refreshCustomerData({})' '.refreshCustomerData({transactionalReconcile:true})' 'workflow customer causal refresh'
Rep $f70 '.refreshLocationData({})' '.refreshLocationData({transactionalReconcile:true})' 'workflow location causal refresh'
Rep $f70 'if(v5132Unsafe||v5132SameState){' 'if(v5132Unsafe){' 'remove false same-state manual park'
$normalize=@'
function CFH_shouldNormalizeDurableSalesOrder_(row) {
  /* CF_SERVICEOPS_ZERO_TOUCH_R1: durable verified SO is not itself a human-review condition. */
  return false;
}
'@
Block $f99 'function CFH_shouldNormalizeDurableSalesOrder_(row) {' 'function CFH_salesOrderJournal_(row) {' $normalize 'disable quoted-order forced manual review'
Rep $f99 "'SALES_ORDER_ALREADY_DURABLE_MANUAL_REVIEW'" "'SALES_ORDER_ALREADY_DURABLE_ZERO_TOUCH'" 'durable SO zero-touch result'
Rep $f99 "'SALES_ORDER_CREATED_VERIFIED_MANUAL_REVIEW'" "'SALES_ORDER_CREATED_VERIFIED_ZERO_TOUCH'" 'verified SO zero-touch result'
Rep $f99 'CF.StrivenData.refreshOperationalData({})' 'CF.StrivenData.refreshOperationalData({transactionalReconcile:true})' 'hardening operational causal refresh'
foreach($p in @($f30,$f60,$f70,$f99)){Check $p}
$work=Inv $Work
$pm=@{};$wm=@{};foreach($r in $pre){$pm[$r.path]=$r.sha};foreach($r in $work){$wm[$r.path]=$r.sha};$chg=@();foreach($p in @($pm.Keys+$wm.Keys|Sort -Unique)){if(-not$pm.ContainsKey($p)-or-not$wm.ContainsKey($p)-or$pm[$p]-ne$wm[$p]){$chg+=$p}}
$expected=@('30_Striven_Data','60_Striven_Write','70_Workflow_Automation','99_Production_Hardening');foreach($p in $chg){if($expected-notcontains[IO.Path]::GetFileNameWithoutExtension($p)){Fail "Unexpected changed file: $p"}};if($chg.Count-ne4){Fail "Expected exactly 4 changed files; got $($chg.Count)"}
Write-Host ('Changed files: '+($chg-join', '))
Write-Host '3. FRESH pre-write pull'; Pull $Fresh; Same $pre (Inv $Fresh) PRE FRESH; Write-Host 'PRE/FRESH parity PASS'
Write-Host '4. Push full WORK'; Push $Work
Write-Host '5. POST read-back'; Pull $Post; Same $work (Inv $Post) WORK POST
Write-Host 'REMOTE_SOURCE_PARITY_PASS'
Write-Host "Rollback PRE: $Pre"
Write-Host 'ZERO-TOUCH R1 SOURCE UPDATE COMPLETE AND REMOTE-VERIFIED'

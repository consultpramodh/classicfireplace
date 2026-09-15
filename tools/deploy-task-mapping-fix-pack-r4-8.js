#!/usr/bin/env node
'use strict';
const fs=require('fs'), os=require('os'), path=require('path'), crypto=require('crypto'), cp=require('child_process');
const manifestPath=process.argv[2]; if(!manifestPath) throw new Error('Usage: node deploy-r48.js <manifest.json>');
const repoRoot=process.cwd(); const manifest=JSON.parse(fs.readFileSync(path.resolve(repoRoot,manifestPath),'utf8'));
const scriptId=String(manifest.scriptId||'').trim(); const claspVersion=String(manifest.claspVersion||'3.3.0'); const expectedPreFileCount=Number(manifest.expectedPreFileCount||59);
if(!scriptId) throw new Error('release manifest missing scriptId');
const targetPI='35_PreInspect_Task_Review.js', targetR4='97_Task_Mapping_Fix_Pack_R4.js';
function run(c,a,cwd){const r=cp.spawnSync(c,a,{cwd,env:process.env,encoding:'utf8',stdio:['ignore','pipe','pipe']});process.stdout.write(r.stdout||'');process.stderr.write(r.stderr||'');if(r.status!==0)throw new Error(`${c} ${a.join(' ')} failed with exit ${r.status}`);return r.stdout||'';}
function clasp(a,cwd){return run('npx',['-y',`@google/clasp@${claspVersion}`,...a],cwd);}
function sha256(f){return crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');}
function listFiles(d){return fs.readdirSync(d,{withFileTypes:true}).filter(e=>e.isFile()).map(e=>e.name).sort();}
function hashMap(d,n){const o={};n.forEach(x=>o[x]=sha256(path.join(d,x)));return o;}
function copyDir(s,d){fs.cpSync(s,d,{recursive:true});}
function assertExactHashes(e,a,n,l){const bad=[];n.forEach(x=>{if(e[x]!==a[x])bad.push(x)});if(bad.length)throw new Error(`${l}: hash mismatch ${bad.join(', ')}`);}

const oldBlock=`  const priorUncertain = String(props.getProperty(uncertainKey) || '').trim();
  if (id === 18476 || priorUncertain) {
    throw new Error(
      'BLOCKED_FIELD854_UNCERTAIN_WRITE: Task ' + id +
      ' has a prior successful/uncertain Field 854 mutation but canonical v1 does not confirm the requested value. ' +
      'No second write attempted. Manual/API-contract review required.'
    );
  }`;

const newBlock=`  const priorUncertain = String(props.getProperty(uncertainKey) || '').trim();
  if (id === 18476 || priorUncertain) {
    const diagnostic = preinspectR48CaptureField854Contract_(id, desiredValue, beforeV1);
    Logger.log(JSON.stringify(diagnostic, null, 2));
    throw new Error(
      'BLOCKED_FIELD854_UNCERTAIN_WRITE: Task ' + id +
      ' has a prior successful/uncertain Field 854 mutation and canonical v1 does not confirm the requested value. ' +
      'R4.8 captured read-only API-contract evidence. No second write attempted.'
    );
  }`;

const helperText=`

/************************************************************
 * R4.8 — FIELD 854 READ-ONLY API CONTRACT CAPTURE
 *
 * Purpose:
 * - Never guesses another Field 854 write shape.
 * - When R4.7 blocks an uncertain prior write, inspect the exact
 *   v1/v2 task + custom-field read surfaces and OPTIONS metadata.
 * - No Striven mutation and no Calendar mutation.
 ************************************************************/
function preinspectR48ExtractField854_(json) {
  if (!json) return null;
  const candidates = [];
  if (Array.isArray(json)) candidates.push(json);
  if (json && typeof json === 'object') {
    ['customFields','CustomFields','infoCustomFields','InfoCustomFields','data','Data','items','Items','results','Results'].forEach(function(key) {
      if (Array.isArray(json[key])) candidates.push(json[key]);
    });
  }
  for (let a = 0; a < candidates.length; a++) {
    const list = candidates[a];
    for (let i = 0; i < list.length; i++) {
      const field = list[i] || {};
      const fid = Number(field.id !== undefined ? field.id : field.Id !== undefined ? field.Id : field.customFieldId !== undefined ? field.customFieldId : field.CustomFieldId);
      if (fid === 854) return field;
    }
  }
  if (json && typeof json === 'object') {
    const directId = Number(json.id !== undefined ? json.id : json.Id !== undefined ? json.Id : json.customFieldId !== undefined ? json.customFieldId : json.CustomFieldId);
    if (directId === 854) return json;
  }
  return null;
}

function preinspectR48FieldContractSummary_(field) {
  if (!field || typeof field !== 'object') return null;
  let value = null;
  if (field.value !== undefined) value = field.value;
  else if (field.Value !== undefined) value = field.Value;
  else if (field.valueText !== undefined) value = field.valueText;
  else if (field.ValueText !== undefined) value = field.ValueText;
  const semantic = value === null || value === undefined ? '' : preinspectR346aSemanticField854Text_(value);
  return {
    keys: Object.keys(field).sort(),
    id: field.id !== undefined ? field.id : field.Id,
    name: field.name !== undefined ? field.name : field.Name,
    fieldType: field.fieldType !== undefined ? field.fieldType : field.FieldType,
    sourceId: field.sourceId !== undefined ? field.sourceId : field.SourceId,
    isRequired: field.isRequired !== undefined ? field.isRequired : field.IsRequired,
    valueType: value === null ? 'null' : typeof value,
    semanticLength: semantic ? semantic.length : 0,
    semanticPreview: semantic ? semantic.slice(0, 160) : ''
  };
}

function preinspectR48ResponseSummary_(label, url, response) {
  const json = response && response.json !== undefined ? response.json : null;
  const field = preinspectR48ExtractField854_(json);
  return {
    label: label,
    url: url,
    method: 'GET',
    statusCode: response ? response.statusCode : null,
    topLevelType: Array.isArray(json) ? 'array' : (json === null ? 'null' : typeof json),
    topLevelKeys: json && !Array.isArray(json) && typeof json === 'object' ? Object.keys(json).sort().slice(0, 80) : [],
    arrayLength: Array.isArray(json) ? json.length : null,
    field854: preinspectR48FieldContractSummary_(field),
    non2xxPreview: response && (response.statusCode < 200 || response.statusCode >= 300) ? String(response.text || '').slice(0, 700) : ''
  };
}

function preinspectR48GetProbe_(label, url, headers) {
  try {
    const response = preinspectR345bRequestJson_('get', url, null, headers);
    return preinspectR48ResponseSummary_(label, url, response);
  } catch (err) {
    return { label: label, url: url, method: 'GET', statusCode: null, error: String(err && err.message ? err.message : err).slice(0, 900) };
  }
}

function preinspectR48OptionsProbe_(label, url, headers) {
  try {
    const response = UrlFetchApp.fetch(url, { method: 'options', headers: headers, muteHttpExceptions: true, followRedirects: false });
    const responseHeaders = response.getAllHeaders ? response.getAllHeaders() : {};
    const allow = responseHeaders.Allow || responseHeaders.allow || responseHeaders['Access-Control-Allow-Methods'] || responseHeaders['access-control-allow-methods'] || '';
    return { label: label, url: url, method: 'OPTIONS', statusCode: response.getResponseCode(), allow: String(allow || ''), responsePreview: String(response.getContentText() || '').slice(0, 500) };
  } catch (err) {
    return { label: label, url: url, method: 'OPTIONS', statusCode: null, error: String(err && err.message ? err.message : err).slice(0, 900) };
  }
}

function preinspectR48CaptureField854Contract_(taskId, desiredValue, knownV1Snapshot) {
  const id = Number(taskId) || 0;
  if (!id) throw new Error('R4.8 Field 854 diagnostic requires a valid Task ID.');
  const auth = preinspectR30ApiAuth_();
  const base = String(auth.apiBaseUrl || 'https://api.striven.com').replace(/\\/+$/, '');
  const headers = tm_getStrivenHeaders_();
  const v1Task = base + '/v1/tasks/' + encodeURIComponent(id);
  const v2Task = base + '/v2/tasks/' + encodeURIComponent(id);
  const v1Collection = v1Task + '/custom-fields';
  const v2Collection = v2Task + '/custom-fields';
  const v1Single = v1Collection + '/854';
  const v2Single = v2Collection + '/854';
  const probes = [
    preinspectR48GetProbe_('V2_TASK', v2Task, headers),
    preinspectR48GetProbe_('V1_CUSTOM_FIELDS_COLLECTION', v1Collection, headers),
    preinspectR48GetProbe_('V2_CUSTOM_FIELDS_COLLECTION', v2Collection, headers),
    preinspectR48GetProbe_('V1_FIELD_854', v1Single, headers),
    preinspectR48GetProbe_('V2_FIELD_854', v2Single, headers)
  ];
  const optionTargets = [
    ['V1_TASK_OPTIONS', v1Task],
    ['V1_CUSTOM_FIELDS_OPTIONS', v1Collection],
    ['V1_FIELD_854_OPTIONS', v1Single],
    ['V2_CUSTOM_FIELDS_OPTIONS', v2Collection],
    ['V2_FIELD_854_OPTIONS', v2Single]
  ];
  const options = optionTargets.map(function(pair) { return preinspectR48OptionsProbe_(pair[0], pair[1], headers); });
  const known = knownV1Snapshot || preinspectR47ReadCanonicalV1Field854_(id);
  const desiredSemantic = preinspectR346aSemanticField854Text_(desiredValue);
  return {
    mode: 'PREINSPECT_FIELD854_CONTRACT_DIAGNOSTIC_R48',
    status: 'READ_ONLY_COMPLETE',
    taskId: id,
    fieldId: 854,
    writesPerformed: false,
    strivenWritesPerformed: false,
    calendarWritesPerformed: false,
    desiredSemanticLength: desiredSemantic === null ? null : desiredSemantic.length,
    canonicalV1TaskField854: preinspectR48FieldContractSummary_(known && known.field ? known.field : null),
    getProbes: probes,
    optionsProbes: options,
    conclusion: 'Evidence capture only. No alternate Field 854 write contract is activated by R4.8.'
  };
}
`;

const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'task-mapping-r4-8-'));
const preRoot=path.join(tmp,'PRE'),freshRoot=path.join(tmp,'FRESH'),workRoot=path.join(tmp,'WORK'),postRoot=path.join(tmp,'POST');
[preRoot,freshRoot,workRoot,postRoot].forEach(d=>fs.mkdirSync(d,{recursive:true}));
const outputDir=path.resolve(repoRoot,'task-mapping-r4-8-output'); fs.mkdirSync(outputDir,{recursive:true});
const evidencePath=path.join(outputDir,'evidence.json'), preArchiveDir=path.join(outputDir,'PRE_SOURCE');
const evidence={schemaVersion:1,release:manifest.release||'TASK_MAPPING_FIX_PACK_R4_8',scriptId,startedAt:new Date().toISOString(),status:'STARTED'}; let pushed=false;
try {
  console.log('=== R4.8 1/8 authorize ==='); clasp(['show-authorized-user','--json'],repoRoot);
  console.log('=== R4.8 2/8 PRE clone ==='); clasp(['clone',scriptId,'--rootDir','src'],preRoot);
  const preSrc=path.join(preRoot,'src'), preNames=listFiles(preSrc);
  if(preNames.length!==expectedPreFileCount) throw new Error(`expected ${expectedPreFileCount} PRE files, found ${preNames.length}`);
  [targetPI,targetR4].forEach(n=>{if(!preNames.includes(n))throw new Error('PRE missing '+n)});
  const preHashes=hashMap(preSrc,preNames); copyDir(preRoot,preArchiveDir);
  console.log('=== R4.8 3/8 build patch ==='); copyDir(preRoot,workRoot);
  const workSrc=path.join(workRoot,'src'), piPath=path.join(workSrc,targetPI), r4Path=path.join(workSrc,targetR4);
  let pi=fs.readFileSync(piPath,'utf8'), r4=fs.readFileSync(r4Path,'utf8');
  if(!pi.includes('function preinspectR47EnsureInstallNotesCanonical_(')) throw new Error('Expected live R4.7 Field 854 helper missing');
  if(!r4.includes('TM_FIX_PACK_R4_7_20260915')) throw new Error('Unexpected live R4.7 marker');
  if(!pi.includes(oldBlock)) throw new Error('Expected R4.7 uncertain-write block not found; refusing fuzzy patch');
  pi=pi.replace(oldBlock,newBlock);
  if(!pi.includes('function preinspectR48CaptureField854Contract_(')) pi+=helperText;
  r4=r4.replace('TM_FIX_PACK_R4_7_20260915','TM_FIX_PACK_R4_8_20260915');
  fs.writeFileSync(piPath,pi); fs.writeFileSync(r4Path,r4);
  [piPath,r4Path].forEach(f=>run(process.execPath,['--check',f],repoRoot));
  const changed=[targetPI,targetR4], untouched=preNames.filter(n=>!changed.includes(n));
  assertExactHashes(preHashes,hashMap(workSrc,untouched),untouched,'WORK preservation');
  console.log('=== R4.8 4/8 freshness clone ==='); clasp(['clone',scriptId,'--rootDir','src'],freshRoot);
  const freshSrc=path.join(freshRoot,'src'), freshNames=listFiles(freshSrc);
  if(JSON.stringify(freshNames)!==JSON.stringify(preNames)) throw new Error('Freshness file set changed');
  assertExactHashes(preHashes,hashMap(freshSrc,preNames),preNames,'freshness guard');
  console.log('=== R4.8 5/8 push ==='); clasp(['push','--force'],workRoot); pushed=true;
  console.log('=== R4.8 6/8 POST clone ==='); clasp(['clone',scriptId,'--rootDir','src'],postRoot);
  const postSrc=path.join(postRoot,'src'), postNames=listFiles(postSrc);
  if(JSON.stringify(postNames)!==JSON.stringify(preNames)) throw new Error('POST file set changed');
  const postHashes=hashMap(postSrc,postNames); assertExactHashes(preHashes,postHashes,untouched,'POST untouched preservation');
  [targetPI,targetR4].forEach(n=>run(process.execPath,['--check',path.join(postSrc,n)],repoRoot));
  console.log('=== R4.8 7/8 verify contracts ===');
  const postPI=fs.readFileSync(path.join(postSrc,targetPI),'utf8'), postR4=fs.readFileSync(path.join(postSrc,targetR4),'utf8');
  ['preinspectR48CaptureField854Contract_','PREINSPECT_FIELD854_CONTRACT_DIAGNOSTIC_R48','R4.8 captured read-only API-contract evidence'].forEach(m=>{if(!postPI.includes(m))throw new Error('POST PI missing '+m)});
  if(!postR4.includes('TM_FIX_PACK_R4_8_20260915')) throw new Error('POST R4 marker missing');
  evidence.status='DEPLOYED_SOURCE_VERIFIED'; evidence.completedAt=new Date().toISOString(); evidence.preFileCount=preNames.length; evidence.postFileCount=postNames.length; evidence.modifiedExistingFiles=changed;
  evidence.runtimeTest='SELECTED PI TASK 18476 ONCE; R4.8 MUST CAPTURE READ-ONLY FIELD854 CONTRACT EVIDENCE AND MUST NOT RETRY FIELD854 WRITE';
  fs.writeFileSync(evidencePath,JSON.stringify(evidence,null,2));
  console.log('=== R4.8 8/8 complete ==='); console.log('DEPLOYED_SOURCE_VERIFIED');
} catch(err) {
  evidence.status='FAILED'; evidence.error=String(err&&err.stack?err.stack:err); evidence.failedAt=new Date().toISOString(); fs.writeFileSync(evidencePath,JSON.stringify(evidence,null,2));
  if(pushed){try{console.error('Attempting automatic rollback to PRE source...');clasp(['push','--force'],preRoot);evidence.rollback='PRE_PUSH_ATTEMPTED';fs.writeFileSync(evidencePath,JSON.stringify(evidence,null,2));}catch(rb){evidence.rollback='FAILED: '+String(rb&&rb.stack?rb.stack:rb);fs.writeFileSync(evidencePath,JSON.stringify(evidence,null,2));}}
  throw err;
}

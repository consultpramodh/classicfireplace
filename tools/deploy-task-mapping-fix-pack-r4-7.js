#!/usr/bin/env node
'use strict';
const fs=require('fs'), os=require('os'), path=require('path'), crypto=require('crypto'), cp=require('child_process');
const manifestPath=process.argv[2]; if(!manifestPath) throw new Error('Usage: node deploy-r47.js <manifest.json>');
const repoRoot=process.cwd(); const manifest=JSON.parse(fs.readFileSync(path.resolve(repoRoot,manifestPath),'utf8'));
const scriptId=String(manifest.scriptId||'').trim(); const claspVersion=String(manifest.claspVersion||'3.3.0'); const expectedPreFileCount=Number(manifest.expectedPreFileCount||59);
if(!scriptId) throw new Error('release manifest missing scriptId');
const targetPI='35_PreInspect_Task_Review.js', targetR4='97_Task_Mapping_Fix_Pack_R4.js';
function run(c,a,cwd){const r=cp.spawnSync(c,a,{cwd,env:process.env,encoding:'utf8',stdio:['ignore','pipe','pipe']});process.stdout.write(r.stdout||'');process.stderr.write(r.stderr||'');if(r.status!==0)throw new Error(`${c} ${a.join(' ')} failed with exit ${r.status}`);return r.stdout||'';}
function clasp(a,cwd){return run('npx',['-y',`@google/clasp@${claspVersion}`,...a],cwd);} function sha256(f){return crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');}
function listFiles(d){return fs.readdirSync(d,{withFileTypes:true}).filter(e=>e.isFile()).map(e=>e.name).sort();} function hashMap(d,n){const o={};n.forEach(x=>o[x]=sha256(path.join(d,x)));return o;} function copyDir(s,d){fs.cpSync(s,d,{recursive:true});}
function assertExactHashes(e,a,n,l){const bad=[];n.forEach(x=>{if(e[x]!==a[x])bad.push(x)});if(bad.length)throw new Error(`${l}: hash mismatch ${bad.join(', ')}`);}
function replaceNamedFunction(source,name,replacement){const esc=name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');const sig=new RegExp(`function\\s+${esc}\\s*\\(`);const m=sig.exec(source);if(!m)throw new Error('Could not find function '+name);const start=m.index,braceStart=source.indexOf('{',m.index+m[0].length);if(braceStart<0)throw new Error('Could not find opening brace for '+name);let depth=0,quote=null,escaped=false,lineComment=false,blockComment=false;for(let i=braceStart;i<source.length;i++){const ch=source[i],next=source[i+1];if(lineComment){if(ch==='\n')lineComment=false;continue;}if(blockComment){if(ch==='*'&&next==='/'){blockComment=false;i++;}continue;}if(quote){if(escaped){escaped=false;continue;}if(ch==='\\'){escaped=true;continue;}if(ch===quote)quote=null;continue;}if(ch==='/'&&next==='/'){lineComment=true;i++;continue;}if(ch==='/'&&next==='*'){blockComment=true;i++;continue;}if(ch==='\''||ch==='"'||ch==='`'){quote=ch;continue;}if(ch==='{')depth++;else if(ch==='}'){depth--;if(depth===0)return source.slice(0,start)+replacement.trim()+source.slice(i+1);}}throw new Error('Could not find closing brace for '+name);}

const newPushInstallNotes=`function preinspectR30PushInstallNotes_(ctx, preparedPlan) {
  const plan = preparedPlan || preinspectR32PrepareInstallNotes_(ctx);

  if (plan.status === 'NOT_NEEDED') {
    return {
      status: 'NOT_NEEDED',
      writesPerformed: false,
      field: 'Install Notes',
      customFieldId: PREINSPECT_R30_MANUAL.INSTALL_NOTES_FIELD_ID,
      reason: plan.reason
    };
  }

  const write = preinspectR47EnsureInstallNotesCanonical_(ctx.taskId, plan.desiredValue);

  return {
    status: write.status,
    writesPerformed: !!write.writesPerformed,
    field: 'Install Notes',
    customFieldId: PREINSPECT_R30_MANUAL.INSTALL_NOTES_FIELD_ID,
    source: 'Google Calendar Description',
    managedBlock: true,
    endpoint: write.endpoint || '',
    payloadShape: write.payloadShape || '',
    desiredValue: plan.desiredValue,
    verificationSource: write.verificationSource || '',
    reason: write.reason || ''
  };
}`;

const helperText=`

/************************************************************
 * R4.7 — FIELD 854 CANONICAL V1 VERIFICATION + NO-BLIND-RETRY
 ************************************************************/
function preinspectR47Field854UncertainKey_(taskId) {
  return 'PREINSPECT_FIELD854_UNCERTAIN_' + String(Number(taskId) || 0);
}

function preinspectR47ReadCanonicalV1Field854_(taskId) {
  const id = Number(taskId) || 0;
  if (!id) throw new Error('Field 854 canonical read requires a valid Task ID.');
  const auth = preinspectR30ApiAuth_();
  const base = String(auth.apiBaseUrl || 'https://api.striven.com').replace(/\\/+$/, '');
  const url = base + '/v1/tasks/' + encodeURIComponent(id);
  const res = preinspectR345bRequestJson_('get', url, null, tm_getStrivenHeaders_());
  if (res.statusCode < 200 || res.statusCode >= 300) {
    throw new Error('Field 854 canonical v1 read failed HTTP ' + res.statusCode + ': ' + String(res.text || '').slice(0, 1200));
  }
  const json = res.json && typeof res.json === 'object' ? res.json : {};
  const fields = Array.isArray(json.customFields) ? json.customFields : (Array.isArray(json.CustomFields) ? json.CustomFields : []);
  let target = null;
  for (let i = 0; i < fields.length; i++) {
    const f = fields[i] || {};
    const fid = Number(f.id !== undefined ? f.id : f.Id);
    if (fid === 854) { target = f; break; }
  }
  let rawValue = null;
  if (target) {
    if (target.value !== undefined) rawValue = target.value;
    else if (target.Value !== undefined) rawValue = target.Value;
    else if (target.valueText !== undefined) rawValue = target.valueText;
    else if (target.ValueText !== undefined) rawValue = target.ValueText;
  }
  return {
    taskId: id,
    endpoint: url,
    statusCode: res.statusCode,
    fieldFound: !!target,
    rawValue: rawValue,
    semanticValue: preinspectR346aSemanticField854Text_(rawValue),
    field: target
  };
}

function preinspectR47Field854CanonicalMatches_(snapshot, desiredValue) {
  if (!snapshot || !snapshot.fieldFound) return false;
  const desiredSemantic = preinspectR346aSemanticField854Text_(desiredValue);
  return desiredSemantic !== null && snapshot.semanticValue !== null && desiredSemantic === snapshot.semanticValue;
}

function preinspectR47EnsureInstallNotesCanonical_(taskId, desiredValue) {
  const id = Number(taskId) || 0;
  if (!id) throw new Error('Install Notes push requires a valid Task ID.');
  const desiredSemantic = preinspectR346aSemanticField854Text_(desiredValue);
  if (desiredSemantic === null) throw new Error('Install Notes desired value could not be normalized.');

  const props = PropertiesService.getScriptProperties();
  const uncertainKey = preinspectR47Field854UncertainKey_(id);
  const beforeV1 = preinspectR47ReadCanonicalV1Field854_(id);

  if (preinspectR47Field854CanonicalMatches_(beforeV1, desiredValue)) {
    props.deleteProperty(uncertainKey);
    const already = {
      mode: 'PREINSPECT_FIELD854_CANONICAL_V1',
      status: 'NOT_NEEDED_CANONICAL_V1_MATCH',
      taskId: id,
      fieldId: 854,
      writesPerformed: false,
      verificationSource: 'V1_TASK_CUSTOMFIELDS',
      reason: 'Canonical v1 Task CustomFields already contains the requested Calendar Install Notes. No retry performed.'
    };
    Logger.log(JSON.stringify(already, null, 2));
    return already;
  }

  const priorUncertain = String(props.getProperty(uncertainKey) || '').trim();
  if (id === 18476 || priorUncertain) {
    throw new Error(
      'BLOCKED_FIELD854_UNCERTAIN_WRITE: Task ' + id +
      ' has a prior successful/uncertain Field 854 mutation but canonical v1 does not confirm the requested value. ' +
      'No second write attempted. Manual/API-contract review required.'
    );
  }

  const auth = preinspectR30ApiAuth_();
  const taskUrl = String(auth.apiBaseUrl || 'https://api.striven.com').replace(/\\/+$/, '') + '/v2/tasks/' + encodeURIComponent(id);
  const headers = tm_getStrivenHeaders_();
  const before = preinspectR345bRequestJson_('get', taskUrl, null, headers);
  if (before.statusCode < 200 || before.statusCode >= 300) {
    throw new Error('Field 854 preflight v2 Task GET failed HTTP ' + before.statusCode + ': ' + String(before.text || '').slice(0, 1200));
  }
  const beforeInfo = preinspectR345bFindInfoCustomFields_(before.json);
  if (!beforeInfo || !Array.isArray(beforeInfo.fields)) throw new Error('Field 854 blocked: v2 Task GET did not expose InfoCustomFields. No PATCH performed.');
  const beforeFields = preinspectR345bClone_(beforeInfo.fields);
  const beforeMap = preinspectR345bFieldValueMap_(beforeFields);
  const target = preinspectR346FindFieldById_(beforeFields, 854);
  if (!target) throw new Error('Field 854 blocked: v2 Task InfoCustomFields does not contain Field 854. No PATCH performed.');

  preinspectR346SetExistingFieldValue_(target, desiredValue);
  const patchPayload = { Id: id, InfoCustomFields: beforeFields };
  const patch = preinspectR345bRequestJson_('patch', taskUrl, patchPayload, headers);
  if (patch.statusCode < 200 || patch.statusCode >= 300) {
    throw new Error('Field 854 task PATCH failed HTTP ' + patch.statusCode + ': ' + String(patch.text || '').slice(0, 1200));
  }

  const afterV1 = preinspectR47ReadCanonicalV1Field854_(id);
  if (!preinspectR47Field854CanonicalMatches_(afterV1, desiredValue)) {
    const uncertain = {
      taskId: id,
      fieldId: 854,
      at: new Date().toISOString(),
      patchHttpCode: patch.statusCode,
      desiredSemanticLength: desiredSemantic.length,
      canonicalV1SemanticLength: afterV1.semanticValue === null ? null : afterV1.semanticValue.length
    };
    props.setProperty(uncertainKey, JSON.stringify(uncertain));
    Logger.log(JSON.stringify({ mode:'PREINSPECT_FIELD854_UNCERTAIN_WRITE', status:'UNCERTAIN_WRITE', evidence:uncertain }, null, 2));
    throw new Error('UNCERTAIN_WRITE: Field 854 PATCH returned success but canonical v1 Task CustomFields did not confirm the requested Install Notes. No retry allowed.');
  }

  const after = preinspectR345bRequestJson_('get', taskUrl, null, headers);
  if (after.statusCode < 200 || after.statusCode >= 300) {
    props.setProperty(uncertainKey, JSON.stringify({taskId:id,fieldId:854,at:new Date().toISOString(),reason:'v2 parity read failed'}));
    throw new Error('UNCERTAIN_WRITE: Field 854 canonical v1 verified, but v2 parity GET failed. Manual review required.');
  }
  const afterInfo = preinspectR345bFindInfoCustomFields_(after.json);
  if (!afterInfo || !Array.isArray(afterInfo.fields)) {
    props.setProperty(uncertainKey, JSON.stringify({taskId:id,fieldId:854,at:new Date().toISOString(),reason:'v2 parity model missing'}));
    throw new Error('UNCERTAIN_WRITE: Field 854 canonical v1 verified, but v2 parity model is unavailable. Manual review required.');
  }
  const afterMap = preinspectR345bFieldValueMap_(afterInfo.fields);
  const nonTargetComparison = preinspectR345bCompareFieldMaps_(
    preinspectR346WithoutFieldId_(beforeMap, '854'),
    preinspectR346WithoutFieldId_(afterMap, '854')
  );
  if (!nonTargetComparison.equal || Object.keys(beforeMap).length !== Object.keys(afterMap).length) {
    props.setProperty(uncertainKey, JSON.stringify({taskId:id,fieldId:854,at:new Date().toISOString(),reason:'non-854 parity changed'}));
    throw new Error('CRITICAL_FIELD854_PARITY_FAILURE: A non-854 custom field changed after the Install Notes PATCH. Manual review required.');
  }

  props.deleteProperty(uncertainKey);
  const success = {
    mode: 'PREINSPECT_FIELD854_CANONICAL_V1',
    status: 'PUSHED_AND_VERIFIED_CANONICAL_V1',
    taskId: id,
    fieldId: 854,
    writesPerformed: true,
    endpoint: taskUrl,
    payloadShape: 'ID_PLUS_FULL_CURRENT_INFOCUSTOMFIELDS',
    verificationSource: 'V1_TASK_CUSTOMFIELDS',
    patchHttpCode: patch.statusCode,
    non854FieldsPreserved: true
  };
  Logger.log(JSON.stringify(success, null, 2));
  return success;
}
`;

const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'task-mapping-r4-7-'));
const preRoot=path.join(tmp,'PRE'),freshRoot=path.join(tmp,'FRESH'),workRoot=path.join(tmp,'WORK'),postRoot=path.join(tmp,'POST');[preRoot,freshRoot,workRoot,postRoot].forEach(d=>fs.mkdirSync(d,{recursive:true}));
const outputDir=path.resolve(repoRoot,'task-mapping-r4-7-output');fs.mkdirSync(outputDir,{recursive:true});const evidencePath=path.join(outputDir,'evidence.json'),preArchiveDir=path.join(outputDir,'PRE_SOURCE');
const evidence={schemaVersion:1,release:manifest.release||'TASK_MAPPING_FIX_PACK_R4_7',scriptId,startedAt:new Date().toISOString(),status:'STARTED'};let pushed=false;
try{
 console.log('=== R4.7 1/8 authorize ===');clasp(['show-authorized-user','--json'],repoRoot);
 console.log('=== R4.7 2/8 PRE clone ===');clasp(['clone',scriptId,'--rootDir','src'],preRoot);const preSrc=path.join(preRoot,'src'),preNames=listFiles(preSrc);if(preNames.length!==expectedPreFileCount)throw new Error(`expected ${expectedPreFileCount} PRE files, found ${preNames.length}`);[targetPI,targetR4].forEach(n=>{if(!preNames.includes(n))throw new Error('PRE missing '+n)});const preHashes=hashMap(preSrc,preNames);copyDir(preRoot,preArchiveDir);
 console.log('=== R4.7 3/8 build patch ===');copyDir(preRoot,workRoot);const workSrc=path.join(workRoot,'src'),piPath=path.join(workSrc,targetPI),r4Path=path.join(workSrc,targetR4);let pi=fs.readFileSync(piPath,'utf8'),r4=fs.readFileSync(r4Path,'utf8');
 if(!pi.includes('function preinspectR46GetCanonicalV1Schedule_('))throw new Error('Expected live R4.6 canonical v1 schedule helper missing');
 if(!r4.includes('TM_FIX_PACK_R4_6_20260915'))throw new Error('Unexpected live R4.6 marker');
 pi=replaceNamedFunction(pi,'preinspectR30PushInstallNotes_',newPushInstallNotes);
 if(!pi.includes('function preinspectR47EnsureInstallNotesCanonical_('))pi+=helperText;
 r4=r4.replace('TM_FIX_PACK_R4_6_20260915','TM_FIX_PACK_R4_7_20260915');
 fs.writeFileSync(piPath,pi);fs.writeFileSync(r4Path,r4);[piPath,r4Path].forEach(f=>run(process.execPath,['--check',f],repoRoot));
 const changed=[targetPI,targetR4],untouched=preNames.filter(n=>!changed.includes(n));assertExactHashes(preHashes,hashMap(workSrc,untouched),untouched,'WORK preservation');
 console.log('=== R4.7 4/8 freshness clone ===');clasp(['clone',scriptId,'--rootDir','src'],freshRoot);const freshSrc=path.join(freshRoot,'src'),freshNames=listFiles(freshSrc);if(JSON.stringify(freshNames)!==JSON.stringify(preNames))throw new Error('Freshness file set changed');assertExactHashes(preHashes,hashMap(freshSrc,preNames),preNames,'freshness guard');
 console.log('=== R4.7 5/8 push ===');clasp(['push','--force'],workRoot);pushed=true;
 console.log('=== R4.7 6/8 POST clone ===');clasp(['clone',scriptId,'--rootDir','src'],postRoot);const postSrc=path.join(postRoot,'src'),postNames=listFiles(postSrc);if(JSON.stringify(postNames)!==JSON.stringify(preNames))throw new Error('POST file set changed');const postHashes=hashMap(postSrc,postNames);assertExactHashes(preHashes,postHashes,untouched,'POST untouched preservation');[targetPI,targetR4].forEach(n=>run(process.execPath,['--check',path.join(postSrc,n)],repoRoot));
 console.log('=== R4.7 7/8 verify contracts ===');const postPI=fs.readFileSync(path.join(postSrc,targetPI),'utf8'),postR4=fs.readFileSync(path.join(postSrc,targetR4),'utf8');['preinspectR47EnsureInstallNotesCanonical_','V1_TASK_CUSTOMFIELDS','BLOCKED_FIELD854_UNCERTAIN_WRITE','UNCERTAIN_WRITE'].forEach(m=>{if(!postPI.includes(m))throw new Error('POST PI missing '+m)});if(!postR4.includes('TM_FIX_PACK_R4_7_20260915'))throw new Error('POST R4 marker missing');
 evidence.status='DEPLOYED_SOURCE_VERIFIED';evidence.completedAt=new Date().toISOString();evidence.preFileCount=preNames.length;evidence.postFileCount=postNames.length;evidence.modifiedExistingFiles=changed;evidence.runtimeTest='RETRY_SELECTED_PI_TASK_18476; FIELD854 MUST PREFLIGHT V1 AND MUST NOT BLINDLY REWRITE';fs.writeFileSync(evidencePath,JSON.stringify(evidence,null,2));console.log('=== R4.7 8/8 complete ===');console.log('DEPLOYED_SOURCE_VERIFIED');
}catch(err){evidence.status='FAILED';evidence.error=String(err&&err.stack?err.stack:err);evidence.failedAt=new Date().toISOString();fs.writeFileSync(evidencePath,JSON.stringify(evidence,null,2));if(pushed){try{console.error('Attempting automatic rollback to PRE source...');clasp(['push','--force'],preRoot);evidence.rollback='PRE_PUSH_ATTEMPTED';fs.writeFileSync(evidencePath,JSON.stringify(evidence,null,2));}catch(rb){evidence.rollback='FAILED: '+String(rb&&rb.stack?rb.stack:rb);fs.writeFileSync(evidencePath,JSON.stringify(evidence,null,2));}}throw err;}

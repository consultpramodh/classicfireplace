#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const cp = require('child_process');

const manifestPath = process.argv[2];
if (!manifestPath) throw new Error('Usage: node tools/deploy-task-mapping-fix-pack-r4-3.js <release-manifest.json>');
const repoRoot = process.cwd();
const manifest = JSON.parse(fs.readFileSync(path.resolve(repoRoot, manifestPath), 'utf8'));
const scriptId = String(manifest.scriptId || '').trim();
const claspVersion = String(manifest.claspVersion || '3.3.0');
const expectedPreFileCount = Number(manifest.expectedPreFileCount || 59);
if (!scriptId) throw new Error('release manifest missing scriptId');

const targetR3 = '96_Selected_Row_End_To_End_R3.js';
const targetR4 = '97_Task_Mapping_Fix_Pack_R4.js';

function run(command, args, cwd) {
  const r = cp.spawnSync(command, args, { cwd, env: process.env, encoding: 'utf8', stdio: ['ignore','pipe','pipe'] });
  process.stdout.write(r.stdout || '');
  process.stderr.write(r.stderr || '');
  if (r.status !== 0) throw new Error(`${command} ${args.join(' ')} failed with exit ${r.status}`);
  return r.stdout || '';
}
function clasp(args, cwd) { return run('npx', ['-y', `@google/clasp@${claspVersion}`, ...args], cwd); }
function sha256(file) { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }
function listFiles(dir) { return fs.readdirSync(dir,{withFileTypes:true}).filter(e=>e.isFile()).map(e=>e.name).sort(); }
function hashMap(dir,names){const out={}; names.forEach(n=>out[n]=sha256(path.join(dir,n))); return out;}
function copyDir(src,dst){fs.cpSync(src,dst,{recursive:true});}
function assertExactHashes(expected,actual,names,label){const issues=[]; names.forEach(n=>{if(expected[n]!==actual[n]) issues.push(n);}); if(issues.length) throw new Error(`${label}: hash mismatch ${issues.join(', ')}`);}

function replaceNamedFunction(source, functionName, replacement) {
  const escapedName = functionName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const sig = new RegExp(`function\\s+${escapedName}\\s*\\(`);
  const match = sig.exec(source);
  if (!match) throw new Error(`Could not find function ${functionName}`);
  const start = match.index;
  const braceStart = source.indexOf('{', match.index + match[0].length);
  if (braceStart < 0) throw new Error(`Could not find opening brace for ${functionName}`);
  let depth=0, quote=null, escaped=false, lineComment=false, blockComment=false;
  for (let i=braceStart;i<source.length;i++) {
    const ch=source[i], next=source[i+1];
    if(lineComment){if(ch==='\n')lineComment=false;continue;}
    if(blockComment){if(ch==='*'&&next==='/'){blockComment=false;i++;}continue;}
    if(quote){if(escaped){escaped=false;continue;} if(ch==='\\'){escaped=true;continue;} if(ch===quote)quote=null; continue;}
    if(ch==='/'&&next==='/'){lineComment=true;i++;continue;}
    if(ch==='/'&&next==='*'){blockComment=true;i++;continue;}
    if(ch==='\''||ch==='"'||ch==='`'){quote=ch;continue;}
    if(ch==='{')depth++;
    else if(ch==='}'){depth--; if(depth===0) return source.slice(0,start)+replacement.trim()+source.slice(i+1);}
  }
  throw new Error(`Could not find closing brace for ${functionName}`);
}

const transportReplacement = `function tmSelectedRowE2ER3LocalMeridiemDateTime_(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (isNaN(date.getTime())) {
    throw new Error('Invalid PreInspection datetime transport value: ' + value);
  }

  // R4.3: Striven ignored the AM/PM suffix on the prior 12-hour transport.
  // Use the existing PreInspection local 24-hour ISO wall-clock format instead:
  // e.g. 2026-09-16T13:00:00. No timezone suffix is sent because this endpoint
  // treats task schedule values as local wall-clock values.
  if (typeof preinspectR3418bMappingLocalIso_ === 'function') {
    const established = preinspectR3418bMappingLocalIso_(date);
    if (established) return established;
  }

  let tz = 'America/Toronto';
  if (typeof preinspectR3418bTimezone_ === 'function') {
    tz = preinspectR3418bTimezone_() || tz;
  } else if (typeof tm_getTimezone_ === 'function') {
    tz = tm_getTimezone_() || tz;
  }

  return Utilities.formatDate(date, tz, "yyyy-MM-dd'T'HH:mm:ss");
}`;

const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'task-mapping-r4-3-'));
const preRoot=path.join(tmp,'PRE'),freshRoot=path.join(tmp,'FRESH'),workRoot=path.join(tmp,'WORK'),postRoot=path.join(tmp,'POST');
[preRoot,freshRoot,workRoot,postRoot].forEach(d=>fs.mkdirSync(d,{recursive:true}));
const outputDir=path.resolve(repoRoot,'task-mapping-r4-3-output'); fs.mkdirSync(outputDir,{recursive:true});
const evidencePath=path.join(outputDir,'evidence.json'), preArchiveDir=path.join(outputDir,'PRE_SOURCE');
const evidence={schemaVersion:1,release:manifest.release||'TASK_MAPPING_FIX_PACK_R4_3',scriptId,startedAt:new Date().toISOString(),status:'STARTED'};
let pushed=false;
try{
  console.log('=== R4.3 1/8 authorize ==='); clasp(['show-authorized-user','--json'],repoRoot);
  console.log('=== R4.3 2/8 PRE clone ==='); clasp(['clone',scriptId,'--rootDir','src'],preRoot);
  const preSrc=path.join(preRoot,'src'), preNames=listFiles(preSrc);
  if(preNames.length!==expectedPreFileCount)throw new Error(`expected ${expectedPreFileCount} PRE files, found ${preNames.length}`);
  [targetR3,targetR4].forEach(n=>{if(!preNames.includes(n))throw new Error('PRE missing '+n);});
  const preHashes=hashMap(preSrc,preNames); copyDir(preRoot,preArchiveDir);

  console.log('=== R4.3 3/8 build patch ===');
  copyDir(preRoot,workRoot); const workSrc=path.join(workRoot,'src');
  const r3Path=path.join(workSrc,targetR3), r4Path=path.join(workSrc,targetR4);
  let r3=fs.readFileSync(r3Path,'utf8');
  let r4=fs.readFileSync(r4Path,'utf8');
  if(!r3.includes('TM_SELECTED_ROW_E2E_R3_20260915'))throw new Error('Unexpected R3 version marker');
  if(!r4.includes('TM_FIX_PACK_R4_2_20260915'))throw new Error('Unexpected live R4.2 version marker');
  r3=r3.replace('TM_SELECTED_ROW_E2E_R3_20260915','TM_SELECTED_ROW_E2E_R3_1_20260915');
  r3=replaceNamedFunction(r3,'tmSelectedRowE2ER3LocalMeridiemDateTime_',transportReplacement);
  r4=r4.replace('TM_FIX_PACK_R4_2_20260915','TM_FIX_PACK_R4_3_20260915');
  fs.writeFileSync(r3Path,r3); fs.writeFileSync(r4Path,r4);
  run(process.execPath,['--check',r3Path],repoRoot); run(process.execPath,['--check',r4Path],repoRoot);
  const changed=[targetR3,targetR4];
  const untouched=preNames.filter(n=>changed.indexOf(n)===-1);
  assertExactHashes(preHashes,hashMap(workSrc,untouched),untouched,'WORK preservation');

  console.log('=== R4.3 4/8 freshness clone ===');
  clasp(['clone',scriptId,'--rootDir','src'],freshRoot); const freshSrc=path.join(freshRoot,'src'); const freshNames=listFiles(freshSrc);
  if(JSON.stringify(freshNames)!==JSON.stringify(preNames))throw new Error('Freshness file set changed');
  assertExactHashes(preHashes,hashMap(freshSrc,preNames),preNames,'freshness guard');

  console.log('=== R4.3 5/8 push ==='); clasp(['push','--force'],workRoot); pushed=true;
  console.log('=== R4.3 6/8 POST clone ==='); clasp(['clone',scriptId,'--rootDir','src'],postRoot);
  const postSrc=path.join(postRoot,'src'); const postNames=listFiles(postSrc);
  if(JSON.stringify(postNames)!==JSON.stringify(preNames))throw new Error('POST file set changed');
  const postHashes=hashMap(postSrc,postNames);
  assertExactHashes(preHashes,postHashes,untouched,'POST untouched preservation');
  const postR3=fs.readFileSync(path.join(postSrc,targetR3),'utf8');
  const postR4=fs.readFileSync(path.join(postSrc,targetR4),'utf8');
  run(process.execPath,['--check',path.join(postSrc,targetR3)],repoRoot); run(process.execPath,['--check',path.join(postSrc,targetR4)],repoRoot);

  console.log('=== R4.3 7/8 verify contracts ===');
  ['TM_SELECTED_ROW_E2E_R3_1_20260915',"yyyy-MM-dd'T'HH:mm:ss",'preinspectR3418bMappingLocalIso_'].forEach(marker=>{if(!postR3.includes(marker))throw new Error('POST R3 missing R4.3 marker '+marker);});
  if(postR3.includes("yyyy-MM-dd hh:mm:ss a"))throw new Error('POST R3 still contains old 12-hour AM/PM transport');
  if(!postR4.includes('TM_FIX_PACK_R4_3_20260915'))throw new Error('POST R4 missing R4.3 version marker');

  evidence.status='DEPLOYED_SOURCE_VERIFIED'; evidence.completedAt=new Date().toISOString(); evidence.preFileCount=preNames.length; evidence.postFileCount=postNames.length; evidence.modifiedExistingFiles=changed; evidence.preSha256={}; evidence.postSha256={}; changed.forEach(n=>{evidence.preSha256[n]=preHashes[n]; evidence.postSha256[n]=postHashes[n];}); evidence.runtimeTest='RETEST_PREINSPECTION_TASK_18476_SELECTED_ROW';
  fs.writeFileSync(evidencePath,JSON.stringify(evidence,null,2));
  console.log('=== R4.3 8/8 complete ==='); console.log('DEPLOYED_SOURCE_VERIFIED');
}catch(err){
  evidence.status='FAILED'; evidence.error=String(err&&err.stack?err.stack:err); evidence.failedAt=new Date().toISOString(); fs.writeFileSync(evidencePath,JSON.stringify(evidence,null,2));
  if(pushed){
    try{console.error('Attempting automatic rollback to PRE source...'); clasp(['push','--force'],preRoot); evidence.rollback='PRE_PUSH_ATTEMPTED'; fs.writeFileSync(evidencePath,JSON.stringify(evidence,null,2));}
    catch(rb){console.error('ROLLBACK FAILED',rb); evidence.rollback='FAILED: '+String(rb&&rb.stack?rb.stack:rb); fs.writeFileSync(evidencePath,JSON.stringify(evidence,null,2));}
  }
  throw err;
}

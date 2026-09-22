#!/usr/bin/env node
'use strict';

const fs=require('fs'), os=require('os'), path=require('path'), crypto=require('crypto'), cp=require('child_process');

const SCRIPT_ID='1E86mhD2dZcOFpqWnCvoIpwEkwZ0MA63MgM8DifV6WyB2FvVQkRWKIZ_m';
const CLASP_VERSION='3.3.0';
const RELEASE='TASK_MAPPING_PREINSPECT_PREVIEW_UI_SCOPE_R1_4_1_20260922';
const REQUIRED_SCOPE='https://www.googleapis.com/auth/script.container.ui';
const EXPECTED_PRE_FILE_COUNT=76;
const OUTPUT=path.resolve('task-mapping-preinspect-preview-ui-scope-output');
fs.mkdirSync(OUTPUT,{recursive:true});

function run(cmd,args,cwd){
  const r=cp.spawnSync(cmd,args,{cwd:cwd||process.cwd(),env:process.env,encoding:'utf8',stdio:['ignore','pipe','pipe']});
  process.stdout.write(r.stdout||''); process.stderr.write(r.stderr||'');
  if(r.error) throw r.error;
  if(r.status!==0) throw new Error(cmd+' '+args.join(' ')+' failed with exit '+r.status);
  return r.stdout||'';
}
function clasp(args,cwd){return run('npx',['-y','@google/clasp@'+CLASP_VERSION].concat(args),cwd);}
function sha(f){return crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');}
function names(d){return fs.readdirSync(d,{withFileTypes:true}).filter(e=>e.isFile()).map(e=>e.name).sort();}
function hashes(d,ns){const o={};ns.forEach(n=>o[n]=sha(path.join(d,n)));return o;}
function copy(s,d){fs.cpSync(s,d,{recursive:true});}
function assertHashes(exp,act,ns,label){const bad=[];ns.forEach(n=>{if(exp[n]!==act[n])bad.push(n)});if(bad.length)throw new Error(label+': '+bad.join(', '));}

const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'tm-preview-ui-scope-'));
const preRoot=path.join(tmp,'PRE'), freshRoot=path.join(tmp,'FRESH'), workRoot=path.join(tmp,'WORK'), postRoot=path.join(tmp,'POST');
[preRoot,freshRoot,workRoot,postRoot].forEach(d=>fs.mkdirSync(d,{recursive:true}));
const evidence={schemaVersion:1,release:RELEASE,scriptId:SCRIPT_ID,requiredScope:REQUIRED_SCOPE,startedAt:new Date().toISOString(),status:'STARTED',emailSendEnabled:false};
const evidencePath=path.join(OUTPUT,'evidence.json');
let pushed=false;

try{
  console.log('=== UI SCOPE 1/8 authorize ==='); clasp(['show-authorized-user','--json'],process.cwd());

  console.log('=== UI SCOPE 2/8 PRE clone ==='); clasp(['clone',SCRIPT_ID,'--rootDir','src'],preRoot);
  const preSrc=path.join(preRoot,'src'), preNames=names(preSrc);
  if(preNames.length!==EXPECTED_PRE_FILE_COUNT) throw new Error('Expected '+EXPECTED_PRE_FILE_COUNT+' live files, found '+preNames.length);
  const manifestName=preNames.includes('appsscript.json')?'appsscript.json':preNames.find(n=>n.toLowerCase()==='appsscript.json');
  if(!manifestName) throw new Error('appsscript.json was not found in the live project.');
  const manifestPath=path.join(preSrc,manifestName);
  const manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'));
  if(!Array.isArray(manifest.oauthScopes)) {
    throw new Error('Live manifest does not declare oauthScopes explicitly; refusing to create a one-scope manifest that could remove inferred access.');
  }
  evidence.preScopes=manifest.oauthScopes.slice();
  console.log(JSON.stringify({preScopeCount:manifest.oauthScopes.length,hasRequiredScope:manifest.oauthScopes.includes(REQUIRED_SCOPE)},null,2));
  if(manifest.oauthScopes.includes(REQUIRED_SCOPE)) {
    evidence.status='ALREADY_PRESENT_NO_PUSH';
    evidence.completedAt=new Date().toISOString();
    fs.writeFileSync(evidencePath,JSON.stringify(evidence,null,2));
    console.log('UI_SCOPE_ALREADY_PRESENT');
    process.exit(0);
  }

  const preHashes=hashes(preSrc,preNames);
  copy(preRoot,path.join(OUTPUT,'PRE_SOURCE'));

  console.log('=== UI SCOPE 3/8 build WORK ==='); copy(preRoot,workRoot);
  const workSrc=path.join(workRoot,'src'), workManifestPath=path.join(workSrc,manifestName);
  const workManifest=JSON.parse(fs.readFileSync(workManifestPath,'utf8'));
  workManifest.oauthScopes=workManifest.oauthScopes.concat([REQUIRED_SCOPE]);
  fs.writeFileSync(workManifestPath,JSON.stringify(workManifest,null,2)+'\n');

  const parsed=JSON.parse(fs.readFileSync(workManifestPath,'utf8'));
  if(!parsed.oauthScopes.includes(REQUIRED_SCOPE)) throw new Error('Required UI scope missing from WORK manifest.');
  const unique=new Set(parsed.oauthScopes);
  if(unique.size!==parsed.oauthScopes.length) throw new Error('WORK manifest contains duplicate oauthScopes.');

  const untouched=preNames.filter(n=>n!==manifestName);
  assertHashes(preHashes,hashes(workSrc,untouched),untouched,'WORK untouched preservation');

  console.log('=== UI SCOPE 4/8 freshness clone ==='); clasp(['clone',SCRIPT_ID,'--rootDir','src'],freshRoot);
  const freshSrc=path.join(freshRoot,'src'), freshNames=names(freshSrc);
  if(JSON.stringify(freshNames)!==JSON.stringify(preNames)) throw new Error('Freshness file set changed.');
  assertHashes(preHashes,hashes(freshSrc,preNames),preNames,'freshness guard');

  console.log('=== UI SCOPE 5/8 push ==='); clasp(['push','--force'],workRoot); pushed=true;

  console.log('=== UI SCOPE 6/8 POST clone ==='); clasp(['clone',SCRIPT_ID,'--rootDir','src'],postRoot);
  const postSrc=path.join(postRoot,'src'), postNames=names(postSrc);
  if(JSON.stringify(postNames)!==JSON.stringify(preNames)) throw new Error('POST file set changed.');

  console.log('=== UI SCOPE 7/8 verify ===');
  const postHashes=hashes(postSrc,postNames);
  assertHashes(preHashes,postHashes,untouched,'POST untouched preservation');
  const postManifest=JSON.parse(fs.readFileSync(path.join(postSrc,manifestName),'utf8'));
  if(!Array.isArray(postManifest.oauthScopes) || !postManifest.oauthScopes.includes(REQUIRED_SCOPE)) {
    throw new Error('POST manifest is missing required UI scope.');
  }
  const expectedScopes=workManifest.oauthScopes.slice().sort();
  const actualScopes=postManifest.oauthScopes.slice().sort();
  if(JSON.stringify(expectedScopes)!==JSON.stringify(actualScopes)) throw new Error('POST oauthScopes differ from WORK oauthScopes.');

  console.log('=== UI SCOPE 8/8 evidence ===');
  evidence.status='DEPLOYED_SOURCE_VERIFIED';
  evidence.completedAt=new Date().toISOString();
  evidence.postScopes=postManifest.oauthScopes.slice();
  evidence.changedFiles=[manifestName];
  evidence.untouchedFileCount=untouched.length;
  evidence.rollback='NOT_REQUIRED';
  fs.writeFileSync(evidencePath,JSON.stringify(evidence,null,2));
  console.log('DEPLOYED_SOURCE_VERIFIED');
}catch(err){
  evidence.status='FAILED';
  evidence.failedAt=new Date().toISOString();
  evidence.error=String(err&&err.stack?err.stack:err);
  if(pushed){
    try{
      console.error('POST verification failed; rolling back PRE source...');
      clasp(['push','--force'],preRoot);
      evidence.rollback='ROLLBACK_PUSH_COMPLETED';
    }catch(rb){
      evidence.rollback='ROLLBACK_FAILED';
      evidence.rollbackError=String(rb&&rb.stack?rb.stack:rb);
    }
  }else{
    evidence.rollback='NOT_NEEDED_NO_PUSH_COMPLETED';
  }
  fs.writeFileSync(evidencePath,JSON.stringify(evidence,null,2));
  throw err;
}

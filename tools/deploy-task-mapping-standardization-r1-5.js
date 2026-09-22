#!/usr/bin/env node
'use strict';

const fs=require('fs'), os=require('os'), path=require('path'), crypto=require('crypto'), cp=require('child_process');

const SCRIPT_ID='1E86mhD2dZcOFpqWnCvoIpwEkwZ0MA63MgM8DifV6WyB2FvVQkRWKIZ_m';
const CLASP_VERSION='3.3.0';
const RELEASE='TASK_MAPPING_STANDARDIZATION_R1_5_5_PREINSPECT_EMAIL_COMPACT_20260922';
const MODULE_SOURCE='patches/task-mapping/99_Task_Mapping_Standardization_R1.js';
const MODULE_TARGET='99_Task_Mapping_Standardization_R1.js';
const EXPECTED_PRE_FILE_COUNT=76;
const OUTPUT=path.resolve('task-mapping-standardization-r1-5-5-output');
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

const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'tm-std-r1-5-'));
const preRoot=path.join(tmp,'PRE'), freshRoot=path.join(tmp,'FRESH'), workRoot=path.join(tmp,'WORK'), postRoot=path.join(tmp,'POST');
[preRoot,freshRoot,workRoot,postRoot].forEach(d=>fs.mkdirSync(d,{recursive:true}));
const evidence={schemaVersion:1,release:RELEASE,scriptId:SCRIPT_ID,startedAt:new Date().toISOString(),status:'STARTED',emailSendEnabled:false,calendarWritesPerformedByDeployment:false,strivenWritesPerformedByDeployment:false};
const evidencePath=path.join(OUTPUT,'evidence.json');
let pushed=false;

try{
  console.log('=== R1.5.5 1/8 authorize ==='); clasp(['show-authorized-user','--json'],process.cwd());

  console.log('=== R1.5 2/8 PRE clone ==='); clasp(['clone',SCRIPT_ID,'--rootDir','src'],preRoot);
  const preSrc=path.join(preRoot,'src'), preNames=names(preSrc);
  if(preNames.length!==EXPECTED_PRE_FILE_COUNT) throw new Error('Expected '+EXPECTED_PRE_FILE_COUNT+' live files, found '+preNames.length);
  if(!preNames.includes(MODULE_TARGET)) throw new Error('Live Standardization module missing.');
  const preHashes=hashes(preSrc,preNames); copy(preRoot,path.join(OUTPUT,'PRE_SOURCE'));
  const preModule=fs.readFileSync(path.join(preSrc,MODULE_TARGET),'utf8');
  if(!preModule.includes('TASK_MAPPING_STANDARDIZATION_R1_5_4_PREINSPECT_LINK_LABEL_20260922')) throw new Error('Unexpected PRE standardization version.');
  if(!preModule.includes('previewPreInspectNotificationEmailForSelectedRow')) throw new Error('Expected R1.4 preview helper missing.');

  console.log('=== R1.5 3/8 build WORK ==='); copy(preRoot,workRoot);
  const workSrc=path.join(workRoot,'src');
  const candidate=path.resolve(MODULE_SOURCE);
  run(process.execPath,['--check',candidate],process.cwd());
  fs.copyFileSync(candidate,path.join(workSrc,MODULE_TARGET));

  const workModule=fs.readFileSync(path.join(workSrc,MODULE_TARGET),'utf8');
  [
    'TASK_MAPPING_STANDARDIZATION_R1_5_5_PREINSPECT_EMAIL_COMPACT_20260922',
    'tmStdReorganizePreInspectCalendarTitles_',
    'runPreInspectCalendarReorganization',
    "CONTEXT_PREFIX: '',\n",    'PreInspect Calendar Reorganization Log',
    'TITLE_AND_DESCRIPTION_READBACK_VERIFIED',
    'tmStdPreInspectReorgContextPresent_',
    'PREINSPECT_TITLE_CONTEXT_START',
    'tmStdPreInspectReorgContextBlock_',
    "'View Sales Orders – '",
    'Pre-Inspection Update Required',
    'Recommended Standard Title Format',
    'Missing / Needs Attention',
    'refreshPreInspectStrivenLinksNow',
    'dryRunPreInspectStrivenLinksNow',
    'emailSendsPerformed: 0',
    "SAFE_STATUSES: ['CONFIRMED', 'MATCHED']"
  ].forEach(marker=>{if(!workModule.includes(marker))throw new Error('Candidate missing marker: '+marker)});

  ['MailApp','GmailApp','sendEmail(','Gmail.Users.Messages.send'].forEach(marker=>{
    if(workModule.includes(marker)) throw new Error('R1.5 contains forbidden email-send surface: '+marker);
  });

  const untouched=preNames.filter(n=>n!==MODULE_TARGET);
  assertHashes(preHashes,hashes(workSrc,untouched),untouched,'WORK untouched preservation');

  console.log('=== R1.5 4/8 freshness clone ==='); clasp(['clone',SCRIPT_ID,'--rootDir','src'],freshRoot);
  const freshSrc=path.join(freshRoot,'src'), freshNames=names(freshSrc);
  if(JSON.stringify(freshNames)!==JSON.stringify(preNames)) throw new Error('Freshness file set changed.');
  assertHashes(preHashes,hashes(freshSrc,preNames),preNames,'freshness guard');

  console.log('=== R1.5 5/8 push ==='); clasp(['push','--force'],workRoot); pushed=true;

  console.log('=== R1.5 6/8 POST clone ==='); clasp(['clone',SCRIPT_ID,'--rootDir','src'],postRoot);
  const postSrc=path.join(postRoot,'src'), postNames=names(postSrc);
  if(JSON.stringify(postNames)!==JSON.stringify(preNames)) throw new Error('POST file set changed.');

  console.log('=== R1.5 7/8 verify ===');
  const postHashes=hashes(postSrc,postNames);
  assertHashes(preHashes,postHashes,untouched,'POST untouched preservation');
  if(sha(path.join(postSrc,MODULE_TARGET))!==sha(path.join(workSrc,MODULE_TARGET))) throw new Error('POST module hash differs from WORK.');
  run(process.execPath,['--check',path.join(postSrc,MODULE_TARGET)],process.cwd());
  const postModule=fs.readFileSync(path.join(postSrc,MODULE_TARGET),'utf8');
  if(!postModule.includes('TASK_MAPPING_STANDARDIZATION_R1_5_5_PREINSPECT_EMAIL_COMPACT_20260922')) throw new Error('POST R1.5.5 marker missing.');
  if(!postModule.includes('tmStdReorganizePreInspectCalendarTitles_')) throw new Error('POST reorganization helper missing.');

  console.log('=== R1.5 8/8 evidence ===');
  evidence.status='DEPLOYED_SOURCE_VERIFIED';
  evidence.completedAt=new Date().toISOString();
  evidence.changedFiles=[MODULE_TARGET];
  evidence.untouchedFileCount=untouched.length;
  evidence.preFileCount=preNames.length;
  evidence.postFileCount=postNames.length;
  evidence.rollback='NOT_REQUIRED';
  evidence.zeroInformationLossGuard=true;
  evidence.safeStatuses=['CONFIRMED','MATCHED'];
  evidence.emailSendSurfaceDetected=false;
  fs.writeFileSync(evidencePath,JSON.stringify(evidence,null,2));
  console.log('DEPLOYED_SOURCE_VERIFIED');
}catch(err){
  evidence.status='FAILED'; evidence.failedAt=new Date().toISOString(); evidence.error=String(err&&err.stack?err.stack:err);
  if(pushed){
    try{console.error('Verification failed; rolling back PRE source...');clasp(['push','--force'],preRoot);evidence.rollback='ROLLBACK_PUSH_COMPLETED';}
    catch(rb){evidence.rollback='ROLLBACK_FAILED';evidence.rollbackError=String(rb&&rb.stack?rb.stack:rb);}
  } else evidence.rollback='NOT_NEEDED_NO_PUSH_COMPLETED';
  fs.writeFileSync(evidencePath,JSON.stringify(evidence,null,2));
  throw err;
}

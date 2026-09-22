#!/usr/bin/env node
'use strict';

const fs=require('fs'), os=require('os'), path=require('path'), crypto=require('crypto'), cp=require('child_process');

const SCRIPT_ID='1E86mhD2dZcOFpqWnCvoIpwEkwZ0MA63MgM8DifV6WyB2FvVQkRWKIZ_m';
const CLASP_VERSION='3.3.0';
const RELEASE='TASK_MAPPING_STANDARDIZATION_R1_4_PREINSPECT_EMAIL_PREVIEW_20260922';
const MODULE_SOURCE='patches/task-mapping/99_Task_Mapping_Standardization_R1.js';
const MODULE_TARGET='99_Task_Mapping_Standardization_R1.js';
const EXPECTED_PRE_FILE_COUNT=76;
const OUTPUT=path.resolve('task-mapping-standardization-r1-4-output');
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
function sourceFiles(d){return names(d).filter(n=>/\.(?:js|gs)$/i.test(n));}
function findUniqueFunctionFile(d,fn){
  const re=new RegExp('(?:^|\\n)\\s*function\\s+'+fn+'\\s*\\(','g');
  const matches=sourceFiles(d).filter(n=>{const t=fs.readFileSync(path.join(d,n),'utf8');re.lastIndex=0;return re.test(t)});
  if(matches.length!==1) throw new Error('Expected one active definition for '+fn+', found '+matches.length+': '+matches.join(', '));
  return matches[0];
}
function functionRange(text,fn){
  const re=new RegExp('(?:^|\\n)(\\s*function\\s+'+fn+'\\s*\\()','g'); const found=[]; let m;
  while((m=re.exec(text))!==null){const off=m[0].charAt(0)==='\n'?1:0;found.push(m.index+off+m[0].slice(off).indexOf('function'))}
  if(found.length!==1) throw new Error('Active function definition count for '+fn+' is '+found.length);
  const start=found[0], open=text.indexOf('{',start);
  let depth=0,quote=null,esc=false,line=false,block=false;
  for(let i=open;i<text.length;i++){
    const ch=text[i],next=text[i+1];
    if(line){if(ch==='\n')line=false;continue}
    if(block){if(ch==='*'&&next==='/'){block=false;i++}continue}
    if(quote){if(esc){esc=false;continue}if(ch==='\\'){esc=true;continue}if(ch===quote)quote=null;continue}
    if(ch==='/'&&next==='/'){line=true;i++;continue}
    if(ch==='/'&&next==='*'){block=true;i++;continue}
    if(ch==="'"||ch==='"'||ch.charCodeAt(0)===96){quote=ch;continue}
    if(ch==='{')depth++; else if(ch==='}'&&--depth===0)return{start,end:i+1,open};
  }
  throw new Error('Function end not found: '+fn);
}
function injectOnOpenMenu(d,changed){
  const fn='onOpen';
  const file=findUniqueFunctionFile(d,fn), full=path.join(d,file);
  let text=fs.readFileSync(full,'utf8');
  const range=functionRange(text,fn);
  const body=text.slice(range.start,range.end);
  if(body.includes('tmStdAddPreInspectAuditMenu_')) return file;
  const injection="\n  try { tmStdAddPreInspectAuditMenu_(); } catch (err) { Logger.log('Pre-Inspection Audit menu unavailable: ' + err); }";
  text=text.slice(0,range.open+1)+injection+text.slice(range.open+1);
  fs.writeFileSync(full,text);
  changed[file]=true;
  return file;
}

const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'tm-std-r1-4-'));
const preRoot=path.join(tmp,'PRE'), freshRoot=path.join(tmp,'FRESH'), workRoot=path.join(tmp,'WORK'), postRoot=path.join(tmp,'POST');
[preRoot,freshRoot,workRoot,postRoot].forEach(d=>fs.mkdirSync(d,{recursive:true}));
const evidence={schemaVersion:1,release:RELEASE,scriptId:SCRIPT_ID,startedAt:new Date().toISOString(),status:'STARTED',emailSendEnabled:false,calendarWritesPerformedByDeployment:false,strivenWritesPerformedByDeployment:false};
const evidencePath=path.join(OUTPUT,'evidence.json');
let pushed=false;

try{
  console.log('=== R1.4 1/9 authorize ==='); clasp(['show-authorized-user','--json'],process.cwd());
  console.log('=== R1.4 2/9 PRE clone ==='); clasp(['clone',SCRIPT_ID,'--rootDir','src'],preRoot);
  const preSrc=path.join(preRoot,'src'), preNames=names(preSrc);
  if(preNames.length!==EXPECTED_PRE_FILE_COUNT) throw new Error('Expected '+EXPECTED_PRE_FILE_COUNT+' live files, found '+preNames.length);
  if(!preNames.includes(MODULE_TARGET)) throw new Error('Live Standardization module missing: '+MODULE_TARGET);
  const preHashes=hashes(preSrc,preNames); copy(preRoot,path.join(OUTPUT,'PRE_SOURCE'));

  const preModule=fs.readFileSync(path.join(preSrc,MODULE_TARGET),'utf8');
  if(!preModule.includes('TASK_MAPPING_STANDARDIZATION_R1_3_PREINSPECT_AUDIT_20260922')) throw new Error('Unexpected PRE standardization version.');
  if(!preModule.includes('tmStdRefreshPreInspectCalendarAudit_')) throw new Error('Expected R1.3 audit helper missing.');

  console.log('=== R1.4 3/9 build WORK ==='); copy(preRoot,workRoot);
  const workSrc=path.join(workRoot,'src'), changed={};
  const candidate=path.resolve(MODULE_SOURCE);
  run(process.execPath,['--check',candidate],process.cwd());
  fs.copyFileSync(candidate,path.join(workSrc,MODULE_TARGET)); changed[MODULE_TARGET]=true;
  const menuFile=injectOnOpenMenu(workSrc,changed);

  const changedNames=Object.keys(changed).sort();
  changedNames.forEach(n=>run(process.execPath,['--check',path.join(workSrc,n)],process.cwd()));

  const workModule=fs.readFileSync(path.join(workSrc,MODULE_TARGET),'utf8');
  [
    'TASK_MAPPING_STANDARDIZATION_R1_4_PREINSPECT_EMAIL_PREVIEW_20260922',
    'previewPreInspectNotificationEmailForSelectedRow',
    'PREVIEW ONLY — NO EMAIL WILL BE SENT',
    'tmStdBuildPreInspectNotificationPreview_',
    'tmStdAddPreInspectAuditMenu_',
    'emailSent: false',
    'mailServiceCalled: false'
  ].forEach(marker=>{if(!workModule.includes(marker))throw new Error('Candidate missing marker: '+marker)});

  const forbidden=['MailApp','GmailApp','sendEmail(','Gmail.Users','Gmail.Users.Messages.send'];
  forbidden.forEach(function(marker){
    if(workModule.includes(marker)) throw new Error('Preview module contains forbidden email-send surface: '+marker);
  });

  const menuText=fs.readFileSync(path.join(workSrc,menuFile),'utf8');
  if(!menuText.includes('tmStdAddPreInspectAuditMenu_')) throw new Error('onOpen menu hook missing.');

  const untouched=preNames.filter(n=>!changed[n]);
  assertHashes(preHashes,hashes(workSrc,untouched),untouched,'WORK untouched preservation');

  console.log('=== R1.4 4/9 freshness clone ==='); clasp(['clone',SCRIPT_ID,'--rootDir','src'],freshRoot);
  const freshSrc=path.join(freshRoot,'src'), freshNames=names(freshSrc);
  if(JSON.stringify(freshNames)!==JSON.stringify(preNames)) throw new Error('Freshness file set changed.');
  assertHashes(preHashes,hashes(freshSrc,preNames),preNames,'freshness guard');

  console.log('=== R1.4 5/9 push ==='); clasp(['push','--force'],workRoot); pushed=true;
  console.log('=== R1.4 6/9 POST clone ==='); clasp(['clone',SCRIPT_ID,'--rootDir','src'],postRoot);
  const postSrc=path.join(postRoot,'src'), postNames=names(postSrc);
  if(JSON.stringify(postNames)!==JSON.stringify(preNames)) throw new Error('POST file set changed.');

  console.log('=== R1.4 7/9 verify hashes/markers ===');
  const postHashes=hashes(postSrc,postNames);
  assertHashes(preHashes,postHashes,untouched,'POST untouched preservation');
  const workHashes=hashes(workSrc,changedNames);
  assertHashes(workHashes,postHashes,changedNames,'POST changed parity');
  changedNames.forEach(n=>run(process.execPath,['--check',path.join(postSrc,n)],process.cwd()));

  const postModule=fs.readFileSync(path.join(postSrc,MODULE_TARGET),'utf8');
  if(!postModule.includes('TASK_MAPPING_STANDARDIZATION_R1_4_PREINSPECT_EMAIL_PREVIEW_20260922')) throw new Error('POST R1.4 marker missing.');
  forbidden.forEach(function(marker){
    if(postModule.includes(marker)) throw new Error('POST preview module contains forbidden email-send surface: '+marker);
  });
  const postMenu=fs.readFileSync(path.join(postSrc,menuFile),'utf8');
  if(!postMenu.includes('tmStdAddPreInspectAuditMenu_')) throw new Error('POST menu hook missing.');

  console.log('=== R1.4 8/9 evidence ===');
  evidence.status='DEPLOYED_SOURCE_VERIFIED'; evidence.completedAt=new Date().toISOString();
  evidence.preFileCount=preNames.length; evidence.postFileCount=postNames.length; evidence.changedFiles=changedNames;
  evidence.untouchedFileCount=untouched.length; evidence.rollback='NOT_REQUIRED';
  evidence.previewOnly=true; evidence.emailSendSurfaceDetected=false;
  fs.writeFileSync(evidencePath,JSON.stringify(evidence,null,2));
  console.log('=== R1.4 9/9 complete ==='); console.log('DEPLOYED_SOURCE_VERIFIED');
}catch(err){
  evidence.status='FAILED'; evidence.failedAt=new Date().toISOString(); evidence.error=String(err&&err.stack?err.stack:err);
  if(pushed){
    try{console.error('POST verification failed; rolling back PRE source...');clasp(['push','--force'],preRoot);evidence.rollback='ROLLBACK_PUSH_COMPLETED';}
    catch(rb){evidence.rollback='ROLLBACK_FAILED';evidence.rollbackError=String(rb&&rb.stack?rb.stack:rb);}
  } else evidence.rollback='NOT_NEEDED_NO_PUSH_COMPLETED';
  fs.writeFileSync(evidencePath,JSON.stringify(evidence,null,2)); throw err;
}

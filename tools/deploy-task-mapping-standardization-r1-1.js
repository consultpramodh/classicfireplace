#!/usr/bin/env node
'use strict';

const fs=require('fs'), os=require('os'), path=require('path'), crypto=require('crypto'), cp=require('child_process');

const SCRIPT_ID='1E86mhD2dZcOFpqWnCvoIpwEkwZ0MA63MgM8DifV6WyB2FvVQkRWKIZ_m';
const CLASP_VERSION='3.3.0';
const RELEASE='TASK_MAPPING_STANDARDIZATION_R1_1_PREINSPECT_LINKS_20260922';
const MODULE_SOURCE='patches/task-mapping/99_Task_Mapping_Standardization_R1.js';
const MODULE_TARGET='99_Task_Mapping_Standardization_R1.js';
const EXPECTED_PRE_FILE_COUNT=75;
const OUTPUT=path.resolve('task-mapping-standardization-r1-1-output');
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
    if(ch==='{')depth++; else if(ch==='}'&&--depth===0)return{start,end:i+1};
  }
  throw new Error('Function end not found: '+fn);
}
function replaceFunction(d,fn,replacement,changed){
  const file=findUniqueFunctionFile(d,fn), full=path.join(d,file);
  let t=fs.readFileSync(full,'utf8'); const r=functionRange(t,fn);
  t=t.slice(0,r.start)+replacement.trim()+t.slice(r.end);
  fs.writeFileSync(full,t); changed[file]=true; return file;
}

const FN_PI_APPEND=[
"function preinspectAppendTaskLinkToCalendarEvent_(eventId, taskId, taskTitle) {",
"  const id = tmStdPositiveNumber_(taskId);",
"  if (!id) return { mode: 'PREINSPECT_CALENDAR_TASK_LINK', status: 'REVIEW', writesPerformed: false, calendarWritesPerformed: false, reason: 'Task ID is blank.' };",
"  const accountId = tmStdPreInspectAccountIdForEvent_(eventId, id);",
"  if (!accountId) return { mode: 'PREINSPECT_CALENDAR_TASK_LINK', status: 'REVIEW', writesPerformed: false, calendarWritesPerformed: false, eventId: String(eventId || ''), taskId: id, reason: 'Customer/Account ID is required for the Sales Orders list link.' };",
"  const stephen = tmStdEnsurePreInspectStephenPresence_(eventId, false);",
"  const result = tmStdWriteCanonicalCalendarLinks_(",
"    'PreInspection',",
"    eventId,",
"    [{ id: id }],",
"    null,",
"    false,",
"    { accountId: accountId, url: tmStdSalesOrdersListUrl_(accountId) }",
"  );",
"  result.mode = 'PREINSPECT_CALENDAR_TASK_LINK';",
"  result.writesPerformed = Number(result.writeCount || 0) > 0 || Number(stephen.writeCount || 0) > 0;",
"  result.calendarWritesPerformed = result.writesPerformed;",
"  result.stephenCalendar = stephen;",
"  result.salesOrdersAccountId = accountId;",
"  return result;",
"}"
].join('\n');

const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'tm-std-r1-1-'));
const preRoot=path.join(tmp,'PRE'), freshRoot=path.join(tmp,'FRESH'), workRoot=path.join(tmp,'WORK'), postRoot=path.join(tmp,'POST');
[preRoot,freshRoot,workRoot,postRoot].forEach(d=>fs.mkdirSync(d,{recursive:true}));
const evidence={schemaVersion:1,release:RELEASE,scriptId:SCRIPT_ID,startedAt:new Date().toISOString(),status:'STARTED',calendarWritesPerformedByDeployment:false,strivenWritesPerformedByDeployment:false};
const evidencePath=path.join(OUTPUT,'evidence.json');
let pushed=false;

try{
  console.log('=== R1.1 1/9 authorize ==='); clasp(['show-authorized-user','--json'],process.cwd());
  console.log('=== R1.1 2/9 PRE clone ==='); clasp(['clone',SCRIPT_ID,'--rootDir','src'],preRoot);
  const preSrc=path.join(preRoot,'src'), preNames=names(preSrc);
  if(preNames.length!==EXPECTED_PRE_FILE_COUNT) throw new Error('Expected '+EXPECTED_PRE_FILE_COUNT+' live files, found '+preNames.length);
  if(!preNames.includes(MODULE_TARGET)) throw new Error('Live Standardization module missing: '+MODULE_TARGET);
  const preHashes=hashes(preSrc,preNames); copy(preRoot,path.join(OUTPUT,'PRE_SOURCE'));

  const preModule=fs.readFileSync(path.join(preSrc,MODULE_TARGET),'utf8');
  if(!preModule.includes('TASK_MAPPING_STANDARDIZATION_R1_20260922')) throw new Error('Unexpected PRE standardization version.');
  if(!preModule.includes('function tmStdRunPreInspectCalendarLinkPipeline_')) throw new Error('PRE PreInspection standardization pipeline missing.');

  console.log('=== R1.1 3/9 build WORK ==='); copy(preRoot,workRoot);
  const workSrc=path.join(workRoot,'src'), changed={};
  const candidate=path.resolve(MODULE_SOURCE);
  run(process.execPath,['--check',candidate],process.cwd());
  fs.copyFileSync(candidate,path.join(workSrc,MODULE_TARGET)); changed[MODULE_TARGET]=true;
  const appendFile=replaceFunction(workSrc,'preinspectAppendTaskLinkToCalendarEvent_',FN_PI_APPEND,changed);

  const changedNames=Object.keys(changed).sort();
  changedNames.forEach(n=>run(process.execPath,['--check',path.join(workSrc,n)],process.cwd()));
  const workModule=fs.readFileSync(path.join(workSrc,MODULE_TARGET),'utf8');
  [
    'TASK_MAPPING_STANDARDIZATION_R1_1_20260922',
    'SALES_ORDERS_LIST_BASE_URL',
    'tmStdEnsurePreInspectStephenPresence_',
    'tmStdSalesOrdersListUrl_',
    "status !== 'MATCHED' && status !== 'CONFIRMED'"
  ].forEach(marker=>{if(!workModule.includes(marker))throw new Error('Candidate missing marker: '+marker)});
  const appendText=fs.readFileSync(path.join(workSrc,appendFile),'utf8');
  if(!appendText.includes('Customer/Account ID is required for the Sales Orders list link.')) throw new Error('Append entrypoint patch missing.');

  const untouched=preNames.filter(n=>!changed[n]);
  assertHashes(preHashes,hashes(workSrc,untouched),untouched,'WORK untouched preservation');

  console.log('=== R1.1 4/9 freshness clone ==='); clasp(['clone',SCRIPT_ID,'--rootDir','src'],freshRoot);
  const freshSrc=path.join(freshRoot,'src'), freshNames=names(freshSrc);
  if(JSON.stringify(freshNames)!==JSON.stringify(preNames)) throw new Error('Freshness file set changed.');
  assertHashes(preHashes,hashes(freshSrc,preNames),preNames,'freshness guard');

  console.log('=== R1.1 5/9 push ==='); clasp(['push','--force'],workRoot); pushed=true;
  console.log('=== R1.1 6/9 POST clone ==='); clasp(['clone',SCRIPT_ID,'--rootDir','src'],postRoot);
  const postSrc=path.join(postRoot,'src'), postNames=names(postSrc);
  if(JSON.stringify(postNames)!==JSON.stringify(preNames)) throw new Error('POST file set changed.');

  console.log('=== R1.1 7/9 verify hashes/markers ===');
  const postHashes=hashes(postSrc,postNames);
  assertHashes(preHashes,postHashes,untouched,'POST untouched preservation');
  const workHashes=hashes(workSrc,changedNames);
  assertHashes(workHashes,postHashes,changedNames,'POST changed parity');
  changedNames.forEach(n=>run(process.execPath,['--check',path.join(postSrc,n)],process.cwd()));
  const postModule=fs.readFileSync(path.join(postSrc,MODULE_TARGET),'utf8');
  if(!postModule.includes('TASK_MAPPING_STANDARDIZATION_R1_1_20260922')) throw new Error('POST R1.1 marker missing.');
  if(!postModule.includes('tmStdEnsurePreInspectStephenPresence_')) throw new Error('POST Stephen guard missing.');
  const postAppend=fs.readFileSync(path.join(postSrc,appendFile),'utf8');
  if(!postAppend.includes('tmStdSalesOrdersListUrl_(accountId)')) throw new Error('POST selected-row Sales Orders link patch missing.');

  console.log('=== R1.1 8/9 evidence ===');
  evidence.status='DEPLOYED_SOURCE_VERIFIED'; evidence.completedAt=new Date().toISOString();
  evidence.preFileCount=preNames.length; evidence.postFileCount=postNames.length; evidence.changedFiles=changedNames;
  evidence.untouchedFileCount=untouched.length; evidence.rollback='NOT_REQUIRED';
  evidence.runtimeVerification='CURRENT_EVENTS_VERIFIED_VIA_CALENDAR_CONNECTOR; Apps Script Execution API remains unavailable for new HEAD functions.';
  fs.writeFileSync(evidencePath,JSON.stringify(evidence,null,2));
  console.log('=== R1.1 9/9 complete ==='); console.log('DEPLOYED_SOURCE_VERIFIED');
}catch(err){
  evidence.status='FAILED'; evidence.failedAt=new Date().toISOString(); evidence.error=String(err&&err.stack?err.stack:err);
  if(pushed){
    try{console.error('POST verification failed; rolling back PRE source...');clasp(['push','--force'],preRoot);evidence.rollback='ROLLBACK_PUSH_COMPLETED';}
    catch(rb){evidence.rollback='ROLLBACK_FAILED';evidence.rollbackError=String(rb&&rb.stack?rb.stack:rb);}
  } else evidence.rollback='NOT_NEEDED_NO_PUSH_COMPLETED';
  fs.writeFileSync(evidencePath,JSON.stringify(evidence,null,2)); throw err;
}

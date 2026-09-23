#!/usr/bin/env node
'use strict';
const fs=require('fs'),os=require('os'),path=require('path'),crypto=require('crypto'),cp=require('child_process');
const SID='1E86mhD2dZcOFpqWnCvoIpwEkwZ0MA63MgM8DifV6WyB2FvVQkRWKIZ_m',CV='3.3.0',FILE='35_PreInspect_Task_Review.js';
const OUT=path.resolve('task-mapping-preinspect-r5-7-existing-task-reroute-output');fs.mkdirSync(OUT,{recursive:true});
function run(c,a,d){const r=cp.spawnSync(c,a,{cwd:d||process.cwd(),env:process.env,encoding:'utf8',stdio:['ignore','pipe','pipe']});process.stdout.write(r.stdout||'');process.stderr.write(r.stderr||'');if(r.error)throw r.error;if(r.status)throw new Error(c+' '+a.join(' ')+' failed '+r.status);return r.stdout||'';}
function clasp(a,d){return run('npx',['-y','@google/clasp@'+CV,...a],d)}
function sha(f){return crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex')}
function names(d){return fs.readdirSync(d,{withFileTypes:true}).filter(x=>x.isFile()).map(x=>x.name).sort()}
function hashes(d,ns){const o={};for(const n of ns)o[n]=sha(path.join(d,n));return o}
const root=fs.mkdtempSync(path.join(os.tmpdir(),'tm-michael-hook-')),P=path.join(root,'PRE'),F=path.join(root,'FRESH'),W=path.join(root,'WORK'),O=path.join(root,'POST');
[P,F,W,O].forEach(d=>fs.mkdirSync(d,{recursive:true}));
let pushed=false;
try{
  clasp(['show-authorized-user','--json']);
  clasp(['clone',SID,'--rootDir','src'],P);
  const ps=path.join(P,'src'),ns=names(ps),ph=hashes(ps,ns);
  fs.cpSync(P,path.join(OUT,'PRE_SOURCE'),{recursive:true});
  fs.cpSync(P,W,{recursive:true});
  const ws=path.join(W,'src'),tf=path.join(ws,FILE);let s=fs.readFileSync(tf,'utf8');
  if(s.includes('TM_MICHAEL_BIELEY_ONE_EVENT_R1')) throw new Error('Michael one-event hook already exists in live source.');

  const oldTrigger="function preinspectOnCalendarEventUpdated(e) {\n  return preinspectR3415SyncMirrorAndHyperlinks_('CALENDAR_EVENT_UPDATED');\n}";
  const newTrigger="function preinspectOnCalendarEventUpdated(e) {\n  const sync = preinspectR3415SyncMirrorAndHyperlinks_('CALENDAR_EVENT_UPDATED');\n  let michael = null;\n  try { michael = tmMichaelBieleyOneEventR1_(); }\n  catch (err) { michael = {status:'ERROR',error:String(err && err.message ? err.message : err)}; Logger.log(JSON.stringify({mode:'TM_MICHAEL_BIELEY_ONE_EVENT_R1',result:michael},null,2)); }\n  return {sync:sync,michael:michael};\n}";
  if(!s.includes(oldTrigger)) throw new Error('Expected PreInspect Calendar trigger function not found.');
  s=s.replace(oldTrigger,newTrigger);

  const installSig="function preinspectR30PushInstallNotes_(ctx, preparedPlan) {";
  if(!s.includes(installSig)) throw new Error('Install Notes function signature not found.');
  s=s.replace(installSig,installSig+"\n  if (tmMichaelBieleyIsContext_(ctx)) {\n    return {status:'PAUSED_BY_POLICY',writesPerformed:false,field:'Install Notes',customFieldId:854,reason:'Calendar description to Field 854 is paused for the Michael Bieley one-event test.'};\n  }");

  const assignAnchor="  const verified = preinspectR30ReadTask_(ctx.taskId);\n  const after = preinspectR30NormalizeAssignments_(verified);";
  if(!s.includes(assignAnchor)) throw new Error('Assignee verification anchor not found.');
  const assignInject="  if (tmMichaelBieleyIsContext_(ctx)) {\n    const currentForMichael = preinspectR30NormalizeAssignments_(preinspectR30ReadTask_(ctx.taskId));\n    const hasStephen = currentForMichael.some(function(a){ return String(a.type||'').toLowerCase()==='employee' && Number(a.id)===15; });\n    if (!hasStephen) {\n      const authMichael = preinspectR30ApiAuth_();\n      const urlMichael = authMichael.apiBaseUrl + '/v2/tasks/' + encodeURIComponent(ctx.taskId) + '/assignments';\n      preinspectR30Request_('post', urlMichael, {Id:15,Name:'Stephen Foley',Type:'employee'}, 'MICHAEL_ADD_STEPPHEN_EMPLOYEE_15');\n      writesPerformed = true;\n    }\n  }\n\n"+assignAnchor;
  s=s.replace(assignAnchor,assignInject);

  s += `
\n/************************************************************
 * TM_MICHAEL_BIELEY_ONE_EVENT_R1
 * Temporary, exact-event execution hook. Remove after verification.
 ************************************************************/
const TM_MICHAEL_BIELEY_ONE_EVENT_R1 = Object.freeze({
  EVENT_ID:'3r5dliuq3m2p477lasvdru0lnu',
  CUSTOMER_ID:61116,
  LOCATION_ID:56991,
  DONE_PROPERTY:'TM_MICHAEL_BIELEY_ONE_EVENT_R1_DONE',
  RUNNING_PROPERTY:'TM_MICHAEL_BIELEY_ONE_EVENT_R1_RUNNING'
});

function tmMichaelBieleyNormalizeEventId_(v){return String(v||'').trim().replace(/@google\\.com$/i,'');}

function tmMichaelBieleyIsContext_(ctx){
  const direct=tmMichaelBieleyNormalizeEventId_(ctx&&ctx.eventId);
  if(direct===TM_MICHAEL_BIELEY_ONE_EVENT_R1.EVENT_ID)return true;
  const rowId=tmMichaelBieleyNormalizeEventId_(ctx&&ctx.row&&ctx.row['Event ID']);
  if(rowId===TM_MICHAEL_BIELEY_ONE_EVENT_R1.EVENT_ID)return true;
  try{
    const sh=SpreadsheetApp.getActiveSheet(),r=sh&&sh.getActiveRange();
    if(sh&&sh.getName()==='PreInspect Task Mapping'&&r&&r.getRow()>1){
      const headers=sh.getRange(1,1,1,sh.getLastColumn()).getDisplayValues()[0];
      const i=headers.indexOf('Event ID');
      if(i>=0)return tmMichaelBieleyNormalizeEventId_(sh.getRange(r.getRow(),i+1).getDisplayValue())===TM_MICHAEL_BIELEY_ONE_EVENT_R1.EVENT_ID;
    }
  }catch(ignored){}
  return false;
}

function tmMichaelBieleyFindRow_(){
  const ss=SpreadsheetApp.getActiveSpreadsheet(),sh=ss.getSheetByName('PreInspect Task Mapping');
  if(!sh)throw new Error('Missing PreInspect Task Mapping.');
  const data=sh.getDataRange().getDisplayValues(),h=data[0]||[],i=h.indexOf('Event ID');
  if(i<0)throw new Error('Event ID column missing.');
  for(let r=1;r<data.length;r++){
    if(tmMichaelBieleyNormalizeEventId_(data[r][i])===TM_MICHAEL_BIELEY_ONE_EVENT_R1.EVENT_ID){
      ss.setActiveSheet(sh);sh.setActiveRange(sh.getRange(r+1,1,1,Math.max(1,h.length)));SpreadsheetApp.flush();
      return {ss:ss,sheet:sh,rowNumber:r+1,headers:h};
    }
  }
  throw new Error('Michael Bieley mapping row not found.');
}

function tmMichaelBieleyRow_(sh,row){
  const h=sh.getRange(1,1,1,sh.getLastColumn()).getDisplayValues()[0],v=sh.getRange(row,1,1,sh.getLastColumn()).getDisplayValues()[0],o={};
  h.forEach(function(x,i){x=String(x||'').trim();if(x)o[x]=v[i];});return o;
}

function tmMichaelBieleyOneEventR1_(){
  const props=PropertiesService.getScriptProperties();
  const done=String(props.getProperty(TM_MICHAEL_BIELEY_ONE_EVENT_R1.DONE_PROPERTY)||'');
  if(done)return {status:'ALREADY_DONE',taskId:Number(done)||0};
  if(String(props.getProperty(TM_MICHAEL_BIELEY_ONE_EVENT_R1.RUNNING_PROPERTY)||'')==='TRUE')return {status:'ALREADY_RUNNING'};
  const lock=LockService.getScriptLock();if(!lock.tryLock(1000))return {status:'LOCK_BUSY'};
  props.setProperty(TM_MICHAEL_BIELEY_ONE_EVENT_R1.RUNNING_PROPERTY,'TRUE');
  let success=false;
  try{
    let ref=tmMichaelBieleyFindRow_();
    const result=runSelectedTaskMappingRowEndToEndR4();
    SpreadsheetApp.flush();
    ref=tmMichaelBieleyFindRow_();
    const row=tmMichaelBieleyRow_(ref.sheet,ref.rowNumber);
    const taskId=Number(String(row['Task ID']||'').trim())||0;
    if(!taskId)throw new Error('Michael workflow completed without a Task ID. Status='+String(row['Status']||'')+' Action='+String(row['Task Action']||'')+' Issue='+String(row['Issue']||''));
    const task=preinspectR30ReadTask_(taskId);
    const type=preinspectR30Entity_(preinspectR30Pick_(task,['type','Type']));
    const cust=preinspectR30Entity_(preinspectR30Pick_(task,['customer','Customer']));
    const loc=preinspectR30Entity_(preinspectR30Pick_(task,['location','Location']));
    const so=preinspectR30Entity_(preinspectR30Pick_(task,['salesOrder','SalesOrder']));
    if(Number(type.id||0)!==105)throw new Error('Task '+taskId+' is not Type 105.');
    if(Number(cust.id||0)!==61116)throw new Error('Task '+taskId+' customer mismatch.');
    if(Number(loc.id||0)!==56991)throw new Error('Task '+taskId+' location mismatch.');
    if(Number(so.id||0)>0)throw new Error('Task '+taskId+' unexpectedly has a Sales Order.');
    const assignments=preinspectR30NormalizeAssignments_(task);
    const pool8=assignments.some(function(a){return String(a.type||'').toLowerCase()==='pool'&&Number(a.id)===8;});
    const stephen=assignments.some(function(a){return String(a.type||'').toLowerCase()==='employee'&&Number(a.id)===15;});
    if(!pool8||!stephen)throw new Error('Assignment verification failed. Pool8='+pool8+' Stephen='+stephen);
    const fields=preinspectR30NormalizeCustomFields_(task),f854=fields.filter(function(f){return Number(f.id)===854;})[0]||null;
    const field854=f854?String(f854.value||''):'';
    if(field854.trim())throw new Error('Field 854 was populated during paused test.');
    const desc=String(preinspectR30Pick_(task,['description','Description'])||'');
    if(desc.trim())throw new Error('Task Description is not blank.');
    const audit={taskId:taskId,title:String(preinspectR30Pick_(task,['title','Title'])||''),pool8:pool8,stephenEmployee15:stephen,field854Blank:true,descriptionBlank:true,requestedBy:preinspectR30Pick_(task,['requestedBy','RequestedBy'])||null,status:preinspectR30Pick_(task,['status','Status'])||null,resultStatus:result&&result.status?result.status:''};
    const notesIdx=ref.headers.indexOf('Notes');
    if(notesIdx>=0)ref.sheet.getRange(ref.rowNumber,notesIdx+1).setValue('MICHAEL_TEST_R1 '+JSON.stringify(audit));
    props.setProperty(TM_MICHAEL_BIELEY_ONE_EVENT_R1.DONE_PROPERTY,String(taskId));
    success=true;
    Logger.log(JSON.stringify({mode:'TM_MICHAEL_BIELEY_ONE_EVENT_R1',status:'EXECUTED_VERIFIED',audit:audit},null,2));
    return {status:'EXECUTED_VERIFIED',audit:audit};
  } finally {
    props.deleteProperty(TM_MICHAEL_BIELEY_ONE_EVENT_R1.RUNNING_PROPERTY);
    if(!success)Logger.log(JSON.stringify({mode:'TM_MICHAEL_BIELEY_ONE_EVENT_R1',status:'NOT_VERIFIED'},null,2));
    lock.releaseLock();
  }
}
`;

  fs.writeFileSync(tf,s);run('node',['--check',tf]);
  const wh=hashes(ws,ns),changed=ns.filter(n=>wh[n]!==ph[n]);if(JSON.stringify(changed)!==JSON.stringify([FILE]))throw new Error('Changed-file guard: '+changed.join(','));
  clasp(['clone',SID,'--rootDir','src'],F);const fsrc=path.join(F,'src'),fn=names(fsrc),fh=hashes(fsrc,fn);if(JSON.stringify(fn)!==JSON.stringify(ns))throw new Error('Fresh file set changed');for(const n of ns)if(fh[n]!==ph[n])throw new Error('Freshness guard '+n);
  clasp(['push','--force'],W);pushed=true;
  clasp(['clone',SID,'--rootDir','src'],O);const osrc=path.join(O,'src'),on=names(osrc),oh=hashes(osrc,on);if(JSON.stringify(on)!==JSON.stringify(ns))throw new Error('POST file set changed');for(const n of ns){const exp=n===FILE?wh[n]:ph[n];if(oh[n]!==exp)throw new Error('POST verify '+n)}
  const ev={status:'DEPLOYED_MICHAEL_ONE_EVENT_HOOK_VERIFIED',scriptId:SID,changedFiles:[FILE],preFileCount:ns.length,postFileCount:on.length,preSha:ph[FILE],postSha:oh[FILE],businessWritesPerformed:false,completedAt:new Date().toISOString()};
  fs.writeFileSync(path.join(OUT,'evidence.json'),JSON.stringify(ev,null,2));console.log(JSON.stringify(ev,null,2));
}catch(err){
  if(pushed){try{clasp(['push','--force'],P)}catch(rb){console.error('ROLLBACK_FAILED',rb)}}
  fs.writeFileSync(path.join(OUT,'evidence.json'),JSON.stringify({status:'FAILED',error:String(err&&err.stack||err)},null,2));
  throw err;
}

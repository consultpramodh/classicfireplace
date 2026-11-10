// GitHub Actions / Node.js — guarded Apps Script HEAD-only PI intake review release.
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),vm=require('node:vm');
const scriptId='1shaSL1CeNhR2-fr8H4x0fP2KUIjpOizLFyrNRAnGGXkCvERX4hZyJ5Gt';
const dir='apps-script/tmv3-vertical-split-staging';
const manifest=JSON.parse(fs.readFileSync(path.join(dir,'migration-manifest.json'),'utf8'));
// Derive the exact expected production PI file: last confirmed owner mapping
// source PLUS the one-function bounded diagnostic deployed on Nov 9. The newer
// PR audit-order edits must NOT be carried into production by this release.
const piBaseline=require('node:child_process').execFileSync('git',
 ['show','e18488fa760f1aa66de22147fea8d1d67132cf50:apps-script/tmv3-vertical-split-staging/30_PreInspection.gs'],
 {encoding:'utf8'});
const stagedPI=fs.readFileSync(path.join(dir,'30_PreInspection.gs'),'utf8');
const expectedLivePI=piBaseline.replace(extractDiagnostic(piBaseline),extractDiagnostic(stagedPI));
const priorPIHash=crypto.createHash('sha256').update(expectedLivePI).digest('hex');
const lastDeployedStandards='c1452dd4edd16d928317eb16e9beb41d6b8a917f';
function priorText(file){return require('node:child_process').execFileSync('git',
 ['show',lastDeployedStandards+':'+dir+'/'+file+'.gs'],{encoding:'utf8'});}
const priorConfigHash=crypto.createHash('sha256').update(priorText('00_Configuration')).digest('hex');
const priorCoreHash=crypto.createHash('sha256').update(priorText('10_Shared_Core')).digest('hex');
// Approved staging source is pinned to this checkout. All live files are retained except configuration and shared core.
const allNames=['00_Configuration','10_Shared_Core','20_Master_Triggers','30_PreInspection','40_Installation','50_Delivery','60_Service','90_Regression_Tests'];
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
function scope(o,keys){if(!o||typeof o!=='object')return '';for(const [k,v] of Object.entries(o))if(keys.includes(k)&&typeof v==='string'&&v)return v;for(const v of Object.values(o)){const s=scope(v,keys);if(s)return s;}return '';}
function map(files){const m=new Map();for(const f of files){if(m.has(f.name))throw Error('DUPLICATE_SCRIPT_FILE');m.set(f.name,f);}return m;}
function preflight(files){const m=map(files);if(m.size!==9)throw Error('LIVE_FILES_CHANGED_'+m.size);
 for(const name of allNames){const item=m.get(name);if(!item||item.type!=='SERVER_JS')throw Error('LIVE_SCRIPT_MISSING_'+name);
 const expected=name==='30_PreInspection'?priorPIHash:name==='00_Configuration'?priorConfigHash:name==='10_Shared_Core'?priorCoreHash:manifest.files[name+'.gs'].sha256;
 if(sha(item.source)!==expected)throw Error('LIVE_SCRIPT_HASH_DRIFT_'+name);}
 const mf=m.get('appsscript');if(!mf||mf.type!=='JSON'||sha(mf.source)!==manifest.files['appsscript.json'].sha256)throw Error('MANIFEST_DRIFT');}
function same(a,b){const m=map(a),n=map(b);return m.size===n.size&&[...m].every(([k,v])=>n.has(k)&&n.get(k).type===v.type&&sha(n.get(k).source)===sha(v.source));}
function v8(files){const ctx=vm.createContext({console:{log(){},error(){}}});files.filter(f=>f.type==='SERVER_JS').forEach(f=>new vm.Script(f.source,{filename:f.name}).runInContext(ctx,{timeout:3500}));return Object.fromEntries(Object.keys(ctx).filter(k=>typeof ctx[k]==='function').map(k=>[k,ctx[k].toString()]));}
function validate(before,after){
 const a=v8(before),b=v8(after),oldNames=Object.keys(a),newNames=Object.keys(b);
 if(oldNames.length!==689||newNames.length!==690)throw Error('FUNCTION_COUNT_DRIFT_'+oldNames.length+'_'+newNames.length);
 const changed=oldNames.filter(n=>b[n]!==a[n]).sort(),added=newNames.filter(n=>!a[n]);
 const expected=['tmv3_executeFreshStep7Selection_','tmv3_createOrRecreateFromBundleUnlocked_',
 'tmv3_preInspectionPromoteCandidate_','tmv3_preInspectionSendMissingDetails_',
 'tmv3_ensurePreInspectionMirror_','tmv3_reconcilePreInspectionCalendarParity_',
 'tmv3_restorePreInspectionLegacyTitle_','tmv3_reconcilePreInspectionSharedGuest_AUTO_',
 'tmv3_preInspectionAutomationCycle_'].sort();
 if(changed.join('|')!==expected.join('|')||added.join('|')!=='tmv3_preInspectionApprovalHold_')
  throw Error('UNEXPECTED_FUNCTION_DRIFT_'+changed.join('|')+'+'+added.join('|'));
 const cfg=map(after).get('00_Configuration').source,pi=map(after).get('30_PreInspection').source;
 if(!cfg.includes("operatorApprovedIntakeHolds:Object.freeze(")||!pi.includes('APPROVED_INTAKE_TASK_AND_NOTIFICATION_HELD')||
   !b.tmv3_createOrRecreateFromBundleUnlocked_.includes('OPERATOR_APPROVED_INTAKE_TASK_CREATION_HELD'))
  throw Error('MISSING_EXACT_EVENT_SAFETY_GATES');
 const ctx=vm.createContext({console:{log(){},error(){}}});
 const files=map(after);
 for(const name of allNames)new vm.Script(files.get(name).source,{filename:name}).runInContext(ctx,{timeout:3500});
 const hold=ctx.tmv3_preInspectionApprovalHold_('5mafnqht16o2hrqv4232rofmm3@google.com');
 if(!hold||hold.customerNumber!=='53480'||hold.authorizeTaskWrites!==false||
   hold.authorizeGuestChanges!==false||hold.authorizeEmail!==false)
  throw Error('TERRY_HOLD_NOT_PRESENT');
 const blocked=ctx.tmv3_executeFreshStep7Selection_({contract:{vertical:'PreInspection',eventId:hold.eventId}},'PREINSPECTIONAUTO','ALL');
 if(blocked.status!=='BLOCKED_NO_WRITE'||blocked.taskWrites!==0)throw Error('STAGE7_HOLD_NOT_ENFORCED');
 return{existing:689,unchanged:680,altered:changed,added,post:690};
}
function extractDiagnostic(source){
  const marker='function tmv3_verifyPreInspectionAutomation(eventId) {';
  const first=source.indexOf(marker);
  if(first<0||source.indexOf(marker,first+1)>=0)throw Error('DIAGNOSTIC_SIGNATURE_NOT_UNIQUE');
  const suffix=source.slice(first);
  const match=/^function tmv3_verifyPreInspectionAutomation\(eventId\) \{[\s\S]*?^\}/m.exec(suffix);
  if(!match||match.index!==0)throw Error('DIAGNOSTIC_BODY_EXTRACT_FAILED');
  return match[0];
}
const modifiedPI=[
 'tmv3_preInspectionPromoteCandidate_','tmv3_preInspectionSendMissingDetails_',
 'tmv3_ensurePreInspectionMirror_','tmv3_reconcilePreInspectionCalendarParity_',
 'tmv3_restorePreInspectionLegacyTitle_','tmv3_reconcilePreInspectionSharedGuest_AUTO_',
 'tmv3_preInspectionAutomationCycle_'];
function extractFunction(source,name){
 const needle='function '+name+'(';
 const at=source.indexOf(needle);
 if(at<0||source.indexOf(needle,at+needle.length)>=0)throw Error('FUNCTION_MISSING_OR_DUP_'+name);
 const tail=source.slice(at);
 const m=/^function [^]*?^}/m.exec(tail);
 if(!m||m.index!==0)throw Error('FUNCTION_EXTRACT_FAILED_'+name);
 return m[0];
}
function finalFiles(before){
 const config=fs.readFileSync(path.join(dir,'00_Configuration.gs'),'utf8');
 const shared=fs.readFileSync(path.join(dir,'10_Shared_Core.gs'),'utf8');
 let pi=map(before).get('30_PreInspection').source;
 for(const name of modifiedPI){
   const oldBody=extractFunction(pi,name),newBody=extractFunction(stagedPI,name);
   if(oldBody===newBody)throw Error('PI_EXPECTED_CHANGE_MISSING_'+name);
   pi=pi.replace(oldBody,newBody);
 }
 const helper=extractFunction(stagedPI,'tmv3_preInspectionApprovalHold_');
 if(pi.includes('function tmv3_preInspectionApprovalHold_('))throw Error('HELPER_ALREADY_PRESENT');
 pi+='\n\n'+helper+'\n';
 return before.map(f=>f.name==='00_Configuration'?{...f,source:config}:
 f.name==='10_Shared_Core'?{...f,source:shared}:
 f.name==='30_PreInspection'?{...f,source:pi}:f);
}
async function authorize(){const config=JSON.parse(process.env.CLASPRC_JSON||'{}');const form=new URLSearchParams({grant_type:'refresh_token',client_id:scope(config,['clientId','client_id']),client_secret:scope(config,['clientSecret','client_secret']),refresh_token:scope(config,['refresh_token','refreshToken'])});if([...form.values()].some(v=>!v))throw Error('OAUTH_FIELDS_MISSING');
 const response=await fetch('https://oauth2.googleapis.com/token',{method:'POST',body:form,signal:AbortSignal.timeout(20000)});if(!response.ok)throw Error('OAUTH_REFRESH_HTTP_'+response.status);
 const body=await response.json();if(!body.access_token)throw Error('NO_ACCESS_TOKEN');return body.access_token;}
async function api(token,method,body){const response=await fetch('https://script.googleapis.com/v1/projects/'+scriptId+'/content',{method,headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(90000)});if(!response.ok)throw Error('APPS_SCRIPT_'+method+'_HTTP_'+response.status);return response.json();}
async function main(){const mode=process.argv[2]||'dry-run';if(!['dry-run','deploy'].includes(mode))throw Error('UNSUPPORTED_MODE');
 const token=await authorize(),first=(await api(token,'GET')).files||[];preflight(first);const desired=finalFiles(first),checks=validate(first,desired);
 console.log('TMV3_TERRY_GUARD_PREFLIGHT='+JSON.stringify({mode,...checks,liveFiles:9,calendarWrites:0,strivenWrites:0,triggerChanges:0}));
 if(mode==='dry-run')return;
 const second=(await api(token,'GET')).files||[];preflight(second);if(!same(first,second))throw Error('LIVE_HEAD_CHANGED_AFTER_PREFLIGHT');
 try{await api(token,'PUT',{files:desired});const readback=(await api(token,'GET')).files||[];
 if(!same(readback,desired))throw Error('TMV3_TERRY_GUARD_READBACK_MISMATCH');validate(second,readback);
 console.log('TMV3_TERRY_GUARD_DEPLOYED='+JSON.stringify({status:'HEAD_REVIEW_SOURCE_READBACK_VERIFIED',existingFunctionsPreserved:680,modifiedExistingFunctions:9,newFunctions:1,totalFunctions:690,files:9,triggerChanges:0,numberedVersions:0,calendarWrites:0,strivenWrites:0}));}
 catch(err){let current;try{current=(await api(token,'GET')).files||[];}catch(e){throw Error('UNKNOWN_PUSH_OUTCOME_NO_READBACK');}
 if(same(current,second))throw Error('PUSH_FAILED_NO_SOURCE_CHANGE_'+String(err.message||err));
 if(same(current,desired)){await api(token,'PUT',{files:second});const restored=(await api(token,'GET')).files||[];if(!same(restored,second))throw Error('ROLLBACK_READBACK_FAILED');throw Error('DEPLOY_FAILED_ROLLBACK_VERIFIED_'+String(err.message||err));}
 throw Error('CONCURRENT_HEAD_DRIFT_MANUAL_RECONCILIATION_REQUIRED');}
}
main().catch(e=>{console.error('TMV3_TERRY_GUARD_DEPLOY_ERROR='+String(e.message||e).slice(0,190));process.exitCode=1;});

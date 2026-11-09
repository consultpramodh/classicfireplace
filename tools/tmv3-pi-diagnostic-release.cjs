// GitHub Actions / Node.js — guarded Apps Script HEAD-only PI intake review release.
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),vm=require('node:vm');
const scriptId='1shaSL1CeNhR2-fr8H4x0fP2KUIjpOizLFyrNRAnGGXkCvERX4hZyJ5Gt';
const dir='apps-script/tmv3-vertical-split-staging';
const manifest=JSON.parse(fs.readFileSync(path.join(dir,'migration-manifest.json'),'utf8'));
const priorPIHash=crypto.createHash('sha256').update(require('node:child_process').execFileSync('git',['show','e18488fa760f1aa66de22147fea8d1d67132cf50:apps-script/tmv3-vertical-split-staging/30_PreInspection.gs'],{encoding:'utf8'})).digest('hex');
// Desired source is pinned to the immutable GitHub Actions checkout; parity below checks every original function.
const stagedPI=fs.readFileSync(path.join(dir,'30_PreInspection.gs'),'utf8');
const allNames=['00_Configuration','10_Shared_Core','20_Master_Triggers','30_PreInspection','40_Installation','50_Delivery','60_Service','90_Regression_Tests'];
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
function scope(o,keys){if(!o||typeof o!=='object')return '';for(const [k,v] of Object.entries(o))if(keys.includes(k)&&typeof v==='string'&&v)return v;for(const v of Object.values(o)){const s=scope(v,keys);if(s)return s;}return '';}
function map(files){const m=new Map();for(const f of files){if(m.has(f.name))throw Error('DUPLICATE_SCRIPT_FILE');m.set(f.name,f);}return m;}
function preflight(files){const m=map(files);if(m.size!==9)throw Error('LIVE_FILES_CHANGED_'+m.size);
 for(const name of allNames){const item=m.get(name);if(!item||item.type!=='SERVER_JS')throw Error('LIVE_SCRIPT_MISSING_'+name);
 const expected=name==='30_PreInspection'?priorPIHash:manifest.files[name+'.gs'].sha256;
 if(sha(item.source)!==expected)throw Error('LIVE_SCRIPT_HASH_DRIFT_'+name);}
 const mf=m.get('appsscript');if(!mf||mf.type!=='JSON'||sha(mf.source)!==manifest.files['appsscript.json'].sha256)throw Error('MANIFEST_DRIFT');}
function same(a,b){const m=map(a),n=map(b);return m.size===n.size&&[...m].every(([k,v])=>n.has(k)&&n.get(k).type===v.type&&sha(n.get(k).source)===sha(v.source));}
function v8(files){const ctx=vm.createContext({console:{log(){},error(){}}});files.filter(f=>f.type==='SERVER_JS').forEach(f=>new vm.Script(f.source,{filename:f.name}).runInContext(ctx,{timeout:3500}));return Object.fromEntries(Object.keys(ctx).filter(k=>typeof ctx[k]==='function').map(k=>[k,ctx[k].toString()]));}
function validate(before,after){
  const a=v8(before),b=v8(after);
  if(Object.keys(a).length!==689||Object.keys(b).length!==689)throw Error('FUNCTION_COUNT_DRIFT');
  const changed=Object.keys(a).filter(k=>b[k]!==a[k]),added=Object.keys(b).filter(k=>!a[k]);
  if(changed.join('|')!=='tmv3_verifyPreInspectionAutomation'||added.length)throw Error('UNEXPECTED_FUNCTION_DRIFT_'+changed.join(',')+'_'+added.join(','));
  const fn=b.tmv3_verifyPreInspectionAutomation||'';
  if(!fn.includes('PI_VERIFICATION_BATCH=')||!fn.includes('offset+3')||
     !fn.includes('CACHE_ONLY_BATCH')||!fn.includes('tmv3_rows_'))
    throw Error('MISSING_BOUNDED_DIAGNOSTIC_GUARDS');
  if(/UrlFetchApp|CalendarApp|MailApp|tmv3_step7FreshPlansForEvent_|tmv3_upsertTaskCacheRow_|tmv3_audit_/.test(fn))
    throw Error('DIAGNOSTIC_BUSINESS_IO_DISALLOWED');
  return{existing:689,unchanged:688,altered:changed,added,post:689};
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
function finalFiles(before){
  const desiredFn=extractDiagnostic(stagedPI);
  return before.map(f=>f.name==='30_PreInspection'
    ?{...f,source:f.source.replace(extractDiagnostic(f.source),desiredFn)}:f);
}

async function authorize(){const config=JSON.parse(process.env.CLASPRC_JSON||'{}');const form=new URLSearchParams({grant_type:'refresh_token',client_id:scope(config,['clientId','client_id']),client_secret:scope(config,['clientSecret','client_secret']),refresh_token:scope(config,['refresh_token','refreshToken'])});if([...form.values()].some(v=>!v))throw Error('OAUTH_FIELDS_MISSING');
 const response=await fetch('https://oauth2.googleapis.com/token',{method:'POST',body:form,signal:AbortSignal.timeout(20000)});if(!response.ok)throw Error('OAUTH_REFRESH_HTTP_'+response.status);
 const body=await response.json();if(!body.access_token)throw Error('NO_ACCESS_TOKEN');return body.access_token;}
async function api(token,method,body){const response=await fetch('https://script.googleapis.com/v1/projects/'+scriptId+'/content',{method,headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(90000)});if(!response.ok)throw Error('APPS_SCRIPT_'+method+'_HTTP_'+response.status);return response.json();}
async function main(){const mode=process.argv[2]||'dry-run';if(!['dry-run','deploy'].includes(mode))throw Error('UNSUPPORTED_MODE');
 const token=await authorize(),first=(await api(token,'GET')).files||[];preflight(first);const desired=finalFiles(first),checks=validate(first,desired);
 console.log('PI_DIAGNOSTIC_PREFLIGHT='+JSON.stringify({mode,...checks,liveFiles:9,calendarWrites:0,strivenWrites:0,triggerChanges:0}));
 if(mode==='dry-run')return;
 const second=(await api(token,'GET')).files||[];preflight(second);if(!same(first,second))throw Error('LIVE_HEAD_CHANGED_AFTER_PREFLIGHT');
 try{await api(token,'PUT',{files:desired});const readback=(await api(token,'GET')).files||[];
 if(!same(readback,desired))throw Error('PI_DIAGNOSTIC_READBACK_MISMATCH');validate(second,readback);
 console.log('PI_DIAGNOSTIC_DEPLOYED='+JSON.stringify({status:'HEAD_REVIEW_SOURCE_READBACK_VERIFIED',existingFunctionsPreserved:688,modifiedExistingFunctions:1,newFunctions:0,totalFunctions:689,files:9,triggerChanges:0,numberedVersions:0,calendarWrites:0,strivenWrites:0}));}
 catch(err){let current;try{current=(await api(token,'GET')).files||[];}catch(e){throw Error('UNKNOWN_PUSH_OUTCOME_NO_READBACK');}
 if(same(current,second))throw Error('PUSH_FAILED_NO_SOURCE_CHANGE_'+String(err.message||err));
 if(same(current,desired)){await api(token,'PUT',{files:second});const restored=(await api(token,'GET')).files||[];if(!same(restored,second))throw Error('ROLLBACK_READBACK_FAILED');throw Error('DEPLOY_FAILED_ROLLBACK_VERIFIED_'+String(err.message||err));}
 throw Error('CONCURRENT_HEAD_DRIFT_MANUAL_RECONCILIATION_REQUIRED');}
}
main().catch(e=>{console.error('PI_DIAGNOSTIC_DEPLOY_ERROR='+String(e.message||e).slice(0,190));process.exitCode=1;});

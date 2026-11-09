// Node.js, GitHub Actions: guarded source-only patch that adds a read-only PI permission probe.
'use strict';
const fs=require('node:fs'), path=require('node:path'), crypto=require('node:crypto'), vm=require('node:vm');
const scriptId='1shaSL1CeNhR2-fr8H4x0fP2KUIjpOizLFyrNRAnGGXkCvERX4hZyJ5Gt';
const root=process.cwd();
const base=path.join(root,'apps-script','tmv3-vertical-split-staging');
const sha256=s=>crypto.createHash('sha256').update(s).digest('hex');
const manifest=JSON.parse(fs.readFileSync(path.join(base,'migration-manifest.json'),'utf8'));
const names=['00_Configuration','10_Shared_Core','20_Master_Triggers','30_PreInspection','40_Installation','50_Delivery','60_Service','90_Regression_Tests'];
const piName='30_PreInspection';
const probe=fs.readFileSync(path.join(root,'ops','tmv3-preinspection-auth-probe.txt'),'utf8');
function keysOf(f){return new Set(Object.keys(f).filter(x=>typeof f[x]==='function'));}
function scope(o,k){if(!o||typeof o!=='object')return '';for(const [a,b] of Object.entries(o))if(k.includes(a)&&typeof b==='string'&&b)return b;for(const x of Object.values(o)){const v=scope(x,k);if(v)return v;}return '';}
function mapFiles(files){const m=new Map();for(const f of files){if(m.has(f.name))throw Error('DUPLICATE_SCRIPT_FILE_'+f.name);m.set(f.name,f);}return m;}
function baseline(files){const m=mapFiles(files);if(m.size!==9)throw Error('LIVE_FILE_COUNT_DRIFT_'+m.size);
 for(const name of names){const f=m.get(name), expected=manifest.files[name+'.gs'].sha256;if(!f||f.type!=='SERVER_JS'||sha256(f.source)!==expected)throw Error('LIVE_SCRIPT_DRIFT_'+name);}
 const mf=m.get('appsscript');if(!mf||mf.type!=='JSON'||sha256(mf.source)!==manifest.files['appsscript.json'].sha256)throw Error('LIVE_MANIFEST_DRIFT');
 return true;
}
function build(b){const expected=[...names].map(n=>({name:n,type:'SERVER_JS',source:b.find(f=>f.name===n).source+(n===piName?probe:'')}));
 expected.push(b.find(f=>f.name==='appsscript'));
 const pi=fs.readFileSync(path.join(base,'30_PreInspection.gs'),'utf8');if(expected.find(f=>f.name===piName).source!==pi)throw Error('STAGED_PI_NOT_EXACT_BASE_PLUS_PROBE');
 if(sha256(pi)!=='dbbdda9f9c5f9a8a68e624438e4d393b4ba2cafd212e006f94db369089e83845')throw Error('STAGED_PI_SHA_MISMATCH');
 return expected;
}
function same(a,b){const ma=mapFiles(a),mb=mapFiles(b);if(ma.size!==mb.size)return false;
 for(const [k,v] of ma){const w=mb.get(k);if(!w||w.type!==v.type||sha256(w.source)!==sha256(v.source))return false;}return true;
}
function functions(files){const ctx=vm.createContext({console:{log(){},warn(){},error(){}}});for(const f of files){if(f.type==='SERVER_JS'){new vm.Script(f.source,{filename:f.name}).runInContext(ctx,{timeout:3000});}}return ctx;}
function sourceParity(before,after){const orig=functions(before), next=functions(after), a=keysOf(orig), b=keysOf(next);
 if(a.size!==682||b.size!==683||!b.has('tmv3_preInspectionAuthorizationCheck'))throw Error('FUNCTION_SET_COUNT_DRIFT_'+a.size+'_'+b.size);
 for(const n of a){if(!b.has(n)||orig[n].toString()!==next[n].toString())throw Error('EXISTING_FUNCTION_CHANGED_'+n);}
 const extras=[...b].filter(n=>!a.has(n));if(extras.length!==1||extras[0]!=='tmv3_preInspectionAuthorizationCheck')throw Error('UNEXPECTED_NEW_FUNCTIONS');
 const result=vm.runInContext('tmv3_preInspectionAuthorizationCheck',next);
 if(!/MailApp\.getRemainingDailyQuota/.test(result.toString())||!/CalendarApp\.getCalendarById/.test(result.toString()))throw Error('PROBE_DOES_NOT_VERIFY_BOTH_SCOPES');
 if(/MailApp\.sendEmail|\.setTitle\(|\.setDescription\(|ScriptApp\.newTrigger\(|UrlFetchApp|SpreadsheetApp\.getActive/.test(result.toString()))throw Error('PROBE_HAS_MUTATION_EXPRESSION');
 return {existingFunctionsPreserved:a.size,added:extras};
}
async function auth(){const x=JSON.parse(process.env.CLASPRC_JSON||'{}');const form=new URLSearchParams({grant_type:'refresh_token',client_id:scope(x,['clientId','client_id']),client_secret:scope(x,['clientSecret','client_secret']),refresh_token:scope(x,['refresh_token','refreshToken'])});if([...form.values()].some(v=>!v))throw Error('OAUTH_FIELDS_MISSING');const r=await fetch('https://oauth2.googleapis.com/token',{method:'POST',body:form,signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error('OAUTH_REFRESH_HTTP_'+r.status);const j=await r.json();if(!j.access_token)throw Error('OAUTH_NO_ACCESS_TOKEN');return j.access_token;}
async function api(token,method,body){const r=await fetch('https://script.googleapis.com/v1/projects/'+scriptId+'/content',{method,headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(90000)});if(!r.ok)throw Error('APPS_SCRIPT_'+method+'_HTTP_'+r.status);return r.json();}
async function main(){const mode=process.argv[2]||'dry-run';if(!['dry-run','deploy'].includes(mode))throw Error('UNSUPPORTED_MODE');
 const token=await auth();const first=(await api(token,'GET')).files||[];baseline(first);const final=build(first);const parity=sourceParity(first,final);
 console.log('PI_AUTH_PROBE_PREFLIGHT='+JSON.stringify({mode,beforeFiles:9,afterFiles:9,...parity,version:'3.12.21',sendsMail:false,writesBusinessData:false}));
 if(mode==='dry-run')return;
 const second=(await api(token,'GET')).files||[];baseline(second);if(!same(first,second))throw Error('LIVE_HEAD_CHANGED_AFTER_PREFLIGHT');let attempted=false;
 try{attempted=true;await api(token,'PUT',{files:final});const got=(await api(token,'GET')).files||[];if(!same(got,final))throw Error('PI_AUTH_PROBE_READBACK_MISMATCH');sourceParity(second,got);console.log('PI_AUTH_PROBE_DEPLOYED='+JSON.stringify({status:'HEAD_DIAGNOSTIC_READBACK_VERIFIED',files:9,functions:683,existingFunctionsUnchanged:682,newFunction:'tmv3_preInspectionAuthorizationCheck',emailsSent:0,calendarWrites:0,triggerChanges:0,numberedDeploymentsCreated:0}));}
 catch(err){if(!attempted)throw err;let current;try{current=(await api(token,'GET')).files||[];}catch(e){throw Error('UNKNOWN_PUSH_OUTCOME_CANNOT_READBACK');}
 if(same(current,second))throw Error('PUSH_FAILED_BUT_SOURCE_UNCHANGED_'+String(err.message||err));
 if(same(current,final)){await api(token,'PUT',{files:second});const restored=(await api(token,'GET')).files||[];if(!same(restored,second))throw Error('ROLLBACK_READBACK_FAILED');throw Error('PUSH_FAILED_ROLLBACK_VERIFIED_'+String(err.message||err));}
 throw Error('SOURCE_DRIFT_AFTER_ERROR_MANUAL_RECONCILIATION_REQUIRED');}
}
main().catch(e=>{console.error('PI_AUTH_PROBE_DEPLOY_ERROR='+String(e.message||e).slice(0,180));process.exitCode=1;});
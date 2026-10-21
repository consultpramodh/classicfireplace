// JavaScript / Node.js 22: run on the owner's computer, never in CI.
'use strict';
const fs=require('node:fs'),http=require('node:http'),crypto=require('node:crypto');
const {spawnSync}=require('node:child_process');
const CLIENT='499373863884-qb6lcfr1886379383h4mff9gne3g3sko.apps.googleusercontent.com';
const SCRIPT='1shaSL1CeNhR2-fr8H4x0fP2KUIjpOizLFyrNRAnGGXkCvERX4hZyJ5Gt';
const REPO='consultpramodh/classicfireplace';
const SCOPES=['spreadsheets','calendar','script.external_request','script.scriptapp','script.send_mail','script.projects','script.deployments','script.webapp.deploy','drive.file','drive.metadata.readonly','logging.read','service.management','cloud-platform'].map(s=>'https://www.googleapis.com/auth/'+s).concat(['openid','https://www.googleapis.com/auth/userinfo.email','https://www.googleapis.com/auth/userinfo.profile']);
function clientConfig(json){const c=json.installed;if(!c||c.client_id!==CLIENT||!c.client_secret)throw Error('Use the downloaded Desktop client JSON for the selected V3 client.');return c;}
function callbackCode(url,state){if(url.pathname!=='/oauth2callback'||url.searchParams.get('state')!==state)throw Error('Invalid OAuth callback.');if(url.searchParams.has('error'))throw Error('Google consent was declined.');const code=url.searchParams.get('code');if(!code)throw Error('Authorization code missing.');return code;}
function credential(c,t){if(!t.refresh_token)throw Error('Offline refresh token missing. Existing GitHub secret was not changed.');return {tokens:{default:{type:'authorized_user',client_id:c.client_id,client_secret:c.client_secret,refresh_token:t.refresh_token}}};}
async function jsonRequest(url,options={}){const r=await fetch(url,{...options,redirect:'error',signal:AbortSignal.timeout(120000)});if(!r.ok)throw Error('Google request failed: HTTP '+r.status+' at '+new URL(url).pathname);return r.json();}
async function authorize(c){
 const state=crypto.randomBytes(32).toString('base64url'),verifier=crypto.randomBytes(48).toString('base64url');
 let server,timer;
 try{
  const codePromise=new Promise((resolve,reject)=>{
   server=http.createServer((req,res)=>{
    const u=new URL(req.url,'http://127.0.0.1');
    if(u.pathname!=='/oauth2callback'){res.writeHead(404).end();return;}
    try{const code=callbackCode(u,state);res.writeHead(200,{'Content-Type':'text/plain','Cache-Control':'no-store'}).end('Consent received. Return to the terminal for verification.');resolve(code);}
    catch(e){res.writeHead(400).end('Authorization rejected.');if(u.searchParams.get('state')===state)reject(e);}
   });
   server.on('error',reject);
   timer=setTimeout(()=>reject(Error('Consent timed out; GitHub secret unchanged.')),600000);
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  const redirect='http://127.0.0.1:'+server.address().port+'/oauth2callback';
  const u=new URL('https://accounts.google.com/o/oauth2/v2/auth');
  u.search=new URLSearchParams({client_id:c.client_id,redirect_uri:redirect,response_type:'code',scope:SCOPES.join(' '),state,code_challenge:crypto.createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256',access_type:'offline',prompt:'consent select_account'}).toString();
  console.log('Open this URL on THIS computer. Sign in as the Apps Script owner and approve the requested scopes:\n'+u.href);
  const code=await codePromise;
  return await jsonRequest('https://oauth2.googleapis.com/token',{method:'POST',body:new URLSearchParams({client_id:c.client_id,client_secret:c.client_secret,code,code_verifier:verifier,grant_type:'authorization_code',redirect_uri:redirect})});
 }finally{clearTimeout(timer);if(server)server.close();}
}
async function verify(c,t){
 const refreshed=await jsonRequest('https://oauth2.googleapis.com/token',{method:'POST',body:new URLSearchParams({client_id:c.client_id,client_secret:c.client_secret,refresh_token:t.refresh_token,grant_type:'refresh_token'})});
 if(!refreshed.access_token)throw Error('Refresh verification failed.');
 const headers={Authorization:'Bearer '+refreshed.access_token};
 const source=await jsonRequest('https://script.googleapis.com/v1/projects/'+SCRIPT+'/content',{headers});
 const manifest=source.files.find(f=>f.name==='appsscript');if(!manifest)throw Error('Live manifest missing.');
 const granted=new Set(String(refreshed.scope||t.scope||'').split(/\s+/));
 const required=[...SCOPES,...JSON.parse(manifest.source).oauthScopes||[]];
 if(required.some(s=>!granted.has(s)))throw Error('Required scopes missing; secret unchanged.');
 const inventory=await jsonRequest('https://script.googleapis.com/v1/projects/'+SCRIPT+'/deployments',{headers});
 const ds=(inventory.deployments||[]).filter(d=>(d.entryPoints||[]).some(e=>e.entryPointType==='EXECUTION_API'||e.executionApi));
 if(ds.length!==1||!ds[0].deploymentId)throw Error('Expected exactly one existing API executable.');
 const result=await jsonRequest('https://script.googleapis.com/v1/scripts/'+encodeURIComponent(ds[0].deploymentId)+':run',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({function:'tmv3_strivenApiBudgetStatus',devMode:true})});
 if(result.error||result.done!==true||!result.response||!Object.hasOwn(result.response,'result'))throw Error('Read-only execution verification failed; secret unchanged.');
 console.log('PASS: refresh, full scopes, source read, deployment read, owner-mode budget execution.');
}
async function main(){
 if(Number(process.versions.node.split('.')[0])<22)throw Error('Node.js 22 or newer required.');
 if(!process.argv[2])throw Error('Usage: node tmv3-authorize-owner.cjs <private-downloaded-client.json>');
 if(process.env.CI)throw Error('Run locally on the owner computer, not CI.');
 const c=clientConfig(JSON.parse(fs.readFileSync(process.argv[2],'utf8')));
 const check=spawnSync('gh',['auth','status'],{stdio:'ignore',shell:false});if(check.status!==0)throw Error('Install GitHub CLI and run gh auth login first.');
 const t=await authorize(c);const profile=credential(c,t);await verify(c,t);
 const updated=spawnSync('gh',['secret','set','CLASPRC_JSON','--repo',REPO],{input:JSON.stringify(profile),encoding:'utf8',stdio:['pipe','ignore','ignore'],shell:false});
 if(updated.status!==0)throw Error('Verified Google access, but GitHub secret replacement failed. No token was saved locally.');
 console.log('DONE: CLASPRC_JSON replaced with the single verified matching-client profile. No task automation was invoked.');
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={clientConfig,callbackCode,credential,SCOPES,CLIENT};

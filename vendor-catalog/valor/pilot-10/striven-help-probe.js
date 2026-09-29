#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SCRIPT_ID = '1t81y0BcV0cnBEBSKcbZt2nx16IBAg63rRvsfSVpjiDiBvrNi6TEq-AG8';
const OUT_DIR = path.resolve(process.cwd(), 'valor-striven-api-probe');
fs.mkdirSync(OUT_DIR, { recursive: true });

function fail(msg) { throw new Error(msg); }

function deepFind(obj, keys, seen = new Set()) {
  if (!obj || typeof obj !== 'object' || seen.has(obj)) return '';
  seen.add(obj);
  for (const [k,v] of Object.entries(obj)) {
    if (keys.includes(k) && typeof v === 'string' && v) return v;
  }
  for (const v of Object.values(obj)) {
    const x = deepFind(v, keys, seen);
    if (x) return x;
  }
  return '';
}

async function googleToken() {
  const rawText = process.env.CLASPRC_JSON;
  if (!rawText) fail('CLASPRC_JSON is not configured.');
  const raw = JSON.parse(rawText);
  const token = raw.token || raw.tokens || raw.credentials || {};
  const settings = raw.oauth2ClientSettings || raw.oauth2Client || raw.client || {};
  const refreshToken = token.refresh_token || token.refreshToken || deepFind(raw,['refresh_token','refreshToken']);
  const clientId = settings.clientId || settings.client_id || deepFind(raw,['clientId','client_id']);
  const clientSecret = settings.clientSecret || settings.client_secret || deepFind(raw,['clientSecret','client_secret']);
  if (!refreshToken || !clientId || !clientSecret) fail('Missing Google OAuth refresh credentials in CLASPRC_JSON.');
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token'
  });
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method:'POST',
    headers:{'Content-Type':'application/x-www-form-urlencoded'},
    body
  });
  const json = await res.json();
  if (!res.ok || !json.access_token) fail('Google OAuth refresh failed.');
  return json.access_token;
}

let ACCESS_TOKEN = '';

async function api(pathname, options={}) {
  const res = await fetch('https://script.googleapis.com/v1' + pathname, {
    ...options,
    headers:{
      Authorization:'Bearer ' + ACCESS_TOKEN,
      ...(options.body ? {'Content-Type':'application/json'} : {}),
      ...(options.headers || {})
    }
  });
  const text = await res.text();
  let json = {};
  if (text) {
    try { json = JSON.parse(text); }
    catch { json = {raw:text}; }
  }
  if (!res.ok) {
    fail('Apps Script API ' + (options.method || 'GET') + ' ' + pathname + ' failed: ' + JSON.stringify(json).slice(0,1200));
  }
  return json;
}

async function getContent() {
  return api('/projects/' + encodeURIComponent(SCRIPT_ID) + '/content');
}
async function updateContent(content) {
  return api('/projects/' + encodeURIComponent(SCRIPT_ID) + '/content', {
    method:'PUT',
    body:JSON.stringify({files:content.files || []})
  });
}
async function createVersion(description) {
  return api('/projects/' + encodeURIComponent(SCRIPT_ID) + '/versions', {
    method:'POST',
    body:JSON.stringify({description})
  });
}
async function createDeployment(versionNumber, description) {
  return api('/projects/' + encodeURIComponent(SCRIPT_ID) + '/deployments', {
    method:'POST',
    body:JSON.stringify({
      versionNumber:Number(versionNumber),
      manifestFileName:'appsscript',
      description
    })
  });
}
async function deleteDeployment(deploymentId) {
  if (!deploymentId) return;
  try {
    await api('/projects/' + encodeURIComponent(SCRIPT_ID) + '/deployments/' + encodeURIComponent(deploymentId), {
      method:'DELETE'
    });
  } catch {}
}
async function run(functionName) {
  return api('/scripts/' + encodeURIComponent(SCRIPT_ID) + ':run', {
    method:'POST',
    body:JSON.stringify({function:functionName, parameters:[], devMode:true})
  });
}

function hash(content) {
  const files=(content.files||[]).map(f=>({name:f.name,type:f.type,source:f.source||''})).sort((a,b)=>a.name.localeCompare(b.name));
  return crypto.createHash('sha256').update(JSON.stringify(files)).digest('hex');
}

function buildTemp(pre) {
  const files=(pre.files||[]).filter(f=>f.name!=='TMP_ValorStrivenHelpProbe').map(f=>({...f}));
  const manifest = files.find(f=>f.name==='appsscript');
  if (!manifest) fail('appsscript manifest missing.');
  const m = JSON.parse(manifest.source || '{}');
  m.executionApi = {access:'MYSELF'};
  manifest.source = JSON.stringify(m,null,2);

  files.push({
    name:'TMP_ValorStrivenHelpProbe',
    type:'SERVER_JS',
    source:String.raw`
function valorStrivenHelpProbe() {
  var urls = [
    'https://api.striven.com/Help',
    'https://api.striven.com/Help/Api/POST-v1-items-id-images',
    'https://api.striven.com/Help/Api/POST-v1-Items-id-images',
    'https://api.striven.com/Help/Api/POST-v1-Items-id-Images',
    'https://api.striven.com/Help/Api/GET-v1-items-id-images',
    'https://api.striven.com/Help/Api/GET-v1-Items-id-images'
  ];

  function cleanHtml(s) {
    return String(s || '')
      .replace(/<script[\\s\\S]*?<\\/script>/gi, ' ')
      .replace(/<style[\\s\\S]*?<\\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&amp;/g, '&')
      .replace(/\\s+/g, ' ')
      .trim();
  }

  var out = urls.map(function(url) {
    try {
      var r = UrlFetchApp.fetch(url, {
        method:'get',
        followRedirects:true,
        muteHttpExceptions:true,
        headers:{Accept:'text/html,application/xhtml+xml'}
      });
      var body = r.getContentText() || '';
      var text = cleanHtml(body);
      var lower = text.toLowerCase();
      var ix = lower.indexOf('items');
      if (ix < 0) ix = lower.indexOf('image');
      var snippet = ix >= 0
        ? text.substring(Math.max(0, ix - 1500), Math.min(text.length, ix + 6000))
        : text.substring(0, 7000);
      return {
        url:url,
        code:r.getResponseCode(),
        contentType:String(r.getHeaders()['Content-Type'] || ''),
        length:body.length,
        snippet:snippet
      };
    } catch (e) {
      return {url:url,error:String(e && e.message || e)};
    }
  });

  return {ok:true, collectedAt:new Date().toISOString(), results:out};
}
`
  });

  return {files};
}

(async()=>{
  ACCESS_TOKEN = await googleToken();
  const pre = await getContent();
  const preHash = hash(pre);
  const fresh = await getContent();
  if (hash(fresh) !== preHash) fail('Freshness guard failed before temporary probe.');

  const temp = buildTemp(pre);
  let deploymentId = '';
  let restored = false;
  try {
    await updateContent(temp);
    const version = await createVersion('Temporary Valor Striven API help probe');
    const dep = await createDeployment(version.versionNumber, 'Temporary Valor Striven API help probe');
    deploymentId = dep.deploymentId || '';
    await new Promise(r=>setTimeout(r,4000));
    const execution = await run('valorStrivenHelpProbe');
    fs.writeFileSync(path.join(OUT_DIR,'probe.json'), JSON.stringify(execution,null,2));
    console.log('VALOR_STRIVEN_API_HELP_PROBE_COMPLETE');
    console.log(JSON.stringify(execution));
  } finally {
    try {
      await updateContent(pre);
      const after = await getContent();
      restored = hash(after) === preHash;
      fs.writeFileSync(path.join(OUT_DIR,'restore.json'), JSON.stringify({restored,preHash,afterHash:hash(after)},null,2));
    } catch (e) {
      fs.writeFileSync(path.join(OUT_DIR,'restore-error.txt'), String(e && e.stack || e));
      throw e;
    } finally {
      await deleteDeployment(deploymentId);
    }
  }
  if (!restored) fail('Central Data Hub source restore verification failed.');
})().catch(err=>{
  fs.writeFileSync(path.join(OUT_DIR,'error.txt'), String(err && err.stack || err));
  console.error(err && err.stack || err);
  process.exit(1);
});

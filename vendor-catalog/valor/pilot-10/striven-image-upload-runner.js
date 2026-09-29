#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SCRIPT_ID = '1t81y0BcV0cnBEBSKcbZt2nx16IBAg63rRvsfSVpjiDiBvrNi6TEq-AG8';
const OUT_DIR = path.resolve(process.cwd(), 'valor-striven-image-upload-output');
fs.mkdirSync(OUT_DIR, {recursive:true});

const ITEMS = [
  {sku:'200AN',  id:39799, series:'P2',          fileName:'valor-200AN-p2.jpg',            imageUrl:'https://www.valorfireplaces.com/media/responsive/fireplaces/p2/p2-rcb-lsk.jpg'},
  {sku:'530VN',  id:42895, series:'Portrait',    fileName:'valor-530VN-portrait.jpg',      imageUrl:'https://www.valorfireplaces.com/media/ResponsiveGraphics/products/overview/windsor-thumb.jpg'},
  {sku:'534VN',  id:41479, series:'Horizon',     fileName:'valor-534VN-horizon.jpg',       imageUrl:'https://www.valorfireplaces.com/media/responsive/fireplaces/horizon/setting-clearview-vrl.jpg'},
  {sku:'1000MN', id:41622, series:'H3',          fileName:'valor-1000MN-h3.jpg',           imageUrl:'https://www.valorfireplaces.com/media/ResponsiveGraphics/installs/h3/birch-heatshift.jpg'},
  {sku:'1100MN', id:37548, series:'H5',          fileName:'valor-1100MN-h5.jpg',           imageUrl:'https://www.valorfireplaces.com/media/responsive/fireplaces/h5/h5-gbl-setting.jpg'},
  {sku:'1400MN', id:36083, series:'H6',          fileName:'valor-1400MN-h6.jpg',           imageUrl:'https://www.valorfireplaces.com/media/responsive/fireplaces/h6/h6-gbl-setting.jpg'},
  {sku:'1500KN', id:36045, series:'L1',          fileName:'valor-1500KN-l1.jpg',           imageUrl:'https://www.valorfireplaces.com/media/ResponsiveGraphics/products/l1/birchv2-rgl-cik.jpg'},
  {sku:'1600KN', id:24098, series:'L1 See-Thru', fileName:'valor-1600KN-l1-see-thru.jpg',  imageUrl:'https://www.valorfireplaces.com/media/ResponsiveGraphics/products/l1-2sided/birchv2-rgl.jpg'},
  {sku:'1700KN', id:24111, series:'L2',          fileName:'valor-1700KN-l2.jpg',           imageUrl:'https://www.valorfireplaces.com/media/responsive/fireplaces/l2-linear/setting-birch-v2.jpg'},
  {sku:'1800KN', id:36046, series:'L3',          fileName:'valor-1800KN-l3.jpg',           imageUrl:'https://www.valorfireplaces.com/media/ResponsiveGraphics/products/l3/birch-rgl-inch.jpg'}
];

function fail(msg){ throw new Error(msg); }

function deepFind(obj, keys, seen=new Set()){
  if (!obj || typeof obj !== 'object' || seen.has(obj)) return '';
  seen.add(obj);
  for (const [k,v] of Object.entries(obj)) {
    if (keys.includes(k) && typeof v === 'string' && v) return v;
  }
  for (const v of Object.values(obj)) {
    const found = deepFind(v, keys, seen);
    if (found) return found;
  }
  return '';
}

async function getGoogleAccessToken(){
  const rawText = process.env.CLASPRC_JSON;
  if (!rawText) fail('CLASPRC_JSON is not configured.');
  const raw = JSON.parse(rawText);
  const token = raw.token || raw.tokens || raw.credentials || {};
  const settings = raw.oauth2ClientSettings || raw.oauth2Client || raw.client || {};
  const refreshToken = token.refresh_token || token.refreshToken || deepFind(raw,['refresh_token','refreshToken']);
  const clientId = settings.clientId || settings.client_id || deepFind(raw,['clientId','client_id']);
  const clientSecret = settings.clientSecret || settings.client_secret || deepFind(raw,['clientSecret','client_secret']);
  if (!refreshToken || !clientId || !clientSecret) fail('CLASPRC_JSON does not contain refresh-token client credentials.');

  const body = new URLSearchParams({
    client_id:clientId,
    client_secret:clientSecret,
    refresh_token:refreshToken,
    grant_type:'refresh_token'
  });
  const res = await fetch('https://oauth2.googleapis.com/token',{
    method:'POST',
    headers:{'Content-Type':'application/x-www-form-urlencoded'},
    body
  });
  const json = await res.json();
  if (!res.ok || !json.access_token) fail('Google OAuth refresh failed.');
  return json.access_token;
}

let accessToken='';

async function api(pathname, options={}){
  const res = await fetch('https://script.googleapis.com/v1'+pathname,{
    ...options,
    headers:{
      Authorization:'Bearer '+accessToken,
      ...(options.body?{'Content-Type':'application/json'}:{}),
      ...(options.headers||{})
    }
  });
  const text=await res.text();
  let json={};
  if(text){ try{json=JSON.parse(text);}catch{json={raw:text};} }
  if(!res.ok) fail('Apps Script API '+(options.method||'GET')+' '+pathname+' failed: '+JSON.stringify(json).slice(0,1200));
  return json;
}

async function getContent(){ return api('/projects/'+encodeURIComponent(SCRIPT_ID)+'/content'); }
async function updateContent(content){
  return api('/projects/'+encodeURIComponent(SCRIPT_ID)+'/content',{
    method:'PUT', body:JSON.stringify({files:content.files||[]})
  });
}
async function createVersion(description){
  return api('/projects/'+encodeURIComponent(SCRIPT_ID)+'/versions',{
    method:'POST', body:JSON.stringify({description})
  });
}
async function createDeployment(versionNumber, description){
  return api('/projects/'+encodeURIComponent(SCRIPT_ID)+'/deployments',{
    method:'POST',
    body:JSON.stringify({versionNumber:Number(versionNumber),manifestFileName:'appsscript',description})
  });
}
async function deleteDeployment(id){
  if(!id) return;
  try{ await api('/projects/'+encodeURIComponent(SCRIPT_ID)+'/deployments/'+encodeURIComponent(id),{method:'DELETE'}); }catch{}
}
function canonicalHash(content){
  const files=(content.files||[]).map(f=>({name:f.name,type:f.type,source:f.source||''})).sort((a,b)=>a.name.localeCompare(b.name));
  return crypto.createHash('sha256').update(JSON.stringify(files)).digest('hex');
}
function getManifest(content){
  const f=(content.files||[]).find(x=>x.name==='appsscript');
  if(!f||!f.source) fail('Central Data Hub appsscript manifest missing.');
  return JSON.parse(f.source);
}

function buildTemporaryRunner(pre, guardToken){
  const manifest=getManifest(pre);
  manifest.webapp={access:'ANYONE_ANONYMOUS',executeAs:'USER_DEPLOYING'};

  const files=(pre.files||[])
    .filter(f=>f.name!=='appsscript' && f.name!=='TMP_ValorImageUploader')
    .map(f=>{
      if(f.type!=='SERVER_JS') return {...f};
      return {...f,source:String(f.source||'').replace(/function\s+doPost\s*\(/g,'function TMP_Valor_original_doPost(')};
    });

  const itemJson = JSON.stringify(ITEMS);
  const source = String.raw`
var TMP_VALOR_UPLOAD_GUARD = ${JSON.stringify(guardToken)};
var TMP_VALOR_ITEMS = ${itemJson};

function doPost(e) {
  try {
    var body = JSON.parse(e && e.postData && e.postData.contents ? e.postData.contents : '{}');
    if (String(body.token || '') !== TMP_VALOR_UPLOAD_GUARD) {
      return TMP_Valor_json_({ok:false,status:'UNAUTHORIZED'});
    }

    var mode = String(body.mode || 'CANARY').toUpperCase();
    var selected = mode === 'ALL'
      ? TMP_VALOR_ITEMS
      : TMP_VALOR_ITEMS.filter(function(x){ return x.sku === '200AN'; });

    var token = TMP_Valor_strivenToken_();
    var results = [];

    selected.forEach(function(cfg) {
      results.push(TMP_Valor_uploadOne_(token, cfg));
    });

    var failed = results.filter(function(x){ return x.ok !== true; });
    return TMP_Valor_json_({
      ok:failed.length === 0,
      status:failed.length === 0 ? 'VALOR_IMAGES_COMPLETE' : 'VALOR_IMAGES_PARTIAL_FAILURE',
      mode:mode,
      uploaded:results.filter(function(x){ return x.action === 'UPLOADED'; }).length,
      skipped:results.filter(function(x){ return x.action === 'SKIPPED_EXISTS'; }).length,
      results:results
    });
  } catch (err) {
    return TMP_Valor_json_({ok:false,status:'ERROR',message:String(err && err.message || err)});
  }
}

function TMP_Valor_strivenToken_() {
  var props = PropertiesService.getScriptProperties();
  var clientId = props.getProperty('CLIENT_ID');
  var clientSecret = props.getProperty('CLIENT_SECRET');
  if (!clientId || !clientSecret) throw new Error('Striven CLIENT_ID/CLIENT_SECRET are not configured.');

  var basic = Utilities.base64Encode(clientId + ':' + clientSecret);
  var r = UrlFetchApp.fetch('https://api.striven.com/accesstoken', {
    method:'post',
    headers:{Authorization:'Basic ' + basic, Accept:'application/json'},
    payload:{grant_type:'client_credentials', ClientId:clientId},
    muteHttpExceptions:true
  });
  var code = r.getResponseCode();
  var text = r.getContentText();
  if (code < 200 || code >= 300) throw new Error('Striven token request failed HTTP ' + code + ': ' + text.substring(0,300));
  var j = JSON.parse(text || '{}');
  if (!j.access_token) throw new Error('Striven token response missing access_token.');
  return j.access_token;
}

function TMP_Valor_fetchJson_(url, token) {
  var r = UrlFetchApp.fetch(url, {
    method:'get',
    headers:{Authorization:'Bearer ' + token, Accept:'application/json'},
    muteHttpExceptions:true
  });
  var code = r.getResponseCode();
  var text = r.getContentText();
  var json = {};
  try { json = text ? JSON.parse(text) : {}; } catch (e) { json = {raw:text.substring(0,500)}; }
  return {code:code,json:json,text:text};
}

function TMP_Valor_uploadOne_(token, cfg) {
  var detail = TMP_Valor_fetchJson_('https://api.striven.com/v1/items/' + cfg.id, token);
  if (detail.code !== 200) {
    return {ok:false,sku:cfg.sku,itemId:cfg.id,action:'DETAIL_READ_FAILED',http:detail.code};
  }

  var actualSku = String(detail.json.ItemNumber || detail.json.itemNumber || '');
  if (actualSku !== String(cfg.sku)) {
    return {ok:false,sku:cfg.sku,itemId:cfg.id,action:'SKU_GUARD_FAILED',actualSku:actualSku};
  }

  var before = TMP_Valor_fetchJson_('https://api.striven.com/v1/items/' + cfg.id + '/images', token);
  if (before.code !== 200) {
    return {ok:false,sku:cfg.sku,itemId:cfg.id,action:'IMAGE_LIST_READ_FAILED',http:before.code};
  }

  var beforeData = (before.json && (before.json.Data || before.json.data)) || [];
  var existing = beforeData.filter(function(img) {
    return String(img.OriginalFileName || img.originalFileName || '').toLowerCase() === String(cfg.fileName).toLowerCase();
  })[0];

  if (existing) {
    var existingIsDefault = (existing.IsDefault === true || existing.isDefault === true);
    var anyDefault = beforeData.some(function(img){ return (img.IsDefault === true || img.isDefault === true); });
    if (!existingIsDefault && !anyDefault) {
      var existingId = existing.Id || existing.id || 0;
      var setDefault = UrlFetchApp.fetch(
        'https://api.striven.com/v1/items/' + cfg.id + '/images/' + existingId + '/set-default',
        {
          method:'post',
          headers:{Authorization:'Bearer ' + token, Accept:'application/json, application/octet-stream'},
          muteHttpExceptions:true
        }
      );
      var setDefaultCode = setDefault.getResponseCode();
      if (setDefaultCode < 200 || setDefaultCode >= 300) {
        return {
          ok:false,sku:cfg.sku,itemId:cfg.id,series:cfg.series,action:'SET_DEFAULT_FAILED',
          imageId:existingId,http:setDefaultCode,responsePrefix:setDefault.getContentText().substring(0,300)
        };
      }
      return {
        ok:true,sku:cfg.sku,itemId:cfg.id,series:cfg.series,action:'SET_DEFAULT',
        imageId:existingId,fileName:existing.OriginalFileName || existing.originalFileName || cfg.fileName,
        isDefault:true
      };
    }
    return {
      ok:true,sku:cfg.sku,itemId:cfg.id,series:cfg.series,action:'SKIPPED_EXISTS',
      imageId:existing.Id || existing.id || 0,fileName:existing.OriginalFileName || existing.originalFileName || cfg.fileName,
      isDefault:existingIsDefault
    };
  }

  var src = UrlFetchApp.fetch(cfg.imageUrl, {
    method:'get',
    followRedirects:true,
    muteHttpExceptions:true,
    headers:{'User-Agent':'Mozilla/5.0'}
  });
  var srcCode = src.getResponseCode();
  var headers = src.getHeaders();
  var contentType = String(headers['Content-Type'] || headers['content-type'] || '');
  var blob = src.getBlob();
  var bytes = blob.getBytes().length;

  if (srcCode !== 200 || contentType.toLowerCase().indexOf('image/') !== 0 || bytes < 1000) {
    return {
      ok:false,sku:cfg.sku,itemId:cfg.id,series:cfg.series,action:'SOURCE_IMAGE_FAILED',
      sourceHttp:srcCode,contentType:contentType,bytes:bytes
    };
  }

  blob.setName(cfg.fileName);
  var hasDefault = beforeData.some(function(img){ return (img.IsDefault === true || img.isDefault === true); });
  var uploadHeaders = {
    Authorization:'Bearer ' + token,
    Accept:'application/json, application/octet-stream'
  };
  if (!hasDefault) uploadHeaders['Default-Filename'] = cfg.fileName;

  var upload = UrlFetchApp.fetch('https://api.striven.com/v1/items/' + cfg.id + '/images', {
    method:'post',
    headers:uploadHeaders,
    payload:{file:blob},
    muteHttpExceptions:true
  });
  var uploadCode = upload.getResponseCode();
  if (uploadCode < 200 || uploadCode >= 300) {
    return {
      ok:false,sku:cfg.sku,itemId:cfg.id,series:cfg.series,action:'UPLOAD_FAILED',
      http:uploadCode,responsePrefix:upload.getContentText().substring(0,500)
    };
  }

  Utilities.sleep(4000);
  var after = TMP_Valor_fetchJson_('https://api.striven.com/v1/items/' + cfg.id + '/images', token);
  if (after.code !== 200) {
    return {ok:false,sku:cfg.sku,itemId:cfg.id,series:cfg.series,action:'VERIFY_LIST_FAILED',http:after.code};
  }

  var afterData = (after.json && (after.json.Data || after.json.data)) || [];
  var created = afterData.filter(function(img) {
    return String(img.OriginalFileName || img.originalFileName || '').toLowerCase() === String(cfg.fileName).toLowerCase();
  })[0];

  if (!created && afterData.length <= beforeData.length) {
    return {
      ok:false,sku:cfg.sku,itemId:cfg.id,series:cfg.series,action:'VERIFY_FAILED',
      beforeCount:beforeData.length,afterCount:afterData.length,
      uploadHttp:uploadCode,
      uploadContentType:String(upload.getHeaders()['Content-Type'] || upload.getHeaders()['content-type'] || ''),
      uploadResponsePrefix:upload.getContentText().substring(0,500)
    };
  }

  if (!created && afterData.length > beforeData.length) {
    created = afterData[afterData.length - 1];
  }

  return {
    ok:true,sku:cfg.sku,itemId:cfg.id,series:cfg.series,action:'UPLOADED',
    imageId:created && created.Id || created.id || 0,
    fileName:created && (created.OriginalFileName || created.originalFileName || created.FileName || created.fileName) || cfg.fileName,
    isDefault:created && (created.IsDefault === true || created.isDefault === true),
    beforeCount:beforeData.length,afterCount:afterData.length,
    sourceBytes:bytes
  };
}

function TMP_Valor_json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
`;

  files.push({name:'TMP_ValorImageUploader',type:'SERVER_JS',source});
  files.push({name:'appsscript',type:'JSON',source:JSON.stringify(manifest,null,2)});
  return {files};
}

async function postJson(url,payload){
  const res=await fetch(url,{
    method:'POST',
    headers:{'Content-Type':'application/json',Authorization:'Bearer '+accessToken},
    body:JSON.stringify(payload),
    redirect:'follow'
  });
  const text=await res.text();
  let json={};
  try{json=JSON.parse(text);}catch{
    fail('Temporary Valor uploader did not return JSON. HTTP '+res.status+' body '+text.slice(0,500));
  }
  if(!res.ok) fail('Temporary Valor uploader HTTP '+res.status+': '+text.slice(0,500));
  return json;
}

(async()=>{
  accessToken=await getGoogleAccessToken();
  const pre=await getContent();
  const preHash=canonicalHash(pre);
  const fresh=await getContent();
  if(canonicalHash(fresh)!==preHash) fail('Freshness guard failed before temporary Valor uploader.');

  const guardToken=crypto.randomBytes(32).toString('hex');
  const temp=buildTemporaryRunner(pre,guardToken);
  let deploymentId='';
  let sourceRestored=false;

  try{
    await updateContent(temp);
    const version=await createVersion('Temporary Valor image uploader canary');
    await updateContent(pre);
    const restored=await getContent();
    sourceRestored=canonicalHash(restored)===preHash;
    if(!sourceRestored) fail('Central Data Hub source restore failed before upload.');

    const dep=await createDeployment(version.versionNumber,'Temporary Valor image uploader canary');
    deploymentId=dep.deploymentId||'';
    if(!deploymentId) fail('Temporary deployment ID missing.');
    const url=(dep.entryPoints&&dep.entryPoints[0]&&dep.entryPoints[0].webApp&&dep.entryPoints[0].webApp.url) ||
      ('https://script.google.com/macros/s/'+deploymentId+'/exec');

    await new Promise(r=>setTimeout(r,15000));

    const canary=await postJson(url,{token:guardToken,mode:'CANARY'});
    fs.writeFileSync(path.join(OUT_DIR,'canary.json'),JSON.stringify(canary,null,2));
    console.log('VALOR_CANARY_RESULT='+JSON.stringify(canary));
    if(!canary || canary.ok!==true) fail('Valor 200AN canary upload failed.');

    const all=await postJson(url,{token:guardToken,mode:'ALL'});
    fs.writeFileSync(path.join(OUT_DIR,'all.json'),JSON.stringify(all,null,2));
    console.log('VALOR_ALL_RESULT='+JSON.stringify(all));
    if(!all || all.ok!==true) fail('One or more Valor image uploads failed.');

    const finalHead=await getContent();
    if(canonicalHash(finalHead)!==preHash) fail('Central Data Hub HEAD source changed during image upload run.');

    fs.writeFileSync(path.join(OUT_DIR,'evidence.json'),JSON.stringify({
      status:'VALOR_STRIVEN_IMAGE_UPLOAD_VERIFIED',
      sourceHeadHashVerified:true,
      canary:canary,
      all:all
    },null,2));
  } finally {
    try{
      const now=await getContent();
      if(canonicalHash(now)!==preHash) await updateContent(pre);
      const after=await getContent();
      sourceRestored=canonicalHash(after)===preHash;
      fs.writeFileSync(path.join(OUT_DIR,'restore.json'),JSON.stringify({sourceRestored,preHash,afterHash:canonicalHash(after)},null,2));
    } finally {
      await deleteDeployment(deploymentId);
    }
  }

  if(!sourceRestored) fail('Central Data Hub source restore verification failed.');
})().catch(err=>{
  fs.writeFileSync(path.join(OUT_DIR,'error.txt'),String(err&&err.stack||err));
  console.error(err&&err.stack||err);
  process.exit(1);
});

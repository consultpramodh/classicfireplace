#!/usr/bin/env node
'use strict';
const fs=require('fs'),os=require('os'),path=require('path'),crypto=require('crypto'),cp=require('child_process'),vm=require('vm');
const SID='1E86mhD2dZcOFpqWnCvoIpwEkwZ0MA63MgM8DifV6WyB2FvVQkRWKIZ_m',CV='3.3.0',T='35_PreInspect_Task_Review.js';
const OUT=path.resolve('task-mapping-preinspect-match-r5-output');fs.mkdirSync(OUT,{recursive:true});
const ev={status:'STARTED',release:'R5_PREINSPECT_NAME_ADDRESS_NORMALIZATION_20260915',scriptId:SID,targetFile:T,startedAt:new Date().toISOString()};
function run(a,c){const r=cp.spawnSync('npx',['-y',`@google/clasp@${CV}`,...a],{cwd:c||process.cwd(),encoding:'utf8',stdio:['ignore','pipe','pipe']});process.stdout.write(r.stdout||'');process.stderr.write(r.stderr||'');if(r.error)throw r.error;if(r.status)throw Error(`clasp ${a.join(' ')} failed ${r.status}`)}
function files(d){return fs.readdirSync(d,{withFileTypes:true}).filter(x=>x.isFile()).map(x=>x.name).sort()}
function sha(f){return crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex')}
function hashes(d,ns){const o={};ns.forEach(n=>o[n]=sha(path.join(d,n)));return o}
function same(a,b,ns,label){const bad=ns.filter(n=>a[n]!==b[n]);if(bad.length)throw Error(`${label}: ${bad.join(', ')}`)}
function fr(s,n){const re=new RegExp(`function\\s+${n}\\s*\\(`,'g'),m=[...s.matchAll(re)];if(m.length!==1)throw Error(`Expected one ${n}, found ${m.length}`);let i=s.indexOf('{',m[0].index+m[0][0].length),d=0,q=null,e=false,lc=false,bc=false;for(let j=i;j<s.length;j++){const c=s[j],nx=s[j+1];if(lc){if(c==='\n')lc=false;continue}if(bc){if(c==='*'&&nx==='/'){bc=false;j++}continue}if(q){if(e){e=false;continue}if(c==='\\'){e=true;continue}if(c===q)q=null;continue}if(c==='/'&&nx==='/'){lc=true;j++;continue}if(c==='/'&&nx==='*'){bc=true;j++;continue}if(c==='\''||c==='"'||c==='`'){q=c;continue}if(c==='{')d++;else if(c==='}'&&!--d)return{a:m[0].index,b:j+1,t:s.slice(m[0].index,j+1)}}throw Error(`No close for ${n}`)}
function rep(s,n,r){const x=fr(s,n);return s.slice(0,x.a)+r+s.slice(x.b)}
const E=String.raw`function preinspectExtractName_(title, customerNumberCandidates) {
  let value = tm_cleanString_(title)
    .replace(/\?\s*[A-Za-z0-9][A-Za-z0-9._+\/-]*/g, ' ')
    .replace(/\b(?:SO|S\/O|Sales\s*Order|Order)\s*[#:\-]?\s*\d{4,8}(?:\s*[\/,;&+]\s*(?:(?:SO|S\/O|Sales\s*Order|Order)\s*[#:\-]?\s*)?#?\d{4,8})*/gi, ' ')
    .replace(/\b(?:Customer|Cust|CX|C)\s*(?:Number|No\.?|#)?\s*[:#\-]?\s*\d{4,8}\b/gi, ' ')
    .replace(/(?:\+?1[\s\-.]?)?(?:\(?\d{3}\)?[\s\-.]?\d{3}[\s\-.]?\d{4})/gi, ' ')
    .replace(/(?:^|\s)#\s*\d{4,8}\b/g, ' ')
    .replace(/\bPRE\s*INSPECT\b/gi, ' ').replace(/\|/g, ' ').replace(/(^|\s)[-–—\/]+(?=\s|$)/g, ' ');
  (customerNumberCandidates || []).forEach(function(number) { value = value.replace(new RegExp('(?:^|\\s)' + String(number) + '(?=\\s|$)', 'g'), ' '); });
  return value.replace(/\*+/g, ' ').replace(/\bVIP\b/gi, ' ').replace(/\bPLEASE CALL(?: ON WAY)?\b/gi, ' ').replace(/\s+/g, ' ').trim();
}`;
const A=String.raw`function preinspectNormalizeAddress_(value) {
  return String(value || '').toLowerCase().replace(/\bcanada\b/g,' ').replace(/\bontario\b/g,' ').replace(/\bon\b/g,' ')
    .replace(/\bstreet\b/g,' st ').replace(/\bavenue\b/g,' ave ').replace(/\broad\b/g,' rd ').replace(/\bdrive\b/g,' dr ')
    .replace(/\bcrescent\b/g,' cres ').replace(/\bboulevard\b/g,' blvd ').replace(/\bcourt\b/g,' ct ').replace(/\blane\b/g,' ln ')
    .replace(/\btrail\b/g,' trl ').replace(/\bheights\b/g,' hts ').replace(/\bplace\b/g,' pl ').replace(/\bterrace\b/g,' terr ')
    .replace(/\bnorth\b/g,' n ').replace(/\bsouth\b/g,' s ').replace(/\beast\b/g,' e ').replace(/\bwest\b/g,' w ')
    .replace(/\b([a-z]\d[a-z])\s*(\d[a-z]\d)\b/g,'$1$2').replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();
}`;
const N=String.raw`function preinspectName_(value) { return String(value || '').toLowerCase().replace(/&/g,' and ').replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim(); }`;
function test(s){const c={tm_cleanString_:v=>String(v==null?'':v).trim()};vm.createContext(c);vm.runInContext([fr(s,'preinspectExtractName_').t,fr(s,'preinspectNormalizeAddress_').t,fr(s,'preinspectName_').t,'this.e=preinspectExtractName_;this.a=preinspectNormalizeAddress_;this.n=preinspectName_;'].join('\n'),c);const title='Jill and Dave Crain  416 418 3807  ?H3 SO585066',nm=c.e(title,[]),r={cleanName:nm,nameKey:c.n(nm),canonicalNameKey:c.n('Jill & Dave Crain'),addressKey:c.a('11 Roberts Dr, Ajax, ON L1T 3X5, Canada'),canonicalAddressKey:c.a('11 Roberts Drive., Ajax, ON L1T3X5')};if(nm!=='Jill and Dave Crain'||r.nameKey!==r.canonicalNameKey||r.addressKey!==r.canonicalAddressKey||c.n('Anderson')!=='anderson'||c.n('Smith and Sons')!=='smith and sons')throw Error('Regression failed '+JSON.stringify(r));return r}
const root=fs.mkdtempSync(path.join(os.tmpdir(),'tm-r5-')),P=path.join(root,'PRE'),W=path.join(root,'WORK'),F=path.join(root,'FRESH'),O=path.join(root,'POST');[P,W,F,O].forEach(d=>fs.mkdirSync(d,{recursive:true}));let pushed=false;
try{
 console.log('R5 1 authorize');run(['show-authorized-user','--json']);
 console.log('R5 2 PRE');run(['clone',SID,'--rootDir','src'],P);const ps=path.join(P,'src'),ns=files(ps);['appsscript.json',T,'36_PreInspect_Task_Create.js','96_Selected_Row_End_To_End_R3.js','97_Task_Mapping_Fix_Pack_R4.js'].forEach(n=>{if(!ns.includes(n))throw Error('Missing '+n)});if(ns.length<50)throw Error('Unexpected file count '+ns.length);const ph=hashes(ps,ns);fs.cpSync(P,path.join(OUT,'PRE_SOURCE'),{recursive:true});
 let pre=fs.readFileSync(path.join(ps,T),'utf8');['PREINSPECT_REVIEW_CONFIG','preinspectResolveCustomer_','preinspectR46GetCanonicalV1Schedule_'].forEach(m=>{if(!pre.includes(m))throw Error('Missing live marker '+m)});ev.before={};try{ev.before=test(pre)}catch(x){ev.before={expectedFailure:String(x.message)}}
 console.log('R5 3 patch');fs.cpSync(P,W,{recursive:true});const ws=path.join(W,'src'),tp=path.join(ws,T);let s=fs.readFileSync(tp,'utf8');s=rep(rep(rep(s,'preinspectExtractName_',E),'preinspectNormalizeAddress_',A),'preinspectName_',N);fs.writeFileSync(tp,s);cp.execFileSync(process.execPath,['--check',tp],{stdio:'inherit'});ev.after=test(s);const wh=hashes(ws,ns),chg=ns.filter(n=>ph[n]!==wh[n]);if(JSON.stringify(chg)!==JSON.stringify([T]))throw Error('Changed files '+JSON.stringify(chg));ev.changedFiles=chg;ev.preTargetSha256=ph[T];ev.workTargetSha256=wh[T];
 console.log('R5 4 fresh');run(['clone',SID,'--rootDir','src'],F);const fsr=path.join(F,'src'),fn=files(fsr);if(JSON.stringify(ns)!==JSON.stringify(fn))throw Error('Fresh file set changed');same(ph,hashes(fsr,fn),ns,'Freshness');
 console.log('R5 5 push');run(['push','--force'],W);pushed=true;
 console.log('R5 6 POST');run(['clone',SID,'--rootDir','src'],O);const osrc=path.join(O,'src'),on=files(osrc);if(JSON.stringify(ns)!==JSON.stringify(on))throw Error('POST file set changed');const oh=hashes(osrc,on);same(ph,oh,ns.filter(n=>n!==T),'POST untouched');if(oh[T]!==wh[T])throw Error('POST target mismatch');cp.execFileSync(process.execPath,['--check',path.join(osrc,T)],{stdio:'inherit'});ev.post=test(fs.readFileSync(path.join(osrc,T),'utf8'));
 ev.status='DEPLOYED_SOURCE_VERIFIED';ev.postTargetSha256=oh[T];ev.fileCount=on.length;ev.completedAt=new Date().toISOString();ev.businessWritesPerformed=false;fs.writeFileSync(path.join(OUT,'evidence.json'),JSON.stringify(ev,null,2));console.log('DEPLOYED_SOURCE_VERIFIED');console.log(JSON.stringify(ev,null,2));
}catch(e){ev.status='FAILED';ev.error=String(e.stack||e);ev.failedAt=new Date().toISOString();if(pushed){try{run(['push','--force'],P);ev.rollback='ROLLBACK_PUSH_COMPLETED'}catch(r){ev.rollback='ROLLBACK_FAILED';ev.rollbackError=String(r.stack||r)}}else ev.rollback='NOT_NEEDED_NO_PUSH';fs.writeFileSync(path.join(OUT,'evidence.json'),JSON.stringify(ev,null,2));throw e}

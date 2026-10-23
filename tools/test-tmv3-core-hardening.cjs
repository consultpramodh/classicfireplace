// JavaScript: core 13-suite hardening gate, separate from the stale standalone notification fixture.
// JavaScript: execute all actual V3 hardening suites without Apps Script or network access.
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),crypto=require('node:crypto');
const ctx={console,Logger:{log:()=>{}},Utilities:{
 formatDate:(d,tz,pattern)=>{const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23',timeZoneName:'longOffset'}).formatToParts(d).map(p=>[p.type,p.value]));
 const hour=Number(parts.hour);const vals={yyyy:parts.year,MM:parts.month,dd:parts.day,HH:parts.hour,hh:String(hour%12||12).padStart(2,'0'),mm:parts.minute,ss:parts.second,a:hour<12?'AM':'PM',XXX:parts.timeZoneName==='GMT'?'+00:00':parts.timeZoneName.replace('GMT','')};return pattern.replace(/yyyy|XXX|MM|dd|HH|hh|mm|ss|a/g,x=>vals[x]);},
 DigestAlgorithm:{SHA_256:'sha256'},Charset:{UTF_8:'utf8'},computeDigest:(_alg,s)=>Array.from(crypto.createHash('sha256').update(s).digest()).map(b=>b>127?b-256:b)
 }};
vm.createContext(ctx);
const dir=process.env.TMV3_TEST_SOURCE_DIR || path.join(__dirname,'../apps-script/tmv3-clean');
for(const file of fs.readdirSync(dir).filter(f=>f.endsWith('.js')).sort())vm.runInContext(fs.readFileSync(path.join(dir,file),'utf8'),ctx,{filename:file});
const result=vm.runInContext('tmv3_liveHardeningRegression()',ctx);
const suites=Object.fromEntries(Object.entries(result).filter(([k,v])=>v&&typeof v==='object'&&v.status)
 .map(([k,v])=>[k,{status:v.status,cases:Array.isArray(v.cases)?v.cases.length:Number(v.cases)}]));
const total=Object.values(suites).reduce((n,v)=>n+v.cases,0);
if(result.status!=='PASS'||Object.keys(suites).length!==13||total<185)throw Error('Full pre-push hardening acceptance incomplete');
console.log(JSON.stringify({status:result.status,cases:total,suites}));


// JavaScript / Node.js: preserve verified original calendar identity in the existing module.
'use strict';
const fs=require('node:fs');
function prepare(current,hash){
 const original=JSON.parse(JSON.stringify(current));
 const file=original.files.find(f=>f.name==='30_Calendar');if(!file)throw Error('CALENDAR_MODULE_MISSING');
 file.source=fs.readFileSync('tools/tmv3-original-calendar-30.txt','utf8');
 original.files.find(f=>f.name==='38_Step4_Identity').source=fs.readFileSync('tools/tmv3-original-identity-38.txt','utf8');
 if(hash(original)!=='b03d1205bcaae2e2f3ca5dc8ce0a2ac3bb22c75acbec3cc807ee0d749bf807d1')throw Error('LIVE_BASELINE_DRIFT');
 const desired=JSON.parse(JSON.stringify(original));desired.files.find(f=>f.name==='30_Calendar').source=fs.readFileSync('apps-script/tmv3-clean/30_Calendar.js','utf8');
 const creatorOnly=JSON.parse(JSON.stringify(desired));desired.files.find(f=>f.name==='38_Step4_Identity').source=fs.readFileSync('apps-script/tmv3-clean/38_Step4_Identity.js','utf8');
 if(hash(current)!==hash(original)&&hash(current)!==hash(creatorOnly)&&hash(current)!==hash(desired))throw Error('UNRECOGNIZED_CALENDAR_MODULE_DRIFT');
 return desired;
}
module.exports={prepare};

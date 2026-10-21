// JavaScript / Node.js: execute the native import against an in-memory Sheet and API.
'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const source=fs.readFileSync('tools/tmv3-open-tasks-refresh-native.js','utf8');
const headers=['Task ID','Task Number','Task Type ID','Task Type','Status','Name','Customer ID','Location ID','Contact ID','Order ID','Start','Due','Assignees','Pools','URL','Fingerprint'];
function run(options={}) {
 let writes=0,backups=0,patches=0;const requests=[],state={};
 const prior=[18983,18983,1,'Service','Open','Old title',46902,41517,123,27499,'start','due','Chris','','url','hash'];
 const cells=[headers.slice(),prior.slice()];
 if(options.duplicateCache)cells.push(prior.slice());
 const task={'Task ID':18983,'Task Type ID':1,'Task Type':'Service',Status:'Open',Name:'SO#585765 - Samuels','Customer ID':46902};
 const sheet={getLastRow:()=>cells.length,getMaxRows:()=>5000,getParent:()=>({getSheetByName:()=>null}),copyTo:()=>{backups++;return {setName:()=>({hideSheet:()=>{}})};},getRange:(row,col,n=1,width=1)=>({getValues:()=>cells.slice(row-1,row-1+n).map(r=>r.slice(col-1,col-1+width)),getValue:()=>cells[row-1]?.[col-1],setValues:values=>{writes++;values.forEach((r,i)=>{cells[row-1+i]??=[];r.forEach((v,c)=>cells[row-1+i][col-1+c]=v);});}})};
 const data=[{task}];if(options.newTask)data.push({task:{...task,'Task ID':99999}});if(options.manyTasks)for(let id=20000;id<21005;id++)data.push({task:{...task,'Task ID':id}});if(options.duplicateResult)data.push({task});if(options.wrongStatus)data[0]={task:{...task,Status:'Done'}};
 const ctx={Date,JSON,Number,String,Boolean,Object,Error,Array,encodeURIComponent,TMV3_OPEN_REFRESH_HYDRATE_IDS:[2],TMV3:{SHEETS:{TASKS:'Tasks'},API_BASE:'api',TASK_URL_BASE:'task/'},
 LockService:{getScriptLock:()=>({tryLock:()=>!options.lockBusy,releaseLock:()=>{}})},PropertiesService:{getScriptProperties:()=>({getProperty:k=>state[k],setProperty:(k,v)=>state[k]=v})},
 tmv3_sheet_:()=>sheet,tmv3_clean_:v=>String(v??'').trim(),tmv3_norm_:v=>String(v??'').toLowerCase(),tmv3_hash_:()=> 'newhash',
 tmv3_rawTaskById_:()=>({status:{id:17,name:'Open'},task}),tmv3_normalizeV2TaskModel_:r=>r.task,
 tmv3_strivenApiBudgetStatus_:()=>({remaining:options.lowBudget?10:200,exhausted:false}),
 tmv3_fetchJson_:(_url,opts)=>{requests.push(JSON.parse(opts.payload));const query=JSON.parse(opts.payload);return {Data:options.manyTasks?data.slice(query.PageIndex*query.PageSize,(query.PageIndex+1)*query.PageSize):data,TotalCount:options.truncated?10:data.length};},
 tmv3_operationPatchTask_:()=>{patches++;},tmv3_audit_:()=>{}};
 vm.createContext(ctx);vm.runInContext(source,ctx);
 let result,error;try{result=ctx.tmv3_openTasksRefresh_();}catch(e){error=e;}
 return {result,error,cells,writes,backups,patches,requests,state};
}
let cases=0,r=run();assert.equal(r.result.imported.totalOpen,1);assert.equal(r.cells[1][5],'SO#585765 - Samuels');assert.equal(r.cells[1][8],123);assert.equal(r.cells[1][9],27499);assert.equal(r.cells[1][10],'start');assert.equal(r.cells[1][12],'Chris');assert.deepEqual(r.requests[0].Status,[17]);assert.equal(r.backups,1);assert.equal(r.patches,0);cases++;
for(const options of [{duplicateResult:true},{wrongStatus:true},{truncated:true},{duplicateCache:true},{lowBudget:true}]){r=run(options);assert.ok(r.error);assert.equal(r.writes,0);assert.equal(r.patches,0);cases++;}
r=run({newTask:true});assert.equal(r.result.imported.added,1);assert.equal(r.cells[2][0],99999);assert.equal(r.cells[2][8],'');cases++;
r=run({manyTasks:true});assert.equal(r.result.imported.totalOpen,1006);assert.equal(r.requests.length,2);assert.equal(r.requests[0].PageSize,1000);assert.equal(r.cells.length,1007);cases++;
r=run({lockBusy:true});assert.equal(r.result.status,'LOCK_BUSY');assert.equal(r.writes,0);cases++;
console.log('PASS: '+cases+' complete Open search, derived status, non-destructive merge, backup, budget and pagination checks.');
// Execute the rich-text replacement itself and retain hyperlink spans after the text shift.
{
 const ctx={};vm.createContext(ctx);vm.runInContext(source,ctx);
 const needle='Contact: Not required / not resolved',text='Customer #46902\n'+needle+'\nTask #18983';
 const linkStart=text.indexOf('Task #'),links=[],built={};
 const builder={setText:v=>(built.text=v,builder),setTextStyle:()=>builder,setLinkUrl:(start,end,url)=>(links.push({start,end,url}),builder),build:()=>built};
 const rich={getText:()=>text,copy:()=>builder,getRuns:()=>[{getStartIndex:()=>0,getEndIndex:()=>text.length,getTextStyle:()=>({}) ,getLinkUrl:()=>null},{getStartIndex:()=>linkStart,getEndIndex:()=>text.length,getTextStyle:()=>({}),getLinkUrl:()=> 'task/18983'}]};
 ctx.tmv3_openRefreshRichReplacement_(rich,needle,'Requested By Contact: #41127 (fresh Task)');
 assert.equal(built.text.slice(links[0].start,links[0].end),'Task #18983');assert.equal(links[0].url,'task/18983');
 console.log('PASS: rich-text replacement retains the Task hyperlink and correct shifted span.');
}

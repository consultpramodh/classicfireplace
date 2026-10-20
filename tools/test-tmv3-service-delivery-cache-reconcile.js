// JavaScript / Node.js: execute the actual cache-only repair against a fake Sheet and authoritative GET fixtures.
const vm=require('node:vm'),assert=require('node:assert/strict'),{cacheRunner}=require('./tmv3-service-delivery-backfill-launch');
const src=cacheRunner('a'.repeat(64),Date.now()+60000);new vm.Script(src);
function run(opts={}){
 const headers=['Task ID','Task Number','Task Type ID','Task Type','Status','Name','Customer ID','Location ID','Contact ID','Order ID','Start','Due','Assignees','Pools','URL','Fingerprint'];
 const ids=[16025,18979,19098,19126,19221,19262,19281];
 const states={};for(const id of ids)states[id]={'Task ID':id,'Task Number':id,'Task Type':'Service: Clean and Service',Status:id===19262?'Done':'Open',Name:'Task '+id,'Order ID':id+100,'Customer ID':'100'};
 const matrix=Array.from({length:3000},()=>Array(16).fill(''));matrix[0]=headers;
 for(let n=1;n<ids.length;n++)if(ids[n]!==19262)matrix[ids[n]===19281?2900:10+n]=headers.map(h=>states[ids[n]][h]??'');
 matrix[2500]=headers.map(h=>states[19281][h]??'');
 let writes=0,backed=false;
 if(opts.schema)matrix[0][0]='Wrong Header';
 if(opts.drift)matrix[2500][0]=777;
 if(opts.wrongId)states[19262]['Task ID']=999;
 const sheet={getLastRow:()=>matrix.length,getRange:(r,c,h=1,w=1)=>({
  getValues:()=>matrix.slice(r-1,r-1+h).map(row=>row.slice(c-1,c-1+w)),
  getValue:()=>matrix[r-1][c-1],setValues:values=>{assert.equal(backed,true);writes++;for(let i=0;i<h;i++){matrix[r-1+i]??=Array(16).fill('');for(let j=0;j<w;j++)matrix[r-1+i][c-1+j]=values[i][j];}}
 })};
 const ctx={JSON,String,Number,Date,Array,Object,Error,
 LockService:{getScriptLock:()=>({tryLock:()=>!opts.locked,releaseLock:()=>{}})},
 PropertiesService:{getScriptProperties:()=>({setProperty:(k,v)=>{assert.equal(k,'TMV3_SD_CACHE_REPAIR_PRE_20261020');assert.ok(JSON.parse(v).rows.length>0);backed=true;}})},
 TMV3:{SHEETS:{TASKS:'TASKS'}},tmv3_sheet_:()=>sheet,tmv3_clean_:x=>String(x??'').trim(),tmv3_norm_:x=>String(x??'').toLowerCase(),
 tmv3_rawTaskById_:id=>states[id],tmv3_normalizeV2TaskModel_:x=>x,tmv3_getCanonicalV1TaskSchedule_:()=>({startDateTime:'2025-01-01T09:00:00',dueDateTime:'2025-01-01T10:00:00'}),
 tmv3_hash_:x=>'hash-'+x.length,tmv3_audit_:()=>{},tmv3_strivenApiBudgetStatus_:()=>({remaining:300})};
 vm.createContext(ctx);vm.runInContext(src,ctx);
 let result,error;try{result=ctx.tmv3_fixedBackfillCacheRepair_();}catch(e){error=e;}
 return {matrix,writes,result,error};
}
let cases=0,r=run();assert.equal(r.result.status,'CACHE_RECONCILED');assert.equal(r.result.strivenWrites,0);assert.equal(r.matrix[2500][0],16025);cases++;
for(const id of [16025,18979,19098,19126,19221,19262,19281]){const rows=r.matrix.filter(x=>Number(x[0])===id);assert.equal(rows.length,1);assert.equal(Number(rows[0][9]),id+100);cases++;}
assert.equal(r.matrix.find(x=>Number(x[0])===19262)[4],'Done');cases++;
for(const opts of [{schema:true},{drift:true},{locked:true}]){r=run(opts);assert.ok(r.error);assert.equal(r.writes,0);cases++;}
r=run({wrongId:true});assert.ok(r.result.result.some(x=>x.taskId===19262&&x.status==='FRESH_IDENTITY_NOT_USABLE'));assert.equal(r.matrix.filter(x=>Number(x[0])===19262).length,0);cases++;
assert.ok(!src.includes('tmv3_operationPatchTask_'));assert.ok(!src.includes('tmv3_repairExistingTaskRelationships'));assert.ok(!src.includes('CalendarApp'));cases++;
console.log('PASS: '+cases+' cache-only reconciliation, exact restore preconditions, private backup, duplicate removal, closed/invalid Task handling and zero Striven-mutation cases.');

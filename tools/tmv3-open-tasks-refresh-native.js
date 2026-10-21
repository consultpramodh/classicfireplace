// Google Apps Script: complete Open search import and bounded fresh Task cache reads.
// Task mutations are limited to the user-supplied Service Task18983 relationships.
function tmv3_openTasksRefresh_() {
  const lock=LockService.getScriptLock();
  if(!lock.tryLock(1000))return {status:'LOCK_BUSY'};
  try {
    const props=PropertiesService.getScriptProperties(),prefix='TMV3_OPEN_REFRESH_20261021_';
    const sh=tmv3_sheet_(TMV3.SHEETS.TASKS),headers=['Task ID','Task Number','Task Type ID','Task Type','Status','Name','Customer ID','Location ID','Contact ID','Order ID','Start','Due','Assignees','Pools','URL','Fingerprint'];
    if(JSON.stringify(sh.getRange(1,1,1,16).getValues()[0].map(tmv3_clean_))!==JSON.stringify(headers))throw Error('TASK_CACHE_SCHEMA_DRIFT');
    let imported=JSON.parse(props.getProperty(prefix+'IMPORTED')||'null');
    function freshRows(){return sh.getRange(2,1,sh.getLastRow()-1,16).getValues();}
    function index(rows){const by={};rows.forEach(function(row,i){const id=tmv3_clean_(row[0]);if(!id)return;if(by[id]!==undefined)throw Error('DUPLICATE_TASK_CACHE_'+id);by[id]=i;});return by;}
    function cache(task,canonicalDates){
      const rows=freshRows(),by=index(rows),id=tmv3_clean_(task['Task ID']);
      if(!/^[1-9]\d*$/.test(id))throw Error('INVALID_FRESH_TASK_ID');
      const prior=by[id]!==undefined?rows[by[id]]:null;
      const row=headers.map(function(h){return task[h]===undefined?'':task[h];});
      // Keep established schedule cells unless the canonical v1 schedule was fetched.
      if(prior&&!canonicalDates){row[10]=prior[10];row[11]=prior[11];}
      row[15]=tmv3_hash_(row.slice(0,14).map(String).join('|'));
      const target=by[id]!==undefined?by[id]+2:sh.getLastRow()+1;
      if(target>sh.getMaxRows())sh.insertRowsAfter(sh.getMaxRows(),target-sh.getMaxRows());
      sh.getRange(target,1,1,16).setValues([row]);
      if(String(sh.getRange(target,1).getValue())!==id)throw Error('CACHE_ID_READBACK');
    }
    if(!imported) {
      const seed=tmv3_rawTaskById_(18983),seedTask=tmv3_normalizeV2TaskModel_(seed),status=seed.status||seed.Status||{};
      const statusId=Number(status.id||status.Id);
      if(String(seedTask['Task ID'])!=='18983'||tmv3_norm_(seedTask.Status)!=='open'||!Number.isSafeInteger(statusId)||statusId<=0)throw Error('OPEN_STATUS_SEED_NOT_VERIFIED');
      // Official TaskSearchParams: Status integer array; PageIndex/PageSize paging.
      const found=[],seen={},pageSize=1000;let total=null;
      for(let page=0;page<50;page++) {
        const budget=tmv3_strivenApiBudgetStatus_();if(budget.remaining<20||budget.exhausted)throw Error('OPEN_SEARCH_BUDGET_NO_CACHE_WRITE');
        const response=tmv3_fetchJson_(TMV3.API_BASE+'/v2/tasks/search',{method:'post',contentType:'application/json',payload:JSON.stringify({Status:[statusId],PageIndex:page,PageSize:pageSize})})||{};
        const data=response.Data!==undefined?response.Data:response.data;
        const count=Number(response.TotalCount!==undefined?response.TotalCount:response.totalCount);
        if(!Array.isArray(data)||!Number.isSafeInteger(count)||count<0||(total!==null&&count!==total))throw Error('OPEN_SEARCH_INCOMPLETE_OR_CHANGING_NO_WRITE');
        total=count;
        data.forEach(function(raw){const task=tmv3_normalizeV2TaskModel_(raw),id=tmv3_clean_(task['Task ID']);
          if(!/^[1-9]\d*$/.test(id)||seen[id]||tmv3_norm_(task.Status)!=='open')throw Error('OPEN_SEARCH_DUPLICATE_OR_FILTER_FAILURE');
          seen[id]=true;found.push(task);});
        if(found.length===total)break;
        if(!data.length||data.length<pageSize||found.length>total||page===49)throw Error('OPEN_SEARCH_TRUNCATED_NO_WRITE');
      }
      if(found.length!==total||!seen['18983'])throw Error('OPEN_SEARCH_COMPLETENESS_FAILED');
      const rows=freshRows(),by=index(rows),beforeCount=rows.length;
      const ss=sh.getParent(),backupName='Source Tasks PRE 20261021';
      if(!ss.getSheetByName(backupName))sh.copyTo(ss).setName(backupName).hideSheet();
      let added=0;const byType={};
      found.forEach(function(task){const id=tmv3_clean_(task['Task ID']),prior=by[id]!==undefined?rows[by[id]].slice():Array(16).fill('');
        // Search DTO has identity only: never clear relationships/schedules using omitted fields.
        [0,2,3,4,5,6].forEach(function(c){prior[c]=task[headers[c]]===undefined?'':task[headers[c]];});
        if(!prior[1])prior[1]=id;if(!prior[14])prior[14]=TMV3.TASK_URL_BASE+encodeURIComponent(id);
        prior[15]=tmv3_hash_(prior.slice(0,14).map(String).join('|'));
        if(by[id]===undefined){by[id]=rows.length;rows.push(prior);added++;}else rows[by[id]]=prior;
        byType[task['Task Type']||'Unknown']=(byType[task['Task Type']||'Unknown']||0)+1;
      });
      if(rows.length+1>sh.getMaxRows())sh.insertRowsAfter(sh.getMaxRows(),rows.length+1-sh.getMaxRows());
      sh.getRange(2,1,rows.length,16).setValues(rows);
      const verified=index(freshRows());if(found.some(function(t){return verified[tmv3_clean_(t['Task ID'])]===undefined;}))throw Error('OPEN_IMPORT_READBACK_FAILED');
      imported={at:new Date().toISOString(),totalOpen:total,added:added,sourceRowsBefore:beforeCount,sourceRowsAfter:rows.length,byType:byType};
      props.setProperty(prefix+'IMPORTED',JSON.stringify(imported));
      return {status:'OPEN_REFRESH_CONTINUING',imported:imported,pendingHydration:TMV3_OPEN_REFRESH_HYDRATE_IDS.length+1,apiBudget:tmv3_strivenApiBudgetStatus_()};
    }
    const started=Date.now(),hydrated=[];
    const targets=[18983].concat(TMV3_OPEN_REFRESH_HYDRATE_IDS.filter(function(id){return id!==18983;}));
    for(let n=0;n<targets.length && hydrated.length<12;n++) {
      const id=targets[n];if(props.getProperty(prefix+'TASK_'+id))continue;
      if(Date.now()-started>85000||tmv3_strivenApiBudgetStatus_().remaining<20)break;
      const raw=tmv3_rawTaskById_(id),task=tmv3_normalizeV2TaskModel_(raw),by=tmv3_step7RequestedByFromRaw_(raw);
      if(String(task['Task ID'])!==String(id))throw Error('HYDRATE_ID_MISMATCH');
      if(id===18983){const schedule=tmv3_getCanonicalV1TaskSchedule_(id);task.Start=schedule.startDateTime||'';task.Due=schedule.dueDateTime||'';}
      cache(task,id===18983);
      const evidence={taskId:id,customerId:tmv3_clean_(task['Customer ID']),orderId:tmv3_clean_(task['Order ID']),locationId:tmv3_clean_(task['Location ID']),requestedById:tmv3_clean_(by.id),requestedByType:tmv3_clean_(by.type),status:task.Status};
      props.setProperty(prefix+'TASK_'+id,JSON.stringify(evidence));hydrated.push(evidence);
    }
    const pending=targets.filter(function(id){return !props.getProperty(prefix+'TASK_'+id);});
    let samuels=JSON.parse(props.getProperty(prefix+'SAMUELS')||'null');
    if(!samuels && !pending.length) {
      let intent=JSON.parse(props.getProperty(prefix+'SAMUELS_INTENT')||'null');
      try {
        const raw=tmv3_rawTaskById_(18983),task=tmv3_normalizeV2TaskModel_(raw),by=tmv3_step7RequestedByFromRaw_(raw);
        if(String(task['Task ID'])!=='18983'||tmv3_clean_(task['Customer ID'])!=='46902'||tmv3_clean_(task['Order ID'])!=='27499'||!tmv3_taskIsOpen_(task.Status)||tmv3_norm_(task['Task Type']).indexOf('service')<0)throw Error('SAMUELS_FRESH_IDENTITY_OR_ORDER_CHANGED');
        const order=tmv3_taskFirstFreshOrderOwnershipById_('27499','46902',task.Name);
        if(!order.contactId)throw Error('SAMUELS_ORDER_CONTACT_UNRESOLVED');
        if(intent) {
          samuels={state:tmv3_clean_(by.id)===intent.contactId&&tmv3_norm_(by.type)==='contact'&&tmv3_clean_(task['Location ID'])==='41517'?'VERIFIED':'UNCERTAIN',reason:'INTENT_FRESH_READ_NO_RETRY',taskId:18983};
        } else {
          props.setProperty(prefix+'SAMUELS_INTENT',JSON.stringify({contactId:String(order.contactId)}));
          intent={contactId:String(order.contactId)};
          const originalPatch=tmv3_operationPatchTask_;let result;
          tmv3_operationPatchTask_=function(id,payload,scope){
            if(Number(id)!==18983||scope!=='taskfirstproduction'||Object.keys(payload).some(function(k){return ['Id','Location','RequestedBy'].indexOf(k)<0;}))throw Error('SAMUELS_SCOPE_CONFLICT_NO_WRITE');
            return originalPatch(id,payload,scope);
          };
          try{result=tmv3_repairExistingTaskRelationships(18983,'Service',{customerId:'46902',orderId:'27499',contactId:String(order.contactId),locationId:'41517'},'TASK_FIRST_PRODUCTION');}
          finally{tmv3_operationPatchTask_=originalPatch;}
          samuels={state:result.readbackVerified?'VERIFIED':'REVIEW',taskId:18983,result:result};
        }
        const afterRaw=tmv3_rawTaskById_(18983),after=tmv3_normalizeV2TaskModel_(afterRaw),afterBy=tmv3_step7RequestedByFromRaw_(afterRaw);
        cache(after,false);if(tmv3_clean_(afterBy.id)===String(order.contactId)&&tmv3_norm_(afterBy.type)==='contact'&&tmv3_clean_(after['Location ID'])==='41517')samuels.state='VERIFIED';samuels.requestedById=tmv3_clean_(afterBy.id);samuels.requestedByType=tmv3_clean_(afterBy.type);samuels.locationId=tmv3_clean_(after['Location ID']);
      } catch(err){samuels={state:intent?'UNCERTAIN':'BLOCKED',taskId:18983,reason:String(err.message||err).slice(0,400)};}
      props.setProperty(prefix+'SAMUELS',JSON.stringify(samuels));
    }
    let views=null;
    if(!pending.length&&!props.getProperty(prefix+'VIEWS')) {
      views=tmv3_step6TaskDecisionRunCached('USER_ALL_OPEN_TASK_REFRESH');
      // Show fresh Task Requested By evidence instead of the older optional-contact wording.
      ['Service','Delivery'].forEach(function(vertical){
        const view=tmv3_sheet_(TMV3.VERTICALS[vertical].sheet);if(view.getLastRow()<2)return;
        const values=view.getRange(2,6,view.getLastRow()-1,2).getValues();
        values.forEach(function(row,i){
          const matches=String(row[1]).match(/Task #([0-9]+)/g)||[];
          const evidence=matches.map(function(m){const id=Number(m.replace(/[^0-9]/g,''));
            if(id===18983&&samuels&&samuels.state==='VERIFIED')return {requestedById:samuels.requestedById,requestedByType:samuels.requestedByType};
            return JSON.parse(props.getProperty(prefix+'TASK_'+id)||'null');});
          if(!evidence.length||evidence.some(function(x){return !x||x.requestedByType.toLowerCase()!=='contact'||!x.requestedById;}))return;
          const label='Requested By Contact: '+evidence.map(function(x){return '#'+x.requestedById;}).join(', ')+' (fresh Task)';
          const updated=row.map(function(value){return String(value).replace(/Contact: Not required \/ not resolved/g,label);});
          if(updated[0]!==String(row[0])||updated[1]!==String(row[1]))view.getRange(i+2,6,1,2).setValues([updated]);
        });
      });
      props.setProperty(prefix+'VIEWS',JSON.stringify({at:new Date().toISOString(),status:views.status,write:views.write}));
    }
    const summary={status:pending.length?'OPEN_REFRESH_CONTINUING':'OPEN_REFRESH_COMPLETE',imported:imported,hydrated:hydrated,pendingHydration:pending.length,samuels:samuels,views:views?{status:views.status,write:views.write}:null,apiBudget:tmv3_strivenApiBudgetStatus_()};
    tmv3_audit_('SYSTEM','','','OPEN_TASK_SOURCE_REFRESH','INFO',JSON.stringify(summary));
    return summary;
  } finally {lock.releaseLock();}
}

// Google Apps Script: fixed existing backlog; Contact-only mutation through the guarded writer.
function tmv3_sdRequestedByBackfill_() {
  const lock=LockService.getScriptLock();
  if(!lock.tryLock(1000))return {status:'LOCK_BUSY'};
  try {
    tmv3_assertOperationWrite_('taskfirstproduction','TASK_RELATIONSHIP_REPAIR');
    const ids=TMV3_SD_REQUESTED_BY_IDS;
    const props=PropertiesService.getScriptProperties(),prefix='TMV3_SD_REQUESTED_BY_20261021_';
    const started=Date.now(),budgetStart=tmv3_strivenApiBudgetStatus_();
    const results=[];
    for(let n=0;n<ids.length;n++) {
      const id=ids[n],saved=JSON.parse(props.getProperty(prefix+id)||'null');
      if(saved && saved.state!=='INTENT')continue;
      const budget=tmv3_strivenApiBudgetStatus_();
      if(budget.exhausted || budget.remaining<15 || budget.count-budgetStart.count>=65 || Date.now()-started>=95000)break;
      let intent=false,contactId='',customerId='',orderId='';
      function save(value) {
        const row=Object.assign({taskId:id,at:new Date().toISOString()},value);
        props.setProperty(prefix+id,JSON.stringify(row));results.push(row);
        tmv3_audit_(row.vertical||'SYSTEM','',String(id),'SD_REQUESTED_BY_BACKFILL',row.state==='VERIFIED'?'PASS':'REVIEW',JSON.stringify(row));
      }
      try {
        const raw=tmv3_rawTaskById_(id),task=tmv3_normalizeV2TaskModel_(raw),by=tmv3_step7RequestedByFromRaw_(raw);
        const type=tmv3_norm_(task['Task Type']),vertical=type.indexOf('service')>=0?'Service':type.indexOf('deliver')>=0?'Delivery':'';
        customerId=tmv3_clean_(task['Customer ID']);orderId=tmv3_clean_(task['Order ID']);
        if(String(task['Task ID'])!==String(id)||!vertical||!tmv3_taskIsOpen_(task.Status)||!/^[1-9]\d*$/.test(customerId))throw Error('TASK_IDENTITY_STATUS_OR_CUSTOMER');
        if(saved && saved.state==='INTENT') {
          save({state:tmv3_clean_(by.id)===saved.contactId && tmv3_norm_(by.type)==='contact' && customerId===saved.customerId && orderId===saved.orderId?'VERIFIED':'UNCERTAIN',reason:'PRIOR_INTENT_FRESH_READ_NO_RETRY',contactId:tmv3_clean_(by.id),vertical:vertical});continue;
        }
        if(tmv3_clean_(by.id)) {save({state:'PRESENT',vertical:vertical,contactId:tmv3_clean_(by.id),requestedByType:tmv3_clean_(by.type),reason:'PRESERVED_EXISTING_REQUESTED_BY'});continue;}
        if(!/^[1-9]\d*$/.test(orderId))throw Error('NO_EXISTING_ORDER_LINK');
        const order=tmv3_taskFirstFreshOrderOwnershipById_(orderId,customerId,task.Name);
        contactId=tmv3_clean_(order.contactId);
        if(!/^[1-9]\d*$/.test(contactId))throw Error('FRESH_ORDER_HAS_NO_CONTACT');
        const contact=tmv3_getContactById_(contactId,customerId);
        if(!contact || contact.__ownershipVerified!==true)throw Error('CONTACT_OWNERSHIP_NOT_VERIFIED');
        // Writer independently fetches the Task, Order and Contact and refuses conflicts.
        // Requiring an existing identical Order makes SalesOrder a verified no-op.
        props.setProperty(prefix+id,JSON.stringify({state:'INTENT',taskId:id,customerId:customerId,orderId:orderId,contactId:contactId}));intent=true;
        const originalPatch=tmv3_operationPatchTask_;
        let result;
        tmv3_operationPatchTask_=function(target,payload,scope) {
          if(Number(target)!==id || scope!=='taskfirstproduction' || Object.keys(payload).sort().join(',')!=='Id,RequestedBy' || Number(payload.RequestedBy.Id)!==Number(contactId) || payload.RequestedBy.Type!=='contact')throw Error('CONTACT_ONLY_PAYLOAD_REQUIRED');
          return originalPatch(target,payload,scope);
        };
        try {result=tmv3_repairExistingTaskRelationships(id,vertical,{customerId:customerId,orderId:orderId,contactId:contactId,locationId:''},'TASK_FIRST_PRODUCTION');}
        finally {tmv3_operationPatchTask_=originalPatch;}
        if((result.patchedFields||[]).some(function(f){return f!=='REQUESTED_BY';}))throw Error('UNEXPECTED_PATCH_FIELDS');
        const afterRaw=tmv3_rawTaskById_(id),after=tmv3_normalizeV2TaskModel_(afterRaw),afterBy=tmv3_step7RequestedByFromRaw_(afterRaw);
        if(String(after['Task ID'])!==String(id)||tmv3_clean_(afterBy.id)!==contactId||tmv3_norm_(afterBy.type)!=='contact'||tmv3_clean_(after['Order ID'])!==orderId||tmv3_clean_(after['Customer ID'])!==customerId||after.Name!==task.Name||after.Status!==task.Status||after['Task Type']!==task['Task Type']||tmv3_clean_(after['Location ID'])!==tmv3_clean_(task['Location ID']))throw Error('CONTACT_READBACK_MISMATCH');
        save({state:'VERIFIED',vertical:vertical,orderId:orderId,contactId:contactId,writes:Number(result.writes||0),readbackVerified:true});
      } catch(err) {
        if(intent) {results.push({taskId:id,state:'INTENT',reason:String(err.message||err).slice(0,300)});}
        else save({state:'BLOCKED',reason:String(err.message||err).slice(0,300)});
      }
    }
    const tally={VERIFIED:0,PRESENT:0,BLOCKED:0,UNCERTAIN:0,PENDING:0};
    ids.forEach(function(id){const row=JSON.parse(props.getProperty(prefix+id)||'null');const state=row&&row.state;if(Object.prototype.hasOwnProperty.call(tally,state))tally[state]++;else tally.PENDING++;});
    return {status:tally.PENDING?'REQUESTED_BY_CONTINUING':'REQUESTED_BY_COMPLETE',tally:tally,results:results,apiBudget:tmv3_strivenApiBudgetStatus_()};
  } finally {lock.releaseLock();}
}

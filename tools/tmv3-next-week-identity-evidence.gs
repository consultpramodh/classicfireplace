// Google Apps Script: bounded business-read-only evidence for the three blocked appointments.
function tmv3_nextWeekIdentityEvidence20261026() {
  var report=tmv3_reportRows_(TMV3.PROPERTIES.CUSTOMERS).map(tmv3_normalizeCustomer_);
  var matches=report.filter(function(r){return /alousis|hansen|harvey/i.test(String(r[2]))||tmv3_phone10_(r[3])==='6474446352';});
  var result={customerReportRows:report.length,customerMatches:matches,frances:{},robert:{},alexandra:{}};
  result.frances.locations=tmv3_preInspectionCustomerLocationsFresh_(36935);
  try{result.frances.orderSearch=tmv3_fetchJson_(TMV3.API_BASE+'/v1/sales-orders/search',{method:'post',contentType:'application/json',payload:JSON.stringify({PageIndex:0,PageSize:2,Number:'581422',CustomerId:36935})});}catch(e){result.frances.orderSearchError=String(e);}
  result.robert.locations=tmv3_preInspectionCustomerLocationsFresh_(43890);
  result.robert.contacts=tmv3_getCustomerContacts_(43890);
  var alex=matches.filter(function(r){return /alousis/i.test(String(r[2]))||tmv3_phone10_(r[3])==='6474446352';});
  result.alexandra.customers=alex;
  if(alex.length===1)result.alexandra.locations=tmv3_preInspectionCustomerLocationsFresh_(Number(alex[0][0]));
  result.budget=tmv3_strivenApiBudgetStatus_();return result;
}

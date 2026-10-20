function tmv3_assertOperationWrite_(scope, action) {
  tmv3_assertHardRules_();

  if (!tmv3_operationWritesEnabled_(scope)) {
    throw new Error(
      'TM V3 ' + String(scope || 'UNKNOWN') +
      ' external write is gated by configuration.'
    );
  }
  const normalizedScope = tmv3_norm_(scope);
  if (normalizedScope === 'servicedeliverydetails' &&
      ['TASK_RELATIONSHIP_PATCH','TASK_DETAIL_ASSIGNMENT'].indexOf(action) < 0) {
    throw new Error('TASK_DETAILS_ONLY_SCOPE: no Calendar, creation, notes or title writes.');
  }
  if ((normalizedScope === 'taskfirstproduction' || normalizedScope === 'taskfirstcanary19083') &&
      action !== 'TASK_RELATIONSHIP_REPAIR' && action !== 'TASK_RELATIONSHIP_PATCH') {
    throw new Error('RELATIONSHIP_ONLY_SCOPE: Task-first permission cannot authorize this action.');
  }
}

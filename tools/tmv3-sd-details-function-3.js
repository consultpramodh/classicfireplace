function tmv3_operationAssignmentRequest_(taskId, assignment, method, scope) {
  tmv3_assertOperationWrite_(scope, 'TASK_DETAIL_ASSIGNMENT');

  if (tmv3_norm_(scope) === 'servicedeliverydetails') {
    const context = tmv3_taskFirstProductionCycle_.detailContext;
    const type = tmv3_norm_(assignment.type), id = Number(assignment.id);
    const desired = context && context.desiredAssignment || {};
    const allowedAdd = method === 'post' && (
      (type === 'employee' && (desired.employeeIds || []).indexOf(id)>=0) ||
      (type === 'pool' && (desired.poolIds || []).indexOf(id)>=0));
    const allowedRemove = method === 'delete' && type === 'pool' && id === 4 &&
      (desired.employeeIds || []).length > 0;
    if (!context || Number(context.taskId)!==Number(taskId) || (!allowedAdd && !allowedRemove)) {
      throw new Error('TASK_DETAILS_ASSIGNMENT_OUTSIDE_FRESH_CONTRACT');
    }
    if (allowedRemove) {
      const actual = tmv3_taskAssignmentsFromRaw_(tmv3_rawTaskById_(taskId));
      if (!(desired.employeeIds || []).every(function(employeeId){
        return actual.some(function(a){return a.type==='employee' && Number(a.id)===employeeId;});
      })) throw new Error('TASK_DETAILS_EMPLOYEE_NOT_READBACK_VERIFIED_NO_POOL_REMOVAL');
    }
  }

  return tmv3_fetchJson_(
    TMV3.API_BASE + '/v2/tasks/' + encodeURIComponent(Number(taskId)) + '/assignments',
    {
      method: method,
      contentType: 'application/json',
      payload: JSON.stringify({
        Id: Number(assignment.id),
        Name: assignment.name || '',
        Type: assignment.type || 'employee'
      })
    }
  );
}

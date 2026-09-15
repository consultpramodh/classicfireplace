'use strict';
const NEW_ASSIGNEES=String.raw`function preinspectR30PushAssignees_(ctx) {
  const poolId = PREINSPECT_R30_MANUAL.DEFAULT_POOL_ID;
  const legacyIds = {6:true, 20:true};
  let assignments = preinspectR30NormalizeAssignments_(ctx.task);
  let hasPool = assignments.some(function(a) {
    return String(a.type || '').toLowerCase() === 'pool' && Number(a.id) === poolId;
  });
  const auth = preinspectR30ApiAuth_();
  const url = auth.apiBaseUrl + '/v2/tasks/' + encodeURIComponent(ctx.taskId) + '/assignments';
  let writesPerformed = false;
  let poolAdded = false;
  const removedLegacyEmployeeIds = [];

  // Pool 8 must exist before any employee removal because Striven blocks deleting
  // the final assignment. Existing non-legacy employees remain untouched.
  if (!hasPool) {
    const poolName = preinspectR30GetPoolName_(poolId);
    preinspectR30Request_('post', url, { Id: poolId, Name: poolName, Type: 'pool' }, 'ASSIGNEES_POOL_8');
    writesPerformed = true;
    poolAdded = true;
    assignments = preinspectR30NormalizeAssignments_(preinspectR30ReadTask_(ctx.taskId));
    hasPool = assignments.some(function(a) {
      return String(a.type || '').toLowerCase() === 'pool' && Number(a.id) === poolId;
    });
    if (!hasPool) throw new Error('Assignment POST completed but Pool 8 was not present on read-back.');
  }

  const legacy = assignments.filter(function(a) {
    return String(a.type || '').toLowerCase() === 'employee' && !!legacyIds[Number(a.id)];
  });

  legacy.forEach(function(a) {
    preinspectR30Request_('delete', url, {
      Id: Number(a.id),
      Name: String(a.name || ''),
      Type: 'employee'
    }, 'ASSIGNEES_REMOVE_LEGACY_EMPLOYEE_' + a.id);
    removedLegacyEmployeeIds.push(Number(a.id));
    writesPerformed = true;
  });

  const verified = preinspectR30ReadTask_(ctx.taskId);
  const after = preinspectR30NormalizeAssignments_(verified);
  const verifiedPool = after.some(function(a) {
    return String(a.type || '').toLowerCase() === 'pool' && Number(a.id) === poolId;
  });
  const remainingLegacy = after.filter(function(a) {
    return String(a.type || '').toLowerCase() === 'employee' && !!legacyIds[Number(a.id)];
  });

  if (!verifiedPool || remainingLegacy.length) {
    throw new Error(
      'PreInspect assignment verification failed. Pool 8 present=' + verifiedPool +
      '; remaining legacy employees=' + remainingLegacy.map(function(a) { return a.id; }).join(',')
    );
  }

  if (!writesPerformed) {
    return {
      status: 'NOT_NEEDED',
      writesPerformed: false,
      assignment: { type: 'pool', id: poolId },
      verifiedAssignments: after,
      reason: 'Pool 8 is assigned and no legacy template employees 6/20 remain.'
    };
  }

  return {
    status: 'PUSHED_AND_VERIFIED',
    writesPerformed: true,
    assignment: { type: 'pool', id: poolId },
    poolAdded: poolAdded,
    removedLegacyEmployeeIds: removedLegacyEmployeeIds,
    policy: 'POOL_8_PLUS_REMOVE_ONLY_LEGACY_TEMPLATE_EMPLOYEES_6_20',
    verifiedAssignments: after
  };
}`;

const NEW_FIELD854=String.raw`function preinspectR47EnsureInstallNotesCanonical_(taskId, desiredValue) {
  const id = Number(taskId) || 0;
  if (!id) throw new Error('Install Notes push requires a valid Task ID.');
  const desiredSemantic = preinspectR346aSemanticField854Text_(desiredValue);
  if (desiredSemantic === null) throw new Error('Install Notes desired value could not be normalized.');

  const props = PropertiesService.getScriptProperties();
  const uncertainKey = preinspectR47Field854UncertainKey_(id);
  const priorUncertain = String(props.getProperty(uncertainKey) || '').trim();
  const auth = preinspectR30ApiAuth_();
  const taskUrl = String(auth.apiBaseUrl || 'https://api.striven.com').replace(/\/+$/, '') + '/v2/tasks/' + encodeURIComponent(id);
  const headers = tm_getStrivenHeaders_();

  // R5.2: v2 InfoCustomFields is the proven read/write model for Field 854.
  // Read it BEFORE deciding whether any write is needed. This also safely
  // reconciles a prior HTTP-200/uncertain run without issuing another PATCH.
  const before = preinspectR345bRequestJson_('get', taskUrl, null, headers);
  if (before.statusCode < 200 || before.statusCode >= 300) {
    throw new Error('Field 854 preflight v2 Task GET failed HTTP ' + before.statusCode + ': ' + String(before.text || '').slice(0, 1200));
  }
  const beforeInfo = preinspectR345bFindInfoCustomFields_(before.json);
  if (!beforeInfo || !Array.isArray(beforeInfo.fields)) {
    throw new Error('Field 854 blocked: v2 Task GET did not expose InfoCustomFields. No PATCH performed.');
  }
  const beforeFields = preinspectR345bClone_(beforeInfo.fields);
  const beforeMap = preinspectR345bFieldValueMap_(beforeFields);
  const beforeTarget = preinspectR346FindFieldById_(beforeFields, 854);
  if (!beforeTarget) throw new Error('Field 854 blocked: v2 Task InfoCustomFields does not contain Field 854. No PATCH performed.');

  const currentSemantic = preinspectR346aSemanticField854Text_(preinspectR345bFieldValue_(beforeTarget));
  if (currentSemantic !== null && currentSemantic === desiredSemantic) {
    props.deleteProperty(uncertainKey);
    const already = {
      mode: 'PREINSPECT_FIELD854_V2_VERIFIED',
      status: priorUncertain ? 'RECONCILED_PRIOR_UNCERTAIN_V2_MATCH' : 'NOT_NEEDED_V2_MATCH',
      taskId: id,
      fieldId: 854,
      writesPerformed: false,
      endpoint: taskUrl,
      verificationSource: 'V2_TASK_INFOCUSTOMFIELDS',
      reason: priorUncertain
        ? 'Prior uncertain Field 854 write is now reconciled: current v2 InfoCustomFields already contains the requested Install Notes. No retry performed.'
        : 'Current v2 InfoCustomFields already contains the requested Install Notes. No PATCH performed.'
    };
    Logger.log(JSON.stringify(already, null, 2));
    return already;
  }

  // A prior successful/uncertain mutation that is NOT confirmed by the current
  // v2 model remains fail-closed. Never issue a blind second mutation.
  if (id === 18476 || priorUncertain) {
    throw new Error(
      'BLOCKED_FIELD854_UNCERTAIN_WRITE: Task ' + id +
      ' has a prior successful/uncertain Field 854 mutation and current v2 InfoCustomFields does not confirm the requested value. ' +
      'No second write attempted. Manual/API-contract review required.'
    );
  }

  const mergedFields = preinspectR345bClone_(beforeFields);
  const target = preinspectR346FindFieldById_(mergedFields, 854);
  preinspectR346SetExistingFieldValue_(target, desiredValue);
  const patchPayload = { Id: id, InfoCustomFields: mergedFields };
  const patch = preinspectR345bRequestJson_('patch', taskUrl, patchPayload, headers);
  if (patch.statusCode < 200 || patch.statusCode >= 300) {
    throw new Error('Field 854 task PATCH failed HTTP ' + patch.statusCode + ': ' + String(patch.text || '').slice(0, 1200));
  }

  const after = preinspectR345bRequestJson_('get', taskUrl, null, headers);
  if (after.statusCode < 200 || after.statusCode >= 300) {
    props.setProperty(uncertainKey, JSON.stringify({taskId:id,fieldId:854,at:new Date().toISOString(),reason:'v2 read-back failed',patchHttpCode:patch.statusCode}));
    throw new Error('UNCERTAIN_WRITE: Field 854 PATCH returned success but v2 read-back failed. No retry allowed.');
  }
  const afterInfo = preinspectR345bFindInfoCustomFields_(after.json);
  if (!afterInfo || !Array.isArray(afterInfo.fields)) {
    props.setProperty(uncertainKey, JSON.stringify({taskId:id,fieldId:854,at:new Date().toISOString(),reason:'v2 InfoCustomFields missing',patchHttpCode:patch.statusCode}));
    throw new Error('UNCERTAIN_WRITE: Field 854 PATCH returned success but v2 InfoCustomFields is unavailable. No retry allowed.');
  }
  const afterMap = preinspectR345bFieldValueMap_(afterInfo.fields);
  const afterTarget = preinspectR346FindFieldById_(afterInfo.fields, 854);
  const afterSemantic = afterTarget ? preinspectR346aSemanticField854Text_(preinspectR345bFieldValue_(afterTarget)) : null;
  if (afterSemantic === null || afterSemantic !== desiredSemantic) {
    const uncertain = {
      taskId:id, fieldId:854, at:new Date().toISOString(), patchHttpCode:patch.statusCode,
      desiredSemanticLength:desiredSemantic.length,
      v2SemanticLength:afterSemantic===null?null:afterSemantic.length
    };
    props.setProperty(uncertainKey, JSON.stringify(uncertain));
    Logger.log(JSON.stringify({mode:'PREINSPECT_FIELD854_UNCERTAIN_WRITE',status:'UNCERTAIN_WRITE',evidence:uncertain},null,2));
    throw new Error('UNCERTAIN_WRITE: Field 854 PATCH returned success but v2 InfoCustomFields did not confirm the requested Install Notes. No retry allowed.');
  }

  const nonTargetComparison = preinspectR345bCompareFieldMaps_(
    preinspectR346WithoutFieldId_(beforeMap, '854'),
    preinspectR346WithoutFieldId_(afterMap, '854')
  );
  if (!nonTargetComparison.equal || Object.keys(beforeMap).length !== Object.keys(afterMap).length) {
    props.setProperty(uncertainKey, JSON.stringify({taskId:id,fieldId:854,at:new Date().toISOString(),reason:'non-854 parity changed'}));
    throw new Error('CRITICAL_FIELD854_PARITY_FAILURE: A non-854 custom field changed after the Install Notes PATCH. Manual review required.');
  }

  props.deleteProperty(uncertainKey);
  const success = {
    mode: 'PREINSPECT_FIELD854_V2_VERIFIED',
    status: 'PUSHED_AND_VERIFIED_V2',
    taskId: id,
    fieldId: 854,
    writesPerformed: true,
    endpoint: taskUrl,
    payloadShape: 'ID_PLUS_FULL_CURRENT_INFOCUSTOMFIELDS',
    verificationSource: 'V2_TASK_INFOCUSTOMFIELDS',
    patchHttpCode: patch.statusCode,
    non854FieldsPreserved: true
  };
  Logger.log(JSON.stringify(success, null, 2));
  return success;
}`;

module.exports={NEW_ASSIGNEES,NEW_FIELD854};

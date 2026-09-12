function tm2_planShadowRecord_(record) {
  const i = record.identity;
  const status = tm2_upper_(i.mappingStatus);
  const wantsPush = tm2_truthyYes_(i.push);

  if (!record.evidence.hasEvent) {
    return { endpoint: TM2_ENDPOINT.BLOCKED, reason: 'MISSING_EVENT_ID', writes: [] };
  }

  if (status === 'REVIEW') {
    return { endpoint: TM2_ENDPOINT.REVIEW_REQUIRED, reason: 'LEGACY_MAPPING_REVIEW', writes: [] };
  }

  if (record.taskMatch.match === 'EXISTING_NON_OPEN') {
    return { endpoint: TM2_ENDPOINT.DEFERRED_RETRY, reason: 'NON_OPEN_TASK_REQUIRES_RECOVERY_DECISION', writes: [] };
  }

  if (record.taskMatch.match === 'NONE') {
    return { endpoint: TM2_ENDPOINT.SHADOW_ONLY, reason: 'NO_EXISTING_TASK_CREATE_NOT_ENABLED_IN_R0', writes: [] };
  }

  if (record.taskMatch.mutable && wantsPush) {
    return { endpoint: TM2_ENDPOINT.SHADOW_ONLY, reason: 'WOULD_EVALUATE_PATCH_IN_LATER_TM2_PHASE', writes: [] };
  }

  return { endpoint: TM2_ENDPOINT.SHADOW_ONLY, reason: 'NO_LEGACY_PUSH_INTENT_OBSERVED', writes: [] };
}

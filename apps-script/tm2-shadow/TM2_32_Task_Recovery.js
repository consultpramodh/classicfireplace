function tm2_previewRecovery_(record) {
  if (!record || !record.identity) {
    return { endpoint: TM2_ENDPOINT.BLOCKED, reason: 'MISSING_RECORD' };
  }

  if (record.taskMatch && record.taskMatch.match === 'EXISTING_NON_OPEN') {
    return {
      endpoint: TM2_ENDPOINT.DEFERRED_RETRY,
      reason: 'RECOVERY_CLASSIFICATION_ONLY_R0',
      sourceTaskId: record.identity.taskId
    };
  }

  return { endpoint: TM2_ENDPOINT.TERMINAL_SKIP, reason: 'RECOVERY_NOT_APPLICABLE' };
}

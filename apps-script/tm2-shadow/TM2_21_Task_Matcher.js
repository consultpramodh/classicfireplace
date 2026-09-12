function tm2_classifyExistingTask_(identity) {
  const taskStatus = tm2_upper_(identity.taskStatus);
  const hasTask = !!identity.taskId;

  if (!hasTask) return { match: 'NONE', mutable: false };
  if (taskStatus === 'OPEN') return { match: 'EXISTING_OPEN', mutable: true };

  if (['DONE', 'COMPLETED', 'CLOSED', 'CANCELLED', 'CANCELED', 'ON HOLD'].indexOf(taskStatus) !== -1) {
    return { match: 'EXISTING_NON_OPEN', mutable: false };
  }

  return { match: 'EXISTING_UNKNOWN_STATUS', mutable: false };
}

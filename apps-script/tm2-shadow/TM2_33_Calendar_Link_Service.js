function tm2_previewCalendarLink_(record) {
  if (!record || !record.identity || !record.identity.eventId) {
    return { endpoint: TM2_ENDPOINT.BLOCKED, reason: 'MISSING_EVENT_ID' };
  }
  if (!record.identity.taskId) {
    return { endpoint: TM2_ENDPOINT.DEFERRED_RETRY, reason: 'MISSING_TASK_ID' };
  }

  return {
    endpoint: TM2_ENDPOINT.SHADOW_ONLY,
    reason: 'CALENDAR_WRITE_DISABLED_R0',
    eventId: record.identity.eventId,
    taskId: record.identity.taskId,
    calendarWritePerformed: false
  };
}

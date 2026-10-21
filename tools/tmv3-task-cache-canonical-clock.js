// Google Apps Script: cache-only schedule normalization; no Task/Calendar writes.
function tmv3_taskCacheCanonicalClock_(task) {
  const output = Object.assign({}, task || {});
  if (Number(output['Task Type ID'] || 0) !== 105) return output;
  const id = Number(output['Task ID']);
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error('CACHE_TASK_ID_INVALID');
  const schedule = tmv3_getCanonicalV1TaskSchedule_(id);
  const start = tmv3_parseDateTime_(schedule.startDateTime);
  const due = tmv3_parseDateTime_(schedule.dueDateTime);
  if (Number(schedule.taskId) !== id || !start || !due ||
      !Number.isFinite(start.getTime()) || !Number.isFinite(due.getTime()) ||
      due.getTime() < start.getTime()) {
    throw new Error('CACHE_CANONICAL_SCHEDULE_INVALID');
  }
  output.Start = tmv3_iso_(start);
  output.Due = tmv3_iso_(due);
  output.Fingerprint = tmv3_hash_([
    'Task ID','Task Number','Task Type ID','Task Type','Status','Name',
    'Customer ID','Location ID','Contact ID','Order ID','Start','Due','Assignees','Pools'
  ].map(function(key) { return tmv3_clean_(output[key]); }).join('|'));
  return output;
}

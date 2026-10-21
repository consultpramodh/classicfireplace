function tmv3_preInspectionCanonicalCacheTask_(task,canonical) {
  if(Number(task&&task['Task Type ID'])!==105) return task;
  if(!canonical || Number(canonical.taskId)!==Number(task['Task ID']) ||
      !canonical.startDateTime || !canonical.dueDateTime ||
      !Number.isFinite(new Date(canonical.startDateTime).getTime()) ||
      !Number.isFinite(new Date(canonical.dueDateTime).getTime()) ||
      new Date(canonical.dueDateTime).getTime()<new Date(canonical.startDateTime).getTime()) throw new Error('CANONICAL_PI_CACHE_SCHEDULE_UNVERIFIED_NO_CACHE_WRITE');
  const verified=Object.assign({},task,{'Start':canonical.startDateTime,'Due':canonical.dueDateTime});
  verified.Fingerprint=tmv3_hash_(['Task ID','Task Number','Task Type ID','Task Type','Status','Name','Customer ID','Location ID','Contact ID','Order ID','Start','Due','Assignees','Pools'].map(function(key){return verified[key]||'';}).join('|'));
  return verified;
}

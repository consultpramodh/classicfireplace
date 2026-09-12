function tm2_nowIso_() {
  return new Date().toISOString();
}

function tm2_clean_(value) {
  return value === null || value === undefined ? '' : String(value).trim();
}

function tm2_upper_(value) {
  return tm2_clean_(value).toUpperCase();
}

function tm2_truthyYes_(value) {
  return ['YES', 'TRUE', 'Y', '1'].indexOf(tm2_upper_(value)) !== -1;
}

function tm2_safeJson_(value) {
  try {
    return JSON.stringify(value);
  } catch (err) {
    return JSON.stringify({ serializationError: String(err && err.message || err) });
  }
}

function tm2_log_(stage, payload) {
  const row = {
    tm2Version: TM2_VERSION,
    mode: TM2_MODE.name,
    stage: stage,
    at: tm2_nowIso_(),
    payload: payload || null
  };
  Logger.log(tm2_safeJson_(row));
  return row;
}

function tm2_assertShadowSafe_() {
  if (TM2_MODE.writeEnabled ||
      TM2_MODE.createRecreateEnabled ||
      TM2_MODE.calendarWriteEnabled ||
      TM2_MODE.triggerInstallEnabled) {
    throw new Error('TM2 shadow safety gate failed: write-capable flags must all be false.');
  }
  return true;
}

function tm2_headerMap_(headers) {
  const out = {};
  (headers || []).forEach(function(h, i) {
    const key = tm2_clean_(h);
    if (key && out[key] === undefined) out[key] = i;
  });
  return out;
}

function tm2_pick_(row, map, aliases) {
  for (let i = 0; i < aliases.length; i++) {
    const idx = map[aliases[i]];
    if (idx !== undefined) return row[idx];
  }
  return '';
}

function tm2_hasFunction_(name) {
  try {
    return typeof globalThis[name] === 'function';
  } catch (err) {
    return false;
  }
}

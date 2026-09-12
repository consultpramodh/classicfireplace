function tm2_equalString_(a, b) {
  return tm2_clean_(a) === tm2_clean_(b);
}

function tm2_verifyNoWrites_(summary) {
  const attempted = Number(summary && summary.writeAttempts || 0);
  if (attempted !== 0) {
    throw new Error('TM2 shadow verification failed: write attempt count must be zero.');
  }
  return {
    endpoint: TM2_ENDPOINT.VERIFIED_COMPLETE,
    writeAttempts: 0,
    mode: TM2_MODE.name
  };
}

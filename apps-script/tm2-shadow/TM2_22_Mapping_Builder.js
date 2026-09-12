function tm2_buildShadowRecord_(workflow, headers, row, rowNumber) {
  const identity = tm2_extractIdentityFromRow_(headers, row);
  return {
    workflow: workflow,
    rowNumber: rowNumber,
    identity: identity,
    evidence: tm2_relationshipEvidence_(identity),
    taskMatch: tm2_classifyExistingTask_(identity)
  };
}

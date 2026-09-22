/************************************************************
 * 98_14_Task_Title_Normalization_R1.js
 *
 * Remote Striven-only diagnostics for Task title standardization.
 * Does not touch Spreadsheet or Calendar.
 ************************************************************/

const TM_TASK_TITLE_NORMALIZATION_R1 = Object.freeze({
  VERSION: 'TM_TASK_TITLE_NORMALIZATION_R1_20260922'
});

function TEST_TASK_TITLE_STRIVEN_REMOTE_GET_R1() {
  const taskId = 18510;
  const task = getReplacementTaskSourceSnapshot_(taskId);
  return {
    mode: 'TASK_TITLE_STRIVEN_REMOTE_GET',
    version: TM_TASK_TITLE_NORMALIZATION_R1.VERSION,
    taskId: taskId,
    title: task && task.title ? task.title : '',
    status: task && task.status ? (task.status.name || task.status.Name || '') : '',
    customerId: task && task.customer ? Number(task.customer.id || 0) || null : null,
    locationId: task && task.location ? Number(task.location.id || 0) || null : null,
    strivenWritesPerformed: false,
    calendarWritesPerformed: false,
    spreadsheetWritesPerformed: false
  };
}

/*
 * 042_Task_Status_List.tsx
 * Formats one or more Clean and Service task summaries into readable rows.
 */

import { StatusBadge } from "@/components/status-badge";

type TaskStatusListProps = {
  value?: string;
  empty?: string;
  compact?: boolean;
};

export function TaskStatusList({ value = "", empty = "-", compact = false }: TaskStatusListProps) {
  const tasks = parseTaskSummary(value);

  if (!tasks.length) {
    return <span className="task-status-empty">{empty}</span>;
  }

  return (
    <div className={compact ? "task-status-list compact" : "task-status-list"}>
      {tasks.map((task, index) => (
        <div className="task-status-row" key={`${task.taskId || "task"}-${index}`}>
          <div className="task-status-main">
            <strong>{task.taskId || `Task ${index + 1}`}</strong>
            <StatusBadge value={task.status || "Unknown"} />
          </div>
          {task.meta.length ? <small>{task.meta.join(" · ")}</small> : null}
        </div>
      ))}
    </div>
  );
}

function parseTaskSummary(value: string) {
  return String(value || "")
    .split(/\s+\|\s+/)
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk) => {
      const parts = chunk.split(/\s+·\s+/).map((part) => part.trim()).filter(Boolean);
      const maybeId = parts[0]?.startsWith("#") ? parts.shift() || "" : "";
      const status = parts.shift() || "";
      return {
        taskId: maybeId,
        status,
        meta: parts
      };
    });
}

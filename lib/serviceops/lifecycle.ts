import type { IntakeRow, TaskMappingRow } from "@/lib/serviceops/types";

type LifecycleTask = Pick<TaskMappingRow, "tech" | "start" | "end" | "taskStatus" | "rowStatus"> | {
  tech?: string;
  start?: string;
  end?: string;
  taskStatus?: string;
  rowStatus?: string;
};

export type ServiceLifecycle = {
  isInProgress: boolean;
  isScheduled: boolean;
  isCompleted: boolean;
  quotedToInProgress: string;
  createdToScheduled: string;
  scheduleLabel: string;
  technician: string;
  appointmentNote: string;
};

export function buildServiceLifecycle(row: IntakeRow, task?: LifecycleTask | null, now = new Date()): ServiceLifecycle {
  const salesOrderStatus = row.salesOrderStatus || "";
  const taskStatus = `${task?.taskStatus || ""} ${task?.rowStatus || ""} ${row.cleanServiceTaskStatus || ""}`;
  const createdAt = firstDate(row.salesOrderCreatedAt, row.submittedAt);
  const inProgressAt = firstDate(row.salesOrderInProgressAt, row.salesOrderUpdatedAt);
  const scheduledAt = firstDate(task?.start, row.salesOrderScheduledAt);
  const technician = cleanTechnician(task?.tech) || assignedFromTaskSummary(row.cleanServiceTaskStatus);
  const isInProgress = /in\s*progress/i.test(salesOrderStatus);
  const isScheduled = Boolean(scheduledAt) || /scheduled|in sync/i.test(taskStatus);
  const isCompleted = /complete|completed|closed|done/i.test(`${salesOrderStatus} ${taskStatus} ${row.pipelineState}`);

  return {
    isInProgress,
    isScheduled,
    isCompleted,
    quotedToInProgress: elapsedLabel(createdAt, isInProgress ? inProgressAt || now : null, isInProgress ? "unknown" : "waiting"),
    createdToScheduled: elapsedLabel(createdAt, scheduledAt, isScheduled ? "unknown" : "waiting"),
    scheduleLabel: scheduledAt ? formatAppointmentDate(scheduledAt) : "",
    technician,
    appointmentNote: buildAppointmentNote({ isCompleted, isScheduled, technician, scheduledAt, taskStatus })
  };
}

export function formatAppointmentDate(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

function buildAppointmentNote(input: { isCompleted: boolean; isScheduled: boolean; technician: string; scheduledAt: Date | null; taskStatus: string }) {
  const who = input.technician || "Assigned technician";
  const when = input.scheduledAt ? formatAppointmentDate(input.scheduledAt) : "the scheduled service window";

  if (input.isCompleted) {
    return `Service completed by ${who}${input.scheduledAt ? ` on ${when}` : ""}.`;
  }

  if (input.isScheduled) {
    return `${who} is scheduled to do the service on ${when}.`;
  }

  if (/in\s*progress/i.test(input.taskStatus)) {
    return `${who} has the service task in progress.`;
  }

  return "";
}

function elapsedLabel(start: Date | null, end: Date | null, fallback: "waiting" | "unknown") {
  if (!start) return "Unknown start";
  if (!end) return fallback === "waiting" ? `Waiting ${durationLabel(start, new Date())}` : "Unknown";
  return durationLabel(start, end);
}

function durationLabel(start: Date, end: Date) {
  const minutes = Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000));
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;

  if (days) return `${days}d ${hours}h`;
  if (hours) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

function firstDate(...values: unknown[]) {
  for (const value of values) {
    const text = String(value || "").trim();
    if (!text) continue;
    const parsed = new Date(text);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return null;
}

function cleanTechnician(value: unknown) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function assignedFromTaskSummary(value: unknown) {
  const text = String(value || "");
  const parts = text.split("·").map((part) => part.trim()).filter(Boolean);
  return parts.find((part) => !/^#|open|scheduled|complete|closed|start|due|return trip/i.test(part)) || "";
}

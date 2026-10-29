"use client";

import { CalendarIcon } from "lucide-react";

import { AvatarStack } from "@/components/common/avatar-stack";
import { Badge } from "@/components/ui/badge";
import { daysFrom, relativeDay } from "@/lib/date";
import { useI18n } from "@/lib/i18n/client";
import { priorityTone, statusLabel } from "@/lib/status";
import { cn } from "@/lib/utils";
import type { Task } from "@/types/entities";

export function TaskCardBody({ task, today }: { task: Task; today: string }) {
  const { t } = useI18n();
  const days = task.due_date ? daysFrom(today, task.due_date) : null;
  const overdue = task.status !== "done" && days !== null && days < 0;
  return (
    <>
      <div className={cn("text-sm leading-snug", task.status === "done" && "text-muted-foreground line-through")}>
        {task.title}
      </div>
      {task.project ? (
        <div className="mt-1 truncate text-xs text-muted-foreground">
          {task.project.emoji} {task.project.title}
        </div>
      ) : null}
      <div className="mt-2 flex items-center gap-1.5">
        <Badge tone={priorityTone[task.priority]}>{statusLabel(t, "priority", task.priority)}</Badge>
        {days !== null ? (
          <span className={cn("inline-flex items-center gap-1 text-xs", overdue ? "text-status-red-fg" : "text-muted-foreground")}>
            <CalendarIcon className="size-3" />
            {task.status === "done" ? task.due_date : relativeDay(t, days, { overdue: true })}
          </span>
        ) : null}
        <AvatarStack members={task.assignees} className="ml-auto" />
      </div>
    </>
  );
}

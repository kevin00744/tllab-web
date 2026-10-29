"use client";

import { AvatarStack } from "@/components/common/avatar-stack";
import { EmptyBlock } from "@/components/common/field";
import { Badge } from "@/components/ui/badge";
import { daysFrom, formatDate, relativeDay } from "@/lib/date";
import { useI18n } from "@/lib/i18n/client";
import { priorityTone, statusLabel, taskStatusTone } from "@/lib/status";
import { cn } from "@/lib/utils";
import type { Task } from "@/types/entities";
import { useTasks } from "./task-provider";

/** 清單檢視：表格，手機版收合為卡片列 */
export function TasksList({ tasks, today, showProject = true }: { tasks: Task[]; today: string; showProject?: boolean }) {
  const { t, locale } = useI18n();
  const { openTask } = useTasks();
  if (tasks.length === 0) return <EmptyBlock>{t.tasksPage.empty}</EmptyBlock>;

  return (
    <div className="overflow-hidden rounded-xl border">
      <table className="w-full text-sm">
        <thead className="hidden bg-muted/50 text-left text-xs text-muted-foreground md:table-header-group">
          <tr>
            <th className="px-4 py-2 font-medium">{t.fields.title}</th>
            <th className="px-3 py-2 font-medium">{t.fields.status}</th>
            <th className="px-3 py-2 font-medium">{t.fields.priority}</th>
            {showProject ? <th className="px-3 py-2 font-medium">{t.fields.project}</th> : null}
            <th className="px-3 py-2 font-medium">{t.fields.assignees}</th>
            <th className="px-4 py-2 text-right font-medium">{t.fields.dueDate}</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {tasks.map((task) => {
            const days = task.due_date ? daysFrom(today, task.due_date) : null;
            const overdue = task.status !== "done" && days !== null && days < 0;
            return (
              <tr
                key={task.id}
                tabIndex={0}
                onClick={() => openTask(task)}
                onKeyDown={(e) => e.key === "Enter" && openTask(task)}
                className="flex cursor-pointer flex-wrap items-center gap-x-2 gap-y-1 px-4 py-2.5 outline-none hover:bg-accent/40 focus-visible:bg-accent/60 md:table-row md:px-0 md:py-0"
              >
                <td className="w-full md:w-auto md:px-4 md:py-2.5">
                  <span className={cn(task.status === "done" && "text-muted-foreground line-through")}>{task.title}</span>
                </td>
                <td className="md:px-3 md:py-2.5">
                  <Badge tone={taskStatusTone[task.status]}>{statusLabel(t, "task", task.status)}</Badge>
                </td>
                <td className="md:px-3 md:py-2.5">
                  <Badge tone={priorityTone[task.priority]}>{statusLabel(t, "priority", task.priority)}</Badge>
                </td>
                {showProject ? (
                  <td className="hidden max-w-48 truncate text-muted-foreground md:table-cell md:px-3 md:py-2.5">
                    {task.project ? `${task.project.emoji} ${task.project.title}` : "—"}
                  </td>
                ) : null}
                <td className="md:px-3 md:py-2.5">
                  {task.assignees.length ? (
                    <AvatarStack members={task.assignees} />
                  ) : (
                    <span className="text-xs text-muted-foreground">{t.tasksPage.unassigned}</span>
                  )}
                </td>
                <td className="ml-auto text-right text-xs md:px-4 md:py-2.5">
                  {task.due_date && days !== null ? (
                    <span className={cn(overdue ? "text-status-red-fg" : "text-muted-foreground")}>
                      {formatDate(locale, task.due_date, { month: "numeric", day: "numeric" })}
                      {task.status !== "done" ? ` · ${relativeDay(t, days, { overdue: true })}` : ""}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

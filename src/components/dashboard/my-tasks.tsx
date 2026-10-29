import { Badge } from "@/components/ui/badge";
import { daysFrom, formatDate, relativeDay } from "@/lib/date";
import type { Dictionary } from "@/lib/i18n";
import { format } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n/config";
import { priorityTone, statusLabel, taskStatusTone } from "@/lib/status";
import { cn } from "@/lib/utils";
import type { DashboardData } from "@/types/dashboard";
import { EmptyState, Section } from "./section";

export function MyTasks({
  data,
  t,
  locale,
  className,
}: {
  data: DashboardData;
  t: Dictionary;
  locale: Locale;
  className?: string;
}) {
  return (
    <Section
      title={t.dashboard.myTasks}
      subtitle={format(t.dashboard.myTasksSummary, { open: data.my_open, overdue: data.my_overdue })}
      href="/tasks"
      linkLabel={t.dashboard.viewAll}
      className={className}
    >
      {data.my_tasks.length === 0 ? (
        <EmptyState>{t.dashboard.myTasksEmpty}</EmptyState>
      ) : (
        <ul className="-mx-2 divide-y divide-border/60">
          {data.my_tasks.map((task) => {
            const days = task.due_date ? daysFrom(data.today, task.due_date) : null;
            const overdue = days !== null && days < 0;
            return (
              <li key={task.id} className="flex items-center gap-3 px-2 py-2.5">
                <Badge tone={taskStatusTone[task.status]} className="w-16 shrink-0">
                  {statusLabel(t, "task", task.status)}
                </Badge>
                <div className="min-w-0 flex-1">
                  <div className="line-clamp-2 text-sm sm:line-clamp-1">{task.title}</div>
                  {task.project ? (
                    <div className="truncate text-xs text-muted-foreground">
                      {task.project.emoji} {task.project.title}
                    </div>
                  ) : null}
                </div>
                <Badge tone={priorityTone[task.priority]} className="hidden shrink-0 sm:inline-flex">
                  {statusLabel(t, "priority", task.priority)}
                </Badge>
                <div className="w-20 shrink-0 text-right text-xs">
                  {task.due_date && days !== null ? (
                    <>
                      <div className={cn("font-medium", overdue ? "text-status-red-fg" : "text-foreground")}>
                        {relativeDay(t, days, { overdue: true })}
                      </div>
                      <div className="text-muted-foreground">
                        {formatDate(locale, task.due_date, { month: "numeric", day: "numeric" })}
                      </div>
                    </>
                  ) : (
                    <span className="text-muted-foreground">{t.dashboard.noDueDate}</span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}

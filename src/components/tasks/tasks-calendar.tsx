"use client";

import Link from "next/link";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";

import { useParamUpdater } from "@/components/common/use-search-params";
import { Button } from "@/components/ui/button";
import { addDays, formatDate } from "@/lib/date";
import { format } from "@/lib/i18n";
import { useI18n } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import type { Task } from "@/types/entities";
import { useTasks } from "./task-provider";

const CHIP: Record<Task["status"], string> = {
  todo: "bg-status-gray-bg text-status-gray-fg",
  in_progress: "bg-status-blue-bg text-status-blue-fg",
  in_review: "bg-status-purple-bg text-status-purple-fg",
  done: "bg-status-green-bg text-status-green-fg line-through",
};

/** 月曆：一週從週一開始，依截止日顯示任務 */
export function TasksCalendar({
  tasks,
  month,
  today,
  undatedCount,
}: {
  tasks: Task[];
  month: string; // YYYY-MM
  today: string;
  undatedCount: number;
}) {
  const { t, locale } = useI18n();
  const { openTask, newTask, options } = useTasks();
  const { hrefWith } = useParamUpdater();

  const first = `${month}-01`;
  const weekday = (new Date(`${first}T00:00:00Z`).getUTCDay() + 6) % 7; // 週一 = 0
  const start = addDays(first, -weekday);
  const days = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  const byDate = new Map<string, Task[]>();
  for (const task of tasks) if (task.due_date) byDate.set(task.due_date, [...(byDate.get(task.due_date) ?? []), task]);

  const [y, m] = month.split("-").map(Number);
  const shift = (delta: number) => {
    const d = new Date(Date.UTC(y, m - 1 + delta, 1));
    return d.toISOString().slice(0, 7);
  };

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="text-base font-semibold">{formatDate(locale, first, { year: "numeric", month: "long" })}</h2>
        <div className="ml-auto flex items-center gap-1">
          <Button asChild variant="outline" size="icon-sm" aria-label={t.tasksPage.prevMonth}>
            <Link href={hrefWith({ month: shift(-1) })} scroll={false}>
              <ChevronLeftIcon />
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href={hrefWith({ month: null })} scroll={false}>
              {t.tasksPage.thisMonth}
            </Link>
          </Button>
          <Button asChild variant="outline" size="icon-sm" aria-label={t.tasksPage.nextMonth}>
            <Link href={hrefWith({ month: shift(1) })} scroll={false}>
              <ChevronRightIcon />
            </Link>
          </Button>
        </div>
      </div>
      <div className="overflow-hidden rounded-xl border">
        <div className="grid grid-cols-7 border-b bg-muted/50 text-center text-xs text-muted-foreground">
          {days.slice(0, 7).map((d) => (
            <div key={d} className="py-1.5">
              {formatDate(locale, d, { weekday: "short" })}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {days.map((date) => {
            const inMonth = date.startsWith(month);
            const items = byDate.get(date) ?? [];
            return (
              <div
                key={date}
                className={cn(
                  "group min-h-20 border-r border-b p-1 last:border-r-0 sm:min-h-28 [&:nth-child(7n)]:border-r-0",
                  !inMonth && "bg-muted/30 text-muted-foreground",
                )}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={cn(
                      "flex size-6 items-center justify-center rounded-full text-xs",
                      date === today && "bg-primary font-semibold text-primary-foreground",
                    )}
                  >
                    {Number(date.slice(8))}
                  </span>
                  {options.can_create ? (
                    <button
                      type="button"
                      onClick={() => newTask({ due_date: date })}
                      className="rounded px-1 text-sm text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-accent focus-visible:opacity-100"
                      aria-label={`${t.tasksPage.new}：${date}`}
                    >
                      +
                    </button>
                  ) : null}
                </div>
                <ul className="mt-0.5 flex flex-col gap-0.5">
                  {items.map((task) => (
                    <li key={task.id}>
                      <button
                        type="button"
                        onClick={() => openTask(task)}
                        title={task.title}
                        className={cn("w-full truncate rounded px-1 py-0.5 text-left text-[11px] leading-tight", CHIP[task.status])}
                      >
                        {task.title}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </div>
      {undatedCount > 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">{format(t.tasksPage.noDue, { count: undatedCount })}</p>
      ) : null}
    </div>
  );
}

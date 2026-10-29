import { BookOpenIcon, CheckSquareIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { addDays, daysFrom, formatDate, relativeDay } from "@/lib/date";
import type { Dictionary } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n/config";
import { cn } from "@/lib/utils";
import type { DashboardData } from "@/types/dashboard";
import { EmptyState, Section } from "./section";

const DAYS = 14;

export function Deadlines({
  data,
  t,
  locale,
  className,
  scopeLabel,
}: {
  data: DashboardData;
  t: Dictionary;
  locale: Locale;
  className?: string;
  scopeLabel?: string;
}) {
  const days = Array.from({ length: DAYS }, (_, i) => addDays(data.today, i));
  const byDate = new Map<string, DashboardData["deadlines"]>();
  for (const d of data.deadlines) byDate.set(d.due_date, [...(byDate.get(d.due_date) ?? []), d]);

  return (
    <Section title={t.dashboard.deadlines} subtitle={scopeLabel ? `${t.dashboard.deadlinesRange} · ${scopeLabel}` : t.dashboard.deadlinesRange} className={className}>
      {/* 小型行事曆：今天起 14 天，數字為當天截止項目數 */}
      <div className="grid grid-cols-7 gap-1" aria-hidden>
        {days.map((date, i) => {
          const count = byDate.get(date)?.length ?? 0;
          return (
            <div
              key={date}
              className={cn(
                "flex flex-col items-center rounded-md py-1 text-[11px] leading-tight",
                i === 0 ? "bg-primary/10" : "bg-muted/50",
              )}
            >
              <span className="text-muted-foreground">{formatDate(locale, date, { weekday: "narrow" })}</span>
              <span className={cn("font-medium", i === 0 && "text-primary")}>
                {formatDate(locale, date, { day: "numeric" }).replace(/\D/g, "")}
              </span>
              <span className="flex h-2 items-center gap-0.5">
                {Array.from({ length: Math.min(count, 3) }, (_, k) => (
                  <span key={k} className="size-1 rounded-full bg-foreground/60" />
                ))}
              </span>
            </div>
          );
        })}
      </div>

      {data.deadlines.length === 0 ? (
        <EmptyState>{t.dashboard.deadlinesEmpty}</EmptyState>
      ) : (
        <ol className="mt-4 flex flex-col gap-3">
          {[...byDate.entries()].map(([date, items]) => (
            <li key={date}>
              <div className="mb-1 flex items-baseline gap-2 text-xs">
                <span className="font-semibold">{relativeDay(t, daysFrom(data.today, date))}</span>
                <span className="text-muted-foreground">
                  {formatDate(locale, date, { month: "numeric", day: "numeric", weekday: "short" })}
                </span>
              </div>
              <ul className="flex flex-col gap-1 border-l pl-3">
                {items.map((d) => (
                  <li key={`${d.kind}-${d.id}`} className="flex items-center gap-2 text-sm">
                    {d.kind === "publication" ? (
                      <BookOpenIcon className="size-3.5 shrink-0 text-muted-foreground" aria-label={t.deadlineKind.publication} />
                    ) : (
                      <CheckSquareIcon className="size-3.5 shrink-0 text-muted-foreground" aria-label={t.deadlineKind.task} />
                    )}
                    <span className="min-w-0 flex-1 truncate">{d.title}</span>
                    {d.mine ? <Badge tone="blue">{t.dashboard.mine}</Badge> : null}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      )}
    </Section>
  );
}

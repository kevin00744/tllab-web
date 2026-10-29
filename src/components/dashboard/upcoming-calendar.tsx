import Link from "next/link";

import { chipClass, itemHref } from "@/components/calendar/calendar-style";
import { daysFrom, formatDate, labTimeOf, relativeDay } from "@/lib/date";
import type { Dictionary } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n/config";
import { cn } from "@/lib/utils";
import type { DashboardData } from "@/types/dashboard";
import { EmptyState, Section } from "./section";

/** 未來 7 天的行事曆活動與會議；自己相關的排前面並標示 */
export function UpcomingCalendar({ data, t, locale, className }: { data: DashboardData; t: Dictionary; locale: Locale; className?: string }) {
  const days = new Map<string, DashboardData["upcoming"]>();
  for (const item of data.upcoming) {
    const day = item.start_date < data.today ? data.today : item.start_date;
    days.set(day, [...(days.get(day) ?? []), item]);
  }
  return (
    <Section title={t.dashboard.calendar} subtitle={t.dashboard.calendarRange} href="/calendar" linkLabel={t.dashboard.viewAll} className={className}>
      {data.upcoming.length === 0 ? (
        <EmptyState>{t.dashboard.calendarEmpty}</EmptyState>
      ) : (
        <div className="grid gap-3" data-testid="upcoming-calendar">
          {[...days].map(([day, items]) => (
            <div key={day}>
              <div className="mb-1 text-xs font-medium text-muted-foreground">
                {relativeDay(t, daysFrom(data.today, day))} · {formatDate(locale, day, { month: "numeric", day: "numeric", weekday: "short" })}
              </div>
              <ul className="grid gap-1">
                {[...items]
                  .sort((a, b) => Number(b.mine) - Number(a.mine))
                  .map((item) => (
                    <li key={`${item.kind}-${item.id}`}>
                      <Link
                        href={itemHref(item) ?? `/calendar?date=${item.start_date}`}
                        className="flex items-center gap-2 rounded-md px-1 py-0.5 text-sm hover:bg-accent/50"
                      >
                        <span className={cn("size-2 shrink-0 rounded-full", chipClass(item))} aria-hidden />
                        <span className="w-11 shrink-0 text-xs text-muted-foreground tabular-nums">
                          {item.all_day || !item.starts_at ? t.calendarPage.allDay : labTimeOf(item.starts_at)}
                        </span>
                        <span className="min-w-0 flex-1 truncate">
                          {item.kind === "meeting" ? `${item.emoji} ` : ""}
                          {item.title}
                        </span>
                        {item.mine ? <span className="shrink-0 text-[11px] text-primary">{t.dashboard.mine}</span> : null}
                      </Link>
                    </li>
                  ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

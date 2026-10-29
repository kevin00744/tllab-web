import Link from "next/link";
import { CalendarClockIcon, MapPinIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { daysFrom, formatDateTime, labDateOf, relativeDay } from "@/lib/date";
import type { Dictionary } from "@/lib/i18n";
import { format } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n/config";
import { plainExcerpt } from "@/lib/text";
import type { DashboardData } from "@/types/dashboard";
import { EmptyState, Section } from "./section";

export function Meetings({
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
  const next = data.next_meeting;
  return (
    <Section title={t.dashboard.meetings} href="/meetings" linkLabel={t.dashboard.viewAll} className={className}>
      <div className="mb-4 rounded-lg bg-muted/60 px-4 py-3">
        <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <CalendarClockIcon className="size-3.5" />
          {t.dashboard.nextMeeting}
        </div>
        {next ? (
          <div className="mt-1.5 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <div className="min-w-0">
              <Link href={`/meetings/${next.id}`} className="block truncate text-sm font-medium hover:underline">
                {next.emoji} {next.title}
              </Link>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
                <span>
                  {formatDateTime(locale, next.starts_at, {
                    month: "long",
                    day: "numeric",
                    weekday: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
                {next.location ? (
                  <span className="inline-flex items-center gap-0.5">
                    <MapPinIcon className="size-3" />
                    {next.location}
                  </span>
                ) : null}
              </div>
            </div>
            <span className="text-sm font-semibold">
              {relativeDay(t, daysFrom(data.today, labDateOf(next.starts_at)))}
            </span>
          </div>
        ) : (
          <div className="mt-1 text-sm text-muted-foreground">{t.dashboard.noNextMeeting}</div>
        )}
      </div>

      {data.recent_meetings.length === 0 ? (
        <EmptyState>{t.dashboard.meetingsEmpty}</EmptyState>
      ) : (
        <ul className="flex flex-col gap-4">
          {data.recent_meetings.map((m) => (
            <li key={m.id} className="flex gap-3">
              <div className="w-11 shrink-0 text-center">
                <div className="text-xs text-muted-foreground">
                  {formatDateTime(locale, m.starts_at, { month: "short" })}
                </div>
                <div className="text-lg leading-tight font-semibold">
                  {formatDateTime(locale, m.starts_at, { day: "numeric" }).replace(/\D/g, "")}
                </div>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/meetings/${m.id}`} className="truncate text-sm font-medium hover:underline">
                    {m.title}
                  </Link>
                  <Badge tone="gray">{t.meetingType[m.type]}</Badge>
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  {m.presenters.length > 0 ? `${t.dashboard.presenters}：${m.presenters.join("、")} · ` : ""}
                  {format(t.dashboard.attendees, { count: m.attendee_count })}
                </div>
                {m.summary ? (
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{plainExcerpt(m.summary)}</p>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

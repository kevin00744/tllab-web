import Link from "next/link";
import { FileTextIcon, LinkIcon, ListChecksIcon, MapPinIcon } from "lucide-react";

import { AvatarStack } from "@/components/common/avatar-stack";
import { Badge } from "@/components/ui/badge";
import { formatDateTime, labTimeOf } from "@/lib/date";
import type { Dictionary } from "@/lib/i18n";
import { format } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n/config";
import type { Meeting } from "@/types/entities";

const typeTone = { lab_meeting: "blue", one_on_one: "purple", journal_club: "green" } as const;

export function MeetingList({ meetings, t, locale }: { meetings: Meeting[]; t: Dictionary; locale: Locale }) {
  return (
    <ul className="divide-y rounded-xl border">
      {meetings.map((m) => (
        <li key={m.id}>
          <Link href={`/meetings/${m.id}`} data-meeting-id={m.id} className="flex items-center gap-4 px-4 py-3 hover:bg-accent/40">
            <div className="w-12 shrink-0 text-center">
              <div className="text-xs text-muted-foreground">{formatDateTime(locale, m.starts_at, { month: "short" })}</div>
              <div className="text-lg leading-tight font-semibold">{formatDateTime(locale, m.starts_at, { day: "numeric" }).replace(/\D/g, "")}</div>
              <div className="text-[11px] text-muted-foreground">{formatDateTime(locale, m.starts_at, { weekday: "short" })}</div>
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="min-w-0 truncate font-medium">
                  {m.emoji} {m.title}
                </span>
                <Badge tone={typeTone[m.type]}>{t.meetingType[m.type]}</Badge>
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                <span className="tabular-nums">
                  {labTimeOf(m.starts_at)}
                  {m.ends_at ? `–${labTimeOf(m.ends_at)}` : ""}
                </span>
                {m.location ? (
                  <span className="inline-flex items-center gap-0.5">
                    <MapPinIcon className="size-3" /> {m.location}
                  </span>
                ) : null}
                {m.projects.slice(0, 2).map((p) => (
                  <span key={p.id} className="truncate">
                    {p.emoji} {p.title}
                  </span>
                ))}
              </div>
            </div>
            <div className="hidden shrink-0 items-center gap-3 text-xs text-muted-foreground sm:flex">
              {m.has_notes ? <FileTextIcon className="size-4" aria-label={t.meetingsPage.hasNotes} /> : null}
              {m.links.length ? (
                <span className="inline-flex items-center gap-0.5" title={t.meetingsPage.links}>
                  <LinkIcon className="size-4" />
                  {m.links.length}
                </span>
              ) : null}
              {m.action_total ? (
                <span className="inline-flex items-center gap-1" title={t.meetingsPage.actions}>
                  <ListChecksIcon className="size-4" />
                  {format(t.meetingsPage.openOf, { open: m.action_open, total: m.action_total })}
                </span>
              ) : null}
              {m.attendees.length ? <AvatarStack members={m.attendees} max={4} /> : null}
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

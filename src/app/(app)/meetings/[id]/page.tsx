import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarIcon, ChevronLeftIcon, ExternalLinkIcon, MapPinIcon } from "lucide-react";


import { RecentActivity } from "@/components/activity/recent-activity";
import { MemberAvatar } from "@/components/layout/user-menu";
import { Markdown } from "@/components/markdown";
import { ActionItems } from "@/components/meetings/action-items";
import { MeetingDialog } from "@/components/meetings/meeting-dialog";
import { MeetingNotes } from "@/components/meetings/meeting-notes";
import { Badge } from "@/components/ui/badge";
import { getFormOptions, getMeeting, isUuid } from "@/lib/data";
import { formatDateTime, labDateOf, labTimeOf } from "@/lib/date";
import { getI18n } from "@/lib/i18n/server";
import { linkText } from "@/lib/links";
import { EntityIcon } from "@/components/common/entity-icon";

export async function generateMetadata({ params }: PageProps<"/meetings/[id]">): Promise<Metadata> {
  const { id } = await params;
  const meeting = isUuid(id) ? await getMeeting(id) : null;
  return { title: meeting?.title ?? "Meeting" };
}

export default async function MeetingDetailPage({ params }: PageProps<"/meetings/[id]">) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const [{ locale, t }, meeting, options] = await Promise.all([getI18n(), getMeeting(id), getFormOptions()]);
  if (!meeting) notFound();
  const m = t.meetingsPage;
  const today = labDateOf(new Date().toISOString());

  return (
    <>
      <Link href="/meetings" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeftIcon className="size-4" /> {m.back}
      </Link>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="mb-2 text-4xl leading-none" aria-hidden>
            <EntityIcon value={meeting.emoji} />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">{meeting.title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-muted-foreground">
            <Badge tone="blue">{t.meetingType[meeting.type]}</Badge>
            <span className="inline-flex items-center gap-1">
              <CalendarIcon className="size-3.5" />
              {formatDateTime(locale, meeting.starts_at, { dateStyle: "full" })} {labTimeOf(meeting.starts_at)}
              {meeting.ends_at ? `–${labTimeOf(meeting.ends_at)}` : ""}
            </span>
            {meeting.location ? (
              <span className="inline-flex items-center gap-1">
                <MapPinIcon className="size-3.5" /> {meeting.location}
              </span>
            ) : null}
          </div>
        </div>
        {meeting.editable ? <MeetingDialog meeting={meeting} options={options} today={today} /> : null}
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="grid min-w-0 gap-8">
          <section aria-labelledby="mt-notes">
            <h2 id="mt-notes" className="mb-2 text-base font-semibold">
              {m.notes}
            </h2>
            <MeetingNotes id={meeting.id} content={meeting.summary} version={meeting.summary_version} editable={meeting.editable} />
          </section>
          <section aria-labelledby="mt-decisions">
            <h2 id="mt-decisions" className="mb-2 text-base font-semibold">
              {m.decisions}
            </h2>
            {meeting.decisions ? <Markdown>{meeting.decisions}</Markdown> : <p className="text-sm text-muted-foreground">{m.noDecisions}</p>}
          </section>
          <section aria-labelledby="mt-actions">
            <h2 id="mt-actions" className="mb-3 text-base font-semibold">
              {m.actions}{" "}
              <span className="text-sm font-normal text-muted-foreground">
                {meeting.action_open}/{meeting.action_total}
              </span>
            </h2>
            <ActionItems meetingId={meeting.id} items={meeting.action_items} canAdd={meeting.editable} members={options.members} today={today} />
          </section>
        </div>
        <aside className="grid gap-4">
          {meeting.links.length ? (
            <section className="rounded-xl border px-4 py-3" aria-labelledby="mt-links">
              <h2 id="mt-links" className="mb-2 text-sm font-semibold">
                {m.links}
              </h2>
              <ul className="grid gap-1.5 text-sm" data-testid="meeting-links">
                {meeting.links.map((l, i) => (
                  <li key={i}>
                    <a href={l.url} target="_blank" rel="noreferrer noopener" className="inline-flex max-w-full items-center gap-1.5 text-primary hover:underline">
                      <ExternalLinkIcon className="size-3.5 shrink-0" />
                      <span className="truncate">{linkText(l)}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          <section className="rounded-xl border px-4 py-3">
            <h2 className="mb-2 text-sm font-semibold">
              {m.attendees} <span className="font-normal text-muted-foreground">{meeting.attendees.length}</span>
            </h2>
            {meeting.attendees.length ? (
              <ul className="grid gap-1.5 text-sm">
                {meeting.attendees.map((a) => (
                  <li key={a.id} className="flex items-center gap-2">
                    <MemberAvatar member={a} className="size-6" />
                    <Link href={`/members/${a.id}`} className="min-w-0 flex-1 truncate hover:underline">
                      {a.name}
                    </Link>
                    {a.is_presenter ? <Badge tone="purple">{m.presenter}</Badge> : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">—</p>
            )}
          </section>
          <section className="rounded-xl border px-4 py-3">
            <h2 className="mb-2 text-sm font-semibold">{m.projects}</h2>
            {meeting.projects.length ? (
              <ul className="grid gap-1.5 text-sm">
                {meeting.projects.map((p) => (
                  <li key={p.id}>
                    <Link href={`/projects/${p.id}`} className="hover:underline">
                      <EntityIcon value={p.emoji} /> {p.title}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">—</p>
            )}
          </section>
        </aside>
      </div>
      <RecentActivity type="meeting" id={meeting.id} t={t} locale={locale} />
    </>
  );
}

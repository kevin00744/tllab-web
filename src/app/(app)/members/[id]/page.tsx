import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeftIcon, ExternalLinkIcon, MailIcon } from "lucide-react";

import { EmptyBlock } from "@/components/common/field";
import { MemberAvatar } from "@/components/layout/user-menu";
import { Markdown } from "@/components/markdown";
import { MemberAdmin } from "@/components/members/member-admin";
import { MemberDialog } from "@/components/members/member-dialog";
import { PublicationProvider } from "@/components/publications/publication-provider";
import { PublicationsTable } from "@/components/publications/publication-views";
import { TaskProvider } from "@/components/tasks/task-provider";
import { TasksList } from "@/components/tasks/tasks-list";
import { Badge } from "@/components/ui/badge";
import { getCurrentMember } from "@/lib/auth";
import { getFormOptions, getMember, isUuid } from "@/lib/data";
import { labDateOf } from "@/lib/date";
import { format } from "@/lib/i18n";
import { getI18n } from "@/lib/i18n/server";
import { projectStatusTone, roleLabel, roleTone, statusLabel } from "@/lib/status";

export async function generateMetadata({ params }: PageProps<"/members/[id]">): Promise<Metadata> {
  const { id } = await params;
  const member = isUuid(id) ? await getMember(id) : null;
  return { title: member?.name ?? "Member" };
}

export default async function MemberDetailPage({ params }: PageProps<"/members/[id]">) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const [{ t }, me, options, member] = await Promise.all([getI18n(), getCurrentMember(), getFormOptions(), getMember(id)]);
  if (!member) notFound();
  const isAdmin = me?.app_role === "admin";
  const today = labDateOf(new Date().toISOString());
  const years = member.is_alumni
    ? [member.join_year, member.left_year].filter(Boolean).join("–")
    : member.join_year
      ? format(t.membersPage.joined, { year: member.join_year })
      : null;

  return (
    <TaskProvider options={options} defaults={{ assignee_ids: [member.id] }}>
      <Link href="/members" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeftIcon className="size-4" /> {t.membersPage.back}
      </Link>

      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <MemberAvatar member={member} className="size-20 text-2xl" />
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight">
              {member.name}
              {member.name_en && member.name_en !== member.name ? (
                <span className="ml-2 text-base font-normal text-muted-foreground">{member.name_en}</span>
              ) : null}
            </h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-sm">
              <Badge tone={member.is_alumni ? "gray" : member.position === "pi" ? "purple" : "blue"}>
                {member.is_alumni ? `${t.membersPage.alumni} · ` : ""}
                {t.positions[member.position]}
              </Badge>
              {isAdmin ? <Badge tone={roleTone[member.app_role]}>{roleLabel(t, member)}</Badge> : null}
              {years ? <span className="text-xs text-muted-foreground">{years}</span> : null}
              {member.is_alumni && member.current_affiliation ? (
                <span className="text-xs text-muted-foreground">· {member.current_affiliation}</span>
              ) : null}
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
              {member.email ? (
                <a href={`mailto:${member.email}`} className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground">
                  <MailIcon className="size-3.5" /> {member.email}
                </a>
              ) : null}
              {member.links.map((l) => (
                <a
                  key={l.url}
                  href={l.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex items-center gap-1 text-primary hover:underline"
                >
                  <ExternalLinkIcon className="size-3.5" /> {l.label || l.url.replace(/^https?:\/\//i, "")}
                </a>
              ))}
            </div>
          </div>
        </div>
        <MemberDialog member={member} isAdmin={isAdmin} />
      </div>

      {member.is_me ? <p className="mb-4 text-sm text-muted-foreground">{t.membersPage.profileHint}</p> : null}

      <div className="mb-8 grid items-start gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="min-w-0">
          {member.research_interests.length ? (
            <div className="mb-4 flex flex-wrap gap-1.5" aria-label={t.membersPage.interests}>
              {member.research_interests.map((r) => (
                <Badge key={r} tone="outline" className="font-normal">
                  {r}
                </Badge>
              ))}
            </div>
          ) : null}
          <h2 className="mb-2 text-base font-semibold">{t.membersPage.bio}</h2>
          {member.bio ? <Markdown>{member.bio}</Markdown> : <p className="text-sm text-muted-foreground">{t.membersPage.noBio}</p>}
        </div>
        <div className="grid gap-4">
          <section className="rounded-xl border px-4 py-3">
            <h2 className="mb-2 text-sm font-semibold">
              {t.membersPage.projects} <span className="font-normal text-muted-foreground">{member.projects.length}</span>
            </h2>
            {member.projects.length ? (
              <ul className="grid gap-1.5 text-sm">
                {member.projects.map((p) => (
                  <li key={p.id} className="flex items-center gap-2">
                    <Link href={`/projects/${p.id}`} className="min-w-0 flex-1 truncate hover:underline">
                      {p.emoji} {p.title}
                    </Link>
                    {p.is_owner ? <span className="text-[11px] text-muted-foreground">{t.membersPage.owner}</span> : null}
                    <Badge tone={projectStatusTone[p.status]}>{statusLabel(t, "project", p.status)}</Badge>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">{t.membersPage.noProjects}</p>
            )}
          </section>
          {isAdmin ? <MemberAdmin member={member} /> : null}
        </div>
      </div>

      <section className="mb-8">
        <h2 className="mb-3 text-base font-semibold">
          {t.membersPage.openTasks} <span className="text-sm font-normal text-muted-foreground">{member.tasks.length}</span>
        </h2>
        {member.tasks.length ? <TasksList tasks={member.tasks} today={today} /> : <EmptyBlock>{t.membersPage.noTasks}</EmptyBlock>}
      </section>

      <section>
        <h2 className="mb-3 text-base font-semibold">
          {t.membersPage.publications} <span className="text-sm font-normal text-muted-foreground">{member.publications.length}</span>
        </h2>
        {member.publications.length ? (
          <PublicationProvider options={options}>
            <PublicationsTable publications={member.publications} today={today} />
          </PublicationProvider>
        ) : (
          <EmptyBlock>{t.membersPage.noPublications}</EmptyBlock>
        )}
      </section>
    </TaskProvider>
  );
}

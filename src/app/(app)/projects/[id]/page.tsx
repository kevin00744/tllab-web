import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeftIcon } from "lucide-react";

import { RecentActivity } from "@/components/activity/recent-activity";
import { AvatarStack } from "@/components/common/avatar-stack";
import { EmptyBlock } from "@/components/common/field";
import { ProjectDialog } from "@/components/projects/project-dialog";
import { ProjectDoc } from "@/components/projects/project-doc";
import { ProjectFiles } from "@/components/projects/project-files";
import { ProgressMeter } from "@/components/projects/project-views";
import { PublicationProvider } from "@/components/publications/publication-provider";
import { PublicationsTable } from "@/components/publications/publication-views";
import { NewTaskButton, TaskProvider } from "@/components/tasks/task-provider";
import { TasksList } from "@/components/tasks/tasks-list";
import { Badge } from "@/components/ui/badge";
import { getUserId } from "@/lib/auth";
import { getFormOptions, getProject, isUuid } from "@/lib/data";
import { formatDate, formatDateTime, labDateOf } from "@/lib/date";
import { format } from "@/lib/i18n";
import { getI18n } from "@/lib/i18n/server";
import { projectStatusTone, statusLabel } from "@/lib/status";

export async function generateMetadata({ params }: PageProps<"/projects/[id]">): Promise<Metadata> {
  const { id } = await params;
  const project = isUuid(id) ? await getProject(id) : null;
  return { title: project?.title ?? "Project" };
}

function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[6rem_1fr] items-center gap-2 py-1 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="min-w-0">{children}</span>
    </div>
  );
}

export default async function ProjectDetailPage({ params }: PageProps<"/projects/[id]">) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const [{ locale, t }, options, project, signedIn] = await Promise.all([getI18n(), getFormOptions(), getProject(id), getUserId()]);
  if (!project) notFound();
  const today = labDateOf(new Date().toISOString());

  return (
    <TaskProvider options={options} defaults={{ project_id: project.id }}>
      <Link href="/projects" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeftIcon className="size-4" /> {t.projectsPage.back}
      </Link>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="mb-2 text-4xl leading-none" aria-hidden>
            {project.emoji}
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">{project.title}</h1>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Badge tone={projectStatusTone[project.status]}>{statusLabel(t, "project", project.status)}</Badge>
            {project.tags.map((tag) => (
              <Badge key={tag} tone="outline" className="font-normal">
                {tag}
              </Badge>
            ))}
          </div>
        </div>
        <ProjectDialog project={project} options={options} />
      </div>

      <div className="mb-8 grid items-start gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="min-w-0">
          {project.description ? (
            <p className="mb-4 text-sm leading-relaxed whitespace-pre-wrap text-muted-foreground">{project.description}</p>
          ) : null}
          <ProjectDoc
            projectId={project.id}
            content={project.content}
            version={project.content_version}
            editable={project.editable}
          />
        </div>
        <div className="rounded-xl border px-4 py-3">
          <Info label={t.fields.owner}>{project.owner?.name ?? "—"}</Info>
          <Info label={t.fields.members}>
            {project.members.length ? (
              <span className="flex items-center gap-2">
                <AvatarStack members={project.members} max={5} />
                <span className="truncate text-xs text-muted-foreground">{project.members.map((m) => m.name).join("、")}</span>
              </span>
            ) : (
              "—"
            )}
          </Info>
          <Info label={t.fields.startDate}>{project.start_date ? formatDate(locale, project.start_date, { dateStyle: "medium" }) : "—"}</Info>
          <Info label={t.fields.targetDate}>{project.due_date ? formatDate(locale, project.due_date, { dateStyle: "medium" }) : "—"}</Info>
          <Info label={t.fields.progress}>
            <ProgressMeter value={project.progress} label={project.title} />
          </Info>
          {project.task_total ? (
            <p className="pt-1 text-xs text-muted-foreground">
              {format(t.projectsPage.taskProgress, { value: Math.round((project.task_done / project.task_total) * 100) })}（
              {project.task_done}/{project.task_total}）
            </p>
          ) : null}
        </div>
      </div>

      {/* 附件（進度報告投影片等）只給登入成員 */}
      {signedIn ? <ProjectFiles projectId={project.id} files={project.files} editable={project.editable} /> : null}

      <section className="mb-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold">
            {t.projectsPage.tasks} <span className="text-sm font-normal text-muted-foreground">{project.tasks.length}</span>
          </h2>
          <NewTaskButton size="sm" />
        </div>
        {project.tasks.length ? (
          <TasksList tasks={project.tasks} today={today} showProject={false} />
        ) : (
          <EmptyBlock>{t.projectsPage.noTasks}</EmptyBlock>
        )}
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-base font-semibold">
          {t.projectsPage.publications}{" "}
          <span className="text-sm font-normal text-muted-foreground">{project.publications.length}</span>
        </h2>
        {project.publications.length ? (
          <PublicationProvider options={options} defaults={{ project_id: project.id }}>
            <PublicationsTable publications={project.publications} showProject={false} today={today} />
          </PublicationProvider>
        ) : (
          <EmptyBlock>{t.projectsPage.noPublications}</EmptyBlock>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-base font-semibold">
          {t.projectsPage.meetings} <span className="text-sm font-normal text-muted-foreground">{project.meetings.length}</span>
        </h2>
        {project.meetings.length ? (
          <ul className="divide-y rounded-xl border">
            {project.meetings.map((m) => (
              <li key={m.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <span className="w-24 shrink-0 text-xs text-muted-foreground">
                  {formatDateTime(locale, m.starts_at, { dateStyle: "medium" })}
                </span>
                <Link href={`/meetings/${m.id}`} className="min-w-0 flex-1 truncate hover:underline">
                  {m.emoji} {m.title}
                </Link>
                <Badge tone="gray">{t.meetingType[m.type]}</Badge>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyBlock>{t.projectsPage.noMeetings}</EmptyBlock>
        )}
      </section>
      <RecentActivity type="project" id={project.id} t={t} locale={locale} />
    </TaskProvider>
  );
}

import type { Metadata } from "next";
import { GanttChartIcon, KanbanSquareIcon, TableIcon } from "lucide-react";

import { FilterBar, FilterSelect, SearchBox } from "@/components/common/filters";
import { ViewTabs } from "@/components/common/view-tabs";
import { ManageButton } from "@/components/admin/manage-button";
import { PageHeader } from "@/components/page-header";
import { ProjectDialog } from "@/components/projects/project-dialog";
import { ProjectsBoard, ProjectsTable, ProjectsTimeline } from "@/components/projects/project-views";
import { getFormOptions, getMySettings, isUuid, listProjects } from "@/lib/data";
import { labDateOf } from "@/lib/date";
import { getI18n } from "@/lib/i18n/server";
import { getPageMeta } from "@/lib/pages";
import { statusLabel } from "@/lib/status";
import { HideDoneToggle } from "@/components/common/hide-done-toggle";
import { getUserId } from "@/lib/auth";

export async function generateMetadata(): Promise<Metadata> {
  const { locale, t } = await getI18n();
  return { title: (await getPageMeta("projects", locale, t)).title };
}

const VIEWS = ["table", "board", "timeline"] as const;
const STATUSES = ["planning", "active", "paused", "completed"] as const;

export default async function ProjectsPage({ searchParams }: PageProps<"/projects">) {
  const sp = await searchParams;
  const str = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const view = VIEWS.find((v) => v === str("view")) ?? "table";
  const status = STATUSES.find((s) => s === str("status"));
  const member = isUuid(str("member")) ? str("member") : undefined;

  const [{ locale, t }, options, all, settings, signedIn] = await Promise.all([
    getI18n(),
    getFormOptions(),
    listProjects({ status, member_id: member, q: str("q") }),
    getMySettings(),
    getUserId(),
  ]);
  // 隱藏已完成（個人設定）；明確篩選「完成」狀態時仍顯示
  const hideDone = !!settings.hide_done_projects && status !== "completed";
  const projects = hideDone ? all.filter((p) => p.status !== "completed") : all;
  const meta = await getPageMeta("projects", locale, t);
  const today = labDateOf(new Date().toISOString());

  return (
    <>
      <PageHeader emoji={meta.emoji} title={meta.title} actions={
          <>
            <ManageButton entity="project" />
            <ProjectDialog project={null} options={options} />
          </>
        } />
      <FilterBar>
        <ViewTabs
          current={view}
          views={[
            { value: "table", label: t.views.table, icon: <TableIcon /> },
            { value: "board", label: t.views.board, icon: <KanbanSquareIcon /> },
            { value: "timeline", label: t.views.timeline, icon: <GanttChartIcon /> },
          ]}
        />
        {view !== "board" ? (
          <FilterSelect
            param="status"
            label={`${t.fields.status}：${t.common.all}`}
            options={STATUSES.map((s) => ({ value: s, label: statusLabel(t, "project", s) }))}
          />
        ) : null}
        <FilterSelect
          param="member"
          label={`${t.fields.members}：${t.common.all}`}
          options={options.members.filter((m) => !m.is_alumni).map((m) => ({ value: m.id, label: m.name }))}
        />
        {signedIn ? <HideDoneToggle setting="hide_done_projects" value={!!settings.hide_done_projects} /> : null}
        <SearchBox placeholder={t.common.search} className="w-full sm:ml-auto sm:w-56" />
      </FilterBar>
      {view === "table" ? (
        <ProjectsTable projects={projects} t={t} locale={locale} />
      ) : view === "board" ? (
        <ProjectsBoard projects={projects} t={t} locale={locale} />
      ) : (
        <ProjectsTimeline projects={projects} t={t} locale={locale} today={today} />
      )}
    </>
  );
}

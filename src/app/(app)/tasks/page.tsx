import type { Metadata } from "next";
import { CalendarDaysIcon, KanbanSquareIcon, ListIcon } from "lucide-react";

import { FilterBar, FilterSelect, SearchBox } from "@/components/common/filters";
import { ViewTabs } from "@/components/common/view-tabs";
import { ManageButton } from "@/components/admin/manage-button";
import { PageHeader } from "@/components/page-header";
import { NewTaskButton, OpenTaskOnLoad, TaskProvider } from "@/components/tasks/task-provider";
import { TasksBoard } from "@/components/tasks/tasks-board";
import { TasksCalendar } from "@/components/tasks/tasks-calendar";
import { TasksList } from "@/components/tasks/tasks-list";
import { getFormOptions, getMySettings, isUuid, listTasks } from "@/lib/data";
import { labDateOf } from "@/lib/date";
import { getI18n } from "@/lib/i18n/server";
import { getPageMeta } from "@/lib/pages";
import { iconText } from "@/lib/icon";
import { HideDoneToggle } from "@/components/common/hide-done-toggle";
import { getUserId } from "@/lib/auth";

export async function generateMetadata(): Promise<Metadata> {
  const { locale, t } = await getI18n();
  return { title: (await getPageMeta("tasks", locale, t)).title };
}

const VIEWS = ["board", "list", "calendar"] as const;
const FILTERS = ["all", "mine", "overdue"] as const;

export default async function TasksPage({ searchParams }: PageProps<"/tasks">) {
  const sp = await searchParams;
  const str = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const view = VIEWS.find((v) => v === str("view")) ?? "board";
  const filter = FILTERS.find((f) => f === str("filter")) ?? "all";
  const project = isUuid(str("project")) ? str("project") : undefined;
  const member = isUuid(str("member")) ? str("member") : undefined;
  const today = labDateOf(new Date().toISOString());
  const month = /^\d{4}-\d{2}$/.test(str("month") ?? "") ? str("month")! : today.slice(0, 7);

  const [{ locale, t }, options, all, settings, signedIn] = await Promise.all([
    getI18n(),
    getFormOptions(),
    listTasks({
      mine: filter === "mine" || undefined,
      overdue: filter === "overdue" || undefined,
      project_id: project,
      member_id: member,
      q: str("q"),
    }),
    getMySettings(),
    getUserId(),
  ]);
  // 隱藏已完成（個人設定）
  const tasks = settings.hide_done_tasks ? all.filter((x) => x.status !== "done") : all;
  const meta = await getPageMeta("tasks", locale, t);

  return (
    <TaskProvider options={options} defaults={{ project_id: project }}>
      <OpenTaskOnLoad task={tasks.find((x) => x.id === str("task")) ?? null} />
      <PageHeader emoji={meta.emoji} title={meta.title} actions={
          <>
            <ManageButton entity="task" />
            <NewTaskButton />
          </>
        } />
      <FilterBar>
        <ViewTabs
          current={view}
          views={[
            { value: "board", label: t.views.board, icon: <KanbanSquareIcon /> },
            { value: "list", label: t.views.list, icon: <ListIcon /> },
            { value: "calendar", label: t.views.calendar, icon: <CalendarDaysIcon /> },
          ]}
        />
        <ViewTabs
          param="filter"
          label={t.fields.status}
          current={filter}
          views={[
            { value: "all", label: t.tasksPage.filterAll },
            { value: "mine", label: t.tasksPage.filterMine },
            { value: "overdue", label: t.tasksPage.filterOverdue },
          ]}
        />
        <FilterSelect
          param="project"
          label={t.tasksPage.anyProject}
          options={options.projects.map((p) => ({ value: p.id, label: `${iconText(p.emoji)} ${p.title}` }))}
        />
        <FilterSelect
          param="member"
          label={t.tasksPage.anyMember}
          options={options.members.filter((m) => !m.is_alumni).map((m) => ({ value: m.id, label: m.name }))}
        />
        {signedIn ? <HideDoneToggle setting="hide_done_tasks" value={!!settings.hide_done_tasks} /> : null}
        <SearchBox placeholder={t.common.search} className="w-full sm:ml-auto sm:w-56" />
      </FilterBar>

      {view === "board" ? (
        <TasksBoard tasks={tasks} today={today} />
      ) : view === "list" ? (
        <TasksList tasks={tasks} today={today} />
      ) : (
        <TasksCalendar
          tasks={tasks}
          month={month}
          today={today}
          undatedCount={tasks.filter((x) => !x.due_date).length}
        />
      )}
    </TaskProvider>
  );
}

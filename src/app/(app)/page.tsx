import { CustomizeDashboard } from "@/components/dashboard/customize-dashboard";
import { Deadlines } from "@/components/dashboard/deadlines";
import { KpiRow } from "@/components/dashboard/kpi-row";
import { Meetings } from "@/components/dashboard/meetings";
import { MyTasks } from "@/components/dashboard/my-tasks";
import { ProjectProgress } from "@/components/dashboard/project-progress";
import { PublicationPipeline } from "@/components/dashboard/publication-pipeline";
import { QuickLinks } from "@/components/dashboard/quick-links";
import { UpcomingCalendar } from "@/components/dashboard/upcoming-calendar";
import { MessageBoard } from "@/components/board/message-board";
import { Section } from "@/components/dashboard/section";
import { PageHeader } from "@/components/page-header";
import { boardOptions, getFormOptions, listBoardThreads } from "@/lib/data";
import { getCurrentMember } from "@/lib/auth";
import { normalizePrefs, scoped, type SectionKey } from "@/lib/dashboard-prefs";
import { formatDate } from "@/lib/date";
import { format } from "@/lib/i18n";
import { getI18n } from "@/lib/i18n/server";
import { getPageMetas } from "@/lib/pages";
import { createClient } from "@/lib/supabase/server";
import type { DashboardData } from "@/types/dashboard";
import { primaryName } from "@/lib/names";

// 訪客看不到個人化與會議／行事曆區塊
const GUEST_HIDDEN_SECTIONS: SectionKey[] = ["board", "my_tasks", "meetings", "calendar"];

// 寬區塊佔 3 欄、窄區塊佔 2 欄（lg 以上 5 欄格線，grid-flow-dense 自動補位）
const SPAN: Record<SectionKey, string> = {
  kpis: "lg:col-span-5",
  board: "lg:col-span-3",
  my_tasks: "lg:col-span-3",
  projects: "lg:col-span-3",
  meetings: "lg:col-span-3",
  deadlines: "lg:col-span-2",
  calendar: "lg:col-span-2",
  publications: "lg:col-span-2",
  quick_links: "lg:col-span-2",
};

export default async function DashboardPage() {
  const supabase = await createClient();
  const [{ locale, t }, member, { data, error }] = await Promise.all([
    getI18n(),
    getCurrentMember(),
    supabase.rpc("get_dashboard", { p_days: 14 }),
  ]);
  const metas = await getPageMetas(locale, t);
  const dashboard = data as DashboardData | null;
  // 留言板只給登入成員
  const [board, options] = member ? await Promise.all([listBoardThreads({ limit: 10 }), getFormOptions()]) : [[], null];

  if (error) console.error("get_dashboard failed", error);

  const guest = !member;
  const prefs = normalizePrefs(dashboard?.prefs);
  const projects = dashboard ? scoped(dashboard.projects, prefs.scope.projects) : null;
  const deadlines = dashboard ? scoped(dashboard.deadlines, prefs.scope.deadlines) : null;

  const sections = dashboard
    ? prefs.order
        .filter((key) => !prefs.hidden.includes(key) && !(guest && GUEST_HIDDEN_SECTIONS.includes(key)))
        .map((key) => {
          const cls = SPAN[key];
          switch (key) {
            case "kpis":
              return { key, empty: false, node: <KpiRow kpis={dashboard.kpis} t={t} /> };
            case "board":
              // 沒有留言時也顯示，才能寫第一則
              return {
                key,
                empty: false,
                node: (
                  <Section title={t.board.title} subtitle={t.board.subtitle} className={cls}>
                    <MessageBoard initial={board} options={boardOptions(options!)} />
                  </Section>
                ),
              };
            case "my_tasks":
              return { key, empty: dashboard.my_open === 0, node: <MyTasks data={dashboard} t={t} locale={locale} className={cls} /> };
            case "deadlines":
              return {
                key,
                empty: deadlines!.items.length === 0,
                node: (
                  <Deadlines
                    data={{ ...dashboard, deadlines: deadlines!.items }}
                    t={t}
                    locale={locale}
                    className={cls}
                    scopeLabel={deadlines!.mineOnly ? t.dashboard.onlyMine : undefined}
                  />
                ),
              };
            case "projects":
              return {
                key,
                empty: projects!.items.length === 0,
                node: (
                  <ProjectProgress
                    data={{ ...dashboard, projects: projects!.items.slice(0, 8) }}
                    t={t}
                    locale={locale}
                    className={cls}
                    subtitle={projects!.mineOnly ? t.dashboard.onlyMine : undefined}
                  />
                ),
              };
            case "calendar":
              return { key, empty: dashboard.upcoming.length === 0, node: <UpcomingCalendar data={dashboard} t={t} locale={locale} className={cls} /> };
            case "publications":
              return {
                key,
                empty: dashboard.publication_stages.every((s) => s.total === 0),
                node: <PublicationPipeline stages={dashboard.publication_stages} className={cls} />,
              };
            case "meetings":
              return {
                key,
                empty: !dashboard.next_meeting && dashboard.recent_meetings.length === 0,
                node: <Meetings data={dashboard} t={t} locale={locale} className={cls} />,
              };
            case "quick_links":
              return { key, empty: false, node: <QuickLinks metas={metas} t={t} className={cls} /> };
          }
        })
        .filter((s) => !(prefs.hide_empty && s.empty))
    : [];

  return (
    <>
      <PageHeader
        emoji={metas.get("dashboard")!.emoji}
        title={member ? format(t.dashboard.welcome, { name: primaryName(member, locale) }) : t.guest.welcome}
        description={
          <>
            {dashboard ? (
              <span>{format(t.dashboard.today, { date: formatDate(locale, dashboard.today, { dateStyle: "full" }) })}</span>
            ) : null}
            <span className="mx-2">·</span>
            <span>
              {t.app.lab} — {t.app.intro}
            </span>
          </>
        }
        actions={dashboard && !guest ? <CustomizeDashboard prefs={prefs} /> : null}
      />

      {guest ? (
        <p className="mb-4 rounded-lg border bg-muted/40 px-4 py-2.5 text-sm text-muted-foreground" data-testid="guest-note">
          {t.guest.note}
        </p>
      ) : null}

      {!dashboard ? (
        <div role="alert" className="rounded-xl border bg-status-red-bg px-5 py-4 text-sm text-status-red-fg">
          {t.dashboard.loadError}
        </div>
      ) : sections.length === 0 ? (
        <div className="rounded-xl border border-dashed px-6 py-12 text-center text-sm text-muted-foreground">{t.dashboard.nothingToShow}</div>
      ) : (
        <div className="grid grid-cols-1 items-start gap-4 lg:grid-flow-dense lg:grid-cols-5">
          {sections.map((s) =>
            s.key === "kpis" ? (
              <div key={s.key} className={SPAN.kpis} data-section={s.key}>
                {s.node}
              </div>
            ) : (
              <div key={s.key} className="contents" data-section={s.key}>
                {s.node}
              </div>
            ),
          )}
        </div>
      )}
    </>
  );
}

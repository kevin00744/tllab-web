import { Deadlines } from "@/components/dashboard/deadlines";
import { KpiRow } from "@/components/dashboard/kpi-row";
import { Meetings } from "@/components/dashboard/meetings";
import { MyTasks } from "@/components/dashboard/my-tasks";
import { ProjectProgress } from "@/components/dashboard/project-progress";
import { PublicationPipeline } from "@/components/dashboard/publication-pipeline";
import { QuickLinks } from "@/components/dashboard/quick-links";
import { PageHeader } from "@/components/page-header";
import { getCurrentMember } from "@/lib/auth";
import { formatDate } from "@/lib/date";
import { format } from "@/lib/i18n";
import { getI18n } from "@/lib/i18n/server";
import { getPageMetas } from "@/lib/pages";
import { createClient } from "@/lib/supabase/server";
import type { DashboardData } from "@/types/dashboard";

export default async function DashboardPage() {
  const supabase = await createClient();
  const [{ locale, t }, member, { data, error }] = await Promise.all([
    getI18n(),
    getCurrentMember(),
    supabase.rpc("get_dashboard", { p_days: 14 }),
  ]);
  const metas = await getPageMetas(locale, t);
  const dashboard = data as DashboardData | null;

  if (error) console.error("get_dashboard failed", error);

  return (
    <>
      <PageHeader
        emoji={metas.get("dashboard")!.emoji}
        title={format(t.dashboard.welcome, { name: member?.name ?? "" })}
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
      />

      {!dashboard ? (
        <div role="alert" className="rounded-xl border bg-status-red-bg px-5 py-4 text-sm text-status-red-fg">
          {t.dashboard.loadError}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <KpiRow kpis={dashboard.kpis} t={t} />
          <div className="grid items-start gap-4 lg:grid-cols-5">
            <MyTasks data={dashboard} t={t} locale={locale} className="lg:col-span-3" />
            <Deadlines data={dashboard} t={t} locale={locale} className="lg:col-span-2" />
            <ProjectProgress data={dashboard} t={t} locale={locale} className="lg:col-span-3" />
            <PublicationPipeline stages={dashboard.publication_stages} className="lg:col-span-2" />
            <Meetings data={dashboard} t={t} locale={locale} className="lg:col-span-3" />
            <QuickLinks metas={metas} t={t} className="lg:col-span-2" />
          </div>
        </div>
      )}
    </>
  );
}

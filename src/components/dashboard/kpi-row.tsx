import Link from "next/link";
import { AlertTriangleIcon, CheckCircle2Icon } from "lucide-react";

import type { Dictionary } from "@/lib/i18n";
import { format } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { DashboardData } from "@/types/dashboard";

function Tile({
  href,
  label,
  value,
  footer,
}: {
  href: string;
  label: string;
  value: number;
  footer?: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="group flex flex-col justify-between gap-2 rounded-xl border bg-card px-4 py-3.5 transition-colors hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-3xl leading-none font-semibold">{value.toLocaleString()}</span>
      {footer ? <span className="text-xs text-muted-foreground">{footer}</span> : <span className="h-4" />}
    </Link>
  );
}

export function KpiRow({ kpis, t }: { kpis: DashboardData["kpis"]; t: Dictionary }) {
  const overdue = kpis.tasks_overdue;
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Tile href="/projects" label={t.dashboard.kpi.activeProjects} value={kpis.active_projects} />
      <Tile href="/tasks" label={t.dashboard.kpi.dueThisWeek} value={kpis.tasks_due_this_week} />
      <Tile
        href="/tasks"
        label={t.dashboard.kpi.overdue}
        value={overdue}
        footer={
          // 狀態一律「圖示＋文字」，不只靠顏色
          <span className={cn("inline-flex items-center gap-1", overdue > 0 ? "text-status-red-fg" : "text-status-green-fg")}>
            {overdue > 0 ? <AlertTriangleIcon className="size-3.5" /> : <CheckCircle2Icon className="size-3.5" />}
            {overdue > 0 ? t.dashboard.kpi.needsAttention : t.dashboard.kpi.allClear}
          </span>
        }
      />
      <Tile
        href="/publications"
        label={t.dashboard.kpi.publications}
        value={kpis.publications_published_this_year}
        footer={format(t.dashboard.kpi.underSubmission, { count: kpis.publications_under_submission })}
      />
    </div>
  );
}

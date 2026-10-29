import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/date";
import type { Dictionary } from "@/lib/i18n";
import { format } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n/config";
import { projectStatusTone, statusLabel } from "@/lib/status";
import type { DashboardData } from "@/types/dashboard";
import { EmptyState, Section } from "./section";

export function ProjectProgress({
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
  return (
    <Section title={t.dashboard.projects} href="/projects" linkLabel={t.dashboard.viewAll} className={className}>
      {data.projects.length === 0 ? (
        <EmptyState>{t.dashboard.projectsEmpty}</EmptyState>
      ) : (
        <ul className="flex flex-col gap-4">
          {data.projects.map((p) => (
            <li key={p.id}>
              <div className="flex items-center gap-2">
                <span aria-hidden>{p.emoji}</span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{p.title}</span>
                <Badge tone={projectStatusTone[p.status]}>{statusLabel(t, "project", p.status)}</Badge>
              </div>
              {/* Meter：同色相的淺色軌道＋實心填滿，數值直接標示 */}
              <div className="mt-2 flex items-center gap-3">
                <div
                  className="h-1.5 flex-1 overflow-hidden rounded-full bg-primary/15"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={p.progress}
                  aria-label={p.title}
                >
                  <div className="h-full rounded-full bg-primary" style={{ width: `${p.progress}%` }} />
                </div>
                <span className="w-9 text-right text-xs font-medium tabular-nums">{p.progress}%</span>
              </div>
              <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                {p.owner_name ? (
                  <span>
                    {t.dashboard.owner}：{p.owner_name}
                  </span>
                ) : null}
                {p.task_total > 0 ? (
                  <span>{format(t.dashboard.tasksDone, { done: p.task_done, total: p.task_total })}</span>
                ) : null}
                {p.due_date ? <span>→ {formatDate(locale, p.due_date, { dateStyle: "medium" })}</span> : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

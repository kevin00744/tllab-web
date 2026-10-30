import Link from "next/link";

import { AvatarStack } from "@/components/common/avatar-stack";
import { EmptyBlock } from "@/components/common/field";
import { Badge } from "@/components/ui/badge";
import { addDays, daysFrom, formatDate } from "@/lib/date";
import type { Dictionary } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n/config";
import { projectStatusTone, statusLabel } from "@/lib/status";
import { cn } from "@/lib/utils";
import type { ProjectStatus } from "@/types/db";
import type { Project } from "@/types/entities";
import { EntityIcon } from "@/components/common/entity-icon";

type Props = { projects: Project[]; t: Dictionary; locale: Locale };

export function ProgressMeter({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <div
        className="h-1.5 flex-1 overflow-hidden rounded-full bg-primary/15"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={value}
        aria-label={label}
      >
        <div className="h-full rounded-full bg-primary" style={{ width: `${value}%` }} />
      </div>
      <span className="w-9 text-right text-xs tabular-nums">{value}%</span>
    </div>
  );
}

const range = (t: Dictionary, locale: Locale, p: Project) =>
  [p.start_date, p.due_date].some(Boolean)
    ? `${p.start_date ? formatDate(locale, p.start_date, { dateStyle: "medium" }) : "…"} → ${
        p.due_date ? formatDate(locale, p.due_date, { dateStyle: "medium" }) : "…"
      }`
    : t.projectsPage.noDates;

export function ProjectsTable({ projects, t, locale }: Props) {
  if (projects.length === 0) return <EmptyBlock>{t.projectsPage.emptyFiltered}</EmptyBlock>;
  return (
    <div className="overflow-x-auto rounded-xl border">
      <table className="w-full min-w-[760px] text-sm">
        <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
          <tr>
            <th className="px-4 py-2 font-medium">{t.fields.name}</th>
            <th className="px-3 py-2 font-medium">{t.fields.status}</th>
            <th className="px-3 py-2 font-medium">{t.fields.owner}</th>
            <th className="px-3 py-2 font-medium">{t.fields.members}</th>
            <th className="w-40 px-3 py-2 font-medium">{t.fields.progress}</th>
            <th className="px-3 py-2 font-medium">{t.projectsPage.tasks}</th>
            <th className="px-4 py-2 font-medium">{t.fields.targetDate}</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {projects.map((p) => (
            <tr key={p.id} className="hover:bg-accent/40">
              <td className="px-4 py-2.5">
                <Link href={`/projects/${p.id}`} className="font-medium hover:underline">
                  <EntityIcon value={p.emoji} /> {p.title}
                </Link>
                {p.tags.length ? (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {p.tags.map((tag) => (
                      <Badge key={tag} tone="outline" className="font-normal">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                ) : null}
              </td>
              <td className="px-3 py-2.5">
                <Badge tone={projectStatusTone[p.status]}>{statusLabel(t, "project", p.status)}</Badge>
              </td>
              <td className="px-3 py-2.5 text-muted-foreground">{p.owner?.name ?? "—"}</td>
              <td className="px-3 py-2.5">
                <AvatarStack members={p.members} max={4} />
              </td>
              <td className="px-3 py-2.5">
                <ProgressMeter value={p.progress} label={p.title} />
              </td>
              <td className="px-3 py-2.5 text-xs text-muted-foreground tabular-nums">
                {p.task_done}/{p.task_total}
                {p.task_overdue ? <span className="ml-1 text-status-red-fg">（{p.task_overdue}!）</span> : null}
              </td>
              <td className="px-4 py-2.5 text-xs text-muted-foreground">
                {p.due_date ? formatDate(locale, p.due_date, { dateStyle: "medium" }) : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const COLUMNS: ProjectStatus[] = ["planning", "active", "paused", "completed"];

export function ProjectsBoard({ projects, t, locale }: Props) {
  return (
    <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-4 md:mx-0 md:grid md:grid-cols-4 md:overflow-visible md:px-0">
      {COLUMNS.map((status) => {
        const items = projects.filter((p) => p.status === status);
        return (
          <section key={status} className="flex w-72 shrink-0 snap-start flex-col rounded-xl bg-muted/50 p-2 md:w-auto">
            <header className="flex items-center gap-2 px-1.5 pt-1 pb-2">
              <Badge tone={projectStatusTone[status]}>{statusLabel(t, "project", status)}</Badge>
              <span className="text-xs text-muted-foreground tabular-nums">{items.length}</span>
            </header>
            <ul className="flex flex-col gap-2">
              {items.map((p) => (
                <li key={p.id}>
                  <Link
                    href={`/projects/${p.id}`}
                    className="block rounded-lg border bg-card p-3 shadow-xs transition-shadow hover:shadow-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    <div className="text-sm font-medium">
                      <EntityIcon value={p.emoji} /> {p.title}
                    </div>
                    <div className="mt-2">
                      <ProgressMeter value={p.progress} label={p.title} />
                    </div>
                    <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="truncate">{p.owner?.name ?? "—"}</span>
                      {p.due_date ? <span>→ {formatDate(locale, p.due_date, { month: "numeric", day: "numeric", year: "2-digit" })}</span> : null}
                      <AvatarStack members={p.members} className="ml-auto" />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

const BAR: Record<ProjectStatus, string> = {
  planning: "bg-status-gray-fg/45",
  active: "bg-primary",
  paused: "bg-status-amber-fg/70",
  completed: "bg-status-green-fg/70",
};

/** 甘特圖：橫軸為月份，長條為開始日 → 預計完成日；紅線為今天 */
export function ProjectsTimeline({ projects, t, locale, today }: Props & { today: string }) {
  const dated = projects.filter((p) => p.start_date || p.due_date);
  const undated = projects.filter((p) => !p.start_date && !p.due_date);
  if (dated.length === 0) return <EmptyBlock>{t.projectsPage.noDates}</EmptyBlock>;

  const starts = dated.map((p) => p.start_date ?? p.due_date!);
  const ends = dated.map((p) => p.due_date ?? p.start_date!);
  const min = [...starts, today].sort()[0];
  const max = [...ends, today].sort().at(-1)!;
  const from = `${min.slice(0, 7)}-01`;
  const lastMonth = new Date(Date.UTC(Number(max.slice(0, 4)), Number(max.slice(5, 7)), 1)).toISOString().slice(0, 10);
  const total = daysFrom(from, lastMonth);
  const pct = (date: string) => (daysFrom(from, date) / total) * 100;

  const months: string[] = [];
  for (let d = from; d < lastMonth; ) {
    months.push(d);
    const next = new Date(Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)), 1));
    d = next.toISOString().slice(0, 10);
  }
  // 縮放到容器寬度，一眼看完所有專案；月份多時只標示每季或每半年
  const labelEvery = months.length <= 18 ? 1 : months.length <= 48 ? 3 : 6;
  const minWidth = 720;

  return (
    <div className="overflow-x-auto rounded-xl border">
      <div style={{ minWidth }} className="relative">
        <div className="sticky top-0 grid border-b bg-muted/50 text-[11px] text-muted-foreground" style={{ gridTemplateColumns: "14rem 1fr" }}>
          <div className="px-3 py-1.5">{t.fields.name}</div>
          <div className="relative h-7">
            {months.map((m, i) =>
              i % labelEvery === 0 ? (
                <span key={m} className="absolute top-1.5 border-l pl-1 whitespace-nowrap" style={{ left: `${pct(m)}%` }}>
                  {m.slice(5, 7) === "01" || i === 0
                    ? formatDate(locale, m, { year: "2-digit", month: "short" })
                    : formatDate(locale, m, { month: "short" })}
                </span>
              ) : null,
            )}
          </div>
        </div>
        <ul className="divide-y">
          {dated.map((p) => {
            const s = p.start_date ?? p.due_date!;
            const e = p.due_date ?? p.start_date!;
            const left = pct(s);
            const width = Math.max(pct(addDays(e, 1)) - left, 0.6);
            return (
              <li key={p.id} className="grid items-center" style={{ gridTemplateColumns: "14rem 1fr" }}>
                <Link href={`/projects/${p.id}`} className="truncate px-3 py-2.5 text-sm hover:underline">
                  <EntityIcon value={p.emoji} /> {p.title}
                </Link>
                <div className="relative h-10">
                  {months.map((m, i) =>
                    i % labelEvery === 0 ? (
                      <span key={m} className="absolute inset-y-0 border-l border-border/60" style={{ left: `${pct(m)}%` }} />
                    ) : null,
                  )}
                  <Link
                    href={`/projects/${p.id}`}
                    title={`${p.title}：${range(t, locale, p)}（${p.progress}%）`}
                    className={cn("absolute top-1/2 h-4 -translate-y-1/2 overflow-hidden rounded-[4px]", BAR[p.status], "opacity-90 hover:opacity-100")}
                    style={{ left: `${left}%`, width: `${width}%` }}
                  >
                    {/* 已完成比例以較深的段落表示 */}
                    <span className="block h-full bg-black/20 dark:bg-white/25" style={{ width: `${p.progress}%` }} />
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
        <div className="pointer-events-none absolute inset-y-0" style={{ left: `calc(14rem + (100% - 14rem) * ${pct(today) / 100})` }}>
          <div className="h-full w-px bg-status-red-fg/70" />
          <span className="absolute top-1 left-1 rounded bg-status-red-bg px-1 text-[10px] whitespace-nowrap text-status-red-fg">
            {t.projectsPage.today}
          </span>
        </div>
      </div>
      <div className="flex flex-wrap gap-3 border-t px-3 py-2 text-xs text-muted-foreground">
        {COLUMNS.map((s) => (
          <span key={s} className="inline-flex items-center gap-1.5">
            <span className={cn("size-2.5 rounded-sm", BAR[s])} />
            {statusLabel(t, "project", s)}
          </span>
        ))}
        {undated.length ? <span className="ml-auto">{t.projectsPage.noDates}：{undated.map((p) => p.title).join("、")}</span> : null}
      </div>
    </div>
  );
}

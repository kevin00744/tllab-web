"use client";

import { useI18n } from "@/lib/i18n/client";
import { format } from "@/lib/i18n";
import { statusLabel } from "@/lib/status";
import type { DashboardData } from "@/types/dashboard";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Section } from "./section";

// 階段有先後順序（ordinal）：單一色相由淺到深，見 globals.css 的 --stage-1…6
export function PublicationPipeline({
  stages,
  className,
}: {
  stages: DashboardData["publication_stages"];
  className?: string;
}) {
  const { t } = useI18n();
  const total = stages.reduce((sum, s) => sum + s.total, 0);
  const max = Math.max(1, ...stages.map((s) => s.total));

  return (
    <Section
      title={t.dashboard.publications}
      subtitle={format(t.dashboard.publicationsTotal, { count: total })}
      href="/publications"
      linkLabel={t.dashboard.viewAll}
      className={className}
    >
      <ol className="flex flex-col gap-1">
        {stages.map((s, i) => {
          const label = statusLabel(t, "publication", s.stage);
          return (
            <li key={s.stage}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="group flex w-full items-center gap-3 rounded-md px-1.5 py-1 text-left hover:bg-accent/60 focus-visible:bg-accent/60 focus-visible:outline-none"
                    aria-label={`${label}：${s.total}`}
                  >
                    <span className="w-16 shrink-0 text-xs text-muted-foreground">{label}</span>
                    <span className="flex h-5 flex-1 items-center">
                      {s.total > 0 ? (
                        <span
                          className="h-4 rounded-r-[4px] transition-opacity group-hover:opacity-85"
                          style={{
                            width: `max(4px, ${(s.total / max) * 100}%)`,
                            background: `var(--stage-${i + 1})`,
                          }}
                        />
                      ) : null}
                      <span className="ml-2 text-xs font-medium tabular-nums">{s.total}</span>
                    </span>
                  </button>
                </TooltipTrigger>
                <TooltipContent side="left" align="start">
                  <div className="mb-1 font-semibold">
                    {s.total} · {label}
                  </div>
                  {s.items.length === 0 ? (
                    <div className="text-muted-foreground">{t.dashboard.publicationsEmpty}</div>
                  ) : (
                    <ul className="flex flex-col gap-1">
                      {s.items.map((p) => (
                        <li key={p.id}>
                          <div className="line-clamp-2">{p.title}</div>
                          {p.venue ? <div className="text-muted-foreground">{p.venue}</div> : null}
                        </li>
                      ))}
                    </ul>
                  )}
                </TooltipContent>
              </Tooltip>
            </li>
          );
        })}
      </ol>
    </Section>
  );
}

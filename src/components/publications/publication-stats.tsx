"use client";

import { Bar, BarChart, CartesianGrid, LabelList, Rectangle, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { EmptyBlock } from "@/components/common/field";
import { useI18n } from "@/lib/i18n/client";
import type { YearStat } from "@/types/entities";

// 類別色固定順序（globals.css --cat-1…4，已用 dataviz 驗證）；淺色模式下 aqua/yellow 對比不足 3:1，
// 依規範搭配柱頂總數標籤與下方資料表
const SERIES = [
  { key: "journal", color: "var(--cat-1)" },
  { key: "conference", color: "var(--cat-2)" },
  { key: "preprint", color: "var(--cat-3)" },
  { key: "thesis", color: "var(--cat-4)" },
] as const;

type Row = YearStat & { total: number };
type SeriesKey = (typeof SERIES)[number]["key"];

/** 每一年最上面（非零）的類型：總數標籤與圓角放在它身上 */
function topSeries(row: Row): SeriesKey | null {
  for (let i = SERIES.length - 1; i >= 0; i--) if (row[SERIES[i].key] > 0) return SERIES[i].key;
  return null;
}

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: { payload: Row }[]; label?: number }) {
  const { t } = useI18n();
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-xs shadow-md">
      <div className="mb-1 font-semibold">{label}</div>
      {SERIES.map((s) => (
        <div key={s.key} className="flex items-center gap-2">
          <span className="h-0.5 w-3 rounded" style={{ background: s.color }} />
          <span className="w-6 text-right font-semibold tabular-nums">{row[s.key]}</span>
          <span className="text-muted-foreground">{t.pubType[s.key]}</span>
        </div>
      ))}
      <div className="mt-1 border-t pt-1">
        <span className="font-semibold">{row.total}</span> <span className="text-muted-foreground">{t.publicationsPage.total}</span>
      </div>
    </div>
  );
}

export function PublicationStats({ stats }: { stats: YearStat[] }) {
  const { t } = useI18n();
  const rows: Row[] = stats.map((s) => ({ ...s, total: s.journal + s.conference + s.preprint + s.thesis }));
  const hasPublished = rows.some((r) => r.total > 0);

  return (
    <div className="grid gap-4">
      <section className="rounded-xl border bg-card px-5 py-4">
        <h2 className="text-sm font-semibold">{t.publicationsPage.statsTitle}</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">{t.publicationsPage.statsSubtitle}</p>
        {hasPublished ? (
          <>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs" aria-hidden>
              {SERIES.map((s) => (
                <span key={s.key} className="inline-flex items-center gap-1.5">
                  <span className="size-2.5 rounded-sm" style={{ background: s.color }} />
                  {t.pubType[s.key]}
                </span>
              ))}
            </div>
            <div className="mt-2 h-64" role="img" aria-label={t.publicationsPage.statsTitle}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={rows} margin={{ top: 20, right: 8, bottom: 0, left: -20 }} barCategoryGap="30%">
                  <CartesianGrid vertical={false} stroke="var(--border)" />
                  <XAxis dataKey="year" tickLine={false} axisLine={{ stroke: "var(--border)" }} tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} />
                  <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} />
                  <Tooltip content={<ChartTooltip />} cursor={{ fill: "var(--accent)", opacity: 0.5 }} />
                  {SERIES.map((s) => (
                    <Bar
                      key={s.key}
                      dataKey={s.key}
                      stackId="published"
                      fill={s.color}
                      maxBarSize={24}
                      stroke="var(--card)"
                      strokeWidth={2}
                      isAnimationActive={false}
                      shape={(props: React.ComponentProps<typeof Rectangle> & { index?: number }) => (
                        <Rectangle
                          {...props}
                          radius={topSeries(rows[props.index ?? 0]) === s.key ? [4, 4, 0, 0] : 0}
                        />
                      )}
                    >
                      <LabelList
                        dataKey="total"
                        content={(p) => {
                          const index = Number(p.index);
                          if (topSeries(rows[index]) !== s.key) return null;
                          const x = Number(p.x) + Number(p.width) / 2;
                          return (
                            <text x={x} y={Number(p.y) - 6} textAnchor="middle" fill="var(--foreground)" fontSize={12}>
                              {rows[index].total}
                            </text>
                          );
                        }}
                      />
                    </Bar>
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </>
        ) : (
          <EmptyBlock>{t.publicationsPage.statsEmpty}</EmptyBlock>
        )}
      </section>

      {/* 資料表：所有數值不需滑鼠也能讀到 */}
      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full text-sm tabular-nums">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-2 text-left font-medium">{t.publicationsPage.year}</th>
              {SERIES.map((s) => (
                <th key={s.key} className="px-3 py-2 text-right font-medium">
                  {t.pubType[s.key]}
                </th>
              ))}
              <th className="px-3 py-2 text-right font-medium">{t.publicationsPage.total}</th>
              <th className="px-4 py-2 text-right font-medium">{t.publicationsPage.submitted}</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {[...rows].reverse().map((r) => (
              <tr key={r.year}>
                <td className="px-4 py-2 font-medium">{r.year}</td>
                {SERIES.map((s) => (
                  <td key={s.key} className="px-3 py-2 text-right">
                    {r[s.key]}
                  </td>
                ))}
                <td className="px-3 py-2 text-right font-semibold">{r.total}</td>
                <td className="px-4 py-2 text-right text-muted-foreground">{r.submitted}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

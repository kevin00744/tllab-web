"use client";

import { ExternalLinkIcon } from "lucide-react";

import { EmptyBlock } from "@/components/common/field";
import { Badge } from "@/components/ui/badge";
import { daysFrom, formatDate, relativeDay } from "@/lib/date";
import { useI18n } from "@/lib/i18n/client";
import { publicationStageTone, statusLabel } from "@/lib/status";
import { cn } from "@/lib/utils";
import type { PublicationStage } from "@/types/db";
import type { Publication } from "@/types/entities";
import { usePublications } from "./publication-provider";
import { iconText } from "@/lib/icon";

const STAGES: PublicationStage[] = ["idea", "drafting", "submitted", "revision", "accepted", "published"];

function authorLine(p: Publication) {
  return p.authors.map((a) => `${a.name}${a.is_first_author ? "*" : ""}${a.is_corresponding ? "†" : ""}`).join(", ");
}

function linkOf(p: Publication) {
  return p.url ?? (p.doi ? `https://doi.org/${p.doi}` : null);
}

function keyDate(p: Publication) {
  return p.published_at ?? p.accepted_at ?? p.submitted_at ?? p.deadline;
}

function DeadlineHint({ date, today }: { date: string | null; today: string }) {
  const { t } = useI18n();
  if (!date) return null;
  const days = daysFrom(today, date);
  if (days < -30) return null;
  return (
    <span className={cn("text-xs", days < 0 ? "text-status-red-fg" : days <= 14 ? "text-status-amber-fg" : "text-muted-foreground")}>
      {t.fields.deadline} {relativeDay(t, days, { overdue: true })}
    </span>
  );
}

export function PublicationsTable({
  publications,
  showProject = true,
  today,
}: {
  publications: Publication[];
  showProject?: boolean;
  today?: string;
}) {
  const { t, locale } = useI18n();
  const { open } = usePublications();
  if (publications.length === 0) return <EmptyBlock>{t.publicationsPage.emptyFiltered}</EmptyBlock>;

  return (
    <div className="overflow-x-auto rounded-xl border">
      <table className="w-full min-w-[720px] text-sm">
        <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
          <tr>
            <th className="px-4 py-2 font-medium">{t.fields.title}</th>
            <th className="px-3 py-2 font-medium">{t.fields.stage}</th>
            <th className="px-3 py-2 font-medium">{t.fields.type}</th>
            <th className="px-3 py-2 font-medium">{t.fields.venue}</th>
            {showProject ? <th className="px-3 py-2 font-medium">{t.fields.project}</th> : null}
            <th className="px-4 py-2 font-medium">{t.fields.deadline} / {t.fields.publishedAt}</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {publications.map((p) => {
            const link = linkOf(p);
            const date = keyDate(p);
            return (
              <tr
                key={p.id}
                tabIndex={0}
                onClick={() => open(p)}
                onKeyDown={(e) => e.key === "Enter" && open(p)}
                className="cursor-pointer align-top outline-none hover:bg-accent/40 focus-visible:bg-accent/60"
              >
                <td className="max-w-md px-4 py-2.5">
                  <div className="font-medium">{p.title}</div>
                  {p.authors.length ? <div className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{authorLine(p)}</div> : null}
                  {link ? (
                    <a
                      href={link}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="mt-0.5 inline-flex items-center gap-1 text-xs text-primary hover:underline"
                    >
                      <ExternalLinkIcon className="size-3" /> {p.doi ?? t.publicationsPage.openLink}
                    </a>
                  ) : null}
                </td>
                <td className="px-3 py-2.5">
                  <Badge tone={publicationStageTone[p.stage]}>{statusLabel(t, "publication", p.stage)}</Badge>
                </td>
                <td className="px-3 py-2.5 text-xs">{t.pubType[p.type]}</td>
                <td className="px-3 py-2.5 text-xs text-muted-foreground">{p.venue ?? "—"}</td>
                {showProject ? (
                  <td className="max-w-40 truncate px-3 py-2.5 text-xs text-muted-foreground">
                    {p.project ? `${iconText(p.project.emoji)} ${p.project.title}` : "—"}
                  </td>
                ) : null}
                <td className="px-4 py-2.5 text-xs text-muted-foreground">
                  {p.stage === "published" && p.published_at ? (
                    formatDate(locale, p.published_at, { dateStyle: "medium" })
                  ) : today && p.deadline ? (
                    <DeadlineHint date={p.deadline} today={today} />
                  ) : date ? (
                    formatDate(locale, date, { dateStyle: "medium" })
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="border-t px-4 py-1.5 text-[11px] text-muted-foreground">* {t.fields.firstAuthor}　† {t.fields.corresponding}</p>
    </div>
  );
}

export function PublicationsBoard({ publications, today }: { publications: Publication[]; today: string }) {
  const { t } = useI18n();
  const { open, create, options } = usePublications();
  return (
    <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-4 md:mx-0 md:px-0 xl:grid xl:grid-cols-6 xl:overflow-visible">
      {STAGES.map((stage) => {
        const items = publications.filter((p) => p.stage === stage);
        return (
          <section key={stage} className="flex w-64 shrink-0 snap-start flex-col rounded-xl bg-muted/50 p-2 xl:w-auto">
            <header className="flex items-center justify-between px-1.5 pt-1 pb-2">
              <span className="flex items-center gap-2">
                <Badge tone={publicationStageTone[stage]}>{statusLabel(t, "publication", stage)}</Badge>
                <span className="text-xs text-muted-foreground tabular-nums">{items.length}</span>
              </span>
              {options.can_create ? (
                <button
                  type="button"
                  onClick={() => create({ stage })}
                  className="rounded px-1.5 text-lg leading-none text-muted-foreground hover:bg-accent hover:text-foreground"
                  aria-label={`${t.publicationsPage.new}：${statusLabel(t, "publication", stage)}`}
                >
                  +
                </button>
              ) : null}
            </header>
            <ul className="flex flex-col gap-2">
              {items.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => open(p)}
                    className="block w-full rounded-lg border bg-card p-3 text-left shadow-xs transition-shadow hover:shadow-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    <div className="line-clamp-3 text-sm leading-snug">{p.title}</div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <Badge tone="outline" className="font-normal">
                        {t.pubType[p.type]}
                      </Badge>
                      {p.venue ? <span className="truncate text-xs text-muted-foreground">{p.venue}</span> : null}
                    </div>
                    {p.authors[0] ? <div className="mt-1 truncate text-xs text-muted-foreground">{authorLine(p)}</div> : null}
                    {stage !== "published" && stage !== "accepted" ? (
                      <div className="mt-1">
                        <DeadlineHint date={p.deadline} today={today} />
                      </div>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

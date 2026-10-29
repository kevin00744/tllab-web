import type { Metadata } from "next";
import { BarChart3Icon, KanbanSquareIcon, TableIcon } from "lucide-react";

import { FilterBar, FilterSelect, SearchBox } from "@/components/common/filters";
import { ViewTabs } from "@/components/common/view-tabs";
import { PageHeader } from "@/components/page-header";
import { NewPublicationButton, OpenPublicationOnLoad, PublicationProvider } from "@/components/publications/publication-provider";
import { PublicationStats } from "@/components/publications/publication-stats";
import { PublicationsBoard, PublicationsTable } from "@/components/publications/publication-views";
import { getFormOptions, getPublicationStats, isUuid, listPublications } from "@/lib/data";
import { labDateOf } from "@/lib/date";
import { getI18n } from "@/lib/i18n/server";
import { getPageMeta } from "@/lib/pages";
import { statusLabel } from "@/lib/status";

export async function generateMetadata(): Promise<Metadata> {
  const { locale, t } = await getI18n();
  return { title: (await getPageMeta("publications", locale, t)).title };
}

const VIEWS = ["board", "table", "stats"] as const;
const TYPES = ["journal", "conference", "preprint", "thesis"] as const;
const STAGES = ["idea", "drafting", "submitted", "revision", "accepted", "published"] as const;

export default async function PublicationsPage({ searchParams }: PageProps<"/publications">) {
  const sp = await searchParams;
  const str = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const view = VIEWS.find((v) => v === str("view")) ?? "board";
  const type = TYPES.find((x) => x === str("type"));
  const stage = STAGES.find((x) => x === str("stage"));
  const project = isUuid(str("project")) ? str("project") : undefined;
  const member = isUuid(str("member")) ? str("member") : undefined;

  const [{ locale, t }, options, publications, stats] = await Promise.all([
    getI18n(),
    getFormOptions(),
    view === "stats" ? Promise.resolve([]) : listPublications({ type, stage: view === "table" ? stage : undefined, project_id: project, member_id: member, q: str("q") }),
    view === "stats" ? getPublicationStats() : Promise.resolve([]),
  ]);
  const meta = await getPageMeta("publications", locale, t);
  const today = labDateOf(new Date().toISOString());

  return (
    <PublicationProvider options={options}>
      <OpenPublicationOnLoad publication={publications.find((x) => x.id === str("pub")) ?? null} />
      <PageHeader emoji={meta.emoji} title={meta.title} actions={<NewPublicationButton />} />
      <FilterBar>
        <ViewTabs
          current={view}
          views={[
            { value: "board", label: t.views.board, icon: <KanbanSquareIcon /> },
            { value: "table", label: t.views.table, icon: <TableIcon /> },
            { value: "stats", label: t.views.stats, icon: <BarChart3Icon /> },
          ]}
        />
        {view !== "stats" ? (
          <>
            <FilterSelect param="type" label={t.publicationsPage.anyType} options={TYPES.map((x) => ({ value: x, label: t.pubType[x] }))} />
            {view === "table" ? (
              <FilterSelect
                param="stage"
                label={t.publicationsPage.anyStage}
                options={STAGES.map((x) => ({ value: x, label: statusLabel(t, "publication", x) }))}
              />
            ) : null}
            <FilterSelect
              param="project"
              label={`${t.fields.project}：${t.common.all}`}
              options={options.projects.map((p) => ({ value: p.id, label: `${p.emoji} ${p.title}` }))}
            />
            <FilterSelect
              param="member"
              label={`${t.fields.authors}：${t.common.all}`}
              options={options.members.map((m) => ({ value: m.id, label: m.name }))}
            />
            <SearchBox placeholder={t.common.search} className="w-full sm:ml-auto sm:w-56" />
          </>
        ) : null}
      </FilterBar>
      {view === "board" ? (
        <PublicationsBoard publications={publications} today={today} />
      ) : view === "table" ? (
        <PublicationsTable publications={publications} today={today} />
      ) : (
        <PublicationStats stats={stats} />
      )}
    </PublicationProvider>
  );
}

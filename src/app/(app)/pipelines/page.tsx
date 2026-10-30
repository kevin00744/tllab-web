import type { Metadata } from "next";
import Link from "next/link";

import { EmptyBlock } from "@/components/common/field";
import { FilterBar, FilterSelect, SearchBox } from "@/components/common/filters";
import { MemberAvatar } from "@/components/layout/user-menu";
import { ManageButton } from "@/components/admin/manage-button";
import { PageHeader } from "@/components/page-header";
import { PipelineDialog } from "@/components/pipelines/pipeline-dialog";
import { Badge } from "@/components/ui/badge";
import { getFormOptions, listPipelines } from "@/lib/data";
import { format } from "@/lib/i18n";
import { getI18n } from "@/lib/i18n/server";
import { getPageMeta } from "@/lib/pages";
import { plainExcerpt } from "@/lib/text";
import { EntityIcon } from "@/components/common/entity-icon";

export async function generateMetadata(): Promise<Metadata> {
  const { locale, t } = await getI18n();
  return { title: (await getPageMeta("pipelines", locale, t)).title };
}

export default async function PipelinesPage({ searchParams }: PageProps<"/pipelines">) {
  const sp = await searchParams;
  const str = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const [{ locale, t }, options, all] = await Promise.all([getI18n(), getFormOptions(), listPipelines()]);
  const tagList = [...new Set(all.flatMap((p) => p.tags))].sort();
  const tag = tagList.find((x) => x === str("tag"));
  const q = str("q");
  const pipelines = tag || q ? await listPipelines({ tag, q }) : all;
  const meta = await getPageMeta("pipelines", locale, t);
  const p = t.pipelinesPage;

  return (
    <>
      <PageHeader
        emoji={meta.emoji}
        title={meta.title}
        description={p.description}
        actions={
          <>
            <ManageButton entity="pipeline" />
            {options.can_create ? <PipelineDialog pipeline={null} options={options} /> : null}
          </>
        }
      />
      <FilterBar>
        {tagList.length ? (
          <FilterSelect param="tag" label={`${t.common.tags}：${t.common.all}`} options={tagList.map((x) => ({ value: x, label: x }))} />
        ) : null}
        <SearchBox placeholder={t.common.search} className="w-full sm:ml-auto sm:w-56" />
      </FilterBar>
      {pipelines.length === 0 ? (
        <EmptyBlock>{tag || q ? p.emptyFiltered : p.empty}</EmptyBlock>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {pipelines.map((pl) => (
            <li key={pl.id}>
              <Link
                href={`/pipelines/${pl.id}`}
                data-pipeline-id={pl.id}
                className="flex h-full flex-col rounded-xl border bg-card p-4 transition-shadow hover:shadow-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <div className="flex items-start gap-2">
                  <span className="text-2xl leading-none" aria-hidden>
                    <EntityIcon value={pl.emoji} />
                  </span>
                  <span className="min-w-0 flex-1 font-semibold">{pl.name}</span>
                  <Badge tone="gray" className="font-mono">
                    v{pl.version}
                  </Badge>
                </div>
                <p className="mt-2 line-clamp-2 flex-1 text-sm text-muted-foreground">{plainExcerpt(pl.description) || "—"}</p>
                <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                  {pl.tags.map((x) => (
                    <Badge key={x} tone="outline" className="font-normal">
                      {x}
                    </Badge>
                  ))}
                  <span>{format(p.stepCount, { n: pl.step_count })}</span>
                  {pl.maintainer ? (
                    <span className="ml-auto inline-flex items-center gap-1">
                      <MemberAvatar member={pl.maintainer} className="size-5" />
                      {pl.maintainer.name}
                    </span>
                  ) : null}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

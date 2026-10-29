import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeftIcon, GitBranchIcon } from "lucide-react";

import { CodeBlock } from "@/components/common/code-block";
import { MemberAvatar } from "@/components/layout/user-menu";
import { Markdown } from "@/components/markdown";
import { PipelineDialog } from "@/components/pipelines/pipeline-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getFormOptions, getPipeline, isUuid } from "@/lib/data";
import { formatDateTime } from "@/lib/date";
import { format } from "@/lib/i18n";
import { getI18n } from "@/lib/i18n/server";

export async function generateMetadata({ params }: PageProps<"/pipelines/[id]">): Promise<Metadata> {
  const { id } = await params;
  const pipeline = isUuid(id) ? await getPipeline(id) : null;
  return { title: pipeline?.name ?? "Pipeline" };
}

export default async function PipelineDetailPage({ params }: PageProps<"/pipelines/[id]">) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const [{ locale, t }, pipeline, options] = await Promise.all([getI18n(), getPipeline(id), getFormOptions()]);
  if (!pipeline) notFound();
  const p = t.pipelinesPage;

  return (
    <>
      <Link href="/pipelines" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeftIcon className="size-4" /> {p.back}
      </Link>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="mb-2 text-4xl leading-none" aria-hidden>
            {pipeline.emoji}
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {pipeline.name} <span className="font-mono text-base font-normal text-muted-foreground">v{pipeline.version}</span>
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-muted-foreground">
            {pipeline.maintainer ? (
              <Link href={`/members/${pipeline.maintainer.id}`} className="inline-flex items-center gap-1.5 hover:text-foreground">
                <MemberAvatar member={pipeline.maintainer} className="size-5" />
                {p.maintainer}：{pipeline.maintainer.name}
              </Link>
            ) : null}
            {pipeline.project ? (
              <Link href={`/projects/${pipeline.project.id}`} className="hover:text-foreground">
                {pipeline.project.emoji} {pipeline.project.title}
              </Link>
            ) : null}
            {pipeline.tags.map((x) => (
              <Badge key={x} tone="outline" className="font-normal">
                {x}
              </Badge>
            ))}
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          {pipeline.repo_url ? (
            <Button asChild variant="outline">
              <a href={pipeline.repo_url} target="_blank" rel="noreferrer noopener">
                <GitBranchIcon /> {p.repo}
              </a>
            </Button>
          ) : null}
          {pipeline.editable ? <PipelineDialog pipeline={pipeline} options={options} /> : null}
        </div>
      </div>

      {pipeline.description ? <Markdown className="mb-6">{pipeline.description}</Markdown> : null}

      <div className="mb-8 grid gap-3 sm:grid-cols-2">
        <section className="rounded-xl border px-4 py-3">
          <h2 className="mb-1 text-sm font-semibold">{p.inputs}</h2>
          {pipeline.inputs ? <Markdown className="text-sm">{pipeline.inputs}</Markdown> : <p className="text-sm text-muted-foreground">—</p>}
        </section>
        <section className="rounded-xl border px-4 py-3">
          <h2 className="mb-1 text-sm font-semibold">{p.outputs}</h2>
          {pipeline.outputs ? <Markdown className="text-sm">{pipeline.outputs}</Markdown> : <p className="text-sm text-muted-foreground">—</p>}
        </section>
      </div>

      <section aria-labelledby="pl-steps">
        <h2 id="pl-steps" className="mb-4 text-base font-semibold">
          {p.steps} <span className="text-sm font-normal text-muted-foreground">{pipeline.steps.length}</span>
        </h2>
        {pipeline.steps.length ? (
          <ol className="grid gap-6">
            {pipeline.steps.map((s, i) => (
              <li key={s.id ?? i} className="grid grid-cols-[2rem_minmax(0,1fr)] gap-3" data-testid="pipeline-step">
                <span className="flex size-7 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                  {i + 1}
                </span>
                <div className="grid min-w-0 gap-2">
                  <h3 className="pt-0.5 font-medium">{s.title}</h3>
                  {s.description ? <Markdown className="text-sm">{s.description}</Markdown> : null}
                  {s.code ? <CodeBlock code={s.code} language={s.code_language} /> : null}
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-muted-foreground">{p.noSteps}</p>
        )}
      </section>
      <p className="mt-8 text-xs text-muted-foreground">
        {format(t.common.updatedAt, { date: formatDateTime(locale, pipeline.updated_at, { dateStyle: "medium" }) })}
      </p>
    </>
  );
}

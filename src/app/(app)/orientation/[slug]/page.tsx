import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";

import { ManageButton } from "@/components/admin/manage-button";
import { DocDialog } from "@/components/orientation/doc-dialog";
import { DocTree } from "@/components/orientation/doc-tree";
import { DocumentDoc } from "@/components/orientation/document-doc";
import { getDocument, listDocuments } from "@/lib/data";
import { formatDateTime } from "@/lib/date";
import { format } from "@/lib/i18n";
import { getI18n } from "@/lib/i18n/server";
import { getPageMeta } from "@/lib/pages";
import { extractHeadings } from "@/lib/text";
import { ancestorsOf, buildTree, flattenTree } from "@/lib/tree";
import { cn } from "@/lib/utils";
import { EntityIcon } from "@/components/common/entity-icon";

export async function generateMetadata({ params }: PageProps<"/orientation/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const doc = await getDocument(slug);
  return { title: doc?.title ?? "Orientation" };
}

export default async function OrientationDocPage({ params }: PageProps<"/orientation/[slug]">) {
  const { slug } = await params;
  const [{ locale, t }, documents, doc] = await Promise.all([getI18n(), listDocuments(), getDocument(slug)]);
  if (!doc) notFound();
  const meta = await getPageMeta("orientation", locale, t);
  const tree = buildTree(documents);
  const order = flattenTree(tree);
  const index = order.findIndex((d) => d.id === doc.id);
  const prev = index > 0 ? order[index - 1] : null;
  const next = index >= 0 && index < order.length - 1 ? order[index + 1] : null;
  const path = ancestorsOf(documents, doc.id);
  const toc = extractHeadings(doc.content).filter((h) => h.level > 1);
  const updated = formatDateTime(locale, doc.updated_at, { dateStyle: "medium" });

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[14rem_minmax(0,1fr)] xl:grid-cols-[14rem_minmax(0,1fr)_12rem]">
      <nav aria-label={t.orientationPage.contents} className="min-w-0 lg:sticky lg:top-16 lg:max-h-[calc(100dvh-5rem)] lg:overflow-y-auto">
        <div className="mb-2 flex items-center justify-between">
          <Link href="/orientation" className="text-sm font-semibold">
            <EntityIcon value={meta.emoji} /> {meta.title}
          </Link>
        </div>
        <details className="rounded-lg border px-2 py-1.5 lg:hidden">
          <summary className="cursor-pointer text-sm text-muted-foreground">{t.orientationPage.contents}</summary>
          <div className="mt-2">
            <DocTree nodes={tree} current={doc.slug} />
          </div>
        </details>
        <div className="hidden lg:block">
          <DocTree nodes={tree} current={doc.slug} />
        </div>
        <div className="mt-3 flex flex-wrap gap-2 empty:hidden">
          {doc.editable ? <DocDialog mode={{ kind: "new" }} documents={documents} /> : null}
          <ManageButton entity="document" />
        </div>
      </nav>

      <article className="min-w-0">
        {path.length > 1 ? (
          <ol className="mb-3 flex flex-wrap items-center gap-1 text-xs text-muted-foreground" aria-label="breadcrumb">
            {path.slice(0, -1).map((p) => (
              <li key={p.id} className="flex items-center gap-1">
                <Link href={`/orientation/${p.slug}`} className="hover:text-foreground hover:underline">
                  <EntityIcon value={p.emoji} /> {p.title}
                </Link>
                <ChevronRightIcon className="size-3" />
              </li>
            ))}
          </ol>
        ) : null}
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="mb-2 text-4xl leading-none" aria-hidden>
              <EntityIcon value={doc.emoji} />
            </div>
            <h1 className="text-2xl font-semibold tracking-tight">{doc.title}</h1>
            <p className="mt-1 text-xs text-muted-foreground">
              {doc.updated_by ? format(t.common.updatedBy, { name: doc.updated_by.name, date: updated }) : format(t.common.updatedAt, { date: updated })}
            </p>
          </div>
          {doc.editable ? (
            <div className="flex shrink-0 gap-2">
              <DocDialog mode={{ kind: "new", parentId: doc.id }} documents={documents} />
              <DocDialog mode={{ kind: "edit", doc }} documents={documents} />
            </div>
          ) : null}
        </div>

        <DocumentDoc id={doc.id} content={doc.content} version={doc.content_version} editable={doc.editable} />

        {prev || next ? (
          <div className="mt-10 grid gap-3 border-t pt-4 sm:grid-cols-2">
            {prev ? (
              <Link href={`/orientation/${prev.slug}`} className="rounded-lg border px-4 py-3 text-sm hover:bg-accent/50">
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <ChevronLeftIcon className="size-3.5" /> {t.orientationPage.prev}
                </span>
                <span className="mt-0.5 block truncate font-medium">
                  <EntityIcon value={prev.emoji} /> {prev.title}
                </span>
              </Link>
            ) : (
              <span />
            )}
            {next ? (
              <Link href={`/orientation/${next.slug}`} className="rounded-lg border px-4 py-3 text-right text-sm hover:bg-accent/50">
                <span className="flex items-center justify-end gap-1 text-xs text-muted-foreground">
                  {t.orientationPage.next} <ChevronRightIcon className="size-3.5" />
                </span>
                <span className="mt-0.5 block truncate font-medium">
                  <EntityIcon value={next.emoji} /> {next.title}
                </span>
              </Link>
            ) : null}
          </div>
        ) : null}
      </article>

      {toc.length ? (
        <aside className="sticky top-16 hidden xl:block" aria-label={t.orientationPage.onThisPage}>
          <p className="mb-2 text-xs font-medium text-muted-foreground">{t.orientationPage.onThisPage}</p>
          <ul className="grid gap-1 border-l text-sm">
            {toc.map((h) => (
              <li key={h.id}>
                <a
                  href={`#${h.id}`}
                  className={cn("-ml-px block border-l border-transparent py-0.5 text-muted-foreground hover:border-foreground hover:text-foreground", h.level === 2 ? "pl-3" : "pl-6 text-xs")}
                >
                  {h.text}
                </a>
              </li>
            ))}
          </ul>
        </aside>
      ) : null}
    </div>
  );
}

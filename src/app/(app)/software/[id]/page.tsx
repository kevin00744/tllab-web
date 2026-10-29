import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BookOpenIcon, ChevronLeftIcon, ExternalLinkIcon } from "lucide-react";

import { MemberAvatar } from "@/components/layout/user-menu";
import { Markdown } from "@/components/markdown";
import { SoftwareDialog } from "@/components/software/software-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getFormOptions, getSoftware, isUuid, listSoftware } from "@/lib/data";
import { formatDateTime } from "@/lib/date";
import { format } from "@/lib/i18n";
import { getI18n } from "@/lib/i18n/server";

export async function generateMetadata({ params }: PageProps<"/software/[id]">): Promise<Metadata> {
  const { id } = await params;
  const tool = isUuid(id) ? await getSoftware(id) : null;
  return { title: tool?.name ?? "Software" };
}

export default async function SoftwareDetailPage({ params }: PageProps<"/software/[id]">) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const [{ locale, t }, tool, all, options] = await Promise.all([getI18n(), getSoftware(id), listSoftware(), getFormOptions()]);
  if (!tool) notFound();
  const s = t.softwarePage;

  return (
    <>
      <Link href="/software" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeftIcon className="size-4" /> {s.back}
      </Link>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="mb-2 text-4xl leading-none" aria-hidden>
            {tool.emoji}
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">{tool.name}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
            <Badge tone="blue">{tool.category}</Badge>
            {tool.purpose ? <span className="text-muted-foreground">{tool.purpose}</span> : null}
          </div>
        </div>
        {tool.editable ? <SoftwareDialog tool={tool} categories={[...new Set(all.map((x) => x.category))]} members={options.members} /> : null}
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="grid min-w-0 gap-6">
          <section>
            <h2 className="mb-2 text-base font-semibold">{s.access}</h2>
            {tool.access_info ? <Markdown>{tool.access_info}</Markdown> : <p className="text-sm text-muted-foreground">{s.noAccess}</p>}
          </section>
          <section>
            <h2 className="mb-2 text-base font-semibold">{s.install}</h2>
            {tool.install_guide ? <Markdown>{tool.install_guide}</Markdown> : <p className="text-sm text-muted-foreground">{s.noInstall}</p>}
          </section>
        </div>
        <aside className="grid gap-3 rounded-xl border px-4 py-3 text-sm">
          <div className="flex flex-wrap gap-2">
            {tool.url ? (
              <Button asChild size="sm" variant="outline">
                <a href={tool.url} target="_blank" rel="noreferrer noopener">
                  <ExternalLinkIcon /> {s.url}
                </a>
              </Button>
            ) : null}
            {tool.docs_url ? (
              <Button asChild size="sm" variant="outline">
                <a href={tool.docs_url} target="_blank" rel="noreferrer noopener">
                  <BookOpenIcon /> {s.docsUrl}
                </a>
              </Button>
            ) : null}
          </div>
          <div>
            <p className="mb-1 text-xs text-muted-foreground">{s.contact}</p>
            {tool.contact ? (
              <Link href={`/members/${tool.contact.id}`} className="inline-flex items-center gap-2 hover:underline">
                <MemberAvatar member={tool.contact} className="size-6" />
                {tool.contact.name}
              </Link>
            ) : (
              "—"
            )}
          </div>
          <p className="text-xs text-muted-foreground">{format(t.common.updatedAt, { date: formatDateTime(locale, tool.updated_at, { dateStyle: "medium" }) })}</p>
        </aside>
      </div>
    </>
  );
}

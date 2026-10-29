import type { Metadata } from "next";
import Link from "next/link";

import { EmptyBlock } from "@/components/common/field";
import { FilterBar, SearchBox } from "@/components/common/filters";
import { ViewTabs } from "@/components/common/view-tabs";
import { MemberAvatar } from "@/components/layout/user-menu";
import { PageHeader } from "@/components/page-header";
import { SoftwareDialog } from "@/components/software/software-dialog";
import { canEdit, getCurrentMember } from "@/lib/auth";
import { getFormOptions, listSoftware } from "@/lib/data";
import { getI18n } from "@/lib/i18n/server";
import { getPageMeta } from "@/lib/pages";
import type { SoftwareTool } from "@/types/entities";

export async function generateMetadata(): Promise<Metadata> {
  const { locale, t } = await getI18n();
  return { title: (await getPageMeta("software", locale, t)).title };
}

export default async function SoftwarePage({ searchParams }: PageProps<"/software">) {
  const sp = await searchParams;
  const str = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const [{ locale, t }, me, all, options] = await Promise.all([getI18n(), getCurrentMember(), listSoftware(), getFormOptions()]);
  const categories = [...new Set(all.map((s) => s.category))];
  const category = categories.find((c) => c === str("category"));
  const q = str("q");
  const tools = q || category ? await listSoftware({ category, q }) : all;
  const meta = await getPageMeta("software", locale, t);

  const groups = new Map<string, SoftwareTool[]>();
  for (const s of tools) groups.set(s.category, [...(groups.get(s.category) ?? []), s]);

  return (
    <>
      <PageHeader
        emoji={meta.emoji}
        title={meta.title}
        description={t.softwarePage.description}
        actions={canEdit(me) ? <SoftwareDialog tool={null} categories={categories} members={options.members} /> : null}
      />
      <FilterBar>
        <div className="max-w-full overflow-x-auto">
          <ViewTabs
            param="category"
            label={t.common.category}
            current={category ?? ""}
            views={[{ value: "", label: t.common.allCategories }, ...categories.map((c) => ({ value: c, label: c }))]}
          />
        </div>
        <SearchBox placeholder={t.common.search} className="w-full sm:ml-auto sm:w-56" />
      </FilterBar>
      {tools.length === 0 ? (
        <EmptyBlock>{q || category ? t.softwarePage.emptyFiltered : t.softwarePage.empty}</EmptyBlock>
      ) : (
        <div className="grid grid-cols-1 gap-8">
          {[...groups].map(([name, items]) => (
            <section key={name} aria-labelledby={`sw-${name}`}>
              <h2 id={`sw-${name}`} className="mb-3 text-base font-semibold">
                {name} <span className="text-sm font-normal text-muted-foreground">{items.length}</span>
              </h2>
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {items.map((s) => (
                  <li key={s.id}>
                    <Link
                      href={`/software/${s.id}`}
                      data-software-id={s.id}
                      className="flex h-full flex-col rounded-xl border bg-card p-4 transition-shadow hover:shadow-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-2xl leading-none" aria-hidden>
                          {s.emoji}
                        </span>
                        <span className="font-semibold">{s.name}</span>
                      </div>
                      <p className="mt-2 line-clamp-2 flex-1 text-sm text-muted-foreground">{s.purpose ?? "—"}</p>
                      {s.contact ? (
                        <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
                          <MemberAvatar member={s.contact} className="size-5" />
                          {t.softwarePage.contact}：{s.contact.name}
                        </p>
                      ) : null}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </>
  );
}

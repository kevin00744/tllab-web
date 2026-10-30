import type { Metadata } from "next";

import { EmptyBlock } from "@/components/common/field";
import { FilterBar, SearchBox } from "@/components/common/filters";
import { ViewTabs } from "@/components/common/view-tabs";
import { FaqDialog } from "@/components/faq/faq-dialog";
import { Markdown } from "@/components/markdown";
import { ManageButton } from "@/components/admin/manage-button";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { canEdit, getCurrentMember } from "@/lib/auth";
import { getFaqCategories, listFaqs } from "@/lib/data";
import { formatDateTime } from "@/lib/date";
import { format } from "@/lib/i18n";
import { getI18n } from "@/lib/i18n/server";
import { getPageMeta } from "@/lib/pages";
import type { Faq } from "@/types/entities";

export async function generateMetadata(): Promise<Metadata> {
  const { locale, t } = await getI18n();
  return { title: (await getPageMeta("faq", locale, t)).title };
}

export default async function FaqPage({ searchParams }: PageProps<"/faq">) {
  const sp = await searchParams;
  const str = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const [{ locale, t }, me, categories] = await Promise.all([getI18n(), getCurrentMember(), getFaqCategories()]);
  const category = categories.some((c) => c.category === str("category")) ? str("category") : undefined;
  const q = str("q");
  const faqs = await listFaqs({ category, q });
  const meta = await getPageMeta("faq", locale, t);
  const names = categories.map((c) => c.category);

  const groups = new Map<string, Faq[]>();
  for (const f of faqs) groups.set(f.category, [...(groups.get(f.category) ?? []), f]);

  return (
    <>
      <PageHeader
        emoji={meta.emoji}
        title={meta.title}
        description={t.faqPage.description}
        actions={
          <>
            <ManageButton entity="faq" />
            {canEdit(me) ? <FaqDialog faq={null} categories={names} defaultCategory={category} /> : null}
          </>
        }
      />
      <FilterBar>
        <div className="max-w-full overflow-x-auto">
          <ViewTabs
            param="category"
            label={t.common.category}
            current={category ?? ""}
            views={[
              { value: "", label: t.common.allCategories },
              ...categories.map((c) => ({ value: c.category, label: `${c.category} ${c.count}` })),
            ]}
          />
        </div>
        <SearchBox placeholder={t.faqPage.search} className="w-full sm:ml-auto sm:w-64" />
      </FilterBar>

      {faqs.length === 0 ? (
        <EmptyBlock>{q || category ? t.faqPage.emptyFiltered : t.faqPage.empty}</EmptyBlock>
      ) : (
        <div className="grid grid-cols-1 gap-8">
          {[...groups].map(([name, items]) => (
            <section key={name} aria-labelledby={`faq-cat-${name}`}>
              <h2 id={`faq-cat-${name}`} className="mb-2 text-base font-semibold">
                {name} <span className="text-sm font-normal text-muted-foreground">{items.length}</span>
              </h2>
              <div className="divide-y rounded-xl border">
                {items.map((f) => (
                  <details key={f.id} id={`faq-${f.id}`} className="group px-4 py-3" open={!!q}>
                    <summary className="flex cursor-pointer list-none items-start gap-2 font-medium [&::-webkit-details-marker]:hidden">
                      <span className="mt-0.5 text-muted-foreground transition-transform group-open:rotate-90" aria-hidden>
                        ›
                      </span>
                      <span className="flex-1">{f.question}</span>
                    </summary>
                    <div className="mt-2 pl-4">
                      {f.answer.trim() ? <Markdown>{f.answer}</Markdown> : <p className="text-sm text-muted-foreground">{t.faqPage.noAnswer}</p>}
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        {f.tags.map((tag) => (
                          <Badge key={tag} tone="outline" className="font-normal">
                            {tag}
                          </Badge>
                        ))}
                        <span className="text-xs text-muted-foreground">
                          {format(t.common.updatedAt, { date: formatDateTime(locale, f.updated_at, { dateStyle: "medium" }) })}
                        </span>
                        {f.editable ? (
                          <span className="ml-auto">
                            <FaqDialog faq={f} categories={names} />
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </details>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </>
  );
}

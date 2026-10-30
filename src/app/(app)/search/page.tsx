import type { Metadata } from "next";
import Link from "next/link";

import { EmptyBlock } from "@/components/common/field";
import { SearchBox } from "@/components/common/filters";
import { PageHeader } from "@/components/page-header";
import { Highlight } from "@/components/search/highlight";
import { searchAll } from "@/lib/data";
import { format } from "@/lib/i18n";
import { getI18n } from "@/lib/i18n/server";
import { groupHits, hrefFor } from "@/lib/search";
import { plainExcerpt } from "@/lib/text";
import { EntityIcon } from "@/components/common/entity-icon";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.search.title };
}

export default async function SearchPage({ searchParams }: PageProps<"/search">) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 100) : "";
  const [{ t }, hits] = await Promise.all([getI18n(), q ? searchAll(q, 100) : Promise.resolve([])]);
  const groups = groupHits(hits);

  return (
    <>
      <PageHeader emoji="🔎" title={t.search.title} description={q ? format(t.search.resultCount, { n: hits.length, q }) : t.search.hint} />
      <div className="mb-6 max-w-xl">
        <SearchBox placeholder={t.search.placeholder} />
      </div>
      {!q ? null : hits.length === 0 ? (
        <EmptyBlock>{format(t.search.noResults, { q })}</EmptyBlock>
      ) : (
        <div className="grid grid-cols-1 gap-6">
          {groups.map((g) => (
            <section key={g.type} aria-labelledby={`search-${g.type}`}>
              <h2 id={`search-${g.type}`} className="mb-2 text-sm font-semibold">
                {t.search.types[g.type]} <span className="font-normal text-muted-foreground">{g.hits.length}</span>
              </h2>
              <ul className="divide-y rounded-xl border">
                {g.hits.map((h) => {
                  const href = hrefFor(h);
                  const body = (
                    <>
                      <span className="w-5 shrink-0 text-center" aria-hidden>
                        <EntityIcon value={h.emoji} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">
                          <Highlight text={h.title} term={q} />
                        </span>
                        {h.subtitle ? <span className="block truncate text-xs text-muted-foreground">{plainExcerpt(h.subtitle, 160)}</span> : null}
                      </span>
                    </>
                  );
                  return (
                    <li key={`${h.entity_type}-${h.id}`}>
                      {href ? (
                        <Link href={href} className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-accent/40" data-search-hit={h.entity_type}>
                          {body}
                        </Link>
                      ) : (
                        <div className="flex items-center gap-3 px-4 py-2.5 text-sm">{body}</div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </>
  );
}

import type { Metadata } from "next";
import Link from "next/link";

import { ActivityFeed } from "@/components/activity/activity-feed";
import { FilterBar, FilterSelect } from "@/components/common/filters";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { getFormOptions, isUuid, listActivity } from "@/lib/data";
import { labDateOf } from "@/lib/date";
import { getI18n } from "@/lib/i18n/server";
import { getPageMeta } from "@/lib/pages";
import { SEARCH_ORDER } from "@/lib/search";

export async function generateMetadata(): Promise<Metadata> {
  const { locale, t } = await getI18n();
  return { title: (await getPageMeta("activity", locale, t)).title };
}

const PAGE = 50;

export default async function ActivityPage({ searchParams }: PageProps<"/activity">) {
  const sp = await searchParams;
  const str = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const type = SEARCH_ORDER.find((x) => x === str("type"));
  const member = isUuid(str("member")) ? str("member") : undefined;
  const entity = isUuid(str("entity")) ? str("entity") : undefined;
  const before = /^\d+$/.test(str("before") ?? "") ? str("before") : undefined;
  const [{ locale, t }, options, entries] = await Promise.all([
    getI18n(),
    getFormOptions(),
    listActivity({ entity_type: type, entity_id: entity, actor_id: member, before, limit: PAGE }),
  ]);
  const meta = await getPageMeta("activity", locale, t);
  const today = labDateOf(new Date().toISOString());
  const query = (extra: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ type, member, entity, ...extra })) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `/activity?${s}` : "/activity";
  };

  return (
    <>
      <PageHeader emoji={meta.emoji} title={meta.title} description={t.activity.description} />
      <FilterBar>
        <FilterSelect param="type" label={t.activity.anyType} options={SEARCH_ORDER.map((x) => ({ value: x, label: t.search.types[x] }))} />
        <FilterSelect param="member" label={t.activity.anyMember} options={options.members.map((m) => ({ value: m.id, label: m.name }))} />
      </FilterBar>
      <div className="rounded-xl border px-4 py-3">
        <ActivityFeed entries={entries} t={t} locale={locale} today={today} />
      </div>
      <div className="mt-4 flex justify-between gap-2">
        {before ? (
          <Button asChild variant="outline" size="sm">
            <Link href={query({})}>{t.activity.newest}</Link>
          </Button>
        ) : (
          <span />
        )}
        {entries.length === PAGE ? (
          <Button asChild variant="outline" size="sm">
            <Link href={query({ before: String(entries[entries.length - 1].id) })}>{t.activity.older}</Link>
          </Button>
        ) : null}
      </div>
    </>
  );
}

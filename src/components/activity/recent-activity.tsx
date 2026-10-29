import Link from "next/link";

import { listActivity } from "@/lib/data";
import { labDateOf } from "@/lib/date";
import type { Dictionary } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n/config";
import type { SearchType } from "@/lib/search";
import { ActivityFeed } from "./activity-feed";

/** 詳細頁底部的「最近變更」 */
export async function RecentActivity({ type, id, t, locale }: { type: SearchType; id: string; t: Dictionary; locale: Locale }) {
  const entries = await listActivity({ entity_type: type, entity_id: id, limit: 8 });
  return (
    <section aria-labelledby="recent-activity" className="mt-10">
      <div className="mb-2 flex items-center justify-between">
        <h2 id="recent-activity" className="text-base font-semibold">
          {t.activity.recent}
        </h2>
        {entries.length ? (
          <Link href={`/activity?type=${type}&entity=${id}`} className="text-sm text-muted-foreground hover:text-foreground">
            {t.activity.viewAll}
          </Link>
        ) : null}
      </div>
      <ActivityFeed entries={entries} t={t} locale={locale} today={labDateOf(new Date().toISOString())} />
    </section>
  );
}

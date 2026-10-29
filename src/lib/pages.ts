import "server-only";
import { cache } from "react";

import type { Locale } from "@/lib/i18n/config";
import type { Dictionary } from "@/lib/i18n";
import { navGroups, type PageKey } from "@/lib/nav";
import { createClient } from "@/lib/supabase/server";
import type { PageSetting } from "@/types/db";

export type PageMeta = { key: PageKey; href: string; emoji: string; title: string };

const getPageSettings = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.from("page_settings").select("key, emoji, title, title_en");
  return new Map(((data as PageSetting[] | null) ?? []).map((row) => [row.key, row]));
});

/** 側邊欄與頁首使用的 emoji／標題：資料庫設定優先，其次為字典預設值 */
export async function getPageMetas(locale: Locale, t: Dictionary): Promise<Map<PageKey, PageMeta>> {
  const settings = await getPageSettings();
  const metas = new Map<PageKey, PageMeta>();
  for (const item of navGroups.flatMap((g) => g.items)) {
    const row = settings.get(item.key);
    metas.set(item.key, {
      key: item.key,
      href: item.href,
      emoji: row?.emoji ?? item.emoji,
      title: (locale === "en" ? row?.title_en : row?.title) ?? t.nav[item.key],
    });
  }
  return metas;
}

export async function getPageMeta(key: PageKey, locale: Locale, t: Dictionary) {
  return (await getPageMetas(locale, t)).get(key)!;
}

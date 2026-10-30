import type { Locale } from "@/lib/i18n/config";

// 成員名稱依介面語言顯示（與資料庫 display_name() 相同）：
// 中文介面用中文名稱（name），沒有時用英文名稱；英文介面用英文名稱（name_en），沒有時用中文名稱
type Named = { name: string; name_en?: string | null; display_name?: string; alt_name?: string | null };

export function primaryName(m: Named, locale?: Locale): string {
  if (m.display_name) return m.display_name;
  const zh = m.name?.trim() || "";
  const en = m.name_en?.trim() || "";
  return locale === "en" ? en || zh : zh || en;
}

/** 另一個語言的名稱；與主要名稱相同或沒有時為 null */
export function secondaryName(m: Named, locale?: Locale): string | null {
  if (m.alt_name !== undefined) return m.alt_name || null;
  const p = primaryName(m, locale);
  return [m.name, m.name_en].map((x) => x?.trim()).find((x) => x && x !== p) ?? null;
}

/** 選擇成員時中英文名稱都能搜尋 */
export function nameMatches(m: Named, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [m.name, m.name_en, m.alt_name, m.display_name].some((x) => x?.toLowerCase().includes(q));
}

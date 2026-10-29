"use server";

import { createClient } from "@/lib/supabase/server";
import type { SearchHit } from "@/lib/search";

/** 搜尋對話框即時查詢（權限由 RLS 決定） */
export async function searchAction(q: string): Promise<SearchHit[]> {
  const term = q.trim().slice(0, 100);
  if (!term) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("search_all", { q: term, max_results: 30 });
  if (error) {
    console.error("search failed", error);
    return [];
  }
  return (data as SearchHit[]) ?? [];
}

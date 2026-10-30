import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { getLocale } from "@/lib/i18n/server";
import { supabaseAnonKey, supabaseUrl } from "./env";

/** Server Component／Server Action／Route Handler 用，每個請求建立一次 */
export async function createClient() {
  const [cookieStore, locale] = await Promise.all([cookies(), getLocale()]);
  return createServerClient(supabaseUrl(), supabaseAnonKey(), {
    // 資料庫依介面語言顯示成員名稱（migration 22 的 display_name）
    global: { headers: { "x-lab-locale": locale } },
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Server Component 無法寫 cookie；session 由 proxy.ts 負責更新
        }
      },
    },
  });
}

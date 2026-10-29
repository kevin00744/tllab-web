"use client";

import { createBrowserClient } from "@supabase/ssr";

import { supabaseAnonKey, supabaseUrl } from "./env";

/** 瀏覽器端：目前只用於直接上傳檔案到 Storage（避開伺服器的請求大小限制） */
export function createClient() {
  return createBrowserClient(supabaseUrl(), supabaseAnonKey());
}

"use server";

import { revalidatePath } from "next/cache";

import { toActionError, type ActionResult } from "@/lib/actions";
import { createClient } from "@/lib/supabase/server";

export type PageSettingInput = { key: string; emoji: string; title: string; title_en: string };

export async function savePageSetting(input: PageSettingInput): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_page_setting", {
    p_key: input.key,
    p_emoji: input.emoji,
    p_title: input.title,
    p_title_en: input.title_en,
  });
  if (error) return { ok: false, error: toActionError(error) };
  // 側邊欄與各頁標題
  revalidatePath("/", "layout");
  return { ok: true, data: undefined };
}

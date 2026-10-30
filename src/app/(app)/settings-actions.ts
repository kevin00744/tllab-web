"use server";

import { revalidatePath } from "next/cache";

import { toActionError, type ActionResult } from "@/lib/actions";
import { createClient } from "@/lib/supabase/server";
import type { MySettings } from "@/lib/data";

/** 個人顯示偏好（每個人自己的設定，見 migration 22） */
export async function saveMySettings(input: MySettings): Promise<ActionResult<MySettings>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("save_my_settings", { p: input });
  if (error) return { ok: false, error: toActionError(error) };
  revalidatePath("/", "layout");
  return { ok: true, data: data as MySettings };
}

"use server";

import { revalidatePath } from "next/cache";

import { toActionError, type ActionResult } from "@/lib/actions";
import { getCurrentMember } from "@/lib/auth";
import type { ImportPayload } from "@/lib/notion/convert";
import { createClient } from "@/lib/supabase/server";

export type ImportStats = Record<string, Partial<Record<"created" | "updated" | "skipped" | "linked", number>>>;

/** 寫入資料庫（同一個交易；失敗時全部不寫入） */
export async function importNotion(payload: ImportPayload): Promise<ActionResult<ImportStats>> {
  const me = await getCurrentMember();
  if (me?.app_role !== "admin") return { ok: false, error: "noPermission" };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("import_notion", { p: payload });
  if (error) return { ok: false, error: toActionError(error) };
  revalidatePath("/", "layout");
  return { ok: true, data: data as ImportStats };
}

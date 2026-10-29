"use server";

import { revalidatePath } from "next/cache";

import { toActionError, type ActionResult } from "@/lib/actions";
import { createClient } from "@/lib/supabase/server";

export type DeleteActivityInput = { ids: number[] } | { before: string; entity_type?: string; actor_id?: string };

/** 批量刪除活動紀錄（僅系統管理員；權限由資料庫檢查） */
export async function deleteActivity(input: DeleteActivityInput): Promise<ActionResult<number>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("delete_activity", { p: input });
  if (error) return { ok: false, error: toActionError(error) };
  revalidatePath("/", "layout");
  return { ok: true, data: data as number };
}

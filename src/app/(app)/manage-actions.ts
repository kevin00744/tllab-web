"use server";

import { revalidatePath } from "next/cache";

import { toActionError, type ActionResult } from "@/lib/actions";
import { createClient } from "@/lib/supabase/server";

export type ManageEntity = "project" | "task" | "publication" | "document" | "faq" | "software" | "pipeline" | "meeting";
export type ManageInput = { entity: ManageEntity; action: "delete" | "rename" | "move" | "icon"; ids: string[]; value?: string };

/** Admin 的快速管理（批量刪除、重新命名、移動、更換圖示）；權限由資料庫 admin_manage 檢查 */
export async function manageItems(input: ManageInput): Promise<ActionResult<number>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_manage", { p: input });
  if (error) return { ok: false, error: toActionError(error) };
  revalidatePath("/", "layout");
  return { ok: true, data: data as number };
}

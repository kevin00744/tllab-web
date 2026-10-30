"use server";

import { revalidatePath } from "next/cache";

import { toActionError, type ActionResult } from "@/lib/actions";
import { createClient } from "@/lib/supabase/server";
import type { BoardThread } from "@/types/entities";

export type BoardFilter = { project_id?: string; mine?: boolean; before?: string; limit?: number };

export async function listBoard(filter: BoardFilter): Promise<ActionResult<BoardThread[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_board", { p_filter: filter });
  if (error) return { ok: false, error: toActionError(error) };
  return { ok: true, data: (data ?? []) as BoardThread[] };
}

export async function saveBoardPost(input: { id?: string; parent_id?: string; body: string }): Promise<ActionResult<string>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("save_board_post", { p: input });
  if (error) return { ok: false, error: toActionError(error) };
  revalidatePath("/", "layout");
  return { ok: true, data: data as string };
}

export async function deleteBoardPost(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_board_post", { p_id: id });
  if (error) return { ok: false, error: toActionError(error) };
  revalidatePath("/", "layout");
  return { ok: true, data: undefined };
}

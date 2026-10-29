"use server";

import { revalidatePath } from "next/cache";

import { toActionError, type ActionResult } from "@/lib/actions";
import { createClient } from "@/lib/supabase/server";
import type { Task } from "@/types/entities";

export type TaskInput = {
  id?: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  due_date: string;
  project_id: string;
  publication_id: string;
  assignee_ids: string[];
};

export async function saveTask(input: TaskInput): Promise<ActionResult<string>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("save_task", { p: input });
  if (error) return { ok: false, error: toActionError(error) };
  revalidatePath("/", "layout");
  return { ok: true, data: data as string };
}

/** 看板拖拉：不重新整理整頁，由前端樂觀更新 */
export async function moveTask(id: string, status: string, position: number): Promise<ActionResult<Task>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("move_task", { p_id: id, p_status: status, p_position: position });
  if (error) return { ok: false, error: toActionError(error) };
  return { ok: true, data: data as Task };
}

export async function deleteTask(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_task", { p_id: id });
  if (error) return { ok: false, error: toActionError(error) };
  revalidatePath("/", "layout");
  return { ok: true, data: undefined };
}

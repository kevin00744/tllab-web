"use server";

import { revalidatePath } from "next/cache";

import { toActionError, type ActionResult } from "@/lib/actions";
import { createClient } from "@/lib/supabase/server";

export type ProjectInput = {
  id?: string;
  title: string;
  emoji: string;
  description: string;
  status: string;
  owner_id: string;
  member_ids: string[];
  start_date: string;
  due_date: string;
  progress: number;
  tags: string[];
};

export async function saveProject(input: ProjectInput): Promise<ActionResult<string>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("save_project", { p: input });
  if (error) return { ok: false, error: toActionError(error) };
  revalidatePath("/", "layout");
  return { ok: true, data: data as string };
}

export async function deleteProject(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_project", { p_id: id });
  if (error) return { ok: false, error: toActionError(error) };
  revalidatePath("/", "layout");
  return { ok: true, data: undefined };
}

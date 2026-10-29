"use server";

import { revalidatePath } from "next/cache";

import { toActionError, type ActionResult } from "@/lib/actions";
import { createClient } from "@/lib/supabase/server";

export type PublicationInput = {
  id?: string;
  title: string;
  emoji: string;
  type: string;
  stage: string;
  venue: string;
  project_id: string;
  submitted_at: string;
  deadline: string;
  accepted_at: string;
  published_at: string;
  doi: string;
  url: string;
  abstract: string;
  notes: string;
  authors: { member_id: string | null; display_name: string | null; is_first_author: boolean; is_corresponding: boolean }[];
};

export async function savePublication(input: PublicationInput): Promise<ActionResult<string>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("save_publication", { p: input });
  if (error) return { ok: false, error: toActionError(error) };
  revalidatePath("/", "layout");
  return { ok: true, data: data as string };
}

export async function deletePublication(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_publication", { p_id: id });
  if (error) return { ok: false, error: toActionError(error) };
  revalidatePath("/", "layout");
  return { ok: true, data: undefined };
}

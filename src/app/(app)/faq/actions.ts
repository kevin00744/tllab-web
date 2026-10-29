"use server";

import { revalidatePath } from "next/cache";

import { toActionError, type ActionResult } from "@/lib/actions";
import { createClient } from "@/lib/supabase/server";

export type FaqInput = { id?: string; question: string; answer: string; category: string; tags: string[] };

export async function saveFaq(input: FaqInput): Promise<ActionResult<string>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("save_faq", { p: input });
  if (error) return { ok: false, error: toActionError(error) };
  revalidatePath("/faq");
  return { ok: true, data: data as string };
}

export async function deleteFaq(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_faq", { p_id: id });
  if (error) return { ok: false, error: toActionError(error) };
  revalidatePath("/faq");
  return { ok: true, data: undefined };
}

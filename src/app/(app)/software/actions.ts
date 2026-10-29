"use server";

import { revalidatePath } from "next/cache";

import { toActionError, type ActionResult } from "@/lib/actions";
import { createClient } from "@/lib/supabase/server";

export type SoftwareInput = {
  id?: string;
  name: string;
  emoji: string;
  category: string;
  purpose: string;
  access_info: string;
  install_guide: string;
  url: string;
  docs_url: string;
  contact_id: string;
};

export async function saveSoftware(input: SoftwareInput): Promise<ActionResult<string>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("save_software", { p: input });
  if (error) return { ok: false, error: toActionError(error) };
  revalidatePath("/software", "layout");
  return { ok: true, data: data as string };
}

export async function deleteSoftware(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_software", { p_id: id });
  if (error) return { ok: false, error: toActionError(error) };
  revalidatePath("/software", "layout");
  return { ok: true, data: undefined };
}

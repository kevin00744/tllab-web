"use server";

import { revalidatePath } from "next/cache";

import { toActionError, type ActionResult } from "@/lib/actions";
import { createClient } from "@/lib/supabase/server";

export type EventInput = {
  id?: string;
  title: string;
  category: string;
  all_day: boolean;
  starts_at: string;
  ends_at: string;
  location: string;
  description: string;
  project_id: string;
  member_ids: string[];
};

export async function saveEvent(input: EventInput): Promise<ActionResult<string>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("save_calendar_event", { p: input });
  if (error) return { ok: false, error: toActionError(error) };
  // 行事曆也出現在 Dashboard
  revalidatePath("/", "layout");
  return { ok: true, data: data as string };
}

export async function deleteEvent(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_calendar_event", { p_id: id });
  if (error) return { ok: false, error: toActionError(error) };
  revalidatePath("/", "layout");
  return { ok: true, data: undefined };
}

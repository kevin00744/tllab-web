"use server";

import { revalidatePath } from "next/cache";

import { toActionError, type ActionResult } from "@/lib/actions";
import type { DashboardPrefs } from "@/lib/dashboard-prefs";
import { createClient } from "@/lib/supabase/server";

export async function saveDashboardPrefs(prefs: DashboardPrefs): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_dashboard_prefs", { p: prefs });
  if (error) return { ok: false, error: toActionError(error) };
  revalidatePath("/");
  return { ok: true, data: undefined };
}

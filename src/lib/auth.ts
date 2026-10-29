import "server-only";
import { cache } from "react";

import { createClient } from "@/lib/supabase/server";
import type { Member } from "@/types/db";

/** 目前登入者的成員資料；同一次 render 內只查一次 */
export const getCurrentMember = cache(async (): Promise<Member | null> => {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) return null;

  const { data } = await supabase
    .from("members")
    .select("id, user_id, name, name_en, email, avatar_url, position, app_role, is_alumni")
    .eq("user_id", userId)
    .maybeSingle();
  return (data as Member | null) ?? null;
});

export function canEdit(member: Pick<Member, "app_role"> | null) {
  return member?.app_role === "admin" || member?.app_role === "member";
}

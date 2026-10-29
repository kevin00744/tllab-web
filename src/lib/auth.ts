import "server-only";
import { cache } from "react";

import { createClient } from "@/lib/supabase/server";
import type { Member } from "@/types/db";

/** 目前登入者的 auth user id；未登入（訪客）為 null */
export const getUserId = cache(async (): Promise<string | null> => {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  return claims?.claims?.sub ?? null;
});

/** 目前登入者的成員資料；同一次 render 內只查一次 */
export const getCurrentMember = cache(async (): Promise<Member | null> => {
  const userId = await getUserId();
  if (!userId) return null;
  const supabase = await createClient();

  const { data } = await supabase
    .from("members")
    .select("id, user_id, name, name_en, email, avatar_url, position, app_role, is_alumni, is_system_admin")
    .eq("user_id", userId)
    .maybeSingle();
  return (data as Member | null) ?? null;
});

export function canEdit(member: Pick<Member, "app_role"> | null) {
  return member?.app_role === "admin" || member?.app_role === "member";
}

/** Admin 重設密碼後設定的旗標：登入後提醒使用者變更臨時密碼 */
export const mustChangePassword = cache(async (): Promise<boolean> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const meta = data?.claims?.user_metadata as { must_change_password?: boolean } | undefined;
  return meta?.must_change_password === true;
});

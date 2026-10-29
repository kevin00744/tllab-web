"use server";

import { randomInt } from "node:crypto";
import { revalidatePath } from "next/cache";

import { toActionError, type ActionResult } from "@/lib/actions";
import { getCurrentMember } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type MemberInput = {
  id?: string;
  name: string;
  name_en: string;
  email?: string;
  avatar_url?: string;
  position?: string;
  app_role?: string;
  is_alumni?: boolean;
  research_interests: string[];
  bio: string;
  join_year: string;
  left_year: string;
  current_affiliation: string;
  links: { label: string; url: string }[];
  sort_order?: string;
};

export async function saveMember(input: MemberInput): Promise<ActionResult<string>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("save_member", { p: input });
  if (error) return { ok: false, error: toActionError(error) };
  revalidatePath("/", "layout");
  return { ok: true, data: data as string };
}

/** 刪除成員，並一併刪除其登入帳號（僅 Admin） */
export async function deleteMember(id: string): Promise<ActionResult> {
  const me = await getCurrentMember();
  if (me?.app_role !== "admin") return { ok: false, error: "noPermission" };
  const supabase = await createClient();
  const { data: userId, error } = await supabase.rpc("delete_member", { p_id: id });
  if (error) return { ok: false, error: toActionError(error) };
  if (userId) {
    const { error: authError } = await createAdminClient().auth.admin.deleteUser(userId as string);
    if (authError) console.error("delete auth user failed", authError);
  }
  revalidatePath("/", "layout");
  return { ok: true, data: undefined };
}

// 臨時密碼：12 碼、英數混合，避開容易混淆的字元
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
function temporaryPassword() {
  for (;;) {
    const pw = Array.from({ length: 12 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
    if (/[A-Za-z]/.test(pw) && /[0-9]/.test(pw)) return pw;
  }
}

/** Admin 重設成員密碼：回傳臨時密碼（只顯示一次），並要求對方登入後變更 */
export async function resetMemberPassword(id: string): Promise<ActionResult<string>> {
  const me = await getCurrentMember();
  if (me?.app_role !== "admin") return { ok: false, error: "noPermission" };
  const supabase = await createClient();
  const { data: userId, error } = await supabase.rpc("member_user_id", { p_id: id });
  if (error) return { ok: false, error: toActionError(error) };
  if (!userId) return { ok: false, error: "notFound" };

  const admin = createAdminClient();
  const { data: existing } = await admin.auth.admin.getUserById(userId as string);
  const password = temporaryPassword();
  const { error: updateError } = await admin.auth.admin.updateUserById(userId as string, {
    password,
    user_metadata: { ...(existing?.user?.user_metadata ?? {}), must_change_password: true },
  });
  if (updateError) {
    console.error("reset password failed", updateError);
    return { ok: false, error: "server" };
  }
  return { ok: true, data: password };
}

export type InviteInput = {
  app_role: string;
  position: string;
  email: string;
  member_id: string;
  max_uses: number;
  expires_days: number;
  note: string;
};

export async function createInvite(input: InviteInput): Promise<ActionResult<string>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_invite_code", {
    p_app_role: input.app_role,
    p_position: input.position || null,
    p_email: input.email || null,
    p_member_id: input.member_id || null,
    p_max_uses: Math.min(Math.max(1, Math.round(input.max_uses) || 1), 100),
    p_expires_days: Math.min(Math.max(1, Math.round(input.expires_days) || 14), 365),
    p_note: input.note || null,
  });
  if (error) return { ok: false, error: toActionError(error) };
  revalidatePath("/members/invites");
  return { ok: true, data: data as string };
}

export async function revokeInvite(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("revoke_invite_code", { p_id: id });
  if (error) return { ok: false, error: toActionError(error) };
  revalidatePath("/members/invites");
  return { ok: true, data: undefined };
}

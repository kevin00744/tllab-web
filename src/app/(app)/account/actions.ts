"use server";

import { revalidatePath } from "next/cache";

import { getCurrentMember } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";
import { changePasswordSchema, fieldErrors, type AuthErrorKey } from "@/lib/validation";

export type PasswordFormState = {
  ok?: boolean;
  error?: AuthErrorKey | "wrongCurrentPassword";
  fields?: Record<string, AuthErrorKey>;
};

export async function changePassword(_prev: PasswordFormState, formData: FormData): Promise<PasswordFormState> {
  const parsed = changePasswordSchema.safeParse({
    currentPassword: String(formData.get("currentPassword") ?? ""),
    password: String(formData.get("password") ?? ""),
    passwordConfirm: String(formData.get("passwordConfirm") ?? ""),
  });
  if (!parsed.success) return { fields: fieldErrors(parsed.error) };

  const member = await getCurrentMember();
  if (!member?.email) return { error: "server" };
  if (!rateLimit(`password:${member.id}`, 5, 15 * 60 * 1000)) return { error: "tooManyAttempts" };

  // 先確認目前密碼，避免他人在未鎖定的電腦上直接改密碼
  const supabase = await createClient();
  const { error: verifyError } = await supabase.auth.signInWithPassword({
    email: member.email,
    password: parsed.data.currentPassword,
  });
  if (verifyError) return { error: "wrongCurrentPassword" };

  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
    data: { must_change_password: false },
  });
  if (error) {
    return error.code === "weak_password" ? { fields: { password: "passwordWeak" } } : { error: "server" };
  }
  // 重新取得 token，讓「請變更臨時密碼」提醒立即消失
  await supabase.auth.refreshSession();
  revalidatePath("/", "layout");
  return { ok: true };
}

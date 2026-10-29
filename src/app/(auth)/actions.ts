"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { rateLimit } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { fieldErrors, loginSchema, safeNext, signupSchema, type AuthErrorKey } from "@/lib/validation";

export type AuthFormState = {
  error?: AuthErrorKey;
  fields?: Record<string, AuthErrorKey>;
  values?: Record<string, string>;
};

const WINDOW_MS = 15 * 60 * 1000;

async function clientIp() {
  const h = await headers();
  return h.get("x-real-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

export async function signIn(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const raw = { email: String(formData.get("email") ?? ""), password: String(formData.get("password") ?? "") };
  const values = { email: raw.email };

  const parsed = loginSchema.safeParse(raw);
  if (!parsed.success) return { fields: fieldErrors(parsed.error), values };

  if (!rateLimit(`login:${await clientIp()}`, 20, WINDOW_MS) || !rateLimit(`login:${parsed.data.email}`, 10, WINDOW_MS)) {
    return { error: "tooManyAttempts", values };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    const wrong = error.code === "invalid_credentials" || error.status === 400;
    return { error: wrong ? "invalidCredentials" : "server", values };
  }
  redirect(safeNext(formData.get("next")));
}

export async function signUp(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const raw = {
    inviteCode: String(formData.get("inviteCode") ?? ""),
    name: String(formData.get("name") ?? ""),
    email: String(formData.get("email") ?? ""),
    password: String(formData.get("password") ?? ""),
    passwordConfirm: String(formData.get("passwordConfirm") ?? ""),
  };
  const values = { inviteCode: raw.inviteCode, name: raw.name, email: raw.email };

  const parsed = signupSchema.safeParse(raw);
  if (!parsed.success) return { fields: fieldErrors(parsed.error), values };
  const { inviteCode, name, email, password } = parsed.data;

  // 邀請碼有 64 bits，但仍限制嘗試次數，避免暴力猜測
  if (!rateLimit(`signup:${await clientIp()}`, 10, WINDOW_MS)) {
    return { error: "tooManyAttempts", values };
  }

  const admin = createAdminClient();

  // 1. 佔用邀請碼
  const { data: inviteId, error: claimError } = await admin.rpc("claim_invite_code", {
    p_code: inviteCode,
    p_email: email,
  });
  if (claimError || !inviteId) {
    // 錯誤碼對應 supabase/migrations/20261029000005_invite_codes.sql
    if (claimError?.code === "23505") return { error: "emailBelongsToOther", values };
    if (claimError?.code === "22023") return { error: "inviteInvalid", values };
    console.error("claim_invite_code failed", claimError);
    return { error: "server", values };
  }

  // 2. 建立帳號（不寄信，直接視為已驗證）
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: name },
  });
  if (createError || !created.user) {
    await admin.rpc("release_invite_code", { p_invite_id: inviteId });
    if (createError?.code === "email_exists" || createError?.status === 422) {
      return { error: "emailTaken", values };
    }
    if (createError?.code === "weak_password") return { fields: { password: "passwordWeak" }, values };
    console.error("createUser failed", createError);
    return { error: "server", values };
  }

  // 3. 套用邀請碼的權限與職稱
  const { error: completeError } = await admin.rpc("complete_invite_signup", {
    p_invite_id: inviteId,
    p_user_id: created.user.id,
  });
  if (completeError) console.error("complete_invite_signup failed", completeError);

  // 4. 直接登入
  const supabase = await createClient();
  const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
  if (signInError) redirect("/login");
  redirect("/");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

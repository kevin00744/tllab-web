import { z } from "zod";

import type { Dictionary } from "@/lib/i18n";

export type AuthErrorKey = keyof Dictionary["auth"]["errors"];

// 與 Supabase「Minimum password length = 8、Letters and digits」設定一致
export const passwordSchema = z
  .string()
  .min(8, "passwordWeak")
  .max(72, "passwordWeak")
  .regex(/[A-Za-z]/, "passwordWeak")
  .regex(/[0-9]/, "passwordWeak");

export const emailSchema = z.string().trim().toLowerCase().max(254, "invalidEmail").pipe(z.email("invalidEmail"));

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "passwordRequired"),
});

export const signupSchema = z
  .object({
    inviteCode: z.string().trim().min(1, "inviteRequired").max(64, "inviteInvalid"),
    name: z.string().trim().min(1, "nameRequired").max(80, "nameRequired"),
    email: emailSchema,
    password: passwordSchema,
    passwordConfirm: z.string(),
  })
  .refine((v) => v.password === v.passwordConfirm, { path: ["passwordConfirm"], message: "passwordMismatch" });

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "passwordRequired"),
    password: passwordSchema,
    passwordConfirm: z.string(),
  })
  .refine((v) => v.password === v.passwordConfirm, { path: ["passwordConfirm"], message: "passwordMismatch" });

/** 把 zod 錯誤轉成 { 欄位: 錯誤 key }，只取每個欄位的第一個錯誤 */
export function fieldErrors(error: z.ZodError): Record<string, AuthErrorKey> {
  const out: Record<string, AuthErrorKey> = {};
  for (const issue of error.issues) {
    const field = String(issue.path[0] ?? "form");
    out[field] ??= issue.message as AuthErrorKey;
  }
  return out;
}

/** 只允許站內相對路徑，避免 open redirect */
export function safeNext(value: unknown): string {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//") && !value.startsWith("/\\")
    ? value
    : "/";
}

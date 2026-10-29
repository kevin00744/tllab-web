import "server-only";

import type { PostgrestError } from "@supabase/supabase-js";

import type { Dictionary } from "@/lib/i18n";

export type ActionError = keyof Dictionary["errors"];
export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: ActionError };

const VALIDATION: ActionError[] = [
  "titleRequired",
  "dateOrder",
  "progressRange",
  "contentTooLong",
  "nameRequired",
  "emailInvalid",
  "emailTaken",
  "cannotDeleteSelf",
  "slugInvalid",
  "slugTaken",
  "invalidParent",
  "dateRequired",
];

/** 資料庫函式的錯誤碼 → 介面訊息 key（見 migration 08 開頭說明） */
export function toActionError(error: PostgrestError): ActionError {
  if (error.message === "adminProtected") return "adminProtected";
  // members_protect_admin trigger（migration 11）
  if (error.message.includes("至少需要保留一位系統管理員")) return "lastSystemAdmin";
  if (error.code === "42501") return "noPermission";
  if (error.code === "P0002") return "notFound";
  if (error.code === "40001") return "conflict";
  // members_keep_one_admin trigger（migration 02）
  if (error.message.includes("至少需要保留一位 Admin")) return "lastAdmin";
  if (error.code === "22023" && VALIDATION.includes(error.message as ActionError)) return error.message as ActionError;
  console.error("rpc failed", error);
  return "server";
}

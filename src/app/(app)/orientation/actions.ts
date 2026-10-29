"use server";

import { revalidatePath } from "next/cache";

import { toActionError, type ActionResult } from "@/lib/actions";
import { createClient } from "@/lib/supabase/server";

export type DocumentInput = {
  id?: string;
  title: string;
  emoji: string;
  parent_id: string;
  slug: string;
  sort_order: string;
};

/** 新增或更新頁面資訊，回傳網址代稱 */
export async function saveDocument(input: DocumentInput): Promise<ActionResult<string>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("save_document", { p: input });
  if (error) return { ok: false, error: toActionError(error) };
  revalidatePath("/orientation", "layout");
  return { ok: true, data: data as string };
}

export async function saveDocumentContent(id: string, content: string, version: number): Promise<ActionResult<number>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("save_document_content", { p_id: id, p_content: content, p_version: version });
  if (error) return { ok: false, error: toActionError(error) };
  revalidatePath("/orientation", "layout");
  return { ok: true, data: data as number };
}

export async function deleteDocument(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_document", { p_id: id });
  if (error) return { ok: false, error: toActionError(error) };
  revalidatePath("/orientation", "layout");
  return { ok: true, data: undefined };
}

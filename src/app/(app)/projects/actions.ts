"use server";

import { revalidatePath } from "next/cache";

import { toActionError, type ActionResult } from "@/lib/actions";
import { getCurrentMember } from "@/lib/auth";
import { convertToPdf } from "@/lib/convert";
import { isUuid } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";

export type ProjectInput = {
  id?: string;
  title: string;
  emoji: string;
  description: string;
  status: string;
  owner_id: string;
  member_ids: string[];
  start_date: string;
  due_date: string;
  progress: number;
  tags: string[];
};

export async function saveProject(input: ProjectInput): Promise<ActionResult<string>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("save_project", { p: input });
  if (error) return { ok: false, error: toActionError(error) };
  revalidatePath("/", "layout");
  return { ok: true, data: data as string };
}

export async function deleteProject(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_project", { p_id: id });
  if (error) return { ok: false, error: toActionError(error) };
  revalidatePath("/", "layout");
  return { ok: true, data: undefined };
}

// -----------------------------------------------------------------------------
// 專案頁面內容（自動儲存）
// -----------------------------------------------------------------------------
export async function saveProjectContent(id: string, content: string, version: number): Promise<ActionResult<number>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("save_project_content", {
    p_id: id,
    p_content: content,
    p_version: version,
  });
  if (error) return { ok: false, error: toActionError(error) };
  return { ok: true, data: data as number };
}

// -----------------------------------------------------------------------------
// 進度報告檔案：瀏覽器先直接上傳到 Storage，再由這裡登記（PPT 轉 PDF 預覽）
// -----------------------------------------------------------------------------
const BUCKET = "attachments";
const SLIDE_EXT = ["ppt", "pptx", "pdf"];

export async function registerProjectFile(input: {
  projectId: string;
  path: string;
  fileName: string;
  size: number;
  mime: string;
}): Promise<ActionResult> {
  if (!isUuid(input.projectId)) return { ok: false, error: "server" };
  const ext = input.fileName.split(".").pop()?.toLowerCase() ?? "";
  // 只接受自己專案資料夾下、檔名為 uuid 的路徑
  const pathOk = new RegExp(`^project/${input.projectId}/[0-9a-f-]{36}\\.(ppt|pptx|pdf)$`).test(input.path);
  if (!SLIDE_EXT.includes(ext) || !pathOk) return { ok: false, error: "server" };

  const supabase = await createClient();
  let previewPath: string | null = null;
  let previewError: string | null = null;

  if (ext === "pdf") {
    previewPath = input.path;
  } else {
    try {
      const { data: blob, error } = await supabase.storage.from(BUCKET).download(input.path);
      if (error || !blob) throw error ?? new Error("download failed");
      const pdf = await convertToPdf(Buffer.from(await blob.arrayBuffer()), ext);
      const target = input.path.replace(/\.(pptx?|PPTX?)$/, ".preview.pdf");
      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(target, pdf, { contentType: "application/pdf", upsert: true });
      if (upErr) throw upErr;
      previewPath = target;
    } catch (e) {
      console.error("slide conversion failed", e);
      previewError = "convert_failed";
    }
  }

  const member = await getCurrentMember();
  const { error } = await supabase.from("attachments").insert({
    entity_type: "project",
    entity_id: input.projectId,
    bucket: BUCKET,
    storage_path: input.path,
    file_name: input.fileName.slice(0, 200),
    mime_type: input.mime || null,
    size_bytes: input.size,
    kind: "slides",
    preview_path: previewPath,
    preview_error: previewError,
    uploaded_by: member?.id,
  });
  if (error) {
    await supabase.storage.from(BUCKET).remove([input.path, ...(previewPath && previewPath !== input.path ? [previewPath] : [])]);
    return { ok: false, error: toActionError(error) };
  }
  revalidatePath(`/projects/${input.projectId}`);
  return { ok: true, data: undefined };
}

/** 預覽與下載用的短效網址（1 小時） */
export async function getFileUrls(id: string): Promise<ActionResult<{ preview: string | null; download: string }>> {
  const supabase = await createClient();
  const { data: row, error } = await supabase
    .from("attachments")
    .select("storage_path, preview_path, file_name")
    .eq("id", id)
    .maybeSingle();
  if (error || !row) return { ok: false, error: "notFound" };
  const bucket = supabase.storage.from(BUCKET);
  const [preview, download] = await Promise.all([
    row.preview_path ? bucket.createSignedUrl(row.preview_path, 3600) : Promise.resolve(null),
    bucket.createSignedUrl(row.storage_path, 3600, { download: row.file_name }),
  ]);
  if (download.error) return { ok: false, error: "server" };
  return { ok: true, data: { preview: preview?.data?.signedUrl ?? null, download: download.data.signedUrl } };
}

export async function deleteProjectFile(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: row } = await supabase
    .from("attachments")
    .select("entity_id, storage_path, preview_path")
    .eq("id", id)
    .maybeSingle();
  if (!row) return { ok: false, error: "notFound" };
  const { data: deleted, error } = await supabase.from("attachments").delete().eq("id", id).select("id");
  if (error) return { ok: false, error: toActionError(error) };
  if (!deleted?.length) return { ok: false, error: "noPermission" };
  const paths = [row.storage_path, row.preview_path].filter((p, i, a): p is string => !!p && a.indexOf(p) === i);
  await supabase.storage.from(BUCKET).remove(paths);
  revalidatePath(`/projects/${row.entity_id}`);
  return { ok: true, data: undefined };
}

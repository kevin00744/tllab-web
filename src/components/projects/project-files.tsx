"use client";

import { DownloadIcon, ExternalLinkIcon, EyeIcon, FileTextIcon, PresentationIcon, Trash2Icon, UploadIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { deleteProjectFile, getFileUrls, registerProjectFile } from "@/app/(app)/projects/actions";
import { ConfirmDelete } from "@/components/common/confirm-delete";
import { SlidesViewer } from "@/components/projects/slides-viewer";
import { EmptyBlock } from "@/components/common/field";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatDateTime } from "@/lib/date";
import { format } from "@/lib/i18n";
import { useI18n } from "@/lib/i18n/client";
import { createClient } from "@/lib/supabase/client";
import type { Attachment } from "@/types/entities";

const MAX_BYTES = 50 * 1024 * 1024;
const ACCEPT = ".ppt,.pptx,.pdf";
const MIME: Record<string, string> = {
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  pdf: "application/pdf",
};

function formatSize(bytes: number | null) {
  if (!bytes) return "";
  return bytes < 1024 * 1024 ? `${Math.ceil(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function ProjectFiles({ projectId, files, editable }: { projectId: string; files: Attachment[]; editable: boolean }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<"idle" | "uploading" | "converting">("idle");
  const [preview, setPreview] = useState<{ file: Attachment; url: string | null; download: string } | null>(null);
  const [, startTransition] = useTransition();

  async function upload(file: File) {
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (!MIME[ext]) return toast.error(t.projectFiles.badType);
    if (file.size > MAX_BYTES) return toast.error(t.projectFiles.tooLarge);

    setPhase("uploading");
    const path = `project/${projectId}/${crypto.randomUUID()}.${ext}`;
    // 直接從瀏覽器上傳到 Supabase Storage（權限由 Storage policy 檢查）
    const { error } = await createClient()
      .storage.from("attachments")
      .upload(path, await file.arrayBuffer(), { contentType: file.type || MIME[ext], upsert: false });
    if (error) {
      setPhase("idle");
      return toast.error(t.errors.uploadFailed);
    }
    if (ext !== "pdf") setPhase("converting");
    const result = await registerProjectFile({ projectId, path, fileName: file.name, size: file.size, mime: file.type || MIME[ext] });
    setPhase("idle");
    if (!result.ok) return toast.error(t.errors[result.error]);
    toast.success(t.projectFiles.uploaded);
    startTransition(() => router.refresh());
  }

  async function open(file: Attachment) {
    const result = await getFileUrls(file.id);
    if (!result.ok) return toast.error(t.errors[result.error]);
    setPreview({ file, url: result.data.preview, download: result.data.download });
  }

  async function download(file: Attachment) {
    const result = await getFileUrls(file.id);
    if (!result.ok) return toast.error(t.errors[result.error]);
    window.location.href = result.data.download;
  }

  return (
    <section className="mb-8">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold">
            {t.projectFiles.title} <span className="text-sm font-normal text-muted-foreground">{files.length}</span>
          </h2>
          {editable ? <p className="text-xs text-muted-foreground">{t.projectFiles.hint}</p> : null}
        </div>
        {editable ? (
          <>
            <Button size="sm" variant="outline" disabled={phase !== "idle"} onClick={() => inputRef.current?.click()}>
              <UploadIcon />
              {phase === "uploading" ? t.projectFiles.uploading : phase === "converting" ? t.projectFiles.converting : t.projectFiles.upload}
            </Button>
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPT}
              className="hidden"
              data-testid="upload-slides"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void upload(file);
                e.target.value = "";
              }}
            />
          </>
        ) : null}
      </div>

      {files.length === 0 ? (
        <EmptyBlock>{t.projectFiles.empty}</EmptyBlock>
      ) : (
        <ul className="divide-y rounded-xl border">
          {files.map((f) => {
            const isPdfOnly = f.file_name.toLowerCase().endsWith(".pdf");
            return (
              <li key={f.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5" data-file-id={f.id}>
                {isPdfOnly ? (
                  <FileTextIcon className="size-5 shrink-0 text-status-red-fg" />
                ) : (
                  <PresentationIcon className="size-5 shrink-0 text-status-amber-fg" />
                )}
                <button
                  type="button"
                  onClick={() => void open(f)}
                  className="min-w-0 flex-1 text-left hover:underline focus-visible:underline focus-visible:outline-none"
                >
                  <div className="truncate text-sm font-medium">{f.title}</div>
                  <div className="text-xs text-muted-foreground">
                    {format(t.projectFiles.uploadedBy, {
                      name: f.uploaded_by?.name ?? "—",
                      date: formatDateTime(locale, f.created_at, { dateStyle: "medium" }),
                    })}
                    {f.size_bytes ? ` · ${formatSize(f.size_bytes)}` : ""}
                    {f.preview_error ? <span className="ml-1 text-status-amber-fg">· {t.projectFiles.previewFailed}</span> : null}
                  </div>
                </button>
                <div className="flex items-center gap-1">
                  <Button size="sm" variant="ghost" onClick={() => void open(f)} disabled={!f.preview_path}>
                    <EyeIcon /> {t.projectFiles.preview}
                  </Button>
                  <Button size="icon-sm" variant="ghost" aria-label={t.projectFiles.download} onClick={() => void download(f)}>
                    <DownloadIcon />
                  </Button>
                  {f.deletable ? (
                    <ConfirmDelete
                      name={f.title}
                      trigger={
                        <Button size="icon-sm" variant="ghost" aria-label={t.common.delete} className="text-destructive hover:text-destructive">
                          <Trash2Icon />
                        </Button>
                      }
                      onConfirm={async () => {
                        const result = await deleteProjectFile(f.id);
                        if (!result.ok) {
                          toast.error(t.errors[result.error]);
                          return false;
                        }
                        toast.success(t.common.deleted);
                        router.refresh();
                        return true;
                      }}
                    />
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        {preview ? (
          <DialogContent className="h-[calc(100dvh-2rem)] max-w-6xl sm:max-w-6xl" closeLabel={t.common.close}>
            <DialogHeader className="pb-2">
              <DialogTitle className="truncate">{preview.file.title}</DialogTitle>
              <DialogDescription className="flex flex-wrap gap-3">
                {preview.url ? (
                  <a href={preview.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                    <ExternalLinkIcon className="size-3.5" /> {t.projectFiles.openNewTab}
                  </a>
                ) : null}
                <a href={preview.download} className="inline-flex items-center gap-1 text-primary hover:underline">
                  <DownloadIcon className="size-3.5" /> {t.projectFiles.download}
                </a>
              </DialogDescription>
            </DialogHeader>
            <div className="min-h-0 flex-1 px-4 pb-4">
              {preview.url ? (
                <SlidesViewer url={preview.url} title={preview.file.title} />
              ) : (
                <EmptyBlock>{preview.file.preview_error ? t.projectFiles.previewFailed : t.projectFiles.noPreview}</EmptyBlock>
              )}
            </div>
          </DialogContent>
        ) : null}
      </Dialog>
    </section>
  );
}

"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { CheckIcon, Loader2Icon, PencilIcon, TriangleAlertIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { saveProjectContent } from "@/app/(app)/projects/actions";
import { Markdown } from "@/components/markdown";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

// 編輯器只在點擊編輯時才載入，平常顯示維持輕量、快速
const MarkdownEditor = dynamic(() => import("@/components/editor/markdown-editor").then((m) => m.MarkdownEditor), {
  ssr: false,
  loading: () => <div className="min-h-24 animate-pulse rounded-md bg-muted/50" />,
});

type Status = "idle" | "dirty" | "saving" | "saved" | "failed" | "conflict";
const DEBOUNCE_MS = 1000;

export function ProjectDoc({
  projectId,
  content,
  version,
  editable,
}: {
  projectId: string;
  content: string;
  version: number;
  editable: boolean;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(content);
  const [status, setStatus] = useState<Status>("idle");

  // 伺服器資料更新（例如他人修改後重新整理）且目前沒在編輯時，採用新內容
  const [source, setSource] = useState({ content, version });
  if (!editing && (source.content !== content || source.version !== version)) {
    setSource({ content, version });
    setText(content);
  }

  const versionRef = useRef(version);
  const latest = useRef(content);
  const saving = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const statusRef = useRef<Status>("idle");
  const setStatusBoth = (s: Status) => {
    statusRef.current = s;
    setStatus(s);
  };

  // 計時器一律呼叫最新的 flush（透過 ref），避免使用到舊的 closure
  const flushRef = useRef<() => Promise<void>>(async () => {});
  async function flush() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (saving.current || statusRef.current === "conflict") return;
    if (latest.current === source.content && versionRef.current === source.version && statusRef.current !== "dirty") return;
    saving.current = true;
    setStatusBoth("saving");
    const body = latest.current;
    const result = await saveProjectContent(projectId, body, versionRef.current);
    saving.current = false;
    if (result.ok) {
      versionRef.current = result.data;
      setSource({ content: body, version: result.data });
      if (latest.current !== body) {
        setStatusBoth("dirty");
        void flushRef.current();
      } else setStatusBoth("saved");
    } else if (result.error === "conflict") {
      setStatusBoth("conflict");
    } else {
      setStatusBoth("failed");
      if (result.error === "contentTooLong") toast.error(t.projectDoc.tooLong);
      timer.current = setTimeout(() => void flushRef.current(), 5000);
    }
  }
  useEffect(() => {
    flushRef.current = flush;
  });

  function onChange(markdown: string) {
    latest.current = markdown;
    setText(markdown);
    if (statusRef.current === "conflict") return;
    setStatusBoth("dirty");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flushRef.current(), DEBOUNCE_MS);
  }

  function startEditing() {
    if (!editable) return;
    versionRef.current = source.version;
    latest.current = text;
    setStatusBoth("idle");
    setEditing(true);
  }

  async function finish() {
    await flush();
    if (statusRef.current === "conflict") return;
    setEditing(false);
    router.refresh();
  }

  // 離開頁面前若尚未儲存，提醒使用者
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (statusRef.current === "dirty" || statusRef.current === "saving" || statusRef.current === "failed") {
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

  const statusLabel: Record<Status, React.ReactNode> = {
    idle: null,
    dirty: <span>{t.projectDoc.unsaved}</span>,
    saving: (
      <span className="inline-flex items-center gap-1">
        <Loader2Icon className="size-3.5 animate-spin" /> {t.projectDoc.saving}
      </span>
    ),
    saved: (
      <span className="inline-flex items-center gap-1">
        <CheckIcon className="size-3.5" /> {t.projectDoc.saved}
      </span>
    ),
    failed: (
      <span className="inline-flex items-center gap-1 text-status-red-fg">
        <TriangleAlertIcon className="size-3.5" /> {t.projectDoc.failed}
      </span>
    ),
    conflict: null,
  };

  if (!editing) {
    return (
      <div
        role={editable ? "button" : undefined}
        tabIndex={editable ? 0 : undefined}
        onClick={startEditing}
        onKeyDown={(e) => {
          if (e.key === "Enter" && e.target === e.currentTarget) startEditing();
        }}
        aria-label={editable ? t.projectDoc.clickToEdit : undefined}
        title={editable ? t.projectDoc.clickToEdit : undefined}
        data-testid="project-doc"
        className={cn(
          "group relative -mx-3 rounded-lg px-3 py-2",
          editable && "cursor-text transition-colors hover:bg-accent/40 focus-visible:bg-accent/40 focus-visible:outline-none",
        )}
      >
        {text.trim() ? (
          <Markdown>{text}</Markdown>
        ) : (
          <p className="py-2 text-sm text-muted-foreground">{editable ? t.projectDoc.emptyEditable : t.projectDoc.empty}</p>
        )}
        {editable ? (
          <PencilIcon className="absolute top-2 right-2 size-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
        ) : null}
      </div>
    );
  }

  return (
    <div data-testid="project-doc-editing">
      {status === "conflict" ? (
        <div role="alert" className="mb-3 flex flex-wrap items-center gap-2 rounded-md bg-status-amber-bg px-3 py-2 text-sm text-status-amber-fg">
          <TriangleAlertIcon className="size-4" />
          <span className="flex-1">{t.projectDoc.conflict}</span>
          <Button
            size="sm"
            variant="outline"
            onClick={async () => {
              await navigator.clipboard.writeText(latest.current).catch(() => {});
              toast.success(t.projectDoc.copied);
            }}
          >
            {t.projectDoc.conflictCopy}
          </Button>
          <Button
            size="sm"
            onClick={() => {
              setEditing(false);
              setStatusBoth("idle");
              router.refresh();
            }}
          >
            {t.projectDoc.conflictReload}
          </Button>
        </div>
      ) : null}
      <div className="mb-2 flex items-center justify-end gap-3 text-xs text-muted-foreground">
        <span data-testid="save-status" aria-live="polite">
          {statusLabel[status]}
        </span>
        <Button size="sm" onClick={() => void finish()}>
          {t.projectDoc.done}
        </Button>
      </div>
      <MarkdownEditor initial={text} placeholder={t.projectDoc.placeholder} onChange={onChange} onEscape={() => void finish()} />
    </div>
  );
}

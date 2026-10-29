"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { CheckIcon, Loader2Icon, PencilIcon, TriangleAlertIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Markdown } from "@/components/markdown";
import { Button } from "@/components/ui/button";
import type { ActionResult } from "@/lib/actions";
import { useI18n } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

// 編輯器只在點擊編輯時才載入，平常顯示維持輕量、快速
const MarkdownEditor = dynamic(() => import("@/components/editor/markdown-editor").then((m) => m.MarkdownEditor), {
  ssr: false,
  loading: () => <div className="min-h-24 animate-pulse rounded-md bg-muted/50" />,
});

type Status = "idle" | "dirty" | "saving" | "saved" | "failed" | "conflict";
const DEBOUNCE_MS = 1000;

/**
 * 類 Notion 的即時編輯區：平常顯示 Markdown（伺服器端渲染、快速），點擊即編輯、自動儲存，
 * 點其他地方回到預覽。以版本號偵測同時編輯，不會覆蓋別人剛存的內容。
 */
export function InlineDoc({
  content,
  version,
  editable,
  save,
  emptyText,
  emptyEditableText,
  testId = "inline-doc",
  anchors = false,
}: {
  content: string;
  version: number;
  editable: boolean;
  /** 儲存並回傳新版本號；版本不符時回傳 conflict */
  save: (content: string, version: number) => Promise<ActionResult<number>>;
  emptyText?: string;
  emptyEditableText?: string;
  testId?: string;
  /** 標題加上 id，供目錄連結 */
  anchors?: boolean;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(content);
  const [status, setStatus] = useState<Status>("idle");

  // 伺服器資料較新（例如他人修改後重新整理）且目前沒在編輯時，採用新內容。
  // 只比較版本號：剛存完、重新整理還沒回來時，舊的 props 不會蓋掉剛存的內容
  const [source, setSource] = useState({ content, version });
  if (!editing && version > source.version) {
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
    const result = await save(body, versionRef.current);
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

  const finishing = useRef(false);
  async function finish() {
    if (finishing.current) return;
    finishing.current = true;
    try {
      await flush();
      // 前一次儲存還在進行時，等它完成再回到預覽
      while (saving.current) await new Promise((r) => setTimeout(r, 50));
      if (statusRef.current === "conflict") return;
      setEditing(false);
      router.refresh();
    } finally {
      finishing.current = false;
    }
  }

  // 編輯中點擊編輯區以外（或用 Tab 離開）時，自動儲存並回到預覽
  const areaRef = useRef<HTMLDivElement>(null);
  const finishRef = useRef(finish);
  useEffect(() => {
    finishRef.current = finish;
  });
  useEffect(() => {
    if (!editing) return;
    const inside = (target: EventTarget | null) =>
      target instanceof Node &&
      (!!areaRef.current?.contains(target) || (target instanceof Element && !!target.closest("[data-editor-popup]")));
    const onPointerDown = (e: PointerEvent) => {
      if (!inside(e.target)) void finishRef.current();
    };
    const onFocusOut = (e: FocusEvent) => {
      if (e.relatedTarget && !inside(e.relatedTarget)) void finishRef.current();
    };
    document.addEventListener("pointerdown", onPointerDown);
    const area = areaRef.current;
    area?.addEventListener("focusout", onFocusOut);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      area?.removeEventListener("focusout", onFocusOut);
    };
  }, [editing]);

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
        data-testid={testId}
        className={cn(
          "group relative -mx-3 rounded-lg px-3 py-2",
          editable && "cursor-text transition-colors hover:bg-accent/40 focus-visible:bg-accent/40 focus-visible:outline-none",
        )}
      >
        {text.trim() ? (
          <Markdown anchors={anchors}>{text}</Markdown>
        ) : (
          <p className="py-2 text-sm text-muted-foreground">{editable ? (emptyEditableText ?? t.projectDoc.emptyEditable) : (emptyText ?? t.projectDoc.empty)}</p>
        )}
        {editable ? (
          <PencilIcon className="absolute top-2 right-2 size-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
        ) : null}
      </div>
    );
  }

  return (
    <div ref={areaRef} data-testid={`${testId}-editing`}>
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

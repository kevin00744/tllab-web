"use client";

import { ChevronLeftIcon, ChevronRightIcon, Loader2Icon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";

import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n/client";

/**
 * 簡報檢視器：以 pdf.js 把 PDF 逐頁畫到 canvas。
 * 不依賴瀏覽器內建的 PDF 外掛，手機（Android Chrome、LINE 內建瀏覽器）也能預覽。
 */
export function SlidesViewer({ url, title }: { url: string; title: string }) {
  const { t } = useI18n();
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [page, setPage] = useState(1);
  const [width, setWidth] = useState(0);
  const [height, setHeight] = useState(0);
  const [failed, setFailed] = useState(false);

  // 載入 PDF
  useEffect(() => {
    let cancelled = false;
    let loading: { destroy: () => Promise<void> } | null = null;
    (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.min.mjs";
        const task = pdfjs.getDocument({
          url,
          cMapUrl: "/pdfjs/cmaps/",
          cMapPacked: true,
          standardFontDataUrl: "/pdfjs/standard_fonts/",
          wasmUrl: "/pdfjs/wasm/",
        });
        loading = task;
        const loaded = await task.promise;
        if (!cancelled) setDoc(loaded);
      } catch (e) {
        console.warn("pdf load failed", e);
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
      void loading?.destroy();
    };
  }, [url]);

  // 依容器大小縮放
  useEffect(() => {
    if (!box.current) return;
    const ro = new ResizeObserver(([entry]) => {
      setWidth(entry.contentRect.width);
      setHeight(entry.contentRect.height);
    });
    ro.observe(box.current);
    return () => ro.disconnect();
  }, []);

  // 畫出目前頁面
  useEffect(() => {
    if (!doc || !canvas.current || width === 0) return;
    let task: { cancel: () => void; promise: Promise<unknown> } | null = null;
    let cancelled = false;
    (async () => {
      const p = await doc.getPage(page);
      if (cancelled) return;
      const base = p.getViewport({ scale: 1 });
      const scale = Math.min(width / base.width, (height || Infinity) / base.height);
      const dpr = window.devicePixelRatio || 1;
      const viewport = p.getViewport({ scale: scale * dpr });
      const el = canvas.current!;
      el.width = Math.floor(viewport.width);
      el.height = Math.floor(viewport.height);
      el.style.width = `${Math.floor(viewport.width / dpr)}px`;
      el.style.height = `${Math.floor(viewport.height / dpr)}px`;
      task = p.render({ canvas: el, viewport });
      await task.promise.catch(() => {});
      if (!cancelled) el.dataset.renderedPage = String(page);
    })();
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [doc, page, width, height]);

  const total = doc?.numPages ?? 0;
  const go = (delta: number) => setPage((p) => Math.min(Math.max(1, p + delta), total || 1));

  return (
    <div
      className="flex h-full flex-col gap-2 outline-none"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight" || e.key === "PageDown") go(1);
        if (e.key === "ArrowLeft" || e.key === "PageUp") go(-1);
      }}
      aria-label={title}
    >
      <div ref={box} className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-md border bg-muted/60">
        {failed ? (
          <p className="text-sm text-muted-foreground">{t.projectFiles.previewFailed}</p>
        ) : !doc ? (
          <Loader2Icon className="size-6 animate-spin text-muted-foreground" />
        ) : null}
        <canvas ref={canvas} data-testid="slides-canvas" className={doc ? "bg-white shadow-sm" : "hidden"} />
      </div>
      {total > 0 ? (
        <div className="flex items-center justify-center gap-3">
          <Button size="icon-sm" variant="outline" aria-label={t.projectFiles.prevSlide} disabled={page <= 1} onClick={() => go(-1)}>
            <ChevronLeftIcon />
          </Button>
          <span className="min-w-16 text-center text-sm tabular-nums" data-testid="slides-page">
            {page} / {total}
          </span>
          <Button size="icon-sm" variant="outline" aria-label={t.projectFiles.nextSlide} disabled={page >= total} onClick={() => go(1)}>
            <ChevronRightIcon />
          </Button>
        </div>
      ) : null}
    </div>
  );
}

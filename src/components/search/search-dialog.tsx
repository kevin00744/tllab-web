"use client";

import { CornerDownLeftIcon, Loader2Icon, SearchIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { searchAction } from "@/app/(app)/search/actions";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { format } from "@/lib/i18n";
import { useI18n } from "@/lib/i18n/client";
import { groupHits, hrefFor, type SearchHit } from "@/lib/search";
import { plainExcerpt } from "@/lib/text";
import { cn } from "@/lib/utils";
import { Highlight } from "./highlight";
import { EntityIcon } from "@/components/common/entity-icon";

/** 全站搜尋：頁首按鈕或 Ctrl／⌘＋K、「/」開啟；方向鍵選擇、Enter 前往 */
const EMPTY: SearchHit[] = [];

export function SearchDialog() {
  const { t } = useI18n();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  // 結果與其查詢字詞一起保存：字詞改變後不顯示上一個查詢的結果
  const [result, setResult] = useState<{ term: string; hits: SearchHit[] }>({ term: "", hits: [] });
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const request = useRef(0);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing = !!target && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === "/" && !typing && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // 輸入停頓 200ms 後查詢；只採用最新一次的回應
  useEffect(() => {
    const term = q.trim();
    const id = ++request.current;
    const timer = setTimeout(
      async () => {
        if (!term) {
          setResult({ term: "", hits: [] });
          setLoading(false);
          return;
        }
        setLoading(true);
        const found = await searchAction(term);
        if (id !== request.current) return;
        setResult({ term, hits: found });
        setActive(0);
        setLoading(false);
      },
      term ? 200 : 0,
    );
    return () => clearTimeout(timer);
  }, [q]);

  const term = q.trim();
  const hits = result.term === term ? result.hits : EMPTY;
  const groups = useMemo(() => groupHits(hits), [hits]);
  const flat = useMemo(() => groups.flatMap((g) => g.hits).filter((h) => hrefFor(h)), [groups]);

  function go(href: string) {
    setOpen(false);
    setQ("");
    router.push(href);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!flat.length) return;
      const next = (active + (e.key === "ArrowDown" ? 1 : -1) + flat.length) % flat.length;
      setActive(next);
      listRef.current?.querySelector(`[data-index="${next}"]`)?.scrollIntoView({ block: "nearest" });
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (e.metaKey || e.ctrlKey || !flat[active]) {
        if (term) go(`/search?q=${encodeURIComponent(term)}`);
      } else {
        go(hrefFor(flat[active])!);
      }
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        data-testid="search-trigger"
        className="flex h-8 w-full max-w-xs items-center gap-2 rounded-md border bg-muted/40 px-2.5 text-sm text-muted-foreground hover:bg-muted"
      >
        <SearchIcon className="size-4" />
        <span className="flex-1 truncate text-left">{t.header.search}</span>
        <kbd className="hidden rounded border bg-background px-1.5 font-mono text-[11px] sm:inline">⌘K</kbd>
      </button>
      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) setQ("");
        }}
      >
        <DialogContent className="top-[12%] translate-y-0 gap-0 p-0 sm:max-w-xl" closeLabel={t.common.close}>
          <DialogTitle className="sr-only">{t.search.title}</DialogTitle>
          <DialogDescription className="sr-only">{t.search.hint}</DialogDescription>
          <div className="flex items-center gap-2 border-b px-4">
            {loading ? <Loader2Icon className="size-4 animate-spin text-muted-foreground" /> : <SearchIcon className="size-4 text-muted-foreground" />}
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={t.search.placeholder}
              aria-label={t.search.placeholder}
              role="combobox"
              aria-expanded={flat.length > 0}
              aria-controls="search-results"
              aria-activedescendant={flat[active] ? `search-hit-${active}` : undefined}
              className="h-12 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground sm:text-sm"
            />
          </div>
          <div ref={listRef} id="search-results" role="listbox" className="max-h-[60vh] overflow-y-auto p-2">
            {!term ? (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">{t.search.hint}</p>
            ) : !loading && result.term === term && hits.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">{format(t.search.noResults, { q: term })}</p>
            ) : (
              groups.map((g) => (
                <div key={g.type} className="mb-1">
                  <div className="px-3 pt-2 pb-1 text-xs font-medium text-muted-foreground">{t.search.types[g.type]}</div>
                  {g.hits.map((h) => {
                    const href = hrefFor(h);
                    if (!href) return null;
                    const index = flat.indexOf(h);
                    return (
                      <button
                        key={`${h.entity_type}-${h.id}`}
                        type="button"
                        role="option"
                        id={`search-hit-${index}`}
                        data-index={index}
                        aria-selected={index === active}
                        onMouseMove={() => setActive(index)}
                        onClick={() => go(href)}
                        className={cn(
                          "flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm",
                          index === active && "bg-accent",
                        )}
                      >
                        <span className="w-5 shrink-0 text-center" aria-hidden>
                          <EntityIcon value={h.emoji} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">
                            <Highlight text={h.title} term={term} />
                          </span>
                          {h.subtitle ? <span className="block truncate text-xs text-muted-foreground">{plainExcerpt(h.subtitle, 90)}</span> : null}
                        </span>
                        {index === active ? <CornerDownLeftIcon className="size-3.5 shrink-0 text-muted-foreground" /> : null}
                      </button>
                    );
                  })}
                </div>
              ))
            )}
          </div>
          {term ? (
            <div className="flex items-center justify-between border-t px-4 py-2 text-xs text-muted-foreground">
              <span>{t.search.keys}</span>
              <button type="button" className="hover:text-foreground hover:underline" onClick={() => go(`/search?q=${encodeURIComponent(term)}`)}>
                {t.search.viewAll}
              </button>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

"use client";

import { SendIcon } from "lucide-react";
import { useLayoutEffect, useMemo, useRef, useState } from "react";

import { EntityIcon } from "@/components/common/entity-icon";
import { MemberAvatar } from "@/components/layout/user-menu";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { decodeBody, encodeBody, type Picked } from "@/lib/board";
import { useI18n } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import type { MemberBrief } from "@/types/entities";

export type BoardOptions = {
  members: MemberBrief[];
  projects: { id: string; title: string; emoji: string }[];
};

type Suggest = { kind: "@" | "#"; start: number; query: string; index: number };
type Option = { kind: "@" | "#"; id: string; name: string; avatar_url?: string | null; emoji?: string };

/** 游標前是「@關鍵字」或「#關鍵字」時開啟選單（行首或空白後） */
function suggestAt(text: string, caret: number): Omit<Suggest, "index"> | null {
  const m = /(?:^|\s)([@#])([^\s@#]{0,30})$/u.exec(text.slice(0, caret));
  return m ? { kind: m[1] as "@" | "#", start: caret - m[2].length - 1, query: m[2] } : null;
}

/** 留言輸入框：@ 提及成員、# 標註專案（從選單選擇後送出時轉成標註格式） */
export function BoardComposer({
  options,
  initial = "",
  placeholder,
  submitLabel,
  autoFocus = false,
  onSubmit,
  onCancel,
}: {
  options: BoardOptions;
  initial?: string;
  placeholder: string;
  submitLabel: string;
  autoFocus?: boolean;
  /** 回傳 true 表示成功（清空輸入框） */
  onSubmit: (body: string) => Promise<boolean>;
  onCancel?: () => void;
}) {
  const { t } = useI18n();
  const decoded = useMemo(() => decodeBody(initial), [initial]);
  const [text, setText] = useState(decoded.text);
  const [picked, setPicked] = useState<Picked[]>(decoded.picked);
  const [suggest, setSuggest] = useState<Suggest | null>(null);
  const [pending, setPending] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  // 從選單插入名稱後，在畫面更新前把游標移到名稱後面
  const caretAfter = useRef<number | null>(null);
  useLayoutEffect(() => {
    if (caretAfter.current === null || !ref.current) return;
    ref.current.focus();
    ref.current.setSelectionRange(caretAfter.current, caretAfter.current);
    caretAfter.current = null;
  }, [text]);

  const list: Option[] = useMemo(() => {
    if (!suggest) return [];
    const q = suggest.query.toLowerCase();
    const all: Option[] =
      suggest.kind === "@"
        ? options.members.map((m) => ({ kind: "@", id: m.id, name: m.name, avatar_url: m.avatar_url }))
        : options.projects.map((p) => ({ kind: "#", id: p.id, name: p.title, emoji: p.emoji }));
    return all.filter((o) => o.name.toLowerCase().includes(q)).slice(0, 8);
  }, [suggest, options]);

  const update = (value: string, caret: number) => {
    setText(value);
    const next = suggestAt(value, caret);
    setSuggest((prev) => (next ? { ...next, index: prev && prev.start === next.start ? prev.index : 0 } : null));
  };

  const choose = (o: Option) => {
    if (!suggest) return;
    const caret = ref.current?.selectionStart ?? text.length;
    const insert = `${o.kind}${o.name} `;
    const value = text.slice(0, suggest.start) + insert + text.slice(caret);
    setText(value);
    setPicked((p) => [...p, { kind: o.kind, id: o.id, name: o.name }]);
    setSuggest(null);
    caretAfter.current = suggest.start + insert.length;
  };

  async function submit() {
    const body = encodeBody(text.trim(), picked);
    if (!body || pending) return;
    setPending(true);
    const ok = await onSubmit(body);
    setPending(false);
    if (ok) {
      setText("");
      setPicked([]);
    }
  }

  return (
    <div className="relative">
      <Textarea
        ref={ref}
        value={text}
        rows={2}
        autoFocus={autoFocus}
        placeholder={placeholder}
        aria-label={placeholder}
        data-testid="board-input"
        className="min-h-16 resize-y pr-24"
        onChange={(e) => update(e.target.value, e.target.selectionStart)}
        onClick={(e) => update(e.currentTarget.value, e.currentTarget.selectionStart)}
        onBlur={() => setTimeout(() => setSuggest(null), 150)}
        onKeyDown={(e) => {
          if (suggest && list.length) {
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              setSuggest({ ...suggest, index: (suggest.index + (e.key === "ArrowDown" ? 1 : -1) + list.length) % list.length });
              return;
            }
            if (e.key === "Enter" || e.key === "Tab") {
              e.preventDefault();
              choose(list[Math.min(suggest.index, list.length - 1)]);
              return;
            }
          }
          if (e.key === "Escape") {
            if (suggest) {
              e.preventDefault();
              e.stopPropagation();
              setSuggest(null);
            } else onCancel?.();
            return;
          }
          // Ctrl／⌘＋Enter 送出
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            void submit();
          }
        }}
      />
      <div className="absolute right-2 bottom-2 flex gap-1">
        {onCancel ? (
          <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
            {t.common.cancel}
          </Button>
        ) : null}
        <Button type="button" size="sm" disabled={!text.trim() || pending} onClick={() => void submit()} data-testid="board-submit">
          <SendIcon /> {submitLabel}
        </Button>
      </div>
      {suggest ? (
        <div role="listbox" data-testid="board-suggest" className="absolute top-full left-0 z-30 mt-1 w-64 overflow-hidden rounded-lg border bg-popover p-1 shadow-md">
          <p className="px-2 pt-1 pb-0.5 text-xs text-muted-foreground">{suggest.kind === "@" ? t.board.members : t.board.projects}</p>
          {list.length === 0 ? <p className="px-2 py-1.5 text-sm text-muted-foreground">{t.board.noMatch}</p> : null}
          {list.map((o, i) => (
            <button
              key={o.id}
              type="button"
              role="option"
              aria-selected={i === suggest.index}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setSuggest({ ...suggest, index: i })}
              onClick={() => choose(o)}
              className={cn("flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm", i === suggest.index && "bg-accent")}
            >
              {o.kind === "@" ? (
                <MemberAvatar member={{ name: o.name, avatar_url: o.avatar_url ?? null }} className="size-5" />
              ) : (
                <EntityIcon value={o.emoji} />
              )}
              <span className="truncate">{o.name}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

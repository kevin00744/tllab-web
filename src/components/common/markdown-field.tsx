"use client";

import { useState } from "react";

import { Markdown } from "@/components/markdown";
import { Textarea } from "@/components/ui/textarea";
import { useI18n } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

/** 表單裡的 Markdown 欄位：撰寫／預覽切換 */
export function MarkdownField({
  id,
  label,
  value,
  onChange,
  rows = 6,
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  placeholder?: string;
}) {
  const { t } = useI18n();
  const [preview, setPreview] = useState(false);
  const tab = (active: boolean) =>
    cn("rounded px-2 py-0.5 text-xs", active ? "bg-background font-medium text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground");
  return (
    <div className="grid gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className="text-sm leading-none font-medium">
          {label}
        </label>
        <div className="inline-flex rounded-md bg-muted/60 p-0.5" role="tablist">
          <button type="button" role="tab" aria-selected={!preview} className={tab(!preview)} onClick={() => setPreview(false)}>
            {t.common.write}
          </button>
          <button type="button" role="tab" aria-selected={preview} className={tab(preview)} onClick={() => setPreview(true)}>
            {t.common.preview}
          </button>
        </div>
      </div>
      {preview ? (
        <div className="min-h-24 rounded-md border px-3 py-2">
          {value.trim() ? <Markdown>{value}</Markdown> : <p className="text-sm text-muted-foreground">{t.common.none}</p>}
        </div>
      ) : (
        <Textarea
          id={id}
          rows={rows}
          value={value}
          placeholder={placeholder ?? t.common.markdownHint}
          onChange={(e) => onChange(e.target.value)}
          className="font-mono text-[13px]"
        />
      )}
    </div>
  );
}

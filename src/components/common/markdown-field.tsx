"use client";

import { MarkdownEditor } from "@/components/editor/markdown-editor";
import { useI18n } from "@/lib/i18n/client";

/** 表單裡的 Markdown 欄位：類 Notion 所見即所得編輯（Markdown 快捷輸入、「/」插入區塊），內容以 Markdown 存取 */
export function MarkdownField({
  id,
  label,
  value,
  onChange,
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** 舊版文字框的行數（保留相容，不再使用） */
  rows?: number;
  placeholder?: string;
}) {
  const { t } = useI18n();
  return (
    <div className="grid gap-1.5" data-testid={`field-${id}`}>
      <label htmlFor={id} className="text-sm leading-none font-medium">
        {label}
      </label>
      <MarkdownEditor id={id} initial={value} placeholder={placeholder ?? t.projectDoc.slashHint} onChange={onChange} compact autofocus={false} />
    </div>
  );
}

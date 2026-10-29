"use client";

import { PlusIcon, XIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/lib/i18n/client";
import type { LinkItem } from "@/lib/links";

/** 連結清單編輯：名稱＋網址，可新增／移除（成員頁、會議紀錄共用） */
export function LinksEditor({
  label,
  value,
  onChange,
  labelPlaceholder,
}: {
  label: string;
  value: LinkItem[];
  onChange: (links: LinkItem[]) => void;
  labelPlaceholder?: string;
}) {
  const { t } = useI18n();
  const update = (i: number, patch: Partial<LinkItem>) => onChange(value.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  return (
    <div className="grid gap-2">
      <span className="text-sm font-medium">{label}</span>
      {value.map((l, i) => (
        <div key={i} className="flex gap-2" data-testid="link-row">
          <Input
            aria-label={t.membersPage.linkLabel}
            placeholder={labelPlaceholder ?? t.membersPage.linkLabel}
            value={l.label}
            className="w-32 shrink-0"
            onChange={(e) => update(i, { label: e.target.value })}
          />
          <Input aria-label={t.membersPage.linkUrl} placeholder="https://" value={l.url} onChange={(e) => update(i, { url: e.target.value })} />
          <Button type="button" size="icon" variant="ghost" aria-label={t.fields.remove} onClick={() => onChange(value.filter((_, j) => j !== i))}>
            <XIcon />
          </Button>
        </div>
      ))}
      <div>
        <Button type="button" size="sm" variant="outline" onClick={() => onChange([...value, { label: "", url: "" }])}>
          <PlusIcon /> {t.membersPage.addLink}
        </Button>
      </div>
    </div>
  );
}

"use client";

import { CheckIcon, CopyIcon } from "lucide-react";
import { useState } from "react";

import { useI18n } from "@/lib/i18n/client";

/** 程式碼區塊：語言標籤＋複製按鈕 */
export function CodeBlock({ code, language }: { code: string; language?: string | null }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  return (
    <div className="overflow-hidden rounded-lg border bg-muted/60">
      <div className="flex items-center justify-between border-b px-3 py-1 text-xs text-muted-foreground">
        <span className="font-mono">{language || "code"}</span>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-accent hover:text-foreground"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(code);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            } catch {
              // 非 HTTPS 時剪貼簿 API 不可用，可手動選取
            }
          }}
        >
          {copied ? <CheckIcon className="size-3.5" /> : <CopyIcon className="size-3.5" />}
          {copied ? t.membersPage.copied : t.membersPage.copy}
        </button>
      </div>
      <pre className="overflow-x-auto px-4 py-3 font-mono text-[13px] leading-6">
        <code>{code}</code>
      </pre>
    </div>
  );
}

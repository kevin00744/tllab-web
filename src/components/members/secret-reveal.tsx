"use client";

import { CheckIcon, CopyIcon } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n/client";

/** 只顯示一次的密碼／邀請碼，附複製按鈕 */
export function SecretReveal({ value, label }: { value: string; label: string }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  return (
    <div className="grid gap-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2">
        <code data-testid="secret-value" className="flex-1 rounded-md bg-muted px-3 py-2 font-mono text-base tracking-wide select-all">
          {value}
        </code>
        <Button
          type="button"
          variant="outline"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(value);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            } catch {
              // 非 HTTPS（例如區網 IP）時剪貼簿 API 不可用，使用者可手動選取
            }
          }}
        >
          {copied ? <CheckIcon /> : <CopyIcon />} {copied ? t.membersPage.copied : t.membersPage.copy}
        </Button>
      </div>
    </div>
  );
}

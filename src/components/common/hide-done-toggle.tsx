"use client";

import { useRouter } from "next/navigation";
import { useOptimistic, useTransition } from "react";
import { toast } from "sonner";

import { saveMySettings } from "@/app/(app)/settings-actions";
import { Checkbox } from "@/components/ui/checkbox";
import { useI18n } from "@/lib/i18n/client";

/** 「隱藏已完成」：記在自己的帳號設定，所有裝置都套用 */
export function HideDoneToggle({ setting, value }: { setting: "hide_done_tasks" | "hide_done_projects"; value: boolean }) {
  const { t } = useI18n();
  const router = useRouter();
  const [checked, setChecked] = useOptimistic(value);
  const [, startTransition] = useTransition();
  return (
    <label className="flex shrink-0 items-center gap-2 text-sm text-muted-foreground" data-testid={`toggle-${setting}`}>
      <Checkbox
        checked={checked}
        onChange={(e) => {
          const next = e.target.checked;
          startTransition(async () => {
            setChecked(next);
            const r = await saveMySettings({ [setting]: next });
            if (!r.ok) return void toast.error(t.errors[r.error]);
            router.refresh();
          });
        }}
      />
      {t.common.hideDone}
    </label>
  );
}

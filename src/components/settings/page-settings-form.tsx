"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { savePageSetting, type PageSettingInput } from "@/app/(app)/settings/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/lib/i18n/client";

/** 每一頁一列：emoji、中文名稱、英文名稱 */
export function PageSettingRow({ setting, label }: { setting: PageSettingInput; label: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const [form, setForm] = useState(setting);
  const [pending, startTransition] = useTransition();
  const dirty = form.emoji !== setting.emoji || form.title !== setting.title || form.title_en !== setting.title_en;
  const set = (k: keyof PageSettingInput, v: string) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <form
      data-page-key={setting.key}
      className="grid grid-cols-[3.5rem_1fr] items-center gap-2 py-2 sm:grid-cols-[8rem_3.5rem_1fr_1fr_auto]"
      onSubmit={(e) => {
        e.preventDefault();
        if (!form.title.trim() || !form.title_en.trim()) return void toast.error(t.errors.titleRequired);
        startTransition(async () => {
          const result = await savePageSetting(form);
          if (!result.ok) return void toast.error(t.errors[result.error]);
          toast.success(t.common.saved);
          router.refresh();
        });
      }}
    >
      <span className="col-span-2 text-xs text-muted-foreground sm:col-span-1">{label}</span>
      <Input aria-label={`${label} ${t.fields.emoji}`} value={form.emoji} maxLength={8} onChange={(e) => set("emoji", e.target.value)} className="text-center" />
      <Input aria-label={`${label} ${t.settingsPage.titleZh}`} value={form.title} onChange={(e) => set("title", e.target.value)} />
      <Input aria-label={`${label} ${t.settingsPage.titleEn}`} value={form.title_en} onChange={(e) => set("title_en", e.target.value)} className="col-start-2 sm:col-start-auto" />
      <Button type="submit" size="sm" variant={dirty ? "default" : "outline"} disabled={!dirty || pending} className="col-start-2 sm:col-start-auto">
        {pending ? t.common.saving : t.common.save}
      </Button>
    </form>
  );
}

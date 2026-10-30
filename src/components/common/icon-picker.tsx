"use client";

import { ImageUpIcon, Trash2Icon } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { EntityIcon } from "@/components/common/entity-icon";
import { useCurrentMemberId } from "@/components/layout/current-member";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useI18n } from "@/lib/i18n/client";
import { isIconUrl } from "@/lib/icon";
import { squareWebp } from "@/lib/image";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

const GROUPS = {
  common: ["📁", "📄", "📘", "📗", "📙", "📕", "📓", "📝", "🗂️", "📌", "📎", "🔖", "🏷️", "⭐", "🔥", "✅", "❗", "💡", "🎯", "🚀"],
  science: ["🔬", "🧪", "🧫", "🧬", "🦠", "🔭", "⚗️", "🧲", "💊", "🩺", "🧠", "🫀", "🐟", "🐭", "🐁", "🐔", "🌱", "🧊", "🌡️", "⚛️"],
  tools: ["🧰", "🛠️", "⚙️", "🖥️", "💻", "⌨️", "💾", "🗄️", "📷", "🎥", "📡", "🔋", "🔌", "🧮", "📊", "📈", "📉", "🗃️", "🧾", "🐍"],
  people: ["👥", "🧑‍🔬", "🧑‍🏫", "🎓", "🗓️", "📅", "⏰", "☕", "🍱", "🎉", "🏆", "📢", "💬", "🤝", "✈️", "🏫", "🏠", "🧭", "❓", "👋"],
  symbols: ["🔴", "🟠", "🟡", "🟢", "🔵", "🟣", "⚫", "⚪", "🟥", "🟧", "🟨", "🟩", "🟦", "🟪", "⬛", "🔶", "🔷", "💠", "♻️", "✨"],
} as const;

const MAX_ICON = 2 * 1024 * 1024;

/** 圖示選單：常用 emoji、貼上任何 emoji，或上傳圖片（存到公開的 icons bucket） */
export function IconPicker({
  value,
  onChange,
  fallback,
  id,
  label,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  /** 移除圖片後恢復的 emoji */
  fallback: string;
  id?: string;
  label?: string;
  disabled?: boolean;
}) {
  const { t } = useI18n();
  const memberId = useCurrentMemberId();
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const pick = (v: string) => {
    onChange(v);
    setOpen(false);
  };

  async function upload(file: File) {
    if (!memberId || !file.type.startsWith("image/")) return;
    if (file.size > MAX_ICON) return void toast.error(t.iconPicker.tooLarge);
    setUploading(true);
    try {
      const blob = await squareWebp(file, 128);
      const supabase = createClient();
      const path = `${memberId}/${crypto.randomUUID()}.webp`;
      const { error } = await supabase.storage.from("icons").upload(path, await blob.arrayBuffer(), { contentType: "image/webp" });
      if (error) throw error;
      pick(supabase.storage.from("icons").getPublicUrl(path).data.publicUrl);
    } catch (e) {
      console.warn("icon upload failed", e);
      toast.error(t.errors.uploadFailed);
    } finally {
      setUploading(false);
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          disabled={disabled}
          className="size-9 p-0 text-lg"
          aria-label={label ?? t.iconPicker.choose}
          title={label ?? t.iconPicker.choose}
          data-testid="icon-picker"
        >
          <EntityIcon value={value} />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" data-testid="icon-picker-menu">
        <div className="max-h-64 overflow-y-auto p-2">
          {(Object.keys(GROUPS) as (keyof typeof GROUPS)[]).map((g) => (
            <div key={g} className="mb-2">
              <div className="px-1 pb-1 text-xs font-medium text-muted-foreground">{t.iconPicker.groups[g]}</div>
              <div className="grid grid-cols-10 gap-0.5">
                {GROUPS[g].map((e) => (
                  <button
                    key={e}
                    type="button"
                    onClick={() => pick(e)}
                    className={cn(
                      "flex size-7 items-center justify-center rounded text-lg hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                      value === e && "bg-accent ring-1 ring-primary",
                    )}
                    aria-label={e}
                  >
                    {e}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="grid gap-2 border-t p-2">
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              e.stopPropagation();
              const v = custom.trim();
              if (v && v.length <= 16 && !/[\s<>"'`]/.test(v)) {
                pick(v);
                setCustom("");
              }
            }}
          >
            <Input
              value={custom}
              maxLength={16}
              onChange={(e) => setCustom(e.target.value)}
              placeholder={t.iconPicker.customPlaceholder}
              aria-label={t.iconPicker.custom}
              className="h-8"
            />
            <Button type="submit" size="sm" variant="outline" disabled={!custom.trim()}>
              {t.common.ok}
            </Button>
          </form>
          {memberId ? (
            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                className="hidden"
                data-testid="icon-upload"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) void upload(file);
                }}
              />
              <Button type="button" size="sm" variant="outline" disabled={uploading} onClick={() => fileRef.current?.click()}>
                <ImageUpIcon /> {uploading ? t.iconPicker.uploading : t.iconPicker.upload}
              </Button>
              {isIconUrl(value) ? (
                <Button type="button" size="sm" variant="ghost" onClick={() => pick(fallback)}>
                  <Trash2Icon /> {t.iconPicker.remove}
                </Button>
              ) : null}
              <p className="w-full text-xs text-muted-foreground">{t.iconPicker.hint}</p>
            </div>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}

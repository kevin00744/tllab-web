"use client";

import { useState } from "react";

import { ConfirmDelete } from "@/components/common/confirm-delete";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useI18n } from "@/lib/i18n/client";

/** 新增／編輯用的對話框外框：觸發按鈕、標題、錯誤訊息、儲存／取消／刪除 */
export function FormDialog({
  trigger,
  title,
  className = "sm:max-w-xl",
  children,
}: {
  trigger: React.ReactNode;
  title: string;
  className?: string;
  /** 對話框開啟時才 render，表單狀態在每次開啟時重新初始化 */
  children: (close: () => void) => React.ReactNode;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      {open ? (
        <DialogContent className={className} closeLabel={t.common.close}>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>
          {children(() => setOpen(false))}
        </DialogContent>
      ) : null}
    </Dialog>
  );
}

export function FormBody({
  onSubmit,
  pending,
  error,
  onCancel,
  onDelete,
  deleteName,
  children,
}: {
  onSubmit: () => void;
  pending: boolean;
  error: string | null;
  onCancel: () => void;
  /** 有提供才顯示刪除按鈕；回傳 true 代表已刪除 */
  onDelete?: () => Promise<boolean>;
  deleteName?: string;
  children: React.ReactNode;
}) {
  const { t } = useI18n();
  return (
    <form
      noValidate
      className="flex min-h-0 flex-1 flex-col"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <DialogBody>
        <fieldset disabled={pending} className="grid gap-4">
          {error ? (
            <div role="alert" data-slot="form-error" className="rounded-md bg-status-red-bg px-3 py-2 text-sm text-status-red-fg">
              {error}
            </div>
          ) : null}
          {children}
        </fieldset>
      </DialogBody>
      <DialogFooter>
        {onDelete ? <ConfirmDelete name={deleteName ?? ""} onConfirm={onDelete} /> : null}
        <Button type="button" variant="outline" onClick={onCancel}>
          {t.common.cancel}
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? t.common.saving : t.common.save}
        </Button>
      </DialogFooter>
    </form>
  );
}

/** 「a, b，c、d」→ ["a","b","c","d"] */
export const splitList = (text: string) =>
  text
    .split(/[,，、]/)
    .map((s) => s.trim())
    .filter(Boolean);

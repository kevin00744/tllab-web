"use client";

import { Trash2Icon } from "lucide-react";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { format } from "@/lib/i18n";
import { useI18n } from "@/lib/i18n/client";

export function ConfirmDelete({
  name,
  onConfirm,
  trigger,
}: {
  name: string;
  onConfirm: () => Promise<boolean>;
  trigger?: React.ReactNode;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button type="button" variant="ghost" className="text-destructive hover:text-destructive sm:mr-auto">
            <Trash2Icon /> {t.common.delete}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-sm" closeLabel={t.common.close}>
        <DialogHeader>
          <DialogTitle>{t.common.confirmDeleteTitle}</DialogTitle>
          <DialogDescription>{format(t.common.confirmDeleteBody, { name })}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            {t.common.cancel}
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                if (await onConfirm()) setOpen(false);
              })
            }
          >
            {pending ? t.common.deleting : t.common.delete}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

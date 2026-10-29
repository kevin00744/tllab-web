"use client";

import { Trash2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { createContext, useContext, useState, useTransition } from "react";
import { toast } from "sonner";

import { deleteActivity, type DeleteActivityInput } from "@/app/(app)/activity/actions";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { format } from "@/lib/i18n";
import { useI18n } from "@/lib/i18n/client";

type Selection = { selected: Set<number>; toggle: (id: number, on: boolean) => void };
const SelectionContext = createContext<Selection | null>(null);

/** 活動紀錄每一列的勾選框；只在系統管理員的批量刪除工具列內顯示 */
export function ActivitySelect({ id }: { id: number }) {
  const { t } = useI18n();
  const ctx = useContext(SelectionContext);
  if (!ctx) return null;
  return (
    <Checkbox
      className="mt-1.5"
      aria-label={t.activity.bulk.select}
      checked={ctx.selected.has(id)}
      onChange={(e) => ctx.toggle(id, e.target.checked)}
      data-activity-select={id}
    />
  );
}

/** 系統管理員：勾選刪除、刪除某日以前（套用目前的類型／成員篩選） */
export function ActivityBulk({
  ids,
  filter,
  today,
  children,
}: {
  ids: number[];
  filter: { entity_type?: string; actor_id?: string };
  today: string;
  children: React.ReactNode;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [confirm, setConfirm] = useState<DeleteActivityInput | null>(null);
  const [before, setBefore] = useState("");
  const [pending, startTransition] = useTransition();
  const visible = new Set(ids);
  const chosen = [...selected].filter((id) => visible.has(id));
  const allChosen = ids.length > 0 && chosen.length === ids.length;
  const filtered = !!(filter.entity_type || filter.actor_id);

  const toggle = (id: number, on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  const run = () =>
    startTransition(async () => {
      if (!confirm) return;
      const result = await deleteActivity(confirm);
      if (!result.ok) {
        toast.error(t.errors[result.error]);
        return;
      }
      toast.success(format(t.activity.bulk.done, { n: result.data }));
      setConfirm(null);
      setSelected(new Set());
      setBefore("");
      router.refresh();
    });

  return (
    <SelectionContext.Provider value={{ selected, toggle }}>
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border bg-muted/40 px-3 py-2 text-sm" data-testid="activity-bulk">
        <label className="flex items-center gap-2">
          <Checkbox
            checked={allChosen}
            disabled={!ids.length}
            onChange={(e) => setSelected(e.target.checked ? new Set(ids) : new Set())}
          />
          {t.activity.bulk.selectPage}
        </label>
        <span className="text-muted-foreground tabular-nums">{format(t.activity.bulk.selected, { n: chosen.length })}</span>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="text-destructive hover:text-destructive"
          disabled={!chosen.length}
          onClick={() => setConfirm({ ids: chosen })}
        >
          <Trash2Icon /> {t.activity.bulk.deleteSelected}
        </Button>
        <form
          className="flex items-center gap-2 sm:ml-auto"
          onSubmit={(e) => {
            e.preventDefault();
            if (before) setConfirm({ before, ...filter });
          }}
        >
          <Input
            type="date"
            className="h-8 w-40"
            max={today}
            value={before}
            onChange={(e) => setBefore(e.target.value)}
            aria-label={t.activity.bulk.beforeLabel}
            title={t.activity.bulk.beforeLabel}
          />
          <Button type="submit" size="sm" variant="outline" className="text-destructive hover:text-destructive" disabled={!before}>
            {t.activity.bulk.deleteBefore}
          </Button>
        </form>
      </div>
      {children}

      <Dialog open={!!confirm} onOpenChange={(open) => !open && setConfirm(null)}>
        <DialogContent className="max-w-sm" closeLabel={t.common.close}>
          <DialogHeader>
            <DialogTitle>{t.activity.bulk.title}</DialogTitle>
            <DialogDescription>
              {confirm && "ids" in confirm
                ? format(t.activity.bulk.selectedBody, { n: confirm.ids.length })
                : format(t.activity.bulk.beforeBody, { date: confirm?.before ?? "" })}
              {confirm && !("ids" in confirm) && filtered ? <span className="mt-2 block">{t.activity.bulk.filtered}</span> : null}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirm(null)}>
              {t.common.cancel}
            </Button>
            <Button type="button" variant="destructive" disabled={pending} onClick={run}>
              {pending ? t.common.deleting : t.common.delete}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SelectionContext.Provider>
  );
}

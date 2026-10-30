"use client";

import { CheckIcon, PencilIcon, Settings2Icon, Trash2Icon, XIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { manageItems, type ManageEntity, type ManageInput } from "@/app/(app)/manage-actions";
import { EntityIcon } from "@/components/common/entity-icon";
import { IconPicker } from "@/components/common/icon-picker";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { format } from "@/lib/i18n";
import { useI18n } from "@/lib/i18n/client";

export type ManageItem = { id: string; title: string; icon?: string | null; group?: string; depth?: number };
export type ManageTarget = { value: string; label: string };

const NEW = "__new__";

/** 管理員的快速管理：勾選、重新命名、移動、更換圖示、批量刪除 */
export function AdminManager({
  entity,
  pageTitle,
  items,
  targets,
  allowNewTarget = false,
  defaultIcon,
}: {
  entity: ManageEntity;
  pageTitle: string;
  items: ManageItem[];
  targets: ManageTarget[];
  /** 分類可輸入新名稱（FAQ、軟體） */
  allowNewTarget?: boolean;
  /** 有圖示欄位的資料：移除上傳圖片後的預設 emoji */
  defaultIcon?: string;
}) {
  const { t } = useI18n();
  const m = t.manage;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [target, setTarget] = useState("");
  const [newTarget, setNewTarget] = useState("");
  const [editing, setEditing] = useState<{ id: string; title: string } | null>(null);
  const [confirm, setConfirm] = useState<string[] | null>(null);
  const [pending, startTransition] = useTransition();

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return q ? items.filter((i) => i.title.toLowerCase().includes(q) || i.group?.toLowerCase().includes(q)) : items;
  }, [items, filter]);
  const ids = new Set(items.map((i) => i.id));
  const chosen = [...selected].filter((id) => ids.has(id));
  const allChosen = visible.length > 0 && visible.every((i) => selected.has(i.id));

  const toggle = (id: string, on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  const run = (input: Omit<ManageInput, "entity">, done?: () => void) =>
    startTransition(async () => {
      const result = await manageItems({ entity, ...input });
      if (!result.ok) {
        toast.error(t.errors[result.error]);
        return;
      }
      toast.success(format(input.action === "delete" ? m.deleted : m.updated, { n: result.data }));
      done?.();
      router.refresh();
    });

  const moveValue = target === NEW ? newTarget.trim() : target;
  const canMove = chosen.length > 0 && target !== "" && (target !== NEW || moveValue !== "");

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) {
          setSelected(new Set());
          setEditing(null);
          setConfirm(null);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" data-testid="admin-manage">
          <Settings2Icon /> {m.button}
        </Button>
      </DialogTrigger>
      <DialogContent className="flex max-h-[90dvh] flex-col gap-3 sm:max-w-3xl" closeLabel={t.common.close}>
        <DialogHeader>
          <DialogTitle>{format(m.title, { page: pageTitle })}</DialogTitle>
          <DialogDescription>{m.description}</DialogDescription>
        </DialogHeader>

        <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={m.filter} aria-label={m.filter} className="h-8" />

        {/* 批量操作 */}
        <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-sm" data-testid="manage-toolbar">
          <label className="flex items-center gap-2">
            <Checkbox
              checked={allChosen}
              disabled={!visible.length}
              onChange={(e) =>
                setSelected((prev) => {
                  const next = new Set(prev);
                  for (const i of visible) {
                    if (e.target.checked) next.add(i.id);
                    else next.delete(i.id);
                  }
                  return next;
                })
              }
            />
            {m.selectAll}
          </label>
          <span className="text-muted-foreground tabular-nums">{format(m.selected, { n: chosen.length })}</span>
          <div className="flex min-w-0 flex-wrap items-center gap-2 sm:ml-auto">
            <NativeSelect
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              aria-label={m.move[entity]}
              className="h-8 max-w-56"
              disabled={!chosen.length}
            >
              <option value="">{m.move[entity]}…</option>
              {targets.map((o) => (
                <option key={o.value || "none"} value={o.value === "" ? " " : o.value}>
                  {o.label}
                </option>
              ))}
              {allowNewTarget ? <option value={NEW}>{m.newCategory}…</option> : null}
            </NativeSelect>
            {target === NEW ? (
              <Input value={newTarget} onChange={(e) => setNewTarget(e.target.value)} placeholder={m.newCategory} aria-label={m.newCategory} className="h-8 w-36" />
            ) : null}
            <Button
              size="sm"
              variant="outline"
              disabled={!canMove || pending}
              onClick={() =>
                run({ action: "move", ids: chosen, value: moveValue.trim() }, () => {
                  setTarget("");
                  setNewTarget("");
                })
              }
            >
              {m.apply}
            </Button>
            {defaultIcon ? (
              <IconPicker
                label={m.changeIcon}
                value={defaultIcon}
                fallback={defaultIcon}
                disabled={!chosen.length || pending}
                onChange={(v) => run({ action: "icon", ids: chosen, value: v })}
              />
            ) : null}
            <Button
              size="sm"
              variant="outline"
              className="text-destructive hover:text-destructive"
              disabled={!chosen.length || pending}
              onClick={() => setConfirm(chosen)}
            >
              <Trash2Icon /> {m.delete}
            </Button>
          </div>
        </div>

        {confirm ? (
          <div role="alert" className="flex flex-wrap items-center gap-2 rounded-lg border border-destructive/40 bg-status-red-bg px-3 py-2 text-sm text-status-red-fg" data-testid="manage-confirm">
            <span className="flex-1">
              {format(m.deleteConfirm, { n: confirm.length })}
              {entity === "document" ? ` ${m.deleteChildren}` : ""}
            </span>
            <Button size="sm" variant="outline" onClick={() => setConfirm(null)}>
              {t.common.cancel}
            </Button>
            <Button
              size="sm"
              variant="destructive"
              disabled={pending}
              onClick={() =>
                run({ action: "delete", ids: confirm }, () => {
                  setConfirm(null);
                  setSelected(new Set());
                })
              }
            >
              {pending ? t.common.deleting : m.delete}
            </Button>
          </div>
        ) : null}

        {/* 清單 */}
        <ul className="min-h-0 flex-1 divide-y overflow-y-auto" data-testid="manage-list">
          {visible.length === 0 ? <li className="py-6 text-center text-sm text-muted-foreground">{m.empty}</li> : null}
          {visible.map((item) => (
            <li key={item.id} className="flex items-center gap-2 py-1.5" data-manage-id={item.id}>
              <Checkbox checked={selected.has(item.id)} onChange={(e) => toggle(item.id, e.target.checked)} aria-label={item.title} />
              {item.depth ? <span style={{ width: `${item.depth}rem` }} className="shrink-0" aria-hidden /> : null}
              {defaultIcon ? (
                <IconPicker
                  label={`${m.changeIcon}：${item.title}`}
                  value={item.icon || defaultIcon}
                  fallback={defaultIcon}
                  disabled={pending}
                  onChange={(v) => run({ action: "icon", ids: [item.id], value: v })}
                />
              ) : null}
              {editing?.id === item.id ? (
                <form
                  className="flex min-w-0 flex-1 items-center gap-1"
                  onSubmit={(e) => {
                    e.preventDefault();
                    run({ action: "rename", ids: [item.id], value: editing.title }, () => setEditing(null));
                  }}
                >
                  <Input
                    autoFocus
                    value={editing.title}
                    onChange={(e) => setEditing({ id: item.id, title: e.target.value })}
                    onKeyDown={(e) => e.key === "Escape" && (e.stopPropagation(), setEditing(null))}
                    aria-label={m.rename}
                    className="h-8"
                  />
                  <Button type="submit" size="icon-sm" variant="ghost" aria-label={t.common.save} disabled={pending || !editing.title.trim()}>
                    <CheckIcon />
                  </Button>
                  <Button type="button" size="icon-sm" variant="ghost" aria-label={t.common.cancel} onClick={() => setEditing(null)}>
                    <XIcon />
                  </Button>
                </form>
              ) : (
                <button
                  type="button"
                  className="min-w-0 flex-1 truncate rounded px-1 py-1 text-left text-sm hover:bg-accent"
                  title={m.rename}
                  onClick={() => setEditing({ id: item.id, title: item.title })}
                >
                  {!defaultIcon && item.icon ? <EntityIcon value={item.icon} className="mr-1" /> : null}
                  {item.title}
                </button>
              )}
              {item.group ? <span className="hidden max-w-40 shrink-0 truncate text-xs text-muted-foreground sm:inline">{item.group}</span> : null}
              {editing?.id === item.id ? null : (
                <>
                  <Button size="icon-sm" variant="ghost" aria-label={`${m.rename}：${item.title}`} onClick={() => setEditing({ id: item.id, title: item.title })}>
                    <PencilIcon />
                  </Button>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    className="text-destructive hover:text-destructive"
                    aria-label={`${m.delete}：${item.title}`}
                    onClick={() => setConfirm([item.id])}
                  >
                    <Trash2Icon />
                  </Button>
                </>
              )}
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}

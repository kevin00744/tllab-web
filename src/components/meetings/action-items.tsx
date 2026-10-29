"use client";

import { ArrowRightLeftIcon, CheckCircle2Icon, PlusIcon, XIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useOptimistic, useState, useTransition } from "react";
import { toast } from "sonner";

import { convertActionItem, deleteActionItem, saveActionItem } from "@/app/(app)/meetings/actions";
import { MemberAvatar } from "@/components/layout/user-menu";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { daysFrom, formatDate, relativeDay } from "@/lib/date";
import { useI18n } from "@/lib/i18n/client";
import { statusLabel, taskStatusTone } from "@/lib/status";
import { cn } from "@/lib/utils";
import type { ActionItem, FormOptions } from "@/types/entities";

/** 會議的 Action items：勾選完成、指派、截止日、一鍵轉為任務 */
export function ActionItems({
  meetingId,
  items,
  canAdd,
  members,
  today,
}: {
  meetingId: string;
  items: ActionItem[];
  canAdd: boolean;
  members: FormOptions["members"];
  today: string;
}) {
  const { t, locale } = useI18n();
  const a = t.meetingsPage;
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState({ content: "", assignee_id: "", due_date: "" });
  // 勾選完成立即反映，伺服器回應後再以實際資料為準
  const [shown, markDone] = useOptimistic(items, (state, { id, is_done }: { id: string; is_done: boolean }) =>
    state.map((x) => (x.id === id ? { ...x, is_done } : x)),
  );

  function run(fn: () => Promise<{ ok: boolean; error?: keyof typeof t.errors }>, success?: string, before?: () => void) {
    startTransition(async () => {
      before?.();
      const result = await fn();
      if (!result.ok) return void toast.error(t.errors[result.error ?? "server"]);
      if (success) toast.success(success);
      router.refresh();
    });
  }

  return (
    <div>
      {shown.length ? (
        <ul className="divide-y rounded-xl border" data-testid="action-items">
          {shown.map((item) => (
            <li key={item.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5" data-action-id={item.id}>
              <Checkbox
                aria-label={item.content}
                checked={item.is_done}
                disabled={!item.editable}
                onChange={(e) => {
                  const is_done = e.target.checked;
                  run(
                    () => saveActionItem({ id: item.id, content: item.content, is_done }),
                    undefined,
                    () => markDone({ id: item.id, is_done }),
                  );
                }}
              />
              <span className={cn("min-w-0 flex-1 text-sm", item.is_done && "text-muted-foreground line-through")}>{item.content}</span>
              {item.assignee ? (
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <MemberAvatar member={item.assignee} className="size-5" />
                  {item.assignee.name}
                </span>
              ) : null}
              {item.due_date ? (
                <span className={cn("text-xs tabular-nums", item.overdue ? "font-medium text-status-red-fg" : "text-muted-foreground")}>
                  {formatDate(locale, item.due_date, { month: "numeric", day: "numeric" })} · {relativeDay(t, daysFrom(today, item.due_date), { overdue: item.overdue })}
                </span>
              ) : null}
              {item.task ? (
                <Badge tone={taskStatusTone[item.task.status]} title={item.task.title}>
                  <CheckCircle2Icon className="size-3" /> {a.converted} · {statusLabel(t, "task", item.task.status)}
                </Badge>
              ) : item.editable ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={pending}
                  onClick={() => run(() => convertActionItem(item.id), a.convertedToast)}
                >
                  <ArrowRightLeftIcon /> {a.convert}
                </Button>
              ) : null}
              {canAdd ? (
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  aria-label={`${t.common.delete}：${item.content}`}
                  disabled={pending}
                  onClick={() => run(() => deleteActionItem(item.id))}
                >
                  <XIcon />
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">{a.noActions}</p>
      )}
      {canAdd ? (
        <form
          className="mt-3 flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!draft.content.trim()) return;
            run(async () => {
              const result = await saveActionItem({ meeting_id: meetingId, ...draft });
              if (result.ok) setDraft({ content: "", assignee_id: "", due_date: "" });
              return result;
            });
          }}
        >
          <Input
            aria-label={a.newAction}
            placeholder={a.newAction}
            value={draft.content}
            onChange={(e) => setDraft((d) => ({ ...d, content: e.target.value }))}
            className="min-w-48 flex-1"
          />
          <NativeSelect
            aria-label={a.assignee}
            value={draft.assignee_id}
            onChange={(e) => setDraft((d) => ({ ...d, assignee_id: e.target.value }))}
            className="w-auto"
          >
            <option value="">{a.assignee}</option>
            {members
              .filter((m) => !m.is_alumni)
              .map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
          </NativeSelect>
          <Input
            type="date"
            aria-label={t.fields.dueDate}
            value={draft.due_date}
            onChange={(e) => setDraft((d) => ({ ...d, due_date: e.target.value }))}
            className="w-auto"
          />
          <Button type="submit" variant="outline" disabled={pending || !draft.content.trim()}>
            <PlusIcon /> {a.addAction}
          </Button>
        </form>
      ) : null}
    </div>
  );
}

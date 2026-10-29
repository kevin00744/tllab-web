"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { deleteTask, saveTask, type TaskInput } from "@/app/(app)/tasks/actions";
import { ConfirmDelete } from "@/components/common/confirm-delete";
import { Field } from "@/components/common/field";
import { MemberPicker } from "@/components/common/member-picker";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { useI18n } from "@/lib/i18n/client";
import { statusLabel } from "@/lib/status";
import type { FormOptions, Task } from "@/types/entities";

const STATUSES = ["todo", "in_progress", "in_review", "done"] as const;
const PRIORITIES = ["high", "medium", "low"] as const;

export type TaskDefaults = Partial<Pick<TaskInput, "status" | "project_id" | "due_date" | "assignee_ids">>;

function initial(task: Task | null, defaults: TaskDefaults): TaskInput {
  return task
    ? {
        id: task.id,
        title: task.title,
        description: task.description ?? "",
        status: task.status,
        priority: task.priority,
        due_date: task.due_date ?? "",
        project_id: task.project?.id ?? "",
        publication_id: task.publication?.id ?? "",
        assignee_ids: task.assignees.map((a) => a.id),
      }
    : {
        title: "",
        description: "",
        status: defaults.status ?? "todo",
        priority: "medium",
        due_date: defaults.due_date ?? "",
        project_id: defaults.project_id ?? "",
        publication_id: "",
        assignee_ids: defaults.assignee_ids ?? [],
      };
}

export function TaskDialog({
  task,
  defaults = {},
  options,
  open,
  onOpenChange,
}: {
  task: Task | null;
  defaults?: TaskDefaults;
  options: FormOptions;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open ? (
        <TaskForm
          key={task?.id ?? "new"}
          task={task}
          defaults={defaults}
          options={options}
          onDone={() => onOpenChange(false)}
        />
      ) : null}
    </Dialog>
  );
}

function TaskForm({
  task,
  defaults,
  options,
  onDone,
}: {
  task: Task | null;
  defaults: TaskDefaults;
  options: FormOptions;
  onDone: () => void;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [form, setForm] = useState<TaskInput>(() => initial(task, defaults));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const readOnly = task ? !task.editable : !options.can_create;
  const set = <K extends keyof TaskInput>(key: K, value: TaskInput[K]) => setForm((f) => ({ ...f, [key]: value }));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) return setError(t.errors.titleRequired);
    startTransition(async () => {
      const result = await saveTask(form);
      if (!result.ok) return setError(t.errors[result.error]);
      toast.success(t.common.saved);
      router.refresh();
      onDone();
    });
  }

  return (
    <DialogContent className="sm:max-w-xl" closeLabel={t.common.close}>
      <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col" noValidate>
        <DialogHeader>
          <DialogTitle>{task ? t.tasksPage.edit : t.tasksPage.new}</DialogTitle>
          {readOnly ? <p className="text-xs text-muted-foreground">{t.common.readOnly}</p> : null}
        </DialogHeader>
        <DialogBody>
          <fieldset disabled={readOnly || pending} className="grid gap-4">
            {error ? (
              <div role="alert" data-slot="form-error" className="rounded-md bg-status-red-bg px-3 py-2 text-sm text-status-red-fg">
                {error}
              </div>
            ) : null}
            <Field label={t.fields.title} htmlFor="task-title">
              <Input id="task-title" value={form.title} onChange={(e) => set("title", e.target.value)} autoFocus={!task} required />
            </Field>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label={t.fields.status} htmlFor="task-status">
                <NativeSelect id="task-status" value={form.status} onChange={(e) => set("status", e.target.value)}>
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {statusLabel(t, "task", s)}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label={t.fields.priority} htmlFor="task-priority">
                <NativeSelect id="task-priority" value={form.priority} onChange={(e) => set("priority", e.target.value)}>
                  {PRIORITIES.map((p) => (
                    <option key={p} value={p}>
                      {statusLabel(t, "priority", p)}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label={t.fields.dueDate} htmlFor="task-due">
                <Input id="task-due" type="date" value={form.due_date} onChange={(e) => set("due_date", e.target.value)} />
              </Field>
            </div>
            <Field label={t.fields.assignees} htmlFor="task-assignees">
              <MemberPicker
                id="task-assignees"
                members={options.members}
                value={form.assignee_ids}
                onChange={(ids) => set("assignee_ids", ids)}
                disabled={readOnly || pending}
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t.fields.project} htmlFor="task-project">
                <NativeSelect id="task-project" value={form.project_id} onChange={(e) => set("project_id", e.target.value)}>
                  <option value="">{t.common.none}</option>
                  {options.projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.emoji} {p.title}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label={t.fields.publication} htmlFor="task-publication">
                <NativeSelect
                  id="task-publication"
                  value={form.publication_id}
                  onChange={(e) => set("publication_id", e.target.value)}
                >
                  <option value="">{t.common.none}</option>
                  {options.publications.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
            </div>
            <Field label={t.fields.description} htmlFor="task-description">
              <Textarea
                id="task-description"
                rows={4}
                value={form.description}
                onChange={(e) => set("description", e.target.value)}
              />
            </Field>
            {task ? (
              <p className="text-xs text-muted-foreground">
                {task.created_by ? `${t.fields.createdBy}：${task.created_by.name}` : null}
                {task.meeting ? ` · ${t.fields.sourceMeeting}：${task.meeting.title}` : null}
              </p>
            ) : null}
          </fieldset>
        </DialogBody>
        <DialogFooter>
          {task?.deletable ? (
            <ConfirmDelete
              name={task.title}
              onConfirm={async () => {
                const result = await deleteTask(task.id);
                if (!result.ok) {
                  toast.error(t.errors[result.error]);
                  return false;
                }
                toast.success(t.common.deleted);
                router.refresh();
                onDone();
                return true;
              }}
            />
          ) : null}
          <Button type="button" variant="outline" onClick={onDone}>
            {readOnly ? t.common.close : t.common.cancel}
          </Button>
          {readOnly ? null : (
            <Button type="submit" disabled={pending}>
              {pending ? t.common.saving : t.common.save}
            </Button>
          )}
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

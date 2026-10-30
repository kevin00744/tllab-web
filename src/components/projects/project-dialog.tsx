"use client";

import { PencilIcon, PlusIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { deleteProject, saveProject, type ProjectInput } from "@/app/(app)/projects/actions";
import { ConfirmDelete } from "@/components/common/confirm-delete";
import { Field } from "@/components/common/field";
import { MemberPicker } from "@/components/common/member-picker";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { useI18n } from "@/lib/i18n/client";
import { statusLabel } from "@/lib/status";
import type { FormOptions, Project } from "@/types/entities";
import { IconPicker } from "@/components/common/icon-picker";
import { MarkdownField } from "@/components/common/markdown-field";

const STATUSES = ["planning", "active", "paused", "completed"] as const;

function initial(p: Project | null): ProjectInput {
  return {
    id: p?.id,
    title: p?.title ?? "",
    emoji: p?.emoji ?? "📁",
    description: p?.description ?? "",
    status: p?.status ?? "planning",
    owner_id: p?.owner?.id ?? "",
    member_ids: p?.members.map((m) => m.id) ?? [],
    start_date: p?.start_date ?? "",
    due_date: p?.due_date ?? "",
    progress: p?.progress ?? 0,
    tags: p?.tags ?? [],
  };
}

export function ProjectDialog({
  project,
  options,
  afterDelete,
}: {
  project: Project | null;
  options: FormOptions;
  afterDelete?: string;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  if (project ? !project.editable : !options.can_create) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {project ? (
          <Button variant="outline">
            <PencilIcon /> {t.common.edit}
          </Button>
        ) : (
          <Button>
            <PlusIcon /> {t.projectsPage.new}
          </Button>
        )}
      </DialogTrigger>
      {open ? (
        <ProjectForm project={project} options={options} afterDelete={afterDelete} onDone={() => setOpen(false)} />
      ) : null}
    </Dialog>
  );
}

function ProjectForm({
  project,
  options,
  afterDelete,
  onDone,
}: {
  project: Project | null;
  options: FormOptions;
  afterDelete?: string;
  onDone: () => void;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [form, setForm] = useState(() => initial(project));
  const [tagText, setTagText] = useState(() => form.tags.join(", "));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const set = <K extends keyof ProjectInput>(key: K, value: ProjectInput[K]) => setForm((f) => ({ ...f, [key]: value }));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) return setError(t.errors.titleRequired);
    if (form.start_date && form.due_date && form.due_date < form.start_date) return setError(t.errors.dateOrder);
    const input = { ...form, tags: tagText.split(/[,，、]/).map((s) => s.trim()).filter(Boolean) };
    startTransition(async () => {
      const result = await saveProject(input);
      if (!result.ok) return setError(t.errors[result.error]);
      toast.success(t.common.saved);
      onDone();
      if (project) router.refresh();
      else router.push(`/projects/${result.data}`);
    });
  }

  return (
    <DialogContent className="sm:max-w-xl" closeLabel={t.common.close}>
      <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col" noValidate>
        <DialogHeader>
          <DialogTitle>{project ? t.projectsPage.edit : t.projectsPage.new}</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <fieldset disabled={pending} className="grid gap-4">
            {error ? (
              <div role="alert" data-slot="form-error" className="rounded-md bg-status-red-bg px-3 py-2 text-sm text-status-red-fg">
                {error}
              </div>
            ) : null}
            <div className="grid grid-cols-[4.5rem_1fr] gap-3">
              <Field label={t.fields.emoji} htmlFor="project-emoji">
                <IconPicker id="project-emoji" value={form.emoji} fallback="📁" onChange={(v) => set("emoji", v)} />
              </Field>
              <Field label={t.fields.name} htmlFor="project-title">
                <Input id="project-title" value={form.title} onChange={(e) => set("title", e.target.value)} autoFocus={!project} />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t.fields.status} htmlFor="project-status">
                <NativeSelect id="project-status" value={form.status} onChange={(e) => set("status", e.target.value)}>
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {statusLabel(t, "project", s)}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label={t.fields.owner} htmlFor="project-owner">
                <NativeSelect id="project-owner" value={form.owner_id} onChange={(e) => set("owner_id", e.target.value)}>
                  <option value="">{t.common.none}</option>
                  {options.members
                    .filter((m) => !m.is_alumni || m.id === form.owner_id)
                    .map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                </NativeSelect>
              </Field>
            </div>
            <Field label={t.fields.members} htmlFor="project-members">
              <MemberPicker
                id="project-members"
                members={options.members}
                value={form.member_ids}
                onChange={(ids) => set("member_ids", ids)}
                disabled={pending}
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label={t.fields.startDate} htmlFor="project-start">
                <Input id="project-start" type="date" value={form.start_date} onChange={(e) => set("start_date", e.target.value)} />
              </Field>
              <Field label={t.fields.targetDate} htmlFor="project-due">
                <Input id="project-due" type="date" value={form.due_date} onChange={(e) => set("due_date", e.target.value)} />
              </Field>
              <Field label={`${t.fields.progress}（${form.progress}%）`} htmlFor="project-progress">
                <input
                  id="project-progress"
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={form.progress}
                  onChange={(e) => set("progress", Number(e.target.value))}
                  className="h-9 w-full accent-primary"
                />
              </Field>
            </div>
            <Field label={t.fields.tags} htmlFor="project-tags" hint={t.fields.tagsHint}>
              <Input id="project-tags" value={tagText} onChange={(e) => setTagText(e.target.value)} />
            </Field>
            <MarkdownField
              id="project-description"
              label={t.fields.description}
              value={form.description}
              onChange={(v) => set("description", v)}
            />
          </fieldset>
        </DialogBody>
        <DialogFooter>
          {project?.deletable ? (
            <ConfirmDelete
              name={project.title}
              onConfirm={async () => {
                const result = await deleteProject(project.id);
                if (!result.ok) {
                  toast.error(t.errors[result.error]);
                  return false;
                }
                toast.success(t.common.deleted);
                onDone();
                router.push(afterDelete ?? "/projects");
                return true;
              }}
            />
          ) : null}
          <Button type="button" variant="outline" onClick={onDone}>
            {t.common.cancel}
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? t.common.saving : t.common.save}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

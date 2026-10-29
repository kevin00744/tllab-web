"use client";

import { ArrowDownIcon, ArrowUpIcon, PlusIcon, XIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { deletePublication, savePublication, type PublicationInput } from "@/app/(app)/publications/actions";
import { ConfirmDelete } from "@/components/common/confirm-delete";
import { Field } from "@/components/common/field";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { useI18n } from "@/lib/i18n/client";
import { statusLabel } from "@/lib/status";
import type { FormOptions, Publication } from "@/types/entities";

const TYPES = ["journal", "conference", "preprint", "thesis"] as const;
const STAGES = ["idea", "drafting", "submitted", "revision", "accepted", "published"] as const;
type Author = PublicationInput["authors"][number];

function initial(p: Publication | null, defaults: Partial<PublicationInput>): PublicationInput {
  return {
    id: p?.id,
    title: p?.title ?? "",
    emoji: p?.emoji ?? "📄",
    type: p?.type ?? "journal",
    stage: p?.stage ?? defaults.stage ?? "idea",
    venue: p?.venue ?? "",
    project_id: p?.project?.id ?? defaults.project_id ?? "",
    submitted_at: p?.submitted_at ?? "",
    deadline: p?.deadline ?? "",
    accepted_at: p?.accepted_at ?? "",
    published_at: p?.published_at ?? "",
    doi: p?.doi ?? "",
    url: p?.url ?? "",
    abstract: p?.abstract ?? "",
    notes: p?.notes ?? "",
    authors:
      p?.authors.map((a) => ({
        member_id: a.member_id,
        display_name: a.member_id ? null : a.name,
        is_first_author: a.is_first_author,
        is_corresponding: a.is_corresponding,
      })) ?? [],
  };
}

export function PublicationDialog({
  publication,
  defaults = {},
  options,
  open,
  onOpenChange,
}: {
  publication: Publication | null;
  defaults?: Partial<PublicationInput>;
  options: FormOptions;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open ? (
        <PublicationForm
          key={publication?.id ?? "new"}
          publication={publication}
          defaults={defaults}
          options={options}
          onDone={() => onOpenChange(false)}
        />
      ) : null}
    </Dialog>
  );
}

function PublicationForm({
  publication,
  defaults,
  options,
  onDone,
}: {
  publication: Publication | null;
  defaults: Partial<PublicationInput>;
  options: FormOptions;
  onDone: () => void;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [form, setForm] = useState(() => initial(publication, defaults));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const readOnly = publication ? !publication.editable : !options.can_create;
  const set = <K extends keyof PublicationInput>(key: K, value: PublicationInput[K]) =>
    setForm((f) => ({ ...f, [key]: value }));
  const setAuthors = (fn: (a: Author[]) => Author[]) => setForm((f) => ({ ...f, authors: fn(f.authors) }));
  const memberName = (id: string | null) => options.members.find((m) => m.id === id)?.name ?? "";

  function move(i: number, delta: number) {
    setAuthors((list) => {
      const next = [...list];
      const [item] = next.splice(i, 1);
      next.splice(i + delta, 0, item);
      return next;
    });
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) return setError(t.errors.titleRequired);
    startTransition(async () => {
      const result = await savePublication(form);
      if (!result.ok) return setError(t.errors[result.error]);
      toast.success(t.common.saved);
      router.refresh();
      onDone();
    });
  }

  const unusedMembers = options.members.filter((m) => !form.authors.some((a) => a.member_id === m.id));

  return (
    <DialogContent className="sm:max-w-2xl" closeLabel={t.common.close}>
      <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col" noValidate>
        <DialogHeader>
          <DialogTitle>{publication ? t.publicationsPage.edit : t.publicationsPage.new}</DialogTitle>
          {readOnly ? <p className="text-xs text-muted-foreground">{t.common.readOnly}</p> : null}
        </DialogHeader>
        <DialogBody>
          <fieldset disabled={readOnly || pending} className="grid gap-4">
            {error ? (
              <div role="alert" data-slot="form-error" className="rounded-md bg-status-red-bg px-3 py-2 text-sm text-status-red-fg">
                {error}
              </div>
            ) : null}
            <Field label={t.fields.title} htmlFor="pub-title">
              <Textarea id="pub-title" rows={2} className="min-h-0" value={form.title} onChange={(e) => set("title", e.target.value)} autoFocus={!publication} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label={t.fields.type} htmlFor="pub-type">
                <NativeSelect id="pub-type" value={form.type} onChange={(e) => set("type", e.target.value)}>
                  {TYPES.map((x) => (
                    <option key={x} value={x}>
                      {t.pubType[x]}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label={t.fields.stage} htmlFor="pub-stage">
                <NativeSelect id="pub-stage" value={form.stage} onChange={(e) => set("stage", e.target.value)}>
                  {STAGES.map((x) => (
                    <option key={x} value={x}>
                      {statusLabel(t, "publication", x)}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label={t.fields.project} htmlFor="pub-project">
                <NativeSelect id="pub-project" value={form.project_id} onChange={(e) => set("project_id", e.target.value)}>
                  <option value="">{t.common.none}</option>
                  {options.projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.emoji} {p.title}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
            </div>
            <Field label={t.fields.venue} htmlFor="pub-venue">
              <Input id="pub-venue" value={form.venue} onChange={(e) => set("venue", e.target.value)} />
            </Field>

            {/* 作者：依順序，可連結成員或輸入外部作者 */}
            <div className="grid gap-2">
              <span className="text-sm font-medium">{t.fields.authors}</span>
              <ol className="grid gap-1.5">
                {form.authors.map((a, i) => (
                  <li key={i} className="flex flex-wrap items-center gap-2 rounded-md border px-2 py-1.5">
                    <span className="w-5 text-center text-xs text-muted-foreground tabular-nums">{i + 1}</span>
                    {a.member_id ? (
                      <span className="min-w-0 flex-1 truncate text-sm">{memberName(a.member_id)}</span>
                    ) : (
                      <Input
                        aria-label={t.fields.externalAuthor}
                        placeholder={t.fields.externalAuthor}
                        value={a.display_name ?? ""}
                        onChange={(e) =>
                          setAuthors((list) => list.map((x, j) => (j === i ? { ...x, display_name: e.target.value } : x)))
                        }
                        className="h-8 min-w-0 flex-1"
                      />
                    )}
                    <label className="flex items-center gap-1 text-xs">
                      <Checkbox
                        checked={a.is_first_author}
                        onChange={(e) =>
                          setAuthors((list) => list.map((x, j) => (j === i ? { ...x, is_first_author: e.target.checked } : x)))
                        }
                      />
                      {t.fields.firstAuthor}
                    </label>
                    <label className="flex items-center gap-1 text-xs">
                      <Checkbox
                        checked={a.is_corresponding}
                        onChange={(e) =>
                          setAuthors((list) => list.map((x, j) => (j === i ? { ...x, is_corresponding: e.target.checked } : x)))
                        }
                      />
                      {t.fields.corresponding}
                    </label>
                    <span className="flex">
                      <Button type="button" variant="ghost" size="icon-sm" aria-label={t.fields.moveUp} disabled={i === 0} onClick={() => move(i, -1)}>
                        <ArrowUpIcon />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={t.fields.moveDown}
                        disabled={i === form.authors.length - 1}
                        onClick={() => move(i, 1)}
                      >
                        <ArrowDownIcon />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={t.fields.remove}
                        onClick={() => setAuthors((list) => list.filter((_, j) => j !== i))}
                      >
                        <XIcon />
                      </Button>
                    </span>
                  </li>
                ))}
              </ol>
              {readOnly ? null : (
                <div className="flex flex-wrap gap-2">
                  <NativeSelect
                    aria-label={t.fields.addMemberAuthor}
                    className="w-auto min-w-44"
                    value=""
                    onChange={(e) => {
                      const id = e.target.value;
                      if (id)
                        setAuthors((list) => [
                          ...list,
                          { member_id: id, display_name: null, is_first_author: list.length === 0, is_corresponding: false },
                        ]);
                    }}
                  >
                    <option value="">＋ {t.fields.addMemberAuthor}</option>
                    {unusedMembers.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </NativeSelect>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() =>
                      setAuthors((list) => [
                        ...list,
                        { member_id: null, display_name: "", is_first_author: list.length === 0, is_corresponding: false },
                      ])
                    }
                  >
                    <PlusIcon /> {t.fields.addExternalAuthor}
                  </Button>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Field label={t.fields.deadline} htmlFor="pub-deadline">
                <Input id="pub-deadline" type="date" value={form.deadline} onChange={(e) => set("deadline", e.target.value)} />
              </Field>
              <Field label={t.fields.submittedAt} htmlFor="pub-submitted">
                <Input id="pub-submitted" type="date" value={form.submitted_at} onChange={(e) => set("submitted_at", e.target.value)} />
              </Field>
              <Field label={t.fields.acceptedAt} htmlFor="pub-accepted">
                <Input id="pub-accepted" type="date" value={form.accepted_at} onChange={(e) => set("accepted_at", e.target.value)} />
              </Field>
              <Field label={t.fields.publishedAt} htmlFor="pub-published">
                <Input id="pub-published" type="date" value={form.published_at} onChange={(e) => set("published_at", e.target.value)} />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t.fields.doi} htmlFor="pub-doi">
                <Input id="pub-doi" value={form.doi} placeholder="10.xxxx/xxxxx" onChange={(e) => set("doi", e.target.value)} />
              </Field>
              <Field label={t.fields.url} htmlFor="pub-url">
                <Input id="pub-url" type="url" value={form.url} placeholder="https://" onChange={(e) => set("url", e.target.value)} />
              </Field>
            </div>
            <Field label={t.fields.abstract} htmlFor="pub-abstract">
              <Textarea id="pub-abstract" rows={3} value={form.abstract} onChange={(e) => set("abstract", e.target.value)} />
            </Field>
            <Field label={t.fields.notes} htmlFor="pub-notes">
              <Textarea id="pub-notes" rows={3} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
            </Field>
          </fieldset>
        </DialogBody>
        <DialogFooter>
          {publication?.deletable ? (
            <ConfirmDelete
              name={publication.title}
              onConfirm={async () => {
                const result = await deletePublication(publication.id);
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

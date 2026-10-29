"use client";

import { FilePlusIcon, PencilIcon, PlusIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { deleteDocument, saveDocument, type DocumentInput } from "@/app/(app)/orientation/actions";
import { Field } from "@/components/common/field";
import { FormBody, FormDialog } from "@/components/common/form-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { useI18n } from "@/lib/i18n/client";
import { descendantIds } from "@/lib/tree";
import type { DocumentItem } from "@/types/entities";

type Mode = { kind: "new"; parentId?: string } | { kind: "edit"; doc: DocumentItem };

export function DocDialog({ mode, documents }: { mode: Mode; documents: DocumentItem[] }) {
  const { t } = useI18n();
  const o = t.orientationPage;
  const trigger =
    mode.kind === "edit" ? (
      <Button variant="outline" size="sm">
        <PencilIcon /> {o.editPage}
      </Button>
    ) : mode.parentId ? (
      <Button variant="ghost" size="sm">
        <FilePlusIcon /> {o.newSubPage}
      </Button>
    ) : (
      <Button size="sm">
        <PlusIcon /> {o.newPage}
      </Button>
    );
  return (
    <FormDialog trigger={trigger} title={mode.kind === "edit" ? o.editPage : mode.parentId ? o.newSubPage : o.newPage} className="sm:max-w-md">
      {(close) => <DocForm mode={mode} documents={documents} onDone={close} />}
    </FormDialog>
  );
}

function DocForm({ mode, documents, onDone }: { mode: Mode; documents: DocumentItem[]; onDone: () => void }) {
  const { t } = useI18n();
  const o = t.orientationPage;
  const router = useRouter();
  const doc = mode.kind === "edit" ? mode.doc : null;
  const [form, setForm] = useState<DocumentInput>({
    id: doc?.id,
    title: doc?.title ?? "",
    emoji: doc?.emoji ?? "📘",
    parent_id: doc?.parent_id ?? (mode.kind === "new" ? (mode.parentId ?? "") : ""),
    slug: doc?.slug ?? "",
    sort_order: doc ? String(doc.sort_order) : "",
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const set = <K extends keyof DocumentInput>(k: K, v: DocumentInput[K]) => setForm((f) => ({ ...f, [k]: v }));
  // 上層不能選自己或自己的子頁面
  const excluded = doc ? descendantIds(documents, doc.id) : new Set<string>();

  return (
    <FormBody
      pending={pending}
      error={error}
      onCancel={onDone}
      deleteName={doc?.title}
      onDelete={
        doc?.deletable
          ? async () => {
              const result = await deleteDocument(doc.id);
              if (!result.ok) {
                toast.error(t.errors[result.error]);
                return false;
              }
              toast.success(t.common.deleted);
              onDone();
              router.push("/orientation");
              return true;
            }
          : undefined
      }
      onSubmit={() => {
        if (!form.title.trim()) return setError(t.errors.titleRequired);
        startTransition(async () => {
          const result = await saveDocument(form);
          if (!result.ok) return setError(t.errors[result.error]);
          toast.success(t.common.saved);
          onDone();
          router.push(`/orientation/${result.data}`);
          router.refresh();
        });
      }}
    >
      <div className="grid grid-cols-[4.5rem_1fr] gap-3">
        <Field label={t.fields.emoji} htmlFor="doc-emoji">
          <Input id="doc-emoji" value={form.emoji} maxLength={8} onChange={(e) => set("emoji", e.target.value)} className="text-center text-lg" />
        </Field>
        <Field label={t.fields.title} htmlFor="doc-title">
          <Input id="doc-title" value={form.title} onChange={(e) => set("title", e.target.value)} autoFocus />
        </Field>
      </div>
      <Field label={o.parent} htmlFor="doc-parent">
        <NativeSelect id="doc-parent" value={form.parent_id} onChange={(e) => set("parent_id", e.target.value)}>
          <option value="">{o.noParent}</option>
          {documents
            .filter((d) => !excluded.has(d.id))
            .map((d) => (
              <option key={d.id} value={d.id}>
                {d.emoji} {d.title}
              </option>
            ))}
        </NativeSelect>
      </Field>
      <div className="grid grid-cols-[1fr_6rem] gap-3">
        <Field label={o.slug} htmlFor="doc-slug" hint={o.slugHint}>
          <Input id="doc-slug" value={form.slug} placeholder="lab-rules" onChange={(e) => set("slug", e.target.value)} />
        </Field>
        <Field label={o.sortOrder} htmlFor="doc-sort">
          <Input id="doc-sort" type="number" value={form.sort_order} onChange={(e) => set("sort_order", e.target.value)} />
        </Field>
      </div>
    </FormBody>
  );
}

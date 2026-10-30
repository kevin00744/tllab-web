"use client";

import { PencilIcon, PlusIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { deleteSoftware, saveSoftware, type SoftwareInput } from "@/app/(app)/software/actions";
import { Field } from "@/components/common/field";
import { FormBody, FormDialog } from "@/components/common/form-dialog";
import { MarkdownField } from "@/components/common/markdown-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { useI18n } from "@/lib/i18n/client";
import type { FormOptions, SoftwareTool } from "@/types/entities";
import { IconPicker } from "@/components/common/icon-picker";

export function SoftwareDialog({
  tool,
  categories,
  members,
}: {
  tool: SoftwareTool | null;
  categories: string[];
  members: FormOptions["members"];
}) {
  const { t } = useI18n();
  return (
    <FormDialog
      title={tool ? t.softwarePage.edit : t.softwarePage.new}
      trigger={
        tool ? (
          <Button variant="outline">
            <PencilIcon /> {t.common.edit}
          </Button>
        ) : (
          <Button>
            <PlusIcon /> {t.softwarePage.new}
          </Button>
        )
      }
    >
      {(close) => <SoftwareForm tool={tool} categories={categories} members={members} onDone={close} />}
    </FormDialog>
  );
}

function SoftwareForm({
  tool,
  categories,
  members,
  onDone,
}: {
  tool: SoftwareTool | null;
  categories: string[];
  members: FormOptions["members"];
  onDone: () => void;
}) {
  const { t } = useI18n();
  const s = t.softwarePage;
  const router = useRouter();
  const [form, setForm] = useState<SoftwareInput>({
    id: tool?.id,
    name: tool?.name ?? "",
    emoji: tool?.emoji ?? "🧰",
    category: tool?.category ?? "",
    purpose: tool?.purpose ?? "",
    access_info: tool?.access_info ?? "",
    install_guide: tool?.install_guide ?? "",
    url: tool?.url ?? "",
    docs_url: tool?.docs_url ?? "",
    contact_id: tool?.contact?.id ?? "",
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const set = <K extends keyof SoftwareInput>(k: K, v: SoftwareInput[K]) => setForm((f) => ({ ...f, [k]: v }));
  const badUrl = (u: string) => u.trim() !== "" && !/^https?:\/\/\S+$/i.test(u.trim());

  return (
    <FormBody
      pending={pending}
      error={error}
      onCancel={onDone}
      deleteName={tool?.name}
      onDelete={
        tool?.deletable
          ? async () => {
              const result = await deleteSoftware(tool.id);
              if (!result.ok) {
                toast.error(t.errors[result.error]);
                return false;
              }
              toast.success(t.common.deleted);
              onDone();
              router.push("/software");
              return true;
            }
          : undefined
      }
      onSubmit={() => {
        if (!form.name.trim()) return setError(t.errors.nameRequired);
        if (badUrl(form.url) || badUrl(form.docs_url)) return setError(s.urlInvalid);
        startTransition(async () => {
          const result = await saveSoftware(form);
          if (!result.ok) return setError(t.errors[result.error]);
          toast.success(t.common.saved);
          onDone();
          if (tool) router.refresh();
          else router.push(`/software/${result.data}`);
        });
      }}
    >
      <div className="grid grid-cols-[4.5rem_1fr] gap-3">
        <Field label={t.fields.emoji} htmlFor="sw-emoji">
          <IconPicker id="sw-emoji" value={form.emoji} fallback="🧰" onChange={(v) => set("emoji", v)} />
        </Field>
        <Field label={t.fields.name} htmlFor="sw-name">
          <Input id="sw-name" value={form.name} onChange={(e) => set("name", e.target.value)} autoFocus={!tool} />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t.common.category} htmlFor="sw-category">
          <Input id="sw-category" list="sw-categories" value={form.category} onChange={(e) => set("category", e.target.value)} />
          <datalist id="sw-categories">
            {categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </Field>
        <Field label={s.contact} htmlFor="sw-contact">
          <NativeSelect id="sw-contact" value={form.contact_id} onChange={(e) => set("contact_id", e.target.value)}>
            <option value="">{t.common.none}</option>
            {members
              .filter((m) => !m.is_alumni || m.id === form.contact_id)
              .map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
          </NativeSelect>
        </Field>
      </div>
      <Field label={s.purpose} htmlFor="sw-purpose">
        <Input id="sw-purpose" value={form.purpose} onChange={(e) => set("purpose", e.target.value)} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={s.url} htmlFor="sw-url">
          <Input id="sw-url" type="url" placeholder="https://" value={form.url} onChange={(e) => set("url", e.target.value)} />
        </Field>
        <Field label={s.docsUrl} htmlFor="sw-docs">
          <Input id="sw-docs" type="url" placeholder="https://" value={form.docs_url} onChange={(e) => set("docs_url", e.target.value)} />
        </Field>
      </div>
      <MarkdownField id="sw-access" label={s.access} value={form.access_info} onChange={(v) => set("access_info", v)} rows={3} />
      <MarkdownField id="sw-install" label={s.install} value={form.install_guide} onChange={(v) => set("install_guide", v)} rows={8} />
    </FormBody>
  );
}

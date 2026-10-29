"use client";

import { PencilIcon, PlusIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { deleteFaq, saveFaq, type FaqInput } from "@/app/(app)/faq/actions";
import { Field } from "@/components/common/field";
import { FormBody, FormDialog, splitList } from "@/components/common/form-dialog";
import { MarkdownField } from "@/components/common/markdown-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/lib/i18n/client";
import type { Faq } from "@/types/entities";

export function FaqDialog({ faq, categories, defaultCategory }: { faq: Faq | null; categories: string[]; defaultCategory?: string }) {
  const { t } = useI18n();
  return (
    <FormDialog
      title={faq ? t.faqPage.edit : t.faqPage.new}
      trigger={
        faq ? (
          <Button variant="ghost" size="sm" aria-label={`${t.common.edit}：${faq.question}`}>
            <PencilIcon /> {t.common.edit}
          </Button>
        ) : (
          <Button>
            <PlusIcon /> {t.faqPage.new}
          </Button>
        )
      }
    >
      {(close) => <FaqForm faq={faq} categories={categories} defaultCategory={defaultCategory} onDone={close} />}
    </FormDialog>
  );
}

function FaqForm({ faq, categories, defaultCategory, onDone }: { faq: Faq | null; categories: string[]; defaultCategory?: string; onDone: () => void }) {
  const { t } = useI18n();
  const router = useRouter();
  const [form, setForm] = useState<FaqInput>({
    id: faq?.id,
    question: faq?.question ?? "",
    answer: faq?.answer ?? "",
    category: faq?.category ?? defaultCategory ?? categories[0] ?? "",
    tags: faq?.tags ?? [],
  });
  const [tags, setTags] = useState(() => form.tags.join(", "));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const set = <K extends keyof FaqInput>(k: K, v: FaqInput[K]) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <FormBody
      pending={pending}
      error={error}
      onCancel={onDone}
      deleteName={faq?.question}
      onDelete={
        faq?.deletable
          ? async () => {
              const result = await deleteFaq(faq.id);
              if (!result.ok) {
                toast.error(t.errors[result.error]);
                return false;
              }
              toast.success(t.common.deleted);
              onDone();
              router.refresh();
              return true;
            }
          : undefined
      }
      onSubmit={() => {
        if (!form.question.trim()) return setError(t.errors.titleRequired);
        startTransition(async () => {
          const result = await saveFaq({ ...form, tags: splitList(tags) });
          if (!result.ok) return setError(t.errors[result.error]);
          toast.success(t.common.saved);
          onDone();
          router.refresh();
        });
      }}
    >
      <Field label={t.faqPage.question} htmlFor="faq-question">
        <Input id="faq-question" value={form.question} onChange={(e) => set("question", e.target.value)} autoFocus />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t.common.category} htmlFor="faq-category">
          <Input id="faq-category" list="faq-categories" value={form.category} onChange={(e) => set("category", e.target.value)} />
          <datalist id="faq-categories">
            {categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </Field>
        <Field label={t.common.tags} htmlFor="faq-tags" hint={t.fields.tagsHint}>
          <Input id="faq-tags" value={tags} onChange={(e) => setTags(e.target.value)} />
        </Field>
      </div>
      <MarkdownField id="faq-answer" label={t.faqPage.answer} value={form.answer} onChange={(v) => set("answer", v)} rows={8} />
    </FormBody>
  );
}

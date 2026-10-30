"use client";

import { ArrowDownIcon, ArrowUpIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { deletePipeline, savePipeline, type PipelineInput } from "@/app/(app)/pipelines/actions";
import { Field } from "@/components/common/field";
import { FormBody, FormDialog, splitList } from "@/components/common/form-dialog";
import { MarkdownField } from "@/components/common/markdown-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { format } from "@/lib/i18n";
import { useI18n } from "@/lib/i18n/client";
import type { FormOptions, PipelineDetail, PipelineStep } from "@/types/entities";
import { iconText } from "@/lib/icon";
import { IconPicker } from "@/components/common/icon-picker";

const LANGUAGES = ["bash", "python", "r", "matlab", "julia", "sql", "yaml", "json"];

export function PipelineDialog({ pipeline, options }: { pipeline: PipelineDetail | null; options: FormOptions }) {
  const { t } = useI18n();
  return (
    <FormDialog
      title={pipeline ? t.pipelinesPage.edit : t.pipelinesPage.new}
      className="sm:max-w-2xl"
      trigger={
        pipeline ? (
          <Button variant="outline">
            <PencilIcon /> {t.common.edit}
          </Button>
        ) : (
          <Button>
            <PlusIcon /> {t.pipelinesPage.new}
          </Button>
        )
      }
    >
      {(close) => <PipelineForm pipeline={pipeline} options={options} onDone={close} />}
    </FormDialog>
  );
}

function PipelineForm({ pipeline, options, onDone }: { pipeline: PipelineDetail | null; options: FormOptions; onDone: () => void }) {
  const { t } = useI18n();
  const p = t.pipelinesPage;
  const router = useRouter();
  const [form, setForm] = useState<PipelineInput>({
    id: pipeline?.id,
    name: pipeline?.name ?? "",
    emoji: pipeline?.emoji ?? "🔬",
    description: pipeline?.description ?? "",
    inputs: pipeline?.inputs ?? "",
    outputs: pipeline?.outputs ?? "",
    version: pipeline?.version ?? "1.0.0",
    maintainer_id: pipeline?.maintainer?.id ?? "",
    project_id: pipeline?.project?.id ?? "",
    repo_url: pipeline?.repo_url ?? "",
    tags: pipeline?.tags ?? [],
    steps: pipeline?.steps ?? [],
  });
  const [tags, setTags] = useState(() => form.tags.join(", "));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const set = <K extends keyof PipelineInput>(k: K, v: PipelineInput[K]) => setForm((f) => ({ ...f, [k]: v }));
  const setStep = (i: number, patch: Partial<PipelineStep>) =>
    set("steps", form.steps.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const move = (i: number, d: -1 | 1) => {
    const steps = [...form.steps];
    [steps[i], steps[i + d]] = [steps[i + d], steps[i]];
    set("steps", steps);
  };

  return (
    <FormBody
      pending={pending}
      error={error}
      onCancel={onDone}
      deleteName={pipeline?.name}
      onDelete={
        pipeline?.deletable
          ? async () => {
              const result = await deletePipeline(pipeline.id);
              if (!result.ok) {
                toast.error(t.errors[result.error]);
                return false;
              }
              toast.success(t.common.deleted);
              onDone();
              router.push("/pipelines");
              return true;
            }
          : undefined
      }
      onSubmit={() => {
        if (!form.name.trim()) return setError(t.errors.nameRequired);
        if (form.steps.some((s) => !s.title.trim())) return setError(p.stepTitleRequired);
        if (form.repo_url.trim() && !/^https?:\/\/\S+$/i.test(form.repo_url.trim())) return setError(t.softwarePage.urlInvalid);
        startTransition(async () => {
          const result = await savePipeline({ ...form, tags: splitList(tags) });
          if (!result.ok) return setError(t.errors[result.error]);
          toast.success(t.common.saved);
          onDone();
          if (pipeline) router.refresh();
          else router.push(`/pipelines/${result.data}`);
        });
      }}
    >
      <div className="grid grid-cols-[4.5rem_1fr_7rem] gap-3">
        <Field label={t.fields.emoji} htmlFor="pl-emoji">
          <IconPicker id="pl-emoji" value={form.emoji} fallback="🔬" onChange={(v) => set("emoji", v)} />
        </Field>
        <Field label={t.fields.name} htmlFor="pl-name">
          <Input id="pl-name" value={form.name} onChange={(e) => set("name", e.target.value)} autoFocus={!pipeline} />
        </Field>
        <Field label={p.version} htmlFor="pl-version">
          <Input id="pl-version" value={form.version} onChange={(e) => set("version", e.target.value)} />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={p.maintainer} htmlFor="pl-maintainer">
          <NativeSelect id="pl-maintainer" value={form.maintainer_id} onChange={(e) => set("maintainer_id", e.target.value)}>
            <option value="">{t.common.none}</option>
            {options.members
              .filter((m) => !m.is_alumni || m.id === form.maintainer_id)
              .map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
          </NativeSelect>
        </Field>
        <Field label={t.fields.project} htmlFor="pl-project">
          <NativeSelect id="pl-project" value={form.project_id} onChange={(e) => set("project_id", e.target.value)}>
            <option value="">{t.common.none}</option>
            {options.projects.map((pr) => (
              <option key={pr.id} value={pr.id}>
                {iconText(pr.emoji)} {pr.title}
              </option>
            ))}
          </NativeSelect>
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={p.repo} htmlFor="pl-repo">
          <Input id="pl-repo" type="url" placeholder="https://github.com/…" value={form.repo_url} onChange={(e) => set("repo_url", e.target.value)} />
        </Field>
        <Field label={t.common.tags} htmlFor="pl-tags" hint={t.fields.tagsHint}>
          <Input id="pl-tags" value={tags} onChange={(e) => setTags(e.target.value)} />
        </Field>
      </div>
      <MarkdownField id="pl-description" label={t.fields.description} value={form.description} onChange={(v) => set("description", v)} rows={3} />
      <div className="grid gap-4 sm:grid-cols-2">
        <MarkdownField id="pl-inputs" label={p.inputs} value={form.inputs} onChange={(v) => set("inputs", v)} rows={3} />
        <MarkdownField id="pl-outputs" label={p.outputs} value={form.outputs} onChange={(v) => set("outputs", v)} rows={3} />
      </div>

      <div className="grid gap-3">
        <span className="text-sm font-medium">{p.steps}</span>
        {form.steps.map((s, i) => (
          <div key={i} className="grid gap-2 rounded-lg border p-3" data-testid="step-editor">
            <div className="flex items-center gap-2">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">{i + 1}</span>
              <Input
                aria-label={format(p.stepTitle, { n: i + 1 })}
                placeholder={p.stepTitlePlaceholder}
                value={s.title}
                onChange={(e) => setStep(i, { title: e.target.value })}
              />
              <Button type="button" size="icon" variant="ghost" aria-label={p.moveUp} disabled={i === 0} onClick={() => move(i, -1)}>
                <ArrowUpIcon />
              </Button>
              <Button type="button" size="icon" variant="ghost" aria-label={p.moveDown} disabled={i === form.steps.length - 1} onClick={() => move(i, 1)}>
                <ArrowDownIcon />
              </Button>
              <Button type="button" size="icon" variant="ghost" aria-label={p.removeStep} onClick={() => set("steps", form.steps.filter((_, j) => j !== i))}>
                <Trash2Icon />
              </Button>
            </div>
            <Textarea
              aria-label={p.stepDescription}
              placeholder={p.stepDescription}
              rows={2}
              value={s.description ?? ""}
              onChange={(e) => setStep(i, { description: e.target.value })}
            />
            <div className="grid gap-2 sm:grid-cols-[8rem_1fr]">
              <NativeSelect aria-label={p.language} value={s.code_language ?? ""} onChange={(e) => setStep(i, { code_language: e.target.value })}>
                <option value="">{p.noLanguage}</option>
                {LANGUAGES.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </NativeSelect>
              <Textarea
                aria-label={p.code}
                placeholder={p.code}
                rows={3}
                spellCheck={false}
                className="font-mono text-[13px]"
                value={s.code ?? ""}
                onChange={(e) => setStep(i, { code: e.target.value })}
              />
            </div>
          </div>
        ))}
        <div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => set("steps", [...form.steps, { title: "", description: "", code: "", code_language: "bash" }])}
          >
            <PlusIcon /> {p.addStep}
          </Button>
        </div>
      </div>
    </FormBody>
  );
}

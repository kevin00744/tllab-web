"use client";

import { ArrowDownIcon, ArrowUpIcon, SlidersHorizontalIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { saveDashboardPrefs } from "@/app/(app)/dashboard-actions";
import { FormBody, FormDialog } from "@/components/common/form-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { NativeSelect } from "@/components/ui/native-select";
import { DEFAULT_PREFS, type DashboardPrefs, type Scope, type SectionKey } from "@/lib/dashboard-prefs";
import { useI18n } from "@/lib/i18n/client";

const SCOPED: Partial<Record<SectionKey, keyof DashboardPrefs["scope"]>> = { projects: "projects", deadlines: "deadlines" };

export function CustomizeDashboard({ prefs }: { prefs: DashboardPrefs }) {
  const { t } = useI18n();
  return (
    <FormDialog
      title={t.dashboard.customize}
      className="sm:max-w-lg"
      trigger={
        <Button variant="outline" size="sm">
          <SlidersHorizontalIcon /> {t.dashboard.customize}
        </Button>
      }
    >
      {(close) => <CustomizeForm prefs={prefs} onDone={close} />}
    </FormDialog>
  );
}

function CustomizeForm({ prefs, onDone }: { prefs: DashboardPrefs; onDone: () => void }) {
  const { t } = useI18n();
  const d = t.dashboard;
  const router = useRouter();
  const [form, setForm] = useState<DashboardPrefs>(prefs);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const move = (i: number, delta: -1 | 1) =>
    setForm((f) => {
      const order = [...f.order];
      [order[i], order[i + delta]] = [order[i + delta], order[i]];
      return { ...f, order };
    });

  return (
    <FormBody
      pending={pending}
      error={error}
      onCancel={onDone}
      onSubmit={() =>
        startTransition(async () => {
          const result = await saveDashboardPrefs(form);
          if (!result.ok) return setError(t.errors[result.error]);
          toast.success(t.common.saved);
          onDone();
          router.refresh();
        })
      }
    >
      <p className="text-sm text-muted-foreground">{d.customizeHint}</p>
      <ul className="divide-y rounded-lg border" data-testid="dashboard-sections">
        {form.order.map((key, i) => {
          const scopeKey = SCOPED[key];
          return (
            <li key={key} className="flex flex-wrap items-center gap-2 px-3 py-2" data-section-key={key}>
              <label className="flex min-w-0 flex-1 items-center gap-2 text-sm">
                <Checkbox
                  checked={!form.hidden.includes(key)}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, hidden: e.target.checked ? f.hidden.filter((x) => x !== key) : [...f.hidden, key] }))
                  }
                />
                {d.sections[key]}
              </label>
              {scopeKey ? (
                <NativeSelect
                  aria-label={`${d.sections[key]} ${d.scopeLabel}`}
                  className="h-8 w-auto text-xs"
                  value={form.scope[scopeKey]}
                  onChange={(e) => setForm((f) => ({ ...f, scope: { ...f.scope, [scopeKey]: e.target.value as Scope } }))}
                >
                  {(["auto", "mine", "all"] as const).map((s) => (
                    <option key={s} value={s}>
                      {d.scopes[s]}
                    </option>
                  ))}
                </NativeSelect>
              ) : null}
              <Button type="button" size="icon-sm" variant="ghost" aria-label={d.moveUp} disabled={i === 0} onClick={() => move(i, -1)}>
                <ArrowUpIcon />
              </Button>
              <Button type="button" size="icon-sm" variant="ghost" aria-label={d.moveDown} disabled={i === form.order.length - 1} onClick={() => move(i, 1)}>
                <ArrowDownIcon />
              </Button>
            </li>
          );
        })}
      </ul>
      <label className="flex items-start gap-2 text-sm">
        <Checkbox className="mt-0.5" checked={form.hide_empty} onChange={(e) => setForm((f) => ({ ...f, hide_empty: e.target.checked }))} />
        <span>
          {d.hideEmpty}
          <span className="block text-xs text-muted-foreground">{d.hideEmptyHint}</span>
        </span>
      </label>
      <div>
        <Button type="button" size="sm" variant="ghost" onClick={() => setForm(DEFAULT_PREFS)}>
          {d.resetLayout}
        </Button>
      </div>
    </FormBody>
  );
}

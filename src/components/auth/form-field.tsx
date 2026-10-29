"use client";

import { useI18n } from "@/lib/i18n/client";
import type { AuthErrorKey } from "@/lib/validation";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function FormField({
  name,
  label,
  error,
  hint,
  ...inputProps
}: React.ComponentProps<typeof Input> & { name: string; label: string; error?: AuthErrorKey; hint?: string }) {
  const { t } = useI18n();
  const describedBy = error ? `${name}-error` : hint ? `${name}-hint` : undefined;
  return (
    <div className="grid gap-2">
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} aria-invalid={error ? true : undefined} aria-describedby={describedBy} {...inputProps} />
      {error ? (
        <p id={`${name}-error`} className="text-sm text-destructive">
          {t.auth.errors[error]}
        </p>
      ) : hint ? (
        <p id={`${name}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function FormError({ error }: { error?: AuthErrorKey }) {
  const { t } = useI18n();
  if (!error) return null;
  return (
    <div role="alert" data-slot="form-error" className="rounded-md bg-status-red-bg px-3 py-2 text-sm text-status-red-fg">
      {t.auth.errors[error]}
    </div>
  );
}

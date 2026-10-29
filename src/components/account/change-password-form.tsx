"use client";

import { useActionState, useEffect, useRef } from "react";
import { toast } from "sonner";

import { changePassword, type PasswordFormState } from "@/app/(app)/account/actions";
import { useI18n } from "@/lib/i18n/client";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/auth/form-field";

export function ChangePasswordForm() {
  const { t } = useI18n();
  const [state, action, pending] = useActionState<PasswordFormState, FormData>(changePassword, {});
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) {
      toast.success(t.account.passwordUpdated);
      formRef.current?.reset();
    }
  }, [state, t]);

  const formError =
    state.error === "wrongCurrentPassword" ? t.account.wrongCurrentPassword : state.error ? t.auth.errors[state.error] : null;

  return (
    <form ref={formRef} action={action} className="grid max-w-sm gap-4" noValidate>
      {formError ? (
        <div role="alert" data-slot="form-error" className="rounded-md bg-status-red-bg px-3 py-2 text-sm text-status-red-fg">
          {formError}
        </div>
      ) : null}
      <FormField
        name="currentPassword"
        type="password"
        label={t.account.currentPassword}
        autoComplete="current-password"
        error={state.fields?.currentPassword}
      />
      <FormField
        name="password"
        type="password"
        label={t.account.newPassword}
        autoComplete="new-password"
        hint={t.auth.passwordHint}
        error={state.fields?.password}
      />
      <FormField
        name="passwordConfirm"
        type="password"
        label={t.account.newPasswordConfirm}
        autoComplete="new-password"
        error={state.fields?.passwordConfirm}
      />
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? t.auth.submitting : t.account.savePassword}
        </Button>
      </div>
    </form>
  );
}

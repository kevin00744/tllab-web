"use client";

import Link from "next/link";
import { useActionState } from "react";

import { signIn, type AuthFormState } from "@/app/(auth)/actions";
import { useI18n } from "@/lib/i18n/client";
import { Button } from "@/components/ui/button";
import { FormError, FormField } from "./form-field";

export function LoginForm({ next }: { next?: string }) {
  const { t } = useI18n();
  const [state, action, pending] = useActionState<AuthFormState, FormData>(signIn, {});

  return (
    <form action={action} className="grid gap-4" noValidate>
      <FormError error={state.error} />
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <FormField
        name="email"
        type="email"
        label={t.auth.email}
        autoComplete="email"
        required
        defaultValue={state.values?.email}
        error={state.fields?.email}
      />
      <FormField
        name="password"
        type="password"
        label={t.auth.password}
        autoComplete="current-password"
        required
        error={state.fields?.password}
      />
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? t.auth.submitting : t.auth.submitLogin}
      </Button>
      <p className="text-center text-xs text-muted-foreground">{t.auth.forgotPassword}</p>
      <p className="text-center text-sm text-muted-foreground">
        {t.auth.noAccount}{" "}
        <Link href="/signup" className="font-medium text-primary hover:underline">
          {t.auth.toSignup}
        </Link>
      </p>
    </form>
  );
}

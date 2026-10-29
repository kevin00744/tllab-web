"use client";

import Link from "next/link";
import { useActionState } from "react";

import { signUp, type AuthFormState } from "@/app/(auth)/actions";
import { useI18n } from "@/lib/i18n/client";
import { Button } from "@/components/ui/button";
import { FormError, FormField } from "./form-field";

export function SignupForm() {
  const { t } = useI18n();
  const [state, action, pending] = useActionState<AuthFormState, FormData>(signUp, {});

  return (
    <form action={action} className="grid gap-4" noValidate>
      <FormError error={state.error} />
      <FormField
        name="inviteCode"
        label={t.auth.inviteCode}
        placeholder={t.auth.inviteCodePlaceholder}
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        required
        className="font-mono uppercase"
        defaultValue={state.values?.inviteCode}
        error={state.fields?.inviteCode}
      />
      <FormField
        name="name"
        label={t.auth.name}
        placeholder={t.auth.namePlaceholder}
        autoComplete="name"
        required
        defaultValue={state.values?.name}
        error={state.fields?.name}
      />
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
        autoComplete="new-password"
        required
        hint={t.auth.passwordHint}
        error={state.fields?.password}
      />
      <FormField
        name="passwordConfirm"
        type="password"
        label={t.auth.passwordConfirm}
        autoComplete="new-password"
        required
        error={state.fields?.passwordConfirm}
      />
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? t.auth.submitting : t.auth.submitSignup}
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        {t.auth.hasAccount}{" "}
        <Link href="/login" className="font-medium text-primary hover:underline">
          {t.auth.toLogin}
        </Link>
      </p>
    </form>
  );
}

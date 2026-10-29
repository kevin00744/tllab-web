import type { Metadata } from "next";

import { LoginForm } from "@/components/auth/login-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getI18n } from "@/lib/i18n/server";
import { safeNext } from "@/lib/validation";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.auth.loginTitle };
}

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { t } = await getI18n();
  const { next } = await searchParams;
  const target = safeNext(next);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">{t.auth.loginTitle}</CardTitle>
        <CardDescription>{t.auth.loginSubtitle}</CardDescription>
      </CardHeader>
      <CardContent>
        <LoginForm next={target === "/" ? undefined : target} />
      </CardContent>
    </Card>
  );
}

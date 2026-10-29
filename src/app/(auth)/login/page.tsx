import type { Metadata } from "next";
import Link from "next/link";

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
        <p className="mt-4 text-center text-sm">
          <Link href="/" className="text-muted-foreground hover:text-foreground hover:underline">
            {t.guest.browse}
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}

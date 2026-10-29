import type { Metadata } from "next";

import { SignupForm } from "@/components/auth/signup-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getI18n } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.auth.signupTitle };
}

export default async function SignupPage() {
  const { t } = await getI18n();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">{t.auth.signupTitle}</CardTitle>
        <CardDescription>{t.auth.signupSubtitle}</CardDescription>
      </CardHeader>
      <CardContent>
        <SignupForm />
      </CardContent>
    </Card>
  );
}

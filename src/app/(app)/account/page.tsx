import type { Metadata } from "next";

import { ChangePasswordForm } from "@/components/account/change-password-form";
import { MemberAvatar } from "@/components/layout/user-menu";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentMember } from "@/lib/auth";
import { getI18n } from "@/lib/i18n/server";
import { roleTone } from "@/lib/status";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.account.title };
}

export default async function AccountPage() {
  const [{ t }, member] = await Promise.all([getI18n(), getCurrentMember()]);
  if (!member) return null;

  return (
    <>
      <PageHeader emoji="⚙️" title={t.account.title} />
      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>{t.account.profile}</CardTitle>
            <CardDescription>{t.account.profileHint}</CardDescription>
          </CardHeader>
          <CardContent className="flex items-center gap-4">
            <MemberAvatar member={member} className="size-12 text-base" />
            <div className="min-w-0">
              <div className="font-medium">{member.name}</div>
              <div className="truncate text-sm text-muted-foreground">{member.email}</div>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                <Badge tone={roleTone[member.app_role]}>
                  {t.account.role}：{t.roles[member.app_role]}
                </Badge>
                <Badge tone="outline">
                  {t.account.position}：{t.positions[member.position]}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t.account.changePassword}</CardTitle>
          </CardHeader>
          <CardContent>
            <ChangePasswordForm />
          </CardContent>
        </Card>
      </div>
    </>
  );
}

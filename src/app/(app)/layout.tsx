import { AppShell } from "@/components/layout/app-shell";
import type { SidebarGroup } from "@/components/layout/sidebar-nav";
import { Button } from "@/components/ui/button";
import { signOut } from "@/app/(auth)/actions";
import Link from "next/link";
import { TriangleAlertIcon } from "lucide-react";

import { getCurrentMember, getUserId, mustChangePassword } from "@/lib/auth";
import { getI18n } from "@/lib/i18n/server";
import { ADMIN_ONLY, GUEST_HIDDEN, navGroups } from "@/lib/nav";
import { getPageMetas } from "@/lib/pages";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [{ locale, t }, userId, member, changePassword] = await Promise.all([
    getI18n(),
    getUserId(),
    getCurrentMember(),
    mustChangePassword(),
  ]);

  // 已登入但沒有成員資料（例如成員被刪除）：看不到任何內容；未登入則以訪客身分唯讀瀏覽
  if (userId && !member) {
    return (
      <div className="flex min-h-dvh items-center justify-center px-4">
        <div className="max-w-sm text-center">
          <h1 className="text-lg font-semibold">{t.inactive.title}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{t.inactive.body}</p>
          <form action={signOut} className="mt-6">
            <Button type="submit" variant="outline">
              {t.header.signOut}
            </Button>
          </form>
        </div>
      </div>
    );
  }

  const metas = await getPageMetas(locale, t);
  const groups: SidebarGroup[] = navGroups.map((group) => ({
    label: group.label ? t.nav[group.label] : undefined,
    items: group.items
      .filter((item) => (member || !GUEST_HIDDEN.includes(item.key)) && (member?.app_role === "admin" || !ADMIN_ONLY.includes(item.key)))
      .map((item) => metas.get(item.key)!),
  }));

  return (
    <AppShell groups={groups} member={member}>
      {changePassword ? (
        <div role="alert" className="mb-6 flex flex-wrap items-center gap-2 rounded-lg bg-status-amber-bg px-4 py-3 text-sm text-status-amber-fg">
          <TriangleAlertIcon className="size-4" />
          <span className="flex-1">{t.membersPage.mustChangePassword}</span>
          <Link href="/account" className="font-medium underline underline-offset-2">
            {t.membersPage.goChange}
          </Link>
        </div>
      ) : null}
      {children}
    </AppShell>
  );
}

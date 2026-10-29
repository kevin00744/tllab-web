import { AppShell } from "@/components/layout/app-shell";
import type { SidebarGroup } from "@/components/layout/sidebar-nav";
import { Button } from "@/components/ui/button";
import { signOut } from "@/app/(auth)/actions";
import { getCurrentMember } from "@/lib/auth";
import { getI18n } from "@/lib/i18n/server";
import { navGroups } from "@/lib/nav";
import { getPageMetas } from "@/lib/pages";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [{ locale, t }, member] = await Promise.all([getI18n(), getCurrentMember()]);

  // 已登入但沒有成員資料（例如成員被刪除）：看不到任何內容
  if (!member) {
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
    items: group.items.map((item) => metas.get(item.key)!),
  }));

  return (
    <AppShell groups={groups} member={member}>
      {children}
    </AppShell>
  );
}

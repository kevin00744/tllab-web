import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckIcon, MinusIcon, TicketIcon } from "lucide-react";

import { MemberAvatar } from "@/components/layout/user-menu";
import { PageHeader } from "@/components/page-header";
import { PageSettingRow } from "@/components/settings/page-settings-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getCurrentMember } from "@/lib/auth";
import { listMembers, listPageSettings } from "@/lib/data";
import { getI18n } from "@/lib/i18n/server";
import { navGroups } from "@/lib/nav";
import { isSystemAdmin, roleLabel, roleTone } from "@/lib/status";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.settingsPage.title };
}

// 權限一覽：系統管理員、管理者、成員、唯讀（"own" 代表僅限自己相關的資料）
const MATRIX: { key: string; cells: ("yes" | "own" | "no")[] }[] = [
  { key: "read", cells: ["yes", "yes", "yes", "yes"] },
  { key: "create", cells: ["yes", "yes", "yes", "no"] },
  { key: "editOwn", cells: ["yes", "yes", "own", "no"] },
  { key: "wiki", cells: ["yes", "yes", "yes", "no"] },
  { key: "deleteAny", cells: ["yes", "yes", "own", "no"] },
  { key: "members", cells: ["yes", "yes", "own", "no"] },
  { key: "invites", cells: ["yes", "yes", "no", "no"] },
  { key: "admins", cells: ["yes", "no", "no", "no"] },
  { key: "settings", cells: ["yes", "yes", "no", "no"] },
];

export default async function SettingsPage() {
  const me = await getCurrentMember();
  if (me?.app_role !== "admin") notFound();
  const [{ t }, settings, members] = await Promise.all([getI18n(), listPageSettings(), listMembers()]);
  const s = t.settingsPage;
  const byKey = new Map(settings.map((x) => [x.key, x]));
  const pages = navGroups.flatMap((g) => g.items).filter((i) => byKey.has(i.key));
  const active = members.filter((m) => !m.is_alumni);
  const counts = {
    systemAdmin: members.filter((m) => isSystemAdmin(m)).length,
    admin: members.filter((m) => m.app_role === "admin" && !isSystemAdmin(m)).length,
    member: members.filter((m) => m.app_role === "member").length,
    viewer: members.filter((m) => m.app_role === "viewer").length,
  };
  const admins = members.filter((m) => m.app_role === "admin");

  return (
    <>
      <PageHeader
        emoji="⚙️"
        title={s.title}
        description={s.description}
        actions={
          <Button asChild variant="outline">
            <Link href="/members/invites">
              <TicketIcon /> {t.membersPage.invites}
            </Link>
          </Button>
        }
      />

      <section className="mb-10" aria-labelledby="settings-roles">
        <h2 id="settings-roles" className="mb-3 text-base font-semibold">
          {s.roles}
        </h2>
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {(["systemAdmin", "admin", "member", "viewer"] as const).map((r) => (
            <div key={r} className="rounded-xl border px-4 py-3" data-role-count={r}>
              <div className="text-xs text-muted-foreground">{t.roles[r]}</div>
              <div className="text-2xl font-semibold tabular-nums">{counts[r]}</div>
            </div>
          ))}
        </div>
        <p className="mb-2 text-sm text-muted-foreground">
          {s.adminList}（{active.length} {s.activeMembers}）
        </p>
        <ul className="mb-6 flex flex-wrap gap-2">
          {admins.map((m) => (
            <li key={m.id}>
              <Link href={`/members/${m.id}`} className="inline-flex items-center gap-2 rounded-full border py-1 pr-3 pl-1 text-sm hover:bg-accent">
                <MemberAvatar member={m} className="size-6" />
                {m.name}
                <Badge tone={roleTone[m.app_role]}>{roleLabel(t, m)}</Badge>
              </Link>
            </li>
          ))}
        </ul>
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full min-w-[640px] text-sm" data-testid="permission-matrix">
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">{s.action}</th>
                {(["systemAdmin", "admin", "member", "viewer"] as const).map((r) => (
                  <th key={r} className="px-3 py-2 text-center font-medium">
                    {t.roles[r]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {MATRIX.map((row) => (
                <tr key={row.key}>
                  <td className="px-4 py-2">{s.matrix[row.key as keyof typeof s.matrix]}</td>
                  {row.cells.map((c, i) => (
                    <td key={i} className="px-3 py-2 text-center">
                      {c === "yes" ? (
                        <CheckIcon className="mx-auto size-4 text-status-green-fg" aria-label={s.yes} />
                      ) : c === "own" ? (
                        <span className="text-xs text-status-amber-fg">{s.own}</span>
                      ) : (
                        <MinusIcon className="mx-auto size-4 text-muted-foreground" aria-label={s.no} />
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">{s.ownHint}</p>
      </section>

      <section aria-labelledby="settings-pages">
        <h2 id="settings-pages" className="mb-1 text-base font-semibold">
          {s.pages}
        </h2>
        <p className="mb-3 text-sm text-muted-foreground">{s.pagesHint}</p>
        <div className="divide-y rounded-xl border px-4">
          {pages.map((p) => {
            const row = byKey.get(p.key)!;
            return (
              <PageSettingRow
                key={p.key}
                label={p.href}
                setting={{ key: row.key, emoji: row.emoji, title: row.title, title_en: row.title_en }}
              />
            );
          })}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">{s.languageNote}</p>
      </section>
    </>
  );
}

import Link from "next/link";
import { MailIcon } from "lucide-react";

import { EmptyBlock } from "@/components/common/field";
import { MemberAvatar } from "@/components/layout/user-menu";
import { Badge } from "@/components/ui/badge";
import type { Dictionary } from "@/lib/i18n";
import { format } from "@/lib/i18n";
import { roleLabel, roleTone } from "@/lib/status";
import type { MemberProfile } from "@/types/entities";

type Props = { members: MemberProfile[]; t: Dictionary; isAdmin: boolean };

function PositionBadge({ m, t }: { m: MemberProfile; t: Dictionary }) {
  return (
    <Badge tone={m.is_alumni ? "gray" : m.position === "pi" ? "purple" : "blue"}>
      {m.is_alumni ? `${t.membersPage.alumni} · ` : ""}
      {t.positions[m.position]}
    </Badge>
  );
}

export function MemberCards({ members, t, isAdmin }: Props) {
  if (members.length === 0) return <EmptyBlock>{t.membersPage.empty}</EmptyBlock>;
  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {members.map((m) => (
        <li key={m.id}>
          <Link
            href={`/members/${m.id}`}
            className="flex h-full gap-3 rounded-xl border bg-card p-4 transition-shadow hover:shadow-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            data-member-id={m.id}
          >
            <MemberAvatar member={m} className="size-14 text-lg" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="font-semibold">{m.name}</span>
                {m.name_en && m.name_en !== m.name ? <span className="text-xs text-muted-foreground">{m.name_en}</span> : null}
              </div>
              <div className="mt-1 flex flex-wrap gap-1">
                <PositionBadge m={m} t={t} />
                {isAdmin && m.app_role !== "member" ? <Badge tone={roleTone[m.app_role]}>{roleLabel(t, m)}</Badge> : null}
              </div>
              {m.research_interests.length ? (
                <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{m.research_interests.join("・")}</p>
              ) : null}
              {m.projects.length ? (
                <p className="mt-1.5 line-clamp-1 text-xs">
                  {m.projects
                    .filter((p) => p.status !== "completed")
                    .slice(0, 3)
                    .map((p) => `${p.emoji} ${p.title}`)
                    .join("　")}
                </p>
              ) : null}
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                {m.is_alumni
                  ? [m.current_affiliation, m.left_year ? format(t.membersPage.left, { year: m.left_year }) : null].filter(Boolean).join(" · ")
                  : m.join_year
                    ? format(t.membersPage.joined, { year: m.join_year })
                    : null}
              </p>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function MembersTable({ members, t, isAdmin }: Props) {
  if (members.length === 0) return <EmptyBlock>{t.membersPage.empty}</EmptyBlock>;
  return (
    <div className="overflow-x-auto rounded-xl border">
      <table className="w-full min-w-[760px] text-sm">
        <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
          <tr>
            <th className="px-4 py-2 font-medium">{t.fields.name}</th>
            <th className="px-3 py-2 font-medium">{t.account.position}</th>
            <th className="px-3 py-2 font-medium">{t.auth.email}</th>
            <th className="px-3 py-2 font-medium">{t.membersPage.interests}</th>
            <th className="px-3 py-2 font-medium">{t.membersPage.projects}</th>
            <th className="px-3 py-2 font-medium">{t.membersPage.joinYear}</th>
            {isAdmin ? <th className="px-4 py-2 font-medium">{t.account.role}</th> : null}
          </tr>
        </thead>
        <tbody className="divide-y">
          {members.map((m) => (
            <tr key={m.id} className="hover:bg-accent/40" data-member-id={m.id}>
              <td className="px-4 py-2">
                <Link href={`/members/${m.id}`} className="flex items-center gap-2 font-medium hover:underline">
                  <MemberAvatar member={m} className="size-7" />
                  <span>
                    {m.name}
                    {m.name_en && m.name_en !== m.name ? <span className="ml-1.5 text-xs font-normal text-muted-foreground">{m.name_en}</span> : null}
                  </span>
                </Link>
              </td>
              <td className="px-3 py-2">
                <PositionBadge m={m} t={t} />
              </td>
              <td className="px-3 py-2 text-xs">
                {m.email ? (
                  <a href={`mailto:${m.email}`} className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground">
                    <MailIcon className="size-3" />
                    {m.email}
                  </a>
                ) : (
                  "—"
                )}
              </td>
              <td className="max-w-56 truncate px-3 py-2 text-xs text-muted-foreground">{m.research_interests.join("・") || "—"}</td>
              <td className="max-w-56 truncate px-3 py-2 text-xs">
                {m.projects.map((p) => `${p.emoji} ${p.title}`).join("、") || "—"}
              </td>
              <td className="px-3 py-2 text-xs text-muted-foreground tabular-nums">
                {m.join_year ?? "—"}
                {m.left_year ? `–${m.left_year}` : ""}
              </td>
              {isAdmin ? (
                <td className="px-4 py-2">
                  <Badge tone={roleTone[m.app_role]}>{roleLabel(t, m)}</Badge>
                  {!m.has_account ? <span className="ml-1.5 text-[11px] text-muted-foreground">{t.membersPage.accountNone}</span> : null}
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeftIcon } from "lucide-react";

import { InviteList, NewInviteButton } from "@/components/members/invite-manager";
import { PageHeader } from "@/components/page-header";
import { getCurrentMember } from "@/lib/auth";
import { listInviteCodes, listMembers } from "@/lib/data";
import { getI18n } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.invitesPage.title };
}

export default async function InvitesPage() {
  const me = await getCurrentMember();
  if (me?.app_role !== "admin") notFound();
  const [{ t }, invites, members] = await Promise.all([getI18n(), listInviteCodes(), listMembers({ alumni: false })]);

  return (
    <>
      <Link href="/members" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeftIcon className="size-4" /> {t.invitesPage.back}
      </Link>
      <PageHeader
        emoji="🎟️"
        title={t.invitesPage.title}
        description={t.invitesPage.howTo}
        actions={<NewInviteButton members={members.map((m) => ({ id: m.id, name: m.name, has_account: m.has_account }))} />}
      />
      <InviteList invites={invites} />
    </>
  );
}

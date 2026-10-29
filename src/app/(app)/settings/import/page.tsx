import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeftIcon } from "lucide-react";

import { NotionImport } from "@/components/import/notion-import";
import { PageHeader } from "@/components/page-header";
import { getCurrentMember } from "@/lib/auth";
import { listMembers } from "@/lib/data";
import { getI18n } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.importPage.title };
}

export default async function ImportPage() {
  const me = await getCurrentMember();
  if (me?.app_role !== "admin") notFound();
  const [{ t }, members] = await Promise.all([getI18n(), listMembers()]);
  return (
    <>
      <Link href="/settings" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeftIcon className="size-4" /> {t.settingsPage.title}
      </Link>
      <PageHeader emoji="📥" title={t.importPage.title} description={t.importPage.description} />
      <NotionImport members={members.map((m) => ({ id: m.id, name: m.name, name_en: m.name_en, email: m.email }))} />
    </>
  );
}

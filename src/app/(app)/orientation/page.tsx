import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { EmptyBlock } from "@/components/common/field";
import { DocDialog } from "@/components/orientation/doc-dialog";
import { PageHeader } from "@/components/page-header";
import { canEdit, getCurrentMember } from "@/lib/auth";
import { listDocuments } from "@/lib/data";
import { getI18n } from "@/lib/i18n/server";
import { getPageMeta } from "@/lib/pages";
import { buildTree } from "@/lib/tree";

export async function generateMetadata(): Promise<Metadata> {
  const { locale, t } = await getI18n();
  return { title: (await getPageMeta("orientation", locale, t)).title };
}

/** 進入 Orientation Guide 時直接打開第一頁 */
export default async function OrientationPage() {
  const [{ locale, t }, me, documents] = await Promise.all([getI18n(), getCurrentMember(), listDocuments()]);
  const first = buildTree(documents)[0];
  if (first) redirect(`/orientation/${first.slug}`);
  const meta = await getPageMeta("orientation", locale, t);
  return (
    <>
      <PageHeader
        emoji={meta.emoji}
        title={meta.title}
        actions={canEdit(me) ? <DocDialog mode={{ kind: "new" }} documents={documents} /> : null}
      />
      <EmptyBlock>{t.orientationPage.empty}</EmptyBlock>
    </>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { EmptyBlock } from "@/components/common/field";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { getI18n } from "@/lib/i18n/server";
import { hrefFor, type SearchType } from "@/lib/search";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.importPage.notFoundTitle };
}

/** 匯入內容中的 Notion 內部連結（/notion/<id>）→ 對應的頁面 */
export default async function NotionLinkPage({ params }: PageProps<"/notion/[id]">) {
  const { id } = await params;
  const { t } = await getI18n();
  if (/^[0-9a-f]{32}$/i.test(id)) {
    const supabase = await createClient();
    const { data } = await supabase.rpc("resolve_notion", { p_id: id.toLowerCase() });
    const hit = data as { type: SearchType; id: string; slug?: string; title?: string } | null;
    const href = hit ? hrefFor({ entity_type: hit.type, id: hit.id, title: hit.title ?? "", link_key: hit.slug ?? null }) : null;
    if (href) redirect(href);
  }
  return (
    <>
      <PageHeader emoji="🔗" title={t.importPage.notFoundTitle} />
      <EmptyBlock>
        <p className="mb-4">{t.importPage.notFoundBody}</p>
        <Button asChild variant="outline">
          <Link href="/search">{t.search.title}</Link>
        </Button>
      </EmptyBlock>
    </>
  );
}

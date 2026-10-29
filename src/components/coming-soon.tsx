import { ConstructionIcon } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { format } from "@/lib/i18n";
import { getI18n } from "@/lib/i18n/server";
import type { PageKey } from "@/lib/nav";
import { getPageMeta } from "@/lib/pages";

/** 尚未開發的模組頁：顯示頁面 emoji／標題與預計完成的階段 */
export async function ComingSoon({ page, stage }: { page: PageKey; stage: number }) {
  const { locale, t } = await getI18n();
  const meta = await getPageMeta(page, locale, t);
  return (
    <>
      <PageHeader emoji={meta.emoji} title={meta.title} />
      <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed px-6 py-16 text-center text-muted-foreground">
        <ConstructionIcon className="size-8" />
        <p className="text-sm">{format(t.placeholder.stage, { stage })}</p>
      </div>
    </>
  );
}

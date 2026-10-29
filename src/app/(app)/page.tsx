import { PageHeader } from "@/components/page-header";
import { getCurrentMember } from "@/lib/auth";
import { format } from "@/lib/i18n";
import { getI18n } from "@/lib/i18n/server";
import { getPageMeta } from "@/lib/pages";

export default async function DashboardPage() {
  const [{ locale, t }, member] = await Promise.all([getI18n(), getCurrentMember()]);
  const meta = await getPageMeta("dashboard", locale, t);
  const date = new Intl.DateTimeFormat(locale, { dateStyle: "full", timeZone: "Asia/Taipei" }).format(new Date());

  return (
    <>
      <PageHeader
        emoji={meta.emoji}
        title={format(t.dashboard.welcome, { name: member?.name ?? "" })}
        description={
          <>
            <span>{format(t.dashboard.today, { date })}</span>
            <span className="mx-2">·</span>
            <span>
              {t.app.lab} — {t.app.intro}
            </span>
          </>
        }
      />
      <div className="rounded-xl border border-dashed px-6 py-12 text-center text-sm text-muted-foreground">
        {t.dashboard.comingSoon}
      </div>
    </>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { LayoutGridIcon, TableIcon, TicketIcon } from "lucide-react";

import { FilterBar, SearchBox } from "@/components/common/filters";
import { ViewTabs } from "@/components/common/view-tabs";
import { MemberDialog } from "@/components/members/member-dialog";
import { MemberCards, MembersTable } from "@/components/members/member-views";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { getCurrentMember } from "@/lib/auth";
import { listMembers } from "@/lib/data";
import { getI18n } from "@/lib/i18n/server";
import { getPageMeta } from "@/lib/pages";

export async function generateMetadata(): Promise<Metadata> {
  const { locale, t } = await getI18n();
  return { title: (await getPageMeta("members", locale, t)).title };
}

const VIEWS = ["cards", "table"] as const;
const POSITIONS = ["pi", "postdoc", "phd", "master", "undergrad", "staff"] as const;

export default async function MembersPage({ searchParams }: PageProps<"/members">) {
  const sp = await searchParams;
  const str = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const view = VIEWS.find((v) => v === str("view")) ?? "cards";
  const position = POSITIONS.find((p) => p === str("position"));

  const [{ locale, t }, me, members] = await Promise.all([getI18n(), getCurrentMember(), listMembers({ position, q: str("q") })]);
  const meta = await getPageMeta("members", locale, t);
  const isAdmin = me?.app_role === "admin";
  const current = members.filter((m) => !m.is_alumni);
  const alumni = members.filter((m) => m.is_alumni);
  const Views = view === "table" ? MembersTable : MemberCards;

  return (
    <>
      <PageHeader
        emoji={meta.emoji}
        title={meta.title}
        actions={
          isAdmin ? (
            <>
              <Button asChild variant="outline">
                <Link href="/members/invites">
                  <TicketIcon /> {t.membersPage.invites}
                </Link>
              </Button>
              <MemberDialog member={null} isAdmin />
            </>
          ) : null
        }
      />
      <FilterBar>
        <ViewTabs
          current={view}
          views={[
            { value: "cards", label: t.membersPage.cards, icon: <LayoutGridIcon /> },
            { value: "table", label: t.membersPage.table, icon: <TableIcon /> },
          ]}
        />
        <div className="max-w-full overflow-x-auto">
          <ViewTabs
            param="position"
            label={t.account.position}
            current={position ?? ""}
            views={[
              { value: "", label: t.membersPage.allPositions },
              ...POSITIONS.map((p) => ({ value: p, label: t.positions[p] })),
            ]}
          />
        </div>
        <SearchBox placeholder={t.common.search} className="w-full sm:ml-auto sm:w-56" />
      </FilterBar>

      <section className="mb-8" aria-labelledby="members-current">
        <h2 id="members-current" className="mb-3 text-base font-semibold">
          {t.membersPage.current} <span className="text-sm font-normal text-muted-foreground">{current.length}</span>
        </h2>
        <Views members={current} t={t} isAdmin={isAdmin} />
      </section>
      {alumni.length ? (
        <section aria-labelledby="members-alumni">
          <h2 id="members-alumni" className="mb-3 text-base font-semibold">
            {t.membersPage.alumni} <span className="text-sm font-normal text-muted-foreground">{alumni.length}</span>
          </h2>
          <Views members={alumni} t={t} isAdmin={isAdmin} />
        </section>
      ) : null}
    </>
  );
}

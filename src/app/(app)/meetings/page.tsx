import type { Metadata } from "next";

import { EmptyBlock } from "@/components/common/field";
import { FilterBar, FilterSelect, SearchBox } from "@/components/common/filters";
import { MeetingDialog } from "@/components/meetings/meeting-dialog";
import { MeetingList } from "@/components/meetings/meeting-list";
import { ManageButton } from "@/components/admin/manage-button";
import { PageHeader } from "@/components/page-header";
import { getFormOptions, isUuid, listMeetings } from "@/lib/data";
import { labDateOf } from "@/lib/date";
import { getI18n } from "@/lib/i18n/server";
import { getPageMeta } from "@/lib/pages";
import { iconText } from "@/lib/icon";

export async function generateMetadata(): Promise<Metadata> {
  const { locale, t } = await getI18n();
  return { title: (await getPageMeta("meetings", locale, t)).title };
}

const TYPES = ["lab_meeting", "one_on_one", "journal_club"] as const;

export default async function MeetingsPage({ searchParams }: PageProps<"/meetings">) {
  const sp = await searchParams;
  const str = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const type = TYPES.find((x) => x === str("type"));
  const member = isUuid(str("member")) ? str("member") : undefined;
  const project = isUuid(str("project")) ? str("project") : undefined;
  const q = str("q");
  const [{ locale, t }, options, meetings] = await Promise.all([
    getI18n(),
    getFormOptions(),
    listMeetings({ type, member_id: member, project_id: project, q }),
  ]);
  const meta = await getPageMeta("meetings", locale, t);
  const now = new Date().toISOString();
  const today = labDateOf(now);
  // 即將到來：由近到遠；過去：由近到遠（新的在上）
  const upcoming = meetings.filter((m) => (m.ends_at ?? m.starts_at) >= now).reverse();
  const past = meetings.filter((m) => (m.ends_at ?? m.starts_at) < now);
  const filtered = !!(type || member || project || q);

  return (
    <>
      <PageHeader
        emoji={meta.emoji}
        title={meta.title}
        actions={
          <>
            <ManageButton entity="meeting" />
            {options.can_create ? <MeetingDialog meeting={null} options={options} today={today} /> : null}
          </>
        }
      />
      <FilterBar>
        <FilterSelect param="type" label={`${t.meetingsPage.type}：${t.common.all}`} options={TYPES.map((x) => ({ value: x, label: t.meetingType[x] }))} />
        <FilterSelect
          param="member"
          label={`${t.meetingsPage.attendees}：${t.common.all}`}
          options={options.members.filter((m) => !m.is_alumni).map((m) => ({ value: m.id, label: m.name }))}
        />
        <FilterSelect
          param="project"
          label={`${t.fields.project}：${t.common.all}`}
          options={options.projects.map((p) => ({ value: p.id, label: `${iconText(p.emoji)} ${p.title}`.trim() }))}
        />
        <SearchBox placeholder={t.meetingsPage.search} className="w-full sm:ml-auto sm:w-56" />
      </FilterBar>
      {meetings.length === 0 ? (
        <EmptyBlock>{filtered ? t.meetingsPage.emptyFiltered : t.meetingsPage.empty}</EmptyBlock>
      ) : (
        <div className="grid grid-cols-1 gap-8">
          {upcoming.length ? (
            <section aria-labelledby="mt-upcoming">
              <h2 id="mt-upcoming" className="mb-3 text-base font-semibold">
                {t.meetingsPage.upcoming} <span className="text-sm font-normal text-muted-foreground">{upcoming.length}</span>
              </h2>
              <MeetingList meetings={upcoming} t={t} locale={locale} />
            </section>
          ) : null}
          {past.length ? (
            <section aria-labelledby="mt-past">
              <h2 id="mt-past" className="mb-3 text-base font-semibold">
                {t.meetingsPage.past} <span className="text-sm font-normal text-muted-foreground">{past.length}</span>
              </h2>
              <MeetingList meetings={past} t={t} locale={locale} />
            </section>
          ) : null}
        </div>
      )}
    </>
  );
}

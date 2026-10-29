import type { Metadata } from "next";

import { CalendarView } from "@/components/calendar/calendar-view";
import { PageHeader } from "@/components/page-header";
import { getFormOptions, listCalendar } from "@/lib/data";
import { addDays, labDateOf } from "@/lib/date";
import { getI18n } from "@/lib/i18n/server";
import { getPageMeta } from "@/lib/pages";
import type { CalendarKind } from "@/types/entities";

export async function generateMetadata(): Promise<Metadata> {
  const { locale, t } = await getI18n();
  return { title: (await getPageMeta("calendar", locale, t)).title };
}

const KINDS: CalendarKind[] = ["event", "meeting", "task", "publication"];
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export default async function CalendarPage({ searchParams }: PageProps<"/calendar">) {
  const sp = await searchParams;
  const str = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const today = labDateOf(new Date().toISOString());
  const date = DATE.test(str("date") ?? "") ? str("date")! : null;
  const month = /^\d{4}-\d{2}$/.test(str("month") ?? "") ? str("month")! : (date ?? today).slice(0, 7);
  const selected = date && date.startsWith(month) ? date : today.startsWith(month) ? today : `${month}-01`;
  const layers = str("layers");
  const kinds = layers ? KINDS.filter((k) => layers.split(",").includes(k)) : KINDS;
  const mine = str("mine") === "1";

  // 月曆顯示 6 週（週一開始）
  const first = `${month}-01`;
  const start = addDays(first, -((new Date(`${first}T00:00:00Z`).getUTCDay() + 6) % 7));
  const [{ locale, t }, options, items] = await Promise.all([
    getI18n(),
    getFormOptions(),
    kinds.length ? listCalendar(start, addDays(start, 41), { kinds, mine }) : Promise.resolve([]),
  ]);
  const meta = await getPageMeta("calendar", locale, t);

  return (
    <>
      <PageHeader emoji={meta.emoji} title={meta.title} description={t.calendarPage.description} />
      <CalendarView
        items={items}
        month={month}
        selected={selected}
        today={today}
        kinds={kinds}
        mine={mine}
        canEdit={options.can_create}
        options={options}
      />
    </>
  );
}

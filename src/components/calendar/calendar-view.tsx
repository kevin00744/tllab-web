"use client";

import Link from "next/link";
import { ChevronLeftIcon, ChevronRightIcon, MapPinIcon, PlusIcon } from "lucide-react";
import { useState } from "react";

import { AvatarStack } from "@/components/common/avatar-stack";
import { useParamUpdater } from "@/components/common/use-search-params";
import { Button } from "@/components/ui/button";
import { addDays, formatDate, labTimeOf } from "@/lib/date";
import { format } from "@/lib/i18n";
import { useI18n } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import type { CalendarItem, CalendarKind, FormOptions } from "@/types/entities";
import { chipClass, itemHref } from "./calendar-style";
import { EventDialog } from "./event-dialog";
import { iconText } from "@/lib/icon";
import { EntityIcon } from "@/components/common/entity-icon";

const KINDS: CalendarKind[] = ["event", "meeting", "task", "publication"];
const MAX_CHIPS = 3;

/** 月曆（週一開始）＋選取日期的議程 */
export function CalendarView({
  items,
  month,
  selected,
  today,
  kinds,
  mine,
  canEdit,
  options,
}: {
  items: CalendarItem[];
  month: string; // YYYY-MM
  selected: string; // YYYY-MM-DD
  today: string;
  kinds: CalendarKind[];
  mine: boolean;
  canEdit: boolean;
  options: FormOptions;
}) {
  const { t, locale } = useI18n();
  const c = t.calendarPage;
  const { hrefWith, update } = useParamUpdater();
  const [dialog, setDialog] = useState<{ open: boolean; item: CalendarItem | null; date: string }>({ open: false, item: null, date: selected });

  const first = `${month}-01`;
  const weekday = (new Date(`${first}T00:00:00Z`).getUTCDay() + 6) % 7;
  const start = addDays(first, -weekday);
  const days = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  const onDay = (d: string) => items.filter((i) => i.start_date <= d && i.end_date >= d);
  const [y, m] = month.split("-").map(Number);
  const shift = (delta: number) => new Date(Date.UTC(y, m - 1 + delta, 1)).toISOString().slice(0, 7);
  const selectedItems = onDay(selected);

  const openItem = (item: CalendarItem) => {
    if (item.kind === "event") setDialog({ open: true, item, date: item.start_date });
  };
  const timeOf = (item: CalendarItem) =>
    item.all_day || !item.starts_at ? c.allDay : `${labTimeOf(item.starts_at)}${item.ends_at ? `–${labTimeOf(item.ends_at)}` : ""}`;

  function Chip({ item, day }: { item: CalendarItem; day: string }) {
    const href = itemHref(item);
    const label = (
      <>
        {item.kind !== "event" ? <span aria-hidden><EntityIcon value={item.emoji} /> </span> : null}
        {!item.all_day && item.starts_at && item.start_date === day ? <span className="tabular-nums opacity-80">{labTimeOf(item.starts_at)} </span> : null}
        {item.title}
      </>
    );
    const cls = cn("block w-full truncate rounded px-1.5 py-0.5 text-left text-[11px] leading-4", chipClass(item));
    return href ? (
      <Link href={href} className={cls} title={item.title} data-calendar-item={item.kind} onClick={(e) => e.stopPropagation()}>
        {label}
      </Link>
    ) : (
      <button
        type="button"
        className={cls}
        title={item.title}
        data-calendar-item={item.kind}
        onClick={(e) => {
          e.stopPropagation();
          openItem(item);
        }}
      >
        {label}
      </button>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-base font-semibold" data-testid="calendar-month">
          {formatDate(locale, first, { year: "numeric", month: "long" })}
        </h2>
        <div className="flex items-center gap-1">
          <Button asChild variant="outline" size="icon-sm" aria-label={t.tasksPage.prevMonth}>
            <Link href={hrefWith({ month: shift(-1), date: null })} scroll={false}>
              <ChevronLeftIcon />
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href={hrefWith({ month: null, date: null })} scroll={false}>
              {c.today}
            </Link>
          </Button>
          <Button asChild variant="outline" size="icon-sm" aria-label={t.tasksPage.nextMonth}>
            <Link href={hrefWith({ month: shift(1), date: null })} scroll={false}>
              <ChevronRightIcon />
            </Link>
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 sm:ml-auto" role="group" aria-label={c.layers}>
          {KINDS.map((k) => {
            const on = kinds.includes(k);
            return (
              <button
                key={k}
                type="button"
                aria-pressed={on}
                onClick={() => {
                  const next = on ? kinds.filter((x) => x !== k) : [...kinds, k];
                  update({ layers: next.length === KINDS.length ? null : next.join(",") || "none" });
                }}
                className={cn(
                  "rounded-full border px-2.5 py-0.5 text-xs",
                  on ? "border-primary bg-primary/10 font-medium text-primary" : "text-muted-foreground hover:bg-accent",
                )}
              >
                {c.kinds[k]}
              </button>
            );
          })}
          <button
            type="button"
            aria-pressed={mine}
            onClick={() => update({ mine: mine ? null : "1" })}
            className={cn(
              "rounded-full border px-2.5 py-0.5 text-xs",
              mine ? "border-primary bg-primary/10 font-medium text-primary" : "text-muted-foreground hover:bg-accent",
            )}
          >
            {c.mineOnly}
          </button>
          {canEdit ? (
            <Button size="sm" onClick={() => setDialog({ open: true, item: null, date: selected })}>
              <PlusIcon /> {c.new}
            </Button>
          ) : null}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border">
        <div className="grid grid-cols-7 border-b bg-muted/50 text-center text-xs text-muted-foreground">
          {days.slice(0, 7).map((d) => (
            <div key={d} className="py-1.5">
              {formatDate(locale, d, { weekday: "short" })}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {days.map((d, i) => {
            const list = onDay(d);
            const inMonth = d.startsWith(month);
            const isSel = d === selected;
            return (
              <div
                key={d}
                data-date={d}
                role="button"
                tabIndex={0}
                aria-label={formatDate(locale, d, { dateStyle: "full" })}
                aria-pressed={isSel}
                onClick={() => update({ date: d, month: d.slice(0, 7) === month ? undefined : d.slice(0, 7) })}
                onDoubleClick={() => canEdit && setDialog({ open: true, item: null, date: d })}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && e.target === e.currentTarget) update({ date: d });
                }}
                className={cn(
                  "min-h-14 min-w-0 cursor-pointer border-r border-b p-1 text-left outline-none hover:bg-accent/30 focus-visible:bg-accent/40 sm:min-h-24",
                  i % 7 === 6 && "border-r-0",
                  i >= 35 && "border-b-0",
                  !inMonth && "bg-muted/30 text-muted-foreground",
                  isSel && "bg-primary/5 ring-2 ring-primary ring-inset",
                )}
              >
                <div className="mb-0.5 flex items-center justify-between">
                  <span
                    className={cn(
                      "flex size-6 items-center justify-center rounded-full text-xs tabular-nums",
                      d === today && "bg-primary font-semibold text-primary-foreground",
                    )}
                  >
                    {Number(d.slice(8))}
                  </span>
                  {list.length ? <span className="size-1.5 rounded-full bg-primary sm:hidden" aria-hidden /> : null}
                </div>
                <div className="hidden gap-0.5 sm:grid">
                  {list.slice(0, MAX_CHIPS).map((item) => (
                    <Chip key={`${item.kind}-${item.id}`} item={item} day={d} />
                  ))}
                  {list.length > MAX_CHIPS ? (
                    <span className="px-1.5 text-[11px] text-muted-foreground">{format(c.more, { n: list.length - MAX_CHIPS })}</span>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <section aria-labelledby="calendar-day" className="rounded-xl border px-4 py-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 id="calendar-day" className="text-sm font-semibold">
            {formatDate(locale, selected, { dateStyle: "full" })}
          </h3>
          {canEdit ? (
            <Button size="sm" variant="outline" onClick={() => setDialog({ open: true, item: null, date: selected })}>
              <PlusIcon /> {c.addOnDay}
            </Button>
          ) : null}
        </div>
        {selectedItems.length ? (
          <ul className="divide-y" data-testid="day-agenda">
            {selectedItems.map((item) => {
              const href = itemHref(item);
              const body = (
                <>
                  <span className={cn("mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[11px]", chipClass(item))}>
                    {item.kind === "event" ? c.categories[item.category as keyof typeof c.categories] : c.kinds[item.kind]}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">
                      {item.kind !== "event" ? `${iconText(item.emoji)} ` : ""}
                      {item.title}
                    </span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
                      <span className="tabular-nums">
                        {timeOf(item)}
                        {item.end_date !== item.start_date
                          ? `（${formatDate(locale, item.start_date, { month: "numeric", day: "numeric" })}–${formatDate(locale, item.end_date, { month: "numeric", day: "numeric" })}）`
                          : ""}
                      </span>
                      {item.location ? (
                        <span className="inline-flex items-center gap-0.5">
                          <MapPinIcon className="size-3" /> {item.location}
                        </span>
                      ) : null}
                      {item.project ? (
                        <span>
                          <EntityIcon value={item.project.emoji} /> {item.project.title}
                        </span>
                      ) : null}
                    </span>
                  </span>
                  {item.members.length ? <AvatarStack members={item.members} max={4} /> : null}
                </>
              );
              return (
                <li key={`${item.kind}-${item.id}`} data-agenda-item={item.kind}>
                  {href ? (
                    <Link href={href} className="flex items-start gap-3 py-2 text-sm hover:bg-accent/30">
                      {body}
                    </Link>
                  ) : (
                    <button type="button" onClick={() => openItem(item)} className="flex w-full items-start gap-3 py-2 text-left text-sm hover:bg-accent/30">
                      {body}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="py-2 text-sm text-muted-foreground">{c.empty}</p>
        )}
      </section>

      <EventDialog
        open={dialog.open}
        onOpenChange={(open) => setDialog((s) => ({ ...s, open }))}
        item={dialog.item}
        date={dialog.date}
        options={options}
      />
    </div>
  );
}

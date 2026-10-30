"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { deleteEvent, saveEvent, type EventInput } from "@/app/(app)/calendar/actions";
import { Field } from "@/components/common/field";
import { FormBody } from "@/components/common/form-dialog";
import { MarkdownField } from "@/components/common/markdown-field";
import { MemberPicker } from "@/components/common/member-picker";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { labDateOf, labIso, labTimeOf } from "@/lib/date";
import { useI18n } from "@/lib/i18n/client";
import type { CalendarItem, EventCategory, FormOptions } from "@/types/entities";
import { iconText } from "@/lib/icon";

export const CATEGORIES: EventCategory[] = ["event", "deadline", "leave", "booking", "holiday", "other"];

/** 新增（item = null，指定日期）或編輯行事曆活動 */
export function EventDialog({
  open,
  onOpenChange,
  item,
  date,
  options,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: CalendarItem | null;
  date: string;
  options: FormOptions;
}) {
  const { t } = useI18n();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open ? (
        <DialogContent className="sm:max-w-xl" closeLabel={t.common.close}>
          <DialogHeader>
            <DialogTitle>{item ? (item.editable ? t.calendarPage.edit : t.calendarPage.view) : t.calendarPage.new}</DialogTitle>
          </DialogHeader>
          <EventForm item={item} date={date} options={options} onDone={() => onOpenChange(false)} />
        </DialogContent>
      ) : null}
    </Dialog>
  );
}

function EventForm({ item, date, options, onDone }: { item: CalendarItem | null; date: string; options: FormOptions; onDone: () => void }) {
  const { t } = useI18n();
  const c = t.calendarPage;
  const router = useRouter();
  const [form, setForm] = useState(() => ({
    title: item?.title ?? "",
    category: (item?.category as EventCategory) ?? "event",
    all_day: item ? item.all_day : false,
    start_date: item?.starts_at ? labDateOf(item.starts_at) : date,
    start_time: item?.starts_at && !item.all_day ? labTimeOf(item.starts_at) : "10:00",
    end_date: item?.ends_at ? labDateOf(item.ends_at) : item ? "" : date,
    end_time: item?.ends_at && !item.all_day ? labTimeOf(item.ends_at) : item ? "" : "11:00",
    location: item?.location ?? "",
    description: item?.description ?? "",
    project_id: item?.project?.id ?? "",
    member_ids: item?.members.map((m) => m.id) ?? [],
  }));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  function submit() {
    if (!form.title.trim()) return setError(t.errors.titleRequired);
    if (!form.start_date || (!form.all_day && !form.start_time)) return setError(t.errors.dateRequired);
    const startsAt = labIso(form.start_date, form.all_day ? "00:00" : form.start_time);
    const endDate = form.end_date || form.start_date;
    const endsAt = form.all_day
      ? form.end_date && form.end_date !== form.start_date
        ? labIso(form.end_date, "00:00")
        : ""
      : form.end_time
        ? labIso(endDate, form.end_time)
        : "";
    if (endsAt && endsAt < startsAt) return setError(t.errors.dateOrder);
    const input: EventInput = {
      id: item?.id,
      title: form.title,
      category: form.category,
      all_day: form.all_day,
      starts_at: startsAt,
      ends_at: endsAt,
      location: form.location,
      description: form.description,
      project_id: form.project_id,
      member_ids: form.member_ids,
    };
    startTransition(async () => {
      const result = await saveEvent(input);
      if (!result.ok) return setError(t.errors[result.error]);
      toast.success(t.common.saved);
      onDone();
      router.refresh();
    });
  }

  return (
    <FormBody
      pending={pending}
      error={error}
      onCancel={onDone}
      onSubmit={submit}
      readOnly={!!item && !item.editable}
      deleteName={item?.title}
      onDelete={
        item?.deletable
          ? async () => {
              const result = await deleteEvent(item.id);
              if (!result.ok) {
                toast.error(t.errors[result.error]);
                return false;
              }
              toast.success(t.common.deleted);
              onDone();
              router.refresh();
              return true;
            }
          : undefined
      }
    >
      <div className="grid gap-4 sm:grid-cols-[1fr_9rem]">
        <Field label={t.fields.title} htmlFor="ev-title">
          <Input id="ev-title" value={form.title} onChange={(e) => set("title", e.target.value)} autoFocus={!item} />
        </Field>
        <Field label={c.category} htmlFor="ev-category">
          <NativeSelect id="ev-category" value={form.category} onChange={(e) => set("category", e.target.value as EventCategory)}>
            {CATEGORIES.map((x) => (
              <option key={x} value={x}>
                {c.categories[x]}
              </option>
            ))}
          </NativeSelect>
        </Field>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox checked={form.all_day} onChange={(e) => set("all_day", e.target.checked)} />
        {c.allDay}
      </label>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Field label={c.startDate} htmlFor="ev-start-date">
          <Input id="ev-start-date" type="date" value={form.start_date} onChange={(e) => set("start_date", e.target.value)} />
        </Field>
        {form.all_day ? null : (
          <Field label={c.startTime} htmlFor="ev-start-time">
            <Input id="ev-start-time" type="time" value={form.start_time} onChange={(e) => set("start_time", e.target.value)} />
          </Field>
        )}
        <Field label={c.endDate} htmlFor="ev-end-date">
          <Input id="ev-end-date" type="date" value={form.end_date} min={form.start_date} onChange={(e) => set("end_date", e.target.value)} />
        </Field>
        {form.all_day ? null : (
          <Field label={c.endTime} htmlFor="ev-end-time">
            <Input id="ev-end-time" type="time" value={form.end_time} onChange={(e) => set("end_time", e.target.value)} />
          </Field>
        )}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={c.location} htmlFor="ev-location">
          <Input id="ev-location" value={form.location} onChange={(e) => set("location", e.target.value)} />
        </Field>
        <Field label={t.fields.project} htmlFor="ev-project">
          <NativeSelect id="ev-project" value={form.project_id} onChange={(e) => set("project_id", e.target.value)}>
            <option value="">{t.common.none}</option>
            {options.projects.map((p) => (
              <option key={p.id} value={p.id}>
                {iconText(p.emoji)} {p.title}
              </option>
            ))}
          </NativeSelect>
        </Field>
      </div>
      <Field label={c.members} htmlFor="ev-members" hint={c.membersHint}>
        <MemberPicker id="ev-members" members={options.members} value={form.member_ids} onChange={(ids) => set("member_ids", ids)} disabled={pending} />
      </Field>
      <MarkdownField id="ev-description" label={t.fields.description} value={form.description} onChange={(v) => set("description", v)} rows={3} />
      {item?.created_by ? <p className="text-xs text-muted-foreground">{`${c.createdBy}：${item.created_by.name}`}</p> : null}
    </FormBody>
  );
}

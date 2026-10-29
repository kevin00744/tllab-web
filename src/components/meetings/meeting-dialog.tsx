"use client";

import { PencilIcon, PlusIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { deleteMeeting, saveMeeting, type MeetingInput } from "@/app/(app)/meetings/actions";
import { Field } from "@/components/common/field";
import { FormBody, FormDialog } from "@/components/common/form-dialog";
import { LinksEditor } from "@/components/common/links-editor";
import { hasInvalidLink } from "@/lib/links";
import { MarkdownField } from "@/components/common/markdown-field";
import { MemberPicker } from "@/components/common/member-picker";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { labDateOf, labIso, labTimeOf } from "@/lib/date";
import { useI18n } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import type { FormOptions, MeetingDetail } from "@/types/entities";

const TYPES = ["lab_meeting", "one_on_one", "journal_club"] as const;
const EMOJI = { lab_meeting: "🗓️", one_on_one: "💬", journal_club: "📖" } as const;

export function MeetingDialog({ meeting, options, today }: { meeting: MeetingDetail | null; options: FormOptions; today: string }) {
  const { t } = useI18n();
  return (
    <FormDialog
      title={meeting ? t.meetingsPage.edit : t.meetingsPage.new}
      className="sm:max-w-2xl"
      trigger={
        meeting ? (
          <Button variant="outline">
            <PencilIcon /> {t.common.edit}
          </Button>
        ) : (
          <Button>
            <PlusIcon /> {t.meetingsPage.new}
          </Button>
        )
      }
    >
      {(close) => <MeetingForm meeting={meeting} options={options} today={today} onDone={close} />}
    </FormDialog>
  );
}

type FormState = Omit<MeetingInput, "starts_at" | "ends_at" | "attendees"> & {
  date: string;
  start: string;
  end: string;
  attendee_ids: string[];
  presenter_ids: string[];
};

function MeetingForm({ meeting, options, today, onDone }: { meeting: MeetingDetail | null; options: FormOptions; today: string; onDone: () => void }) {
  const { t } = useI18n();
  const m = t.meetingsPage;
  const router = useRouter();
  const [form, setForm] = useState<FormState>(() => ({
    id: meeting?.id,
    title: meeting?.title ?? "",
    emoji: meeting?.emoji ?? EMOJI.lab_meeting,
    type: meeting?.type ?? "lab_meeting",
    date: meeting ? labDateOf(meeting.starts_at) : today,
    start: meeting ? labTimeOf(meeting.starts_at) : "14:00",
    end: meeting?.ends_at ? labTimeOf(meeting.ends_at) : meeting ? "" : "16:00",
    location: meeting?.location ?? "",
    decisions: meeting?.decisions ?? "",
    links: meeting?.links ?? [],
    attendee_ids: meeting?.attendees.map((a) => a.id) ?? [],
    presenter_ids: meeting?.attendees.filter((a) => a.is_presenter).map((a) => a.id) ?? [],
    project_ids: meeting?.projects.map((p) => p.id) ?? [],
  }));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));
  const byId = new Map(options.members.map((x) => [x.id, x]));

  return (
    <FormBody
      pending={pending}
      error={error}
      onCancel={onDone}
      deleteName={meeting?.title}
      onDelete={
        meeting?.deletable
          ? async () => {
              const result = await deleteMeeting(meeting.id);
              if (!result.ok) {
                toast.error(t.errors[result.error]);
                return false;
              }
              toast.success(t.common.deleted);
              onDone();
              router.push("/meetings");
              return true;
            }
          : undefined
      }
      onSubmit={() => {
        if (!form.title.trim()) return setError(t.errors.titleRequired);
        if (!form.date || !form.start) return setError(t.errors.dateRequired);
        if (form.end && form.end < form.start) return setError(t.errors.dateOrder);
        if (hasInvalidLink(form.links)) return setError(t.softwarePage.urlInvalid);
        const { date, start, end, attendee_ids, presenter_ids, ...rest } = form;
        const input: MeetingInput = {
          ...rest,
          links: rest.links.filter((l) => l.url.trim()),
          starts_at: labIso(date, start),
          ends_at: end ? labIso(date, end) : "",
          attendees: attendee_ids.map((id) => ({ member_id: id, is_presenter: presenter_ids.includes(id) })),
        };
        startTransition(async () => {
          const result = await saveMeeting(input);
          if (!result.ok) return setError(t.errors[result.error]);
          toast.success(t.common.saved);
          onDone();
          if (meeting) router.refresh();
          else router.push(`/meetings/${result.data}`);
        });
      }}
    >
      <div className="grid grid-cols-[4.5rem_1fr] gap-3">
        <Field label={t.fields.emoji} htmlFor="mt-emoji">
          <Input id="mt-emoji" value={form.emoji} maxLength={8} onChange={(e) => set("emoji", e.target.value)} className="text-center text-lg" />
        </Field>
        <Field label={t.fields.title} htmlFor="mt-title">
          <Input id="mt-title" value={form.title} onChange={(e) => set("title", e.target.value)} autoFocus={!meeting} />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-[1fr_1fr_6.5rem_6.5rem]">
        <Field label={m.type} htmlFor="mt-type">
          <NativeSelect
            id="mt-type"
            value={form.type}
            onChange={(e) => {
              const type = e.target.value as (typeof TYPES)[number];
              // 還是預設 emoji 時跟著類型換
              setForm((f) => ({ ...f, type, emoji: Object.values(EMOJI).includes(f.emoji as never) ? EMOJI[type] : f.emoji }));
            }}
          >
            {TYPES.map((x) => (
              <option key={x} value={x}>
                {t.meetingType[x]}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label={m.date} htmlFor="mt-date">
          <Input id="mt-date" type="date" value={form.date} onChange={(e) => set("date", e.target.value)} />
        </Field>
        <Field label={m.start} htmlFor="mt-start">
          <Input id="mt-start" type="time" value={form.start} onChange={(e) => set("start", e.target.value)} />
        </Field>
        <Field label={m.end} htmlFor="mt-end">
          <Input id="mt-end" type="time" value={form.end} onChange={(e) => set("end", e.target.value)} />
        </Field>
      </div>
      <Field label={m.location} htmlFor="mt-location">
        <Input id="mt-location" value={form.location} placeholder="R911" onChange={(e) => set("location", e.target.value)} />
      </Field>
      <Field label={m.attendees} htmlFor="mt-attendees">
        <MemberPicker
          id="mt-attendees"
          members={options.members}
          value={form.attendee_ids}
          disabled={pending}
          onChange={(ids) => setForm((f) => ({ ...f, attendee_ids: ids, presenter_ids: f.presenter_ids.filter((x) => ids.includes(x)) }))}
        />
      </Field>
      {form.attendee_ids.length ? (
        <div className="grid gap-1.5">
          <span className="text-sm font-medium">{m.presenters}</span>
          <div className="flex flex-wrap gap-1.5">
            {form.attendee_ids.map((id) => {
              const on = form.presenter_ids.includes(id);
              return (
                <button
                  key={id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => set("presenter_ids", on ? form.presenter_ids.filter((x) => x !== id) : [...form.presenter_ids, id])}
                  className={cn(
                    "rounded-full border px-2.5 py-0.5 text-xs",
                    on ? "border-primary bg-primary/10 font-medium text-primary" : "text-muted-foreground hover:bg-accent",
                  )}
                >
                  {byId.get(id)?.name ?? "?"}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
      <div className="grid gap-1.5">
        <span className="text-sm font-medium">{m.projects}</span>
        <div className="grid max-h-36 gap-1 overflow-y-auto rounded-md border p-2 sm:grid-cols-2">
          {options.projects.map((p) => (
            <label key={p.id} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={form.project_ids.includes(p.id)}
                onChange={(e) =>
                  set("project_ids", e.target.checked ? [...form.project_ids, p.id] : form.project_ids.filter((x) => x !== p.id))
                }
              />
              <span className="truncate">
                {p.emoji} {p.title}
              </span>
            </label>
          ))}
        </div>
      </div>
      <LinksEditor label={m.links} value={form.links} onChange={(links) => set("links", links)} labelPlaceholder={m.linkLabelPlaceholder} />
      <MarkdownField id="mt-decisions" label={m.decisions} value={form.decisions} onChange={(v) => set("decisions", v)} rows={4} />
    </FormBody>
  );
}

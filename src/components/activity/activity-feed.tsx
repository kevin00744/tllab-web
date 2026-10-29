import Link from "next/link";

import { MemberAvatar } from "@/components/layout/user-menu";
import { daysFrom, formatDateTime, labDateOf, labTimeOf, relativeDay } from "@/lib/date";
import type { Dictionary } from "@/lib/i18n";
import { format } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n/config";
import { hrefFor } from "@/lib/search";
import { statusLabel } from "@/lib/status";
import { plainExcerpt } from "@/lib/text";
import type { ActivityEntry } from "@/types/entities";

// 長文欄位只顯示「已修改」，不列出前後內容
const LONG = new Set(["content", "summary", "decisions", "description", "answer", "bio", "install_guide", "access_info", "inputs", "outputs", "notes", "abstract"]);
const HIDDEN = new Set(["id", "created_at", "created_by", "notion_id", "summary_version", "user_id"]);

type Change = { old?: unknown; new?: unknown; name?: string };

function show(t: Dictionary, entry: ActivityEntry, field: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return t.activity.empty;
  if (typeof value === "boolean") return value ? t.activity.yes : t.activity.no;
  if (field === "status" && (entry.entity_type === "project" || entry.entity_type === "task")) {
    return statusLabel(t, entry.entity_type, String(value));
  }
  if (field === "stage") return statusLabel(t, "publication", String(value));
  if (field === "priority") return statusLabel(t, "priority", String(value));
  if (field === "position" && entry.entity_type === "member") return t.positions[value as keyof Dictionary["positions"]] ?? String(value);
  if (field === "app_role") return t.roles[value as keyof Dictionary["roles"]] ?? String(value);
  if (field === "type" && entry.entity_type === "meeting") return t.meetingType[value as keyof Dictionary["meetingType"]] ?? String(value);
  if (Array.isArray(value)) {
    return value.map((v) => (typeof v === "object" && v ? String((v as { label?: string; url?: string }).label || (v as { url?: string }).url || "…") : String(v))).join("、") || t.activity.empty;
  }
  if (typeof value === "object") return "…";
  return plainExcerpt(String(value), 60);
}

function ChangeList({ entry, t }: { entry: ActivityEntry; t: Dictionary }) {
  const changes = Object.entries(entry.changes ?? {}).filter(([k]) => !HIDDEN.has(k));
  if (!changes.length) return null;
  const label = (k: string) => (t.activity.fields as Record<string, string>)[k] ?? k;
  return (
    <ul className="mt-1 grid gap-0.5 text-xs text-muted-foreground">
      {changes.slice(0, 6).map(([field, raw]) => {
        const c = (raw ?? {}) as Change;
        if (field === "assignee_added" || field === "assignee_removed") {
          return <li key={field}>{format(t.activity[field === "assignee_added" ? "assigneeAdded" : "assigneeRemoved"], { name: c.name ?? "?" })}</li>;
        }
        return (
          <li key={field} className="min-w-0 truncate">
            <span className="font-medium text-foreground/80">{label(field)}</span>
            {LONG.has(field) ? (
              <span>：{t.activity.edited}</span>
            ) : (
              <span>
                ：{show(t, entry, field, c.old)} → {show(t, entry, field, c.new)}
              </span>
            )}
          </li>
        );
      })}
      {changes.length > 6 ? <li>{format(t.activity.more, { n: changes.length - 6 })}</li> : null}
    </ul>
  );
}

export function ActivityItem({ entry, t, locale }: { entry: ActivityEntry; t: Dictionary; locale: Locale }) {
  const href = entry.link_key ? hrefFor({ entity_type: entry.entity_type, id: entry.entity_id, title: entry.entity_title ?? "", link_key: entry.link_key }) : null;
  const title = entry.entity_title ? format(t.activity.quoted, { title: plainExcerpt(entry.entity_title, 60) }) : "";
  return (
    <li className="flex gap-3 py-2.5" data-activity-id={entry.id}>
      {entry.actor ? <MemberAvatar member={entry.actor} className="size-7" /> : <span className="size-7 shrink-0 rounded-full bg-muted" aria-hidden />}
      <div className="min-w-0 flex-1 text-sm">
        <p>
          <span className="font-medium">{entry.actor?.name ?? t.activity.system}</span> {t.activity.actions[entry.action]}
          {t.activity.types[entry.entity_type] ?? entry.entity_type}
          {href ? (
            <Link href={href} className="font-medium hover:underline">
              {title}
            </Link>
          ) : (
            <span className="font-medium">{title}</span>
          )}
          <span className="ml-2 text-xs text-muted-foreground tabular-nums" title={formatDateTime(locale, entry.created_at, { dateStyle: "medium", timeStyle: "short" })}>
            {labTimeOf(entry.created_at)}
          </span>
        </p>
        {entry.action === "update" ? <ChangeList entry={entry} t={t} /> : null}
      </div>
    </li>
  );
}

/** 依台灣日期分組的活動時間軸 */
export function ActivityFeed({ entries, t, locale, today }: { entries: ActivityEntry[]; t: Dictionary; locale: Locale; today: string }) {
  if (!entries.length) return <p className="text-sm text-muted-foreground">{t.activity.none}</p>;
  const days = new Map<string, ActivityEntry[]>();
  for (const e of entries) {
    const d = labDateOf(e.created_at);
    days.set(d, [...(days.get(d) ?? []), e]);
  }
  return (
    <div className="grid grid-cols-1 gap-4" data-testid="activity-feed">
      {[...days].map(([day, items]) => {
        const diff = daysFrom(today, day);
        return (
          <section key={day}>
            <h3 className="mb-1 text-xs font-medium text-muted-foreground">
              {diff >= -1 ? relativeDay(t, diff) : formatDateTime(locale, `${day}T12:00:00+08:00`, { dateStyle: "full" })}
            </h3>
            <ul className="divide-y">
              {items.map((e) => (
                <ActivityItem key={e.id} entry={e} t={t} locale={locale} />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

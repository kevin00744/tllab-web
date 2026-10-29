import type { Dictionary } from "@/lib/i18n";
import { format } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n/config";

const DAY = 24 * 60 * 60 * 1000;
export const LAB_TZ = "Asia/Taipei";

// 日期欄位（YYYY-MM-DD）一律以 UTC 午夜解析與格式化，避免時區把日期推前或推後一天
function parseDate(date: string) {
  return new Date(`${date}T00:00:00Z`);
}

export function daysFrom(today: string, date: string) {
  return Math.round((parseDate(date).getTime() - parseDate(today).getTime()) / DAY);
}

export function addDays(date: string, days: number) {
  return new Date(parseDate(date).getTime() + days * DAY).toISOString().slice(0, 10);
}

export function formatDate(locale: Locale, date: string, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat(locale, { ...options, timeZone: "UTC" }).format(parseDate(date));
}

/** 時間戳記（timestamptz）依實驗室時區顯示 */
export function formatDateTime(locale: Locale, iso: string, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat(locale, { ...options, timeZone: LAB_TZ }).format(new Date(iso));
}

/** 實驗室時區的日期字串 */
export function labDateOf(iso: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: LAB_TZ }).format(new Date(iso));
}

export function relativeDay(t: Dictionary, days: number, { overdue = false } = {}) {
  if (days === 0) return t.relative.today;
  if (days === 1) return t.relative.tomorrow;
  if (days === -1 && !overdue) return t.relative.yesterday;
  if (days > 0) return format(t.relative.inDays, { n: days });
  return format(overdue ? t.relative.overdueDays : t.relative.daysAgo, { n: -days });
}

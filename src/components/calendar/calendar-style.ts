import type { CalendarItem } from "@/types/entities";

// 活動依類別上色；會議、任務、論文各一色（同一套狀態色）
const CATEGORY: Record<string, string> = {
  event: "bg-status-blue-bg text-status-blue-fg",
  deadline: "bg-status-red-bg text-status-red-fg",
  leave: "bg-status-amber-bg text-status-amber-fg",
  booking: "bg-status-green-bg text-status-green-fg",
  holiday: "bg-status-gray-bg text-status-gray-fg",
  other: "bg-status-gray-bg text-status-gray-fg",
};

export function chipClass(item: Pick<CalendarItem, "kind" | "category">) {
  if (item.kind === "meeting") return "bg-status-purple-bg text-status-purple-fg";
  if (item.kind === "task") return "border border-dashed text-foreground";
  if (item.kind === "publication") return "border border-status-red-fg/40 text-status-red-fg";
  return CATEGORY[item.category] ?? CATEGORY.other;
}

/** 非活動項目的連結（活動在行事曆上直接編輯） */
export function itemHref(item: CalendarItem) {
  const q = encodeURIComponent(item.title);
  if (item.kind === "meeting") return `/meetings/${item.id}`;
  if (item.kind === "task") return `/tasks?view=list&q=${q}&task=${item.id}`;
  if (item.kind === "publication") return `/publications?view=table&q=${q}&pub=${item.id}`;
  return null;
}

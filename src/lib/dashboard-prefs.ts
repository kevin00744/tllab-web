// Dashboard 個人設定（存在 member_preferences.dashboard，見 migration 17）
export const SECTION_KEYS = ["kpis", "my_tasks", "deadlines", "projects", "calendar", "publications", "meetings", "quick_links"] as const;
export type SectionKey = (typeof SECTION_KEYS)[number];
export type Scope = "auto" | "mine" | "all";

export type DashboardPrefs = {
  order: SectionKey[];
  hidden: SectionKey[];
  /** 沒有內容的區塊自動隱藏 */
  hide_empty: boolean;
  /** 專案、截止日：只看自己的、全部，或自動（有自己的就只看自己的） */
  scope: { projects: Scope; deadlines: Scope };
};

export const DEFAULT_PREFS: DashboardPrefs = {
  order: [...SECTION_KEYS],
  hidden: [],
  hide_empty: true,
  scope: { projects: "auto", deadlines: "auto" },
};

const isKey = (k: unknown): k is SectionKey => SECTION_KEYS.includes(k as SectionKey);
const isScope = (s: unknown): s is Scope => s === "auto" || s === "mine" || s === "all";

/** 資料庫存的設定 → 完整設定（新加入的區塊接在最後） */
export function normalizePrefs(raw: unknown): DashboardPrefs {
  const p = (raw ?? {}) as Partial<Record<keyof DashboardPrefs, unknown>>;
  const order = Array.isArray(p.order) ? p.order.filter(isKey) : [];
  const scope = (p.scope ?? {}) as Record<string, unknown>;
  return {
    order: [...new Set([...order, ...SECTION_KEYS])],
    hidden: Array.isArray(p.hidden) ? p.hidden.filter(isKey) : [],
    hide_empty: typeof p.hide_empty === "boolean" ? p.hide_empty : true,
    scope: {
      projects: isScope(scope.projects) ? scope.projects : "auto",
      deadlines: isScope(scope.deadlines) ? scope.deadlines : "auto",
    },
  };
}

/** 依範圍篩選：auto 在有自己的資料時只顯示自己的 */
export function scoped<T extends { mine: boolean }>(items: T[], scope: Scope): { items: T[]; mineOnly: boolean } {
  const mine = items.filter((i) => i.mine);
  if (scope === "mine" || (scope === "auto" && mine.length)) return { items: mine, mineOnly: true };
  return { items, mineOnly: false };
}

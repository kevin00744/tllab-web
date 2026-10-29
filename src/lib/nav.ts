import type { Dictionary } from "@/lib/i18n";

export type PageKey =
  | "dashboard"
  | "activity"
  | "calendar"
  | "members"
  | "projects"
  | "tasks"
  | "publications"
  | "orientation"
  | "faq"
  | "software"
  | "pipelines"
  | "meetings";

export type NavItem = { key: PageKey; href: string; emoji: string };
export type NavGroup = { label?: keyof Dictionary["nav"]; items: NavItem[] };

// emoji 為預設值；實際顯示以資料庫 page_settings 為準（Admin 可修改）
export const navGroups: NavGroup[] = [
  {
    items: [
      { key: "dashboard", href: "/", emoji: "🏠" },
      { key: "calendar", href: "/calendar", emoji: "📅" },
      { key: "activity", href: "/activity", emoji: "🕘" },
    ],
  },
  {
    label: "groupTeam",
    items: [
      { key: "members", href: "/members", emoji: "👥" },
      { key: "projects", href: "/projects", emoji: "🧪" },
      { key: "tasks", href: "/tasks", emoji: "✅" },
      { key: "publications", href: "/publications", emoji: "📚" },
    ],
  },
  {
    label: "groupResources",
    items: [
      { key: "orientation", href: "/orientation", emoji: "🧭" },
      { key: "faq", href: "/faq", emoji: "❓" },
      { key: "software", href: "/software", emoji: "🧰" },
      { key: "pipelines", href: "/pipelines", emoji: "🔬" },
      { key: "meetings", href: "/meetings", emoji: "🗓️" },
    ],
  },
];

export function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

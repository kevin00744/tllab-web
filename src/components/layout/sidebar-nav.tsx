"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { isActive, type PageKey } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { EntityIcon } from "@/components/common/entity-icon";

export type SidebarGroup = {
  label?: string;
  items: { key: PageKey; href: string; emoji: string; title: string }[];
};

export function SidebarNav({ groups, onNavigate }: { groups: SidebarGroup[]; onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-5 px-2 py-3 text-sm">
      {groups.map((group, i) => (
        <div key={group.label ?? i} className="flex flex-col gap-0.5">
          {group.label ? (
            <div className="px-2 pb-1 text-xs font-medium text-muted-foreground">{group.label}</div>
          ) : null}
          {group.items.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.key}
                href={item.href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sidebar-foreground transition-colors hover:bg-sidebar-accent",
                  active && "bg-sidebar-accent font-medium text-foreground",
                )}
              >
                <span className="w-5 text-center text-base leading-none" aria-hidden>
                  <EntityIcon value={item.emoji} />
                </span>
                <span className="truncate">{item.title}</span>
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

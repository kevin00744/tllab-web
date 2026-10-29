"use client";

import Link from "next/link";

import { cn } from "@/lib/utils";
import { useParamUpdater } from "./use-search-params";

export function ViewTabs({
  views,
  current,
  param = "view",
  label = "view",
  alwaysShowLabel = false,
}: {
  views: { value: string; label: string; icon?: React.ReactNode }[];
  current: string;
  param?: string;
  label?: string;
  alwaysShowLabel?: boolean;
}) {
  const { hrefWith } = useParamUpdater();
  return (
    <nav className="inline-flex rounded-lg border bg-muted/40 p-0.5" aria-label={label}>
      {views.map((v) => (
        <Link
          key={v.value}
          href={hrefWith({ [param]: v.value })}
          scroll={false}
          aria-current={v.value === current ? "page" : undefined}
          className={cn(
            "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-sm text-muted-foreground transition-colors hover:text-foreground [&_svg]:size-4",
            v.value === current && "bg-background font-medium text-foreground shadow-xs",
          )}
        >
          {v.icon}
          <span className={alwaysShowLabel || !v.icon ? undefined : "hidden sm:inline"}>{v.label}</span>
        </Link>
      ))}
    </nav>
  );
}

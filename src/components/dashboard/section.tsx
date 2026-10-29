import Link from "next/link";
import { ChevronRightIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/** Dashboard 區塊外框：標題、副標、右上「查看全部」 */
export function Section({
  title,
  subtitle,
  href,
  linkLabel,
  className,
  children,
}: {
  title: string;
  subtitle?: React.ReactNode;
  href?: string;
  linkLabel?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={cn("flex min-w-0 flex-col rounded-xl border bg-card", className)}>
      <header className="flex items-baseline justify-between gap-3 px-5 pt-4 pb-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">{title}</h2>
          {subtitle ? <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p> : null}
        </div>
        {href && linkLabel ? (
          <Link
            href={href}
            className="flex shrink-0 items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground"
          >
            {linkLabel}
            <ChevronRightIcon className="size-3.5" />
          </Link>
        ) : null}
      </header>
      <div className="flex-1 px-5 pb-4">{children}</div>
    </section>
  );
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return <p className="py-6 text-center text-sm text-muted-foreground">{children}</p>;
}

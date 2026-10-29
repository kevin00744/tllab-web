import Link from "next/link";

import type { Dictionary } from "@/lib/i18n";
import type { PageMeta } from "@/lib/pages";
import { Section } from "./section";

const KEYS = ["orientation", "faq", "software", "pipelines"] as const;

export function QuickLinks({
  metas,
  t,
  className,
}: {
  metas: Map<string, PageMeta>;
  t: Dictionary;
  className?: string;
}) {
  return (
    <Section title={t.dashboard.quickLinks} className={className}>
      <div className="grid grid-cols-2 gap-2">
        {KEYS.map((key) => {
          const meta = metas.get(key)!;
          return (
            <Link
              key={key}
              href={meta.href}
              className="flex flex-col gap-1 rounded-lg border px-3 py-2.5 transition-colors hover:bg-accent/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <span className="text-xl leading-none" aria-hidden>
                {meta.emoji}
              </span>
              <span className="text-sm font-medium">{meta.title}</span>
              <span className="text-xs text-muted-foreground">{t.dashboard.quickLinksHint[key]}</span>
            </Link>
          );
        })}
      </div>
    </Section>
  );
}

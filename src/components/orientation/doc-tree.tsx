import Link from "next/link";

import type { DocNode } from "@/lib/tree";
import { cn } from "@/lib/utils";
import { EntityIcon } from "@/components/common/entity-icon";

/** Orientation Guide 左側目錄（樹狀） */
export function DocTree({ nodes, current, depth = 0 }: { nodes: DocNode[]; current: string; depth?: number }) {
  return (
    <ul className={cn("grid gap-0.5", depth > 0 && "mt-0.5 ml-3 border-l pl-2")}>
      {nodes.map((n) => (
        <li key={n.id}>
          <Link
            href={`/orientation/${n.slug}`}
            aria-current={n.slug === current ? "page" : undefined}
            className={cn(
              "flex items-center gap-2 rounded-md px-2 py-1 text-sm text-muted-foreground hover:bg-accent hover:text-foreground",
              n.slug === current && "bg-accent font-medium text-foreground",
            )}
          >
            <span aria-hidden className="shrink-0">
              <EntityIcon value={n.emoji} />
            </span>
            <span className="min-w-0 truncate" title={n.title}>
              {n.title}
            </span>
          </Link>
          {n.children.length ? <DocTree nodes={n.children} current={current} depth={depth + 1} /> : null}
        </li>
      ))}
    </ul>
  );
}

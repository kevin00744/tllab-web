import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center justify-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium whitespace-nowrap [&>svg]:size-3",
  {
    variants: {
      tone: {
        gray: "bg-status-gray-bg text-status-gray-fg",
        blue: "bg-status-blue-bg text-status-blue-fg",
        purple: "bg-status-purple-bg text-status-purple-fg",
        amber: "bg-status-amber-bg text-status-amber-fg",
        green: "bg-status-green-bg text-status-green-fg",
        red: "bg-status-red-bg text-status-red-fg",
        outline: "border text-foreground",
      },
    },
    defaultVariants: { tone: "gray" },
  },
);

function Badge({ className, tone, ...props }: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span data-slot="badge" className={cn(badgeVariants({ tone }), className)} {...props} />;
}

export { Badge, badgeVariants };

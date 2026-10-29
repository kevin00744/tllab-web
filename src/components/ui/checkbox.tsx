import * as React from "react";

import { cn } from "@/lib/utils";

function Checkbox({ className, ...props }: Omit<React.ComponentProps<"input">, "type">) {
  return (
    <input
      type="checkbox"
      data-slot="checkbox"
      className={cn("size-4 shrink-0 cursor-pointer rounded border-input accent-primary disabled:cursor-not-allowed", className)}
      {...props}
    />
  );
}

export { Checkbox };

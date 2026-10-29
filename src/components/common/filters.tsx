"use client";

import { SearchIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { NativeSelect } from "@/components/ui/native-select";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useParamUpdater } from "./use-search-params";

export function FilterSelect({
  param,
  label,
  options,
  className,
}: {
  param: string;
  label: string;
  options: { value: string; label: string }[];
  className?: string;
}) {
  const { params, update } = useParamUpdater();
  return (
    <NativeSelect
      aria-label={label}
      className={cn("w-auto min-w-32", className)}
      value={params.get(param) ?? ""}
      onChange={(e) => update({ [param]: e.target.value })}
    >
      <option value="">{label}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </NativeSelect>
  );
}

export function SearchBox({ placeholder, className }: { placeholder: string; className?: string }) {
  const { params, update } = useParamUpdater();
  const [value, setValue] = useState(params.get("q") ?? "");

  useEffect(() => {
    if (value === (params.get("q") ?? "")) return;
    const timer = setTimeout(() => update({ q: value }), 300);
    return () => clearTimeout(timer);
  }, [value, params, update]);

  return (
    <div className={cn("relative", className)}>
      <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        type="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="pl-8"
      />
    </div>
  );
}

/** 篩選列：一行、置於內容上方 */
export function FilterBar({ children }: { children: React.ReactNode }) {
  return <div className="mb-4 flex flex-wrap items-center gap-2">{children}</div>;
}

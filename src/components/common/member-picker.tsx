"use client";

import { CheckIcon, ChevronDownIcon } from "lucide-react";
import { useMemo, useState } from "react";

import { MemberAvatar } from "@/components/layout/user-menu";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useI18n } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import type { FormOptions } from "@/types/entities";

type Option = FormOptions["members"][number];

/** 成員多選：可搜尋；校友排在後面 */
export function MemberPicker({
  id,
  members,
  value,
  onChange,
  disabled,
}: {
  id?: string;
  members: Option[];
  value: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
}) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const selected = members.filter((m) => value.includes(m.id));
  const filtered = useMemo(
    () => members.filter((m) => m.name.toLowerCase().includes(query.trim().toLowerCase())),
    [members, query],
  );

  function toggle(memberId: string) {
    onChange(value.includes(memberId) ? value.filter((v) => v !== memberId) : [...value, memberId]);
  }

  return (
    <Popover>
      <PopoverTrigger
        id={id}
        disabled={disabled}
        className="flex min-h-9 w-full items-center gap-1.5 rounded-md border border-input bg-background px-2 py-1 text-left text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50 dark:bg-input/30"
      >
        <span className="flex min-w-0 flex-1 flex-wrap gap-1">
          {selected.length === 0 ? (
            <span className="px-1 text-muted-foreground">{t.common.selectPlaceholder}</span>
          ) : (
            selected.map((m) => (
              <span key={m.id} className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-xs">
                <MemberAvatar member={m} className="size-4 text-[9px]" />
                {m.name}
              </span>
            ))
          )}
        </span>
        <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent className="p-1.5">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t.common.searchMembers}
          aria-label={t.common.searchMembers}
          className="mb-1 h-8"
        />
        <ul className="max-h-60 overflow-y-auto" role="listbox" aria-multiselectable>
          {filtered.length === 0 ? (
            <li className="px-2 py-3 text-center text-xs text-muted-foreground">{t.common.noMatches}</li>
          ) : (
            filtered.map((m) => {
              const checked = value.includes(m.id);
              return (
                <li key={m.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={checked}
                    onClick={() => toggle(m.id)}
                    className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
                  >
                    <MemberAvatar member={m} className="size-5 text-[10px]" />
                    <span className={cn("flex-1 truncate text-left", m.is_alumni && "text-muted-foreground")}>
                      {m.name}
                    </span>
                    <span className="text-xs text-muted-foreground">{t.positions[m.position]}</span>
                    <CheckIcon className={cn("size-4", checked ? "opacity-100" : "opacity-0")} />
                  </button>
                </li>
              );
            })
          )}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

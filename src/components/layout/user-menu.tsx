"use client";

import Link from "next/link";
import { ChevronsUpDownIcon, LogOutIcon, UserCogIcon } from "lucide-react";

import { signOut } from "@/app/(auth)/actions";
import { useI18n } from "@/lib/i18n/client";
import { roleTone } from "@/lib/status";
import type { Member } from "@/types/db";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function MemberAvatar({ member, className }: { member: Pick<Member, "name" | "avatar_url">; className?: string }) {
  return (
    <Avatar className={className}>
      {member.avatar_url ? <AvatarImage src={member.avatar_url} alt="" /> : null}
      <AvatarFallback>{member.name.slice(0, 1).toUpperCase()}</AvatarFallback>
    </Avatar>
  );
}

export function UserMenu({ member }: { member: Member }) {
  const { t } = useI18n();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm outline-none hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-ring">
        <MemberAvatar member={member} className="size-7" />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{member.name}</span>
          <span className="block truncate text-xs text-muted-foreground">{t.roles[member.app_role]}</span>
        </span>
        <ChevronsUpDownIcon className="size-4 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top" className="w-60">
        <DropdownMenuLabel className="font-normal">
          <div className="truncate font-medium">{member.name}</div>
          <div className="truncate text-xs text-muted-foreground">{member.email}</div>
          <Badge tone={roleTone[member.app_role]} className="mt-1.5">
            {t.roles[member.app_role]}
          </Badge>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/account">
            <UserCogIcon /> {t.nav.account}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem variant="destructive" onSelect={() => void signOut()}>
          <LogOutIcon className="text-destructive" /> {t.header.signOut}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

"use client";

import Link from "next/link";
import { ChevronsUpDownIcon, LogInIcon, LogOutIcon, SettingsIcon, UserCogIcon } from "lucide-react";
import { usePathname } from "next/navigation";

import { signOut } from "@/app/(auth)/actions";
import { useI18n } from "@/lib/i18n/client";
import { roleLabel, roleTone } from "@/lib/status";
import type { Member } from "@/types/db";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
          <span className="block truncate text-xs text-muted-foreground">{roleLabel(t, member)}</span>
        </span>
        <ChevronsUpDownIcon className="size-4 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top" className="w-60">
        <DropdownMenuLabel className="font-normal">
          <div className="truncate font-medium">{member.name}</div>
          <div className="truncate text-xs text-muted-foreground">{member.email}</div>
          <Badge tone={roleTone[member.app_role]} className="mt-1.5">
            {roleLabel(t, member)}
          </Badge>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/account">
            <UserCogIcon /> {t.nav.account}
          </Link>
        </DropdownMenuItem>
        {member.app_role === "admin" ? (
          <DropdownMenuItem asChild>
            <Link href="/settings">
              <SettingsIcon /> {t.nav.settings}
            </Link>
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem variant="destructive" onSelect={() => void signOut()}>
          <LogOutIcon className="text-destructive" /> {t.header.signOut}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** 訪客：登入按鈕（登入後回到目前頁面） */
export function GuestSignIn({ compact = false }: { compact?: boolean }) {
  const { t } = useI18n();
  const pathname = usePathname();
  const href = pathname === "/" ? "/login" : `/login?next=${encodeURIComponent(pathname)}`;
  if (compact) {
    return (
      <Button asChild size="sm" className="ml-1">
        <Link href={href} data-testid="guest-sign-in">
          <LogInIcon /> {t.guest.signIn}
        </Link>
      </Button>
    );
  }
  return (
    <div className="grid gap-2 px-2 py-1.5">
      <span className="text-xs text-muted-foreground">{t.guest.role}</span>
      <Button asChild size="sm" variant="outline">
        <Link href={href}>
          <LogInIcon /> {t.guest.signIn}
        </Link>
      </Button>
    </div>
  );
}

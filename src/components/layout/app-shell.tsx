"use client";

import Link from "next/link";
import { MenuIcon, SearchIcon } from "lucide-react";
import { useState } from "react";

import { useI18n } from "@/lib/i18n/client";
import type { Member } from "@/types/db";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { LanguageToggle } from "./language-toggle";
import { SidebarNav, type SidebarGroup } from "./sidebar-nav";
import { ThemeToggle } from "./theme-toggle";
import { UserMenu } from "./user-menu";

function Brand() {
  const { t } = useI18n();
  return (
    <Link href="/" className="flex items-center gap-2 px-4 py-3">
      <span className="flex size-7 items-center justify-center rounded-md bg-primary text-xs font-bold text-primary-foreground">
        TL
      </span>
      <span className="leading-tight">
        <span className="block text-sm font-semibold">{t.app.name}</span>
        <span className="block text-xs text-muted-foreground">Lab 911</span>
      </span>
    </Link>
  );
}

function SidebarBody({ groups, member, onNavigate }: { groups: SidebarGroup[]; member: Member; onNavigate?: () => void }) {
  return (
    <div className="flex h-full flex-col">
      <Brand />
      <div className="flex-1 overflow-y-auto">
        <SidebarNav groups={groups} onNavigate={onNavigate} />
      </div>
      <div className="border-t border-sidebar-border p-2">
        <UserMenu member={member} />
      </div>
    </div>
  );
}

export function AppShell({
  groups,
  member,
  children,
}: {
  groups: SidebarGroup[];
  member: Member;
  children: React.ReactNode;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);

  return (
    <div className="flex min-h-dvh">
      {/* 桌面：固定側邊欄 */}
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 border-r border-sidebar-border bg-sidebar md:block">
        <SidebarBody groups={groups} member={member} />
      </aside>

      {/* 手機：抽屜式側邊欄 */}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="bg-sidebar p-0" closeLabel={t.nav.closeMenu}>
          <SheetTitle className="sr-only">{t.app.name}</SheetTitle>
          <SheetDescription className="sr-only">{t.app.tagline}</SheetDescription>
          <SidebarBody groups={groups} member={member} onNavigate={() => setOpen(false)} />
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-12 items-center gap-2 border-b bg-background/85 px-3 backdrop-blur md:px-6">
          <Button
            variant="ghost"
            size="icon-sm"
            className="md:hidden"
            aria-label={t.nav.openMenu}
            onClick={() => setOpen(true)}
          >
            <MenuIcon />
          </Button>
          <button
            type="button"
            disabled
            title={t.header.searchSoon}
            className="flex h-8 w-full max-w-xs items-center gap-2 rounded-md border bg-muted/40 px-2.5 text-sm text-muted-foreground disabled:cursor-not-allowed"
          >
            <SearchIcon className="size-4" />
            <span className="truncate">{t.header.search}</span>
          </button>
          <div className="ml-auto flex items-center gap-1">
            <LanguageToggle />
            <ThemeToggle />
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 md:px-8 md:py-8">{children}</main>
      </div>
    </div>
  );
}

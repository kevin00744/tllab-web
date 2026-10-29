"use client";

import { ThemeProvider } from "next-themes";

import type { Locale } from "@/lib/i18n/config";
import type { Dictionary } from "@/lib/i18n";
import { I18nProvider } from "@/lib/i18n/client";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

export function Providers({ locale, t, children }: { locale: Locale; t: Dictionary; children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <I18nProvider locale={locale} t={t}>
        <TooltipProvider>{children}</TooltipProvider>
        <Toaster position="top-center" />
      </I18nProvider>
    </ThemeProvider>
  );
}

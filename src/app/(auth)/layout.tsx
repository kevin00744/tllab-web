import { LanguageToggle } from "@/components/layout/language-toggle";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { getI18n } from "@/lib/i18n/server";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const { t } = await getI18n();
  return (
    <div className="flex min-h-dvh flex-col bg-muted/40">
      <div className="flex justify-end gap-1 p-3">
        <LanguageToggle />
        <ThemeToggle />
      </div>
      <div className="flex flex-1 items-start justify-center px-4 pt-6 pb-16 sm:items-center sm:pt-0">
        <div className="w-full max-w-sm">
          <div className="mb-6 flex flex-col items-center text-center">
            <span className="mb-3 flex size-10 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
              TL
            </span>
            <div className="text-lg font-semibold">{t.app.name}</div>
            <div className="text-sm text-muted-foreground">{t.app.lab}</div>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}

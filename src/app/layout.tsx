import type { Metadata, Viewport } from "next";

import { Providers } from "@/components/providers";
import { getI18n } from "@/lib/i18n/server";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "TL Lab Hub", template: "%s · TL Lab Hub" },
  description: "TL Lab (Lab 911) internal workspace",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#1c1c1c" },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { locale, t } = await getI18n();
  return (
    <html lang={locale} suppressHydrationWarning>
      <body>
        <Providers locale={locale} t={t}>
          {children}
        </Providers>
      </body>
    </html>
  );
}

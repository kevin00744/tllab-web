import Link from "next/link";

import { Button } from "@/components/ui/button";
import { getI18n } from "@/lib/i18n/server";

export default async function NotFound() {
  const { t } = await getI18n();
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-4 text-center">
      <div className="text-5xl" aria-hidden>
        🧭
      </div>
      <h1 className="text-xl font-semibold">{t.notFound.title}</h1>
      <Button asChild variant="outline">
        <Link href="/">{t.notFound.back}</Link>
      </Button>
    </div>
  );
}

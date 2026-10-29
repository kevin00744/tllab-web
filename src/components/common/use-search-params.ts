"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useTransition } from "react";

/** 以網址參數保存檢視與篩選，方便分享連結與重新整理後保留狀態 */
export function useParamUpdater() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  const hrefWith = useCallback(
    (updates: Record<string, string | null | undefined>) => {
      const next = new URLSearchParams(params.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value === null || value === undefined || value === "") next.delete(key);
        else next.set(key, value);
      }
      const query = next.toString();
      return query ? `${pathname}?${query}` : pathname;
    },
    [params, pathname],
  );

  const update = useCallback(
    (updates: Record<string, string | null | undefined>) => {
      startTransition(() => router.replace(hrefWith(updates), { scroll: false }));
    },
    [router, hrefWith],
  );

  return { params, hrefWith, update, pending };
}
